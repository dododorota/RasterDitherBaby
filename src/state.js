/* Wspólny stan aplikacji. Jeden obiekt, czytany przez wszystkie moduły,
   zapisywany tylko przez ui.js (kontrolki i presety). */
export const MAX = 1400;   // maksymalny bok przetwarzanego obrazu w px

export const S = {
  img:null, mode:"dither",
  bri:0, con:0, gam:1, pix:1, inv:false,
  algo:"floyd", str:1, thr:0, serp:true,
  pal:"bw", ink:"#000000", paper:"#ffffff",
  cell:8, ang:45, dot:1, shape:"circle", inkmode:"mono", mis:0, grain:0,
  scl:1, fmt:"png"
};
