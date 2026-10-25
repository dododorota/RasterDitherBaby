# Proces — stan prac i przekazanie

Zapis sesji z 22–30 września 2026 (Mac) i od 1 października 2026 (Windows).
Szczegóły techniczne (dlaczego kod wygląda tak, a nie inaczej) są
w `CLAUDE.md`; tu jest przebieg, stan i to, co zostało otwarte.

## Wznowienie — 25 października 2026 (wieczór)

Wydajność oceniona przez użytkowniczkę: „już jest lepiej” — punkt 1
handoveru niżej zamknięty. **Etapy 1–4 z `PLAN-PASMA-I-EFEKTY.md`
zrobione** (granice pasm z paskiem i uchwytami, Podziel / Rozłóż / Odwróć /
Usuń, pasmo „Puste”, wielkość na pasmo, wtapianie pasm, biblioteka 106
kształtów z okienkiem kafelków). Etapy 1–3 zacommitowała; etap 4
niezacommitowany. Wszystko czeka na jej ocenę (lista „Z 25.10”).
Następny: etap 5 — zestawy kształtów (i „Twoje kształty”).

## Handover — 25 października 2026

Ta sekcja jest na początek następnej sesji.

**Stan:** nic nie jest w toku. Repo czyste, wszystko zacommitowane
i wypchnięte — ostatnie commity `269cbe6` (etap 1 wydajności, plany)
i `6782c63` (raster w workerze), oba 25.10.

**Zrobione 25.10** (punkt 33 niżej, szczegóły i pomiary
w `PLAN-WYDAJNOSC.md`, zasady w `CLAUDE.md` → „Wydajność”):
- Zgłoszenie: zdjęcie 2000×1333 „koszmarnie się tnie”, suwaki stoją —
  u niej „klasyczny raster bez presetów” i mocno „Skan”. Przyczyna: raster
  liczył się na głównym wątku (do 1,2 s blokady na ruch suwaka).
- Raster w workerze (`raster-rysuj.js`, `worker-raster.js`, `plotno.js`):
  blokada suwaków 0 ms wszędzie. Faktura farby szybsza ×2–2,7 (pamięć pól
  szumu). Obraz co do bajtu jak przed zmianą (podgląd, zapis ×2, obrazki
  tonów); wszystkie testy 0 błędów.

**Następne kroki, po kolei:**
1. [ ] **Zapytać o ocenę wydajności** — klasyczny raster i Skan na jej
       zdjęciu pod `http://localhost:8000` (`python serwer.py`). U mnie
       domyślny raster był płynny już przed zmianą (22 ms), więc jeśli
       u niej dalej się tnie, szukać gdzie indziej: czy nie używa starego
       .exe z 3.10, skalowanie Windowsa, rysowanie panelu. Skrypty
       pomiarowe były tymczasowe (katalog sesji) — w razie potrzeby
       odtworzyć wg opisu w `PLAN-WYDAJNOSC.md` i przenieść do `testy/`.
2. [ ] **Nowe funkcje z Dither Boya** — `PLAN-PASMA-I-EFEKTY.md`, decyzje
       z 25.10 już tam są: rozbudowa „Znaków według tonu” (pasma o nierównej
       szerokości z przeciąganymi granicami, wielkość na pasmo, wtapianie,
       biblioteka ~150 kształtów, zestawy) i **wszystkie** efekty (Stress
       Relief, Orbs, Neo Glow, Lick, Lens Curve, Epsilon Glow). Zacząć od
       etapu 1 (pasma). Zrzuty wzoru są tylko w rozmowie z 25.10 — opis
       w planie; kart Lick, Lens Curve, Epsilon Glow jeszcze nie ma
       (użytkowniczka szuka) — przed nimi poprosić o zrzuty.
       Nowy materiał do rysowania (np. kształty-bitmapy) musi trafić też
       do workera rastra — patrz CLAUDE.md.
3. [ ] Dalej otwarte z handoveru 20.10 (niżej): ocena Glitcha i list
       „Z 14.10” … „Z 19.10”, **stary instalator** (`npm run paczka` —
       teraz tym bardziej, bo .exe nie ma poprawek wydajności).

Etap 3 wydajności (poświata rastra na mniejszym obrazie, Glitch Ciecz /
Topnienie ~0,4 s) — tylko jeśli będzie potrzeba, opis w planie.

## Handover — 20 października 2026 (poprzedni)

Poprzedni handover — punkty, których nie odhaczono, dalej aktualne.

**Stan:** nic nie jest w toku. Repo czyste, wszystko zacommitowane
i wypchnięte — ostatni commit `552bc8c` (tryb Glitch, 19.10). Wszystkie
plany (`PLAN-GLITCH.md`, `PLAN-UI.md`, `PLAN-WTYCZKI.md`) odhaczone.
Testy w Node (18 plików z `testy/`, bez `przegladarka` i `wydajnosc-siatki`)
puszczone 20.10 — 0 błędów.

**Co zostało (do wyboru przez użytkowniczkę, zacząć od zapytania):**
- [ ] **Ocena na jej zdjęciach** — listy „Z 14.10” … „Z 19.10” w „Do
      przetestowania na koniec”. Najświeższe: tryb Glitch (presety, film
      w trybie Glitch z „Nowy glitch co kilka klatek” — niesprawdzony,
      zakresy suwaków, szybkość Liquid ~1 s). Poprawić według uwag.
- [ ] **Instalator jest stary** — `dist/` (`Raster Setup 0.1.0.exe`,
      `Raster-0.1.0-przenosny.exe`) z 3.10, bez wszystkiego od wtyczek
      (14.10) po Glitch. Przebudować `npm run paczka` (najlepiej po ocenie
      i poprawkach; ewentualnie podbić `version` w `package.json`).
- [ ] Reszta listy „Na później” niżej (krzywa cieni / świateł we wtyczkach
      VFX, starsze pomysły).

## Wznowienie — 19 października 2026

**Zakładka „Glitch” z efektami wtyczki VFX Glitch — zrobiona** (punkt 32
niżej, checklista `PLAN-GLITCH.md`). Zacommitowane 19.10 (`552bc8c`);
czeka na ocenę użytkowniczki (lista „Z 19.10”). Lista „Na później” niżej dalej aktualna. Przy kolejnych
zmianach we wtyczce: porównać `core/glitch.cpp` / `core/jpeg.cpp`
(AE Plugin Land/VfxGlitch) z `src/glitch.js` / `src/jpeg-glitch.js`
i przeliczyć odciski w `testy/glitch.mjs`.

## Wznowienie — 16 października 2026

Poprawki po pierwszych testach (punkt 31 niżej): odstępy w „Trybie”,
rozwijane listy, mocniejsze cienie / światła, gęstość rastra od 2 px.
Do obejrzenia — lista „Z 16.10”.

### Na później (odłożone przez użytkowniczkę 16.10)

Nic nie jest w toku. Zacząć od zapytania, co z tej listy bierzemy
(aktualny skrót — „Handover — 20 października” na górze).
- [x] **Commit poprawek z 16.10** — zrobiony (`5738b21`, 16.10).
- [ ] **Ocena użytkowniczki na jej zdjęciach** — listy „Z 14.10”, „Z 15.10”,
      „Z 16.10” w „Do przetestowania na koniec” (stippling, wzory, CRT,
      wygląd, tło podglądu w kropki, siła cieni / świateł, gęstość 2–3 px
      z zapisem w skali, listy w Electronie). Poprawić według uwag.
- [ ] **Decyzja: nowa krzywa cieni / świateł we wtyczkach VFX** (Shadow /
      Highlight Detail; `podnies` / `opusc` z `image.js`). To osobny projekt
      (`AE Plugin Land/raster-dither`) — tylko po jej „tak”.
- [ ] **Starsze, bez pośpiechu:** reszta różnic z Dither Boyem i lista
      z Halftone Makera (README, „Co dalej”) — wybór użytkowniczki; faktury
      efektu, skala plam riso i siła poświaty na prawdziwych zdjęciach;
      MP4 z dźwiękiem w Premiere / na Instagramie („Otwarte decyzje”).

## Wznowienie — 15 października 2026

**Nowy wygląd interfejsu jak „dither ui” z Figmy** (punkt 30 niżej),
w dwóch motywach. Checklista w `PLAN-UI.md`, zasady wyglądu w `CLAUDE.md`
(„Wygląd interfejsu”). Czeka na ocenę użytkowniczki — lista „Z 15.10”
w „Do przetestowania na koniec”.

## Wznowienie — 14 października 2026

**Przeniesione funkcje z wtyczek VFX (Dither 1.6, Raster 1.9, Riso 1.6)**
— punkt 29 niżej, checklista w `PLAN-WTYCZKI.md` (wszystko odhaczone,
poza commitem — robi go użytkowniczka). Apka jest teraz w zgodzie
z wtyczką do commitu wtyczki **`152ebcc`** (2026-10-14 00:53); przy
następnym przenoszeniu: `git diff 152ebcc -- raster-dither` w folderze
`AE Plugin Land`. Do obejrzenia przez użytkowniczkę — lista „Z 14.10”
w „Do przetestowania na koniec”. Sekcja niżej (11.10) to stan sprzed
tego planu; jej punkty 1, 3 i 4 z „Do zrobienia” są już zrobione.

## Wznowienie — handover z 11 października 2026 (wieczór)

Ta sekcja jest na początek następnej sesji. Pod nią — dawny stan i pełna
historia.

### Stan repozytorium

- Ostatni commit apki w chwili pisania: `5bb791b` (litery jako krzywe).
  **Niezacommitowane:** style linii jak Dither Boy (punkt 28 niżej) —
  `dither-core.js`, `index.html`, `app.js`, `state.js`, `presets.js`,
  `testy/algorytmy.mjs` i dokumentacja. Jeśli `git status` dalej je
  pokazuje, użytkowniczka commituje:
  `git add -A && git commit -m "Style linii jak Dither Boy (z VFX Dither 1.4)"`.
- Wszystkie testy przechodziły na koniec sesji (16 w Node, `przegladarka.mjs`).

### Wtyczka VFX — sprawdzić od nowa, bo zmienia się w osobnej sesji

Kod: `C:\Users\Dodo\Claude\Projects\AE Plugin Land\raster-dither\`
(osobne repo, czytać, nie zmieniać). Lista do przeniesienia:
`raster-dither/DLA-APKI.md`.

**Punkt odniesienia:** wszystko, co przeniesione, pochodzi z commitu
wtyczki **`05891a0`** (2026-10-11 01:07) i z DLA-APKI.md z 00:53.
W chwili pisania wtyczka miała **niezacommitowany** etap 2 części B
(VFX Dither 1.5: `checkersTemplate`, `blockTemplate`, `burstTemplate`
w `core/dither.cpp`, nowe algorytmy w `dither.h`) — w trakcie, **nie
przenosić, dopóki DLA-APKI.md nie oznaczy etapu 2 jako GOTOWY**.

Jak sprawdzić (Git Bash):
```
cd "/c/Users/Dodo/Claude/Projects/AE Plugin Land/raster-dither"
git log --oneline -5 -- .
git diff 05891a0 --stat -- .
git diff 05891a0 -- core/dither.cpp core/paper.cpp core/dither.h
```
i przeczytać DLA-APKI.md oraz najnowsze wpisy w `raster-dither/CLAUDE.md`
(dziennik wersji). Sprawdzić też, czy nie zmieniło się coś, co już
przeniesiono — wtedy poprawić apkę:
- A1 plamy riso — `inkSurface` w `core/paper.cpp` ↔ `krycie()` w `faktura-farby.js`,
- A2 ekspozycja / poziomy — `Tone` ↔ `lut()` w `image.js`,
- A3 / A4 skala i czas faktury — `texUnit`, ziarno ↔ `fakturaSkala`, `ziarnoFaktury()`,
- A5 kształty — `core/raster.cpp` ↔ `kontury()` w `siatki.js`,
- B etap 1 — `waveTemplate`, `topoTemplate`, `templated`, `streaks`,
  ModulatedDiffuse, CrackedDiffuse ↔ `wzorFali`, `wzorWarstwic`, `progowy`,
  `smugi`, `dyfuzjaStylu` w `dither-core.js`; presety `kPresets`
  w `ae/VFXDither.cpp` ↔ `presets.js`.

### Do zrobienia

1. Commit stylów linii (wyżej), jeśli jeszcze nie ma.
2. Sprawdzić wtyczkę (wyżej) i przenieść poprawki do już przeniesionych części.
3. **Część B, etap 2** (gdy gotowy we wtyczce): Checkers (małe / średnie /
   duże — Bayer 4×4 na kratkach 2 / 4 / 8 px), Block Tone (kwadratowy punkt
   w komórce, odstęp i kąt z suwaków linii), Radial Burst (promienie od
   środka, wygięcie jasnością, prędkość obraca). W apce: nowe wzory obok
   `wzorFali()` i kwantyzacja przez `progowy()`; Bayer 4×4 już jest
   (`BAYER4` w kernels.js); Radial Burst potrzebuje środka — dodać suwaki
   środka w grupie linii (w rastrze są `srodekX/Y`, ale to inne pole).
   Procedura jak przy etapie 1: dawne algorytmy co do bajtu jak przed zmianą
   (skrypt porównujący z wersją z gita), worker = główny wątek, presety
   z `kPresets`.
4. **Część B, etap 3** — jeszcze bez decyzji we wtyczce; przy przenoszeniu
   porównać z tym, co apka ma (`rgb`, `chrom`, `jpegGlitch`, poświata).
5. **Decyzje użytkowniczki:**
   - faktura farby zmienna w czasie — osobny przełącznik (tak jest teraz)
     czy podpiąć pod „szum w czasie”;
   - czy zaznaczyć w DLA-APKI.md (plik wtyczki), że część A i etap 1 B są
     przeniesione — to plik innego projektu, nie ruszać bez zgody.
6. **Do przetestowania na koniec** — lista w osobnej sekcji niżej.

### Uwagi do pracy

- **Heredoc w Git Bashu psuje polskie znaki** (skrypt Pythona z `<<EOF`
  dostaje krzaki i `assert` nie znajduje tekstu). Łatki z polskim tekstem
  zapisywać do pliku (narzędzie Write) i uruchamiać `python plik.py`.
- Sprawdzenia w Chrome z tej sesji były tymczasowymi skryptami w katalogu
  sesji (harness jak `testy/przegladarka.mjs`) — nie przetrwają. Jeśli
  mają zostać, przenieść do `testy/` (decyzja użytkowniczki).
- Znane i niegroźne: litery w SVG jako krzywe różnią się od podglądu
  wygładzaniem małych liter (~5/255 średnio; tekst dawał ~11) — kształt
  i położenie zgodne.

## Stan na 1 października 2026

- Praca na Windowsie. Repozytorium na GitHubie:
  `github.com/dododorota/RasterDitherBaby`, gałąź główna **`master`**
  (ma już całą dawną `rozbudowa`; `rozbudowa` zostaje na GitHubie jako
  identyczna kopia — użytkowniczka nie chce jej usuwać).
- **Gita obsługuje użytkowniczka** — patrz zasady w `CLAUDE.md`.
- Dodane i niezacommitowane: wideo i animacje (punkt 13 niżej), kolory
  i poświata (14), algorytmy, lista kodów i animacja parametrów (15),
  korekta, stos efektów, ASCII i warstwy (16), presety i reszta listy (17),
  raster, risograf i usuwanie tła (18).

## Uruchomienie na Windowsie

Python 3.12 (winget) i Node.js są zainstalowane. W Git Bashu, w folderze
projektu:

```
python serwer.py
```

i `http://localhost:8000`. Terminal otwarty przed instalacją Pythona albo
Node'a nie widzi ich w ścieżce — wtedy restart VS Code.

**Używaj `serwer.py`, a nie `python -m http.server`.** Zwykły serwer na
Windowsie potrafi odczytać typ plików `.js` z rejestru jako `text/plain` —
przeglądarka odmawia wtedy wczytania modułów i apka w ogóle nie startuje
(w konsoli: „Failed to load module script… MIME type"). `serwer.py` ustawia
typ jawnie i do tego wyłącza cache.

Chrome jest zainstalowany — `testy/przegladarka.mjs` go używa.

## Co zostało zrobione, po kolei

Punkty 2–6 są w jednym commicie (`d4f94fb`), od 7 każdy ma swój. Punkt 1
to przegląd bez zmian w kodzie.

1. **Przegląd kodu** — znalezione cztery rzeczy: skala zapisu w rastrze
   zmieniała wygląd (zapis 4× miał 20× gęstszy raster niż podgląd), pętla
   `collectScreen()` iterowała 4× za dużo, `nearest()` skanowało 64 kolory
   na piksel, presety nie były pełnym snapshotem.
2. **Worker dla dyfuzji błędu** — główny wątek nie staje ani przez chwilę
   (wcześniej 470 ms blokady przy 1400 px). Wynik co do bajtu ten sam.
3. **Naprawy z przeglądu** — skala zapisu jest teraz dokładnym powiększeniem
   podglądu; pętla ×3,9 mniej iteracji; paleta 64 kolory ×3,5 szybciej.
4. **Presety** — pełny snapshot, zapis i wczytywanie JSON, nieufna walidacja.
5. **Rozmycie przed rastrem** — usuwa migotanie przy gęstych siatkach
   (czułość na przesunięcie siatki 0,45% → 0,08% przy 2 px).
6. **Palety z Lospec** — `.hex`, `.gpl`, `.pal`, `.txt`, `.ase`.
7. **Paleta z obrazka PNG.**
8. **Własne presety w przeglądarce** (localStorage).
9. **Efekty po rastrze** — sortowanie pikseli, przesunięcie RGB.
10. **Szybsze szukanie koloru przy dużych paletach** — siatka kubełków,
    ×1,2 przy 32 kolorach do ×4 przy 256.
11. **Cały folder naraz** — paczka ZIP, własny zapis ZIP bez zależności.
12. **Kontury zamiast prostokątów w SVG** — dokładne i wygładzone.
13. **Wideo i animacje** (1.10, Windows) — wzorowane na Dither Boyu
    (studioaaa.com/product/dither-boy). Film MP4/WebM/MOV i animowany
    GIF/WebP na wejściu, oś czasu z odtwarzaniem, wybór tempa i zakresu,
    zapis do MP4 (WebCodecs + własny kontener), GIF-a (własny koder LZW)
    i klatek PNG w ZIP-ie. Bez dźwięku — decyzja użytkowniczki, na razie.
14. **Kolory w ditheringu i poświata** (2.10) — po uwadze, że apka ma mało
    opcji kolorystycznych w porównaniu z Dither Boyem (nagranie interfejsu:
    style, paleta z kategoriami, kolory, świecące kule). Biblioteka 43 palet
    w kategoriach ze strzałkami, tryb „według jasności" (mapa gradientu),
    edytor palety, paleta ze zdjęcia (najdalsze kolory + k-średnie), zapis
    .hex, poświata w obu trybach, farba i papier w rastrze, trzy nowe presety.
15. **Algorytmy, lista kodów, animacja parametrów** (2.10) — po drugim
    nagraniu Dither Boya (kot „can do it all": styl Ostromukhov, paleta jako
    lista kodów, oś czasu ze ścieżkami Brightness/Scale/Contrast).
    Ostromukhov z tabeli autora (wynik co do piksela jak jego program),
    Riemersma, Stevenson–Arce, niebieski szum, pięć wzorów; lista kodów hex
    w palecie; klatki kluczowe jak w After Effects i animacja zwykłego obrazu.
    Przy okazji naprawione przewijanie po zamknięciu filmu.
16. **Druga fala z Dither Boya** (2.10) — po zrzutach z filmu
    youtube.com/watch?v=qbZBiNevByI. Bez średniowiecznego wyglądu z filmu
    (decyzja użytkowniczki): ciemny motyw domyślnie z przełącznikiem.
    Korekta (cienie, światła, nasycenie, odcień, wyostrzanie, odszumianie),
    głębia koloru, dopasowanie Oklab; algorytmy False Floyd, Fan, Shiau–Fan 1/2
    (wagi z patentu), Bayer 16, IGN; stos efektów z kartami (aberracja, JPEG,
    zabarwienie, gwiazdki, faktura, obróbka, zmienność w czasie); tryb ASCII
    z zapisem TXT; kompozycja z warstw; przezroczyste tło; zwijane grupy.
17. **Presety i reszta listy „Co dalej"** (3.10) — zapisane palety (presety
    kolorów), klatki kluczowe w presetach ustawień, krzywe przejścia
    (płynnie / liniowo / skokowo), własny kolor poświaty, dźwięk w MP4
    (AAC, zapas Opus), stabilizacja dyfuzji w czasie.
18. **Raster, risograf, usuwanie tła** (3.10) — po zrzutach nadruków riso
    i grafik z linii: siatki heksagonalna, z okręgów i spirala; pięć nowych
    kształtów punktu; raster liniowy z odkształceniem (fale, obręcze); tryb
    risografu z 1–4 farbami (źródło, kąt, gęstość, przesunięcie i obrót
    płyty na farbę); faktura farby (szorstkość, rozlanie, plamy, dziury);
    usuwanie tła warstwy po kolorze i skrót „Usuń tło i podłóż kolor".
    Dalej: siatki „promienie" i „wzdłuż kształtu", gładkość i grubość
    min/max linii, biblioteka tuszy riso, losowe pasowanie, ślady wałka.
19. **Aplikacja na pulpit** (3.10) — Electron jako opakowanie (wybór
    użytkowniczki zamiast PWA), instalator i wersja przenośna przez
    electron-builder, ikona generowana skryptem, krój Archivo lokalnie
    zamiast z Google Fonts. Przy okazji: niewidoczne opcje list
    w ciemnym motywie na Windowsie, faktura farby bez „cyfrowego moro"
    (plamy jako ziarno, obrócona siatka szumu). Potem: nierówny raster
    (chmury krycia, nierówne punkty, drganie, postrzępione brzegi; presety
    Skan i Niebieski skan) po zrzutach zeskanowanych rastrów.
20. **Reszta listy** (3.10) — faktury z „Tile" Dither Boya (dwie brakujące:
    matryca LCD i wałek; reszta już była jako efekt „Faktura"), pędzel
    maski w warstwach, faktura papieru (włókna, czerpany, makulatura),
    kopie efektu w stosie, krzywa przejścia dla pojedynczej klatki.
    Przy okazji: niestabilne testy w Chrome (stare położenie podglądu,
    zgadywany czas renderu) — licznik renderów w `out.dataset.nr`.
21. **Warstwy jak w Dither Boyu** (3.10) — animacja położenia, skali, obrotu
    i krycia warstw (klucze „w:id:pole" w animacja.js, cel() zamiast S);
    warstwa efektu działająca tylko na warstwy pod nią, przed ditheringiem.
22. **Dot diffusion i automatyczne usuwanie tła** (3.10) — Knuth według jego
    programu DOT-DIFF (zgodność co do piksela); IS-Net w onnxruntime-web
    (zgoda użytkowniczki na model z sieci), WebGPU albo WASM, izolacja
    COOP/COEP dla wątków. Porównanie z halftonemaker.com i
    halftone.xoihazard.com — lista braków w README.
23. **Raster jak w Halftone Makerze** (3.10) — kolory punktów z obrazu
    i mapa gradientu, fala tonu, krzywa wielkości i najmniejszy punkt,
    płynięcie / rozciągnięcie / pochylenie siatki, trójkąt / wielokąt /
    gwiazda / superelipsa / znak, obrys; cofnij / ponów.
24. **Reszta porównania z Halftone Makerem** (3.10) — siatka trójkątna,
    stippling (Secord), zlewanie punktów (metaballe), scalanie równych
    obszarów, własny kształt z pliku SVG, obrót kształtu z siatką albo
    prosto, przezroczyste miejsca jako papier, kadrowanie; potem
    zaokrąglanie rogów i kod QR jako siatka (koder własny, sprawdzony
    dekoderem jsQR). Zostało: unia SVG (wymaga biblioteki).
25. **Nowe faktury** (6.10) — dawne kafelki (maska RGB, rozeta, kratka,
    romby…) wyglądały podobnie i „cyfrowo"; zamienione na 13 faktur
    proceduralnych w czterech grupach (papier, druk i zużycie, ekran i taśma,
    materiał), każda z własnym trybem mieszania. Dawne identyfikatory
    mapowane na najbliższe nowe (`DAWNE_FAKTURY`). Wygląd oceniony na
    arkuszu próbek renderowanym w Node, nie na prawdziwych zdjęciach.

26. **Znaki według tonu** (10.10) — po przeglądzie Ditherfy
    (antonburmistrov.com/tool-files/ditherfy): nowy kształt rastra, ton
    dzielony na 2–16 poziomów, każdy ze swoim kształtem albo obrazkiem
    (PNG/JPEG/WebP/SVG, przeciąganie na wiersz). Kolor: farba, kolor tonu
    albo oryginał; przebarwianie w 11 trybach mieszania. Decyzje
    użytkowniczki: w rastrze (nie w ASCII), w SVG wybór osadź / tylko
    wektory, preset pamięta tylko ustawienia (bez obrazków). Kamera na żywo
    z listy Ditherfy — odrzucona. Reszta porównania w README, „Co dalej".
    Sprawdzone: testy geometrii (poziomy, skala ×3, scalanie, QR, stippling),
    w Chrome bez okna — wczytanie PNG i SVG, przebarwianie, risograf, kolory
    z obrazu, SVG osadzony porównany pikselami z podglądem (śr. różnica
    0,4/255), zapis 3×, zły plik, własny kształt SVG po przeniesieniu kodu.
    Skrypt sprawdzający był tymczasowy (poza `testy/`).
    Potem podmiana tonów z Ditherfy: ile, zasięg, układ (klawisz Q), nowy
    układ co N klatek w filmie — testy w siatki.mjs (udział zmienionych,
    zasięg, skala ×3, stałość między zmianami).
    Potem ruch punktów z Ditherfy: pulsowanie (4 krzywe, tam i z powrotem,
    fala pod kątem), stały obrót kształtów, obrót ciągły i skokami
    z postojem, drżenie; czas z osi (`S.czasKlatki`). Testy w siatki.mjs
    (zakres wielkości, pętla, skala ×3, kąty obrotu i postoju), w Chrome —
    „Animuj obraz” z panelu, różne klatki na osi.
    Potem napis (tekst jako źródło z Ditherfy) — jako warstwa kompozycji:
    kroje wbudowany / systemowe / z pliku, obrazki zamiast liter, bez obrazu
    na pustym płótnie. Sprawdzone w Chrome (tymczasowym skryptem): napis od
    zera, krój z pliku (też zepsuty), serce zamiast litery, napis na zdjęciu.
    Potem papier w gradiencie (decyzja użytkowniczki: wektorowo, nie
    obrazkiem) — liniowy / promienisty, 2–8 kolorów, w SVG jako gradient
    (porównane pikselami z podglądem). Przy okazji naprawione: pierwszej
    zmiany po starcie apki nie dało się cofnąć (historia bez stanu
    startowego).
    Na koniec proporcje punktu (stała i losowa szerokość / wysokość, z listy
    Ditherfy) — w geometrii, SVG porównane pikselami z podglądem. Lista
    porównania z Ditherfy zamknięta (poza świadomie pominiętą kamerą).
    Commit `3925b66`.
27. **Poprawki z wtyczek VFX i litery jako krzywe** (11.10) — część A
    z `AE Plugin Land/raster-dither/DLA-APKI.md`: plamy riso bez
    „fraktalnych” płatów (błąd), ekspozycja i punkt czerni / bieli, skala
    faktury, faktura farby zmienna w czasie (osobny przełącznik — nie
    podpięta pod „szum w czasie”, żeby stare presety się nie zmieniły),
    kształty gwiazda 5, kwiat, serce, cyfra. Reszta z VFX Raster 1.5 —
    aplikacja ma odpowiedniki, nie przenoszone. Litery w SVG (raster i ASCII)
    domyślnie jako krzywe — decyzja użytkowniczki, „żeby fontów nie tracić”;
    tekst edytowalny jako opcja. Część B (style Dither Boya) czeka na
    wtyczkę.
28. **Style linii jak Dither Boy** (11.10) — część B, etap 1 z DLA-APKI.md
    (gotowy we wtyczce VFX Dither 1.4): Waveform, Topografia, Fala
    w dyfuzji, Pęknięcia, Smugi światła; grupa suwaków linii, presety CRT,
    Topo neon, Fala, Pęknięcia, Smugi (wartości z `kPresets` wtyczki, kolor
    dwubarwny jako 1-bit według jasności). Etap 2 (wzory) jeszcze nie gotowy
    we wtyczce. Przy okazji: „Przywróć całą korektę” zeruje też ekspozycję
    i punkty czerni / bieli.
29. **Reszta z wtyczek VFX: Dither 1.5–1.6, Raster 1.7 / Riso 1.4** (14.10)
    — plan z checklistą w `PLAN-WTYCZKI.md`. Wzory jak Dither Boy:
    szachownica mała / średnia / duża, kwadraty tonu, promienie od środka
    (suwaki środka), presety Szachownica i Promienie. Efekt „Ekran CRT”
    (linie kineskopu, maska RGB) w stosie efektów, poświata z rozciągnięciem
    w smugę i kątem, presety Monitor CRT, Zielony terminal, RGB glitch,
    Smuga światła, CRT na jasne. Raster: stippling od nowa (kropki 0,3 ·
    komórka, jasne miejsca czyste, start z niebieskiego szumu, domyślnie
    5 kroków wyrównania) i siatka słonecznik. Nie przeniesione: Resolution
    (apka ma MAX 1400), RGB Split i palety (apka ma odpowiedniki).
    Sprawdzone: 306 dawnych wyników ditheringu (34 algorytmy × palety
    i efekty) co do bajtu jak przed zmianą, wszystkie testy w Node
    i `przegladarka.mjs` (worker = główny wątek dla nowych wzorów i CRT),
    zrzuty na portrecie z testów wtyczki.
30. **Wygląd jak „dither ui” z Figmy** (15.10) — plan w `PLAN-UI.md`.
    Cały `styles.css` od nowa przy tych samych selektorach (JS i markup bez
    zmian): Inter w interfejsie, tusz `#121314` / papier `#fefefe`, ramki
    1 px, przyciski wersalikami z cieniem w szachownicę, karty efektów jak
    okno dialogowe (ramka 2 px, cień z kropek), suwak z uchwytem jak
    przełącznik z Figmy, własne pole wyboru i strzałka listy (ikony z Figmy
    w `src/ui/`), kursor-strzałka, tło podglądu w rzadkie kropki. Oba
    motywy (przycisk w nagłówku). Odstępstwo od wzoru: wybrany preset
    wypełniony jak zakładka, nie w kropki (kropki pod literami źle się
    czytały). Sprawdzone: zrzuty jasny / ciemny / wąskie okno / skala 150%,
    `przegladarka.mjs` 0 błędów, Electron startuje.
31. **Poprawki po pierwszych testach użytkowniczki** (16.10):
    - Grupa „Tryb”: odstępy zakładki | presety | własny preset | „Przywróć
      wszystko…” (klasy `odstep-duzy` 22 px, `odstep-sredni` 14 px). Panel
      342 px i węższy pasek przewijania — z widocznym paskiem długie
      przyciski łamały się na dwie linie.
    - Rozwijane listy (`appearance: base-select`, Chrome 135+ / Electron):
      wygląd listy z Figmy, podświetlenie nasyconym niebieskim `#1f45ff`
      zamiast systemowego bladego, ptaszek przy wybranej (tło opcji —
      `::checkmark` w Chrome 155 się nie rysował).
    - **Cienie / światła słabe** (zgłoszenie z rastra): pomiar na portrecie —
      cienie +100 zmieniały pokrycie farbą w cieniach o 4,6 punktu (mniej niż
      jasność +5), bo garb krzywej był w półtonach i ograniczony do ±38
      poziomów. Nowa krzywa w `lut()`: podniesienie u + 3c·u(1−u)⁴ (szczyt
      w głębokich cieniach), przyciemnienie jako jego odwrotność (zawsze
      rośnie), światła w lustrze. Cienie +100: poziom 25 → 75. Preset „CRT na
      jasne”: światła −60 → −40 (ten sam wygląd co dawniej, średnio
      6 poziomów różnicy). **Wtyczki VFX mają dalej starą krzywą** (Shadow /
      Highlight Detail) — przy następnym przenoszeniu do wtyczki: `podnies` /
      `opusc` z `image.js`.
    - **Gęstość rastra od 2 px co 0,5** (było od 3 co 1) — główna siatka
      i farby risografu. Obraz roboczy ma najwyżej 1400 px, więc drobny raster
      do druku to małe oczko + zapis w skali (×3 przy oczku 2,5 daje
      wyraźne kropki). Suwak zostaje w pikselach, a nie w skali nieliniowej:
      klatki kluczowe zapisują wartość suwaka, więc zmiana skali zepsułaby
      animacje w starych plikach.
    - Błąd z 14.10: stippling przy bardzo małych kropkach brał układ
      z pamięci podręcznej dla innej wielkości (klucz bez promienia kropki).
32. **Tryb Glitch** (19.10) — czwarta zakładka, efekty wtyczki VFX Glitch
    1.3 przeniesione do JS: `src/jpeg-glitch.js` (własny koder / dekoder
    JPEG jak libjpeg przy błędach), `src/glitch.js` (psucie pliku, Glitch
    Map, Datamosh, Melt, Slices, Bad TV, Tiles, Drips, Liquid, Mirror, RGB,
    Displacement, Stretch, Color Cycle, animacja, 12 presetów). Ta sama droga
    co dithering: korekta → glitch → efekty po rastrze, w workerze; PNG / GIF
    / MP4 / folder, bez SVG. Panel: grupa „Glitch” z sekcjami (JPEG, Filtry,
    Glitch Control, Animacja), suwaki filtra widać po jego włączeniu;
    pozycje z AE jako suwaki w % kadru. Sprawdzone: 36 ustawień i 12
    presetów co do bajtu jak CLI wtyczki (arytmetyka float przez
    `Math.fround`), odciski w `testy/glitch.mjs`, worker = główny wątek
    (`przegladarka.mjs`), dawny dithering bez zmian (306 wyników), zrzuty
    presetów na portrecie. Liquid wolny (~0,85 s na 933×1400).
33. **Wydajność rastra** (25.10) — plan w `PLAN-WYDAJNOSC.md`. Pomiar na
    zdjęciu 2000×1333 we wszystkich trybach i presetach: dithering, Glitch,
    ASCII w workerze (suwak chodzi), raster na głównym wątku blokował apkę
    100–1200 ms na ruch (gęste oczko, stippling, faktura farby, poświata,
    kształty ścieżką). Etap 1: pola szumu faktury farby w pamięci, rozmycie
    krycia na jednej płaszczyźnie, kropki bez save/restore (Riso duo
    626 → 316 ms, Skan 542 → 370). Etap 2: raster w workerze na
    OffscreenCanvas — na stronie tylko `sampler()` i wklejenie bitmapy;
    krój Archivo i obrazki tonów dosyłane do workera. Blokada 0 ms.
    Sprawdzone co do bajtu ze starą wersją (git archive na porcie 8001):
    16 ustawień podglądu, zapis PNG ×2, obrazki tonów; `przegladarka.mjs`
    i 18 testów w Node — 0 błędów; Electron startuje bez błędów.

## Do przetestowania na koniec

Lista użytkowniczki — rzeczy sprawdzone tylko na obrazach generowanych
w kodzie albo tylko w Chrome; do obejrzenia w prawdziwej pracy:

- **Znaki według tonu** na prawdziwych ikonach i zdjęciach: czy wpisanie
  obrazka w kwadrat 2r daje dobry ton, czy domyślne kolory tonów się
  podobają, podmiana tonów w filmie.
- **SVG w Illustratorze**: znaki z osadzonymi obrazkami (`<symbol>` +
  `<use>`), litery jako krzywe (`<use>` do `<defs>`), papier w gradiencie,
  sylwetki „tylko wektory”.
- **Plamy riso po poprawce** na prawdziwym ciemnym zdjęciu, 2 farby — mają
  zostać drobne wykruszenia bez chmur; do tego skala faktury.
- **Ekspozycja i punkty czerni / bieli** na zdjęciu z prześwietleniem
  i z niedoświetleniem.
- **Nowe kształty** (gwiazda 5, kwiat, serce, cyfra) i **proporcje punktu**
  na zdjęciach — czy ton się zgadza.
- **Ruch punktów** zapisany do MP4 / GIF — płynność pętli, czy cykl pasuje
  do długości animacji.
- **Napis**: krój wczytany z pliku (zwłaszcza zmienny), polskie znaki,
  obrazki zamiast liter.
- **Faktura farby zmienna w czasie** w zapisanym filmie.
- **Style linii** (Waveform, Topografia, Fala, Pęknięcia, Smugi) na
  prawdziwych zdjęciach i w filmie z prędkością linii — porównanie
  z wtyczką VFX Dither na tym samym kadrze.
- **Z 14.10:** wzory (szachownica, kwadraty tonu, promienie) i presety CRT
  na jasnym i na ciemnym zdjęciu; siła linii CRT i maski w zapisie PNG
  w powiększeniu (linie są tam gładsze niż w podglądzie); smuga poświaty
  w filmie; nowy stippling — czy gęstość i wielkość kropek się podobają
  (dawniej kropki były większe i było ich mniej), także w risografie;
  słonecznik z różnymi kształtami punktu.
- **Z 15.10:** nowy wygląd interfejsu w obu motywach, na swoim ekranie
  (przy skalowaniu Windowsa 125–150% wzory 1 px mogą wyglądać inaczej niż
  na zrzutach — sprawdzone tylko 100% i 150%); czy wersaliki na długich
  przyciskach nie męczą; tło podglądu w kropki — czy nie przeszkadza
  w ocenie ditheringu (łatwo zamienić na gładkie: `.stage` w styles.css).
- **Z 16.10:** nowe cienie / światła na kilku zdjęciach (czy +100 nie jest
  za mocne); gęstość 2–3 px z zapisem w skali ×2–×4 na zdjęciu ze stocku;
  rozwijane listy w Electronie (inny Chromium niż Chrome).
- **Z 25.10:** raster na dużym zdjęciu — czy suwaki chodzą płynnie
  (klasyczny raster, Skan, stippling, riso z fakturą); zapis PNG w skali
  i film w trybie rastra; kształt „znak” i znaki tonu z obrazkami (rysują
  się teraz w workerze); raster w aplikacji na pulpit (`npm start`) —
  w Electronie nie klikany. Pasma tonów: przeciąganie granic na pasku
  (czy uchwyty łatwo złapać), Podziel / Rozłóż / Odwróć / Usuń, pasmo
  „Puste”, zakresy w wierszach; czy działa tak, jak w Dither Boyu się
  przyzwyczaiła. Wielkość w paśmie (suwak pod wybranym pasmem) i wtapianie
  pasm — uporządkowane / rozproszone, czy siła 0–100 ma dobry zakres.
  Biblioteka kształtów: czy rysunki się podobają (własne, w duchu Dither
  Boya — łatwo poprawić pojedyncze), czy kształty bez wyrównanego pola
  (np. kwadrat ciemniejszy od koła) nie przeszkadzają w tonie; okienko
  na jej ekranie (położenie obok panelu).
- **Z 19.10:** tryb Glitch na jej zdjęciach i filmie — presety, zapis GIF /
  MP4 z „Nowy glitch co kilka klatek” (film w trybie Glitch nie był
  sprawdzany osobno), czy zakresy suwaków (np. uszkodzone bajty do 300)
  wystarczą; czy Liquid (~1 s) nie jest za wolny przy przeciąganiu suwaka.

## Co nie wyszło (żeby nie próbować drugi raz)

- **Odcinanie po jasności przy szukaniu koloru** — matematycznie dokładne, ale
  zmierzone 2× wolniejsze od zwykłego skanu. Dla palet kolorowych jasność
  prawie niczego nie odcina. Wycofane; zastąpione siatką kubełków.
- **Siatka tylko dla wartości 0–255** — po dyfuzji błędu duża część wartości
  wychodzi poza ten zakres, więc siatka prawie nie była używana. Rozszerzona
  do −256…512.
- **Wygładzanie konturów każdego koloru osobno** — między wygładzonymi
  kolorami prześwitywało tło. Zastąpione warstwami piętrowymi.
- **Warstwy piętrowe dla konturów dokładnych** — przy 64 kolorach plik rósł do
  28 MB. Dokładne kontury obrysowuje się teraz per kolor.
- **Wygładzanie przy wielu kolorach** — 16 kolorów dawało 39 MB. Limit 8.

Pułapki, na które nadziałem się przy testowaniu, są opisane w `CLAUDE.md`:
cache przeglądarki, niedeterministyczna rasteryzacja płótna przy gęstych
siatkach, zawieszanie karty przez ciężkie skrypty, generator liczb losowych
w testach, systemowy `unzip` na macOS.

## Niestabilny test

- `testy/przegladarka.mjs` raz na kilka uruchomień zgłasza w konsoli
  „EncodingError: Unable to decode audio data" (sprawdzenie „bez błędów
  w konsoli"). Nie udało się ustalić źródła: wszystkie wywołania
  `decodeAudioData`, które mogą zawieść, mają już pusty callback błędu
  i są łapane. Pozostałe sprawdzenia przechodzą; powtórne uruchomienie
  zwykle jest czyste.

## Czego nie sprawdzono

Testy szły na obrazach generowanych w kodzie i w wbudowanej przeglądarce
(Chromium). Nie sprawdzone:

- **SVG z konturami w Illustratorze** — czy złożone ścieżki z regułą evenodd
  otwierają się poprawnie i dają się edytować;
- **paczka ZIP w Eksploratorze Windowsa** — czy polskie nazwy plików
  rozpakowują się dobrze (paczka ma flagę UTF-8; jeśli Eksplorator ją
  zignoruje, 7-Zip powinien sobie poradzić);
- **Firefox i Safari** — przetwarzanie folderu (`webkitdirectory`), paleta z PNG
  (`createImageBitmap` z opcjami), blokada panelu (`inert`), worker jako moduł;
- **zapis pliku w aplikacji na pulpit** — okno „Zapisz jako" i zapamiętany
  folder sprawdzone tylko z kodu (test bez okna nie kliknie w dialog);
  instalator NSIS nie był uruchamiany, tylko zbudowany; .exe niepodpisane;
- **prawdziwe zdjęcia i prawdziwe palety z Lospec** — ocena na oko, czy to
  wszystko dobrze wygląda w pracy.

Wideo testowane na filmach generowanych w Chrome (bez okna, `testy/przegladarka.mjs`).
Nie sprawdzone:

- **prawdziwe filmy z telefonu** — zmienne tempo klatek, obrót (MOV
  z iPhone'a), HEVC, który Chrome otwiera tylko ze sprzętowym dekoderem;
- **MP4 w Premiere, After Effects, Instagramie** — przeglądarka go odtwarza,
  ale innych odtwarzaczy nikt nie próbował;
- **długie filmy** — pamięć przy kilku minutach GIF-a albo klatek PNG
  (wszystko składa się w pamięci przeglądarki);
- **wideo w Firefoxie i Safari** — WebCodecs, `requestVideoFrameCallback`.

## Otwarte decyzje

- **Reszta różnic z Dither Boyem** — lista w README, „Co dalej".
- **Lista z porównania z Halftone Maker** — w README, „Co dalej"; do wyboru,
  co robimy.
- **Nowe faktury efektu** — siła i skala dobrane na arkuszu z gradientami;
  do obejrzenia na zdjęciach (zwłaszcza pognieciony papier, kurz i folia,
  które najłatwiej przesadzić). Stare presety z fakturą wyglądają inaczej
  niż przed zmianą — to świadome.
- **Faktura farby i risograf** dobrane na próbce — do sprawdzenia na
  prawdziwych zdjęciach, czy skala plam (34 i 13 px podglądu) pasuje.
- **MP4 z dźwiękiem w Premiere i na Instagramie** — sprawdzone tylko
  w Chrome (decodeAudioData na wyniku).
- **Znaki według tonu, SVG w Illustratorze i reszta z 10–11.10** — zebrane
  wyżej, w „Do przetestowania na koniec”.
- **Siła poświaty** dobrana na scenach generowanych w kodzie — do sprawdzenia
  na prawdziwych zdjęciach i filmach, czy 100% to dobry środek skali.
- **Skrypty testowe** — `CLAUDE.md` mówiło, że testy „na razie nie są
  potrzebne", ale skrypty weryfikacyjne z tej sesji trafiły do `testy/`,
  bo część ginęła z katalogu tymczasowego, a to jedyny zapis tego, jak
  sprawdzano wyniki. Można je zostawić, usunąć albo rozbudować.

## Skrypty w `testy/`

Czysty Node, bez zależności. Uruchamiane z katalogu projektu:

```
node testy/palety-pliki.mjs
node testy/zip.mjs
node testy/efekty.mjs
node testy/kontury.mjs
node testy/szukanie-koloru.mjs
node testy/gif.mjs
node testy/mp4.mjs
node testy/kolory.mjs
node testy/algorytmy.mjs
node testy/animacja.mjs
node testy/korekta.mjs
node testy/stos.mjs
node testy/ascii.mjs
node testy/stabilizacja.mjs
node testy/siatki.mjs
node testy/wycinanie.mjs
node testy/qr.mjs
npm run modele                  # raz: model do automatycznego usuwania tła
node testy/przegladarka.mjs     # wymaga serwer.py i Chrome
```

Każdy kończy się liczbą błędów i kodem wyjścia 0, gdy wszystko gra. Ostatni
porównuje ~1,3 mln wyszukań i trwa kilkadziesiąt sekund.
`node testy/wydajnosc-siatki.mjs` to pomiar, nie test — trwa kilka minut.

Ostatnie uruchomienie (3.10, Windows, Node 24): wszystkie siedemnaście bez błędów.
