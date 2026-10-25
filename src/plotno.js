/* Płótno robocze: na stronie <canvas>, w workerze OffscreenCanvas — raster
   rysuje się w obu miejscach tym samym kodem (raster-rysuj.js). */
export function plotno(w, h){
  if(typeof document !== "undefined"){ const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}
