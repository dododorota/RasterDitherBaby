/* Punkty startowe. Klucze odpowiadają polom w S (state.js). */
/* ---------- presety ---------- */
export const PRESETS = {
  dither:[
    ["Promo", {algo:"atkinson", str:1, pix:2, pal:"bw", ink:"#000000", paper:"#ffffff", con:28, gam:1.1, thr:0}],
    ["Game Boy", {algo:"bayer4", str:1, pix:3, pal:"gameboy", con:18, gam:1, thr:0}],
    ["Gazeta", {algo:"cluster", str:1.1, pix:2, pal:"bw", ink:"#1a1a1a", paper:"#f0ece2", con:35, gam:1.15}],
    ["Miękko", {algo:"jjn", str:0.85, pix:1, pal:"gray4", con:10, gam:1}],
    ["Poświata", {algo:"atkinson", str:1, pix:2, pal:"g-poswiata", mapa:"jasnosc", con:30, gam:0.9, glow:90, glowR:18, glowProg:40}],
    ["Termowizja", {algo:"floyd", str:1, pix:2, pal:"g-termo", mapa:"jasnosc", con:12}],
    ["Riso", {algo:"bayer8", str:1, pix:2, pal:"r-niebroz", mapa:"kolor", con:22, gam:1.05}],
    ["CRT", {algo:"waveform", str:1, pix:2, pal:"bw", mapa:"jasnosc", ink:"#000000", paper:"#ff3df2", con:35, glow:80, glowR:14, glowProg:35, stylOdstep:6, stylWygiecie:60}],
    ["Topo neon", {algo:"topografia", str:1, pix:2, pal:"bw", mapa:"jasnosc", ink:"#000000", paper:"#3dfff0", con:20, glow:70, glowR:12, glowProg:30, stylOdstep:6}],
    ["Fala", {algo:"falaDyfuzja", str:1, pix:2, pal:"bw", mapa:"jasnosc", ink:"#000000", paper:"#ffffff", con:25}],
    ["Pęknięcia", {algo:"pekniecia", str:1, pix:2, pal:"bw", mapa:"jasnosc", ink:"#000000", paper:"#ffffff", con:25, stylSila:100}],
    ["Smugi", {algo:"smugi", str:1, pix:2, pal:"bw", mapa:"jasnosc", ink:"#000000", paper:"#ffd2a0", con:30, glow:40, glowR:16, glowProg:60, stylOdstep:5, stylKat:90}],
    ["Szachownica", {algo:"szachownica2", str:1, pix:2, pal:"bw", mapa:"jasnosc", ink:"#000000", paper:"#ffffff", con:20}],
    ["Promienie", {algo:"promienie", str:1, pix:2, pal:"bw", mapa:"jasnosc", ink:"#000000", paper:"#ffffff", con:25}],
    /* z wtyczki VFX Dither 1.6 — ekran CRT i poświata w smugę (rgb: 3 px ditheringu × pikselizacja 2) */
    ["Monitor CRT", {algo:"bayer4", str:1, pix:2, pal:"m-bursztyn", mapa:"jasnosc", con:20, glow:70, glowR:14, glowProg:30, crtLinie:70, crtOdstep:2}],
    ["Zielony terminal", {algo:"atkinson", str:1, pix:2, pal:"m-zielony", mapa:"jasnosc", con:25, glow:80, glowR:12, glowProg:35, crtLinie:60, crtOdstep:2, crtMaska:30}],
    ["RGB glitch", {algo:"bayer4", str:1, pix:2, pal:"rgb3", mapa:"kolor", con:15, rgb:6, crtLinie:30, crtOdstep:2}],
    ["Smuga światła", {algo:"bayer8", str:1, pix:2, pal:"bw", mapa:"jasnosc", ink:"#000000", paper:"#ffd2a0", con:30, glow:60, glowR:16, glowProg:60, glowRozciag:60}],
    ["CRT na jasne", {algo:"waveform", str:1, pix:2, pal:"bw", mapa:"jasnosc", ink:"#000000", paper:"#ff3df2", con:35, glow:60, glowR:14, glowProg:35, stylOdstep:6, stylWygiecie:60, ekspozycja:-0.6, swiatla:-40}]
  ],
  /* tryb Glitch — presety wtyczki VFX Glitch (applyGlitchPreset w glitch.cpp);
     rozszczepienie RGB jak tam: czerwony w jedną stronę, zielony z niebieskim w drugą */
  glitch:[
    ["Domyślny", {}],
    ["Zepsuty JPEG", {glJakosc:25, glBajty:2, glBajtyOd:55, glBajtyDo:85, glBajtyZiarno:4}],
    ["Kolory JPEG", {glJakosc:60, glQtcLos:9, glQtcMaks:65}],
    ["Datamosh twarzy", {glJpeg:false, glMosh:true, glMoshX:-90, glMoshY:10, glMoshSkala:6, glMapa:true, glMapaX:40, glMapaNr:5}],
    ["Topnienie", {glJpeg:false, glTop:true, glTopY:250, glTopNr:3, glCiecz:true, glCieczSila:40}],
    ["Krople", {glJpeg:false, glKrople:true, glKropleIle:70, glKropleDl:500, glRgb:true, glRx:-4, glGx:4, glBx:4}],
    ["Lustro RGB", {glJpeg:false, glLustro:true, glRgb:true, glRx:-14, glGx:14, glBx:14}],
    ["Plastry", {glJpeg:false, glPaski:true, glPaskiX:90, glPaskiNr:2, glRgb:true, glRx:-6, glGx:6, glBx:6}],
    ["Zerwane VHS", {glJakosc:40, glTv:true, glTvX:50, glTvNr:3, glPaski:true, glPaskiX:30, glPaskiNr:4, glRgb:true, glRx:-8, glGx:8, glBx:8}],
    ["Psychodelia", {glJpeg:false, glCykl:true, glRgb:true, glRx:-10, glRy:-4, glGx:10, glGy:4, glBx:10, glBy:4}],
    ["Ciecz", {glJpeg:false, glCiecz:true, glCieczSila:100, glCieczSkala:250, glCieczNr:2}],
    ["Mapa glitchy", {glJakosc:35, glMapa:true, glMapaX:80, glMapaNr:7, glMosh:true, glMoshX:-60, glMoshY:0, glMoshSkala:12}]
  ],
  ascii:[
    ["Terminal", {asciiZestaw:"standard", asciiRozmiar:10, asciiKolor:"jeden", ink:"#33ff66", paper:"#000000", con:20}],
    ["Kolorowe", {asciiZestaw:"pelny", asciiRozmiar:8, asciiKolor:"obraz", paper:"#000000", con:15, nasycenie:30}],
    ["Bloki", {asciiZestaw:"bloki", asciiRozmiar:12, asciiKolor:"paleta", pal:"pico8", paper:"#000000", asciiDither:true}],
    ["Binarny", {asciiZestaw:"binarny", asciiRozmiar:10, asciiKolor:"jeden", ink:"#7dff8f", paper:"#000a00", asciiDither:true, con:25}],
    ["Maszyna do pisania", {asciiZestaw:"litery", asciiRozmiar:11, asciiKolor:"jeden", ink:"#1a1a1a", paper:"#efe9da", con:20}]
  ],
  half:[
    ["Offset", {inkmode:"cmyk", cell:7, ang:45, dot:1, shape:"circle", mis:6, grain:10, con:12}],
    ["Gazeta 1974", {inkmode:"mono", cell:6, ang:45, dot:1.1, shape:"circle", ink:"#1c1c1c", paper:"#efe9da", mis:14, grain:26, con:30, gam:1.1}],
    ["Riso", {inkmode:"duo", cell:9, ang:15, dot:1.05, shape:"circle", mis:30, grain:18, con:16}],
    ["Linia", {inkmode:"mono", cell:6, ang:20, dot:1.2, shape:"line", ink:"#000000", mis:0, grain:0, con:24}],
    ["Riso duo", {inkmode:"riso", risoIle:2, risoC1:7, risoC2:7, risoX1:5, risoY1:-3, paper:"#f5f1e8", papierRodzaj:"wlokna", papierSila:45, szorstkosc:45, rozlanie:20, plamy:22, dziury:12, con:15}],
    ["Rytownik", {inkmode:"mono", shape:"pasy", cell:9, ang:90, fala:70, blur:3, ink:"#ff2a00", paper:"#ffd21a", con:20}],
    ["Obręcze", {inkmode:"mono", shape:"pasy", siatka:"okregi", cell:7, fala:40, blur:2, ink:"#1a1a1a", paper:"#f2c84b", con:15}],
    ["Wzdłuż kształtu", {inkmode:"mono", shape:"pasy", siatka:"warstwice", cell:6, ang:20, fala:60, gladkosc:15, liniaMin:12, liniaMax:100, ink:"#1a1a1a", paper:"#f2efe6", con:20}],
    ["Promienie", {inkmode:"mono", shape:"pasy", siatka:"promienie", cell:8, ink:"#c8102e", paper:"#f5ecd7", con:15}],
    ["Kolorowe punkty", {inkmode:"obraz", rozmiarJasnosc:true, cell:7, ang:45, dot:1.15, paper:"#0d0d0d", nasycenie:25, con:10}],
    ["Termo", {inkmode:"gradient", rasterGrad:"g-termo", rozmiarJasnosc:true, siatka:"heks", cell:6, dot:1.2, paper:"#000000", con:15}],
    ["Skan", {inkmode:"mono", cell:7, ang:15, dot:0.95, chmury:30, nierowne:40, drganie:10, postrzep:50, szorstkosc:20, ink:"#111111", paper:"#ffffff", bri:10}],
    ["Niebieski skan", {inkmode:"mono", cell:6, ang:45, dot:0.95, chmury:60, nierowne:30, drganie:8, postrzep:40, ink:"#4b4fa0", paper:"#ffffff", bri:10, con:-25}]
  ]
};
