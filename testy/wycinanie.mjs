/* Usuwanie tła po kolorze: maska, tolerancja, miękkość, „tylko połączone
   z brzegami", kolor z brzegów. Uruchom: node testy/wycinanie.mjs */
import { maska, kolorZBrzegow } from "../src/wycinanie.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };
/* zdjęcie produktowe: jasnoszare tło z lekkim gradientem, czerwone koło,
   a w środku koła biała plama (jak koszula) — tego samego koloru co tło */
const w = 120, h = 90, p = new Uint8ClampedArray(w*h*4);
for(let y=0;y<h;y++) for(let x=0;x<w;x++){
  const o = (y*w+x)*4, d = Math.hypot(x - 60, y - 45);
  let c = [232 + (x % 7) - 3, 232 + (y % 5) - 2, 230];
  if(d < 32){ const t = Math.min(1, Math.max(0, 31 - d)); c = c.map((v, j) => Math.round(v + ([200, 40, 40][j] - v)*t)); }   /* wygładzona krawędź jak w zdjęciu */
  if(d < 8) c = [233, 232, 230];
  p[o] = c[0]; p[o+1] = c[1]; p[o+2] = c[2]; p[o+3] = 255;
}
const at = (a, x, y) => a[y*w + x];

const k = kolorZBrzegow(p, w, h);
sprawdz(Math.abs(k[0] - 232) <= 3 && Math.abs(k[2] - 230) <= 2, "kolor z brzegów: tło " + k.join(","));
const m = maska(p, w, h, {kolor: k, tolerancja: 25, miekkosc: 5, spojne: true});
sprawdz(at(m, 2, 2) === 0 && at(m, 110, 80) === 0, "tło przezroczyste");
sprawdz(at(m, 60, 25) === 255, "czerwone koło zostaje");
sprawdz(at(m, 60, 45) === 255, "biała plama w środku koła zostaje — nie styka się z brzegiem");
const m2 = maska(p, w, h, {kolor: k, tolerancja: 25, miekkosc: 5, spojne: false});
sprawdz(at(m2, 60, 45) === 0, "bez „tylko połączone”: biała plama też znika");
const m3 = maska(p, w, h, {kolor: k, tolerancja: 1, miekkosc: 0, spojne: true});
let zostalo = 0; for(let i=0;i<w*h;i++) if(m3[i] === 255) zostalo++;
sprawdz(zostalo > w*h*0.5, `tolerancja 1: tło z drobnymi różnicami w większości zostaje (${(zostalo/(w*h)*100).toFixed(0)}% nietknięte)`);
const m4 = maska(p, w, h, {kolor: [200, 40, 40], tolerancja: 20, miekkosc: 30, spojne: false});
let pol = 0; for(let i=0;i<w*h;i++) if(m4[i] > 0 && m4[i] < 255) pol++;
sprawdz(at(m4, 60, 25) === 0 && at(m4, 2, 2) === 255 && at(m4, 110, 80) === 255, "kolor czerwony: znika koło, tło nietknięte (daleko w Oklab)");
const a = maska(p, w, h, {kolor: k, tolerancja: 25, miekkosc: 40, spojne: true});
let miek = 0; for(let i=0;i<w*h;i++) if(a[i] > 0 && a[i] < 255) miek++;
sprawdz(miek > 0, `miękkość: ${miek} pikseli półprzezroczystych na przejściu`);

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
