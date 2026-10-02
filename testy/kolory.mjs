/* Kolory w ditheringu: biblioteka palet, tryb „według jasności" i paleta ze
   zdjęcia (kwantyzacja.js). Czysty Node, bez przeglądarki.
   Uruchom z katalogu projektu: node testy/kolory.mjs */
import { S, DEFAULTS } from "../src/state.js";
import { BIBLIOTEKA, palette, paletaGradientu, hex2rgb } from "../src/palettes.js";
import { ditherPixels } from "../src/dither-core.js";
import { paletaZPikseli } from "../src/kwantyzacja.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };
let ziarno = 11;
const los = () => (ziarno = (Math.imul(ziarno, 1664525) + 1013904223) >>> 0) / 4294967296;
const jas = c => c[0]*0.299 + c[1]*0.587 + c[2]*0.114;

console.log("--- biblioteka ---");
const id = BIBLIOTEKA.map(p => p.id);
sprawdz(new Set(id).size === id.length, BIBLIOTEKA.length + " palet, identyfikatory bez powtórzeń");
sprawdz(BIBLIOTEKA.every(p => !p.kolory || (p.kolory.length >= 2 && p.kolory.every(h => /^#[0-9a-f]{6}$/.test(h)))), "kolory w formacie #rrggbb, co najmniej dwa");
sprawdz(BIBLIOTEKA.every(p => p.mapa === "kolor" || p.mapa === "jasnosc"), "każda paleta wie, w którym trybie się ją wybiera");
const gradienty = BIBLIOTEKA.filter(p => p.mapa === "jasnosc" && p.kolory);
const nierosnace = gradienty.filter(p => p.kolory.map(hex2rgb).some((c, i, a) => i && jas(c) <= jas(a[i-1]))).map(p => p.id);
sprawdz(!nierosnace.length, "palety „według jasności” idą od ciemnego do jasnego" + (nierosnace.length ? ": " + nierosnace : ""));
/* dawne palety muszą zostać co do koloru i kolejności — siedzą w zapisanych presetach */
Object.assign(S, DEFAULTS, {pal: "gameboy"});
sprawdz(JSON.stringify(palette()) === "[[15,56,15],[48,98,48],[139,172,15],[155,188,15]]", "Game Boy bez zmian");
Object.assign(S, DEFAULTS, {pal: "cga"});
sprawdz(JSON.stringify(palette()) === "[[0,0,0],[85,255,255],[255,85,255],[255,255,255]]", "CGA bez zmian");
Object.assign(S, DEFAULTS, {pal: "bw", ink: "#102030", paper: "#f0e0d0"});
sprawdz(JSON.stringify(palette()) === "[[240,224,208],[16,32,48]]" && JSON.stringify(paletaGradientu()) === "[[16,32,48],[240,224,208]]",
        "1-bit: papier pierwszy w trybie kolorów, farba pierwsza w gradiencie");

console.log("--- dithering według jasności ---");
function obraz(w, h, f){
  const p = new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const o=(y*w+x)*4, c = f(x, y); p[o]=c[0]; p[o+1]=c[1]; p[o+2]=c[2]; p[o+3]=255; }
  return p;
}
const ALGO = ["floyd","atkinson","jjn","sierraLite","bayer4","bayer8","cluster","threshold"];
for(const pal of ["g-poswiata", "d-granat", "g-termo"]){
  let obce = 0, zle = 0;
  for(const algo of ALGO){
    Object.assign(S, DEFAULTS, {pal, mapa: "jasnosc", algo});
    const kolory = palette(), dozw = new Set(kolory.map(c => c.join()));
    /* kolorowy obraz, ale z jasnością rosnącą od 0 do 255 w poziomie */
    const w = 120, h = 40, p = obraz(w, h, (x, y) => { const v = Math.round(x*255/(w-1)); return y < 20 ? [v, v, v] : [v, Math.max(0, v - (y-20)), Math.min(255, v + (y-20)*2)]; });
    ditherPixels(p, w, h);
    for(let i=0;i<p.length;i+=4) if(!dozw.has(p[i]+","+p[i+1]+","+p[i+2])) obce++;
    /* lewa krawędź ciemna → pierwszy kolor, prawa jasna → ostatni */
    const lewa = p.slice(0, 3).join(), prawa = p.slice((w-1)*4, (w-1)*4+3).join();
    if(algo === "threshold" && (lewa !== kolory[0].join() || prawa !== kolory[kolory.length-1].join())) zle++;
  }
  sprawdz(!obce && !zle, `${pal}: tylko kolory palety we wszystkich ${ALGO.length} algorytmach, cienie → pierwszy, światła → ostatni`);
}
/* dyfuzja zachowuje średnią jasność: szary 30% na duotonie czerń–biel daje ~30% bieli */
{
  S.custom = {nazwa: "cb", kolory: [[0,0,0],[255,255,255]]};
  for(const algo of ["floyd", "atkinson", "bayer8"]){
    Object.assign(S, DEFAULTS, {pal: "custom", mapa: "jasnosc", algo});
    const w = 200, h = 200, p = obraz(w, h, () => [77, 77, 77]);
    ditherPixels(p, w, h);
    let biale = 0; for(let i=0;i<p.length;i+=4) if(p[i] === 255) biale++;
    const ulamek = biale/(w*h);
    /* Atkinson z definicji gubi 1/4 błędu, więc wychodzi ciemniej — tak wygląda w każdej implementacji */
    const tol = algo === "atkinson" ? 0.12 : 0.02;
    sprawdz(Math.abs(ulamek - 77/255) < tol, `${algo}: szarość 30% → ${(ulamek*100).toFixed(1)}% białych pikseli`);
  }
}
/* Liczy się jasność, nie barwa: kolor i szarość tej samej jasności lądują na
   tym samym poziomie gradientu. Sprawdzane progowaniem — w dyfuzji i Bayerze
   różnica jasności o ułamek (szarość musi być całkowita) potrafi przestawić
   wzór, a jasności z testu leżą daleko od granic poziomów. */
{
  let rozne = 0;
  for(const kolor of [[200, 50, 50], [30, 200, 40], [60, 60, 250], [250, 220, 20]]){
    const Y = Math.round(jas(kolor)), szary = [Y, Y, Y];
    Object.assign(S, DEFAULTS, {pal: "g-ogien", mapa: "jasnosc", algo: "threshold"});
    const a = obraz(32, 32, () => kolor), b = obraz(32, 32, () => szary);
    ditherPixels(a, 32, 32); ditherPixels(b, 32, 32);
    for(let i=0;i<a.length;i++) if(a[i] !== b[i]) rozne++;
  }
  sprawdz(rozne === 0, "czerwień, zieleń i błękit dają to samo co szarość tej samej jasności");
}
/* powtarzalność: ten sam obraz, ten sam wynik */
{
  Object.assign(S, DEFAULTS, {pal: "g-zachod", mapa: "jasnosc", algo: "jjn", serp: true, str: 0.8, thr: 15});
  const w = 64, h = 64, f = (x, y) => [(x*y) & 255, x*4, y*4];
  const a = obraz(w, h, f), b = obraz(w, h, f);
  ditherPixels(a, w, h); ditherPixels(b, w, h);
  sprawdz(a.every((v, i) => v === b[i]), "powtarzalność co do bajtu");
}

console.log("--- paleta ze zdjęcia ---");
{
  /* obraz z dokładnie czterech kolorów → cztery te same kolory, od ciemnego */
  const K = [[20, 40, 90], [240, 200, 30], [200, 30, 60], [250, 250, 245]];
  const w = 160, h = 100, p = obraz(w, h, (x, y) => K[((x/40)|0) % 4]);
  const wyn = paletaZPikseli(p, w*h, 4);
  const posort = K.slice().sort((a, b) => jas(a) - jas(b));
  sprawdz(JSON.stringify(wyn) === JSON.stringify(posort), "4 płaskie kolory → dokładnie one, od najciemniejszego: " + wyn.map(c => c.join("/")).join(" "));
  const wiecej = paletaZPikseli(p, w*h, 16);
  sprawdz(wiecej.length === 4, "prośba o 16 przy czterech kolorach w obrazie → " + wiecej.length);
}
{
  /* mała czerwona plama na dużym szarym gradiencie: sama mediana by ją zjadła */
  const w = 200, h = 200;
  const p = obraz(w, h, (x, y) => (x > 150 && x < 165 && y > 150 && y < 165) ? [230, 20, 30] : [x, x, x]);
  const wyn = paletaZPikseli(p, w*h, 5);
  const czerwien = wyn.some(c => c[0] > 180 && c[1] < 70 && c[2] < 80);
  sprawdz(czerwien, "mała czerwona plama (0,6% pikseli) przeżywa w palecie 5 kolorów: " + wyn.map(c => c.join("/")).join(" "));
}
{
  const w = 300, h = 200, p = obraz(w, h, () => [los()*256|0, los()*256|0, los()*256|0]);
  const a = paletaZPikseli(p, w*h, 8), b = paletaZPikseli(p, w*h, 8);
  sprawdz(a.length === 8 && JSON.stringify(a) === JSON.stringify(b), "szum: 8 kolorów, powtarzalnie");
  const jednolity = paletaZPikseli(obraz(10, 10, () => [9, 9, 9]), 100, 6);
  sprawdz(jednolity.length === 1, "obraz jednokolorowy → jeden kolor (apka mówi wtedy, że nie ma z czego zrobić palety)");
}

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
