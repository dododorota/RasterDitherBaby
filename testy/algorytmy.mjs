/* Algorytmy ditheringu dodane po wzorze Dither Boya: Ostromukhov, Riemersma,
   Stevenson–Arce, niebieski szum i wzory.

   Ostromukhov porównany co do piksela z wynikiem oryginalnego programu autora
   (varcoeffED.c z archiwum varcoeffED.tar, iro.umontreal.ca/~ostrom): w danych
   leży jego obraz wejściowy i wzorcowy wynik 512×512, spakowany po bicie na
   piksel. Program autora powiększa obraz do 512×512 najbliższym sąsiadem
   (floor(x/skala)) — tu robimy to samo.

   Uruchom z katalogu projektu: node testy/algorytmy.mjs */
import { readFileSync } from "node:fs";
import { S, DEFAULTS } from "../src/state.js";
import { ditherPixels } from "../src/dither-core.js";
import { palette, paletaGradientu } from "../src/palettes.js";
import { niebieskiSzum, WZORY } from "../src/kernels.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };
const ustaw = o => { Object.assign(S, DEFAULTS, o); };

console.log("--- Ostromukhov kontra program autora ---");
{
  const b = readFileSync(new URL("dane/ostromoukhov-wejscie.pgm", import.meta.url));
  let o = 0; const pola = [];
  while(pola.length < 4){ while(b[o] === 10 || b[o] === 32) o++; let s = ""; while(!(b[o] === 10 || b[o] === 32)) s += String.fromCharCode(b[o++]); pola.push(s); }
  o++;
  const ww = +pola[1], wh = +pola[2], we = b.subarray(o);
  const wz = readFileSync(new URL("dane/ostromoukhov-wzorzec.bin", import.meta.url));
  const W = 512, H = 512, sx = W/ww, sy = H/wh, p = new Uint8ClampedArray(W*H*4);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const v = we[Math.floor(y/sy)*ww + Math.floor(x/sx)], q = (y*W+x)*4; p[q]=p[q+1]=p[q+2]=v; p[q+3]=255; }
  ustaw({algo: "ostromoukhov", mapa: "jasnosc", pal: "bw", ink: "#000000", paper: "#ffffff", serp: true, str: 1, thr: 0});
  ditherPixels(p, W, H);
  let rozne = 0;
  for(let i=0;i<W*H;i++){ const bial = (wz[i>>3] >> (7 - (i&7))) & 1; if((p[i*4] === 255 ? 1 : 0) !== bial) rozne++; }
  sprawdz(rozne === 0, `${ww}×${wh} → 512×512, pikseli innych niż u autora: ${rozne}`);
}

function obraz(w, h, f){
  const p = new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const o=(y*w+x)*4, c=f(x,y); p[o]=c[0]; p[o+1]=c[1]; p[o+2]=c[2]; p[o+3]=255; }
  return p;
}
const gradient = (w, h) => obraz(w, h, (x, y) => [x*255/(w-1), (x*255/(w-1) + y*3) % 256, 255 - x*255/(w-1)]);
const szary = (w, h, v) => obraz(w, h, () => [v, v, v]);
const NOWE = ["ostromoukhov", "riemersma", "stevenson", "falseFloyd", "fan", "shiauFan", "shiauFan2", "niebieski", "bayer16", "ign", "linieH", "linieV", "ukosne", "krzyze", "kropki8"];

console.log("--- tylko kolory palety, w obu trybach ---");
for(const [pal, mapa] of [["pico8", "kolor"], ["g-zachod", "jasnosc"], ["bw", "jasnosc"], ["quant", "kolor"]]){
  const zle = [];
  for(const algo of NOWE){
    ustaw({algo, pal, mapa});
    const dozw = new Set((mapa === "jasnosc" ? paletaGradientu() : palette()).map(c => c.join()));
    const w = 97, h = 61, p = gradient(w, h);
    ditherPixels(p, w, h);
    for(let i=0;i<p.length;i+=4) if(!dozw.has(p[i]+","+p[i+1]+","+p[i+2])){ zle.push(algo); break; }
  }
  sprawdz(!zle.length, `${pal} / ${mapa}: ${NOWE.length} algorytmów` + (zle.length ? " — obce kolory w: " + zle : ""));
}

console.log("--- średnia jasność zachowana (szarość 25% i 70%, czerń–biel) ---");
for(const algo of NOWE){
  const wyniki = [];
  let ok = true;
  for(const v of [64, 179]){
    ustaw({algo, pal: "bw", mapa: "jasnosc"});
    const w = 128, h = 128, p = szary(w, h, v);
    ditherPixels(p, w, h);
    let b = 0; for(let i=0;i<p.length;i+=4) if(p[i] === 255) b++;
    const u = b/(w*h);
    wyniki.push((u*100).toFixed(1) + "%");
    if(Math.abs(u - v/255) > 0.03) ok = false;
  }
  sprawdz(ok, `${algo}: ${wyniki.join(" / ")} białych (oczekiwane 25,1% / 70,2%)`);
}

console.log("--- Riemersma ---");
{
  /* krzywa Hilberta na kwadracie 2^k: obraz niekwadratowy, nie potęga dwójki — każdy piksel odwiedzony raz */
  ustaw({algo: "riemersma", pal: "bw", mapa: "jasnosc"});
  const w = 301, h = 77, p = obraz(w, h, () => [128, 128, 128]);
  for(let i=3;i<p.length;i+=4) p[i] = 7;          /* znacznik: alfy dithering nie rusza */
  ditherPixels(p, w, h);
  let nietkniete = 0; for(let i=0;i<p.length;i+=4) if(p[i] !== 0 && p[i] !== 255) nietkniete++;
  sprawdz(nietkniete === 0, `${w}×${h}: każdy piksel przeliczony`);
  const a = gradient(80, 50), b = gradient(80, 50);
  ditherPixels(a, 80, 50); ditherPixels(b, 80, 50);
  sprawdz(a.every((v, i) => v === b[i]), "powtarzalność co do bajtu");
}

console.log("--- niebieski szum ---");
{
  const m = niebieskiSzum(), n = 64*64;
  const wart = new Set(m.flat());
  sprawdz(wart.size === n && Math.min(...wart) === 0 && Math.max(...wart) === n - 1, "64×64, każda ranga 0–4095 dokładnie raz");
  sprawdz(niebieskiSzum() === m, "liczony raz, potem z pamięci");
  /* niebieski: najmniej liczne rangi (pierwsze 10%) rozłożone równo — najbliższy
     sąsiad żadnego punktu nie leży tuż obok, w przeciwieństwie do białego szumu */
  const punkty = [];
  for(let y=0;y<64;y++) for(let x=0;x<64;x++) if(m[y][x] < n/10) punkty.push([x, y]);
  let minOdl = Infinity;
  for(const [x, y] of punkty) for(const [x2, y2] of punkty){
    if(x === x2 && y === y2) continue;
    const dx = Math.min(Math.abs(x - x2), 64 - Math.abs(x - x2)), dy = Math.min(Math.abs(y - y2), 64 - Math.abs(y - y2));
    minOdl = Math.min(minOdl, Math.hypot(dx, dy));
  }
  sprawdz(minOdl >= 2, `10% najjaśniejszych progów: najbliższe dwa punkty w odległości ${minOdl.toFixed(2)} (≥ 2, bez zlepków)`);
}

console.log("--- wzory ---");
{
  /* na jednolitej szarości linie poziome zmieniają się w pionie, a nie w poziomie */
  const zmiany = (algo) => {
    ustaw({algo, pal: "bw", mapa: "jasnosc"});
    const w = 64, h = 64, p = szary(w, h, 140);
    ditherPixels(p, w, h);
    let poziom = 0, pion = 0;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const v = p[(y*w+x)*4];
      if(x+1 < w && p[(y*w+x+1)*4] !== v) poziom++;
      if(y+1 < h && p[((y+1)*w+x)*4] !== v) pion++;
    }
    return [poziom, pion];
  };
  const [h1, v1] = zmiany("linieH"), [h2, v2] = zmiany("linieV");
  sprawdz(v1 > h1*2, `linie poziome: zmian w pionie ${v1}, w poziomie ${h1}`);
  sprawdz(h2 > v2*2, `linie pionowe: zmian w poziomie ${h2}, w pionie ${v2}`);
  for(const [nazwa, m] of Object.entries(WZORY)){
    const f = m.flat();
    sprawdz(new Set(f).size === 64 && Math.min(...f) === 0 && Math.max(...f) === 63, `${nazwa}: 64 różne progi 0–63`);
  }
}

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
