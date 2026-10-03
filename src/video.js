/* Wideo i animacje: źródło klatek, odtwarzanie podglądu i zapis całego filmu.

   Zasada jest ta sama co przy folderze: żadnej osobnej ścieżki renderu.
   Bieżąca klatka ląduje w zwykłym płótnie, które staje się S.img, a dalej
   liczy się ją dokładnie tak jak zdjęcie — renderuj() z render.js.
   Dzięki temu klatka z MP4 jest co do piksela taka sama jak zapis tej klatki
   do PNG, a wszystkie ustawienia, presety i efekty działają bez zmian.

   Trzy rodzaje źródeł o tym samym interfejsie:
   - Film — <video> z przeglądarki (MP4, WebM, MOV z obsługiwanym kodekiem).
     Klatki wybieramy przewijaniem do środka klatki, bo przeglądarka nie podaje
     liczby klatek na sekundę; tempo wykrywamy z krótkiego odtworzenia.
   - Animacja — animowany GIF, WebP albo APNG przez ImageDecoder (WebCodecs),
     z oryginalnymi długościami klatek.
   - Stopklatka — zwykły obraz rozciągnięty na wybraną długość. Ruch daje
     dopiero animacja parametrów (animacja.js): każda klatka to ten sam obraz,
     ale inna jasność, gęstość rastra, poświata…

   Zapis: MP4 (H.264 z VideoEncoder + własny kontener, mp4.js), GIF (gif.js)
   albo klatki PNG w ZIP-ie (zip.js). Bez dźwięku. */
import { S } from "./state.js";
import { out } from "./dom.js";
import { renderuj, NAZWA_TRYBU } from "./render.js";
import { Zip } from "./zip.js";
import { Gif, opoznieniaGif } from "./gif.js";
import { zlozMp4 } from "./mp4.js";
import { zastosuj as zastosujAnimacje } from "./animacja.js";

export const FORMATY_WIDEO = ["mp4", "gif", "klatki"];

export function czyFilm(f){
  return /^video\//.test(f.type) || /\.(mp4|m4v|mov|webm|mkv|ogv)$/i.test(f.name);
}
/* kandydaci na animację — czy naprawdę mają więcej niż jedną klatkę, wie dopiero dekoder */
export function czyMozeAnimacja(f){ return /^image\/(gif|webp|png|apng)$/.test(f.type); }

/* Czeka na zdarzenie; błąd elementu albo przekroczony czas kończy się
   wyjątkiem. „emptied" przychodzi, gdy film zostaje zamknięty — bez tego
   przewijanie zamkniętego filmu czekałoby na „seeked" do końca limitu. */
function zdarzenie(el, nazwa, ms){
  return new Promise((ok, zle) => {
    const t = setTimeout(() => { sprzataj(); zle(new Error("Przeglądarka nie odpowiedziała (" + nazwa + ").")); }, ms);
    const tak = () => { sprzataj(); ok(); };
    const nie = () => { sprzataj(); zle(new Error("Błąd odczytu pliku.")); };
    const zamkniety = () => { sprzataj(); zle(new Error("Film zamknięty.")); };
    const sprzataj = () => { clearTimeout(t); el.removeEventListener(nazwa, tak); el.removeEventListener("error", nie); el.removeEventListener("emptied", zamkniety); };
    el.addEventListener(nazwa, tak);
    el.addEventListener("error", nie);
    if(nazwa !== "loadeddata") el.addEventListener("emptied", zamkniety);
  });
}
function kanwa(w, h){
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  return c;
}

/* ---------- film ---------- */

const TEMPA = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];

/* Tempo z odtworzenia: requestVideoFrameCallback podaje czas każdej nowej
   klatki. Bierzemy najmniejszą różnicę — zgubione klatki dają wielokrotności,
   nigdy mniej. Wynik przyciągamy do typowych temp, bo czasy w pliku bywają
   zaokrąglone do milisekund. Zwraca null, gdy się nie da. */
async function wykryjTempo(el){
  if(!("requestVideoFrameCallback" in el)) return null;
  const czasy = [];
  await new Promise(ok => {
    const stop = setTimeout(ok, 2000);
    const cb = (_, m) => {
      czasy.push(m.mediaTime);
      if(czasy.length >= 14){ clearTimeout(stop); ok(); }
      else el.requestVideoFrameCallback(cb);
    };
    el.requestVideoFrameCallback(cb);
    el.play().catch(() => { clearTimeout(stop); ok(); });
  });
  el.pause();
  let min = Infinity;
  for(let i=1; i<czasy.length; i++){ const d = czasy[i] - czasy[i-1]; if(d > 0.004 && d < min) min = d; }
  if(!isFinite(min)) return null;
  /* najbliższe z typowych, nie pierwsze pasujące — 29,97 i 30 dzieli 0,1% */
  const fps = 1/min;
  const blisko = TEMPA.reduce((a, t) => Math.abs(t - fps) < Math.abs(a - fps) ? t : a);
  return Math.abs(blisko - fps)/blisko < 0.02 ? blisko : Math.round(fps*100)/100;
}

class Film {
  static async otworz(f){
    const el = document.createElement("video");
    el.muted = true; el.playsInline = true; el.preload = "auto";
    /* w dokumencie, ale niewidoczny: odłączony element nie zawsze dostaje
       klatki, a requestVideoFrameCallback działa tylko dla wyświetlanego */
    el.className = "wideo-zrodlo";
    document.body.appendChild(el);
    const url = URL.createObjectURL(f);
    const porzuc = () => { el.removeAttribute("src"); el.load(); el.remove(); URL.revokeObjectURL(url); };
    try{
      const gotowe = zdarzenie(el, "loadeddata", 20000);
      el.src = url;
      await gotowe;
      if(!el.videoWidth) throw new Error("Ten plik nie ma obrazu.");
      /* WebM z nagrywania w przeglądarce nie ma zapisanej długości — przeglądarka
         poznaje ją dopiero po przewinięciu na koniec */
      if(!isFinite(el.duration)){
        let p = zdarzenie(el, "seeked", 20000);
        el.currentTime = 1e9;
        await p;
        p = zdarzenie(el, "seeked", 20000);
        el.currentTime = 0;
        await p;
      }
      const fps = await wykryjTempo(el);
      const film = new Film(el, url, porzuc, f.name, fps);
      film.plik = f;                         /* do dźwięku przy zapisie MP4 */
      return film;
    } catch(err){
      porzuc();
      throw new Error(/obrazu/.test(err.message) ? err.message :
        "Przeglądarka nie potrafi otworzyć tego filmu. MP4 (H.264) i WebM działają wszędzie, MOV zależnie od kodeka.");
    }
  }
  constructor(el, url, porzuc, nazwa, fps){
    this.el = el; this.url = url; this.porzuc = porzuc; this.nazwa = nazwa;
    this.tempoPliku = fps;
    this.szer = el.videoWidth; this.wys = el.videoHeight;
    this.kanwa = kanwa(this.szer, this.wys);
    this.ctx = this.kanwa.getContext("2d");
    this.ustawTempo(0);
  }
  get rodzaj(){ return "film"; }
  /* 0 = tempo z pliku (albo 30, gdy nie dało się go wykryć) */
  ustawTempo(fps){
    this.fps = fps || this.tempoPliku || 30;
    const n = Math.max(1, Math.round(this.el.duration*this.fps));
    this.klatki = Array.from({length: n}, (_, i) => ({t: i/this.fps, dur: 1/this.fps}));
  }
  /* środek klatki — bezpieczny przy zaokrąglonych czasach w pliku */
  czasKlatki(i){ return Math.min(this.el.duration - 0.001, (i + 0.5)/this.fps); }
  async pokaz(i){
    const t = this.czasKlatki(i);
    if(Math.abs(this.el.currentTime - t) > 1e-4 || this.el.seeking){
      const p = zdarzenie(this.el, "seeked", 20000);
      this.el.currentTime = t;
      await p;
    }
    this.ctx.drawImage(this.el, 0, 0);
  }
  /* Podgląd odtwarza prawdziwy film, a z każdej nowej klatki bierze tę, która
     wypada w danym miejscu przy wybranym tempie — przy 12 kl/s obraz zmienia
     się 12 razy na sekundę, jak w zapisie. */
  graj(od, doK, naKlatke, start = od){
    const el = this.el, fps = this.fps;
    this.gra = true;
    let ostatnia = -1;
    const odNowa = () => { el.currentTime = od/fps; ostatnia = -1; };
    const krok = (czas) => {
      if(!this.gra) return;
      const i = Math.floor(czas*fps + 1e-6);
      if(i > doK || el.ended){ odNowa(); el.play().catch(()=>{}); }
      else if(i !== ostatnia && i >= od){
        ostatnia = i;
        this.ctx.drawImage(el, 0, 0);
        naKlatke(i);
      }
      dalej();
    };
    const dalej = "requestVideoFrameCallback" in el
      ? () => el.requestVideoFrameCallback((_, m) => krok(m.mediaTime))
      : () => requestAnimationFrame(() => krok(el.currentTime));
    el.onended = () => { if(this.gra){ odNowa(); el.play().catch(()=>{}); } };
    el.currentTime = start/fps;
    dalej();
    el.play().catch(()=>{ this.gra = false; });
  }
  stop(){ this.gra = false; this.el.onended = null; this.el.pause(); }
  zwolnij(){ this.stop(); this.porzuc(); }
}

/* ---------- animacja (GIF, WebP, APNG) ---------- */

class Animacja {
  /* null, jeśli plik ma jedną klatkę albo przeglądarka nie ma ImageDecoder —
     wtedy wczytuje się jak zwykły obraz */
  static async otworz(f){
    if(typeof ImageDecoder === "undefined") return null;
    try{ if(!(await ImageDecoder.isTypeSupported(f.type))) return null; } catch{ return null; }
    const dek = new ImageDecoder({data: await f.arrayBuffer(), type: f.type});
    try{
      await dek.tracks.ready;
      await dek.completed;
      const tr = dek.tracks.selectedTrack;
      if(!tr || tr.frameCount < 2){ dek.close(); return null; }
      /* długości wszystkich klatek od razu, bo z nich składa się oś czasu;
         poniżej 11 ms przeglądarki pokazują klatkę przez 1/10 s, robimy to samo */
      const klatki = [];
      let t = 0, szer = 0, wys = 0;
      for(let i=0; i<tr.frameCount; i++){
        const {image} = await dek.decode({frameIndex: i});
        if(!i){ szer = image.displayWidth; wys = image.displayHeight; }
        let d = (image.duration || 0)/1e6;
        if(d <= 0.011) d = 0.1;
        image.close();
        klatki.push({t, dur: d});
        t += d;
      }
      return new Animacja(dek, f.name, szer, wys, klatki);
    } catch(err){
      dek.close();
      throw new Error("Nie udało się odczytać animacji.");
    }
  }
  constructor(dek, nazwa, szer, wys, klatki){
    this.dek = dek; this.nazwa = nazwa; this.szer = szer; this.wys = wys; this.klatki = klatki;
    this.kanwa = kanwa(szer, wys);
    this.ctx = this.kanwa.getContext("2d");
    const sr = klatki[klatki.length-1].t / Math.max(1, klatki.length-1) || 0.1;
    this.fps = Math.round(100/sr)/100;
  }
  get rodzaj(){ return "animacja"; }
  ustawTempo(){}               /* tempo jest w pliku, klatka po klatce */
  async pokaz(i){
    const {image} = await this.dek.decode({frameIndex: i});
    this.ctx.clearRect(0, 0, this.szer, this.wys);
    this.ctx.drawImage(image, 0, 0, this.szer, this.wys);
    image.close();
  }
  graj(od, doK, naKlatke, start = od){
    this.gra = true;
    let i = start;
    const krok = async () => {
      if(!this.gra) return;
      const t0 = performance.now();
      await this.pokaz(i);
      if(!this.gra) return;
      naKlatke(i);
      const d = this.klatki[i].dur*1000;
      i = i >= doK ? od : i + 1;
      this.timer = setTimeout(krok, Math.max(0, d - (performance.now() - t0)));
    };
    krok();
  }
  stop(){ this.gra = false; clearTimeout(this.timer); }
  zwolnij(){ this.stop(); this.dek.close(); }
}

/* ---------- stopklatka (zwykły obraz jako film) ---------- */

export const DLUGOSC_STOPKLATKI = 4;   /* s, na start */
class Stopklatka {
  constructor(obraz, nazwa){
    this.kanwa = obraz; this.nazwa = nazwa;
    this.szer = obraz.width; this.wys = obraz.height;
    this.dlugosc = DLUGOSC_STOPKLATKI;
    this.ustawTempo(24);
  }
  get rodzaj(){ return "stopklatka"; }
  /* 0 („jak w pliku") nic tu nie znaczy — zostaje bieżące tempo */
  ustawTempo(fps){
    if(fps) this.fps = fps;
    const n = Math.max(2, Math.round(this.dlugosc*this.fps));
    this.klatki = Array.from({length: n}, (_, i) => ({t: i/this.fps, dur: 1/this.fps}));
  }
  ustawDlugosc(s){ this.dlugosc = s; this.ustawTempo(0); }
  async pokaz(){}              /* obraz się nie zmienia, zmieniają się parametry */
  /* tempo z zegara, nie z licznika: przy wolnym renderze klatki przepadają,
     ale animacja trwa tyle, ile ma trwać */
  graj(od, doK, naKlatke, start = od){
    this.gra = true;
    const t0 = this.klatki[od].t, zakres = this.klatki[doK].t + this.klatki[doK].dur - t0;
    const zegar0 = performance.now() - (this.klatki[start].t - t0)*1000;
    let ostatnia = -1;
    const krok = () => {
      if(!this.gra) return;
      const minelo = ((performance.now() - zegar0)/1000) % zakres;
      const i = Math.min(doK, od + Math.floor(minelo*this.fps + 1e-6));
      if(i !== ostatnia){ ostatnia = i; naKlatke(i); }
      this.timer = requestAnimationFrame(krok);
    };
    krok();
  }
  stop(){ this.gra = false; cancelAnimationFrame(this.timer); }
  zwolnij(){ this.stop(); }
}

/* ---------- stan i sterowanie ----------
   Zakres (od, do) i bieżąca klatka to indeksy w z.klatki. Nie siedzą w S,
   bo to nie wygląd ani ustawienie zapisu, tylko materiał — jak S.img. */
export const W = { z: null, biezaca: 0, od: 0, do: 0, gra: false };

let naKlatke = () => {};
/* app.js podpina tu przerysowanie podglądu i oś czasu */
export function przyKlatce(fn){ naKlatke = fn; }

/* Otwiera plik jako film albo animację. Zwraca źródło, albo null, gdy to
   zwykły obraz (np. GIF z jedną klatką). Poprzednie źródło zamyka dopiero po
   udanym otwarciu nowego. */
export async function otworz(f){
  const z = czyFilm(f) ? await Film.otworz(f) : await Animacja.otworz(f);
  if(!z) return null;
  zamknij();
  W.z = z; W.biezaca = 0; W.od = 0; W.do = z.klatki.length - 1;
  await z.pokaz(0);
  return z;
}
/* zwykły obraz jako film — zamyka poprzednie źródło */
export function animujObraz(obraz, nazwa){
  zamknij();
  const z = new Stopklatka(obraz, nazwa);
  W.z = z; W.biezaca = 0; W.od = 0; W.do = z.klatki.length - 1;
  return z;
}
export function ustawDlugosc(s){
  if(!W.z || W.z.rodzaj !== "stopklatka") return;
  const tB = W.z.klatki[W.biezaca].t;
  W.z.ustawDlugosc(s);
  const n = W.z.klatki.length;
  W.od = 0; W.do = n - 1;
  W.biezaca = Math.min(n - 1, Math.round(tB*W.z.fps));
  idzDo(W.biezaca);
}
export function zamknij(){
  if(!W.z) return;
  W.z.zwolnij();
  W.z = null; W.gra = false;
}

/* Przewijanie: wygrywa ostatnie żądanie. Przy przeciąganiu suwaka przeglądarka
   nie nadąża z przewijaniem filmu, więc pośrednie pozycje przepadają. */
let cel = null, szuka = null;
export function idzDo(i){
  if(!W.z) return;
  cel = Math.max(0, Math.min(W.z.klatki.length - 1, i));
  if(szuka) return;
  szuka = (async () => {
    try{
      while(cel !== null){
        const k = cel, z = W.z; cel = null;
        if(!z) break;
        /* błąd jednego przewinięcia nie może zgubić następnych żądań */
        try{ await z.pokaz(k); }
        catch(err){ if(W.z === z) console.warn("Nie udało się przewinąć filmu.", err); continue; }
        /* w międzyczasie otwarto inne źródło — ta klatka już nikogo nie obchodzi */
        if(W.z !== z) continue;
        W.biezaca = k;
        naKlatke(k);
      }
    } finally{ szuka = null; }
  })();
}

export function graj(){
  if(!W.z || W.gra) return;
  W.gra = true;
  const start = W.biezaca >= W.od && W.biezaca < W.do ? W.biezaca : W.od;
  W.z.graj(W.od, W.do, i => { W.biezaca = i; naKlatke(i); }, start);
}
/* Po zatrzymaniu przewijamy jeszcze raz na tę samą klatkę: w czasie odtwarzania
   pokazywana jest klatka z bieżącej chwili filmu, a zapis bierze środek klatki
   — przy tempie niższym niż w pliku to może być inny obraz. */
export function pauza(){
  if(!W.z || !W.gra) return;
  W.gra = false;
  W.z.stop();
  idzDo(W.biezaca);
}
/* Zakres przeliczamy po czasie: początek po starcie klatki, koniec po jej
   końcu — inaczej 30 → 12 → 30 kl/s gubiłoby ostatnie klatki zakresu. */
export function ustawTempo(fps){
  if(!W.z) return;
  const k = W.z.klatki;
  const tOd = k[W.od].t, tDo = k[W.do].t + k[W.do].dur, tB = k[W.biezaca].t;
  W.z.ustawTempo(fps);
  const n = W.z.klatki.length, ind = s => Math.max(0, Math.min(n - 1, Math.round(s*W.z.fps)));
  W.od = ind(tOd); W.do = Math.max(W.od, ind(tDo) - 1); W.biezaca = ind(tB);
  if(tDo*W.z.fps >= n - 0.5) W.do = n - 1;
  idzDo(W.biezaca);
}
export const czasOd = i => W.z ? W.z.klatki[i].t : 0;
export const dlugosc = () => W.z ? W.z.klatki[W.z.klatki.length-1].t + W.z.klatki[W.z.klatki.length-1].dur : 0;

/* ---------- zapis ---------- */

const doBlob = (k, typ) => new Promise((ok, zle) =>
  k.toBlob(b => b ? ok(b) : zle(new Error("Przeglądarka nie zakodowała klatki (za duży obraz?).")), typ));

const BPP = { dobra: 0.12, wysoka: 0.3, najwyzsza: 0.8 };   /* bity na piksel i klatkę */
/* od najlepszego profilu w dół; Chrome bez sprzętowego kodera ma tylko baseline */
const PROFILE = ["avc1.640034", "avc1.640033", "avc1.64002a", "avc1.4d0034", "avc1.4d0033", "avc1.4d002a",
                 "avc1.42e034", "avc1.42e033", "avc1.42e02a", "avc1.42e01f"];

export const mozeMp4 = () => typeof VideoEncoder !== "undefined";

async function koderMp4(w, h, fps){
  if(!mozeMp4()) throw new Error("Ta przeglądarka nie ma kodera wideo (WebCodecs). Zapisz GIF albo klatki PNG.");
  /* H.264 z próbkowaniem 4:2:0 wymaga parzystych wymiarów — ucinamy ostatni
     wiersz albo kolumnę zamiast skalować, żeby nie rozmyć ditheringu */
  const ew = w & ~1, eh = h & ~1;
  const bitrate = Math.round(Math.min(80e6, Math.max(2e6, ew*eh*fps*BPP[S.jakosc || "wysoka"])));
  let cfg = null;
  for(const codec of PROFILE){
    const c = {codec, width: ew, height: eh, bitrate, framerate: fps, avc: {format: "avc"}, latencyMode: "quality"};
    try{ if((await VideoEncoder.isConfigSupported(c)).supported){ cfg = c; break; } } catch{}
  }
  if(!cfg) throw new Error("Koder H.264 nie przyjmuje rozmiaru " + ew + "×" + eh + " — zmniejsz skalę zapisu.");

  const probki = [];
  let avcC = null, blad = null;
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      if(meta && meta.decoderConfig && meta.decoderConfig.description){
        const d = meta.decoderConfig.description;
        avcC = new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d.slice(0));
      }
      const dane = new Uint8Array(chunk.byteLength);
      chunk.copyTo(dane);
      probki.push({dane, pts: chunk.timestamp, dur: chunk.duration || 0, klucz: chunk.type === "key"});
    },
    error: e => { blad = e; }
  });
  enc.configure(cfg);
  const przyciete = (ew !== w || eh !== h) ? kanwa(ew, eh) : null;
  const co = Math.max(1, Math.round(fps*2));     /* klatka kluczowa co ~2 s: przewijanie w montażówce */
  let k = 0;
  return {
    async dodaj(pts, dur){
      if(blad) throw new Error("Koder wideo: " + blad.message);
      let zrodlo = out;
      if(przyciete){ przyciete.getContext("2d").drawImage(out, 0, 0); zrodlo = przyciete; }
      const kl = new VideoFrame(zrodlo, {timestamp: pts, duration: dur});
      enc.encode(kl, {keyFrame: k++ % co === 0});
      kl.close();
      /* nie zasypujemy kodera — każda klatka w kolejce to pełna bitmapa w pamięci */
      while(enc.encodeQueueSize > 3 && !blad) await new Promise(r => setTimeout(r, 4));
    },
    async zakoncz(dzwiek){
      await enc.flush();
      enc.close();
      if(blad) throw new Error("Koder wideo: " + blad.message);
      for(const p of probki) if(!p.dur) p.dur = Math.round(1e6/fps);
      return new Blob(zlozMp4({szer: ew, wys: eh, avcC, probki, dzwiek}), {type: "video/mp4"});
    },
    porzuc(){ try{ if(enc.state !== "closed") enc.close(); } catch{} },
    uwaga: ew !== w || eh !== h ? "wymiar przycięty do parzystego (" + ew + "×" + eh + ")" : ""
  };
}

function koderGif(w, h, dlugosci){
  const gif = new Gif(w, h), opoz = opoznieniaGif(dlugosci), ctx = out.getContext("2d");
  let k = 0;
  return {
    async dodaj(){ gif.dodaj(ctx.getImageData(0, 0, w, h).data, opoz[k++]); },
    async zakoncz(){ return gif.blob(); },
    porzuc(){},
    get uwaga(){
      return gif.kwantyzowane ? "klatek z ponad 256 kolorami, zredukowanych: " + gif.kwantyzowane : "";
    }
  };
}

function koderKlatek(baza, od){
  const zip = new Zip();
  let k = 0;
  return {
    async dodaj(){
      /* numer klatki z filmu, nie z zakresu — łatwiej odnaleźć ją w oryginale */
      const nr = String(od + k++ + 1).padStart(5, "0");
      zip.dodaj(baza + "-" + nr + ".png", new Uint8Array(await (await doBlob(out, "image/png")).arrayBuffer()));
    },
    async zakoncz(){ return zip.blob(); },
    porzuc(){},
    uwaga: ""
  };
}

/* Plik wideo ma jeden rozmiar, a animowana pikselizacja zmienia wymiar
   obrazu o parę pikseli (bufor to zaokrąglone W/pix). Klatkę o innym
   wymiarze rozciągamy do rozmiaru pierwszej, bez wygładzania, prosto na
   płótnie wyjściowym — koder czyta stamtąd. */
function wyrownaj([w, h]){
  if(out.width === w && out.height === h) return;
  const c = kanwa(out.width, out.height);
  c.getContext("2d").drawImage(out, 0, 0);
  out.width = w; out.height = h;
  const x = out.getContext("2d");
  x.imageSmoothingEnabled = false;
  x.drawImage(c, 0, 0, w, h);
}

/* ---------- dźwięk ----------
   Ścieżkę dźwiękową z pliku filmu dekoduje przeglądarka (decodeAudioData,
   od razu przeliczona na 48 kHz), kroimy ją do zakresu zapisu i kodujemy
   AudioEncoderem: AAC, a gdy go nie ma — Opus (MP4 z Opusem odtworzy
   przeglądarka i VLC, QuickTime nie). Zwraca null, gdy film nie ma dźwięku. */
const CZESTOTLIWOSC = 48000;
async function dzwiekFilmu(plik, od, doo){
  if(!plik || typeof AudioEncoder === "undefined") throw new Error("przeglądarka nie ma kodera dźwięku");
  let buf;
  /* pusty callback błędu: bez niego Chrome bywa, że loguje odrzucenie (film
     bez dźwięku) jako błąd w konsoli, choć łapiemy je niżej */
  try{ buf = await new OfflineAudioContext(1, 1, CZESTOTLIWOSC).decodeAudioData(await plik.arrayBuffer(), undefined, () => {}); }
  catch{ return null; }
  const kanaly = Math.min(2, buf.numberOfChannels);
  const s0 = Math.max(0, Math.round(od*CZESTOTLIWOSC)), s1 = Math.min(buf.length, Math.round(doo*CZESTOTLIWOSC));
  if(s1 - s0 < 1024) return null;
  let cfg = null, kodek = "aac";
  for(const [k, c] of [["aac", {codec: "mp4a.40.2", aac: {format: "aac"}}], ["opus", {codec: "opus"}]]){
    const pelny = {...c, sampleRate: CZESTOTLIWOSC, numberOfChannels: kanaly, bitrate: 192000};
    try{ if((await AudioEncoder.isConfigSupported(pelny)).supported){ cfg = pelny; kodek = k; break; } } catch{}
  }
  if(!cfg) throw new Error("koder dźwięku nie przyjmuje ani AAC, ani Opusa");
  const probki = [];
  let opis = null, blad = null;
  const enc = new AudioEncoder({
    output: (ch, meta) => {
      const d = meta && meta.decoderConfig && meta.decoderConfig.description;
      if(d && !opis) opis = new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d.slice(0));
      const dane = new Uint8Array(ch.byteLength); ch.copyTo(dane);
      probki.push({dane, pts: ch.timestamp, dur: ch.duration || 0});
    },
    error: e => { blad = e; }
  });
  enc.configure(cfg);
  const KAWALEK = 4800;                         /* 0,1 s */
  for(let s = s0; s < s1; s += KAWALEK){
    const ile = Math.min(KAWALEK, s1 - s), dane = new Float32Array(ile*kanaly);
    for(let c=0; c<kanaly; c++) dane.set(buf.getChannelData(c).subarray(s, s + ile), c*ile);
    const ad = new AudioData({format: "f32-planar", sampleRate: CZESTOTLIWOSC, numberOfFrames: ile, numberOfChannels: kanaly,
                              timestamp: Math.round((s - s0)*1e6/CZESTOTLIWOSC), data: dane});
    enc.encode(ad); ad.close();
    if(blad) break;
  }
  await enc.flush(); enc.close();
  if(blad) throw new Error("koder dźwięku: " + blad.message);
  for(const p of probki) if(!p.dur) p.dur = Math.round((kodek === "aac" ? 1024 : 960)*1e6/CZESTOTLIWOSC);
  if(kodek === "aac" && !opis) throw new Error("koder AAC nie oddał opisu strumienia");
  return {kodek, opis, czestotliwosc: CZESTOTLIWOSC, kanaly, bitrate: 192000, probki};
}

/* Liczy cały zakres klatka po klatce w bieżących ustawieniach i oddaje plik.
   Przerwanie kończy po bieżącej klatce i zapisuje to, co gotowe. */
export async function zapiszWideo({postep = () => {}, przerwano = () => false} = {}){
  const z = W.z;
  if(!z) throw new Error("Nie ma wczytanego filmu.");
  if(W.gra){ W.gra = false; z.stop(); }
  while(szuka) await szuka;

  const fmt = S.fmt, od = W.od, doK = W.do, n = doK - od + 1;
  const baza = (z.nazwa.replace(/\.[^.]+$/, "") || "film").replace(/[\\/:*?"<>|]+/g, "-");
  const dlugosci = z.klatki.slice(od, doK + 1).map(k => k.dur);
  const t0 = z.klatki[od].t;
  let koder = null, zrobione = 0, przerwane = false, rozmiar = null;
  const start = performance.now();
  try{
    for(let k=0; k<n; k++){
      if(przerwano()){ przerwane = true; break; }
      const i = od + k;
      const minelo = (performance.now() - start)/1000;
      postep(k, n, k ? minelo/k*(n - k) : null);
      await z.pokaz(i);
      zastosujAnimacje(S, z.klatki[i].t);
      S.klatkaNr = i;
      /* stabilizacja: klatki po kolei, pierwsza bez pamięci z podglądu */
      await renderuj(S.scl, {keep: true, pamietaj: true, zPamieci: k > 0});
      if(!koder){
        rozmiar = [out.width, out.height];
        koder = fmt === "mp4" ? await koderMp4(out.width, out.height, z.fps)
              : fmt === "gif" ? koderGif(out.width, out.height, dlugosci)
              : koderKlatek(baza, od);
      }
      wyrownaj(rozmiar);
      const kl = z.klatki[i];
      await koder.dodaj(Math.round((kl.t - t0)*1e6), Math.round(kl.dur*1e6));
      zrobione++;
    }
    if(!zrobione) return {blob: null, zrobione, wszystkich: n, przerwane};
    /* dźwięk z oryginału, przycięty do tego, co faktycznie się zapisało */
    let dz = null, uwagaDzwieku = "";
    if(fmt === "mp4" && S.dzwiek && z.rodzaj === "film"){
      const ost = z.klatki[od + zrobione - 1];
      postep(zrobione, n, null, "Koduję dźwięk…");
      try{ dz = await dzwiekFilmu(z.plik, t0, ost.t + ost.dur); uwagaDzwieku = dz ? "z dźwiękiem (" + (dz.kodek === "aac" ? "AAC" : "Opus") + ")" : "film nie ma dźwięku"; }
      catch(err){ uwagaDzwieku = "bez dźwięku — " + err.message; }
    }
    const blob = await koder.zakoncz(dz);
    const roz = fmt === "mp4" ? ".mp4" : fmt === "gif" ? ".gif" : "-klatki.zip";
    return {blob, nazwa: baza + "-" + NAZWA_TRYBU[S.mode] + roz,
            zrobione, wszystkich: n, przerwane, uwaga: [koder.uwaga, uwagaDzwieku].filter(Boolean).join(" · ")};
  } catch(err){
    if(koder) koder.porzuc();
    throw err;
  } finally {
    /* podgląd wraca na klatkę sprzed zapisu */
    idzDo(W.biezaca);
  }
}
