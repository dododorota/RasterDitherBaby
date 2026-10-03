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

/* klucz S → [{t, v, k?}], posortowane po czasie; k — krzywa przejścia OD tej
   klatki do następnej (jak interpolacja wyjściowa w After Effects), bez k —
   krzywa całej ścieżki */
export const SCIEZKI = {};
/* klucz S → krzywa przejścia całej ścieżki; brak wpisu = „plynnie" */
export const KRZYWE = {};
export const RODZAJE_KRZYWYCH = [["plynnie", "Płynnie"], ["liniowo", "Liniowo"], ["skokowo", "Skokowo"]];
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
  if(!SCIEZKI[k].length){ delete SCIEZKI[k]; delete KRZYWE[k]; }
}
export function usunSciezke(k){ delete SCIEZKI[k]; delete KRZYWE[k]; }
export function wyczysc(){ for(const k of Object.keys(SCIEZKI)) delete SCIEZKI[k]; for(const k of Object.keys(KRZYWE)) delete KRZYWE[k]; }
export function ustawKrzywa(k, r){ if(r === "plynnie" || !RODZAJE_KRZYWYCH.some(([x]) => x === r)) delete KRZYWE[k]; else KRZYWE[k] = r; }
/* krzywa jednej klatki (przejście do następnej); null albo nieznana — jak ścieżka */
export function ustawKrzywaKlucza(k, t, r){
  const i = kluczW(k, t);
  if(i < 0) return;
  if(RODZAJE_KRZYWYCH.some(([x]) => x === r)) SCIEZKI[k][i].k = r; else delete SCIEZKI[k][i].k;
}
export const krzywaKlucza = (k, t) => { const i = kluczW(k, t); return i < 0 ? null : (SCIEZKI[k][i].k || null); };

/* Krzywe: płynnie — wolny start i koniec (jak „Easy Ease"), liniowo — stałe
   tempo, skokowo — wartość trzyma się do następnej klatki i przeskakuje
   (jak „Hold" w After Effects) */
const PRZEJSCIE = {plynnie: u => u*u*(3 - 2*u), liniowo: u => u, skokowo: () => 0};

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
    v = a.v + (b.v - a.v)*(PRZEJSCIE[a.k || KRZYWE[k]] || PRZEJSCIE.plynnie)(u);
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
/* Parametry spoza S — np. położenie warstwy kompozycji („w:3:x"): klucz
   z dwukropkiem trafia do celu zarejestrowanego dla przedrostka zamiast do S,
   a po ustawieniu wszystkich wartości cel dostaje „po()" (warstwy składają
   wtedy płótno). Dzięki temu podgląd, zapis filmu i przewijanie — wszystko,
   co woła zastosuj() — animuje też warstwy, bez osobnej ścieżki. */
const CELE = {};
export function cel(przedrostek, ustaw, po){ CELE[przedrostek] = {ustaw, po}; }
const celKlucza = k => k.includes(":") ? CELE[k.split(":")[0]] : null;

/* ustawia w stanie wszystkie animowane parametry na chwilę t */
export function zastosuj(S, t){
  const ruszone = new Set();
  for(const k of Object.keys(SCIEZKI)){
    const v = wartoscS(k, t);
    if(v === null) continue;
    const c = celKlucza(k);
    if(c){ c.ustaw(k, v); ruszone.add(c); } else if(!k.includes(":")) S[k] = v;
  }
  for(const c of ruszone) if(c.po) c.po();
}

/* ---------- zapis w presecie ----------
   Klatki kluczowe trafiają do presetu (plik i przeglądarka) polem „animacja":
   {klucz: [[czas, wartość suwaka], …]} albo — gdy ścieżka ma krzywą inną niż
   płynna — {klucz: {krzywa, klatki: [[…], …]}}. Klatka z własną krzywą ma ją
   trzecim elementem: [czas, wartość, "liniowo"] — stare pliki (dwa elementy)
   czytają się bez zmian. Wczytywanie nieufne jak reszta
   presetu: tylko parametry, które da się animować (są w KONW), liczby
   skończone, czas 0–3600 s, wartość przycięta do zakresu suwaka, najwyżej
   MAX_KLATEK na parametr. Zwraca liczbę odrzuconych wpisów. */
export const MAX_KLATEK = 1000;
export function zrzut(){
  const wyn = {};
  /* parametry spoza S (warstwy) to materiał, nie wygląd — do presetu nie idą */
  for(const [k, s] of Object.entries(SCIEZKI)) if(s.length && !k.includes(":")){
    const klatki = s.map(kl => kl.k ? [kl.t, kl.v, kl.k] : [kl.t, kl.v]);
    wyn[k] = KRZYWE[k] ? {krzywa: KRZYWE[k], klatki} : klatki;
  }
  return wyn;
}
export function wczytaj(dane){
  /* animacja warstw (klucze z dwukropkiem) nie jest częścią presetu — zostaje */
  for(const k of Object.keys(SCIEZKI)) if(!k.includes(":")) usunSciezke(k);
  let odrzucone = 0;
  if(!dane || typeof dane !== "object" || Array.isArray(dane)) return 1;
  for(const [k, wpis] of Object.entries(dane)){
    const kw = KONW[k];
    const lista = Array.isArray(wpis) ? wpis : (wpis && typeof wpis === "object" && Array.isArray(wpis.klatki) ? wpis.klatki : null);
    if(!kw || !lista){ odrzucone++; continue; }
    if(!Array.isArray(wpis)){
      if(RODZAJE_KRZYWYCH.some(([x]) => x === wpis.krzywa)) ustawKrzywa(k, wpis.krzywa); else odrzucone++;
    }
    for(const kl of lista.slice(0, MAX_KLATEK)){
      if(!Array.isArray(kl) || (kl.length !== 2 && kl.length !== 3) || !kl.slice(0, 2).every(x => typeof x === "number" && isFinite(x)) || kl[0] < 0 || kl[0] > 3600){ odrzucone++; continue; }
      ustawKlucz(k, kl[0], Math.max(kw.min, Math.min(kw.max, Math.round(kl[1]))));
      if(kl.length === 3){ if(RODZAJE_KRZYWYCH.some(([x]) => x === kl[2])) ustawKrzywaKlucza(k, kl[0], kl[2]); else odrzucone++; }
    }
    if(lista.length > MAX_KLATEK) odrzucone += lista.length - MAX_KLATEK;
  }
  return odrzucone;
}
