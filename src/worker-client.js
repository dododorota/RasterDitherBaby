/* Obsługa workerów: dyfuzji (worker.js) i rastra (worker-raster.js). W każdym
   jedno zadanie liczy się naraz.

   Zadania podglądu wypierają się nawzajem — przy przeciąganiu suwaka wszystkie
   poza najświeższym i tak trafiłyby do kosza, więc wyparte rozwiązują się przez
   null i wołający nic nie rysuje. Zadania z `keep` (zapis pliku) nie wypadają
   z kolejki nigdy. Przerwać liczenia w locie się nie da: pętla jest
   synchroniczna, więc worker nie odbierze wiadomości, dopóki jej nie skończy. */
import { S } from "./state.js";
import { ZNAKI } from "./znaki-tonu.js";

/* snapshot stanu dla workera — bez img, bo obrazu nie da się sklonować
   i po tej stronie nie jest potrzebny */
function snapshot(){
  const s = {};
  for(const k in S) if(k !== "img") s[k] = S[k];
  return s;
}
/* kolejka jednego workera; `przygotuj(j)` (opcjonalne, asynchroniczne) tuż
   przed wysłaniem zwraca [wiadomość, transfer] */
function kolejka(plik, nazwa, przygotuj){
  let worker = null;
  try {
    worker = new Worker(new URL(plik, import.meta.url), { type:"module" });
  } catch(err) {
    console.warn("Worker (" + nazwa + ") niedostępny, liczę na głównym wątku.", err);
  }
  let queue = [], inflight = null, seq = 0;
  async function pump(){
    if(!worker || inflight || !queue.length) return;
    const j = inflight = queue.shift();
    try{
      const [msg, transfer] = await przygotuj(j);
      worker.postMessage(msg, transfer);
    }catch(err){ inflight = null; j.reject(err); pump(); }
  }
  if(worker){
    worker.onmessage = e => {
      const job = inflight; inflight = null;
      if(job) job.resolve(e.data);
      pump();
    };
    worker.onerror = e => {
      console.warn("Worker (" + nazwa + ") padł, wracam na główny wątek.", e.message);
      const all = inflight ? [inflight].concat(queue) : queue;
      inflight = null; queue = []; worker = null;
      for(const j of all) j.reject(new Error(e.message || "worker error"));
    };
  }
  return {
    jest: () => !!worker,
    zadanie(dane, drop){
      return new Promise((resolve, reject) => {
        if(!worker) { reject(new Error("brak workera")); return; }
        if(drop) queue = queue.filter(j => { if(j.drop){ j.resolve(null); return false; } return true; });
        queue.push({...dane, id:++seq, snap:snapshot(), drop, resolve, reject});
        pump();
      });
    }
  };
}

/* ---------- dyfuzja ---------- */
const dyfuzja = kolejka("./worker.js", "dyfuzja", async j =>
  [{id:j.id, snap:j.snap, buf:j.buf, w:j.w, h:j.h, opcje:j.opcje}, [j.buf]]);
export const hasWorker = () => dyfuzja.jest();
/* Oddaje bufor workerowi (transfer, bez kopiowania) i obiecuje wynik.
   Zwraca null, jeśli zadanie zostało wyparte świeższym. */
export const compute = (buf, w, h, drop, opcje) => dyfuzja.zadanie({buf, w, h, opcje}, drop);

/* ---------- raster ----------
   Obrazki znaków tonu to materiał ze strony (płótna) — worker dostaje ich
   bitmapy tylko wtedy, gdy się zmieniły (numer wczytania `nr`). Bitmapę
   robimy tuż przed wysłaniem, nie przy dodaniu zadania: wyparte zadanie
   nic nie kosztuje. */
const wyslaneZnaki = [];
const raster = kolejka("./worker-raster.js", "raster", async j => {
  const znaki = [], transfer = [j.smp.d.buffer];
  for(let i=0; i<ZNAKI.length; i++){
    const z = ZNAKI[i], nr = z ? z.nr : 0;
    if((wyslaneZnaki[i] || 0) === nr) continue;
    const obraz = z ? await createImageBitmap(z.obraz) : null;
    znaki.push([i, z ? {nazwa: z.nazwa, nr, obraz, kontury: null} : null]);
    if(obraz) transfer.push(obraz);
    wyslaneZnaki[i] = nr;
  }
  return [{id:j.id, snap:j.snap, smp:j.smp, W:j.W, H:j.H, z:j.z, znaki}, transfer];
});
export const maRaster = () => raster.jest();
/* próbki (sampler) → ImageBitmap gotowego rastra W·z × H·z albo null (wyparte) */
export async function liczRaster(smp, W, H, z, drop){
  const r = await raster.zadanie({smp, W, H, z}, drop);
  return r ? r.bm : null;
}
