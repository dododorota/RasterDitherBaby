/* Kontury: dokładne pokrywają dokładnie maskę (evenodd), wygładzone nie zmieniają pola.
   Uruchom z katalogu projektu: node testy/kontury.mjs */
import { sledzKontury, sciezkaDokladna, sciezkaGladka } from "../src/contours.js";

let z = 7; const los = () => (z = (Math.imul(z,1664525)+1013904223)>>>0) / 4294967296;
function maska(w, h, f){ const m = new Uint8Array(w*h); for(let y=0;y<h;y++) for(let x=0;x<w;x++) m[y*w+x] = f(x,y)?1:0; return m; }

// parser naszych ścieżek: M/L/H/V/Q/Z, krzywe spłaszczane
function wielokaty(d){
  const t = d.match(/[MLHVQZmlhvqz]|-?(\d+\.?\d*|\.\d+)/g) || [], petle = [];
  let i = 0, x = 0, y = 0, cur = null, rel = false;
  const num = () => +t[i++];
  while(i < t.length){
    const c = t[i++], r = c === c.toLowerCase(), C = c.toUpperCase();
    const ox = r ? x : 0, oy = r ? y : 0;
    if(C === "M"){ x = ox + num(); y = oy + num(); cur = [[x,y]]; petle.push(cur); }
    else if(C === "L"){ x = ox + num(); y = oy + num(); cur.push([x,y]); }
    else if(C === "H"){ x = ox + num(); cur.push([x,y]); }
    else if(C === "V"){ y = oy + num(); cur.push([x,y]); }
    else if(C === "Q"){ const cx=ox+num(), cy=oy+num(), ex=ox+num(), ey=oy+num();
      for(let s=1;s<=8;s++){ const u=s/8, a=(1-u)*(1-u), b=2*(1-u)*u, e=u*u; cur.push([a*x+b*cx+e*ex, a*y+b*cy+e*ey]); }
      x = ex; y = ey; }
    else if(C === "Z"){ if(cur && cur.length){ x = cur[0][0]; y = cur[0][1]; } }
  }
  return petle;
}
const poleZnak = p => { let a=0; for(let i=0;i<p.length;i++){ const [x1,y1]=p[i], [x2,y2]=p[(i+1)%p.length]; a += x1*y2 - x2*y1; } return a/2; };
function wewnatrz(petle, px, py){          // evenodd
  let c = false;
  for(const p of petle) for(let i=0,j=p.length-1;i<p.length;j=i++){
    const [xi,yi]=p[i], [xj,yj]=p[j];
    if((yi>py)!==(yj>py) && px < (xj-xi)*(py-yi)/(yj-yi)+xi) c = !c;
  }
  return c;
}

const przypadki = {
  "pusty": [20,20, ()=>0],
  "pełny": [20,20, ()=>1],
  "jeden piksel": [9,9, (x,y)=>x===4&&y===4],
  "szachownica": [24,24, (x,y)=>(x+y)&1],
  "szum 50%": [60,40, ()=>los()<0.5],
  "szum 15%": [60,40, ()=>los()<0.15],
  "szum 85%": [60,40, ()=>los()<0.85],
  "pierścień (dziura)": [30,30, (x,y)=>{const r=Math.hypot(x-15,y-15); return r<12&&r>6;}],
  "dziura rogiem przy brzegu": [6,6, (x,y)=>!((x===2&&y===2)||(x===3&&y===3)) && x>0&&y>0&&x<5&&y<5],
  "linie 1 px": [30,20, (x,y)=>y%3===0 || x%5===0],
  "przy krawędziach": [15,10, (x,y)=>x===0||y===0||x===14||y===9||(x===7&&y===5)],
  "Bayer 4×4 50%": [32,32, (x,y)=>[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]][y%4][x%4] < 8],
};

let bledy = 0;
console.log("--- kontur dokładny: czy pokrywa dokładnie maskę (evenodd, środek każdego piksela) ---");
for(const [nazwa, [w,h,f]] of Object.entries(przypadki)){
  const m = maska(w,h,f), petle = sledzKontury(m,w,h);
  const d = petle.map(sciezkaDokladna).join("");
  const wp = wielokaty(d);
  let zle = 0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) if(wewnatrz(wp, x+0.5, y+0.5) !== !!m[y*w+x]) zle++;
  const pikseli = m.reduce((a,b)=>a+b,0);
  const pole = wp.reduce((a,p)=>a+poleZnak(p),0);
  if(zle || Math.abs(pole-pikseli)>1e-9) bledy++;
  console.log("  "+nazwa.padEnd(28), (zle?zle+" ZŁYCH PIKSELI":"zgodny").padEnd(16), "pętli "+String(petle.length).padStart(4), " pole "+pole+" = pikseli "+pikseli);
}
const sz = przypadki["szachownica"]; const msz = maska(sz[0],sz[1],sz[2]);
const petleSz = sledzKontury(msz,sz[0],sz[1]).length, pikSz = msz.reduce((a,b)=>a+b,0);
console.log("  szachownica: pętli "+petleSz+" na "+pikSz+" pikseli → "+(petleSz===pikSz?"każda kropka osobno (4-spójność)":"POŁĄCZONE"));
if(petleSz!==pikSz) bledy++;

console.log("\n--- wygładzenie: zmiana pola względem pikseli (ton) ---");
for(const nazwa of ["jeden piksel","szum 15%","szum 50%","szum 85%","Bayer 4×4 50%","pierścień (dziura)","linie 1 px","pełny"]){
  const [w,h,f] = przypadki[nazwa]; z = 7;
  const m = maska(w,h,f), petle = sledzKontury(m,w,h), pikseli = m.reduce((a,b)=>a+b,0);
  const wiersz = [2,4,6,10].map(s=>{
    const pole = wielokaty(petle.map(p=>sciezkaGladka(p,s)).join("")).reduce((a,p)=>a+poleZnak(p),0);
    return "wygł. "+s+": "+((pole/pikseli-1)*100).toFixed(1).padStart(6)+"%";
  });
  console.log("  "+nazwa.padEnd(22), wiersz.join("   "));
}
console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
