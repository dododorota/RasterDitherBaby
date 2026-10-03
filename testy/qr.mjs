/* Koder kodów QR (src/qr.js) i siatka QR w rastrze.
   Poprawność kodów sprawdzona niezależnym dekoderem (jsQR) przy pisaniu —
   tu, bez zależności, pilnujemy jej odciskami tamtych kodów i własnościami
   ze standardu: wzory szukania, linie taktujące, format zapisany dwa razy
   i zgodny z kodem BCH, informacja o wersji od wersji 7.
   Uruchom: node testy/qr.mjs */
import { kodQR } from "../src/qr.js";
import { S, DEFAULTS } from "../src/state.js";
import { geometria } from "../src/siatki.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };
const odcisk = q => { let h = 2166136261; for(const w of q.moduly) for(const c of w) h = Math.imul(h ^ (c ? 1 : 0), 16777619); return (h >>> 0).toString(16); };

console.log("--- kody odczytane przez jsQR (odciski) ---");
for(const [t, p, v, wersja, maska, od] of [
  ["https://example.com", "M", 1, 2, 2, "4a1cfa41"],
  ["Zażółć gęślą jaźń 🌸", "H", 1, 4, 2, "3ff8a6b0"],
  ["A".repeat(300), "L", 1, 11, 3, "d317f3d7"],
  ["1234567890".repeat(70), "Q", 7, 25, 2, "6665b6b3"]
]){
  const q = kodQR(t, p, v);
  sprawdz(q.wersja === wersja && q.maska === maska && odcisk(q) === od, `${t.slice(0, 20)}… (${p}): wersja ${q.wersja}, maska ${q.maska}, odcisk ${odcisk(q)}`);
}

console.log("--- własności ze standardu ---");
for(const [t, p] of [["https://example.com", "M"], ["x".repeat(200), "H"]]){
  const q = kodQR(t, p), N = q.rozmiar, m = q.moduly;
  const szukanie = (cx, cy) => { for(let dy=-3; dy<=3; dy++) for(let dx=-3; dx<=3; dx++){ const d = Math.max(Math.abs(dx), Math.abs(dy)); if(m[cy+dy][cx+dx] !== (d !== 2)) return false; } return true; };
  sprawdz(N === q.wersja*4 + 17 && szukanie(3, 3) && szukanie(N - 4, 3) && szukanie(3, N - 4), `wersja ${q.wersja}: ${N}×${N}, trzy wzory szukania`);
  let takt = true; for(let i=8; i<N - 8; i++) if(m[6][i] !== (i % 2 === 0) || m[i][6] !== (i % 2 === 0)) takt = false;
  sprawdz(takt && m[N - 8][8], "linie taktujące na przemian, ciemny moduł przy lewym dolnym rogu");
  /* format: 15 bitów z dwóch miejsc musi być taki sam i być słowem kodu BCH (15,5) z maską 0x5412 */
  const a = [], b = [];
  for(let i=0; i<=5; i++) a.push(m[i][8]); a.push(m[7][8], m[8][8], m[8][7]); for(let i=9; i<15; i++) a.push(m[8][14 - i]);
  for(let i=0; i<8; i++) b.push(m[8][N - 1 - i]); for(let i=8; i<15; i++) b.push(m[N - 15 + i][8]);
  const liczba = bity => bity.reduce((s, x, i) => s | ((x ? 1 : 0) << i), 0);
  const f = liczba(a) ^ 0x5412, dane = f >>> 10;
  let r = dane; for(let i=0; i<10; i++) r = (r << 1) ^ ((r >>> 9)*0x537);
  sprawdz(liczba(a) === liczba(b) && (dane << 10 | r) === f && (dane & 7) === q.maska && (dane >>> 3) === {L: 1, M: 0, Q: 3, H: 2}[p],
          `format zapisany dwa razy, poprawny kod BCH: poziom ${p}, maska ${q.maska}`);
}
{
  const q = kodQR("x".repeat(200), "H");
  sprawdz(q.wersja >= 7, `wersja ${q.wersja} (≥ 7) — z informacją o wersji`);
  let r = q.wersja; for(let i=0; i<12; i++) r = (r << 1) ^ ((r >>> 11)*0x1F25);
  const b = q.wersja << 12 | r, N = q.rozmiar;
  let zgodne = true; for(let i=0; i<18; i++){ const c = ((b >>> i) & 1) !== 0, x = N - 11 + i % 3, y = Math.floor(i/3); if(q.moduly[y][x] !== c || q.moduly[x][y] !== c) zgodne = false; }
  sprawdz(zgodne, "informacja o wersji (18 bitów, kod Golaya) w obu rogach");
}
let blad = null; try{ kodQR("x".repeat(4000), "H"); }catch(e){ blad = e.message; }
sprawdz(blad === "za dużo tekstu na kod QR", "za długi tekst — czytelny błąd");

console.log("--- siatka QR w rastrze ---");
{
  const W = 300, H = 200, step = 2, sw = W/step, sh = H/step, d = new Uint8ClampedArray(sw*sh*4);
  for(let i=0; i<d.length; i+=4){ d[i] = d[i+1] = d[i+2] = 128; d[i+3] = 255; }
  Object.assign(S, DEFAULTS, {siatka: "qr", qrTekst: "https://example.com", qrKorekcja: "M", qrRozmiar: 90});
  const ink = {ang: 30, cov: r => 1 - r/255, off: [0, 0]};
  const g1 = geometria({d, sw, sh, step}, W, H, ink, 1), g3 = geometria({d, sw, sh, step}, W, H, ink, 3);
  const q = kodQR("https://example.com", "M"), bok = 200*0.9, m = bok/(q.rozmiar + 8);
  const ciemnych = q.moduly.flat().filter(Boolean).length;
  sprawdz(g1.dodatki.length === ciemnych, `każdy ciemny moduł ma kwadrat (${ciemnych})`);
  /* w strefie ciszy (4 moduły wokół kodu) nie ma punktów */
  const x0 = (W - bok)/2, y0 = (H - bok)/2, wCiszy = ([x, y]) => x > x0 && x < x0 + bok && y > y0 && y < y0 + bok &&
    !(x > x0 + 4*m && x < x0 + bok - 4*m && y > y0 + 4*m && y < y0 + bok - 4*m);
  sprawdz(!g1.kropki.some(wCiszy) && g1.kropki.length > 100, `strefa ciszy pusta, ${g1.kropki.length} punktów obrazu`);
  sprawdz(g1.kropki.every((p, i) => Math.abs(p[0]*3 - g3.kropki[i][0]) < 1e-9 && Math.abs(p[2]*3 - g3.kropki[i][2]) < 1e-9) &&
          g1.dodatki.every((k, i) => k.every((p, j) => Math.abs(p[0]*3 - g3.dodatki[i][j][0]) < 1e-9)), "z=3: punkty i kwadraty dokładnie ×3");
}

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
