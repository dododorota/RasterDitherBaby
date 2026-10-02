/* Nowe efekty po rastrze: zabarwienie, aberracja chromatyczna, JPEG glitch,
   gwiazdki dyfrakcyjne, faktura (subtekstura), obróbka końcowa — i zmienność
   w czasie, która jako jedyna działa PRZED ditheringiem.

   Czyste funkcje na buforze RGBA, bez DOM-u: w ditheringu biegają w workerze.
   Wszystko deterministyczne — „losowość" bierze się z funkcji skrótu od
   współrzędnych, ziarna i numeru klatki, więc podgląd, zapis i każda klatka
   filmu liczą się zawsze tak samo.

   Jednostki: w ditheringu efekty działają na buforze po pikselizacji
   (piksel bufora = `pix` pikseli obrazu), w rastrze na płótnie wyjściowym
   w skali z. Parametr `z` mówi, ile pikseli bufora przypada na piksel siatki
   efektu — faktura i ziarno są rysowane w tej siatce i powiększane blokami,
   więc zapis w skali jest dokładnym powiększeniem podglądu. */
import { S } from "./state.js";
import { hex2rgb } from "./palettes.js";

/* skrót trzech liczb całkowitych → [0, 1), na Math.imul (patrz CLAUDE.md) */
export function skrot(x, y, t){
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(t | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const ogr = v => v < 0 ? 0 : (v > 255 ? 255 : v);

/* ---------- zabarwienie ---------- */
export function zabarwienie(p){
  const a = S.tint/100;
  if(!(a > 0)) return;
  const c = hex2rgb(S.tintKolor), tryb = S.tintTryb;
  for(let o=0; o<p.length; o+=4){
    for(let k=0; k<3; k++){
      const v = p[o+k];
      let n;
      if(tryb === "mnoz") n = v*c[k]/255;
      else if(tryb === "ekran") n = 255 - (255 - v)*(255 - c[k])/255;
      else {
        /* „kolor": jasność piksela wzdłuż gradientu czerń → kolor → biel,
           jak duotone — cienie zostają czarne, światła białe */
        const t = (p[o]*0.299 + p[o+1]*0.587 + p[o+2]*0.114)/255;
        n = t < 0.5 ? 2*t*c[k] : 255 - 2*(1 - t)*(255 - c[k]);
      }
      p[o+k] = v + a*(n - v);
    }
  }
}

/* ---------- aberracja chromatyczna ----------
   Promienista, jak w obiektywie: czerwony powiększony od środka, niebieski
   pomniejszony, zielony w miejscu — kolorowe obwódki rosną ku brzegom.
   Siła to przesunięcie w rogu kadru w procentach połowy przekątnej, więc nie
   zależy od rozdzielczości: ten sam wynik na buforze podglądu i w skali. */
export function aberracja(p, w, h){
  const s = S.chrom/1000;
  if(!(s > 0)) return;
  const zr = new Uint8ClampedArray(p), cx = (w - 1)/2, cy = (h - 1)/2;
  const probka = (c, x, y) => {
    x = x < 0 ? 0 : (x > w - 1 ? w - 1 : x); y = y < 0 ? 0 : (y > h - 1 ? h - 1 : y);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const fx = x - x0, fy = y - y0;
    const a = zr[(y0*w + x0)*4 + c], b = zr[(y0*w + x1)*4 + c], d = zr[(y1*w + x0)*4 + c], e = zr[(y1*w + x1)*4 + c];
    return (a*(1 - fx) + b*fx)*(1 - fy) + (d*(1 - fx) + e*fx)*fy;
  };
  for(let y=0; y<h; y++) for(let x=0; x<w; x++){
    const o = (y*w + x)*4, dx = x - cx, dy = y - cy;
    p[o]   = probka(0, cx + dx/(1 + s), cy + dy/(1 + s));
    p[o+2] = probka(2, cx + dx/(1 - s), cy + dy/(1 - s));
  }
}

/* ---------- JPEG glitch ----------
   Prawdziwa kompresja JPEG w przeglądarce dałaby wynik zależny od kodera, a do
   tego nie biega w workerze — więc liczymy ją sami: YCbCr, kolor w połowie
   rozdzielczości (4:2:0), bloki 8×8, DCT, kwantyzacja tablicami ze
   standardu (aneks K) przeskalowanymi jak w libjpeg, i z powrotem.
   Glitch to symulacja uszkodzonego strumienia: od trafionego bloku do końca
   wiersza bloki są przesunięte i dostają przesunięty kolor (współczynnik DC),
   tak jak wtedy, gdy dekoder zgubi kilka bitów. Miejsca trafień ze skrótu
   ziarna i numeru bloku — zmiana ziarna to inny glitch. */
const TAB_Y = [16,11,10,16,24,40,51,61, 12,12,14,19,26,58,60,55, 14,13,16,24,40,57,69,56, 14,17,22,29,51,87,80,62,
               18,22,37,56,68,109,103,77, 24,35,55,64,81,104,113,92, 49,64,78,87,103,121,120,101, 72,92,95,98,112,100,103,99];
const TAB_C = [17,18,24,47,99,99,99,99, 18,21,26,66,99,99,99,99, 24,26,56,99,99,99,99,99, 47,66,99,99,99,99,99,99,
               99,99,99,99,99,99,99,99, 99,99,99,99,99,99,99,99, 99,99,99,99,99,99,99,99, 99,99,99,99,99,99,99,99];
const COS = Array.from({length: 64}, (_, i) => { const x = i >> 3, u = i & 7; return Math.cos((2*x + 1)*u*Math.PI/16)*(u ? 0.5 : Math.SQRT1_2*0.5); });
function tablica(baza, jakosc){
  const q = Math.max(1, Math.min(100, jakosc)), sk = q < 50 ? 5000/q : 200 - 2*q;
  return baza.map(v => Math.max(1, Math.min(255, Math.floor((v*sk + 50)/100))));
}
/* DCT 8×8 rozdzielona: wiersze, potem kolumny; odwrotna tak samo */
function dct(b, wyj){
  const t = new Float64Array(64);
  for(let y=0; y<8; y++) for(let u=0; u<8; u++){ let s = 0; for(let x=0; x<8; x++) s += b[y*8 + x]*COS[x*8 + u]; t[y*8 + u] = s; }
  for(let u=0; u<8; u++) for(let v=0; v<8; v++){ let s = 0; for(let y=0; y<8; y++) s += t[y*8 + u]*COS[y*8 + v]; wyj[v*8 + u] = s; }
}
function idct(c, wyj){
  const t = new Float64Array(64);
  for(let v=0; v<8; v++) for(let x=0; x<8; x++){ let s = 0; for(let u=0; u<8; u++) s += c[v*8 + u]*COS[x*8 + u]; t[v*8 + x] = s; }
  for(let x=0; x<8; x++) for(let y=0; y<8; y++){ let s = 0; for(let v=0; v<8; v++) s += t[v*8 + x]*COS[y*8 + v]; wyj[y*8 + x] = s; }
}
/* płaszczyzna w*h przez JPEG; `uszkodz(bx, by)` → [przesunięcie bloków, przesunięcie DC] albo null */
function plaszczyzna(pl, w, h, tab, uszkodz){
  const bw = Math.ceil(w/8), bh = Math.ceil(h/8);
  const blok = new Float64Array(64), wsp = new Float64Array(64), wyn = new Float64Array(64);
  const gotowe = new Float64Array(bw*bh*64);
  for(let by=0; by<bh; by++) for(let bx=0; bx<bw; bx++){
    for(let y=0; y<8; y++) for(let x=0; x<8; x++){
      const xx = Math.min(w - 1, bx*8 + x), yy = Math.min(h - 1, by*8 + y);
      blok[y*8 + x] = pl[yy*w + xx] - 128;
    }
    dct(blok, wsp);
    for(let i=0; i<64; i++) wsp[i] = Math.round(wsp[i]/tab[i])*tab[i];
    gotowe.set(wsp, (by*bw + bx)*64);
  }
  const wyjscie = new Float64Array(w*h);
  for(let by=0; by<bh; by++){
    let przes = 0, dc = 0;
    for(let bx=0; bx<bw; bx++){
      const u = uszkodz && uszkodz(bx, by);
      if(u){ przes += u[0]; dc += u[1]; }
      const zrodlo = ((bx - przes) % bw + bw) % bw;
      wsp.set(gotowe.subarray((by*bw + zrodlo)*64, (by*bw + zrodlo)*64 + 64));
      wsp[0] += dc;
      idct(wsp, wyn);
      for(let y=0; y<8; y++) for(let x=0; x<8; x++){
        const xx = bx*8 + x, yy = by*8 + y;
        if(xx < w && yy < h) wyjscie[yy*w + xx] = wyn[y*8 + x] + 128;
      }
    }
  }
  return wyjscie;
}
export function jpeg(p, w, h){
  const n = w*h, Y = new Float64Array(n);
  const cw = Math.ceil(w/2), ch = Math.ceil(h/2), Cb = new Float64Array(cw*ch), Cr = new Float64Array(cw*ch), ile = new Float64Array(cw*ch);
  for(let y=0; y<h; y++) for(let x=0; x<w; x++){
    const o = (y*w + x)*4, r = p[o], g = p[o+1], b = p[o+2], c = (y >> 1)*cw + (x >> 1);
    Y[y*w + x] = 0.299*r + 0.587*g + 0.114*b;
    Cb[c] += 128 - 0.168736*r - 0.331264*g + 0.5*b;
    Cr[c] += 128 + 0.5*r - 0.418688*g - 0.081312*b;
    ile[c]++;
  }
  for(let i=0; i<Cb.length; i++){ Cb[i] /= ile[i]; Cr[i] /= ile[i]; }
  const ty = tablica(TAB_Y, S.jpegJakosc), tc = tablica(TAB_C, S.jpegJakosc);
  const prawd = S.jpegGlitch/100*0.06, ziarno = S.jpegZiarno | 0;
  const uszkodz = kanal => prawd > 0 ? (bx, by) => {
    if(skrot(bx, by, ziarno*7 + 1) >= prawd) return null;
    const a = skrot(bx, by, ziarno*7 + 2), b = skrot(bx, by, ziarno*7 + 3 + kanal);
    return [Math.floor(a*6) - 2, (b - 0.5)*(kanal ? 300 : 500)];
  } : null;
  const y2 = plaszczyzna(Y, w, h, ty, uszkodz(0));
  /* uszkodzenie w kolorze trafia w te same bloki obrazu (bloki koloru są dwa razy większe) */
  const cb2 = plaszczyzna(Cb, cw, ch, tc, prawd > 0 ? (bx, by) => uszkodz(1)(bx*2, by*2) : null);
  const cr2 = plaszczyzna(Cr, cw, ch, tc, prawd > 0 ? (bx, by) => uszkodz(2)(bx*2, by*2) : null);
  for(let y=0; y<h; y++) for(let x=0; x<w; x++){
    const o = (y*w + x)*4, c = (y >> 1)*cw + (x >> 1), L = y2[y*w + x], b = cb2[c] - 128, r = cr2[c] - 128;
    p[o] = ogr(L + 1.402*r); p[o+1] = ogr(L - 0.344136*b - 0.714136*r); p[o+2] = ogr(L + 1.772*b);
  }
}

/* ---------- gwiazdki dyfrakcyjne ----------
   Promienie jak z przysłony obiektywu, z najjaśniejszych punktów. Kadr dzielimy
   na komórki i z każdej bierzemy najjaśniejszy piksel ponad progiem — inaczej
   jasna plama dałaby tysiąc gwiazdek obok siebie. Najjaśniejszych punktów
   najwyżej MAX_GWIAZD. Zwraca warstwę Float32 RGBA do nałożenia trybem screen,
   jak poświata. */
const MAX_GWIAZD = 3000;
export function warstwaGwiazd(p, w, h, jednostka){
  const sila = S.gwiazdy/100, prog = S.gwProg*2.55;
  if(!(sila > 0) || prog >= 255) return null;
  const kom = Math.max(3, Math.round(10*jednostka)), pkt = [];
  for(let cy=0; cy<h; cy+=kom) for(let cx=0; cx<w; cx+=kom){
    let best = -1, bj = prog;
    for(let y=cy; y<Math.min(h, cy + kom); y++) for(let x=cx; x<Math.min(w, cx + kom); x++){
      const o = (y*w + x)*4, j = p[o]*0.299 + p[o+1]*0.587 + p[o+2]*0.114;
      if(j > bj){ bj = j; best = o; }
    }
    if(best >= 0) pkt.push([best, bj]);
  }
  pkt.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  if(pkt.length > MAX_GWIAZD) pkt.length = MAX_GWIAZD;
  const L = new Float32Array(w*h*4), N = Math.max(2, S.gwRamiona | 0), dl = Math.max(2, S.gwDlugosc*jednostka);
  const kat0 = S.gwKat*Math.PI/180;
  const dodaj = (x, y, r, g, b) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    for(const [xx, yy, wg] of [[x0, y0, (1-fx)*(1-fy)], [x0+1, y0, fx*(1-fy)], [x0, y0+1, (1-fx)*fy], [x0+1, y0+1, fx*fy]]){
      if(xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const o = (yy*w + xx)*4; L[o] += r*wg; L[o+1] += g*wg; L[o+2] += b*wg;
    }
  };
  for(const [o, j] of pkt){
    const i = o/4, x = i % w, y = (i - x)/w;
    const f = Math.min(1, (j - prog)/Math.max(1, (255 - prog)*0.5))*sila;
    const r = p[o]*f, g = p[o+1]*f, b = p[o+2]*f;
    for(let k=0; k<N; k++){
      const a = kat0 + k*2*Math.PI/N, ca = Math.cos(a), sa = Math.sin(a);
      for(let s=1; s<dl; s+=0.7){
        const t = 1 - s/dl, m = t*t;
        dodaj(x + ca*s, y + sa*s, r*m, g*m, b*m);
      }
    }
  }
  return L;
}

/* ---------- faktura ----------
   Wzór nałożony na obraz, jak siatka kineskopu albo tkanina pod drukiem.
   Generowany kodem, bez plików: każdy wzór to funkcja współrzędnych komórki
   faktury → kolor. Skala to rozmiar komórki w pikselach siatki efektu. */
const tecza = t => { const h = (t % 1)*6, i = Math.floor(h), f = h - i, q = 255*(1 - f), u = 255*f;
  return [[255,u,0],[q,255,0],[0,255,u],[0,q,255],[u,0,255],[255,0,q]][i]; };
export const FAKTURY = {
  maskaRGB:   (X, Y) => [[255,40,40],[40,255,40],[40,40,255]][((X % 3) + 3) % 3],
  rozeta:     (X, Y) => (Y % 3 === 2) ? [30,30,30] : [[255,40,40],[40,255,40],[40,40,255]][(X + (Math.floor(Y/3) % 2)*2) % 3],
  skanlinie:  (X, Y) => (Y & 1) ? [60,60,60] : [255,255,255],
  kratka:     (X, Y) => (X % 4 === 0 || Y % 4 === 0) ? [70,70,70] : [255,255,255],
  szumBarwny: (X, Y) => [155 + skrot(X, Y, 11)*100, 155 + skrot(X, Y, 12)*100, 155 + skrot(X, Y, 13)*100],
  szum:       (X, Y) => { const v = 120 + skrot(X, Y, 21)*135; return [v, v, v]; },
  tkanina:    (X, Y) => { const pion = ((X >> 2) + (Y >> 2)) & 1, nic = pion ? (X & 3) : (Y & 3), v = (nic === 0 || nic === 3) ? 150 : 245; return [v, v - 6, v - 14]; },
  romby:      (X, Y) => (Math.abs((X % 8) - 3.5) + Math.abs((Y % 8) - 3.5) < 4) ? [255,255,255] : [90,90,90],
  tecza:      (X, Y) => tecza((X + Y)/48)
};
export function faktura(p, w, h, z){
  const wzor = FAKTURY[S.faktura], a = S.faktKrycie/100;
  if(!wzor || !(a > 0)) return;
  const sk = Math.max(1, S.faktSkala | 0)*z, tryb = S.faktTryb;
  for(let y=0; y<h; y++){
    const Y = Math.floor(y/sk);
    for(let x=0; x<w; x++){
      const t = wzor(Math.floor(x/sk), Y), o = (y*w + x)*4;
      for(let k=0; k<3; k++){
        const v = p[o+k], c = t[k];
        let n;
        if(tryb === "ekran") n = 255 - (255 - v)*(255 - c)/255;
        else if(tryb === "nakladka") n = v < 128 ? 2*v*c/255 : 255 - 2*(255 - v)*(255 - c)/255;
        else if(tryb === "miekkie"){ const A = v/255, B = c/255; n = 255*(B < 0.5 ? A - (1 - 2*B)*A*(1 - A) : A + (2*B - 1)*((A <= 0.25 ? ((16*A - 12)*A + 4)*A : Math.sqrt(A)) - A)); }
        else n = v*c/255;
        p[o+k] = v + a*(n - v);
      }
    }
  }
}

/* ---------- obróbka końcowa ----------
   Korekta już po ditheringu (jasność, kontrast, nasycenie), winieta i ziarno.
   Winieta liczona we współrzędnych względnych kadru — ta sama przy każdej
   rozdzielczości. Ziarno jak faktura: jedna próbka na komórkę siatki efektu,
   inne w każdej klatce filmu. */
export function obrobka(p, w, h, z){
  const jas = S.postJas*2.55, kon = S.postKon, nas = 1 + S.postNas/100, win = S.winieta/100, zi = S.postZiarno*0.9;
  if(!jas && !kon && nas === 1 && !win && !zi) return;
  const f = (259*(kon + 255))/(255*(259 - kon)), cx = (w - 1)/2, cy = (h - 1)/2, R = Math.hypot(cx, cy) || 1;
  const t = S.klatkaNr | 0;
  for(let y=0; y<h; y++) for(let x=0; x<w; x++){
    const o = (y*w + x)*4;
    let r = f*(p[o] + jas - 128) + 128, g = f*(p[o+1] + jas - 128) + 128, b = f*(p[o+2] + jas - 128) + 128;
    if(nas !== 1){ const L = 0.2126*r + 0.7152*g + 0.0722*b; r = L + (r - L)*nas; g = L + (g - L)*nas; b = L + (b - L)*nas; }
    if(win){
      const d = Math.hypot(x - cx, y - cy)/R, u = Math.max(0, Math.min(1, (d - 0.35)/0.65)), m = 1 - win*u*u*(3 - 2*u);
      r *= m; g *= m; b *= m;
    }
    if(zi){ const n = (skrot(Math.floor(x/z), Math.floor(y/z), 977 + t) - 0.5)*zi; r += n; g += n; b += n; }
    p[o] = r; p[o+1] = g; p[o+2] = b;
  }
}

/* ---------- zmienność w czasie (przed ditheringiem) ----------
   Szum i drgania zmieniające się z klatki na klatkę: dyfuzja błędu i siatka
   rastra układają się wtedy w każdej klatce trochę inaczej, więc nawet
   nieruchomy obraz „żyje" — tak działa Temporal Variation w Dither Boyu.
   Numer klatki (S.klatkaNr) ustawia oś czasu; na zwykłym obrazie bez
   animacji to zero, czyli zawsze ten sam wynik. */
export function zmiennoscPrzed(p, w, h, jednostka){
  const t = S.klatkaNr | 0, szum = S.czasSzum*0.8, dr = S.czasDrganie*jednostka;
  if(dr > 0){
    const dx = Math.round((skrot(t, 1, 31) - 0.5)*2*dr), dy = Math.round((skrot(t, 2, 31) - 0.5)*2*dr);
    if(dx || dy){
      const zr = new Uint8ClampedArray(p);
      for(let y=0; y<h; y++){
        const yy = Math.min(h - 1, Math.max(0, y - dy));
        for(let x=0; x<w; x++){
          const xx = Math.min(w - 1, Math.max(0, x - dx)), o = (y*w + x)*4, q = (yy*w + xx)*4;
          p[o] = zr[q]; p[o+1] = zr[q+1]; p[o+2] = zr[q+2];
        }
      }
    }
  }
  if(szum > 0) for(let y=0; y<h; y++) for(let x=0; x<w; x++){
    const o = (y*w + x)*4, n = (skrot(x, y, 5003 + t) - 0.5)*szum;
    p[o] += n; p[o+1] += n; p[o+2] += n;
  }
}
/* przesunięcie macierzy progowej (Bayer, wzory, niebieski szum) o klatkę —
   „Ordered Cycling": siatka wędruje, zamiast stać w miejscu */
export function cyklMacierzy(){
  if(!S.czasCykl) return [0, 0];
  const t = S.klatkaNr | 0;
  return [t*3, t*5];
}
