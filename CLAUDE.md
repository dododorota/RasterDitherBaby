# Notatki dla Claude Code

**Zanim zaczniesz: przeczytaj `PROCES.md`** — stan prac, co jest niescalone,
czego nie sprawdzono i jakie decyzje czekają na użytkowniczkę.

## Czym to jest

Przeglądarkowe narzędzie do ditheringu i rastra drukarskiego dla projektantki
graficznej. Efekt wizualny jest produktem — jeśli zmiana psuje wygląd, jest zła,
nawet jeśli kod jest czystszy.

## Zasady

- **Terminal: Git Bash, nie PowerShell.** Polecenia uruchamiaj w Git Bashu
  (składnia POSIX, ukośniki `/`).
- **Git tylko do odczytu.** Wolno sprawdzać (`git status`, `git log`,
  `git diff`, `git show`, `git branch` bez argumentów itp.). Nie wolno niczego,
  co zmienia repo albo pliki: commit, push, add, checkout, reset, restore,
  stash, rm, clean, merge, rebase, tworzenie i usuwanie gałęzi, dodawanie
  zdalnych repo. To robi użytkowniczka — jeśli trzeba, podaj gotowe polecenie
  do skopiowania.

- **Bez buildu i bez zależności.** Czysty JS, moduły ES, `python3 serwer.py`
  (albo `npx serve .`). Do testów przeglądarkowych używaj `serwer.py` — bez
  cache, więc nie złapiesz starego modułu.
  Nie dodawaj bundlera, TypeScriptu ani frameworka bez wyraźnej prośby.
  Wyjątek na prośbę użytkowniczki: **Electron** jako opakowanie na pulpit
  (`electron/`, devDependencies) — apka nic o nim nie wie i dalej działa
  w przeglądarce z `serwer.py`. Nie importuj niczego z Electrona w `src/`.
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

**Kontury w SVG** (`contours.js`, `svgKontury()` w vector.js). Śledzenie po
krawędziach pikseli z regułą skrętu w prawo na wierzchołkach siodłowych —
obszar 4-spójny, więc szachownica daje osobne kropki. Kontury dokładne
obrysowujemy per kolor (stykają się bez szczelin, bo leżą na siatce), wygładzone
piętrowo (każda warstwa = swój kolor plus wszystkie nad nim), bo inaczej między
wygładzonymi brzegami prześwituje tło. Małe pętle po wygładzeniu skalujemy do
pola pikseli, z których powstały — bez tego kropka traciła 17% pola i rzadki
dithering jaśniał. Testy: kontur dokładny musi dać pole równe liczbie pikseli
i zgodność każdego środka piksela pod regułą evenodd; SVG z konturami
dokładnymi po rasteryzacji musi być piksel w piksel jak SVG z prostokątów.

**Przetwarzanie folderu** (`batch.js`) używa tych samych funkcji renderu co
podgląd i zapis — nie pisz dla niego osobnej ścieżki, bo paczka rozjedzie się
z pojedynczym eksportem (dziś PNG z paczki jest co do piksela taki sam jak
zapis tego obrazu ręcznie). Stan zapamiętywany na starcie i przywracany przed
każdym plikiem; nowe pole w S, które wpływa na wynik, musi być w `LOOK` albo
w `KLUCZE` w batch.js. Panel na czas pracy dostaje `inert`, nie samo
`pointer-events`, bo klawiatura dalej ruszałaby suwaki.

**Palety wbudowane** to `BIBLIOTEKA` w palettes.js — lista w panelu powstaje
z niej, więc nowa paleta to jeden wpis. Kolejność kolorów w palecie ma
znaczenie w trybie „według jasności" (pierwszy = cienie), dlatego gradienty
idą od ciemnego do jasnego (pilnuje tego `testy/kolory.mjs`). Dawnych palet
(`bw`, `gray4`, `gray8`, `rgb3`, `quant`, `gameboy`, `cga`) nie ruszaj: ich
identyfikatory siedzą w zapisanych presetach, a kolejność kolorów rozstrzyga
remisy w `nearest()`. 1-bit ma od zawsze kolejność [papier, farba], a gradient
potrzebuje [farba, papier] — dlatego tryb jasności bierze `paletaGradientu()`,
nie `palette()`.

**Tryb „według jasności"** (`S.mapa === "jasnosc"`, `ditherJasnosci()`
w dither-core.js) liczy dithering na jednej liczbie zamiast trzech: N równo
rozłożonych poziomów, poziom k → k-ty kolor palety. Po zmianach w dither-core
porównuj stare tryby co do bajtu z poprzednią wersją (wyciągniętą z gita do
pliku obok) — tak sprawdzony był refaktor przy dodawaniu tego trybu.

**Edytor palety** zamienia każdą zmienioną paletę wbudowaną w `S.custom`
(`doEdycji()`), zamiast wprowadzać trzeci rodzaj palety — dzięki temu presety,
plik presetu i zapis .hex działają bez zmian. Uwaga: `paletaZDanych()` przy
wczytywaniu usuwa powtórzone kolory, więc gradient z celowo zdublowanym
kolorem wraca z pliku krótszy.

**Poświata** (effects.js) liczy się na siatce podglądu jak pozostałe efekty:
w ditheringu w workerze na buforze po pikselizacji (promień × 1/pix), w rastrze
z obrazu podglądu (przy zapisie w skali — z pomocniczego renderu 1×), a gotowa
warstwa jest powiększana płynnie i nakładana trybem screen. SVG z ditheringu
dostaje `{bezPoswiaty:true}` — opcja idzie przez `ditherData()` do workera.
Siłę warstw (`BLISKA`, `DALEKA`) dobierano na oko na ciemnej scenie i próbce —
zmieniając je, oglądaj zrzuty (`ZRZUT=` w teście przeglądarki), test w Node
sprawdza tylko kierunek, nie wygląd.

**Algorytmy specjalne** (`ditherSpecjalny()` w dither-core.js): Ostromukhov
zmienia wagi z piksela na piksel, Riemersma idzie po krzywej Hilberta — oba
nie pasują do zwykłej pętli z `K[algo]`, więc mają własne, a wspólną
kwantyzację dla obu trybów kolorów daje `przygotuj()`. Bufor w Float64, bo
tylko tak Ostromukhov zgadza się co do piksela z programem autora
(`testy/algorytmy.mjs`, dane w `testy/dane/`). Tabela wag w kernels.js jest
wygenerowana programem z oryginalnego varcoeffED.c — nie przepisuj jej
ręcznie. Wiersz tabeli wybiera jasność WEJŚCIOWA, nie skorygowana o błąd,
a czysta czerń wejścia zostaje czarna — oba szczegóły z oryginału. Niebieski
szum (void-and-cluster) liczy się raz, deterministycznie, w workerze
i na głównym wątku tak samo. Wzory (`WZORY`) to nasze macierze, nie z literatury.

**Animacja parametrów** (`animacja.js`): klatki kluczowe w jednostkach suwaka,
nie S — wynik interpolacji zaokrąglany do kroku suwaka. `KONW` (suwak → S,
zakres) ustawia app.js z tabeli `SUWAKI`, bo animacja.js nic nie wie
o kontrolkach. Zapis filmu woła `zastosuj(S, t)` przed renderem każdej klatki,
podgląd — w `przyKlatce`. Animowana pikselizacja zmienia wymiar `out`, więc
`wyrownaj()` w video.js rozciąga klatkę do rozmiaru pierwszej (MP4 i GIF mają
jeden rozmiar). Zwykły obraz jako film to `Stopklatka` w video.js — trzecie
źródło obok `Film` i `Animacja`, z tym samym interfejsem. Uwaga na wyścig:
„Próbka" i wczytany obraz ładują się asynchronicznie, a `setImage()` zamyka
animację — w testach czekaj na zmianę `S.img`, nie na widoczność przycisków.

**Przewijanie a zamykanie źródła**: `idzDo()` porzuca wyniki ze źródła, które
w międzyczasie zamknięto, a `zdarzenie()` przerywa czekanie na „seeked" po
„emptied". Bez tego przewijanie zamkniętego filmu wisiało do 20 s i gubiło
następne żądania.

**Stos efektów** (`stos.js`): kolejność to tekst `S.efekty` („jpeg,!rgb,glow",
„!" = ukryty) — tekst, bo przechodzi przez presety i ich walidację bez zmian.
Pusty = „po staremu" (sortowanie, RGB, poświata, jeśli niezerowe) — tak stare
presety dają ten sam obraz co do bajtu. Nowy efekt: funkcja w `fx.js` (czysta,
deterministyczna — losowość przez `skrot()`, nigdy Math.random), wpis w
`EFEKTY` i `DZIALA`, gałąź w `uruchomNaBuforze` i `uruchomWSkali` (w skali:
mały i duży bufor idą razem, każdy efekt po swojemu, test w `testy/stos.mjs`
sprawdza dokładne powiększenie), karta w markupie, klucze w `DEFAULTS`
i `SUWAKI`. Zmienność w czasie działa PRZED ditheringiem i czyta
`S.klatkaNr` — ustawia go podgląd filmu (`przyKlatce`) i zapis (video.js).

**Korekta** (image.js): krzywa (LUT) → barwa (macierz) → przestrzenna
(odszumianie, rozmycie, wyostrzanie, `korektaPrzestrzenna`). Każdy krok przy
wartości neutralnej pominięty w całości — inaczej stare obrazy zmieniłyby się
o pojedyncze bajty. Rozmycie (`S.blur`) przeniesione z rastra do korekty; w
rastrze liczy się dokładnie jak wcześniej.

**Trzy tryby**: dithering, raster, ASCII. Render bieżącego trybu tylko przez
`renderuj()` (render.js) i `svgTrybu()` (vector.js) — nie dopisuj trzeciej
gałęzi w kolejnym miejscu. Wybór znaków ASCII jest czysty w `ascii-znaki.js`.

**Kompozycja z warstw** (`warstwy.js`): materiał jak film — stan w `K`,
nie w S, nie w presetach. Złożone płótno to stale ten sam obiekt w `S.img`.
W kompozycji `setImage()` dokłada warstwę zamiast podmieniać obraz.

**Wartości domyślne a `syncUI()`**: stałe używane w funkcjach wołanych przy
starcie (np. `NAPISY` w `eksportUI`) muszą być zdefiniowane wyżej w pliku niż
pierwsze `syncUI()` — inaczej TDZ wysypuje cały panel, a test w Node tego nie
złapie (łapie go `testy/przegladarka.mjs`).

**Stabilizacja dyfuzji** (`stabilizacja()` w dither-core.js) to jedyny stan,
który przechodzi między renderami: pamięć wyniku poprzedniej klatki w module
(w workerze). Działa tylko z opcjami `{pamietaj, zPamieci}` od wołającego —
zapis filmu daje `zPamieci: k > 0`, odtwarzanie `true`, zatrzymany kadr nic —
i tylko dla klatki o 1–5 dalej niż zapamiętana. Próg względny (ułamek
odległości między dwoma kandydatami), nie w stałych jednostkach — w stałych
dla czerni i bieli prawie nie działał. Przy `stabil = 0` kod jest omijany
w całości (test: co do bajtu jak bez stabilizacji).

**Dźwięk w MP4** (`dzwiekFilmu()` w video.js): decodeAudioData na pliku filmu
(OfflineAudioContext 48 kHz, więc od razu przeliczony), AudioEncoder AAC
z zapasem Opus, druga ścieżka w `mp4.js` (esds albo dOps). Ścieżka wideo
w MP4 bez dźwięku jest bajt w bajt jak przed dodaniem dźwięku.

**Zapisane palety** (`raster.palety` w localStorage) czytane przez
`paletaZDanych()` — tę samą walidację co plik; użycie wkłada kopię do
`S.custom`. **Klatki kluczowe w presecie**: pole `animacja`, zapis
`zrzut()`, nieufne wczytanie `wczytaj()` w animacja.js (tylko parametry z
`KONW`, przycięte do suwaka). Preset bez pola animacji jej nie rusza.

**Geometria rastra** (`siatki.js`, czysty): `geometria(smp, W, H, ink, z)`
zwraca kropki `[x, y, r, kąt]` albo linie (łamane `[x, y, półgrubość]`) —
konsumentami są `drawScreen()` i `svgHalftone()`, nie dopisuj trzeciego
liczenia. Siatka kwadratowa to dokładnie dawny `collectScreen()` (test
porównuje co do bitu), więc stare presety dają ten sam raster. Obrót płyty
i przesunięcie riso liczone w pikselach podglądu, przez `z` mnożona gotowa
geometria — jak wszędzie. Okręgi nachodzą na początek o jeden krok, inaczej
została szczelina. Dawne kształty rysuje stary kod (kąt na punkt), nowe
(`NOWE_KSZTALTY`) idą jako wielokąty z `kontury()`. Linie: każda siatka
buduje bazową linię `[x, y, nx, ny, t, s]` i oddaje ją `przetworz()` —
tam pokrycie, gładkość (średnia odkształcenia w oknie wzdłuż t, na okręgach
dookoła) i grubość min/max; przy domyślnych suwakach wynik co do bitu jak
przed ich dodaniem (sprawdzone na 48 przypadkach). „Wzdłuż kształtu"
(`warstwice()`) to warstwice pola „rampa pod kątem + odkształcenie ×
rozmyte pokrycie" — jedno przejście marching squares dla wszystkich
poziomów naraz; osobne przejście na poziom przy gęstości 3 było za wolne.
Czyste warstwice samego obrazu próbowane i porzucone: płaskie miejsca
zostawały puste, a linie zbijały się w czarne pasy na krawędziach.
Losowe pasowanie riso ze `skrot()` numeru farby i wariantu, nie z Math.random.
**Nierówny raster** (chmury, nierówne punkty, drganie, postrzępione brzegi)
też w geometrii: chmury ze skrótu położenia w pikselach podglądu, reszta ze
skrótu numeru punktu (kolejność liczenia nie zależy od z) — test sprawdza
dokładne ×4 razem z obrysami. Chmury to szum gradientowy (Perlin); szum
wartości dawał widoczną kratkę. Punkt z nierównością ma piąty element (numer),
a `geometria()` zwraca `postrzep` — wtedy rysujemy ścieżką przez `obrys()`.
Przy zerowych suwakach geometria co do bitu jak wcześniej (72 przypadki).

**Risograf** (`inkmode:"riso"`): farby w kluczach `risoK/Z/A/C/S/O/X/Y/R{i}`,
panel czterech warstw generuje `panelRiso()` w app.js z `DEFAULTS` i sam
dopisuje wpisy do `SUWAKI`/`LISTY`/`KOLORY` — musi stać po tych tabelach,
a przed pierwszym `syncUI()`. Źródło „farba" rzutuje ciemność piksela na
ciemność farby. **Faktura farby** (`faktura-farby.js`) działa na kanale alfa
gotowej warstwy farby przed mnożeniem; szum na siatce podglądu, więc skala
zapisu daje ten sam wzór. Szorstkość = rozmycie alfy i próg z szumem —
alfa ≤ 0,002 zostaje zerem, inaczej farba pojawiała się na czystym papierze.
SVG faktury nie dostaje.

**Usuwanie tła** (`wycinanie.js`, czysty): maska z odległości w Oklab,
wypełnianie od brzegów kolejką (bez rekurencji). W warstwach maska liczy
się raz przy zmianie ustawień na kopii roboczej (≤ 1400 px) i trafia do
`w.wyciety`, który `zloz()` rysuje zamiast oryginału — nie licz maski
w `zloz()`, ten woła się przy każdym przesunięciu warstwy.

**Electron** (`electron/main.js`): pliki przez własny protokół `app://`
(standardowy i bezpieczny), nie `file://` — z `file://` moduły ES i worker
jako moduł się nie ładują, a WebCodecs chce bezpiecznego kontekstu. Typy MIME
podaje tabela `TYPY` — nowy rodzaj pliku w apce (np. `.webp` jako zasób)
trzeba tam dopisać. Nowy katalog z plikami apki dopisz też do `build.files`
w package.json, inaczej zabraknie go w .exe. Terminal VS Code ustawia
`ELECTRON_RUN_AS_NODE=1` — stąd `npm start` przez `electron/start.mjs`,
(test z `RASTER_ZRZUT` ma własny profil, więc działa obok otwartej apki),
a ręcznie `env -u ELECTRON_RUN_AS_NODE …`. Test bez klikania:
`RASTER_ZRZUT=plik.png` — wczytuje „Próbkę", zapisuje zrzut okna i błędy
konsoli, zamyka się (działa też na `dist/win-unpacked/Raster.exe`).

**Kopie efektu** (stos.js): instancja „rgb~2" w `S.efekty`, jej parametry
w `S.efektyKopie` (tekst JSON, czytany nieufnie przez `kopie()`). Na czas
uruchomienia kopii `zKopia()` podmienia jej klucze w S i przywraca — funkcje
efektów i worker nic o kopiach nie wiedzą. Karta kopii to klon ciała karty
z id + „__2" (`kartaKopii()` w app.js); jej kontrolki piszą przez
`ustawParametrKopii()`, nie do S. Klatki kluczowe tylko dla pierwszej instancji.

**Pędzel maski** (warstwy.js): `w.auto` (maska z koloru, liczona przy zmianie
jej ustawień) + `w.reka` {dodaj, usun} na kopii roboczej. Pociągnięcie
przelicza tylko prostokąt pod pędzlem (`odswiezObszar`) — pełne `wytnij()`
przy każdym ruchu myszy cięło malowanie.

**Animacja warstw**: klucze „w:<id>:<pole>" w tych samych `SCIEZKI`, ale
`zastosuj()` oddaje je celowi zarejestrowanemu przez warstwy.js (`cel("w", …)`),
nie S — po wszystkich wartościach cel raz woła `zloz()`. Klucze
z dwukropkiem nie idą do presetu i `wczytaj()` ich nie kasuje; `KONW` dla nich
ustawia app.js przy pierwszej klatce (`kluczWarstwyTeraz`). Id warstwy, nie
indeks — kolejność warstw się zmienia.

**Warstwa efektu** (`dodajEfekt` w warstwy.js): `zloz()` przy niej bierze
dotąd złożone płótno, puszcza przez `uruchomEfekt()` ze stos.js (parametry
podmieniane w S jak przy kopiach) i nakłada z kryciem i trybem warstwy. Nie ma
obrazu — każda funkcja warstw dotykająca `w.obraz`/`w.tlo` musi ją pominąć
(`czyEfekt`); kompUI kończy się przed polami tła.

**Dot diffusion** (`dotDiffusion()` w dither-core.js): wg programu Knutha
DOT-DIFF — tabela klas liczona jego `store_eight`, nie przepisana. Bez modelu
„zeta" (toner), więc decyzja = najbliższy kolor przez `przygotuj()`. Test
w algorytmy.mjs porównuje z jego programem przepisanym 1:1 (0 różnic) i ma
luźniejszą tolerancję jasności — baronowie gubią błąd, tak jak u autora.

**Automatyczne usuwanie tła** (`wycinanie-ai.js` + `wycinanie-ai-worker.js`):
IS-Net w onnxruntime-web, w osobnym wątku. Przygotowanie wejścia jak w rembg
(dzielenie przez max, −0,5, 1024², min–max na wyjściu) — zmieniając je,
porównaj maskę z rembg. Pliki ONNX (`vendor/onnx/`) i model (`modele/`) są
w .gitignore, przygotowuje je `npm run modele`; onnxruntime 1.30 ładuje
wariant „asyncify" — przy aktualizacji pakietu sprawdź, którego pliku chce
(błąd „Failed to fetch dynamically imported module"). Wiele wątków wymaga
izolacji: serwer.py i electron/main.js wysyłają COOP/COEP — nie dokładaj
zasobów z innych domen bez CORP, bo przestaną się ładować. Maska AI to
`w.maskaAI` (raz na warstwę), `w.tlo.sposob` przełącza między nią a kolorem.

**Kolory punktów** (inkmode „obraz"/„gradient"): farba z `barwa(r,g,b)`
w inkList; geometria dokłada kolor szóstym elementem punktu
(`[x,y,r,kąt,id|-1,[r,g,b]]`) i czwartym elementem punktu linii. Rysowanie
grupami po kolorze, linie przez `odcinkiBarwne()` (32 poziomy na kanał,
zakładka o krok — przy samym styku antyaliasing zostawiał kreski). Taka farba
kładzie się `source-over` (`ink.mieszanie`), nie mnożeniem.

**Ton → pokrycie** (`przemianaTonu()` w siatki.js): fala tonu i krzywa
wielkości opakowują `ink.cov` na wejściu `geometria()` — działa we
wszystkich siatkach i w liniach bez dotykania ich kodu. Odkształcenie
(`przesuniecie()`) przed próbką, w pikselach podglądu; rozciągnięcie
i pochylenie — osobna gałąź pętli, żeby przy wartościach neutralnych zwykła
gałąź liczyła co do bitu jak dawniej (porównanie 72 przypadków ze starą
wersją). Rysowanie kształtów: `rysujGrupe()` w halftone.js i `svgGrupa()`
w vector.js — te same rozgałęzienia (znak / ścieżka / wprost); `sciezkowy()`
decyduje, kiedy dawne kształty idą konturami (obrys).

**Stippling, zlewanie, scalanie** (siatki.js): stippling (`stipple()`) to
Lloyd na siatce próbek, z pamięcią ostatnich 4 układów (klucz: odcisk
pokrycia + parametry) — bez niej każdy render liczył relaksację od nowa.
Zlewanie (`metaballe()`) zamienia punkty na `wyn.plamy` (kontury); warstwica
liczona na −f^(−1/w), nie na f (na f plamy wychodziły o 70% za duże), a
promień poprawiony o stratę pola wielokąta wpisanego (test: pojedynczy punkt
≈ pole koła). Scalanie (`scal()`) tylko na zwykłej siatce kwadratowej;
`dodaj()` zwraca indeks punktu, −1 (brak farby) albo −2 (poza kadrem —
nie blokuje bloku). Własny kształt: `S.ksztaltWlasny` (JSON konturów
znormalizowanych do pola π), czytany nieufnie przez `ksztaltWlasny()`;
geometrię pliku SVG liczy przeglądarka (`getPointAtLength`, `getCTM`)
w niewidocznym kontenerze (app.js, `wczytajKsztaltSVG`).

**Kod QR** (`qr.js`, czysty): koder według standardu, tabele bloków
korekcji z biblioteki Nayuki (MIT). Przy pisaniu sprawdzony dekoderem jsQR
(48 kodów; raster QR na różnych obrazach — 24/24 po powiększeniu środka
modułu do 0,45); `testy/qr.mjs` pilnuje tego odciskami i własnościami
standardu, bez zależności. Ruszając koder albo `siatkaQR()`, sprawdź znowu
dekoderem (jsQR w katalogu tymczasowym, nie w projekcie) i telefonem.
Kwadraty kodu idą jako `wyn.dodatki` (kontury) obok punktów.

**Zaokrąglanie rogów** (`zaokraglij()`): w `obrys()`, więc działa wszędzie,
gdzie kształt idzie ścieżką; `sciezkowy()` przełącza dawne kształty na
kontury, gdy zaokrąglenie > 0. Pole przywracane skalą.

**Przezroczystość w rastrze**: `pokrycie()` mnoży przez alfę próbki
(`S.pustePrzezr`, domyślnie tak). Obrazy nieprzezroczyste — co do bitu jak
dawniej; obrazy z alfą zmieniły się celowo (wcześniej przezroczyste = czerń).

**Kadrowanie** (app.js, `KADR` — zdefiniowane wysoko, bo `kompUI()` woła
`kadrUI()` przy starcie): ramka w pikselach S.img nad podglądem;
zatwierdzenie to `pokazObraz(wycinek)`, oryginał w `KADR.oryginal` do
przywrócenia; `setImage()` go zapomina.

**Cofnij / ponów** (app.js, `HIST`): migawki LOOK bez kluczy animowanych,
wołane z `schedule()` z opóźnieniem 0,4 s. Nowa kontrolka wyglądu trafia do
historii sama, jeśli jej zmiana woła `schedule()`.

**Krzywa klatki** (animacja.js): `{t, v, k}` — `k` to przejście OD tej klatki
do następnej, bez `k` krzywa ścieżki. W presecie trzeci element klatki.

**Faktura papieru** (`papier.js`): włókna i drobinki jako kształty
w pikselach podglądu (`ctx.scale(z)`), chmurki jako mały obraz powiększany
płynnie. Rysowana po kolorze papieru, przed farbami.

**Testy przeglądarkowe a czas renderu**: `render()` podbija `out.dataset.nr`
po każdym gotowym renderze — czekaj na niego, nie na `setTimeout`. Do
porównań rastra z fakturą papieru używaj udziału różnych pikseli, nie
odcisku całego obrazu (rasteryzacja tysięcy włókien nie jest bajt w bajt
powtarzalna). Położenie `#out` czytaj przy każdym zdarzeniu — panel nad nim
zmienia wysokość (przy wąskim oknie podgląd jest pod panelem).

**Rozmycie** jest w `rozmycie.js` (czyste), bo potrzebuje go i halftone.js,
i effects.js w workerze — a halftone.js importuje dom.js, którego worker nie
może załadować.

**Wideo** (`video.js`) też nie ma własnej ścieżki renderu: bieżąca klatka
ląduje w zwykłym płótnie, które staje się `S.img`, i liczy się jak zdjęcie.
Stan filmu (źródło, zakres, bieżąca klatka) mieszka w `W`, nie w `S` — to
materiał jak obraz, a `<video>` i `ImageDecoder` nie przeszłyby przez
`postMessage` do workera. Klatkę wybiera przewinięcie do **środka** klatki
(`(i+0.5)/fps`), bo przeglądarka nie podaje tempa ani numerów klatek; tempo
wykrywamy z `requestVideoFrameCallback` przy otwarciu (najbliższe z typowych,
nie pierwsze pasujące — 29,97 i 30 dzieli 0,1%). Przewijanie to „wygrywa
ostatnie żądanie" (`idzDo()`), bo suwak osi jest szybszy niż dekoder.
W czasie zapisu filmu `render()` w app.js nic nie rysuje (`wTrakcie`) —
płótno należy do eksportu, inaczej podgląd w skali 1× wpadałby między render
klatki a jej pobranie. Klatkę z `out` bierzemy synchronicznie zaraz po
renderze (`getImageData`, `new VideoFrame`, `toBlob` robi migawkę od razu).

**`gif.js` i `mp4.js` są czyste**, testowane w Node niezależnym dekoderem
i parserem pudełek. Ale „plik jest poprawny wg mojego parsera" to za mało —
`testy/przegladarka.mjs` sprawdza w Chrome, że przeglądarka je odtwarza,
że GIF jest co do piksela renderem klatki i że numery klatek (zapisane
kwadratami w filmie testowym) wychodzą po kolei. Ruszając wideo, puść go.
GIF: rozmiar kodu LZW rośnie, gdy `nast === 1<<rozmiar` **przed** dodaniem
wpisu — tak, jak spodziewa się dekoder; przesunięcie o jeden rozjeżdża koder
z dekoderem.

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

Nie ma zestawu testów w sensie frameworka. Są skrypty weryfikacyjne w `testy/`
(czysty Node, bez zależności, `node testy/<plik>.mjs` z katalogu projektu) —
puść odpowiedni po zmianie w module, który sprawdza: `palety-pliki` →
palette-files.js, `zip` → zip.js, `efekty` → effects.js, `kontury` →
contours.js, `szukanie-koloru` → palettes.js, `gif` → gif.js, `mp4` → mp4.js,
`kolory` → biblioteka palet, tryb jasności i kwantyzacja.js, `siatki` →
siatki.js i faktura-farby.js, `wycinanie` → wycinanie.js, `algorytmy` →
wszystkie algorytmy dodane po wzorze Dither Boya, `animacja` → animacja.js,
`korekta` → image.js, głębia i Oklab, `stos` → stos.js i fx.js, `ascii` →
ascii-znaki.js, `stabilizacja` → stabilizacja dyfuzji w dither-core.js,
`qr` → qr.js i siatka QR.
Każdy kończy się kodem 0, gdy wszystko gra.

`testy/przegladarka.mjs` to test całej ścieżki wideo w Chrome bez okna
(protokół DevTools przez wbudowany WebSocket Node'a). Wymaga działającego
`serwer.py`. Zmienne: `POMIAR=1` dokłada pomiar czasu na Full HD,
`ZRZUT=plik.png` zapisuje zrzut ekranu apki z wczytanym filmem — tak da się
obejrzeć układ bez ręcznego klikania. Do tego ręcznie:
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
