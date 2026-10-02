/* ASCII: wybór znaków po jasności, kierunek rampy zależny od tła, kolory,
   powtarzany tekst, własne znaki. Uruchom: node testy/ascii.mjs */
import { S, DEFAULTS } from "../src/state.js";
import { siatkaAscii, rampa, ZESTAWY, wymiaryKomorki } from "../src/ascii-znaki.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };
const ustaw = o => Object.assign(S, DEFAULTS, o);
function komorki(kol, wier, f){
  const p = new Uint8ClampedArray(kol*wier*4);
  for(let y=0;y<wier;y++) for(let x=0;x<kol;x++){ const o=(y*kol+x)*4, c=f(x,y); p[o]=c[0]; p[o+1]=c[1]; p[o+2]=c[2]; p[o+3]=255; }
  return p;
}
const poziomy = (kol) => komorki(kol, 1, x => { const v = Math.round(x*255/(kol-1)); return [v, v, v]; });

console.log("--- rampa ---");
ustaw({paper: "#000000"});
{
  const R = ZESTAWY.standard, a = siatkaAscii(poziomy(R.length), R.length, 1);
  sprawdz(a.znaki[0] === R, `ciemne tło: od czerni do bieli cała rampa po kolei — „${a.znaki[0]}”`);
}
ustaw({paper: "#ffffff"});
{
  const R = ZESTAWY.standard, a = siatkaAscii(poziomy(R.length), R.length, 1);
  sprawdz(a.znaki[0] === [...R].reverse().join(""), `jasne tło: odwrotnie — „${a.znaki[0]}”`);
}
ustaw({asciiZestaw: "wlasne", asciiWlasne: "aab"});
sprawdz(rampa() === "ab", "własne znaki: bez powtórzeń");
ustaw({asciiZestaw: "wlasne", asciiWlasne: "#"});
sprawdz(rampa() === " #", "jeden własny znak: dopełniony spacją");
ustaw({asciiRozmiar: 20});
sprawdz(wymiaryKomorki().join() === "12,20", "komórka 0,6 × wysokość: 12×20");

console.log("--- kolory ---");
{
  const p = komorki(3, 1, x => [[200, 30, 30], [30, 200, 30], [30, 30, 200]][x]);
  ustaw({paper: "#000000", asciiKolor: "obraz"});
  sprawdz([...siatkaAscii(p, 3, 1).kolory].join() === "200,30,30,30,200,30,30,30,200", "z obrazu: kolor komórki");
  ustaw({paper: "#000000", asciiKolor: "jeden", ink: "#33ff66"});
  sprawdz([...siatkaAscii(p, 3, 1).kolory].join() === "51,255,102,51,255,102,51,255,102", "jeden kolor: kolor znaków");
  ustaw({paper: "#000000", asciiKolor: "paleta", pal: "cga"});
  const k = [...siatkaAscii(p, 3, 1).kolory];
  const cga = new Set(["0,0,0", "85,255,255", "255,85,255", "255,255,255"]);
  sprawdz([0, 3, 6].every(i => cga.has(k.slice(i, i+3).join())), "z palety: tylko kolory palety (CGA)");
}

console.log("--- tryby ---");
{
  ustaw({paper: "#000000", asciiTryb: "tekst", asciiWlasne: "ABC"});
  const p = komorki(5, 2, (x, y) => (x === 2 && y === 0) ? [0, 0, 0] : [200, 200, 200]);
  const a = siatkaAscii(p, 5, 2);
  sprawdz(a.znaki.join("|") === "AB CA|BCABC", "powtarzany tekst, ciemna komórka pusta: " + a.znaki.join("|"));
  ustaw({paper: "#000000", asciiZestaw: "binarny", asciiDither: true});
  const s = komorki(40, 40, () => [64, 64, 64]), b = siatkaAscii(s, 40, 40);   /* 25% — między spacją a „1” */
  const ile = {}; for(const w of b.znaki) for(const c of w) ile[c] = (ile[c] || 0) + 1;
  sprawdz(Math.abs((ile["1"] || 0)/1600 - 0.5) < 0.05 && Math.abs((ile[" "] || 0)/1600 - 0.5) < 0.05, "dithering znaków: szarość 25% to pół na pół spacja i „1” " + JSON.stringify(ile));
  const c = siatkaAscii(s, 40, 40);
  sprawdz(b.znaki.join() === c.znaki.join(), "powtarzalnie");
}

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
