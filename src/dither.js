import { S, MAX } from "./state.js";
import { out, octx } from "./dom.js";
import { fit } from "./image.js";
import { ditherIEfekty } from "./dither-core.js";
import { hasWorker, compute } from "./worker-client.js";

/* ---------- tryb 1: dithering ---------- */

/* obraz źródłowy przeskalowany do rozmiaru roboczego — canvas zostaje
   nietknięty, więc gdyby worker padł, piksele da się z niego wziąć ponownie */
function drawSource(){
  const [fw,fh] = fit(S.img.width, S.img.height, MAX);
  const w = Math.max(1, Math.round(fw/S.pix)), h = Math.max(1, Math.round(fh/S.pix));
  const c = document.createElement("canvas"); c.width=w; c.height=h;
  const ctx = c.getContext("2d");
  ctx.drawImage(S.img, 0,0, w,h);
  return {c, ctx, w, h};
}
/* Zwraca {c,w,h,d} albo null, gdy zadanie zostało wyparte świeższym.
   Z {keep:true} nigdy nie zwróci null — tego używa zapis do pliku. */
export async function ditherData(opts){
  const {c, ctx, w, h} = drawSource();

  if(hasWorker()){
    try{
      const src = ctx.getImageData(0,0,w,h);
      const r = await compute(src.data.buffer, w, h, !(opts && opts.keep));
      if(!r) return null;
      const d = new ImageData(new Uint8ClampedArray(r.buf), w, h);
      ctx.putImageData(d,0,0);
      return {c, w, h, d};
    }catch(err){
      console.warn("Worker nie odpowiedział, liczę na głównym wątku.", err);
    }
  }
  const d = ctx.getImageData(0,0,w,h);
  ditherIEfekty(d.data, w, h);
  ctx.putImageData(d,0,0);
  return {c, w, h, d};
}
export async function renderDither(scale, opts){
  const r = await ditherData(opts);
  if(!r) return null;
  const {c,w,h} = r;
  const S2 = Math.max(1, Math.round(S.pix*scale));
  out.width = w*S2; out.height = h*S2;
  octx.imageSmoothingEnabled = false;
  octx.clearRect(0,0,out.width,out.height);
  octx.drawImage(c, 0,0, out.width, out.height);
  out.classList.add("pixelated");
  return r;
}
