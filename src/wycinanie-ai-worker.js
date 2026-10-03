/* Wątek automatycznego usuwania tła: model IS-Net (isnet-general-use) w ONNX
   Runtime Web. Osobny wątek, bo model liczy się sekundy — panel ma działać.

   Przygotowanie wejścia i wyjścia jak w rembg (sessions/dis_general_use.py),
   z którego pochodzi model: obraz 1024×1024, dzielony przez największą
   wartość w obrazie, minus 0,5 (odchylenie 1), układ kanałów RGB × wiersze ×
   kolumny; wynik — pierwszy kanał pierwszego wyjścia, przeskalowany min–max
   do 0–1. Skalowanie obrazu do 1024 robi wątek główny (płótno).

   Najpierw WebGPU (karta graficzna, wielokrotnie szybciej), w razie braku —
   WebAssembly na procesorze; wiele wątków tylko w izolacji między źródłami
   (nagłówki COOP/COEP z serwer.py i z wersji na pulpit). */
const BOK = 1024;
let ort = null, sesja = null;

async function przygotuj(){
  if(!ort){
    ort = await import("../vendor/onnx/ort.webgpu.min.mjs");
    ort.env.wasm.wasmPaths = new URL("../vendor/onnx/", import.meta.url).href;
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 2) - 1)) : 1;
  }
  if(!sesja){
    const r = await fetch(new URL("../modele/isnet-general-use.onnx", import.meta.url));
    if(!r.ok) throw new Error("BRAK_MODELU");
    const model = new Uint8Array(await r.arrayBuffer());
    const dostawcy = typeof navigator !== "undefined" && navigator.gpu ? ["webgpu", "wasm"] : ["wasm"];
    try{ sesja = await ort.InferenceSession.create(model, {executionProviders: dostawcy}); }
    catch(e){ if(dostawcy[0] !== "webgpu") throw e; sesja = await ort.InferenceSession.create(model, {executionProviders: ["wasm"]}); }
  }
}

self.onmessage = async e => {
  const {id, piksele} = e.data;
  try{
    await przygotuj();
    const n = BOK*BOK, wej = new Float32Array(3*n);
    let maks = 1e-6;
    for(let i=0; i<n; i++){ const o = i*4; maks = Math.max(maks, piksele[o], piksele[o+1], piksele[o+2]); }
    for(let i=0; i<n; i++){
      const o = i*4;
      wej[i] = piksele[o]/maks - 0.5; wej[n + i] = piksele[o+1]/maks - 0.5; wej[2*n + i] = piksele[o+2]/maks - 0.5;
    }
    const wyniki = await sesja.run({[sesja.inputNames[0]]: new ort.Tensor("float32", wej, [1, 3, BOK, BOK])});
    const pred = wyniki[sesja.outputNames[0]].data;
    let mi = Infinity, ma = -Infinity;
    for(let i=0; i<n; i++){ const v = pred[i]; if(v < mi) mi = v; if(v > ma) ma = v; }
    const maska = new Uint8Array(n), zakres = ma - mi || 1;
    for(let i=0; i<n; i++) maska[i] = Math.round((pred[i] - mi)/zakres*255);
    self.postMessage({id, maska}, [maska.buffer]);
  }catch(err){
    self.postMessage({id, blad: err && err.message === "BRAK_MODELU" ? "BRAK_MODELU" : String(err && err.message || err)});
  }
};
