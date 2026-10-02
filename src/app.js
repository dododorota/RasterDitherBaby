/* Spinacz: kontrolki, presety, wczytywanie pliku, zapis. */
import { S, DEFAULTS, LOOK } from "./state.js";
import { $, out, octx } from "./dom.js";
import { saveSVG } from "./vector.js";
import { PRESETS } from "./presets.js";
import { czytajPalete, paletaZDanych, domyslnaNazwa, MAX_KOLOROW } from "./palette-files.js";
import { przetworzFolder } from "./batch.js";
import { renderuj, NAZWA_TRYBU } from "./render.js";
import { K, TRYBY, utworz as utworzKomp, dodaj as dodajWarstwe, usun as usunWarstwe, przesun as przesunWarstwe,
         zakoncz as zakonczKomp, zloz, trafiona } from "./warstwy.js";
import { tekstAscii, ZESTAWY } from "./ascii.js";
import { EFEKTY, wpisEfektu, lista, dodaj as dodajEfekt, usun as usunEfekt, przelacz as przelaczEfekt, przesun as przesunEfekt } from "./stos.js";
import { BIBLIOTEKA, wpisPalety, palette, paletaGradientu, rgb2hex, hex2rgb } from "./palettes.js";
import { paletaZPikseli } from "./kwantyzacja.js";
import { fit } from "./image.js";
import { W, otworz as otworzWideo, zamknij as zamknijWideo, idzDo, graj, pauza, ustawTempo,
         czasOd, dlugosc, przyKlatce, zapiszWideo, czyFilm, czyMozeAnimacja, FORMATY_WIDEO, mozeMp4,
         animujObraz, ustawDlugosc, DLUGOSC_STOPKLATKI } from "./video.js";
import { SCIEZKI, KONW, animowane, czyAnimowany, kluczW, ustawKlucz, usunKlucz, usunSciezke, zastosuj as zastosujAnimacje } from "./animacja.js";

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
  const r = await renderuj(1);
  clearTimeout(slow);
  if(!r) return;
  dims();
}
function schedule(){
  if(queued) return;
  queued=true;
  requestAnimationFrame(()=>{ queued=false; render(); });
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
  {id:"asciiRozmiar",key:"asciiRozmiar",opis:v=>v+" px"}
];
const PTASZKI = ["inv","serp","percept","czasCykl","asciiDither"];
const LISTY   = ["algo","pal","mapa","shape","inkmode","sort","tintTryb","faktura","faktTryb","asciiZestaw","asciiTryb","asciiKolor"];
/* jeden klucz może mieć kilka pól: farba i papier są i w palecie ditheringu,
   i w siatce rastra */
const KOLORY  = [{id:"ink",key:"ink"}, {id:"paper",key:"paper"}, {id:"ink-r",key:"ink"}, {id:"paper-r",key:"paper"}, {id:"tintKolor",key:"tintKolor"}, {id:"ink-a",key:"ink"}, {id:"paper-a",key:"paper"}];

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
function efektyUI(){
  const l = lista(), box = $("#fx-lista"), grupa = $("#g-fx");
  for(const k of grupa.querySelectorAll(".fx")) k.classList.add("hidden");
  l.forEach((e, i) => {
    const k = grupa.querySelector('.fx[data-fx="' + e.id + '"]');
    let glowa = k.querySelector(".fx-glowa");
    if(!glowa){
      glowa = document.createElement("div"); glowa.className = "fx-glowa";
      const nazwa = wpisEfektu(e.id).nazwa;
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
    if(l.some(x => x.id === e.id)) continue;
    const b = document.createElement("button");
    b.className = "btn"; b.textContent = e.nazwa + (e.przed ? " — w czasie" : ""); b.dataset.dodaj = e.id;
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
  efektyUI();
  eksportUI();
}
for(const c of SUWAKI){
  const el=$("#"+c.id);
  el.addEventListener("input", ()=>{
    S[c.key] = c.zS ? c.zS(+el.value) : +el.value;
    $("#"+c.id+"-v").textContent = c.opis(S[c.key]);
    if(c.key==="glebia") probkiUI();
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
  schedule();
});
function koloryUI(){ for(const {id, key} of KOLORY) $("#"+id).value = S[key]; }
for(const {id, key} of KOLORY) $("#"+id).addEventListener("input", e=>{
  S[key]=e.target.value;
  koloryUI();
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
    box.appendChild(b);
  }
  for(const p of czytajMoje().filter(p=>p.tryb===S.mode)){
    const para=document.createElement("span"); para.className="moj";
    const b=document.createElement("button");
    b.className="btn"; b.textContent=p.nazwa; b.title="Własny preset zapamiętany w tej przeglądarce";
    b.addEventListener("click", ()=>komunikat(zastosujPreset(p, "„"+p.nazwa+"”")));
    const x=document.createElement("button");
    x.className="btn usun"; x.textContent="×"; x.setAttribute("aria-label", "Usuń preset "+p.nazwa);
    x.addEventListener("click", ()=>usunMoj(p.nazwa, p.tryb));
    para.append(b, x);
    box.appendChild(para);
  }
}
/* Preset to pełny opis wyglądu: klucze, których nie podaje, wracają do wartości
   domyślnych, zamiast zostawać po poprzednim presecie. Inaczej „Gazeta" po
   „Promo" dziedziczyła jego punkt bieli, a negatyw i wężyk nie wracały nigdy. */
function applyPreset(cfg){
  for(const k of LOOK) S[k] = (k in cfg) ? cfg[k] : DEFAULTS[k];
  syncUI();
  schedule();
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
  opcjaPalety();
  /* syncUI przycina liczby do zakresu suwaków, odrzuca nieznane opcje list
     i normalizuje kolory. Porównanie przed i po wyłapuje te poprawki, bo
     inaczej plik z gęstością 9999 wczytywałby się bez słowa komentarza. */
  const chciane={}; for(const k of LOOK) chciane[k]=S[k];
  if(dane.tryb==="dither" || dane.tryb==="half" || dane.tryb==="ascii") setMode(dane.tryb);
  syncUI();
  const poprawione = LOOK.filter(k => S[k]!==chciane[k]).length;
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
    komunikat(zastosujPreset(dane, "ustawienia z pliku"));
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
  if(S.mode !== "dither") setMode("dither");   /* paleta działa tylko w ditheringu */
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
  const box = $("#os-sciezki"), klucze = W.z ? animowane() : [];
  box.classList.toggle("hidden", !klucze.length);
  box.innerHTML = "";
  if(!klucze.length) return;
  const D = dlugosc();
  for(const k of klucze){
    const c = ANIMOWALNE.find(x => x.key === k);
    const w = document.createElement("div"); w.className = "sciezka";
    const nazwa = document.createElement("span"); nazwa.className = "nazwa";
    nazwa.textContent = c ? $("#kl-" + k).dataset.nazwa : k;
    const tor = document.createElement("div"); tor.className = "tor";
    const g = document.createElement("i"); g.className = "glowica"; g.style.left = (t/D*100) + "%";
    tor.appendChild(g);
    for(const kl of SCIEZKI[k]){
      const m = document.createElement("button"); m.className = "kl"; m.textContent = "◆";
      m.style.left = Math.min(100, kl.t/D*100) + "%";
      m.title = nazwa.textContent + ": " + (c ? c.opis(KONW[k].zS(kl.v)) : kl.v) + " w " + zegar(kl.t);
      m.setAttribute("aria-label", m.title);
      m.addEventListener("click", () => { if(W.gra){ pauza(); przyciskGraj(); } idzDo(Math.round(kl.t*W.z.fps)); });
      tor.appendChild(m);
    }
    const x = document.createElement("button"); x.className = "btn usun"; x.textContent = "×";
    x.title = "Usuń animację: " + nazwa.textContent; x.setAttribute("aria-label", x.title);
    x.addEventListener("click", () => { usunSciezke(k); kluczeUI(); schedule(); });
    w.append(nazwa, tor, x);
    box.appendChild(w);
  }
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
$("#fmt").addEventListener("change", e=>{ S.fmt=e.target.value; ustawFormat(); });

const czasTrwania = s => s < 60 ? Math.max(1, Math.round(s)) + " s" : Math.floor(s/60) + " min " + Math.round(s%60) + " s";
async function zapiszFilm(){
  if(W.gra){ pauza(); przyciskGraj(); }
  wTrakcie = true; przerwij = false;
  zablokujPanel(true, $("#save"));
  $("#save").textContent = "Przerwij";
  try{
    const w = await zapiszWideo({
      postep: (k, n, zostalo) => komunikatZapisu("Klatka " + (k+1) + " z " + n +
        (zostalo !== null && k >= 3 ? " · zostało ok. " + czasTrwania(zostalo) : "")),
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
  $("#komp-x").max = K.szer; $("#komp-y").max = K.wys;
  for(const [id, k, opis] of WL){ $("#" + id).value = w[k]; $("#" + id + "-v").textContent = opis(w[k]); }
  $("#komp-tryb").value = w.tryb;
}
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
for(const [id, k, opis] of WL) $("#" + id).addEventListener("input", e=>{
  const w = K.warstwy[K.wybrana]; if(!w) return;
  w[k] = +e.target.value;
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
  const plaski = document.createElement("canvas"); plaski.width = K.szer; plaski.height = K.wys;
  plaski.getContext("2d").drawImage(zloz(), 0, 0);
  zakonczKomp();
  nazwaObrazu = "kompozycja";
  pokazObraz(plaski);
  wideoUI();
});
/* przeciąganie warstwy po podglądzie: współrzędne ekranu → płótno kompozycji
   (podgląd to płótno pomniejszone z zachowaniem proporcji) */
let ciagnieta = null;
out.addEventListener("pointerdown", e=>{
  if(!K.aktywna || wTrakcie || (W.z && W.z.rodzaj !== "stopklatka")) return;
  const r = out.getBoundingClientRect(), px = (e.clientX - r.left)/r.width*K.szer, py = (e.clientY - r.top)/r.height*K.wys;
  const i = trafiona(px, py);
  if(i < 0) return;
  K.wybrana = i;
  ciagnieta = {i, px, py, x: K.warstwy[i].x, y: K.warstwy[i].y};
  out.setPointerCapture(e.pointerId);
  out.classList.add("przeciaganie");
  kompUI();
});
out.addEventListener("pointermove", e=>{
  if(!ciagnieta) return;
  const r = out.getBoundingClientRect(), px = (e.clientX - r.left)/r.width*K.szer, py = (e.clientY - r.top)/r.height*K.wys;
  const w = K.warstwy[ciagnieta.i];
  w.x = ciagnieta.x + px - ciagnieta.px; w.y = ciagnieta.y + py - ciagnieta.py;
  $("#komp-x").value = w.x; $("#komp-x-v").textContent = Math.round(w.x) + " px";
  $("#komp-y").value = w.y; $("#komp-y-v").textContent = Math.round(w.y) + " px";
  odswiezKomp();
});
for(const ev of ["pointerup", "pointercancel"]) out.addEventListener(ev, ()=>{ ciagnieta = null; out.classList.remove("przeciaganie"); });
