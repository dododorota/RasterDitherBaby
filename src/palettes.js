import { S } from "./state.js";

/* ---------- palety ---------- */
export const hex2rgb = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
export const rgb2hex = c => "#" + ((1<<24) | (c[0]<<16) | (c[1]<<8) | c[2]).toString(16).slice(1);
const ramp = n => { const p=[]; for(let i=0;i<n;i++){ const v=Math.round(i*255/(n-1)); p.push([v,v,v]); } return p; };

/* Biblioteka wbudowanych palet. Kolejność w obrębie palety ma znaczenie
   w trybie „według jasności": pierwszy kolor dostają najciemniejsze miejsca
   obrazu, ostatni najjaśniejsze — dlatego gradienty i duotony idą od ciemnego
   do jasnego. W trybie „najbliższy kolor" kolejność rozstrzyga tylko remisy.

   `mapa` to tryb, na który przełącza wybór palety z listy: gradient ma sens
   tylko według jasności, a paleta sprzętowa tylko jako najbliższy kolor.
   Presety i pliki ustawiają tryb same, wtedy nikt nic nie przełącza.

   bw, gray4, gray8, rgb3, quant, gameboy i cga to dawne palety
   apki — ich identyfikatory, kolory i kolejność muszą zostać, bo siedzą
   w zapisanych presetach, a kolejność decyduje o remisach. Kolory „null"
   liczy palette() (1-bit z farby i papieru, rampy, siatki RGB). */
export const BIBLIOTEKA = [
  {kat:"Podstawowe", id:"bw",     nazwa:"1-bit (farba i papier)", kolory:null, mapa:"kolor"},
  {kat:"Podstawowe", id:"gray4",  nazwa:"Szarości — 4 poziomy",   kolory:null, mapa:"kolor"},
  {kat:"Podstawowe", id:"gray8",  nazwa:"Szarości — 8 poziomów",  kolory:null, mapa:"kolor"},
  {kat:"Podstawowe", id:"gray16", nazwa:"Szarości — 16 poziomów", kolory:null, mapa:"kolor"},
  {kat:"Podstawowe", id:"rgb3",   nazwa:"3-bit RGB",              kolory:null, mapa:"kolor"},
  {kat:"Podstawowe", id:"quant",  nazwa:"Kolor — 4 poziomy na kanał", kolory:null, mapa:"kolor"},
  {kat:"Podstawowe", id:"glebia", nazwa:"Kolor — głębia z suwaka",    kolory:null, mapa:"kolor"},

  {kat:"Retro sprzęt", id:"gameboy", nazwa:"Game Boy", mapa:"kolor", kolory:["#0f380f","#306230","#8bac0f","#9bbc0f"]},
  {kat:"Retro sprzęt", id:"cga",  nazwa:"CGA — cyjan i magenta", mapa:"kolor", kolory:["#000000","#55ffff","#ff55ff","#ffffff"]},
  {kat:"Retro sprzęt", id:"cga2", nazwa:"CGA — zieleń, czerwień, żółć", mapa:"kolor", kolory:["#000000","#55ff55","#ff5555","#ffff55"]},
  {kat:"Retro sprzęt", id:"ega",  nazwa:"EGA — 16 kolorów", mapa:"kolor", kolory:["#000000","#0000aa","#00aa00","#00aaaa","#aa0000","#aa00aa","#aa5500","#aaaaaa","#555555","#5555ff","#55ff55","#55ffff","#ff5555","#ff55ff","#ffff55","#ffffff"]},
  {kat:"Retro sprzęt", id:"c64",  nazwa:"Commodore 64", mapa:"kolor", kolory:["#000000","#ffffff","#68372b","#70a4b2","#6f3d86","#588d43","#352879","#b8c76f","#6f4f25","#433900","#9a6759","#444444","#6c6c6c","#9ad284","#6c5eb5","#959595"]},
  {kat:"Retro sprzęt", id:"zx",   nazwa:"ZX Spectrum", mapa:"kolor", kolory:["#000000","#0000d7","#d70000","#d700d7","#00d700","#00d7d7","#d7d700","#d7d7d7","#0000ff","#ff0000","#ff00ff","#00ff00","#00ffff","#ffff00","#ffffff"]},
  {kat:"Retro sprzęt", id:"pico8", nazwa:"PICO-8", mapa:"kolor", kolory:["#000000","#1d2b53","#7e2553","#008751","#ab5236","#5f574f","#c2c3c7","#fff1e8","#ff004d","#ffa300","#ffec27","#00e436","#29adff","#83769c","#ff77a8","#ffccaa"]},
  {kat:"Retro sprzęt", id:"apple2", nazwa:"Apple II — grafika wysokiej rozdzielczości", mapa:"kolor", kolory:["#000000","#14cffd","#ff44fd","#ff6a3c","#14f53c","#ffffff"]},
  {kat:"Retro sprzęt", id:"vboy", nazwa:"Virtual Boy", mapa:"jasnosc", kolory:["#000000","#550000","#aa0000","#ff0000"]},

  {kat:"Monitory", id:"m-bursztyn", nazwa:"Bursztynowy monitor", mapa:"jasnosc", kolory:["#0a0500","#4a2600","#a35f00","#ffb000"]},
  {kat:"Monitory", id:"m-zielony",  nazwa:"Zielony fosfor",      mapa:"jasnosc", kolory:["#000a00","#0b4a12","#1fa83a","#7dff8f"]},
  {kat:"Monitory", id:"m-niebieski", nazwa:"Niebieski ekran",    mapa:"jasnosc", kolory:["#00061a","#0a2a7a","#2f6fe0","#b8d8ff"]},
  {kat:"Monitory", id:"m-lcd",      nazwa:"Szary LCD",           mapa:"jasnosc", kolory:["#2b2f2a","#5c6359","#9aa293","#c7cfbd"]},

  {kat:"Gradienty", id:"g-poswiata", nazwa:"Niebieska poświata", mapa:"jasnosc", kolory:["#02030a","#0a1a5c","#1e46d2","#4c8dff","#cfe3ff"]},
  {kat:"Gradienty", id:"g-ogien",   nazwa:"Ogień",       mapa:"jasnosc", kolory:["#000000","#4a0a00","#b3200a","#f2711c","#ffd35c","#fffbe6"]},
  {kat:"Gradienty", id:"g-matrix",  nazwa:"Matrix",      mapa:"jasnosc", kolory:["#000000","#002b0a","#00661a","#00c43a","#8cffb0"]},
  {kat:"Gradienty", id:"g-sepia",   nazwa:"Sepia",       mapa:"jasnosc", kolory:["#1b120b","#4a3424","#8a6a4b","#c8ad86","#f3e7d0"]},
  {kat:"Gradienty", id:"g-zachod",  nazwa:"Zachód słońca", mapa:"jasnosc", kolory:["#120b2e","#43195e","#a1286a","#f0654a","#ffc37a","#fff1d6"]},
  {kat:"Gradienty", id:"g-lod",     nazwa:"Lód",         mapa:"jasnosc", kolory:["#04121c","#0e3b5c","#3c86a8","#9ed6e0","#f2fbff"]},
  {kat:"Gradienty", id:"g-termo",   nazwa:"Termowizja",  mapa:"jasnosc", kolory:["#000000","#20007a","#8a00a8","#e8325a","#ff9a1f","#fff15c","#ffffff"]},
  {kat:"Gradienty", id:"g-fiolet",  nazwa:"Fiolet",      mapa:"jasnosc", kolory:["#0d0418","#3b1263","#7b3dc2","#c39bf2","#f6eeff"]},
  {kat:"Gradienty", id:"g-kawa",    nazwa:"Kawa z mlekiem", mapa:"jasnosc", kolory:["#140b07","#4b2e1f","#8f6346","#d7b48a","#fff4e0"]},
  {kat:"Gradienty", id:"g-mieta",   nazwa:"Morze i mięta", mapa:"jasnosc", kolory:["#03141a","#0b4f5c","#1f9a8a","#7fe0b8","#f0fff4"]},

  {kat:"Duotony", id:"d-granat",  nazwa:"Granat i krem",    mapa:"jasnosc", kolory:["#1c2541","#f4ebd9"]},
  {kat:"Duotony", id:"d-roz",     nazwa:"Czerń i neonowy róż", mapa:"jasnosc", kolory:["#0d0d0d","#ff3ea5"]},
  {kat:"Duotony", id:"d-zielen",  nazwa:"Butelkowa zieleń i krem", mapa:"jasnosc", kolory:["#1f3b2d","#efe6cf"]},
  {kat:"Duotony", id:"d-bordo",   nazwa:"Bordo i pudrowy róż", mapa:"jasnosc", kolory:["#4a0d1e","#f7b7c3"]},
  {kat:"Duotony", id:"d-kobalt",  nazwa:"Kobalt i żółć",    mapa:"jasnosc", kolory:["#1b2c8c","#ffe14d"]},
  {kat:"Duotony", id:"d-braz",    nazwa:"Czekolada i beż",  mapa:"jasnosc", kolory:["#3a2618","#eadbc4"]},
  {kat:"Duotony", id:"d-fiolet",  nazwa:"Fiolet i pomarańcz", mapa:"jasnosc", kolory:["#2e1a6b","#ff9a3c"]},

  {kat:"Riso", id:"r-niebroz", nazwa:"Riso: niebieski i fluo róż", mapa:"kolor", kolory:["#0078bf","#ff48b0","#f5f1e8"]},
  {kat:"Riso", id:"r-czermieta", nazwa:"Riso: turkus i czerwień", mapa:"kolor", kolory:["#00838a","#ff665e","#f5f1e8"]},
  {kat:"Riso", id:"r-trzy",    nazwa:"Riso: trzy farby i czerń", mapa:"kolor", kolory:["#1a1a1a","#0078bf","#ff48b0","#ffe800","#f5f1e8"]},
  {kat:"Riso", id:"r-zielfiol", nazwa:"Riso: zieleń i fiolet", mapa:"kolor", kolory:["#765ba7","#00a95c","#f5f1e8"]},

  {kat:"Neon", id:"n-synthwave", nazwa:"Synthwave", mapa:"kolor", kolory:["#0b0221","#2d0b59","#7a1fa2","#f72585","#4cc9f0","#ffe66d"]},
  {kat:"Neon", id:"n-vapor",    nazwa:"Vaporwave",  mapa:"kolor", kolory:["#2b1b3f","#b967ff","#ff71ce","#01cdfe","#05ffa1","#fffb96"]},
  {kat:"Neon", id:"n-cyber",    nazwa:"Cyberpunk",  mapa:"kolor", kolory:["#0a0a12","#3a0ca3","#ff003c","#00f0ff","#fcee09"]}
];
const WG_ID = new Map(BIBLIOTEKA.map(p => [p.id, p]));
export const wpisPalety = id => WG_ID.get(id);

const RGB_LIB = new Map(BIBLIOTEKA.filter(p => p.kolory).map(p => [p.id, p.kolory.map(hex2rgb)]));
export function palette(){
  switch(S.pal){
    case "bw": return [hex2rgb(S.paper), hex2rgb(S.ink)];
    case "gray4": return ramp(4);
    case "gray8": return ramp(8);
    case "gray16": return ramp(16);
    case "rgb3": { const p=[]; for(let r=0;r<2;r++)for(let g=0;g<2;g++)for(let b=0;b<2;b++)p.push([r*255,g*255,b*255]); return p; }
    case "quant": { const p=[], L=[0,85,170,255]; for(const r of L)for(const g of L)for(const b of L)p.push([r,g,b]); return p; }
    case "glebia": { const n = poziomyGlebi(), p = []; for(let r=0;r<n;r++)for(let g=0;g<n;g++)for(let b=0;b<n;b++) p.push([r,g,b].map(v => Math.round(v*255/(n-1)))); return p; }
    case "custom": if(S.custom) return S.custom.kolory; break;
    default: if(RGB_LIB.has(S.pal)) return RGB_LIB.get(S.pal);
  }
  return [[0,0,0],[255,255,255]];
}
/* Paleta jako gradient, od koloru dla cieni do koloru dla świateł. Różni się
   od palette() tylko przy 1-bit: tam od zawsze pierwszy jest papier (remisy
   w nearest()), a w gradiencie cienie mają dostać farbę. */
export function paletaGradientu(){
  if(S.pal === "bw") return [hex2rgb(S.ink), hex2rgb(S.paper)];
  /* głębia w gradiencie to liczba poziomów szarości, a nie sześcian n³ kolorów
     ułożony po kanałach, który jako gradient nie ma sensu */
  if(S.pal === "glebia") return ramp(poziomyGlebi());
  return palette();
}
/* „Głębia koloru": poziomy na kanał, 2–16 (1–4 bity) */
export const poziomyGlebi = () => Math.max(2, Math.min(16, Math.round(S.glebia || 4)));
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
  if(S.percept) return szukaczOklab(palette());
  if(S.pal === "custom" && S.custom && S.custom.kolory.length >= PROG_SIATKI) return szukaczSiatka(S.custom.kolory);
  if(S.pal !== "rgb3" && S.pal !== "quant" && S.pal !== "glebia") return null;
  const pal = palette();
  const n = (S.pal==="rgb3") ? 2 : (S.pal==="quant" ? 4 : poziomyGlebi()), stepv = 255/(n-1), last = n-1;
  let lvl = v => { const i=Math.ceil(v/stepv - 0.5); return i>last ? last : (i>0 ? i : 0); };
  if(S.pal === "glebia"){
    /* przy głębi poziomy są zaokrąglone do całych (3 poziomy: 0, 128, 255),
       więc granica nie leży w połowie kroku — poprawiamy przybliżenie
       o sąsiada, remis w dół jak w nearest() */
    const L = Array.from({length: n}, (_, i) => Math.round(i*255/(n-1)));
    const zgrubnie = lvl;
    lvl = v => {
      let i = zgrubnie(v);
      if(i > 0 && Math.abs(v - L[i-1]) <= Math.abs(v - L[i])) i--;
      else if(i < last && Math.abs(v - L[i+1]) < Math.abs(v - L[i])) i++;
      return i;
    };
  }
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

/* ---------- dopasowanie percepcyjne ----------
   Najbliższy kolor w Oklab (Björn Ottosson, 2020) zamiast ważonego RGB:
   odległości odpowiadają temu, jak różnicę widzi oko — przy kolorowych
   paletach mniej przeskoków w dziwne odcienie, zwłaszcza w ciemnych partiach.
   Dyfuzja błędu dalej idzie w RGB, zmienia się tylko wybór koloru.
   Wartość po dyfuzji bywa poza 0–255 — przycinamy przed przeliczeniem, bo
   Oklab dla ujemnego światła nie ma sensu. Przeliczenie to trzy pierwiastki
   sześcienne na piksel; dla palet od 33 kolorów wynik wyszukania jest
   zapamiętywany w kubełkach po 4 poziomy na kanał (64³ wpisów) — kolor
   przyporządkowany środkowi kubełka. Różnica wobec dokładnego szukania: kolor
   o pół kroku kubełka dalej, niewidoczna w ditherze, a skan 256 kolorów na
   każdy piksel trwałby sekundy. */
const lin = v => { v = v < 0 ? 0 : (v > 255 ? 1 : v/255); return v <= 0.04045 ? v/12.92 : Math.pow((v + 0.055)/1.055, 2.4); };
export function oklab(r, g, b){
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708*R + 0.5363325363*G + 0.0514459929*B);
  const m = Math.cbrt(0.2119034982*R + 0.6806995451*G + 0.1073969566*B);
  const s = Math.cbrt(0.0883024619*R + 0.2817188376*G + 0.6299787005*B);
  return [0.2104542553*l + 0.7936177850*m - 0.0040720468*s,
          1.9779984951*l - 2.4285922050*m + 0.4505937099*s,
          0.0259040371*l + 0.7827717662*m - 0.8086757660*s];
}
const szukaczeOklab = new Map();
function szukaczOklab(pal){
  const klucz = pal.length + ":" + pal.map(c => c.join(",")).join(";");
  let f = szukaczeOklab.get(klucz);
  if(f) return f;
  if(szukaczeOklab.size >= 8) szukaczeOklab.clear();
  const L = pal.map(c => oklab(c[0], c[1], c[2]));
  const najblizszy = (r, g, b) => {
    const [a0, a1, a2] = oklab(r, g, b);
    let best = 0, bd = Infinity;
    for(let i=0; i<L.length; i++){
      const d0 = a0 - L[i][0], d1 = a1 - L[i][1], d2 = a2 - L[i][2], d = d0*d0 + d1*d1 + d2*d2;
      if(d < bd){ bd = d; best = i; }
    }
    return best;
  };
  if(pal.length <= 32) f = (r, g, b) => pal[najblizszy(r, g, b)];
  else {
    const pamiec = new Int16Array(64*64*64).fill(-1);
    const kub = v => v < 0 ? 0 : (v > 255 ? 63 : (v >> 2));
    f = (r, g, b) => {
      const k = (kub(r) << 12) | (kub(g) << 6) | kub(b);
      let i = pamiec[k];
      if(i < 0) i = pamiec[k] = najblizszy((k >> 12)*4 + 1.5, ((k >> 6) & 63)*4 + 1.5, (k & 63)*4 + 1.5);
      return pal[i];
    };
  }
  szukaczeOklab.set(klucz, f);
  return f;
}

/* Tusze risografu do wyboru przy farbach rastra — przybliżenia ekranowe
   kolorów z kart producenta (papier i farba na ekranie nie dadzą się
   zgrać dokładnie). Kolejność: od najczęściej używanych. */
export const TUSZE_RISO = [
  ["Fluo róż", "#ff48b0"], ["Niebieski", "#0078bf"], ["Żółty", "#ffe800"], ["Czarny", "#000000"],
  ["Czerwony", "#ff665e"], ["Turkus", "#00838a"], ["Zielony", "#00a95c"], ["Fioletowy", "#765ba7"],
  ["Fluo pomarańcz", "#ff7477"], ["Pomarańczowy", "#ff6c2f"], ["Jasna czerwień", "#f15060"], ["Szkarłat", "#f65058"],
  ["Burgund", "#914e72"], ["Średni niebieski", "#3255a4"], ["Federal Blue", "#3d5588"], ["Chabrowy", "#62a8e5"],
  ["Morski", "#0074a2"], ["Akwamaryna", "#5ec8e5"], ["Mięta", "#82d8d5"], ["Turkusowy", "#00aa93"],
  ["Trawiasty", "#397e58"], ["Butelkowy", "#407060"], ["Jasna limonka", "#e3ed55"], ["Słonecznik", "#ffb511"],
  ["Melon", "#ffae3b"], ["Brązowy", "#925f52"], ["Płaskie złoto", "#bb8b41"], ["Gumy balonowej", "#f984ca"],
  ["Lawendowy", "#9d7ad2"], ["Śliwkowy", "#845991"], ["Jasnoszary", "#88898a"], ["Grafit", "#70747c"]
];

/* Oklab → sRGB 0–255 (odwrotność oklab()), przycięte do zakresu */
const nielin = v => { v = v <= 0.0031308 ? 12.92*v : 1.055*Math.pow(v, 1/2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v*255))); };
export function zOklab(L, a, b){
  const l = Math.pow(L + 0.3963377774*a + 0.2158037573*b, 3);
  const m = Math.pow(L - 0.1055613458*a - 0.0638541728*b, 3);
  const s = Math.pow(L - 0.0894841775*a - 1.2914855480*b, 3);
  return [nielin( 4.0767416621*l - 3.3077115913*m + 0.2309699292*s),
          nielin(-1.2684380046*l + 2.6097574011*m - 0.3413193965*s),
          nielin(-0.0041960863*l - 0.7034186147*m + 1.7076147010*s)];
}
/* Ciągły gradient z kolorów palety (od cieni do świateł): 256 kolorów,
   przejścia w Oklab, więc środek między niebieskim a żółtym nie szarzeje.
   Do mapy gradientu w rastrze. */
export function gradientLUT(kolory, odwroc){
  const L = (odwroc ? [...kolory].reverse() : kolory).map(h => oklab(...hex2rgb(h)));
  const lut = [];
  for(let i=0; i<256; i++){
    const t = i/255*(L.length - 1), k = Math.min(L.length - 2, Math.floor(t)), f = t - k;
    if(L.length === 1){ lut.push(zOklab(...L[0])); continue; }
    lut.push(zOklab(L[k][0] + (L[k+1][0] - L[k][0])*f, L[k][1] + (L[k+1][1] - L[k][1])*f, L[k][2] + (L[k+1][2] - L[k][2])*f));
  }
  return lut;
}
