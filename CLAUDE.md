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
  `DEFAULTS` to wartości domyślne wyglądu, `LOOK` to lista jego kluczy — po niej
  chodzą presety i zapis do pliku.
- **Interfejs po polsku**, kod i komentarze też.
- **Suwak dodaje się w dwóch miejscach:** markup w `index.html` i wpis w tabeli
  `SUWAKI` w `app.js`. Jeśli ma być częścią wyglądu (czyli wchodzić do presetów
  i do zapisanego pliku), dopisz go też do `DEFAULTS` — i tyle, `applyPreset()`
  ani wczytywanie z pliku nic o kontrolkach nie wiedzą. Analogicznie `PTASZKI`,
  `LISTY` i `KOLORY` dla pozostałych typów kontrolek.
- **Paleta własna (`S.custom`) nie jest częścią wyglądu**, tylko materiałem jak
  `S.img` — gdyby siedziała w `DEFAULTS`, każdy wbudowany preset by ją kasował.
  Do pliku presetu trafia osobnym polem `paleta`, i tylko gdy `pal==="custom"`.
  Opcja „Własna" istnieje w liście tylko przy wczytanej palecie; wołaj
  `opcjaPalety()` przed `syncUI()` za każdym razem, gdy zmieniasz `S.custom`,
  bo inaczej `syncUI()` odrzuci `pal:"custom"` jako nieznaną opcję.
- **Presety z pliku i z przeglądarki mają jeden format i jedną ścieżkę**:
  `biezacyPreset()` buduje obiekt, `zastosujPreset()` go nieufnie wczytuje.
  Nie pisz drugiej walidacji dla localStorage — dane stamtąd też mogły zostać
  zmienione. Każdy dostęp do localStorage w try/catch: w trybie prywatnym
  i przy pełnym magazynie rzuca, a apka ma działać dalej.
- **`palette-files.js` jest czysty**, bez DOM-u — testuj go w Node, nie w
  przeglądarce. Nowy format dopisuj tam, rozpoznawany po zawartości. Wyjątkiem
  jest paleta z obrazka (`paletaZObrazka()` w app.js), bo potrzebuje canvasu;
  czyta piksele przez `createImageBitmap` z `colorSpaceConversion:"none"`,
  żeby przeglądarka nie przestawiła wartości z PNG z osadzonym profilem.
- **Wartości domyślne w `DEFAULTS` muszą zgadzać się z `value` w markupie.**
  Panel startuje ze stanu, nie odwrotnie, więc rozjazd zmieni wygląd po starcie.

## Wydajność

Dyfuzja błędu jest z natury sekwencyjna (każdy piksel zależy od poprzedniego),
więc nie da się jej rzucić na GPU ani na worklet — za to liczy się w web workerze
(`src/worker.js`), przez co główny wątek nie stoi ani przez chwilę. Obraz nadal
jest przycinany do `MAX = 1400 px` przed przetwarzaniem.

Z tego wynikają trzy rzeczy, o które łatwo się potknąć:
- `ditherData()` i `renderDither()` są **asynchroniczne**. Każdy nowy konsument
  musi je awaitować.
- Zwracają `null`, gdy zadanie zostało wyparte świeższym. To normalna droga,
  nie błąd — po prostu nic nie rysuj. Zapis pliku woła je z `{keep:true}`,
  bo jego zadanie wypaść nie może.
- Worker ma **własną kopię `S`**; główny wątek dosyła jej snapshot przy każdym
  zadaniu (bez `img`, bo obrazu nie da się sklonować). Nowe pole w `S`, od
  którego zależy wynik ditheringu, trafia tam samo — ale pole trzymające obiekt
  nieklonowalny wysypie `postMessage`.

Przerwać liczenia w locie się nie da: pętla jest synchroniczna, więc worker nie
odbierze wiadomości, dopóki jej nie skończy. Stąd wypieranie w kolejce zamiast
anulowania. `SharedArrayBuffer` z flagą przerwania wymagałby nagłówków COOP/COEP,
których `npx serve` nie wystawia.

Zmieniając cokolwiek w `dither-core.js` pamiętaj, że ten moduł biega w workerze —
**żadnych odwołań do DOM-u**, bo `document` tam nie istnieje.

Raster jest tani — liczba punktów to `W*H/cell²` na farbę — ale przy CMYK
i gęstości 3 px to już setki tysięcy rysowań. Przy zmianach w `collectScreen()`
testuj na gęstości 3 i 40.

Palety własne od 32 kolorów szukają najbliższego koloru przez siatkę kubełków
(`szukaczSiatka()` w palettes.js) — dokładnie, z tymi samymi remisami co
`nearest()`, zmierzone ×1,2 przy 32 kolorach do ×4 przy 256. Siatka obejmuje
−256…512, bo po dyfuzji wartości wychodzą poza 0–255 (przy małych, słabo
pokrywających obraz paletach nawet w większości). Zmieniając ją, puść test
dokładności na złośliwych paletach: same szarości, kolory na granicach
kubełków, siatka pełna remisów, wartości tuż pod górną granicą.

**Nie próbuj odcinania po luminancji** — z Cauchy'ego–Schwarza wychodzi
dokładna granica d ≥ ΔY², ale zmierzone było dwa razy wolniej od skanu: dla
palet kolorowych jasność prawie niczego nie odcina.

**Losowe palety do testów generuj przez `Math.imul`.** LCG na zwykłych liczbach
(`s*1103515245`) gubi precyzję powyżej 2⁵³, ciąg się zapętla po ~100 kolorach
i pętla szukająca N różnych kolorów wisi — to wyglądało jak „wolna siatka
przy 128 kolorach", a było błędem w teście.

**Efekty po rastrze** (`effects.js`) są czyste i biegną w workerze razem
z dyfuzją — worker i fallback wołają `ditherIEfekty()`, nie gołe
`ditherPixels()`, i to tę parę porównuj w teście zgodności. Kolejność jest
stała: sortowanie, przesunięcie RGB, a w rastrze na końcu ziarno. Ziarno musi
iść po efektach, bo jest losowe — gdyby szło przed, kolejność sortowania
zmieniałaby się przy każdym renderze. Permutację sortowania w rastrze liczymy
na siatce podglądu (przy zapisie w skali z pomocniczego renderu 1×) i
przenosimy blokami z×z; przesunięcie liczymy w pikselach podglądu i mnożymy
przez z. Nie licz efektów od nowa w rozdzielczości zapisu — wyjdzie inny obraz.
Test skali dla efektów: efekt na obrazie powiększonym z razy musi dać
dokładnie powiększony efekt, co do bajtu (tak robi test w Node).

**Cache przeglądarki przy testach.** `python3 -m http.server` nie wysyła
nagłówków cache i przeglądarka potrafi podać stary moduł obok nowych — objawia
się to błędami typu „X is not a function" dla funkcji, która na dysku istnieje.
Do testów stawiaj serwer z `Cache-Control: no-store` albo rób twarde odświeżenie.

**Ciężkie benchmarki odpalaj w Node, nie w panelu przeglądarki.** Skrypt, który
przekroczy limit narzędzia, dalej mieli w tle i blokuje kartę tak, że nawet
nawigacja przestaje odpowiadać — trzeba ją zamknąć. `dither-core.js`,
`palettes.js` i `palette-files.js` są czyste i działają w Node bez zmian.

Rozmycie (`rozmyj()` w halftone.js) liczy się na buforze próbek, nie na obrazie —
bufor jest `step` razy mniejszy, więc to jedyne miejsce, gdzie jest tanie. Sigma
przeliczana z pikseli obrazu na próbki, przez co jedno ustawienie znaczy to samo
przy każdej gęstości. Do promienia 8 dokładne jądro gaussowskie, powyżej trzy
przebiegi pudełkowe z sumą bieżącą — dokładny splot przy gęstości 3 sięgał 0,7 s,
pudełka schodzą do kilkunastu ms i nie zależą od promienia. Szerokości pudełek
mieszane (`pudelka()`), bo jedna zaokrąglona szerokość chybiała sigmę o 20%
i w jednym miejscu suwaka obraz robił się ostrzejszy mimo zwiększania rozmycia.

Zakres pętli w `collectScreen()` bierze się z odwrócenia transformacji: dla
punktu mieszczącego się w kadrze `|u|` i `|v|` nie przekraczają `(W+H)/2cell`
plus margines komórki i pasowania. Nie podnoś tego „na zapas" — każde `+1`
w `R` to kwadratowo więcej iteracji.

`nearest()` skanuje paletę liniowo. Dla siatek RGB (`rgb3`, `quant`) robi to za
nie `quantizer()`, wybierając każdy kanał osobno. Palety nieregularne dostają
z niego `null` i lecą skanem — owijanie ich domknięciem wychodziło wolniej niż
sam skan. Jeśli dodasz paletę będącą pełnym iloczynem poziomów, dopisz ją tam;
jeśli nieregularną, zostaw `null`.

## Czego nie ruszać bez powodu

- Macierze w `kernels.js` — to kanoniczne wagi z literatury, dzielniki muszą się
  zgadzać, inaczej obraz jedzie w jasność albo ciemność.
- Kąty siatek CMYK w `inkList()` — rozeta bierze się z ich wzajemnych różnic.
- Kolejność w `sampler()`: najpierw `adjust()`, dopiero potem rozmycie. Odwrotnie
  podbity kontrast wyostrzyłby krawędzie z powrotem i migotanie by wróciło.
- Konwencja `z` w `halftone.js`: **cała siatka liczy się w pikselach podglądu**,
  a przez `z` mnożona jest dopiero gotowa geometria punktu w `collectScreen()`.
  Dzięki temu zapis w skali jest dokładnym powiększeniem podglądu. Liczenie od
  razu w pikselach wyjścia wygląda równoważnie, ale nie jest: `round(px/step)`
  przeskakuje wtedy o próbkę na granicy zaokrąglenia i promienie rozjeżdżają się
  o ułamek procenta.
- Remisy w `quantizer()` wypadają w dół, tak jak w `nearest()`, który przy
  równej odległości zostaje przy pierwszym trafieniu. Zmiana tej reguły
  przesuwa pojedyncze piksele względem starych eksportów.
- Kolejność `syncUI()`: najpierw stan idzie do kontrolki, potem wraca z niej do
  `S`. Ten powrót nie jest zbędny — to on przycina liczby do zakresu suwaka
  i odrzuca nieznane opcje list, dzięki czemu wczytany plik nie może wsadzić
  do `S` wartości, której panel nie potrafi pokazać.
- `shape-rendering="crispEdges"` w eksporcie ditheru — bez tego przeglądarka
  antyaliasuje krawędzie i całe 1-bit się rozmywa.

## Jak testować

Nie ma testów automatycznych i na razie nie są potrzebne. Ręcznie:
przycisk „Próbka" wczytuje wygenerowany obraz z gradientami, cieniem i płaską
powierzchnią — na nim widać banding, odcięcia w cieniach i migotanie rastra.
Po zmianach przejdź presety w obu trybach.

Ruszając ścieżkę ditheringu sprawdź dodatkowo, czy worker i fallback dają ten sam
wynik: policz `ditherPixels()` na głównym wątku i porównaj bajt po bajcie
z `ditherData({keep:true})`. Muszą być identyczne dla każdego algorytmu — inaczej
podgląd rozjedzie się z eksportem.

**Rasteryzacja płótna nie jest powtarzalna przy bardzo gęstych siatkach.** Dwa
identyczne renderowania CMYK przy gęstości 3 na 1400 px potrafią różnić się o
kilkaset bajtów z sześciu milionów (antyaliasing setek tysięcy kółek składanych
przez `multiply`). Geometria punktów jest deterministyczna co do bitu, więc SVG
i podgląd się zgadzają — ale **testy porównawcze pisz na `collectScreen()`,
nie na pikselach płótna**, bo inaczej złapiesz szum, którego nie ma w wyniku.

Ruszając raster, porównaj `collectScreen(...,1)` z `collectScreen(...,z)`:
pozycje i promienie muszą wyjść **dokładnie** `z` razy większe, nie „w granicach
tolerancji". Porównując rendery pamiętaj, żeby obie wersje rysować na tym samym
płótnie — canvas offscreen i canvas na stronie rasteryzują antyaliasing inaczej
i wyjdą ci różnice, których nie ma.
