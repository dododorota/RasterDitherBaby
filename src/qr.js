/* Koder kodów QR (ISO/IEC 18004): tryb bajtowy (UTF-8), wersje 1–40,
   poziomy korekcji L, M, Q, H, wybór maski regułami kar ze standardu.
   Czysty moduł, bez DOM-u — testowany w Node (testy/qr.mjs), wynik
   sprawdzony niezależnym dekoderem.

   Tabele bloków korekcji (ECC_NA_BLOK, BLOKI) to liczby ze standardu,
   przepisane z biblioteki QR Code generator Projektu Nayuki (MIT); reszta
   napisana według standardu.

   Zwraca {rozmiar, wersja, moduly, funkcyjne}: moduly[y][x] — czy moduł
   ciemny; funkcyjne[y][x] — czy to element stały (wzory szukania, linie
   taktujące, wzory wyrównania, informacja o formacie i wersji), a nie dane. */

const ECC_NA_BLOK = [
  [-1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],  // L
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],  // M
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],  // Q
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]   // H
];
const BLOKI = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4,  4,  4,  4,  4,  6,  6,  6,  6,  7,  8,  8,  9,  9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5,  5,  8,  9,  9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8,  8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
];
export const POZIOMY = ["L", "M", "Q", "H"];
const BITY_FORMATU = {L: 1, M: 0, Q: 3, H: 2};

/* moduły na dane (po odjęciu elementów stałych) */
function surowychModulow(v){
  let w = (16*v + 128)*v + 64;
  if(v >= 2){ const na = Math.floor(v/7) + 2; w -= (25*na - 10)*na - 55; if(v >= 7) w -= 36; }
  return w;
}
const slowDanych = (v, p) => Math.floor(surowychModulow(v)/8) - ECC_NA_BLOK[p][v]*BLOKI[p][v];

/* ---------- Reed–Solomon w GF(256), wielomian 0x11D ---------- */
function mnoz(x, y){
  let z = 0;
  for(let i=7; i>=0; i--){ z = (z << 1) ^ ((z >>> 7)*0x11D); z ^= ((y >>> i) & 1)*x; }
  return z & 0xFF;
}
function dzielnik(stopien){
  const w = new Array(stopien).fill(0); w[stopien - 1] = 1;
  let pierw = 1;
  for(let i=0; i<stopien; i++){
    for(let j=0; j<w.length; j++){ w[j] = mnoz(w[j], pierw); if(j + 1 < w.length) w[j] ^= w[j + 1]; }
    pierw = mnoz(pierw, 0x02);
  }
  return w;
}
function reszta(dane, dz){
  const w = new Array(dz.length).fill(0);
  for(const b of dane){
    const f = b ^ w.shift(); w.push(0);
    for(let i=0; i<dz.length; i++) w[i] ^= mnoz(dz[i], f);
  }
  return w;
}

/* położenia środków wzorów wyrównania */
function wyrownanie(v){
  if(v === 1) return [];
  const n = Math.floor(v/7) + 2, krok = v === 32 ? 26 : Math.ceil((v*4 + 4)/(n*2 - 2))*2, wyn = [6];
  for(let p = v*4 + 17 - 7; wyn.length < n; p -= krok) wyn.splice(1, 0, p);
  return wyn;
}

export function kodQR(tekst, poziom = "M", minWersja = 1){
  const p = POZIOMY.indexOf(poziom); if(p < 0) throw new Error("zły poziom korekcji");
  const bajty = [...new TextEncoder().encode(String(tekst))];
  /* najmniejsza wersja, w której dane się mieszczą */
  let v = Math.max(1, Math.min(40, minWersja | 0));
  for(;; v++){
    if(v > 40) throw new Error("za dużo tekstu na kod QR");
    const bitow = 4 + (v <= 9 ? 8 : 16) + bajty.length*8;
    if(bitow <= slowDanych(v, p)*8) break;
  }
  /* strumień bitów: tryb bajtowy, długość, dane, zakończenie, dopełnienie */
  const bity = [];
  const dopisz = (w, n) => { for(let i=n-1; i>=0; i--) bity.push((w >>> i) & 1); };
  dopisz(0b0100, 4); dopisz(bajty.length, v <= 9 ? 8 : 16);
  for(const b of bajty) dopisz(b, 8);
  const pojemnosc = slowDanych(v, p)*8;
  dopisz(0, Math.min(4, pojemnosc - bity.length));
  dopisz(0, (8 - bity.length % 8) % 8);
  for(let pad = 0xEC; bity.length < pojemnosc; pad ^= 0xEC ^ 0x11) dopisz(pad, 8);
  const slowa = [];
  for(let i=0; i<bity.length; i+=8){ let b = 0; for(let j=0; j<8; j++) b = (b << 1) | bity[i + j]; slowa.push(b); }
  /* bloki z korekcją, przeplecione */
  const nBlokow = BLOKI[p][v], eccDl = ECC_NA_BLOK[p][v], surowe = Math.floor(surowychModulow(v)/8);
  const krotkich = nBlokow - surowe % nBlokow, krotkiDl = Math.floor(surowe/nBlokow), dz = dzielnik(eccDl);
  const bloki = [];
  for(let i=0, k=0; i<nBlokow; i++){
    const dl = krotkiDl - eccDl + (i < krotkich ? 0 : 1), dane = slowa.slice(k, k + dl); k += dl;
    const blok = dane.concat(reszta(dane, dz));
    if(i < krotkich) blok.splice(dl, 0, -1);       /* krótki blok: puste miejsce na ostatnie słowo danych */
    bloki.push(blok);
  }
  const strumien = [];
  for(let i=0; i<bloki[0].length; i++) for(const b of bloki) if(b[i] !== -1) strumien.push(b[i]);

  /* macierz: elementy stałe */
  const N = v*4 + 17;
  const mod = Array.from({length: N}, () => new Array(N).fill(false)), fun = Array.from({length: N}, () => new Array(N).fill(false));
  const ustaw = (x, y, c) => { mod[y][x] = c; fun[y][x] = true; };
  for(let i=0; i<N; i++){ ustaw(6, i, i % 2 === 0); ustaw(i, 6, i % 2 === 0); }
  for(const [cx, cy] of [[3, 3], [N - 4, 3], [3, N - 4]])
    for(let dy=-4; dy<=4; dy++) for(let dx=-4; dx<=4; dx++){
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if(x >= 0 && x < N && y >= 0 && y < N) ustaw(x, y, d !== 2 && d !== 4);
    }
  const pw = wyrownanie(v), ost = pw.length - 1;
  for(let i=0; i<pw.length; i++) for(let j=0; j<pw.length; j++){
    if((i === 0 && j === 0) || (i === 0 && j === ost) || (i === ost && j === 0)) continue;
    for(let dy=-2; dy<=2; dy++) for(let dx=-2; dx<=2; dx++) ustaw(pw[i] + dx, pw[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const format = maska => {
    const dane = BITY_FORMATU[poziom] << 3 | maska;
    let r = dane; for(let i=0; i<10; i++) r = (r << 1) ^ ((r >>> 9)*0x537);
    const b = (dane << 10 | r) ^ 0x5412, bit = i => ((b >>> i) & 1) !== 0;
    for(let i=0; i<=5; i++) ustaw(8, i, bit(i));
    ustaw(8, 7, bit(6)); ustaw(8, 8, bit(7)); ustaw(7, 8, bit(8));
    for(let i=9; i<15; i++) ustaw(14 - i, 8, bit(i));
    for(let i=0; i<8; i++) ustaw(N - 1 - i, 8, bit(i));
    for(let i=8; i<15; i++) ustaw(8, N - 15 + i, bit(i));
    ustaw(8, N - 8, true);
  };
  format(0);                                       /* rezerwuje miejsca na format */
  if(v >= 7){
    let r = v; for(let i=0; i<12; i++) r = (r << 1) ^ ((r >>> 11)*0x1F25);
    const b = v << 12 | r;
    for(let i=0; i<18; i++){ const c = ((b >>> i) & 1) !== 0, a = N - 11 + i % 3, d = Math.floor(i/3); ustaw(a, d, c); ustaw(d, a, c); }
  }
  /* dane zygzakiem: pary kolumn od prawej, z pominięciem kolumny 6 */
  let i = 0;
  for(let prawa = N - 1; prawa >= 1; prawa -= 2){
    if(prawa === 6) prawa = 5;
    for(let pion=0; pion<N; pion++) for(let j=0; j<2; j++){
      const x = prawa - j, wGore = ((prawa + 1) & 2) === 0, y = wGore ? N - 1 - pion : pion;
      if(!fun[y][x] && i < strumien.length*8){ mod[y][x] = ((strumien[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
    }
  }
  /* maska: z ośmiu ta o najmniejszej karze */
  const WARUNKI = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x/3) + Math.floor(y/2)) % 2 === 0, (x, y) => x*y % 2 + x*y % 3 === 0,
    (x, y) => (x*y % 2 + x*y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x*y % 3) % 2 === 0
  ];
  const nalozMaske = m => { for(let y=0; y<N; y++) for(let x=0; x<N; x++) if(!fun[y][x] && WARUNKI[m](x, y)) mod[y][x] = !mod[y][x]; };
  let najlepsza = 0, najmniej = Infinity;
  for(let m=0; m<8; m++){
    nalozMaske(m); format(m);
    const k = kara(mod, N);
    if(k < najmniej){ najmniej = k; najlepsza = m; }
    nalozMaske(m);                                  /* maska jest odwracalna */
  }
  nalozMaske(najlepsza); format(najlepsza);
  return {rozmiar: N, wersja: v, maska: najlepsza, moduly: mod, funkcyjne: fun};
}

/* kara maski (reguły N1–N4 standardu) */
function kara(m, N){
  let k = 0;
  const wzor = [true, false, true, true, true, false, true];
  for(const poziomo of [true, false]){
    for(let a=0; a<N; a++){
      let bieg = 1;
      const c = b => poziomo ? m[a][b] : m[b][a];
      for(let b=1; b<=N; b++){
        if(b < N && c(b) === c(b - 1)) bieg++;
        else { if(bieg >= 5) k += 3 + bieg - 5; bieg = 1; }
      }
      /* N3: wzór 1:1:3:1:1 z czterema jasnymi z boku */
      for(let b=0; b + 7 <= N; b++){
        if(!wzor.every((w, i) => c(b + i) === w)) continue;
        const przed = b >= 4 && [1, 2, 3, 4].every(i => !c(b - i)), po = b + 11 <= N && [7, 8, 9, 10].every(i => !c(b + i));
        if(przed || po) k += 40;
      }
    }
  }
  for(let y=0; y<N - 1; y++) for(let x=0; x<N - 1; x++){
    const c = m[y][x];
    if(c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) k += 3;
  }
  let ciemnych = 0; for(const w of m) for(const c of w) if(c) ciemnych++;
  k += Math.floor(Math.abs(ciemnych*20 - N*N*10)/(N*N))*10;
  return k;
}
