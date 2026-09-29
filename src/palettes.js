import { S } from "./state.js";

/* ---------- palety ---------- */
export const hex2rgb = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const ramp = n => { const p=[]; for(let i=0;i<n;i++){ const v=Math.round(i*255/(n-1)); p.push([v,v,v]); } return p; };
export function palette(){
  switch(S.pal){
    case "bw": return [hex2rgb(S.paper), hex2rgb(S.ink)];
    case "gray4": return ramp(4);
    case "gray8": return ramp(8);
    case "gameboy": return [[15,56,15],[48,98,48],[139,172,15],[155,188,15]];
    case "cga": return [[0,0,0],[85,255,255],[255,85,255],[255,255,255]];
    case "rgb3": { const p=[]; for(let r=0;r<2;r++)for(let g=0;g<2;g++)for(let b=0;b<2;b++)p.push([r*255,g*255,b*255]); return p; }
    case "quant": { const p=[], L=[0,85,170,255]; for(const r of L)for(const g of L)for(const b of L)p.push([r,g,b]); return p; }
    case "custom": if(S.custom) return S.custom.kolory; break;
  }
  return [[0,0,0],[255,255,255]];
}
export function nearest(pal,r,g,b){
  let best=0, bd=Infinity;
  for(let i=0;i<pal.length;i++){
    const c=pal[i], dr=r-c[0], dg=g-c[1], db=b-c[2];
    const d=dr*dr*0.299+dg*dg*0.587+db*db*0.114;
    if(d<bd){bd=d;best=i;}
  }
  return pal[best];
}

/* Siatki RGB (rgb3, quant) to pełny iloczyn kartezjański poziomów, więc są
   rozdzielne: przy dodatnich wagach minimum sumy po kanałach osiąga się
   wybierając każdy kanał niezależnie. Zamiast skanować 8 albo 64 kolory
   wystarczą trzy dzielenia — przy palecie „Kolor — 4 poziomy na kanał" to
   różnica 3,5×. Remis wypada w dół, dokładnie tak jak w nearest(), który przy
   równej odległości zostaje przy pierwszym trafieniu; pętle w palette() idą
   rosnąco po r, g, b, więc kolejność się zgadza.

   Palety nieregularne (bw, gameboy, cga), ramp szarości i palety własne poniżej
   32 kolorów dostają null — wołający ma wtedy wołać nearest() wprost. Większe
   palety własne idą przez siatkę kubełków (szukaczSiatka, niżej). Dla małych palet szybka
   ścieżka nic nie daje, a owijka domknięciem wychodziła nawet 10% wolniej.
   Dla dużych palet własnych próbowane było odcinanie po luminancji (z
   Cauchy'ego–Schwarza d ≥ ΔY²): dokładne, ale dwa razy wolniejsze od skanu,
   bo dla kolorowych palet jasność prawie niczego nie odcina. */
export function quantizer(){
  if(S.pal === "custom" && S.custom && S.custom.kolory.length >= PROG_SIATKI) return szukaczSiatka(S.custom.kolory);
  if(S.pal !== "rgb3" && S.pal !== "quant") return null;
  const pal = palette();
  const n = (S.pal==="rgb3") ? 2 : 4, stepv = 255/(n-1), last = n-1;
  const lvl = v => { const i=Math.ceil(v/stepv - 0.5); return i>last ? last : (i>0 ? i : 0); };
  return (r,g,b)=> pal[(lvl(r)*n + lvl(g))*n + lvl(b)];
}

/* Duże palety własne: siatka kubełków z dokładną listą kandydatów.

   Przestrzeń dzielimy na G³ sześcianów. Dla każdego liczymy, jak blisko (dmin)
   i jak daleko (dmax) może leżeć od niego każdy kolor palety. Niech m = najmniejsze
   dmax. Każdy punkt sześcianu ma do któregoś koloru nie dalej niż m, więc kolor
   z dmin > m nigdy nie wygra i wylatuje z listy. Najbliższy kolor (także każdy
   remisowy) zawsze na liście zostaje, a lista jest w kolejności palety — dlatego
   wynik jest co do indeksu taki jak w nearest(), łącznie z remisami. Próg ma
   zapas na zaokrąglenia: czasem na liście zostanie kolor za dużo, nigdy za mało.

   Siatka obejmuje [ZAKRES_OD, ZAKRES_OD+ZAKRES), a nie tylko [0,256): po dyfuzji
   błędu wartości wychodzą poza sześcian RGB, tym częściej, im gorzej paleta
   pokrywa kolory obrazu — błąd nie ma się gdzie rozładować i rośnie. Co wypadnie
   i poza ten zakres, idzie zwykłym skanem; zmierzone przy losowych paletach:
   47–68% wartości dla 16–32 kolorów, poniżej 4% od 64 kolorów wzwyż.

   Zmierzony zysk na całym ditheringu 1400×1400 (bajt w bajt ten sam wynik):
   32 kolory ×1,2, 64 ×1,6, 128 ×2,4, 256 ×3,5–4. Poniżej 32 kolorów zysku nie
   było, stąd próg.

   Pudełko jest rozdzielne, więc dmin i dmax to sumy trzech składowych, każda
   zależna tylko od jednej osi — liczymy je raz na oś i kubełek, a nie dla
   każdego z G³ sześcianów osobno. Worker dostaje paletę jako świeżą kopię przy
   każdym zadaniu, więc gotowe siatki trzymamy w pamięci podręcznej po zawartości. */
const PROG_SIATKI = 32, G = 24, ZAKRES_OD = -256, ZAKRES = 768, KOM = ZAKRES/G;
const siatki = new Map();
function szukaczSiatka(pal){
  const klucz = pal.map(c => c[0]+","+c[1]+","+c[2]).join(";");
  let f = siatki.get(klucz);
  if(!f){
    if(siatki.size >= 8) siatki.clear();
    f = zbudujSiatke(pal);
    siatki.set(klucz, f);
  }
  return f;
}
function zbudujSiatke(pal){
  const n = pal.length, WAGI = [0.299, 0.587, 0.114];
  /* składowe per oś: MIN[k][c*n+i], MAX[k][c*n+i] dla kubełka c na osi k */
  const MIN = [], MAX = [];
  for(let k=0; k<3; k++){
    const mn = new Float64Array(G*n), mx = new Float64Array(G*n);
    for(let c=0; c<G; c++){
      const l = ZAKRES_OD + c*KOM, h = l + KOM;
      for(let i=0; i<n; i++){
        const v = pal[i][k];
        const dn = v < l ? l - v : (v > h ? v - h : 0);
        const dx = Math.max(Math.abs(v - l), Math.abs(h - v));
        mn[c*n+i] = dn*dn*WAGI[k]; mx[c*n+i] = dx*dx*WAGI[k];
      }
    }
    MIN.push(mn); MAX.push(mx);
  }
  const off = new Int32Array(G*G*G + 1);
  let L = new Int32Array(Math.max(1024, G*G*G*4)), dl = 0;
  const dmin = new Float64Array(n);
  for(let ri=0; ri<G; ri++) for(let gi=0; gi<G; gi++) for(let bi=0; bi<G; bi++){
    const or = ri*n, og = gi*n, ob = bi*n;
    let m = Infinity;
    for(let i=0; i<n; i++){
      dmin[i] = MIN[0][or+i] + MIN[1][og+i] + MIN[2][ob+i];
      const b = MAX[0][or+i] + MAX[1][og+i] + MAX[2][ob+i];
      if(b < m) m = b;
    }
    const granica = m*(1 + 1e-9) + 1e-9;
    off[(ri*G + gi)*G + bi] = dl;
    for(let i=0; i<n; i++) if(dmin[i] <= granica){
      if(dl === L.length){ const L2 = new Int32Array(L.length*2); L2.set(L); L = L2; }
      L[dl++] = i;
    }
  }
  off[G*G*G] = dl;
  const R = Float64Array.from(pal, c=>c[0]), Gr = Float64Array.from(pal, c=>c[1]), B = Float64Array.from(pal, c=>c[2]);
  const GORA = ZAKRES_OD + ZAKRES;
  return (r,g,b)=>{
    if(!(r >= ZAKRES_OD && r < GORA && g >= ZAKRES_OD && g < GORA && b >= ZAKRES_OD && b < GORA)) return nearest(pal, r, g, b);
    const c = ((((r-ZAKRES_OD)/KOM)|0)*G + (((g-ZAKRES_OD)/KOM)|0))*G + (((b-ZAKRES_OD)/KOM)|0);
    let best = L[off[c]], bd = Infinity;
    for(let j=off[c], e=off[c+1]; j<e; j++){
      const i = L[j], dr = r-R[i], dg = g-Gr[i], db = b-B[i];
      const d = dr*dr*0.299 + dg*dg*0.587 + db*db*0.114;
      if(d < bd){ bd = d; best = i; }
    }
    return pal[best];
  };
}
