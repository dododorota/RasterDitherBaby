/* Tryb Glitch (src/glitch.js, src/jpeg-glitch.js) — port wtyczki VFX Glitch.

   Zgodność z wtyczką: odciski (md5 RGB) wyników jej CLI (`vfx glitch`, wersja
   1.3 z 19.10.2026) na obrazie syntetycznym poniżej — apka ma dać dokładnie te
   same bajty. Gdy wtyczka zmieni wygląd, odciski trzeba policzyć od nowa
   (skrypt: wej. PPM jak obrazTestowy(), `vfx glitch wej.ppm wyj.ppm …`, md5
   danych RGB z wyj.ppm).

   Uruchom z katalogu projektu: node testy/glitch.mjs */
import { createHash } from "node:crypto";
import { S, DEFAULTS } from "../src/state.js";
import { PRESETS } from "../src/presets.js";
import { renderGlitch, domyslne, doFloat, doBajtow, zUstawien, glitchPixels } from "../src/glitch.js";
import { encode, decode } from "../src/jpeg-glitch.js";
import { ditherIEfekty } from "../src/dither-core.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };

function obrazTestowy(){
  const w = 200, h = 136, p = new Uint8ClampedArray(w*h*4);
  for(let y=0; y<h; y++) for(let x=0; x<w; x++){
    const o = (y*w + x)*4, d = Math.hypot(x - 90, y - 60);
    p[o] = d < 40 ? 25 : (x*255/w) | 0; p[o+1] = ((x >> 3) + (y >> 3)) & 1 ? 210 : (y*255/h) | 0; p[o+2] = (x*y) % 251; p[o+3] = 255;
  }
  return {w, h, p};
}
const licz = (par, klatka = 0, obr = obrazTestowy()) => { const img = doFloat(obr.p, obr.w, obr.h); renderGlitch(img, par, klatka, 1); doBajtow(img, obr.p); return obr; };
const md5rgb = ({w, h, p}) => { const rgb = new Uint8Array(w*h*3); for(let i=0; i<w*h; i++){ rgb[i*3] = p[i*4]; rgb[i*3+1] = p[i*4+1]; rgb[i*3+2] = p[i*4+2]; } return createHash("md5").update(rgb).digest("hex"); };
const zPresetu = nazwa => zUstawien(Object.assign({}, DEFAULTS, PRESETS.glitch.find(([n]) => n === nazwa)[1]), 200, 136);

console.log("--- zgodność z wtyczką VFX Glitch 1.3 (odciski jej CLI) ---");
{
  const zm = o => { const d = domyslne(); o(d); return d; };
  const PRZYPADKI = [
    ["domyślne (JPEG 30)", "aac24d3791b67211dc8d94a5ecce6787", domyslne()],
    ["6 zepsutych bajtów 30–90%", "9880255cb16b4c727d4597fd90af8589", zm(d => { d.brokenBytes = 6; d.glitchStart = 30; d.glitchEnd = 90; d.bytesSeed = 11; })],
    ["preset Kolory JPEG", "129fd9514b39f9d127d61a4d78fc870a", zPresetu("Kolory JPEG")],
    ["bez odwrotnej DCT", "ffcac3d982db4dfe79d607e475fce06c", zm(d => { d.inverseDct = false; })],
    ["preset Zerwane VHS", "312b0b5aaa386197ee296ef37aacf232", zPresetu("Zerwane VHS")],
    ["preset Datamosh twarzy", "5f289e8a608a8d7f9ac03eafeb3448dd", zPresetu("Datamosh twarzy")],
    ["preset Topnienie", "c622063f628d13375d406aaddf486f42", zPresetu("Topnienie")],
    ["preset Krople", "25bebdd928c1957c29461a207d6d1b55", zPresetu("Krople")],
    ["preset Psychodelia", "a33a86fbffb5955f83295352e61158fc", zPresetu("Psychodelia")],
    ["preset Mapa glitchy", "4b7e613c5d21d6f2608b3059911351f4", zPresetu("Mapa glitchy")],
    ["Tiles 50,20 mapa 4", "f9371915489906efb576c374f779058f", zm(d => { d.jpeg = false; d.tiles = {on: true, offsetX: 50, offsetY: 20, map: 4}; })],
    ["animacja co 3, klatka 8", "689ce17055664c01edfca080075e9d90", zm(d => { d.animate = true; d.animateEvery = 3; d.brokenBytes = 3; d.slices = {on: true, offsetX: 40, offsetY: 10, map: 6}; }), 8]
  ];
  for(const [nazwa, odcisk, par, klatka] of PRZYPADKI) sprawdz(md5rgb(licz(par, klatka)) === odcisk, `${nazwa}: co do bajtu jak wtyczka`);
}

console.log("--- JPEG ---");
{
  /* do jakości gładki obraz — szum z obrazu testowego JPEG i tak rozmywa (kolor co 2×2) */
  const w = 160, h = 96, rgb = new Uint8Array(w*h*3);
  for(let y=0; y<h; y++) for(let x=0; x<w; x++){ const o = (y*w + x)*3; rgb[o] = x*255/w; rgb[o+1] = y*255/h; rgb[o+2] = Math.hypot(x - 80, y - 48) < 30 ? 220 : 60; }
  const blad = q => { const e = encode(rgb, w, h, q), o = new Uint8Array(w*h*3); decode(e.bytes, {}, w, h, o); let s = 0; for(let i=0; i<o.length; i++) s += Math.abs(o[i] - rgb[i]); return {sr: s/o.length, dl: e.bytes.length}; };
  const q95 = blad(95), q30 = blad(30), q5 = blad(5);
  sprawdz(q95.sr < 4 && q30.sr < q5.sr && q95.dl > q30.dl && q30.dl > q5.dl,
          `jakość 95 / 30 / 5: średni błąd ${q95.sr.toFixed(1)} / ${q30.sr.toFixed(1)} / ${q5.sr.toFixed(1)}, plik ${q95.dl} / ${q30.dl} / ${q5.dl} B`);
  const e = encode(rgb, w, h, 30);
  sprawdz(e.bytes[0] === 0xFF && e.bytes[1] === 0xD8 && e.bytes[e.bytes.length - 2] === 0xFF && e.bytes[e.bytes.length - 1] === 0xD9 && e.scanStart < e.scanEnd,
          "plik JFIF: SOI … EOI, dane obrazu w środku");
  sprawdz(!decode(Uint8Array.from([0, 1, 2, 3]), {}, w, h, new Uint8Array(w*h*3)), "nie-JPEG: decode zwraca false");
}

console.log("--- filtry: każdy zmienia obraz, powtarzalnie, bez NaN ---");
{
  const baza = md5rgb(licz(Object.assign(domyslne(), {jpeg: false})));
  const FILTRY = {
    "Glitch Map": d => { d.glitchMap.on = true; }, "Datamosh": d => { d.datamosh = true; d.moshX = -30; }, "Melt": d => { d.meltMap.on = true; },
    "Slices": d => { d.slices.on = true; }, "Bad TV": d => { d.badTv.on = true; }, "Tiles": d => { d.tiles.on = true; },
    "Drips": d => { d.drips = true; }, "Liquid": d => { d.liquid = true; }, "Mirror": d => { d.mirror = true; },
    "RGB": d => { d.rgb = true; d.redPos = [5, 0]; }, "Displacement": d => { d.displacement = true; }, "Stretch": d => { d.stretch = true; },
    "Color Cycle": d => { d.colorCycle = true; }
  };
  for(const [nazwa, zmiana] of Object.entries(FILTRY)){
    const par = Object.assign(domyslne(), {jpeg: false}); zmiana(par);
    const img = doFloat(obrazTestowy().p, 200, 136); renderGlitch(img, par, 0, 1);
    const bezNaN = img.px.every(Number.isFinite);
    const a = md5rgb(licz(par)), b = md5rgb(licz(par));
    sprawdz(bezNaN && a === b && a !== baza, `${nazwa}`);
  }
}

console.log("--- skrajne wartości i małe obrazy ---");
{
  const wszystko = Object.assign(domyslne(), {quality: 1, brokenBytes: 5000, glitchStart: 100, glitchEnd: 0, filter1: true, filter1Value: -20, filter2: true, filter2Value: 20,
    chroma: {single: true, position: 63, value: 255, breakingBytes: 4096, maxRandom: 255, seed: 999999}, luma: {single: true, position: 0, value: 0, breakingBytes: 64, maxRandom: 255, seed: 0},
    glitchMap: {on: true, offsetX: 4000, offsetY: -4000, map: 25}, datamosh: true, moshX: 4000, moshY: -4000, moshScale: 400,
    meltMap: {on: true, offsetX: -4000, offsetY: 4000, map: 10}, slices: {on: true, offsetX: 4000, offsetY: 4000, map: 25}, badTv: {on: true, offsetX: -4000, offsetY: 4000, map: 25},
    tiles: {on: true, offsetX: 4000, offsetY: 4000, map: 25}, drips: true, dripAmount: 100, dripLength: -8000, dripMap: 25, liquid: true, liquidAmount: -2000, liquidScale: 10, liquidMap: 25,
    mirror: true, mirrorVertical: true, mirrorKeepSecond: true, mirrorPos: [-50, 9999], rgb: true, redPos: [-500, 500], greenPos: [9999, 0], bluePos: [0, -9999],
    displacement: true, copies: 500, xSpacing: -2000, ySpacing: 2000, dispPos: [0, 0], stretch: true, stretchVertical: true, stretchInvert: true, stretchPos: [9999, -9999],
    colorCycle: true, cycleR: -20, cycleG: 20, cycleB: 0});
  for(const [w, h] of [[1, 1], [7, 5], [16, 16], [33, 2]]){
    const obr = {w, h, p: new Uint8ClampedArray(w*h*4).map((_, i) => (i*37) & 255)};
    let ok = true;
    try{ for(const par of [domyslne(), wszystko]){ const img = doFloat(obr.p, w, h); renderGlitch(img, par, 3, 1); if(!img.px.every(Number.isFinite)) ok = false; } }
    catch(e){ ok = false; console.log("    ", e.message); }
    sprawdz(ok, `${w}×${h}: domyślne i wszystko na skrajnych wartościach bez błędu i NaN`);
  }
}

console.log("--- animacja i tryb w apce ---");
{
  const par = Object.assign(domyslne(), {animate: true, animateEvery: 3, brokenBytes: 4});
  const k = n => md5rgb(licz(par, n));
  sprawdz(k(0) === k(2) && k(2) !== k(3) && k(3) === k(5), "nowy glitch co 3 klatki (0 = 2, 3 = 5, 2 ≠ 3)");
  const bez = Object.assign(domyslne(), {brokenBytes: 4});
  sprawdz(md5rgb(licz(bez, 0)) === md5rgb(licz(bez, 7)), "bez animacji — każda klatka taka sama");
  /* ditherIEfekty w trybie glitch = korekta + glitchPixels (ta sama droga co worker) */
  Object.assign(S, DEFAULTS, {mode: "glitch", glBajty: 3}); S.klatkaNr = 0;
  const a = obrazTestowy(); ditherIEfekty(a.p, a.w, a.h);
  const b = obrazTestowy(); glitchPixels(b.p, b.w, b.h, S, 0, 1);
  sprawdz(md5rgb(a) === md5rgb(b) && md5rgb(a) !== md5rgb(obrazTestowy()), "tryb glitch w ditherIEfekty = glitchPixels na buforze");
  /* pikselizacja: długości w pikselach obrazu — przy pix 2 przesunięcia w buforze o połowę */
  Object.assign(S, DEFAULTS, {mode: "glitch", glJpeg: false, glRgb: true, glRx: 8});
  const c = obrazTestowy(); glitchPixels(c.p, c.w, c.h, S, 0, 1/2);
  const org = obrazTestowy(), r = (o, x) => o.p[(60*o.w + x)*4];
  sprawdz([0, 1, 2, 3].every(x => r(c, x) === 0) && [4, 20, 100, 150].every(x => r(c, x) === r(org, x - 4)), "RGB 8 px przy pikselizacji 2 — 4 px w buforze");
  Object.assign(S, DEFAULTS); S.mode = "dither";
}

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
