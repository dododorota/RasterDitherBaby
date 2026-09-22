import { S } from "./state.js";

/* ---------- palety ---------- */
export const hex2rgb = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const ramp = n => { const p=[]; for(let i=0;i<n;i++){ const v=Math.round(i*255/(n-1)); p.push([v,v,v]); } return p; };
export function palette(){
  switch(S.pal){
    case "bw": return [hex2rgb(S.paper), hex2rgb(S.ink)];
    case "gray4": return ramp(4);
    case "gray8": return ramp(8);
    case "gameboy": return [[15,56,15],[48,98,48],[139,172,15],[155,188,15]];
    case "cga": return [[0,0,0],[85,255,255],[255,85,255],[255,255,255]];
    case "rgb3": { const p=[]; for(let r=0;r<2;r++)for(let g=0;g<2;g++)for(let b=0;b<2;b++)p.push([r*255,g*255,b*255]); return p; }
    case "quant": { const p=[], L=[0,85,170,255]; for(const r of L)for(const g of L)for(const b of L)p.push([r,g,b]); return p; }
  }
  return [[0,0,0],[255,255,255]];
}
export function nearest(pal,r,g,b){
  let best=0, bd=Infinity;
  for(let i=0;i<pal.length;i++){
    const c=pal[i], dr=r-c[0], dg=g-c[1], db=b-c[2];
    const d=dr*dr*0.299+dg*dg*0.587+db*db*0.114;
    if(d<bd){bd=d;best=i;}
  }
  return pal[best];
}
