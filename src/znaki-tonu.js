/* Znaki według tonu — obrazki poziomów.

   Kształt „tony" (siatki.js) dzieli pokrycie na N poziomów; każdy poziom
   rysuje się kształtem z listy albo obrazkiem wczytanym tutaj. Obrazki to
   materiał jak obraz źródłowy: nie w S, nie w presecie, nie w historii —
   preset pamięta tylko kształty i kolory poziomów.

   Obrazek trzymany przycięty do treści (puste przezroczyste marginesy PNG
   zmniejszałyby znak), dłuższy bok najwyżej BOK. Przebarwione wersje
   w rozmiarach potęg dwójki, z pamięcią — punktów są dziesiątki tysięcy,
   a skalowanie dużego obrazka do kilku pikseli przy każdym rysowaniu
   kosztowało. SVG dostaje dodatkowo sylwetkę (kontury) do eksportu
   „tylko wektory". */
import { S } from "./state.js";
import { ZNAKI_MAKS, kolorCSS, normalizujKsztalt, orientuj } from "./siatki.js";
import { plotno } from "./plotno.js";

const BOK = 512;
/* wpis: {nazwa, obraz: canvas, kontury: [[[x, y], …], …] | null, nr} — kontury
   tylko z SVG: środek pudełka w zerze, dłuższy bok pudełka = 1. W workerze
   rastra ta sama tablica, z obrazem jako ImageBitmap (worker-client.js). */
export const ZNAKI = new Array(ZNAKI_MAKS).fill(null);
let licznik = 0;

/* ---------- wczytywanie ---------- */
export function rodzajPliku(f){
  if(f.type === "image/svg+xml" || /\.svg$/i.test(f.name)) return "svg";
  if(/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(f.type) || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(f.name)) return "bitmapa";
  return null;
}
/* obrazek z pliku, przycięty do treści — {obraz, kontury}; też dla obrazków zamiast liter napisu (tekst.js).
   {bialePrzezroczyste}: obrazek bez żadnego przezroczystego piksela (JPEG,
   PNG bez alfy) dostaje przezroczystą biel — jak „Your Shapes” w Dither Boyu */
export async function wczytajObrazek(f, opcje){
  const rodzaj = rodzajPliku(f);
  if(!rodzaj) throw new Error("To nie jest obrazek — wczytaj PNG, JPEG, WebP albo SVG.");
  if(f.size > 30*1024*1024) throw new Error("Plik jest za duży (ponad 30 MB).");
  const {obraz, kontury} = rodzaj === "svg" ? await zSVG(f) : {obraz: await zBitmapy(f), kontury: null};
  if(opcje && opcje.bialePrzezroczyste) bielNaPrzezroczysta(obraz);
  return {obraz: przytnij(obraz), kontury};
}
/* tylko gdy nigdzie nie ma przezroczystości: jasne piksele (≥ 240) znikają,
   pas 200–240 przechodzi płynnie, żeby brzeg sylwetki nie był postrzępiony */
function bielNaPrzezroczysta(c){
  const x = c.getContext("2d"), d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  for(let i=3; i<p.length; i+=4) if(p[i] < 255) return;
  for(let i=0; i<p.length; i+=4){
    const j = Math.min(p[i], p[i+1], p[i+2]);
    p[i+3] = j >= 240 ? 0 : j <= 200 ? 255 : Math.round(255*(240 - j)/40);
  }
  x.putImageData(d, 0, 0);
}
/* gotowy obrazek (np. z „Twoich kształtów”) jako znak tonu i — nowy numer,
   więc pamięć wersji i worker rastra biorą go od nowa */
export function ustawZnak(i, {nazwa, obraz, kontury}){
  ZNAKI[i] = {nazwa, obraz, kontury: kontury || null, nr: ++licznik};
  return ZNAKI[i];
}
export async function wczytajZnak(i, f){
  const {obraz, kontury} = await wczytajObrazek(f);
  ZNAKI[i] = {nazwa: f.name, obraz, kontury, nr: ++licznik};
  return ZNAKI[i];
}
export function usunZnak(i){ ZNAKI[i] = null; }
/* czy któryś z używanych poziomów ma obrazek */
export function saObrazki(){ return ZNAKI.slice(0, liczbaPoziomow()).some(Boolean); }
export const liczbaPoziomow = () => Math.max(2, Math.min(ZNAKI_MAKS, S.znakiIle | 0 || 6));

async function zBitmapy(f){
  let bm;
  try{ bm = await createImageBitmap(f); }
  catch{ throw new Error("Przeglądarka nie umie odczytać tego obrazka."); }
  const s = Math.min(1, BOK/Math.max(bm.width, bm.height));
  const c = plotno(Math.max(1, Math.round(bm.width*s)), Math.max(1, Math.round(bm.height*s)));
  const x = c.getContext("2d");
  x.imageSmoothingQuality = "high";
  x.drawImage(bm, 0, 0, c.width, c.height);
  bm.close();
  return c;
}

/* Czyszczenie SVG przed użyciem: bez skryptów, obiektów obcych, zdarzeń
   i odwołań na zewnątrz (plik trafia na chwilę do strony, żeby policzyć
   geometrię — nic nie może się z niego wykonać ani pobrać). */
function wyczyscSVG(tekst){
  const doc = new DOMParser().parseFromString(tekst, "image/svg+xml");
  const svg = doc.documentElement;
  if(!svg || svg.nodeName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) throw new Error("To nie jest poprawny plik SVG.");
  for(const el of svg.querySelectorAll("script, foreignObject, iframe, object, embed, audio, video")) el.remove();
  for(const el of [svg, ...svg.querySelectorAll("*")]){
    for(const a of [...el.attributes]){
      const n = a.name.toLowerCase(), v = a.value.trim();
      if(n.startsWith("on")) el.removeAttribute(a.name);
      else if((n === "href" || n === "xlink:href") && !v.startsWith("#") && !v.startsWith("data:image/")) el.removeAttribute(a.name);
    }
    if(el.nodeName.toLowerCase() === "style") el.textContent = el.textContent.replace(/@import[^;]*;?/gi, "");
  }
  return svg;
}
/* SVG wstawiony na chwilę do strony (niewidoczny) — przeglądarka sama liczy geometrię */
function wStronie(svg, f){
  const box = document.createElement("div");
  box.style.cssText = "position:absolute; left:-10000px; top:0; width:400px; height:400px; visibility:hidden";
  const kopia = document.importNode(svg, true);
  for(const s of kopia.querySelectorAll("script, foreignObject")) s.remove();
  box.appendChild(kopia); document.body.appendChild(box);
  try{ return f(kopia); } finally { box.remove(); }
}
/* Kontury wszystkich kształtów pliku, w układzie dokumentu: każdy kształt
   próbkowany po długości (getPointAtLength) i przeliczony przez getCTM;
   skok między próbkami = nowy podkontur (polecenie M). Wspólne z własnym
   kształtem rastra (app.js). */
export function konturySVG(svg){
  return wStronie(svg, kopia => {
    const kontury = [];
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
    return kontury;
  });
}
async function zSVG(f){
  const svg = wyczyscSVG(await f.text());
  /* układ współrzędnych: viewBox, a bez niego szerokość i wysokość, a bez nich — obrys treści */
  let vb = (svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  if(!(vb.length === 4 && vb.every(isFinite) && vb[2] > 0 && vb[3] > 0)){
    const w = parseFloat(svg.getAttribute("width")), h = parseFloat(svg.getAttribute("height"));
    if(w > 0 && h > 0 && !/%/.test(svg.getAttribute("width") + svg.getAttribute("height"))) vb = [0, 0, w, h];
    else {
      const b = wStronie(svg, k => { try{ return k.getBBox(); }catch{ return null; } });
      if(!b || !(b.width > 0) || !(b.height > 0)) throw new Error("Nie znalazłam w pliku SVG nic do narysowania.");
      vb = [b.x, b.y, b.width, b.height];
    }
  }
  const s = BOK/Math.max(vb[2], vb[3]), W = Math.max(1, Math.round(vb[2]*s)), H = Math.max(1, Math.round(vb[3]*s));
  svg.setAttribute("viewBox", vb.join(" ")); svg.setAttribute("width", W); svg.setAttribute("height", H);
  if(!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], {type: "image/svg+xml"}));
  const c = plotno(W, H);
  try{
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => { throw new Error("Przeglądarka nie umie narysować tego pliku SVG."); });
    c.getContext("2d").drawImage(img, 0, 0, W, H);
  } finally { URL.revokeObjectURL(url); }
  /* sylwetka do SVG „tylko wektory": kontury przerzedzone (normalizujKsztalt),
     potem w pudełko — środek obrysu w zerze, dłuższy bok 1, jak obrazek */
  let kontury = null;
  try{ kontury = normalizujKsztalt(konturySVG(svg), 96); }catch{ kontury = null; }
  if(kontury){
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for(const k of kontury) for(const [x, y] of k){ x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const cx = (x0 + x1)/2, cy = (y0 + y1)/2, d = Math.max(x1 - x0, y1 - y0) || 1;
    kontury = orientuj(kontury.map(k => k.map(([x, y]) => [(x - cx)/d, (y - cy)/d])));
  }
  return {obraz: c, kontury};
}
/* przycięcie do pikseli z kryciem; odczyt pikseli wykrywa też płótno
   „skażone" przez przeglądarkę (wtedy zapis PNG by się nie udał) */
function przytnij(c){
  let d;
  try{ d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; }
  catch{ throw new Error("Przeglądarka zablokowała odczyt tego obrazka."); }
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for(let y=0; y<c.height; y++) for(let x=0; x<c.width; x++) if(d[(y*c.width + x)*4 + 3] > 8){
    if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y;
  }
  if(x1 < 0) throw new Error("Obrazek jest cały przezroczysty.");
  if(x0 === 0 && y0 === 0 && x1 === c.width - 1 && y1 === c.height - 1) return c;
  const t = plotno(x1 - x0 + 1, y1 - y0 + 1);
  t.getContext("2d").drawImage(c, -x0, -y0);
  return t;
}

/* ---------- wersje do rysowania ----------
   Obrazek w rozmiarze P (dłuższy bok, potęga dwójki), przebarwiony kolorem
   w trybie mieszania — jak w Ditherfy: kolor nałożony na obrazek, potem
   przycięty do jego krycia; „source-over" daje równą sylwetkę. Bez koloru —
   oryginalne barwy. Mały obrazek powiększany bez wygładzania, żeby piksel-art
   został ostry. */
const pamiec = new Map();
export const rozmiarWersji = b => Math.max(8, Math.min(1024, 2**Math.ceil(Math.log2(Math.max(1, b)))));
export function wersja(z, kolor, tryb, P){
  const klucz = z.nr + "|" + (kolor || "") + "|" + tryb + "|" + P;
  let c = pamiec.get(klucz);
  if(c) return c;
  if(pamiec.size > 3000) pamiec.clear();
  const o = z.obraz, s = P/Math.max(o.width, o.height);
  c = plotno(Math.max(1, Math.round(o.width*s)), Math.max(1, Math.round(o.height*s)));
  const x = c.getContext("2d");
  x.imageSmoothingEnabled = s <= 1; x.imageSmoothingQuality = "high";
  x.drawImage(o, 0, 0, c.width, c.height);
  if(kolor){
    x.globalCompositeOperation = tryb || "source-over"; x.fillStyle = kolor; x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = "destination-in"; x.drawImage(o, 0, 0, c.width, c.height);
  }
  pamiec.set(klucz, c);
  return c;
}
/* obrazek wpisany w kwadrat 2r z zachowaniem proporcji */
export function wymiaryZnaku(z, r, kr){
  const p = z.obraz.width/z.obraz.height, b = 2*r, sx = kr && kr[7] !== undefined ? kr[7] : 1, sy = kr && kr[8] !== undefined ? kr[8] : 1;
  return p >= 1 ? [b*sx, b/p*sy] : [b*p*sx, b*sy];
}
/* sylwetka SVG w miejscu punktu (do eksportu „tylko wektory") */
export function konturyZnaku(z, [x, y, r, kat, , , , sx = 1, sy = 1]){
  const b = 2*r, c = Math.cos(kat), s = Math.sin(kat);
  return z.kontury.map(k => k.map(([a, d]) => [x + (a*sx*c - d*sy*s)*b, y + (a*sx*s + d*sy*c)*b]));
}

/* ---------- punkty → grupy ----------
   Wspólne dla płótna i SVG: punkty pogrupowane po poziomie i kolorze,
   poziomy od cieni do świateł. Kolor: „poziom" — kolor poziomu z panelu,
   inaczej kolor farby (przy kolorowych punktach — kolor punktu).
   Obrazek w oryginalnych barwach nie dostaje koloru (kolorObrazka null);
   kolorowe punkty przebarwiające obrazek — kolor zaokrąglony do 17 poziomów
   na kanał, inaczej każdy punkt miałby osobną wersję obrazka. */
export function znakiWGrupach(kropki, ink){
  const n = liczbaPoziomow(), grupy = new Map(), numery = new Map(), barwa = S.znakiBarwa;
  kropki.forEach((kr, i) => {
    numery.set(kr, i);
    const poz = Math.max(0, Math.min(n - 1, kr[6] | 0)), z = ZNAKI[poz];
    /* pasmo „Puste" (bez obrazka) — punktów nie rysujemy, na płótnie i w SVG */
    if(!z && S["znakiS" + (poz + 1)] === "pusty") return;
    let kolor;
    if(barwa === "poziom") kolor = S["znakiK" + (poz + 1)];
    else if(kr[5]) kolor = kolorCSS(z ? kr[5].map(v => Math.min(255, Math.round(v/16)*16)) : kr[5]);
    else kolor = ink.color;
    const klucz = poz + "|" + kolor;
    let g = grupy.get(klucz);
    if(!g) grupy.set(klucz, g = {poz, kolor, kolorObrazka: z && barwa !== "oryginal" ? kolor : null,
                                 ksztalt: S["znakiS" + (poz + 1)] || "circle", znak: z, kropki: [], numery});
    g.kropki.push(kr);
  });
  return [...grupy.values()].sort((a, b) => a.poz - b.poz);
}
