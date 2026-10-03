/* Algorytmy ditheringu dodane po wzorze Dither Boya: Ostromukhov, Riemersma,
   Stevenson–Arce, niebieski szum i wzory.

   Ostromukhov porównany co do piksela z wynikiem oryginalnego programu autora
   (varcoeffED.c z archiwum varcoeffED.tar, iro.umontreal.ca/~ostrom): w danych
   leży jego obraz wejściowy i wzorcowy wynik 512×512, spakowany po bicie na
   piksel. Program autora powiększa obraz do 512×512 najbliższym sąsiadem
   (floor(x/skala)) — tu robimy to samo.

   Uruchom z katalogu projektu: node testy/algorytmy.mjs */
import { readFileSync } from "node:fs";
import { S, DEFAULTS } from "../src/state.js";
import { ditherPixels, DOT_DIFF } from "../src/dither-core.js";
import { palette, paletaGradientu } from "../src/palettes.js";
import { niebieskiSzum, WZORY } from "../src/kernels.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };
const ustaw = o => { Object.assign(S, DEFAULTS, o); };

console.log("--- Ostromukhov kontra program autora ---");
{
  const b = readFileSync(new URL("dane/ostromoukhov-wejscie.pgm", import.meta.url));
  let o = 0; const pola = [];
  while(pola.length < 4){ while(b[o] === 10 || b[o] === 32) o++; let s = ""; while(!(b[o] === 10 || b[o] === 32)) s += String.fromCharCode(b[o++]); pola.push(s); }
  o++;
  const ww = +pola[1], wh = +pola[2], we = b.subarray(o);
  const wz = readFileSync(new URL("dane/ostromoukhov-wzorzec.bin", import.meta.url));
  const W = 512, H = 512, sx = W/ww, sy = H/wh, p = new Uint8ClampedArray(W*H*4);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const v = we[Math.floor(y/sy)*ww + Math.floor(x/sx)], q = (y*W+x)*4; p[q]=p[q+1]=p[q+2]=v; p[q+3]=255; }
  ustaw({algo: "ostromoukhov", mapa: "jasnosc", pal: "bw", ink: "#000000", paper: "#ffffff", serp: true, str: 1, thr: 0});
  ditherPixels(p, W, H);
  let rozne = 0;
  for(let i=0;i<W*H;i++){ const bial = (wz[i>>3] >> (7 - (i&7))) & 1; if((p[i*4] === 255 ? 1 : 0) !== bial) rozne++; }
  sprawdz(rozne === 0, `${ww}×${wh} → 512×512, pikseli innych niż u autora: ${rozne}`);
}

function obraz(w, h, f){
  const p = new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const o=(y*w+x)*4, c=f(x,y); p[o]=c[0]; p[o+1]=c[1]; p[o+2]=c[2]; p[o+3]=255; }
  return p;
}
const gradient = (w, h) => obraz(w, h, (x, y) => [x*255/(w-1), (x*255/(w-1) + y*3) % 256, 255 - x*255/(w-1)]);
const szary = (w, h, v) => obraz(w, h, () => [v, v, v]);
const NOWE = ["ostromoukhov", "riemersma", "knuth", "stevenson", "falseFloyd", "fan", "shiauFan", "shiauFan2", "niebieski", "bayer16", "ign", "linieH", "linieV", "ukosne", "krzyze", "kropki8"];

console.log("--- tylko kolory palety, w obu trybach ---");
for(const [pal, mapa] of [["pico8", "kolor"], ["g-zachod", "jasnosc"], ["bw", "jasnosc"], ["quant", "kolor"]]){
  const zle = [];
  for(const algo of NOWE){
    ustaw({algo, pal, mapa});
    const dozw = new Set((mapa === "jasnosc" ? paletaGradientu() : palette()).map(c => c.join()));
    const w = 97, h = 61, p = gradient(w, h);
    ditherPixels(p, w, h);
    for(let i=0;i<p.length;i+=4) if(!dozw.has(p[i]+","+p[i+1]+","+p[i+2])){ zle.push(algo); break; }
  }
  sprawdz(!zle.length, `${pal} / ${mapa}: ${NOWE.length} algorytmów` + (zle.length ? " — obce kolory w: " + zle : ""));
}

console.log("--- średnia jasność zachowana (szarość 25% i 70%, czerń–biel) ---");
for(const algo of NOWE){
  const wyniki = [];
  let ok = true;
  for(const v of [64, 179]){
    ustaw({algo, pal: "bw", mapa: "jasnosc"});
    const w = 128, h = 128, p = szary(w, h, v);
    ditherPixels(p, w, h);
    let b = 0; for(let i=0;i<p.length;i+=4) if(p[i] === 255) b++;
    const u = b/(w*h);
    wyniki.push((u*100).toFixed(1) + "%");
    /* dot diffusion gubi błąd „baronów" (klasa 63 nie ma wyższych sąsiadów)
       i w jasnych tonach wychodzi o 3–4% ciemniej — tak samo w programie
       Knutha, z którym zgadzamy się co do piksela (test niżej) */
    if(Math.abs(u - v/255) > (algo === "knuth" ? 0.05 : 0.03)) ok = false;
  }
  sprawdz(ok, `${algo}: ${wyniki.join(" / ")} białych (oczekiwane 25,1% / 70,2%)`);
}

console.log("--- dot diffusion kontra program Knutha ---");
{
  /* DOT-DIFF (cs.stanford.edu/~knuth/programs/dot-diff.w) przepisany wiersz
     w wiersz: tablica ciemności z marginesem, indeksy od 1, store_eight,
     „kompilacja" instrukcji, wyostrzenie, decyzja z modelem zeta. U nas
     zeta = 0 (ekran, nie toner), więc wzorzec liczymy z zeta = 0. */
  function knuth(we, m, n, zeta, sharpening){
    const a = Array.from({length: m + 2}, () => new Float64Array(n + 2)), aa = Array.from({length: m + 2}, () => new Int8Array(n + 2));
    for(let i=1;i<=m;i++) for(let j=1;j<=n;j++) a[i][j] = 1 - we[(i-1)*n + (j-1)]/255;
    const class_number = Array.from({length: 10}, () => new Int8Array(10)), class_row = [], class_col = [];
    let kk = 0;
    const store = (i, j) => { if(i<1) i+=8; else if(i>8) i-=8; if(j<1) j+=8; else if(j>8) j-=8; class_number[i][j]=kk; class_row[kk]=i; class_col[kk]=j; kk++; };
    const store_eight = (i, j) => { store(i,j); store(i-4,j+4); store(1-j,i-4); store(5-j,i); store(j,5-i); store(4+j,1-i); store(5-i,5-j); store(1-i,1-j); };
    store_eight(7,2); store_eight(8,3); store_eight(8,2); store_eight(8,1); store_eight(1,4); store_eight(1,3); store_eight(1,2); store_eight(2,3);
    for(let i=1;i<=8;i++){ class_number[i][0]=class_number[i][8]; class_number[i][9]=class_number[i][1]; }
    for(let j=0;j<=9;j++){ class_number[0][j]=class_number[8][j]; class_number[9][j]=class_number[1][j]; }
    const start = [], del_i = [], del_j = [], alpha = [];
    let l = 0;
    for(let k=0;k<64;k++){
      start[k] = l; const i = class_row[k], j = class_col[k]; let w = 0;
      for(let ii=i-1;ii<=i+1;ii++) for(let jj=j-1;jj<=j+1;jj++) if(class_number[ii][jj] > k){
        del_i[l]=ii-i; del_j[l]=jj-j; l++;
        if(ii!==i && jj!==j) w++; else w+=2;
      }
      for(let jj=start[k]; jj<l; jj++) alpha[jj] = (del_i[jj]!==0 && del_j[jj]!==0) ? 1/w : 2/w;
    }
    start[64] = l;
    if(sharpening){
      for(let i=1;i<=m;i++) for(let j=1;j<=n;j++){
        const abar = (a[i-1][j-1]+a[i-1][j]+a[i-1][j+1]+a[i][j-1]+a[i][j]+a[i][j+1]+a[i+1][j-1]+a[i+1][j]+a[i+1][j+1])/9;
        a[i-1][j-1] = (a[i][j] - sharpening*abar)/(1 - sharpening);
      }
      for(let i=m;i>0;i--) for(let j=n;j>0;j--) a[i][j] = a[i-1][j-1] <= 0 ? 0 : a[i-1][j-1] >= 1 ? 1 : a[i-1][j-1];
    }
    const white = 0, gray = 1, black = 2;
    for(let k=0;k<64;k++) for(let i=class_row[k]; i<=m; i+=8) for(let j=class_col[k]; j<=n; j+=8){
      let err;
      if(aa[i][j] === white) err = a[i][j] - 1 - 4*zeta;
      else { err = a[i][j] - 1 + zeta; if(aa[i-1][j]===white) err-=zeta; if(aa[i+1][j]===white) err-=zeta; if(aa[i][j-1]===white) err-=zeta; if(aa[i][j+1]===white) err-=zeta; }
      if(err + a[i][j] > 0){
        aa[i][j] = black;
        if(aa[i-1][j]===white) aa[i-1][j]=gray; if(aa[i+1][j]===white) aa[i+1][j]=gray; if(aa[i][j-1]===white) aa[i][j-1]=gray; if(aa[i][j+1]===white) aa[i][j+1]=gray;
      } else err = a[i][j];
      for(let q=start[k]; q<start[k+1]; q++) a[i+del_i[q]][j+del_j[q]] += err*alpha[q];
    }
    return {aa, l};
  }
  /* uwaga: w przepisanym programie margines (wiersz m+1, kolumna n+1) też
     dostaje błąd — u nas poza kadrem nic się nie zapisuje; to te same piksele
     w kadrze, bo margines nie jest nigdy czytany przy decyzji o pikselu */
  sprawdz(DOT_DIFF.instr.reduce((s, x) => s + x.length, 0) === 256 && new Set(DOT_DIFF.macierz.flat()).size === 64,
          "64 klasy po razie, 256 instrukcji dyfuzji — jak w komentarzu autora („at this point l will be 256”)");
  for(const [nazwa, w, h, f] of [["gradient", 120, 80, (x, y) => (x*2.1 + y*0.7) % 256], ["zdjęciopodobny", 97, 61, (x, y) => 128 + 100*Math.sin(x/7)*Math.cos(y/5)]]){
    const we = new Float64Array(w*h);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) we[y*w + x] = Math.round(f(x, y));
    const {aa} = knuth(we, h, w, 0, 0.9);
    ustaw({algo: "knuth", pal: "bw", mapa: "jasnosc", ink: "#000000", paper: "#ffffff", str: 1, thr: 0});
    const p = obraz(w, h, (x, y) => { const v = we[y*w + x]; return [v, v, v]; });
    ditherPixels(p, w, h);
    let rozne = 0;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) if((p[(y*w + x)*4] === 0) !== (aa[y+1][x+1] === 2)) rozne++;
    sprawdz(rozne === 0, `${nazwa} ${w}×${h}: pikseli innych niż w programie Knutha (zeta 0, wyostrzenie 0,9): ${rozne}`);
  }
}

console.log("--- Riemersma ---");
{
  /* krzywa Hilberta na kwadracie 2^k: obraz niekwadratowy, nie potęga dwójki — każdy piksel odwiedzony raz */
  ustaw({algo: "riemersma", pal: "bw", mapa: "jasnosc"});
  const w = 301, h = 77, p = obraz(w, h, () => [128, 128, 128]);
  for(let i=3;i<p.length;i+=4) p[i] = 7;          /* znacznik: alfy dithering nie rusza */
  ditherPixels(p, w, h);
  let nietkniete = 0; for(let i=0;i<p.length;i+=4) if(p[i] !== 0 && p[i] !== 255) nietkniete++;
  sprawdz(nietkniete === 0, `${w}×${h}: każdy piksel przeliczony`);
  const a = gradient(80, 50), b = gradient(80, 50);
  ditherPixels(a, 80, 50); ditherPixels(b, 80, 50);
  sprawdz(a.every((v, i) => v === b[i]), "powtarzalność co do bajtu");
}

console.log("--- niebieski szum ---");
{
  const m = niebieskiSzum(), n = 64*64;
  const wart = new Set(m.flat());
  sprawdz(wart.size === n && Math.min(...wart) === 0 && Math.max(...wart) === n - 1, "64×64, każda ranga 0–4095 dokładnie raz");
  sprawdz(niebieskiSzum() === m, "liczony raz, potem z pamięci");
  /* niebieski: najmniej liczne rangi (pierwsze 10%) rozłożone równo — najbliższy
     sąsiad żadnego punktu nie leży tuż obok, w przeciwieństwie do białego szumu */
  const punkty = [];
  for(let y=0;y<64;y++) for(let x=0;x<64;x++) if(m[y][x] < n/10) punkty.push([x, y]);
  let minOdl = Infinity;
  for(const [x, y] of punkty) for(const [x2, y2] of punkty){
    if(x === x2 && y === y2) continue;
    const dx = Math.min(Math.abs(x - x2), 64 - Math.abs(x - x2)), dy = Math.min(Math.abs(y - y2), 64 - Math.abs(y - y2));
    minOdl = Math.min(minOdl, Math.hypot(dx, dy));
  }
  sprawdz(minOdl >= 2, `10% najjaśniejszych progów: najbliższe dwa punkty w odległości ${minOdl.toFixed(2)} (≥ 2, bez zlepków)`);
}

console.log("--- wzory ---");
{
  /* na jednolitej szarości linie poziome zmieniają się w pionie, a nie w poziomie */
  const zmiany = (algo) => {
    ustaw({algo, pal: "bw", mapa: "jasnosc"});
    const w = 64, h = 64, p = szary(w, h, 140);
    ditherPixels(p, w, h);
    let poziom = 0, pion = 0;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const v = p[(y*w+x)*4];
      if(x+1 < w && p[(y*w+x+1)*4] !== v) poziom++;
      if(y+1 < h && p[((y+1)*w+x)*4] !== v) pion++;
    }
    return [poziom, pion];
  };
  const [h1, v1] = zmiany("linieH"), [h2, v2] = zmiany("linieV");
  sprawdz(v1 > h1*2, `linie poziome: zmian w pionie ${v1}, w poziomie ${h1}`);
  sprawdz(h2 > v2*2, `linie pionowe: zmian w poziomie ${h2}, w pionie ${v2}`);
  for(const [nazwa, m] of Object.entries(WZORY)){
    const f = m.flat();
    sprawdz(new Set(f).size === 64 && Math.min(...f) === 0 && Math.max(...f) === 63, `${nazwa}: 64 różne progi 0–63`);
  }
}

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
