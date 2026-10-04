/* Geometria rastra: gdzie stoją punkty (albo jak biegną linie) jednej farby.
   Czysty moduł, bez DOM-u — testowany w Node (testy/siatki.mjs). Płótno
   (halftone.js) i SVG (vector.js) tylko rysują to, co stąd wyjdzie, więc
   wektor jest zawsze tym samym obrazem co podgląd.

   Jak w collectScreen(): cała geometria liczy się w pikselach podglądu,
   a przez z mnożona jest dopiero gotowa — zapis w skali to dokładne
   powiększenie podglądu, dla każdej siatki i dla linii.

   Siatki: kwadratowa (dawna — liczona tym samym kodem co collectScreen,
   więc stare obrazy się nie zmieniają), heksagonalna, koncentryczne okręgi,
   spirala, promienie i „wzdłuż kształtu” (linie wygięte po obrazie). Kształt „pasy"
   zamienia punkty w ciągłe linie wzdłuż siatki: proste na kwadratowej
   i heksagonalnej, obręcze na okręgach, jedna długa linia na spirali — grubsze w ciemnych miejscach i wygięte przez obraz
   (odkształcenie), jak grafika rytowana. */
import { S } from "./state.js";
import { skrot } from "./fx.js";
import { kodQR } from "./qr.js";

/* pokrycie farby w punkcie podglądu — najbliższa próbka, jak w collectScreen().
   Przezroczysty piksel (PNG z alfą, kompozycja z przezroczystym tłem) to
   pusty papier, nie czerń: pokrycie mnożone przez krycie piksela. Dla
   obrazów nieprzezroczystych alfa = 255 — wynik co do bitu jak wcześniej. */
export function pokrycie(smp, cov, px, py){
  const sx = Math.min(smp.sw-1, Math.max(0, Math.round(px/smp.step)));
  const sy = Math.min(smp.sh-1, Math.max(0, Math.round(py/smp.step)));
  const i = (sy*smp.sw + sx)*4, a = smp.d[i+3];
  const k = cov(smp.d[i], smp.d[i+1], smp.d[i+2]);
  return a === 255 || a === undefined || S.pustePrzezr === false ? k : k*a/255;
}

/* kolor obrazu w punkcie podglądu (ta sama próbka co pokrycie) */
export function probkaRGB(smp, px, py){
  const sx = Math.min(smp.sw-1, Math.max(0, Math.round(px/smp.step)));
  const sy = Math.min(smp.sh-1, Math.max(0, Math.round(py/smp.step)));
  const i = (sy*smp.sw + sx)*4;
  return [smp.d[i], smp.d[i+1], smp.d[i+2]];
}

/* ustawienia farby: własne (risograf) albo wspólne z panelu */
export function ustawieniaFarby(ink){
  return {
    cell: ink.cell || S.cell, dot: ink.dot || S.dot, ksztalt: ink.ksztalt || S.shape,
    siatka: ink.siatka || S.siatka || "kwadrat", obrot: ink.obrot || 0,
    fala: (S.fala || 0)/100, sx: (S.srodekX || 0)/100, sy: (S.srodekY || 0)/100,
    glad: (S.gladkosc || 0)/100, mn: (S.liniaMin || 0)/100, mx: (S.liniaMax ?? 100)/100,
    ch: (S.chmury || 0)/100, nr: (S.nierowne || 0)/100, dr: (S.drganie || 0)/100, post: (S.postrzep || 0)/100,
    odk: (S.odksztalcenie || 0)/100, odkSkala: S.odksztSkala || 60, odkPrzes: (S.odksztPrzes || 0)/100,
    rozc: (S.rozciag ?? 100)/100, pochyl: (S.pochyl || 0)*Math.PI/180, minPunkt: (S.minPunkt || 0)/100,
    zlew: (S.zlewanie || 0)/100, scal: (S.scalanie || 0)/100,
    ziarno: ziarnoFarby(ink)
  };
}

/* ---------- nierówny raster ----------
   Jak zeskanowany odbity raster: krycie płynie chmurami niezależnymi od
   obrazu (nierówno nałożona farba), punkty mają różne wielkości, lekko
   drgają z miejsca i mają postrzępione brzegi. Wszystko w geometrii, więc
   trafia też do SVG; losowość ze skrótu — położenia (chmury) albo numeru
   punktu (wielkość, drganie, brzeg), które nie zależą od z. Każda farba ma
   własne ziarno, żeby farby riso nie plamiły się w tych samych miejscach. */
function ziarnoFarby(ink){
  let h = 7;
  for(const c of String(ink.name || "") + String(ink.color || "")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 100003;
}
/* szum gradientowy (Perlin): w węzłach losowe kierunki, nie wartości — szum
   wartości zdradzał kratkę (plamy w krzyżyki i kwadraty). Wynik ~0–1. */
function szum(x, y, skala, ziarno){
  const gx = x/skala + 500, gy = y/skala + 500, i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
  const g = (a, b, dx, dy) => { const k = skrot(a, b, ziarno)*6.2832; return Math.cos(k)*dx + Math.sin(k)*dy; };
  const f = t => t*t*t*(t*(t*6 - 15) + 10);
  const sx = f(fx), sy = f(fy);
  const n0 = g(i, j, fx, fy), n1 = g(i + 1, j, fx - 1, fy), n2 = g(i, j + 1, fx, fy - 1), n3 = g(i + 1, j + 1, fx - 1, fy - 1);
  const a = n0 + (n1 - n0)*sx, b = n2 + (n3 - n2)*sx;
  return 0.5 + (a + (b - a)*sy)*0.9;
}
/* ---------- ton → pokrycie ----------
   Fala tonu (jak „Wave" w Halftone Makerze): pokrycie zawijane cyklicznie —
   piła powtarza przejście jasne→ciemne N razy, trójkąt odbija je tam
   i z powrotem; przesunięcie przesuwa fazę. Z gładkiego gradientu robią się
   pasy, ze zdjęcia — koncentryczne obwódki jak warstwice. Potem krzywa
   wielkości: pokrycie do potęgi (powyżej 1 — punkty rosną później, ciemne
   tony wyraźniejsze; poniżej — szybciej). Przy wartościach neutralnych farba
   zostaje nietknięta, więc stare obrazy liczą się co do bitu tak samo. */
function przemianaTonu(ink){
  const n = S.tonPowt || 1, przes = (S.tonPrzes || 0)/100, trojkat = S.tonRodzaj === "trojkat", g = (S.odpowiedz ?? 100)/100;
  const fala = n !== 1 || przes !== 0;
  if(!fala && g === 1) return ink;
  const cov0 = ink.cov;
  const frac = v => v - Math.floor(v);
  const cov = (r, gg, b) => {
    let k = cov0(r, gg, b);
    if(fala){
      const t = Math.min(1, Math.max(0, k))*n + przes;
      k = trojkat ? 1 - Math.abs(1 - 2*frac(t/2)) : (t >= n + przes && !przes ? 1 : frac(t));
    }
    return g === 1 ? k : Math.pow(Math.max(0, k), g);
  };
  return {...ink, cov};
}

/* ---------- odkształcenie siatki ----------
   Płynne pole przesunięć z szumu gradientowego (jak „Displacement" w Halftone
   Makerze): kierunek przesunięcia to kąt z szumu, więc punkty płyną wirami,
   a nie drgają każdy osobno. Siła w komórkach (do 2), skala — wielkość wirów
   w pikselach podglądu, przesunięcie — przesuwa pole (do animacji). */
export function przesuniecie(px, py, u){
  const s = u.odkSkala, o = u.odkPrzes*s*7;
  const kat = szum(px + o, py - o*0.6, s, u.ziarno + 17)*4*Math.PI;
  const sila = u.odk*2*u.cell*(0.5 + szum(px - o, py + o, s*1.7, u.ziarno + 23));
  return [px + Math.cos(kat)*sila, py + Math.sin(kat)*sila];
}

/* mnożnik krycia z chmur: dwie skale, większa ~7 komórek */
const chmura = (x, y, u) => {
  const c = szum(x, y, Math.max(24, u.cell*8), u.ziarno)*0.6 + szum(x, y, Math.max(10, u.cell*3), u.ziarno + 1)*0.28 + szum(x, y, Math.max(4, u.cell*1.2), u.ziarno + 2)*0.12;
  return Math.max(0, 1 + u.ch*2.2*(c - 0.5));
};

/* Zwraca {kropki: [[x, y, r, kąt], …], cell} albo {linie: [[[x, y, półgrubość], …], …], cell},
   wszystko już pomnożone przez z. */
export function geometria(smp, W, H, ink, z){
  z = z || 1;
  ink = przemianaTonu(ink);
  const u = ustawieniaFarby(ink);
  let wyn = u.ksztalt === "pasy" ? linie(smp, W, H, ink, u) : kropki(smp, W, H, ink, u);
  /* zlewanie (metaballe): punkty → płynne plamy; kolorowe punkty zostają punktami */
  if(u.zlew && wyn.kropki && !ink.barwa) wyn = {plamy: metaballe(wyn.kropki, W, H, u)};
  /* pasowanie: obrót całej płyty wokół środka kadru (obraz na płycie obraca
     się razem z rastrem — pokrycie liczone przed obrotem), potem skala z */
  const ob = u.obrot*Math.PI/180, co = Math.cos(ob), so = Math.sin(ob), cx = W/2, cy = H/2;
  const t = (x, y) => ob ? [(cx + (x - cx)*co - (y - cy)*so)*z, (cy + (x - cx)*so + (y - cy)*co)*z] : [x*z, y*z];
  if(wyn.kropki){
    /* „obracaj kształt z siatką" wyłączone: kształt stoi prosto (logo, litery), obraca go tylko płyta */
    const zSiatka = S.obrotZSiatka !== false;
    wyn.kropki = wyn.kropki.map(([x, y, r, k, ...id]) => { const [a, b] = t(x, y); return [a, b, r*z, (zSiatka ? k : 0) + ob, ...id]; });
    /* postrzępione brzegi tylko dla okrągłych punktów — reszta kształtów ma własny obrys */
    if(u.post && u.ksztalt === "circle") wyn.postrzep = u.post;
  }
  else if(wyn.plamy) wyn.plamy = wyn.plamy.map(k => k.map(([x, y]) => t(x, y)));
  else wyn.linie = wyn.linie.map(l => l.map(([x, y, hw, ...barwa]) => { const [a, b] = t(x, y); return [a, b, hw*z, ...barwa]; }));
  /* kwadraty kodu QR */
  if(wyn.dodatki) wyn.dodatki = wyn.dodatki.map(k => k.map(([x, y]) => t(x, y)));
  wyn.cell = u.cell*z;
  return wyn;
}

function kropki(smp, W, H, ink, u){
  const out = [], cell = u.cell, maxR = 0.564*cell*u.dot, a = ink.ang*Math.PI/180, ca = Math.cos(a), sa = Math.sin(a);
  const off = ink.off || [0, 0];
  /* punkt stipplingu: ton jest w gęstości punktów, więc rozmiar stały
     (nierówność, drganie i postrzępienie działają jak przy siatce) */
  const rStaly = 0.564*cell*u.dot*0.85;
  const dodajStaly = (px, py, kat) => {
    if(u.odk) [px, py] = przesuniecie(px, py, u);
    if(px < -cell || py < -cell || px > W + cell || py > H + cell) return;
    let r = rStaly;
    const barwa = ink.barwa ? ink.barwa(...probkaRGB(smp, px, py)) : null;
    if(!(u.nr || u.dr || u.post)){ out.push(barwa ? [px, py, r, kat, -1, barwa] : [px, py, r, kat]); return; }
    const id = out.length, z0 = u.ziarno*3;
    if(u.nr) r *= Math.max(0.15, 1 + u.nr*(0.9*(skrot(id, 1, z0) - 0.5) + (skrot(id, 2, z0) > 0.975 ? 0.7 : 0)));
    if(u.dr){ px += u.dr*0.3*cell*(skrot(id, 3, z0) - 0.5)*2; py += u.dr*0.3*cell*(skrot(id, 4, z0) - 0.5)*2; }
    out.push(barwa ? [px, py, r, kat, id, barwa] : [px, py, r, kat, id]);
  };
  const dodaj = (px, py, kat, s) => {
    if(u.odk) [px, py] = przesuniecie(px, py, u);
    if(px < -cell || py < -cell || px > W + cell || py > H + cell) return -2;      /* poza kadrem */
    let k = pokrycie(smp, ink.cov, px, py);
    if(u.ch) k *= chmura(px, py, u);
    if(k <= 0.004) return -1;
    let r = maxR*Math.sqrt(Math.min(1.35, k))*(s === undefined ? 1 : s);
    /* najmniejszy punkt: rozmiar zaczyna się od części największego */
    if(u.minPunkt) r = u.minPunkt*maxR*(s === undefined ? 1 : s) + (1 - u.minPunkt)*r;
    /* farba „kolorowa" (kolory z obrazu, mapa gradientu): kolor punktu
       z próbki w jego miejscu, szóstym elementem (piąty — numer punktu) */
    const barwa = ink.barwa ? ink.barwa(...probkaRGB(smp, px, py)) : null;
    if(!(u.nr || u.dr || u.post)){ out.push(barwa ? [px, py, r, kat, -1, barwa] : [px, py, r, kat]); return out.length - 1; }
    /* numer punktu: kolejność liczenia nie zależy od z, więc zapis w skali
       dostaje te same wielkości, drgania i brzegi */
    const id = out.length, z0 = u.ziarno*3;
    if(u.nr) r *= Math.max(0.15, 1 + u.nr*(0.9*(skrot(id, 1, z0) - 0.5) + (skrot(id, 2, z0) > 0.975 ? 0.7 : 0)));
    if(u.dr){ px += u.dr*0.3*cell*(skrot(id, 3, z0) - 0.5)*2; py += u.dr*0.3*cell*(skrot(id, 4, z0) - 0.5)*2; }
    out.push(barwa ? [px, py, r, kat, id, barwa] : [px, py, r, kat, id]);
    return out.length - 1;
  };
  /* rozciągnięcie (wzdłuż kierunku siatki) i pochylenie — przekształcenie
     punktu sieci przed obrotem; zakres pętli większy o tyle, o ile sieć się
     ściska. Przy wartościach neutralnych — zwykła gałąź, co do bitu jak dawniej. */
  const deform = (u.siatka === "kwadrat" || u.siatka === "heks") && (u.rozc !== 1 || u.pochyl !== 0);
  if(deform){
    const tg = Math.tan(u.pochyl), heks = u.siatka === "heks", h = heks ? cell*Math.sqrt(3)/2 : cell;
    const R = Math.ceil(((W + H)/cell*(heks ? 0.7 : 0.5) + 3 + (Math.abs(off[0]) + Math.abs(off[1]))/cell)*(1 + Math.abs(tg))/Math.min(1, u.rozc)) + 1;
    for(let v=-R; v<=R; v++) for(let q=-R; q<=R; q++){
      const ly = v*h, lx = ((heks ? q*cell + v*cell/2 : q*cell) + ly*tg)*u.rozc;
      dodaj(lx*ca - ly*sa + W/2 + off[0], lx*sa + ly*ca + H/2 + off[1], a);
    }
  } else if(u.siatka === "qr"){
    const d = siatkaQR(smp, W, H, ink, u, out);
    if(d) return {kropki: out, dodatki: d};
  } else if(u.siatka === "stipple"){
    /* stippling: punkty jednej wielkości, gęstość z tonu (stipple()) */
    for(const [px, py] of stipple(smp, W, H, ink, u)) dodajStaly(px + off[0], py + off[1], a);
  } else if(u.siatka === "trojkatna"){
    /* Siatka trójkątna: punkty w środkach trójkątów, na przemian ostrzem
       w górę i w dół (kąt różni się o 180°) — trójkątny kształt składa się
       w pełną mozaikę. Bok dobrany tak, żeby na punkt przypadało pole
       komórki (cell²), jak w siatce kwadratowej. */
    const L = cell*Math.sqrt(4/Math.sqrt(3)), h = L*Math.sqrt(3)/2;
    const R = Math.ceil((W + H)/L*0.7 + 3 + (Math.abs(off[0]) + Math.abs(off[1]))/L);
    for(let v=-R; v<=R; v++) for(let q=-R; q<=R; q++){
      const bx = q*L + v*L/2, by = v*h;
      for(const [dx, dy, obr] of [[L/2, h/3, Math.PI], [L, 2*h/3, 0]]){
        const lx = bx + dx, ly = by + dy;
        dodaj(lx*ca - ly*sa + W/2 + off[0], lx*sa + ly*ca + H/2 + off[1], a + obr);
      }
    }
  } else if(u.siatka === "heks"){
    /* wektory siatki (cell, 0) i (cell/2, cell·√3/2), obrócone o kąt farby */
    const R = Math.ceil((W + H)/cell*0.7 + 3 + (Math.abs(off[0]) + Math.abs(off[1]))/cell);
    const h = cell*Math.sqrt(3)/2;
    for(let v=-R; v<=R; v++) for(let q=-R; q<=R; q++){
      const lx = q*cell + v*cell/2, ly = v*h;
      dodaj(lx*ca - ly*sa + W/2 + off[0], lx*sa + ly*ca + H/2 + off[1], a);
    }
  } else if(u.siatka === "warstwice"){
    /* punkty wzdłuż warstwic co komórkę, obrócone wzdłuż linii */
    for(const l of warstwice(smp, W, H, ink, u)){
      let zapas = 0;
      for(let i=1; i<l.length; i++){
        const [x0, y0] = l[i-1], [x1, y1] = l[i], d = Math.hypot(x1 - x0, y1 - y0);
        if(!d) continue;
        const kat = Math.atan2(y1 - y0, x1 - x0);
        for(; zapas <= d; zapas += cell) dodaj(x0 + (x1 - x0)*zapas/d + off[0], y0 + (y1 - y0)*zapas/d + off[1], kat);
        zapas -= d;
      }
    }
  } else if(u.siatka === "okregi" || u.siatka === "spirala" || u.siatka === "promienie"){
    const cx = W/2 + u.sx*W/2 + off[0], cy = H/2 + u.sy*H/2 + off[1];
    const maks = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy)) + cell;
    if(u.siatka === "promienie"){
      /* punkty co komórkę wzdłuż promieni; w poprzek odstęp rośnie z
         odległością, więc pole punktu mnożone przez ten odstęp */
      const n = promienie(maks, cell);
      for(let j=0; j<n; j++){
        const f = a + j*2*Math.PI/n;
        for(let t = cell; t <= maks; t += cell) dodaj(cx + t*Math.cos(f), cy + t*Math.sin(f), f, Math.sqrt(2*Math.PI*t/n/cell));
      }
    } else if(u.siatka === "okregi"){
      dodaj(cx, cy, a);
      for(let k=1; k*cell <= maks; k++){
        const r = k*cell, n = Math.max(6, Math.round(2*Math.PI*r/cell));
        for(let j=0; j<n; j++){ const f = a + j*2*Math.PI/n; dodaj(cx + r*Math.cos(f), cy + r*Math.sin(f), f + Math.PI/2); }
      }
    } else {
      /* spirala Archimedesa r = cell·θ/2π, punkty co cell wzdłuż łuku */
      for(let th = 0; ; ){
        const r = cell*th/(2*Math.PI);
        if(r > maks) break;
        const f = th + a;
        dodaj(cx + r*Math.cos(f), cy + r*Math.sin(f), f + Math.PI/2);
        th += cell/Math.max(r, cell);
      }
    }
  } else {
    /* kwadratowa — ten sam rachunek co collectScreen() w halftone.js */
    const R = Math.ceil((W+H)/(2*cell) + 2 + (Math.abs(off[0])+Math.abs(off[1]))/cell) + 1;
    const siec = u.scal ? new Int32Array((2*R + 1)*(2*R + 1)).fill(-1) : null;
    for(let v=-R; v<=R; v++) for(let q=-R; q<=R; q++){
      const i = dodaj((q*cell*ca - v*cell*sa) + W/2 + off[0], (q*cell*sa + v*cell*ca) + H/2 + off[1], a);
      if(siec) siec[(v + R)*(2*R + 1) + q + R] = i;
    }
    if(siec) return {kropki: scal(out, siec, 2*R + 1, R, maxR, u)};
  }
  return {kropki: out};
}

/* ---------- raster liniowy ----------
   Linie bazowe wzdłuż siatki, próbkowane co krok; w każdym punkcie:
   półgrubość = pół komórki × (min + (max − min) × pokrycie), a punkt
   odsunięty w poprzek linii o odkształcenie × (pokrycie − ½) × komórka —
   ciemne miejsca pchają linię w jedną stronę, jasne w drugą, więc linie
   falują wzdłuż kształtów obrazu. Gładkość uśrednia odkształcenie wzdłuż
   linii (grubość zostaje ostra). Części linii poza kadrem odcinamy, więc
   jedna bazowa linia może dać kilka kawałków.

   Bazowa linia to lista [x, y, nx, ny, t, s]: punkt, normalna, położenie
   wzdłuż linii (do gładkości) i mnożnik grubości (promienie rozchodzą się,
   więc przy środku są cieńsze). */
function linie(smp, W, H, ink, u){
  const cell = u.cell, off = ink.off || [0, 0], krok = Math.max(0.5, cell/5), amp = u.fala*1.5*cell;
  const out = [];
  const wKadrze = (x, y) => x >= -cell && y >= -cell && x <= W + cell && y <= H + cell;
  const grubosc = (k, s) => 0.5*cell*s*(u.mn + (u.mx - u.mn)*Math.min(1, k*u.dot));
  const okno = u.glad*2*cell;
  const przetworz = (baza, okres) => {
    if(u.odk) baza = baza.map(([x, y, ...r]) => [...przesuniecie(x, y, u), ...r]);
    const n = baza.length, ks = new Float64Array(n), ds = new Float64Array(n);
    for(let i=0; i<n; i++){
      ks[i] = Math.min(1.35, Math.max(0, pokrycie(smp, ink.cov, baza[i][0], baza[i][1])));
      if(u.ch) ks[i] = Math.min(1.35, ks[i]*chmura(baza[i][0], baza[i][1], u));
      ds[i] = amp*(ks[i] - 0.5);
    }
    let d = ds;
    if(okno > 0 && amp){
      /* średnia odkształcenia z punktów bliżej niż okno wzdłuż linii; na
         okręgach odległość liczona dookoła, żeby nie było szwu */
      d = new Float64Array(n);
      const zas = Math.ceil(okno/krok) + 1;
      for(let i=0; i<n; i++){
        let sum = 0, ile = 0;
        for(let j = i - zas; j <= i + zas; j++){
          let jj = j;
          if(okres) jj = ((j % n) + n) % n;
          else if(j < 0 || j >= n) continue;
          let r = Math.abs(baza[jj][4] - baza[i][4]);
          if(okres) r = Math.min(r, okres - r);
          if(r <= okno){ sum += ds[jj]; ile++; }
        }
        d[i] = sum/ile;
      }
    }
    let kawalek = [];
    for(let i=0; i<n; i++){
      const [x0, y0, nx, ny, , s] = baza[i], x = x0 + nx*d[i], y = y0 + ny*d[i];
      if(wKadrze(x, y)) kawalek.push(ink.barwa ? [x, y, grubosc(ks[i], s), ink.barwa(...probkaRGB(smp, x0, y0))] : [x, y, grubosc(ks[i], s)]);
      else if(kawalek.length){ if(kawalek.length > 1) out.push(kawalek); kawalek = []; }
    }
    if(kawalek.length > 1) out.push(kawalek);
  };
  const a = ink.ang*Math.PI/180, ca = Math.cos(a), sa = Math.sin(a);
  if(u.siatka === "warstwice"){
    /* wzdłuż kształtu: linie już wygięte przez obraz (warstwice()),
       grubość z pokrycia w każdym punkcie, jak na innych siatkach */
    for(const l0 of warstwice(smp, W, H, ink, u)){
      const l = u.odk ? l0.map(([x, y]) => przesuniecie(x, y, u)) : l0;
      const kaw = l.map(([x, y]) => { const p = [x + off[0], y + off[1], grubosc(Math.min(1.35, Math.max(0, pokrycie(smp, ink.cov, x, y))*(u.ch ? chmura(x, y, u) : 1)), 1)];
        if(ink.barwa) p.push(ink.barwa(...probkaRGB(smp, x, y)));
        return p; });
      out.push(kaw);
    }
    return {linie: out};
  }
  if(u.siatka === "okregi" || u.siatka === "spirala" || u.siatka === "promienie"){
    const cx = W/2 + u.sx*W/2 + off[0], cy = H/2 + u.sy*H/2 + off[1];
    const maks = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy)) + cell;
    if(u.siatka === "okregi"){
      for(let k=1; k*cell <= maks; k++){
        const r = k*cell, obw = 2*Math.PI*r, baza = [];
        /* o krok dalej niż obwód: koniec zachodzi na początek, bez szczeliny */
        for(let s = 0; s <= obw + krok; s += krok){ const f = a + s/r; baza.push([cx + r*Math.cos(f), cy + r*Math.sin(f), Math.cos(f), Math.sin(f), s, 1]); }
        przetworz(baza, okno > 0 ? obw : 0);
      }
    } else if(u.siatka === "promienie"){
      /* promienie od środka; przy środku gęściej niż komórka, dalej rzadziej —
         grubość mnożona przez rzeczywisty odstęp, żeby krycie zgadzało się z tonem */
      const n = promienie(maks, cell);
      for(let j=0; j<n; j++){
        const f = a + j*2*Math.PI/n, cf = Math.cos(f), sf = Math.sin(f), baza = [];
        for(let t = 0; t <= maks; t += krok) baza.push([cx + t*cf, cy + t*sf, -sf, cf, t, 2*Math.PI*t/n/cell]);
        przetworz(baza, 0);
      }
    } else {
      /* długość łuku spirali zamieniona na kąt krokami — dokładne s(θ) nie jest potrzebne */
      const baza = [];
      let s = 0;
      for(let th = 0.01; ; ){
        const r = cell*th/(2*Math.PI);
        if(r > maks) break;
        const f = th + a;
        baza.push([cx + r*Math.cos(f), cy + r*Math.sin(f), Math.cos(f), Math.sin(f), s, 1]);
        const kr = Math.max(r, cell*0.5);
        th += krok/kr; s += krok;
      }
      przetworz(baza, 0);
    }
  } else {
    /* proste: rodzina linii wzdłuż kierunku kąta farby, odstęp = komórka */
    const R = Math.ceil((W + H)/(2*cell) + 2 + (Math.abs(off[0]) + Math.abs(off[1]))/cell);
    const L = (W + H)/2 + 2*cell;
    for(let v=-R; v<=R; v++){
      const bx = W/2 + off[0] - v*cell*sa, by = H/2 + off[1] + v*cell*ca, baza = [];
      for(let t = -L; t <= L; t += krok) baza.push([bx + t*ca, by + t*sa, -sa, ca, t, 1]);
      przetworz(baza, 0);
    }
  }
  return {linie: out};
}

/* liczba promieni: odstęp równy komórce w połowie zasięgu */
const promienie = (maks, cell) => Math.max(8, Math.round(Math.PI*maks/cell));

/* ---------- wzdłuż kształtu ----------
   Pole = równe pasy pod kątem farby (co komórkę) + odkształcenie ×
   rozmyte pokrycie. Warstwice tego pola to linie: na płaskim obrazie
   proste i równe, a tam, gdzie obraz się zmienia, zaginają się wzdłuż
   jego kształtów i zagęszczają na krawędziach — jak rytowane linie, które
   obchodzą policzek. Gładkość rozmywa pokrycie mocniej, więc linie
   upraszczają się do większych form.

   Jedno przejście marching squares po siatce próbek: każda kratka daje
   odcinki dla wszystkich poziomów, które ją przecinają (pasów jest kilkaset,
   więc osobne przejście na poziom byłoby za wolne). Odcinki sklejane
   w łamane po wspólnych krawędziach siatki. Wynik w pikselach podglądu. */
function warstwice(smp, W, H, ink, u){
  const {sw, sh, step} = smp, n = sw*sh, c = new Float64Array(n);
  for(let i=0; i<n; i++){
    const a = smp.d[i*4 + 3], k = ink.cov(smp.d[i*4], smp.d[i*4 + 1], smp.d[i*4 + 2]);
    c[i] = Math.min(1.35, Math.max(0, a === 255 || a === undefined || S.pustePrzezr === false ? k : k*a/255));
  }
  /* trzy przebiegi pudełkowe ≈ gauss; promień w próbkach */
  const r = Math.max(1, Math.round((0.3 + u.glad*3)*u.cell/step));
  const tmp = new Float64Array(n);
  for(let p=0; p<3; p++){
    for(let y=0; y<sh; y++){
      const o = y*sw;
      let s = 0, ile = 0;
      for(let k=0; k<=Math.min(sw - 1, r); k++){ s += c[o + k]; ile++; }
      for(let x=0; x<sw; x++){
        tmp[o + x] = s/ile;
        const wch = x + r + 1, wyp = x - r;
        if(wch < sw){ s += c[o + wch]; ile++; }
        if(wyp >= 0){ s -= c[o + wyp]; ile--; }
      }
    }
    for(let x=0; x<sw; x++){
      let s = 0, ile = 0;
      for(let k=0; k<=Math.min(sh - 1, r); k++){ s += tmp[k*sw + x]; ile++; }
      for(let y=0; y<sh; y++){
        c[y*sw + x] = s/ile;
        const wch = y + r + 1, wyp = y - r;
        if(wch < sh){ s += tmp[wch*sw + x]; ile++; }
        if(wyp >= 0){ s -= tmp[wyp*sw + x]; ile--; }
      }
    }
  }
  /* pole w jednostkach odstępu linii: poziom q + ½ to q-ta linia */
  const a = ink.ang*Math.PI/180, nx = -Math.sin(a), ny = Math.cos(a), sila = u.fala*4;
  const f = new Float64Array(n);
  for(let y=0; y<sh; y++) for(let x=0; x<sw; x++)
    f[y*sw + x] = ((x*step - W/2)*nx + (y*step - H/2)*ny)/u.cell + sila*c[y*sw + x];
  const linie = new Map();          /* poziom → {pkt, sasiedzi} */
  const dla = q => { let l = linie.get(q); if(!l){ l = {pkt: new Map(), sas: new Map()}; linie.set(q, l); } return l; };
  for(let y=0; y<sh - 1; y++) for(let x=0; x<sw - 1; x++){
    const i0 = y*sw + x, v0 = f[i0], v1 = f[i0 + 1], v2 = f[i0 + sw + 1], v3 = f[i0 + sw];
    const od = Math.ceil(Math.min(v0, v1, v2, v3) - 0.5), doo = Math.floor(Math.max(v0, v1, v2, v3) - 0.5);
    for(let q = od; q <= doo; q++){
      const lv = q + 0.5;
      const kod = (v0 > lv ? 1 : 0) | (v1 > lv ? 2 : 0) | (v2 > lv ? 4 : 0) | (v3 > lv ? 8 : 0);
      if(kod === 0 || kod === 15) continue;
      const L = dla(q);
      /* punkt na krawędzi siatki: pozioma (x,y)-(x+1,y) = 2i, pionowa (x,y)-(x,y+1) = 2i+1 */
      const kr = (xx, yy, pion) => {
        const id = 2*(yy*sw + xx) + (pion ? 1 : 0);
        if(!L.pkt.has(id)){
          const fa = f[yy*sw + xx], fb = pion ? f[(yy + 1)*sw + xx] : f[yy*sw + xx + 1], tt = (lv - fa)/(fb - fa);
          L.pkt.set(id, pion ? [xx*step, (yy + tt)*step] : [(xx + tt)*step, yy*step]);
        }
        return id;
      };
      const lacz = (e1, e2) => {
        if(!L.sas.has(e1)) L.sas.set(e1, []);
        if(!L.sas.has(e2)) L.sas.set(e2, []);
        L.sas.get(e1).push(e2); L.sas.get(e2).push(e1);
      };
      const G = () => kr(x, y, false), P = () => kr(x + 1, y, true), D = () => kr(x, y + 1, false), Lw = () => kr(x, y, true);
      switch(kod){
        case 1: case 14: lacz(Lw(), G()); break;
        case 2: case 13: lacz(G(), P()); break;
        case 4: case 11: lacz(P(), D()); break;
        case 8: case 7:  lacz(D(), Lw()); break;
        case 3: case 12: lacz(Lw(), P()); break;
        case 6: case 9:  lacz(G(), D()); break;
        default: {
          /* siodło (5 albo 10): rozstrzyga średnia narożników */
          const sr = (v0 + v1 + v2 + v3)/4 > lv;
          if((kod === 5) === sr){ lacz(Lw(), G()); lacz(P(), D()); } else { lacz(G(), P()); lacz(D(), Lw()); }
        }
      }
    }
  }
  /* sklejanie: najpierw od końców (jeden sąsiad), potem zamknięte pętle;
     poziomy po kolei, żeby wynik nie zależał od kolejności w mapie */
  const wyn = [];
  for(const q of [...linie.keys()].sort((p, r) => p - r)){
    const {pkt, sas} = linie.get(q), byl = new Set();
    const idz = start => {
      const l = [pkt.get(start)];
      byl.add(start);
      let ter = sas.get(start)[0];
      while(ter !== undefined && !byl.has(ter)){
        l.push(pkt.get(ter)); byl.add(ter);
        ter = sas.get(ter).find(e => !byl.has(e));
      }
      if(sas.get(start).length === 2 && l.length > 2) l.push(l[0]);   /* pętla: domknij */
      if(l.length > 1) wyn.push(l);
    };
    for(const [e, s] of sas) if(s.length === 1 && !byl.has(e)) idz(e);
    for(const e of sas.keys()) if(!byl.has(e)) idz(e);
  }
  return wyn;
}

/* ---------- kształty punktu ----------
   Dawne (koło, kwadrat, romb, linia, krzyż) rysuje halftone.js po staremu;
   nowe opisujemy wielokątami — ten sam opis dla płótna i SVG. Zwraca listę
   konturów [[x, y], …]; pierścień to dwa kontury (reguła evenodd). */
export const NOWE_KSZTALTY = ["gwiazda", "krzyzUkos", "pierscien", "szesciokat", "elipsa", "trojkat", "wielokat", "superelipsa", "wlasny"];
/* wielokąt jednostkowy przeskalowany do pola π·r² */
function doPola(p, r){
  let s = 0;
  for(let i=0; i<p.length; i++){ const [a, b] = p[i], [c, d] = p[(i + 1) % p.length]; s += a*d - b*c; }
  const k = r*Math.sqrt(Math.PI/Math.abs(s/2));
  return p.map(([a, b]) => [a*k, b*k]);
}
export function kontury(nazwa, x, y, r, kat, komorka){
  const obr = (pts, k) => pts.map(([px, py]) => [x + px*Math.cos(k) - py*Math.sin(k), y + px*Math.sin(k) + py*Math.cos(k)]);
  const wielokat = (n, R, k0) => Array.from({length: n}, (_, i) => { const f = k0 + i*2*Math.PI/n; return [R*Math.cos(f), R*Math.sin(f)]; });
  if(nazwa === "gwiazda"){
    /* gwiazdka czteroramienna jak na tablicach rastrów: ramiona 1,5 r, wcięcia 0,45 r */
    const p = []; for(let i=0; i<8; i++){ const f = i*Math.PI/4, R = i % 2 ? r*0.45 : r*1.5; p.push([R*Math.cos(f), R*Math.sin(f)]); }
    return [obr(p, kat)];
  }
  if(nazwa === "krzyzUkos"){
    const a = r*1.5, b = r*0.45;
    return [obr([[-a, -b], [a, -b], [a, b], [-a, b]], kat + Math.PI/4), obr([[-b, -a], [b, -a], [b, a], [-b, a]], kat + Math.PI/4)];
  }
  if(nazwa === "pierscien") return [obr(wielokat(24, r*1.15, 0), kat), obr(wielokat(24, r*0.6, 0).reverse(), kat)];
  if(nazwa === "szesciokat") return [obr(wielokat(6, r*1.1, 0), kat)];
  if(nazwa === "elipsa") return [obr(wielokat(20, 1, 0).map(([px, py]) => [px*r*1.4, py*r*0.7]), kat)];
  /* Kształty z panelu (jak w Halftone Makerze): wielokąt o N bokach, gwiazda
     z wcięciem, superelipsa. Skalowane do pola koła o promieniu r — zmiana
     kształtu nie zmienia tonu. Wierzchołek u góry (kąt −90°). */
  if(nazwa === "trojkat" || nazwa === "wielokat"){
    const n = nazwa === "trojkat" ? 3 : Math.max(3, Math.min(12, S.boki | 0 || 5)), w = nazwa === "trojkat" ? 0 : (S.wciecie || 0)/100;
    const p = [];
    if(w > 0) for(let i=0; i<2*n; i++){ const f = -Math.PI/2 + i*Math.PI/n, R = i % 2 ? 1 - w*0.85 : 1; p.push([R*Math.cos(f), R*Math.sin(f)]); }
    else for(let i=0; i<n; i++){ const f = -Math.PI/2 + i*2*Math.PI/n; p.push([Math.cos(f), Math.sin(f)]); }
    return [obr(doPola(p, r), kat)];
  }
  if(nazwa === "superelipsa"){
    /* |x|^e + |y|^e = 1: e = 2 koło, im więcej, tym bardziej kwadrat; poniżej 2 — romb z wklęsłymi bokami */
    const e = Math.max(0.6, (S.wykladnik || 40)/10), p = [];
    for(let i=0; i<48; i++){ const f = i*2*Math.PI/48, c = Math.cos(f), s = Math.sin(f);
      p.push([Math.sign(c)*Math.pow(Math.abs(c), 2/e), Math.sign(s)*Math.pow(Math.abs(s), 2/e)]); }
    return [obr(doPola(p, r), kat)];
  }
  /* własny kształt z pliku SVG: kontury już znormalizowane (pole π, środek w 0) */
  if(nazwa === "wlasny"){
    const k = ksztaltWlasny();
    if(!k) return [obr(wielokat(24, r, 0), kat)];
    return k.map(c => obr(c.map(([a, b]) => [a*r, b*r]), kat));
  }
  /* dawne kształty jako kontury — do obrysu (zwykle rysowane wprost) */
  if(nazwa === "square") return [obr([[-r, -r], [r, -r], [r, r], [-r, r]], kat)];
  if(nazwa === "diamond") return [obr([[0, -r*1.3], [r*1.3, 0], [0, r*1.3], [-r*1.3, 0]], kat)];
  if(nazwa === "line"){ const c = (komorka || r*2)*0.75; return [obr([[-c, -r*0.9], [c, -r*0.9], [c, r*0.9], [-c, r*0.9]], kat)]; }
  if(nazwa === "cross"){ const a = r*1.5, b = r*0.45;
    return [obr([[-b, -a], [b, -a], [b, -b], [a, -b], [a, b], [b, b], [b, a], [-b, a], [-b, b], [-a, b], [-a, -b], [-b, -b]], kat)]; }
  if(nazwa === "circle") return [obr(wielokat(32, r, 0), kat)];
  return [];
}
/* linia o zmiennej grubości jako jeden kontur: brzeg z jednej strony tam,
   z drugiej z powrotem; normalna z sąsiednich punktów */
export function konturLinii(l){
  const lewa = [], prawa = [];
  for(let i=0; i<l.length; i++){
    const p = l[Math.max(0, i-1)], n = l[Math.min(l.length-1, i+1)];
    let tx = n[0] - p[0], ty = n[1] - p[1];
    const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
    const [x, y, hw] = l[i];
    lewa.push([x - ty*hw, y + tx*hw]); prawa.push([x + ty*hw, y - tx*hw]);
  }
  return lewa.concat(prawa.reverse());
}

/* obrys punktu do rysowania ścieżką: nowe kształty albo postrzępione koło.
   Brzeg z dwóch harmonicznych (punkt staje się nieregularną plamką, nie
   gwiazdką) i drobnego szumu na wierzchołkach; wszystko ze skrótu numeru
   punktu, więc w skali z ten sam kształt, tylko większy. */
export function obrys(ksztalt, [x, y, r, kat, id], postrzep, komorka){
  if(!(postrzep && ksztalt === "circle")){
    const k = kontury(ksztalt, x, y, r, kat, komorka), z = (S.zaokraglenie || 0)/100;
    return z > 0 && ksztalt !== "circle" ? zaokraglij(k, z, x, y) : k;
  }
  const n = 22, a1 = skrot(id, 11, 913), a2 = skrot(id, 12, 913), f1 = skrot(id, 13, 913)*6.2832, f2 = skrot(id, 14, 913)*6.2832;
  const p = [];
  for(let j=0; j<n; j++){
    const t = j*2*Math.PI/n, h = skrot(id, 20 + j, 913);
    const R = r*(1 + postrzep*(0.24*a1*Math.sin(2*t + f1) + 0.2*a2*Math.sin(3*t + f2) + 0.22*(h - 0.5)));
    p.push([x + R*Math.cos(t), y + R*Math.sin(t)]);
  }
  return [p];
}

/* Linia z kolorem w każdym punkcie → odcinki jednego koloru. Kolor
   zaokrąglony do 32 poziomów na kanał (inaczej każdy punkt byłby osobnym
   odcinkiem); sąsiednie odcinki dzielą punkt styku, więc nie ma szczelin.
   Zwraca [[łamana, "rgb(…)"], …] — to samo dla płótna i SVG. */
export function odcinkiBarwne(l){
  const kl = c => "rgb(" + c.map(v => Math.min(255, Math.round(v/8)*8)).join(",") + ")";
  const wyn = [];
  let start = 0, kolor = kl(l[0][3]);
  for(let i=1; i<l.length; i++){
    const k = kl(l[i][3]);
    if(k !== kolor || i === l.length - 1){
      /* krok zakładki w obie strony — przy samym styku antyaliasing obu
         brzegów zostawiał jasną kreskę w poprzek linii */
      wyn.push([l.slice(Math.max(0, start - 1), Math.min(l.length, i + 2)), kolor]);
      start = i; kolor = k;
    }
  }
  if(start < l.length - 1) wyn.push([l.slice(Math.max(0, start - 1)), kolor]);
  return wyn;
}
export const kolorCSS = c => "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";

/* Czy punkty rysować ścieżką (konturami z obrys()) zamiast wprost: nowe
   kształty, postrzępione brzegi i tryb obrysu (wtedy każdy kształt). */
export const sciezkowy = (ksztalt, g) => NOWE_KSZTALTY.includes(ksztalt) || !!g.postrzep || (S.obrys || 0) > 0 || ((S.zaokraglenie || 0) > 0 && ksztalt !== "circle");
/* grubość obrysu w pikselach podglądu (0 = wypełnienie) */
export const grubostObrysu = () => (S.obrys || 0)/10;
/* znak dla punktu: tekst z panelu, znaki po kolei (spacje pomijane) */
export function znakPunktu(i){
  const z = [...String(S.znak || "★")].filter(c => c.trim());
  return z.length ? z[i % z.length] : "★";
}

/* ---------- zlewanie punktów (metaballe) ----------
   Pole f(p) = Σ (r_i / |p − c_i|)^w: pojedynczy punkt ma na progu f = 1
   dokładnie swój okrąg (ton się nie zmienia), a sąsiednie pola sumują się
   i między punktami wyrastają szyjki. Mniejszy wykładnik w — dłuższy zasięg,
   więcej zlewania (suwak 0–100 → w od 8 do 1,6). Pole na siatce co 1/6
   komórki, warstwica f = 1 metodą marching squares, łamane zamknięte —
   kontury w pikselach podglądu, więc zapis w skali i SVG to te same plamy.
   Pole zerujemy poza zasięgiem 3 komórek od punktu (inaczej koszt rośnie
   z kwadratem zasięgu); siatka sięga 2 komórki za kadr, żeby kontury przy
   brzegu się domykały. */
function metaballe(kropki, W, H, u){
  const cell = u.cell, w = 8 - 6.4*u.zlew, krok = Math.max(0.5, cell/6), zasieg = 3*cell;
  const x0 = -3*cell, y0 = -3*cell, sw = Math.ceil((W + 6*cell)/krok) + 1, sh = Math.ceil((H + 6*cell)/krok) + 1;
  const f = new Float64Array(sw*sh);
  /* (r²/d²)^(w/2) z tablicy po q = d²/r² ∈ [0, Q] — potęga w każdym węźle
     kosztowała więcej niż cała reszta; interpolacja liniowa między wpisami */
  const Q = Math.pow(200, 2/w), N = 4096, lut = new Float64Array(N + 2);
  for(let i=0; i<=N + 1; i++){ const q = i/N*Q; lut[i] = q < 1e-9 ? 1e6 : Math.min(1e6, Math.pow(1/q, w/2)); }
  for(const [cx, cy, r0] of kropki){
    if(r0 <= 0) continue;
    /* kontur z kratki to wielokąt wpisany w okrąg — ma mniejsze pole; promień
       powiększony o znaną stratę wielokąta o n bokach (n z obwodu i kroku
       kratki; boki z marching squares są ~1,2 kroku) */
    const nb = Math.max(4, 2*Math.PI*r0/(krok*1.2)), r = r0/Math.sqrt(nb/(2*Math.PI)*Math.sin(2*Math.PI/nb));
    const zr = Math.min(zasieg, r*Math.sqrt(Q)), r2 = r*r, skala = N/(Q*r2);
    const i0 = Math.max(0, Math.floor((cx - zr - x0)/krok)), i1 = Math.min(sw - 1, Math.ceil((cx + zr - x0)/krok));
    const j0 = Math.max(0, Math.floor((cy - zr - y0)/krok)), j1 = Math.min(sh - 1, Math.ceil((cy + zr - y0)/krok));
    const zr2 = zr*zr;
    for(let j=j0; j<=j1; j++){
      const dy = y0 + j*krok - cy, dy2 = dy*dy, o = j*sw;
      for(let i=i0; i<=i1; i++){
        const dx = x0 + i*krok - cx, d2 = dx*dx + dy2;
        if(d2 > zr2) continue;
        const t = d2*skala, k = t | 0, fr = t - k;
        f[o + i] += lut[k] + (lut[k + 1] - lut[k])*fr;
      }
    }
  }
  /* Warstwicę liczymy na −f^(−1/w), nie na f: przy pojedynczym punkcie to
     dokładnie −odległość/r, czyli funkcja liniowa — interpolacja na krawędzi
     kratki trafia w okrąg. Na samym f (bardzo stromym) plamy wychodziły
     o 70% za duże. Pusto (f = 0) → −10, daleko pod progiem −1. */
  for(let i=0; i<f.length; i++) f[i] = f[i] > 0 ? -Math.min(10, Math.pow(f[i], -1/w)) : -10;
  return izolinia(f, sw, sh, krok, x0, y0, -1);
}

/* Warstwica pola na siatce (marching squares) — zamknięte łamane w układzie
   (x0 + i·krok, y0 + j·krok). Brzeg siatki musi leżeć poniżej progu. */
export function izolinia(f, sw, sh, krok, x0, y0, prog){
  const pkt = new Map(), sas = new Map();
  const kr = (x, y, pion) => {
    const id = 2*(y*sw + x) + (pion ? 1 : 0);
    if(!pkt.has(id)){
      const a = f[y*sw + x], b = pion ? f[(y + 1)*sw + x] : f[y*sw + x + 1], t = (prog - a)/(b - a);
      pkt.set(id, pion ? [x0 + x*krok, y0 + (y + t)*krok] : [x0 + (x + t)*krok, y0 + y*krok]);
    }
    return id;
  };
  const lacz = (e1, e2) => {
    if(!sas.has(e1)) sas.set(e1, []);
    if(!sas.has(e2)) sas.set(e2, []);
    sas.get(e1).push(e2); sas.get(e2).push(e1);
  };
  for(let y=0; y<sh - 1; y++) for(let x=0; x<sw - 1; x++){
    const i0 = y*sw + x, v0 = f[i0], v1 = f[i0 + 1], v2 = f[i0 + sw + 1], v3 = f[i0 + sw];
    const kod = (v0 > prog ? 1 : 0) | (v1 > prog ? 2 : 0) | (v2 > prog ? 4 : 0) | (v3 > prog ? 8 : 0);
    if(kod === 0 || kod === 15) continue;
    const G = () => kr(x, y, false), P = () => kr(x + 1, y, true), D = () => kr(x, y + 1, false), L = () => kr(x, y, true);
    switch(kod){
      case 1: case 14: lacz(L(), G()); break;
      case 2: case 13: lacz(G(), P()); break;
      case 4: case 11: lacz(P(), D()); break;
      case 8: case 7:  lacz(D(), L()); break;
      case 3: case 12: lacz(L(), P()); break;
      case 6: case 9:  lacz(G(), D()); break;
      default: {
        const sr = (v0 + v1 + v2 + v3)/4 > prog;
        if((kod === 5) === sr){ lacz(L(), G()); lacz(P(), D()); } else { lacz(G(), P()); lacz(D(), L()); }
      }
    }
  }
  const wyn = [], byl = new Set();
  for(const start of sas.keys()){
    if(byl.has(start)) continue;
    const l = [pkt.get(start)];
    byl.add(start);
    let ter = sas.get(start)[0];
    while(ter !== undefined && !byl.has(ter)){ l.push(pkt.get(ter)); byl.add(ter); ter = sas.get(ter).find(e => !byl.has(e)); }
    if(l.length > 2) wyn.push(l);
  }
  return wyn;
}

/* ---------- stippling ----------
   Ważone diagramy Woronoja (Secord, „Weighted Voronoi Stippling", NPAR 2002):
   punkty losowane z gęstością proporcjonalną do pokrycia, potem kilka
   przebiegów relaksacji Lloyda — każdy punkt przesuwa się do środka ciężkości
   (ważonego pokryciem) swojego obszaru, więc punkty rozkładają się równo, bez
   kratki i bez zlepków. Liczba punktów: na pełną czerń jeden na komórkę².
   Losowanie ze skrótu — ten sam obraz przy każdym renderze; wynik w pamięci
   (ostatnie 4 układy), bo relaksacja trwa do kilkuset ms, a większość zmian
   w panelu (kolor papieru, kształt) układu punktów nie zmienia. */
const pamiecStipple = new Map();
function stipple(smp, W, H, ink, u){
  const {sw, sh, step, d} = smp, n = sw*sh, iter = Math.max(0, Math.min(30, S.stipIter ?? 8));
  /* pokrycie próbek (z przezroczystością jak pokrycie()) */
  const k = new Float64Array(n);
  let suma = 0, odcisk = 0;
  for(let i=0; i<n; i++){
    const a = d[i*4 + 3], v = ink.cov(d[i*4], d[i*4 + 1], d[i*4 + 2]);
    k[i] = Math.min(1, Math.max(0, a === 255 || a === undefined || S.pustePrzezr === false ? v : v*a/255));
    suma += k[i];
    odcisk = (odcisk*31 + Math.round(k[i]*255)) >>> 0;
  }
  const klucz = [sw, sh, step, W, H, u.cell, iter, u.ziarno, odcisk].join(",");
  if(pamiecStipple.has(klucz)) return pamiecStipple.get(klucz);
  const N = Math.round(suma*step*step/(u.cell*u.cell));
  /* losowanie z odrzucaniem: kandydat w losowym miejscu, przyjęty z prawdopodobieństwem pokrycia */
  const px = new Float64Array(N), py = new Float64Array(N);
  for(let i=0, proba=0; i<N && proba < N*60; proba++){
    const x = skrot(proba, 1, u.ziarno + 401)*W, y = skrot(proba, 2, u.ziarno + 401)*H;
    const sx = Math.min(sw - 1, Math.floor(x/step)), sy = Math.min(sh - 1, Math.floor(y/step));
    if(skrot(proba, 3, u.ziarno + 401) < k[sy*sw + sx]){ px[i] = x; py[i] = y; i++; }
  }
  /* Lloyd: przypisanie próbek do najbliższego punktu przez kubełki co komórkę */
  const B = u.cell, bw = Math.ceil(W/B) + 1, bh = Math.ceil(H/B) + 1;
  const sx = new Float64Array(N), sy = new Float64Array(N), sw8 = new Float64Array(N);
  for(let it=0; it<iter; it++){
    const glowa = new Int32Array(bw*bh).fill(-1), nast = new Int32Array(N);
    for(let i=0; i<N; i++){
      const b = Math.min(bh - 1, Math.max(0, Math.floor(py[i]/B)))*bw + Math.min(bw - 1, Math.max(0, Math.floor(px[i]/B)));
      nast[i] = glowa[b]; glowa[b] = i;
    }
    sx.fill(0); sy.fill(0); sw8.fill(0);
    for(let j=0; j<sh; j++) for(let i=0; i<sw; i++){
      const wgt = k[j*sw + i];
      if(wgt <= 0) continue;
      const x = (i + 0.5)*step, y = (j + 0.5)*step, bx = Math.floor(x/B), by = Math.floor(y/B);
      let best = -1, bd = Infinity;
      for(let pr=1; pr<=4 && (best < 0 || pr <= 2); pr++){
        for(let yy = by - pr; yy <= by + pr; yy++) for(let xx = bx - pr; xx <= bx + pr; xx++){
          if(xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
          for(let q = glowa[yy*bw + xx]; q >= 0; q = nast[q]){
            const dx = px[q] - x, dy = py[q] - y, dd = dx*dx + dy*dy;
            if(dd < bd){ bd = dd; best = q; }
          }
        }
      }
      if(best < 0) continue;
      sx[best] += x*wgt; sy[best] += y*wgt; sw8[best] += wgt;
    }
    for(let i=0; i<N; i++) if(sw8[i] > 0){ px[i] = sx[i]/sw8[i]; py[i] = sy[i]/sw8[i]; }
  }
  const wyn = Array.from({length: N}, (_, i) => [px[i], py[i]]);
  if(pamiecStipple.size >= 4) pamiecStipple.delete(pamiecStipple.keys().next().value);
  pamiecStipple.set(klucz, wyn);
  return wyn;
}

/* ---------- własny kształt (SVG) ----------
   S.ksztaltWlasny: tekst JSON [[[x, y], …], …] — kontury po normalizacji
   (środek w zerze, pole = π, czyli koło o promieniu 1). Tekst, bo przechodzi
   przez presety i ich walidację jak S.efekty. Czytany nieufnie: tylko liczby
   skończone, kontury z co najmniej 3 punktów; zepsuty — koło. */
let pamiecKsztaltu = {tekst: null, kontury: null};
export function ksztaltWlasny(){
  const t = S.ksztaltWlasny || "";
  if(pamiecKsztaltu.tekst === t) return pamiecKsztaltu.kontury;
  let k = null;
  try{
    const d = JSON.parse(t);
    if(Array.isArray(d)){
      k = d.filter(c => Array.isArray(c) && c.length >= 3 && c.every(p => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === "number" && isFinite(v) && Math.abs(v) < 100)));
      if(!k.length) k = null;
    }
  }catch{ k = null; }
  pamiecKsztaltu = {tekst: t, kontury: k && orientuj(k)};
  return pamiecKsztaltu.kontury;
}
/* Kierunek obiegu: kontury zewnętrzne w jedną stronę, otwory (leżące
   wewnątrz nieparzystej liczby innych) w drugą. Punkty rysujemy regułą
   nonzero (nakładające się punkty zostają zamalowane — przy evenodd ich część
   wspólna robiła dziurę), a otwory działają wtedy tylko przy odwrotnym
   obiegu. Plik SVG może mieć obiegi dowolne, więc poprawiamy przy odczycie. */
function orientuj(kontury){
  const pole = c => { let s = 0; for(let i=0; i<c.length; i++){ const [a, b] = c[i], [x, y] = c[(i + 1) % c.length]; s += a*y - b*x; } return s; };
  const wewnatrz = (p, c) => { let w = false; for(let i=0, j=c.length - 1; i<c.length; j=i++){ const [xi, yi] = c[i], [xj, yj] = c[j];
    if((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi)*(p[1] - yi)/(yj - yi) + xi) w = !w; } return w; };
  return kontury.map((c, i) => {
    const otwor = kontury.filter((d, j) => j !== i && wewnatrz(c[0], d)).length % 2 === 1;
    return (pole(c) > 0) === !otwor ? c : [...c].reverse();
  });
}
/* kontury w dowolnych jednostkach → środek w zerze, pole π (evenodd: dziury
   odejmują), najwyżej `maks` punktów razem (równo po długości) */
export function normalizujKsztalt(kontury, maks = 120){
  const pole = c => { let s = 0; for(let i=0; i<c.length; i++){ const [a, b] = c[i], [x, y] = c[(i + 1) % c.length]; s += a*y - b*x; } return s/2; };
  const dl = c => { let s = 0; for(let i=0; i<c.length; i++){ const [a, b] = c[i], [x, y] = c[(i + 1) % c.length]; s += Math.hypot(x - a, y - b); } return s; };
  kontury = kontury.filter(c => c.length >= 3 && Math.abs(pole(c)) > 1e-9);
  if(!kontury.length) return null;
  /* przerzedzenie: każdy kontur dostaje punkty proporcjonalnie do długości */
  const razem = kontury.reduce((s, c) => s + dl(c), 0);
  kontury = kontury.map(c => {
    const n = Math.max(8, Math.round(maks*dl(c)/razem)), L = dl(c), wyn = [];
    let i = 0, przed = 0;
    for(let k=0; k<n; k++){
      const cel = k*L/n;
      while(i < c.length){
        const [a, b] = c[i], [x, y] = c[(i + 1) % c.length], s = Math.hypot(x - a, y - b);
        if(przed + s >= cel){ const t = s ? (cel - przed)/s : 0; wyn.push([a + (x - a)*t, b + (y - b)*t]); break; }
        przed += s; i++;
      }
    }
    return wyn;
  }).filter(c => c.length >= 3);
  /* pole netto z regułą evenodd przybliżone sumą wartości bezwzględnych
     z odjęciem konturów zawartych w innych (dziury) */
  const wewnatrz = (p, c) => { let w = false; for(let i=0, j=c.length - 1; i<c.length; j=i++){ const [xi, yi] = c[i], [xj, yj] = c[j];
    if((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi)*(p[1] - yi)/(yj - yi) + xi) w = !w; } return w; };
  let netto = 0, sx = 0, sy = 0, n = 0;
  kontury.forEach((c, i) => {
    const glebokosc = kontury.filter((d, j) => j !== i && wewnatrz(c[0], d)).length;
    netto += (glebokosc % 2 ? -1 : 1)*Math.abs(pole(c));
    for(const [x, y] of c){ sx += x; sy += y; n++; }
  });
  if(!(netto > 1e-9)) return null;
  const cx = sx/n, cy = sy/n, k = Math.sqrt(Math.PI/netto);
  return kontury.map(c => c.map(([x, y]) => [Math.round((x - cx)*k*1000)/1000, Math.round((y - cy)*k*1000)/1000]));
}

/* ---------- scalanie obszarów ----------
   Na siatce kwadratowej bloki 8×8, potem 4×4, potem 2×2 komórek (wyrównane
   do siatki), w których ton jest równy — odchylenie pokrycia poniżej progu
   z suwaka — zamieniamy na jeden punkt w środku bloku. Pole nowego punktu =
   suma pól punktów, które zastępuje, więc ton się nie zmienia; w gładkich
   miejscach wychodzą duże kropki, w szczegółach zostaje drobny raster.
   Blok musi być pełny (każda komórka w kadrze ma punkt) i jeszcze nie
   scalony; komórki poza kadrem nie przeszkadzają — inaczej przy brzegu
   zostawał pas drobnych punktów. */
function scal(out, siec, bok, R, maxR, u){
  const prog = u.scal*0.12, usuniete = new Uint8Array(out.length), nowe = [];
  for(const n of [8, 4, 2]){
    for(let v0 = 0; v0 + n <= bok; v0 += n) for(let q0 = 0; q0 + n <= bok; q0 += n){
      const czl = [];
      let zly = false;
      for(let v = v0; v < v0 + n && !zly; v++) for(let q = q0; q < q0 + n; q++){
        const i = siec[v*bok + q];
        if(i === -2) continue;
        if(i < 0 || usuniete[i]){ zly = true; break; }
        czl.push(i);
      }
      if(zly || czl.length < 2) continue;
      const k = czl.map(i => (out[i][2]/maxR)**2), sr = k.reduce((a, b) => a + b)/k.length;
      const odch = Math.sqrt(k.reduce((s, x) => s + (x - sr)**2, 0)/k.length);
      if(odch > prog) continue;
      let sx = 0, sy = 0, pole = 0;
      for(const i of czl){ sx += out[i][0]; sy += out[i][1]; pole += out[i][2]**2; usuniete[i] = 1; }
      const p = out[czl[0]], punkt = [sx/czl.length, sy/czl.length, Math.sqrt(pole), p[3]];
      if(p.length > 4) punkt.push(p[4]);
      if(p.length > 5){
        const c = [0, 0, 0]; for(const i of czl) for(let j=0; j<3; j++) c[j] += out[i][5][j];
        punkt.push(c.map(v => Math.round(v/czl.length)));
      }
      nowe.push(punkt);
    }
  }
  return out.filter((_, i) => !usuniete[i]).concat(nowe);
}

/* ---------- zaokrąglanie rogów ----------
   Każdy wierzchołek zastąpiony łukiem (krzywa kwadratowa z wierzchołkiem
   jako punktem kontrolnym, 5 punktów): łuk zaczyna się w odległości
   f · ½ krótszej z sąsiednich krawędzi, więc f = 1 to rogi zaokrąglone do
   połowy boku. Potem kształt przeskalowany wokół (cx, cy) do dawnego pola —
   zaokrąglenie nie rozjaśnia tonu. Kontury o wielu wierzchołkach (koło,
   superelipsa) prawie się nie zmieniają, bo ich krawędzie są krótkie. */
export function zaokraglij(kontury, f, cx, cy){
  const pole = c => { let s = 0; for(let i=0; i<c.length; i++){ const [a, b] = c[i], [x, y] = c[(i + 1) % c.length]; s += a*y - b*x; } return s/2; };
  const przed = kontury.reduce((s, c) => s + pole(c), 0);
  const nowe = kontury.map(c => {
    const n = c.length, wyn = [];
    for(let i=0; i<n; i++){
      const [px, py] = c[(i - 1 + n) % n], [vx, vy] = c[i], [nx, ny] = c[(i + 1) % n];
      const l1 = Math.hypot(vx - px, vy - py), l2 = Math.hypot(nx - vx, ny - vy);
      if(!l1 || !l2){ wyn.push([vx, vy]); continue; }
      const d = f*0.5*Math.min(l1, l2);
      const ax = vx + (px - vx)*d/l1, ay = vy + (py - vy)*d/l1, bx = vx + (nx - vx)*d/l2, by = vy + (ny - vy)*d/l2;
      for(let k=0; k<=4; k++){
        const t = k/4, u = 1 - t;
        wyn.push([u*u*ax + 2*u*t*vx + t*t*bx, u*u*ay + 2*u*t*vy + t*t*by]);
      }
    }
    return wyn;
  });
  const po = nowe.reduce((s, c) => s + pole(c), 0);
  if(!(Math.abs(po) > 1e-12) || Math.sign(po) !== Math.sign(przed)) return nowe;
  const s = Math.sqrt(przed/po);
  return nowe.map(c => c.map(([x, y]) => [cx + (x - cx)*s, cy + (y - cy)*s]));
}

/* ---------- kod QR jako siatka ----------
   Raster, który da się zeskanować telefonem — technika „halftone QR"
   (Chu i in., „Halftone QR Codes", SIGGRAPH Asia 2013): każdy moduł danych
   dzielimy na 3×3; środek niesie bit kodu (ciemny kwadrat albo pusto — tam
   patrzy czytnik), osiem pól wokół to zwykły raster obrazu, z punktami nie
   większymi niż pole, żeby nie wchodziły na środek. Elementy stałe (wzory
   szukania w rogach, linie taktujące, wyrównanie, format) — pełne moduły,
   bo po nich czytnik znajduje kod. Wokół 4 moduły ciszy (bez farby), dalej
   zwykły raster o tej samej podziałce. Kod wyśrodkowany, bok = część
   krótszego boku obrazu. Zwraca kwadraty do zamalowania (kontury);
   punkty dopisuje do `out`. Siatka QR nie obraca się z kątem farby. */
let pamiecQR = {klucz: null, kod: null};
export function biezacyQR(){
  const klucz = [S.qrTekst, S.qrKorekcja, S.qrWersja].join("\u0000");
  if(pamiecQR.klucz !== klucz){
    let kod = null;
    try{ kod = kodQR(S.qrTekst || " ", S.qrKorekcja || "H", S.qrWersja || 1); }catch{ kod = null; }
    pamiecQR = {klucz, kod};
  }
  return pamiecQR.kod;
}
function siatkaQR(smp, W, H, ink, u, out){
  const q = biezacyQR();
  if(!q) return null;
  const N = q.rozmiar, bok = Math.min(W, H)*Math.max(0.2, Math.min(1, (S.qrRozmiar || 80)/100));
  const m = bok/(N + 8), c3 = m/3, x0 = (W - bok)/2 + 4*m, y0 = (H - bok)/2 + 4*m;
  const dodatki = [];
  const kwadrat = (x, y, s) => dodatki.push([[x, y], [x + s, y], [x + s, y + s], [x, y + s]]);
  for(let j=0; j<N; j++) for(let i=0; i<N; i++){
    if(!q.moduly[j][i]) continue;
    if(q.funkcyjne[j][i]) kwadrat(x0 + i*m, y0 + j*m, m);
    else kwadrat(x0 + (i + 0.5)*m - 0.225*m, y0 + (j + 0.5)*m - 0.225*m, 0.45*m);   /* środek modułu danych, trochę większy niż 1/3 — pewniej się skanuje */
  }
  /* punkty obrazu na podsiatce co m/3, wyrównanej do modułów */
  const rMaks = 0.564*c3*u.dot;
  const sx0 = Math.floor(-x0/c3) - 1, sx1 = Math.ceil((W - x0)/c3) + 1, sy0 = Math.floor(-y0/c3) - 1, sy1 = Math.ceil((H - y0)/c3) + 1;
  for(let sy = sy0; sy <= sy1; sy++) for(let sx = sx0; sx <= sx1; sx++){
    const i = Math.floor(sx/3), j = Math.floor(sy/3);
    const wKodzie = i >= 0 && i < N && j >= 0 && j < N, wCiszy = i >= -4 && i < N + 4 && j >= -4 && j < N + 4;
    if(wCiszy && !wKodzie) continue;                                   /* strefa ciszy — pusto */
    if(wKodzie && (q.funkcyjne[j][i] || (sx - i*3 === 1 && sy - j*3 === 1))) continue;
    const px = x0 + (sx + 0.5)*c3, py = y0 + (sy + 0.5)*c3;
    if(px < -c3 || py < -c3 || px > W + c3 || py > H + c3) continue;
    let k = pokrycie(smp, ink.cov, px, py);
    if(u.ch) k *= chmura(px, py, u);
    if(k <= 0.004) continue;
    let r = rMaks*Math.sqrt(Math.min(1.35, k));
    if(wKodzie) r = Math.min(r, c3*0.5);                               /* nie wchodzi na środek modułu */
    out.push(ink.barwa ? [px, py, r, 0, -1, ink.barwa(...probkaRGB(smp, px, py))] : [px, py, r, 0]);
  }
  return dodatki;
}
