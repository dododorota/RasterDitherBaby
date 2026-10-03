/* Stabilizacja dyfuzji w czasie: mniej migotania między klatkami, ta sama
   średnia jasność, tylko kolory palety, a przy zerze — wynik co do bajtu jak
   bez stabilizacji. Uruchom: node testy/stabilizacja.mjs */
import { S, DEFAULTS } from "../src/state.js";
import { ditherPixels } from "../src/dither-core.js";
import { palette, paletaGradientu } from "../src/palettes.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };
const w = 120, h = 80;
/* klatka t: ten sam gradient z małym szumem (jak szum matrycy w filmie) */
function klatka(t){
  let s = 1000 + t*7919;
  const los = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const p = new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const o = (y*w+x)*4, v = x*255/(w-1) + (los() - 0.5)*6;
    p[o] = v; p[o+1] = v*0.8 + y; p[o+2] = 255 - v; p[o+3] = 255;
  }
  return p;
}
function film(ust, stabil){
  Object.assign(S, DEFAULTS, ust, {stabil});
  const wyniki = [];
  for(let t=0; t<10; t++){
    S.klatkaNr = t;
    const p = klatka(t);
    ditherPixels(p, w, h, {pamietaj: true, zPamieci: t > 0});
    wyniki.push(p);
  }
  return wyniki;
}
const migotanie = f => {
  let zm = 0;
  for(let t=1; t<f.length; t++) for(let i=0; i<f[t].length; i+=4) if(f[t][i] !== f[t-1][i] || f[t][i+1] !== f[t-1][i+1] || f[t][i+2] !== f[t-1][i+2]) zm++;
  return zm/((f.length - 1)*w*h);
};
const jasnosc = p => { let s = 0; for(let i=0;i<p.length;i+=4) s += p[i]*0.299 + p[i+1]*0.587 + p[i+2]*0.114; return s/(w*h); };

for(const [nazwa, ust] of [["kolor, Floyd, PICO-8", {algo: "floyd", pal: "pico8"}],
                           ["kolor, Atkinson, 1-bit", {algo: "atkinson", pal: "bw"}],
                           ["jasność, Floyd, Ogień", {algo: "floyd", pal: "g-ogien", mapa: "jasnosc"}]]){
  const bez = film(ust, 0), z = film(ust, 70);
  const mb = migotanie(bez), mz = migotanie(z);
  sprawdz(mz < mb*0.5, `${nazwa}: migotanie ${(mb*100).toFixed(1)}% → ${(mz*100).toFixed(1)}% pikseli na klatkę`);
  const dj = Math.abs(jasnosc(z[9]) - jasnosc(bez[9]));
  sprawdz(dj < 3, `${nazwa}: średnia jasność zachowana (różnica ${dj.toFixed(2)})`);
  Object.assign(S, DEFAULTS, ust);
  const dozw = new Set((ust.mapa === "jasnosc" ? paletaGradientu() : palette()).map(c => c.join()));
  let obce = 0; for(const p of z) for(let i=0;i<p.length;i+=4) if(!dozw.has(p[i]+","+p[i+1]+","+p[i+2])) obce++;
  sprawdz(obce === 0, `${nazwa}: tylko kolory palety`);
}
{
  /* stabilizacja 0 = dokładnie jak bez niej; pierwsza klatka bez pamięci = jak bez niej */
  const ust = {algo: "floyd", pal: "pico8"};
  const a = film(ust, 0);
  Object.assign(S, DEFAULTS, ust);
  const b = []; for(let t=0; t<10; t++){ S.klatkaNr = t; const p = klatka(t); ditherPixels(p, w, h); b.push(p); }
  sprawdz(a.every((p, t) => p.every((v, i) => v === b[t][i])), "suwak na zero: co do bajtu jak bez stabilizacji");
  const z = film(ust, 70);
  sprawdz(z[0].every((v, i) => v === b[0][i]), "pierwsza klatka zapisu (bez pamięci) jak bez stabilizacji");
  const z2 = film(ust, 70);
  sprawdz(z.every((p, t) => p.every((v, i) => v === z2[t][i])), "ten sam film dwa razy: identycznie");
  /* przeskok o więcej niż 5 klatek: pamięć nie działa */
  Object.assign(S, DEFAULTS, ust, {stabil: 70, klatkaNr: 30});
  const daleko = klatka(30); ditherPixels(daleko, w, h, {pamietaj: true, zPamieci: true});
  Object.assign(S, DEFAULTS, ust, {klatkaNr: 30});
  const czysta = klatka(30); ditherPixels(czysta, w, h);
  sprawdz(daleko.every((v, i) => v === czysta[i]), "skok o 21 klatek: pamięć ignorowana");
}

{
  /* ruch: jasny kwadrat przesuwa się o 8 px na klatkę — stabilizacja nie może
     zostawiać smug („brudnej szyby"): stare miejsce ciemne, nowe jasne */
  for(const [nazwa, ust] of [["kolor", {algo: "floyd", pal: "gray4"}], ["jasność", {algo: "floyd", pal: "g-ogien", mapa: "jasnosc"}]]){
    Object.assign(S, DEFAULTS, ust, {stabil: 100});
    let ost = null;
    for(let t=0; t<10; t++){
      S.klatkaNr = t;
      const p = new Uint8ClampedArray(w*h*4);
      for(let y=0;y<h;y++) for(let x=0;x<w;x++){
        const o = (y*w+x)*4, v = (x >= 10 + t*8 && x < 30 + t*8 && y >= 30 && y < 50) ? 220 : 30;
        p[o] = p[o+1] = p[o+2] = v; p[o+3] = 255;
      }
      ditherPixels(p, w, h, {pamietaj: true, zPamieci: t > 0});
      ost = p;
    }
    const sr = (x0, x1) => { let s = 0, n = 0; for(let y=32;y<48;y++) for(let x=x0;x<x1;x++){ s += ost[(y*w+x)*4]*0.299 + ost[(y*w+x)*4+1]*0.587 + ost[(y*w+x)*4+2]*0.114; n++; } return s/n; };
    const stare = sr(12, 28), nowe = sr(84, 100);
    sprawdz(nowe > 150 && stare < 60, `${nazwa}, stabilizacja 100%: kwadrat w nowym miejscu jasny (${nowe.toFixed(0)}), w starym bez smugi (${stare.toFixed(0)})`);
  }
}

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
