# Raster

Narzędzie do ditheringu i rastra drukarskiego. Wszystko liczy się w przeglądarce
(albo w oknie aplikacji na pulpit), nic nie wychodzi na serwer. Eksport do PNG
i do SVG.

## Odpalenie

Moduły ES nie działają z `file://`, więc potrzebny jest lokalny serwer:

```bash
python3 serwer.py      # Windows (Git Bash): python serwer.py
```

Potem `http://localhost:8000`. Zero zależności, zero buildu — edytujesz plik,
odświeżasz kartę.

`serwer.py` to zwykły serwer Pythona z dwiema poprawkami: wyłącza cache
(inaczej przeglądarka potrafi podać stary moduł obok nowych — nowy `app.js`
ze starym `dither-core.js` — co daje błędy, których w kodzie nie ma) i jawnie
podaje typ plików `.js` (na Windowsie `python -m http.server` potrafi wziąć go
z rejestru jako `text/plain` i apka wtedy w ogóle nie startuje). `npx serve .`
też działa, ale po zmianach rób twarde odświeżenie (Cmd/Ctrl+Shift+R).

## Aplikacja na pulpit (Electron)

Ta sama apka w osobnym oknie, bez przeglądarki i bez serwera:

```bash
npm install            # raz — pobiera Electrona (~200 MB w node_modules)
npm start              # okno z apką prosto z plików projektu
npm run paczka         # dist/: instalator „Raster Setup …exe" i wersja przenośna
```

Jeśli po `npm install` brakuje `node_modules/electron/dist` (npm 11 nie
uruchamia skryptów instalacyjnych), pobierz go ręcznie:
`node node_modules/electron/install.js`.

Electron jest tylko opakowaniem (`electron/main.js`) — kod apki się nie
zmienia i dalej działa w przeglądarce. Zapis pliku otwiera systemowe okno
„Zapisz jako" z ostatnio użytym folderem. Pliki `.exe` nie są podpisane
certyfikatem, więc przy pierwszym uruchomieniu Windows SmartScreen pokaże
ostrzeżenie — „Więcej informacji" → „Uruchom mimo to". Ikona powstaje
skryptem: `npm run ikona`.

Krój Archivo leży w `fonty/` (licencja SIL OFL obok), więc apka nie łączy
się z Google Fonts i bez sieci wygląda tak samo.

## Co robi

**Tryb dithering** — piętnaście algorytmów dyfuzji błędu (Floyd–Steinberg,
False Floyd–Steinberg, Fan, Shiau–Fan 1 i 2, Atkinson, Jarvis–Judice–Ninke,
Stucki, Burkes, trzy warianty Sierry, Stevenson–Arce, Ostromukhov ze zmiennymi
wagami, Riemersma po krzywej Hilberta), osiem uporządkowanych (Bayer
2/4/8/16, siatka punktowa, niebieski szum, szum gradientowy IGN, szum losowy)
i pięć wzorów (linie poziome, pionowe, ukośne, krzyżyki, kropki 8×8).

**Tryb ASCII** — obraz ze znaków: siedem zestawów od „ .:-=+*#%@" po pełny
ASCII, bloki i 0/1, własne znaki albo powtarzany tekst; kolory z obrazu,
z palety albo jeden. Zapis do PNG, SVG (znaki jako tekst) i TXT.

**Warstwy** — kilka obrazów na płótnie o zadanym formacie (post, story, A4…),
z położeniem, skalą, obrotem, kryciem i trybem mieszania.

Interfejs domyślnie ciemny; przełącznik jasny/ciemny w nagłówku, wybór
zapamiętany. Grupy panelu zwijają się kliknięciem w nagłówek. Ponad 40 wbudowanych palet w kategoriach
(retro sprzęt, monitory, gradienty, duotony, riso, neon), edytor kolorów, paleta
wyciągana ze zdjęcia, a kolory przypisane albo jako najbliższe, albo według
jasności — jak mapa gradientu. Opis niżej, w „Kolorach w ditheringu".

**Tryb raster drukarski** — prawdziwe obrócone siatki rastrowe, jedna farba,
duotone, pełny CMYK pod klasycznymi kątami albo risograf z 1–4 własnymi
farbami, z mnożeniem farb. Siatka kwadratowa, heksagonalna, z okręgów albo
spirala; punkt okrągły, kwadratowy, gwiazdka, pierścień i inne, albo raster
liniowy z falującymi liniami. Suwak pasowania psuje rejestrację arkusza,
ziarno dokłada fakturę papieru, „faktura farby" — szorstkie krawędzie,
rozlanie, plamy i dziury w apli. Opis niżej, w „Rastrze i risografie".

Skala zapisu w obu trybach daje dokładne powiększenie podglądu: przy 4× rośnie
rozdzielczość, a nie gęstość rastra — ta sama liczba punktów, tylko narysowana
ostrzej.

Suwak rozmycia zmiękcza obraz tuż przed rastrem. Przy gęstych siatkach ostre
krawędzie schodkują, bo siatka punktów nie ma jak oddać detalu drobniejszego
niż komórka — 1–2 px wystarcza, żeby schodki zamieniły się w gradację. Rozmycie
liczy się w pikselach obrazu i działa tak samo przy każdej gęstości.

**Wideo i animacje** — film (MP4, WebM, MOV) albo animowany GIF/WebP przechodzi
przez te same ustawienia co zdjęcie, klatka po klatce. Zapis do MP4, GIF-a albo
klatek PNG w ZIP-ie — opis niżej.

## Struktura

```
index.html        markup i podpięcie modułów
src/styles.css    tokeny kolorów (light/dark) i cały layout
src/state.js      obiekt S — jedyne źródło prawdy o ustawieniach
src/dom.js        uchwyty do canvasu i helper $
src/palettes.js   biblioteka palet + szukanie najbliższego koloru
src/kwantyzacja.js redukcja kolorów: paleta ze zdjęcia, kolory GIF-a
src/rozmycie.js   rozmycie gaussowskie (raster przed siatką, poświata)
src/palette-files.js czytanie plików palet (.hex, .gpl, .pal, .ase, .txt)
src/kernels.js    macierze dyfuzji błędu i mapy Bayera
src/image.js      jasność/kontrast/gamma/negatyw (LUT) + skalowanie
src/dither-core.js   ditherPixels() — korekta i dithering, bez DOM-u
src/worker.js        wątek, w którym liczy się dyfuzja błędu
src/worker-client.js kolejka zadań workera, wypieranie nieaktualnych
src/dither.js     ditherData() ogarnia canvas i worker, renderDither() rysuje
src/halftone.js   sampler, inkList() farby, drawScreen() rysuje
src/siatki.js     geometria rastra: siatki, kształty punktu, raster liniowy
src/faktura-farby.js szorstkość, rozlanie, plamy i dziury farby
src/wycinanie.js  usuwanie tła po kolorze (maska), bez DOM-u
src/effects.js    efekty po rastrze: sortowanie pikseli, przesunięcie RGB, poświata
src/vector.js     eksport SVG — scalanie prostokątów i emisja kształtów
src/contours.js   obrys konturowy: śledzenie brzegów i wygładzanie ścieżek
src/batch.js      przetwarzanie całego folderu tymi samymi ustawieniami
src/zip.js        zapis paczki ZIP bez kompresji, bez zależności
src/video.js      film i animacja: klatki, odtwarzanie, zapis całości
src/animacja.js   klatki kluczowe: parametry zmieniające się w czasie
src/stos.js       stos efektów: kolejność, włączanie, uruchamianie w skali
src/fx.js         efekty: zabarwienie, aberracja, JPEG, gwiazdki, faktura…
src/ascii.js      tryb ASCII: rysowanie, SVG, TXT (wybór znaków: ascii-znaki.js)
src/warstwy.js    kompozycja z warstw: płótno, warstwy, składanie
src/render.js     render bieżącego trybu — jedno miejsce dla podglądu i zapisu
src/gif.js        koder animowanego GIF-a (LZW, kwantyzacja), bez DOM-u
src/mp4.js        kontener MP4 dla H.264 z WebCodecs, bez DOM-u
src/presets.js    wbudowane punkty startowe
src/app.js        kontrolki, presety, wczytywanie plików, zapis
serwer.py         serwer do pracy: bez cache, z poprawnym typem .js
testy/            skrypty weryfikacyjne (node, bez zależności)
PROCES.md         przebieg prac, stan i otwarte decyzje
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

## Raster i risograf

- **Siatka** — kwadratowa (klasyczna), heksagonalna (punkty w trójkątach,
  równe odstępy we wszystkich kierunkach), koncentryczne okręgi, spirala,
  promienie (słońce) albo „wzdłuż kształtu"; okręgi, spirala i promienie od
  środka przesuniętego suwakami.
- **Wzdłuż kształtu** — równe linie pod kątem farby, które obraz wygina:
  zaginają się wokół form i zagęszczają na krawędziach, jak rytowane linie
  obchodzące policzek. Siłę ustawia „Odkształcenie", gładkość upraszcza
  linie do większych form. Działa też z punktami (punkty wzdłuż linii).
- **Kształt punktu** — dawne (koło, kwadrat, romb, elipsa, linia, krzyżyk)
  i nowe: gwiazdka, krzyżyk ukośny, pierścień, sześciokąt, elipsa pod kątem.
- **Linie — raster liniowy**: zamiast punktów ciągłe linie wzdłuż siatki,
  grubsze w ciemnych miejscach. „Odkształcenie" przesuwa linię w bok o jasność
  obrazu — z prostych pasów robią się fale, jak w grafice rytowanej; na siatce
  z okręgów — obręcze. Gładkość uśrednia wygięcie, a grubość najmniejsza
  i największa ustawiają zakres — przy najmniejszej powyżej zera linia
  zostaje też w światłach. W SVG linie są prawdziwymi ścieżkami.
- **Risograf — własne farby**: 1–4 warstwy, każda ze swoim kolorem,
  gęstością, kątem, kształtem, kryciem, przesunięciem X/Y i obrotem płyty.
  Każda farba bierze z obrazu swoje źródło: jasność, kanał R/G/B, rozbicie
  CMYK albo „swój kolor" (ile ciemności piksela leży w kierunku tej farby).
  Farby mnożą się, więc z różu i niebieskiego robi się fiolet. Kolor można
  wybrać z listy tuszy riso (32 kolory, przybliżenia ekranowe). „Losowe
  pasowanie" rozsuwa farby (do ±6 px i ±1°) — powtarzalnie, inny układ
  przy każdym „wariancie losowania".
- **Nierówny raster** — jak zeskanowany odbity raster: chmury krycia
  (farba nałożona nierówno, niezależnie od obrazu, każda farba plami się
  gdzie indziej), nierówne punkty, drganie punktów z siatki i postrzępione
  brzegi okrągłych punktów. W geometrii, więc też w SVG; presety *Skan*
  i *Niebieski skan*.
- **Faktura farby** (dla każdego rodzaju farb): szorstkość — poszarpane
  krawędzie; rozlanie — farba wypływa poza punkt; plamy — nierówne krycie
  w apli; dziury — drobne niedodruki; ślady wałka — poziome smugi słabszej
  farby. Szum leży na siatce podglądu, więc
  zapis w skali daje ten sam wzór, tylko ostrzej. Faktura jest tylko na
  podglądzie i w PNG — SVG ma czyste kształty.

Presety: *Riso duo*, *Rytownik* (fale na żółtym), *Obręcze*, *Wzdłuż
  kształtu*, *Promienie*.

## Kontury zamiast prostokątów

Przy zapisie SVG z ditheringu można wybrać, jak zapisać piksele:

- **Piksele — prostokąty** (domyślnie): sąsiednie piksele tego samego koloru
  scalone w prostokąty.
- **Kontury — ścieżki**, z suwakiem wygładzenia:
  - *wygładzenie 0* — kontury dokładne: te same piksele co prostokąty, co do
    piksela, ale jako jedna złożona ścieżka na kolor. W Illustratorze to
    połączone kształty zamiast tysięcy obiektów; plik waży mniej więcej tyle
    samo, a przy dużych jednolitych plamach dużo mniej (próg: 308 prostokątów →
    3 ścieżki);
  - *wygładzenie 1–10* — schodki zamieniają się w skosy, kropki w zaokrąglone
    kształty. Ton zostaje zachowany (kropki mają to samo pole co piksele);
    do wygładzenia 6 obraz odbiega od pikseli o 1–3% pola, przy 10 to już
    wyraźna stylizacja.

Wygładzanie działa do 8 kolorów w obrazie. Warstwy są ułożone piętrowo, żeby
między wygładzonymi kolorami nie prześwitywało tło, a to oznacza obrysowanie
szumiącego brzegu na nowo dla każdego koloru — przy 16 kolorach plik rósł do
39 MB. Powyżej limitu zapis robi kontury dokładne i mówi o tym. Wygładzone
kontury najlepiej wychodzą przy pikselizacji 3× i większej, przy progowaniu
i przy ditheringu uporządkowanym; gęsty Floyd–Steinberg przy 1× daje plik
~4× cięższy od prostokątów.

## Cały folder naraz

„Przetwórz cały folder" w grupie *Obraz* przepuszcza wszystkie obrazy z
wybranego folderu (razem z podfolderami) przez bieżące ustawienia — tryb,
wygląd, paletę, skalę i format zapisu — i oddaje jeden plik ZIP. Struktura
podfolderów zostaje zachowana, a nazwy plików są takie jak oryginały, tylko
z rozszerzeniem `.png` albo `.svg`.

Na czas pracy panel jest zablokowany, żeby cały folder wyszedł w jednych
ustawieniach; „Przerwij" kończy po bieżącym pliku i oddaje to, co już jest
gotowe. Pliki, które nie są obrazami albo się nie otwierają, są pomijane
i wymienione w komunikacie. Obraz w podglądzie wraca na miejsce po skończeniu.

Paczka powstaje w pamięci przeglądarki i ma limit 4 GB (klasyczny ZIP).
Przy zapisie w skali 4–6× każdy plik to dziesiątki MB, więc duże foldery
lepiej dzielić albo zejść ze skalą.

Paczkę otwieraj dwuklikiem w Finderze. Systemowy `unzip` w terminalu macOS
przekręca polskie znaki w nazwach plików — nie obsługuje flagi UTF-8, którą
ZIP ustawia. Z terminala użyj `ditto -x -k paczka.zip folder`.

## Wideo i animacje

„Otwórz plik" albo przeciągnięcie na podgląd. Filmy: MP4 (H.264) i WebM działają
w każdej przeglądarce, MOV zależnie od kodeka (z iPhone'a w HEVC — nie zawsze).
Animacje: GIF, WebP i APNG z więcej niż jedną klatką; GIF z jedną klatką
otwiera się jak zwykły obraz.

Każda klatka przechodzi przez dokładnie tę samą ścieżkę co zdjęcie — tryb,
korekta, algorytm, paleta, efekty, presety. Klatka z MP4 czy GIF-a jest co do
piksela taka sama jak zapis tej klatki do PNG (GIF bez strat, MP4 po kompresji).

Pod podglądem jest **oś czasu**: odtwarzanie (też spacją) i przewijanie.
W grupie *Wideo*:

- **Klatki na sekundę** — domyślnie tempo z pliku (wykrywane przy otwarciu).
  Niższe, np. 12 albo 8, daje szarpany ruch jak w animacji poklatkowej —
  podgląd odtwarza się w tym samym tempie co zapis. Animacje mają tempo
  z pliku, klatka po klatce.
- **Początek i koniec** — zakres do zapisu; przeciąganie pokazuje klatkę
  z brzegu zakresu.

Zapis (grupa *Eksport*, przy wczytanym filmie):

- **MP4 — wideo.** H.264 z kodera przeglądarki (WebCodecs). Sprawdzone
  w Chrome; Firefox i Safari mają WebCodecs w nowszych wersjach, ale tam
  nikt tego nie testował. Trzy poziomy jakości. H.264 rozmywa drobny
  dithering — kolorowe piksele 1×1 najbardziej, bo kolor zapisywany jest
  w połowie rozdzielczości. Najostrzej wychodzi zapis w skali 2× i wyżej.
  Wymiar nieparzysty jest przycinany o piksel (wymóg H.264). Klatka kluczowa
  co ~2 s, więc film da się przewijać w programie do montażu.
- **GIF — animacja.** Bez strat, dopóki klatka ma najwyżej 256 kolorów, czyli
  przy ditheringu zawsze, poza kolorowym przesunięciem RGB. Raster drukarski ma
  wygładzone brzegi punktów i tysiące odcieni — takie klatki są redukowane
  medianą do 256, a apka mówi, ile ich było. GIF najkrótsze opóźnienie ma
  2/100 s, więc film powyżej 50 kl/s w GIF-ie zwolni. Pliki są duże: dithering
  to szum, którego LZW prawie nie ściska — trzymaj krótkie zakresy albo
  pikselizację.
- **PNG — klatki w ZIP-ie.** Bez żadnych strat, do After Effects i Premiere
  jako sekwencja obrazów. Numery w nazwach to numery klatek z filmu.

PNG i SVG zapisują bieżącą klatkę. Zapis całego filmu blokuje panel jak
przetwarzanie folderu; „Przerwij" kończy po bieżącej klatce i oddaje to, co
gotowe. Orientacyjnie, Full HD przycięte do 1400 px: Floyd–Steinberg ok.
80 ms na klatkę, Bayer i raster drukarski 30–40 ms — minuta filmu w 30 kl/s to
1–3 minuty liczenia.

**Migotanie.** Dyfuzja błędu przestawia wzór w całym obrazie przy najmniejszej
zmianie, więc między klatkami szumi i „gotuje się". To bywa efektem samym
w sobie; spokojny obraz dają algorytmy uporządkowane (Bayer, siatka punktowa)
i raster drukarski, bo ich wzór stoi w miejscu.

**Dźwięk** — MP4 z filmu dostaje jego ścieżkę dźwiękową, przyciętą do
zakresu zapisu (ptaszek „Dźwięk z filmu" przy MP4). Kodowany przez
przeglądarkę do AAC; gdy kodera AAC nie ma — do Opusa (odtworzy go
przeglądarka i VLC, QuickTime nie). GIF, klatki PNG i animacja obrazu są bez
dźwięku.

**Stabilizacja dyfuzji** (grupa *Wideo*) — zmniejsza migotanie dyfuzji błędu:
piksel zostaje w kolorze z poprzedniej klatki, jeśli ten jest prawie tak samo
dobry jak najbliższy. Na nieruchomym ujęciu z szumem migotanie spada
z kilkudziesięciu procent pikseli na klatkę do prawie zera, a ruch nie
zostawia smug. Działa przy odtwarzaniu i w zapisie, bo wymaga klatek po
kolei — na zatrzymanym kadrze widać obraz bez stabilizacji. Zapis zaczyna
od czystej pamięci, więc wynik nie zależy od tego, co wcześniej oglądano.

## Algorytmy

Poza klasyką dyfuzji błędu i Bayerem:

- **Ostromukhov — zmienne wagi** (SIGGRAPH 2001). Wagi rozprowadzania błędu
  zależą od jasności piksela, z tabeli autora — mniej regularnych „robaków"
  niż u Floyda–Steinberga, a przy mocnym kontraście charakterystyczne faktury
  w tonach skrajnych. Wynik zgadza się co do piksela z oryginalnym programem
  autora (sprawdza to `testy/algorytmy.mjs`).
- **Riemersma — krzywa Hilberta** (1998). Obraz przechodzony po krzywej
  wypełniającej płaszczyznę zamiast wierszami, błąd niesie kolejka 16
  ostatnich pikseli. Bez kierunkowych smug, ziarno bardziej organiczne.
- **Stevenson–Arce** — szeroka dyfuzja z siatki sześciokątnej, miękka faktura.
- **Niebieski szum** — uporządkowany jak Bayer (stabilny w filmie, nie
  migocze), ale bez kratki: punkty rozłożone równomiernie i bez wzoru.
- **False Floyd–Steinberg, Fan, Shiau–Fan 1 i 2** — warianty Floyda–Steinberga
  z innym rozkładem wag (Shiau–Fan z patentu US 5 353 127): mniej „robaków",
  inna faktura w półtonach.
- **Bayer 16×16** — drobniejsza kratka, 256 poziomów progu.
- **Szum gradientowy (IGN)** — próg ze wzoru Jimeneza (Call of Duty, 2014):
  bez kratki, stabilny w filmie.
- **Wzory** — linie poziome, pionowe, ukośne, krzyżyki, kropki 8×8:
  macierze progowe, w których farba rośnie liniami albo kropkami. Też stabilne
  w filmie. Zaprojektowane tu, nie z literatury.

Wszystkie działają w obu sposobach przypisania kolorów (najbliższy, według
jasności) i z każdą paletą.

## Korekta przed rastrem

Jasność, kontrast, **cienie, półtony (gamma), światła**, **nasycenie**,
**odcień** (obrót barwy), **rozmycie**, **wyostrzanie**, **odszumianie**
(filtr dwustronny — zdejmuje szum, krawędzie zostawia), pikselizacja,
negatyw. Działa we wszystkich trzech trybach. Rozmycie przeniesione tu z siatki
rastra — teraz działa też w ditheringu. „Przywróć korektę" zeruje tylko tę
grupę, „Przywróć wszystko do domyślnych" w grupie *Tryb* — cały wygląd.

Wszystkie promienie są w pikselach obrazu, więc jedno ustawienie znaczy to
samo przy każdej pikselizacji i gęstości rastra.

## Kolory w ditheringu

**Paleta** — lista w kategoriach, strzałkami ◀ ▶ można ją przerzucać bez
rozwijania. Poza dawnymi (1-bit, szarości, Game Boy, CGA, siatki RGB):

- *Retro sprzęt* — EGA, Commodore 64, ZX Spectrum, PICO-8, Apple II, Virtual Boy;
- *Monitory* — bursztynowy, zielony fosfor, niebieski ekran, szary LCD;
- *Gradienty* — niebieska poświata, ogień, matrix, sepia, zachód słońca, lód,
  termowizja, fiolet, kawa, morze;
- *Duotony* — dwa kolory, od cieni do świateł;
- *Riso* — farby risografu na kremowym papierze;
- *Neon* — synthwave, vaporwave, cyberpunk.

**Kolory przypisane** — dwa sposoby, w jaki obraz trafia na paletę:

- *Najbliższy kolor ze zdjęcia* — każdy piksel dostaje kolor palety najbliższy
  swojemu. Zdjęcie zachowuje barwy, na ile paleta pozwala. Tak działa dithering
  pod konkretny sprzęt.
- *Według jasności — gradient* — dithering liczy się na samej jasności, a poziomy
  dostają kolory palety po kolei: cienie pierwszy, światła ostatni. Barwa zdjęcia
  nie ma znaczenia, liczy się tylko jasność — tak powstają duotony, termowizja
  i niebieskie postacie jak w Dither Boyu. Kolejność kolorów ma tu znaczenie.

Wybór palety z listy przestawia sposób na ten, do którego paleta jest zrobiona
(gradienty i duotony — według jasności, sprzęt — najbliższy kolor). Można go
potem zmienić ręcznie.

**Edytor** — kliknięcie próbki otwiera wybór koloru; *Dodaj* wstawia za
zaznaczoną kolor w połowie drogi do sąsiada, *Usuń* usuwa zaznaczony (najmniej
dwa zostają), *Odwróć* i *Sortuj* (od ciemnego do jasnego) przestawiają
gradient. Zmieniona paleta wbudowana staje się własną — „Ogień (zmieniona)" —
i od tej chwili zapisuje się w presetach i plikach jak paleta z Lospec.
Paleta 1-bit ma zamiast próbek dwa pola, farbę i papier.

**Paleta ze zdjęcia** — wyciąga z bieżącego obrazu (albo klatki filmu) wybraną
liczbę kolorów, od 2 do 32, ułożonych od najciemniejszego. Szuka kolorów
skrajnych, nie tylko najczęstszych: mała czerwona plama na szarym tle trafi do
palety, bo bez niej dithering nie miałby czym oddać czerwieni. Zdjęcie podane
przez „Wczytaj z pliku" też tak działa.

**Głębia koloru** — paleta „Kolor — głębia z suwaka": od 2 do 16 poziomów na
kanał (8 do 4096 kolorów). Według jasności to po prostu tyle poziomów szarości.

**Dopasowanie percepcyjne (Oklab)** — przy „najbliższym kolorze" wybór
w przestrzeni Oklab zamiast RGB: najbliższy kolor to ten, który oko uznaje za
najbliższy. Przy kolorowych paletach mniej przeskoków w dziwne odcienie.

**Lista kolorów z kodami** (rozwijana pod próbkami) — każdy kolor jako kod
hex do wpisania (z # albo bez), strzałki ↑ ↓ do przesuwania i × do usuwania.
*Kopiuj kody* wrzuca całą paletę do schowka.

**Zapisane palety** (presety kolorów) — rozwijana lista pod przyciskami
palety: nazwa i „Zapamiętaj" zapisują bieżącą paletę razem z kolejnością
i sposobem przypisania kolorów (gradient albo najbliższy); klik w nazwę
przywraca, × usuwa. Żyją w tej przeglądarce — na inny komputer przenosi je
„Zapisz .hex".

**Zapisz .hex** — bieżąca paleta w formacie Lospec, w kolejności, w jakiej
działa bieżący tryb.

W rastrze drukarskim farba (czarna) i papier mają teraz swoje pola w grupie
*Siatka rastra* — to te same kolory co farba i papier palety 1-bit.

## Animacja parametrów

Jak w After Effects: parametry zmieniają się w czasie między klatkami
kluczowymi. Działa na filmach, animowanych GIF-ach i na **zwykłym obrazie** —
„Animuj obraz — klatki kluczowe" w grupie *Obraz* zamienia go w film
o wybranej długości (1–30 s) i tempie, a dalej wszystko jak przy filmie:
oś czasu, odtwarzanie, zapis do MP4, GIF-a albo klatek PNG.

- **◆ przy suwaku** (widoczny, gdy jest oś czasu) dodaje klatkę kluczową
  w bieżącym miejscu osi, a kliknięty na istniejącej klatce — usuwa ją.
  Zapalony na magentowo: w tej chwili jest klatka; szary: parametr jest
  animowany, ale klatka jest gdzie indziej.
- Gdy parametr ma już klatki, **ruszenie jego suwaka** w innym miejscu osi
  samo dodaje następną.
- Między klatkami wartość przechodzi płynnie (wolny start i koniec), przed
  pierwszą i po ostatniej stoi w miejscu. Wartości pośrednie są zaokrąglane do
  kroku suwaka — każda klatka da się ustawić ręcznie.
- Pod osią czasu jest ścieżka każdego animowanego parametru ze znacznikami
  klatek; kliknięcie znacznika przewija do niego, × usuwa animację parametru.

Animować da się każdy suwak wyglądu: korektę, pikselizację, siłę i punkt
bieli ditheringu, całą siatkę rastra, efekty i poświatę. Animowana
pikselizacja zmienia wymiar obrazu o parę pikseli — w zapisie każda klatka
jest wyrównywana do rozmiaru pierwszej.

**Przejście** między klatkami ustawia się dla całej ścieżki przyciskiem przy
jej nazwie pod osią: ∿ płynnie (wolny start i koniec), ⟋ liniowo, ⊓ skokowo
(wartość trzyma się do następnej klatki — jak „Hold" w After Effects).

Pętla bez przeskoku: ustaw ostatnią klatkę kluczową na tę samą wartość co
pierwszą. Klatki kluczowe (z przejściami) zapisują się w presetach — w pliku
i w przeglądarce. Preset z animacją ją przywraca; preset bez animacji
(wbudowany, stary plik) zostawia bieżącą.

## Efekty po rastrze

Efekty to **stos**: „+ Dodaj efekt" dokłada kartę na koniec listy, a efekty
działają po kolei od góry. Każda karta ma ↑ ↓ (kolejność), ◉ (ukryj — parametry
zostają), × (usuń) i zwija się kliknięciem w nazwę. Działają we wszystkich
trzech trybach; w rastrze drukarskim ziarno papieru zawsze na samym końcu.

Stare presety i pliki (sprzed stosu) dostają kolejność sortowanie →
przesunięcie RGB → poświata, czyli dokładnie ten obraz co wcześniej.

- **Aberracja chromatyczna** — czerwień i błękit rozjeżdżają się promieniście
  od środka, jak w tanim obiektywie.
- **JPEG glitch** — prawdziwa kompresja JPEG liczona w apce (bloki 8×8, kolor
  w połowie rozdzielczości, tablice ze standardu), a do tego uszkodzenia
  strumienia: od trafionego bloku wiersz się przesuwa i zmienia kolor.
  *Wariant* losuje inne miejsca uszkodzeń.
- **Zabarwienie** — kolor przez jasność (czerń → kolor → biel), mnożenie albo
  rozjaśnienie.
- **Gwiazdki** — promienie z najjaśniejszych punktów, jak z przysłony:
  liczba promieni, długość, obrót, próg.
- **Faktura** — wzór nałożony na obraz: maska RGB i rozeta jak w kineskopie,
  linie skanowania, szum, szum barwny, tkanina, kratka, romby, tęcza;
  skala, mieszanie (mnożenie, rozjaśnienie, nakładka, miękkie światło), krycie.
  W ditheringu faktura leży na siatce pikseli po pikselizacji.
- **Obróbka końcowa** — jasność, kontrast i nasycenie już po ditheringu,
  winieta, ziarno.
- **Zmienność w czasie** — jedyny efekt PRZED ditheringiem: szum i drgania
  inne w każdej klatce osi czasu, a dla Bayera, wzorów i niebieskiego szumu
  wędrująca siatka. Nieruchomy obraz zamieniony w animację „żyje", bo wzór
  ditheringu układa się w każdej klatce inaczej — jak Temporal Variation
  w Dither Boyu. Bez osi czasu nic nie robi.

- **Sortowanie pikseli** — w każdym wierszu (albo kolumnie) ciągłe odcinki
  pikseli o jasności z wybranego przedziału są układane od najciemniejszego do
  najjaśniejszego. Piksele spoza przedziału stoją w miejscu i przerywają
  odcinki, więc zawężenie przedziału daje krótsze smugi. Sortowanie tylko
  przestawia piksele, więc paleta zostaje zachowana.
- **Przesunięcie RGB** — czerwony przesunięty w wybranym kierunku, niebieski
  w przeciwnym, zielony zostaje. **Tworzy kolory spoza palety** (obwódki na
  krawędziach), więc przy ditheringu pod konkretny sprzęt — Game Boy, CGA —
  wynik przestaje być wierny palecie. W ditheringu przesunięcie jest w całych
  pikselach po pikselizacji.
- **Poświata** — jasne miejsca świecą miękkim halo w kolorze z obrazu albo
  w wybranym (np. szare zdjęcie świeci na niebiesko), nałożonym
  trybem „screen" (tylko rozjaśnia). *Promień* to zasięg halo, *Świeci powyżej
  jasności* — od jakiej jasności piksel zaczyna świecić. Siła ponad 100%
  przepala halo do bieli. Halo ma dwie warstwy: jasny rdzeń tuż przy świecącym
  miejscu i szeroką mgiełkę. Najlepiej wychodzi na ciemnych zdjęciach i filmach;
  na jasnych trzeba podnieść próg. Tworzy kolory spoza palety, więc GIF
  z poświatą idzie przez redukcję kolorów.

Wszystkie są deterministyczne (losowość z funkcji skrótu, nie z Math.random),
a zapis w skali pozostaje dokładnym powiększeniem podglądu. W SVG z ditheringu
zostają tylko sortowanie i przesunięcie RGB — pozostałe efekty tworzą tysiące
nowych kolorów i zamieniłyby wektor w setki tysięcy prostokątów. W rastrze
drukarskim i ASCII SVG nie zawiera efektów wcale. Po zapisie apka mówi, czego
brakuje.

## ASCII

Trzecia zakładka trybu. Obraz dzielony na komórki o proporcjach znaku pisma
o stałej szerokości (*Rozmiar znaku*), a każda komórka dostaje znak według
jasności:

- **Zestawy** — standard, pełny ASCII (70 znaków), bloki, binarny (0 i 1),
  kropki, kreski, litery, własne znaki (od najrzadszego do najgęstszego).
- **Powtarzany tekst** — zamiast rampy jasności znaki wybranego tekstu po
  kolei; ciemne komórki zostają puste.
- **Kolor znaków** — z obrazu, z palety (pokazuje wtedy grupę *Paleta*),
  albo jeden kolor. Drugi kolor to tło.
- **Dithering znaków** — Floyd–Steinberg na poziomach rampy: gładsze przejścia
  przy krótkich zestawach.

Na ciemnym tle jasne miejsca dostają gęste znaki, na jasnym ciemne — obraz
zawsze wygląda jak obraz, nie jak negatyw. Działa korekta, stos efektów,
animacja i film. Zapis: PNG, SVG (znaki jako tekst, edytowalne
w Illustratorze), TXT (sam tekst).

## Warstwy

„Kompozycja z warstw" w grupie *Obraz* robi z bieżącego obrazu pierwszą
warstwę płótna. „Usuń tło i podłóż kolor" robi to samo, od razu z wyciętym
tłem i płótnem w kolorze papieru — wystarczy zmienić kolor tła płótna. Dalej:

- **Płótno** — format (kwadrat, post 4:5, story 9:16, 16:9, A4) albo własny
  rozmiar, kolor tła albo przezroczyste.
- **Warstwy** — „+ Dodaj obraz", a w kompozycji także „Otwórz plik",
  przeciągnięcie i „Próbka" dokładają warstwę zamiast podmieniać obraz. Lista od
  góry: ◉ ukryj, ↑ ↓ kolejność, × usuń, dwuklik w nazwę — zmiana nazwy.
- **Zaznaczona warstwa** — położenie, skala, obrót, krycie, mieszanie
  (normalne, mnożenie, rozjaśnienie, nakładka…). Przesuwa się też myszą na
  podglądzie.
- **Usuń tło tej warstwy** — po kolorze: tło to piksele bliskie wskazanemu
  kolorowi (odległość w Oklab, czyli tak, jak różnicę widzi oko). Kolor
  zgadywany z brzegów zdjęcia albo „Wskaż kolor" i klik w podgląd.
  Tolerancja, miękka krawędź i „tylko tło połączone z brzegami" — wtedy
  biała koszula na białym tle zostaje, jeśli nie dotyka krawędzi. Pod
  wycięty obiekt idzie kolor płótna (albo przezroczystość).
- **Zakończ kompozycję** — zostaje spłaszczony obraz.

Kompozycja to materiał jak zdjęcie: przechodzi przez tryb, korektę, efekty,
animację i zapis, ale nie trafia do presetów. Efekty działają na całą
kompozycję — w Dither Boyu efekt może działać tylko na warstwy pod nim, tu nie.
Filmów w kompozycji nie ma (tylko obrazy).

## Przezroczyste tło

Przy zapisie PNG: kolor papieru staje się przezroczysty. Tylko tam, gdzie
papier jest określony — 1-bit, raster drukarski, ASCII (tam tło po prostu się
nie rysuje). Piksele zmienione przez ziarno albo efekty zostają.

## Palety własne

„Wczytaj z pliku" w grupie *Paleta*, albo przeciągnięcie pliku na podgląd.
Czyta wszystko, co da się pobrać z lospec.com: `.hex`, `.gpl` (GIMP), `.pal`
(JASC), `.txt` (Paint.NET), `.ase` (Adobe) i pasek próbek PNG. Format
rozpoznaje po zawartości, nie po rozszerzeniu.

Z obrazka bierze unikalne kolory w kolejności, wiersz po wierszu, pomijając
piksele przezroczyste — działa z paskiem 1×N, jego powiększeniami i siatką
próbek. Obrazek z ponad 256 kolorami to zdjęcie — wtedy wyciąga z niego tyle
kolorów, ile wybrano przy „Paleta ze zdjęcia". **PNG trzeba podać
przyciskiem palety** — upuszczony na podgląd jest obrazem do przetworzenia.

Z `.ase` bierze kolory RGB, szare i CMYK (to ostatnie przeliczone naiwnie, bez
profilu); kolory Lab pomija i mówi o tym. Duplikaty wylatują, paleta ma od 2 do
256 kolorów. Wszystko, co zostało pominięte albo poprawione, pojawia się pod
przyciskiem.

Paleta własna przeżywa kliknięcie wbudowanego presetu — to materiał jak obraz,
nie część wyglądu — i jest zapisywana w pliku presetu, gdy jest wybrana.

Koszt rośnie z liczbą kolorów, ale od 32 kolorów najbliższy kolor jest szukany
przez siatkę kubełków zamiast przeglądania całej palety: 16–32 kolory to ok.
1,5–2× czasu palety 1-bit, a 64–256 kolorów ok. 2× (bez siatki 256 kolorów
kosztowało prawie 9×). Wynik jest identyczny co do bajtu z pełnym
przeglądaniem. Dithering liczy się w workerze, więc interfejs i tak nie staje.

## Presety

Kilka wbudowanych na tryb (w ditheringu m.in. *Poświata*, *Termowizja*,
*Riso*), plus dwa sposoby na własne (preset zapisuje cały wygląd, paletę
własną i klatki kluczowe animacji):

- **„Zapamiętaj"** — preset ląduje w przeglądarce jako przycisk obok
  wbudowanych (w przerywanej ramce, z × do usuwania). Bez nazwy dostaje
  kolejny numer, ta sama nazwa nadpisuje. Każdy tryb ma swoje.
- **„Zapisz do pliku" / „Wczytaj plik"** — JSON, który można przenieść na inny
  komputer albo komuś wysłać; plik da się też przeciągnąć na podgląd.

Presety w przeglądarce są przypisane do adresu, pod którym otwierasz apkę:
`localhost:8000` i `localhost:3000` to dla przeglądarki dwa różne miejsca,
a wyczyszczenie danych stron je kasuje. **Na stałe trzymaj ważne presety
w plikach.**

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

Porównanie z Dither Boyem (studioaaa.com) — czego tu jeszcze nie ma:

- efekty działające tylko na warstwy pod nimi i animacja położenia warstw;
- wiele kopii tego samego efektu w stosie;
- dot diffusion (Knuth) i wariant Riemersmy z rozkładem przestrzennym —
  wymagają tabel, których nie było z czego wiarygodnie wziąć;
- osobne krzywe przejścia dla pojedynczych klatek (dziś jedna na ścieżkę).

Wycinanie z tła (jest: po kolorze, w warstwach):

- *automatycznie (sieć neuronowa)* — wycina postać czy przedmiot z dowolnego
  tła, ale wymaga pobrania modelu (kilka–kilkadziesiąt MB) z sieci przy
  pierwszym użyciu, co łamie zasadę „bez zależności” — tylko za zgodą;
- **ręczna poprawka maski** — pędzel „dodaj / usuń” na podglądzie.

Raster i risograf — z listy zostało:

- faktura papieru pod farbą (włókna, struktura) — dziś tylko ziarno.

Tekstury nakładane na obraz (jak „Tile" w Dither Boyu) — efekt w stosie,
powtarzany kafel z wyborem wzoru, skalą, siłą i trybem mieszania:

- RGB Matrix (subpiksele LCD), RGB Rosette, paski RGB;
- szum barwny (chroma noise), szum tkaniny (fabric noise);
- tęcza, romby (diamond), wałek (roller), linie skanowania (scanline).

## Licencja

Prywatne narzędzie, rób z tym co chcesz.
