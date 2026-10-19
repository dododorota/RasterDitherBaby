# Plan: zakładka „Glitch” z efektami z wtyczki VFX Glitch

Rozpoczęty 2026-10-19. Odhaczamy `[x]` po zrobieniu **i sprawdzeniu**.
Po przerwie: przeczytaj ten plik i ruszaj od pierwszego nieodhaczonego punktu.

Źródło: `C:\Users\Dodo\Claude\Projects\AE Plugin Land\VfxGlitch\` (osobne
repo — tylko czytać). Opis i wzory: jego `CLAUDE.md`; kod: `core/jpeg.cpp`
(koder / dekoder JPEG z psuciem), `core/glitch.cpp` (filtry, presety),
`core/glitch.h` (parametry i wartości domyślne). Stan wtyczki w chwili
startu: wersja 1.3 (część niezacommitowana — punktem odniesienia jest
zawartość plików z 19.10). Do porównań: `build/Release/vfx.exe`
(`vfx glitch <wej> <wyj.png> [opcje]`, `vfx` bez argumentów = lista opcji).

## Założenia

- **Czwarty tryb `glitch`** obok Dithering / Raster / ASCII (zakładka „Glitch”).
  Ta sama droga co dithering: obraz roboczy (do 1400 px, pikselizacja) →
  korekta → **glitch** → efekty po rastrze, w workerze. Dzięki temu podgląd,
  PNG, folder, GIF / MP4 i animacja działają bez osobnego kodu. Bez SVG.
- Trzy części jak we wtyczce, w tej kolejności: **JPEG** (prawdziwy plik JPEG
  psuty bajtami i tablicami kwantyzacji, odczyt z pominiętymi etapami),
  **filtry** (Glitch Map, Datamosh, Melt Map, Slices, Bad TV, Tiles, Drips,
  Liquid, Mirror), **Glitch Control** (Displacement, Stretch, RGB, Color Cycle).
- Zero losowości: wszystko z haszu i ziaren, jak we wtyczce. „Animuj glitch”
  = nowe ziarno co N klatek (numer klatki filmu / animacji).
- Długości w pikselach obrazu roboczego (× 1/pikselizacja w buforze).
  Punkty z AE (Position) → suwaki w % kadru, domyślnie środek.
- Istniejący efekt „JPEG glitch” w stosie efektów zostaje (to co innego —
  przesuwanie bloków, działa w każdym trybie).
- Interfejs po polsku, nazwy grup jak we wtyczce tam, gdzie to nazwy
  własne (Glitch Map, Datamosh, Bad TV…).

## 1. Rdzeń (czysty JS, bez DOM-u — działa w workerze)

- [x] `src/jpeg-glitch.js` — port `core/jpeg.cpp`: koder baseline 4:2:0
      (tablice IJG ze skalą jakości, standardowe Huffmany), dekoder
      zachowujący się jak libjpeg przy błędach (zły kod = 0, po końcu zera,
      DC int16 z zawijaniem, range_limit z zawijaniem, fancy upsampling),
      opcje: bez dekwantyzacji / IDCT / YCbCr, filter 1 / 2.
- [x] Psucie pliku: broken bytes (zakres start–end %, nigdy po 0xFF),
      tablice kwantyzacji (breaking bytes + QTC / QTL).
- [x] `src/glitch.js` — port `core/glitch.cpp`: wszystkie filtry, kolejność
      jak we wtyczce, animacja, 12 presetów (`applyGlitchPreset`).
- [x] Zgodność z wtyczką: ten sam obraz wejściowy → `vfx.exe` i apka,
      różnica pikseli (cel: 0 albo ≤ 1/255 tam, gdzie wtyczka ma float).

## 2. Podpięcie trybu

- [x] `S.mode = "glitch"`: `dither-core.js` (korekta → glitch → efekty),
      `render.js`, `setMode()`, zakładka w `index.html`, `NAZWA_TRYBU`.
- [x] Eksport: PNG / GIF / MP4, bez SVG; folder; film (numer klatki).
      (PNG i podgląd sprawdzone w Chrome; GIF / MP4 / folder idą tą samą
      drogą co dithering — `renderuj` — ale filmem w trybie Glitch nie
      sprawdzone; na liście „Z 19.10” w PROCES.md.)
- [x] Wczytywanie presetów z pliku z `tryb: "glitch"`.

## 3. Panel

- [x] Grupa „Glitch” z sekcjami (`details.pod`): JPEG, Mapy / filtry,
      Glitch Control, Animacja. Każdy filtr: pole „włączony” + jego suwaki
      (widoczne tylko przy włączonym).
- [x] Suwaki w `index.html` + `SUWAKI` / `PTASZKI` / `LISTY` w `app.js`
      + `DEFAULTS` (wartości jak w `glitch.h`).
- [x] Presety trybu (12 z wtyczki, polskie nazwy).

## 4. Sprawdzenie

- [x] Testy w Node (`testy/glitch.mjs`): JPEG bez psucia ≈ oryginał,
      powtarzalność, każdy filtr zmienia obraz i nie daje NaN, skrajne
      wartości, obrazy 1×1 / 7×5, animacja co N klatek.
- [x] `testy/przegladarka.mjs`: worker = główny wątek dla glitcha; 0 błędów.
- [x] Czas na 1400 px (cel: płynny podgląd).
- [x] Zrzuty presetów na zdjęciu (jasny i ciemny motyw panelu).

## 5. Na koniec

- [x] `PROCES.md` (historia, do obejrzenia), `CLAUDE.md`, `README.md`.
- [x] Polecenie commita dla użytkowniczki.

## Wynik (19.10)

- Zgodność: 36 ustawień i wszystkie 12 presetów **co do bajtu** jak `vfx.exe`
  (skrypt porównujący w scratchpadzie sesji; w repo — odciski w `testy/glitch.mjs`).
  Pułapka: w C++ dwa losowania w jednym wyrażeniu (Tiles) — MSVC liczy najpierw
  prawe; port trzyma tę kolejność.
- Czas na 933×1400: JPEG ~0,2 s, filtry geometryczne 60–80 ms, Liquid ~0,85 s
  (szum z zawirowaniem na każdy piksel) — w workerze, panel się nie zacina.
- Odstępstwa od wtyczki: punkty (Position) jako suwaki w % kadru; brak podglądu
  Half (apka zawsze liczy w rozmiarze roboczym); Broken bytes suwak do 300
  (wtyczka do 3000), ziarna do 200.
