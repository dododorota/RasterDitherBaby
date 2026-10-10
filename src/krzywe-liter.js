/* Litery jako krzywe w SVG — żeby plik nie zależał od kroju.

   Znak rysowany na płótnie tym samym krojem co podgląd (w stopniu F),
   obrysowany po krawędziach pikseli (sledzKontury) i wygładzony do krzywych
   (sciezkaGladka) — jak „zamień na krzywe" w Illustratorze, tylko z tego, co
   przeglądarka naprawdę narysowała, więc wygląda jak podgląd, także przy
   krojach systemowych i zastępczych. Każdy znak trafia do <defs> raz,
   punkty to <use> z przesunięciem, obrotem i skalą (stopień/F).

   Emoji i inne kolorowe znaki nie mają jednego kształtu — idą jako obrazek
   PNG (też raz, w <defs>), w swoich kolorach, jak na płótnie.

   Punkt zaczepienia: środek w poziomie i środek wysokości (textAlign
   center, textBaseline middle) — tak rysują raster i ASCII. */
import { sledzKontury, sciezkaGladka } from "./contours.js";

const F = 192;              /* stopień przy obrysowywaniu — krzywe gładkie i po pomniejszeniu, i po powiększeniu */
const pamiec = new Map();   /* krój + znak → glif (null: znak pusty) */

/* krojCSS: px → napis dla ctx.font, ten sam co przy rysowaniu podglądu */
function glif(znak, krojCSS){
  const klucz = krojCSS(F) + "\u0000" + znak;
  if(pamiec.has(klucz)) return pamiec.get(klucz);
  const c = document.createElement("canvas"), x = c.getContext("2d", {willReadFrequently: true});
  x.font = krojCSS(F); x.textAlign = "center"; x.textBaseline = "middle";
  const m = x.measureText(znak), pad = 4;
  const lewo = Math.ceil(m.actualBoundingBoxLeft || 0), prawo = Math.ceil(m.actualBoundingBoxRight || 0);
  const gora = Math.ceil(m.actualBoundingBoxAscent || 0), dol = Math.ceil(m.actualBoundingBoxDescent || 0);
  let wyn = null;
  if(lewo + prawo > 0 && gora + dol > 0){
    c.width = lewo + prawo + 2*pad; c.height = gora + dol + 2*pad;
    const ox = pad + lewo, oy = pad + gora;
    x.font = krojCSS(F); x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#000";
    x.fillText(znak, ox, oy);
    const p = x.getImageData(0, 0, c.width, c.height).data, n = c.width*c.height, maska = new Uint8Array(n);
    let pelne = 0, kolor = false;
    for(let i=0; i<n; i++){
      if(p[i*4 + 3] >= 128){ maska[i] = 1; pelne++; }
      /* rysowane czernią: wyraźnie jasny albo barwny piksel = znak ma własne kolory (emoji) */
      if(p[i*4 + 3] > 64 && Math.max(p[i*4], p[i*4 + 1], p[i*4 + 2]) > 48) kolor = true;
    }
    if(kolor) wyn = {ox, oy, w: c.width, h: c.height, png: c.toDataURL("image/png")};
    else if(pelne) wyn = {ox, oy, d: sledzKontury(maska, c.width, c.height).map(pt => sciezkaGladka(pt, 2)).join("")};
  }
  pamiec.set(klucz, wyn);
  return wyn;
}

const n2 = v => Math.round(v*100)/100;
/* Zbiór liter jednego pliku SVG: uzyj() daje <use> w miejscu znaku (albo ""
   dla pustego), defs() — definicje użytych znaków. */
export class Litery {
  constructor(krojCSS, przedrostek = "lit"){ this.kroj = krojCSS; this.prz = przedrostek; this.id = new Map(); this.def = []; }
  uzyj(znak, x, y, stopien, katStopnie = 0, sx = 1, sy = 1){
    const g = glif(znak, this.kroj);
    if(!g) return "";
    let id = this.id.get(znak);
    if(!id){
      id = this.prz + "-" + (this.id.size + 1);
      this.id.set(znak, id);
      this.def.push(g.png
        ? `<image id="${id}" x="${-g.ox}" y="${-g.oy}" width="${g.w}" height="${g.h}" xlink:href="${g.png}"/>`
        : `<path id="${id}" fill-rule="evenodd" transform="translate(${-g.ox} ${-g.oy})" d="${g.d}"/>`);
    }
    const s = stopien/F;
    return `<use xlink:href="#${id}" transform="translate(${n2(x)} ${n2(y)})${katStopnie ? ` rotate(${n2(katStopnie)})` : ""} scale(${+(s*sx).toFixed(5)} ${+(s*sy).toFixed(5)})"/>`;
  }
  defs(){ return this.def.join(""); }
  get puste(){ return !this.def.length; }
}
/* <svg …> z przestrzenią nazw xlink, jeśli plik jej potrzebuje */
export const zXlink = naglowek => naglowek.includes("xmlns:xlink") ? naglowek : naglowek.replace("<svg ", `<svg xmlns:xlink="http://www.w3.org/1999/xlink" `);
