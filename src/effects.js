import { S } from "./state.js";
import { rozmyj } from "./rozmycie.js";
import { hex2rgb } from "./palettes.js";

/* Efekty po rastrze: sortowanie pikseli, przesunięcie RGB, poświata. Czyste funkcje na
   buforze RGBA, bez DOM-u — w ditheringu biegają w workerze razem z dyfuzją.

   Wszystko jest deterministyczne. Sortowanie jest stabilne (piksele o tej samej
   jasności zachowują kolejność), a przesunięcie liczone w całych pikselach, więc
   podgląd, PNG i SVG z ditheringu wychodzą takie same.

   Skala zapisu: permutację sortowania liczymy na siatce podglądu, a do bufora
   wyjściowego przenosimy ją blokami z×z. Przesunięcie liczymy w pikselach
   podglądu i mnożymy przez z. Dzięki temu zapis w skali pozostaje dokładnym
   powiększeniem podglądu, zamiast przesortowania od nowa w innej rozdzielczości.
   Poświatę też liczymy tylko na siatce podglądu i dopiero gotową powiększamy. */

/* które efekty działają i w jakiej kolejności — decyduje stos (stos.js) */

/* Jasność w liczbach całkowitych 0..255 — ten sam wynik w każdej przeglądarce
   i w workerze, bez zależności od zaokrągleń zmiennoprzecinkowych. */
const jasnosc = (p, o) => ((p[o]*299 + p[o+1]*587 + p[o+2]*114 + 500) / 1000) | 0;

/* Klasyczne sortowanie w przedziale: w każdej linii (wierszu albo kolumnie)
   ciągłe odcinki pikseli o jasności z przedziału [od, do] są sortowane rosnąco
   po jasności; piksele spoza przedziału stoją w miejscu i przerywają odcinki.
   Zwraca permutację: perm[cel] = źródło, albo null, gdy nic by się nie ruszyło. */
export function permutacjaSortu(p, w, h){
  if(S.sort === "brak") return null;
  const lo = Math.round(Math.min(S.sortOd, S.sortDo) * 2.55);
  const hi = Math.round(Math.max(S.sortOd, S.sortDo) * 2.55);
  const pion = S.sort === "pionowo";
  const dl = pion ? h : w, linii = pion ? w : h;

  const n = w*h, perm = new Int32Array(n);
  for(let i=0;i<n;i++) perm[i] = i;
  const poz = new Int32Array(dl), kl = new Uint8Array(dl);
  const srt = new Int32Array(dl), sk = new Uint8Array(dl), kub = new Uint32Array(257);
  let ruch = false;

  for(let l=0; l<linii; l++){
    for(let t=0; t<dl; t++){
      const i = pion ? t*w + l : l*w + t;
      poz[t] = i; kl[t] = jasnosc(p, i*4);
    }
    let t = 0;
    while(t < dl){
      if(kl[t] < lo || kl[t] > hi){ t++; continue; }
      let e = t+1;
      while(e < dl && kl[e] >= lo && kl[e] <= hi) e++;
      const m = e - t;
      if(m > 1){
        if(m < 48){
          /* krótkie odcinki: sortowanie przez wstawianie, stabilne */
          for(let j=t;j<e;j++){ srt[j]=poz[j]; sk[j]=kl[j]; }
          for(let j=t+1;j<e;j++){
            const k0=sk[j], v=srt[j]; let k=j-1;
            while(k>=t && sk[k]>k0){ sk[k+1]=sk[k]; srt[k+1]=srt[k]; k--; }
            sk[k+1]=k0; srt[k+1]=v;
          }
        } else {
          /* długie: sortowanie przez zliczanie po 256 poziomach, też stabilne */
          kub.fill(0);
          for(let j=t;j<e;j++) kub[kl[j]+1]++;
          for(let b=0;b<256;b++) kub[b+1] += kub[b];
          for(let j=t;j<e;j++) srt[t + kub[kl[j]]++] = poz[j];
        }
        for(let j=t;j<e;j++) if(srt[j] !== poz[j]){ perm[poz[j]] = srt[j]; ruch = true; }
      }
      t = e;
    }
  }
  return ruch ? perm : null;
}

/* Przenosi permutację policzoną na siatce W×H na bufor (W·z)×(H·z), blokami z×z.
   Sortowanie przestawia piksele tylko w obrębie linii, więc wystarczy kopia
   jednego pasa z wierszy (albo z kolumn), a nie całego bufora — przy zapisie 6×
   z 1400 px to różnica między 200 kB a 280 MB. */
export function zastosujPermutacje(P, perm, W, H, z){
  const OW = W*z, OH = H*z, pion = S.sort === "pionowo";
  if(!pion){
    const pas = new Uint8ClampedArray(z*OW*4);
    for(let by=0; by<H; by++){
      const y0 = by*z, wiersze = Math.min(z, OH-y0);
      pas.set(P.subarray(y0*OW*4, (y0+wiersze)*OW*4));
      for(let bx=0; bx<W; bx++){
        const i = by*W + bx, s = perm[i];
        if(s === i) continue;
        const sx = s % W;
        for(let r=0; r<wiersze; r++){
          const zr = (r*OW + sx*z)*4;
          P.set(pas.subarray(zr, zr + z*4), ((y0+r)*OW + bx*z)*4);
        }
      }
    }
  } else {
    const pas = new Uint8ClampedArray(OH*z*4);
    for(let bx=0; bx<W; bx++){
      const x0 = bx*z;
      for(let y=0; y<OH; y++) pas.set(P.subarray((y*OW + x0)*4, (y*OW + x0 + z)*4), y*z*4);
      for(let by=0; by<H; by++){
        const i = by*W + bx, s = perm[i];
        if(s === i) continue;
        const sy = (s / W) | 0;
        for(let r=0; r<z; r++){
          const zr = ((sy*z + r)*z)*4;
          P.set(pas.subarray(zr, zr + z*4), ((by*z + r)*OW + x0)*4);
        }
      }
    }
  }
}

/* Przesunięcie w całych pikselach bufora. `jednostka` to liczba pikseli bufora
   na piksel obrazu: 1 w rastrze, 1/pix w ditheringu (tam bufor jest po
   pikselizacji, a przesunięcie o pół dużego piksela nie ma sensu). */
export function przesuniecieRGB(jednostka){
  if(!(S.rgb > 0)) return [0, 0];
  const a = S.rgbKat * Math.PI / 180;
  return [Math.round(S.rgb*Math.cos(a)*jednostka), Math.round(S.rgb*Math.sin(a)*jednostka)];
}

/* Czerwony przesunięty o (dx,dy), niebieski o (−dx,−dy), zielony w miejscu.
   Brzeg domykany powtórzeniem skrajnego piksela. Kopiujemy tylko przesuwany
   kanał, a nie cały bufor — przy dużym zapisie liczy się każdy bajt. */
export function przesunRGB(P, w, h, dx, dy){
  if(!dx && !dy) return;
  const n = w*h, kanal = new Uint8Array(n);
  for(const [c, sx, sy] of [[0, dx, dy], [2, -dx, -dy]]){
    for(let i=0, o=c; i<n; i++, o+=4) kanal[i] = P[o];
    for(let y=0; y<h; y++){
      let yy = y - sy; yy = yy < 0 ? 0 : (yy > h-1 ? h-1 : yy);
      const wiersz = yy*w;
      for(let x=0; x<w; x++){
        let xx = x - sx; xx = xx < 0 ? 0 : (xx > w-1 ? w-1 : xx);
        P[(y*w + x)*4 + c] = kanal[wiersz + xx];
      }
    }
  }
}

/* ---------- poświata ----------
   Jasne miejsca świecą miękkim halo we własnym kolorze, jak w nagraniu Dither
   Boya: z obrazu wycinamy to, co jaśniejsze od progu (płynnie, bez twardej
   krawędzi), rozmywamy i nakładamy trybem „screen" — rozjaśnia, nigdy nie
   przyciemnia, a biel zostaje bielą. Siła ponad 100% przepala halo do bieli.

   Tworzy kolory spoza palety (to całe przejście od koloru do tła), więc GIF
   z poświatą idzie przez kwantyzację, a SVG z ditheringu poświaty nie zawiera.

   `jednostka` to liczba pikseli bufora na piksel obrazu (1/pix w ditheringu),
   żeby ten sam promień znaczył to samo przy każdej pikselizacji. */
/* Halo z dwóch warstw, jak bloom w grach: bliska (σ/4) daje jasny rdzeń wokół
   świecącego miejsca, daleka (σ) szeroką mgiełkę. Jedna warstwa była albo
   rozmyta do niewidoczności (kropka ditheringu to jeden piksel, rozmycie
   rozsmarowuje go na setki), albo ostra bez mgiełki. Wagi warstw dobrane na
   oko na próbce i zdjęciach: 100% ma być wyraźne, 200% przepalone. */
const ZBOCZE = 0.3, BLISKA = 1.0, DALEKA = 1.6;
export function warstwaPoswiaty(p, w, h, jednostka){
  const prog = S.glowProg*2.55, sila = S.glow/100, n = w*h;
  if(!(sila > 0) || prog >= 255) return null;
  /* od progu do pełnej siły na 30% pozostałej skali — płynnie, bez twardej krawędzi */
  const L = new Float32Array(n*4), zbocze = Math.max(1, (255 - prog)*ZBOCZE);
  /* kolor halo: z piksela albo jeden wybrany (jasność piksela mówi tylko, jak mocno) */
  const kolor = S.glowZrodlo === "kolor" ? hex2rgb(S.glowKolor) : null;
  for(let o=0; o<n*4; o+=4){
    const j = (p[o]*299 + p[o+1]*587 + p[o+2]*114)/1000;
    if(j <= prog) continue;
    const f = Math.min(1, (j - prog)/zbocze)*sila;
    if(kolor){ L[o] = kolor[0]*f; L[o+1] = kolor[1]*f; L[o+2] = kolor[2]*f; }
    else { L[o] = p[o]*f; L[o+1] = p[o+1]*f; L[o+2] = p[o+2]*f; }
  }
  /* promień na suwaku to mniej więcej zasięg halo, czyli ~2σ */
  const sigma = Math.max(0.5, S.glowR/2*jednostka);
  const B = new Float32Array(L);
  rozmyj(B, w, h, Math.max(0.5, sigma/4));
  /* rozciągnięcie (z wtyczki VFX Dither 1.6, Glow Stretch): daleka warstwa
     węższa w poprzek i wyciągnięta w smugę wzdłuż kąta, trochę mocniejsza,
     bo światło rozkłada się na dłuższy pas. Przy 0 — poświata jak dawniej. */
  const st = Math.max(0, Math.min(1, (S.glowRozciag || 0)/100));
  rozmyj(L, w, h, sigma*(1 - 0.75*st));
  if(st > 0){ const a = (S.glowKatSmugi || 0)*Math.PI/180; rozmyjKierunkowo(L, w, h, Math.cos(a), Math.sin(a), sigma*st*40); }
  /* szeroka warstwa rozkłada to samo światło na pole rosnące z σ², więc bez
     wzmocnienia rosnącego z promieniem duży promień znaczył po prostu słabiej;
     pierwiastek, a nie σ wprost, bo duże jasne plamy i tak by się przepaliły.
     Liczone w pikselach obrazu (σ/jednostka), żeby pikselizacja nie zmieniała siły. */
  const daleka = DALEKA*Math.sqrt(Math.max(1, sigma/jednostka/2))*(1 + 0.5*st);
  for(let o=0; o<n*4; o+=4){
    L[o]   = B[o]*BLISKA   + L[o]*daleka;
    L[o+1] = B[o+1]*BLISKA + L[o+1]*daleka;
    L[o+2] = B[o+2]*BLISKA + L[o+2]*daleka;
  }
  return L;
}
/* screen: a + g·(1 − a/255); bufor Uint8Clamped przycina, co wyjdzie ponad 255 */
export function nalozPoswiate(P, L){
  for(let o=0; o<P.length; o+=4){
    for(let c=0; c<3; c++){ const a = P[o+c]; P[o+c] = a + L[o+c]*(1 - a/255); }
  }
}
/* Rozmycie wzdłuż kierunku (ux, uy), jak directionalBlur we wtyczce: przebiegi
   ¼·½·¼ z przesunięciem 1, 2, 4… ≤ dł/2 (σ ≈ 0,27·dł, koszt rośnie z log dł).
   Odczyt dwuliniowy; poza obrazem ciemno, więc smuga gaśnie przy brzegu.
   Przesunięcie jest to samo dla każdego piksela, więc wagi liczone raz. */
function rozmyjKierunkowo(L, w, h, ux, uy, dl){
  const s = new Float32Array(L.length);
  for(let o=1; o <= dl*0.5; o *= 2){
    s.set(L);
    const probki = [-1, 1].map(zn => { const dx = zn*ux*o, dy = zn*uy*o, ix = Math.floor(dx), iy = Math.floor(dy);
      return {ix, iy, fx: dx - ix, fy: dy - iy}; });
    for(let y=0; y<h; y++) for(let x=0; x<w; x++){
      const q = (y*w + x)*4;
      let r = 0, g = 0, b = 0;
      for(const {ix, iy, fx, fy} of probki){
        for(let j=0; j<2; j++){
          const yy = y + iy + j, wy = j ? fy : 1 - fy;
          if(yy < 0 || yy >= h || wy === 0) continue;
          for(let i=0; i<2; i++){
            const xx = x + ix + i, wg = (i ? fx : 1 - fx)*wy;
            if(xx < 0 || xx >= w || wg === 0) continue;
            const z = (yy*w + xx)*4;
            r += s[z]*wg; g += s[z+1]*wg; b += s[z+2]*wg;
          }
        }
      }
      L[q] = 0.5*s[q] + 0.25*r; L[q+1] = 0.5*s[q+1] + 0.25*g; L[q+2] = 0.5*s[q+2] + 0.25*b;
    }
  }
}
export function poswiata(P, w, h, jednostka){
  const L = warstwaPoswiaty(P, w, h, jednostka);
  if(L) nalozPoswiate(P, L);
}

/* ---------- ekran CRT ----------
   Z wtyczki VFX Dither 1.6 (crtPass): ciemne linie kineskopu i pionowa maska
   z pasków R, G, B. Linia ma ciemność 0,5 − 0,5·cos(2π(u − ¾)) uśrednioną po
   pikselu (przy okresie 2 px wiersze na zmianę ciemne i jasne), a w jasnych
   miejscach jest cieńsza — jak szersza plamka wiązki na kineskopie. Maska
   zabiera ok. ⅔ światła z każdego kanału, więc część jasności wraca
   (× (1 + 0,6·maska)).
   Odstęp w pikselach bufora — w ditheringu to piksele ditheringu, jak we
   wtyczce, więc linie trzymają się dużych pikseli. z — powiększenie (raster
   zapisywany w skali): linie i paski w tych samych miejscach co w podglądzie,
   tylko liczone na drobniejszych pikselach (gładsze), jak we wtyczce. */
const ciemnoscLinii = (u0, u1) => { const k = 2*Math.PI; return 0.5 - 0.5*(Math.sin(k*(u1 - 0.75)) - Math.sin(k*(u0 - 0.75)))/(k*(u1 - u0)); };
/* część przedziału u0..u1 (u w szerokościach trójki) leżąca w tercji c (0 = R, 1 = G, 2 = B) */
const pokrycieMaski = (u0, u1, c) => {
  const F = u => { const fl = Math.floor(u); return fl/3 + Math.min(1/3, Math.max(0, u - fl - c/3)); };
  return (F(u1) - F(u0))/(u1 - u0);
};
export function ekranCRT(p, w, h, z = 1){
  const linie = Math.max(0, Math.min(1, S.crtLinie/100)), maska = Math.max(0, Math.min(1, S.crtMaska/100));
  if(!(linie > 0) && !(maska > 0)) return;
  const P = Math.max(1, S.crtOdstep)*z, T = Math.max(3, S.crtOdstep)*z, komp = 1 + 0.6*maska;
  const M = new Float32Array(w*3).fill(1);
  if(maska > 0) for(let x=0; x<w; x++){
    const v0 = x/T;
    for(let c=0; c<3; c++) M[x*3 + c] = (1 - maska*(1 - pokrycieMaski(v0, v0 + 1/T, c)))*komp;
  }
  for(let y=0; y<h; y++){
    const u0 = y/P, dk = linie*ciemnoscLinii(u0, u0 + 1/P);
    for(let x=0, o=y*w*4; x<w; x++, o+=4){
      if(p[o+3] === 0) continue;
      const g = 1 - dk*(1 - 0.6*(0.299*p[o] + 0.587*p[o+1] + 0.114*p[o+2])/255);
      p[o] = p[o]*g*M[x*3]; p[o+1] = p[o+1]*g*M[x*3+1]; p[o+2] = p[o+2]*g*M[x*3+2];
    }
  }
}
