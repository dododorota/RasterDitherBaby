# Plan: wydajność podglądu przy dużych zdjęciach

Rozpoczęty 2026-10-25. Odhaczamy `[x]` po zrobieniu **i sprawdzeniu**.
Po przerwie: przeczytaj ten plik i ruszaj od pierwszego nieodhaczonego punktu.

Zgłoszenie: zdjęcie 2000×1333 „koszmarnie się tnie”, nie da się przesuwać
suwaków. Pomiar (25.10, ten sam komputer — Core Ultra 7 265KF; Chrome bez
okna i w oknie, zdjęcie 2000×1333 → obraz roboczy 1400×933):

| Ustawienie | Render | Blokada suwaków |
|---|---|---|
| Raster domyślny (oczko 8) | 22 ms | — |
| Raster oczko 4 / 2,5 | 68 / 181 ms | 77 / 258 ms |
| Raster gwiazda, oczko 4 | 237 ms | 241 ms |
| Raster stippling, oczko 4 | 419 ms | 1233 ms |
| Raster riso + faktura (Riso duo, Skan) | 400–600 ms | tyle samo |
| Raster z poświatą | 243 ms | 273 ms |
| Dithering (Miękko, Smuga światła) | 140–155 ms | — (worker) |
| Glitch (Ciecz, Topnienie, Mapa glitchy) | 400–450 ms | — (worker) |

Wniosek: **raster liczy się na głównym wątku** — każdy render blokuje
całą apkę, więc przy ciężkich ustawieniach suwak stoi. Dithering, Glitch
i ASCII liczą się w workerze: suwak chodzi, podgląd najwyżej się spóźnia.
Domyślne ustawienia są płynne, tnie się dopiero przy gęstym oczku,
stipplingu, fakturze farby, poświacie i kształtach ścieżką.

Skrypty pomiarowe (tymczasowe, w katalogu sesji): `pomiar.mjs` (tryby
i presety), `konfig.mjs` (zestaw ciężkich ustawień), `profil.mjs` (profil
CPU). Jeśli mają zostać — przenieść do `testy/` (decyzja użytkowniczki).

## Etap 1. Szybciej, co do bajtu ten sam obraz

- [x] Faktura farby: pola szumu (`poleSzumu`) w pamięci — nie zależą od
      obrazu, tylko od rozmiaru, skali i ziarna. Rozmycie krycia na jednej
      płaszczyźnie (`rozmyjPlaszczyzne()`) zamiast trzech kanałów (dwa były
      zawsze zerami). Sprawdzone: `krycie()` i `rozmyj()` stare (HEAD) =
      nowe co do bajtu, 120 przypadków (też drugie wywołanie z pamięci);
      testy siatki, efekty, korekta, stos — 0 błędów.
- [x] Dawne kształty: bez `save()/restore()` przy każdej kropce — reset
      do jednostkowej + te same `translate/rotate`. Gotowa macierz
      z `cos/sin` NIE: Chrome liczy `rotate()` o ostatnią cyfrę inaczej
      i CMYK różnił się o 3 bajty. Sprawdzone: podgląd rastra stara apka
      (HEAD na porcie 8001) = nowa co do bajtu, 16 ustawień (kształty,
      kąty, CMYK, riso z fakturą, hex, tony, gwiazda, stippling).
- [x] Pomiar po etapie 1: riso + szorstkość 389 → 145 ms, riso 4 farby
      z plamami 409 → 309, Riso duo 626 → 316, Skan 542 → 370, Niebieski
      skan 328 → 288. Gęste oczko prawie bez zmian (181 → 167 ms) — tam
      czas to samo rysowanie (fill na kropkę), nie stos. Stippling, gwiazda,
      poświata bez zmian. **Wniosek: bez etapu 2 suwaki dalej będą stawać.**

## Etap 2. Raster w workerze — suwaki nigdy nie stoją

Jak dithering: render rastra w osobnym wątku na `OffscreenCanvas`,
wyparte zadania wypadają z kolejki, główny wątek tylko wkleja gotowy obraz.
Do rozpoznania przed startem (każde może zmienić zakres):
- [ ] `halftone.js`, `papier.js`, `faktura-farby.js`, efekty po rastrze —
      bez DOM-u (dziś `document.createElement("canvas")`, `dom.js`).
- [ ] Obraz źródłowy → `ImageBitmap` przy każdej zmianie `S.img` (film:
      co klatkę), obrazki znaków tonu (`ZNAKI`) → bitmapy do workera.
- [ ] Krój Archivo w workerze (`self.fonts` + `FontFace`) — kształt „znak”.
- [ ] Zgodność: render w workerze = render na głównym wątku (geometria co
      do bitu; piksele — `OffscreenCanvas` rasteryzuje antyaliasing trochę
      inaczej niż płótno na stronie, porównywać udziałem różnych pikseli).
- [ ] Zapis PNG / folder / film dalej przez `renderuj()` — bez osobnej drogi.

## Etap 3. Do rozważenia po etapie 2

- [ ] Poświata w rastrze na zmniejszonym obrazie (zmienia wygląd — tylko
      po porównaniu zrzutów i zgodzie użytkowniczki).
- [ ] Stippling: relaksacja Lloyda od poprzedniego układu przy małej zmianie
      pokrycia (szybciej, ale układ zależałby od historii suwaka — kłóci się
      z „zero losowości”, raczej nie).
- [ ] Glitch: Ciecz / Topnienie (~0,4 s) — profil w workerze.
