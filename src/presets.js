/* Punkty startowe. Klucze odpowiadają polom w S (state.js). */
/* ---------- presety ---------- */
export const PRESETS = {
  dither:[
    ["Promo", {algo:"atkinson", str:1, pix:2, pal:"bw", ink:"#000000", paper:"#ffffff", con:28, gam:1.1, thr:0}],
    ["Game Boy", {algo:"bayer4", str:1, pix:3, pal:"gameboy", con:18, gam:1, thr:0}],
    ["Gazeta", {algo:"cluster", str:1.1, pix:2, pal:"bw", ink:"#1a1a1a", paper:"#f0ece2", con:35, gam:1.15}],
    ["Miękko", {algo:"jjn", str:0.85, pix:1, pal:"gray4", con:10, gam:1}]
  ],
  half:[
    ["Offset", {inkmode:"cmyk", cell:7, ang:45, dot:1, shape:"circle", mis:6, grain:10, con:12}],
    ["Gazeta 1974", {inkmode:"mono", cell:6, ang:45, dot:1.1, shape:"circle", ink:"#1c1c1c", paper:"#efe9da", mis:14, grain:26, con:30, gam:1.1}],
    ["Riso", {inkmode:"duo", cell:9, ang:15, dot:1.05, shape:"circle", mis:30, grain:18, con:16}],
    ["Linia", {inkmode:"mono", cell:6, ang:20, dot:1.2, shape:"line", ink:"#000000", mis:0, grain:0, con:24}]
  ]
};
