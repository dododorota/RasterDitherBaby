/* Jedno miejsce, które wie, jak narysować bieżący tryb — podgląd, zapis PNG,
   folder i film wołają to samo, więc trzeci tryb (ASCII) nie musi się
   pojawiać w każdym z nich osobno. Dithering jest asynchroniczny (worker)
   i zwraca null, gdy zadanie zostało wyparte świeższym — pozostałe tryby
   liczą się od razu. */
import { S } from "./state.js";
import { renderDither } from "./dither.js";
import { renderHalftone } from "./halftone.js";
import { renderAscii } from "./ascii.js";

export const NAZWA_TRYBU = {dither: "dither", half: "raster", ascii: "ascii"};

export async function renderuj(skala, opcje){
  if(S.mode === "dither") return renderDither(skala, opcje);
  if(S.mode === "ascii"){ renderAscii(skala, opcje); return true; }
  renderHalftone(skala);
  return true;
}
