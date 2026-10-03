/* Kompozycja z warstw: kilka obrazów na płótnie o zadanym rozmiarze i tle.

   Kompozycja to materiał, jak obraz czy film — nie wygląd, więc nie siedzi
   w S ani w presetach, tylko tutaj (K). Składamy ją w jedno płótno, które
   staje się S.img, a dalej wszystko idzie jak przy zwykłym obrazie: tryb,
   korekta, efekty, animacja, zapis. Stos efektów działa więc na całość;
   efekt tylko na warstwy pod sobą daje warstwa efektu (dodajEfekt).

   Współrzędne warstwy to środek obrazu w pikselach płótna; skala w procentach
   względem „dopasowania" (obraz wpisany w płótno), obrót w stopniach wokół
   środka. Kolejność: pierwsza w tablicy leży na samym dole. */

import { maska, kolorZBrzegow } from "./wycinanie.js";
import { cel, animowane, usunSciezke } from "./animacja.js";
import { uruchomEfekt, wpisEfektu } from "./stos.js";
import { maskaAI } from "./wycinanie-ai.js";

export const K = {
  aktywna: false,
  szer: 1080, wys: 1350, tlo: "#000000", przezroczyste: false,
  warstwy: [],                 /* {id, nazwa, obraz, x, y, skala, obrot, krycie, tryb, widoczna} */
  wybrana: -1,
  kanwa: null
};
let licznik = 0;

export const TRYBY = [["source-over", "Normalny"], ["multiply", "Mnożenie"], ["screen", "Rozjaśnienie"], ["overlay", "Nakładka"],
  ["darken", "Ciemniejsze"], ["lighten", "Jaśniejsze"], ["difference", "Różnica"], ["soft-light", "Miękkie światło"]];

/* skala bazowa: obraz wpisany w płótno w całości */
export const dopasowanie = w => Math.min(K.szer/w.obraz.width, K.wys/w.obraz.height);

export function utworz(obraz, nazwa){
  K.aktywna = true;
  K.szer = Math.max(16, Math.min(4000, Math.round(obraz.width))); K.wys = Math.max(16, Math.min(4000, Math.round(obraz.height)));
  K.warstwy = [];
  dodaj(obraz, nazwa);
}
export function dodaj(obraz, nazwa){
  K.warstwy.push({id: ++licznik, nazwa: nazwa || "warstwa " + licznik, obraz,
    x: K.szer/2, y: K.wys/2, skala: 100, obrot: 0, krycie: 100, tryb: "source-over", widoczna: true,
    tlo: {wl: false, sposob: "kolor", kolor: null, tolerancja: 30, miekkosc: 10, spojne: true}, wyciety: null, robocza: null, reka: null, maskaAI: null});
  K.wybrana = K.warstwy.length - 1;
}
/* Warstwa efektu: bez obrazu — w miejscu, w którym leży w stosie warstw,
   bierze wszystko, co pod nią (z tłem płótna), i przepuszcza przez efekt.
   Warstwy nad nią zostają nietknięte — jak efekt jako warstwa w Dither Boyu.
   Parametry efektu w w.par; nie animują się (animuje się krycie). */
export function dodajEfekt(efekt){
  const wpis = wpisEfektu(efekt);
  K.warstwy.push({id: ++licznik, nazwa: "Efekt: " + wpis.nazwa, typ: "efekt", efekt, par: {...wpis.start},
    x: K.szer/2, y: K.wys/2, skala: 100, obrot: 0, krycie: 100, tryb: "source-over", widoczna: true});
  K.wybrana = K.warstwy.length - 1;
}
export const czyEfekt = w => !!w && w.typ === "efekt";
export function usun(i){
  const w = K.warstwy.splice(i, 1)[0];
  if(w) usunAnimacjeWarstwy(w.id);
  if(w && w.obraz && w.obraz.close) w.obraz.close();
  K.wybrana = Math.min(K.wybrana, K.warstwy.length - 1);
}
export function przesun(i, o){
  const j = i + o;
  if(j < 0 || j >= K.warstwy.length) return;
  [K.warstwy[i], K.warstwy[j]] = [K.warstwy[j], K.warstwy[i]];
  if(K.wybrana === i) K.wybrana = j; else if(K.wybrana === j) K.wybrana = i;
}
export function zakoncz(){
  usunAnimacjeWarstwy(null);
  for(const w of K.warstwy) if(w.obraz && w.obraz.close) w.obraz.close();
  K.aktywna = false; K.warstwy = []; K.wybrana = -1;
}

/* składa kompozycję w jedno płótno (to samo przy każdym wywołaniu — S.img
   zostaje tym samym obiektem, zmienia się tylko zawartość) */
export function zloz(){
  if(!K.kanwa) K.kanwa = document.createElement("canvas");
  const c = K.kanwa;
  if(c.width !== K.szer || c.height !== K.wys){ c.width = K.szer; c.height = K.wys; }
  const x = c.getContext("2d");
  x.save();
  x.globalCompositeOperation = "source-over"; x.globalAlpha = 1;
  x.clearRect(0, 0, K.szer, K.wys);
  if(!K.przezroczyste){ x.fillStyle = K.tlo; x.fillRect(0, 0, K.szer, K.wys); }
  x.imageSmoothingQuality = "high";
  for(const w of K.warstwy){
    if(!w.widoczna) continue;
    if(czyEfekt(w)){ nalozEfekt(x, w); continue; }
    const s = dopasowanie(w)*w.skala/100, ow = w.obraz.width*s, oh = w.obraz.height*s;
    x.save();
    x.globalAlpha = w.krycie/100;
    x.globalCompositeOperation = w.tryb;
    x.translate(w.x, w.y);
    x.rotate(w.obrot*Math.PI/180);
    x.drawImage(w.wyciety || w.obraz, -ow/2, -oh/2, ow, oh);
    x.restore();
  }
  x.restore();
  return c;
}

/* efekt na tym, co dotąd złożone; krycie i tryb mieszania jak przy obrazie */
let robEfektu = null;
function nalozEfekt(x, w){
  const d = x.getImageData(0, 0, K.szer, K.wys);
  if(!uruchomEfekt(w.efekt, w.par, d.data, K.szer, K.wys)) return;
  if(!robEfektu) robEfektu = document.createElement("canvas");
  robEfektu.width = K.szer; robEfektu.height = K.wys;
  robEfektu.getContext("2d").putImageData(d, 0, 0);
  x.save();
  x.globalAlpha = w.krycie/100; x.globalCompositeOperation = w.tryb;
  x.drawImage(robEfektu, 0, 0);
  x.restore();
}

/* czy punkt płótna trafia w warstwę (z obrotem) — do zaznaczania kliknięciem */
export function trafiona(px, py){
  for(let i = K.warstwy.length - 1; i >= 0; i--){
    const w = K.warstwy[i];
    if(!w.widoczna || czyEfekt(w)) continue;
    const s = dopasowanie(w)*w.skala/100, a = -w.obrot*Math.PI/180;
    const dx = px - w.x, dy = py - w.y, lx = dx*Math.cos(a) - dy*Math.sin(a), ly = dx*Math.sin(a) + dy*Math.cos(a);
    if(Math.abs(lx) <= w.obraz.width*s/2 && Math.abs(ly) <= w.obraz.height*s/2) return i;
  }
  return -1;
}

/* ---------- usuwanie tła warstwy ----------
   Maska liczona na kopii roboczej (najwyżej 1400 px boku — tyle i tak idzie
   dalej do rastra), potem rysowana w miejsce oryginału. Kolor tła: wskazany
   kroplomierzem albo zgadnięty z brzegów zdjęcia. */
const ROBOCZA = 1400;
function robocza(w){
  if(w.robocza) return w.robocza;
  const s = Math.min(1, ROBOCZA/Math.max(w.obraz.width, w.obraz.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w.obraz.width*s)); c.height = Math.max(1, Math.round(w.obraz.height*s));
  c.getContext("2d").drawImage(w.obraz, 0, 0, c.width, c.height);
  w.robocza = c;
  return c;
}
/* Maska warstwy = automat (kolor tła) poprawiony pędzlem. Automat liczy się
   tylko przy zmianie jego ustawień (w.auto), pędzel trzyma dwie warstwy
   ręczne (w.reka: „przywróć" i „usuń", 0–255) — pociągnięcie przelicza
   wtedy tylko prostokąt pod pędzlem, inaczej malowanie by się cięło. */
export function wytnij(w){
  if(czyEfekt(w)) return;
  const c = robocza(w);
  if(!w.piksele) w.piksele = c.getContext("2d").getImageData(0, 0, c.width, c.height);
  if(!w.tlo.wl && !w.reka){ w.wyciety = null; w.auto = null; return; }
  if(w.tlo.wl && w.tlo.sposob === "ai"){
    w.auto = w.maskaAI;            /* liczona wcześniej, asynchronicznie (wytnijAI) */
  } else if(w.tlo.wl){
    if(!w.tlo.kolor) w.tlo.kolor = kolorZBrzegow(w.piksele.data, c.width, c.height);
    w.auto = maska(w.piksele.data, c.width, c.height, w.tlo);
  } else w.auto = null;
  if(!w.wyciety || w.wyciety.width !== c.width){
    w.wyciety = document.createElement("canvas"); w.wyciety.width = c.width; w.wyciety.height = c.height;
  }
  odswiezObszar(w, 0, 0, c.width, c.height);
}
function odswiezObszar(w, x0, y0, x1, y1){
  const cw = w.piksele.width, src = w.piksele.data, sw = x1 - x0, sh = y1 - y0;
  if(sw <= 0 || sh <= 0) return;
  const d = new ImageData(sw, sh), o = d.data, auto = w.auto, reka = w.reka;
  for(let y=0; y<sh; y++) for(let x=0; x<sw; x++){
    const i = (y0 + y)*cw + x0 + x, q = (y*sw + x)*4;
    let a = auto ? auto[i] : 255;
    if(reka){ a = Math.max(a, reka.dodaj[i]); a = a*(255 - reka.usun[i])/255; }
    o[q] = src[i*4]; o[q+1] = src[i*4+1]; o[q+2] = src[i*4+2]; o[q+3] = Math.min(src[i*4+3], a);
  }
  w.wyciety.getContext("2d").putImageData(d, x0, y0);
}
/* punkt płótna kompozycji → piksel kopii roboczej warstwy (z obrotem i skalą) */
function naRobocza(w, px, py){
  const s = dopasowanie(w)*w.skala/100, a = -w.obrot*Math.PI/180;
  const dx = px - w.x, dy = py - w.y, lx = dx*Math.cos(a) - dy*Math.sin(a), ly = dx*Math.sin(a) + dy*Math.cos(a);
  const c = robocza(w), k = c.width/w.obraz.width;
  return {x: (lx/s + w.obraz.width/2)*k, y: (ly/s + w.obraz.height/2)*k, skala: k/s};
}
/* Pędzel: miękkie koło o promieniu `promien` pikseli płótna. „usun" zdejmuje
   piksele, „dodaj" je przywraca (także tło, które zjadł automat); każde
   pociągnięcie znosi przeciwne pod sobą, więc można poprawiać w kółko. */
export function maluj(i, px, py, promien, tryb){
  const w = K.warstwy[i];
  if(!w || czyEfekt(w)) return false;
  const c = robocza(w), cw = c.width, ch = c.height, m = naRobocza(w, px, py), r = Math.max(0.5, promien*m.skala);
  if(m.x < -r || m.y < -r || m.x > cw + r || m.y > ch + r) return false;
  if(!w.reka) w.reka = {dodaj: new Uint8Array(cw*ch), usun: new Uint8Array(cw*ch)};
  const [na, przeciw] = tryb === "usun" ? [w.reka.usun, w.reka.dodaj] : [w.reka.dodaj, w.reka.usun];
  const x0 = Math.max(0, Math.floor(m.x - r)), x1 = Math.min(cw, Math.ceil(m.x + r) + 1);
  const y0 = Math.max(0, Math.floor(m.y - r)), y1 = Math.min(ch, Math.ceil(m.y + r) + 1);
  for(let y=y0; y<y1; y++) for(let x=x0; x<x1; x++){
    const t = Math.hypot(x + 0.5 - m.x, y + 0.5 - m.y)/r;
    if(t >= 1) continue;
    const u = Math.min(1, (1 - t)/0.4), b = Math.round(255*u*u*(3 - 2*u)), k = y*cw + x;   /* twardy środek, miękki brzeg */
    if(b > na[k]) na[k] = b;
    przeciw[k] = Math.round(przeciw[k]*(255 - b)/255);
  }
  if(!w.wyciety) wytnij(w); else odswiezObszar(w, x0, y0, x1, y1);
  return true;
}
export function wyczyscPedzel(w){ w.reka = null; wytnij(w); }
/* automatycznie (sieć neuronowa): maska liczona raz na warstwę, na kopii
   roboczej — potem przełączanie sposobu i pędzel działają od ręki.
   Błąd BRAK_MODELU, gdy nie pobrano modelu (npm run modele). */
export async function wytnijAI(w){
  if(czyEfekt(w)) return;
  if(!w.maskaAI) w.maskaAI = await maskaAI(robocza(w));
  w.tlo.wl = true; w.tlo.sposob = "ai";
  wytnij(w);
}
/* kolor zdjęcia warstwy pod punktem płótna (kroplomierz); null poza warstwą */
export function kolorPod(i, px, py){
  const w = K.warstwy[i];
  if(!w || czyEfekt(w)) return null;
  const s = dopasowanie(w)*w.skala/100, a = -w.obrot*Math.PI/180;
  const dx = px - w.x, dy = py - w.y, lx = dx*Math.cos(a) - dy*Math.sin(a), ly = dx*Math.sin(a) + dy*Math.cos(a);
  const u = lx/s + w.obraz.width/2, v = ly/s + w.obraz.height/2;
  if(u < 0 || v < 0 || u >= w.obraz.width || v >= w.obraz.height) return null;
  const c = robocza(w), k = c.width/w.obraz.width;
  const d = c.getContext("2d").getImageData(Math.min(c.width - 1, Math.floor(u*k)), Math.min(c.height - 1, Math.floor(v*k)), 1, 1).data;
  return [d[0], d[1], d[2]];
}

/* ---------- animacja warstw ----------
   Położenie, skala, obrót i krycie warstwy mogą mieć klatki kluczowe jak
   suwaki wyglądu. Klucz animacji: „w:<id warstwy>:<pole>" — id, nie numer,
   bo warstwy zmieniają kolejność. Wartość ustawia animacja.js przez cel(),
   potem raz składamy płótno. */
export const POLA_ANIM = ["x", "y", "skala", "obrot", "krycie"];
export const kluczWarstwy = (w, pole) => "w:" + w.id + ":" + pole;
cel("w", (k, v) => {
  const [, id, pole] = k.split(":"), w = K.warstwy.find(x => x.id === +id);
  if(w && POLA_ANIM.includes(pole)) w[pole] = v;
}, () => { if(K.aktywna) zloz(); });
/* null — wszystkie warstwy */
function usunAnimacjeWarstwy(id){
  for(const k of animowane()) if(k.startsWith(id === null ? "w:" : "w:" + id + ":")) usunSciezke(k);
}
