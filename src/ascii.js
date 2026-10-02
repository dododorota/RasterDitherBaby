/* Tryb 3: ASCII — obraz z liter.

   Liczenie oddzielone od rysowania, jak w pozostałych trybach: siatkaAscii()
   (ascii-znaki.js, czysta, testowana w Node) dostaje uśrednione komórki i zwraca znaki
   i kolory; renderAscii() rysuje je na płótnie, svgAscii() zapisuje jako
   tekst w SVG, tekstAscii() jako zwykły plik .txt.

   Komórka ma proporcje znaku pisma o stałej szerokości (szerokość 0,6
   wysokości). Kolory komórek uśrednia płótno przy pomniejszeniu, potem idzie
   ta sama korekta co w pozostałych trybach (jasność, kontrast, odcień…).

   Znak dobieramy po jasności z „rampy" — zestawu znaków od najrzadszego do
   najgęstszego. Na ciemnym tle jasne miejsca dostają gęste znaki, na jasnym
   odwrotnie (decyduje jasność koloru tła), więc obraz zawsze wygląda jak
   obraz, a nie jak negatyw. */
import { S, MAX } from "./state.js";
import { out, octx } from "./dom.js";
import { adjust, fit, korektaPrzestrzenna } from "./image.js";
import { efektyPo, uruchomWSkali } from "./stos.js";
import { siatkaAscii, wymiaryKomorki } from "./ascii-znaki.js";
export { ZESTAWY } from "./ascii-znaki.js";

/* komórki obrazu: pomniejszenie płótnem (średnia), potem korekta */
function komorki(W, H){
  const [cw, ch] = wymiaryKomorki();
  const kol = Math.max(1, Math.floor(W/cw)), wier = Math.max(1, Math.floor(H/ch));
  const c = document.createElement("canvas"); c.width = kol; c.height = wier;
  const x = c.getContext("2d");
  x.imageSmoothingQuality = "high";
  x.drawImage(S.img, 0, 0, kol, wier);
  const d = x.getImageData(0, 0, kol, wier);
  adjust(d);
  korektaPrzestrzenna(d.data, kol, wier, 1/Math.min(cw, ch));
  return {kol, wier, cw, ch, d: d.data};
}
export function daneAscii(){
  const [W, H] = fit(S.img.width, S.img.height, MAX);
  const k = komorki(W, H);
  return {...k, ...siatkaAscii(k.d, k.kol, k.wier)};
}

const FONT = '"Cascadia Mono", Consolas, "DejaVu Sans Mono", "Courier New", monospace';
function rysuj(ctx, a, z, przezroczyste){
  const OW = a.kol*a.cw*z, OH = a.wier*a.ch*z;
  ctx.clearRect(0, 0, OW, OH);
  if(!przezroczyste){ ctx.fillStyle = S.paper; ctx.fillRect(0, 0, OW, OH); }
  ctx.font = (a.ch*z*0.95).toFixed(2) + "px " + FONT;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  /* grupami po kolorze — jedna zmiana fillStyle na kolor, a nie na znak */
  const grupy = new Map();
  for(let y=0; y<a.wier; y++) for(let x=0; x<a.kol; x++){
    const ch = a.znaki[y][x];
    if(ch === " ") continue;
    const i = (y*a.kol + x)*3, k = (a.kolory[i] << 16) | (a.kolory[i+1] << 8) | a.kolory[i+2];
    let g = grupy.get(k); if(!g) grupy.set(k, g = []);
    g.push(x, y);
  }
  for(const [k, g] of grupy){
    ctx.fillStyle = "#" + (k | 1 << 24).toString(16).slice(1);
    for(let i=0; i<g.length; i+=2){
      const x = g[i], y = g[i+1];
      ctx.fillText(a.znaki[y][x], (x + 0.5)*a.cw*z, (y + 0.5)*a.ch*z);
    }
  }
}
/* render jak w rastrze: w skali z cała siatka liczy się w pikselach podglądu,
   a z mnoży tylko rysowanie — zapis 4× to te same znaki, cztery razy większe */
export function renderAscii(scale, opcje){
  const z = Math.max(1, Math.round(scale)), a = daneAscii();
  const W = a.kol*a.cw, H = a.wier*a.ch;
  out.width = W*z; out.height = H*z;
  out.classList.remove("pixelated");
  const przezr = !!(opcje && opcje.przezroczyste);
  rysuj(octx, a, z, przezr);
  if(efektyPo()){
    const d = octx.getImageData(0, 0, W*z, H*z);
    let maly = d.data;
    if(z > 1){
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d"); rysuj(x, a, 1, przezr);
      maly = x.getImageData(0, 0, W, H).data;
    }
    uruchomWSkali(d.data, maly, W, H, z);
    octx.putImageData(d, 0, 0);
  }
  return a;
}

const xml = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/* SVG: każdy znak jako <text> w grupie swojego koloru — w Illustratorze
   zostaje edytowalnym tekstem; przy jednym kolorze wiersz to jeden <text>. */
export function svgAscii(){
  const a = daneAscii(), W = a.kol*a.cw, H = a.wier*a.ch, fs = (a.ch*0.95).toFixed(2);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`];
  parts.push(`<rect width="${W}" height="${H}" fill="${S.paper}"/>`);
  let count = 0;
  const czcionka = `font-family='${FONT.replace(/"/g, "")}' font-size="${fs}" text-anchor="middle" dominant-baseline="central"`;
  if(S.asciiKolor === "jeden"){
    parts.push(`<g fill="${S.ink}" ${czcionka}>`);
    for(let y=0; y<a.wier; y++){
      const xs = [], ch = [];
      for(let x=0; x<a.kol; x++){ const c = a.znaki[y][x]; if(c !== " "){ xs.push(((x + 0.5)*a.cw).toFixed(1)); ch.push(c); } }
      if(!ch.length) continue;
      parts.push(`<text x="${xs.join(" ")}" y="${((y + 0.5)*a.ch).toFixed(1)}">${xml(ch.join(""))}</text>`);
      count++;
    }
    parts.push("</g>");
  } else {
    const grupy = new Map();
    for(let y=0; y<a.wier; y++) for(let x=0; x<a.kol; x++){
      const c = a.znaki[y][x]; if(c === " ") continue;
      const i = (y*a.kol + x)*3, k = `rgb(${a.kolory[i]},${a.kolory[i+1]},${a.kolory[i+2]})`;
      let g = grupy.get(k); if(!g) grupy.set(k, g = []);
      g.push(`<text x="${((x + 0.5)*a.cw).toFixed(1)}" y="${((y + 0.5)*a.ch).toFixed(1)}">${xml(c)}</text>`);
      count++;
    }
    for(const [k, g] of grupy) parts.push(`<g fill="${k}" ${czcionka}>${g.join("")}</g>`);
  }
  parts.push("</svg>");
  return {svg: parts.join("\n"), count};
}
export function tekstAscii(){ return daneAscii().znaki.map(w => w.replace(/\s+$/, "")).join("\n") + "\n"; }
