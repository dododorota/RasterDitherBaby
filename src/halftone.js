import { S, MAX } from "./state.js";
import { out, octx } from "./dom.js";
import { adjust, fit, korektaPrzestrzenna } from "./image.js";
import { zmiennoscCzynna } from "./stos.js";
import { zmiennoscPrzed } from "./fx.js";
import { rasterPelny, oczkoProbek } from "./raster-rysuj.js";
import { maRaster, liczRaster } from "./worker-client.js";
export { inkList, mieszanieFarby, collectScreen } from "./raster-rysuj.js";

/* ---------- tryb 2: raster drukarski ----------

   `z` to krotność zapisu. Cała siatka liczy się zawsze w pikselach podglądu,
   a przez `z` mnożona jest dopiero gotowa geometria punktu. Dzięki temu plik
   w skali 4× jest dokładnie czterokrotnym powiększeniem podglądu, a nie
   czterokrotnie drobniejszym rastrem — i to z konstrukcji, bo próbkowanie
   i zaokrąglenia wypadają identycznie niezależnie od `z`. Liczenie od razu
   w pikselach wyjścia tego nie dawało: `round(px/step)` potrafiło przeskoczyć
   o próbkę na granicy zaokrąglenia i zmienić promień o ułamek procenta.
   Podgląd i eksport wektorowy idą z z=1, czyli mnożeniem przez jeden.

   Tu zostaje tylko to, co potrzebuje strony: próbki z S.img (sampler)
   i wklejenie gotowego obrazu do podglądu. Rysowanie jest w raster-rysuj.js
   i liczy się w workerze (worker-raster.js) — przy gęstym oczku, stipplingu
   czy fakturze farby render trwa setki ms i na głównym wątku stawały suwaki. */

export function sampler(W,H,cell){
  const step = Math.max(2, Math.round((cell || S.cell)/2));
  const sw = Math.max(1,Math.ceil(W/step)), sh = Math.max(1,Math.ceil(H/step));
  const c=document.createElement("canvas"); c.width=sw; c.height=sh;
  const ctx=c.getContext("2d");
  if(S.pix>1){
    const pw=Math.max(1,Math.round(sw/S.pix)), ph=Math.max(1,Math.round(sh/S.pix));
    const t=document.createElement("canvas"); t.width=pw; t.height=ph;
    t.getContext("2d").drawImage(S.img,0,0,pw,ph);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(t,0,0,sw,sh);
  } else {
    ctx.drawImage(S.img,0,0,sw,sh);
  }
  const d=ctx.getImageData(0,0,sw,sh); adjust(d);
  /* Rozmycie idzie PO korekcie, tuż przed rastrem: gdyby szło przed, podbity
     kontrast wyostrzyłby krawędzie z powrotem i migotanie by wróciło.
     Sigma z pikseli obrazu na próbki, więc to samo rozmycie znaczy to samo
     przy każdej gęstości siatki. */
  korektaPrzestrzenna(d.data, sw, sh, 1/step);
  if(zmiennoscCzynna()) zmiennoscPrzed(d.data, sw, sh, 1/step);
  return {d:d.data, sw, sh, step};
}
/* Jak renderDither(): zwraca null, gdy zadanie zostało wyparte świeższym
   (przeciąganie suwaka), z {keep:true} — nigdy (zapis pliku). Bez workera
   albo gdy padnie — to samo rysowanie na głównym wątku. */
export async function renderHalftone(scale, opcje){
  const z = Math.max(1, Math.round(scale));
  const [W,H] = fit(S.img.width, S.img.height, MAX);   /* kadr podglądu */
  let smp = sampler(W, H, oczkoProbek());
  if(maRaster()){
    try{
      const bm = await liczRaster(smp, W, H, z, !(opcje && opcje.keep));
      if(!bm) return null;
      /* w trakcie liczenia przełączono tryb (np. na ASCII, które rysuje od
         razu) — spóźniony raster nie może nadpisać podglądu */
      if(S.mode !== "half"){ bm.close(); return null; }
      out.width = bm.width; out.height = bm.height;
      out.classList.remove("pixelated");
      octx.drawImage(bm, 0, 0);
      bm.close();
      return true;
    }catch(err){
      console.warn("Worker rastra nie odpowiedział, rysuję na głównym wątku.", err);
      smp = sampler(W, H, oczkoProbek());     /* bufor próbek poszedł do workera */
    }
  }
  out.width = W*z; out.height = H*z;
  out.classList.remove("pixelated");
  rasterPelny(octx, W, H, z, smp);
  return true;
}
