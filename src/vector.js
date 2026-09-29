import { S, MAX } from "./state.js";
import { $ } from "./dom.js";
import { fit } from "./image.js";
import { ditherData } from "./dither.js";
import { sampler, collectScreen, inkList } from "./halftone.js";
import { sledzKontury, sciezkaDokladna, sciezkaGladka } from "./contours.js";

/* ---------- eksport wektorowy ---------- */
const n2 = v => Math.round(v*100)/100;

/* łączy sąsiadujące piksele tego samego koloru w prostokąty — inaczej SVG
   miałby jeden kwadrat na piksel i Illustrator by się udławił */
export function mergeRects(p,w,h){
  const groups=new Map();
  const key = i => p[i]+","+p[i+1]+","+p[i+2];
  let prev=new Map();
  for(let y=0;y<h;y++){
    const cur=new Map();
    let x=0;
    while(x<w){
      const k=key((y*w+x)*4);
      let x2=x+1;
      while(x2<w && key((y*w+x2)*4)===k) x2++;
      const id=x+":"+(x2-x)+":"+k;
      const open=prev.get(id);
      if(open){ open.h++; cur.set(id,open); prev.delete(id); }
      else{
        const r={x,y,w:x2-x,h:1};
        cur.set(id,r);
        if(!groups.has(k)) groups.set(k,[]);
        groups.get(k).push(r);
      }
      x=x2;
    }
    prev=cur;
  }
  return groups;
}
/* Kontury zamiast prostokątów. Na spodzie prostokąt w kolorze o największym polu.

   Kontury dokładne leżą na siatce pikseli, więc sąsiednie kolory stykają się bez
   szczelin — każdy kolor obrysowujemy raz, osobno.

   Wygładzone układamy piętrowo, jak „Stacked" w Image Trace: każda warstwa
   obejmuje swój kolor razem ze wszystkimi kolorami, które leżą nad nią. Gdyby
   wygładzać każdy kolor osobno, brzegi sąsiadów nie spotkałyby się dokładnie
   i prześwitywałoby tło (tak zachowuje się potrace, zrobiony dla bitmap
   dwukolorowych). Cena piętrowania: szumiący brzeg ditheringu obrysowujemy na
   nowo dla każdego koloru, więc rozmiar rośnie z liczbą kolorów — stąd limit
   KOLOROW_DO_WYGLADZANIA, powyżej którego wracamy do konturów dokładnych. */
export const KOLOROW_DO_WYGLADZANIA = 8;   /* zmierzone przy 900 px, pikselizacja 1×, Floyd:
                                                8 kolorów → 12 MB i 0,5 s, 16 kolorów → 39 MB i 1,4 s */
function svgKontury(p, w, h){
  const pola = new Map();
  for(let i=0; i<p.length; i+=4){ const k = p[i]+","+p[i+1]+","+p[i+2]; pola.set(k, (pola.get(k)||0) + 1); }
  const kolejnosc = [...pola.entries()].sort((a,b) => b[1]-a[1] || (a[0] < b[0] ? -1 : 1)).map(e=>e[0]);
  const ranga = new Map(kolejnosc.map((k,i)=>[k,i]));
  const r = new Uint16Array(w*h);
  for(let i=0, j=0; i<p.length; i+=4, j++) r[j] = ranga.get(p[i]+","+p[i+1]+","+p[i+2]);

  const gladko = S.wygl > 0 && kolejnosc.length <= KOLOROW_DO_WYGLADZANIA;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w*S.pix}" height="${h*S.pix}" viewBox="0 0 ${w} ${h}"${gladko ? "" : ' shape-rendering="crispEdges"'}>`];
  parts.push(`<rect width="${w}" height="${h}" fill="rgb(${kolejnosc[0]})"/>`);
  const maska = new Uint8Array(w*h);
  let count = 0;
  for(let k=1; k<kolejnosc.length; k++){
    if(gladko) for(let j=0; j<r.length; j++) maska[j] = r[j] >= k ? 1 : 0;
    else       for(let j=0; j<r.length; j++) maska[j] = r[j] === k ? 1 : 0;
    const petle = sledzKontury(maska, w, h);
    count += petle.length;
    const d = petle.map(pt => gladko ? sciezkaGladka(pt, S.wygl) : sciezkaDokladna(pt)).join("");
    parts.push(`<path fill="rgb(${kolejnosc[k]})" fill-rule="evenodd" d="${d}"/>`);
  }
  parts.push("</svg>");
  return {svg:parts.join("\n"), count, kolorow: kolejnosc.length, bezWygladzania: S.wygl > 0 && !gladko};
}
export async function svgDither(){
  const {d,w,h} = await ditherData({keep:true});
  if(S.wektor === "kontury") return svgKontury(d.data, w, h);
  const groups = mergeRects(d.data, w, h);
  let bg=null, bgArea=-1, count=0;
  for(const [k,rects] of groups){
    let a=0; for(const r of rects) a+=r.w*r.h;
    if(a>bgArea){ bgArea=a; bg=k; }
  }
  const px=S.pix;
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${w*px}" height="${h*px}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">`];
  parts.push(`<rect width="${w}" height="${h}" fill="rgb(${bg})"/>`);
  for(const [k,rects] of groups){
    if(k===bg) continue;
    let d2="";
    for(const r of rects){ d2 += `M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}z`; count++; }
    parts.push(`<path fill="rgb(${k})" d="${d2}"/>`);
  }
  parts.push("</svg>");
  return {svg:parts.join("\n"), count};
}
function svgShape(x,y,r,deg,cell){
  const t = ` transform="rotate(${n2(deg)} ${n2(x)} ${n2(y)})"`;
  switch(S.shape){
    case "square": return `<rect x="${n2(x-r)}" y="${n2(y-r)}" width="${n2(r*2)}" height="${n2(r*2)}"${t}/>`;
    case "diamond": return `<polygon points="0,${n2(-r*1.3)} ${n2(r*1.3)},0 0,${n2(r*1.3)} ${n2(-r*1.3)},0" transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(deg)})"/>`;
    case "line": return `<rect x="${n2(x-cell*0.75)}" y="${n2(y-r*0.9)}" width="${n2(cell*1.5)}" height="${n2(r*1.8)}"${t}/>`;
    case "cross": return `<rect x="${n2(x-r*1.5)}" y="${n2(y-r*0.45)}" width="${n2(r*3)}" height="${n2(r*0.9)}"${t}/>` +
                         `<rect x="${n2(x-r*0.45)}" y="${n2(y-r*1.5)}" width="${n2(r*0.9)}" height="${n2(r*3)}"${t}/>`;
    default: return `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}"/>`;
  }
}
export function svgHalftone(){
  const [W,H] = fit(S.img.width, S.img.height, MAX);
  const smp = sampler(W,H);
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`];
  parts.push(`<rect width="${W}" height="${H}" fill="${S.paper}"/>`);
  let count=0;
  for(const ink of inkList()){
    const {dots,cell} = collectScreen(smp,W,H, ink.ang, ink.cov, ink.off);
    const body=[];
    for(const [x,y,r] of dots){ body.push(svgShape(x,y,r, ink.ang, cell)); count++; }
    parts.push(`<g id="${ink.name}" fill="${ink.color}" style="mix-blend-mode:multiply">${body.join("")}</g>`);
  }
  parts.push("</svg>");
  return {svg:parts.join("\n"), count};
}
/* 2–4, 22–24, 32–34… kolory; 5–21, 25–31… kolorów */
function odmianaKolor(n){
  const j = n % 10, d = n % 100;
  return (j >= 2 && j <= 4 && !(d >= 12 && d <= 14)) ? "kolory" : "kolorów";
}
export async function saveSVG(){
  const {svg,count,kolorow,bezWygladzania} = (S.mode==="dither") ? await svgDither() : svgHalftone();
  const blob=new Blob([svg],{type:"image/svg+xml"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=(S.mode==="dither"?"dither":"raster")+"-"+Date.now()+".svg";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  /* W ditheringu SVG to piksele zamienione na prostokąty, więc efekty są w nim
     z definicji. W rastrze SVG to geometria punktów — ziarna ani efektów
     pikselowych nie da się w niej oddać, więc mówimy wprost, czego brakuje. */
  const brak = [];
  if(S.mode==="half"){
    if(S.grain) brak.push("ziarna papieru");
    if(S.sort!=="brak") brak.push("sortowania pikseli");
    if(S.rgb>0) brak.push("przesunięcia RGB");
  }
  $("#dims").textContent = "Zapisano SVG · " + count.toLocaleString("pl-PL") + " obiektów · " +
    Math.round(blob.size/1024).toLocaleString("pl-PL") + " kB" +
    (brak.length ? " · Wektor nie zawiera " + brak.join(", ") + " — to efekty na pikselach, są tylko w PNG." : "") +
    (bezWygladzania ? " · Bez wygładzania: obraz ma " + kolorow + " " + odmianaKolor(kolorow) + ", a wygładzanie działa do " +
       KOLOROW_DO_WYGLADZANIA + " — przy większej liczbie plik puchnie kilkukrotnie. Zapisano kontury dokładne." : "") +
    (count>80000 ? " — przy tylu obiektach Illustrator będzie mulił, podnieś pikselizację albo gęstość." : "");
}
