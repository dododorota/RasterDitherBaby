/* Kontener MP4: plik jest rozbierany z powrotem na pudełka i sprawdzany —
   kolejność, rozmiary, tablice próbek, przesunięcie danych, czasy. Czy
   przeglądarka go odtwarza, sprawdza testy/przegladarka.mjs (prawdziwy koder
   H.264), bo tu nie ma czym zakodować obrazu.
   Uruchom z katalogu projektu: node testy/mp4.mjs */
import { zlozMp4, czasyProbek, SKALA_CZASU } from "../src/mp4.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };

/* drzewo pudełek; dzieci tylko dla kontenerów, które znamy */
const KONTENERY = new Set(["moov", "trak", "mdia", "minf", "stbl", "dinf", "edts"]);
function pudla(b, od, doo){
  const v = new DataView(b.buffer, b.byteOffset), wyn = [];
  let o = od;
  while(o < doo){
    const dl = v.getUint32(o), typ = String.fromCharCode(...b.subarray(o+4, o+8));
    if(dl < 8 || o + dl > doo) throw new Error("zły rozmiar pudełka " + typ + " w " + o);
    const p = {typ, o, dl, tresc: b.subarray(o+8, o+dl)};
    if(KONTENERY.has(typ)) p.dzieci = pudla(b, o+8, o+dl);
    wyn.push(p);
    o += dl;
  }
  if(o !== doo) throw new Error("pudełka nie domykają się");
  return wyn;
}
const znajdz = (lista, sciezka) => {
  let p = {dzieci: lista};
  for(const t of sciezka.split("/")) p = p && p.dzieci && p.dzieci.find(x => x.typ === t);
  return p;
};
const u32 = (t, o) => new DataView(t.buffer, t.byteOffset).getUint32(o);

/* sztuczne próbki: treść to numer klatki, żeby dało się je odnaleźć w mdat */
function probki(n, fps, kluczCo, kolejnosc){
  const us = 1e6/fps;
  const lista = Array.from({length: n}, (_, i) => ({
    dane: new Uint8Array(100 + (i*37) % 400).fill(i & 255),
    pts: Math.round(i*us), dur: Math.round(us), klucz: i % kluczCo === 0
  }));
  return kolejnosc ? kolejnosc.map(i => lista[i]) : lista;
}
const avcC = Uint8Array.from([1, 0x64, 0, 0x28, 0xFF, 0xE1, 0, 4, 0x67, 0x64, 0, 0x28, 1, 0, 4, 0x68, 0xEE, 0x3C, 0x80]);

async function rozbierz(czesci){
  const b = new Uint8Array(await new Blob(czesci).arrayBuffer());
  return {b, drzewo: pudla(b, 0, b.length)};
}

console.log("--- 300 klatek, 29,97 kl/s, klucz co 60 ---");
{
  const fps = 30000/1001, pr = probki(300, fps, 60);
  const {b, drzewo} = await rozbierz(zlozMp4({szer: 1400, wys: 1050, avcC, probki: pr}));
  sprawdz(drzewo.map(p => p.typ).join(",") === "ftyp,moov,mdat", "kolejność: ftyp, moov, mdat (faststart)");
  const stbl = "moov/trak/mdia/minf/stbl";
  const stsz = znajdz(drzewo, stbl + "/stsz").tresc, stco = znajdz(drzewo, stbl + "/stco").tresc;
  const n = u32(stsz, 8);
  sprawdz(n === 300, "stsz: " + n + " próbek");
  let ok = true;
  for(let i=0;i<n;i++) if(u32(stsz, 12 + i*4) !== pr[i].dane.length) ok = false;
  sprawdz(ok, "stsz: rozmiary zgodne");
  const mdat = drzewo[2], start = u32(stco, 8);
  sprawdz(start === mdat.o + 8, "stco wskazuje początek danych w mdat (" + start + ")");
  let o = start; ok = true;
  for(const p of pr){ if(b[o] !== p.dane[0] || b[o + p.dane.length - 1] !== p.dane[0]) ok = false; o += p.dane.length; }
  sprawdz(ok && o === b.length, "dane próbek leżą po kolei, do końca pliku");
  const stts = znajdz(drzewo, stbl + "/stts").tresc;
  sprawdz(u32(stts, 4) === 1 && u32(stts, 8) === 300 && u32(stts, 12) === 3003, "stts: 300 × 3003 tyknięć (29,97 kl/s co do tyknięcia)");
  const stss = znajdz(drzewo, stbl + "/stss").tresc;
  sprawdz(u32(stss, 4) === 5 && u32(stss, 8) === 1 && u32(stss, 12) === 61, "stss: klatki kluczowe 1, 61, …");
  sprawdz(!znajdz(drzewo, stbl + "/ctts") && !znajdz(drzewo, "moov/trak/edts"), "bez klatek B: bez ctts i bez listy edycji");
  const mvhd = znajdz(drzewo, "moov/mvhd").tresc, mdhd = znajdz(drzewo, "moov/trak/mdia/mdhd").tresc;
  sprawdz(u32(mvhd, 12) === SKALA_CZASU && u32(mvhd, 16) === 300*3003, "mvhd: czas trwania " + (u32(mvhd, 16)/SKALA_CZASU).toFixed(3) + " s");
  sprawdz(u32(mdhd, 16) === 300*3003, "mdhd: ten sam czas trwania");
  const tkhd = znajdz(drzewo, "moov/trak/tkhd").tresc;
  sprawdz(u32(tkhd, 76) === 1400 << 16 && u32(tkhd, 80) === 1050 << 16, "tkhd: 1400×1050");
  const stsd = znajdz(drzewo, stbl + "/stsd").tresc;
  const avc1 = stsd.subarray(8);
  sprawdz(String.fromCharCode(...avc1.subarray(4, 8)) === "avc1" && u32(avc1, 0) === 86 + 8 + avcC.length,
          "stsd: avc1 z avcC (" + u32(avc1, 0) + " B)");
  const zAvcC = avc1.subarray(86 + 8);
  sprawdz(zAvcC.every((v, i) => v === avcC[i]), "avcC przepisany bez zmian");
}

console.log("--- klatki B: kolejność dekodowania inna niż pokazywania ---");
{
  /* I P B B P B B … — koder oddaje 0, 3, 1, 2, 6, 4, 5 */
  const kol = [0, 3, 1, 2, 6, 4, 5];
  const pr = probki(7, 25, 100, kol);
  const c = czasyProbek(pr);
  const pts = pr.map(p => Math.round(p.pts*SKALA_CZASU/1e6));
  let dts = 0, ok = true;
  const d = [];
  for(let i=0;i<pr.length;i++){ d.push(dts); dts += c.delty[i]; }
  for(let i=0;i<pr.length;i++){
    if(d[i] + c.ctts[i] - c.przes !== pts[i]) ok = false;   /* pokazanie = dekodowanie + ctts, po zdjęciu przesunięcia */
    if(c.ctts[i] < 0) ok = false;
    if(i && d[i] < d[i-1]) ok = false;
  }
  sprawdz(ok, "czas pokazania = czas dekodowania + ctts, ctts ≥ 0, dekodowanie rosnące");
  sprawdz(c.przes === 3600 && c.trwanie === 7*3600, "przesunięcie o jedną klatkę, czas trwania 7 klatek");
  const {drzewo} = await rozbierz(zlozMp4({szer: 640, wys: 360, avcC, probki: pr}));
  const elst = znajdz(drzewo, "moov/trak/edts/elst");
  sprawdz(!!znajdz(drzewo, "moov/trak/mdia/minf/stbl/ctts") && elst && u32(elst.tresc, 12) === 3600,
          "ctts jest, lista edycji zdejmuje przesunięcie");
}

console.log("--- zmienne długości klatek (GIF) ---");
{
  const dl = [0.1, 0.07, 0.5, 0.1];
  let t = 0;
  const pr = dl.map((d, i) => { const p = {dane: Uint8Array.of(i), pts: Math.round(t*1e6), dur: Math.round(d*1e6), klucz: true}; t += d; return p; });
  const c = czasyProbek(pr);
  sprawdz(JSON.stringify(c.delty) === JSON.stringify([9000, 6300, 45000, 9000]), "delty: " + c.delty.join(", "));
  const {drzewo} = await rozbierz(zlozMp4({szer: 100, wys: 100, avcC, probki: pr}));
  sprawdz(!znajdz(drzewo, "moov/trak/mdia/minf/stbl/stss"), "same klatki kluczowe: bez stss");
}

console.log("--- błędy ---");
let rzucil = false;
try{ zlozMp4({szer: 10, wys: 10, avcC, probki: []}); } catch{ rzucil = true; }
sprawdz(rzucil, "pusta lista próbek rzuca błąd");
rzucil = false;
try{ zlozMp4({szer: 10, wys: 10, avcC: null, probki: probki(1, 30, 1)}); } catch{ rzucil = true; }
sprawdz(rzucil, "brak avcC rzuca błąd");

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
