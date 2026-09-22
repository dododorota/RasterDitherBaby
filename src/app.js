/* Spinacz: kontrolki, presety, wczytywanie pliku, zapis. */
import { S } from "./state.js";
import { $, out, octx } from "./dom.js";
import { renderDither } from "./dither.js";
import { renderHalftone } from "./halftone.js";
import { saveSVG } from "./vector.js";
import { PRESETS } from "./presets.js";

/* ---------- pętla ---------- */
let queued=false;
function render(){
  if(!S.img) return;
  if(S.mode==="dither") renderDither(1); else renderHalftone(1);
  $("#dims").textContent = "Podgląd " + out.width + "×" + out.height + " px · zapis " +
    (out.width*S.scl) + "×" + (out.height*S.scl) + " px";
}
function schedule(){
  if(queued) return;
  queued=true;
  requestAnimationFrame(()=>{ queued=false; render(); });
}
/* ---------- kontrolki ---------- */
function slider(id, key, fmt, map){
  const el=$("#"+id), v=$("#"+id+"-v");
  const upd=()=>{ const raw=+el.value; S[key]= map?map(raw):raw; v.textContent=fmt(S[key],raw); };
  el.addEventListener("input", ()=>{ upd(); schedule(); });
  upd();
}
slider("bri","bri", v=>v);
slider("con","con", v=>v);
slider("gam","gam", v=>v.toFixed(2), v=>v/100);
slider("pix","pix", v=>v+"×");
slider("str","str", (v,raw)=>raw+"%", v=>v/100);
slider("thr","thr", v=>v);
slider("cell","cell", v=>v);
slider("ang","ang", v=>v+"°");
slider("dot","dot", v=>v.toFixed(2), v=>v/100);
slider("mis","mis", v=>(v/10).toFixed(1));
slider("grain","grain", v=>v);
slider("scl","scl", v=>v+"×");

$("#inv").addEventListener("change", e=>{ S.inv=e.target.checked; schedule(); });
$("#serp").addEventListener("change", e=>{ S.serp=e.target.checked; schedule(); });
["algo","pal","shape","inkmode"].forEach(id=>{
  $("#"+id).addEventListener("change", e=>{
    S[id]=e.target.value;
    if(id==="pal") $("#duo").style.display = (S.pal==="bw") ? "flex" : "none";
    schedule();
  });
});
$("#ink").addEventListener("input", e=>{ S.ink=e.target.value; schedule(); });
$("#paper").addEventListener("input", e=>{ S.paper=e.target.value; schedule(); });
$("#swap").addEventListener("click", ()=>{
  const a=S.ink; S.ink=S.paper; S.paper=a;
  $("#ink").value=S.ink; $("#paper").value=S.paper; schedule();
});

function setMode(m){
  S.mode=m;
  $("#tab-dither").setAttribute("aria-selected", m==="dither");
  $("#tab-half").setAttribute("aria-selected", m==="half");
  $("#g-dither").classList.toggle("hidden", m!=="dither");
  $("#g-pal").classList.toggle("hidden", m!=="dither");
  $("#g-half").classList.toggle("hidden", m!=="half");
  buildPresets();
  schedule();
}
$("#tab-dither").addEventListener("click", ()=>setMode("dither"));
$("#tab-half").addEventListener("click", ()=>setMode("half"));
/* ---------- presety ---------- */
function buildPresets(){
  const box=$("#presets"); box.innerHTML="";
  for(const [name,cfg] of PRESETS[S.mode]){
    const b=document.createElement("button");
    b.className="btn"; b.textContent=name;
    b.addEventListener("click", ()=>applyPreset(cfg));
    box.appendChild(b);
  }
}
function applyPreset(cfg){
  Object.assign(S, cfg);
  $("#bri").value=S.bri; $("#con").value=S.con; $("#gam").value=Math.round(S.gam*100);
  $("#pix").value=S.pix; $("#str").value=Math.round(S.str*100); $("#thr").value=S.thr;
  $("#cell").value=S.cell; $("#ang").value=S.ang; $("#dot").value=Math.round(S.dot*100);
  $("#mis").value=S.mis; $("#grain").value=S.grain;
  $("#algo").value=S.algo; $("#pal").value=S.pal; $("#shape").value=S.shape; $("#inkmode").value=S.inkmode;
  $("#ink").value=S.ink; $("#paper").value=S.paper;
  $("#duo").style.display = (S.pal==="bw") ? "flex" : "none";
  ["bri","con","gam","pix","str","thr","cell","ang","dot","mis","grain"].forEach(id=>
    $("#"+id).dispatchEvent(new Event("input")));
}
buildPresets();
/* ---------- wczytywanie ---------- */
function setImage(img){
  S.img=img;
  $("#drop").classList.add("hidden");
  out.classList.remove("hidden");
  schedule();
}
function fromFile(f){
  if(!f || !f.type.startsWith("image/")) return;
  const url=URL.createObjectURL(f), im=new Image();
  im.onload=()=>{ setImage(im); URL.revokeObjectURL(url); };
  im.onerror=()=>{ $("#drop").querySelector("strong").textContent="Nie udało się otworzyć pliku"; URL.revokeObjectURL(url); };
  im.src=url;
}
$("#load").addEventListener("click", ()=>$("#file").click());
$("#file").addEventListener("change", e=>fromFile(e.target.files[0]));

const stage=$("#stage");
["dragenter","dragover"].forEach(ev=>stage.addEventListener(ev, e=>{ e.preventDefault(); stage.classList.add("over"); }));
["dragleave","drop"].forEach(ev=>stage.addEventListener(ev, e=>{ e.preventDefault(); stage.classList.remove("over"); }));
stage.addEventListener("drop", e=>{ if(e.dataTransfer.files[0]) fromFile(e.dataTransfer.files[0]); });
window.addEventListener("paste", e=>{
  for(const it of e.clipboardData.items) if(it.type.startsWith("image/")) fromFile(it.getAsFile());
});

/* próbka: obiekt z gradientem, żeby od razu było na czym testować */
$("#sample").addEventListener("click", ()=>{
  const c=document.createElement("canvas"); c.width=900; c.height=900;
  const x=c.getContext("2d");
  x.fillStyle="#c9c9c9"; x.fillRect(0,0,900,900);
  let g=x.createLinearGradient(0,900,0,300);
  g.addColorStop(0,"#ffffff"); g.addColorStop(1,"#8a8a8a");
  x.fillStyle=g; x.fillRect(0,540,900,360);
  g=x.createRadialGradient(360,340,20,420,400,330);
  g.addColorStop(0,"#ffffff"); g.addColorStop(.45,"#b06a3a"); g.addColorStop(1,"#120c08");
  x.fillStyle=g; x.beginPath(); x.arc(450,420,250,0,6.2832); x.fill();
  g=x.createLinearGradient(0,0,900,0);
  g.addColorStop(0,"#2b3d6b"); g.addColorStop(1,"#d9c27a");
  x.fillStyle=g; x.globalAlpha=.55; x.fillRect(0,0,900,300); x.globalAlpha=1;
  x.fillStyle="rgba(0,0,0,.35)"; x.beginPath();
  x.ellipse(470,690,290,46,0,0,6.2832); x.fill();
  const im=new Image(); im.onload=()=>setImage(im); im.src=c.toDataURL();
});
/* ---------- zapis ---------- */
$("#fmt").addEventListener("change", e=>{
  S.fmt=e.target.value;
  $("#save").textContent = S.fmt==="svg" ? "Zapisz SVG" : "Zapisz PNG";
  $("#scl").disabled = (S.fmt==="svg");
});
$("#save").addEventListener("click", ()=>{
  if(!S.img) return;
  if(S.fmt==="svg"){ saveSVG(); return; }
  if(S.mode==="dither") renderDither(S.scl); else renderHalftone(S.scl);
  out.toBlob(b=>{
    const a=document.createElement("a");
    a.href=URL.createObjectURL(b);
    a.download = (S.mode==="dither" ? "dither" : "raster") + "-" + Date.now() + ".png";
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
    render();
  }, "image/png");
});
