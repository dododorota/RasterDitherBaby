/* Klatki kluczowe: interpolacja, zaokrąglenie do kroku suwaka, granice,
   dodawanie, nadpisywanie i usuwanie. Uruchom: node testy/animacja.mjs */
import { SCIEZKI, KONW, ustawKlucz, usunKlucz, kluczW, czyAnimowany, wartoscSuwaka, wartoscS, zastosuj, wyczysc, zrzut, wczytaj, ustawKrzywa, KRZYWE, ustawKrzywaKlucza, krzywaKlucza, cel } from "../src/animacja.js";

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

console.log("--- zapis w presecie ---");
KONW.bri = {zS: v => v, min: -100, max: 100};
ustawKlucz("bri", 0, -40); ustawKlucz("bri", 2.5, 60); ustawKlucz("gam", 1, 150);
const z = JSON.parse(JSON.stringify(zrzut()));
sprawdz(JSON.stringify(z) === '{"bri":[[0,-40],[2.5,60]],"gam":[[1,150]]}', "zrzut: " + JSON.stringify(z));
wyczysc();
sprawdz(wczytaj(z) === 0 && JSON.stringify(zrzut()) === JSON.stringify(z), "wczytanie zrzutu odtwarza klatki co do wartości");
const zle = wczytaj({bri: [[0, 500], [-1, 3], [1, "x"], [2]], nieznany: [[0, 1]], gam: "nie lista"});
sprawdz(zle === 5 && JSON.stringify(zrzut()) === '{"bri":[[0,100]]}', "nieufnie: wartość przycięta do suwaka, złe wpisy i nieznane parametry pominięte (" + zle + ")");
sprawdz(wczytaj(null) === 1 && !Object.keys(zrzut()).length, "zły typ: nic nie wczytane");

console.log("--- krzywe przejścia ---");
wyczysc();
ustawKlucz("bri", 0, 0); ustawKlucz("bri", 4, 80);
const w = () => [1, 2, 3].map(s => wartoscSuwaka("bri", s)).join();
sprawdz(w() === "13,40,68", "płynnie (domyślnie, 67,5 → 68): " + w());
ustawKrzywa("bri", "liniowo");
sprawdz(w() === "20,40,60", "liniowo: " + w());
ustawKrzywa("bri", "skokowo");
sprawdz(w() === "0,0,0" && wartoscSuwaka("bri", 4) === 80, "skokowo: trzyma do następnej klatki, potem 80");
const zk = JSON.parse(JSON.stringify(zrzut()));
sprawdz(JSON.stringify(zk) === '{"bri":{"krzywa":"skokowo","klatki":[[0,0],[4,80]]}}', "w presecie krzywa zapisana: " + JSON.stringify(zk));
wyczysc();
sprawdz(wczytaj(zk) === 0 && KRZYWE.bri === "skokowo" && w() === "0,0,0", "wczytana z presetu");
sprawdz(wczytaj({bri: {krzywa: "zygzak", klatki: [[0, 5]]}}) === 1 && !KRZYWE.bri && wartoscSuwaka("bri", 0) === 5, "nieznana krzywa: odrzucona, klatki zostają");
usunKlucz("bri", 0);
sprawdz(!KRZYWE.bri, "usunięcie ostatniej klatki usuwa też krzywą");
wyczysc();
wyczysc();

console.log("--- krzywa pojedynczej klatki ---");
{
  wyczysc();
  KONW.bri = {zS: v => v, min: -100, max: 100};
  ustawKlucz("bri", 0, 0); ustawKlucz("bri", 1, 100); ustawKlucz("bri", 2, 0);
  ustawKrzywaKlucza("bri", 0, "liniowo");
  sprawdz(wartoscSuwaka("bri", 0.25) === 25, "odcinek od klatki z krzywą liniową: liniowo (" + wartoscSuwaka("bri", 0.25) + ")");
  sprawdz(wartoscSuwaka("bri", 1.25) === 84, "następny odcinek: dalej płynnie jak ścieżka (" + wartoscSuwaka("bri", 1.25) + ")");
  ustawKrzywaKlucza("bri", 1, "skokowo");
  sprawdz(wartoscSuwaka("bri", 1.9) === 100 && wartoscSuwaka("bri", 2) === 0, "skokowo: trzyma do następnej klatki");
  ustawKlucz("bri", 1, 80);
  sprawdz(krzywaKlucza("bri", 1) === "skokowo", "nadpisanie wartości zostawia krzywą klatki");
  ustawKrzywa("bri", "liniowo");
  sprawdz(wartoscSuwaka("bri", 0.25) === 20 && krzywaKlucza("bri", 0) === "liniowo", "krzywa ścieżki nie rusza krzywych klatek");
  const z = zrzut();
  sprawdz(JSON.stringify(z.bri) === JSON.stringify({krzywa: "liniowo", klatki: [[0, 0, "liniowo"], [1, 80, "skokowo"], [2, 0]]}), "zapis: krzywa klatki trzecim elementem " + JSON.stringify(z.bri));
  wczytaj(z);
  sprawdz(krzywaKlucza("bri", 0) === "liniowo" && krzywaKlucza("bri", 1) === "skokowo" && krzywaKlucza("bri", 2) === null, "odczyt przywraca krzywe klatek");
  const odrz = wczytaj({bri: [[0, 0, "sprezyscie"], [1, 50, 7], [2, 10]]});
  sprawdz(odrz === 2 && SCIEZKI.bri.length === 3 && SCIEZKI.bri.every(k => !k.k), "nieznana krzywa klatki odrzucona, klatka zostaje (" + odrz + " odrzucone)");
  sprawdz(wczytaj({bri: [[0, 0], [1, 50]]}) === 0, "stary zapis (dwa elementy) bez zmian");
  ustawKrzywaKlucza("bri", 0, "liniowo"); ustawKrzywaKlucza("bri", 0, null);
  sprawdz(krzywaKlucza("bri", 0) === null, "null przywraca krzywą ścieżki");
  wyczysc();
}

console.log("--- parametry spoza S (warstwy) ---");
{
  wyczysc();
  const warstwa = {x: 0}; let zlozono = 0;
  cel("w", (k, v) => { if(k === "w:7:x") warstwa.x = v; }, () => zlozono++);
  KONW["w:7:x"] = {zS: v => v, min: -20000, max: 20000};
  KONW.bri = {zS: v => v, min: -100, max: 100};
  ustawKlucz("w:7:x", 0, 100); ustawKlucz("w:7:x", 2, 300); ustawKlucz("bri", 0, 10); ustawKlucz("bri", 2, 30);
  const S = {bri: 0};
  zastosuj(S, 1);
  sprawdz(warstwa.x === 200 && S.bri === 20 && !("w:7:x" in S), "klucz warstwy trafia do celu, nie do S (x " + warstwa.x + ")");
  sprawdz(zlozono === 1, "po ustawieniu wszystkich wartości cel składa raz");
  const z = zrzut();
  sprawdz(Object.keys(z).join() === "bri", "do presetu idzie tylko wygląd, bez warstw");
  wczytaj({bri: [[0, 5]]});
  sprawdz(SCIEZKI["w:7:x"] && SCIEZKI["w:7:x"].length === 2, "wczytanie presetu z animacją nie kasuje animacji warstw");
  wyczysc();
}

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
