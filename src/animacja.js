/* Animacja parametrów: klatki kluczowe na osi czasu. Czysty moduł, bez DOM-u —
   testowany w Node (testy/animacja.mjs), a używany i przez panel (app.js),
   i przez zapis filmu (video.js).

   Jak w After Effects: parametr bez klatek kluczowych ma jedną wartość przez
   cały film, a z co najmniej jedną — wartość z osi czasu. Przed pierwszą
   klatką trzyma wartość pierwszej, po ostatniej — ostatniej, pomiędzy
   przechodzi płynnie (wygładzony start i koniec, jak „Easy Ease").

   Wartości trzymamy w jednostkach suwaka (liczby całkowite, tak jak w polu
   <input type=range>), a nie w jednostkach S: suwak gammy chodzi co 0,01,
   pikselizacji co 1 — zaokrąglenie wyniku do kroku suwaka sprawia, że klatka
   pośrednia ma zawsze wartość, którą da się ustawić ręcznie, i że zapis
   w skali i podgląd liczą to samo. Przeliczenie na S daje KONW, ustawiane
   przez app.js z tabeli suwaków (tu nie wiemy nic o kontrolkach). */

/* klucz S → [{t, v}], posortowane po czasie */
export const SCIEZKI = {};
/* klucz S → {zS: suwak→S, min, max}; bez wpisu: wartość wprost, bez granic */
export const KONW = {};

/* czasy z osi czasu są ułamkami (1/30 s); dwie klatki kluczowe uznajemy za
   tę samą, gdy dzieli je mniej niż milisekunda */
const EPS = 1e-3;

export const animowane = () => Object.keys(SCIEZKI);
export const czyAnimowany = k => !!(SCIEZKI[k] && SCIEZKI[k].length);
export function kluczW(k, t){
  const s = SCIEZKI[k];
  return s ? s.findIndex(kl => Math.abs(kl.t - t) < EPS) : -1;
}

/* dodaje albo nadpisuje klatkę w czasie t */
export function ustawKlucz(k, t, v){
  const s = SCIEZKI[k] || (SCIEZKI[k] = []);
  const i = kluczW(k, t);
  if(i >= 0) s[i].v = v;
  else { s.push({t, v}); s.sort((a, b) => a.t - b.t); }
}
/* usuwa klatkę; ostatnia usunięta kończy animację parametru */
export function usunKlucz(k, t){
  const i = kluczW(k, t);
  if(i < 0) return;
  SCIEZKI[k].splice(i, 1);
  if(!SCIEZKI[k].length) delete SCIEZKI[k];
}
export function usunSciezke(k){ delete SCIEZKI[k]; }
export function wyczysc(){ for(const k of Object.keys(SCIEZKI)) delete SCIEZKI[k]; }

const gladko = u => u*u*(3 - 2*u);

/* wartość w jednostkach suwaka, zaokrąglona do kroku i przycięta do zakresu */
export function wartoscSuwaka(k, t){
  const s = SCIEZKI[k];
  if(!s || !s.length) return null;
  let v;
  if(t <= s[0].t) v = s[0].v;
  else if(t >= s[s.length-1].t) v = s[s.length-1].v;
  else {
    let i = 1; while(s[i].t < t) i++;
    const a = s[i-1], b = s[i], u = (t - a.t)/(b.t - a.t);
    v = a.v + (b.v - a.v)*gladko(u);
  }
  v = Math.round(v);
  const kw = KONW[k];
  if(kw){ if(v < kw.min) v = kw.min; if(v > kw.max) v = kw.max; }
  return v;
}
export function wartoscS(k, t){
  const v = wartoscSuwaka(k, t);
  if(v === null) return null;
  const kw = KONW[k];
  return kw && kw.zS ? kw.zS(v) : v;
}
/* ustawia w stanie wszystkie animowane parametry na chwilę t */
export function zastosuj(S, t){
  for(const k of Object.keys(SCIEZKI)){ const v = wartoscS(k, t); if(v !== null) S[k] = v; }
}
