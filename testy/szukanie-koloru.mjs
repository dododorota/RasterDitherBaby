/* Siatka kubełków kontra pełny skan nearest(): ten sam indeks na paletach losowych i złośliwych.
   Uruchom z katalogu projektu: node testy/szukanie-koloru.mjs */
import { S } from "../src/state.js";
import { nearest, quantizer } from "../src/palettes.js";

let ziarno = 987654321;
const los = () => (ziarno = (ziarno*1664525 + 1013904223) >>> 0) / 4294967296;
const rgb = () => [Math.floor(los()*256), Math.floor(los()*256), Math.floor(los()*256)];
function unikalne(k){ const s=new Set(), o=[]; for(const c of k){ const x=c.join(); if(!s.has(x)){ s.add(x); o.push(c);} } return o; }

const palety = [];
for(const n of [24,25,32,48,64,100,128,200,256]) palety.push(["losowa "+n, unikalne(Array.from({length:n}, rgb))]);
palety.push(["szarości 256", Array.from({length:256},(_,i)=>[i,i,i])]);
palety.push(["szarości 64", unikalne(Array.from({length:64},(_,i)=>{const v=Math.round(i*255/63); return [v,v,v];}))]);
const tenSamY=[]; for(let r=0;r<256;r+=5){ const g=Math.round((128-0.299*r-0.114*64)/0.587); if(g>=0&&g<=255) tenSamY.push([r,g,64]); }
palety.push(["jedna luminancja", unikalne(tenSamY)]);
const siatka=[]; for(const r of [0,64,128,192,255]) for(const g of [0,128,255]) for(const b of [0,85,170,255]) siatka.push([r,g,b]);
palety.push(["siatka 60 (remisy)", siatka]);
// kolory dokładnie na granicach kubełków (wielokrotności 16) — tu najłatwiej o pomyłkę
const granice=[]; for(let r=0;r<256;r+=48) for(let g=0;g<256;g+=80) for(let b=0;b<256;b+=64) granice.push([r,g,b]);
palety.push(["na granicach kubełków", unikalne(granice)]);
// ciasno upakowane w jednym kubełku
palety.push(["ciasno w jednym rogu", unikalne(Array.from({length:40},()=>[100+Math.floor(los()*14),100+Math.floor(los()*14),100+Math.floor(los()*14)]))]);

const wejscia = [];
for(let i=0;i<40000;i++) wejscia.push([los()*500-120, los()*500-120, los()*500-120]);
for(let i=0;i<30000;i++) wejscia.push([los()*256, los()*256, los()*256]);
for(let i=0;i<20000;i++) wejscia.push(rgb());
for(let v=-50; v<=300; v+=0.5) wejscia.push([v,v,v]);
for(let a=0;a<256;a+=16) for(let b=0;b<256;b+=16) for(let c=0;c<256;c+=16){ wejscia.push([a,b,c]); wejscia.push([a-1e-9,b,c+15.999999]); }
wejscia.push([255.99999,0,0],[0,255.9999999,255.9999],[256,0,0],[-0,0,0],[NaN,0,0]);

let bledy=0, razem=0;
for(const [nazwa, pal] of palety){
  S.pal="custom"; S.custom={nazwa, kolory:pal};
  const q = quantizer();
  if(!q){ console.log(nazwa.padEnd(24), "quantizer null (za mała)"); continue; }
  let zle=0, przyklad=null;
  for(const [r,g,b] of wejscia){
    const a = nearest(pal,r,g,b), c = q(r,g,b);
    if(a!==c){ zle++; if(!przyklad) przyklad={wej:[r,g,b], skan:a, siatka:c}; }
  }
  razem += wejscia.length; bledy += zle;
  console.log(nazwa.padEnd(24), String(pal.length).padStart(4), "kol.", zle ? zle+" ROZBIEŻNOŚCI "+JSON.stringify(przyklad) : "identyczny indeks");
}
S.custom={nazwa:"mala", kolory:unikalne(Array.from({length:16},rgb))};
console.log("\n16 kolorów:", quantizer()===null ? "null → zwykły skan (dobrze)" : "SIATKA (źle)");
console.log("porównań:", razem.toLocaleString("pl-PL"), "  rozbieżności:", bledy);
process.exitCode = bledy ? 1 : 0;
