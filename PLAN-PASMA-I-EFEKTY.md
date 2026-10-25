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

1. [ ] Pasma o nierównej szerokości: granice w S (tekst, jak `papierGrad`,
       czytany nieufnie), pasek gradientu z uchwytami, Podziel / Rozłóż /
       Odwróć / usuń, pasmo „Puste”. Puste granice = równe pasma (dawny
       wynik co do bitu — test w siatki.mjs).
2. [ ] Wielkość kształtu na pasmo (Band Size) w geometrii (`podmienTony` /
       poziom → mnożnik r), SVG z tej samej geometrii.
3. [ ] Wtapianie między pasmami (uporządkowane z macierzy Bayera /
       rozproszone ze skrótu położenia — bez Math.random).
4. [ ] Biblioteka kształtów w kafelkach z grupami; nowe kształty jako
       kontury (`kontury()` w siatki.js) albo małe bitmapy piksel-art
       (materiał → worker rastra, jak obrazki tonów).
5. [ ] Zestawy kształtów: wbudowane + własne (localStorage, try/catch),
       import / eksport w formacie presetu.
6. [ ] Siatka: Rotation Jitter, Crisp Edges, Tone Scaling — sprawdzić,
       co z tego już jest pod inną nazwą (drganie, obrót, krzywa wielkości).
7. [ ] Efekty w stosie (`stos.js`/`fx.js`, czyste i deterministyczne):
       Stress Relief, Orbs, Neo Glow; potem Lick, Lens Curve, Epsilon
       Glow po zrzutach.
