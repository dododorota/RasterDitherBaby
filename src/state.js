/* Wspólny stan aplikacji. Jeden obiekt, czytany przez wszystkie moduły,
   zapisywany tylko przez app.js (kontrolki i presety). */
export const MAX = 1400;   // maksymalny bok przetwarzanego obrazu w px

/* Wygląd — wszystko, co składa się na obraz i co zapisuje się w presecie.
   Reszta stanu presetu nie dotyczy: img to wczytany obraz, custom to wczytana
   paleta własna ({nazwa, kolory}), mode to zakładka, scl, fmt, wektor i wygl
   to ustawienia zapisu.
   Paleta własna jest materiałem jak obraz, a nie częścią wyglądu — gdyby
   siedziała w DEFAULTS, każdy wbudowany preset by ją kasował. Do pliku presetu
   trafia osobno, i tylko wtedy, gdy jest wybrana. */
export const DEFAULTS = {
  bri:0, con:0, gam:1, pix:1, inv:false,
  algo:"floyd", str:1, thr:0, serp:true,
  pal:"bw", ink:"#000000", paper:"#ffffff",
  cell:8, ang:45, dot:1, blur:0, shape:"circle", inkmode:"mono", mis:0, grain:0,
  sort:"brak", sortOd:25, sortDo:80, rgb:0, rgbKat:0
};
export const LOOK = Object.keys(DEFAULTS);

export const S = Object.assign({ img:null, custom:null, mode:"dither", scl:1, fmt:"png", wektor:"piksele", wygl:3 }, DEFAULTS);
