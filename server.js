require("dotenv").config();
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname, DATA_DIR = path.join(ROOT, "data"), UPLOAD_DIR = path.join(ROOT, "uploads");
for (const dir of [DATA_DIR, UPLOAD_DIR]) fs.mkdirSync(dir, { recursive: true });
const DB_FILE = path.join(DATA_DIR, "content.json");
const defaults = { site: { name: process.env.SITE_NAME || "Abishek's Memories", tagline: process.env.SITE_TAGLINE || "A place where yesterday stays alive.", about: "A quiet archive for the moments worth keeping.", contact: "", socials: {} }, items: [], comments: [], likes: {}, albums: [] };
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function load() { try { return { ...clone(defaults), ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) }; } catch { fs.writeFileSync(DB_FILE, JSON.stringify(defaults, null, 2)); return clone(defaults); } }
let db = load();
function save() { const tmp = DB_FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(db, null, 2)); fs.renameSync(tmp, DB_FILE); }
const uid = () => crypto.randomUUID();
const clean = (v, n = 5000) => String(v ?? "").trim().slice(0, n);
const isPrivate = (req, item) => item.visibility !== "private" || req.session.privateAccess === true || req.session.admin === true;
function admin(req, res, next) { return req.session.admin ? next() : res.status(401).json({ error: "Admin authentication required." }); }
function visible(req, item) { return isPrivate(req, item); }
function present(item) { return { ...item, filename: undefined, originalName: undefined, likes: db.likes[item.id] || 0, comments: db.comments.filter(c => c.itemId === item.id && c.approved !== false).length }; }
function mediaPath(item) { return `/media/${encodeURIComponent(item.id)}`; }
function publicItem(req, item) { const out = present(item); out.mediaUrl = item.filename ? mediaPath(item) : ""; return out; }

app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"), resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", maxAge: 1000 * 60 * 60 * 8 } }));
app.use(express.static(path.join(ROOT, "public")));
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-7", message: { error: "Too many attempts. Try again later." } });
const interactionLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 80, standardHeaders: "draft-7" });
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "application/pdf", "text/plain"]);
const storage = multer.diskStorage({ destination: UPLOAD_DIR, filename: (_r, f, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(10).toString("hex")}${path.extname(f.originalname).toLowerCase()}`) });
const upload = multer({ storage, limits: { fileSize: 150 * 1024 * 1024 }, fileFilter: (_r, f, cb) => cb(null, allowed.has(f.mimetype)) });
function unlink(file) { if (file) { const p = path.join(UPLOAD_DIR, path.basename(file)); if (p.startsWith(UPLOAD_DIR) && fs.existsSync(p)) fs.unlinkSync(p); } }

app.get("/api/site", (_r, s) => s.json(db.site));
app.get("/api/content", (req, res) => res.json(db.items.filter(i => visible(req, i)).sort((a,b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt))).map(i => publicItem(req, i))));
app.get("/api/albums", (req, res) => res.json(db.albums.map(a => ({ ...a, count: db.items.filter(i => i.albumId === a.id && visible(req,i)).length }))));
app.get("/api/private-status", (req, res) => res.json({ unlocked: !!req.session.privateAccess }));
app.post("/api/private/unlock", loginLimit, (req, res) => { const pass = clean(req.body.password, 300); if (!process.env.PRIVATE_CONTENT_PASSWORD) return res.status(503).json({ error: "Private archive is not configured." }); if (!crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(process.env.PRIVATE_CONTENT_PASSWORD))) return res.status(401).json({ error: "Incorrect private password." }); req.session.privateAccess = true; res.json({ ok: true }); });
app.post("/api/private/lock", (req,res) => { req.session.privateAccess = false; res.json({ ok:true }); });
app.get("/media/:id", (req,res) => { const item = db.items.find(i => i.id === req.params.id); if (!item || !item.filename || !visible(req,item)) return res.status(item && item.visibility === "private" ? 403 : 404).send("Media unavailable."); const file = path.join(UPLOAD_DIR, path.basename(item.filename)); if (!fs.existsSync(file)) return res.status(404).send("Media missing."); res.type(item.mime || "application/octet-stream"); res.sendFile(file); });
app.get("/download/:id", (req,res) => { const item = db.items.find(i => i.id === req.params.id); if (!item || !item.filename || !visible(req,item)) return res.status(403).send("Download unavailable."); const file = path.join(UPLOAD_DIR, path.basename(item.filename)); if (!fs.existsSync(file)) return res.status(404).send("File missing."); res.download(file, item.originalName || "memory"); });
app.post("/api/items/:id/like", interactionLimit, (req,res) => { const item=db.items.find(i=>i.id===req.params.id); if(!item||!visible(req,item)) return res.status(404).json({error:"Memory not found."}); const key = `${req.ip}:${item.id}`; req.session.likes ||= {}; if(req.session.likes[key]) return res.json({ likes: db.likes[item.id] || 0, duplicate: true }); req.session.likes[key]=true; db.likes[item.id]=(db.likes[item.id]||0)+1; save(); res.json({likes:db.likes[item.id]}); });
app.get("/api/items/:id/comments", (req,res) => { const item=db.items.find(i=>i.id===req.params.id); if(!item||!visible(req,item)) return res.status(404).json({error:"Memory not found."}); res.json(db.comments.filter(c=>c.itemId===item.id&&c.approved!==false).slice(-100)); });
app.post("/api/items/:id/comments", interactionLimit, (req,res) => { const item=db.items.find(i=>i.id===req.params.id); if(!item||!visible(req,item)) return res.status(404).json({error:"Memory not found."}); const text=clean(req.body.text,1000), name=clean(req.body.name||"Guest",60)||"Guest"; if(!text) return res.status(400).json({error:"Comment cannot be empty."}); const comment={id:uid(),itemId:item.id,name,text,approved:true,createdAt:new Date().toISOString()}; db.comments.push(comment); save(); res.status(201).json(comment); });

app.post("/api/admin/login", loginLimit, (req,res) => { const u=clean(req.body.username,200), p=clean(req.body.password,500); if(!process.env.ADMIN_USERNAME || (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH)) return res.status(503).json({error:"Admin credentials are not configured."}); let ok = u === process.env.ADMIN_USERNAME; if (ok && process.env.ADMIN_PASSWORD_HASH) { const [salt, hash] = process.env.ADMIN_PASSWORD_HASH.split(":"); const derived=crypto.scryptSync(p,salt,64).toString("hex"); ok=crypto.timingSafeEqual(Buffer.from(derived,"hex"),Buffer.from(hash,"hex")); } else ok=ok && p===process.env.ADMIN_PASSWORD; if(!ok) return res.status(401).json({error:"Invalid admin credentials."}); req.session.admin=true; res.json({ok:true}); });
app.post("/api/admin/logout", (req,res)=>req.session.destroy(()=>res.json({ok:true}))); app.get("/api/admin/status",(req,res)=>res.json({authenticated:!!req.session.admin}));
app.get("/api/admin/items", admin, (_r,res)=>res.json(db.items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(i=>present(i)))); app.get("/api/admin/comments",admin,(_r,res)=>res.json(db.comments));
app.post("/api/admin/upload", admin, upload.single("file"), (req,res)=>{ if(!req.file)return res.status(400).json({error:"Choose a supported file."}); const type=clean(req.body.type,20); if(!["photo","video","voice","document"].includes(type)){unlink(req.file.filename);return res.status(400).json({error:"Invalid content type."});} const item={id:uid(),type,title:clean(req.body.title||req.file.originalname,160),description:clean(req.body.description,3000),date:clean(req.body.date||new Date().toISOString().slice(0,10),40),album:clean(req.body.album,100),albumId:clean(req.body.albumId,100),category:clean(req.body.category,80),tags:clean(req.body.tags,300),visibility:req.body.visibility==="private"?"private":"public",filename:req.file.filename,originalName:req.file.originalname,mime:req.file.mimetype,createdAt:new Date().toISOString()}; db.items.push(item);save();res.status(201).json(present(item)); });
app.post("/api/admin/text",admin,(req,res)=>{const title=clean(req.body.title,160), description=clean(req.body.description,20000);if(!title||!description)return res.status(400).json({error:"Title and text are required."});const item={id:uid(),type:"text",title,description,date:clean(req.body.date||new Date().toISOString().slice(0,10),40),album:clean(req.body.album,100),albumId:clean(req.body.albumId,100),category:clean(req.body.category,80),visibility:req.body.visibility==="private"?"private":"public",filename:"",originalName:"",mime:"text/plain",chapter:clean(req.body.chapter,80),createdAt:new Date().toISOString()};db.items.push(item);save();res.status(201).json(present(item));});
app.post("/api/admin/albums",admin,(req,res)=>{const album={id:uid(),title:clean(req.body.title,120),description:clean(req.body.description,1000),year:clean(req.body.year,20),coverId:clean(req.body.coverId,100)};if(!album.title)return res.status(400).json({error:"Album title is required."});db.albums.push(album);save();res.status(201).json(album);});
app.put("/api/admin/site",admin,(req,res)=>{for(const k of ["name","tagline","about","contact"])if(typeof req.body[k]==="string")db.site[k]=clean(req.body[k]);if(req.body.socials&&typeof req.body.socials==="object")db.site.socials=Object.fromEntries(Object.entries(req.body.socials).slice(0,12).map(([k,v])=>[clean(k,40),clean(v,500)]));save();res.json(db.site);});
app.patch("/api/admin/items/:id",admin,(req,res)=>{const i=db.items.find(x=>x.id===req.params.id);if(!i)return res.status(404).json({error:"Memory not found."});for(const k of ["title","description","date","album","albumId","category","tags","chapter"])if(typeof req.body[k]==="string")i[k]=clean(req.body[k]);if(req.body.visibility)i.visibility=req.body.visibility==="private"?"private":"public";save();res.json(present(i));});
app.delete("/api/admin/items/:id",admin,(req,res)=>{const n=db.items.findIndex(i=>i.id===req.params.id);if(n<0)return res.status(404).json({error:"Memory not found."});const [i]=db.items.splice(n,1);unlink(i.filename);db.comments=db.comments.filter(c=>c.itemId!==i.id);delete db.likes[i.id];save();res.json({ok:true});});
app.delete("/api/admin/comments/:id",admin,(req,res)=>{db.comments=db.comments.filter(c=>c.id!==req.params.id);save();res.json({ok:true});});
app.use((err,_req,res,_next)=>{ if(err instanceof multer.MulterError)return res.status(400).json({error:`Upload error: ${err.message}`}); console.error(err);res.status(500).json({error:"Unexpected server error."}); });
app.listen(PORT,()=>console.log(`Abishek's Memories running at http://localhost:${PORT}`));
