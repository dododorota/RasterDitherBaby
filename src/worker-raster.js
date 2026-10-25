/* Wątek rysujący raster. Jak worker.js: własna kopia S ze snapshotu przy
   każdym zadaniu; zamiast obrazu — gotowe próbki z sampler() (halftone.js).
   Rysuje raster-rysuj.js na OffscreenCanvas, wynik wraca jako ImageBitmap
   (transfer, bez kopiowania pikseli). */
import { S } from "./state.js";
import { ZNAKI } from "./znaki-tonu.js";
import { rasterPelny } from "./raster-rysuj.js";

/* Archivo dla kształtu „znak" — w workerze nie ma CSS-a strony, krój trzeba
   dodać samemu (te same pliki i zakresy co @font-face w styles.css) */
const KROJE = [
  ["archivo-latin-ext.woff2", "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF"],
  ["archivo-latin.woff2", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"]
];
const kroje = Promise.all(KROJE.map(([plik, zakres]) => {
  const f = new FontFace("Archivo", "url(" + new URL("../fonty/" + plik, import.meta.url).href + ")", {weight: "100 900", unicodeRange: zakres});
  self.fonts.add(f);
  return f.load().catch(err => console.warn("Krój Archivo w workerze rastra się nie wczytał.", err));
}));

self.onmessage = async e => {
  const {id, snap, smp, W, H, z, znaki} = e.data;
  await kroje;
  Object.assign(S, snap);
  for(const [i, zn] of znaki){
    if(ZNAKI[i] && ZNAKI[i].obraz.close) ZNAKI[i].obraz.close();
    ZNAKI[i] = zn;
  }
  const c = new OffscreenCanvas(W*z, H*z);
  rasterPelny(c.getContext("2d"), W, H, z, smp);
  const bm = c.transferToImageBitmap();
  self.postMessage({id, bm}, [bm]);
};
