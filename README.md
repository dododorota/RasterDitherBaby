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

Skala zapisu w obu trybach daje dokładne powiększenie podglądu: przy 4× rośnie
rozdzielczość, a nie gęstość rastra — ta sama liczba punktów, tylko narysowana
ostrzej.

Suwak rozmycia zmiękcza obraz tuż przed rastrem. Przy gęstych siatkach ostre
krawędzie schodkują, bo siatka punktów nie ma jak oddać detalu drobniejszego
niż komórka — 1–2 px wystarcza, żeby schodki zamieniły się w gradację. Rozmycie
liczy się w pikselach obrazu i działa tak samo przy każdej gęstości.

## Struktura

```
index.html        markup i podpięcie modułów
src/styles.css    tokeny kolorów (light/dark) i cały layout
src/state.js      obiekt S — jedyne źródło prawdy o ustawieniach
src/dom.js        uchwyty do canvasu i helper $
src/palettes.js   definicje palet + szukanie najbliższego koloru
src/palette-files.js czytanie plików palet (.hex, .gpl, .pal, .ase, .txt)
src/kernels.js    macierze dyfuzji błędu i mapy Bayera
src/image.js      jasność/kontrast/gamma/negatyw (LUT) + skalowanie
src/dither-core.js   ditherPixels() — korekta i dithering, bez DOM-u
src/worker.js        wątek, w którym liczy się dyfuzja błędu
src/worker-client.js kolejka zadań workera, wypieranie nieaktualnych
src/dither.js     ditherData() ogarnia canvas i worker, renderDither() rysuje
src/halftone.js   sampler, collectScreen() liczy punkty, drawScreen() rysuje
src/vector.js     eksport SVG — scalanie prostokątów i emisja kształtów
src/presets.js    wbudowane punkty startowe
src/app.js        kontrolki, presety, wczytywanie plików, zapis
```

Kluczowa zasada: **liczenie jest oddzielone od rysowania**. `ditherData()`
i `collectScreen()` zwracają dane, a konsument decyduje, czy idą na canvas
(podgląd, PNG) czy do SVG. Dzięki temu wektor jest zawsze identyczny z podglądem
— stąd też deterministyczne przesunięcie pasowania w `inkList()` zamiast
`Math.random()`.

Dyfuzja błędu liczy się w web workerze, więc `ditherData()` i `renderDither()`
są asynchroniczne i zwracają `null`, gdy zadanie zostało wyparte świeższym
(przeciąganie suwaka). Do zapisu pliku wołaj je z `{keep:true}` — takie zadanie
nie wypada z kolejki. Gdy workera nie ma, liczenie leci na głównym wątku tą samą
funkcją `ditherPixels()`, więc wynik jest co do bajtu ten sam.

## Palety własne

„Wczytaj paletę" w grupie *Paleta*, albo przeciągnięcie pliku na podgląd.
Czyta wszystko, co da się pobrać z lospec.com: `.hex`, `.gpl` (GIMP), `.pal`
(JASC), `.txt` (Paint.NET) i `.ase` (Adobe). Format rozpoznaje po zawartości,
nie po rozszerzeniu.

Z `.ase` bierze kolory RGB, szare i CMYK (to ostatnie przeliczone naiwnie, bez
profilu); kolory Lab pomija i mówi o tym. Duplikaty wylatują, paleta ma od 2 do
256 kolorów. Wszystko, co zostało pominięte albo poprawione, pojawia się pod
przyciskiem.

Paleta własna przeżywa kliknięcie wbudowanego presetu — to materiał jak obraz,
nie część wyglądu — i jest zapisywana w pliku presetu, gdy jest wybrana.

Koszt rośnie z liczbą kolorów: 16–32 kolory to ok. 1,7× czasu palety 1-bit,
128 to 4×, 256 to 7×. Dithering liczy się w workerze, więc interfejs nie staje,
ale podgląd przy dużych paletach dociera z opóźnieniem.

## Presety

Cztery wbudowane na tryb, plus zapis własnych ustawień do pliku JSON
(„Zapisz ustawienia") i wczytanie z powrotem („Wczytaj plik" albo przeciągnięcie
`.json` na podgląd).

Preset jest **pełnym opisem wyglądu**: wszystkie klucze z `LOOK`, czyli korekta,
algorytm, paleta, kolory i cały raster. Kluczy, których nie podaje, nie
dziedziczy po poprzednim — wracają do wartości domyślnych. Zapisany plik wygląda
tak:

```json
{
  "app": "raster",
  "wersja": 1,
  "zapisano": "2026-09-22T18:30:00.000Z",
  "tryb": "half",
  "look": { "cell": 19, "ang": 71, "shape": "diamond", "...": "..." }
}
```

Wczytywanie jest nieufne: sprawdza typy, przycina liczby do zakresu suwaków
i odrzuca nieznane opcje list, a potem mówi, ile wartości musiało poprawić.
Plik nie z tej aplikacji albo popsuty nie rusza stanu w ogóle.

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

- [ ] obrys konturowy zamiast kwadracików (potrace) jako druga opcja wektora
- [ ] batch na folderze plików
- [ ] efekty po rastrze: pixel sort, RGB shift, przesunięcie kanałów
- [ ] własne presety zapamiętane w przeglądarce, żeby nie trzymać ich w plikach
- [ ] paleta z obrazka PNG (Lospec daje też paski 1×N) — wymaga canvasu,
      więc poza czystym `palette-files.js`
- [ ] szybsze szukanie koloru dla palet 128+ — skan kosztuje wtedy 4–7× więcej
      niż 1-bit; odcinanie po luminancji nie działa (patrz CLAUDE.md), trzeba
      by zmierzyć drzewo k-d albo siatkę kubełków

## Licencja

Prywatne narzędzie, rób z tym co chcesz.
