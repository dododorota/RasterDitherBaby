/* Wczytywanie palet z plików. Czyste funkcje bez DOM-u: dostają zawartość pliku,
   oddają {nazwa, kolory:[[r,g,b],...], uwagi:[...]} albo rzucają błąd z opisem
   po polsku, który można pokazać wprost w panelu.

   Format rozpoznajemy po zawartości, nie po rozszerzeniu — pliki z Lospec
   krążą z przypadkowymi nazwami, a rozszerzenie bywa zgubione. */

export const MAX_KOLOROW = 256;

export function czytajPalete(nazwaPliku, bufor){
  const bajty = new Uint8Array(bufor);
  const nazwa = domyslnaNazwa(nazwaPliku);
  if(bajty.length>=4 && bajty[0]===0x41 && bajty[1]===0x53 && bajty[2]===0x45 && bajty[3]===0x46)
    return ase(new DataView(bufor), nazwa);

  const tekst = new TextDecoder("utf-8").decode(bajty).replace(/^\uFEFF/, "");
  if(/^\s*GIMP Palette/i.test(tekst)) return gpl(tekst, nazwa);
  if(/^\s*JASC-PAL/i.test(tekst))     return jasc(tekst, nazwa);
  if(/^\s*;/m.test(tekst) || /\.txt$/i.test(nazwaPliku)) return paintNet(tekst, nazwa);
  return hex(tekst, nazwa);
}

function domyslnaNazwa(plik){
  return (plik || "paleta").replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || "paleta";
}

/* Wspólne domknięcie: duplikaty wylatują, bo wyniku nie zmieniają (skan w nearest()
   i tak bierze pierwsze trafienie), a kosztują czas przy każdym pikselu. */
function gotowe(nazwa, surowe, uwagi){
  const widziane = new Set(), kolory = [];
  let dup = 0;
  for(const c of surowe){
    const k = c[0]+","+c[1]+","+c[2];
    if(widziane.has(k)){ dup++; continue; }
    widziane.add(k); kolory.push(c);
  }
  if(dup) uwagi.push("pominięto powtórzone kolory: "+dup);
  if(kolory.length > MAX_KOLOROW){
    uwagi.push("obcięto do "+MAX_KOLOROW+" kolorów z "+kolory.length);
    kolory.length = MAX_KOLOROW;
  }
  if(kolory.length < 2) throw new Error("W pliku nie ma co najmniej dwóch różnych kolorów.");
  return {nazwa, kolory, uwagi};
}

/* Paleta zapisana w pliku presetu. Walidacja kształtu, a potem to samo
   domknięcie co przy pliku palety — preset też bywa edytowany ręcznie. */
export function paletaZDanych(d){
  if(!d || typeof d !== "object" || !Array.isArray(d.kolory)) throw new Error("brak listy kolorów");
  const surowe = [];
  for(const c of d.kolory){
    if(!Array.isArray(c) || c.length !== 3 || !c.every(x => Number.isInteger(x) && x >= 0 && x <= 255))
      throw new Error("kolor w złym formacie");
    surowe.push([c[0], c[1], c[2]]);
  }
  const nazwa = (typeof d.nazwa === "string" && d.nazwa.trim()) ? d.nazwa.trim().slice(0, 60) : "paleta";
  return gotowe(nazwa, surowe, []);
}

/* .hex (Lospec): jeden kolor RRGGBB na linię, z # albo bez */
function hex(tekst, nazwa){
  const surowe = [], uwagi = [];
  let zle = 0;
  for(const linia of tekst.split(/\r?\n/)){
    const t = linia.trim();
    if(!t) continue;
    const m = t.match(/^#?([0-9a-f]{6})$/i);
    if(!m){ zle++; continue; }
    const v = parseInt(m[1], 16);
    surowe.push([(v>>16)&255, (v>>8)&255, v&255]);
  }
  if(!surowe.length) throw new Error("Nie rozpoznano formatu — to nie wygląda na paletę.");
  if(zle) uwagi.push("pominięto linie, które nie są kolorem: "+zle);
  return gotowe(nazwa, surowe, uwagi);
}

/* .gpl (GIMP): nagłówek, opcjonalne Name:/Columns:, komentarze #, potem "R G B nazwa" */
function gpl(tekst, nazwa){
  const surowe = [], uwagi = [];
  for(const linia of tekst.split(/\r?\n/).slice(1)){
    const t = linia.trim();
    if(!t || t[0]==="#") continue;
    const n = t.match(/^Name:\s*(.+)$/i);
    if(n){ nazwa = n[1].trim() || nazwa; continue; }
    if(/^Columns:/i.test(t)) continue;
    const m = t.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\b/);
    if(m) surowe.push([bajt(+m[1]), bajt(+m[2]), bajt(+m[3])]);
  }
  return gotowe(nazwa, surowe, uwagi);
}

/* .pal (JASC, Paint Shop Pro): JASC-PAL, wersja, liczba kolorów, potem "R G B" */
function jasc(tekst, nazwa){
  const linie = tekst.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const surowe = [], uwagi = [];
  for(const t of linie.slice(3)){
    const m = t.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/);
    if(m) surowe.push([bajt(+m[1]), bajt(+m[2]), bajt(+m[3])]);
  }
  const zapowiedz = parseInt(linie[2], 10);
  if(zapowiedz && zapowiedz !== surowe.length)
    uwagi.push("nagłówek zapowiada "+zapowiedz+" kolorów, w pliku jest "+surowe.length);
  return gotowe(nazwa, surowe, uwagi);
}

/* .txt (Paint.NET): komentarze ;, potem AARRGGBB na linię. Lospec wpisuje nazwę
   palety w komentarzu „;Palette Name: …". Kanał alfa pomijamy. */
function paintNet(tekst, nazwa){
  const surowe = [], uwagi = [];
  let polprzezroczyste = 0;
  for(const linia of tekst.split(/\r?\n/)){
    const t = linia.trim();
    if(!t) continue;
    if(t[0]===";"){
      const n = t.match(/^;\s*Palette Name:\s*(.+)$/i);
      if(n) nazwa = n[1].trim() || nazwa;
      continue;
    }
    const m = t.match(/^([0-9a-f]{2})([0-9a-f]{6})$/i);
    if(!m) continue;
    if(m[1].toLowerCase() !== "ff") polprzezroczyste++;
    const v = parseInt(m[2], 16);
    surowe.push([(v>>16)&255, (v>>8)&255, v&255]);
  }
  if(polprzezroczyste) uwagi.push("zignorowano przezroczystość w kolorach: "+polprzezroczyste);
  return gotowe(nazwa, surowe, uwagi);
}

/* .ase (Adobe Swatch Exchange), binarny, big-endian:
     "ASEF", wersja (2×u16), liczba bloków (u32),
     blok: typ (u16), długość (u32), treść —
       0x0001 kolor: długość nazwy w znakach UTF-16 z zerem (u16), nazwa,
              model (4 znaki ASCII), wartości float32 w [0,1], typ koloru (u16)
       0xC001 początek grupy (z nazwą), 0xC002 koniec grupy.
   RGB i Gray bierzemy wprost (w Gray 0 to czerń, 1 biel), CMYK przeliczamy
   naiwnie, bez profilu. Lab pomijamy i mówimy o tym, bo rzetelne przeliczenie
   wymaga punktu bieli i adaptacji, a Lospec takich plików nie produkuje. */
function ase(v, nazwa){
  const dl = v.byteLength, surowe = [], uwagi = [], pominiete = {};
  if(dl < 12) throw new Error("Plik .ase jest ucięty.");
  const bloki = v.getUint32(8);
  let o = 12, nazwaZGrupy = null;
  for(let b=0; b<bloki; b++){
    if(o+6 > dl) throw new Error("Plik .ase jest ucięty.");
    const typ = v.getUint16(o), dlugosc = v.getUint32(o+2);
    o += 6;
    const koniec = o + dlugosc;
    if(koniec > dl) throw new Error("Plik .ase jest ucięty.");
    if(typ === 0xC001 && dlugosc >= 2 && !nazwaZGrupy){
      const n = v.getUint16(o);
      if(n > 1 && o+2+(n-1)*2 <= koniec) nazwaZGrupy = utf16(v, o+2, n-1).trim() || null;
    } else if(typ === 0x0001){
      let p = o;
      const n = v.getUint16(p); p += 2 + n*2;
      if(p+4 > koniec) throw new Error("Uszkodzony wpis koloru w pliku .ase.");
      const model = String.fromCharCode(v.getUint8(p), v.getUint8(p+1), v.getUint8(p+2), v.getUint8(p+3));
      p += 4;
      const f = i => v.getFloat32(p + i*4);
      if(model === "RGB " && p+12 <= koniec)       surowe.push([kan(f(0)), kan(f(1)), kan(f(2))]);
      else if(model === "Gray" && p+4 <= koniec){  const g = kan(f(0)); surowe.push([g,g,g]); }
      else if(model === "CMYK" && p+16 <= koniec){
        const c=f(0), m=f(1), y=f(2), k=f(3);
        surowe.push([kan((1-c)*(1-k)), kan((1-m)*(1-k)), kan((1-y)*(1-k))]);
      }
      else { const nz = model.trim() || "?"; pominiete[nz] = (pominiete[nz]||0) + 1; }
    }
    o = koniec;
  }
  for(const m in pominiete) uwagi.push("pominięto kolory w modelu "+m+": "+pominiete[m]);
  if(pominiete.LAB) uwagi.push("kolory Lab trzeba przed eksportem przestawić na RGB");
  return gotowe(nazwaZGrupy || nazwa, surowe, uwagi);
}

const bajt = x => Math.max(0, Math.min(255, x|0));
const kan  = x => Math.max(0, Math.min(255, Math.round(x*255)));
function utf16(v, o, n){
  let s = "";
  for(let i=0;i<n;i++) s += String.fromCharCode(v.getUint16(o + i*2));
  return s;
}
