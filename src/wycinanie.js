/* Usuwanie tła po kolorze. Czysty moduł, bez DOM-u — testowany w Node
   (testy/wycinanie.mjs).

   Tło to piksele o kolorze bliskim wskazanemu: odległość w Oklab (tak, jak
   różnicę widzi oko), poniżej tolerancji — przezroczyste, w paśmie
   miękkości — półprzezroczyste, dalej — nietknięte. Z „tylko połączone
   z brzegami" przezroczyste jest wyłącznie tło, do którego da się dojść od
   krawędzi zdjęcia przez podobne kolory — biała koszula na białym tle
   zostaje, jeśli nie styka się z brzegiem.

   Wynik: maska krycia 0–255 dla każdego piksela. Wariant automatyczny
   (sieć neuronowa) wymagałby pobrania modelu z sieci — na liście „Co dalej",
   do decyzji. */
import { oklab } from "./palettes.js";

/* kolor tła zgadywany z brzegów: najczęstszy (w kubełkach po 8 poziomów)
   kolor ramki szerokiej na 2% boku, uśredniony w obrębie kubełka */
export function kolorZBrzegow(p, w, h){
  const ramka = Math.max(1, Math.round(Math.min(w, h)*0.02)), kub = new Map();
  for(let y=0; y<h; y++) for(let x=0; x<w; x++){
    if(x >= ramka && x < w - ramka && y >= ramka && y < h - ramka) continue;
    const o = (y*w + x)*4, k = (p[o] >> 3) << 10 | (p[o+1] >> 3) << 5 | (p[o+2] >> 3);
    const v = kub.get(k) || [0, 0, 0, 0];
    v[0] += p[o]; v[1] += p[o+1]; v[2] += p[o+2]; v[3]++;
    kub.set(k, v);
  }
  let naj = null;
  for(const v of kub.values()) if(!naj || v[3] > naj[3]) naj = v;
  return naj ? [Math.round(naj[0]/naj[3]), Math.round(naj[1]/naj[3]), Math.round(naj[2]/naj[3])] : [255, 255, 255];
}

/* tolerancja i miękkość 0–100 → odległość w Oklab (0,35 to już bardzo dużo) */
export function maska(p, w, h, {kolor, tolerancja = 30, miekkosc = 10, spojne = true}){
  const n = w*h, L = oklab(...kolor), odl = new Float32Array(n);
  /* kolory powtarzają się często (tło) — pamięć ostatniego przeliczenia oszczędza pierwiastki */
  let ostatni = -1, ostatniaOdl = 0;
  for(let i=0, o=0; i<n; i++, o+=4){
    const k = (p[o] << 16) | (p[o+1] << 8) | p[o+2];
    if(k !== ostatni){
      const c = oklab(p[o], p[o+1], p[o+2]);
      ostatniaOdl = Math.hypot(c[0] - L[0], c[1] - L[1], c[2] - L[2]);
      ostatni = k;
    }
    odl[i] = ostatniaOdl;
  }
  const prog = tolerancja/100*0.35, pas = Math.max(1e-4, miekkosc/100*0.2);
  const alfa = new Uint8Array(n).fill(255);
  const tlo = i => odl[i] < prog + pas;
  const ustaw = i => { alfa[i] = odl[i] <= prog ? 0 : Math.round((odl[i] - prog)/pas*255); };
  if(!spojne){ for(let i=0; i<n; i++) if(tlo(i)) ustaw(i); return alfa; }
  /* wypełnianie od brzegów (4-sąsiedztwo), kolejką na tablicy — bez rekurencji */
  const byl = new Uint8Array(n), kolejka = new Int32Array(n);
  let g = 0, d = 0;
  const wrzuc = i => { if(!byl[i] && tlo(i)){ byl[i] = 1; kolejka[d++] = i; } };
  for(let x=0; x<w; x++){ wrzuc(x); wrzuc((h - 1)*w + x); }
  for(let y=0; y<h; y++){ wrzuc(y*w); wrzuc(y*w + w - 1); }
  while(g < d){
    const i = kolejka[g++], x = i % w;
    ustaw(i);
    if(x > 0) wrzuc(i - 1);
    if(x < w - 1) wrzuc(i + 1);
    if(i >= w) wrzuc(i - w);
    if(i < n - w) wrzuc(i + w);
  }
  return alfa;
}
