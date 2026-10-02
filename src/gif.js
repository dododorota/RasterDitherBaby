/* Koder animowanego GIF-a bez zależności. Czysty moduł, bez DOM-u — testowany
   w Node (testy/gif.mjs).

   Dithering i GIF pasują do siebie: dithering zostawia zwykle tyle kolorów, ile
   ma paleta, więc klatka mieści się w 256 kolorach i zapisuje się co do piksela.
   Każda klatka dostaje własną tablicę kolorów — paleta może się zmieniać
   w trakcie filmu (przesunięcie RGB, kolor papieru), a lokalna tablica to
   najwyżej 768 bajtów na klatkę.

   Dopiero klatka z ponad 256 kolorami (raster drukarski z wygładzonymi brzegami
   punktów, przesunięcie RGB na kolorowej palecie) idzie przez kwantyzację
   medianą. Bez ditheringu — dithering na ditheringu dałby szum, którego nie ma
   w podglądzie. */

import { kwantyzujDoIndeksow } from "./kwantyzacja.js";

export const MAX_KOLOROW = 256;

/* ---------- paleta klatki ---------- */

/* Zwraca {indeksy, paleta (RGB po kolei), dokladnie}. Najpierw próba dokładna:
   każdy kolor dostaje swój indeks w kolejności pojawienia się. */
export function indeksuj(p, n){
  const mapa = new Map(), paleta = [], ind = new Uint8Array(n);
  let ostatni = -1, ostatniInd = 0;
  for(let i=0, o=0; i<n; i++, o+=4){
    const k = (p[o]<<16) | (p[o+1]<<8) | p[o+2];
    if(k === ostatni){ ind[i] = ostatniInd; continue; }   /* ciągi tego samego koloru są częste */
    let v = mapa.get(k);
    if(v === undefined){
      if(paleta.length === MAX_KOLOROW) return kwantyzuj(p, n);
      v = paleta.length; mapa.set(k, v); paleta.push(k);
    }
    ind[i] = v; ostatni = k; ostatniInd = v;
  }
  const rgb = new Uint8Array(paleta.length*3);
  paleta.forEach((k, i) => { rgb[i*3] = k>>16; rgb[i*3+1] = (k>>8)&255; rgb[i*3+2] = k&255; });
  return {indeksy: ind, paleta: rgb, dokladnie: true};
}

/* Powyżej 256 kolorów: mediana na histogramie (kwantyzacja.js). */
function kwantyzuj(p, n){
  const {indeksy, paleta} = kwantyzujDoIndeksow(p, n, MAX_KOLOROW);
  return {indeksy, paleta, dokladnie: false};
}

/* ---------- LZW ----------
   Słownik jako tablica [prefiks·256 + bajt] z „pokoleniami": wpis jest ważny,
   gdy jego znacznik równa się bieżącemu pokoleniu, więc czyszczenie słownika
   to jedno ++ zamiast zerowania miliona komórek. Rozmiar kodu rośnie dokładnie
   wtedy, kiedy dekoder się tego spodziewa (sprawdzane w testy/gif.mjs
   niezależnym dekoderem i w przeglądarce). */
let ZNAK = null, KOD = null, pokolenie = 0;

export function lzw(ind, minKod){
  if(!ZNAK){ ZNAK = new Int32Array(4096*256); KOD = new Uint16Array(4096*256); }
  let buf = new Uint8Array(Math.max(1024, ind.length >> 1)), dl = 0;
  let bity = 0, nb = 0;
  const pisz = (kod, rozmiar) => {
    bity |= kod << nb; nb += rozmiar;
    while(nb >= 8){
      if(dl === buf.length){ const b = new Uint8Array(buf.length*2); b.set(buf); buf = b; }
      buf[dl++] = bity & 255; bity >>>= 8; nb -= 8;
    }
  };
  const czysc = 1 << minKod, koniec = czysc + 1;
  let nast = koniec + 1, rozmiar = minKod + 1;
  pokolenie++;
  pisz(czysc, rozmiar);
  let pref = ind[0];
  for(let i=1; i<ind.length; i++){
    const k = ind[i], klucz = pref*256 + k;
    if(ZNAK[klucz] === pokolenie){ pref = KOD[klucz]; continue; }
    pisz(pref, rozmiar);
    if(nast === 4096){
      /* słownik pełny: kod czyszczenia jeszcze w 12 bitach, potem od nowa */
      pisz(czysc, rozmiar);
      pokolenie++; nast = koniec + 1; rozmiar = minKod + 1;
    } else {
      if(nast === (1 << rozmiar)) rozmiar++;
      ZNAK[klucz] = pokolenie; KOD[klucz] = nast++;
    }
    pref = k;
  }
  pisz(pref, rozmiar);
  pisz(koniec, rozmiar);
  if(nb > 0) pisz(0, 8 - nb);
  return buf.subarray(0, dl);
}

/* dane w podblokach po najwyżej 255 bajtów, zakończone blokiem pustym */
function podbloki(d){
  const wyn = new Uint8Array(d.length + Math.ceil(d.length/255) + 1);
  let o = 0;
  for(let i=0; i<d.length; i+=255){
    const n = Math.min(255, d.length - i);
    wyn[o++] = n; wyn.set(d.subarray(i, i+n), o); o += n;
  }
  wyn[o++] = 0;
  return wyn.subarray(0, o);
}

const le16 = v => [v & 255, (v >> 8) & 255];

/* ---------- czas ----------
   GIF liczy opóźnienia w setnych sekundy. Zaokrąglamy czasy końców klatek,
   a nie same długości, żeby błąd się nie sumował: 30 kl/s daje 3, 3, 4, 3, 3,
   4… i po sekundzie jest dokładnie sekunda. Poniżej 2 setnych przeglądarki
   wyświetlają klatkę przez 1/10 s, więc 2 to minimum — film powyżej 50 kl/s
   w GIF-ie zwolni. */
export function opoznieniaGif(dlugosci){
  const wyn = [];
  let t = 0, poprz = 0;
  for(const d of dlugosci){
    t += d;
    const koniec = Math.round(t*100);
    const op = Math.max(2, koniec - poprz);
    wyn.push(op);
    poprz += op;
  }
  return wyn;
}

/* ---------- plik ---------- */
export class Gif {
  constructor(w, h){
    if(w > 65535 || h > 65535) throw new Error("GIF ma najwyżej 65 535 px na bok.");
    this.w = w; this.h = h; this.klatek = 0; this.kwantyzowane = 0;
    this.czesci = [Uint8Array.from([
      0x47,0x49,0x46,0x38,0x39,0x61,               /* GIF89a */
      ...le16(w), ...le16(h), 0x70, 0, 0,          /* bez globalnej tablicy kolorów */
      0x21,0xFF,0x0B, ...[..."NETSCAPE2.0"].map(c => c.charCodeAt(0)),
      0x03,0x01, 0,0, 0x00                         /* pętla w nieskończoność */
    ])];
  }
  /* p — piksele RGBA klatki w rozmiarze GIF-a, opoznienie w setnych sekundy */
  dodaj(p, opoznienie){
    const n = this.w*this.h;
    if(p.length < n*4) throw new Error("Klatka ma inny rozmiar niż GIF.");
    const {indeksy, paleta, dokladnie} = indeksuj(p, n);
    if(!dokladnie) this.kwantyzowane++;
    const kolorow = paleta.length/3;
    let bity = 1; while((1 << bity) < kolorow) bity++;
    const tablica = new Uint8Array(3 << bity); tablica.set(paleta);
    this.czesci.push(
      Uint8Array.from([
        0x21,0xF9,0x04, 0x04, ...le16(opoznienie), 0, 0,   /* bez usuwania klatki, bez przezroczystości */
        0x2C, 0,0, 0,0, ...le16(this.w), ...le16(this.h), 0x80 | (bity-1)
      ]),
      tablica,
      Uint8Array.of(Math.max(2, bity)),
      podbloki(lzw(indeksy, Math.max(2, bity)))
    );
    this.klatek++;
  }
  blob(){ return new Blob([...this.czesci, Uint8Array.of(0x3B)], {type: "image/gif"}); }
}
