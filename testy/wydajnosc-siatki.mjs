/* Pomiar: pełny dithering 1400×1400, skan kontra siatka. Trwa kilka minut.
   Uruchom z katalogu projektu: node testy/wydajnosc-siatki.mjs */
import { S, DEFAULTS } from "../src/state.js";
import { palette, nearest } from "../src/palettes.js";
import { K } from "../src/kernels.js";
import { adjustPixels } from "../src/image.js";
import { ditherPixels } from "../src/dither-core.js";

const W=1400, H=1400;
const ZR = new Uint8ClampedArray(W*H*4);
const stops=[[11,26,46],[212,101,42],[127,168,201],[250,246,234]];
for(let y=0;y<H;y++) for(let x=0;x<W;x++){
  const t=(x+y)/(W+H-2)*3, i=Math.min(2,Math.floor(t)), f=t-i, a=stops[i], b=stops[i+1];
  let r=a[0]+(b[0]-a[0])*f, g=a[1]+(b[1]-a[1])*f, bl=a[2]+(b[2]-a[2])*f;
  const cx=(x*7)%350, cy=(y*11)%350; if((cx-175)**2+(cy-175)**2<9000){ r=255-r; bl=(bl+120)%256; }
  const o=(y*W+x)*4; ZR[o]=r; ZR[o+1]=g; ZR[o+2]=bl; ZR[o+3]=255;
}
const swieze = () => new Uint8ClampedArray(ZR);

let poza=0, wszystkie=0;
function ref(p,w,h,licz){
  adjustPixels(p);
  const pal=palette(), bias=S.thr*2.55, diff=K[S.algo];
  const buf=new Float32Array(w*h*3);
  for(let i=0,j=0;i<p.length;i+=4,j+=3){ buf[j]=p[i]+bias; buf[j+1]=p[i+1]+bias; buf[j+2]=p[i+2]+bias; }
  for(let y=0;y<h;y++){ const rev=S.serp&&(y&1);
    for(let k=0;k<w;k++){ const x=rev?w-1-k:k, idx=(y*w+x)*3;
      const or=buf[idx],og=buf[idx+1],ob=buf[idx+2];
      if(licz){ wszystkie++; if(!(or>=-256&&or<512&&og>=-256&&og<512&&ob>=-256&&ob<512)) poza++; }
      const n=nearest(pal,or,og,ob);
      buf[idx]=n[0];buf[idx+1]=n[1];buf[idx+2]=n[2];
      const er=(or-n[0])*S.str,eg=(og-n[1])*S.str,eb=(ob-n[2])*S.str;
      for(const [dx,dy,wt] of diff.m){ const nx=x+(rev?-dx:dx), ny=y+dy;
        if(nx<0||nx>=w||ny>=h) continue; const ni=(ny*w+nx)*3, f=wt/diff.d;
        buf[ni]+=er*f;buf[ni+1]+=eg*f;buf[ni+2]+=eb*f; } } }
  for(let i=0,j=0;i<p.length;i+=4,j+=3){ p[i]=buf[j];p[i+1]=buf[j+1];p[i+2]=buf[j+2]; }
}
/* poprzedni generator gubił precyzję (s*1103515245 > 2^53) i dawał tylko 104
   różne kolory, więc szukanie 128 zapętlało się — Math.imul liczy w 32 bitach */
function paleta(n){ let s=12345; const r=()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)>>>24);
  const k=[], seen=new Set(); while(k.length<n){ const c=[r(),r(),r()]; if(!seen.has(c.join())){ seen.add(c.join()); k.push(c);} } return {nazwa:'t'+n, kolory:k}; }
function siatkaRGB(l){ const k=[]; for(const r of l) for(const g of l) for(const b of l) k.push([r,g,b]); return k; }
const POKRYWAJACE = {
  "4×4×4 (64)": siatkaRGB([0,85,170,255]),
  "web 6×6×6 (216)": siatkaRGB([0,51,102,153,204,255]),
  "web + szarości (256)": [...siatkaRGB([0,51,102,153,204,255]), ...Array.from({length:40},(_,i)=>{const v=6+i*6; return [v,v,v];})]
};
function czas(fn){ const d=swieze(); const t=performance.now(); fn(d,W,H); return performance.now()-t; }

Object.assign(S,DEFAULTS); S.algo="floyd";
S.pal='bw'; czas(ref); const tBw=Math.min(czas(ref),czas(ref));
console.log(`Floyd–Steinberg 1400×1400 · paleta 1-bit: ${tBw.toFixed(0)} ms`);
const ZESTAW = [...[16,32,64,128,256].map(n=>["losowa "+n, paleta(n)]),
                ...Object.entries(POKRYWAJACE).map(([nz,k])=>[nz, {nazwa:nz, kolory:k}])];
for(const [nazwa, pal] of ZESTAW){
  const n = pal.kolory.length;
  S.custom=pal; S.pal='custom';
  czas(ditherPixels);
  const tS=czas(ref), tN=Math.min(czas(ditherPixels),czas(ditherPixels));
  poza=0; wszystkie=0;
  const A=swieze(), B=swieze(); ref(A,W,H,true); ditherPixels(B,W,H);
  let roz=0; for(let i=0;i<A.length;i++) if(A[i]!==B[i]) roz++;
  console.log(`  ${nazwa.padEnd(21)} skan ${tS.toFixed(0).padStart(4)} ms (×${(tS/tBw).toFixed(1)} 1-bit)  →  ${n>=24?'siatka':'skan  '} ${tN.toFixed(0).padStart(4)} ms (×${(tN/tBw).toFixed(1)} 1-bit)   zysk ×${(tS/tN).toFixed(2)}   poza siatką ${(poza/wszystkie*100).toFixed(1)}%   ${roz?roz+' RÓŻNIC':'bajt w bajt'}`);
}
// czas budowy siatki na świeżej palecie (bez pamięci podręcznej)
const { quantizer } = await import("../src/palettes.js");
for(const n of [24,64,128,256]){
  S.pal='custom'; S.custom={nazwa:'b'+n, kolory:paleta(n).kolory.map(c=>[(c[0]+1)%256,c[1],c[2]])};
  const t=performance.now(); quantizer(); const t1=performance.now()-t;
  const t2=performance.now(); quantizer(); const t3=performance.now()-t2;
  console.log(`  budowa siatki ${String(n).padStart(3)} kol.: ${t1.toFixed(1)} ms, z pamięci podręcznej ${t3.toFixed(2)} ms`);
}
