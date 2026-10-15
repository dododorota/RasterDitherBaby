# Plan: nowy wygląd interfejsu jak „dither ui” z Figmy

Rozpoczęty 2026-10-15. Odhaczamy `[x]` po zrobieniu **i sprawdzeniu**.
Po przerwie: przeczytaj ten plik i ruszaj od pierwszego nieodhaczonego punktu.

Wzór: Figma „dither ui (Community)”, plik `zaZ1q7i4lCsgls4fLpoCE4`, strona
`components` (1:189), plansza „light” (7:64). Użytkowniczka chce ten styl
w dwóch wersjach: czarne na białym (jak w Figmie) i białe na czarnym —
apka ma już przełącznik motywu (przycisk w nagłówku, `data-theme`).

## 0. Analiza wzoru

- [x] Kolory: tusz `#121314`, papier `#fefefe`, szary `#898989`, tekst
      pomocniczy `#4f4f4f`. Ciemny motyw — te same, zamienione.
- [x] Font Inter (400 / 600 / 700), 14 px; przyciski wersalikami, półgrube.
- [x] Ramki 1 px w kolorze tuszu; przyciski zaokrąglone 4 px, pola 6 px,
      okna dialogowe — ramka 2 px.
- [x] Cień pod przyciskiem: pasek szachownicy 1 px (2–3 px pod ramką).
      Cień okna i listy: rzadkie kropki (1 px co 4 px, na przemian).
- [x] Zaznaczony element listy i stan wyłączony: rzadkie kropki.
- [x] Fokus: przerywana ramka 2 px. Przełącznik, pole wyboru 20 px
      z ptaszkiem, radio z kropką. Pasek przewijania: ciemna pigułka 8 px.
- [x] Kursor: pikselowa strzałka z cieniem (`pointer`).

**Decyzja:** wzory szachownicy i kropek w Figmie to PNG z białym tłem na
stałe — nie da się ich użyć w ciemnym motywie ani na kolorze. Odtwarzamy je
gradientami CSS w kolorze motywu (ten sam rysunek: 1 px, ten sam rozstaw).
Ikony (ptaszek, strzałka listy, kursor) — pliki z Figmy w `src/ui/`; do
ciemnego motywu kopie z kolorem zamienionym na jasny.

## 1. Zasoby

- [x] Font Inter (OFL) w `fonty/`: `inter-latin.woff2`,
      `inter-latin-ext.woff2`, licencja `OFL-Inter.txt`. Archivo zostaje —
      rysuje teksty na płótnie (ASCII, napisy, znaki).
- [x] Ikony z Figmy w `src/ui/`: `check.svg`, `chevron.svg`, `pointer.svg`
      + jasne kopie `check-jasny.svg`, `chevron-jasny.svg`.

## 2. Tokeny i podstawy (`src/styles.css`)

- [x] Zmienne kolorów dla jasnego i ciemnego motywu (systemowy, wybrany
      ręcznie), wzory jako zmienne (`--szach`, `--kropka`, `--kropka-szara`).
- [x] Font interfejsu Inter, rozmiary, kolory tekstu.
- [x] Fokus — przerywana ramka zamiast magenty; kursor-strzałka na
      klikalnych.

## 3. Komponenty

- [x] Przyciski: zwykły (ramka + cień w szachownicę, wciśnięcie), główny
      ciemny (`.btn.solid`), małe w nagłówku, wyłączone (kropki, szary tekst).
- [x] Zakładki (Tryb, risograf) jak grupa przycisków, wybrana — wypełniona.
- [x] Presety: wybrany — wypełniony jak zakładka (kropki z Figmy wchodziły
      pod litery i źle się czytały; kropki zostały na najechaniu).
- [x] Pola: tekst, liczba, select (własna strzałka z Figmy), textarea.
- [x] Suwaki: tor i uchwyt jak przełącznik z Figmy.
- [x] Pola wyboru (`.check`) — 18 px z ptaszkiem (20 px z Figmy było za
      duże przy tekście 13 px w panelu).
- [x] Grupy panelu i sekcje (`details.pod`) — nagłówki, linie podziału.
- [x] Karty efektów (`.fx`), warstwy, zapisane palety — jak okno dialogowe
      (ramka, cień z kropek).
- [x] Podgląd (`.stage`), pole „upuść plik”, oś czasu, ścieżki klatek.
- [x] Paski przewijania.

## 4. Sprawdzenie

- [x] Zrzuty: jasny i ciemny, pusty start, z obrazem, efekty, raster
      (porównanie z `przed-*` i z planszą Figmy).
- [x] `testy/przegladarka.mjs` — 0 błędów (test klika po panelu).
- [x] Czytelność: kontrast tekstu, wąskie okno (< 820 px), Electron.

## 5. Na koniec

- [x] Notatki w `CLAUDE.md` (zasady wyglądu), `PROCES.md` (historia,
      do obejrzenia), `README.md` (jeśli trzeba).
- [x] Polecenie commita dla użytkowniczki.
