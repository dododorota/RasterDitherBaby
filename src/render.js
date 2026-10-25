/* Jedno miejsce, które wie, jak narysować bieżący tryb — podgląd, zapis PNG,
   folder i film wołają to samo, więc trzeci tryb (ASCII) nie musi się
   pojawiać w każdym z nich osobno. Dithering, glitch i raster są
   asynchroniczne (workery) i zwracają null, gdy zadanie zostało wyparte
   świeższym — ASCII liczy się od razu. */
import { S } from "./state.js";
import { renderDither } from "./dither.js";
import { renderHalftone } from "./halftone.js";
import { renderAscii } from "./ascii.js";

export const NAZWA_TRYBU = {dither: "dither", half: "raster", ascii: "ascii", glitch: "glitch"};

export async function renderuj(skala, opcje){
  /* glitch liczy się tą samą drogą co dithering (worker, bufor po pikselizacji) */
  if(S.mode === "dither" || S.mode === "glitch") return renderDither(skala, opcje);
  if(S.mode === "ascii"){ renderAscii(skala, opcje); return true; }
  /* raster też w workerze — null, gdy wyparty */
  return renderHalftone(skala, opcje);
}
