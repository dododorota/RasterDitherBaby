# Proces — stan prac i przekazanie

Zapis sesji z 22–30 września 2026 (Mac) i od 1 października 2026 (Windows).
Szczegóły techniczne (dlaczego kod wygląda tak, a nie inaczej) są
w `CLAUDE.md`; tu jest przebieg, stan i to, co zostało otwarte.

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
