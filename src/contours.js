/* Obrys konturowy: piksele jednego koloru → ścieżka SVG. Czyste funkcje, bez DOM-u.

   Dwa warianty:
   - dokładny: kontur po krawędziach pikseli, same odcinki poziome i pionowe.
     Pokrywa dokładnie te piksele co prostokąty z mergeRects(), tylko jako jedna
     złożona ścieżka zamiast tysięcy obiektów;
   - wygładzony: schodki zamienione na skosy, narożniki zaokrąglone. To już
     interpretacja, a nie kopia pikseli — ale taka, która nie zmienia tonu obrazu
     (patrz sciezkaGladka()). */

const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];   // 0 →, 1 ↓, 2 ←, 3 ↑ (ekran, y w dół)
/* Zapis zwarty: współrzędne względne, dwa miejsca po przecinku, bez zera przed
   kropką i bez spacji przed minusem. Wygładzone kontury gęstego ditheringu
   w zapisie bezwzględnym ważyły 6× więcej niż dokładne. Precyzji nie obcinamy do
   jednego miejsca — przy kropce wielkości piksela 0,1 to już 10% kształtu.
   Delty liczymy z zaokrąglonych współrzędnych bezwzględnych, więc błąd
   zaokrąglenia nie narasta wzdłuż ścieżki. */
const r2 = v => Math.round(v*100)/100;
function liczba(v){
  const s = String(r2(v) || 0);
  return s.startsWith("0.") ? s.slice(1) : s.startsWith("-0.") ? "-" + s.slice(2) : s;
}
function liczby(...v){
  let s = "";
  for(const x of v){ const t = liczba(x); s += (s && t[0] !== "-" ? " " : "") + t; }
  return s;
}

/* Śledzenie konturów. Każdy piksel maski daje cztery skierowane krawędzie, zgodnie
   z ruchem wskazówek zegara, więc obszar jest zawsze po prawej; krawędzie wewnętrzne
   się znoszą i zostaje sam brzeg. Na wierzchołku siodłowym (dwa piksele stykają się
   tylko rogiem) skręcamy w prawo — obszar jest 4-spójny, więc szachownica
   z ditheringu daje osobne kropki, a nie jedną sieć. Zwraca pętle jako punkt
   startowy i kierunki kolejnych krawędzi jednostkowych. */
export function sledzKontury(maska, w, h){
  const W1 = w + 1, out = new Uint8Array(W1*(h + 1));
  const jest = (x, y) => x >= 0 && y >= 0 && x < w && y < h && maska[y*w + x];
  for(let y=0; y<h; y++) for(let x=0; x<w; x++){
    if(!maska[y*w + x]) continue;
    if(!jest(x, y-1)) out[y*W1 + x]         |= 1;
    if(!jest(x+1, y)) out[y*W1 + x + 1]     |= 2;
    if(!jest(x, y+1)) out[(y+1)*W1 + x + 1] |= 4;
    if(!jest(x-1, y)) out[(y+1)*W1 + x]     |= 8;
  }
  const petle = [];
  let kier = new Uint8Array(1024);
  for(let v=0; v<out.length; v++){
    while(out[v]){
      const d0 = 31 - Math.clz32(out[v] & -out[v]);
      let cur = v, d = d0, n = 0;
      out[v] &= ~(1 << d0);
      for(;;){
        if(n === kier.length){ const k2 = new Uint8Array(n*2); k2.set(kier); kier = k2; }
        kier[n++] = d;
        cur += DX[d] + DY[d]*W1;
        let o = out[cur];
        if(cur === v) o |= 1 << d0;                 // krawędź startowa liczy się przy wyborze
        const prawo = (d + 1) & 3, lewo = (d + 3) & 3;
        const nd = o & (1 << prawo) ? prawo : o & (1 << d) ? d : o & (1 << lewo) ? lewo : -1;
        if(nd < 0 || (cur === v && nd === d0)) break;
        out[cur] &= ~(1 << nd);
        d = nd;
      }
      petle.push({x: v % W1, y: (v / W1) | 0, kier: kier.slice(0, n)});
    }
  }
  return petle;
}

/* Wariant dokładny: tylko wierzchołki, w których zmienia się kierunek, jako H/V. */
export function sciezkaDokladna(p){
  let s = "M" + liczby(p.x, p.y);
  const k = p.kier;
  for(let i=0; i<k.length; ){
    const d = k[i]; let dl = 0;
    while(i < k.length && k[i] === d){ dl++; i++; }
    s += ((d & 1) ? "v" : "h") + ((d === 2 || d === 3) ? -dl : dl);
  }
  return s + "z";
}

/* Douglas–Peucker dla wielokąta zamkniętego: dzielimy go na dwie połowy między
   punktem 0 a punktem od niego najdalszym i upraszczamy każdą osobno. */
function uprosc(xs, ys, eps){
  const n = xs.length;
  let far = 0, fd = -1;
  for(let i=1; i<n; i++){ const d = (xs[i]-xs[0])**2 + (ys[i]-ys[0])**2; if(d > fd){ fd = d; far = i; } }
  const keep = new Uint8Array(n);
  keep[0] = keep[far] = 1;
  const e2 = eps*eps, stos = [[0, far], [far, n]];
  while(stos.length){
    const [a, b] = stos.pop();
    if(b - a < 2) continue;
    const ax = xs[a], ay = ys[a], bx = xs[b % n], by = ys[b % n];
    const dx = bx - ax, dy = by - ay, L2 = dx*dx + dy*dy;
    let mi = -1, md = -1;
    for(let i=a+1; i<b; i++){
      let d;
      if(L2 === 0) d = (xs[i]-ax)**2 + (ys[i]-ay)**2;
      else { const c = (xs[i]-ax)*dy - (ys[i]-ay)*dx; d = c*c / L2; }
      if(d > md){ md = d; mi = i; }
    }
    if(md > e2){ keep[mi] = 1; stos.push([a, mi], [mi, b]); }
  }
  const ox = [], oy = [];
  for(let i=0; i<n; i++) if(keep[i]){ ox.push(xs[i]); oy.push(ys[i]); }
  return [ox, oy];
}

/* Wariant wygładzony, dobrany tak, żeby nie zmieniał tonu.

   Do upraszczania bierzemy i narożniki pikseli, i środki krawędzi. Na schodkach
   narożniki odstają od prostej o ~0,35 px i znikają, a zostaje linia przez środki
   stopni — dokładnie pośrodku schodków, więc pole się nie zmienia. Na bokach
   pojedynczego piksela środki leżą na prostej i znikają, więc zostaje kwadrat,
   a nie romb o połowie pola. Potem każdy wierzchołek zaokrąglamy krzywą
   kwadratową z punktem kontrolnym w nim samym, ale tylko na odcinku
   min(r, połowa boku) — duży blok zachowuje proste boki i lekko zaokrąglone rogi.

   Zaokrąglanie zabiera pole wypukłym rogom i dodaje wklęsłym: sama kropka
   traciła 17% pola, więc rzadki dithering robił się wyraźnie jaśniejszy, a siatka
   cienkich linii grubsza (dziury się kurczyły). Dlatego małe pętle — kropki,
   drobne grupy, małe dziury — skalujemy względem środka tak, żeby miały
   dokładnie pole pikseli, z których powstały. Dużych nie ruszamy: tam błąd
   jest procentowo nieistotny, a skalowanie przesunęłoby dalekie krawędzie. */
const MALA_PETLA = 16;     // bok obwiedni w pikselach, do którego wyrównujemy pole

/* pole ze znakiem ścieżki złożonej z odcinków i krzywych kwadratowych,
   liczone analitycznie: dla krzywej P0→C→P2 całka ∮x dy − y dx wynosi
   ⅔(P0×C) + ⅔(C×P2) + ⅓(P0×P2) */
const krzyz = (ax, ay, bx, by) => ax*by - ay*bx;
function poleSciezki(a, v, b){
  let s = 0;
  const m = v.length;
  for(let i=0; i<m; i++){
    const [ax, ay] = a[i], [cx, cy] = v[i], [bx, by] = b[i];
    s += (2*krzyz(ax, ay, cx, cy) + 2*krzyz(cx, cy, bx, by) + krzyz(ax, ay, bx, by)) / 3;
    const [nx, ny] = a[(i + 1) % m];
    s += krzyz(bx, by, nx, ny);
  }
  return s/2;
}

export function sciezkaGladka(p, wygl){
  const k = p.kier, n = k.length;
  const eps = wygl*0.25, r = 0.5 + eps;
  const xs = new Float64Array(n*2), ys = new Float64Array(n*2);
  let x = p.x, y = p.y, poleDokl = 0, minx = x, maxx = x, miny = y, maxy = y, sx = 0, sy = 0;
  for(let i=0; i<n; i++){
    const d = k[i];
    xs[2*i] = x; ys[2*i] = y;
    xs[2*i+1] = x + DX[d]*0.5; ys[2*i+1] = y + DY[d]*0.5;
    const nx = x + DX[d], ny = y + DY[d];
    const c = krzyz(x, y, nx, ny);
    poleDokl += c; sx += (x + nx)*c; sy += (y + ny)*c;
    x = nx; y = ny;
    if(x < minx) minx = x; if(x > maxx) maxx = x; if(y < miny) miny = y; if(y > maxy) maxy = y;
  }
  poleDokl /= 2;
  let [vx, vy] = uprosc(xs, ys, eps);
  if(vx.length < 4){                               // za mała pętla — zostają narożniki
    vx = []; vy = [];
    for(let i=0; i<n; i++) if(i === 0 || k[i] !== k[i-1]){ vx.push(xs[2*i]); vy.push(ys[2*i]); }
    if(vx.length < 3) return sciezkaDokladna(p);
  }
  const m = vx.length;
  const pkt = (i, j) => {                          // punkt na odcinku i→j w odległości ≤ r od i
    const dx = vx[j]-vx[i], dy = vy[j]-vy[i], L = Math.hypot(dx, dy);
    const t = L ? Math.min(r, L/2)/L : 0;
    return [vx[i] + dx*t, vy[i] + dy*t];
  };
  let A = [], V = [], B = [];
  for(let i=0; i<m; i++){ A.push(pkt(i, (i + m - 1) % m)); V.push([vx[i], vy[i]]); B.push(pkt(i, (i + 1) % m)); }

  /* wyrównanie pola małych pętli, względem środka ciężkości pikseli */
  if(maxx - minx <= MALA_PETLA && maxy - miny <= MALA_PETLA && poleDokl !== 0){
    const poleGl = poleSciezki(A, V, B);
    if(poleGl !== 0 && poleGl*poleDokl > 0){
      const f = Math.min(1.3, Math.max(0.77, Math.sqrt(poleDokl/poleGl)));
      const ox = sx/(6*poleDokl), oy = sy/(6*poleDokl);
      const sk = q => [ox + (q[0]-ox)*f, oy + (q[1]-oy)*f];
      A = A.map(sk); V = V.map(sk); B = B.map(sk);
    }
  }
  let px = r2(A[0][0]), py = r2(A[0][1]);
  let s = "M" + liczby(px, py);
  for(let i=0; i<m; i++){
    const ax = r2(A[i][0]), ay = r2(A[i][1]), vx2 = r2(V[i][0]), vy2 = r2(V[i][1]), bx = r2(B[i][0]), by = r2(B[i][1]);
    if(i && (ax !== px || ay !== py)) s += "l" + liczby(ax - px, ay - py);
    s += "q" + liczby(vx2 - ax, vy2 - ay, bx - ax, by - ay);
    px = bx; py = by;
  }
  return s + "z";
}
