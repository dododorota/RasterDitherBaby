/* Spinacz: kontrolki, presety, wczytywanie pliku, zapis. */
import { S, DEFAULTS, LOOK } from "./state.js";
import { $, out } from "./dom.js";
import { renderDither } from "./dither.js";
import { renderHalftone } from "./halftone.js";
import { saveSVG } from "./vector.js";
import { PRESETS } from "./presets.js";
import { czytajPalete, paletaZDanych, domyslnaNazwa, MAX_KOLOROW } from "./palette-files.js";

/* ---------- pętla ---------- */
let queued=false;
function dims(){
  $("#dims").textContent = "Podgląd " + out.width + "×" + out.height + " px · zapis " +
    (out.width*S.scl) + "×" + (out.height*S.scl) + " px";
}
/* Dither liczy się w workerze, więc render jest asynchroniczny. Gdy w trakcie
   liczenia ruszy się suwak, to zadanie zostaje wyparte i zwraca null —
   rysuje dopiero najświeższe. */
async function render(){
  if(!S.img) return;
  if(S.mode==="dither"){
    const slow = setTimeout(()=>{ $("#dims").textContent = "Liczę…"; }, 200);
    const r = await renderDither(1);
    clearTimeout(slow);
    if(!r) return;
  } else renderHalftone(1);
  dims();
}
function schedule(){
  if(queued) return;
  queued=true;
  requestAnimationFrame(()=>{ queued=false; render(); });
}
/* ---------- kontrolki ----------
   Jedna tabela zamiast rozsypanych wywołań. Dzięki niej syncUI() potrafi
   odtworzyć cały panel ze stanu, a presety — te wbudowane i te z pliku — nie
   muszą wiedzieć, jakie kontrolki w ogóle istnieją. */
const SUWAKI = [
  {id:"bri",   key:"bri",   opis:v=>v},
  {id:"con",   key:"con",   opis:v=>v},
  {id:"gam",   key:"gam",   opis:v=>v.toFixed(2),        zS:v=>v/100, naS:v=>Math.round(v*100)},
  {id:"pix",   key:"pix",   opis:v=>v+"×"},
  {id:"str",   key:"str",   opis:v=>Math.round(v*100)+"%", zS:v=>v/100, naS:v=>Math.round(v*100)},
  {id:"thr",   key:"thr",   opis:v=>v},
  {id:"cell",  key:"cell",  opis:v=>v},
  {id:"ang",   key:"ang",   opis:v=>v+"°"},
  {id:"dot",   key:"dot",   opis:v=>v.toFixed(2),        zS:v=>v/100, naS:v=>Math.round(v*100)},
  {id:"blur",  key:"blur",  opis:v=>v?v+" px":"brak"},
  {id:"mis",   key:"mis",   opis:v=>(v/10).toFixed(1)},
  {id:"grain", key:"grain", opis:v=>v},
  {id:"scl",   key:"scl",   opis:v=>v+"×"}
];
const PTASZKI = ["inv","serp"];
const LISTY   = ["algo","pal","shape","inkmode"];
const KOLORY  = ["ink","paper"];

function duo(){
  $("#duo").style.display = (S.pal==="bw") ? "flex" : "none";
  const box = $("#pal-probki"), widac = !!S.custom && S.pal==="custom";
  box.classList.toggle("hidden", !widac);
  box.innerHTML = "";
  if(widac) for(const [r,g,b] of S.custom.kolory){
    const i = document.createElement("i");
    i.style.background = "rgb("+r+","+g+","+b+")";
    i.title = "#"+((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1);
    box.appendChild(i);
  }
}
/* Opcja „Własna" istnieje w liście tylko wtedy, gdy jest wczytana paleta — dzięki
   temu syncUI() sam odrzuci pal:"custom" z presetu, który palety nie przyniósł.
   Wołać przed syncUI() za każdym razem, gdy zmienia się S.custom. */
function opcjaPalety(){
  let opt = $("#pal-custom");
  if(S.custom){
    if(!opt){
      opt = document.createElement("option");
      opt.value = "custom"; opt.id = "pal-custom";
      $("#pal").appendChild(opt);
    }
    opt.textContent = "Własna: "+S.custom.nazwa+" ("+S.custom.kolory.length+")";
  } else if(opt) opt.remove();
}

/* stan → panel, a potem z powrotem: przeglądarka przycina liczby do zakresu
   suwaka i odrzuca nieznane opcje listy, więc odczyt po zapisie gwarantuje,
   że w S nie zostanie wartość, której panel nie potrafi pokazać */
function syncUI(){
  for(const c of SUWAKI){
    const el=$("#"+c.id);
    el.value = c.naS ? c.naS(S[c.key]) : S[c.key];
    S[c.key] = c.zS ? c.zS(+el.value) : +el.value;
    $("#"+c.id+"-v").textContent = c.opis(S[c.key]);
  }
  for(const k of PTASZKI){ const el=$("#"+k); el.checked = !!S[k]; S[k]=el.checked; }
  for(const k of LISTY){
    const el=$("#"+k);
    el.value = S[k];
    if(el.selectedIndex < 0) el.value = DEFAULTS[k];
    S[k] = el.value;
  }
  for(const k of KOLORY){ const el=$("#"+k); el.value = S[k]; S[k]=el.value; }
  duo();
}
for(const c of SUWAKI){
  const el=$("#"+c.id);
  el.addEventListener("input", ()=>{
    S[c.key] = c.zS ? c.zS(+el.value) : +el.value;
    $("#"+c.id+"-v").textContent = c.opis(S[c.key]);
    schedule();
  });
}
for(const k of PTASZKI) $("#"+k).addEventListener("change", e=>{ S[k]=e.target.checked; schedule(); });
for(const k of LISTY) $("#"+k).addEventListener("change", e=>{
  S[k]=e.target.value;
  if(k==="pal") duo();
  schedule();
});
for(const k of KOLORY) $("#"+k).addEventListener("input", e=>{ S[k]=e.target.value; schedule(); });
$("#swap").addEventListener("click", ()=>{
  const a=S.ink; S.ink=S.paper; S.paper=a;
  $("#ink").value=S.ink; $("#paper").value=S.paper; schedule();
});
syncUI();

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
/* Preset to pełny opis wyglądu: klucze, których nie podaje, wracają do wartości
   domyślnych, zamiast zostawać po poprzednim presecie. Inaczej „Gazeta" po
   „Promo" dziedziczyła jego punkt bieli, a negatyw i wężyk nie wracały nigdy. */
function applyPreset(cfg){
  for(const k of LOOK) S[k] = (k in cfg) ? cfg[k] : DEFAULTS[k];
  syncUI();
  schedule();
}
buildPresets();
/* ---------- presety w pliku ---------- */
const WERSJA = 1;
function komunikat(t){ $("#preset-msg").textContent = t; }

$("#preset-save").addEventListener("click", ()=>{
  const look={}; for(const k of LOOK) look[k]=S[k];
  const dane={app:"raster", wersja:WERSJA, zapisano:new Date().toISOString(), tryb:S.mode, look};
  /* bez kolorów preset z paletą własną byłby nieodtwarzalny */
  if(S.pal==="custom" && S.custom) dane.paleta = {nazwa:S.custom.nazwa, kolory:S.custom.kolory};
  const blob=new Blob([JSON.stringify(dane,null,2)], {type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="raster-"+S.mode+"-"+Date.now()+".json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  komunikat("Zapisano ustawienia do pliku.");
});
$("#preset-load").addEventListener("click", ()=>$("#preset-file").click());
$("#preset-file").addEventListener("change", e=>{
  const f=e.target.files[0];
  e.target.value="";                       /* żeby ten sam plik dało się wczytać drugi raz */
  if(f) wczytajPreset(f);
});
function wczytajPreset(f){
  const fr=new FileReader();
  fr.onerror=()=>komunikat("Nie udało się odczytać pliku.");
  fr.onload=()=>{
    let dane;
    try{ dane=JSON.parse(fr.result); }
    catch{ komunikat("To nie jest poprawny JSON."); return; }
    if(!dane || typeof dane!=="object" || dane.app!=="raster" || !dane.look || typeof dane.look!=="object"){
      komunikat("To nie wygląda na preset Rastra."); return;
    }
    /* bierzemy tylko klucze o typie zgodnym z domyślnym — plik z innej wersji
       albo ręcznie podłubany nie wsadzi do S czegoś, czego panel nie ogarnie */
    let odrzucone=0;
    for(const k of LOOK){
      const v=dane.look[k];
      if(v!==undefined && typeof v===typeof DEFAULTS[k]) S[k]=v;
      else { S[k]=DEFAULTS[k]; if(v!==undefined) odrzucone++; }
    }
    /* syncUI przycina liczby do zakresu suwaków, odrzuca nieznane opcje list
       i normalizuje kolory. Porównanie przed i po wyłapuje te poprawki, bo
       inaczej plik z gęstością 9999 wczytywałby się bez słowa komentarza. */
    let uwagaPalety = "";
    if(dane.paleta !== undefined){
      try{ const p = paletaZDanych(dane.paleta); S.custom = {nazwa:p.nazwa, kolory:p.kolory}; }
      catch{ uwagaPalety = " Paleta zapisana w pliku była uszkodzona i została pominięta."; }
    }
    opcjaPalety();
    const chciane={}; for(const k of LOOK) chciane[k]=S[k];
    if(dane.tryb==="dither" || dane.tryb==="half") setMode(dane.tryb);
    syncUI();
    const poprawione = LOOK.filter(k => S[k]!==chciane[k]).length;
    schedule();
    const n = odrzucone + poprawione;
    komunikat((n ? "Wczytano. Wartości spoza tego, co panel potrafi ustawić: "+n+" — cofnięte do poprawnych."
                 : "Wczytano ustawienia z pliku.") + uwagaPalety);
  };
  fr.readAsText(f);
}
/* ---------- paleta własna ---------- */
function komunikatPalety(t){ $("#pal-msg").textContent = t; }
$("#pal-load").addEventListener("click", ()=>$("#pal-file").click());
$("#pal-file").addEventListener("change", e=>{
  const f=e.target.files[0];
  e.target.value="";
  if(f) wczytajPaleteZPliku(f);
});
/* Paleta z obrazka: unikalne kolory w kolejności pojawiania się, wiersz po
   wierszu. Lospec daje paski 1×N i ich powiększenia 8× i 32× — powtórzenia
   i tak się zwijają. Bez konwersji przestrzeni barw, bo liczą się dokładne
   wartości z pliku, a przeglądarka przestawia je po cichu, gdy PNG ma profil.
   Piksele przezroczyste pomijamy (ramki i odstępy między próbkami).
   Obrazka z ponad MAX_KOLOROW kolorami nie przycinamy, tylko odrzucamy —
   pierwsze 256 kolorów zdjęcia to przypadek, a nie paleta. */
async function paletaZObrazka(f){
  let bmp;
  try{ bmp = await createImageBitmap(f, {colorSpaceConversion:"none", premultiplyAlpha:"none"}); }
  catch{ throw new Error("Nie udało się otworzyć obrazka."); }
  const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
  const x = c.getContext("2d");
  x.drawImage(bmp, 0, 0); bmp.close();
  const p = x.getImageData(0, 0, c.width, c.height).data;
  const widziane = new Set(), kolory = [];
  let przezroczyste = 0;
  for(let i=0; i<p.length; i+=4){
    if(p[i+3] < 128){ przezroczyste++; continue; }
    const k = (p[i]<<16) | (p[i+1]<<8) | p[i+2];
    if(widziane.has(k)) continue;
    widziane.add(k); kolory.push([p[i], p[i+1], p[i+2]]);
    if(kolory.length > MAX_KOLOROW)
      throw new Error("Ten obrazek ma ponad "+MAX_KOLOROW+" kolorów — to raczej zdjęcie niż paleta. "+
                      "Nadaje się pasek próbek, np. PNG z Lospec.");
  }
  const nazwa = domyslnaNazwa(f.name).replace(/\s*\d+x$/i, "") || "paleta";
  const wynik = paletaZDanych({nazwa, kolory});
  if(przezroczyste) wynik.uwagi.push("pominięto piksele przezroczyste");
  return wynik;
}
async function wczytajPaleteZPliku(f){
  let p;
  try{
    p = (/^image\//.test(f.type) || /\.(png|gif)$/i.test(f.name))
      ? await paletaZObrazka(f)
      : czytajPalete(f.name, await f.arrayBuffer());
  }
  catch(err){ komunikatPalety(err.message || "Nie udało się odczytać palety."); return; }
  S.custom = {nazwa:p.nazwa, kolory:p.kolory};
  S.pal = "custom";
  opcjaPalety();
  if(S.mode !== "dither") setMode("dither");   /* paleta działa tylko w ditheringu */
  syncUI();
  schedule();
  komunikatPalety("Wczytano „"+p.nazwa+"”, kolorów: "+p.kolory.length+"."+
    (p.uwagi.length ? " Uwaga: "+p.uwagi.join("; ")+"." : ""));
}
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
stage.addEventListener("drop", e=>{
  const f=e.dataTransfer.files[0];
  if(!f) return;
  /* na podgląd można rzucić i obraz, i zapisany preset */
  if(f.type==="application/json" || /\.json$/i.test(f.name)) wczytajPreset(f);
  else if(/\.(hex|gpl|pal|ase|txt)$/i.test(f.name)) wczytajPaleteZPliku(f);
  else fromFile(f);
});
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
$("#save").addEventListener("click", async ()=>{
  if(!S.img) return;
  if(S.fmt==="svg"){ await saveSVG(); return; }
  if(S.mode==="dither") await renderDither(S.scl, {keep:true}); else renderHalftone(S.scl);
  out.toBlob(b=>{
    const a=document.createElement("a");
    a.href=URL.createObjectURL(b);
    a.download = (S.mode==="dither" ? "dither" : "raster") + "-" + Date.now() + ".png";
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
    render();
  }, "image/png");
});
