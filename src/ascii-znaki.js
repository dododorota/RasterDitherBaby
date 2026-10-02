/* ASCII — część czysta, bez DOM-u (testowana w Node, testy/ascii.mjs):
   zestawy znaków i wybór znaku oraz koloru dla każdej komórki.
   Rysowanie i zapis są w ascii.js. */
import { S } from "./state.js";
import { palette, quantizer, nearest, hex2rgb } from "./palettes.js";

export const ZESTAWY = {
  standard: " .:-=+*#%@",
  pelny:    " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  bloki:    " ░▒▓█",
  binarny:  " 10",
  kropki:   " ·•●",
  kreski:   " -=≡",
  litery:   " ilcoaxeOX#"
};
export const PROPORCJA = 0.6;
const jasnosc = (r, g, b) => 0.299*r + 0.587*g + 0.114*b;

/* znaki do użycia: zestaw albo własne; puste i pojedyncze dopełniamy */
export function rampa(){
  if(S.asciiZestaw === "wlasne"){
    const z = [...new Set([...(S.asciiWlasne || "")])].join("");
    return z.length >= 2 ? z : (" " + (z || "#"));
  }
  return ZESTAWY[S.asciiZestaw] || ZESTAWY.standard;
}
export const wymiaryKomorki = () => { const h = Math.max(4, S.asciiRozmiar | 0); return [Math.max(2, Math.round(h*PROPORCJA)), h]; };

/* rgba: komórki kol×wier po korekcie. Zwraca {znaki: [wiersze], kolory: Uint8 RGB na komórkę}. */
export function siatkaAscii(rgba, kol, wier){
  const tlo = hex2rgb(S.paper), naCiemnym = jasnosc(...tlo) < 128;
  const n = kol*wier, j = new Float64Array(n);
  for(let i=0, o=0; i<n; i++, o+=4){
    const v = jasnosc(rgba[o], rgba[o+1], rgba[o+2])/255;
    j[i] = naCiemnym ? v : 1 - v;                       /* 0 = pusto, 1 = najgęściej */
  }
  const kolory = new Uint8Array(n*3);
  const pal = S.asciiKolor === "paleta" ? palette() : null, q = pal ? quantizer() : null, jeden = hex2rgb(S.ink);
  for(let i=0, o=0; i<n; i++, o+=4){
    const c = S.asciiKolor === "jeden" ? jeden
            : pal ? (q ? q(rgba[o], rgba[o+1], rgba[o+2]) : nearest(pal, rgba[o], rgba[o+1], rgba[o+2]))
            : [rgba[o], rgba[o+1], rgba[o+2]];
    kolory[i*3] = c[0]; kolory[i*3+1] = c[1]; kolory[i*3+2] = c[2];
  }
  const znaki = [];
  if(S.asciiTryb === "tekst"){
    /* powtarzany tekst: znaki po kolei, jasność mówi tylko, czy komórka jest pusta */
    const tekst = [...(S.asciiWlasne || "RASTER")].filter(c => c !== "\n").join("") || "RASTER";
    let k = 0;
    for(let y=0; y<wier; y++){
      let w = "";
      for(let x=0; x<kol; x++){ const i = y*kol + x; w += j[i] < 0.12 ? " " : tekst[k++ % tekst.length]; }
      znaki.push(w);
    }
    return {znaki, kolory};
  }
  const R = rampa(), N = R.length, ost = N - 1;
  const poz = new Int32Array(n);
  if(S.asciiDither){
    /* Floyd–Steinberg na poziomach rampy, po komórkach — gładsze przejścia
       przy krótkich rampach (bloki, binarny) */
    const b = Float64Array.from(j, v => v*ost);
    for(let y=0; y<wier; y++) for(let x=0; x<kol; x++){
      const i = y*kol + x, v = b[i], l = Math.max(0, Math.min(ost, Math.round(v))), e = v - l;
      poz[i] = l;
      if(x + 1 < kol) b[i+1] += e*7/16;
      if(y + 1 < wier){
        if(x > 0) b[i+kol-1] += e*3/16;
        b[i+kol] += e*5/16;
        if(x + 1 < kol) b[i+kol+1] += e/16;
      }
    }
  } else for(let i=0; i<n; i++) poz[i] = Math.max(0, Math.min(ost, Math.round(j[i]*ost)));
  for(let y=0; y<wier; y++){
    let w = "";
    for(let x=0; x<kol; x++) w += R[poz[y*kol + x]];
    znaki.push(w);
  }
  return {znaki, kolory};
}
