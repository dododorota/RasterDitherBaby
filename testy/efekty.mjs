/* Efekty po rastrze: sortowanie kontra naiwna referencja, skala z×z co do bajtu, przesunięcie RGB, poświata.
   Uruchom z katalogu projektu: node testy/efekty.mjs */
import { S, DEFAULTS } from "../src/state.js";
import { permutacjaSortu, zastosujPermutacje, przesuniecieRGB, przesunRGB, poswiata } from "../src/effects.js";
import { efektyPo } from "../src/stos.js";

let ziarno = 42;
const los = () => (ziarno = (ziarno*1664525 + 1013904223) >>> 0) / 4294967296;
function obraz(w, h, rodzaj){
  const p = new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const o=(y*w+x)*4;
    if(rodzaj==="gradient"){ p[o]=(x*255/w)|0; p[o+1]=(y*255/h)|0; p[o+2]=((x+y)*3)&255; }
    else if(rodzaj==="paleta"){ const k=[[0,0,0],[29,43,83],[255,0,77],[255,241,232]][(los()*4)|0]; p[o]=k[0];p[o+1]=k[1];p[o+2]=k[2]; }
    else { p[o]=(los()*256)|0; p[o+1]=(los()*256)|0; p[o+2]=(los()*256)|0; }
    p[o+3]=255;
  }
  return p;
}
const jas = (p,o) => ((p[o]*299 + p[o+1]*587 + p[o+2]*114 + 500)/1000)|0;

// referencja: to samo sortowanie przedziałowe, napisane naiwnie
function refSort(p, w, h){
  const q = new Uint8ClampedArray(p);
  const lo=Math.round(Math.min(S.sortOd,S.sortDo)*2.55), hi=Math.round(Math.max(S.sortOd,S.sortDo)*2.55);
  const pion=S.sort==="pionowo", dl=pion?h:w, lin=pion?w:h;
  for(let l=0;l<lin;l++){
    const idx=[...Array(dl)].map((_,t)=> pion ? t*w+l : l*w+t);
    let t=0;
    while(t<dl){
      const k=jas(p,idx[t]*4);
      if(k<lo||k>hi){ t++; continue; }
      let e=t+1; while(e<dl){ const kk=jas(p,idx[e]*4); if(kk<lo||kk>hi) break; e++; }
      const odc = idx.slice(t,e).map((i,j)=>({i, k:jas(p,i*4), j})).sort((a,b)=>a.k-b.k || a.j-b.j);
      for(let j=0;j<odc.length;j++){ const d=idx[t+j]*4, s=odc[j].i*4; q[d]=p[s]; q[d+1]=p[s+1]; q[d+2]=p[s+2]; q[d+3]=p[s+3]; }
      t=e;
    }
  }
  return q;
}
function powieksz(p, w, h, z){
  const q = new Uint8ClampedArray(w*z*h*z*4);
  for(let y=0;y<h*z;y++) for(let x=0;x<w*z;x++){ const s=(((y/z)|0)*w + ((x/z)|0))*4, d=(y*w*z+x)*4; q[d]=p[s];q[d+1]=p[s+1];q[d+2]=p[s+2];q[d+3]=p[s+3]; }
  return q;
}
const rowne = (a,b) => { if(a.length!==b.length) return false; for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return false; return true; };

let bledy = 0, n = 0;
console.log("--- sortowanie kontra naiwna referencja ---");
for(const rodzaj of ["gradient","szum","paleta"])
 for(const kier of ["poziomo","pionowo"])
  for(const [od,do_] of [[0,100],[25,80],[60,30],[40,41],[0,0]])
   for(const [w,h] of [[97,61],[300,7],[5,200]]){
     Object.assign(S, DEFAULTS, {sort:kier, sortOd:od, sortDo:do_});
     const p = obraz(w,h,rodzaj);
     const ref = refSort(p,w,h);
     const q = new Uint8ClampedArray(p);
     const perm = permutacjaSortu(q,w,h);
     if(perm) zastosujPermutacje(q, perm, w, h, 1);
     n++; if(!rowne(q,ref)){ bledy++; console.log("  ROZBIEŻNOŚĆ", rodzaj, kier, od, do_, w+"x"+h); }
   }
console.log(`  ${n} przypadków, rozbieżności: ${bledy}`);

console.log("--- skala: sortowanie na podglądzie przeniesione blokami == powiększony wynik ---");
let b2=0, n2=0;
for(const kier of ["poziomo","pionowo"]) for(const z of [2,3,4,6]){
  Object.assign(S, DEFAULTS, {sort:kier, sortOd:15, sortDo:85});
  const w=83, h=47, p=obraz(w,h,"gradient");
  const podglad = new Uint8ClampedArray(p);
  const perm = permutacjaSortu(podglad, w, h);
  zastosujPermutacje(podglad, perm, w, h, 1);
  const duzy = powieksz(p, w, h, z);
  zastosujPermutacje(duzy, perm, w, h, z);
  n2++; if(!rowne(duzy, powieksz(podglad,w,h,z))){ b2++; console.log("  ROZBIEŻNOŚĆ", kier, "z="+z); }
}
console.log(`  ${n2} przypadków, rozbieżności: ${b2}`);

console.log("--- skala: przesunięcie RGB ---");
let b3=0, n3=0;
for(const [amt,kat] of [[5,0],[7,90],[12,37],[3,180],[20,135],[1,45]]) for(const z of [1,2,4,5]){
  Object.assign(S, DEFAULTS, {rgb:amt, rgbKat:kat});
  const w=64, h=40, p=obraz(w,h,"szum");
  const [dx,dy] = przesuniecieRGB(1);
  const maly = new Uint8ClampedArray(p); przesunRGB(maly, w, h, dx, dy);
  const duzy = powieksz(p,w,h,z); przesunRGB(duzy, w*z, h*z, dx*z, dy*z);
  n3++; if(!rowne(duzy, powieksz(maly,w,h,z))){ b3++; console.log("  ROZBIEŻNOŚĆ", amt, kat, "z="+z); }
}
// zielony nietknięty, czerwony i niebieski w przeciwne strony
Object.assign(S, DEFAULTS, {rgb:4, rgbKat:0});
const p = obraz(20,1,"szum"), q = new Uint8ClampedArray(p); przesunRGB(q,20,1,4,0);
const zielonyOk = [...Array(20)].every((_,x)=>q[x*4+1]===p[x*4+1]);
const czerwonyOk = q[10*4]===p[6*4], niebieskiOk = q[10*4+2]===p[14*4+2];
if(!(zielonyOk&&czerwonyOk&&niebieskiOk)) b3++;
console.log(`  ${n3} przypadków skali, rozbieżności: ${b3}; zielony nietknięty ${zielonyOk}, czerwony +dx ${czerwonyOk}, niebieski −dx ${niebieskiOk}`);

// sortowanie nie tworzy nowych kolorów — ważne dla ditheringu z paletą
Object.assign(S, DEFAULTS, {sort:"poziomo", sortOd:0, sortDo:100});
const pal = obraz(120,80,"paleta"), dozw = new Set(); for(let i=0;i<pal.length;i+=4) dozw.add(pal[i]+","+pal[i+1]+","+pal[i+2]);
const ps = new Uint8ClampedArray(pal); zastosujPermutacje(ps, permutacjaSortu(ps,120,80), 120, 80, 1);
let obce=0; for(let i=0;i<ps.length;i+=4) if(!dozw.has(ps[i]+","+ps[i+1]+","+ps[i+2])) obce++;
console.log("--- sortowanie obrazu z palety: kolorów spoza palety po sortowaniu:", obce);

// wyłączone efekty nic nie robią
Object.assign(S, DEFAULTS);
console.log("--- wyłączone: permutacja", permutacjaSortu(obraz(10,10,"szum"),10,10), "· przesunięcie", przesuniecieRGB(1));

console.log("--- poświata ---");
let b4 = 0;
const spr = (ok, opis) => { console.log((ok ? "  ok    " : "  ŹLE   ") + opis); if(!ok) b4++; };
/* czarne tło z jedną jasną niebieską kropką 3×3 */
function kropka(w, h){
  const p = new Uint8ClampedArray(w*h*4);
  for(let i=3;i<p.length;i+=4) p[i]=255;
  for(let y=29;y<32;y++) for(let x=29;x<32;x++){ const o=(y*w+x)*4; p[o]=80; p[o+1]=160; p[o+2]=255; }
  return p;
}
Object.assign(S, DEFAULTS);
spr(!efektyPo(), "siła 0 = efekty wyłączone");
{
  const p = obraz(40, 30, "szum"), q = new Uint8ClampedArray(p);
  Object.assign(S, DEFAULTS, {glow: 100, glowProg: 95});
  const ciemny = new Uint8ClampedArray(p.length); for(let i=0;i<p.length;i+=4){ ciemny[i]=p[i]>>2; ciemny[i+1]=p[i+1]>>2; ciemny[i+2]=p[i+2]>>2; ciemny[i+3]=255; }
  const c2 = new Uint8ClampedArray(ciemny); poswiata(c2, 40, 30, 1);
  spr(rowne(c2, ciemny), "obraz ciemniejszy od progu zostaje nietknięty");
  Object.assign(S, DEFAULTS, {glow: 150, glowR: 10, glowProg: 30});
  poswiata(q, 40, 30, 1);
  let ciemniej = 0; for(let i=0;i<p.length;i++) if(q[i] < p[i]) ciemniej++;
  spr(ciemniej === 0, "screen tylko rozjaśnia — żaden kanał nie ciemnieje");
}
{
  Object.assign(S, DEFAULTS, {glow: 100, glowR: 12, glowProg: 50});
  const w = 61, h = 61, p = kropka(w, h);
  poswiata(p, w, h, 1);
  const px = (x, y) => [p[(y*w+x)*4], p[(y*w+x)*4+1], p[(y*w+x)*4+2]];
  const obok = px(36, 30), daleko = px(58, 58);
  spr(obok[2] > 0 && obok[2] > obok[0] && daleko[2] < obok[2], `halo w kolorze kropki: obok ${obok}, daleko ${daleko}`);
  const p2 = kropka(w, h); poswiata(p2, w, h, 1);
  spr(rowne(p, p2), "powtarzalność co do bajtu");
  Object.assign(S, {glow: 200});
  const p3 = kropka(w, h); poswiata(p3, w, h, 1);
  spr(p3[(30*w+36)*4+2] > obok[2], "siła 200% świeci mocniej niż 100%");
  /* jednostka: ten sam promień w pikselach obrazu przy pikselizacji 2× to połowa
     pikseli bufora — halo na buforze 2× mniejszym sięga o połowę bliżej */
  Object.assign(S, {glow: 100, glowR: 12});
  const duzy = kropka(w, h); poswiata(duzy, w, h, 1);
  const maly = kropka(w, h); poswiata(maly, w, h, 0.5);
  spr(maly[(30*w+40)*4+2] < duzy[(30*w+40)*4+2], "jednostka 1/pix zmniejsza zasięg na buforze po pikselizacji");
}
console.log("\nBŁĘDÓW RAZEM:", bledy+b2+b3+obce+b4);
process.exitCode = (bledy+b2+b3+obce+b4) ? 1 : 0;
