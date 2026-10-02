/* Koder GIF: plik jest czytany z powrotem niezależnym dekoderem (napisanym tu
   od zera, wprost ze specyfikacji GIF89a) i porównywany piksel w piksel
   z wejściem. Sprawdza też opóźnienia i kwantyzację klatek z ponad 256 kolorami.
   To, że przeglądarka czyta te pliki tak samo, sprawdza testy/przegladarka.mjs.
   Uruchom z katalogu projektu: node testy/gif.mjs */
import { Gif, opoznieniaGif, indeksuj } from "../src/gif.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };

/* generator powtarzalny, na Math.imul (patrz CLAUDE.md) */
const los = s => () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;

/* ---------- dekoder ---------- */
function dekodujLZW(dane, minKod, ile){
  const wyn = new Uint8Array(ile);
  let poz = 0, bit = 0;
  const czytaj = n => { let v = 0; for(let i=0;i<n;i++,bit++) v |= ((dane[bit>>3] >> (bit&7)) & 1) << i; return v; };
  const czysc = 1 << minKod, koniec = czysc + 1;
  let rozmiar, nast, tab, poprz;
  const reset = () => { rozmiar = minKod+1; nast = koniec+1; poprz = -1;
    tab = []; for(let i=0;i<czysc;i++) tab[i] = [i]; };
  reset();
  while(bit + rozmiar <= dane.length*8){
    const k = czytaj(rozmiar);
    if(k === czysc){ reset(); continue; }
    if(k === koniec) break;
    let wpis;
    if(poprz < 0){ wpis = tab[k]; }
    else {
      if(k < nast) wpis = tab[k];
      else if(k === nast) wpis = tab[poprz].concat(tab[poprz][0]);
      else throw new Error("kod spoza słownika: " + k + " przy " + nast);
      if(nast < 4096){ tab[nast++] = tab[poprz].concat(wpis[0]); }
    }
    for(const v of wpis) wyn[poz++] = v;
    poprz = k;
    if(nast === (1 << rozmiar) && rozmiar < 12) rozmiar++;
  }
  if(poz !== ile) throw new Error("zdekodowano " + poz + " zamiast " + ile + " pikseli");
  return wyn;
}
function dekodujGif(b){
  const tekst = (o, n) => String.fromCharCode(...b.subarray(o, o+n));
  if(tekst(0, 6) !== "GIF89a") throw new Error("brak nagłówka GIF89a");
  const w = b[6] | b[7]<<8, h = b[8] | b[9]<<8;
  let o = 13;
  if(b[10] & 0x80) o += 3 << ((b[10] & 7) + 1);
  const klatki = []; let petla = false, opoz = 0;
  while(o < b.length){
    const t = b[o++];
    if(t === 0x3B) return {w, h, klatki, petla, koniec: o === b.length};
    if(t === 0x21){
      const etyk = b[o++];
      if(etyk === 0xF9) opoz = b[o+2] | b[o+3]<<8;
      if(etyk === 0xFF && tekst(o+1, 11) === "NETSCAPE2.0") petla = true;
      while(b[o]) o += b[o] + 1;
      o++;
      continue;
    }
    if(t !== 0x2C) throw new Error("nieznany blok 0x" + t.toString(16) + " w " + (o-1));
    const fw = b[o+4] | b[o+5]<<8, fh = b[o+6] | b[o+7]<<8, flagi = b[o+8];
    o += 9;
    if(!(flagi & 0x80)) throw new Error("klatka bez lokalnej tablicy kolorów");
    const n = 2 << (flagi & 7), pal = b.subarray(o, o + 3*n); o += 3*n;
    const minKod = b[o++], czesci = [];
    while(b[o]){ czesci.push(b.subarray(o+1, o+1+b[o])); o += b[o] + 1; }
    o++;
    const dane = new Uint8Array(czesci.reduce((s, c) => s + c.length, 0));
    let p = 0; for(const c of czesci){ dane.set(c, p); p += c.length; }
    const ind = dekodujLZW(dane, minKod, fw*fh);
    const rgba = new Uint8Array(fw*fh*4);
    for(let i=0;i<ind.length;i++){ rgba[i*4] = pal[ind[i]*3]; rgba[i*4+1] = pal[ind[i]*3+1]; rgba[i*4+2] = pal[ind[i]*3+2]; rgba[i*4+3] = 255; }
    klatki.push({w: fw, h: fh, rgba, opoz, kolorow: n});
  }
  throw new Error("plik urwany przed znacznikiem końca");
}

/* ---------- obrazy testowe ---------- */
function obraz(w, h, paleta, r){
  const p = new Uint8ClampedArray(w*h*4);
  for(let i=0;i<w*h;i++){ const c = paleta[Math.floor(r()*paleta.length)]; p.set([c[0], c[1], c[2], 255], i*4); }
  return p;
}
const paleta = (n, r) => Array.from({length: n}, () => [r()*256|0, r()*256|0, r()*256|0]);
const zgodne = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

console.log("--- zapis i odczyt co do piksela ---");
const przypadki = [
  ["1×1, jeden kolor", 1, 1, 1],
  ["2 kolory, szum 300×200", 300, 200, 2],
  ["3 kolory (tablica 4)", 97, 61, 3],
  ["5 kolorów (tablica 8)", 64, 64, 5],
  ["16 kolorów", 211, 157, 16],
  ["256 kolorów, szum — słownik pełny wiele razy", 512, 384, 256],
  ["129 kolorów", 150, 150, 129],
];
for(const [opis, w, h, ile] of przypadki){
  const r = los(w*7919 + ile);
  const pal = ile === 1 ? [[12, 34, 56]] : paleta(ile, r);
  const gif = new Gif(w, h);
  const wej = [obraz(w, h, pal, r), obraz(w, h, pal, r)];
  for(const p of wej) gif.dodaj(p, 7);
  try{
    const d = dekodujGif(new Uint8Array(await gif.blob().arrayBuffer()));
    const ok = d.koniec && d.petla && d.w === w && d.h === h && d.klatki.length === 2 &&
               d.klatki.every((k, i) => k.opoz === 7 && zgodne(k.rgba, wej[i]));
    sprawdz(ok && gif.kwantyzowane === 0, opis);
  } catch(e){ sprawdz(false, opis + ": " + e.message); }
}

/* jednolite płaszczyzny: długie ciągi, kody rosną szybko do 12 bitów */
{
  const w = 640, h = 480, p = new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const v = ((x>>5) + (y>>5)) & 1 ? 255 : 0; p.set([v, v, v, 255], (y*w+x)*4); }
  const gif = new Gif(w, h); gif.dodaj(p, 4);
  const b = new Uint8Array(await gif.blob().arrayBuffer());
  const d = dekodujGif(b);
  sprawdz(zgodne(d.klatki[0].rgba, p), "szachownica 640×480 w dużych polach, " + b.length + " B");
}

console.log("--- ponad 256 kolorów: kwantyzacja ---");
{
  const w = 320, h = 240, p = new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i = (y*w+x)*4;
    /* papier z gradientem i półtony na brzegach punktów — jak raster drukarski */
    if((x*x + y*y) % 97 < 40) p.set([255, 250, 240, 255], i);
    else p.set([x*255/w, y*255/h, (x+y)*127/(w+h), 255], i);
  }
  const gif = new Gif(w, h); gif.dodaj(p, 4); gif.dodaj(p, 4);
  const d = dekodujGif(new Uint8Array(await gif.blob().arrayBuffer()));
  const k = d.klatki[0];
  let blad = 0, maks = 0;
  for(let i=0;i<w*h*4;i+=4) for(let c=0;c<3;c++){ const e = Math.abs(k.rgba[i+c] - p[i+c]); blad += e; maks = Math.max(maks, e); }
  blad /= w*h*3;
  sprawdz(gif.kwantyzowane === 2, "obie klatki policzone jako kwantyzowane");
  sprawdz(k.kolorow <= 256, "tablica kolorów: " + k.kolorow);
  sprawdz(blad < 4, "średni błąd kanału " + blad.toFixed(2) + " (maks. " + maks + ")");
  let papier = true;
  for(let i=0;i<w*h*4;i+=4) if(p[i] === 255 && p[i+1] === 250 && p[i+2] === 240 && !(k.rgba[i] === 255 && k.rgba[i+1] === 250 && k.rgba[i+2] === 240)) papier = false;
  sprawdz(papier, "kolor papieru zostaje dokładnie kolorem papieru");
  sprawdz(zgodne(d.klatki[0].rgba, d.klatki[1].rgba), "ta sama klatka daje ten sam wynik (powtarzalność)");
  const a = indeksuj(p, w*h), b = indeksuj(p, w*h);
  sprawdz(zgodne(a.indeksy, b.indeksy) && zgodne(a.paleta, b.paleta), "indeksowanie powtarzalne");
}

console.log("--- opóźnienia ---");
const sek = o => o.reduce((s, v) => s + v, 0);
const o30 = opoznieniaGif(Array(30).fill(1/30));
sprawdz(sek(o30) === 100 && o30.every(v => v === 3 || v === 4), "30 kl/s: " + o30.slice(0, 6).join(",") + "… = " + sek(o30) + " setnych");
const o2997 = opoznieniaGif(Array(2997).fill(1001/30000));
sprawdz(sek(o2997) === 10000, "29,97 kl/s przez 100 s: " + sek(o2997) + " setnych");
const o60 = opoznieniaGif(Array(60).fill(1/60));
sprawdz(o60.every(v => v >= 2), "60 kl/s: żadne opóźnienie poniżej 2 setnych (" + sek(o60) + " setnych — film zwalnia)");
sprawdz(JSON.stringify(opoznieniaGif([0.1, 0.07, 0.5])) === "[10,7,50]", "długości z GIF-a przechodzą bez zmian");

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
