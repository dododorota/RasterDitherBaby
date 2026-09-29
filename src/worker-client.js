/* Obsługa workera dyfuzji: jedno zadanie liczy się naraz.

   Zadania podglądu wypierają się nawzajem — przy przeciąganiu suwaka wszystkie
   poza najświeższym i tak trafiłyby do kosza, więc wyparte rozwiązują się przez
   null i wołający nic nie rysuje. Zadania z `keep` (zapis pliku) nie wypadają
   z kolejki nigdy. Przerwać liczenia w locie się nie da: pętla dyfuzji jest
   synchroniczna, więc worker nie odbierze wiadomości, dopóki jej nie skończy. */
import { S } from "./state.js";

let worker = null;
try {
  worker = new Worker(new URL("./worker.js", import.meta.url), { type:"module" });
} catch(err) {
  console.warn("Worker niedostępny, dithering liczy się na głównym wątku.", err);
}

let queue = [], inflight = null, seq = 0;

export const hasWorker = () => !!worker;

/* snapshot stanu dla workera — bez img, bo obrazu nie da się sklonować
   i po tej stronie nie jest potrzebny */
function snapshot(){
  const s = {};
  for(const k in S) if(k !== "img") s[k] = S[k];
  return s;
}
function pump(){
  if(!worker || inflight || !queue.length) return;
  const j = inflight = queue.shift();
  worker.postMessage({id:j.id, snap:j.snap, buf:j.buf, w:j.w, h:j.h}, [j.buf]);
}
if(worker){
  worker.onmessage = e => {
    const job = inflight; inflight = null;
    if(job) job.resolve(e.data);
    pump();
  };
  worker.onerror = e => {
    console.warn("Worker padł, dithering wraca na główny wątek.", e.message);
    const all = inflight ? [inflight].concat(queue) : queue;
    inflight = null; queue = []; worker = null;
    for(const j of all) j.reject(new Error(e.message || "worker error"));
  };
}
/* Oddaje bufor workerowi (transfer, bez kopiowania) i obiecuje wynik.
   Zwraca null, jeśli zadanie zostało wyparte świeższym. */
export function compute(buf, w, h, drop){
  return new Promise((resolve, reject) => {
    if(!worker) { reject(new Error("brak workera")); return; }
    if(drop) queue = queue.filter(j => { if(j.drop){ j.resolve(null); return false; } return true; });
    queue.push({id:++seq, snap:snapshot(), buf, w, h, drop, resolve, reject});
    pump();
  });
}
