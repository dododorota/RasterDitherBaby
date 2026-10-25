/* Biblioteka kształtów punktu (jak biblioteka Dither Boya — rysunki własne,
   w tym samym duchu): grupy podstawowe, trójkąty, symbole, linie, spooky,
   piksel. Czysty moduł, bez DOM-u — liczy się też w workerze rastra.

   Kształt to lista konturów w kafelku [−1, 1] (y w dół), gdzie koło ma
   promień 1 — rysowany jest × r punktu, jak inne kształty. Pola NIE są
   wyrównywane do koła (inaczej niż NOWE_KSZTALTY): kształt wygląda w rastrze
   tak, jak na kafelku w panelu, a ton dobiera się pasmami i ich wielkością.
   Kierunki obiegu (otwory) poprawia siatki.js (`orientuj`) przy pierwszym
   użyciu. Identyfikator: „b-…" — trafia do S i presetów, więc raz nadanego
   nie zmieniać. */

const kolo = (cx, cy, r, n = 28) => Array.from({length: n}, (_, i) => { const f = i*2*Math.PI/n; return [cx + r*Math.cos(f), cy + r*Math.sin(f)]; });
const prost = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const wielo = (n, R, k0 = -Math.PI/2, cx = 0, cy = 0) => Array.from({length: n}, (_, i) => { const f = k0 + i*2*Math.PI/n; return [cx + R*Math.cos(f), cy + R*Math.sin(f)]; });
const gwiazda = (n, R, r, k0 = -Math.PI/2) => Array.from({length: 2*n}, (_, i) => { const f = k0 + i*Math.PI/n, q = i % 2 ? r : R; return [q*Math.cos(f), q*Math.sin(f)]; });
const odwr = c => [...c].reverse();
const obroc = (c, k) => c.map(([x, y]) => [x*Math.cos(k) - y*Math.sin(k), x*Math.sin(k) + y*Math.cos(k)]);
const przesun = (c, dx, dy) => c.map(([x, y]) => [x + dx, y + dy]);
const lustro = c => odwr(c.map(([x, y]) => [-x, y]));
/* prostokąt z zaokrąglonymi rogami */
function zaokr(x0, y0, x1, y1, rr, n = 6){
  const p = [];
  for(const [cx, cy, k] of [[x1 - rr, y0 + rr, -Math.PI/2], [x1 - rr, y1 - rr, 0], [x0 + rr, y1 - rr, Math.PI/2], [x0 + rr, y0 + rr, Math.PI]])
    for(let i=0; i<=n; i++){ const f = k + i*Math.PI/2/n; p.push([cx + rr*Math.cos(f), cy + rr*Math.sin(f)]); }
  return p;
}
/* gruba kreska od punktu do punktu (prostokąt) */
function kreska(x0, y0, x1, y1, g){
  const d = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0)/d*g/2, ny = (x1 - x0)/d*g/2;
  return [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]];
}
/* gruba łamana jako jeden kontur — normalne z sąsiadów, jak konturLinii() */
function lamana(pts, g){
  const L = [], P = [];
  for(let i=0; i<pts.length; i++){
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
    L.push([pts[i][0] - ty*g/2, pts[i][1] + tx*g/2]); P.push([pts[i][0] + ty*g/2, pts[i][1] - tx*g/2]);
  }
  return L.concat(P.reverse());
}
/* plus o ramionach szerokości g — jeden kontur (dwa nachodzące otwory
   w nonzero dałyby w części wspólnej z powrotem farbę) */
function plus(a, g){
  const b = g/2;
  return [[-b, -a], [b, -a], [b, -b], [a, -b], [a, b], [b, b], [b, a], [-b, a], [-b, b], [-a, b], [-a, -b], [-b, -b]];
}
/* bitmapa w tekście („#" = piksel) → prostokąty z sąsiednich pikseli wiersza,
   wyśrodkowane w kafelku; wszystkie w jednej ścieżce, więc bez szczelin */
function piksele(...wiersze){
  const h = wiersze.length, w = Math.max(...wiersze.map(r => r.length)), s = 1.9/Math.max(w, h), x0 = -w*s/2, y0 = -h*s/2, wyn = [];
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
const kropki = (poz, r) => poz.map(([x, y]) => kolo(x, y, r, 18));
const KOSTKA = {1: [[0, 0]], 2: [[-.58, -.58], [.58, .58]], 3: [[-.58, -.58], [0, 0], [.58, .58]], 4: [[-.58, -.58], [.58, -.58], [-.58, .58], [.58, .58]],
  5: [[-.58, -.58], [.58, -.58], [0, 0], [-.58, .58], [.58, .58]], 6: [[-.5, -.62], [.5, -.62], [-.5, 0], [.5, 0], [-.5, .62], [.5, .62]]};
/* n×n kropek promienia r, opcjonalnie promień zależny od położenia */
function siatkaKropek(n, r, f){
  const wyn = [], krok = 1.8/n;
  for(let j=0; j<n; j++) for(let i=0; i<n; i++){
    const x = -0.9 + krok*(i + 0.5), y = -0.9 + krok*(j + 0.5), q = f ? f(x, y, r) : r;
    if(q > 0.01) wyn.push(kolo(x, y, q, 14));
  }
  return wyn;
}
/* półksiężyc: duże koło minus przesunięte mniejsze (łuki z punktów przecięcia) */
function ksiezyc(){
  const R = 1, cx = 0.48, cy = -0.22, r = 0.86, d = Math.hypot(cx, cy), g = Math.atan2(cy, cx);
  const a = (R*R - r*r + d*d)/(2*d), dl = Math.acos(a/R), ep = Math.acos((d - a)/r), p = [];
  for(let i=0; i<=40; i++){ const f = g + dl + i*(2*Math.PI - 2*dl)/40; p.push([R*Math.cos(f), R*Math.sin(f)]); }
  const wew = [];
  for(let i=0; i<=24; i++){ const f = g + Math.PI - ep + i*2*ep/24; wew.push([cx + r*Math.cos(f), cy + r*Math.sin(f)]); }
  const kon = p[p.length - 1];
  if(Math.hypot(wew[0][0] - kon[0], wew[0][1] - kon[1]) > Math.hypot(wew[wew.length - 1][0] - kon[0], wew[wew.length - 1][1] - kon[1])) wew.reverse();
  return [p.concat(wew.slice(1, -1))];
}
/* serce (krzywa parametryczna), y w dół, wpisane w kafelek */
const serce = (s = 1, dy = 0) => Array.from({length: 48}, (_, i) => { const t = i*2*Math.PI/48;
  return [16*Math.sin(t)**3/17*s, (-(13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t)) - 5)/15*s + dy]; });
/* soczewka (oko): część wspólna dwóch kół */
function soczewka(R, d, n = 20){
  const xm = Math.sqrt(R*R - d*d), gora = [], dol = [];
  for(let i=0; i<=n; i++){ const x = -xm + 2*xm*i/n, h = Math.sqrt(R*R - x*x); gora.push([x, d - h]); dol.push([x, h - d]); }
  return gora.concat(dol.reverse().slice(1, -1));
}

const GRUPY_SUROWE = [
  ["podstawowe", "Podstawowe", [
    ["kolo", "Koło", [kolo(0, 0, 1)]],
    ["kwadrat", "Kwadrat", [prost(-.88, -.88, .88, .88)]],
    ["kwadrat-zaobl", "Kwadrat zaokrąglony", [zaokr(-.9, -.9, .9, .9, .38)]],
    ["romb", "Romb", [[[0, -1.1], [1.1, 0], [0, 1.1], [-1.1, 0]]]],
    ["szesciokat", "Sześciokąt", [wielo(6, 1.05, 0)]],
    ["osmiokat", "Ośmiokąt", [wielo(8, 1.02, Math.PI/8)]],
    ["pierscien", "Pierścień", [kolo(0, 0, 1), odwr(kolo(0, 0, .55))]],
    ["ramka", "Ramka", [prost(-.9, -.9, .9, .9), odwr(prost(-.5, -.5, .5, .5))]],
    ["kropka-mala", "Mała kropka", [kolo(0, 0, .42)]],
    ["kwadracik", "Mały kwadrat", [prost(-.36, -.36, .36, .36)]],
    ["kwadrat-sredni", "Średni kwadrat", [prost(-.62, -.62, .62, .62)]],
    ["elipsa-pozioma", "Elipsa pozioma", [kolo(0, 0, 1).map(([x, y]) => [x*1.1, y*.6])]],
    ["elipsa-pionowa", "Elipsa pionowa", [kolo(0, 0, 1).map(([x, y]) => [x*.6, y*1.1])]],
    ["polkole", "Półkole", [Array.from({length: 25}, (_, i) => { const f = Math.PI + i*Math.PI/24; return [Math.cos(f), .45 + Math.sin(f)]; })]],
    ...[1, 2, 3, 4, 5, 6].map(n => ["kostka-" + n, "Kostka " + n, kropki(KOSTKA[n], .26)]),
    ["siatka-3", "Siatka kropek 3×3", siatkaKropek(3, .22)],
    ["siatka-4", "Siatka kropek 4×4", siatkaKropek(4, .16)],
    ["siatka-6", "Siatka kropek 6×6", siatkaKropek(6, .1)],
    ["rozeta", "Rozeta kropek", siatkaKropek(5, .2, (x, y, r) => r*(1 - Math.hypot(x, y)/1.45))],
    ["gradient-kropek", "Gradient kropek", siatkaKropek(4, .2, (x, y, r) => r*(0.25 + 0.75*(x + .9)/1.8))],
    ["krzyz-kropek", "Krzyż z kropek", kropki([[0, 0], [0, -.65], [0, .65], [-.65, 0], [.65, 0]], .24)]
  ]],
  ["trojkaty", "Trójkąty", [
    ["trojkat-gora", "Trójkąt w górę", [[[0, -1], [1, .8], [-1, .8]]]],
    ["trojkat-dol", "Trójkąt w dół", [[[0, 1], [-1, -.8], [1, -.8]]]],
    ["trojkat-lewo", "Trójkąt w lewo", [[[-1, 0], [.8, -1], [.8, 1]]]],
    ["trojkat-prawo", "Trójkąt w prawo", [[[1, 0], [-.8, 1], [-.8, -1]]]],
    ...[0, 1, 2, 3].map(i => ["prostokatny-" + (i + 1), "Trójkąt prostokątny " + (i + 1), [obroc([[-.9, -.9], [.9, .9], [-.9, .9]], i*Math.PI/2)]]),
    ["waski", "Wąski trójkąt", [[[0, -1.1], [.45, 1], [-.45, 1]]]],
    ["klepsydra", "Klepsydra", [[[-.9, -1], [.9, -1], [0, 0]], [[0, 0], [.9, 1], [-.9, 1]]]],
    ["muszka", "Muszka", [[[-1, -.9], [0, 0], [-1, .9]], [[1, .9], [0, 0], [1, -.9]]]],
    ["strzalka", "Strzałka", [[[0, -1], [1, .15], [.42, .15], [.42, 1], [-.42, 1], [-.42, .15], [-1, .15]]]],
    ["paski-ukosne", "Paski ukośne", [kreska(-.95, -.15, -.15, -.95, .32), kreska(-.7, .7, .7, -.7, .32), kreska(.15, .95, .95, .15, .32)]],
    ["romb-w-kwadracie", "Romb w kwadracie", [prost(-.9, -.9, .9, .9), odwr([[0, -.75], [.75, 0], [0, .75], [-.75, 0]])]],
    ["trojkaty-4", "Cztery trójkąty", [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]].map(([x, y]) => przesun([[0, -.4], [.42, .32], [-.42, .32]], x, y))],
    ["play", "Odtwarzanie", [[[-.7, -.95], [.95, 0], [-.7, .95]]]],
    ["play-2", "Przewijanie", [przesun([[-.5, -.7], [.5, 0], [-.5, .7]], -.45, 0), przesun([[-.5, -.7], [.5, 0], [-.5, .7]], .45, 0)]],
    ["play-3", "Trzy trójkąty", [-.62, 0, .62].map(x => przesun([[-.34, -.55], [.34, 0], [-.34, .55]], x, 0))],
    ["szewrony", "Szewrony", [-.55, 0, .55].map(x => lamana([[x - .25, -.6], [x + .22, 0], [x - .25, .6]], .22))]
  ]],
  ["symbole", "Symbole", [
    ["gwiazda5", "Gwiazda", [gwiazda(5, 1.05, .42)]],
    ["gwiazda6", "Gwiazda sześcioramienna", [gwiazda(6, 1, .55)]],
    ["gwiazda4", "Gwiazda czteroramienna", [gwiazda(4, 1.1, .3)]],
    ["gwiazda8", "Gwiazda ośmioramienna", [gwiazda(8, 1.05, .5)]],
    ["gwiazda12", "Gwiazda dwunastoramienna", [gwiazda(12, 1.05, .72)]],
    ["iskra", "Iskra", [Array.from({length: 48}, (_, i) => { const t = i*2*Math.PI/48; return [1.08*Math.cos(t)**3, 1.08*Math.sin(t)**3]; })]],
    ["plus", "Plus", [plus(.95, .42)]],
    ["iks", "Iks", [obroc(plus(1, .4), Math.PI/4)]],
    ["kropla", "Kropla", [[[0, -1.1], ...Array.from({length: 25}, (_, i) => { const f = (-30 + i*10)*Math.PI/180; return [.7*Math.cos(f), .3 + .7*Math.sin(f)]; })]]],
    ["blyskawica", "Błyskawica", [[[.2, -1.1], [-.62, .15], [-.05, .15], [-.25, 1.1], [.62, -.2], [.06, -.2]]]],
    ["kwiat4", "Kwiat", [Array.from({length: 64}, (_, i) => { const t = i*2*Math.PI/64, R = .62 + .4*Math.cos(4*t); return [R*Math.cos(t), R*Math.sin(t)]; })]],
    ["oko", "Oko", [soczewka(1.35, .9), odwr(kolo(0, 0, .4, 20)), kolo(0, 0, .2, 14)]],
    ["trojnog", "Trójnóg", [0, 1, 2].map(i => { const f = -Math.PI/2 + i*2*Math.PI/3; return kreska(Math.cos(f), Math.sin(f), 0, 0, .34); })],
    ["slonce", "Słońce", [kolo(0, 0, .45), ...Array.from({length: 8}, (_, i) => { const f = i*Math.PI/4; return kreska(.62*Math.cos(f), .62*Math.sin(f), 1.02*Math.cos(f), 1.02*Math.sin(f), .17); })]],
    ["serce", "Serce", [serce(1.05)]],
    ["ksiezyc", "Księżyc", ksiezyc()],
    ["karo", "Karo", [[[0, -1.1], [.7, 0], [0, 1.1], [-.7, 0]]]],
    ["pik", "Pik", [serce(.95, .1).map(([x, y]) => [x, -y]), [[.3, 1], [-.3, 1], [0, .35]]]],
    ["trefl", "Trefl", [kolo(0, -.5, .42), kolo(-.45, .1, .42), kolo(.45, .1, .42), [[0, 0], [.28, 1], [-.28, 1]]]],
    ["krzyzyk-ostry", "Gwiazdka ostra", [gwiazda(4, 1.1, .16, 0), gwiazda(4, .6, .12, Math.PI/4)]]
  ]],
  ["linie", "Linie", [
    ["kreska-pozioma", "Kreska pozioma", [kreska(-1, 0, 1, 0, .42)]],
    ["kreska-pionowa", "Kreska pionowa", [kreska(0, -1, 0, 1, .42)]],
    ["kreska-ukos", "Kreska ukośna /", [kreska(-.85, .85, .85, -.85, .42)]],
    ["kreska-ukos-2", "Kreska ukośna \\", [kreska(-.85, -.85, .85, .85, .42)]],
    ["daszek", "Daszek", [lamana([[-.9, -.45], [0, .45], [.9, -.45]], .36)]],
    ["fala", "Fala", [lamana(Array.from({length: 25}, (_, i) => { const x = -1 + i/12; return [x, .4*Math.sin(x*Math.PI)]; }), .3)]],
    ["dwie-ukosne", "Dwie kreski ukośne", [kreska(-.95, .4, .4, -.95, .3), kreska(-.4, .95, .95, -.4, .3)]],
    ["trzy-ukosne", "Trzy kreski ukośne", [kreska(-.95, .1, .1, -.95, .22), kreska(-.7, .7, .7, -.7, .22), kreska(-.1, .95, .95, -.1, .22)]],
    ["kratka", "Kratka", [prost(-.95, -.48, .95, -.22), prost(-.95, .22, .95, .48), prost(-.48, -.95, -.22, .95), prost(.22, -.95, .48, .95)]],
    ["schody", "Schody", [[[-1, 1], [-1, .33], [-.33, .33], [-.33, -.33], [.33, -.33], [.33, -1], [1, -1], [1, 1]]]],
    ["schodki", "Schodki — linia", [lamana([[-1, .8], [-.4, .8], [-.4, .2], [.2, .2], [.2, -.4], [.8, -.4], [.8, -1]], .26)]],
    ["pasy-poziome", "Pasy poziome", [-.6, 0, .6].map(y => prost(-.95, y - .17, .95, y + .17))],
    ["pasy-pionowe", "Pasy pionowe", [-.6, 0, .6].map(x => prost(x - .17, -.95, x + .17, .95))],
    ...[[.12, .3, .12, .22, .3, .12], [.3, .12, .3, .12, .12, .3], [.2, .2, .1, .3, .1, .2]].map((sz, n) => {
      const wyn = []; let x = -.95;
      for(const s of sz){ wyn.push(prost(x, -.95, x + s, .95)); x += s + .1; }
      return ["kod-" + (n + 1), "Kod kreskowy " + (n + 1), wyn.map(c => przesun(c, (.95 - x + .1)/2, 0))];
    }),
    ["kreskowanie", "Kreskowanie", [-1.2, -.4, .4, 1.2].map(c => { const a = Math.max(-.9, c - .9), b = Math.min(.9, c + .9); return kreska(a, c - a, b, c - b, .14); })]
  ]],
  ["spooky", "Spooky", [
    ["nietoperz", "Nietoperz", [(() => { const p = [[0, -.22], [.1, -.42], [.16, -.18], [.42, -.3], [1, -.45], [.86, -.12], [.72, .16], [.56, .02], [.42, .28], [.26, .1], [.12, .38], [0, .18]];
      return p.concat(lustro(p).slice(1, -1)); })()]],
    /* kontury nachodzące na siebie zaczynają się poza sąsiednim — orientuj()
       po pierwszym punkcie rozpoznaje otwory */
    ["czaszka", "Czaszka", [kolo(0, -.2, .82), [[.46, .98], [-.46, .98], [-.46, .3], [.46, .3]],
      odwr(kolo(-.33, -.15, .23, 16)), odwr(kolo(.33, -.15, .23, 16)), odwr([[0, .02], [.12, .24], [-.12, .24]]),   /* cały nad szczęką (y < .3) — inaczej leżałby w dwóch konturach i nie byłby otworem */
      ...[-.27, 0, .27].map(x => odwr(prost(x - .07, .62, x + .07, .84)))]],
    ["nagrobek", "Nagrobek", [[...Array.from({length: 25}, (_, i) => { const f = Math.PI + i*Math.PI/24; return [.72*Math.cos(f), -.25 + .72*Math.sin(f)]; }), [.72, 1], [-.72, 1]],
      odwr(przesun(plus(.36, .14), 0, -.1))]],
    ["duch", "Duch", [[...Array.from({length: 25}, (_, i) => { const f = Math.PI + i*Math.PI/24; return [.78*Math.cos(f), -.2 + .78*Math.sin(f)]; }),
      [.78, 1], [.52, .78], [.26, 1], [0, .78], [-.26, 1], [-.52, .78], [-.78, 1]],
      odwr(kolo(-.28, -.18, .14, 14).map(([x, y]) => [x, y*1.3 + .05])), odwr(kolo(.28, -.18, .14, 14).map(([x, y]) => [x, y*1.3 + .05]))]],
    ["krysztal", "Kryształ", [[[0, -1.1], [.52, -.3], [.52, .4], [0, 1.1], [-.52, .4], [-.52, -.3]]]],
    ["swieca", "Świeca", [prost(-.32, -.1, .32, 1), [[0, -1.05], ...Array.from({length: 13}, (_, i) => { const f = (-20 + i*18.3)*Math.PI/180; return [.2*Math.cos(f), -.48 + .2*Math.sin(f)]; })]]],
    ["kot", "Kot", [kolo(0, .15, .78), [[-.7, -.95], [-.2, -.55], [-.75, -.05]], [[.7, -.95], [.75, -.05], [.2, -.55]],
      odwr(kolo(-.3, .05, .15, 14)), odwr(kolo(.3, .05, .15, 14)), odwr([[0, .3], [.1, .42], [-.1, .42]])]]
  ]],
  ["piksel", "Piksel", [
    ["px-serce", "Serce", piksele(".##..##.", "########", "########", "########", ".######.", "..####..", "...##...")],
    ["px-czaszka", "Czaszka", piksele(".######.", "########", "#..##..#", "#..##..#", "########", ".##..##.", ".######.", ".#.##.#.")],
    ["px-szachownica-2", "Szachownica 2×2", piksele("#.", ".#")],
    ["px-szachownica-4", "Szachownica 4×4", piksele("#.#.", ".#.#", "#.#.", ".#.#")],
    ["px-szachownica-8", "Szachownica 8×8", piksele("#.#.#.#.", ".#.#.#.#", "#.#.#.#.", ".#.#.#.#", "#.#.#.#.", ".#.#.#.#", "#.#.#.#.", ".#.#.#.#")],
    ["px-ramka", "Ramka", piksele("#####", "#...#", "#...#", "#...#", "#####")],
    ["px-duszek", "Kosmita", piksele("..#.....#..", "...#...#...", "..#######..", ".##.###.##.", "###########", "#.#######.#", "#.#.....#.#", "...##.##...")],
    ["px-plus", "Plus", piksele("..#..", "..#..", "#####", "..#..", "..#..")],
    ["px-buzka", "Buźka", piksele("..####..", ".######.", "##.##.##", "########", "#.####.#", "##....##", ".######.", "..####..")],
    ["px-strzalka", "Strzałka", piksele("...#...", "..###..", ".#####.", "#######", "..###..", "..###..", "..###..")],
    ["px-schodki", "Schodki", piksele("#...", "##..", "###.", "####")],
    ["px-ukos", "Ukos", piksele("#...", ".#..", "..#.", "...#")],
    ["px-kropki", "Kropki 25%", piksele("#.#.", "....", "#.#.", "....")],
    ["px-rog", "Róg", piksele("#...", "#...", "#...", "####")],
    ["px-krata", "Krata", piksele(".#.#.", "#####", ".#.#.", "#####", ".#.#.")],
    ["px-grzybek", "Grzybek", piksele("..####..", ".#.##.#.", "########", "#.####.#", "..#..#..", "..#..#..", "..####..")],
    ["px-kot", "Kot", piksele("#......#", "##....##", "########", "#.####.#", "########", "##.##.##", ".######.", "..####..")]
  ]]
];

/* grupy dla panelu: [{id, nazwa, ksztalty: [{id, nazwa}]}] */
export const GRUPY_KSZTALTOW = GRUPY_SUROWE.map(([id, nazwa, lista]) => ({id, nazwa, ksztalty: lista.map(([k, n]) => ({id: "b-" + k, nazwa: n}))}));
/* id → surowe kontury (bez poprawionych obiegów) */
export const KONTURY_BIBLIOTEKI = new Map(GRUPY_SUROWE.flatMap(([, , lista]) => lista.map(([k, , c]) => ["b-" + k, c])));
export const czyBiblioteczny = k => typeof k === "string" && KONTURY_BIBLIOTEKI.has(k);
