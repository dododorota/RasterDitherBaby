/* Napis jako warstwa kompozycji (jak „text source" w Ditherfy).

   Ustawienia napisu (w.tekst) rysują się do przezroczystego płótna, które
   staje się obrazem warstwy — dalej położenie, skala, obrót, krycie, tryb
   mieszania i klatki kluczowe działają jak przy każdej warstwie, a „Skala
   100%" to napis wpisany w płótno kompozycji (dopasowanie i wyśrodkowanie
   za darmo). Napis to materiał jak obraz: siedzi w K, nie w S ani w presecie.

   Odstęp liter przez ctx.letterSpacing, więc pary kerningowe kroju zostają.
   Litera z obrazkiem przerywa ciąg tekstu: obrazek stoi na linii bazowej,
   ma wysokość wersalika i własne proporcje. Krój własny z pliku przez
   FontFace — tylko w tej sesji, jak wczytany obraz. */

export const KROJE = [["Archivo", "Archivo (wbudowany)"], ["Arial", "Arial"], ["Helvetica", "Helvetica"], ["Arial Black", "Arial Black"],
  ["Impact", "Impact"], ["Verdana", "Verdana"], ["Trebuchet MS", "Trebuchet MS"], ["Georgia", "Georgia"],
  ["Times New Roman", "Times New Roman"], ["Courier New", "Courier New"], ["system-ui", "Systemowy"], ["monospace", "Systemowy o stałej szerokości"]];
/* kroje wczytane z plików: [{rodzina, nazwa}] */
export const WLASNE = [];
export const MAKS_LINII = 8, MAKS_ZNAKOW = 400;

export function nowyTekst(){
  return {tresc: "NAPIS", kroj: "Archivo", waga: 800, kursywa: false, kolor: "#000000", wyrownanie: "center",
          interlinia: 115, odstep: 0, szer: 100, wys: 100, rozmycie: 0, obrazki: {}};
}
const rodzina = k => k === "system-ui" || k === "monospace" ? k : `"${k.replace(/"/g, "")}", sans-serif`;
const krojCSS = (t, px) => (t.kursywa ? "italic " : "") + t.waga + " " + px + "px " + rodzina(t.kroj);
export const linie = t => String(t.tresc || "").split(/\r?\n/).slice(0, MAKS_LINII);
/* litery, które mogą dostać obrazek: widoczne, bez powtórzeń, najwyżej 32 */
export function unikalneZnaki(t){
  const wyn = [];
  for(const z of linie(t).join("")) if(z.trim() && !wyn.includes(z) && wyn.length < 32) wyn.push(z);
  return wyn;
}

/* krój musi być wczytany przed rysowaniem — inaczej płótno rysuje zastępczym */
export async function zaladujKroj(t){
  try{ await document.fonts.load(krojCSS(t, 100), linie(t).join("") || "A"); }catch{}
}
export async function wczytajKroj(f){
  if(!/\.(ttf|otf|woff2?)$/i.test(f.name)) throw new Error("To nie jest plik kroju — wczytaj TTF, OTF, WOFF albo WOFF2.");
  if(f.size > 30*1024*1024) throw new Error("Plik kroju jest za duży (ponad 30 MB).");
  /* zakres grubości: krój zmiennej grubości reaguje na wybór grubości (stały — rysuje się sobą) */
  const r = "Raster krój " + (WLASNE.length + 1), face = new FontFace(r, await f.arrayBuffer(), {weight: "1 1000"});
  try{ await face.load(); }catch{ throw new Error("Przeglądarka nie umie odczytać tego kroju."); }
  document.fonts.add(face);
  WLASNE.push({rodzina: r, nazwa: f.name.replace(/\.[^.]+$/, "")});
  return r;
}

/* Układ napisu przy stopniu F: linie z odcinkami (tekst albo obrazek),
   szerokości, wysokość wiersza. */
function uklad(x, t, F){
  x.font = krojCSS(t, F);
  x.letterSpacing = (t.odstep/100*F) + "px";
  const m = x.measureText("Hg"), asc = m.fontBoundingBoxAscent || F*0.8, desc = m.fontBoundingBoxDescent || F*0.2;
  const wersalik = x.measureText("H").actualBoundingBoxAscent || F*0.7, odst = t.odstep/100*F;
  const wiersze = linie(t).map(l => {
    const odc = [];
    let tekst = "";
    for(const z of l){
      const o = t.obrazki[z];
      if(o){ if(tekst) odc.push({tekst}); tekst = ""; odc.push({obraz: o.obraz, w: wersalik*o.obraz.width/o.obraz.height + odst}); }
      else tekst += z;
    }
    if(tekst) odc.push({tekst});
    for(const o of odc) if(o.tekst !== undefined) o.w = x.measureText(o.tekst).width;
    return {odc, w: odc.reduce((s, o) => s + o.w, 0)};
  });
  const lh = F*t.interlinia/100, szer = Math.max(1, ...wiersze.map(w => w.w)), wys = asc + desc + lh*(wiersze.length - 1);
  return {wiersze, asc, wersalik, lh, szer, wys};
}
/* Napis na przezroczystym płótnie; `bok` — docelowy dłuższy bok (stopień
   dobierany tak, żeby napis go wypełnił, najwyżej 4096 px). */
export function rysujTekst(t, bok){
  const c = document.createElement("canvas"), x = c.getContext("2d");
  const sx = t.szer/100, sy = t.wys/100, zapas = F => F*0.15 + F*t.rozmycie/800*3;
  const wymiary = F => { const u = uklad(x, t, F), p = zapas(F); return [u.szer*sx + 2*p, u.wys*sy + 2*p]; };
  const [w100, h100] = wymiary(100);
  const F = 100*Math.min(Math.max(16, bok || 2000), 4096)/Math.max(w100, h100);
  const u = uklad(x, t, F), p = zapas(F);
  c.width = Math.max(1, Math.ceil(u.szer*sx + 2*p)); c.height = Math.max(1, Math.ceil(u.wys*sy + 2*p));
  /* zmiana rozmiaru płótna kasuje ustawienia kontekstu */
  x.font = krojCSS(t, F); x.letterSpacing = (t.odstep/100*F) + "px";
  x.fillStyle = t.kolor; x.textBaseline = "alphabetic";
  if(t.rozmycie > 0) x.filter = `blur(${F*t.rozmycie/800}px)`;
  x.translate(p, p); x.scale(sx, sy);
  u.wiersze.forEach((w, i) => {
    let px = t.wyrownanie === "left" ? 0 : t.wyrownanie === "right" ? u.szer - w.w : (u.szer - w.w)/2;
    const y = u.asc + i*u.lh;
    for(const o of w.odc){
      if(o.obraz) x.drawImage(o.obraz, px, y - u.wersalik, u.wersalik*o.obraz.width/o.obraz.height, u.wersalik);
      else x.fillText(o.tekst, px, y);
      px += o.w;
    }
  });
  return c;
}
