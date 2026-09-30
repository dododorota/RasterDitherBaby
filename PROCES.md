# Proces — stan prac i przekazanie

Zapis sesji z 22–30 września 2026, zrobiony przed przeniesieniem pracy na
Windowsa. Szczegóły techniczne (dlaczego kod wygląda tak, a nie inaczej) są
w `CLAUDE.md`; tu jest przebieg, stan i to, co zostało otwarte.

## Stan na 30 września 2026

- Cała praca siedzi na gałęzi **`rozbudowa`** — 9 commitów nad `master`.
  **Nic nie jest scalone.** `master` to dalej „Raster 0.1".
- Drzewo robocze czyste, wszystko zacommitowane.
- Brak zdalnego repozytorium (GitHub itp.) — kopia istnieje tylko na dysku
  i w paczce ZIP zrobionej do przeniesienia.
- Commity mają zastępczego autora `raster <raster@local>` (tak jak pierwszy
  commit w repo). Na Windowsie ustaw własnego — patrz niżej.

## Uruchomienie na Windowsie

1. Rozpakuj paczkę (zawiera też historię gita, folder `.git`).
2. Zainstaluj Pythona z python.org, jeśli go nie ma — instalator dodaje
   polecenie `py`.
3. W folderze projektu:

   ```
   py serwer.py
   ```

   i otwórz `http://localhost:8000`.

**Używaj `serwer.py`, a nie `py -m http.server`.** Zwykły serwer na Windowsie
potrafi odczytać typ plików `.js` z rejestru jako `text/plain` — przeglądarka
odmawia wtedy wczytania modułów i apka w ogóle nie startuje (w konsoli: „Failed
to load module script… MIME type"). `serwer.py` ustawia typ jawnie i do tego
wyłącza cache, więc zwykłe odświeżenie zawsze bierze świeże pliki.

Do skryptów testowych potrzebny jest Node.js (wersja LTS z nodejs.org).
Do commitów — Git for Windows. Po instalacji jednorazowo:

```
git config --global user.name "Imię Nazwisko"
git config --global user.email "adres@example.com"
```

Claude Code: otwórz **folder `raster-app`** jako projekt, wtedy `CLAUDE.md`
i ten plik wczytają się same. (W tej sesji projektem był folder `figma2ae`,
więc `CLAUDE.md` raster-app trzeba było czytać ręcznie.)

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
- **prawdziwe zdjęcia i prawdziwe palety z Lospec** — ocena na oko, czy to
  wszystko dobrze wygląda w pracy.

## Otwarte decyzje

- **Scalenie `rozbudowa` z `master`** — po sprawdzeniu powyższego.
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
```

Każdy kończy się liczbą błędów i kodem wyjścia 0, gdy wszystko gra. Ostatni
porównuje ~1,3 mln wyszukań i trwa kilkadziesiąt sekund.
`node testy/wydajnosc-siatki.mjs` to pomiar, nie test — trwa kilka minut.

Ostatnie uruchomienie (30.09): wszystkie pięć bez błędów.
