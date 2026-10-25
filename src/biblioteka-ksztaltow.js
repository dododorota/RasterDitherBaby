/* Biblioteka kształtów punktu — odwzorowanie biblioteki Dither Boya
   (zbliżenia kafelków od użytkowniczki, 25.10), w tej samej kolejności:
   Basic, Triangles, Symbols, Lines, Spooky, Pixel. Czysty moduł, bez DOM-u —
   liczy się też w workerze rastra.

   Kształt to lista konturów w kafelku [−1, 1] (y w dół) — kafelek to cała
   komórka, jak w Dither Boyu; rysowany × r punktu (przy pełnym pokryciu
   kafelek ma ~1,1 komórki). Pole nie jest wyrównywane do koła: kształt
   wygląda w rastrze tak, jak na kafelku, a ton dobiera się pasmami.

   Obiegi: domyślnie każdy kontur dostaje dodatni obieg, więc części kształtu
   się sumują (nachodzące kropki, łuki, płatki). Kształty z otworami mają
   opcję {otwory: true} — wtedy siatki.js rozpoznaje otwory (`orientuj`) po
   pierwszym punkcie konturu: otwór zaczynać w punkcie leżącym w dokładnie
   jednym innym konturze. Identyfikator „b-…" trafia do S i presetów —
   raz nadanego nie zmieniać. */

const kolo = (cx, cy, r, n = 28) => Array.from({length: n}, (_, i) => { const f = i*2*Math.PI/n; return [cx + r*Math.cos(f), cy + r*Math.sin(f)]; });
const prost = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const kw = (cx, cy, p) => prost(cx - p, cy - p, cx + p, cy + p);
const wielo = (n, R, k0 = -Math.PI/2, cx = 0, cy = 0) => Array.from({length: n}, (_, i) => { const f = k0 + i*2*Math.PI/n; return [cx + R*Math.cos(f), cy + R*Math.sin(f)]; });
const gwiazda = (n, R, r, k0 = -Math.PI/2) => Array.from({length: 2*n}, (_, i) => { const f = k0 + i*Math.PI/n, q = i % 2 ? r : R; return [q*Math.cos(f), q*Math.sin(f)]; });
const odwr = c => [...c].reverse();
const obroc = (c, k) => c.map(([x, y]) => [x*Math.cos(k) - y*Math.sin(k), x*Math.sin(k) + y*Math.cos(k)]);
const przesun = (c, dx, dy) => c.map(([x, y]) => [x + dx, y + dy]);
const skaluj = (c, sx, sy = sx) => c.map(([x, y]) => [x*sx, y*sy]);
const lustro = c => odwr(c.map(([x, y]) => [-x, y]));
const romb = (cx, cy, a, b = a) => [[cx, cy - b], [cx + a, cy], [cx, cy + b], [cx - a, cy]];
function zaokr(x0, y0, x1, y1, rr, n = 6){
  const p = [];
  for(const [cx, cy, k] of [[x1 - rr, y0 + rr, -Math.PI/2], [x1 - rr, y1 - rr, 0], [x0 + rr, y1 - rr, Math.PI/2], [x0 + rr, y0 + rr, Math.PI]])
    for(let i=0; i<=n; i++){ const f = k + i*Math.PI/2/n; p.push([cx + rr*Math.cos(f), cy + rr*Math.sin(f)]); }
  return p;
}
function kreska(x0, y0, x1, y1, g){
  const d = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0)/d*g/2, ny = (x1 - x0)/d*g/2;
  return [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]];
}
/* kreska z zaokrąglonymi końcami (kapsuła) */
function kapsula(x0, y0, x1, y1, g, n = 8){
  const k = Math.atan2(y1 - y0, x1 - x0), p = [];
  for(let i=0; i<=n; i++){ const f = k - Math.PI/2 + i*Math.PI/n; p.push([x1 + g/2*Math.cos(f), y1 + g/2*Math.sin(f)]); }
  for(let i=0; i<=n; i++){ const f = k + Math.PI/2 + i*Math.PI/n; p.push([x0 + g/2*Math.cos(f), y0 + g/2*Math.sin(f)]); }
  return p;
}
function lamana(pts, g){
  const L = [], P = [];
  for(let i=0; i<pts.length; i++){
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
    L.push([pts[i][0] - ty*g/2, pts[i][1] + tx*g/2]); P.push([pts[i][0] + ty*g/2, pts[i][1] - tx*g/2]);
  }
  return L.concat(P.reverse());
}
/* pierścień jednym konturem: obwód tam, środek z powrotem — sam w sobie
   ma otwór, więc nachodzące pierścienie się sumują (wiry) */
function pierscien1(cx, cy, R, r, n = 36){
  const z = kolo(cx, cy, R, n), w = odwr(kolo(cx, cy, r, n));
  return [...z, z[0], w[w.length - 1], ...w];
}
/* ćwiartka koła w rogu kafelka (środek w rogu) */
function cwiartka(cx, cy, r, k0, n = 8){
  const p = [[cx, cy]];
  for(let i=0; i<=n; i++){ const f = k0 + i*Math.PI/2/n; p.push([cx + r*Math.cos(f), cy + r*Math.sin(f)]); }
  return p;
}
/* połówka koła płaską stroną w kierunku k (0 = płaska z prawej) */
function polowka(cx, cy, r, k, n = 14){
  const p = [];
  for(let i=0; i<=n; i++){ const f = k + Math.PI/2 + i*Math.PI/n; p.push([cx + r*Math.cos(f), cy + r*Math.sin(f)]); }
  return p;
}
/* półksiężyc: koło minus przesunięte koło, w kafelku jednostkowym, potem skala/położenie */
function ksiezyc(cx = 0, cy = 0, s = 1, k = 0){
  const R = 1, ox = 0.5, oy = -0.25, r = 0.85, d = Math.hypot(ox, oy), g = Math.atan2(oy, ox);
  const a = (R*R - r*r + d*d)/(2*d), dl = Math.acos(a/R), ep = Math.acos((d - a)/r), p = [];
  for(let i=0; i<=24; i++){ const f = g + dl + i*(2*Math.PI - 2*dl)/24; p.push([R*Math.cos(f), R*Math.sin(f)]); }
  const wew = [];
  for(let i=0; i<=14; i++){ const f = g + Math.PI - ep + i*2*ep/14; wew.push([ox + r*Math.cos(f), oy + r*Math.sin(f)]); }
  const kon = p[p.length - 1];
  if(Math.hypot(wew[0][0] - kon[0], wew[0][1] - kon[1]) > Math.hypot(wew[wew.length - 1][0] - kon[0], wew[wew.length - 1][1] - kon[1])) wew.reverse();
  return przesun(skaluj(obroc(p.concat(wew.slice(1, -1)), k), s), cx, cy);
}
/* latawiec (płatek) od punktu a do b, szerokość w — romb wydłużony wzdłuż a→b */
function latawiec(ax, ay, bx, by, w, t = 0.5){
  const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1, nx = -dy/d*w/2, ny = dx/d*w/2, mx = ax + dx*t, my = ay + dy*t;
  return [[ax, ay], [mx + nx, my + ny], [bx, by], [mx - nx, my - ny]];
}
/* n×n kropek w kwadracie ±e, promień f(x, y) (≤ 0 — brak kropki) */
function siatka(n, e, f){
  const wyn = [];
  for(let j=0; j<n; j++) for(let i=0; i<n; i++){
    const x = n === 1 ? 0 : -e + 2*e*i/(n - 1), y = n === 1 ? 0 : -e + 2*e*j/(n - 1), r = typeof f === "number" ? f : f(x, y);
    if(r > 0.008) wyn.push(kolo(x, y, r, r > 0.08 ? 16 : 10));
  }
  return wyn;
}
/* bitmapa tekstem („#" = piksel) → prostokąty pikseli z sąsiednich w wierszu,
   wyśrodkowane, bok całości `bok` */
function piksele(bok, ...wiersze){
  const h = wiersze.length, w = Math.max(...wiersze.map(r => r.length)), s = bok/Math.max(w, h), x0 = -w*s/2, y0 = -h*s/2, wyn = [];
  wiersze.forEach((r, j) => {
    for(let i=0; i<r.length; i++){
      if(r[i] !== "#") continue;
      let k = i; while(k + 1 < r.length && r[k + 1] === "#") k++;
      wyn.push(prost(x0 + i*s, y0 + j*s, x0 + (k + 1)*s, y0 + (j + 1)*s));
      i = k;
    }
  });
  return wyn;
}
const kropki = (poz, r) => poz.map(([x, y, q]) => kolo(x, y, q ?? r, 18));
/* wir: pierścienie z przesuniętymi środkami (jak odcisk palca) */
const wir = (n, g) => Array.from({length: n}, (_, i) => { const R = 0.2 + i*0.5/(n - 1); return pierscien1(0.06*Math.cos(i*1.3), 0.06*Math.sin(i*1.3) - 0.03*i, R, R - g); });
/* stożek z kropek: wiersze kropek rosnących w prawo */
const stozek = (wiersze, n, rmax) => wiersze.flatMap(y => Array.from({length: n}, (_, i) => kolo(-0.62 + 1.24*i/(n - 1), y, 0.015 + rmax*(i/(n - 1))**1.4, 12)));
/* serce parametryczne */
const serce = (s = 1, dy = 0) => Array.from({length: 48}, (_, i) => { const t = i*2*Math.PI/48;
  return [16*Math.sin(t)**3/17*s, (-(13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t)) - 5)/15*s + dy]; });
function soczewka(R, d, s = 1, n = 20){
  const xm = Math.sqrt(R*R - d*d), gora = [], dol = [];
  for(let i=0; i<=n; i++){ const x = -xm + 2*xm*i/n, h = Math.sqrt(R*R - x*x); gora.push([x*s, (d - h)*s]); dol.push([x*s, (h - d)*s]); }
  return gora.concat(dol.reverse().slice(1, -1));
}
/* gwiazda o wklęsłych bokach (iskra): astroida z wykładnikiem */
const iskra = (R, w = 3, n = 4, k0 = 0) => Array.from({length: 64}, (_, i) => { const t = i*2*Math.PI/64;
  if(n === 4){ const c = Math.cos(t), s = Math.sin(t); return obroc([[R*Math.sign(c)*Math.abs(c)**w, R*Math.sign(s)*Math.abs(s)**w]], k0)[0]; }
  const f = Math.abs(Math.cos(n*t/2)), q = R*(0.18 + 0.82*f**(w*2)); return [q*Math.cos(t + k0), q*Math.sin(t + k0)]; });
/* gwiazda o n ostrych czubkach i wklęsłych bokach: bok wygięty do środka
   o `g` (0 — wielokąt, ~0,85 — cienkie ramiona) */
function wklesly(n, R, g, k0 = -Math.PI/2, m = 12){
  const p = [];
  for(let i=0; i<n; i++){
    const a = k0 + i*2*Math.PI/n, b = k0 + (i + 1)*2*Math.PI/n, A = [R*Math.cos(a), R*Math.sin(a)], B = [R*Math.cos(b), R*Math.sin(b)];
    for(let j=0; j<m; j++){ const t = j/m, s = 1 - g*Math.sin(Math.PI*t); p.push([(A[0] + (B[0] - A[0])*t)*s, (A[1] + (B[1] - A[1])*t)*s]); }
  }
  return p;
}
/* pieczęć: koło z ząbkami */
const pieczec = (n, R, r) => Array.from({length: 4*n}, (_, i) => { const f = -Math.PI/2 + i*Math.PI/(2*n), q = i % 4 === 0 ? R : i % 4 === 2 ? r : (R + r)/2; return [q*Math.cos(f), q*Math.sin(f)]; });
/* schodki: łamana po przekątnej, n stopni */
const schody = (n, g) => { const p = []; const krok = 1.3/n; let x = -0.65, y = 0.65; p.push([x, y]);
  for(let i=0; i<n; i++){ x += krok; p.push([x, y]); y -= krok; p.push([x, y]); } return lamana(p, g); };
/* kreskowanie: n ukośnych kresek „/" w kwadracie ±e, grubość g */
function kreskowanie(n, e, g){
  const wyn = [];
  for(let i=0; i<n; i++){
    const c = -2*e + 4*e*(i + 0.5)/n, a = Math.max(-e, c - e), b = Math.min(e, c + e);
    if(b - a > 0.05) wyn.push(kreska(a, c - a, b, c - b, g));
  }
  return wyn;
}
/* kod kreskowy: szerokości pasków, odstęp */
function kod(sz, odst = 0.07){
  let x = 0; const wyn = [];
  for(const s of sz){ wyn.push([x, s]); x += s + odst; }
  const w = x - odst;
  return wyn.map(([x0, s]) => prost(x0 - w/2, -0.6, x0 - w/2 + s, 0.6));
}

const O = {otwory: true};
const GRUPY_SUROWE = [
  ["podstawowe", "Basic", [
    ["kolo", "Koło", [kolo(0, 0, .64)]],
    ["kwadrat", "Kwadrat", [kw(0, 0, .6)]],
    ["kwadrat-zaobl", "Kwadrat zaokrąglony", [zaokr(-.6, -.6, .6, .6, .2)]],
    ["romb", "Romb", [romb(0, 0, .56)]],
    ["szesciokat", "Sześciokąt", [wielo(6, .62)]],
    ["osmiokat", "Ośmiokąt", [wielo(8, .64, Math.PI/8)]],
    ["pierscien", "Pierścień", [kolo(0, 0, .62), odwr(kolo(0, 0, .38))], O],
    ["ramka", "Ramka", [kw(0, 0, .58), odwr(kw(0, 0, .36))], O],
    ["kw-1", "Kwadrat 1", [kw(-.28, -.3, .12)]],
    ["kw-2", "Kwadrat 2", [kw(-.1, -.12, .2)]],
    ["kw-3", "Kwadrat 3", [kw(-.04, -.06, .3)]],
    ["kw-4", "Kwadrat 4", [kw(0, 0, .44)]],
    ["kwadraty-1", "Jeden kwadracik", [kw(-.4, -.4, .14)]],
    ["kwadraty-2", "Dwa kwadraciki", [kw(-.4, -.4, .14), kw(.38, .38, .14)]],
    ["kwadraty-3", "Trzy kwadraciki", [kw(-.4, -.4, .14), kw(.38, -.4, .14), kw(.38, .38, .14)]],
    ["kwadraty-4", "Cztery kwadraciki", [kw(-.38, -.38, .14), kw(.38, -.38, .14), kw(-.38, .38, .14), kw(.38, .38, .14)]],
    ["kropki-4", "Cztery kropki", kropki([[-.55, -.55], [.55, -.55], [-.55, .55], [.55, .55]], .07)],
    ["kropki-5", "Pięć kropek", kropki([[-.55, -.55], [.55, -.55], [-.55, .55], [.55, .55], [0, 0, .13]], .07)],
    ["rogi-1", "Rogi i kropka", [cwiartka(-.78, -.78, .26, 0), cwiartka(.78, -.78, .26, Math.PI/2), cwiartka(.78, .78, .26, Math.PI), cwiartka(-.78, .78, .26, -Math.PI/2), kolo(0, 0, .16)]],
    ["rogi-2", "Rogi i koło", [cwiartka(-.8, -.8, .38, 0), cwiartka(.8, -.8, .38, Math.PI/2), cwiartka(.8, .8, .38, Math.PI), cwiartka(-.8, .8, .38, -Math.PI/2), kolo(0, 0, .24)]],
    ...[.56, .64, .72, .8].map((R, i) => ["osmiokat-" + (i + 1), "Ośmiokąt " + (i + 1), [wielo(8, R, Math.PI/8)]]),
    ...[[5, .05], [6, .06], [6, .085], [6, .11]].map(([n, g], i) => ["wir-" + (i + 1), "Wir " + (i + 1), wir(n, g)]),
    ["polkropki-1", "Kropki i połówki", [...kropki([[-.3, -.25], [0, -.25], [.3, -.25], [0, .25]], .1), polowka(-.55, .25, .1, Math.PI), polowka(.55, .25, .1, 0)]],
    ["polkropki-2", "Kropki i połówki duże", [...kropki([[-.4, -.3], [0, -.42], [.4, -.3]], .17), kolo(0, .3, .17), polowka(-.6, .3, .17, Math.PI), polowka(.6, .3, .17, 0)]],
    ["kola-polowki-1", "Koła i połówki", [kolo(-.25, -.3, .2), kolo(.25, -.3, .2), kolo(-.25, .3, .2), polowka(.3, .3, .2, Math.PI)]],
    ["kola-polowki-2", "Koła i połówki duże", [kolo(-.3, -.32, .28), kolo(.32, -.32, .28), kolo(-.3, .34, .28), polowka(.38, .34, .28, Math.PI)]],
    ...[.05, .07, .1, .14].map((r, i) => ["stozek-" + (i + 1), "Stożek z kropek " + (i + 1), stozek(i < 2 ? [-.12, .12] : [-.24, 0, .24], 9, r)]),
    ...[.14, .19, .24, .3].map((s, i) => ["ksiezyce-" + (i + 1), "Księżyce " + (i + 1),
      [[-.42, -.32], [.38, -.38], [-.36, .34], [.42, .3]].map(([x, y], j) => ksiezyc(x, y, s*(j % 2 ? 1 : 0.85), 0.4))]),
    ...[.17, .24].map((w, i) => ["iks-latawce-" + (i + 1), "Iks z płatków " + (i + 1),
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => latawiec(x*.1, y*.1, x*.66, y*.66, w))]),
    ...[.42, .52].map((w, i) => ["platki-" + (i + 1), "Cztery płatki " + (i + 1),
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => latawiec(x*.04, y*.04, x*.68, y*.68, w, .45))]),
    ...[.05, .08, .11, .14].map((r, i) => ["kropki-2x2-" + (i + 1), "Kropki 2×2 " + (i + 1), siatka(2, .45, r)]),
    ...[[.08, .03], [.12, .05], [.17, .07], [.22, .09]].map(([c, e], i) => ["kropki-3x3-" + (i + 1), "Kropki 3×3 " + (i + 1),
      siatka(3, .55, (x, y) => (x === 0 && y === 0) ? c : (x === 0 || y === 0) ? e*1.6 : e)]),
    ["gesta-1", "Gęsta siatka 1", siatka(9, .6, .028)],
    ["gesta-2", "Gęsta siatka 2", siatka(9, .6, .04)],
    ["jasny-srodek-1", "Siatka z jasnym środkiem 1", siatka(9, .6, (x, y) => .02 + .035*(1 - Math.min(1, Math.hypot(x, y)/.85)))],
    ["jasny-srodek-2", "Siatka z jasnym środkiem 2", siatka(9, .6, (x, y) => .025 + .045*(1 - Math.min(1, Math.hypot(x, y)/.85)))],
    ...[.024, .032, .042, .052].map((r, i) => ["siatka-" + (i + 1), "Siatka " + (i + 1), siatka(8, .6, r)]),
    ...[.035, .045, .055, .065].map((r, i) => ["romb-kropek-" + (i + 1), "Romb z kropek " + (i + 1),
      siatka(9, .64, (x, y) => { const d = (Math.abs(x) + Math.abs(y))/.9; return d > 1 ? 0 : r*(1.15 - d); })]),
    ...[.03, .045].map((r, i) => ["siatka-pusta-" + (i + 1), "Siatka z pustym środkiem " + (i + 1), siatka(8, .6, (x, y) => Math.max(Math.abs(x), Math.abs(y)) < .3 ? r*.5 : r)]),
    ...[.06, .075].map((r, i) => ["siatka-gruba-" + (i + 1), "Siatka gruba " + (i + 1), siatka(7, .58, r)]),
    ["przekatna-1", "Przekątna 1", kropki([[-.3, -.3], [.3, .3]], .06)],
    ["przekatna-2", "Przekątna 2", kropki([[-.45, -.45, .05], [0, 0, .09], [.45, .45, .07]])],
    ["przekatna-3", "Przekątna 3", kropki([[-.5, -.5, .08], [-.12, -.12, .12], [.3, .3, .14], [.6, -.45, .04], [-.55, .55, .04]])],
    ["przekatna-4", "Przekątna 4", kropki([[-.55, -.55, .1], [-.12, -.1, .16], [.38, .38, .18], [.62, -.55, .05], [-.6, .6, .05]])],
    ...[.03, .045, .06, .075].map((r, i) => ["rzedy-" + (i + 1), "Rzędy kropek " + (i + 1), stozek([-.4, -.2, 0, .2, .4], 7, r)])
  ]],
  ["trojkaty", "Triangles", [
    ["trojkat-gora", "Trójkąt w górę", [[[0, -.58], [.62, .5], [-.62, .5]]]],
    ["trojkat-dol", "Trójkąt w dół", [[[0, .58], [-.62, -.5], [.62, -.5]]]],
    ["trojkat-lewo", "Trójkąt w lewo", [[[-.58, 0], [.5, -.62], [.5, .62]]]],
    ["trojkat-prawo", "Trójkąt w prawo", [[[.58, 0], [-.5, .62], [-.5, -.62]]]],
    ["prostokatny-ld", "Prostokątny ◣", [[[-.56, -.56], [.56, .56], [-.56, .56]]]],
    ["prostokatny-pd", "Prostokątny ◢", [[[.56, -.56], [.56, .56], [-.56, .56]]]],
    ["prostokatny-lg", "Prostokątny ◤", [[[-.56, -.56], [.56, -.56], [-.56, .56]]]],
    ["prostokatny-pg", "Prostokątny ◥", [[[-.56, -.56], [.56, -.56], [.56, .56]]]],
    ["nierowny-1", "Trójkąt pochylony", [[[-.3, -.58], [.5, .52], [-.52, .52]]]],
    ["nierowny-2", "Trójkąt pochylony 2", [[[.4, -.56], [.6, .52], [-.6, .52]]]],
    ["waski", "Wąski trójkąt", [[[0, -.62], [.22, .6], [-.22, .6]]]],
    ["klepsydra", "Klepsydra", [[[-.5, -.6], [.5, -.6], [0, 0]], [[0, 0], [.5, .6], [-.5, .6]]]],
    ["muszka", "Muszka", [[[-.6, -.5], [0, 0], [-.6, .5]], [[.6, .5], [0, 0], [.6, -.5]]]],
    ["grot", "Grot", [[[0, -.62], [.5, .6], [0, .28], [-.5, .6]]]],
    ["skos-pasek", "Skos z paskiem", [[[-.58, -.58], [.2, -.58], [-.58, .2]], [[.58, -.18], [.58, .18], [.18, .58], [-.18, .58]]]],
    ["paski-4", "Cztery paski", kreskowanie(4, .58, .15)],
    ["romb-w-kwadracie", "Romb w kwadracie", [kw(0, 0, .58), odwr(romb(0, 0, .48)), romb(0, 0, .3)], O],
    ["romby-3x3", "Romby 3×3", [-.4, 0, .4].flatMap(y => [-.4, 0, .4].map(x => romb(x, y, .18)))],
    ["play", "Play", [[[-.45, -.55], [.55, 0], [-.45, .55]]]],
    ["play-2", "Podwójny play", [przesun([[-.3, -.42], [.3, 0], [-.3, .42]], -.3, 0), przesun([[-.3, -.42], [.3, 0], [-.3, .42]], .3, 0)]],
    ["play-3", "Potrójny play", [-.42, 0, .42].map(x => przesun([[-.22, -.34], [.22, 0], [-.22, .34]], x, 0))],
    ["play-4", "Poczwórny play", [-.48, -.16, .16, .48].map(x => przesun([[-.17, -.28], [.17, 0], [-.17, .28]], x, 0))]
  ]],
  ["symbole", "Symbols", [
    ["gwiazda5", "Gwiazda", [gwiazda(5, .64, .27)]],
    ["gwiazda6", "Gwiazda sześcioramienna", [gwiazda(6, .62, .34)]],
    ["iskra", "Iskra", [iskra(.66, 3)]],
    ["plus", "Plus", [prost(-.58, -.16, .58, .16), prost(-.16, -.58, .16, .58)]],
    ["iks", "Iks", [obroc(prost(-.62, -.16, .62, .16), Math.PI/4), obroc(prost(-.16, -.62, .16, .62), Math.PI/4)]],
    ["kropla", "Kropla", [[[0, -.66], ...Array.from({length: 25}, (_, i) => { const f = (-30 + i*10)*Math.PI/180; return [.42*Math.cos(f), .2 + .42*Math.sin(f)]; })]]],
    ["blyskawica", "Błyskawica", [[[.14, -.68], [-.4, .1], [-.04, .1], [-.16, .68], [.4, -.12], [.04, -.12]]]],
    ["koniczyna", "Koniczyna", [kolo(0, -.3, .3), kolo(.3, 0, .3), kolo(0, .3, .3), kolo(-.3, 0, .3), kolo(0, 0, .2)]],
    ["oko", "Oko", [soczewka(1.35, .9, .62), odwr(kolo(0, 0, .25, 20)), kolo(0, 0, .13, 14)], O],
    ["trojramienna", "Gwiazda trójramienna", [przesun(wklesly(3, .64, .82), 0, .08)]],
    ["trojkat-wklesly", "Trójkąt wklęsły", [przesun(wklesly(3, .66, .45), 0, .1)]],
    ["trojkat-s", "Trójkąt", [[[0, -.52], [.52, .44], [-.52, .44]]]],
    ["trojkat-zaobl", "Trójkąt zaokrąglony", [przesun(wklesly(3, .52, -.32), 0, .08)]],
    ["krzyz-cienki", "Gwiazdka cienka", [wklesly(4, .66, .88)]],
    ["gwiazda4", "Gwiazda czteroramienna", [gwiazda(4, .64, .2)]],
    ["gwiazda4-gruba", "Gwiazda czteroramienna gruba", [gwiazda(4, .66, .3)]],
    ["romb-wypukly", "Romb wypukły", [iskra(.66, 1.4)]],
    ["gwiazda8-cienka", "Gwiazda ośmioramienna cienka", [gwiazda(8, .64, .2)]],
    ["gwiazda8", "Gwiazda ośmioramienna", [gwiazda(8, .64, .32)]],
    ["gwiazda8-gruba", "Gwiazda ośmioramienna gruba", [gwiazda(8, .6, .4)]],
    ["pieczec10", "Pieczęć", [pieczec(10, .62, .5)]],
    ["gwiazda12-cienka", "Gwiazda dwunastoramienna", [gwiazda(12, .64, .24)]],
    ["gwiazda16-cienka", "Gwiazda szesnastoramienna", [gwiazda(16, .64, .22)]],
    ["gwiazda12", "Gwiazda dwunastoramienna gruba", [gwiazda(12, .62, .42)]],
    ["pieczec16", "Pieczęć szesnastoramienna", [gwiazda(16, .62, .46)]],
    ["gwiazda16", "Gwiazda szesnastoramienna mała", [gwiazda(16, .5, .2)]],
    ["pieczec12", "Pieczęć dwunastoramienna", [gwiazda(12, .6, .48)]],
    ["gwiazda10", "Gwiazda dziesięcioramienna", [gwiazda(10, .62, .36)]],
    ["wybuch", "Wybuch", [gwiazda(14, .64, .38)]]
  ]],
  ["linie", "Lines", [
    ["kreska-pozioma", "Kreska pozioma", [kapsula(-.55, 0, .55, 0, .26)]],
    ["kreska-pionowa", "Kreska pionowa", [kapsula(0, -.55, 0, .55, .26)]],
    ["kreska-ukos", "Kreska /", [kapsula(-.45, .45, .45, -.45, .26)]],
    ["kreska-ukos-2", "Kreska \\", [kapsula(-.45, -.45, .45, .45, .26)]],
    ["daszek", "Daszek", [lamana([[-.55, -.25], [0, .28], [.55, -.25]], .2)]],
    ["fala", "Fala", [lamana(Array.from({length: 25}, (_, i) => { const x = -.62 + i*1.24/24; return [x, .22*Math.sin(x*Math.PI*1.6)]; }), .18)]],
    ["ukos-1", "Ukos cienki", [kreska(-.55, .55, .55, -.55, .08)]],
    ["ukos-2", "Ukos", [kreska(-.55, .55, .55, -.55, .16)]],
    ["ukos-3", "Ukos gruby", [kreska(-.55, .55, .55, -.55, .3)]],
    ["ukos-pol", "Dwa trójkąty", [[[-.56, -.56], [.4, -.56], [-.56, .4]], [[.56, -.4], [.56, .56], [-.4, .56]]]],
    ["schody-1", "Schody cienkie", [schody(4, .07)]],
    ["schody-2", "Schody", [schody(4, .13)]],
    ["schody-3", "Schody grube", [schody(3, .2)]],
    ["schody-4", "Schody bardzo grube", [schody(3, .3)]],
    ["kreskowanie-1", "Kreskowanie gęste", kreskowanie(7, .58, .05)],
    ["kreskowanie-2", "Kreskowanie", kreskowanie(6, .58, .08)],
    ["kreskowanie-3", "Kreskowanie grube", kreskowanie(5, .58, .11)],
    ["kreskowanie-4", "Kreskowanie bardzo grube", kreskowanie(4, .58, .15)],
    ["kod-1", "Kod kreskowy 1", kod([.05, .05, .05, .1, .05, .05, .05, .05, .1, .05])],
    ["kod-2", "Kod kreskowy 2", kod([.06, .12, .06, .06, .16, .06, .1, .06])],
    ["kod-3", "Kod kreskowy 3", kod([.1, .05, .1, .15, .05, .1, .05])],
    ["kod-4", "Kod kreskowy 4", kod([.16, .06, .1, .16, .06, .12], .08)]
  ]],
  ["spooky", "Spooky", [
    ["nietoperz", "Nietoperz", [(() => { const p = [[0, -.12], [.06, -.26], [.1, -.1], [.28, -.2], [.66, -.26], [.56, -.04], [.46, .1], [.36, .02], [.27, .18], [.17, .07], [.08, .24], [0, .12]];
      return p.concat(lustro(p).slice(1, -1)); })()]],
    ["czaszka", "Czaszka", [kolo(0, -.14, .5), [[.3, .58], [-.3, .58], [-.3, .18], [.3, .18]],
      odwr(kolo(-.2, -.1, .15, 16)), odwr(kolo(.2, -.1, .15, 16)), odwr([[0, .02], [.08, .14], [-.08, .14]]),
      ...[-.16, 0, .16].map(x => odwr(prost(x - .04, .4, x + .04, .52)))], O],
    ["nagrobek", "Nagrobek", [[...Array.from({length: 19}, (_, i) => { const f = Math.PI + i*Math.PI/18; return [.32*Math.cos(f), -.18 + .32*Math.sin(f)]; }), [.32, .58], [-.32, .58]]]],
    ["krysztal", "Kryształ", [[[0, -.62], [.26, 0], [0, .62], [-.26, 0]]]],
    ["kielich", "Kielich", [[[-.34, -.5], [.34, -.5], [.22, .5], [-.22, .5]]]]
  ]],
  ["piksel", "Pixel", [
    ["px-serce", "Serce pikselowe", piksele(1.3, ".##.##.", "#######", "#######", ".#####.", "..###..", "...#...")],
    ["px-czaszka", "Czaszka pikselowa", piksele(1.3, ".#####.", "#######", "#..#..#", "#######", ".##.##.", ".#.#.#.")],
    ["px-schodek", "Schodek", piksele(1.2, "##..", "##..", "..##", "..##")],
    ["px-szachownica", "Szachownica", piksele(1.2, "#.#.", ".#.#", "#.#.", ".#.#")],
    ["px-kwadracik", "Kwadracik", piksele(1.2, "....", ".##.", ".##.", "....").map(c => przesun(c, 0, -.15))],
    ["px-dwa", "Dwa kwadraty", piksele(1.2, "##..", "##..", "..##", "..##").map(c => skaluj(c, .75))],
    ["px-rog", "Róg", piksele(1.2, "##..", "##..", "####", "####")],
    ["px-dwa-male", "Dwa piksele", piksele(1.2, "....", ".#..", "..#.", "....")],
    ["px-iks", "Iks pikselowy", piksele(1.2, "#.#", ".#.", "#.#")],
    ["px-iks-krata", "Krata ukośna", piksele(1.2, "#..#", ".##.", ".##.", "#..#")],
    ["px-wciecie", "Kwadrat z wcięciem", piksele(1.2, "###.", "####", "####", "####")],
    ["px-kropki", "Kropki pikselowe", piksele(1.2, "#.#.#", ".....", "#.#.#", ".....", "#.#.#")],
    ["px-iks-gesty", "Iks gęsty", piksele(1.25, "#...#", ".#.#.", "..#..", ".#.#.", "#...#")],
    ["px-szachownica-5", "Szachownica 5×5", piksele(1.25, "#.#.#", ".#.#.", "#.#.#", ".#.#.", "#.#.#")],
    ["px-kostka", "Kostka pikselowa", piksele(1.25, "#####", "#.#.#", "#####", "#.#.#", "#####")],
    ["px-ukos-3", "Ukos z pikseli", piksele(1.2, "#....", ".....", "..#..", ".....", "....#")],
    ["px-ukos-5", "Ukos pikselowy", piksele(1.2, "#....", ".#...", "..#..", "...#.", "....#")],
    ["px-ukos-2", "Ukos podwójny", piksele(1.2, "#.#..", ".#.#.", "..#.#", "...#.", "....#")],
    ["px-paski", "Paski pikselowe", piksele(1.25, "##..#", "#..##", "..##.", ".##..", "##..#")]
  ]]
];

/* grupy dla panelu: [{id, nazwa, ksztalty: [{id, nazwa}]}] */
export const GRUPY_KSZTALTOW = GRUPY_SUROWE.map(([id, nazwa, lista]) => ({id, nazwa, ksztalty: lista.map(([k, n]) => ({id: "b-" + k, nazwa: n}))}));
/* id → surowe kontury i opcje ({otwory}) */
export const KONTURY_BIBLIOTEKI = new Map(GRUPY_SUROWE.flatMap(([, , lista]) => lista.map(([k, , c, o]) => ["b-" + k, {kontury: c, otwory: !!(o && o.otwory)}])));
export const czyBiblioteczny = k => typeof k === "string" && KONTURY_BIBLIOTEKI.has(k);
