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

/* pokrycie farby w punkcie podglądu — najbliższa próbka, jak w collectScreen() */
export function pokrycie(smp, cov, px, py){
  const sx = Math.min(smp.sw-1, Math.max(0, Math.round(px/smp.step)));
  const sy = Math.min(smp.sh-1, Math.max(0, Math.round(py/smp.step)));
  const i = (sy*smp.sw + sx)*4;
  return cov(smp.d[i], smp.d[i+1], smp.d[i+2]);
}

/* ustawienia farby: własne (risograf) albo wspólne z panelu */
export function ustawieniaFarby(ink){
  return {
    cell: ink.cell || S.cell, dot: ink.dot || S.dot, ksztalt: ink.ksztalt || S.shape,
    siatka: ink.siatka || S.siatka || "kwadrat", obrot: ink.obrot || 0,
    fala: (S.fala || 0)/100, sx: (S.srodekX || 0)/100, sy: (S.srodekY || 0)/100,
    glad: (S.gladkosc || 0)/100, mn: (S.liniaMin || 0)/100, mx: (S.liniaMax ?? 100)/100,
    ch: (S.chmury || 0)/100, nr: (S.nierowne || 0)/100, dr: (S.drganie || 0)/100, post: (S.postrzep || 0)/100,
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
/* mnożnik krycia z chmur: dwie skale, większa ~7 komórek */
const chmura = (x, y, u) => {
  const c = szum(x, y, Math.max(24, u.cell*8), u.ziarno)*0.6 + szum(x, y, Math.max(10, u.cell*3), u.ziarno + 1)*0.28 + szum(x, y, Math.max(4, u.cell*1.2), u.ziarno + 2)*0.12;
  return Math.max(0, 1 + u.ch*2.2*(c - 0.5));
};

/* Zwraca {kropki: [[x, y, r, kąt], …], cell} albo {linie: [[[x, y, półgrubość], …], …], cell},
   wszystko już pomnożone przez z. */
export function geometria(smp, W, H, ink, z){
  z = z || 1;
  const u = ustawieniaFarby(ink);
  const wyn = u.ksztalt === "pasy" ? linie(smp, W, H, ink, u) : kropki(smp, W, H, ink, u);
  /* pasowanie: obrót całej płyty wokół środka kadru (obraz na płycie obraca
     się razem z rastrem — pokrycie liczone przed obrotem), potem skala z */
  const ob = u.obrot*Math.PI/180, co = Math.cos(ob), so = Math.sin(ob), cx = W/2, cy = H/2;
  const t = (x, y) => ob ? [(cx + (x - cx)*co - (y - cy)*so)*z, (cy + (x - cx)*so + (y - cy)*co)*z] : [x*z, y*z];
  if(wyn.kropki){
    wyn.kropki = wyn.kropki.map(([x, y, r, k, ...id]) => { const [a, b] = t(x, y); return [a, b, r*z, k + ob, ...id]; });
    /* postrzępione brzegi tylko dla okrągłych punktów — reszta kształtów ma własny obrys */
    if(u.post && u.ksztalt === "circle") wyn.postrzep = u.post;
  }
  else wyn.linie = wyn.linie.map(l => l.map(([x, y, hw]) => { const [a, b] = t(x, y); return [a, b, hw*z]; }));
  wyn.cell = u.cell*z;
  return wyn;
}

function kropki(smp, W, H, ink, u){
  const out = [], cell = u.cell, maxR = 0.564*cell*u.dot, a = ink.ang*Math.PI/180, ca = Math.cos(a), sa = Math.sin(a);
  const off = ink.off || [0, 0];
  const dodaj = (px, py, kat, s) => {
    if(px < -cell || py < -cell || px > W + cell || py > H + cell) return;
    let k = pokrycie(smp, ink.cov, px, py);
    if(u.ch) k *= chmura(px, py, u);
    if(k <= 0.004) return;
    let r = maxR*Math.sqrt(Math.min(1.35, k))*(s === undefined ? 1 : s);
    if(!(u.nr || u.dr || u.post)){ out.push([px, py, r, kat]); return; }
    /* numer punktu: kolejność liczenia nie zależy od z, więc zapis w skali
       dostaje te same wielkości, drgania i brzegi */
    const id = out.length, z0 = u.ziarno*3;
    if(u.nr) r *= Math.max(0.15, 1 + u.nr*(0.9*(skrot(id, 1, z0) - 0.5) + (skrot(id, 2, z0) > 0.975 ? 0.7 : 0)));
    if(u.dr){ px += u.dr*0.3*cell*(skrot(id, 3, z0) - 0.5)*2; py += u.dr*0.3*cell*(skrot(id, 4, z0) - 0.5)*2; }
    out.push([px, py, r, kat, id]);
  };
  if(u.siatka === "heks"){
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
    for(let v=-R; v<=R; v++) for(let q=-R; q<=R; q++)
      dodaj((q*cell*ca - v*cell*sa) + W/2 + off[0], (q*cell*sa + v*cell*ca) + H/2 + off[1], a);
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
      if(wKadrze(x, y)) kawalek.push([x, y, grubosc(ks[i], s)]);
      else if(kawalek.length){ if(kawalek.length > 1) out.push(kawalek); kawalek = []; }
    }
    if(kawalek.length > 1) out.push(kawalek);
  };
  const a = ink.ang*Math.PI/180, ca = Math.cos(a), sa = Math.sin(a);
  if(u.siatka === "warstwice"){
    /* wzdłuż kształtu: linie już wygięte przez obraz (warstwice()),
       grubość z pokrycia w każdym punkcie, jak na innych siatkach */
    for(const l of warstwice(smp, W, H, ink, u)){
      const kaw = l.map(([x, y]) => [x + off[0], y + off[1], grubosc(Math.min(1.35, Math.max(0, pokrycie(smp, ink.cov, x, y))*(u.ch ? chmura(x, y, u) : 1)), 1)]);
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
  for(let i=0; i<n; i++) c[i] = Math.min(1.35, Math.max(0, ink.cov(smp.d[i*4], smp.d[i*4 + 1], smp.d[i*4 + 2])));
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
export const NOWE_KSZTALTY = ["gwiazda", "krzyzUkos", "pierscien", "szesciokat", "elipsa"];
export function kontury(nazwa, x, y, r, kat){
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
export function obrys(ksztalt, [x, y, r, kat, id], postrzep){
  if(!(postrzep && ksztalt === "circle")) return kontury(ksztalt, x, y, r, kat);
  const n = 22, a1 = skrot(id, 11, 913), a2 = skrot(id, 12, 913), f1 = skrot(id, 13, 913)*6.2832, f2 = skrot(id, 14, 913)*6.2832;
  const p = [];
  for(let j=0; j<n; j++){
    const t = j*2*Math.PI/n, h = skrot(id, 20 + j, 913);
    const R = r*(1 + postrzep*(0.24*a1*Math.sin(2*t + f1) + 0.2*a2*Math.sin(3*t + f2) + 0.22*(h - 0.5)));
    p.push([x + R*Math.cos(t), y + R*Math.sin(t)]);
  }
  return [p];
}
