# Plan (szkic): pasma kształtów i nowe efekty — jak Dither Boy

Szkic z 2026-10-25, **czeka na decyzje użytkowniczki** (sekcja „Do decyzji”).
Źródło: zrzuty z Dither Boya (Studio AAA) wysłane 25.10 — panel „Shape Set /
Bands”, biblioteka kształtów, lista „Add Layer / FX”, karty Stress Relief,
Orbs, Neo Glow.

## Co apka już ma (żeby nie dublować)

- **Znaki według tonu** (`shape:"tony"`): 2–16 poziomów, każdy z kształtem
  albo obrazkiem i kolorem, kolor: farba / ton / oryginał, podmiana tonów,
  zlewanie, scalanie. To jest odpowiednik „Bands”, tylko z równymi pasmami.
- Kształty: koło, kwadrat, romb, linia, krzyż, gwiazdka, krzyżyk ukośny,
  pierścień, sześciokąt, elipsa, trójkąt, wielokąt, superelipsa, gwiazda 5,
  kwiat, serce, cyfra, znak (litera / emoji), własny SVG.
- Siatka: obrót, obrót z siatką, układ (kwadrat / hex / trójkąt…), drganie.
- Efekty Dither Boya z listy FX, które już są: Post Processing (obróbka
  końcowa), Tint (zabarwienie), Glow (poświata), JPEG Glitch, Chromatic
  (aberracja), Subtexture (faktura), Diffraction Stars (gwiazdki), Temporal
  Variation (zmienność w czasie).

## Czego brakuje — pasma (Bands)

1. Pasma o **nierównej szerokości**: pasek gradientu z przeciąganymi
   granicami (0–255), zakres pod każdym pasmem („43–84”).
2. **Wielkość kształtu na pasmo** (Band Size 0–200%) i szerokość pasma
   (Band Width) suwakiem.
3. Przyciski **Podziel** (Split), **Rozłóż równo** (Distribute),
   **Odwróć** (Reverse); pasmo „Puste”; usuwanie pasma (×).
4. **Wtapianie** (Feather 0–100) między sąsiednimi pasmami, wzór
   uporządkowany / rozproszony (Ordered / Scatter).
5. **Zestawy kształtów** (Shape Set): gotowe (Halftone Dots, Geometric…),
   zapis własnych, szukanie, gwiazdka ulubionych, import / eksport.
6. **Biblioteka kształtów** w siatce kafelków, w grupach: Basic (w tym
   wielokropki 2–9, kratki halftone 3×3…8×8, gradienty kropek), Triangles,
   Symbols (gwiazdy, błyskawica, oko, kropla…), Lines (kreski, fale,
   schodki, kody kreskowe), Spooky (nietoperz, czaszka, nagrobek…), Pixel
   (serce, czaszka, szachownice — piksel-art), Your Shapes (import
   PNG/SVG). Około 150 kształtów.
7. Siatka: Tone Scaling, Rotation Jitter, Crisp Edges (bez antyaliasingu).

## Czego brakuje — efekty

- **Stress Relief** — zużycie całego obrazu: Edge Wear, Roughness, Grain,
  Speckles, Speckle Size, Seed, Mix. (Apka ma podobne tylko dla farby
  w rastrze — faktura farby; tu działa na gotowym obrazie każdego trybu.)
- **Orbs** — rozsiane świecące kulki / bloki: kolor, tryb mieszania, ilość,
  wielkość, intensywność, losowość, przesunięcie, kierunek.
- **Neo Glow** — „deszcz Matrixa”: smugi ciągnące się od jasnych pikseli /
  znaków wzdłuż osi: oś, lustro, maks. długość, przesunięcie, rozrzut
  (stagger), intensywność, zanik, mrok (gloom), własny kolor poświaty.
- **Lick, Lens Curve, Epsilon Glow** — na zrzutach tylko nazwy na liście,
  bez kart. Lens Curve to pewnie zniekształcenie beczkowate soczewki;
  Lick i Epsilon Glow — nie wiadomo.

## Decyzje (25.10)

- [x] Kolejność: najpierw wydajność (PLAN-WYDAJNOSC.md) — zrobione.
- [x] Pasma: **rozbudować istniejące „Znaki według tonu”** — stare presety
      (równe pasma, bez wielkości na pasmo) mają dać obraz co do bitu.
- [x] Efekty: **wszystkie** (Stress Relief, Orbs, Neo Glow, Lick, Lens
      Curve, Epsilon Glow). Użytkowniczka szuka zrzutów kart Lick, Lens
      Curve, Epsilon Glow — do tego czasu robimy te, które widać.
- [ ] Biblioteka kształtów: rysunki własne „w duchu” Dither Boya (nie
      kopie ich plików) — założenie, potwierdzić przy pierwszym podglądzie.
- [ ] Panel: zostaje wygląd z Figmy (PLAN-UI.md); pasek gradientu
      z przeciąganymi granicami to nowa kontrolka w tym stylu.

## Etapy (szkic checklisty — doprecyzować przed każdym)

1. [x] Pasma o nierównej szerokości (25.10): `S.znakiGranice` — tekst
       „43,85,…” (N−1 rosnących liczb 1–255 na skali v = (1 − pokrycie)·255),
       czytany nieufnie przez `granicePasm()` w siatki.js; zły albo pusty →
       równe pasma dawnym wzorem. Pasek z gradientem tonu, uchwyty
       (mysz, strzałki ±1 / Shift ±10), pasma klikalne; Podziel / Rozłóż /
       Odwróć / Usuń przestawiają razem kształty, kolory i obrazki tonów;
       każda operacja osobnym krokiem historii; ręczna zmiana „Liczby tonów”
       wraca do równych. Pasmo „Puste” (kształt `pusty`) pomijane
       w `znakiWGrupach()` — płótno i SVG. Zakres pasma w wierszu tonu.
       Sprawdzone: 6 nowych testów w siatki.mjs (odczyt 14 złych tekstów,
       poziom z granic, z=3, Puste); podgląd co do bajtu jak przed zmianą
       (21 ustawień, w tym 6 z tonami); panel w Chrome (przeciąganie,
       przyciski, cofanie), SVG z pustymi pasmami; wszystkie testy 0 błędów.
       Znane: cofnięcie nie przestawia obrazków tonów (materiał poza
       historią, jak wszędzie).
2. [x] Wielkość kształtu na pasmo (25.10): `znakiR1…16` (0–200%, w DEFAULTS,
       animowalne jak każdy suwak), mnożnik r w `geometria()` po podmianie
       tonów (`wielkosciPasm()`; wszystkie 100% → pominięte), 0% = brak
       punktów. Suwak pod wybranym pasmem; Podziel / Odwróć / Usuń
       przenoszą wielkość. Testy w siatki.mjs (×, 0%, z=3, zepsuty preset).
3. [x] Wtapianie między pasmami (25.10): `znakiWtapianie` 0–100,
       `znakiWtapWzor` uporządkowany (Bayer 8×8 po węzłach siatki w jej
       obróconym układzie — w osiach ekranu wychodziły grudy) / rozproszony
       (skrót położenia). `poziomPunktu()` w siatki.js; 0 → dawny poziom.
       Testy: tylko ±1 pasmo, tylko w strefie granicy, z=3, wzory różne.
       Obejrzane na pasku gradientu (zrzut w katalogu sesji).
       Po etapach 1–3: podgląd co do bajtu jak przed zmianą (21 ustawień),
       wszystkie testy 0 błędów.
4. [x] Biblioteka kształtów (25.10): `src/biblioteka-ksztaltow.js` (czysty)
       — 106 kształtów w 6 grupach (Podstawowe z kostkami i siatkami kropek,
       Trójkąty, Symbole, Linie z kodami kreskowymi, Spooky, Piksel — 17
       bitmap tekstem → prostokąty). Kafelek [−1, 1] × r, pole NIE
       wyrównane do koła; id „b-…”. Wchodzi przez `kontury()` /
       `sciezkowy()`, więc działa w rastrze, SVG, workerze, riso, pasmach.
       Panel: optgroupy w liście „Kształt” (kopiują je riso i tony),
       przycisk „Biblioteka kształtów…”, miniatura kształtu w każdym wierszu
       tonu; okienko z kafelkami obok panelu (Esc / klik obok zamyka).
       Sprawdzone: arkusz wszystkich 106 w rastrze (zrzut), testy w
       siatki.mjs (kontury × r z obrotem, otwory — złapał nos czaszki bez
       otworu), SVG z biblioteką rasteryzuje się, podgląd starych ustawień
       co do bajtu, wszystkie testy 0 błędów.
       „Twoje kształty” — dziś obrazek na ton (↥); do biblioteki trafią
       w etapie 5 razem z zestawami.
5. [ ] Zestawy kształtów: wbudowane + własne (localStorage, try/catch),
       import / eksport w formacie presetu.
6. [ ] Siatka: Rotation Jitter, Crisp Edges, Tone Scaling — sprawdzić,
       co z tego już jest pod inną nazwą (drganie, obrót, krzywa wielkości).
7. [ ] Efekty w stosie (`stos.js`/`fx.js`, czyste i deterministyczne):
       Stress Relief, Orbs, Neo Glow; potem Lick, Lens Curve, Epsilon
       Glow po zrzutach.
