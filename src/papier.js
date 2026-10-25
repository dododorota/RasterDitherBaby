/* Faktura papieru pod farbą (raster): włókna, chmurki masy papierowej
   i drobinki makulatury. Rysowana na papierze przed farbami — farby kładą się
   na nią mnożeniem, więc papier prześwituje przez nie jak na prawdziwym
   arkuszu.

   Włókna i drobinki to kształty w pikselach podglądu (ctx.scale(z)), więc
   zapis w skali rysuje ten sam papier, tylko ostrzej. Chmurki to mały obraz
   szumu powiększany płynnie — są tak rozmyte, że skala nic w nich nie zmienia.
   Losowość ze skrótu numeru włókna, jak wszędzie: ten sam papier przy każdym
   renderze. W SVG papier zostaje gładki (jak ziarno i faktura farby). */
import { S } from "./state.js";
import { skrot } from "./fx.js";
import { hex2rgb } from "./palettes.js";
import { plotno } from "./plotno.js";

/* rodzaj → [siła chmurek, pikseli na włókno, długość włókna, pikseli na drobinkę] */
const RODZAJE = {
  wlokna:     [0.25,  70, 12, 0],
  czerpany:   [1,    140,  9, 6000],
  makulatura: [0.45, 160,  5, 900]
};

/* ---------- papier w gradiencie ----------
   Tło rastra: jeden kolor (S.paper) albo gradient — liniowy pod kątem albo
   promienisty od środka. Wektorowo z obu stron: na płótnie gradient
   kontekstu, w SVG <linearGradient>/<radialGradient> o tej samej geometrii
   (geometriaTla, w pikselach podglądu), więc plik zostaje czystym wektorem.
   Punkty gradientu w S.papierGrad — tekst JSON [["#rrggbb", 0–100], …],
   bo przechodzi przez presety; czytany nieufnie (stopnieTla). */
export const GRADIENT_PAPIERU = [["#fff8e7", 0], ["#ffd3c4", 50], ["#c6d8ff", 100]];
export const MAKS_STOPNI = 8;
export function stopnieTla(){
  let s = null;
  try{ s = JSON.parse(S.papierGrad || "null"); }catch{ s = null; }
  if(Array.isArray(s)) s = s.filter(p => Array.isArray(p) && /^#[0-9a-f]{6}$/i.test(p[0]) && typeof p[1] === "number" && isFinite(p[1]))
                            .slice(0, MAKS_STOPNI).map(([k, p]) => [k.toLowerCase(), Math.max(0, Math.min(100, p))]);
  if(!Array.isArray(s) || s.length < 2) s = GRADIENT_PAPIERU.map(p => [...p]);
  return s.map((p, i) => [p, i]).sort((a, b) => a[0][1] - b[0][1] || a[1] - b[1]).map(p => p[0]);
}
export const tloGradientowe = () => S.papierTlo === "liniowy" || S.papierTlo === "promienisty";
/* liniowy: odcinek przez środek kadru pod kątem (0° — od lewej, 90° — od góry),
   tak długi, żeby rogi dostały skrajne kolory; promienisty — do rogów */
export function geometriaTla(W, H){
  if(S.papierTlo === "promienisty") return {r: Math.hypot(W, H)/2, cx: W/2, cy: H/2};
  const a = (S.papierKat || 0)*Math.PI/180, d = (Math.abs(W*Math.cos(a)) + Math.abs(H*Math.sin(a)))/2;
  return {x1: W/2 - Math.cos(a)*d, y1: H/2 - Math.sin(a)*d, x2: W/2 + Math.cos(a)*d, y2: H/2 + Math.sin(a)*d};
}
export function wypelnijTlo(ctx, W, H, z){
  if(!tloGradientowe()){ ctx.fillStyle = S.paper; ctx.fillRect(0, 0, W*z, H*z); return; }
  const g = geometriaTla(W, H);
  const gr = g.r ? ctx.createRadialGradient(g.cx*z, g.cy*z, 0, g.cx*z, g.cy*z, g.r*z) : ctx.createLinearGradient(g.x1*z, g.y1*z, g.x2*z, g.y2*z);
  for(const [k, p] of stopnieTla()) gr.addColorStop(p/100, k);
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W*z, H*z);
}
/* tło jako SVG: [definicja gradientu albo "", wypełnienie prostokąta] */
export function svgTla(W, H){
  if(!tloGradientowe()) return ["", S.paper];
  const g = geometriaTla(W, H), n = v => Math.round(v*100)/100;
  const st = stopnieTla().map(([k, p]) => `<stop offset="${n(p/100)}" stop-color="${k}"/>`).join("");
  return [g.r ? `<radialGradient id="papier" gradientUnits="userSpaceOnUse" cx="${n(g.cx)}" cy="${n(g.cy)}" r="${n(g.r)}">${st}</radialGradient>`
              : `<linearGradient id="papier" gradientUnits="userSpaceOnUse" x1="${n(g.x1)}" y1="${n(g.y1)}" x2="${n(g.x2)}" y2="${n(g.y2)}">${st}</linearGradient>`, "url(#papier)"];
}

export function papier(ctx, W, H, z){
  const ust = RODZAJE[S.papierRodzaj], s = (S.papierSila || 0)/100;
  if(!ust || !(s > 0)) return;
  /* skala faktury: papier rysowany w jednostkach ks razy większych — kadr
     W/ks × H/ks, płótno ×ks (100% — co do bitu jak dawniej) */
  const ks = (S.fakturaSkala ?? 100)/100;
  W /= ks; H /= ks;
  const [chm, naWlokno, dl, naDrobinke] = ust, [r, g, b] = hex2rgb(S.paper);
  const ciemny = a => `rgba(${r*0.62|0},${g*0.6|0},${b*0.56|0},${a.toFixed(3)})`;
  ctx.save();
  ctx.scale(z*ks, z*ks);

  /* chmurki: szum na siatce co 10 px (dwie skale), ciemniej i jaśniej od papieru */
  if(chm){
    const k = 10, cw = Math.ceil(W/k) + 3, ch = Math.ceil(H/k) + 3, c = plotno(cw, ch);
    const x = c.getContext("2d"), d = x.createImageData(cw, ch);
    for(let j=0; j<ch; j++) for(let i=0; i<cw; i++){
      const v = skrot(i, j, 501)*0.45 + skrot(i >> 2, j >> 2, 502)*0.55, o = (j*cw + i)*4, a = Math.abs(v - 0.5)*2*s*chm*0.28*255;
      if(v > 0.5){ d.data[o] = d.data[o+1] = d.data[o+2] = 255; }
      else { d.data[o] = r*0.7; d.data[o+1] = g*0.68; d.data[o+2] = b*0.64; }
      d.data[o+3] = a;
    }
    x.putImageData(d, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(c, -k, -k, cw*k, ch*k);
  }

  /* włókna: krótkie, lekko wygięte kreski — ciemniejsze i jaśniejsze */
  const ile = Math.round(W*H/naWlokno*s);
  ctx.lineCap = "round";
  for(let n=0; n<ile; n++){
    const x = skrot(n, 1, 511)*W, y = skrot(n, 2, 511)*H, kat = skrot(n, 3, 511)*Math.PI;
    const L = dl*(0.35 + skrot(n, 4, 511)), zg = (skrot(n, 5, 511) - 0.5)*L*0.6;
    const dx = Math.cos(kat)*L/2, dy = Math.sin(kat)*L/2;
    const jasne = skrot(n, 6, 511) < 0.4, a = (0.18 + skrot(n, 7, 511)*0.4)*Math.min(1, s*1.5);
    ctx.strokeStyle = jasne ? `rgba(255,255,255,${(a*1.4).toFixed(3)})` : ciemny(a);
    ctx.lineWidth = 0.25 + skrot(n, 8, 511)*0.45;
    ctx.beginPath();
    ctx.moveTo(x - dx, y - dy);
    ctx.quadraticCurveTo(x - dy/L*2*zg, y + dx/L*2*zg, x + dx, y + dy);
    ctx.stroke();
  }

  /* drobinki: farba i kora z makulatury — ciemne, czasem barwne kropki */
  if(naDrobinke){
    const BARWY = [[60, 55, 50], [90, 70, 50], [40, 60, 110], [120, 40, 40]];
    const ileD = Math.round(W*H/naDrobinke*s);
    for(let n=0; n<ileD; n++){
      const x = skrot(n, 1, 521)*W, y = skrot(n, 2, 521)*H, [cr, cg, cb] = BARWY[(skrot(n, 3, 521)*(skrot(n, 4, 521) < 0.8 ? 1 : 4)) | 0];
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${(0.35 + skrot(n, 5, 521)*0.5).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 0.3 + skrot(n, 6, 521)*0.9, 0.25 + skrot(n, 7, 521)*0.6, skrot(n, 8, 521)*Math.PI, 0, 6.2832);
      ctx.fill();
    }
  }
  ctx.restore();
}
