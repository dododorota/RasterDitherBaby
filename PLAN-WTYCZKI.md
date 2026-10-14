# Plan: funkcje z wtyczek VFX (Dither 1.6, Raster 1.9, Riso 1.6) do apki

Rozpoczęty 2026-10-14. Odhaczamy `[x]` po zrobieniu **i sprawdzeniu**.
Po przerwie: przeczytaj ten plik, `PROCES.md` (sekcja „Wznowienie”) i ruszaj
od pierwszego nieodhaczonego punktu.

Źródło: `C:\Users\Dodo\Claude\Projects\AE Plugin Land\raster-dither\`
(osobne repo — tylko czytać). Wzory: `raster-dither/CLAUDE.md`, wpisy
„VFX Dither 1.5”, „VFX Dither 1.6”, „VFX Raster 1.7 / Riso 1.4”; kod
`core/dither.cpp`, `core/raster.cpp`, presety `kPresets` w `ae/VFXDither.cpp`.
Punkt odniesienia poprzedniego przeniesienia: commit wtyczki `05891a0`.
Od niego: `git diff 05891a0 -- raster-dither` (w folderze `AE Plugin Land`).

## 0. Analiza — co jest, czego brak

- [x] Przeczytane: DLA-APKI.md, HANDOVER.md i dziennik wtyczki, PROCES.md apki.
- [x] Już w apce (11.10, commity `b4affea`, `2624324`): plamy riso bez
      fraktali, ekspozycja i punkty czerni / bieli, skala faktury, faktura
      farby w czasie, kształty gwiazda / kwiat / serce / cyfra, style linii
      z etapu 1 (Waveform, Topografia, Fala w dyfuzji, Pęknięcia, Smugi).
- [x] Wtyczka od `05891a0` nie zmieniła wzorów już przeniesionych (w
      `dither.cpp` same dopiski + zmiana poświaty pod Glow Stretch).

**Nie przenosimy (apka już ma albo nie dotyczy):**
- Resolution (Raster 1.8–1.9, Dither 1.3) — apka zawsze liczy obraz
  zmniejszony do `MAX` = 1400 px, więc wielkości w px już są względem 1400.
- RGB Split (Dither 1.6) — apka ma „przesunięcie RGB” z kątem (`rgb`,
  `rgbKat`). Różnica tylko w przesunięciu o ułamek piksela.
- Palety CGA, Pico-8, Sepia, Amber, Green — są w bibliotece palet apki
  (`cga`, `pico8`, `g-sepia`, `m-bursztyn`, `m-zielony`).
- Reszta z Raster 1.5 (mieszanie kształtów, gradient koloru, tryby
  mieszania, próg, Black Wear) — decyzja z 11.10: apka ma odpowiedniki.

## 1. Wzory ditheringu (VFX Dither 1.5, etap 2 stylów Dither Boy)

Wszystko w `dither-core.js` obok `wzorFali()`, kwantyzacja przez `progowy()`.
- [x] Szachownica mała / średnia / duża — Bayer 4×4 na kratkach 2 / 4 / 8 px
      (`BAYER4` z kernels.js).
- [x] Kwadraty tonu (Block Tone) — kwadratowy punkt w komórce; odstęp i kąt
      z suwaków linii; t = 1 − (2·max(|u|,|v|))².
- [x] Promienie (Radial Burst) — promienie od środka; liczba
      round(2π·64 / odstęp), wygięcie skręca jasnością (×3), prędkość obraca.
      Suwaki środka X / Y w grupie linii (domyślnie środek obrazu).
- [x] Lista algorytmów w `index.html`, wyszarzanie / pokazywanie suwaków
      linii dla nowych wzorów w `app.js`.
- [x] Presety „Szachownica” i „Promienie” (z `kPresets`: Checkers, Radial Burst).
- [x] Testy w `testy/algorytmy.mjs`: ton nowych wzorów, worker = główny wątek,
      dawne algorytmy co do bajtu jak przed zmianą.
      (Node: zrobione, 306/306 starych wyników bez zmian; worker — dopisany
      do `przegladarka.mjs`, uruchomić w punkcie 4.)

## 2. Ekran CRT i poświata kierunkowa (VFX Dither 1.6, etap 3)

Po ditheringu, kolejność jak we wtyczce: przesunięcie RGB → CRT → poświata.
- [x] Linie CRT: siła (%) i odstęp (px ditheringu); ciemność
      0,5 − 0,5·cos(2π(u − ¾)) uśredniona po pikselu, w jasnych miejscach
      cieńsza (× (1 − 0,6·jasność)).
- [x] Maska RGB (%): pionowe trójki R/G/B szerokości max(3, okres), zwrot
      jasności × (1 + 0,6·maska).
- [x] Rozciągnięcie poświaty + kąt: daleka warstwa σ·(1 − 0,75·s) +
      rozmycie kierunkowe (przebiegi ¼·½·¼ z krokiem 1, 2, 4… ≤ 20·σ·s),
      siła × (1 + 0,5·s). Przy 0 — poświata co do bajtu jak teraz.
- [x] Suwaki w panelu + `DEFAULTS` (wszystko 0 = obraz bez zmian).
- [x] Presety: Monitor CRT, Zielony terminal, RGB glitch, Smuga światła,
      CRT jasne (z `kPresets`: CRT Monitor, Green Terminal, RGB Glitch,
      Light Smear, CRT Bend Light) — palety z biblioteki apki.
- [x] Testy: ustawienia 0 = obraz jak przed zmianą, CRT i poświata
      w workerze = główny wątek.
      (Node: `testy/efekty.mjs`, 306/306 starych wyników bez zmian; worker —
      w `przegladarka.mjs`, uruchomić w punkcie 4.)

Jak zrobione: CRT to nowy efekt **„Ekran CRT”** w stosie efektów
(`ekranCRT()` w effects.js; klucze `crtLinie`, `crtOdstep`, `crtMaska`).
W kolejności „po staremu” (pusty `S.efekty`) stoi między przesunięciem RGB
a poświatą, jak we wtyczce. Działa też w rastrze. Poświata: `glowRozciag`,
`glowKatSmugi`. Presety: „CRT na jasne” zamiast „CRT jasne”.

## 3. Raster i risograf: nowy stippling i siatka „słonecznik” (Raster 1.7 / Riso 1.4)

W `siatki.js`.
- [x] Stippling od nowa: kropki jednej wielkości (promień 0,3·komórka),
      gęstość ((k − 0,06)/0,94)^1,5 · 1,2 na pole kropki (jasne puste),
      start z progu niebieskiego szumu, 5 kroków ważonego Lloyda na siatce
      co pół odstępu kropek. Suwak `stipIter` zostaje (liczba kroków),
      domyślnie 5 zamiast 8.
- [x] Siatka „Słonecznik” (spirala Vogela): r = komórka/√π·√(i+½),
      kąt = i·137,508° + kąt farby, punkt obrócony stycznie; linie — proste
      jak na kwadracie. Suwaki środka jak przy okręgach / spirali.
- [x] Działa też w risografie i w eksporcie SVG (dane z geometrii, nie
      z płótna) — siatka jest wspólna (`S.siatka`), nic osobnego nie trzeba.
- [x] Testy w `testy/siatki.mjs` (`wydajnosc-siatki.mjs` dotyczy palet,
      nie siatek rastra). Czas 1400×1000: stippling komórka 6 — 0,34 s,
      komórka 4 — 0,65 s (wynik w pamięci podręcznej), słonecznik 6 ms.

## 4. Na koniec

- [x] Wszystkie testy w Node + `testy/przegladarka.mjs` (0 błędów).
- [x] Apka uruchomiona (przeglądarka i Electron), nowe rzeczy obejrzane
      na zdjęciu (portret z testów wtyczki; 12 zrzutów, bez błędów strony).
- [x] Wpisy w `PROCES.md` (historia + „Do przetestowania na koniec”),
      `CLAUDE.md`, `README.md`.
- [x] Polecenie commita dla użytkowniczki (w odpowiedzi czatu; commit
      robi użytkowniczka).

## Do oceny przez użytkowniczkę

- Wzory, presety CRT, smuga poświaty i nowy stippling na własnym
  materiale (lista „Z 14.10” w `PROCES.md`).
