# Raster

Narzędzie do ditheringu i rastra drukarskiego. Wszystko liczy się w przeglądarce,
nic nie wychodzi na serwer. Eksport do PNG i do SVG.

## Odpalenie

Moduły ES nie działają z `file://`, więc potrzebny jest lokalny serwer:

```bash
npx serve .
# albo bez node'a:
python3 -m http.server 8000
```

Potem `http://localhost:8000`. Zero zależności, zero buildu — edytujesz plik,
odświeżasz kartę.

## Co robi

**Tryb dithering** — osiem algorytmów dyfuzji błędu (Floyd–Steinberg, Atkinson,
Jarvis–Judice–Ninke, Stucki, Burkes, trzy warianty Sierry) i pięć uporządkowanych
(Bayer 2/4/8, siatka punktowa, szum). Palety: 1-bit z własnymi kolorami farby
i papieru, szarości, Game Boy, CGA, 3-bit RGB, kwantyzacja koloru.

**Tryb raster drukarski** — prawdziwe obrócone siatki rastrowe, jedna farba,
duotone albo pełny CMYK pod klasycznymi kątami, z mnożeniem farb. Suwak pasowania
psuje rejestrację arkusza, ziarno dokłada fakturę papieru.

## Struktura

```
index.html        markup i podpięcie modułów
src/styles.css    tokeny kolorów (light/dark) i cały layout
src/state.js      obiekt S — jedyne źródło prawdy o ustawieniach
src/dom.js        uchwyty do canvasu i helper $
src/palettes.js   definicje palet + szukanie najbliższego koloru
src/kernels.js    macierze dyfuzji błędu i mapy Bayera
src/image.js      jasność/kontrast/gamma/negatyw (LUT) + skalowanie
src/dither.js     ditherData() liczy piksele, renderDither() je rysuje
src/halftone.js   sampler, collectScreen() liczy punkty, drawScreen() rysuje
src/vector.js     eksport SVG — scalanie prostokątów i emisja kształtów
src/presets.js    punkty startowe
src/app.js        kontrolki, presety, wczytywanie plików, zapis
```

Kluczowa zasada: **liczenie jest oddzielone od rysowania**. `ditherData()`
i `collectScreen()` zwracają dane, a konsument decyduje, czy idą na canvas
(podgląd, PNG) czy do SVG. Dzięki temu wektor jest zawsze identyczny z podglądem
— stąd też deterministyczne przesunięcie pasowania w `inkList()` zamiast
`Math.random()`.

## Eksport SVG — czego się spodziewać

Raster drukarski mapuje się na wektor idealnie: każdy punkt to `<circle>` albo
`<rect>`, farby siedzą w osobnych grupach `cyan` / `magenta` / `yellow` / `key`,
gotowe do separacji w Illustratorze.

Dithering to piksele, więc SVG powstaje przez scalanie sąsiadujących pikseli
tego samego koloru w większe prostokąty (`mergeRects`). Przy pikselizacji 1×
i szumiącym algorytmie i tak wyjdzie kilkadziesiąt tysięcy obiektów — po zapisie
apka pokazuje ich liczbę i wagę pliku. Praktycznie: do wektora trzymaj
pikselizację na 3–4×.

## Co dalej

- [ ] web worker dla dyfuzji błędu — przy zdjęciach 4000 px+ UI się zacina,
      bo dyfuzja jest sekwencyjna i nie da się jej zrównoleglić na GPU
- [ ] import palet z Lospec (.hex, .gpl, .ase)
- [ ] rozmycie przed rastrem — przy gęstych siatkach ostre krawędzie migoczą
- [ ] obrys konturowy zamiast kwadracików (potrace) jako druga opcja wektora
- [ ] batch na folderze plików
- [ ] zapis i wczytywanie presetów jako JSON
- [ ] efekty po rastrze: pixel sort, RGB shift, przesunięcie kanałów

## Licencja

Prywatne narzędzie, rób z tym co chcesz.
