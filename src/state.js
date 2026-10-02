/* Wspólny stan aplikacji. Jeden obiekt, czytany przez wszystkie moduły,
   zapisywany tylko przez app.js (kontrolki i presety). */
export const MAX = 1400;   // maksymalny bok przetwarzanego obrazu w px

/* Wygląd — wszystko, co składa się na obraz i co zapisuje się w presecie.
   Reszta stanu presetu nie dotyczy: img to wczytany obraz, custom to wczytana
   paleta własna ({nazwa, kolory}), mode to zakładka, scl, fmt, wektor, wygl
   i jakosc (MP4) to ustawienia zapisu. Film nie siedzi w S, tylko w W
   (video.js) — do S trafia jego bieżąca klatka jako img.
   Paleta własna jest materiałem jak obraz, a nie częścią wyglądu — gdyby
   siedziała w DEFAULTS, każdy wbudowany preset by ją kasował. Do pliku presetu
   trafia osobno, i tylko wtedy, gdy jest wybrana. */
export const DEFAULTS = {
  bri:0, con:0, gam:1, pix:1, inv:false,
  cienie:0, swiatla:0, nasycenie:0, odcien:0, ostrosc:0, odszum:0,
  algo:"floyd", str:1, thr:0, serp:true,
  pal:"bw", mapa:"kolor", percept:false, glebia:4, ink:"#000000", paper:"#ffffff",
  cell:8, ang:45, dot:1, blur:0, shape:"circle", inkmode:"mono", mis:0, grain:0,
  sort:"brak", sortOd:25, sortDo:80, rgb:0, rgbKat:0,
  glow:0, glowR:12, glowProg:50,
  efekty:"", chrom:0, jpegJakosc:20, jpegGlitch:0, jpegZiarno:1,
  tint:0, tintKolor:"#3a7bff", tintTryb:"kolor",
  gwiazdy:0, gwProg:70, gwRamiona:4, gwDlugosc:40, gwKat:0,
  faktura:"brak", faktSkala:2, faktTryb:"mnoz", faktKrycie:50,
  postJas:0, postKon:0, postNas:0, winieta:0, postZiarno:0,
  czasSzum:0, czasDrganie:0, czasCykl:false,
  asciiZestaw:"standard", asciiWlasne:"", asciiTryb:"jasnosc", asciiRozmiar:12, asciiKolor:"obraz", asciiDither:false
};
export const LOOK = Object.keys(DEFAULTS);

/* klatkaNr: numer bieżącej klatki osi czasu (0 bez filmu) — od niego zależą
   efekty zmienne w czasie; ustawia go podgląd filmu i zapis, nie panel */
export const S = Object.assign({ img:null, custom:null, mode:"dither", scl:1, fmt:"png", wektor:"piksele", wygl:3, jakosc:"wysoka", przezroczyste:false, klatkaNr:0 }, DEFAULTS);
