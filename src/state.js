/* Wspólny stan aplikacji. Jeden obiekt, czytany przez wszystkie moduły,
   zapisywany tylko przez app.js (kontrolki i presety). */
export const MAX = 1400;   // maksymalny bok przetwarzanego obrazu w px

/* Wygląd — wszystko, co składa się na obraz i co zapisuje się w presecie.
   Reszta stanu presetu nie dotyczy: img to wczytany obraz, custom to wczytana
   paleta własna ({nazwa, kolory}), mode to zakładka, scl, fmt, wektor, wygl
   i jakosc (MP4) to ustawienia zapisu. Film nie siedzi w S, tylko w W
   (video.js) — do S trafia jego bieżąca klatka jako img.
   Paleta własna jest materiałem jak obraz, a nie częścią wyglądu — gdyby
   siedziała w DEFAULTS, każdy wbudowany preset by ją kasował. Do pliku presetu
   trafia osobno, i tylko wtedy, gdy jest wybrana. */
export const DEFAULTS = {
  bri:0, con:0, gam:1, pix:1, inv:false,
  cienie:0, swiatla:0, nasycenie:0, odcien:0, ostrosc:0, odszum:0,
  algo:"floyd", str:1, thr:0, serp:true,
  pal:"bw", mapa:"kolor", percept:false, glebia:4, ink:"#000000", paper:"#ffffff",
  cell:8, ang:45, dot:1, blur:0, shape:"circle", inkmode:"mono", mis:0, grain:0,
  siatka:"kwadrat", srodekX:0, srodekY:0, fala:0, gladkosc:0, liniaMin:0, liniaMax:100,
  szorstkosc:0, rozlanie:0, plamy:0, dziury:0, walek:0,
  chmury:0, nierowne:0, drganie:0, postrzep:0, rasterGrad:"g-zachod", gradOdwroc:false, rozmiarJasnosc:false,
  pustePrzezr:true, zaokraglenie:0, qrTekst:"https://", qrKorekcja:"H", qrWersja:1, qrRozmiar:80, scalanie:0, zlewanie:0, stipIter:5, ksztaltWlasny:"", obrotZSiatka:true, obrotLos:0, ostreKrawedzie:false, boki:5, wciecie:0, wykladnik:40, znak:"★", obrys:0,
  tonPowt:1, tonRodzaj:"pila", tonPrzes:0, odpowiedz:100, minPunkt:0,
  odksztalcenie:0, odksztSkala:60, odksztPrzes:0, rozciag:100, pochyl:0, papierRodzaj:"gladki", papierSila:50,
  risoIle:2, risoLos:0, risoWariant:1,
  risoK1:"#ff48b0", risoZ1:"farba", risoA1:15, risoC1:8, risoS1:"circle", risoO1:100, risoX1:0, risoY1:0, risoR1:0,
  risoK2:"#0078bf", risoZ2:"farba", risoA2:75, risoC2:8, risoS2:"circle", risoO2:100, risoX2:0, risoY2:0, risoR2:0,
  risoK3:"#ffe800", risoZ3:"farba", risoA3:0,  risoC3:8, risoS3:"circle", risoO3:100, risoX3:0, risoY3:0, risoR3:0,
  risoK4:"#00838a", risoZ4:"farba", risoA4:45, risoC4:8, risoS4:"circle", risoO4:100, risoX4:0, risoY4:0, risoR4:0,
  sort:"brak", sortOd:25, sortDo:80, rgb:0, rgbKat:0,
  glow:0, glowR:12, glowProg:50, glowZrodlo:"obraz", glowKolor:"#4c8dff",
  efekty:"", efektyKopie:"", chrom:0, jpegJakosc:20, jpegGlitch:0, jpegZiarno:1,
  tint:0, tintKolor:"#3a7bff", tintTryb:"kolor",
  gwiazdy:0, gwProg:70, gwRamiona:4, gwDlugosc:40, gwKat:0,
  faktura:"brak", faktSkala:2, faktTryb:"mnoz", faktKrycie:50,
  postJas:0, postKon:0, postNas:0, winieta:0, postZiarno:0,
  czasSzum:0, czasDrganie:0, czasCykl:false, stabil:0,
  asciiZestaw:"standard", asciiWlasne:"", asciiTryb:"jasnosc", asciiRozmiar:12, asciiKolor:"obraz", asciiDither:false,
  znakiIle:6, znakiGranice:"", znakiWtapianie:0, znakiWtapWzor:"uporzadkowane", znakiStala:false, znakiBarwa:"farba", znakiMiesz:"source-over", znakiPodmiana:0, znakiZasieg:1, znakiUklad:1, znakiCzas:0,
  ruchPuls:0, ruchKrzywa:"gladko", ruchCykl:20, ruchFala:0, ruchFalaKat:45, ruchOdbicie:true,
  ruchKat:0, ruchObrot:0, ruchSkok:0, ruchPostoj:4, ruchDrzenie:0,
  papierTlo:"kolor", papierKat:90, papierGrad:"",
  punktSzer:100, punktWys:100, punktLosSzer:0, punktLosWys:0,
  fakturaSkala:100, fakturaCzas:false, ekspozycja:0, czern:0, biel:255,
  stylOdstep:8, stylKat:0, stylWygiecie:50, stylFala:0, stylFalaDl:24, stylSila:60, stylPredkosc:0, stylSrodekX:0, stylSrodekY:0,
  crtLinie:0, crtOdstep:2, crtMaska:0, glowRozciag:0, glowKatSmugi:0,
  /* efekty z Dither Boya (25.10): Neo Glow, Orbs, Stress Relief — fx.js */
  neoSila:0, neoProg:20, neoKolumna:8, neoDlugosc:12, neoPrzes:0, neoPredkosc:0, neoRozrzut:100, neoZanik:0, neoMrok:0, neoOs:"pion", neoLustro:false, neoZrodlo:"obraz", neoKolor:"#39ff6a",
  orbyIle:0, orbyWielk:30, orbySila:0, orbyLos:0, orbyPrzes:0, orbyZiarno:1, orbyZrodlo:"kolor", orbyKolor:"#ffffff", orbyTryb:"zwykly",
  zuzBrzeg:0, zuzSzorstkosc:50, zuzZiarno:0, zuzPlamki:0, zuzPlamkiWielk:3, zuzLos:1, zuzMix:100,
  soczKrzyw:0, soczSkala:100, soczBrzeg:"rozciagnij",
  lickDlugosc:0, lickKat:45, lickWir:40, lickSkala:60, lickLos:1, lickMix:100, lickTryb:"farba",
  /* tryb Glitch (glitch.js, wartości jak w glitch.h wtyczki VFX Glitch; pozycje w % kadru) */
  glAnim:false, glAnimCo:2,
  glJpeg:true, glJakosc:30, glBajty:0, glBajtyOd:0, glBajtyDo:100, glBajtyZiarno:1,
  glQtc:false, glQtcPoz:5, glQtcWart:0, glQtcLos:0, glQtcMaks:0, glQtcZiarno:1,
  glQtl:false, glQtlPoz:5, glQtlWart:0, glQtlLos:0, glQtlMaks:0, glQtlZiarno:1,
  glIdct:true, glYcc:true, glDekw:true, glF1:false, glF1W:1, glF2:false, glF2W:-0.1,
  glMapa:false, glMapaX:60, glMapaY:0, glMapaNr:1,
  glMosh:false, glMoshX:-70, glMoshY:10, glMoshSkala:10,
  glTop:false, glTopX:0, glTopY:200, glTopNr:1,
  glPaski:false, glPaskiX:60, glPaskiY:0, glPaskiNr:1,
  glTv:false, glTvX:80, glTvY:0, glTvNr:1,
  glKafle:false, glKafleX:80, glKafleY:40, glKafleNr:1,
  glKrople:false, glKropleIle:60, glKropleDl:400, glKropleNr:1,
  glCiecz:false, glCieczSila:120, glCieczSkala:300, glCieczNr:1,
  glLustro:false, glLustroOs:"poziomo", glLustroStrona:"pierwsza", glLustroX:50, glLustroY:50,
  glRgb:false, glR:true, glG:true, glB:true, glRx:0, glRy:0, glGx:0, glGy:0, glBx:0, glBy:0,
  glPrzes:false, glPrzesIle:5, glPrzesX:15, glPrzesY:15, glPrzesPx:50, glPrzesPy:50,
  glRozc:false, glRozcOs:"poziomo", glRozcOdwr:false, glRozcPx:50, glRozcPy:50,
  glCykl:false, glCyklR:1, glCyklG:1, glCyklB:1
};
/* Znaki według tonu: kształt i kolor każdego z 16 poziomów (od cieni do
   świateł) — część wyglądu, więc w presecie. Obrazki poziomów to materiał
   (znaki-tonu.js), do presetu nie trafiają. */
const ZNAKI_KSZTALTY = ["square", "szesciokat", "circle", "gwiazda", "diamond", "krzyzUkos", "pierscien", "trojkat",
                        "cross", "elipsa", "circle", "square", "diamond", "gwiazda", "szesciokat", "circle"];
/* pierwsze sześć (domyślna liczba tonów) od ciemnego do jasnego, dalsze — do wyboru */
const ZNAKI_KOLORY = ["#1b1b3a", "#3b5bdb", "#ae3ec9", "#f03e3e", "#fab005", "#ffe8cc", "#12b886", "#15aabf",
                      "#74c0fc", "#d6336c", "#f76707", "#94d82d", "#7048e8", "#2d3a8c", "#40c057", "#d0ebff"];
/* znakiR — wielkość kształtu w paśmie, % (Band Size Dither Boya) */
ZNAKI_KSZTALTY.forEach((k, i) => { DEFAULTS["znakiS" + (i + 1)] = k; DEFAULTS["znakiK" + (i + 1)] = ZNAKI_KOLORY[i]; DEFAULTS["znakiR" + (i + 1)] = 100; });
export const LOOK = Object.keys(DEFAULTS);

/* klatkaNr: numer bieżącej klatki osi czasu (0 bez filmu) — od niego zależą
   efekty zmienne w czasie; czasKlatki: jej czas w sekundach (ruch punktów
   rastra). Ustawia je podgląd filmu i zapis, nie panel */
export const S = Object.assign({ img:null, custom:null, mode:"dither", scl:1, fmt:"png", wektor:"piksele", wygl:3, jakosc:"wysoka", przezroczyste:false, dzwiek:true, klatkaNr:0, czasKlatki:0, svgObrazki:"osadz", svgLitery:"krzywe" }, DEFAULTS);
