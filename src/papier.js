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

/* rodzaj → [siła chmurek, pikseli na włókno, długość włókna, pikseli na drobinkę] */
const RODZAJE = {
  wlokna:     [0.25,  70, 12, 0],
  czerpany:   [1,    140,  9, 6000],
  makulatura: [0.45, 160,  5, 900]
};

export function papier(ctx, W, H, z){
  const ust = RODZAJE[S.papierRodzaj], s = (S.papierSila || 0)/100;
  if(!ust || !(s > 0)) return;
  const [chm, naWlokno, dl, naDrobinke] = ust, [r, g, b] = hex2rgb(S.paper);
  const ciemny = a => `rgba(${r*0.62|0},${g*0.6|0},${b*0.56|0},${a.toFixed(3)})`;
  ctx.save();
  ctx.scale(z, z);

  /* chmurki: szum na siatce co 10 px (dwie skale), ciemniej i jaśniej od papieru */
  if(chm){
    const k = 10, cw = Math.ceil(W/k) + 3, ch = Math.ceil(H/k) + 3, c = document.createElement("canvas");
    c.width = cw; c.height = ch;
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
