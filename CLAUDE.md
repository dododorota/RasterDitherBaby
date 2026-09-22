# Notatki dla Claude Code

## Czym to jest

Przeglądarkowe narzędzie do ditheringu i rastra drukarskiego dla projektantki
graficznej. Efekt wizualny jest produktem — jeśli zmiana psuje wygląd, jest zła,
nawet jeśli kod jest czystszy.

## Zasady

- **Bez buildu i bez zależności.** Czysty JS, moduły ES, `npx serve .`.
  Nie dodawaj bundlera, TypeScriptu ani frameworka bez wyraźnej prośby.
- **Liczenie oddzielone od rysowania.** `ditherData()` i `collectScreen()`
  zwracają dane; canvas i SVG są ich konsumentami. Nowy efekt dodawaj w tej samej
  konwencji, bo inaczej eksport wektorowy się rozjedzie z podglądem.
- **Zero losowości w renderze.** Podgląd i eksport muszą dać identyczny wynik.
  Misregistracja w `inkList()` liczona jest deterministycznie z indeksu farby.
  Jedyny wyjątek to algorytm „szum losowy", świadomie.
- **Stan mieszka w `S`** (src/state.js). Kontrolki zapisują, reszta tylko czyta.
- **Interfejs po polsku**, kod i komentarze też.
- **Suwak dodaje się w trzech miejscach:** pole w `S`, markup w `index.html`,
  wywołanie `slider()` w `app.js`. Jeśli ma trafić do presetów, dopisz też
  mapowanie w `applyPreset()`.

## Wydajność

Dyfuzja błędu jest z natury sekwencyjna (każdy piksel zależy od poprzedniego),
więc nie da się jej rzucić na GPU ani na worklet. Obraz jest przycinany do
`MAX = 1400 px` przed przetwarzaniem. Jeśli ma być większy, właściwą drogą jest
web worker, nie podniesienie stałej.

Raster jest tani — liczba punktów to `W*H/cell²` na farbę — ale przy CMYK
i gęstości 3 px to już setki tysięcy rysowań. Przy zmianach w `collectScreen()`
testuj na gęstości 3 i 40.

## Czego nie ruszać bez powodu

- Macierze w `kernels.js` — to kanoniczne wagi z literatury, dzielniki muszą się
  zgadzać, inaczej obraz jedzie w jasność albo ciemność.
- Kąty siatek CMYK w `inkList()` — rozeta bierze się z ich wzajemnych różnic.
- `shape-rendering="crispEdges"` w eksporcie ditheru — bez tego przeglądarka
  antyaliasuje krawędzie i całe 1-bit się rozmywa.

## Jak testować

Nie ma testów automatycznych i na razie nie są potrzebne. Ręcznie:
przycisk „Próbka" wczytuje wygenerowany obraz z gradientami, cieniem i płaską
powierzchnią — na nim widać banding, odcięcia w cieniach i migotanie rastra.
Po zmianach przejdź presety w obu trybach.
