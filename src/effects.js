import { S } from "./state.js";

/* Efekty po rastrze: sortowanie pikseli i przesunięcie RGB. Czyste funkcje na
   buforze RGBA, bez DOM-u — w ditheringu biegają w workerze razem z dyfuzją.

   Wszystko jest deterministyczne. Sortowanie jest stabilne (piksele o tej samej
   jasności zachowują kolejność), a przesunięcie liczone w całych pikselach, więc
   podgląd, PNG i SVG z ditheringu wychodzą takie same.

   Skala zapisu: permutację sortowania liczymy na siatce podglądu, a do bufora
   wyjściowego przenosimy ją blokami z×z. Przesunięcie liczymy w pikselach
   podglądu i mnożymy przez z. Dzięki temu zapis w skali pozostaje dokładnym
   powiększeniem podglądu, zamiast przesortowania od nowa w innej rozdzielczości. */

export const efektyWlaczone = () => S.sort !== "brak" || S.rgb > 0;

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
