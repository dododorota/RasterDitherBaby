import { S } from "./state.js";
import { rozmyj } from "./rozmycie.js";

/* ---------- korekta ----------
   Kolejność: krzywa tonalna (jasność, kontrast, cienie, światła, gamma,
   negatyw) jako LUT na kanał, potem barwa (odcień, nasycenie) jedną macierzą
   3×3, a dopiero na końcu operacje przestrzenne (odszumianie, rozmycie,
   wyostrzanie) — te ostatnie potrzebują wymiarów, więc żyją osobno
   w korektaPrzestrzenna(). Każdy krok przy wartości neutralnej jest pomijany
   w całości: dotychczasowe ustawienia dają obraz co do bajtu taki jak przed
   dodaniem nowych suwaków. */
/* Cienie (w lustrze — światła): podniesienie u + k·u(1−u)⁴, garb ze szczytem
   przy u = 0,2, czyli w głębokich cieniach; przy k = 3 (suwak 100) ciemna
   szarość 0,1 idzie do 0,3, a od 0,7 w górę prawie nic się nie zmienia.
   Nachylenie 1 + k(1−u)³(1−5u) ≥ 1 − 0,22k, więc do k ≈ 4,6 krzywa rośnie.
   Przyciemnienie to dokładna odwrotność podniesienia (bisekcja) — garb
   odjęty wprost miałby przy zerze nachylenie 1 − k < 0 i odwracałby ton.
   Do 16.10 garb 0,25·4u(1−u)² z oboma kierunkami wprost: najwyżej ±38 poziomów
   i to w półtonach, więc w cieniach suwak prawie nic nie robił. */
const podnies = (u, k) => u + k*u*(1-u)**4;
function opusc(v, k){
  let lo = 0, hi = v;
  for(let i=0; i<40; i++){ const m = (lo + hi)/2; if(podnies(m, k) < v) lo = m; else hi = m; }
  return (lo + hi)/2;
}
export function lut(){
  const t=new Uint8ClampedArray(256);
  const c = S.con, f = (259*(c+255))/(255*(259-c));
  const cien = (S.cienie||0)/100, swiatla = (S.swiatla||0)/100;
  /* ekspozycja (EV) i poziomy (punkt czerni / bieli) — przed jasnością, jak we
     wtyczkach VFX; przy 0 / 0 / 255 pominięte, więc LUT co do bajtu jak dawniej */
  const ev = S.ekspozycja || 0, czern = S.czern || 0, biel = S.biel ?? 255;
  for(let i=0;i<256;i++){
    let v = i;
    if(ev) v *= 2 ** ev;
    if(czern !== 0 || biel !== 255) v = (v - czern)*255/Math.max(1, biel - czern);
    v = v + S.bri*2.55;
    v = f*(v-128)+128;
    if(cien || swiatla){
      /* cienie i światła: czerń i biel zostają na miejscu, krzywa zawsze rośnie.
         Najpierw cienie, potem światła (to samo w lustrze: 1 − u). */
      let u = Math.max(0, Math.min(1, v/255));
      if(cien) u = cien > 0 ? podnies(u, 3*cien) : opusc(u, -3*cien);
      if(swiatla) u = 1 - (swiatla > 0 ? opusc(1 - u, 3*swiatla) : podnies(1 - u, -3*swiatla));
      v = 255*u;
    }
    v = 255*Math.pow(Math.max(0,Math.min(255,v))/255, 1/S.gam);
    t[i] = S.inv ? 255-v : v;
  }
  return t;
}

/* Odcień i nasycenie jedną macierzą. Obrót odcienia wokół osi szarości (ta
   sama macierz co filtr hue-rotate w CSS), nasycenie jako odsunięcie od szarości
   o tej samej jasności (wagi 0,2126/0,7152/0,0722, też jak w CSS). null, gdy
   oba neutralne. */
export function macierzBarwy(){
  const kat = (S.odcien||0)*Math.PI/180, s = 1 + (S.nasycenie||0)/100;
  if(!kat && s === 1) return null;
  const c = Math.cos(kat), n = Math.sin(kat);
  const H = [
    0.213 + c*0.787 - n*0.213, 0.715 - c*0.715 - n*0.715, 0.072 - c*0.072 + n*0.928,
    0.213 - c*0.213 + n*0.143, 0.715 + c*0.285 + n*0.140, 0.072 - c*0.072 - n*0.283,
    0.213 - c*0.213 - n*0.787, 0.715 - c*0.715 + n*0.715, 0.072 + c*0.928 + n*0.072
  ];
  const lr = 0.2126*(1-s), lg = 0.7152*(1-s), lb = 0.0722*(1-s);
  const N = [lr+s, lg, lb,  lr, lg+s, lb,  lr, lg, lb+s];
  const M = new Array(9);
  for(let r=0;r<3;r++) for(let k=0;k<3;k++) M[r*3+k] = N[r*3]*H[k] + N[r*3+1]*H[3+k] + N[r*3+2]*H[6+k];
  return M;
}

/* korekta prosto na buforze RGBA — tej wersji używa worker, który ImageData
   nie dostaje, tylko same piksele */
export function adjustPixels(p){
  const t=lut();
  for(let i=0;i<p.length;i+=4){ p[i]=t[p[i]]; p[i+1]=t[p[i+1]]; p[i+2]=t[p[i+2]]; }
  const M = macierzBarwy();
  if(M) for(let i=0;i<p.length;i+=4){
    const r=p[i], g=p[i+1], b=p[i+2];
    p[i]   = M[0]*r + M[1]*g + M[2]*b;
    p[i+1] = M[3]*r + M[4]*g + M[5]*b;
    p[i+2] = M[6]*r + M[7]*g + M[8]*b;
  }
}
export function adjust(d){ adjustPixels(d.data); }

/* ---------- korekta przestrzenna ----------
   Odszumianie, rozmycie i wyostrzanie, w tej kolejności: najpierw zdejmujemy
   szum, żeby wyostrzanie go nie podbiło. Wszystkie promienie w pikselach
   obrazu; `jednostka` to liczba pikseli bufora na piksel obrazu (1/pix
   w ditheringu, 1/step na siatce próbek rastra), więc jedno ustawienie znaczy
   to samo przy każdej pikselizacji i gęstości.
   Rozmycie (S.blur) to dawny suwak rastra — tam liczy się dokładnie tak jak
   wcześniej, sigma = blur/step. */
export function korektaPrzestrzenna(p, w, h, jednostka){
  if(S.odszum > 0) odszum(p, w, h, S.odszum/100);
  if(S.blur) rozmyj(p, w, h, S.blur*jednostka);
  if(S.ostrosc > 0) wyostrz(p, w, h, S.ostrosc/100, jednostka);
}

/* Odszumianie filtrem dwustronnym 5×5: uśrednia sąsiadów podobnego koloru,
   a krawędzie (duża różnica) zostawia — w przeciwieństwie do rozmycia nie
   zmiękcza konturów. Siła to tolerancja różnicy kolorów. Wagi przestrzenne
   stałe (σ = 1,5 piksela bufora): odszumianie dotyczy szumu matrycy, który
   jest w pikselach bufora, a nie w pikselach obrazu. */
function odszum(p, w, h, sila){
  const sr = 6 + sila*44, dzielnik = -1/(2*sr*sr*3);
  const wp = []; for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) wp.push([dx, dy, Math.exp(-(dx*dx+dy*dy)/(2*1.5*1.5))]);
  const zr = new Uint8ClampedArray(p);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const o = (y*w+x)*4, r0 = zr[o], g0 = zr[o+1], b0 = zr[o+2];
    let sw = 0, sR = 0, sG = 0, sB = 0;
    for(const [dx, dy, ws] of wp){
      const xx = x+dx < 0 ? 0 : (x+dx >= w ? w-1 : x+dx), yy = y+dy < 0 ? 0 : (y+dy >= h ? h-1 : y+dy);
      const q = (yy*w+xx)*4, dr = zr[q]-r0, dg = zr[q+1]-g0, db = zr[q+2]-b0;
      const wg = ws*Math.exp((dr*dr+dg*dg+db*db)*dzielnik);
      sw += wg; sR += zr[q]*wg; sG += zr[q+1]*wg; sB += zr[q+2]*wg;
    }
    p[o] = sR/sw; p[o+1] = sG/sw; p[o+2] = sB/sw;
  }
}
/* Wyostrzanie maską nieostrą: obraz + siła × (obraz − rozmyty), σ = 1 piksel
   obrazu (nie mniej niż 0,6 piksela bufora — inaczej na rzadkiej siatce próbek
   rastra nie byłoby czego wyostrzać). Do 300% przy suwaku na 100. */
function wyostrz(p, w, h, sila, jednostka){
  const r = new Float32Array(p.length);
  for(let i=0;i<p.length;i++) r[i] = p[i];
  rozmyj(r, w, h, Math.max(0.6, jednostka));
  const k = sila*3;
  for(let i=0;i<p.length;i+=4){
    p[i]   = p[i]   + k*(p[i]   - r[i]);
    p[i+1] = p[i+1] + k*(p[i+1] - r[i+1]);
    p[i+2] = p[i+2] + k*(p[i+2] - r[i+2]);
  }
}

export function fit(w,h,max){
  const s = Math.min(1, max/Math.max(w,h));
  return [Math.max(1,Math.round(w*s)), Math.max(1,Math.round(h*s))];
}
