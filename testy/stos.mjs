/* Stos efektów i nowe efekty: lista i jej zapis w S.efekty, zgodność ze
   starymi presetami, każdy efekt (działa, jest powtarzalny, przy zerze nic nie
   robi) i zapis w skali — faktura, ziarno i JPEG jako powiększenie podglądu.
   Uruchom z katalogu projektu: node testy/stos.mjs */
import { S, DEFAULTS } from "../src/state.js";
import { lista, czynne, dodaj, usun, przelacz, przesun, uruchomNaBuforze, uruchomWSkali, EFEKTY } from "../src/stos.js";
import { zabarwienie, aberracja, jpeg, warstwaGwiazd, faktura, obrobka, zmiennoscPrzed, FAKTURY } from "../src/fx.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };
const ustaw = o => { Object.assign(S, DEFAULTS, {klatkaNr: 0}, o); };
let ziarno = 9;
const los = () => (ziarno = (Math.imul(ziarno, 1664525) + 1013904223) >>> 0) / 4294967296;
function obraz(w, h, f){
  const p = new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const o=(y*w+x)*4, c=f(x,y); p[o]=c[0]; p[o+1]=c[1]; p[o+2]=c[2]; p[o+3]=255; }
  return p;
}
const gradient = (w, h) => obraz(w, h, (x, y) => [x*255/(w-1), y*255/(h-1), (x*y) % 256]);
const rowne = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function powieksz(p, w, h, z){
  const q = new Uint8ClampedArray(w*z*h*z*4);
  for(let y=0;y<h*z;y++) for(let x=0;x<w*z;x++){ const s=(((y/z)|0)*w + ((x/z)|0))*4, d=(y*w*z+x)*4; for(let k=0;k<4;k++) q[d+k]=p[s+k]; }
  return q;
}

console.log("--- lista ---");
ustaw({});
sprawdz(lista().length === 0 && czynne().length === 0, "domyślnie pusto");
ustaw({sort: "pionowo", glow: 50});
sprawdz(lista().map(e => e.id).join() === "sort,glow", "stary preset (bez S.efekty): sortowanie i poświata w dawnej kolejności");
ustaw({efekty: "jpeg,!tint,xyz,jpeg,glow", tint: 50, glow: 40});
sprawdz(JSON.stringify(lista()) === JSON.stringify([{id:"jpeg",widoczny:true},{id:"tint",widoczny:false},{id:"glow",widoczny:true}]),
        "z tekstu: nieznane i powtórzone wylatują, ! = ukryty");
sprawdz(czynne().join() === "jpeg,glow", "czynne: bez ukrytych");
ustaw({sort: "poziomo"});
dodaj("tint");
sprawdz(S.efekty === "sort,tint" && S.tint === 70, "dodanie do starego presetu zapisuje pełną listę i ustawienia startowe: " + S.efekty);
przesun("tint", -1);
sprawdz(S.efekty === "tint,sort", "przesunięcie w górę");
przelacz("sort");
sprawdz(S.efekty === "tint,!sort", "ukrycie");
usun("tint");
sprawdz(S.efekty === "!sort" && S.tint === DEFAULTS.tint, "usunięcie zeruje parametry efektu");
sprawdz(EFEKTY.every(e => e.klucze.every(k => k in DEFAULTS)), "każdy klucz efektu ma wartość domyślną");

console.log("--- efekty: działają, powtarzalnie, zero = nic ---");
const PRZYPADKI = [
  ["zabarwienie", {tint: 70}, p => zabarwienie(p)],
  ["aberracja", {chrom: 25}, (p, w, h) => aberracja(p, w, h)],
  ["JPEG", {jpegJakosc: 10}, (p, w, h) => jpeg(p, w, h)],
  ["JPEG z uszkodzeniami", {jpegJakosc: 30, jpegGlitch: 80, jpegZiarno: 5}, (p, w, h) => jpeg(p, w, h)],
  ["faktura", {faktura: "rozeta", faktKrycie: 60}, (p, w, h) => faktura(p, w, h, 1)],
  ["obróbka", {winieta: 60, postZiarno: 40, postKon: 30}, (p, w, h) => obrobka(p, w, h, 1)],
];
for(const [nazwa, ust, f] of PRZYPADKI){
  ustaw(ust);
  const w = 64, h = 48, a = gradient(w, h), b = gradient(w, h), zr = gradient(w, h);
  f(a, w, h); f(b, w, h);
  let rozne = 0; for(let i=0;i<a.length;i++) if(a[i] !== zr[i]) rozne++;
  sprawdz(rozne > 0 && rowne(a, b), `${nazwa}: zmienia ${rozne} bajtów, powtarzalnie`);
}
ustaw({});
{
  const w = 40, h = 30, p = gradient(w, h), q = new Uint8ClampedArray(p);
  zabarwienie(q); aberracja(q, w, h); faktura(q, w, h, 1); obrobka(q, w, h, 1);
  sprawdz(rowne(p, q), "parametry domyślne: obraz bez zmian");
}
for(const nazwa of Object.keys(FAKTURY)){
  ustaw({faktura: nazwa, faktKrycie: 100, faktTryb: "mnoz"});
  const p = obraz(24, 24, () => [255, 255, 255]); faktura(p, 24, 24, 1);
  const kolory = new Set(); for(let i=0;i<p.length;i+=4) kolory.add(p[i]+","+p[i+1]+","+p[i+2]);
  if(kolory.size < 2){ sprawdz(false, `faktura ${nazwa}: jednolita`); }
}
sprawdz(true, `wszystkie ${Object.keys(FAKTURY).length} faktury dają wzór`);

console.log("--- JPEG: struktura bloków ---");
{
  /* płaska szarość z czarnym kwadratem 3×3 w środku bloku: zniekształcenia
     (zafalowania wokół kwadratu) zostają w jego bloku 8×8, reszta nietknięta */
  ustaw({jpegJakosc: 30});
  const w = 32, h = 32, kw = (x, y) => x >= 10 && x <= 12 && y >= 11 && y <= 13;
  const p = obraz(w, h, (x, y) => kw(x, y) ? [0, 0, 0] : [128, 128, 128]);
  jpeg(p, w, h);
  let poza = 0, wewn = 0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ if(kw(x, y)) continue; const d = Math.abs(p[(y*w+x)*4] - 128); if(x >= 8 && x < 16 && y >= 8 && y < 16){ if(d > 2) wewn++; } else if(d > 2) poza++; }
  sprawdz(wewn > 5 && poza === 0, `artefakty tylko w bloku 8×8 trafionego piksela (w bloku ${wewn}, poza ${poza})`);
}

console.log("--- gwiazdki ---");
{
  ustaw({gwiazdy: 150, gwProg: 60, gwRamiona: 4, gwDlugosc: 20, gwKat: 0});
  const w = 61, h = 61, p = obraz(w, h, (x, y) => x === 30 && y === 30 ? [255, 255, 255] : [0, 0, 0]);
  const L = warstwaGwiazd(p, w, h, 1);
  const v = (x, y) => L[(y*w+x)*4];
  sprawdz(v(40, 30) > 0 && v(20, 30) > 0 && v(30, 40) > 0 && v(30, 20) > 0 && v(40, 40) === 0,
          `4 promienie: w prawo ${v(40,30).toFixed(0)}, w lewo ${v(20,30).toFixed(0)}, w dół ${v(30,40).toFixed(0)}, po skosie ${v(40,40)}`);
  sprawdz(v(34, 30) > v(46, 30), "promień słabnie z odległością");
  ustaw({gwiazdy: 150, gwProg: 60, gwRamiona: 6});
  const L6 = warstwaGwiazd(p, w, h, 1);
  sprawdz(L6[(30*w+40)*4] > 0 && L6[(40*w+30)*4] === 0, "6 promieni: inny układ niż 4");
}

console.log("--- zmienność w czasie ---");
{
  ustaw({efekty: "czas", czasSzum: 60});
  const w = 30, h = 20;
  const k = n => { S.klatkaNr = n; const p = obraz(w, h, () => [120, 120, 120]); zmiennoscPrzed(p, w, h, 1); return p; };
  sprawdz(rowne(k(3), k(3)) && !rowne(k(3), k(4)), "ta sama klatka = ten sam szum, następna = inny");
  ustaw({efekty: "czas", czasDrganie: 6});
  S.klatkaNr = 7; const a = gradient(w, h), zr = gradient(w, h); zmiennoscPrzed(a, w, h, 1);
  sprawdz(!rowne(a, zr), "drgania przesuwają obraz");
}

console.log("--- zapis w skali: powiększenie podglądu ---");
for(const [nazwa, ust] of [["faktura", {efekty: "faktura", faktura: "maskaRGB", faktSkala: 2, faktKrycie: 70}],
                           ["ziarno i winieta", {efekty: "post", postZiarno: 60, winieta: 0}],
                           ["JPEG", {efekty: "jpeg", jpegJakosc: 15, jpegGlitch: 40}],
                           ["zabarwienie", {efekty: "tint", tint: 60}],
                           ["sortowanie", {efekty: "sort", sort: "poziomo"}]]){
  for(const z of [2, 3]){
    ustaw(ust);
    const W = 40, H = 24, maly = gradient(W, H);
    const podglad = new Uint8ClampedArray(maly); uruchomWSkali(podglad, podglad, W, H, 1);
    const duzy = powieksz(maly, W, H, z), m = new Uint8ClampedArray(maly);
    uruchomWSkali(duzy, m, W, H, z);
    sprawdz(rowne(duzy, powieksz(podglad, W, H, z)), `${nazwa}, z=${z}: dokładnie powiększony podgląd`);
  }
}

console.log("--- dithering: SVG bez efektów tworzących kolory ---");
{
  ustaw({efekty: "sort,tint,glow", sort: "poziomo", tint: 60, glow: 80});
  const w = 30, h = 20, a = gradient(w, h), b = gradient(w, h);
  uruchomNaBuforze(a, w, h, 1, {wektor: true});
  ustaw({efekty: "sort", sort: "poziomo"});
  uruchomNaBuforze(b, w, h, 1);
  sprawdz(rowne(a, b), "{wektor:true}: zostaje samo sortowanie");
}

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
