/* Tryb „Glitch” — port rdzenia wtyczki VFX Glitch (AE Plugin Land/VfxGlitch,
   core/glitch.cpp). Trzy części, liczone w tej kolejności:
   1. JPEG Glitch: obraz zapisany jako prawdziwy JPEG (jpeg-glitch.js), plik
      psuty (bajty danych, tablice kwantyzacji), odczyt z pominiętymi etapami.
   2. Filtry jak Glitch Vandalizer: Glitch Map, Datamosh, Melt Map, Slices,
      Bad TV, Tiles, Drips, Liquid.
   3. Jak Glitch Control: Displacement, Stretch, Mirror, RGB, Color Cycle.

   Obraz roboczy jak we wtyczce: Float32 RGBA premultiplied 0..1, wejście
   i wyjście przeliczane tak jak w jej CLI (8 bit → /255, wynik × 255
   z zaokrągleniem), więc na tym samym obrazie wynik zgadza się z wtyczką.
   Działania na float przez Math.fround tam, gdzie od nich zależy, który
   piksel się weźmie. Losowość tylko z haszu (bez stanu): te same ustawienia
   = ten sam glitch; animacja dokłada krok = klatka / N do ziaren.
   Długości w pikselach obrazu; `skala` = piksele bufora na piksel obrazu
   (1/pikselizacja). Bez DOM-u — biega w workerze. */
import { encode, decode } from "./jpeg-glitch.js";

const f = Math.fround;
const lround = x => x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

/* ---------- losowość bez stanu (uint32 jak w C++) ---------- */
function hash32(x){
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
const hash2 = (a, b) => hash32((Math.imul(a >>> 0, 0x9E3779B1) ^ hash32(((b >>> 0) + 0x7F4A7C15) >>> 0)) >>> 0);
const u01 = h => (h >>> 8)*(1/16777216);
class Rng {
  constructor(seed){ this.s = hash32((seed ^ 0xA5A5A5A5) >>> 0); }
  next(){ this.s = (this.s + 0x9E3779B9) >>> 0; return hash32(this.s); }
  f(){ return u01(this.next()); }
  sf(){ return f(this.f()*2 - 1); }
  i(n){ return n > 0 ? this.next() % n : 0; }
}
/* ziarno wariantu: numer (mapy / ziarna z panelu) + krok animacji */
const variant = (number, step, salt) => hash2((Math.imul(number, 7919) + Math.imul(step, 104729)) >>> 0, salt);

/* szum wartości 1D (gładki), 0..1 */
function vnoise(t, seed){
  const fl = Math.floor(t), i = fl, fr = f(t - fl), s = f(f(fr*fr)*f(3 - f(2*fr)));
  const a = u01(hash2(seed, i >>> 0)), b = u01(hash2(seed, (i + 1) >>> 0));
  return f(a + f(f(b - a)*s));
}
const c299 = f(0.299), c587 = f(0.587), c114 = f(0.114);
const lumaOf = (p, o) => f(f(f(c299*p[o]) + f(c587*p[o+1])) + f(c114*p[o+2]));

/* ---------- obraz roboczy ---------- */
/* bajty RGBA (alfa prosta, jak z canvasu) → float premultiplied, jak wczytuje CLI wtyczki */
export function doFloat(p, w, h){
  const img = {w, h, px: new Float32Array(w*h*4)};
  for(let i=0; i<w*h*4; i+=4){
    const a = f(p[i+3]*257/65535);
    for(let c=0; c<3; c++) img.px[i+c] = f(f(p[i+c]*257/65535)*a);
    img.px[i+3] = a;
  }
  return img;
}
/* i z powrotem, jak zapisuje CLI (z przycięciem do alfy) */
export function doBajtow(img, p){
  const px = img.px;
  for(let i=0; i<img.w*img.h*4; i+=4){
    const a = clamp(px[i+3], 0, 1);
    for(let c=0; c<3; c++){
      const v = a > 0 ? f(clamp(px[i+c], 0, a)/a) : 0;
      p[i+c] = lround(f(v*255));
    }
    p[i+3] = lround(f(a*255));
  }
}

/* Każdy piksel wyjścia bierze najbliższy piksel źródła ze współrzędnych
   fn(x, y) (brzeg przedłużony) — glitche mają ostre krawędzie. fn dostaje
   [sx, sy] i je zmienia. */
function remap(img, fn){
  const src = img.px.slice(), px = img.px, w = img.w, h = img.h, xy = [0, 0];
  for(let y=0; y<h; y++) for(let x=0; x<w; x++){
    xy[0] = x; xy[1] = y;
    fn(x, y, xy);
    const ix = clamp(Math.floor(f(xy[0] + 0.5)), 0, w - 1), iy = clamp(Math.floor(f(xy[1] + 0.5)), 0, h - 1);
    const s = (iy*w + ix)*4, o = (y*w + x)*4;
    px[o] = src[s]; px[o+1] = src[s+1]; px[o+2] = src[s+2]; px[o+3] = src[s+3];
  }
}
/* próbka dwuliniowa z przedłużeniem brzegu; środek piksela i w i + 0,5 */
function sampleBilinear(src, w, h, x, y, out, o){
  x = clamp(f(x - 0.5), 0, w - 1);
  y = clamp(f(y - 0.5), 0, h - 1);
  const x0 = Math.min(Math.trunc(x), w - 1), y0 = Math.min(Math.trunc(y), h - 1);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const tx = f(x - x0), ty = f(y - y0);
  const a = (y0*w + x0)*4, b = (y0*w + x1)*4, c = (y1*w + x0)*4, d = (y1*w + x1)*4;
  for(let k=0; k<4; k++){
    const top = f(src[a+k] + f(f(src[b+k] - src[a+k])*tx)), bot = f(src[c+k] + f(f(src[d+k] - src[c+k])*tx));
    out[o+k] = f(top + f(f(bot - top)*ty));
  }
}
/* jak remap, ale dwuliniowo — dla gładkich zniekształceń (Liquid) */
function remapSmooth(img, fn){
  const src = img.px.slice(), w = img.w, h = img.h, xy = [0, 0];
  for(let y=0; y<h; y++) for(let x=0; x<w; x++){
    xy[0] = x; xy[1] = y;
    fn(x, y, xy);
    sampleBilinear(src, w, h, f(xy[0] + 0.5), f(xy[1] + 0.5), img.px, (y*w + x)*4);
  }
}
/* szum wartości 2D (gładki) i suma oktaw */
function vnoise2(x, y, seed){
  const fx = Math.floor(x), fy = Math.floor(y), ix = fx, iy = fy;
  let tx = f(x - fx), ty = f(y - fy);
  tx = f(f(tx*tx)*f(3 - f(2*tx)));
  ty = f(f(ty*ty)*f(3 - f(2*ty)));
  const hh = (i, j) => u01(hash2(seed, (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0));
  const a = hh(ix, iy), b = hh(ix + 1, iy), c = hh(ix, iy + 1), d = hh(ix + 1, iy + 1);
  const ab = f(a + f(f(b - a)*tx)), cd = f(c + f(f(d - c)*tx));
  return f(ab + f(f(cd - ab)*ty));
}
function fbm2(x, y, seed, octaves){
  let s = 0, amp = 0.5, norm = 0;
  for(let o=0; o<octaves; o++){
    s = f(s + f(amp*vnoise2(x, y, (seed + Math.imul(o, 1013)) >>> 0)));
    norm = f(norm + amp);
    x = f(x*f(2.03)); y = f(y*f(2.03));
    amp = f(amp*0.5);
  }
  return f(s/norm);
}
/* siatka 1-kanałowa z odczytem dwuliniowym (Datamosh) */
function siatka(w, h){
  const v = new Float32Array(w*h);
  const at = (x, y) => v[clamp(y, 0, h - 1)*w + clamp(x, 0, w - 1)];
  return {w, h, v, at, sample(x, y){
    x = f(x - 0.5); y = f(y - 0.5);
    const fx = Math.floor(x), fy = Math.floor(y), tx = f(x - fx), ty = f(y - fy);
    const a = at(fx, fy), b = at(fx + 1, fy), c = at(fx, fy + 1), d = at(fx + 1, fy + 1);
    const ab = f(a + f(f(b - a)*tx)), cd = f(c + f(f(d - c)*tx));
    return f(ab + f(f(cd - ab)*ty));
  }};
}

/* ---------- 1. JPEG Glitch ---------- */
function corrupt(e, p, step){
  const b = e.bytes;
  /* tablice kwantyzacji w pliku: najpierw losowe pozycje, potem pojedyncza podmiana (QTC / QTL) */
  const table = (g, off, salt) => {
    if(g.breakingBytes > 0){
      const r = new Rng(variant(g.seed, step, salt)), maxV = clamp(g.maxRandom, 0, 255);
      for(let i=0; i<Math.min(g.breakingBytes, 4096); i++){
        const u = r.f(), pos = Math.min(63, Math.trunc(f(f(u*u)*64)));   /* częściej niskie pozycje */
        b[off + pos] = r.i(maxV + 1);
      }
    }
    if(g.single) b[off + clamp(g.position, 0, 63)] = clamp(g.value, 0, 255);
  };
  table(p.luma, e.dqt[0], 11);
  table(p.chroma, e.dqt[1], 23);
  /* bajty danych obrazu w zakresie start..end (% długości); nigdy bajt po 0xFF —
     nie powstaje znacznik, plik zawsze da się odczytać do końca */
  const len = e.scanEnd - e.scanStart;
  if(p.brokenBytes <= 0 || len < 4) return;
  const a = clamp(Math.min(p.glitchStart, p.glitchEnd), 0, 100)/100, z = clamp(Math.max(p.glitchStart, p.glitchEnd), 0, 100)/100;
  const r = new Rng(variant(p.bytesSeed, step, 37));
  for(let i=0; i<Math.min(p.brokenBytes, 1000000); i++){
    let pos = e.scanStart + Math.min(len - 1, Math.trunc((a + (z - a)*r.f())*len));
    const v = r.i(255);
    if(pos > e.scanStart && b[pos - 1] === 0xFF){
      if(pos + 1 >= e.scanEnd) continue;
      pos++;
    }
    b[pos] = v;
  }
}
function jpegStage(img, p, step){
  const {w, h, px} = img;
  if(w > 65535 || h > 65535) return;
  const rgb = new Uint8Array(w*h*3);
  for(let i=0, j=0; i<w*h*4; i+=4, j+=3){
    const a = px[i+3];
    for(let c=0; c<3; c++){ const v = a > 1e-6 ? f(px[i+c]/a) : 0; rgb[j+c] = clamp(lround(f(v*255)), 0, 255); }
  }
  const e = encode(rgb, w, h, lround(p.quality));
  if(!e) return;
  corrupt(e, p, step);
  if(!decode(e.bytes, {dequantize: p.dequantize, inverseDct: p.inverseDct, ycbcrToRgb: p.ycbcrToRgb,
    dcScale: p.filter1, dcScaleValue: p.filter1Value, acScale: p.filter2, acScaleValue: p.filter2Value}, w, h, rgb)) return;
  /* kolor z JPEG-a, alfa bez zmian (JPEG jej nie ma) */
  for(let i=0, j=0; i<w*h*4; i+=4, j+=3){
    const k = f(px[i+3]/255);
    px[i] = f(rgb[j]*k); px[i+1] = f(rgb[j+1]*k); px[i+2] = f(rgb[j+2]*k);
  }
}

/* ---------- 2. Glitches ---------- */
/* Glitch Map: poziome pasy przesuwające obraz o ± offset, brzegi pasów
   rozsypane w kwadraty; numer mapy wybiera charakter */
function glitchMapFilter(img, m, step, skala){
  const {w, h} = img, map = new Float32Array(w*h);
  const shape = new Rng(hash2(m.map, 101));
  const bars = 6 + shape.i(28);
  const hMin = f(h*f(f(0.004) + f(f(0.012)*shape.f()))), hMax = f(h*f(f(0.03) + f(f(0.14)*shape.f())));
  const fullProb = f(f(0.6)*shape.f()), dissolve = f(f(0.2) + f(f(0.8)*shape.f()));
  const oneSign = shape.f() < f(0.3);
  const cell = Math.max(2, lround(f(h/140)));
  const r = new Rng(variant(m.map, step, 202));
  for(let b=0; b<bars; b++){
    const bh = f(hMin + f(f(f(hMax - hMin)*r.f())*r.f()));
    const y0 = Math.trunc(f(r.f()*h)), y1 = Math.min(h, y0 + Math.max(1, Math.trunc(bh)));
    let x0 = 0, x1 = w;
    if(r.f() >= fullProb){
      x0 = Math.trunc(f(f(r.f()*w)*f(0.8)));
      x1 = Math.min(w, x0 + Math.max(cell, Math.trunc(f(w*f(f(0.1) + f(f(0.6)*r.f()))))));
    }
    let v = oneSign ? f(f(0.3) + f(f(0.7)*r.f())) : r.sf();
    if(Math.abs(v) < f(0.2)) v = v < 0 ? f(-0.2) : f(0.2);
    const bs = r.next();
    const ext = Math.max(cell, Math.trunc(f(f(dissolve*f(0.12))*w)));
    for(let cy=y0; cy<y1; cy+=cell)
      for(let cx=Math.max(0, x0 - ext); cx<Math.min(w, x1 + ext); cx+=cell){
        /* prawdopodobieństwo komórki: 1 w środku pasa, maleje przy końcach, poza pasem pojedyncze kwadraty */
        const c = cx + (cell >> 1);
        let pr;
        if(c < x0 || c >= x1){
          const d = f((c < x0 ? x0 - c : c - x1 + 1)/ext);
          pr = (x0 === 0 && c < x0) || (x1 === w && c >= x1) ? 0 : f(f(f(0.45)*dissolve)*f(1 - d));
        } else {
          const d = f(Math.min(c - x0, x1 - 1 - c)/ext);
          pr = d >= 1 || (x0 === 0 && x1 === w) ? 1 : f(1 - f(f(f(0.7)*dissolve)*f(1 - d)));
        }
        if(u01(hash2(bs, (Math.imul(cy, 65599) + cx) >>> 0)) >= pr) continue;
        for(let y=cy; y<Math.min(y1, cy + cell); y++) for(let x=cx; x<Math.min(w, cx + cell); x++) map[y*w + x] = v;
      }
  }
  const ox = f(m.offsetX*skala), oy = f(m.offsetY*skala);
  remap(img, (x, y, s) => { const v = map[y*w + x]; s[0] = f(s[0] - f(v*ox)); s[1] = f(s[1] - f(v*oy)); });
}

/* Datamosh: bloki przejmują obraz spod przesunięcia, gdy tamten jest wyraźnie
   ciemniejszy — ciemne kształty przeciekają spójną plamą (jasność wygładzona,
   siatka ~1/90 wysokości + rozmycie 3×3) */
function datamoshFilter(img, ox, oy, block, step){
  const {w, h, px} = img;
  const b = Math.max(2, lround(block)), bw = Math.ceil(w/b), bh = Math.ceil(h/b);
  const g = Math.max(2, lround(f(h/90))), gw = Math.ceil(w/g), gh = Math.ceil(h/g);
  const lum = siatka(gw, gh), smooth = siatka(gw, gh), krok = Math.max(1, g >> 2);
  for(let gy=0; gy<gh; gy++) for(let gx=0; gx<gw; gx++){
    let s = 0, n = 0;
    for(let y=gy*g; y<Math.min(h, gy*g + g); y+=krok)
      for(let x=gx*g; x<Math.min(w, gx*g + g); x+=krok, n++){
        const o = (y*w + x)*4;
        s = f(s + f(lumaOf(px, o) + f(f(1 - px[o+3])*0.5)));   /* przezroczyste jak jasne tło */
      }
    lum.v[gy*gw + gx] = f(s/Math.max(1, n));
  }
  for(let gy=0; gy<gh; gy++) for(let gx=0; gx<gw; gx++){
    let s = 0;
    for(let j=-1; j<=1; j++) for(let i=-1; i<=1; i++) s = f(s + lum.at(gx + i, gy + j));
    smooth.v[gy*gw + gx] = f(s/9);
  }
  const mosh = new Uint8Array(bw*bh);
  for(let by=0; by<bh; by++) for(let bx=0; bx<bw; bx++){
    const cx = f(f(bx + 0.5)*b), cy = f(f(by + 0.5)*b);
    const here = smooth.sample(f(cx/g), f(cy/g)), there = smooth.sample(f(f(cx - ox)/g), f(f(cy - oy)/g));
    const rnd = u01(hash2(variant(bx, step, 808), by));
    /* pojedyncze dziury tylko przy większych blokach */
    mosh[by*bw + bx] = there < f(here - f(0.06)) && (b < 8 || rnd < f(0.95)) ? 1 : 0;
  }
  remap(img, (x, y, s) => {
    if(mosh[Math.trunc(y/b)*bw + Math.trunc(x/b)]){ s[0] = f(s[0] - ox); s[1] = f(s[1] - oy); }
  });
}

/* profil 0..1 dla Melt Map (10 rodzin), t = pozycja 0..1 w poprzek kadru */
function meltProfile(family, t, seed){
  switch(family){
    case 0: return vnoise(f(t*3), seed);
    case 1: return vnoise(f(t*8), seed);
    case 2: return vnoise(f(t*22), seed);
    case 3: return u01(hash2(seed, Math.floor(f(t*12)) >>> 0));          /* schodki */
    case 4: {                                                            /* krople */
      let m = 0;
      const r = new Rng(seed);
      for(let i=0; i<16; i++){
        const c = r.f(), wd = f(f(0.004) + f(f(0.02)*r.f())), amp = f(f(0.4) + f(f(0.6)*r.f()));
        const d = f(f(t - c)/wd);
        m = Math.max(m, f(amp*f(Math.exp(f(-d*d)))));
      }
      return m;
    }
    case 5: return f(0.5 + f(0.5*f(Math.sin(f(f(6.2831853)*f(f(t*4) + u01(seed)))))));
    case 6: { const v = f(f(t*6) + u01(seed)); return f(v - Math.floor(v)); }    /* piła */
    case 7: return vnoise(f(t*70), seed);                                 /* drobne smugi */
    case 8: return f(f(f(0.6)*vnoise(f(t*3), seed)) + f(f(0.4)*u01(hash2((seed ^ 77) >>> 0, Math.floor(f(t*30)) >>> 0))));
    default: { const d = f(f(t - f(f(0.2) + f(f(0.6)*u01(seed))))/f(0.18)); return f(Math.exp(f(-d*d))); }   /* jedna duża fala */
  }
}
/* Melt Map: kolumny (Offset Y) i wiersze (Offset X) rozciągane w różnym
   stopniu — obraz spływa; górna / lewa krawędź zostaje na miejscu */
function meltFilter(img, m, step, skala){
  const {w, h} = img, family = Math.max(1, m.map) % 10;
  const col = new Float32Array(w), row = new Float32Array(h);
  const s1 = variant(m.map, step, 303), s2 = variant(m.map, step, 304);
  for(let x=0; x<w; x++){ const t = f(f(x + 0.5)/w); col[x] = f(f(f(0.7)*meltProfile(family, t, s1)) + f(f(0.3)*vnoise(f(t*90), (s1 ^ 0x3333) >>> 0))); }
  for(let y=0; y<h; y++){ const t = f(f(y + 0.5)/h); row[y] = f(f(f(0.7)*meltProfile(family, t, s2)) + f(f(0.3)*vnoise(f(t*90), (s2 ^ 0x3333) >>> 0))); }
  const ox = f(m.offsetX*skala), oy = f(m.offsetY*skala);
  remap(img, (x, y, s) => {
    s[0] = f(s[0] - f(f(ox*row[y])*f(x/w)));
    s[1] = f(s[1] - f(f(oy*col[x])*f(y/h)));
  });
}
/* podział na paski o losowej grubości; część przesunięta (−1..1) */
function randomBands(n, r, minFrac, maxFrac, active){
  const v = new Float32Array(n);
  for(let i=0; i<n;){
    const len = Math.max(1, Math.trunc(f(n*f(minFrac + f(f(f(maxFrac - minFrac)*r.f())*r.f())))));
    const s = r.f() < active ? r.sf() : 0;
    for(let k=i; k<Math.min(n, i + len); k++) v[k] = s;
    i += len;
  }
  return v;
}
/* Slices: poziome paski w bok (Offset X), pionowe w pionie (Offset Y) */
function slicesFilter(img, m, step, skala){
  const {w, h} = img, shape = new Rng(hash2(m.map, 401));
  const minF = f(f(0.003) + f(f(0.01)*shape.f())), maxF = f(f(0.02) + f(f(0.08)*shape.f())), active = f(f(0.35) + f(f(0.5)*shape.f()));
  const r = new Rng(variant(m.map, step, 402));
  const rows = randomBands(h, r, minF, maxF, active), cols = randomBands(w, r, minF, maxF, active);
  const ox = f(m.offsetX*skala), oy = f(m.offsetY*skala);
  remap(img, (x, y, s) => {
    s[0] = f(s[0] - f(ox*rows[y]));
    const cx = clamp(Math.floor(f(s[0] + 0.5)), 0, w - 1);
    s[1] = f(s[1] - f(oy*cols[cx]));
  });
}
/* Bad TV: wiersze wyginane zygzakiem (Offset X), kolumny falują (Offset Y), fala w części kadru */
function badTvFilter(img, m, step, skala){
  const {w, h} = img, shape = new Rng(hash2(m.map, 501));
  const sh1 = shape.f(), sh2 = shape.f();
  const freq = f(3 + f(f(40*sh1)*sh2)), envFreq = f(f(1.5) + f(5*shape.f()));
  const triangle = shape.f() < f(0.6);
  const s = variant(m.map, step, 502), phase = u01(hash2(s, 1));
  const wave = t => {
    const v = f(f(t*freq) + phase);
    if(triangle) return f(f(4*Math.abs(f(f(v - Math.floor(v)) - 0.5))) - 1);
    return f(Math.sin(f(f(6.2831853)*v)));
  };
  const env = (t, seed) => clamp(f(f(vnoise(f(t*envFreq), seed)*f(1.6)) - f(0.2)), 0, 1);
  const rowDx = new Float32Array(h), colDy = new Float32Array(w);
  const ox = f(m.offsetX*skala), oy = f(m.offsetY*skala);
  for(let y=0; y<h; y++){ const t = f(f(y + 0.5)/h); rowDx[y] = f(f(ox*env(t, (s ^ 0x1111) >>> 0))*wave(t)); }
  for(let x=0; x<w; x++){ const t = f(f(x + 0.5)/w); colDy[x] = f(f(oy*env(t, (s ^ 0x2222) >>> 0))*wave(f(f(t*f(1.37)) + f(0.21)))); }
  remap(img, (x, y, sxy) => { sxy[0] = f(sxy[0] - rowDx[y]); sxy[1] = f(sxy[1] - colDy[x]); });
}
/* Tiles: kilka dużych prostokątów z obrazem przesuniętym o wielokrotność offsetu */
function tilesFilter(img, m, step, skala){
  const {w, h} = img, shape = new Rng(hash2(m.map, 601)), n = 1 + shape.i(5);
  const r = new Rng(variant(m.map, step, 602)), tiles = [];
  for(let i=0; i<n; i++){
    const tw = Math.trunc(f(w*f(f(0.2) + f(f(0.5)*r.f())))), th = Math.trunc(f(h*f(f(0.15) + f(f(0.5)*r.f()))));
    const x0 = Math.trunc(f(r.f()*(w - tw))), y0 = Math.trunc(f(r.f()*(h - th)));
    /* w C++ oba losowania są w jednym wyrażeniu (kolejność nieokreślona) — MSVC
       bierze najpierw znak, potem wielkość; tak samo tu, inaczej kafle w innych miejscach */
    const znak = r.f() < f(0.25) ? -1 : 1, m1 = f(0.5 + r.f());
    tiles.push({x0, y0, x1: x0 + tw, y1: y0 + th, mul: f(m1*znak)});
  }
  const ox = f(m.offsetX*skala), oy = f(m.offsetY*skala);
  remap(img, (x, y, s) => {
    for(let i=tiles.length - 1; i>=0; i--){
      const t = tiles[i];
      if(x >= t.x0 && x < t.x1 && y >= t.y0 && y < t.y1){ s[0] = f(s[0] - f(ox*t.mul)); s[1] = f(s[1] - f(oy*t.mul)); return; }
    }
  });
}
/* Drips: grupy kolumn od losowej wysokości powtarzają piksel startowy w dół
   (ujemna długość — w górę); środkowa kolumna grupy najdłuższa → zaostrzone krople */
function dripsFilter(img, amount, length, map, step, skala){
  const {w, h} = img, L = f(length*skala);
  if(L === 0 || amount <= 0) return;
  const shape = new Rng(hash2(map, 901));
  const maxW = f(4 + f(10*shape.f()));
  const center = f(f(0.15) + f(f(0.5)*shape.f())), spread = f(f(0.15) + f(f(0.45)*shape.f()));
  const r = new Rng(variant(map, step, 902));
  const start = new Float32Array(w).fill(-1), len = new Float32Array(w);
  for(let x=0; x<w;){
    const gw = Math.max(1, lround(f(f(1 + f(f(maxW - 1)*r.f()))*skala)));
    const on = f(r.f()*100) < amount;
    const ys = f(clamp(f(center + f(spread*r.sf())), 0, 1)*h);
    const r1 = r.f(), r2 = r.f();
    const gl = f(Math.abs(L)*f(f(0.15) + f(f(f(0.85)*r1)*r2)));
    for(let k=x; k<Math.min(w, x + gw); k++){
      const edge = gw > 1 ? f(Math.abs(f((k - x) - f(0.5*(gw - 1))))/f(0.5*gw)) : 0;
      const cl = f(f(gl*f(1 - f(f(0.6)*edge)))*f(f(0.85) + f(f(0.15)*r.f())));
      if(on){ start[k] = ys; len[k] = cl; }
    }
    x += gw;
  }
  const up = L < 0;
  remap(img, (x, y, s) => {
    const st = start[x];
    if(st < 0) return;
    const d = up ? f(st - y) : f(y - st);
    if(d > 0 && d < len[x]) s[1] = st;
  });
}
/* Liquid: gładkie przesunięcie z szumu z zawirowaniem (domain warp) */
function liquidFilter(img, amount, featurePx, map, step, skala){
  const A = f(amount*skala), Sk = Math.max(4, f(featurePx*skala));
  if(A === 0) return;
  const shape = new Rng(hash2(map, 1001)), octaves = 2 + shape.i(3), warp = f(f(0.5) + f(f(2.5)*shape.f()));
  const s = variant(map, step, 1002);
  remapSmooth(img, (x, y, xy) => {
    const u = f(x/Sk), v = f(y/Sk);
    const qx = f(fbm2(u, v, s, octaves) - 0.5), qy = f(fbm2(f(u + f(5.2)), f(v + f(1.3)), (s ^ 0x55) >>> 0, octaves) - 0.5);
    const wx = f(u + f(warp*qx)), wy = f(v + f(warp*qy));
    const dx = f(fbm2(wx, wy, (s ^ 0xAA) >>> 0, octaves) - 0.5);
    const dy = f(fbm2(f(wx + f(3.1)), f(wy + f(7.7)), (s ^ 0xBB) >>> 0, octaves) - 0.5);
    xy[0] = f(xy[0] + f(f(2*A)*dx));
    xy[1] = f(xy[1] + f(f(2*A)*dy));
  });
}

/* ---------- 3. Glitch Control ---------- */
/* Displacement: róg od punktu zostaje na wierzchu, pod nim N kopii
   przesuniętych schodkowo o (−X, +Y) — ukośna smuga */
function displacementFilter(img, px, py, copies, sx, sy){
  if(copies < 1 || (sx === 0 && sy === 0)) return;
  remap(img, (x, y, s) => {
    const cx = f(x + 0.5), cy = f(y + 0.5);
    const kx = sx !== 0 ? Math.max(0, Math.ceil(f(f(px - cx)/sx))) : 0;
    const ky = sy !== 0 ? Math.max(0, Math.ceil(f(f(cy - py)/sy))) : 0;
    const k = Math.max(kx, ky);
    if(k < 1 || k > copies) return;
    s[0] = f(s[0] + f(k*sx)); s[1] = f(s[1] - f(k*sy));
  });
}
/* Stretch: od linii w prawo (w dół) — albo w drugą stronę — powtarzana jedna kolumna (wiersz) */
function stretchFilter(img, px, py, vertical, invert){
  remap(img, (x, y, s) => {
    if(!vertical){ if(invert ? x < px : x > px) s[0] = px; }
    else if(invert ? y < py : y > py) s[1] = py;
  });
}
/* Mirror: jedna połowa (lewa / prawa albo górna / dolna od punktu) odbita na drugą */
function mirrorFilter(img, px, py, vertical, keepSecond){
  remap(img, (x, y, s) => {
    if(!vertical){ if(keepSecond ? f(x + 0.5) < px : f(x + 0.5) > px) s[0] = f(f(f(2*px) - x) - 1); }
    else if(keepSecond ? f(y + 0.5) < py : f(y + 0.5) > py) s[1] = f(f(f(2*py) - y) - 1);
  });
}
/* RGB: każdy kanał z własnym przesunięciem; poza kadrem kanał pusty (kolorowe pasy przy brzegach) */
function rgbFilter(img, p, skala){
  const {w, h, px} = img, src = px.slice();
  const on = [p.red, p.green, p.blue], pos = [p.redPos, p.greenPos, p.bluePos];
  const dx = pos.map(q => lround(f(q[0]*skala))), dy = pos.map(q => lround(f(q[1]*skala)));
  for(let y=0; y<h; y++) for(let x=0; x<w; x++){
    const o = (y*w + x)*4;
    let a = 0;
    for(let c=0; c<3; c++){
      px[o+c] = 0;
      if(!on[c]) continue;
      const sx = x - dx[c], sy = y - dy[c];
      if(sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const s = (sy*w + sx)*4;
      px[o+c] = src[s+c];
      a = Math.max(a, src[s+3]);
    }
    px[o+3] = a;
  }
}
/* Color Cycle: kanał × (1 + Amount) zawinięty do 0..1 — kolory „przekręcają się” */
function cycle(c, amount){
  const v = f(c*f(1 + amount));
  return v > 0 ? f(f(v - Math.ceil(v)) + 1) : f(v - Math.floor(v));
}
function colorCycleFilter(img, p){
  const amt = [f(p.cycleR), f(p.cycleG), f(p.cycleB)], px = img.px;
  for(let o=0; o<px.length; o+=4){
    const a = px[o+3];
    if(a <= 1e-6) continue;
    for(let c=0; c<3; c++) px[o+c] = f(cycle(f(px[o+c]/a), amt[c])*a);
  }
}

/* ---------- parametry ---------- */
export const AUTO = -1e30;   /* punkt nieustawiony: środek kadru */
const mapa = (on, offsetX, offsetY, map) => ({on, offsetX, offsetY, map});
/* domyślne jak w glitch.h wtyczki */
export function domyslne(){
  return {
    animate: false, animateEvery: 2,
    jpeg: true, quality: 30, brokenBytes: 0, glitchStart: 0, glitchEnd: 100, bytesSeed: 1,
    chroma: {single: false, position: 5, value: 0, breakingBytes: 0, maxRandom: 0, seed: 1},
    luma: {single: false, position: 5, value: 0, breakingBytes: 0, maxRandom: 0, seed: 1},
    inverseDct: true, ycbcrToRgb: true, dequantize: true,
    filter1: false, filter1Value: 1, filter2: false, filter2Value: -0.1,
    glitchMap: mapa(false, 60, 0, 1), datamosh: false, moshX: -70, moshY: 10, moshScale: 10,
    meltMap: mapa(false, 0, 200, 1), slices: mapa(false, 60, 0, 1), badTv: mapa(false, 80, 0, 1), tiles: mapa(false, 80, 40, 1),
    drips: false, dripAmount: 60, dripLength: 400, dripMap: 1,
    liquid: false, liquidAmount: 120, liquidScale: 300, liquidMap: 1,
    mirror: false, mirrorVertical: false, mirrorKeepSecond: false, mirrorPos: [AUTO, AUTO],
    rgb: false, red: true, green: true, blue: true, redPos: [0, 0], greenPos: [0, 0], bluePos: [0, 0],
    displacement: false, copies: 5, xSpacing: 15, ySpacing: 15, dispPos: [AUTO, AUTO],
    stretch: false, stretchVertical: false, stretchInvert: false, stretchPos: [AUTO, AUTO],
    colorCycle: false, cycleR: 1, cycleG: 1, cycleB: 1
  };
}

/* Ustawienia apki (klucze gl* w S, state.js) → parametry rdzenia. Pozycje
   (lustro, displacement, stretch) to % kadru; W, H — wymiary bufora. */
export function zUstawien(s, W, H){
  const p = domyslne(), pkt = (x, y) => [W*x/100, H*y/100];
  Object.assign(p, {
    animate: !!s.glAnim, animateEvery: s.glAnimCo,
    jpeg: !!s.glJpeg, quality: s.glJakosc, brokenBytes: s.glBajty, glitchStart: s.glBajtyOd, glitchEnd: s.glBajtyDo, bytesSeed: s.glBajtyZiarno,
    chroma: {single: !!s.glQtc, position: s.glQtcPoz, value: s.glQtcWart, breakingBytes: s.glQtcLos, maxRandom: s.glQtcMaks, seed: s.glQtcZiarno},
    luma: {single: !!s.glQtl, position: s.glQtlPoz, value: s.glQtlWart, breakingBytes: s.glQtlLos, maxRandom: s.glQtlMaks, seed: s.glQtlZiarno},
    inverseDct: !!s.glIdct, ycbcrToRgb: !!s.glYcc, dequantize: !!s.glDekw,
    filter1: !!s.glF1, filter1Value: s.glF1W, filter2: !!s.glF2, filter2Value: s.glF2W,
    glitchMap: mapa(!!s.glMapa, s.glMapaX, s.glMapaY, s.glMapaNr),
    datamosh: !!s.glMosh, moshX: s.glMoshX, moshY: s.glMoshY, moshScale: s.glMoshSkala,
    meltMap: mapa(!!s.glTop, s.glTopX, s.glTopY, s.glTopNr),
    slices: mapa(!!s.glPaski, s.glPaskiX, s.glPaskiY, s.glPaskiNr),
    badTv: mapa(!!s.glTv, s.glTvX, s.glTvY, s.glTvNr),
    tiles: mapa(!!s.glKafle, s.glKafleX, s.glKafleY, s.glKafleNr),
    drips: !!s.glKrople, dripAmount: s.glKropleIle, dripLength: s.glKropleDl, dripMap: s.glKropleNr,
    liquid: !!s.glCiecz, liquidAmount: s.glCieczSila, liquidScale: s.glCieczSkala, liquidMap: s.glCieczNr,
    mirror: !!s.glLustro, mirrorVertical: s.glLustroOs === "pionowo", mirrorKeepSecond: s.glLustroStrona === "druga", mirrorPos: pkt(s.glLustroX, s.glLustroY),
    rgb: !!s.glRgb, red: !!s.glR, green: !!s.glG, blue: !!s.glB, redPos: [s.glRx, s.glRy], greenPos: [s.glGx, s.glGy], bluePos: [s.glBx, s.glBy],
    displacement: !!s.glPrzes, copies: s.glPrzesIle, xSpacing: s.glPrzesX, ySpacing: s.glPrzesY, dispPos: pkt(s.glPrzesPx, s.glPrzesPy),
    stretch: !!s.glRozc, stretchVertical: s.glRozcOs === "pionowo", stretchInvert: !!s.glRozcOdwr, stretchPos: pkt(s.glRozcPx, s.glRozcPy),
    colorCycle: !!s.glCykl, cycleR: s.glCyklR, cycleG: s.glCyklG, cycleB: s.glCyklB
  });
  return p;
}

/* Glitch na buforze RGBA (alfa prosta) w miejscu — tego używa dither-core.js.
   `skala` = piksele bufora na piksel obrazu (1/pikselizacja). */
export function glitchPixels(p, w, h, s, klatka, skala){
  const img = doFloat(p, w, h);
  renderGlitch(img, zUstawien(s, w, h), klatka | 0, skala);
  doBajtow(img, p);
}

/* frame = numer klatki (animacja), skala = piksele obrazu → bufora */
export function renderGlitch(img, p, frame, skala = 1){
  if(img.w <= 0 || img.h <= 0) return;
  let step = 0;
  if(p.animate){
    const every = Math.max(1, lround(p.animateEvery));
    step = frame >= 0 ? Math.trunc(frame/every) : -Math.trunc((-frame + every - 1)/every);
  }
  if(p.jpeg) jpegStage(img, p, step);
  if(p.glitchMap.on) glitchMapFilter(img, p.glitchMap, step, skala);
  if(p.datamosh) datamoshFilter(img, f(p.moshX*skala), f(p.moshY*skala), f(p.moshScale*skala), step);
  if(p.meltMap.on) meltFilter(img, p.meltMap, step, skala);
  if(p.slices.on) slicesFilter(img, p.slices, step, skala);
  if(p.badTv.on) badTvFilter(img, p.badTv, step, skala);
  if(p.tiles.on) tilesFilter(img, p.tiles, step, skala);
  if(p.drips) dripsFilter(img, p.dripAmount, p.dripLength, p.dripMap, step, skala);
  if(p.liquid) liquidFilter(img, p.liquidAmount, p.liquidScale, p.liquidMap, step, skala);
  const cx = f(img.w*0.5), cy = f(img.h*0.5);
  const punkt = q => [q[0] <= AUTO ? cx : f(q[0]*skala), q[1] <= AUTO ? cy : f(q[1]*skala)];
  if(p.displacement){ const [px, py] = punkt(p.dispPos); displacementFilter(img, px, py, p.copies, f(p.xSpacing*skala), f(p.ySpacing*skala)); }
  if(p.stretch){ const [px, py] = punkt(p.stretchPos); stretchFilter(img, px, py, p.stretchVertical, p.stretchInvert); }
  if(p.mirror){ const [px, py] = punkt(p.mirrorPos); mirrorFilter(img, px, py, p.mirrorVertical, p.mirrorKeepSecond); }
  if(p.rgb) rgbFilter(img, p, skala);
  if(p.colorCycle) colorCycleFilter(img, p);
}
