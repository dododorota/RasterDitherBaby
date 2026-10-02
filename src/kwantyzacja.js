/* Redukcja kolorów obrazu. Czysty moduł, bez DOM-u — testowany w Node
   (testy/kwantyzacja.mjs).

   Dwa zastosowania:
   - koder GIF-a (gif.js): klatka z ponad 256 kolorami musi się zmieścić
     w 256 — liczy się szybkość i powtarzalność, więc sama mediana;
   - paleta ze zdjęcia (app.js): kilka do kilkudziesięciu kolorów, które mają
     dobrze oddać obraz — mediana jako punkt startu, potem k-średnie.

   Oba liczą się na histogramie 15-bitowym (5 bitów na kanał), a nie na
   pikselach: koszt nie zależy od rozmiaru obrazu poza jednym przejściem. Kolor
   kubełka to średnia prawdziwych kolorów, które do niego wpadły, a nie jego
   środek — dzięki temu czysta biel papieru zostaje czystą bielą. */

const WAGI = [0.299, 0.587, 0.114];   /* te same co w nearest() */

export function histogram(p, n){
  const hist = new Uint32Array(32768), sr = new Float64Array(32768),
        sg = new Float64Array(32768), sb = new Float64Array(32768);
  for(let o=0; o<n*4; o+=4){
    const r = p[o], g = p[o+1], b = p[o+2], k = ((r>>3)<<10) | ((g>>3)<<5) | (b>>3);
    hist[k]++; sr[k] += r; sg[k] += g; sb[k] += b;
  }
  return {hist, sr, sg, sb};
}

/* Mediana: dzielimy pudełko o największej liczbie pikseli razy rozpiętość,
   wzdłuż najdłuższego boku, w ważonej medianie. Remisy rozstrzyga numer
   kubełka, więc wynik jest powtarzalny. Zwraca pudełka jako listy kubełków. */
export function mediana(h, ile){
  const {hist} = h;
  const kub = [];
  for(let k=0; k<32768; k++) if(hist[k]) kub.push(k);
  const skl = [k => k>>10, k => (k>>5)&31, k => k&31];
  const opisz = lista => {
    let liczba = 0, os = 0, rozp = -1;
    for(const k of lista) liczba += hist[k];
    for(let c=0; c<3; c++){
      let lo = 31, hi = 0;
      for(const k of lista){ const v = skl[c](k); if(v<lo) lo=v; if(v>hi) hi=v; }
      if(hi-lo > rozp){ rozp = hi-lo; os = c; }
    }
    return {lista, liczba, os, rozp};
  };
  const pudla = kub.length ? [opisz(kub)] : [];
  while(pudla.length < ile){
    let naj = -1, najW = 0;
    pudla.forEach((b, i) => { const w = b.liczba*b.rozp; if(b.rozp > 0 && w > najW){ najW = w; naj = i; } });
    if(naj < 0) break;
    const b = pudla[naj], f = skl[b.os];
    const lista = b.lista.slice().sort((x, y) => f(x)-f(y) || x-y);
    let suma = 0, ciecie = lista.length-1;
    for(let i=0; i<lista.length-1; i++){
      suma += hist[lista[i]];
      if(suma*2 >= b.liczba){ ciecie = i+1; break; }
    }
    pudla.splice(naj, 1, opisz(lista.slice(0, ciecie)), opisz(lista.slice(ciecie)));
  }
  return pudla.map(b => b.lista);
}

/* średni prawdziwy kolor grupy kubełków */
function srednia(h, lista){
  let r = 0, g = 0, b = 0, n = 0;
  for(const k of lista){ r += h.sr[k]; g += h.sg[k]; b += h.sb[k]; n += h.hist[k]; }
  return [r/n, g/n, b/n];
}

/* Do GIF-a: najwyżej `ile` kolorów i indeks każdego piksela. */
export function kwantyzujDoIndeksow(p, n, ile){
  const h = histogram(p, n);
  const pudla = mediana(h, ile);
  const rgb = new Uint8Array(pudla.length*3), doPudla = new Uint8Array(32768);
  pudla.forEach((lista, i) => {
    const c = srednia(h, lista);
    rgb[i*3] = Math.round(c[0]); rgb[i*3+1] = Math.round(c[1]); rgb[i*3+2] = Math.round(c[2]);
    for(const k of lista) doPudla[k] = i;
  });
  const ind = new Uint8Array(n);
  for(let i=0, o=0; i<n; i++, o+=4) ind[i] = doPudla[((p[o]>>3)<<10) | ((p[o+1]>>3)<<5) | (p[o+2]>>3)];
  return {indeksy: ind, paleta: rgb};
}

/* Paleta ze zdjęcia: `ile` kolorów, od najciemniejszego do najjaśniejszego —
   tak ułożona od razu nadaje się na gradient w trybie „według jasności".

   Start nie z mediany, tylko z kolorów najdalszych od już wybranych: mediana
   dzieli sprawiedliwie po liczbie pikseli, więc mała, ale wyrazista plama
   (czerwona kurtka na szarym tle) ginie w większym pudełku — a dithering
   potrzebuje palety, która obejmuje skrajne kolory obrazu, bo inaczej dyfuzja
   nie ma ich czym oddać. Kolory rzadsze niż PROG_ZNACZENIA pikseli liczą się
   proporcjonalnie mniej, żeby pojedyncze zabłąkane piksele nie zjadały
   miejsca w palecie. Potem kilka rund k-średnich przesuwa środki tam, gdzie
   kolory naprawdę leżą. Odległość ważona jak w nearest(), żeby paleta była
   dobrana pod tę samą miarę, którą potem liczy się dithering. */
const PROG_ZNACZENIA = 0.002;
export function paletaZPikseli(p, n, ile, rund = 8){
  const h = histogram(p, n);
  const kub = [];
  for(let k=0; k<32768; k++) if(h.hist[k]) kub.push(k);
  if(!kub.length) return [];
  const kolor = kub.map(k => [h.sr[k]/h.hist[k], h.sg[k]/h.hist[k], h.sb[k]/h.hist[k]]);
  const odl = (a, b) => (a[0]-b[0])**2*WAGI[0] + (a[1]-b[1])**2*WAGI[1] + (a[2]-b[2])**2*WAGI[2];

  /* najliczniejszy kolor na start, potem kolejno najdalszy od wybranych */
  let start = 0;
  for(let j=1; j<kub.length; j++) if(h.hist[kub[j]] > h.hist[kub[start]]) start = j;
  let srodki = [kolor[start]];
  const waga = kub.map(k => Math.min(1, h.hist[k]/(n*PROG_ZNACZENIA)));
  const najblizej = kolor.map(c => odl(c, kolor[start]));
  while(srodki.length < ile){
    let naj = -1, nw = 0;
    for(let j=0; j<kub.length; j++){ const w = najblizej[j]*waga[j]; if(w > nw){ nw = w; naj = j; } }
    if(naj < 0) break;                            /* zostały same kolory już wybrane */
    srodki.push(kolor[naj]);
    for(let j=0; j<kub.length; j++){ const d = odl(kolor[j], kolor[naj]); if(d < najblizej[j]) najblizej[j] = d; }
  }

  for(let r=0; r<rund; r++){
    const s = srodki.map(() => [0, 0, 0, 0]);
    for(let j=0; j<kub.length; j++){
      const c = kolor[j];
      let naj = 0, nd = Infinity;
      for(let i=0; i<srodki.length; i++){
        const d = odl(c, srodki[i]);
        if(d < nd){ nd = d; naj = i; }
      }
      const k = kub[j], t = s[naj];
      t[0] += h.sr[k]; t[1] += h.sg[k]; t[2] += h.sb[k]; t[3] += h.hist[k];
    }
    let ruch = false;
    srodki = srodki.map((m, i) => {
      const t = s[i];
      if(!t[3]) return m;                         /* pusty środek zostaje, gdzie był */
      const nowy = [t[0]/t[3], t[1]/t[3], t[2]/t[3]];
      if(Math.abs(nowy[0]-m[0]) + Math.abs(nowy[1]-m[1]) + Math.abs(nowy[2]-m[2]) > 0.01) ruch = true;
      return nowy;
    });
    if(!ruch) break;
  }

  const widziane = new Set(), wynik = [];
  for(const m of srodki){
    const c = m.map(v => Math.max(0, Math.min(255, Math.round(v))));
    const k = c.join(",");
    if(!widziane.has(k)){ widziane.add(k); wynik.push(c); }
  }
  const jas = c => c[0]*WAGI[0] + c[1]*WAGI[1] + c[2]*WAGI[2];
  return wynik.sort((a, b) => jas(a) - jas(b) || a[0]-b[0] || a[1]-b[1] || a[2]-b[2]);
}
