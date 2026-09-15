let allItems = [];
let site = {};

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

async function api(url, options={}) {
  const r = await fetch(url, options);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}

function mediaHTML(item) {
  if (item.type === "photo") return `<img src="/uploads/${encodeURIComponent(item.filename)}" alt="${esc(item.title)}" loading="lazy">`;
  if (item.type === "video") return `<video src="/uploads/${encodeURIComponent(item.filename)}" controls preload="metadata"></video>`;
  if (item.type === "voice") return `<div style="font-size:48px">🎙️</div>`;
  if (item.type === "document") return `<div style="font-size:48px">📄</div>`;
  return `<div style="font-size:48px">✦</div>`;
}

function card(item) {
  return `<article class="memory-card">
    ${item.visibility === "private" ? '<span class="private-tag">PRIVATE</span>' : ''}
    <div class="media">${mediaHTML(item)}</div>
    <div class="card-body">
      <div class="card-meta">${esc(item.date)} ${item.album ? "• " + esc(item.album) : ""}</div>
      <div class="card-title">${esc(item.title)}</div>
      <div class="card-desc">${esc(item.description).slice(0,180)}</div>
      <div class="card-actions">
        <button class="small-btn" onclick="likeItem('${item.id}', this)">♥ ${item.likes}</button>
        <button class="small-btn" onclick="comments('${item.id}')">💬 ${item.comments}</button>
        <button class="small-btn" onclick="downloadItem('${item.id}')">↓ Download</button>
        ${item.type !== "text" ? `<button class="small-btn" onclick="openItem('${item.id}')">View</button>` : ''}
      </div>
    </div>
  </article>`;
}

function render(items) {
  const publicItems = items.filter(i => i.visibility === "public");
  const photos = publicItems.filter(i => i.type === "photo");
  const videos = publicItems.filter(i => i.type === "video");
  const voices = publicItems.filter(i => i.type === "voice");
  const texts = publicItems.filter(i => i.type === "text");

  $("#galleryGrid").innerHTML = photos.length ? photos.map(card).join("") : empty("No photos yet.");
  $("#videoGrid").innerHTML = videos.length ? videos.map(card).join("") : empty("No videos yet.");
  $("#textGrid").innerHTML = texts.length ? texts.map(card).join("") : empty("No written memories yet.");

  $("#voiceList").innerHTML = voices.length ? voices.map(i => `<div class="voice">
    <div class="voice-icon">◉</div><div class="voice-info"><strong>${esc(i.title)}</strong><small>${esc(i.date)}</small></div>
    <audio controls src="/uploads/${encodeURIComponent(i.filename)}"></audio>
    <button class="small-btn" onclick="downloadItem('${i.id}')">↓</button>
  </div>`).join("") : empty("No voice memories yet.");

  const albums = {};
  publicItems.forEach(i => {
    const key = i.album || "Uncategorized";
    albums[key] = (albums[key] || 0) + 1;
  });
  $("#albumGrid").innerHTML = Object.keys(albums).length ? Object.entries(albums).map(([name,count]) =>
    `<div class="album"><span>${count} memories</span><strong>${esc(name)}</strong></div>`).join("") : empty("Albums will appear after uploads.");
}

function empty(text){ return `<div class="text-card" style="grid-column:1/-1"><p>${esc(text)}</p></div>`; }

async function refresh() {
  allItems = await api("/api/content");
  render(allItems);
  const privateStatus = await api("/api/private-status");
  if (privateStatus.unlocked) showPrivate(allItems.filter(i => i.visibility === "private"));
}

async function likeItem(id, btn) {
  try {
    const r = await api(`/api/items/${id}/like`, {method:"POST"});
    btn.textContent = `♥ ${r.likes}`;
  } catch(e) { alert(e.message); }
}

async function comments(id) {
  try {
    const comments = await api(`/api/items/${id}/comments`);
    const list = comments.length ? comments.map(c => `<p><strong>${esc(c.name)}</strong><br>${esc(c.text)}</p>`).join("") : "<p>No comments yet.</p>";
    const name = prompt("Your name:", "Guest");
    if (name === null) return;
    const text = prompt(`Comments (${comments.length})\n\n${comments.map(c=>c.name+": "+c.text).join("\n\n") || "No comments yet."}\n\nWrite a new comment:`);
    if (text === null || !text.trim()) return;
    await api(`/api/items/${id}/comments`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,text})});
    await refresh();
  } catch(e) { alert(e.message); }
}

function downloadItem(id){ window.location.href = `/download/${id}`; }

function openItem(id){
  const item = allItems.find(i=>i.id===id);
  if(!item) return;
  $("#modalContent").innerHTML = `
    ${item.type==="photo" ? `<img src="/uploads/${encodeURIComponent(item.filename)}" alt="">` :
      item.type==="video" ? `<video src="/uploads/${encodeURIComponent(item.filename)}" controls autoplay></video>` :
      `<div class="text-card"><h2>${esc(item.title)}</h2><p>${esc(item.description)}</p></div>`}
    <div class="card-body"><h3>${esc(item.title)}</h3><p class="card-desc">${esc(item.description)}</p></div>`;
  $("#modal").classList.remove("hidden");
}
$("#modalClose").onclick = () => $("#modal").classList.add("hidden");
$("#modal").addEventListener("click", e => { if(e.target.id==="modal") $("#modal").classList.add("hidden"); });

function showPrivate(items) {
  $("#privateForm").classList.add("hidden");
  $("#privateMsg").textContent = "Private archive unlocked.";
  $("#privateGrid").classList.remove("hidden");
  $("#privateGrid").innerHTML = items.length ? items.map(card).join("") : empty("No private memories yet.");
  allItems = allItems.filter(i => i.visibility !== "private").concat(items);
}

$("#unlockBtn").onclick = async () => {
  try {
    await api("/api/private/unlock", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("#privatePassword").value})});
    $("#privatePassword").value = "";
    const items = await api("/api/content");
    showPrivate(items.filter(i => i.visibility === "private"));
  } catch(e) { $("#privateMsg").textContent = e.message; }
};

async function loadSite(){
  site = await api("/api/site");
  $("#brandName").textContent = site.name.toUpperCase();
  $("#heroName").innerHTML = esc(site.name).replace(/(Memories\.?)$/i, "<br><span>$1</span>");
  $("#heroTagline").textContent = site.tagline;
  $("#aboutText").textContent = site.about;
  $("#contactText").textContent = site.contact || "Social links and contact details can be added from the admin panel.";
  const labels = {instagram:"Instagram",facebook:"Facebook",youtube:"YouTube",tiktok:"TikTok"};
  $("#socials").innerHTML = Object.entries(site.socials || {}).filter(([,v])=>v).map(([k,v])=>`<a href="${esc(v)}" target="_blank" rel="noopener">${labels[k]||k} ↗</a>`).join("");
  $("#year").textContent = new Date().getFullYear();
}

loadSite().then(refresh).catch(e => alert(e.message));
