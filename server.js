require("dotenv").config();

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, "content.json");
const DEFAULT_DB = {
  site: {
    name: process.env.SITE_NAME || "Abishek's Memories",
    tagline: process.env.SITE_TAGLINE || "My life. My memories. My story.",
    about: "A private corner of my life — memories, moments, voices, photos and stories collected over time.",
    contact: "",
    socials: {
      instagram: "",
      facebook: "",
      youtube: "",
      tiktok: ""
    }
  },
  items: [],
  comments: [],
  likes: {}
};

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
      return structuredClone(DEFAULT_DB);
    }
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return {
      ...structuredClone(DEFAULT_DB),
      ...parsed,
      site: { ...structuredClone(DEFAULT_DB.site), ...(parsed.site || {}) }
    };
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

let db = loadDB();

function saveDB() {
  const temp = DB_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, DB_FILE);
}

function id() {
  return crypto.randomUUID();
}

function safeUnlink(filename) {
  if (!filename) return;
  const target = path.join(UPLOAD_DIR, path.basename(filename));
  if (target.startsWith(UPLOAD_DIR) && fs.existsSync(target)) {
    try { fs.unlinkSync(target); } catch {}
  }
}

function requireAdmin(req, res, next) {
  if (req.session.admin) return next();
  return res.status(401).json({ error: "Admin authentication required." });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "video/mp4", "video/webm", "video/quicktime",
      "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm",
      "application/pdf", "text/plain"
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use("/uploads", express.static(UPLOAD_DIR, {
  index: false,
  setHeaders: (res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
  }
}));

app.use(express.static(path.join(ROOT, "public")));

function publicItem(item) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    description: item.description,
    date: item.date,
    filename: item.filename,
    originalName: item.originalName,
    mime: item.mime,
    album: item.album || "",
    visibility: item.visibility,
    createdAt: item.createdAt,
    likes: db.likes[item.id] || 0,
    comments: db.comments.filter(c => c.itemId === item.id).length
  };
}

app.get("/api/site", (_req, res) => res.json(db.site));

app.get("/api/content", (req, res) => {
  const includePrivate = req.session.privateAccess === true;
  const items = db.items
    .filter(i => i.visibility === "public" || includePrivate)
    .sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)))
    .map(publicItem);
  res.json(items);
});

app.get("/api/private-status", (req, res) => {
  res.json({ unlocked: req.session.privateAccess === true });
});

app.post("/api/private/unlock", (req, res) => {
  const password = String(req.body.password || "");
  if (!process.env.PRIVATE_CONTENT_PASSWORD) {
    return res.status(500).json({ error: "Private content password is not configured." });
  }
  if (password === process.env.PRIVATE_CONTENT_PASSWORD) {
    req.session.privateAccess = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "Incorrect private password." });
});

app.post("/api/private/lock", (req, res) => {
  req.session.privateAccess = false;
  res.json({ ok: true });
});

app.post("/api/items/:itemId/like", (req, res) => {
  const item = db.items.find(i => i.id === req.params.itemId && (i.visibility === "public" || req.session.privateAccess));
  if (!item) return res.status(404).json({ error: "Memory not found." });
  db.likes[item.id] = (db.likes[item.id] || 0) + 1;
  saveDB();
  res.json({ likes: db.likes[item.id] });
});

app.get("/api/items/:itemId/comments", (req, res) => {
  const item = db.items.find(i => i.id === req.params.itemId && (i.visibility === "public" || req.session.privateAccess));
  if (!item) return res.status(404).json({ error: "Memory not found." });
  res.json(db.comments.filter(c => c.itemId === item.id).slice(-100));
});

app.post("/api/items/:itemId/comments", (req, res) => {
  const item = db.items.find(i => i.id === req.params.itemId && (i.visibility === "public" || req.session.privateAccess));
  if (!item) return res.status(404).json({ error: "Memory not found." });

  const name = String(req.body.name || "Guest").trim().slice(0, 60);
  const text = String(req.body.text || "").trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: "Comment cannot be empty." });

  const comment = { id: id(), itemId: item.id, name: name || "Guest", text, createdAt: new Date().toISOString() };
  db.comments.push(comment);
  saveDB();
  res.json(comment);
});

app.get("/download/:itemId", (req, res) => {
  const item = db.items.find(i => i.id === req.params.itemId);
  if (!item) return res.status(404).send("File not found.");
  if (item.visibility === "private" && req.session.privateAccess !== true) {
    return res.status(403).send("Private content is locked.");
  }
  const file = path.join(UPLOAD_DIR, path.basename(item.filename));
  if (!fs.existsSync(file)) return res.status(404).send("File is missing.");
  res.download(file, item.originalName || item.filename);
});

app.post("/api/admin/login", (req, res) => {
  const username = String(req.body.username || "");
  const password = String(req.body.password || "");
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: "Admin credentials are not configured." });
  }
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "Invalid admin credentials." });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/status", (req, res) => {
  res.json({ authenticated: req.session.admin === true });
});

app.get("/api/admin/items", requireAdmin, (_req, res) => {
  res.json(db.items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map(publicItem));
});

app.post("/api/admin/upload", requireAdmin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Please select a supported file." });

  const type = String(req.body.type || "").toLowerCase();
  const allowedTypes = ["photo", "video", "voice", "document"];
  if (!allowedTypes.includes(type)) {
    safeUnlink(req.file.filename);
    return res.status(400).json({ error: "Invalid content type." });
  }

  const visibility = req.body.visibility === "private" ? "private" : "public";
  const item = {
    id: id(),
    type,
    title: String(req.body.title || req.file.originalname).trim().slice(0, 160),
    description: String(req.body.description || "").trim().slice(0, 3000),
    date: String(req.body.date || new Date().toISOString().slice(0, 10)),
    album: String(req.body.album || "").trim().slice(0, 100),
    visibility,
    filename: req.file.filename,
    originalName: req.file.originalname,
    mime: req.file.mimetype,
    createdAt: new Date().toISOString()
  };

  db.items.push(item);
  saveDB();
  res.json(publicItem(item));
});

app.post("/api/admin/text", requireAdmin, (req, res) => {
  const title = String(req.body.title || "").trim().slice(0, 160);
  const description = String(req.body.description || "").trim().slice(0, 10000);
  if (!title || !description) return res.status(400).json({ error: "Title and text are required." });

  const item = {
    id: id(),
    type: "text",
    title,
    description,
    date: String(req.body.date || new Date().toISOString().slice(0, 10)),
    album: String(req.body.album || "").trim().slice(0, 100),
    visibility: req.body.visibility === "private" ? "private" : "public",
    filename: "",
    originalName: "",
    mime: "text/plain",
    createdAt: new Date().toISOString()
  };
  db.items.push(item);
  saveDB();
  res.json(publicItem(item));
});

app.delete("/api/admin/items/:itemId", requireAdmin, (req, res) => {
  const index = db.items.findIndex(i => i.id === req.params.itemId);
  if (index === -1) return res.status(404).json({ error: "Memory not found." });

  const [item] = db.items.splice(index, 1);
  safeUnlink(item.filename);
  db.comments = db.comments.filter(c => c.itemId !== item.id);
  delete db.likes[item.id];
  saveDB();
  res.json({ ok: true });
});

app.put("/api/admin/site", requireAdmin, (req, res) => {
  const allowed = ["name", "tagline", "about", "contact"];
  for (const key of allowed) {
    if (typeof req.body[key] === "string") db.site[key] = req.body[key].slice(0, 5000);
  }
  if (req.body.socials && typeof req.body.socials === "object") {
    for (const key of ["instagram", "facebook", "youtube", "tiktok"]) {
      if (typeof req.body.socials[key] === "string") db.site.socials[key] = req.body.socials[key].slice(0, 500);
    }
  }
  saveDB();
  res.json(db.site);
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
  res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`\n✨ Abishek's Memories running at http://localhost:${PORT}\n`);
});
