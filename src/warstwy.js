/* Kompozycja z warstw: kilka obrazów na płótnie o zadanym rozmiarze i tle.

   Kompozycja to materiał, jak obraz czy film — nie wygląd, więc nie siedzi
   w S ani w presetach, tylko tutaj (K). Składamy ją w jedno płótno, które
   staje się S.img, a dalej wszystko idzie jak przy zwykłym obrazie: tryb,
   korekta, efekty, animacja, zapis. Efekty działają więc na całą kompozycję,
   a nie (jak w Dither Boyu) tylko na warstwy pod sobą.

   Współrzędne warstwy to środek obrazu w pikselach płótna; skala w procentach
   względem „dopasowania" (obraz wpisany w płótno), obrót w stopniach wokół
   środka. Kolejność: pierwsza w tablicy leży na samym dole. */

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
    x: K.szer/2, y: K.wys/2, skala: 100, obrot: 0, krycie: 100, tryb: "source-over", widoczna: true});
  K.wybrana = K.warstwy.length - 1;
}
export function usun(i){
  const w = K.warstwy.splice(i, 1)[0];
  if(w && w.obraz.close) w.obraz.close();
  K.wybrana = Math.min(K.wybrana, K.warstwy.length - 1);
}
export function przesun(i, o){
  const j = i + o;
  if(j < 0 || j >= K.warstwy.length) return;
  [K.warstwy[i], K.warstwy[j]] = [K.warstwy[j], K.warstwy[i]];
  if(K.wybrana === i) K.wybrana = j; else if(K.wybrana === j) K.wybrana = i;
}
export function zakoncz(){
  for(const w of K.warstwy) if(w.obraz.close) w.obraz.close();
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
    const s = dopasowanie(w)*w.skala/100, ow = w.obraz.width*s, oh = w.obraz.height*s;
    x.save();
    x.globalAlpha = w.krycie/100;
    x.globalCompositeOperation = w.tryb;
    x.translate(w.x, w.y);
    x.rotate(w.obrot*Math.PI/180);
    x.drawImage(w.obraz, -ow/2, -oh/2, ow, oh);
    x.restore();
  }
  x.restore();
  return c;
}

/* czy punkt płótna trafia w warstwę (z obrotem) — do zaznaczania kliknięciem */
export function trafiona(px, py){
  for(let i = K.warstwy.length - 1; i >= 0; i--){
    const w = K.warstwy[i];
    if(!w.widoczna) continue;
    const s = dopasowanie(w)*w.skala/100, a = -w.obrot*Math.PI/180;
    const dx = px - w.x, dy = py - w.y, lx = dx*Math.cos(a) - dy*Math.sin(a), ly = dx*Math.sin(a) + dy*Math.cos(a);
    if(Math.abs(lx) <= w.obraz.width*s/2 && Math.abs(ly) <= w.obraz.height*s/2) return i;
  }
  return -1;
}
