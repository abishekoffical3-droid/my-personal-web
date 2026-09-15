const $=s=>document.querySelector(s);
async function api(url,opt={}){const r=await fetch(url,opt);const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Request failed");return d}
function fd(form){return new FormData(form)}

async function check(){
  const s=await api("/api/admin/status");
  if(s.authenticated){$("#login").classList.add("hidden");$("#dashboard").classList.remove("hidden");await loadAll();}
}
async function loadAll(){
  const items=await api("/api/admin/items");
  $("#total").textContent=items.length;
  $("#photos").textContent=items.filter(x=>x.type==="photo").length;
  $("#videos").textContent=items.filter(x=>x.type==="video").length;
  $("#private").textContent=items.filter(x=>x.visibility==="private").length;
  $("#items").innerHTML=items.length?items.map(i=>`<div class="item">
    <div class="thumb">${i.type==="photo"?`<img src="/uploads/${encodeURIComponent(i.filename)}">`:i.type==="video"?"🎥":i.type==="voice"?"🎙️":i.type==="text"?"📝":"📄"}</div>
    <div><strong>${esc(i.title)}</strong><small>${esc(i.type)} • ${esc(i.visibility)} • ${esc(i.date)}</small></div>
    <div class="item-actions"><button onclick="del('${i.id}')">Delete</button></div>
  </div>`).join(""):"<p style='color:#888'>No memories yet.</p>";
  const site=await api("/api/site");
  $("#siteForm").name.value=site.name||"";
  $("#siteForm").tagline.value=site.tagline||"";
  $("#siteForm").about.value=site.about||"";
  $("#siteForm").contact.value=site.contact||"";
  for(const k of ["instagram","facebook","youtube","tiktok"]) $("#siteForm")[k].value=(site.socials||{})[k]||"";
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}

$("#loginForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("#username").value,password:$("#password").value})});$("#loginMsg").textContent="";await check()}catch(err){$("#loginMsg").textContent=err.message}}
$("#logout").onclick=async()=>{await api("/api/admin/logout",{method:"POST"});location.reload()};
$("#refresh").onclick=loadAll;

$("#uploadForm").onsubmit=async e=>{
 e.preventDefault();$("#uploadMsg").textContent="Uploading...";
 try{await api("/api/admin/upload",{method:"POST",body:fd(e.target)});e.target.reset();$("#uploadMsg").textContent="Uploaded successfully.";await loadAll()}
 catch(err){$("#uploadMsg").textContent=err.message}
};
$("#textForm").onsubmit=async e=>{
 e.preventDefault();$("#textMsg").textContent="Saving...";
 try{await api("/api/admin/text",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});e.target.reset();$("#textMsg").textContent="Story saved.";await loadAll()}
 catch(err){$("#textMsg").textContent=err.message}
};
$("#siteForm").onsubmit=async e=>{
 e.preventDefault();
 const x=Object.fromEntries(new FormData(e.target));
 const payload={name:x.name,tagline:x.tagline,about:x.about,contact:x.contact,socials:{instagram:x.instagram,facebook:x.facebook,youtube:x.youtube,tiktok:x.tiktok}};
 try{await api("/api/admin/site",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});$("#siteMsg").textContent="Settings saved."}catch(err){$("#siteMsg").textContent=err.message}
};
async function del(id){if(!confirm("Delete this memory permanently?"))return;try{await api("/api/admin/items/"+id,{method:"DELETE"});await loadAll()}catch(e){alert(e.message)}}
check().catch(()=>{});
