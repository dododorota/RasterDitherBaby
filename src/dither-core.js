import { S } from "./state.js";
import { palette, paletaGradientu, nearest, quantizer } from "./palettes.js";
import { K, BAYER2, BAYER4, BAYER8, BAYER16, CLUSTER, WZORY, niebieskiSzum, wagiOstro, ign } from "./kernels.js";
import { adjustPixels, korektaPrzestrzenna } from "./image.js";
import { efektyPo, uruchomNaBuforze, zmiennoscCzynna } from "./stos.js";
import { zmiennoscPrzed, cyklMacierzy } from "./fx.js";

/* Samo liczenie ditheringu: korekta tonalna i algorytm, w miejscu na buforze
   RGBA. Ani jednego odwołania do DOM-u, bo ten moduł biega też w workerze
   (src/worker.js) — canvas i ImageData zostają po stronie dither.js. */
export function ditherPixels(p, w, h){
  adjustPixels(p);
  korektaPrzestrzenna(p, w, h, 1/S.pix);
  if(zmiennoscCzynna()) zmiennoscPrzed(p, w, h, 1/S.pix);
  if(S.algo === "ostromoukhov" || S.algo === "riemersma"){ ditherSpecjalny(p, w, h); return; }
  if(S.mapa === "jasnosc"){ ditherJasnosci(p, w, h); return; }

  const pal = palette(), q = quantizer(), bias = S.thr*2.55;
  const diff = K[S.algo];

  if(diff){
    const buf = new Float32Array(w*h*3);
    for(let i=0,j=0;i<p.length;i+=4,j+=3){ buf[j]=p[i]+bias; buf[j+1]=p[i+1]+bias; buf[j+2]=p[i+2]+bias; }
    for(let y=0;y<h;y++){
      const rev = S.serp && (y&1);
      for(let k=0;k<w;k++){
        const x = rev ? w-1-k : k;
        const idx=(y*w+x)*3;
        const or=buf[idx], og=buf[idx+1], ob=buf[idx+2];
        const n = q ? q(or,og,ob) : nearest(pal, or,og,ob);
        buf[idx]=n[0]; buf[idx+1]=n[1]; buf[idx+2]=n[2];
        const er=(or-n[0])*S.str, eg=(og-n[1])*S.str, eb=(ob-n[2])*S.str;
        for(const [dx,dy,wt] of diff.m){
          const nx = x + (rev ? -dx : dx), ny = y+dy;
          if(nx<0||nx>=w||ny>=h) continue;
          const ni=(ny*w+nx)*3, f=wt/diff.d;
          buf[ni]+=er*f; buf[ni+1]+=eg*f; buf[ni+2]+=eb*f;
        }
      }
    }
    for(let i=0,j=0;i<p.length;i+=4,j+=3){ p[i]=buf[j]; p[i+1]=buf[j+1]; p[i+2]=buf[j+2]; }
  } else {
    const {mat, size, div, fn} = macierz();
    const [cx, cy] = cyklMacierzy();
    const spread = 255/Math.max(2, pal.length-1) * S.str;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        let t = 0;
        if(mat) t = (mat[(y + cy)%size][(x + cx)%size]/div - 0.5);
        else if(fn) t = fn(x + cx, y + cy) - 0.5;
        else if(S.algo==="noise") t = Math.random()-0.5;
        const o=t*spread + bias, i=(y*w+x)*4;
        const n = q ? q(p[i]+o, p[i+1]+o, p[i+2]+o) : nearest(pal, p[i]+o, p[i+1]+o, p[i+2]+o);
        p[i]=n[0]; p[i+1]=n[1]; p[i+2]=n[2];
      }
    }
  }
}

function macierz(){
  if(S.algo==="bayer2")  return {mat:BAYER2, size:2, div:4};
  if(S.algo==="bayer4")  return {mat:BAYER4, size:4, div:16};
  if(S.algo==="bayer8")  return {mat:BAYER8, size:8, div:64};
  if(S.algo==="bayer16") return {mat:BAYER16, size:16, div:256};
  if(S.algo==="ign")     return {mat:null, size:1, div:1, fn:ign};
  if(S.algo==="cluster") return {mat:CLUSTER, size:4, div:16};
  if(S.algo==="niebieski") return {mat:niebieskiSzum(), size:64, div:4096};
  if(WZORY[S.algo])      return {mat:WZORY[S.algo], size:8, div:64};
  return {mat:null, size:1, div:1};
}

/* Tryb „według jasności" (mapa gradientowa): dithering liczy się na samej
   jasności, z N równo rozłożonymi poziomami, a poziom k dostaje k-ty kolor
   palety. Kolory palety nie muszą być ani szare, ani ułożone po jasności —
   to one decydują, jak wygląda ciemne, średnie i jasne, niezależnie od tego,
   jakiego koloru było zdjęcie. Tak działają duotony i gradienty z biblioteki.
   Ten sam kod dla dyfuzji i dla macierzy co tryb kolorowy, tylko na jednej
   liczbie zamiast trzech — błąd się rozchodzi tak samo. */
function ditherJasnosci(p, w, h){
  const pal = paletaGradientu(), N = pal.length, ost = N-1;
  const krok = 255/Math.max(1, ost), bias = S.thr*2.55, n = w*h;
  const poziom = v => { const k = Math.round(v/krok); return k < 0 ? 0 : (k > ost ? ost : k); };
  const ind = new Uint8Array(n);
  const diff = K[S.algo];

  if(diff){
    const buf = new Float32Array(n);
    for(let i=0, o=0; i<n; i++, o+=4) buf[i] = 0.299*p[o] + 0.587*p[o+1] + 0.114*p[o+2] + bias;
    for(let y=0;y<h;y++){
      const rev = S.serp && (y&1);
      for(let k=0;k<w;k++){
        const x = rev ? w-1-k : k, i = y*w+x;
        const v = buf[i], l = poziom(v);
        ind[i] = l;
        const e = (v - l*krok)*S.str;
        for(const [dx,dy,wt] of diff.m){
          const nx = x + (rev ? -dx : dx), ny = y+dy;
          if(nx<0||nx>=w||ny>=h) continue;
          buf[ny*w+nx] += e*wt/diff.d;
        }
      }
    }
  } else {
    const {mat, size, div, fn} = macierz();
    const [cx, cy] = cyklMacierzy();
    const spread = krok * S.str;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        let t = 0;
        if(mat) t = (mat[(y + cy)%size][(x + cx)%size]/div - 0.5);
        else if(fn) t = fn(x + cx, y + cy) - 0.5;
        else if(S.algo==="noise") t = Math.random()-0.5;
        const i = y*w+x, o = i*4;
        ind[i] = poziom(0.299*p[o] + 0.587*p[o+1] + 0.114*p[o+2] + t*spread + bias);
      }
    }
  }
  for(let i=0, o=0; i<n; i++, o+=4){ const c = pal[ind[i]]; p[o]=c[0]; p[o+1]=c[1]; p[o+2]=c[2]; }
}

/* Dithering razem z efektami po rastrze — to woła worker i fallback, żeby oba
   liczyły dokładnie to samo. Efekty idą na buforze roboczym, jeszcze przed
   powiększeniem do podglądu, więc zapis w dowolnej skali jest powiększeniem.
   Kolejność i zestaw efektów daje stos (stos.js); promienie i przesunięcia
   podajemy w pikselach obrazu, a bufor jest po pikselizacji, stąd jednostka
   1/pix. {wektor:true} zostawia tylko efekty, które SVG potrafi oddać
   prostokątami — z poświaty czy JPEG-a wyszłyby setki tysięcy kolorów. */
export function ditherIEfekty(p, w, h, opcje){
  ditherPixels(p, w, h);
  if(efektyPo()) uruchomNaBuforze(p, w, h, 1/S.pix, opcje);
}

/* ---------- Ostromukhov i Riemersma ----------
   Oba nie pasują do zwykłej pętli z macierzą: Ostromukhov zmienia wagi
   z piksela na piksel, Riemersma idzie po krzywej Hilberta zamiast wierszami.
   Kwantyzację dla obu trybów kolorów (najbliższy kolor / według jasności)
   daje przygotuj(): bufor wartości (3 kanały albo 1), jasność wejściowa do
   wyboru wag i funkcja, która zaokrągla piksel i zostawia błąd w `blad`.
   Bufor w Float64, jak `double` w oryginalnym kodzie Ostromukhova — tylko tak
   wynik zgadza się co do piksela z jego wzorcowym obrazem. */
function przygotuj(p, w, h){
  const n = w*h, bias = S.thr*2.55, blad = new Float64Array(3);
  const wej = new Float64Array(n);
  for(let i=0, o=0; i<n; i++, o+=4) wej[i] = 0.299*p[o] + 0.587*p[o+1] + 0.114*p[o+2];
  if(S.mapa === "jasnosc"){
    const pal = paletaGradientu(), ost = pal.length - 1, krok = 255/Math.max(1, ost);
    const buf = new Float64Array(n), ind = new Uint8Array(n);
    for(let i=0; i<n; i++) buf[i] = wej[i] + bias;
    return {C: 1, buf, wej, blad,
      /* wiersz tabeli Ostromukhova: położenie jasności w obrębie przedziału
         między sąsiednimi poziomami — przy 1-bit to po prostu jasność 0–255 */
      indeksWag: i => { const t = wej[i]/krok; return Math.min(255, Math.round((t - Math.floor(t))*255)); },
      kwantuj(i){
        const v = buf[i];
        /* remis w dół, jak w oryginale (≤ 127,5 → czerń) */
        let l = Math.ceil(v/krok - 0.5);
        l = l < 0 ? 0 : (l > ost ? ost : l);
        blad[0] = v - l*krok;
        /* czysta czerń wejścia zostaje czarna, choć błąd liczy się od progu —
           tak robi make_output() w varcoeffED.c */
        ind[i] = (S.algo === "ostromoukhov" && wej[i] <= 0) ? 0 : l;
      },
      zapisz(){ for(let i=0, o=0; i<n; i++, o+=4){ const c = pal[ind[i]]; p[o]=c[0]; p[o+1]=c[1]; p[o+2]=c[2]; } }
    };
  }
  const pal = palette(), q = quantizer();
  const buf = new Float64Array(n*3);
  for(let i=0, o=0, j=0; i<n; i++, o+=4, j+=3){ buf[j]=p[o]+bias; buf[j+1]=p[o+1]+bias; buf[j+2]=p[o+2]+bias; }
  return {C: 3, buf, wej, blad,
    indeksWag: i => Math.min(255, Math.max(0, Math.round(wej[i]))),
    kwantuj(i){
      const j = i*3, r = buf[j], g = buf[j+1], b = buf[j+2];
      const c = q ? q(r, g, b) : nearest(pal, r, g, b);
      buf[j] = c[0]; buf[j+1] = c[1]; buf[j+2] = c[2];
      blad[0] = r - c[0]; blad[1] = g - c[1]; blad[2] = b - c[2];
    },
    zapisz(){ for(let i=0, o=0, j=0; i<n; i++, o+=4, j+=3){ p[o]=buf[j]; p[o+1]=buf[j+1]; p[o+2]=buf[j+2]; } }
  };
}

function ditherSpecjalny(p, w, h){
  const k = przygotuj(p, w, h);
  if(S.algo === "ostromoukhov") ostromoukhov(k, w, h); else riemersma(k, w, h);
  k.zapisz();
}

/* Wagi z tabeli autora, wybierane według jasności WEJŚCIOWEJ (bez błędu
   z sąsiadów), błąd w trzy strony: w prawo, w dół-w lewo, w dół — jak
   distribute_error() w varcoeffED.c. Ostatni składnik to reszta, nie iloczyn,
   więc nic nie ginie na zaokrągleniach. Wężykiem, chyba że wyłączony. */
function ostromoukhov(k, w, h){
  const {C, buf, blad} = k;
  for(let y=0; y<h; y++){
    const rev = S.serp && (y & 1), dir = rev ? -1 : 1;
    for(let s=0; s<w; s++){
      const x = rev ? w-1-s : s, i = y*w + x;
      k.kwantuj(i);
      const [wr, wdl, wd] = wagiOstro(k.indeksWag(i)), suma = wr + wdl + wd;
      const xr = x + dir, xdl = x - dir, dol = y + 1 < h;
      for(let c=0; c<C; c++){
        const e = blad[c]*S.str;
        const tr = wr*e/suma, tdl = wdl*e/suma, td = e - (tr + tdl);
        if(xr >= 0 && xr < w) buf[(i + dir)*C + c] += tr;
        if(dol){
          if(xdl >= 0 && xdl < w) buf[(i + w - dir)*C + c] += tdl;
          buf[(i + w)*C + c] += td;
        }
      }
    }
  }
}

/* Riemersma, „A Balanced Dithering Technique" (C/C++ Users Journal, 1998):
   obraz przechodzimy po krzywej Hilberta, a błąd niesie kolejka 16 ostatnich
   pikseli z wagami rosnącymi od 1 do 16 (najmłodszy waży najwięcej).
   Do kolejki trafia różnica między pikselem WEJŚCIOWYM a wynikiem — nie
   skorygowanym — i suma ważona dzielona przez 16, jak w oryginale. Krzywa
   na kwadracie 2^k obejmującym obraz, punkty spoza kadru pomijane. */
const KOLEJKA = 16, WAGA_MAX = 16;
const WAGI_R = (() => { const a = [], m = Math.exp(Math.log(WAGA_MAX)/(KOLEJKA - 1)); for(let i=0, v=1; i<KOLEJKA; i++, v*=m) a.push(Math.round(v)); return a; })();
function riemersma(k, w, h){
  const {C, buf, blad} = k;
  let bok = 1; while(bok < Math.max(w, h)) bok *= 2;
  const kol = new Float64Array(KOLEJKA*C), dodane = new Float64Array(C);
  let glowa = 0;                       /* indeks najstarszego wpisu w kolejce kołowej */
  for(let d=0, ile=bok*bok; d<ile; d++){
    /* d → (x, y) na krzywej Hilberta */
    let x = 0, y = 0, t = d;
    for(let s=1; s<bok; s*=2){
      const rx = 1 & (t >>> 1), ry = 1 & (t ^ rx);
      if(ry === 0){ if(rx === 1){ x = s-1-x; y = s-1-y; } const z = x; x = y; y = z; }
      x += s*rx; y += s*ry; t >>>= 2;
    }
    if(x >= w || y >= h) continue;
    const i = y*w + x;
    for(let c=0; c<C; c++){
      let suma = 0;
      for(let q=0; q<KOLEJKA; q++) suma += kol[((glowa + q) % KOLEJKA)*C + c]*WAGI_R[q];
      dodane[c] = suma/WAGA_MAX;
      buf[i*C + c] += dodane[c];
    }
    k.kwantuj(i);
    /* blad = skorygowany − wynik; do kolejki idzie wejście − wynik, czyli
       błąd bez tego, co dodała kolejka. Najstarszy wpis wypada, na jego
       miejsce wchodzi bieżący jako najmłodszy. */
    for(let c=0; c<C; c++) kol[glowa*C + c] = (blad[c] - dodane[c])*S.str;
    glowa = (glowa + 1) % KOLEJKA;
  }
}
