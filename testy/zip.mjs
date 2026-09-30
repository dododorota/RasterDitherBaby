/* Zapis ZIP: CRC znanych wartości, nazwy w UTF-8, bezpieczne ścieżki, powtórzone
   nazwy. Paczka jest czytana z powrotem prostym czytnikiem katalogu centralnego,
   więc test nie zależy od systemowego unzip (którego na Windowsie nie ma, a na
   macOS przekręca polskie nazwy).
   Uruchom z katalogu projektu: node testy/zip.mjs */
import { Zip, crc32, bezpiecznaSciezka } from "../src/zip.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };
const enc = s => new TextEncoder().encode(s);

console.log("--- CRC-32 ---");
sprawdz(crc32(enc("123456789")) === 0xcbf43926, "crc32('123456789') = cbf43926");
sprawdz(crc32(new Uint8Array()) === 0, "crc32('') = 0");

console.log("--- ścieżki ---");
sprawdz(bezpiecznaSciezka("/a/./b/../c") === "a/b/c", "„/a/./b/../c” → a/b/c");
sprawdz(bezpiecznaSciezka("C:\\x\\y.png") === "C:/x/y.png", "ukośniki odwrotne → zwykłe");
sprawdz(bezpiecznaSciezka("..") === "plik", "„..” → plik");

console.log("--- paczka ---");
const z = new Zip(), data = new Date(2026, 8, 29, 14, 30, 20);
const wejscie = [
  ["wynik.png", new Uint8Array(Array.from({length:5000},(_,i)=>(i*7)&255))],
  ["podfolder/zdjęcie-żółw.svg", enc("<svg xmlns='http://www.w3.org/2000/svg'/>")],
  ["wynik.png", new Uint8Array([1,2,3])],
  ["../../etc/uciekinier.txt", enc("nie powinien wyjść poza katalog")],
  ["pusty.txt", new Uint8Array()],
];
const nazwy = wejscie.map(([n, b]) => z.dodaj(n, b, data));
sprawdz(JSON.stringify(nazwy) === JSON.stringify(["wynik.png","podfolder/zdjęcie-żółw.svg","wynik-2.png","etc/uciekinier.txt","pusty.txt"]),
        "nazwy w paczce: " + nazwy.join(", "));

const b = new Uint8Array(await z.blob().arrayBuffer()), v = new DataView(b.buffer);
const e = b.length - 22;
sprawdz(v.getUint32(e, true) === 0x06054b50, "koniec katalogu centralnego na swoim miejscu");
const ile = v.getUint16(e + 10, true);
sprawdz(ile === wejscie.length, "liczba wpisów: " + ile);
let o = v.getUint32(e + 16, true);
for(let i=0; i<ile; i++){
  sprawdz(v.getUint32(o, true) === 0x02014b50, "nagłówek wpisu " + i);
  const flagi = v.getUint16(o + 8, true), crc = v.getUint32(o + 16, true), roz = v.getUint32(o + 24, true);
  const nl = v.getUint16(o + 28, true), lokalny = v.getUint32(o + 42, true);
  const nazwa = new TextDecoder().decode(b.subarray(o + 46, o + 46 + nl));
  const start = lokalny + 30 + v.getUint16(lokalny + 26, true);
  const dane = b.subarray(start, start + roz);
  const oryg = wejscie[i][1];
  sprawdz((flagi & 0x0800) && nazwa === nazwy[i] && crc32(dane) === crc && dane.length === oryg.length && dane.every((x,j) => x === oryg[j]),
          `„${nazwa}”: flaga UTF-8, CRC i zawartość zgodne`);
  o += 46 + nl;
}
console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
