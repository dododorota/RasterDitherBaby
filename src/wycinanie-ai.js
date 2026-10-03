/* Automatyczne usuwanie tła — strona wątku głównego: skaluje obraz do
   1024×1024 dla modelu, oddaje go wątkowi (wycinanie-ai-worker.js) i skaluje
   maskę z powrotem do rozmiaru obrazu. Wynik: maska krycia 0–255, jak
   z maska() w wycinanie.js — dalej (pędzel, nakładanie) idzie tak samo.

   Model nie jest w repozytorium (~180 MB): pobiera go `npm run modele`.
   Gdy go brak, maskaAI() rzuca błąd z kodem BRAK_MODELU. */
const BOK = 1024;
let watek = null, licznik = 0;
const czekajace = new Map();

function wezWatek(){
  if(watek) return watek;
  watek = new Worker(new URL("./wycinanie-ai-worker.js", import.meta.url), {type: "module"});
  watek.onmessage = e => {
    const z = czekajace.get(e.data.id);
    if(!z) return;
    czekajace.delete(e.data.id);
    if(e.data.blad){ const b = new Error(e.data.blad); b.kod = e.data.blad === "BRAK_MODELU" ? "BRAK_MODELU" : "BLAD"; z.zle(b); }
    else z.ok(e.data.maska);
  };
  watek.onerror = e => { for(const z of czekajace.values()) z.zle(new Error(e.message || "błąd wątku")); czekajace.clear(); watek = null; };
  return watek;
}

/* obraz (płótno albo ImageBitmap) → Uint8Array(szer*wys) krycia */
export async function maskaAI(obraz){
  const w = obraz.width, h = obraz.height;
  const c = document.createElement("canvas"); c.width = BOK; c.height = BOK;
  const x = c.getContext("2d"); x.imageSmoothingQuality = "high";
  x.drawImage(obraz, 0, 0, BOK, BOK);
  const piksele = x.getImageData(0, 0, BOK, BOK).data;
  const id = ++licznik;
  const maska = await new Promise((ok, zle) => { czekajace.set(id, {ok, zle}); wezWatek().postMessage({id, piksele}, [piksele.buffer]); });
  /* maska 1024² → rozmiar obrazu, płynnie (jak LANCZOS w rembg) */
  const m = document.createElement("canvas"); m.width = BOK; m.height = BOK;
  const d = new ImageData(BOK, BOK);
  for(let i=0; i<maska.length; i++){ const o = i*4; d.data[o] = d.data[o+1] = d.data[o+2] = maska[i]; d.data[o+3] = 255; }
  m.getContext("2d").putImageData(d, 0, 0);
  const wy = document.createElement("canvas"); wy.width = w; wy.height = h;
  const wx = wy.getContext("2d"); wx.imageSmoothingQuality = "high";
  wx.drawImage(m, 0, 0, w, h);
  const dw = wx.getImageData(0, 0, w, h).data, wyn = new Uint8Array(w*h);
  for(let i=0; i<wyn.length; i++) wyn[i] = dw[i*4];
  return wyn;
}
