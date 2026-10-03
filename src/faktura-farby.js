/* Szorstka faktura farby na rastrze — jak w druku riso i sitodruku: poszarpane
   krawędzie punktów, rozlanie, nierówne krycie (plamy), drobne dziury.

   Działa na jednej farbie naraz, zanim zostanie nałożona na papier: w kanale
   alfa jej płótna (kolor farby, pokrycie w alfie). Część liczona (krycie())
   jest czysta i testowana w Node; fakturaFarby() tylko wyjmuje i wkłada
   piksele płótna.

   Szum jest deterministyczny (skrót współrzędnych i ziarna farby) i liczony
   na siatce podglądu, a do rozdzielczości zapisu powiększany płynnie — ta sama
   faktura w podglądzie i w pliku, a zapis 6× nie liczy szumu 36 razy. */
import { S } from "./state.js";
import { skrot } from "./fx.js";
import { rozmyj } from "./rozmycie.js";

export const fakturaWlaczona = () => S.szorstkosc > 0 || S.rozlanie > 0 || S.plamy > 0 || S.dziury > 0 || S.walek > 0;

/* szum wartości: losowe wartości w węzłach co `skala` pikseli, gładko między
   nimi. Siatka węzłów obrócona (kąt z ziarna) — szum wartości na siatce
   prostej zdradza ją: plamy układały się w poziome i pionowe prostokąty. */
function poleSzumu(W, H, skala, ziarno){
  const kat = 0.45 + (ziarno % 7)*0.31, c = Math.cos(kat)/skala, s = Math.sin(kat)/skala;
  const pole = new Float32Array((W + 1)*(H + 1));
  for(let y=0; y<=H; y++){
    for(let x=0; x<=W; x++){
      const gx = x*c - y*s + 1000, gy = x*s + y*c + 1000;
      const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
      const sx = fx*fx*(3 - 2*fx), sy = fy*fy*(3 - 2*fy);
      const a = skrot(i, j, ziarno), b = skrot(i + 1, j, ziarno), cc = skrot(i, j + 1, ziarno), d = skrot(i + 1, j + 1, ziarno);
      pole[y*(W + 1) + x] = (a + (b - a)*sx) + ((cc + (d - cc)*sx) - (a + (b - a)*sx))*sy;
    }
  }
  return pole;
}
/* wartość pola (W+1)×(H+1) w punkcie podglądu (u, v) — dwuliniowo */
function probka(pole, W, u, v){
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, w1 = W + 1;
  const a = pole[y0*w1 + x0], b = pole[y0*w1 + x0 + 1], c = pole[(y0+1)*w1 + x0], d = pole[(y0+1)*w1 + x0 + 1];
  return (a*(1 - fx) + b*fx)*(1 - fy) + (c*(1 - fx) + d*fx)*fy;
}
const gladko = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a)/(b - a))); return t*t*(3 - 2*t); };

/* p — piksele RGBA farby (OW×OH = W·z × H·z); zmienia tylko alfę */
export function krycie(p, W, H, z, ziarno){
  if(!fakturaWlaczona()) return;
  const OW = W*z, OH = H*z, n = OW*OH;
  const sz = S.szorstkosc/100, roz = S.rozlanie/100, pl = S.plamy/100, dz = S.dziury/100, wa = (S.walek || 0)/100;
  let a = new Float32Array(n);
  for(let i=0; i<n; i++) a[i] = p[i*4 + 3]/255;
  /* Rozlanie i szorstkość na rozmytym kryciu: rozmycie robi wokół brzegu pas
     przejścia, a przycięcie go z powrotem — niżej niż w połowie (rozlanie,
     punkty puchną) i z progiem przesuniętym szumem (szorstkość, brzeg rwie
     się w obie strony). Z dala od punktów rozmyte krycie jest zerem, więc
     na czystym papierze nic się nie pojawia. */
  const brzeg = sz > 0 ? [poleSzumu(W, H, 1.6, ziarno*7 + 1), poleSzumu(W, H, 5, ziarno*7 + 2)] : null;
  if(roz > 0 || brzeg){
    const b = new Float32Array(n*4);
    for(let i=0; i<n; i++) b[i*4] = a[i];
    rozmyj(b, OW, OH, Math.max(roz > 0 ? 0.6 + 2.2*roz : 0, brzeg ? 0.9 + 1.2*sz : 0)*z);
    const prog = 0.5 - 0.38*roz;
    for(let y=0; y<OH; y++){
      const v = Math.min(H - 0.001, Math.max(0, (y + 0.5)/z - 0.5));
      for(let x=0; x<OW; x++){
        const i = y*OW + x, k = b[i*4];
        if(k <= 0.002){ a[i] = 0; continue; }
        let s = 0;
        if(brzeg){
          const u = Math.min(W - 0.001, Math.max(0, (x + 0.5)/z - 0.5));
          s = ((probka(brzeg[0], W, u, v) - 0.5)*0.7 + (probka(brzeg[1], W, u, v) - 0.5)*0.5)*sz*0.8;
        }
        a[i] = gladko(prog - 0.07, prog + 0.07, k + s);
      }
    }
  }
  /* Plamy: dwie skale (34 i 13 px) mówią, GDZIE farby brakuje, a drobne
     ziarno (1,4 px) — JAK: zamiast gładkiego prześwitu (wyglądał jak
     cyfrowe moro) farba wykrusza się w ziarno, gęściej w środku plamy,
     jak na prawdziwym odbitym arkuszu. Odrobina gładkiego spadku zostaje. */
  const plamy = pl > 0 ? [poleSzumu(W, H, 34, ziarno*7 + 3), poleSzumu(W, H, 13, ziarno*7 + 5), poleSzumu(W, H, 1.4, ziarno*7 + 9)] : null;
  /* dziury 2 px — pojedyncze piksele wyglądały jak szum, nie niedodruk */
  const dziury = dz > 0 ? poleSzumu(W, H, 2, ziarno*7 + 4) : null;
  /* ślady wałka: poziome smugi — szum o skali 2,5 px próbkowany z osią x
     rozciągniętą 18 razy, plus szersze pasy (9 px) słabszej farby */
  const walek = wa > 0 ? [poleSzumu(W, H, 2.5, ziarno*7 + 6), poleSzumu(W, H, 9, ziarno*7 + 8)] : null;
  if(plamy || dziury || walek) for(let y=0; y<OH; y++){
    const v = Math.min(H - 0.001, Math.max(0, (y + 0.5)/z - 0.5));
    for(let x=0; x<OW; x++){
      const i = y*OW + x;
      if(a[i] <= 0) continue;
      const u = Math.min(W - 0.001, Math.max(0, (x + 0.5)/z - 0.5));
      if(plamy){
        const m = Math.max(0, Math.min(1, (probka(plamy[0], W, u, v)*0.65 + probka(plamy[1], W, u, v)*0.35)*1.9 - 0.6));
        const ziarnko = probka(plamy[2], W, u, v) < m*0.85 ? 1 : 0;
        a[i] *= 1 - pl*(0.25*m + 0.7*ziarnko);
      }
      if(dziury && probka(dziury, W, u, v) < dz*0.3) a[i] *= 0.1;
      if(walek){
        const s = probka(walek[0], W, u/18, v)*0.6 + probka(walek[1], W, u/6, v)*0.4;
        a[i] *= 1 - wa*0.85*Math.max(0, Math.min(1, (s - 0.42)*2.6));
      }
    }
  }
  for(let i=0; i<n; i++) p[i*4 + 3] = Math.round(Math.max(0, Math.min(1, a[i]))*255);
}

/* płótno farby → krycie() → z powrotem; ziarno z koloru farby, żeby każda
   farba miała własny wzór plam i dziur */
export function fakturaFarby(c, W, H, z, kolor){
  if(!fakturaWlaczona()) return;
  const x = c.getContext("2d"), d = x.getImageData(0, 0, c.width, c.height);
  krycie(d.data, W, H, z, parseInt(String(kolor || "#000").slice(1), 16) % 9973 || 1);
  x.putImageData(d, 0, 0);
}
