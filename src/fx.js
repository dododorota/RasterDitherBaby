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
   Materiał albo nośnik nałożony na obraz: papier, ksero, kurz, kineskop,
   taśma, płótno… Generowane kodem, bez plików — każda faktura to funkcja
   piksela siatki efektu (X, Y) → kolor, z ziarnem ze skrótu, więc
   deterministyczna. Liczona raz na piksel podglądu (przy zapisie w skali
   powiększana blokami z×z — dokładne powiększenie, jak ziarno). Skala z
   suwaka (1–12, środek 2) mnoży wielkość szczegółów. Neutralne tło: 255 dla
   mnożenia, 128 dla nakładki i miękkiego światła — każda faktura podaje
   tryb, w którym wygląda najlepiej (FAKTURY_TRYB, ustawiany przy wyborze).
   Ziarno filmowe, taśma i kurz zmieniają się z klatką filmu (S.klatkaNr). */
const gl = t => t*t*(3 - 2*t);
const fr = v => v - Math.floor(v);
/* szum wartości na siatce obróconej o ~37° (prosta zdradza kratkę) */
function szumW(x, y, z){
  const u = x*0.8 - y*0.6, v = x*0.6 + y*0.8, i = Math.floor(u), j = Math.floor(v), fx = gl(u - i), fy = gl(v - j);
  const a = skrot(i, j, z), b = skrot(i + 1, j, z), c = skrot(i, j + 1, z), d = skrot(i + 1, j + 1, z);
  return a + (b - a)*fx + (c - a + (a - b - c + d)*fx)*fy;
}
function fbm(x, y, z, okt){
  let s = 0, a = 0.5, f = 1, n = 0;
  for(let o=0; o<okt; o++){ s += a*szumW(x*f, y*f, z + o*101); n += a; a *= 0.5; f *= 2.03; }
  return s/n;
}
const sz = v => Math.max(0, Math.min(255, v));
const tecza = t => { const h = fr(t)*6, i = Math.floor(h), f = h - i, q = 255*(1 - f), u = 255*f;
  return [[255,u,0],[q,255,0],[0,255,u],[0,q,255],[u,0,255],[255,0,q]][i]; };
/* punkt (kropka, plamka) w losowym miejscu komórki — do kurzu, drobinek, porów */
function plamka(X, Y, kom, prawd, rMin, rMax, ziarno){
  const cx = Math.floor(X/kom), cy = Math.floor(Y/kom);
  for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++){
    const i = cx + dx, j = cy + dy;
    if(skrot(i, j, ziarno) >= prawd) continue;
    const px = (i + skrot(i, j, ziarno + 1))*kom, py = (j + skrot(i, j, ziarno + 2))*kom;
    const r = rMin + (rMax - rMin)*skrot(i, j, ziarno + 3), d = Math.hypot(X + 0.5 - px, Y + 0.5 - py);
    if(d < r) return {d: d/r, ton: skrot(i, j, ziarno + 4)};
  }
  return null;
}

/* (X, Y, k — skala szczegółów, W, H — wymiary siatki efektu, t — klatka) → [r, g, b] */
export const FAKTURY = {
  /* papier: ziarno, łagodne chmurki masy i krótkie włókna, ciepła biel */
  papier: (X, Y, k) => {
    const m = fbm(X/(45*k), Y/(45*k), 1, 3), z = skrot(X, Y, 2) - 0.5;
    const w1 = Math.abs(szumW(X/(1.2*k), Y/(9*k), 3) - 0.5), w2 = Math.abs(szumW(X/(9*k), Y/(1.2*k), 4) - 0.5);
    const wl = (w1 < 0.04 ? 22 : 0) + (w2 < 0.035 ? 16 : 0);
    const v = 246 - (m - 0.5)*55 + z*16 - wl;
    return [sz(v), sz(v - 4), sz(v - 11)];
  },
  /* karton z makulatury: brązowa masa, plamki farby i kory, jaśniejsze włókna */
  karton: (X, Y, k) => {
    const m = fbm(X/(30*k), Y/(30*k), 5, 3), z = skrot(X, Y, 6) - 0.5;
    let r = 222 - (m - 0.5)*40 + z*16, g = r - 16, b = r - 40;
    const p = plamka(X, Y, 7*k, 0.35, 0.4*k, 1.6*k, 7);
    if(p){ const c = p.ton < 0.7 ? [80, 66, 52] : (p.ton < 0.85 ? [60, 70, 110] : [140, 50, 45]); const a = 1 - p.d*p.d; r += (c[0] - r)*a; g += (c[1] - g)*a; b += (c[2] - b)*a; }
    if(Math.abs(szumW(X/(1.4*k), Y/(7*k), 8) - 0.5) < 0.03){ r += 18; g += 18; b += 14; }
    return [sz(r), sz(g), sz(b)];
  },
  /* pognieciony papier: płaskie ścianki (komórki Voronoja w dwóch skalach),
     każda nachylona inaczej do światła, na stykach ostre zagięcia; do nakładki */
  pogniecony: (X, Y, k) => {
    const sc = (s, zi) => {
      const x = X/s, y = Y/s, i = Math.floor(x), j = Math.floor(y);
      let d1 = 9, d2 = 9, ni = 0, nj = 0, px = 0, py = 0;
      for(let b=-1; b<=1; b++) for(let a=-1; a<=1; a++){
        const fx = i + a + skrot(i + a, j + b, zi), fy = j + b + skrot(i + a, j + b, zi + 1), d = Math.hypot(x - fx, y - fy);
        if(d < d1){ d2 = d1; d1 = d; ni = i + a; nj = j + b; px = x - fx; py = y - fy; } else if(d < d2) d2 = d;
      }
      /* nachylenie ścianki: los na komórkę, plus spadek w stronę losowego kierunku */
      const kat = skrot(ni, nj, zi + 2)*6.283, nach = skrot(ni, nj, zi + 3) - 0.5;
      return {v: nach*1.3 + (px*Math.cos(kat) + py*Math.sin(kat))*0.6, zag: d2 - d1};
    };
    const A = sc(38*k, 9), B = sc(13*k, 12);
    let v = 128 + (A.v*0.7 + B.v*0.35)*70;
    if(A.zag < 0.04) v += A.v > 0 ? 40 : -45;
    else if(B.zag < 0.05) v += B.v > 0 ? 18 : -22;
    v += (skrot(X, Y, 11) - 0.5)*8;
    return [sz(v), sz(v), sz(v)];
  },
  /* papier milimetrowy: linie co milimetr, mocniejsze co pięć, niebieskie */
  milimetrowy: (X, Y, k) => {
    const P = Math.max(3, Math.round(4*k)), mx = ((X % P) + P) % P, my = ((Y % P) + P) % P;
    const gx = ((Math.floor(X/P) % 5) + 5) % 5, gy = ((Math.floor(Y/P) % 5) + 5) % 5;
    if((mx === 0 && gx === 0) || (my === 0 && gy === 0)) return [150, 192, 228];
    if(mx === 0 || my === 0) return [205, 226, 242];
    return [255, 255, 255];
  },
  /* kserokopia: drobny toner tam, gdzie bęben brudny, poziome smugi, ciemniejsze
     brzegi i rogi, pojedyncze wykruszenia */
  ksero: (X, Y, k, W, H) => {
    let v = 255;
    const brud = fbm(X/(60*k), Y/(60*k), 12, 2);
    if(skrot(X, Y, 13) < 0.02 + Math.max(0, brud - 0.55)*0.6) v -= 90 + skrot(X, Y, 14)*120;
    const smuga = szumW(X/(400*k), Y/(2.5*k), 15);
    if(smuga > 0.78) v -= (smuga - 0.78)*260;
    const bx = Math.min(X, W - 1 - X)/(W*0.06), by = Math.min(Y, H - 1 - Y)/(H*0.06), brzeg = Math.max(0, 1 - Math.min(bx, by));
    v -= brzeg*brzeg*70*(0.6 + 0.4*szumW(X/(8*k), Y/(8*k), 16));
    return [sz(v), sz(v), sz(v)];
  },
  /* kurz i rysy: pyłki, włosy (warstwice szumu — kręte linie) i pionowe
     rysy jak na starej taśmie; ciemne na bieli, do mnożenia */
  kurz: (X, Y, k, W, H, t) => {
    let v = 255;
    const p = plamka(X, Y, 8*k, 0.3, 0.5*k, 2.2*k, 18 + t*11);
    if(p) v = 255 - (p.ton < 0.8 ? 200 : 120)*(1 - p.d*p.d*p.d);
    const wl = szumW(X/(24*k), Y/(24*k), 19 + t*13), maska = szumW(X/(80*k), Y/(80*k), 20 + t*13);
    const g = Math.abs(wl - 0.5);
    if(maska > 0.6 && g < 0.012) v = Math.min(v, 60 + g*9000);
    const kol = Math.floor(X/Math.max(1, Math.round(k*0.8)));
    if(skrot(kol, 0, 21 + t*17) < 0.008){ const s = szumW(0, Y/(30*k), kol + t); if(s > 0.3) v = Math.min(v, 255 - (s - 0.3)*260); }
    return [v, v, v];
  },
  /* kineskop: maska z pasków luminoforu R, G, B, ciemne linie między
     liniami obrazu, lekka poświata w środku paska */
  crt: (X, Y, k) => {
    const s = Math.max(1, Math.round(k)), sub = ((Math.floor(X/s) % 3) + 3) % 3, u = fr(X/s), w = fr(Y/(3*s));
    const pas = 0.55 + 0.45*Math.sin(Math.PI*(s > 1 ? u : 0.5)), lin = w > 0.72 ? 0.35 : 1;
    const c = [[255, 70, 60], [70, 255, 90], [70, 110, 255]][sub];
    return c.map(x => x*pas*lin);
  },
  /* ekran LCD z bliska: komórka z trzech subpikseli z czarnymi przerwami */
  lcd: (X, Y, k) => {
    const s = Math.max(1, Math.round(k*1.5)), kom = 3*s + 1, x = ((X % kom) + kom) % kom, y = ((Y % kom) + kom) % kom;
    if(x === kom - 1 || y === kom - 1 || y === 0) return [20, 20, 22];
    return [[255, 60, 50], [60, 240, 90], [60, 90, 255]][Math.min(2, Math.floor(x/s))];
  },
  /* taśma VHS: drżące pasy jasności, linie obrazu, szum barwny i jasna linia
     śledzenia, która przesuwa się z klatki na klatkę; do nakładki */
  vhs: (X, Y, k, W, H, t) => {
    const pas = (szumW(t*0.37, Y/(3*k), 22) - 0.5)*44, lin = (Y & 1) ? -14 : 6;
    const sledz = fr(t*0.031 + 0.2)*H, odl = Math.abs(Y - sledz);
    let v = 128 + pas + lin;
    if(odl < 3*k) v += (1 - odl/(3*k))*70*skrot(X >> 1, Y, 23 + t);
    const c = (skrot(X >> 1, Y, 24 + t) - 0.5)*26;
    return [sz(v + c), sz(v - c*0.5), sz(v - c)];
  },
  /* ziarno filmowe: zbite w grudki (dwie skale szumu), w każdej klatce inne */
  grain: (X, Y, k, W, H, t) => {
    const n = szumW(X/(0.8*k), Y/(0.8*k), 25 + t*7)*0.65 + skrot(X, Y, 26 + t*7)*0.35;
    const v = 128 + (n - 0.5)*110;
    return [v, v, v];
  },
  /* płótno: splot płócienny — nić na wierzchu zaokrąglona w poprzek
     i schodząca pod spód na końcach odcinka, z nierównościami przędzy */
  plotno: (X, Y, k) => {
    const P = Math.max(3, 5*k), cx = Math.floor(X/P), cy = Math.floor(Y/P), pion = (cx + cy) & 1;
    const u = pion ? fr(X/P) : fr(Y/P), w = pion ? fr(Y/P) : fr(X/P), wzdl = pion ? Y : X;
    const profil = Math.sin(Math.PI*u)*(0.45 + 0.55*Math.sin(Math.PI*w));
    const nier = szumW(wzdl/(4*k), (pion ? cx : cy)*7.3, 27 + pion);
    const v = 128 + (profil - 0.45)*130 + (nier - 0.5)*36 + (skrot(X, Y, 28) - 0.5)*10;
    return [sz(v), sz(v - 3), sz(v - 9)];
  },
  /* beton: plamy w kilku skalach, ziarno i pory po pęcherzykach powietrza */
  beton: (X, Y, k) => {
    let v = 128 + (fbm(X/(35*k), Y/(35*k), 29, 4) - 0.5)*80 + (skrot(X, Y, 30) - 0.5)*24;
    const p = plamka(X, Y, 10*k, 0.3, 0.6*k, 2.2*k, 31);
    if(p) v = p.d < 0.8 ? v - 75*(1 - p.d*p.d) : v + 35;
    return [v, v, v];
  },
  /* folia holograficzna: tęczowe smugi interferencji ukosem, falujące,
     pastelowe; do miękkiego światła */
  holo: (X, Y, k) => {
    const h = fbm(X/(120*k), Y/(120*k), 32, 3)*1.4 + (X*0.6 + Y)/(90*k) + szumW(X/(14*k), Y/(14*k), 33)*0.12;
    const c = tecza(h);
    return c.map(x => 150 + (x - 128)*0.42);
  }
};
export const FAKTURY_TRYB = {
  papier: "mnoz", karton: "mnoz", pogniecony: "nakladka", milimetrowy: "mnoz", ksero: "mnoz", kurz: "mnoz",
  crt: "mnoz", lcd: "mnoz", vhs: "nakladka", grain: "nakladka", plotno: "nakladka", beton: "nakladka", holo: "miekkie"
};
/* dawne faktury (presety sprzed zmiany) → najbliższa nowa */
export const DAWNE_FAKTURY = {maskaRGB: "crt", rozeta: "crt", matryca: "lcd", skanlinie: "crt", kratka: "milimetrowy",
  szum: "grain", szumBarwny: "grain", tkanina: "plotno", romby: "plotno", tecza: "holo", walek: "ksero"};
const ANIMOWANE = new Set(["kurz", "vhs", "grain"]);
const PAMIEC_FAKTUR = new Map();

export function faktura(p, w, h, z){
  const id = DAWNE_FAKTURY[S.faktura] || S.faktura, wzor = FAKTURY[id], a = S.faktKrycie/100;
  if(!wzor || !(a > 0)) return;
  const k = Math.max(1, S.faktSkala | 0)/2, tryb = S.faktTryb, t = ANIMOWANE.has(id) ? (S.klatkaNr | 0) : 0;
  /* wzór raz na piksel siatki efektu (podglądu), potem blokami z×z; wzór nie
     zależy od obrazu, więc pamiętamy kilka ostatnich (pognieciony papier
     na 1400 px to pół sekundy, a efekt liczy się przy każdym renderze) */
  const Wp = Math.ceil(w/z), Hp = Math.ceil(h/z), klucz = [id, k, Wp, Hp, t].join();
  let wz = PAMIEC_FAKTUR.get(klucz);
  if(wz) PAMIEC_FAKTUR.delete(klucz);
  else {
    wz = new Uint8ClampedArray(Wp*Hp*3);
    for(let Y=0; Y<Hp; Y++) for(let X=0; X<Wp; X++){
      const c = wzor(X, Y, k, Wp, Hp, t), o = (Y*Wp + X)*3;
      wz[o] = c[0]; wz[o+1] = c[1]; wz[o+2] = c[2];
    }
    if(PAMIEC_FAKTUR.size >= 3) PAMIEC_FAKTUR.delete(PAMIEC_FAKTUR.keys().next().value);
  }
  PAMIEC_FAKTUR.set(klucz, wz);
  for(let y=0; y<h; y++){
    const Y = Math.floor(y/z);
    for(let x=0; x<w; x++){
      const s = (Y*Wp + Math.floor(x/z))*3, o = (y*w + x)*4;
      for(let kk=0; kk<3; kk++){
        const v = p[o+kk], c = wz[s+kk];
        let n;
        if(tryb === "ekran") n = 255 - (255 - v)*(255 - c)/255;
        else if(tryb === "nakladka") n = v < 128 ? 2*v*c/255 : 255 - 2*(255 - v)*(255 - c)/255;
        else if(tryb === "miekkie"){ const A = v/255, B = c/255; n = 255*(B < 0.5 ? A - (1 - 2*B)*A*(1 - A) : A + (2*B - 1)*((A <= 0.25 ? ((16*A - 12)*A + 4)*A : Math.sqrt(A)) - A)); }
        else n = v*c/255;
        p[o+kk] = v + a*(n - v);
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
