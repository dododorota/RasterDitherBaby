/* Spinacz: kontrolki, presety, wczytywanie pliku, zapis. */
import { S, DEFAULTS, LOOK } from "./state.js";
import { $, out, octx } from "./dom.js";
import { saveSVG } from "./vector.js";
import { PRESETS } from "./presets.js";
import { czytajPalete, paletaZDanych, domyslnaNazwa, MAX_KOLOROW } from "./palette-files.js";
import { przetworzFolder } from "./batch.js";
import { renderuj, NAZWA_TRYBU } from "./render.js";
import { K, TRYBY, utworz as utworzKomp, dodaj as dodajWarstwe, usun as usunWarstwe, przesun as przesunWarstwe,
         zakoncz as zakonczKomp, zloz, trafiona, wytnij, kolorPod, maluj, wyczyscPedzel, kluczWarstwy, dodajEfekt as dodajWarstweEfektu, czyEfekt, wytnijAI } from "./warstwy.js";
import { tekstAscii, ZESTAWY } from "./ascii.js";
import { EFEKTY, wpisEfektu, lista, dodaj as dodajEfekt, usun as usunEfekt, przelacz as przelaczEfekt, przesun as przesunEfekt,
         baza as bazaEfektu, kopie as kopieEfektow, ustawParametrKopii, czyMoznaDodac } from "./stos.js";
import { BIBLIOTEKA, wpisPalety, palette, paletaGradientu, rgb2hex, hex2rgb, TUSZE_RISO } from "./palettes.js";
import { normalizujKsztalt, biezacyQR } from "./siatki.js";
import { paletaZPikseli } from "./kwantyzacja.js";
import { fit } from "./image.js";
import { W, otworz as otworzWideo, zamknij as zamknijWideo, idzDo, graj, pauza, ustawTempo,
         czasOd, dlugosc, przyKlatce, zapiszWideo, czyFilm, czyMozeAnimacja, FORMATY_WIDEO, mozeMp4,
         animujObraz, ustawDlugosc, DLUGOSC_STOPKLATKI } from "./video.js";
import { SCIEZKI, KONW, animowane, czyAnimowany, kluczW, ustawKlucz, usunKlucz, usunSciezke, zastosuj as zastosujAnimacje,
         zrzut as zrzutAnimacji, wczytaj as wczytajAnimacje, KRZYWE, RODZAJE_KRZYWYCH, ustawKrzywa, ustawKrzywaKlucza } from "./animacja.js";

/* ---------- pętla ---------- */
let queued=false;
/* napis na przycisku zapisu dla każdego formatu — używany już przy pierwszym syncUI() */
const NAPISY = {png:"Zapisz PNG", svg:"Zapisz SVG", txt:"Zapisz TXT", mp4:"Zapisz MP4", gif:"Zapisz GIF", klatki:"Zapisz klatki (ZIP)"};
/* przetwarzanie folderu albo zapis filmu: panel zablokowany, podgląd nie rysuje */
let wTrakcie = false, przerwij = false;
function dims(){
  $("#dims").textContent = "Podgląd " + out.width + "×" + out.height + " px · zapis " +
    (out.width*S.scl) + "×" + (out.height*S.scl) + " px";
}
/* Dither liczy się w workerze, więc render jest asynchroniczny. Gdy w trakcie
   liczenia ruszy się suwak, to zadanie zostaje wyparte i zwraca null —
   rysuje dopiero najświeższe. */
async function render(){
  /* w trakcie zapisu filmu płótno należy do eksportu — podgląd wraca po nim */
  if(!S.img || wTrakcie) return;
  const slow = setTimeout(()=>{ $("#dims").textContent = "Liczę…"; }, 200);
  /* przy odtwarzaniu klatki idą po kolei — stabilizacja może z nich korzystać */
  const r = await renderuj(1, W.gra ? {pamietaj: true, zPamieci: true} : undefined);
  clearTimeout(slow);
  if(!r) return;
  dims();
  /* licznik gotowych renderów — testy przeglądarkowe czekają na niego zamiast zgadywać czas */
  out.dataset.nr = String((+out.dataset.nr || 0) + 1);
}
function schedule(){
  zapamietajStan();
  podswietlPresety();
  znacznikiSekcji();
  if(queued) return;
  queued=true;
  requestAnimationFrame(()=>{ queued=false; render(); });
}
/* ---------- cofnij / ponów ----------
   Historia wyglądu: migawki kluczy LOOK (to samo, co idzie do presetu), bez
   parametrów animowanych — tymi rządzi oś czasu. Migawka 0,4 s po ostatniej
   zmianie, więc całe przeciągnięcie suwaka to jeden krok; najwyżej 100.
   Materiały (obraz, warstwy, paleta własna, klatki kluczowe) — poza historią.
   Wołane z schedule(), więc każda zmiana panelu trafia tu sama. */
/* stan kadrowania — tu, wysoko: kompUI() woła kadrUI() już przy starcie (TDZ) */
/* sekcje grupy rastra: [element, klucze S] — ustawiane na końcu pliku, czytane z schedule() */
let SEKCJE = null;
const KADR = {aktywny: false, x: 0, y: 0, w: 0, h: 0, oryginal: null, ruch: null};
const HIST = {stos: [], poz: -1, wstrzymaj: false, timer: 0};
const MAX_HIST = 100;
function migawkaWygladu(){
  const o = {};
  for(const k of LOOK) if(!czyAnimowany(k)) o[k] = S[k];
  return JSON.stringify(o);
}
function zapamietajStan(){
  if(HIST.wstrzymaj || W.gra || wTrakcie) return;
  clearTimeout(HIST.timer);
  HIST.timer = setTimeout(()=>{
    const m = migawkaWygladu();
    if(HIST.stos[HIST.poz] === m) return;
    HIST.stos.splice(HIST.poz + 1);
    HIST.stos.push(m);
    if(HIST.stos.length > MAX_HIST) HIST.stos.shift();
    HIST.poz = HIST.stos.length - 1;
    historiaUI();
  }, 400);
}
function historiaUI(){
  $("#cofnij").disabled = HIST.poz <= 0;
  $("#ponow").disabled = HIST.poz >= HIST.stos.length - 1;
}
/* zapis bieżącego stanu od razu, bez czekania 0,4 s — przed i po zmianach,
   które mają być osobnym krokiem (preset) */
function utrwalStan(){
  if(HIST.wstrzymaj) return;
  clearTimeout(HIST.timer);
  const teraz = migawkaWygladu();
  if(HIST.stos[HIST.poz] !== teraz){ HIST.stos.splice(HIST.poz + 1); HIST.stos.push(teraz); if(HIST.stos.length > MAX_HIST) HIST.stos.shift(); HIST.poz = HIST.stos.length - 1; }
  historiaUI();
}
function krokHistorii(o){
  /* niezapisana jeszcze zmiana (w ciągu 0,4 s) — najpierw ją zapisz */
  utrwalStan();
  const p = HIST.poz + o;
  if(p < 0 || p >= HIST.stos.length) return;
  HIST.poz = p;
  HIST.wstrzymaj = true;
  Object.assign(S, JSON.parse(HIST.stos[p]));
  syncUI();
  schedule();
  HIST.wstrzymaj = false;
  historiaUI();
}

/* ---------- kontrolki ----------
   Jedna tabela zamiast rozsypanych wywołań. Dzięki niej syncUI() potrafi
   odtworzyć cały panel ze stanu, a presety — te wbudowane i te z pliku — nie
   muszą wiedzieć, jakie kontrolki w ogóle istnieją. */
const SUWAKI = [
  {id:"bri",   key:"bri",   opis:v=>v},
  {id:"con",   key:"con",   opis:v=>v},
  {id:"gam",   key:"gam",   opis:v=>v.toFixed(2),        zS:v=>v/100, naS:v=>Math.round(v*100)},
  {id:"cienie",    key:"cienie",    opis:v=>v>0?"+"+v:String(v)},
  {id:"swiatla",   key:"swiatla",   opis:v=>v>0?"+"+v:String(v)},
  {id:"nasycenie", key:"nasycenie", opis:v=>v>0?"+"+v:String(v)},
  {id:"odcien",    key:"odcien",    opis:v=>v+"°"},
  {id:"ostrosc",   key:"ostrosc",   opis:v=>v?v+"%":"brak"},
  {id:"odszum",    key:"odszum",    opis:v=>v?v+"%":"brak"},
  {id:"glebia",    key:"glebia",    opis:v=>v+(v<5?" poziomy":" poziomów")+" na kanał · "+(v**3).toLocaleString("pl-PL")+" kolorów"},
  {id:"pix",   key:"pix",   opis:v=>v+"×"},
  {id:"str",   key:"str",   opis:v=>Math.round(v*100)+"%", zS:v=>v/100, naS:v=>Math.round(v*100)},
  {id:"thr",   key:"thr",   opis:v=>v},
  {id:"cell",  key:"cell",  opis:v=>v},
  {id:"ang",   key:"ang",   opis:v=>v+"°"},
  {id:"dot",   key:"dot",   opis:v=>v.toFixed(2),        zS:v=>v/100, naS:v=>Math.round(v*100)},
  {id:"blur",  key:"blur",  opis:v=>v?v+" px":"brak"},
  {id:"mis",   key:"mis",   opis:v=>(v/10).toFixed(1)},
  {id:"grain", key:"grain", opis:v=>v},
  {id:"scl",   key:"scl",   opis:v=>v+"×"},
  {id:"sortOd", key:"sortOd", opis:v=>v+"%"},
  {id:"sortDo", key:"sortDo", opis:v=>v+"%"},
  {id:"rgb",    key:"rgb",    opis:v=>v?v+" px":"brak"},
  {id:"rgbKat", key:"rgbKat", opis:v=>v+"°"},
  {id:"wygl",   key:"wygl",   opis:v=>v?String(v):"brak — dokładne"},
  {id:"glow",     key:"glow",     opis:v=>v?v+"%":"brak"},
  {id:"glowR",    key:"glowR",    opis:v=>v+" px"},
  {id:"glowProg", key:"glowProg", opis:v=>v+"%"},
  {id:"chrom",      key:"chrom",      opis:v=>v?(v/10).toFixed(1).replace(".", ",")+"%":"brak"},
  {id:"jpegJakosc", key:"jpegJakosc", opis:v=>String(v)},
  {id:"jpegGlitch", key:"jpegGlitch", opis:v=>v?v+"%":"brak"},
  {id:"jpegZiarno", key:"jpegZiarno", opis:v=>String(v)},
  {id:"tint",       key:"tint",       opis:v=>v?v+"%":"brak"},
  {id:"gwiazdy",    key:"gwiazdy",    opis:v=>v?v+"%":"brak"},
  {id:"gwProg",     key:"gwProg",     opis:v=>v+"%"},
  {id:"gwRamiona",  key:"gwRamiona",  opis:v=>String(v)},
  {id:"gwDlugosc",  key:"gwDlugosc",  opis:v=>v+" px"},
  {id:"gwKat",      key:"gwKat",      opis:v=>v+"°"},
  {id:"faktSkala",  key:"faktSkala",  opis:v=>v+" px"},
  {id:"faktKrycie", key:"faktKrycie", opis:v=>v+"%"},
  {id:"postJas",    key:"postJas",    opis:v=>v>0?"+"+v:String(v)},
  {id:"postKon",    key:"postKon",    opis:v=>v>0?"+"+v:String(v)},
  {id:"postNas",    key:"postNas",    opis:v=>v>0?"+"+v:String(v)},
  {id:"winieta",    key:"winieta",    opis:v=>v?v+"%":"brak"},
  {id:"postZiarno", key:"postZiarno", opis:v=>v?v+"%":"brak"},
  {id:"czasSzum",   key:"czasSzum",   opis:v=>v?v+"%":"brak"},
  {id:"czasDrganie",key:"czasDrganie",opis:v=>v?v+" px":"brak"},
  {id:"asciiRozmiar",key:"asciiRozmiar",opis:v=>v+" px"},
  {id:"stabil",     key:"stabil",     opis:v=>v?v+"%":"brak"}
];
const PTASZKI = ["inv","serp","percept","czasCykl","asciiDither"];
const LISTY   = ["algo","pal","mapa","shape","inkmode","sort","tintTryb","faktura","faktTryb","asciiZestaw","asciiTryb","asciiKolor","glowZrodlo"];
/* jeden klucz może mieć kilka pól: farba i papier są i w palecie ditheringu,
   i w siatce rastra */
const KOLORY  = [{id:"ink",key:"ink"}, {id:"paper",key:"paper"}, {id:"ink-r",key:"ink"}, {id:"paper-r",key:"paper"}, {id:"tintKolor",key:"tintKolor"}, {id:"ink-a",key:"ink"}, {id:"paper-a",key:"paper"}, {id:"glowKolor",key:"glowKolor"}];

/* ---------- risograf: panel czterech farb ----------
   Markup farb powstaje tu z DEFAULTS (cztery razy to samo różniłoby się
   tylko numerem), a kontrolki trafiają do tych samych tabel co reszta panelu
   — przed podpięciem zdarzeń i pierwszym syncUI(). Zakładka wybiera, którą
   farbę widać; to stan panelu, nie wygląd. */
const ZRODLA_RISO = [["farba","Swój kolor"], ["jasnosc","Jasność"], ["r","Kanał R"], ["g","Kanał G"], ["b","Kanał B"],
                     ["c","CMYK — C"], ["m","CMYK — M"], ["y","CMYK — Y"], ["k","CMYK — K"]];
let farbaRiso = 1;
(function panelRiso(){
  const box = document.querySelector("#riso-warstwy"), zak = document.querySelector("#riso-zakladki");
  const ksztalty = document.querySelector("#shape").innerHTML;
  for(let i=1; i<=4; i++){
    const b = document.createElement("button"); b.setAttribute("role", "tab"); b.id = "riso-z" + i;
    b.innerHTML = "<i></i>" + i; b.setAttribute("aria-label", "Farba " + i);
    zak.appendChild(b);
    const suwak = (k, et, min, max) => `<div class="row"><label for="${k}${i}">${et}</label><span class="val" id="${k}${i}-v"></span></div>
      <input type="range" id="${k}${i}" min="${min}" max="${max}" value="${DEFAULTS[k + i]}">`;
    const d = document.createElement("div"); d.className = "riso-warstwa hidden"; d.id = "riso-w" + i;
    d.innerHTML = `<div class="swatches"><input type="color" id="risoK${i}" value="${DEFAULTS["risoK" + i]}" aria-label="Kolor farby ${i}">
        <select id="risoT${i}" class="tusz" aria-label="Tusz riso dla farby ${i}"><option value="">Tusz riso…</option>${TUSZE_RISO.map(([n, k]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
      <div class="row"><label for="risoZ${i}">Skąd ilość farby</label></div>
      <select id="risoZ${i}">${ZRODLA_RISO.map(([v, n]) => `<option value="${v}">${n}</option>`).join("")}</select>
      ${suwak("risoA", "Kąt", 0, 180)}${suwak("risoC", "Gęstość (px)", 3, 40)}
      <div class="row"><label for="risoS${i}">Kształt</label></div><select id="risoS${i}">${ksztalty}</select>
      ${suwak("risoO", "Krycie", 0, 100)}${suwak("risoX", "Pasowanie — poziomo", -30, 30)}${suwak("risoY", "Pasowanie — pionowo", -30, 30)}${suwak("risoR", "Pasowanie — obrót", -50, 50)}`;
    box.appendChild(d);
    for(const [k, opis] of [["risoA", v => v + "°"], ["risoC", v => String(v)], ["risoO", v => v + "%"],
                            ["risoX", v => v + " px"], ["risoY", v => v + " px"], ["risoR", v => (v/10).toFixed(1).replace(".", ",") + "°"]])
      SUWAKI.push({id: k + i, key: k + i, opis});
    LISTY.push("risoZ" + i, "risoS" + i);
    KOLORY.push({id: "risoK" + i, key: "risoK" + i});
    b.addEventListener("click", () => { farbaRiso = i; risoUI(); });
    /* tusz z biblioteki tylko ustawia kolor — sama lista nie jest stanem */
    d.querySelector("#risoT" + i).addEventListener("change", e => {
      if(!e.target.value) return;
      const k = d.querySelector("#risoK" + i);
      k.value = e.target.value; k.dispatchEvent(new Event("input", {bubbles: true}));
    });
  }
  SUWAKI.push({id: "risoIle", key: "risoIle", opis: v => String(v)},
    {id: "srodekX", key: "srodekX", opis: v => v + "%"}, {id: "srodekY", key: "srodekY", opis: v => v + "%"},
    {id: "fala", key: "fala", opis: v => v ? v + "%" : "brak"},
    {id: "gladkosc", key: "gladkosc", opis: v => v ? v + "%" : "brak"},
    {id: "liniaMin", key: "liniaMin", opis: v => v + "%"}, {id: "liniaMax", key: "liniaMax", opis: v => v + "%"},
    {id: "walek", key: "walek", opis: v => v ? v + "%" : "brak"},
    {id: "papierSila", key: "papierSila", opis: v => v + "%"},
    {id: "zlewanie", key: "zlewanie", opis: v => v ? v + "%" : "brak"},
    {id: "scalanie", key: "scalanie", opis: v => v ? v + "%" : "brak"},
    {id: "zaokraglenie", key: "zaokraglenie", opis: v => v ? v + "%" : "brak"},
    {id: "stipIter", key: "stipIter", opis: v => String(v)},
    {id: "qrWersja", key: "qrWersja", opis: v => v > 1 ? "wersja " + v + "+" : "najmniejsza"}, {id: "qrRozmiar", key: "qrRozmiar", opis: v => v + "%"},
    {id: "boki", key: "boki", opis: v => String(v)}, {id: "wciecie", key: "wciecie", opis: v => v ? v + "%" : "brak"},
    {id: "wykladnik", key: "wykladnik", opis: v => (v/10).toFixed(1).replace(".", ",")},
    {id: "obrys", key: "obrys", opis: v => v ? (v/10).toFixed(1).replace(".", ",") + " px" : "brak"},
    {id: "tonPowt", key: "tonPowt", opis: v => v > 1 ? "×" + v : "brak"}, {id: "tonPrzes", key: "tonPrzes", opis: v => v + "%"},
    {id: "odpowiedz", key: "odpowiedz", opis: v => (v/100).toFixed(2).replace(".", ","), zS: v => v, naS: v => v},
    {id: "minPunkt", key: "minPunkt", opis: v => v + "%"},
    {id: "odksztalcenie", key: "odksztalcenie", opis: v => v ? v + "%" : "brak"}, {id: "odksztSkala", key: "odksztSkala", opis: v => v + " px"},
    {id: "odksztPrzes", key: "odksztPrzes", opis: v => String(v)},
    {id: "rozciag", key: "rozciag", opis: v => v + "%"}, {id: "pochyl", key: "pochyl", opis: v => v + "°"},
    {id: "chmury", key: "chmury", opis: v => v ? v + "%" : "brak"}, {id: "nierowne", key: "nierowne", opis: v => v ? v + "%" : "brak"},
    {id: "drganie", key: "drganie", opis: v => v ? v + "%" : "brak"}, {id: "postrzep", key: "postrzep", opis: v => v ? v + "%" : "brak"},
    {id: "risoLos", key: "risoLos", opis: v => v ? v + "%" : "brak"}, {id: "risoWariant", key: "risoWariant", opis: v => String(v)},
    {id: "szorstkosc", key: "szorstkosc", opis: v => v ? v + "%" : "brak"}, {id: "rozlanie", key: "rozlanie", opis: v => v ? v + "%" : "brak"},
    {id: "plamy", key: "plamy", opis: v => v ? v + "%" : "brak"}, {id: "dziury", key: "dziury", opis: v => v ? v + "%" : "brak"});
  LISTY.push("siatka", "papierRodzaj", "rasterGrad", "tonRodzaj", "qrKorekcja");
  PTASZKI.push("gradOdwroc", "rozmiarJasnosc", "pustePrzezr", "obrotZSiatka");
  /* gradienty do mapy w rastrze: palety „według jasności" z biblioteki */
  const sel = document.querySelector("#rasterGrad");
  let grupa = null, nazwa = "";
  for(const p of BIBLIOTEKA) if(p.mapa === "jasnosc" && p.kolory.length >= 2){
    if(p.kat !== nazwa){ grupa = document.createElement("optgroup"); grupa.label = nazwa = p.kat; sel.appendChild(grupa); }
    const o = document.createElement("option"); o.value = p.id; o.textContent = p.nazwa; grupa.appendChild(o);
  }
})();
/* widoczność: farby riso, zakładki tylko do liczby farb, środek przy okręgach
   i spirali, odkształcenie przy liniach (także na którejkolwiek farbie riso) */
function risoUI(){
  const riso = S.inkmode === "riso", ile = Math.max(1, Math.min(4, S.risoIle | 0));
  if(farbaRiso > ile) farbaRiso = ile;
  document.querySelector("#riso-opcje").classList.toggle("hidden", !riso);
  for(let i=1; i<=4; i++){
    const z = document.querySelector("#riso-z" + i);
    z.classList.toggle("hidden", i > ile);
    z.setAttribute("aria-selected", i === farbaRiso);
    z.querySelector("i").style.background = S["risoK" + i];
    document.querySelector("#riso-w" + i).classList.toggle("hidden", i !== farbaRiso);
  }
  const linie = S.shape === "pasy" || (riso && [1, 2, 3, 4].slice(0, ile).some(i => S["risoS" + i] === "pasy"));
  document.querySelector("#fala-opcje").classList.toggle("hidden", !linie);
  document.querySelector("#srodek-opcje").classList.toggle("hidden", !(S.siatka === "okregi" || S.siatka === "spirala" || S.siatka === "promienie"));
  document.querySelector("#riso-wariant-opcje").classList.toggle("hidden", !(S.risoLos > 0));
  document.querySelector("#papier-opcje").classList.toggle("hidden", S.papierRodzaj === "gladki");
  document.querySelector("#ton-opcje").classList.toggle("hidden", !(S.tonPowt > 1 || S.tonPrzes > 0));
  const ksz = riso ? [S.shape, ...[1, 2, 3, 4].slice(0, ile).map(i => S["risoS" + i])] : [S.shape];
  document.querySelector("#wielokat-opcje").classList.toggle("hidden", !ksz.includes("wielokat"));
  document.querySelector("#superelipsa-opcje").classList.toggle("hidden", !ksz.includes("superelipsa"));
  document.querySelector("#znak-opcje").classList.toggle("hidden", !ksz.includes("znak"));
  document.querySelector("#wlasny-opcje").classList.toggle("hidden", !ksz.includes("wlasny"));
  document.querySelector("#znak").value = S.znak;
  document.querySelector("#odkszt-opcje").classList.toggle("hidden", !(S.odksztalcenie > 0));
  document.querySelector("#stipple-opcje").classList.toggle("hidden", S.siatka !== "stipple");
  document.querySelector("#qr-opcje").classList.toggle("hidden", S.siatka !== "qr");
  if(S.siatka === "qr"){
    document.querySelector("#qrTekst").value = S.qrTekst;
    const q = biezacyQR();
    document.querySelector("#qr-info").textContent = q
      ? "Wersja " + q.wersja + " — " + q.rozmiar + "×" + q.rozmiar + " modułów. Środek każdego modułu niesie kod, reszta to raster obrazu. Sprawdź telefonem przed drukiem."
      : "Za dużo tekstu na kod QR — skróć treść albo wybierz mniejszą odporność.";
  }
  document.querySelector("#scalanie-hint").classList.toggle("hidden", !(S.scalanie > 0 && (S.siatka !== "kwadrat" || S.rozciag !== 100 || S.pochyl !== 0)));
  const barwne = S.inkmode === "obraz" || S.inkmode === "gradient";
  document.querySelector("#barwne-opcje").classList.toggle("hidden", !barwne);
  document.querySelector("#grad-opcje").classList.toggle("hidden", S.inkmode !== "gradient");
  /* tusz: pokaż nazwę, jeśli kolor farby jest z biblioteki */
  for(let i=1; i<=4; i++){
    const t = document.querySelector("#risoT" + i), k = String(S["risoK" + i]).toLowerCase();
    t.value = TUSZE_RISO.some(([, h]) => h === k) ? k : "";
  }
}

/* Własny kształt: plik SVG wstawiony na chwilę do strony (niewidoczny), żeby
   przeglądarka sama policzyła geometrię — krzywe, łuki, przekształcenia.
   Każdy kształt próbkowany po długości (getPointAtLength) w układzie
   dokumentu (getCTM); skok między próbkami = nowy podkontur (polecenie M). */
async function wczytajKsztaltSVG(f){
  const tekst = await f.text();
  const doc = new DOMParser().parseFromString(tekst, "image/svg+xml");
  const svg = doc.querySelector("svg");
  const info = document.querySelector("#wlasny-info");
  if(!svg){ info.textContent = "To nie jest plik SVG."; return; }
  const box = document.createElement("div");
  box.style.cssText = "position:absolute; left:-10000px; top:0; width:400px; height:400px; visibility:hidden";
  const kopia = document.importNode(svg, true);
  for(const s of kopia.querySelectorAll("script, foreignObject")) s.remove();
  box.appendChild(kopia); document.body.appendChild(box);
  const kontury = [];
  try{
    for(const el of kopia.querySelectorAll("path, polygon, polyline, rect, circle, ellipse, line")){
      if(!el.getTotalLength) continue;
      const L = el.getTotalLength(), m = el.getCTM();
      if(!(L > 0) || !m) continue;
      const n = Math.min(4000, Math.max(64, Math.round(L))), krok = L/n;
      let biezacy = [], pop = null;
      for(let i=0; i<=n; i++){
        const p = el.getPointAtLength(Math.min(L, i*krok)), x = m.a*p.x + m.c*p.y + m.e, y = m.b*p.x + m.d*p.y + m.f;
        if(pop && Math.hypot(x - pop[0], y - pop[1]) > krok*3*Math.hypot(m.a, m.b)){ if(biezacy.length > 2) kontury.push(biezacy); biezacy = []; }
        biezacy.push([x, y]); pop = [x, y];
      }
      if(biezacy.length > 2) kontury.push(biezacy);
    }
  } finally { box.remove(); }
  const k = normalizujKsztalt(kontury);
  if(!k){ info.textContent = "Nie znalazłam w pliku zamkniętych kształtów."; return; }
  S.ksztaltWlasny = JSON.stringify(k);
  info.textContent = "Kształt: " + f.name + " — " + k.length + " " + (k.length === 1 ? "kontur" : "kontury") + ".";
  schedule();
}
document.querySelector("#wlasny-wczytaj").addEventListener("click", () => document.querySelector("#wlasny-plik").click());
document.querySelector("#wlasny-plik").addEventListener("change", e => { if(e.target.files[0]) wczytajKsztaltSVG(e.target.files[0]); e.target.value = ""; });

/* treść kodu QR — pole tekstowe; opis wersji odświeża risoUI() */
document.querySelector("#qrTekst").addEventListener("input", e=>{ S.qrTekst = e.target.value; risoUI(); schedule(); });

/* znaki punktów — pole tekstowe, poza tabelami kontrolek (jak własne znaki ASCII) */
document.querySelector("#znak").addEventListener("input", e=>{ S.znak = e.target.value; schedule(); });

/* Lista palet budowana z biblioteki, w grupach według kategorii. Musi powstać
   przed pierwszym syncUI() — inaczej odrzuciłby pal z DEFAULTS jako nieznaną. */
(function listaPalet(){
  const sel = $("#pal");
  let grupa = null;
  for(const p of BIBLIOTEKA){
    if(!grupa || grupa.label !== p.kat){
      grupa = document.createElement("optgroup"); grupa.label = p.kat;
      sel.appendChild(grupa);
    }
    const o = document.createElement("option");
    o.value = p.id; o.textContent = p.nazwa;
    grupa.appendChild(o);
  }
})();

/* ---------- paleta: próbki i edytor ---------- */
let wybrana = -1;                      /* zaznaczona próbka, -1 = żadna */
function komunikatPalety(t){ $("#pal-msg").textContent = t; }
function mapaUI(){
  $("#mapa").value = S.mapa;
  /* dopasowanie percepcyjne dotyczy wyboru najbliższego koloru — w gradiencie
     według jasności nie ma czego dopasowywać */
  $("#percept-opcja").classList.toggle("hidden", S.mapa === "jasnosc");
  $("#glebia-opcje").classList.toggle("hidden", S.pal !== "glebia");
  $("#mapa-hint").textContent = S.mapa === "jasnosc"
    ? "Cienie dostają pierwszy kolor palety, światła ostatni — jak mapa gradientu. Kolejność zmienisz przyciskami Odwróć i Sortuj."
    : "Każdy piksel dostaje kolor palety najbliższy swojemu — zdjęcie zachowuje barwy, na ile pozwala paleta.";
}
/* 1-bit ma własne dwa pola (farba i papier), reszta palet — próbki do klikania */
function probkiUI(){
  $("#duo").style.display = (S.pal==="bw") ? "flex" : "none";
  /* głębia 7 poziomów to już 343 kolory — próbek i edytora nie pokazujemy,
     paleta i tak nie zmieściłaby się w palecie własnej (najwyżej 256) */
  const zaDuzo = S.pal !== "bw" && palette().length > MAX_KOLOROW;
  for(const s of [".edycja", "#edytor-hint"]) $(s).classList.toggle("hidden", zaDuzo);
  const box = $("#pal-probki"), kolory = S.pal === "bw" || zaDuzo ? [] : palette();
  box.classList.toggle("hidden", S.pal === "bw" || zaDuzo);
  box.classList.toggle("gesto", kolory.length > 32);
  box.innerHTML = "";
  if(wybrana >= kolory.length) wybrana = -1;
  kolory.forEach((c, i) => {
    const b = document.createElement("button");
    const hex = rgb2hex(c);
    b.style.background = hex;
    b.title = hex;
    b.setAttribute("aria-label", "Kolor " + (i+1) + ": " + hex);
    b.setAttribute("aria-pressed", i === wybrana);
    b.addEventListener("click", () => edytujProbke(i, b));
    box.appendChild(b);
  });
  listaUI(kolory);
}
/* Te same kolory jako lista: próbka, kod do wpisania, przesuwanie, usuwanie.
   Kod zatwierdza Enter albo wyjście z pola; zły kod podświetla pole i nic
   nie zmienia. */
function listaUI(kolory){
  $("#pal-szczegoly").classList.toggle("hidden", !kolory.length);
  const lista = $("#pal-lista");
  lista.innerHTML = "";
  kolory.forEach((c, i) => {
    const hex = rgb2hex(c), w = document.createElement("div");
    w.className = "wiersz";
    const pr = document.createElement("button");
    pr.className = "probka"; pr.style.background = hex;
    pr.setAttribute("aria-label", "Zmień kolor " + (i+1));
    pr.addEventListener("click", () => edytujProbke(i, pr));
    const pole = document.createElement("input");
    pole.type = "text"; pole.value = hex; pole.maxLength = 7; pole.spellcheck = false;
    pole.setAttribute("aria-label", "Kod koloru " + (i+1));
    const zatwierdz = () => {
      const m = pole.value.trim().match(/^#?([0-9a-f]{6})$/i);
      if(!m){ pole.setAttribute("aria-invalid", "true"); return; }
      pole.removeAttribute("aria-invalid");
      const nowy = "#" + m[1].toLowerCase();
      if(nowy === rgb2hex(palette()[i])) return;
      doEdycji()[i] = hex2rgb(nowy);
      poEdycji();
    };
    pole.addEventListener("change", zatwierdz);
    pole.addEventListener("keydown", e => { if(e.key === "Enter") zatwierdz(); });
    const przycisk = (tekst, opis, wylaczony, akcja) => {
      const b = document.createElement("button");
      b.className = "btn"; b.textContent = tekst; b.title = opis; b.setAttribute("aria-label", opis + " (kolor " + (i+1) + ")");
      b.disabled = wylaczony;
      b.addEventListener("click", akcja);
      return b;
    };
    const zamien = j => { const k = doEdycji(); [k[i], k[j]] = [k[j], k[i]]; wybrana = j; poEdycji(); };
    w.append(pr, pole,
      przycisk("↑", "Wyżej", i === 0, () => zamien(i - 1)),
      przycisk("↓", "Niżej", i === kolory.length - 1, () => zamien(i + 1)),
      przycisk("×", "Usuń", kolory.length <= 2, () => { doEdycji().splice(i, 1); wybrana = -1; poEdycji(); }));
    lista.appendChild(w);
  });
}
$("#pal-kopiuj").addEventListener("click", async ()=>{
  const tekst = (S.pal === "bw" ? [] : palette()).map(rgb2hex).join("\n");
  try{ await navigator.clipboard.writeText(tekst); komunikatPalety("Skopiowano kody kolorów do schowka."); }
  catch{ komunikatPalety("Przeglądarka nie pozwoliła na schowek — kody: " + tekst.replace(/\n/g, " ")); }
});
/* Zmiana palety wbudowanej robi z niej własną: kopia kolorów trafia do
   S.custom i dalej idzie tą samą ścieżką co paleta z pliku (presety, plik).
   1-bit w trybie „według jasności" kopiujemy w kolejności gradientu. */
function doEdycji(){
  if(S.pal !== "custom" || !S.custom){
    const kolory = (S.mapa === "jasnosc" ? paletaGradientu() : palette()).map(c => c.slice());
    const wpis = wpisPalety(S.pal);
    S.custom = {nazwa: (wpis ? wpis.nazwa : "paleta").replace(/ \(zmieniona\)$/, "") + " (zmieniona)", kolory};
    S.pal = "custom";
    opcjaPalety();
    $("#pal").value = "custom";
  }
  return S.custom.kolory;
}
function poEdycji(){
  opcjaPalety();
  probkiUI();
  schedule();
}
function edytujProbke(i, przycisk){
  wybrana = i;
  for(const [j, b] of [...$("#pal-probki").children].entries()) b.setAttribute("aria-pressed", j === i);
  /* wybierak stoi przy klikniętej próbce, żeby okno koloru otworzyło się obok niej */
  const kolor = $("#pal-kolor"), r = przycisk.getBoundingClientRect(), g = $("#g-pal").getBoundingClientRect();
  kolor.style.left = (r.left - g.left) + "px";
  kolor.style.top = (r.bottom - g.top) + "px";
  kolor.value = rgb2hex(palette()[i]);
  kolor.click();
}
$("#pal-kolor").addEventListener("input", e=>{
  if(wybrana < 0) return;
  const k = doEdycji();
  k[wybrana] = hex2rgb(e.target.value);
  const b = $("#pal-probki").children[wybrana];
  if(b){ b.style.background = e.target.value; b.title = e.target.value; }
  /* wiersz listy na bieżąco, bez przebudowy — przebudowa gubiłaby fokus */
  const w = $("#pal-lista").children[wybrana];
  if(w){ w.querySelector(".probka").style.background = e.target.value; w.querySelector("input").value = e.target.value; }
  opcjaPalety();
  schedule();
});
$("#pal-dodaj").addEventListener("click", ()=>{
  const k0 = S.pal === "bw" ? [] : palette();
  if(k0.length >= MAX_KOLOROW){ komunikatPalety("Paleta ma już " + MAX_KOLOROW + " kolorów — więcej się nie da."); return; }
  const k = doEdycji();
  /* nowy kolor w połowie drogi do sąsiada — w gradiencie od razu ma sens */
  const i = wybrana >= 0 ? wybrana : k.length - 1;
  const sasiad = k[i+1] || k[i-1] || [255, 255, 255];
  k.splice(i+1, 0, k[i].map((v, c) => Math.round((v + sasiad[c])/2)));
  wybrana = i + 1;
  poEdycji();
  komunikatPalety("");
  const b = $("#pal-probki").children[wybrana];
  if(b) edytujProbke(wybrana, b);
});
$("#pal-usun").addEventListener("click", ()=>{
  const k0 = S.pal === "bw" ? [hex2rgb(S.paper), hex2rgb(S.ink)] : palette();
  if(k0.length <= 2){ komunikatPalety("Paleta musi mieć co najmniej dwa kolory."); return; }
  const k = doEdycji();
  k.splice(wybrana >= 0 ? wybrana : k.length - 1, 1);
  wybrana = -1;
  poEdycji();
  komunikatPalety("");
});
$("#pal-odwroc").addEventListener("click", ()=>{
  const k = doEdycji();
  k.reverse();
  if(wybrana >= 0) wybrana = k.length - 1 - wybrana;
  poEdycji();
});
$("#pal-sortuj").addEventListener("click", ()=>{
  const k = doEdycji();
  const jas = c => c[0]*0.299 + c[1]*0.587 + c[2]*0.114;
  const zazn = wybrana >= 0 ? k[wybrana] : null;
  k.sort((a, b) => jas(a) - jas(b));
  wybrana = zazn ? k.indexOf(zazn) : -1;
  poEdycji();
});

/* wybór z listy przełącza też tryb przypisania kolorów na ten, do którego
   paleta jest zrobiona (gradient → według jasności, sprzęt → najbliższy) */
function wybranoPalete(){
  const wpis = wpisPalety(S.pal);
  if(wpis && wpis.mapa) S.mapa = wpis.mapa;
  wybrana = -1;
  mapaUI();
  probkiUI();
  komunikatPalety("");
  eksportUI();          /* przezroczyste tło zależy od palety (tylko 1-bit ma papier) */
}
/* ASCII: pole własnych znaków przy „Własne" i przy powtarzanym tekście;
   paleta widoczna w ASCII tylko wtedy, gdy znaki biorą z niej kolory */
function asciiUI(){
  const tekst = S.asciiTryb === "tekst";
  $("#ascii-wlasne-opcje").classList.toggle("hidden", !(tekst || S.asciiZestaw === "wlasne"));
  $("#ascii-wlasne-etykieta").textContent = tekst ? "Tekst do powtarzania" : "Własne znaki — od rzadkich do gęstych";
  $("#asciiWlasne").value = S.asciiWlasne;
  $("#g-pal").classList.toggle("hidden", !(S.mode === "dither" || (S.mode === "ascii" && S.asciiKolor === "paleta")));
}
$("#asciiWlasne").addEventListener("input", e=>{ S.asciiWlasne = e.target.value; schedule(); });
function krokZestawu(o){
  const w = [...$("#asciiZestaw").options].map(x => x.value), i = w.indexOf(S.asciiZestaw);
  S.asciiZestaw = w[(i + o + w.length) % w.length];
  $("#asciiZestaw").value = S.asciiZestaw;
  asciiUI();
  schedule();
}
$("#ascii-prev").addEventListener("click", ()=>krokZestawu(-1));
$("#ascii-next").addEventListener("click", ()=>krokZestawu(1));
/* ◀ ▶ przy algorytmie — jak przy palecie */
function krokAlgorytmu(o){
  const wartosci = [...$("#algo").options].map(x => x.value);
  const i = wartosci.indexOf(S.algo);
  S.algo = wartosci[(i + o + wartosci.length) % wartosci.length];
  $("#algo").value = S.algo;
  schedule();
}
$("#algo-prev").addEventListener("click", ()=>krokAlgorytmu(-1));
$("#algo-next").addEventListener("click", ()=>krokAlgorytmu(1));
/* przywraca same suwaki korekty, reszty wyglądu nie rusza */
const KOREKTA = ["bri","con","gam","cienie","swiatla","nasycenie","odcien","blur","ostrosc","odszum","pix","inv"];
$("#korekta-reset").addEventListener("click", ()=>{
  for(const k of KOREKTA) S[k] = DEFAULTS[k];
  syncUI();
  schedule();
});
function krokPalety(o){
  const wartosci = [...$("#pal").options].map(x => x.value);
  const i = wartosci.indexOf(S.pal);
  S.pal = wartosci[(i + o + wartosci.length) % wartosci.length];
  $("#pal").value = S.pal;
  wybranoPalete();
  schedule();
}
$("#pal-prev").addEventListener("click", ()=>krokPalety(-1));
$("#pal-next").addEventListener("click", ()=>krokPalety(1));

/* ---------- stos efektów ----------
   Karty efektów są w markupie (same ciała), a tutaj ustawiamy je w kolejności
   stosu, dokładamy nagłówki i chowamy te, których na stosie nie ma. Kolejność
   i widoczność trzyma S.efekty (stos.js) — panel tylko ją pokazuje. */
const zwinieteFx = new Set();
/* Karta kopii efektu („rgb~2"): klon ciała karty pierwszej instancji z id
   z przyrostkiem „__2". Kontrolki kopii nie piszą do S, tylko do jej
   parametrów (S.efektyKopie) — przez te same przeliczenia co zwykłe tabele
   kontrolek. Klatek kluczowych kopia nie ma. */
const przyrostek = inst => "__" + inst.split("~")[1];
function opisKontrolki(id){
  const s = SUWAKI.find(c => c.id === id);
  if(s) return {key: s.key, zS: s.zS, naS: s.naS, opis: s.opis};
  const k = KOLORY.find(c => c.id === id);
  if(k) return {key: k.key};
  if(LISTY.includes(id) || PTASZKI.includes(id)) return {key: id};
  return null;
}
function kartaKopii(inst){
  const k = document.createElement("div"); k.className = "fx hidden"; k.dataset.fx = inst;
  k.appendChild(klonCiala(bazaEfektu(inst), przyrostek(inst), (klucz, v) => { ustawParametrKopii(inst, klucz, v); schedule(); }));
  return k;
}
/* ciało karty efektu z kontrolkami piszącymi przez `zapisz(klucz, wartość)` —
   dla kopii w stosie i dla warstwy efektu w kompozycji */
function klonCiala(efekt, suf, zapisz){
  const wzor = $("#g-fx").querySelector('.fx[data-fx="' + efekt + '"] .fx-cialo');
  const cialo = wzor.cloneNode(true);
  cialo.querySelectorAll(".klucz").forEach(b => b.remove());
  for(const el of cialo.querySelectorAll("[id]")) el.id += suf;
  for(const el of cialo.querySelectorAll("label[for]")) el.htmlFor += suf;
  for(const el of cialo.querySelectorAll("input, select")){
    const o = opisKontrolki(el.id.slice(0, -suf.length));
    if(!o) continue;
    el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", ()=>{
      const v = el.type === "checkbox" ? el.checked : el.type === "range" ? (o.zS ? o.zS(+el.value) : +el.value) : el.value;
      const w = cialo.querySelector("#" + CSS.escape(el.id.slice(0, -suf.length) + "-v" + suf));
      if(w && o.opis) w.textContent = o.opis(v);
      zapisz(o.key, v);
    });
  }
  return cialo;
}
/* wartości kontrolek kopii z jej parametrów */
function wypelnijKopie(inst, k){ wypelnijCialo(k, inst, przyrostek(inst), kopieEfektow()[inst] || {}); }
function wypelnijCialo(k, inst, suf, par){
  const wpis = wpisEfektu(inst);
  for(const el of k.querySelectorAll("input, select")){
    const id = el.id.slice(0, -suf.length), o = opisKontrolki(id);
    if(!o) continue;
    const v = o.key in par ? par[o.key] : (o.key in wpis.start ? wpis.start[o.key] : DEFAULTS[o.key]);
    if(el.type === "checkbox") el.checked = !!v; else el.value = o.naS ? o.naS(v) : v;
    const w = k.querySelector("#" + CSS.escape(id + "-v" + suf));
    if(w && o.opis) w.textContent = o.opis(v);
  }
}
function efektyUI(){
  const l = lista(), box = $("#fx-lista"), grupa = $("#g-fx");
  for(const k of grupa.querySelectorAll(".fx")){
    /* karty kopii, których już nie ma na stosie, wyrzucamy */
    if(k.dataset.fx.includes("~") && !l.some(e => e.id === k.dataset.fx)) k.remove();
    else k.classList.add("hidden");
  }
  l.forEach((e, i) => {
    let k = grupa.querySelector('.fx[data-fx="' + e.id + '"]');
    if(!k){ k = kartaKopii(e.id); box.appendChild(k); }
    if(e.id.includes("~")) wypelnijKopie(e.id, k);
    let glowa = k.querySelector(".fx-glowa");
    if(!glowa){
      glowa = document.createElement("div"); glowa.className = "fx-glowa";
      const nazwa = wpisEfektu(e.id).nazwa + (e.id.includes("~") ? " " + e.id.split("~")[1] : "");
      glowa.innerHTML = '<button class="fx-nazwa" data-akcja="zwin"></button>' +
        '<button class="fx-b" data-akcja="gora" title="Wyżej">↑</button>' +
        '<button class="fx-b" data-akcja="dol" title="Niżej">↓</button>' +
        '<button class="fx-b" data-akcja="oko"></button>' +
        '<button class="fx-b" data-akcja="usun" title="Usuń efekt">×</button>';
      glowa.querySelector(".fx-nazwa").textContent = nazwa;
      for(const b of glowa.querySelectorAll(".fx-b")) b.setAttribute("aria-label", b.title + ": " + nazwa);
      k.prepend(glowa);
    }
    glowa.querySelector('[data-akcja="gora"]').disabled = i === 0;
    glowa.querySelector('[data-akcja="dol"]').disabled = i === l.length - 1;
    const oko = glowa.querySelector('[data-akcja="oko"]');
    oko.textContent = e.widoczny ? "◉" : "○";
    oko.title = e.widoczny ? "Ukryj (parametry zostają)" : "Pokaż";
    oko.setAttribute("aria-pressed", e.widoczny);
    glowa.querySelector(".fx-nazwa").setAttribute("aria-expanded", !zwinieteFx.has(e.id));
    k.classList.toggle("ukryty", !e.widoczny);
    k.classList.toggle("zwiniety", zwinieteFx.has(e.id));
    k.classList.remove("hidden");
    box.appendChild(k);
  });
  $("#fx-pusto").classList.toggle("hidden", l.length > 0);
  const menu = $("#fx-menu");
  menu.innerHTML = "";
  for(const e of EFEKTY){
    if(!czyMoznaDodac(e.id)) continue;
    const b = document.createElement("button");
    b.className = "btn"; b.textContent = e.nazwa + (e.przed ? " — w czasie" : "") + (l.some(x => x.id === e.id) ? " — kolejna kopia" : ""); b.dataset.dodaj = e.id;
    b.setAttribute("role", "menuitem");
    menu.appendChild(b);
  }
  $("#fx-dodaj").disabled = !menu.children.length;
}
$("#fx-dodaj").addEventListener("click", ()=>{
  const m = $("#fx-menu"), otworz = m.classList.contains("hidden");
  m.classList.toggle("hidden", !otworz);
  $("#fx-dodaj").setAttribute("aria-expanded", otworz);
});
$("#fx-menu").addEventListener("click", e=>{
  const id = e.target.dataset && e.target.dataset.dodaj;
  if(!id) return;
  dodajEfekt(id);
  $("#fx-menu").classList.add("hidden");
  $("#fx-dodaj").setAttribute("aria-expanded", "false");
  syncUI();
  schedule();
});
$("#g-fx").addEventListener("click", e=>{
  const b = e.target.closest("[data-akcja]");
  if(!b) return;
  const id = b.closest(".fx").dataset.fx, a = b.dataset.akcja;
  if(a === "zwin"){ zwinieteFx.has(id) ? zwinieteFx.delete(id) : zwinieteFx.add(id); efektyUI(); return; }
  if(a === "gora") przesunEfekt(id, -1);
  else if(a === "dol") przesunEfekt(id, 1);
  else if(a === "oko") przelaczEfekt(id);
  else if(a === "usun"){ usunEfekt(id); syncUI(); }
  efektyUI();
  schedule();
});
/* wybór prostokąty/kontury ma sens tylko dla SVG z ditheringu — raster to i tak punkty */
/* Przezroczysty jest kolor papieru, więc tylko tam, gdzie papier jest
   określony: 1-bit, raster drukarski, ASCII. W ASCII tła po prostu nie
   rysujemy; w pozostałych zamieniamy piksele dokładnie w kolorze papieru —
   ziarno i efekty, które go zmieniły, zostają widoczne. */
const mozePrzezroczyste = () => S.mode !== "dither" || S.pal === "bw";
function papierPrzezroczysty(){
  const [r, g, b] = hex2rgb(S.paper), d = octx.getImageData(0, 0, out.width, out.height), p = d.data;
  for(let i=0; i<p.length; i+=4) if(p[i] === r && p[i+1] === g && p[i+2] === b) p[i+3] = 0;
  octx.putImageData(d, 0, 0);
}
function eksportUI(){
  /* TXT tylko w ASCII; po wyjściu z ASCII wracamy do PNG */
  let txt = $("#fmt-txt");
  if(S.mode === "ascii" && !txt){
    txt = document.createElement("option"); txt.id = "fmt-txt"; txt.value = "txt"; txt.textContent = "TXT — sam tekst";
    $("#fmt").insertBefore(txt, $("#fmt").options[2] || null);
  } else if(S.mode !== "ascii" && txt){ txt.remove(); if(S.fmt === "txt") S.fmt = "png"; }
  $("#fmt").value = S.fmt;
  $("#przezr-opcja").classList.toggle("hidden", !(S.fmt === "png" && mozePrzezroczyste()));
  $("#przezroczyste").checked = !!S.przezroczyste;
  $("#save").textContent = NAPISY[S.fmt] || "Zapisz";
  $("#svg-opcje").classList.toggle("hidden", !(S.fmt==="svg" && S.mode==="dither"));
  $("#wygl-opcje").classList.toggle("hidden", S.wektor!=="kontury");
  $("#wektor").value = S.wektor;
  $("#mp4-opcje").classList.toggle("hidden", S.fmt!=="mp4");
  /* dźwięk tylko z prawdziwego filmu — animowany GIF i animacja obrazu go nie mają */
  $("#dzwiek-opcja").classList.toggle("hidden", !(W.z && W.z.rodzaj === "film"));
  $("#dzwiek").checked = S.dzwiek;
  $("#jakosc").value = S.jakosc;
}
/* Opcja „Własna" istnieje w liście tylko wtedy, gdy jest wczytana paleta — dzięki
   temu syncUI() sam odrzuci pal:"custom" z presetu, który palety nie przyniósł.
   Wołać przed syncUI() za każdym razem, gdy zmienia się S.custom. */
function opcjaPalety(){
  let grupa = $("#pal-twoje");
  if(S.custom){
    if(!grupa){
      grupa = document.createElement("optgroup");
      grupa.label = "Twoja"; grupa.id = "pal-twoje";
      const opt = document.createElement("option");
      opt.value = "custom"; opt.id = "pal-custom";
      grupa.appendChild(opt);
      $("#pal").appendChild(grupa);
    }
    $("#pal-custom").textContent = "Własna: "+S.custom.nazwa+" ("+S.custom.kolory.length+")";
  } else if(grupa) grupa.remove();
}

/* stan → panel, a potem z powrotem: przeglądarka przycina liczby do zakresu
   suwaka i odrzuca nieznane opcje listy, więc odczyt po zapisie gwarantuje,
   że w S nie zostanie wartość, której panel nie potrafi pokazać */
function syncUI(){
  for(const c of SUWAKI){
    const el=$("#"+c.id);
    el.value = c.naS ? c.naS(S[c.key]) : S[c.key];
    S[c.key] = c.zS ? c.zS(+el.value) : +el.value;
    $("#"+c.id+"-v").textContent = c.opis(S[c.key]);
  }
  for(const k of PTASZKI){ const el=$("#"+k); el.checked = !!S[k]; S[k]=el.checked; }
  for(const k of LISTY){
    const el=$("#"+k);
    el.value = S[k];
    if(el.selectedIndex < 0) el.value = DEFAULTS[k];
    S[k] = el.value;
  }
  for(const {id, key} of KOLORY){ const el=$("#"+id); el.value = S[key]; S[key]=el.value; }
  wybrana = -1;
  probkiUI();
  mapaUI();
  asciiUI();
  risoUI();
  efektyUI();
  eksportUI();
}
for(const c of SUWAKI){
  const el=$("#"+c.id);
  el.addEventListener("input", ()=>{
    S[c.key] = c.zS ? c.zS(+el.value) : +el.value;
    $("#"+c.id+"-v").textContent = c.opis(S[c.key]);
    if(c.key==="glebia") probkiUI();
    if(c.key==="risoIle" || c.key==="risoLos" || c.key==="tonPowt" || c.key==="tonPrzes" || c.key==="odksztalcenie" || c.key==="scalanie" || c.key==="rozciag" || c.key==="pochyl" || c.key==="qrWersja") risoUI();
    /* parametr już animowany: ruszenie suwaka ustawia klatkę w bieżącym miejscu osi */
    if(W.z && czyAnimowany(c.key)){ ustawKlucz(c.key, czasOd(W.biezaca), +el.value); kluczeUI(); }
    schedule();
  });
}

/* ---------- klatki kluczowe ----------
   Animować da się każdy suwak wyglądu (LOOK) — nie skalę zapisu ani
   wygładzenie konturów. animacja.js dostaje stąd przeliczenie suwak → S
   i zakres, bo sam nic nie wie o kontrolkach. */
const ANIMOWALNE = SUWAKI.filter(c => LOOK.includes(c.key));
for(const c of ANIMOWALNE){
  const el = $("#"+c.id);
  KONW[c.key] = {zS: c.zS || (v => v), min: +el.min, max: +el.max};
  const b = document.createElement("button");
  b.className = "klucz"; b.id = "kl-" + c.key; b.textContent = "◆";
  const nazwa = (document.querySelector('label[for="'+c.id+'"]') || {}).textContent || c.key;
  b.dataset.nazwa = nazwa;
  b.title = "Klatka kluczowa: " + nazwa;
  b.setAttribute("aria-label", "Klatka kluczowa: " + nazwa);
  b.addEventListener("click", ()=>{
    if(!W.z) return;
    const t = czasOd(W.biezaca);
    if(kluczW(c.key, t) >= 0) usunKlucz(c.key, t);
    else ustawKlucz(c.key, t, +el.value);
    kluczeUI();
    schedule();
  });
  const wartosc = $("#"+c.id+"-v");
  wartosc.parentElement.insertBefore(b, wartosc);
}
/* suwaki animowanych parametrów pokazują wartość z bieżącej klatki */
function suwakiAnimowane(){
  for(const c of ANIMOWALNE) if(czyAnimowany(c.key)){
    $("#"+c.id).value = c.naS ? c.naS(S[c.key]) : S[c.key];
    $("#"+c.id+"-v").textContent = c.opis(S[c.key]);
  }
}
for(const k of PTASZKI) $("#"+k).addEventListener("change", e=>{ S[k]=e.target.checked; schedule(); });
for(const k of LISTY) $("#"+k).addEventListener("change", e=>{
  S[k]=e.target.value;
  if(k==="pal") wybranoPalete();
  if(k==="mapa") mapaUI();
  if(k==="sort") efektyUI();
  if(k==="asciiZestaw" || k==="asciiTryb" || k==="asciiKolor") asciiUI();
  if(k==="inkmode" || k==="shape" || k==="siatka" || k==="papierRodzaj" || k==="rasterGrad" || k==="qrKorekcja" || /^risoS/.test(k)) risoUI();
  schedule();
});
function koloryUI(){ for(const {id, key} of KOLORY) $("#"+id).value = S[key]; }
for(const {id, key} of KOLORY) $("#"+id).addEventListener("input", e=>{
  S[key]=e.target.value;
  koloryUI();
  if(/^risoK/.test(key)) risoUI();
  schedule();
});
for(const id of ["#swap", "#swap-r", "#swap-a"]) $(id).addEventListener("click", ()=>{
  const a=S.ink; S.ink=S.paper; S.paper=a;
  koloryUI();
  schedule();
});
syncUI();

function setMode(m){
  S.mode=m;
  $("#tab-dither").setAttribute("aria-selected", m==="dither");
  $("#tab-half").setAttribute("aria-selected", m==="half");
  $("#tab-ascii").setAttribute("aria-selected", m==="ascii");
  $("#g-ascii").classList.toggle("hidden", m!=="ascii");
  $("#g-dither").classList.toggle("hidden", m!=="dither");
  asciiUI();
  $("#g-half").classList.toggle("hidden", m!=="half");
  eksportUI();
  buildPresets();
  schedule();
}
$("#tab-dither").addEventListener("click", ()=>setMode("dither"));
$("#tab-half").addEventListener("click", ()=>setMode("half"));
$("#tab-ascii").addEventListener("click", ()=>setMode("ascii"));
/* ---------- presety ---------- */
function buildPresets(){
  const box=$("#presets"); box.innerHTML="";
  for(const [name,cfg] of PRESETS[S.mode]){
    const b=document.createElement("button");
    b.className="btn"; b.textContent=name;
    b.addEventListener("click", ()=>applyPreset(cfg));
    /* pełny wygląd presetu (klucze spoza niego — domyślne), do podświetlenia */
    b._wyglad = Object.fromEntries(LOOK.map(k => [k, k in cfg ? cfg[k] : DEFAULTS[k]]));
    box.appendChild(b);
  }
  for(const p of czytajMoje().filter(p=>p.tryb===S.mode)){
    const para=document.createElement("span"); para.className="moj";
    const b=document.createElement("button");
    b.className="btn"; b.textContent=p.nazwa; b.title="Własny preset zapamiętany w tej przeglądarce";
    b._wyglad = p.look;
    b.addEventListener("click", ()=>{ utrwalStan(); komunikat(zastosujPreset(p, "„"+p.nazwa+"”")); utrwalStan(); });
    const x=document.createElement("button");
    x.className="btn usun"; x.textContent="×"; x.setAttribute("aria-label", "Usuń preset "+p.nazwa);
    x.addEventListener("click", ()=>usunMoj(p.nazwa, p.tryb));
    para.append(b, x);
    box.appendChild(para);
  }
  podswietlPresety();
}
/* Podświetlenie presetu, którego wygląd jest teraz na ekranie: każdy klucz
   z presetu równy bieżącemu (liczby z tolerancją — suwaki zaokrąglają).
   Ruszenie czegokolwiek gasi podświetlenie, bo to już nie ten preset. Wołane
   z schedule(), więc nadąża za suwakami, cofaniem i wczytaniem pliku. */
function podswietlPresety(){
  /* w środku funkcji, nie stałą obok — schedule() woła to już przy starcie (TDZ) */
  const rowne = (a, b) => typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 1e-6 : a === b;
  for(const b of document.querySelectorAll("#presets .btn:not(.usun)")){
    if(!b._wyglad) continue;
    const pasuje = Object.entries(b._wyglad).every(([k, v]) => !LOOK.includes(k) || czyAnimowany(k) || rowne(S[k], v));
    b.setAttribute("aria-pressed", pasuje);
  }
}
/* Preset to pełny opis wyglądu: klucze, których nie podaje, wracają do wartości
   domyślnych, zamiast zostawać po poprzednim presecie. Inaczej „Gazeta" po
   „Promo" dziedziczyła jego punkt bieli, a negatyw i wężyk nie wracały nigdy. */
function applyPreset(cfg){
  utrwalStan();                 /* preset to osobny krok historii */
  for(const k of LOOK) S[k] = (k in cfg) ? cfg[k] : DEFAULTS[k];
  syncUI();
  schedule();
  utrwalStan();
}
/* ---------- presety w pliku i w przeglądarce ----------
   Jeden format na oba miejsca: to, co ląduje w pliku JSON, ląduje też w
   localStorage (plus nazwa). Dzięki temu oba wczytują się przez tę samą,
   nieufną zastosujPreset() — dane z localStorage też mogły zostać zmienione. */
const WERSJA = 1;
function komunikat(t){ $("#preset-msg").textContent = t; }

function biezacyPreset(){
  const look={}; for(const k of LOOK) look[k]=S[k];
  const dane={app:"raster", wersja:WERSJA, zapisano:new Date().toISOString(), tryb:S.mode, look};
  /* bez kolorów preset z paletą własną byłby nieodtwarzalny */
  if(S.pal==="custom" && S.custom) dane.paleta = {nazwa:S.custom.nazwa, kolory:S.custom.kolory};
  /* klatki kluczowe — tylko gdy są, żeby zwykły preset nie kasował cudzej animacji */
  const anim = zrzutAnimacji();
  if(Object.keys(anim).length) dane.animacja = anim;
  return dane;
}
/* Stosuje preset w formacie pliku i zwraca komunikat dla panelu. */
function zastosujPreset(dane, skad){
  if(!dane || typeof dane!=="object" || dane.app!=="raster" || !dane.look || typeof dane.look!=="object")
    return "To nie wygląda na preset Rastra.";
  /* bierzemy tylko klucze o typie zgodnym z domyślnym — plik z innej wersji
     albo ręcznie podłubany nie wsadzi do S czegoś, czego panel nie ogarnie */
  let odrzucone=0;
  for(const k of LOOK){
    const v=dane.look[k];
    if(v!==undefined && typeof v===typeof DEFAULTS[k]) S[k]=v;
    else { S[k]=DEFAULTS[k]; if(v!==undefined) odrzucone++; }
  }
  let uwagaPalety = "";
  if(dane.paleta !== undefined){
    try{ const p = paletaZDanych(dane.paleta); S.custom = {nazwa:p.nazwa, kolory:p.kolory}; }
    catch{ uwagaPalety = " Zapisana w nim paleta była uszkodzona i została pominięta."; }
  }
  /* animacja: preset z polem „animacja" zastępuje klatki kluczowe, bez pola —
     zostawia bieżące (wbudowane presety i pliki sprzed animacji jej nie ruszają) */
  if(dane.animacja !== undefined){
    const zle = wczytajAnimacje(dane.animacja);
    if(zle) uwagaPalety += " Pominięte klatki kluczowe (uszkodzone albo nieznane): " + zle + ".";
    else { const n = Object.keys(zrzutAnimacji()).length; if(n) uwagaPalety += " Z animacją — klatki kluczowe dla " + n + (n === 1 ? " parametru." : " parametrów."); }
  }
  opcjaPalety();
  /* syncUI przycina liczby do zakresu suwaków, odrzuca nieznane opcje list
     i normalizuje kolory. Porównanie przed i po wyłapuje te poprawki, bo
     inaczej plik z gęstością 9999 wczytywałby się bez słowa komentarza. */
  const chciane={}; for(const k of LOOK) chciane[k]=S[k];
  if(dane.tryb==="dither" || dane.tryb==="half" || dane.tryb==="ascii") setMode(dane.tryb);
  syncUI();
  const poprawione = LOOK.filter(k => S[k]!==chciane[k]).length;
  if(W.z) zastosujAnimacje(S, czasOd(W.biezaca));
  kluczeUI();
  schedule();
  const n = odrzucone + poprawione;
  return (n ? "Wczytano "+skad+". Wartości spoza tego, co panel potrafi ustawić: "+n+" — cofnięte do poprawnych."
            : "Wczytano "+skad+".") + uwagaPalety;
}

$("#preset-save").addEventListener("click", ()=>{
  const blob=new Blob([JSON.stringify(biezacyPreset(),null,2)], {type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="raster-"+S.mode+"-"+Date.now()+".json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
  komunikat("Zapisano ustawienia do pliku.");
});
$("#preset-load").addEventListener("click", ()=>$("#preset-file").click());
/* cały wygląd do wartości domyślnych — jak pusty preset; obraz, film,
   warstwy i paleta własna zostają, bo to materiał, nie wygląd */
$("#look-reset").addEventListener("click", ()=>{
  applyPreset({});
  efektyUI();
  komunikat("Przywrócono ustawienia domyślne.");
});
$("#preset-file").addEventListener("change", e=>{
  const f=e.target.files[0];
  e.target.value="";                       /* żeby ten sam plik dało się wczytać drugi raz */
  if(f) wczytajPreset(f);
});
function wczytajPreset(f){
  const fr=new FileReader();
  fr.onerror=()=>komunikat("Nie udało się odczytać pliku.");
  fr.onload=()=>{
    let dane;
    try{ dane=JSON.parse(fr.result); }
    catch{ komunikat("To nie jest poprawny JSON."); return; }
    utrwalStan(); komunikat(zastosujPreset(dane, "ustawienia z pliku")); utrwalStan();
  };
  fr.readAsText(f);
}

/* Presety w localStorage. Każdy dostęp w try/catch: w trybie prywatnym, przy
   zablokowanych danych stron albo pełnym magazynie localStorage rzuca, a apka
   ma wtedy działać dalej, tylko bez tej funkcji. Pamiętaj, że localStorage jest
   przypisany do adresu — inny port serwera to inne presety. */
const KLUCZ_MOICH = "raster.presety";
function czytajMoje(){
  try{
    const a = JSON.parse(localStorage.getItem(KLUCZ_MOICH) || "[]");
    if(!Array.isArray(a)) return [];
    return a.filter(p => p && typeof p==="object" && p.app==="raster" && typeof p.nazwa==="string"
                         && p.nazwa.trim() && (p.tryb==="dither" || p.tryb==="half" || p.tryb==="ascii")
                         && p.look && typeof p.look==="object");
  }catch{ return []; }
}
function zapiszMoje(a){
  try{ localStorage.setItem(KLUCZ_MOICH, JSON.stringify(a)); return true; }
  catch{ return false; }
}
function zapamietaj(){
  const pole=$("#preset-name"), moje=czytajMoje();
  let nazwa=pole.value.trim().slice(0,40);
  if(!nazwa){
    let i=1; while(moje.some(p=>p.tryb===S.mode && p.nazwa==="Własny "+i)) i++;
    nazwa="Własny "+i;
  }
  const nowy=Object.assign(biezacyPreset(), {nazwa});
  const byl=moje.findIndex(p=>p.tryb===S.mode && p.nazwa===nazwa);
  if(byl>=0) moje[byl]=nowy; else moje.push(nowy);
  if(!zapiszMoje(moje)){
    komunikat("Przeglądarka nie pozwoliła zapamiętać presetu (tryb prywatny albo brak miejsca). Zapisz go do pliku.");
    return;
  }
  pole.value="";
  buildPresets();
  komunikat((byl>=0 ? "Nadpisano" : "Zapamiętano")+" „"+nazwa+"” w tej przeglądarce.");
}
function usunMoj(nazwa, tryb){
  if(!confirm("Usunąć preset „"+nazwa+"”?")) return;
  if(!zapiszMoje(czytajMoje().filter(p=>!(p.tryb===tryb && p.nazwa===nazwa)))){
    komunikat("Nie udało się usunąć presetu."); return;
  }
  buildPresets();
  komunikat("Usunięto „"+nazwa+"”.");
}
$("#preset-keep").addEventListener("click", zapamietaj);
$("#preset-name").addEventListener("keydown", e=>{ if(e.key==="Enter") zapamietaj(); });
buildPresets();
/* ---------- paleta własna: z pliku, ze zdjęcia, do pliku ---------- */
$("#pal-load").addEventListener("click", ()=>$("#pal-file").click());
$("#pal-file").addEventListener("change", e=>{
  const f=e.target.files[0];
  e.target.value="";
  if(f) wczytajPaleteZPliku(f);
});
/* Paleta z obrazka: unikalne kolory w kolejności pojawiania się, wiersz po
   wierszu. Lospec daje paski 1×N i ich powiększenia 8× i 32× — powtórzenia
   i tak się zwijają. Bez konwersji przestrzeni barw, bo liczą się dokładne
   wartości z pliku, a przeglądarka przestawia je po cichu, gdy PNG ma profil.
   Piksele przezroczyste pomijamy (ramki i odstępy między próbkami).
   Obrazek z ponad MAX_KOLOROW kolorami to zdjęcie, a nie pasek próbek —
   pierwsze 256 jego kolorów byłoby przypadkiem, więc wyciągamy z niego tyle
   kolorów, ile wybrano przy „Paleta ze zdjęcia". */
async function paletaZObrazka(f){
  let bmp;
  try{ bmp = await createImageBitmap(f, {colorSpaceConversion:"none", premultiplyAlpha:"none"}); }
  catch{ throw new Error("Nie udało się otworzyć obrazka."); }
  const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
  const x = c.getContext("2d");
  x.drawImage(bmp, 0, 0); bmp.close();
  const p = x.getImageData(0, 0, c.width, c.height).data;
  const widziane = new Set(), kolory = [];
  let przezroczyste = 0, zdjecie = false;
  for(let i=0; i<p.length; i+=4){
    if(p[i+3] < 128){ przezroczyste++; continue; }
    const k = (p[i]<<16) | (p[i+1]<<8) | p[i+2];
    if(widziane.has(k)) continue;
    widziane.add(k); kolory.push([p[i], p[i+1], p[i+2]]);
    if(kolory.length > MAX_KOLOROW){ zdjecie = true; break; }
  }
  const nazwa = domyslnaNazwa(f.name).replace(/\s*\d+x$/i, "") || "paleta";
  if(zdjecie){
    const ile = +$("#pal-ile").value, q = nieprzezroczyste(p);
    const wynik = paletaZDanych({nazwa, kolory: paletaZPikseli(q, q.length/4, ile)});
    wynik.uwagi.push("to zdjęcie, a nie pasek próbek — wyciągnięto z niego " + wynik.kolory.length + " kolorów");
    return wynik;
  }
  const wynik = paletaZDanych({nazwa, kolory});
  if(przezroczyste) wynik.uwagi.push("pominięto piksele przezroczyste");
  return wynik;
}
function nieprzezroczyste(p){
  let n = 0;
  for(let i=3; i<p.length; i+=4) if(p[i] >= 128) n++;
  if(n*4 === p.length) return p;
  const q = new Uint8ClampedArray(n*4);
  for(let i=0, j=0; i<p.length; i+=4) if(p[i+3] >= 128){ q[j]=p[i]; q[j+1]=p[i+1]; q[j+2]=p[i+2]; q[j+3]=255; j+=4; }
  return q;
}
/* nowa paleta własna (z pliku albo ze zdjęcia) — wybrana i pokazana */
function ustawWlasna(nazwa, kolory){
  S.custom = {nazwa, kolory};
  S.pal = "custom";
  opcjaPalety();
  if(S.mode === "half") setMode("dither");     /* raster nie używa palety; ASCII może */
  syncUI();
  schedule();
}
async function wczytajPaleteZPliku(f){
  let p;
  try{
    p = (/^image\//.test(f.type) || /\.(png|gif|jpe?g|webp)$/i.test(f.name))
      ? await paletaZObrazka(f)
      : czytajPalete(f.name, await f.arrayBuffer());
  }
  catch(err){ komunikatPalety(err.message || "Nie udało się odczytać palety."); return; }
  ustawWlasna(p.nazwa, p.kolory);
  komunikatPalety("Wczytano „"+p.nazwa+"”, kolorów: "+p.kolory.length+"."+
    (p.uwagi.length ? " Uwaga: "+p.uwagi.join("; ")+"." : ""));
}
/* Paleta z bieżącego obrazu (albo klatki filmu). Liczona na pomniejszeniu do
   400 px — kolorów to nie zmienia, a k-średnie robią się natychmiastowe.
   Z oryginału, bez korekty: paleta ma oddawać zdjęcie, nie suwaki. */
$("#pal-zdjecie").addEventListener("click", ()=>{
  if(!S.img){ komunikatPalety("Najpierw wczytaj obraz albo film."); return; }
  const ile = +$("#pal-ile").value;
  const [w, h] = fit(S.img.width, S.img.height, 400);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.drawImage(S.img, 0, 0, w, h);
  const q = nieprzezroczyste(x.getImageData(0, 0, w, h).data);
  const kolory = paletaZPikseli(q, q.length/4, ile);
  if(kolory.length < 2){ komunikatPalety("Ten obraz ma tylko jeden kolor — nie ma z czego zrobić palety."); return; }
  ustawWlasna(W.z ? "z klatki filmu" : "ze zdjęcia", kolory);
  komunikatPalety("Wyciągnięto " + kolory.length + " kolorów, od najciemniejszego do najjaśniejszego." +
    (kolory.length < ile ? " Więcej obraz nie ma." : ""));
});
/* Zapis jako .hex (Lospec): kolor na linię, w kolejności, w jakiej działa
   bieżący tryb — wczytany z powrotem da ten sam obraz. */
$("#pal-save").addEventListener("click", ()=>{
  const kolory = S.mapa === "jasnosc" ? paletaGradientu() : palette();
  const nazwa = S.pal === "custom" && S.custom ? S.custom.nazwa : (wpisPalety(S.pal) || {nazwa:"paleta"}).nazwa;
  const plik = (nazwa.replace(/[\/:*?"<>|()]+/g, "").replace(/\s+/g, "-").replace(/^-+|-+$/g, "") || "paleta") + ".hex";
  pobierz(new Blob([kolory.map(c => rgb2hex(c).slice(1)).join("\n") + "\n"], {type: "text/plain"}), plik, 2000);
  komunikatPalety("Zapisano „" + plik + "” (" + kolory.length + " kolorów).");
});
/* ---------- wczytywanie ---------- */
function komunikatWczytania(t){ $("#load-msg").textContent = t; }
function pokazObraz(img){
  S.img=img;
  $("#drop").classList.add("hidden");
  out.classList.remove("hidden");
  schedule();
}
/* zwykły obraz zamyka film, jeśli jakiś był wczytany */
let nazwaObrazu = "obraz";
function setImage(img, nazwa){
  if(wTrakcie) return;          /* obraz podglądu wraca po przetwarzaniu folderu — nie podmieniamy go w trakcie */
  /* w kompozycji każdy wczytany obraz (plik, przeciągnięcie, próbka) to nowa warstwa */
  if(K.aktywna && !W.z){ dodajWarstwe(img, nazwa); odswiezKomp(); kompUI(); komunikatWczytania(""); return; }
  nazwaObrazu = nazwa || "obraz";
  /* nowy obraz: zapamiętany oryginał sprzed kadrowania już nie dotyczy */
  KADR.oryginal = null; zakonczKadr();
  zamknijWideo();
  S.klatkaNr = 0;
  komunikatWczytania("");
  pokazObraz(img);
  wideoUI();
}
async function fromFile(f){
  if(!f || wTrakcie) return;
  if(K.aktywna && czyFilm(f)){ komunikatWczytania("W kompozycji z warstw można układać tylko obrazy — zakończ kompozycję, żeby otworzyć film."); return; }
  if(!K.aktywna && (czyFilm(f) || czyMozeAnimacja(f))){
    if(czyFilm(f)) komunikatWczytania("Otwieram film…");
    let z;
    try{ z = await otworzWideo(f); }
    catch(err){ komunikatWczytania(err.message); return; }
    if(z){ wczytanoWideo(); return; }
    /* GIF albo PNG z jedną klatką — dalej jak zwykły obraz */
  }
  if(!f.type.startsWith("image/")){ komunikatWczytania("Tego pliku nie da się otworzyć — to nie obraz ani film."); return; }
  const url=URL.createObjectURL(f), im=new Image();
  im.onload=()=>{ setImage(im, f.name); URL.revokeObjectURL(url); };
  im.onerror=()=>{ komunikatWczytania("Nie udało się otworzyć pliku."); URL.revokeObjectURL(url); };
  im.src=url;
}
$("#load").addEventListener("click", ()=>$("#file").click());
$("#file").addEventListener("change", e=>{
  const f=e.target.files[0];
  e.target.value="";
  fromFile(f);
});

/* ---------- film: panel i oś czasu ---------- */
const stage=$("#stage");
function zegar(s){
  const d = Math.round(s*10), m = Math.floor(d/600);
  return m + ":" + ((d%600)/10).toFixed(1).padStart(4, "0");
}
const ulamek = v => String(Math.round(v*100)/100).replace(".", ",");
function klatek(n){
  const r10 = n%10, r100 = n%100;
  return n + (n===1 ? " klatka" : (r10>=2 && r10<=4 && (r100<12 || r100>14)) ? " klatki" : " klatek");
}
function wczytanoWideo(){
  const z = W.z;
  komunikatWczytania("");
  wideoUI();
  pokazObraz(z.kanwa);
}
/* Formaty „cały film" istnieją w liście tylko przy wczytanym filmie — jak
   opcja palety własnej. PNG i SVG zapisują wtedy bieżącą klatkę. */
function opcjeFormatu(){
  let grp = $("#fmt-film");
  if(W.z && !grp){
    grp = document.createElement("optgroup");
    grp.label = "Cały film"; grp.id = "fmt-film";
    for(const [v, t] of [["mp4","MP4 — wideo"], ["gif","GIF — animacja"], ["klatki","PNG — klatki w ZIP-ie"]]){
      const o = document.createElement("option"); o.value = v; o.textContent = t; grp.appendChild(o);
    }
    $("#fmt").appendChild(grp);
  } else if(!W.z && grp) grp.remove();
  $("#fmt").options[0].textContent = W.z ? "PNG — bieżąca klatka" : "PNG — bitmapa";
  $("#fmt").options[1].textContent = W.z ? "SVG — bieżąca klatka" : "SVG — wektor";
  if(!W.z && FORMATY_WIDEO.includes(S.fmt)) S.fmt = "png";
  $("#fmt").value = S.fmt;
  ustawFormat();
}
function wideoUI(){
  const z = W.z, stop = !!z && z.rodzaj === "stopklatka";
  $("#g-wideo").classList.toggle("hidden", !z);
  $("#os").classList.toggle("hidden", !z);
  $(".panel").classList.toggle("animacja", !!z);
  $("#animuj").classList.toggle("hidden", !!z || !S.img);
  kompUI();
  stage.classList.toggle("z-osia", !!z);
  opcjeFormatu();
  przyciskGraj();
  kluczeUI();
  if(!z) return;
  $("#wideo-tytul").textContent = stop ? "Animacja obrazu" : "Wideo";
  $("#tempo-opcje").classList.toggle("hidden", z.rodzaj === "animacja");
  $("#tempo-plik").hidden = stop;
  $("#dlugosc-opcje").classList.toggle("hidden", !stop);
  $("#anim-koniec").classList.toggle("hidden", !stop);
  if(z.rodzaj === "film"){
    $("#tempo-plik").textContent = z.tempoPliku ? "Jak w pliku (" + ulamek(z.tempoPliku) + ")" : "Jak w pliku (nie wykryto — 30)";
    $("#tempo").value = "0";
  }
  if(stop){
    $("#tempo").value = String(z.fps);
    $("#dlugosc").value = z.dlugosc;
    $("#dlugosc-v").textContent = z.dlugosc + " s";
  }
  zakresUI();
}
function zakresUI(){
  const z = W.z, n = z.klatki.length;
  for(const id of ["od", "do", "os-poz"]) $("#"+id).max = n - 1;
  $("#od").value = W.od; $("#do").value = W.do;
  $("#od-v").textContent = zegar(czasOd(W.od));
  $("#do-v").textContent = zegar(czasOd(W.do) + z.klatki[W.do].dur);
  const tempo = z.rodzaj === "animacja" ? "średnio " + ulamek(z.fps) + " kl/s" : ulamek(z.fps) + " kl/s";
  $("#wideo-info").textContent = z.nazwa + " · " + z.szer + "×" + z.wys + " · " + zegar(dlugosc()) + " · " + tempo +
    " · do zapisu: " + klatek(W.do - W.od + 1);
  osUI(W.biezaca);
}
function osUI(i){
  $("#os-poz").value = i;
  $("#os-czas").textContent = zegar(czasOd(i)) + " / " + zegar(dlugosc());
}
function przyciskGraj(){
  const b = $("#os-graj");
  b.textContent = W.gra ? "❚❚" : "▶";
  b.setAttribute("aria-label", W.gra ? "Zatrzymaj" : "Odtwórz");
}
/* każda nowa klatka: animowane parametry na tę chwilę, potem przerysowanie */
przyKlatce(i => {
  S.klatkaNr = i;
  zastosujAnimacje(S, czasOd(i));
  suwakiAnimowane();
  suwakiWarstwy();
  osUI(i);
  kluczeUI();
  schedule();
});

/* Stan klatek kluczowych w panelu: ◆ wypełniony (magenta), gdy w bieżącej
   chwili jest klatka, szary, gdy parametr jest animowany gdzie indziej.
   Pod osią czasu po jednej ścieżce na animowany parametr. */
function kluczeUI(){
  const t = W.z ? czasOd(W.biezaca) : 0;
  for(const c of ANIMOWALNE){
    const b = $("#kl-" + c.key);
    b.classList.toggle("animowany", czyAnimowany(c.key));
    b.setAttribute("aria-pressed", !!W.z && kluczW(c.key, t) >= 0);
  }
  const wz = K.aktywna && K.warstwy[K.wybrana];
  for(const [id, k] of WL){
    const b = $("#kl-" + id), kl = wz ? kluczWarstwy(wz, k) : "";
    b.classList.toggle("animowany", !!wz && czyAnimowany(kl));
    b.setAttribute("aria-pressed", !!(W.z && wz) && kluczW(kl, t) >= 0);
  }
  const box = $("#os-sciezki"), klucze = W.z ? animowane() : [];
  box.classList.toggle("hidden", !klucze.length);
  box.innerHTML = "";
  if(!klucze.length) return;
  const D = dlugosc();
  for(const k of klucze){
    const c = ANIMOWALNE.find(x => x.key === k);
    const w = document.createElement("div"); w.className = "sciezka";
    const nazwa = document.createElement("span"); nazwa.className = "nazwa";
    nazwa.textContent = c ? $("#kl-" + k).dataset.nazwa : nazwaKluczaWarstwy(k);
    const tor = document.createElement("div"); tor.className = "tor";
    const g = document.createElement("i"); g.className = "glowica"; g.style.left = (t/D*100) + "%";
    tor.appendChild(g);
    const ZNAK = {plynnie: "∿", liniowo: "⟋", skokowo: "⊓"};
    SCIEZKI[k].forEach((kl, i) => {
      const m = document.createElement("button"); m.className = "kl" + (kl.k ? " wlasna" : "");
      /* klatka z własną krzywą: znak krzywej przy rombie */
      m.textContent = kl.k ? "◆" + ZNAK[kl.k] : "◆";
      m.style.left = Math.min(100, kl.t/D*100) + "%";
      const ostatnia = i === SCIEZKI[k].length - 1;
      const przejscie = kl.k ? RODZAJE_KRZYWYCH.find(([v]) => v === kl.k)[1].toLowerCase() : "jak cała ścieżka";
      m.title = nazwa.textContent + ": " + (c ? c.opis(KONW[k].zS(kl.v)) : kl.v) + " w " + zegar(kl.t) +
        (ostatnia ? "" : " · przejście do następnej: " + przejscie + " (Shift+klik zmienia)");
      m.setAttribute("aria-label", m.title);
      m.addEventListener("click", e => {
        /* Shift+klik: krzywa od tej klatki do następnej — po kolei: jak ścieżka, płynnie, liniowo, skokowo */
        if(e.shiftKey && !ostatnia){
          const kolej = [null, ...RODZAJE_KRZYWYCH.map(([v]) => v)], j = kolej.indexOf(kl.k || null);
          ustawKrzywaKlucza(k, kl.t, kolej[(j + 1) % kolej.length]);
          if(W.z) zastosujAnimacje(S, czasOd(W.biezaca));
          suwakiAnimowane(); kluczeUI(); schedule();
          return;
        }
        if(W.gra){ pauza(); przyciskGraj(); } idzDo(Math.round(kl.t*W.z.fps));
      });
      tor.appendChild(m);
    });
    const x = document.createElement("button"); x.className = "btn usun"; x.textContent = "×";
    x.title = "Usuń animację: " + nazwa.textContent; x.setAttribute("aria-label", x.title);
    x.addEventListener("click", () => { usunSciezke(k); kluczeUI(); schedule(); });
    /* krzywa przejścia całej ścieżki — przycisk przełączający, bo prawa kolumna
       ścieżek musi mieć szerokość licznika czasu (wyrównanie z suwakiem osi) */
    const kr = document.createElement("button"); kr.className = "fx-b krzywa";
    const teraz = KRZYWE[k] || "plynnie", nr = RODZAJE_KRZYWYCH.findIndex(([v]) => v === teraz);
    kr.textContent = {plynnie: "∿", liniowo: "⟋", skokowo: "⊓"}[teraz];
    kr.title = "Przejście: " + RODZAJE_KRZYWYCH[nr][1].toLowerCase() + " — kliknij, żeby zmienić (pojedynczą klatkę: Shift+klik w ◆)";
    kr.setAttribute("aria-label", "Przejście między klatkami (" + nazwa.textContent + "): " + RODZAJE_KRZYWYCH[nr][1].toLowerCase());
    kr.addEventListener("click", () => {
      ustawKrzywa(k, RODZAJE_KRZYWYCH[(nr + 1) % RODZAJE_KRZYWYCH.length][0]);
      if(W.z) zastosujAnimacje(S, czasOd(W.biezaca));
      suwakiAnimowane(); kluczeUI(); schedule();
    });
    w.append(nazwa, tor, kr, x);
    box.appendChild(w);
  }
}

/* „w:3:x" → „zdjęcie.jpg: Położenie X" */
function nazwaKluczaWarstwy(k){
  const [, id, pole] = k.split(":"), w = K.warstwy.find(x => x.id === +id), wl = WL.find(x => x[1] === pole);
  return (w ? w.nazwa : "warstwa") + ": " + (wl ? $('label[for="' + wl[0] + '"]').textContent : pole);
}

/* zwykły obraz staje się filmem o zadanej długości — dalej wszystko jak przy filmie */
$("#animuj").addEventListener("click", ()=>{
  if(!S.img || W.z || wTrakcie) return;
  animujObraz(S.img, nazwaObrazu);
  wczytanoWideo();
});
$("#anim-koniec").addEventListener("click", ()=>{
  if(!W.z || W.z.rodzaj !== "stopklatka") return;
  const img = W.z.kanwa;
  zamknijWideo();
  S.klatkaNr = 0;
  pokazObraz(img);
  wideoUI();
});
$("#dlugosc").addEventListener("input", e=>{
  if(W.gra){ pauza(); przyciskGraj(); }
  ustawDlugosc(+e.target.value);
  $("#dlugosc-v").textContent = e.target.value + " s";
  zakresUI();
  kluczeUI();
});
function grajPauza(){
  if(!W.z) return;
  if(W.gra) pauza(); else graj();
  przyciskGraj();
}
$("#os-graj").addEventListener("click", grajPauza);
$("#os-poz").addEventListener("input", e=>{
  if(W.gra){ pauza(); przyciskGraj(); }
  idzDo(+e.target.value);
});
/* zmiana zakresu zatrzymuje odtwarzanie i pokazuje klatkę z brzegu zakresu,
   żeby było widać, gdzie film się zaczyna albo kończy */
for(const id of ["od", "do"]) $("#"+id).addEventListener("input", e=>{
  if(W.gra){ pauza(); przyciskGraj(); }
  const v = +e.target.value;
  if(id === "od"){ W.od = v; if(W.do < v) W.do = v; }
  else { W.do = v; if(W.od > v) W.od = v; }
  zakresUI();
  idzDo(v);
});
$("#tempo").addEventListener("change", e=>{
  if(W.gra){ pauza(); przyciskGraj(); }
  ustawTempo(+e.target.value);
  zakresUI();
});
$("#cofnij").addEventListener("click", ()=>krokHistorii(-1));
$("#ponow").addEventListener("click", ()=>krokHistorii(1));
/* Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y — poza polami tekstowymi, które mają własne cofanie */
document.addEventListener("keydown", e=>{
  if(!(e.ctrlKey || e.metaKey) || wTrakcie) return;
  if(e.target.closest('input[type="text"], input[type="number"], textarea')) return;
  const k = e.key.toLowerCase();
  if(k === "z" && !e.shiftKey){ e.preventDefault(); krokHistorii(-1); }
  else if((k === "z" && e.shiftKey) || k === "y"){ e.preventDefault(); krokHistorii(1); }
});
document.addEventListener("keydown", e=>{
  if(e.code !== "Space" || !W.z || wTrakcie) return;
  if(e.target.closest("input, select, textarea, button")) return;
  e.preventDefault();
  grajPauza();
});

["dragenter","dragover"].forEach(ev=>stage.addEventListener(ev, e=>{ e.preventDefault(); stage.classList.add("over"); }));
["dragleave","drop"].forEach(ev=>stage.addEventListener(ev, e=>{ e.preventDefault(); stage.classList.remove("over"); }));
stage.addEventListener("drop", e=>{
  const f=e.dataTransfer.files[0];
  if(!f || wTrakcie) return;
  /* na podgląd można rzucić i obraz, i zapisany preset */
  if(f.type==="application/json" || /\.json$/i.test(f.name)) wczytajPreset(f);
  else if(/\.(hex|gpl|pal|ase|txt)$/i.test(f.name)) wczytajPaleteZPliku(f);
  else fromFile(f);
});
window.addEventListener("paste", e=>{
  for(const it of e.clipboardData.items) if(it.type.startsWith("image/")) fromFile(it.getAsFile());
});

/* próbka: obiekt z gradientem, żeby od razu było na czym testować */
$("#sample").addEventListener("click", ()=>{
  const c=document.createElement("canvas"); c.width=900; c.height=900;
  const x=c.getContext("2d");
  x.fillStyle="#c9c9c9"; x.fillRect(0,0,900,900);
  let g=x.createLinearGradient(0,900,0,300);
  g.addColorStop(0,"#ffffff"); g.addColorStop(1,"#8a8a8a");
  x.fillStyle=g; x.fillRect(0,540,900,360);
  g=x.createRadialGradient(360,340,20,420,400,330);
  g.addColorStop(0,"#ffffff"); g.addColorStop(.45,"#b06a3a"); g.addColorStop(1,"#120c08");
  x.fillStyle=g; x.beginPath(); x.arc(450,420,250,0,6.2832); x.fill();
  g=x.createLinearGradient(0,0,900,0);
  g.addColorStop(0,"#2b3d6b"); g.addColorStop(1,"#d9c27a");
  x.fillStyle=g; x.globalAlpha=.55; x.fillRect(0,0,900,300); x.globalAlpha=1;
  x.fillStyle="rgba(0,0,0,.35)"; x.beginPath();
  x.ellipse(470,690,290,46,0,0,6.2832); x.fill();
  const im=new Image(); im.onload=()=>setImage(im, "próbka"); im.src=c.toDataURL();
});
/* ---------- przetwarzanie folderu ---------- */
function komunikatFolderu(t){ $("#batch-msg").textContent = t; }
/* Na czas pracy reszta panelu dostaje `inert` — samo pointer-events odcięłoby
   myszkę, a klawiatura dalej ruszałaby suwaki w połowie folderu. W grupie
   z przyciskiem „Przerwij" wyłączamy pozostałe kontrolki pojedynczo,
   zapamiętując, które były włączone — skala przy SVG jest wyłączona sama
   z siebie i po pracy ma taka zostać. */
let wylaczone = [];
function zablokujPanel(tak, zostaw){
  const panel = $(".panel"), grupa = zostaw.closest(".group");
  panel.classList.toggle("zajete", tak);
  for(const g of panel.querySelectorAll(".group")) if(g !== grupa) g.inert = tak;
  $("#os").inert = tak;
  if(tak){
    wylaczone = [...grupa.querySelectorAll("button, select, input")].filter(el => el !== zostaw && !el.disabled);
    for(const el of wylaczone) el.disabled = true;
  } else {
    for(const el of wylaczone) el.disabled = false;
    wylaczone = [];
  }
}
function pobierz(blob, nazwa, ms){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nazwa;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), ms || 10000);
}
const megabajty = b => (b/1048576).toFixed(1).replace(".", ",") + " MB";
function nazwaFolderu(pliki){
  const p = (pliki[0].webkitRelativePath || "").split("/")[0];
  return (p || "obrazy").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40) || "obrazy";
}
function opisWyniku(w){
  let t = (w.przerwane ? "Przerwano po " : "Gotowe: ") + w.zrobione + " z " + w.wszystkich + " obrazów";
  if(w.zip) t += " · " + megabajty(w.zip.size);
  if(w.pominiete.length) t += " · pominięte (" + w.pominiete.length + "): " +
    w.pominiete.slice(0, 3).join(", ") + (w.pominiete.length > 3 ? "…" : "");
  if(w.nieobrazy) t += " · plików, które nie są obrazami: " + w.nieobrazy;
  return t + ".";
}
$("#batch").addEventListener("click", ()=>{
  if(wTrakcie){ przerwij = true; $("#batch").textContent = "Przerywam po bieżącym pliku…"; return; }
  $("#batch-dir").click();
});
$("#batch-dir").addEventListener("change", async e=>{
  const pliki = [...e.target.files];
  e.target.value = "";
  if(!pliki.length) return;
  if(W.gra){ pauza(); przyciskGraj(); }
  wTrakcie = true; przerwij = false;
  zablokujPanel(true, $("#batch"));
  $("#batch").textContent = "Przerwij";
  try{
    const w = await przetworzFolder(pliki, {
      postep: (i, n, nazwa) => komunikatFolderu("Przetwarzam " + (i+1) + " z " + n + ": " + nazwa),
      przerwano: () => przerwij
    });
    if(!w.wszystkich){ komunikatFolderu("W wybranym folderze nie ma obrazów."); return; }
    if(w.zip) pobierz(w.zip, "raster-" + nazwaFolderu(pliki) + "-" + Date.now() + ".zip");
    komunikatFolderu(opisWyniku(w));
  } catch(err){
    komunikatFolderu("Przerwano: " + err.message);
  } finally {
    wTrakcie = false;
    zablokujPanel(false, $("#batch"));
    $("#batch").textContent = "Przetwórz cały folder";
    schedule();                 /* podgląd wraca do obrazu sprzed przetwarzania */
  }
});
/* ---------- zapis ---------- */
function komunikatZapisu(t){ $("#save-msg").textContent = t; }
function ustawFormat(){
  eksportUI();
  $("#save").textContent = NAPISY[S.fmt];
  $("#scl").disabled = (S.fmt==="svg" || S.fmt==="txt");
  komunikatZapisu(S.fmt==="mp4" && !mozeMp4()
    ? "Ta przeglądarka nie ma kodera wideo (WebCodecs) — MP4 zapiszesz w Chrome albo Edge. GIF i klatki PNG działają."
    : "");
}
$("#wektor").addEventListener("change", e=>{ S.wektor=e.target.value; eksportUI(); });
$("#jakosc").addEventListener("change", e=>{ S.jakosc=e.target.value; });
$("#przezroczyste").addEventListener("change", e=>{ S.przezroczyste=e.target.checked; });
$("#dzwiek").addEventListener("change", e=>{ S.dzwiek=e.target.checked; });
$("#fmt").addEventListener("change", e=>{ S.fmt=e.target.value; ustawFormat(); });

const czasTrwania = s => s < 60 ? Math.max(1, Math.round(s)) + " s" : Math.floor(s/60) + " min " + Math.round(s%60) + " s";
async function zapiszFilm(){
  if(W.gra){ pauza(); przyciskGraj(); }
  wTrakcie = true; przerwij = false;
  zablokujPanel(true, $("#save"));
  $("#save").textContent = "Przerwij";
  try{
    const w = await zapiszWideo({
      postep: (k, n, zostalo, tekst) => komunikatZapisu(tekst || ("Klatka " + (k+1) + " z " + n +
        (zostalo !== null && k >= 3 ? " · zostało ok. " + czasTrwania(zostalo) : ""))),
      przerwano: () => przerwij
    });
    if(w.blob) pobierz(w.blob, w.nazwa, 60000);
    let t = !w.zrobione ? "Przerwano, zanim powstała pierwsza klatka."
          : (w.przerwane ? "Przerwano — zapisano " + w.zrobione + " z " + w.wszystkich + " klatek"
                         : "Gotowe: " + klatek(w.zrobione)) + " · " + megabajty(w.blob.size);
    if(w.uwaga) t += " · " + w.uwaga;
    komunikatZapisu(t + ".");
  } catch(err){
    komunikatZapisu("Nie udało się zapisać: " + err.message);
  } finally {
    wTrakcie = false;
    zablokujPanel(false, $("#save"));
    $("#save").textContent = NAPISY[S.fmt];
    schedule();
  }
}
$("#save").addEventListener("click", async ()=>{
  if(wTrakcie){
    /* w czasie zapisu filmu ten przycisk przerywa */
    if(!przerwij && $("#save").textContent === "Przerwij"){ przerwij = true; $("#save").textContent = "Przerywam po bieżącej klatce…"; }
    return;
  }
  if(!S.img) return;
  if(FORMATY_WIDEO.includes(S.fmt)){ await zapiszFilm(); return; }
  if(S.fmt==="svg"){ await saveSVG(); return; }
  if(S.fmt==="txt"){
    pobierz(new Blob([tekstAscii()], {type: "text/plain;charset=utf-8"}), "ascii-" + Date.now() + ".txt", 2000);
    komunikatZapisu("Zapisano tekst — " + tekstAscii().split("\n").length + " wierszy.");
    return;
  }
  const przezr = S.przezroczyste && mozePrzezroczyste();
  await renderuj(S.scl, {keep:true, przezroczyste: przezr});
  if(przezr && S.mode !== "ascii") papierPrzezroczysty();
  out.toBlob(b=>{
    pobierz(b, NAZWA_TRYBU[S.mode] + "-" + Date.now() + ".png", 2000);
    render();
  }, "image/png");
});
/* ---------- motyw ----------
   Domyślnie ciemny (ustawia go skrypt w <head>, zanim strona się narysuje);
   przycisk przełącza i zapamiętuje wybór. localStorage w try/catch —
   w trybie prywatnym rzuca, a przełącznik ma działać i tak, tylko bez pamięci. */
function motywUI(){
  const ciemny = document.documentElement.getAttribute("data-theme") !== "light";
  $("#motyw").textContent = ciemny ? "Jasny" : "Ciemny";
  $("#motyw").title = ciemny ? "Przełącz na jasny wygląd" : "Przełącz na ciemny wygląd";
}
$("#motyw").addEventListener("click", ()=>{
  const nowy = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", nowy);
  try{ localStorage.setItem("raster.motyw", nowy); }catch{}
  motywUI();
});
motywUI();

/* ---------- zwijane grupy panelu ----------
   Klik w nagłówek grupy chowa jej zawartość, jak sekcje w Dither Boyu.
   Pamiętamy po tytule grupy (try/catch — localStorage potrafi rzucić). */
const KLUCZ_ZWINIETYCH = "raster.zwiniete";
let zwiniete = [];
try{ zwiniete = JSON.parse(localStorage.getItem(KLUCZ_ZWINIETYCH) || "[]"); if(!Array.isArray(zwiniete)) zwiniete = []; }catch{ zwiniete = []; }
for(const h of document.querySelectorAll(".panel .group > h2")){
  const g = h.parentElement, klucz = h.textContent.trim();
  h.setAttribute("role", "button"); h.tabIndex = 0;
  const ustaw = zw => { g.classList.toggle("zwinieta", zw); h.setAttribute("aria-expanded", !zw); };
  ustaw(zwiniete.includes(klucz));
  const przelacz = () => {
    const zw = !g.classList.contains("zwinieta");
    ustaw(zw);
    zwiniete = zwiniete.filter(k => k !== klucz); if(zw) zwiniete.push(klucz);
    try{ localStorage.setItem(KLUCZ_ZWINIETYCH, JSON.stringify(zwiniete)); }catch{}
  };
  h.addEventListener("click", przelacz);
  h.addEventListener("keydown", e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); przelacz(); } });
}

/* ---------- kompozycja z warstw ----------
   Stan i składanie w warstwy.js; tu tylko panel i przeciąganie po podglądzie.
   Złożone płótno (K.kanwa) jest stale tym samym obiektem w S.img — zmiana
   warstwy to nowe złożenie i przerysowanie, jak ruch suwaka. */
(function trybyMieszania(){ for(const [v, n] of TRYBY){ const o = document.createElement("option"); o.value = v; o.textContent = n; $("#komp-tryb").appendChild(o); } })();
function odswiezKomp(){ S.img = zloz(); schedule(); }
const WL = [["komp-x", "x", v => Math.round(v) + " px"], ["komp-y", "y", v => Math.round(v) + " px"], ["komp-skala", "skala", v => v + "%"],
            ["komp-obrot", "obrot", v => v + "°"], ["komp-krycie", "krycie", v => v + "%"]];
function kompUI(){
  const film = W.z && W.z.rodzaj !== "stopklatka";
  $("#komp-start").classList.toggle("hidden", K.aktywna || !S.img || !!W.z);
  kadrUI();
  $("#usun-tlo").classList.toggle("hidden", K.aktywna || !S.img || !!W.z);
  $("#g-warstwy").classList.toggle("hidden", !K.aktywna || film);
  if(!K.aktywna) return;
  $("#komp-szer").value = K.szer; $("#komp-wys").value = K.wys;
  $("#komp-format").value = [...$("#komp-format").options].some(o => o.value === K.szer + "x" + K.wys) ? K.szer + "x" + K.wys : "";
  $("#komp-tlo").value = K.tlo; $("#komp-przezr").checked = K.przezroczyste;
  const lista = $("#komp-lista");
  lista.innerHTML = "";
  /* od góry: ostatnia w tablicy leży na wierzchu */
  for(let i = K.warstwy.length - 1; i >= 0; i--){
    const w = K.warstwy[i], el = document.createElement("div");
    el.className = "warstwa" + (w.widoczna ? "" : " ukryta");
    el.setAttribute("role", "option"); el.setAttribute("aria-selected", i === K.wybrana);
    el.innerHTML = '<button class="fx-b" data-a="oko"></button><button class="nazwa" data-a="wybierz"></button>' +
      '<button class="fx-b" data-a="gora" title="Wyżej">↑</button><button class="fx-b" data-a="dol" title="Niżej">↓</button><button class="fx-b" data-a="usun" title="Usuń warstwę">×</button>';
    el.querySelector(".nazwa").textContent = w.nazwa;
    el.querySelector(".nazwa").title = "Zaznacz · dwuklik: zmień nazwę";
    const oko = el.querySelector('[data-a="oko"]'); oko.textContent = w.widoczna ? "◉" : "○"; oko.title = w.widoczna ? "Ukryj" : "Pokaż";
    el.querySelector('[data-a="gora"]').disabled = i === K.warstwy.length - 1;
    el.querySelector('[data-a="dol"]').disabled = i === 0;
    for(const b of el.querySelectorAll(".fx-b")) b.setAttribute("aria-label", b.title + ": " + w.nazwa);
    el.dataset.i = i;
    lista.appendChild(el);
  }
  const w = K.warstwy[K.wybrana];
  $("#komp-wlasciwosci").classList.toggle("hidden", !w);
  if(!w) return;
  const ef = czyEfekt(w);
  $("#komp-efektowe").classList.toggle("hidden", !ef);
  for(const el of document.querySelectorAll("#komp-wlasciwosci .tylko-obraz")) el.classList.toggle("hidden", ef);
  if(ef) kartaWarstwyEfektu(w);
  $("#komp-x").max = K.szer; $("#komp-y").max = K.wys;
  for(const [id, k, opis] of WL){ $("#" + id).value = w[k]; $("#" + id + "-v").textContent = opis(w[k]); }
  $("#komp-tryb").value = w.tryb;
  if(ef) return;                 /* warstwa efektu nie ma tła do usuwania ani maski */
  $("#komp-wytnij").checked = w.tlo.wl;
  $("#komp-wytnij-opcje").classList.toggle("hidden", !w.tlo.wl);
  $("#komp-kolor-tla").style.background = w.tlo.kolor ? "rgb(" + w.tlo.kolor.join(",") + ")" : "transparent";
  $("#komp-tol").value = w.tlo.tolerancja; $("#komp-tol-v").textContent = w.tlo.tolerancja;
  $("#komp-miek").value = w.tlo.miekkosc; $("#komp-miek-v").textContent = w.tlo.miekkosc;
  $("#komp-spojne").checked = w.tlo.spojne;
  for(const b of document.querySelectorAll("#komp-sposob button")) b.setAttribute("aria-pressed", b.dataset.s === w.tlo.sposob);
  $("#komp-kolor-opcje").classList.toggle("hidden", w.tlo.sposob === "ai");
  $("#komp-pedzel-wyczysc").classList.toggle("hidden", !w.reka);
}
/* ---------- warstwa efektu ----------
   Lista efektów jak w stosie (bez zmienności w czasie — ta działa przed
   ditheringiem całego obrazu). Karta to klon ciała karty ze stosu, pisząca
   do w.par; przebudowana przy zmianie warstwy albo efektu. */
(function listaEfektowWarstwy(){
  const sel = $("#komp-efekt");
  for(const e of EFEKTY) if(!e.przed){ const o = document.createElement("option"); o.value = e.id; o.textContent = e.nazwa; sel.appendChild(o); }
})();
function kartaWarstwyEfektu(w){
  $("#komp-efekt").value = w.efekt;
  const box = $("#komp-efekt-karta"), znak = w.id + ":" + w.efekt, suf = "__w" + w.id;
  if(box.dataset.znak !== znak){
    box.innerHTML = "";
    box.appendChild(klonCiala(w.efekt, suf, (klucz, v) => { w.par[klucz] = v; odswiezKomp(); }));
    box.dataset.znak = znak;
  }
  wypelnijCialo(box, w.efekt, suf, w.par);
}
$("#komp-efekt").addEventListener("change", e=>{
  const w = K.warstwy[K.wybrana]; if(!czyEfekt(w)) return;
  const wpis = EFEKTY.find(x => x.id === e.target.value);
  if(w.nazwa === "Efekt: " + wpisEfektu(w.efekt).nazwa) w.nazwa = "Efekt: " + wpis.nazwa;
  w.efekt = wpis.id; w.par = {...wpis.start};
  kompUI(); odswiezKomp();
});
$("#komp-dodaj-efekt").addEventListener("click", ()=>{
  if(!K.aktywna) return;
  dodajWarstweEfektu("rgb");
  kompUI(); odswiezKomp();
});

$("#komp-start").addEventListener("click", ()=>{
  if(!S.img || W.z || wTrakcie) return;
  utworzKomp(S.img, nazwaObrazu);
  odswiezKomp();
  kompUI();
});
$("#komp-lista").addEventListener("click", e=>{
  const b = e.target.closest("[data-a]"); if(!b) return;
  const i = +b.closest(".warstwa").dataset.i, a = b.dataset.a;
  if(a === "wybierz") K.wybrana = i;
  else if(a === "oko") K.warstwy[i].widoczna = !K.warstwy[i].widoczna;
  else if(a === "gora") przesunWarstwe(i, 1);
  else if(a === "dol") przesunWarstwe(i, -1);
  else if(a === "usun"){
    if(K.warstwy.length === 1){ komunikatWczytania("Kompozycja musi mieć co najmniej jedną warstwę — „Zakończ kompozycję” wraca do obrazu."); return; }
    usunWarstwe(i);
  }
  kompUI();
  if(a !== "wybierz") odswiezKomp();
});
$("#komp-lista").addEventListener("dblclick", e=>{
  const b = e.target.closest(".nazwa"); if(!b) return;
  const i = +b.closest(".warstwa").dataset.i, nowa = prompt("Nazwa warstwy", K.warstwy[i].nazwa);
  if(nowa && nowa.trim()){ K.warstwy[i].nazwa = nowa.trim().slice(0, 60); kompUI(); }
});
/* ◆ przy suwakach warstwy — klatki kluczowe jej położenia, skali, obrotu,
   krycia; zakresy dla animacji z suwaków (x i y szerzej: warstwa może
   wyjechać poza płótno przeciągnięciem) */
function konwWarstwy(id, k){
  const el = $("#" + id), szeroko = k === "x" || k === "y";
  return {zS: v => v, min: szeroko ? -20000 : +el.min, max: szeroko ? 20000 : +el.max};
}
function kluczWarstwyTeraz(k, v){
  const w = K.warstwy[K.wybrana];
  if(!w || !W.z) return;
  const kl = kluczWarstwy(w, k), id = WL.find(x => x[1] === k)[0];
  KONW[kl] = konwWarstwy(id, k);
  ustawKlucz(kl, czasOd(W.biezaca), Math.round(v));
}
for(const [id, k] of WL){
  const b = document.createElement("button");
  b.className = "klucz"; b.id = "kl-" + id; b.textContent = "◆";
  const nazwa = $('label[for="' + id + '"]').textContent;
  b.title = "Klatka kluczowa warstwy: " + nazwa; b.setAttribute("aria-label", b.title);
  b.addEventListener("click", ()=>{
    const w = K.warstwy[K.wybrana];
    if(!w || !W.z) return;
    const kl = kluczWarstwy(w, k), t = czasOd(W.biezaca);
    if(kluczW(kl, t) >= 0) usunKlucz(kl, t);
    else kluczWarstwyTeraz(k, w[k]);
    kluczeUI();
    schedule();
  });
  const wartosc = $("#" + id + "-v");
  wartosc.parentElement.insertBefore(b, wartosc);
}
/* wartości suwaków warstwy po klatce animacji (bez przebudowy listy warstw) */
function suwakiWarstwy(){
  const w = K.aktywna && K.warstwy[K.wybrana];
  if(!w) return;
  for(const [id, k, opis] of WL){ $("#" + id).value = w[k]; $("#" + id + "-v").textContent = opis(w[k]); }
}
for(const [id, k, opis] of WL) $("#" + id).addEventListener("input", e=>{
  const w = K.warstwy[K.wybrana]; if(!w) return;
  w[k] = +e.target.value;
  /* parametr warstwy już animowany: ruszenie suwaka ustawia klatkę w bieżącym miejscu */
  if(W.z && czyAnimowany(kluczWarstwy(w, k))){ kluczWarstwyTeraz(k, w[k]); kluczeUI(); }
  $("#" + id + "-v").textContent = opis(w[k]);
  odswiezKomp();
});
$("#komp-tryb").addEventListener("change", e=>{ const w = K.warstwy[K.wybrana]; if(w){ w.tryb = e.target.value; odswiezKomp(); } });
$("#komp-srodek").addEventListener("click", ()=>{
  const w = K.warstwy[K.wybrana]; if(!w) return;
  Object.assign(w, {x: K.szer/2, y: K.wys/2, skala: 100, obrot: 0});
  kompUI(); odswiezKomp();
});
/* zmiana rozmiaru płótna: warstwy zostają w tym samym miejscu względem płótna */
function rozmiarPlotna(sz, wy){
  sz = Math.max(16, Math.min(4000, Math.round(sz) || K.szer)); wy = Math.max(16, Math.min(4000, Math.round(wy) || K.wys));
  for(const w of K.warstwy){ w.x *= sz/K.szer; w.y *= wy/K.wys; }
  K.szer = sz; K.wys = wy;
  kompUI(); odswiezKomp();
}
$("#komp-format").addEventListener("change", e=>{ if(e.target.value){ const [a, b] = e.target.value.split("x").map(Number); rozmiarPlotna(a, b); } });
$("#komp-szer").addEventListener("change", e=>rozmiarPlotna(+e.target.value, K.wys));
$("#komp-wys").addEventListener("change", e=>rozmiarPlotna(K.szer, +e.target.value));
$("#komp-tlo").addEventListener("input", e=>{ K.tlo = e.target.value; odswiezKomp(); });
$("#komp-przezr").addEventListener("change", e=>{ K.przezroczyste = e.target.checked; odswiezKomp(); });
$("#komp-dodaj").addEventListener("click", ()=>$("#komp-plik").click());
$("#komp-plik").addEventListener("change", async e=>{
  const pliki = [...e.target.files]; e.target.value = "";
  for(const f of pliki){
    if(!/^image\//.test(f.type)) continue;
    try{ dodajWarstwe(await createImageBitmap(f), f.name); }
    catch{ komunikatWczytania("Nie udało się otworzyć: " + f.name); }
  }
  kompUI(); odswiezKomp();
});
/* koniec: kompozycja zostaje jako zwykły obraz (spłaszczona), warstwy znikają */
$("#komp-koniec").addEventListener("click", ()=>{
  pedzel = ""; pedzelUI();
  const plaski = document.createElement("canvas"); plaski.width = K.szer; plaski.height = K.wys;
  plaski.getContext("2d").drawImage(zloz(), 0, 0);
  zakonczKomp();
  nazwaObrazu = "kompozycja";
  pokazObraz(plaski);
  wideoUI();
});
/* ---------- usuwanie tła warstwy ----------
   Maska liczy się raz przy zmianie ustawień (warstwy.js), nie przy każdym
   przerysowaniu. Kroplomierz: następne kliknięcie w podgląd bierze kolor
   zdjęcia zaznaczonej warstwy spod kursora. */
let kroplomierz = false, pedzel = "", malowanie = null;
function pedzelUI(){
  for(const b of document.querySelectorAll("#komp-pedzel button")) b.setAttribute("aria-pressed", b.dataset.p === pedzel);
  out.classList.toggle("pedzel", !!pedzel);
}
$("#komp-pedzel").addEventListener("click", e=>{
  const b = e.target.closest("button"); if(!b) return;
  pedzel = b.dataset.p; pedzelUI();
});
$("#komp-pedzel-r").addEventListener("input", e=>{ $("#komp-pedzel-r-v").textContent = e.target.value + " px"; });
$("#komp-pedzel-wyczysc").addEventListener("click", ()=>{
  const w = K.warstwy[K.wybrana]; if(!w) return;
  wyczyscPedzel(w); kompUI(); odswiezKomp();
});
function przetnij(){ const w = K.warstwy[K.wybrana]; if(!w) return; wytnij(w); kompUI(); odswiezKomp(); }
$("#komp-wytnij").addEventListener("change", e=>{ const w = K.warstwy[K.wybrana]; if(!w) return; w.tlo.wl = e.target.checked; przetnij(); });
$("#komp-tol").addEventListener("input", e=>{ const w = K.warstwy[K.wybrana]; if(!w) return; w.tlo.tolerancja = +e.target.value; przetnij(); });
$("#komp-miek").addEventListener("input", e=>{ const w = K.warstwy[K.wybrana]; if(!w) return; w.tlo.miekkosc = +e.target.value; przetnij(); });
$("#komp-spojne").addEventListener("change", e=>{ const w = K.warstwy[K.wybrana]; if(!w) return; w.tlo.spojne = e.target.checked; przetnij(); });
$("#komp-z-brzegow").addEventListener("click", ()=>{ const w = K.warstwy[K.wybrana]; if(!w) return; w.tlo.kolor = null; przetnij(); });
$("#komp-kroplomierz").addEventListener("click", ()=>{
  kroplomierz = !kroplomierz;
  out.classList.toggle("kroplomierz", kroplomierz);
  $("#komp-kroplomierz").textContent = kroplomierz ? "Kliknij tło na podglądzie…" : "Wskaż kolor";
});
/* Automatycznie: model liczy się kilka sekund (pierwszy raz dłużej —
   wczytanie ~180 MB). Komunikat stanu pod przełącznikiem; bez modelu —
   wskazówka, jak go pobrać, i zostaje usuwanie po kolorze. */
const BRAK_MODELU = "Model automatycznego usuwania tła nie jest pobrany. W katalogu apki uruchom: npm run modele — zostaje usuwanie po kolorze.";
async function usunTloAI(w){
  const st = $("#komp-ai-stan");
  st.classList.remove("hidden"); st.textContent = "Szukam obiektu… (pierwszy raz wczytuje model, kilka–kilkanaście sekund)";
  const t0 = performance.now();
  try{
    await wytnijAI(w);
    st.textContent = "Gotowe w " + ((performance.now() - t0)/1000).toFixed(1).replace(".", ",") + " s. Poprawki — pędzlem maski niżej.";
    return true;
  }catch(e){
    st.textContent = e.kod === "BRAK_MODELU" ? BRAK_MODELU : "Nie udało się: " + e.message;
    return false;
  }finally{
    kompUI(); odswiezKomp();
  }
}
$("#komp-sposob").addEventListener("click", async e=>{
  const b = e.target.closest("button"), w = K.warstwy[K.wybrana];
  if(!b || !w) return;
  if(b.dataset.s === "ai") await usunTloAI(w);
  else { w.tlo.sposob = "kolor"; $("#komp-ai-stan").classList.add("hidden"); przetnij(); }
});
/* skrót: zwykły obraz → kompozycja o jego rozmiarze, z wyciętym tłem i płótnem
   w kolorze papieru — od razu „wycięty obiekt na jednolitym kolorze".
   Najpierw automatycznie; bez modelu — po kolorze. */
$("#usun-tlo").addEventListener("click", async ()=>{
  if(!S.img || W.z || wTrakcie) return;
  utworzKomp(S.img, nazwaObrazu);
  K.tlo = S.paper;
  const w = K.warstwy[0];
  w.tlo.wl = true;
  wytnij(w);
  odswiezKomp();
  kompUI();
  await usunTloAI(w);
});

/* ---------- kadrowanie ----------
   Ramka w pikselach obrazu (S.img), rysowana nad podglądem (ten ma te same
   proporcje co obraz). Zatwierdzenie podmienia S.img na wycinek — dalej jak
   zwykły obraz; oryginał zostaje do „Przywróć cały obraz". Tylko zwykłe
   obrazy: film ma własny zakres, kompozycja własne płótno. */
const proporcja = () => +$("#kadr-proporcje").value || 0;
function kadrUI(){
  const mozna = !!S.img && !W.z && !K.aktywna && !wTrakcie;
  $("#kadruj").classList.toggle("hidden", !mozna || KADR.aktywny);
  $("#kadr-opcje").classList.toggle("hidden", !KADR.aktywny);
  $("#kadr-oryginal").classList.toggle("hidden", !mozna || KADR.aktywny || !KADR.oryginal);
  $("#kadr").classList.toggle("hidden", !KADR.aktywny);
  if(KADR.aktywny) ustawRamke();
}
/* największa ramka o zadanych proporcjach, wokół środka (cx, cy), w granicach obrazu */
function dopasujKadr(cx, cy){
  const W0 = S.img.width, H0 = S.img.height, p = proporcja();
  let w = KADR.w || W0, h = KADR.h || H0;
  if(p){ w = Math.min(W0, H0*p); h = w/p; }
  KADR.w = w; KADR.h = h;
  KADR.x = Math.min(W0 - w, Math.max(0, cx - w/2)); KADR.y = Math.min(H0 - h, Math.max(0, cy - h/2));
}
function ustawRamke(){
  const r = out.getBoundingClientRect(), s = stage.getBoundingClientRect(), k = r.width/S.img.width, el = $("#kadr");
  el.style.left = (r.left - s.left + stage.scrollLeft + KADR.x*k) + "px"; el.style.top = (r.top - s.top + stage.scrollTop + KADR.y*k) + "px";
  el.style.width = (KADR.w*k) + "px"; el.style.height = (KADR.h*k) + "px";
}
function zakonczKadr(){ KADR.aktywny = false; KADR.ruch = null; kadrUI(); }
$("#kadruj").addEventListener("click", ()=>{
  if(!S.img || W.z || K.aktywna) return;
  KADR.aktywny = true; KADR.w = 0; KADR.h = 0;
  dopasujKadr(S.img.width/2, S.img.height/2);
  kadrUI();
});
$("#kadr-proporcje").addEventListener("change", ()=>{ dopasujKadr(KADR.x + KADR.w/2, KADR.y + KADR.h/2); ustawRamke(); });
$("#kadr-anuluj").addEventListener("click", zakonczKadr);
$("#kadr-ok").addEventListener("click", ()=>{
  const x = Math.round(KADR.x), y = Math.round(KADR.y), w = Math.max(1, Math.round(KADR.w)), h = Math.max(1, Math.round(KADR.h));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(S.img, x, y, w, h, 0, 0, w, h);
  if(!KADR.oryginal) KADR.oryginal = S.img;
  zakonczKadr();
  pokazObraz(c);
  kadrUI();
});
$("#kadr-oryginal").addEventListener("click", ()=>{
  if(!KADR.oryginal) return;
  const o = KADR.oryginal; KADR.oryginal = null;
  pokazObraz(o);
  kadrUI();
});
/* przesuwanie ramki i zmiana rozmiaru rogiem (z zachowaniem proporcji);
   przeciwległy róg stoi w miejscu */
$("#kadr").addEventListener("pointerdown", e=>{
  e.preventDefault();
  $("#kadr").setPointerCapture(e.pointerId);
  KADR.ruch = {rog: e.target.dataset.r || null, sx: e.clientX, sy: e.clientY, x: KADR.x, y: KADR.y, w: KADR.w, h: KADR.h};
});
$("#kadr").addEventListener("pointermove", e=>{
  const m = KADR.ruch; if(!m) return;
  const k = out.getBoundingClientRect().width/S.img.width, dx = (e.clientX - m.sx)/k, dy = (e.clientY - m.sy)/k;
  const W0 = S.img.width, H0 = S.img.height, p = proporcja(), MIN = 16;
  if(!m.rog){
    KADR.x = Math.min(W0 - m.w, Math.max(0, m.x + dx)); KADR.y = Math.min(H0 - m.h, Math.max(0, m.y + dy));
  } else {
    const lewy = m.rog[1] === "w", gora = m.rog[0] === "n";
    const fx = lewy ? m.x + m.w : m.x, fy = gora ? m.y + m.h : m.y;          /* przeciwległy róg */
    let w = Math.max(MIN, m.w + (lewy ? -dx : dx)), h = Math.max(MIN, m.h + (gora ? -dy : dy));
    if(p){ if(w/h > p) h = w/p; else w = h*p; }
    const maxW = lewy ? fx : W0 - fx, maxH = gora ? fy : H0 - fy;
    if(w > maxW){ w = maxW; if(p) h = w/p; }
    if(h > maxH){ h = maxH; if(p) w = h*p; }
    KADR.w = w; KADR.h = h; KADR.x = lewy ? fx - w : fx; KADR.y = gora ? fy - h : fy;
  }
  ustawRamke();
});
for(const ev of ["pointerup", "pointercancel"]) $("#kadr").addEventListener(ev, ()=>{ KADR.ruch = null; });
window.addEventListener("resize", ()=>{ if(KADR.aktywny) ustawRamke(); });

/* przeciąganie warstwy po podglądzie: współrzędne ekranu → płótno kompozycji
   (podgląd to płótno pomniejszone z zachowaniem proporcji) */
let ciagnieta = null;
out.addEventListener("pointerdown", e=>{
  if(!K.aktywna || wTrakcie || (W.z && W.z.rodzaj !== "stopklatka")) return;
  const r = out.getBoundingClientRect(), px = (e.clientX - r.left)/r.width*K.szer, py = (e.clientY - r.top)/r.height*K.wys;
  if(kroplomierz){
    const w = K.warstwy[K.wybrana], c = w && kolorPod(K.wybrana, px, py);
    kroplomierz = false; out.classList.remove("kroplomierz");
    $("#komp-kroplomierz").textContent = "Wskaż kolor";
    if(c){ w.tlo.kolor = c; w.tlo.wl = true; przetnij(); }
    return;
  }
  if(pedzel){
    /* pędzel maluje po zaznaczonej warstwie — nie zaznacza i nie przesuwa */
    if(K.wybrana < 0) return;
    malowanie = {px, py};
    out.setPointerCapture(e.pointerId);
    if(maluj(K.wybrana, px, py, +$("#komp-pedzel-r").value/2, pedzel)) odswiezKomp();
    return;
  }
  const i = trafiona(px, py);
  if(i < 0) return;
  K.wybrana = i;
  ciagnieta = {i, px, py, x: K.warstwy[i].x, y: K.warstwy[i].y};
  out.setPointerCapture(e.pointerId);
  out.classList.add("przeciaganie");
  kompUI();
});
out.addEventListener("pointermove", e=>{
  if(malowanie){
    /* odcinek od ostatniego punktu, odciski co ćwierć promienia — szybki ruch nie robi kropek */
    const r = out.getBoundingClientRect(), px = (e.clientX - r.left)/r.width*K.szer, py = (e.clientY - r.top)/r.height*K.wys;
    const R = +$("#komp-pedzel-r").value/2, d = Math.hypot(px - malowanie.px, py - malowanie.py), n = Math.max(1, Math.ceil(d/(R/4)));
    let cos = false;
    for(let k=1; k<=n; k++) cos = maluj(K.wybrana, malowanie.px + (px - malowanie.px)*k/n, malowanie.py + (py - malowanie.py)*k/n, R, pedzel) || cos;
    malowanie = {px, py};
    if(cos) odswiezKomp();
    return;
  }
  if(!ciagnieta) return;
  const r = out.getBoundingClientRect(), px = (e.clientX - r.left)/r.width*K.szer, py = (e.clientY - r.top)/r.height*K.wys;
  const w = K.warstwy[ciagnieta.i];
  w.x = ciagnieta.x + px - ciagnieta.px; w.y = ciagnieta.y + py - ciagnieta.py;
  if(W.z){
    let kl = false;
    for(const k of ["x", "y"]) if(czyAnimowany(kluczWarstwy(w, k))){ kluczWarstwyTeraz(k, w[k]); kl = true; }
    if(kl) kluczeUI();
  }
  $("#komp-x").value = w.x; $("#komp-x-v").textContent = Math.round(w.x) + " px";
  $("#komp-y").value = w.y; $("#komp-y-v").textContent = Math.round(w.y) + " px";
  odswiezKomp();
});
for(const ev of ["pointerup", "pointercancel"]) out.addEventListener(ev, ()=>{
  ciagnieta = null; out.classList.remove("przeciaganie");
  if(malowanie){ malowanie = null; kompUI(); }
});

/* ---------- zapisane palety (presety kolorów) ----------
   W localStorage, jak własne presety: [{nazwa, kolory, mapa}]. Odczyt nieufny
   (paletaZDanych — ta sama walidacja co plik), każdy dostęp w try/catch. Użycie
   palety wkłada kopię do palety własnej (S.custom) — dalej działa jak paleta
   z pliku: w presetach, w edytorze, w zapisie .hex. */
const KLUCZ_PALET = "raster.palety";
function czytajPalety(){
  try{
    const a = JSON.parse(localStorage.getItem(KLUCZ_PALET) || "[]");
    if(!Array.isArray(a)) return [];
    const wyn = [];
    for(const d of a){
      try{ const p = paletaZDanych(d); wyn.push({nazwa: p.nazwa, kolory: p.kolory, mapa: d.mapa === "jasnosc" ? "jasnosc" : "kolor"}); }
      catch{ /* uszkodzony wpis pomijamy, reszta zostaje */ }
    }
    return wyn;
  }catch{ return []; }
}
function zapiszPalety(a){
  try{ localStorage.setItem(KLUCZ_PALET, JSON.stringify(a)); return true; }catch{ return false; }
}
function zapisanePaletyUI(){
  const lista = czytajPalety(), box = $("#pal-zap-lista");
  $("#pal-zap-ile").textContent = lista.length;
  box.innerHTML = "";
  lista.forEach((p, i) => {
    const w = document.createElement("div"); w.className = "wiersz";
    const u = document.createElement("button"); u.className = "uzyj"; u.title = "Użyj palety „" + p.nazwa + "”";
    const pasek = document.createElement("span"); pasek.className = "pasek";
    for(const c of p.kolory.slice(0, 16)){ const k = document.createElement("i"); k.style.background = rgb2hex(c); pasek.appendChild(k); }
    const n = document.createElement("span"); n.textContent = p.nazwa + " (" + p.kolory.length + ")";
    u.append(pasek, n);
    u.addEventListener("click", () => {
      S.mapa = p.mapa;
      ustawWlasna(p.nazwa, p.kolory.map(c => c.slice()));
      komunikatPalety("Paleta „" + p.nazwa + "”.");
    });
    const x = document.createElement("button"); x.className = "fx-b"; x.textContent = "×";
    x.title = "Usuń zapisaną paletę"; x.setAttribute("aria-label", "Usuń zapisaną paletę " + p.nazwa);
    x.addEventListener("click", () => {
      if(!confirm("Usunąć zapisaną paletę „" + p.nazwa + "”?")) return;
      if(!zapiszPalety(czytajPalety().filter((_, j) => j !== i))){ komunikatPalety("Nie udało się usunąć palety."); return; }
      zapisanePaletyUI();
    });
    w.append(u, x);
    box.appendChild(w);
  });
}
function zapamietajPalete(){
  const kolory = (S.mapa === "jasnosc" ? paletaGradientu() : palette()).map(c => c.slice());
  if(kolory.length > MAX_KOLOROW){ komunikatPalety("Ta paleta ma " + kolory.length + " kolorów — zapamiętać można najwyżej " + MAX_KOLOROW + "."); return; }
  const lista = czytajPalety(), pole = $("#pal-zap-nazwa");
  let nazwa = pole.value.trim().slice(0, 40);
  if(!nazwa){
    const baza = S.pal === "custom" && S.custom ? S.custom.nazwa : (wpisPalety(S.pal) || {nazwa: "Paleta"}).nazwa;
    nazwa = baza; let i = 2; while(lista.some(p => p.nazwa === nazwa)) nazwa = baza + " " + i++;
  }
  const byla = lista.findIndex(p => p.nazwa === nazwa), nowa = {nazwa, kolory, mapa: S.mapa};
  if(byla >= 0) lista[byla] = nowa; else lista.push(nowa);
  if(!zapiszPalety(lista)){ komunikatPalety("Przeglądarka nie pozwoliła zapamiętać palety (tryb prywatny albo brak miejsca). Zapisz ją do .hex."); return; }
  pole.value = "";
  zapisanePaletyUI();
  komunikatPalety((byla >= 0 ? "Nadpisano" : "Zapamiętano") + " paletę „" + nazwa + "”.");
}
$("#pal-zap").addEventListener("click", zapamietajPalete);
$("#pal-zap-nazwa").addEventListener("keydown", e=>{ if(e.key === "Enter") zapamietajPalete(); });
zapisanePaletyUI();

/* ---------- zwijane sekcje rastra ----------
   Każda sekcja zna klucze S swoich kontrolek (przez te same tabele co reszta
   panelu — także farby risografu, generowane wcześniej), więc umie pokazać
   kropkę „coś tu zmienione" i przywrócić swoje wartości domyślne. Które są
   otwarte — pamięć przeglądarki (try/catch: tryb prywatny). */
function znacznikiSekcji(){
  if(!SEKCJE) return;
  for(const [d, klucze] of SEKCJE)
    d.querySelector(".zmiana").classList.toggle("widac", klucze.some(k => JSON.stringify(S[k]) !== JSON.stringify(DEFAULTS[k])));
}
(function sekcje(){
  let otwarte = {};
  try{ otwarte = JSON.parse(localStorage.getItem("raster.sekcje") || "{}") || {}; }catch{ otwarte = {}; }
  SEKCJE = [];
  for(const d of document.querySelectorAll("details.pod")){
    const klucze = [...new Set([...d.querySelectorAll("input[id], select[id]")].map(el => opisKontrolki(el.id)).filter(o => o && o.key in DEFAULTS).map(o => o.key))];
    SEKCJE.push([d, klucze]);
    if(d.dataset.pod in otwarte) d.open = !!otwarte[d.dataset.pod];
    d.addEventListener("toggle", () => {
      otwarte[d.dataset.pod] = d.open;
      try{ localStorage.setItem("raster.sekcje", JSON.stringify(otwarte)); }catch{}
    });
    d.querySelector(".pod-reset").addEventListener("click", () => {
      utrwalStan();
      for(const k of klucze) S[k] = DEFAULTS[k];
      syncUI(); schedule(); utrwalStan();
    });
  }
  znacznikiSekcji();
})();
