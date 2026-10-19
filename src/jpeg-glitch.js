/* Własny koder / dekoder JPEG (baseline, 4:2:0, standardowe tablice Huffmana)
   z miejscami do psucia — port core/jpeg.cpp z wtyczki VFX Glitch
   (AE Plugin Land/VfxGlitch). Dekoder zachowuje się jak libjpeg przy błędach:
   zły kod Huffmana = symbol 0, po znaczniku / końcu danych same zera, DC
   w 16 bitach z zawijaniem, zawijająca tablica range_limit po IDCT — stąd
   klasyczne zielone / turkusowe zalania i pasy.

   Arytmetyka jak w C++: wtyczka liczy DCT i kolory na float (32 bity), więc
   tu każde działanie przechodzi przez Math.fround. Bez tego pojedynczy
   współczynnik wyszedłby inaczej, strumień bitów by się przesunął i po
   uszkodzeniu bajtów obraz nie miałby nic wspólnego z wtyczką. Czysty JS,
   bez DOM-u — biega w workerze. */

const f = Math.fround;
/* std::lround: zaokrąglenie z połówką od zera */
const lround = x => x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

/* zygzak → indeks naturalny; 16 dodatkowych pozycji = 63, jak w libjpeg */
export const NATURAL = Int32Array.from([
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13,
  6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31,
  39, 46, 53, 60, 61, 54, 47, 55, 62, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63]);

/* tablice kwantyzacji z normy (Annex K.1), kolejność naturalna */
const STD_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const STD_CHROMA = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99,
  99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];

/* standardowe tablice Huffmana (Annex K.3) */
const DC_LUM_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_CHR_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const DC_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_LUM_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const AC_LUM_VALS = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14,
  0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09,
  0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a,
  0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65,
  0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88,
  0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9,
  0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca,
  0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea,
  0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];
const AC_CHR_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
const AC_CHR_VALS = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32,
  0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16,
  0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39,
  0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64,
  0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86,
  0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8,
  0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9,
  0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];

/* macierz DCT: c[u][x] = C(u)/2 · cos((2x+1)uπ/16), liczona w double i zapisana na float */
const C = new Float32Array(64);
for(let u=0; u<8; u++) for(let x=0; x<8; x++)
  C[u*8 + x] = (u === 0 ? Math.sqrt(0.5) : 1) * 0.5 * Math.cos((2*x + 1)*u*Math.PI/16);

/* F = c·f·cᵀ — najpierw wiersze, potem kolumny, sumy na float jak w C++ */
const T = new Float32Array(64);
function fdct(inp, out){
  for(let y=0; y<8; y++) for(let u=0; u<8; u++){
    let s = 0;
    for(let x=0; x<8; x++) s = f(s + f(C[u*8 + x]*inp[y*8 + x]));
    T[y*8 + u] = s;
  }
  for(let u=0; u<8; u++) for(let v=0; v<8; v++){
    let s = 0;
    for(let y=0; y<8; y++) s = f(s + f(C[v*8 + y]*T[y*8 + u]));
    out[v*8 + u] = s;
  }
}
function idct(inp, out){
  for(let v=0; v<8; v++) for(let x=0; x<8; x++){
    let s = 0;
    for(let u=0; u<8; u++) s = f(s + f(C[u*8 + x]*inp[v*8 + u]));
    T[v*8 + x] = s;
  }
  for(let x=0; x<8; x++) for(let y=0; y<8; y++){
    let s = 0;
    for(let v=0; v<8; v++) s = f(s + f(C[v*8 + y]*T[v*8 + x]));
    out[y*8 + x] = s;
  }
}

/* range_limit z libjpeg po IDCT (wartość wyśrodkowana, & 1023): do ±~400 zwykłe
   przycięcie, dalej zawija się — bardzo jasne → czarne, bardzo ciemne → białe */
function rangeLimit(v){
  const i = v & 1023;
  if(i < 128) return 128 + i;
  if(i < 512) return 255;
  if(i < 896) return 0;
  return i - 896;
}
const clamp8 = v => clamp(lround(v), 0, 255);

function scaleTable(base, quality){
  quality = clamp(quality, 1, 100);
  const s = quality < 50 ? Math.trunc(5000/quality) : 200 - quality*2;
  return Int32Array.from(base, b => clamp(Math.trunc((b*s + 50)/100), 1, 255));
}
function bitCount(v){
  v = v < 0 ? -v : v;
  let n = 0;
  while(v){ n++; v >>= 1; }
  return n;
}

/* ---------- koder ---------- */
function buildEnc(bits, vals){
  const code = new Uint16Array(256), size = new Uint8Array(256);
  let k = 0, c = 0;
  for(let l=1; l<=16; l++){
    for(let i=0; i<bits[l-1]; i++, k++, c++){ code[vals[k]] = c; size[vals[k]] = l; }
    c <<= 1;
  }
  return {code, size};
}
let ENC = null;
const tabliceKodera = () => ENC || (ENC = {dcL: buildEnc(DC_LUM_BITS, DC_VALS), acL: buildEnc(AC_LUM_BITS, AC_LUM_VALS),
  dcC: buildEnc(DC_CHR_BITS, DC_VALS), acC: buildEnc(AC_CHR_BITS, AC_CHR_VALS)});

/* bajty wyjścia w rosnącej tablicy (Uint8Array podwajana) */
class Bajty {
  constructor(n){ this.b = new Uint8Array(Math.max(1024, n)); this.n = 0; }
  push(v){ if(this.n === this.b.length){ const nb = new Uint8Array(this.b.length*2); nb.set(this.b); this.b = nb; } this.b[this.n++] = v; }
  dodaj(arr){ for(const v of arr) this.push(v); }
  wynik(){ return this.b.slice(0, this.n); }
}
class BitWriter {
  constructor(o){ this.o = o; this.acc = 0; this.n = 0; }
  put(code, size){
    if(size <= 0) return;
    this.acc = ((this.acc << size) | (code & ((1 << size) - 1))) >>> 0;
    this.n += size;
    while(this.n >= 8){
      const b = (this.acc >>> (this.n - 8)) & 255;
      this.o.push(b);
      if(b === 0xFF) this.o.push(0);      /* byte stuffing */
      this.n -= 8;
    }
    this.acc = this.n > 0 ? (this.acc & ((1 << this.n) - 1)) >>> 0 : 0;
  }
  flush(){ this.put(0x7F, (8 - this.n % 8) % 8); }   /* dopełnienie jedynkami */
}
function encodeBlock(bw, zz, off, last, idx, dc, ac){
  const diff = zz[off] - last[idx];
  last[idx] = zz[off];
  let nb = bitCount(diff);
  bw.put(dc.code[nb], dc.size[nb]);
  bw.put(diff < 0 ? diff - 1 : diff, nb);
  let run = 0;
  for(let k=1; k<64; k++){
    const v = zz[off + k];
    if(v === 0){ run++; continue; }
    while(run > 15){ bw.put(ac.code[0xF0], ac.size[0xF0]); run -= 16; }
    nb = bitCount(v);
    const sym = (run << 4) | nb;
    bw.put(ac.code[sym], ac.size[sym]);
    bw.put(v < 0 ? v - 1 : v, nb);
    run = 0;
  }
  if(run > 0) bw.put(ac.code[0x00], ac.size[0x00]);
}

/* rgb: w·h·3 bajtów (sRGB), quality 1..100 (skala IJG). Wynik: plik JFIF
   i miejsca do psucia: dane obrazu (scanStart..scanEnd, bez EOI) i początki
   tablic kwantyzacji (dqt[0] jasność, dqt[1] kolor). */
export function encode(rgb, w, h, quality){
  if(w <= 0 || h <= 0 || w > 65535 || h > 65535) return null;
  const W = Math.ceil(w/16)*16, H = Math.ceil(h/16)*16, mx = W/16, my = H/16;
  const ql = scaleTable(STD_LUMA, quality), qc = scaleTable(STD_CHROMA, quality);
  /* współczynniki po kwantyzacji, w zygzaku: na MCU 6 bloków (Y00, Y01, Y10, Y11, Cb, Cr) */
  const coefs = new Int16Array(mx*my*6*64);
  const ys = new Float32Array(256), cb = new Float32Array(256), cr = new Float32Array(256);
  const blk = new Float32Array(64), F = new Float32Array(64);
  const c299 = f(0.299), c587 = f(0.587), c114 = f(0.114);
  const cb1 = f(-0.168736), cb2 = f(0.331264), cr2 = f(0.418688), cr3 = f(0.081312);
  const quant = (q, out) => {
    fdct(blk, F);
    for(let k=0; k<64; k++){
      const n = NATURAL[k];
      out[k] = clamp(lround(f(F[n]/q[n])), -1023, 1023);
    }
  };
  for(let r=0; r<my; r++) for(let m=0; m<mx; m++){
    for(let y=0; y<16; y++){
      const sy = Math.min(r*16 + y, h - 1);
      for(let x=0; x<16; x++){
        const sx = Math.min(m*16 + x, w - 1), p = (sy*w + sx)*3;
        const R = rgb[p], G = rgb[p+1], B = rgb[p+2];
        ys[y*16 + x] = f(f(f(c299*R) + f(c587*G)) + f(c114*B));
        cb[y*16 + x] = f(f(f(f(cb1*R) - f(cb2*G)) + f(0.5*B)) + 128);
        cr[y*16 + x] = f(f(f(f(0.5*R) - f(cr2*G)) - f(cr3*B)) + 128);
      }
    }
    const baza = (r*mx + m)*6*64;
    for(let b=0; b<4; b++){
      const bx = (b & 1)*8, by = (b >> 1)*8;
      for(let y=0; y<8; y++) for(let x=0; x<8; x++) blk[y*8 + x] = f(ys[(by + y)*16 + bx + x] - 128);
      quant(ql, coefs.subarray(baza + b*64, baza + b*64 + 64));
    }
    for(let c=0; c<2; c++){
      const pl = c === 0 ? cb : cr;
      for(let y=0; y<8; y++) for(let x=0; x<8; x++){
        const s = (2*y)*16 + 2*x;
        blk[y*8 + x] = f(f(0.25*f(f(f(pl[s] + pl[s+1]) + pl[s+16]) + pl[s+17])) - 128);
      }
      quant(qc, coefs.subarray(baza + (4 + c)*64, baza + (5 + c)*64));
    }
  }

  const o = new Bajty(Math.trunc(W*H/2) + 1024);
  o.dodaj([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);  /* SOI + APP0 (JFIF) */
  o.dodaj([0xFF, 0xDB, 0, 2 + 2*65]);                                /* DQT: obie tablice w zygzaku */
  const dqt = [0, 0];
  for(let t=0; t<2; t++){
    o.push(t);
    dqt[t] = o.n;
    const q = t === 0 ? ql : qc;
    for(let k=0; k<64; k++) o.push(q[NATURAL[k]]);
  }
  o.dodaj([0xFF, 0xC0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);   /* SOF0 */
  const dhtLen = 2 + (17 + 12)*2 + (17 + 162)*2;
  o.dodaj([0xFF, 0xC4, dhtLen >> 8, dhtLen & 255]);
  for(const [cls, bits, vals] of [[0x00, DC_LUM_BITS, DC_VALS], [0x10, AC_LUM_BITS, AC_LUM_VALS], [0x01, DC_CHR_BITS, DC_VALS], [0x11, AC_CHR_BITS, AC_CHR_VALS]]){
    o.push(cls); o.dodaj(bits); o.dodaj(vals);
  }
  o.dodaj([0xFF, 0xDA, 0, 12, 3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);    /* SOS */
  const scanStart = o.n;
  const {dcL, acL, dcC, acC} = tabliceKodera();
  const bw = new BitWriter(o), last = [0, 0, 0];
  for(let m=0; m<mx*my; m++){
    const b = m*6*64;
    for(let k=0; k<4; k++) encodeBlock(bw, coefs, b + k*64, last, 0, dcL, acL);
    encodeBlock(bw, coefs, b + 4*64, last, 1, dcC, acC);
    encodeBlock(bw, coefs, b + 5*64, last, 2, dcC, acC);
  }
  bw.flush();
  const scanEnd = o.n;
  o.push(0xFF); o.push(0xD9);
  return {bytes: o.wynik(), scanStart, scanEnd, dqt};
}

/* ---------- dekoder ---------- */
function buildDec(bits, d, off, nvals){
  if(nvals > 256) return null;
  const t = {maxcode: new Int32Array(18), valptr: new Int32Array(17), mincode: new Int32Array(17),
    vals: new Uint8Array(256), lookLen: new Uint8Array(512), lookSym: new Uint8Array(512)};
  for(let i=0; i<nvals; i++) t.vals[i] = d[off + i];
  let p = 0, code = 0;
  for(let l=1; l<=16; l++){
    if(bits[l-1]){
      t.valptr[l] = p;
      t.mincode[l] = code;
      for(let i=0; i<bits[l-1]; i++, p++, code++)
        if(l <= 9){
          const first = code << (9 - l), cnt = 1 << (9 - l);
          for(let j=0; j<cnt && first + j < 512; j++){ t.lookLen[first + j] = l; t.lookSym[first + j] = t.vals[p]; }
        }
      t.maxcode[l] = code - 1;
    } else t.maxcode[l] = -1;
    code <<= 1;
  }
  t.maxcode[17] = 0x7fffffff;      /* wartownik jak w libjpeg */
  return t;
}
/* Czytnik bitów: po znaczniku albo końcu danych same zera (jak libjpeg).
   Okno 32 bity — ciąg bitów jest ten sam co w C++ (tam 64), zmienia się
   tylko, jak daleko naprzód czytamy bajty. */
class BitReader {
  constructor(d, pos, end){ this.d = d; this.pos = pos; this.end = end; this.buf = 0; this.cnt = 0; this.marker = false; }
  fill(){
    while(this.cnt <= 24){
      let b = 0;
      if(!this.marker && this.pos < this.end){
        b = this.d[this.pos++];
        if(b === 0xFF){
          if(this.pos < this.end && this.d[this.pos] === 0x00) this.pos++;
          else { this.marker = true; b = 0; }
        }
      }
      this.buf = (this.buf | (b << (24 - this.cnt))) >>> 0;
      this.cnt += 8;
    }
  }
  peek(n){ if(this.cnt < n) this.fill(); return this.buf >>> (32 - n); }
  skip(n){ this.buf = (this.buf << n) >>> 0; this.cnt -= n; }
  get(n){ if(n <= 0) return 0; const v = this.peek(n); this.skip(n); return v; }
}
function decodeSym(br, t){
  const look = br.peek(9), len = t.lookLen[look];
  if(len){ br.skip(len); return t.lookSym[look]; }
  let l = 1, code = br.get(1);
  while(code > t.maxcode[l]){ code = (code << 1) | br.get(1); l++; }
  if(l > 16) return 0;                 /* zły kod: libjpeg ostrzega i zwraca 0 */
  const idx = t.valptr[l] + code - t.mincode[l];
  return idx >= 0 && idx < 256 ? t.vals[idx] : 0;
}
const extend = (v, s) => v < (1 << (s - 1)) ? v - (1 << s) + 1 : v;
function decodeBlock(br, dc, ac, last, idx, blk, off){
  blk.fill(0, off, off + 64);
  const t = decodeSym(br, dc);
  let diff = 0;
  if(t){ const s = Math.min(t, 16); diff = extend(br.get(s), s); }
  last[idx] = (last[idx] + diff) | 0;  /* predyktor w int… */
  blk[off] = last[idx];                /* …a współczynnik w 16 bitach (Int16Array zawija) */
  for(let k=1; k<64; k++){
    const rs = decodeSym(br, ac), r = rs >> 4, s = rs & 15;
    if(s){
      k += r;
      blk[off + NATURAL[Math.min(k, 79)]] = extend(br.get(s), s);
    } else {
      if(r !== 15) break;
      k += 15;
    }
  }
}
/* blok współczynników → 8×8 próbek, z opcjami odczytu */
const FB = new Float32Array(64), FO = new Float32Array(64);
function reconstruct(coef, off, q, o, dst, d0, stride){
  for(let i=0; i<64; i++) FB[i] = o.dequantize ? coef[off + i]*q[i] : coef[off + i];
  if(o.dcScale) FB[0] = f(FB[0]*o.dcScaleValue);
  if(o.acScale) for(let i=1; i<64; i++) FB[i] = f(FB[i]*o.acScaleValue);
  if(!o.inverseDct){                   /* współczynniki wprost (×4, żeby faktura była widoczna) */
    for(let y=0; y<8; y++) for(let x=0; x<8; x++) dst[d0 + y*stride + x] = rangeLimit(lround(4*FB[y*8 + x]));
    return;
  }
  idct(FB, FO);
  for(let y=0; y<8; y++) for(let x=0; x<8; x++) dst[d0 + y*stride + x] = rangeLimit(lround(FO[y*8 + x]));
}

/* Odczyt pliku z encode() (także uszkodzonego) do rgbOut (w·h·3).
   false = plik nieczytelny (np. zepsuty nagłówek). Opcje: {dequantize,
   inverseDct, ycbcrToRgb, dcScale, dcScaleValue, acScale, acScaleValue}. */
export function decode(d, opt, w, h, rgbOut){
  const n = d.length;
  if(n < 4 || d[0] !== 0xFF || d[1] !== 0xD8) return false;
  const o = {dequantize: opt.dequantize !== false, inverseDct: opt.inverseDct !== false, ycbcrToRgb: opt.ycbcrToRgb !== false,
    dcScale: !!opt.dcScale, dcScaleValue: f(opt.dcScaleValue ?? 1), acScale: !!opt.acScale, acScaleValue: f(opt.acScaleValue ?? 1)};
  const qt = [0, 1, 2, 3].map(() => new Int32Array(64).fill(1));
  const dcT = [null, null, null, null], acT = [null, null, null, null];
  let fw = 0, fh = 0, ncomp = 0, scan = 0;
  const compId = [0, 0, 0], compHV = [0, 0, 0], compQ = [0, 0, 0], compDc = [0, 0, 0], compAc = [0, 0, 0];
  let pos = 2;
  while(pos + 4 <= n && !scan){
    if(d[pos] !== 0xFF){ pos++; continue; }
    const m = d[pos + 1];
    pos += 2;
    if(m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7) || m === 0xFF) continue;
    if(m === 0xD9) break;
    const len = (d[pos] << 8) | d[pos + 1];
    const seg = pos + 2, segEnd = Math.min(n, pos + len);
    if(len < 2) return false;
    let p = seg;
    if(m === 0xDB){
      while(p + 65 <= segEnd){
        const tq = d[p] & 3;
        if(d[p] >> 4) return false;    /* tylko 8-bitowe tablice */
        for(let k=0; k<64; k++) qt[tq][NATURAL[k]] = d[p + 1 + k];
        p += 65;
      }
    } else if(m === 0xC4){
      while(p + 17 <= segEnd){
        const tc = d[p] >> 4, th = d[p] & 3, bits = [];
        let cnt = 0;
        for(let i=0; i<16; i++){ bits.push(d[p + 1 + i]); cnt += d[p + 1 + i]; }
        if(p + 17 + cnt > segEnd) return false;
        const t = buildDec(bits, d, p + 17, cnt);
        if(!t) return false;
        if(tc) acT[th] = t; else dcT[th] = t;
        p += 17 + cnt;
      }
    } else if(m === 0xC0){
      if(segEnd - seg < 6) return false;
      fh = (d[seg + 1] << 8) | d[seg + 2];
      fw = (d[seg + 3] << 8) | d[seg + 4];
      ncomp = d[seg + 5];
      if(ncomp !== 3 || segEnd - seg < 6 + 9) return false;
      for(let c=0; c<3; c++){ compId[c] = d[seg + 6 + c*3]; compHV[c] = d[seg + 7 + c*3]; compQ[c] = d[seg + 8 + c*3] & 3; }
    } else if(m === 0xDA){
      if(d[seg] !== 3) return false;
      for(let i=0; i<3; i++){
        const id = d[seg + 1 + i*2], tdta = d[seg + 2 + i*2];
        for(let c=0; c<3; c++) if(compId[c] === id){ compDc[c] = (tdta >> 4) & 3; compAc[c] = tdta & 3; }
      }
      scan = segEnd;
    } else if(m >= 0xC1 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return false;   /* tylko baseline */
    pos = segEnd;
  }
  if(!scan || fw !== w || fh !== h || compHV[0] !== 0x22 || compHV[1] !== 0x11 || compHV[2] !== 0x11) return false;
  for(let c=0; c<3; c++) if(!dcT[compDc[c]] || !acT[compAc[c]]) return false;

  const W = Math.ceil(w/16)*16, H = Math.ceil(h/16)*16, mx = W/16, my = H/16;
  const coefs = new Int16Array(mx*my*6*64);
  const br = new BitReader(d, scan, n), last = [0, 0, 0];
  for(let m=0; m<mx*my; m++){
    const b = m*6*64;
    for(let k=0; k<4; k++) decodeBlock(br, dcT[compDc[0]], acT[compAc[0]], last, 0, coefs, b + k*64);
    decodeBlock(br, dcT[compDc[1]], acT[compAc[1]], last, 1, coefs, b + 4*64);
    decodeBlock(br, dcT[compDc[2]], acT[compAc[2]], last, 2, coefs, b + 5*64);
  }
  /* płaszczyzny: Y w pełnej rozdzielczości, Cb / Cr w połowie */
  const cw = W/2, chh = H/2;
  const Y = new Uint8Array(W*H), Cb = new Uint8Array(cw*chh), Cr = new Uint8Array(cw*chh);
  for(let r=0; r<my; r++) for(let m=0; m<mx; m++){
    const b = (r*mx + m)*6*64;
    for(let k=0; k<4; k++) reconstruct(coefs, b + k*64, qt[compQ[0]], o, Y, (r*16 + (k >> 1)*8)*W + m*16 + (k & 1)*8, W);
    reconstruct(coefs, b + 4*64, qt[compQ[1]], o, Cb, r*8*cw + m*8, cw);
    reconstruct(coefs, b + 5*64, qt[compQ[2]], o, Cr, r*8*cw + m*8, cw);
  }
  /* kolor: „fancy upsampling” 2×2 (wagi 9/3/3/1, jak libjpeg) i YCbCr → RGB z przycięciem */
  const k1 = f(1.402), k2 = f(0.344136), k3 = f(0.714136), k4 = f(1.772);
  for(let y=0; y<h; y++){
    const cy0 = y >> 1, cy1 = clamp((y & 1) ? cy0 + 1 : cy0 - 1, 0, chh - 1);
    for(let x=0, oo=y*w*3; x<w; x++, oo+=3){
      const cx0 = x >> 1, cx1 = clamp((x & 1) ? cx0 + 1 : cx0 - 1, 0, cw - 1);
      const a = cy0*cw + cx0, b = cy0*cw + cx1, c = cy1*cw + cx0, e = cy1*cw + cx1;
      const yy = Y[y*W + x];
      const cbv = (9*Cb[a] + 3*Cb[b] + 3*Cb[c] + Cb[e] + 8) >> 4, crv = (9*Cr[a] + 3*Cr[b] + 3*Cr[c] + Cr[e] + 8) >> 4;
      if(!o.ycbcrToRgb){ rgbOut[oo] = yy; rgbOut[oo+1] = cbv; rgbOut[oo+2] = crv; continue; }
      rgbOut[oo]   = clamp8(f(yy + f(k1*(crv - 128))));
      rgbOut[oo+1] = clamp8(f(f(yy - f(k2*(cbv - 128))) - f(k3*(crv - 128))));
      rgbOut[oo+2] = clamp8(f(yy + f(k4*(cbv - 128))));
    }
  }
  return true;
}
