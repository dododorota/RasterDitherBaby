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
  pustePrzezr:true, zaokraglenie:0, qrTekst:"https://", qrKorekcja:"H", qrWersja:1, qrRozmiar:80, scalanie:0, zlewanie:0, stipIter:8, ksztaltWlasny:"", obrotZSiatka:true, boki:5, wciecie:0, wykladnik:40, znak:"★", obrys:0,
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
  asciiZestaw:"standard", asciiWlasne:"", asciiTryb:"jasnosc", asciiRozmiar:12, asciiKolor:"obraz", asciiDither:false
};
export const LOOK = Object.keys(DEFAULTS);

/* klatkaNr: numer bieżącej klatki osi czasu (0 bez filmu) — od niego zależą
   efekty zmienne w czasie; ustawia go podgląd filmu i zapis, nie panel */
export const S = Object.assign({ img:null, custom:null, mode:"dither", scl:1, fmt:"png", wektor:"piksele", wygl:3, jakosc:"wysoka", przezroczyste:false, dzwiek:true, klatkaNr:0 }, DEFAULTS);
