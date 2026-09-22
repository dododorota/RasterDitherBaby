import { S, MAX } from "./state.js";
import { $ } from "./dom.js";
import { fit } from "./image.js";
import { ditherData } from "./dither.js";
import { sampler, collectScreen, inkList } from "./halftone.js";

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
export function svgDither(){
  const {d,w,h} = ditherData();
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
export function saveSVG(){
  const {svg,count} = (S.mode==="dither") ? svgDither() : svgHalftone();
  const blob=new Blob([svg],{type:"image/svg+xml"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=(S.mode==="dither"?"dither":"raster")+"-"+Date.now()+".svg";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  $("#dims").textContent = "Zapisano SVG · " + count.toLocaleString("pl-PL") + " obiektów · " +
    Math.round(blob.size/1024).toLocaleString("pl-PL") + " kB" +
    (count>80000 ? " — przy tylu obiektach Illustrator będzie mulił, podnieś pikselizację albo gęstość." : "");
}
