/* Wątek liczący dyfuzję błędu. Ma własną kopię S — główny wątek dosyła jej
   snapshot razem z każdym zadaniem, bo tutaj nie ma ani DOM-u, ani obrazu,
   tylko gotowy bufor pikseli. */
import { S } from "./state.js";
import { ditherIEfekty } from "./dither-core.js";

self.onmessage = e => {
  const {id, snap, buf, w, h, opcje} = e.data;
  Object.assign(S, snap);
  const p = new Uint8ClampedArray(buf);
  ditherIEfekty(p, w, h, opcje);
  self.postMessage({id, buf:p.buffer, w, h}, [p.buffer]);
};
