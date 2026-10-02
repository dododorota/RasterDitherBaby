/* Klatki kluczowe: interpolacja, zaokrąglenie do kroku suwaka, granice,
   dodawanie, nadpisywanie i usuwanie. Uruchom: node testy/animacja.mjs */
import { SCIEZKI, KONW, ustawKlucz, usunKlucz, kluczW, czyAnimowany, wartoscSuwaka, wartoscS, zastosuj, wyczysc } from "../src/animacja.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };

console.log("--- interpolacja ---");
wyczysc();
ustawKlucz("bri", 1, -20);
ustawKlucz("bri", 3, 40);
sprawdz(wartoscSuwaka("bri", 0) === -20 && wartoscSuwaka("bri", 1) === -20, "przed pierwszą klatką: jej wartość");
sprawdz(wartoscSuwaka("bri", 5) === 40, "po ostatniej: jej wartość");
sprawdz(wartoscSuwaka("bri", 2) === 10, "w połowie: dokładnie środek (" + wartoscSuwaka("bri", 2) + ")");
const ćwierć = wartoscSuwaka("bri", 1.5);
sprawdz(ćwierć > -20 && ćwierć < -5, "po ćwierci drogi bliżej startu niż liniowo (wygładzony start): " + ćwierć);
let rosnie = true, prev = -Infinity;
for(let t=0; t<=4; t+=0.01){ const v = wartoscSuwaka("bri", t); if(v < prev) rosnie = false; prev = v; }
sprawdz(rosnie, "między dwiema klatkami wartość nie cofa się");
sprawdz(Number.isInteger(wartoscSuwaka("bri", 1.37)), "wynik zaokrąglony do kroku suwaka");

console.log("--- dodawanie, nadpisywanie, usuwanie ---");
ustawKlucz("bri", 2, 0);
sprawdz(SCIEZKI.bri.map(k => k.t).join() === "1,2,3", "nowa klatka w środku — posortowane po czasie");
ustawKlucz("bri", 2.0004, 5);
sprawdz(SCIEZKI.bri.length === 3 && SCIEZKI.bri[1].v === 5, "ta sama chwila (±1 ms) nadpisuje, nie dubluje");
sprawdz(kluczW("bri", 3) === 2 && kluczW("bri", 2.5) === -1, "szukanie klatki po czasie");
usunKlucz("bri", 2); usunKlucz("bri", 1);
sprawdz(SCIEZKI.bri.length === 1 && wartoscSuwaka("bri", 0) === 40, "jedna klatka = stała wartość");
usunKlucz("bri", 3);
sprawdz(!czyAnimowany("bri") && wartoscSuwaka("bri", 1) === null, "usunięcie ostatniej kończy animację parametru");

console.log("--- przeliczenie na S i granice suwaka ---");
KONW.gam = {zS: v => v/100, min: 30, max: 300};
ustawKlucz("gam", 0, 100);
ustawKlucz("gam", 2, 500);              /* spoza zakresu suwaka */
sprawdz(wartoscS("gam", 0) === 1 && wartoscS("gam", 2) === 3, "gamma: suwak 100 → 1, 500 przycięte do 300 → 3");
const S = {gam: 1, bri: 0, con: 7};
ustawKlucz("bri", 0, -50); ustawKlucz("bri", 2, 50);
zastosuj(S, 1);
sprawdz(S.bri === 0 && S.gam === 3 && S.con === 7, "zastosuj: animowane ustawione (gamma w połowie 100→500 = 300, czyli 3), reszta nietknięta");

wyczysc();
sprawdz(!Object.keys(SCIEZKI).length, "wyczyść usuwa wszystko");

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
