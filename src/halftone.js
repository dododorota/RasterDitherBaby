import { S, MAX } from "./state.js";
import { out, octx } from "./dom.js";
import { adjust, fit } from "./image.js";

/* ---------- tryb 2: raster drukarski ----------

   `z` to krotność zapisu. Cała siatka liczy się zawsze w pikselach podglądu,
   a przez `z` mnożona jest dopiero gotowa geometria punktu. Dzięki temu plik
   w skali 4× jest dokładnie czterokrotnym powiększeniem podglądu, a nie
   czterokrotnie drobniejszym rastrem — i to z konstrukcji, bo próbkowanie
   i zaokrąglenia wypadają identycznie niezależnie od `z`. Liczenie od razu
   w pikselach wyjścia tego nie dawało: `round(px/step)` potrafiło przeskoczyć
   o próbkę na granicy zaokrąglenia i zmienić promień o ułamek procenta.
   Podgląd i eksport wektorowy idą z z=1, czyli mnożeniem przez jeden. */

/* Rozmycie na buforze próbek, rozdzielone na przebieg poziomy i pionowy
   (pionowy to ten sam kod po transpozycji). Brzeg domykamy powtórzeniem
   skrajnej próbki, alfy nie ruszamy — reszta rastra i tak patrzy tylko na RGB.

   Dla małych sigm liczymy dokładne jądro gaussowskie: jest tanie, a sigma bywa
   ułamkowa, bo piksele obrazu przeliczamy na rzadsze o `step` próbki. Powyżej
   promienia 8 koszt dokładnego splotu rośnie liniowo i przy gęstości 3 sięgał
   0,7 s, więc przechodzimy na trzy przebiegi pudełkowe z sumą bieżącą: koszt
   przestaje zależeć od promienia, a trzy pudełka są już nieodróżnialne od
   gaussa.

   Szerokości pudełek dobiera `pudelka()`, i to nie jedną na wszystkie trzy
   przebiegi, tylko mieszanką dwóch sąsiednich. Jedna wspólna szerokość musi być
   zaokrąglona, przez co efektywna sigma potrafiła chybić o 20% i w jednym
   miejscu suwaka obraz robił się ostrzejszy mimo zwiększania rozmycia. */
const PROG_GAUSSA = 4;

/* trzy szerokości pudełek, których złożona wariancja trafia w σ² */
function pudelka(sigma){
  const n = 3, w = Math.sqrt(12*sigma*sigma/n + 1);
  let wl = Math.floor(w); if(wl % 2 === 0) wl--;
  if(wl < 1) wl = 1;
  const wu = wl + 2;
  const m = Math.round((12*sigma*sigma - n*wl*wl - 4*n*wl - 3*n) / (-4*wl - 4));
  return [0,1,2].map(i => i < m ? wl : wu);
}

function transponuj(a, b, w, h){
  for(let y=0;y<h;y++){
    const row=y*w;
    for(let x=0;x<w;x++) b[x*h+y] = a[row+x];
  }
}
function wierszeGauss(a, b, w, h, k, rad){
  for(let y=0;y<h;y++){
    const row=y*w;
    for(let x=0;x<w;x++){
      let s=0;
      for(let i=-rad;i<=rad;i++){
        const sx = x+i<0 ? 0 : (x+i>w-1 ? w-1 : x+i);
        s += a[row+sx]*k[i+rad];
      }
      b[row+x]=s;
    }
  }
}
function wierszeBox(a, b, w, h, r){
  const norm = 1/(2*r+1);
  for(let y=0;y<h;y++){
    const row=y*w;
    let s=0;
    for(let i=-r;i<=r;i++){ const x = i<0?0:(i>w-1?w-1:i); s += a[row+x]; }
    for(let x=0;x<w;x++){
      b[row+x] = s*norm;
      const we = x+r+1 > w-1 ? w-1 : x+r+1;
      const wy = x-r < 0 ? 0 : x-r;
      s += a[row+we] - a[row+wy];
    }
  }
}
/* rozmywa wiersze płaszczyzny a do b; przy dużej sigmie po drodze używa a jako
   bufora pomocniczego, ale wynik zawsze ląduje w b */
function rozmyjWiersze(a, b, w, h, sigma){
  const rad = Math.max(1, Math.ceil(sigma*3));
  if(rad <= PROG_GAUSSA){
    const k = new Float32Array(rad*2+1);
    let suma = 0;
    for(let i=-rad;i<=rad;i++){ const v=Math.exp(-(i*i)/(2*sigma*sigma)); k[i+rad]=v; suma+=v; }
    for(let i=0;i<k.length;i++) k[i]/=suma;
    wierszeGauss(a,b,w,h,k,rad);
  } else {
    const sz = pudelka(sigma);
    wierszeBox(a,b,w,h,(sz[0]-1)/2);
    wierszeBox(b,a,w,h,(sz[1]-1)/2);
    wierszeBox(a,b,w,h,(sz[2]-1)/2);
  }
}
function rozmyj(p, w, h, sigma){
  if(sigma < 0.05) return;
  const n=w*h, a=new Float32Array(n), b=new Float32Array(n), c=new Float32Array(n);
  for(let ch=0; ch<3; ch++){
    for(let i=0,j=ch;i<n;i++,j+=4) a[i]=p[j];
    rozmyjWiersze(a,b,w,h,sigma);     /* poziomo */
    transponuj(b,c,w,h);
    rozmyjWiersze(c,b,h,w,sigma);     /* to samo po transpozycji = pionowo */
    transponuj(b,a,h,w);
    for(let i=0,j=ch;i<n;i++,j+=4) p[j]=a[i];
  }
}
export function sampler(W,H){
  const step = Math.max(2, Math.round(S.cell/2));
  const sw = Math.max(1,Math.ceil(W/step)), sh = Math.max(1,Math.ceil(H/step));
  const c=document.createElement("canvas"); c.width=sw; c.height=sh;
  const ctx=c.getContext("2d");
  if(S.pix>1){
    const pw=Math.max(1,Math.round(sw/S.pix)), ph=Math.max(1,Math.round(sh/S.pix));
    const t=document.createElement("canvas"); t.width=pw; t.height=ph;
    t.getContext("2d").drawImage(S.img,0,0,pw,ph);
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(t,0,0,sw,sh);
  } else {
    ctx.drawImage(S.img,0,0,sw,sh);
  }
  const d=ctx.getImageData(0,0,sw,sh); adjust(d);
  /* Rozmycie idzie PO korekcie, tuż przed rastrem: gdyby szło przed, podbity
     kontrast wyostrzyłby krawędzie z powrotem i migotanie by wróciło.
     Sigma z pikseli obrazu na próbki, więc to samo rozmycie znaczy to samo
     przy każdej gęstości siatki. */
  if(S.blur) rozmyj(d.data, sw, sh, S.blur/step);
  return {d:d.data, sw, sh, step};
}
export function collectScreen(smp, W,H, angle, cov, off, z){
  z = z || 1;
  const dots=[];
  const a=angle*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a);
  const cell=S.cell, maxR=0.564*cell*S.dot;
  /* Zakres siatki z odwrócenia transformacji: dla punktu mieszczącego się
     w kadrze |u| i |v| nie przekraczają (W+H)/2cell plus margines komórki
     i przesunięcia pasowania. Liczenie do (W+H)/cell, jak było wcześniej,
     dawało cztery razy więcej iteracji przy identycznym wyniku. */
  const R = Math.ceil((W+H)/(2*cell) + 2 + (Math.abs(off[0])+Math.abs(off[1]))/cell) + 1;
  for(let v=-R; v<=R; v++){
    for(let u=-R; u<=R; u++){
      const px = (u*cell*ca - v*cell*sa) + W/2 + off[0];
      const py = (u*cell*sa + v*cell*ca) + H/2 + off[1];
      if(px<-cell||py<-cell||px>W+cell||py>H+cell) continue;
      const sx = Math.min(smp.sw-1, Math.max(0, Math.round(px/smp.step)));
      const sy = Math.min(smp.sh-1, Math.max(0, Math.round(py/smp.step)));
      const i=(sy*smp.sw+sx)*4;
      const k = cov(smp.d[i], smp.d[i+1], smp.d[i+2]);
      if(k<=0.004) continue;
      dots.push([px*z, py*z, maxR*Math.sqrt(Math.min(1.35,k))*z]);
    }
  }
  return {dots, a, cell:cell*z};
}
function drawScreen(target, smp, W,H, angle, color, cov, off, z){
  z = z || 1;
  const {dots,a,cell} = collectScreen(smp,W,H,angle,cov,off,z);
  const c=document.createElement("canvas"); c.width=W*z; c.height=H*z;
  const x=c.getContext("2d");
  x.fillStyle=color; x.strokeStyle=color;
  for(const [px,py,r] of dots){
    x.save(); x.translate(px,py); x.rotate(a);
    switch(S.shape){
      case "square": x.fillRect(-r,-r,r*2,r*2); break;
      case "diamond": x.beginPath(); x.moveTo(0,-r*1.3); x.lineTo(r*1.3,0); x.lineTo(0,r*1.3); x.lineTo(-r*1.3,0); x.closePath(); x.fill(); break;
      case "line": x.fillRect(-cell*0.75, -r*0.9, cell*1.5, r*1.8); break;
      case "cross": x.fillRect(-r*1.5,-r*0.45,r*3,r*0.9); x.fillRect(-r*0.45,-r*1.5,r*0.9,r*3); break;
      default: x.beginPath(); x.arc(0,0,r,0,6.2832); x.fill();
    }
    x.restore();
  }
  target.save();
  target.globalCompositeOperation="multiply";
  target.drawImage(c,0,0);
  target.restore();
}
export function inkList(){
  const lum = (r,g,b) => (0.299*r+0.587*g+0.114*b)/255;
  const m = S.mis;
  /* przesunięcie pasowania liczone deterministycznie, żeby podgląd i eksport były identyczne */
  const off = i => m ? [Math.sin(i*12.9898+1.3)*m/14, Math.cos(i*78.233+0.7)*m/14] : [0,0];

  if(S.inkmode==="mono")
    return [{color:S.ink, ang:S.ang, cov:(r,g,b)=>1-lum(r,g,b), off:[0,0], name:"farba"}];

  if(S.inkmode==="duo")
    return [
      {color:"#EC008C", ang:S.ang+30, cov:(r,g,b)=>Math.max(0,(1-lum(r,g,b))*0.65), off:off(1), name:"magenta"},
      {color:S.ink, ang:S.ang, cov:(r,g,b)=>Math.pow(Math.max(0,1-lum(r,g,b)),1.6), off:off(2), name:"czarny"}
    ];

  const cmyk = (r,g,b)=>{ const k=1-Math.max(r,g,b)/255;
    if(k>=0.999) return [0,0,0,1];
    return [(1-r/255-k)/(1-k), (1-g/255-k)/(1-k), (1-b/255-k)/(1-k), k]; };
  return [
    {color:"#FFE800", ang:S.ang-45, cov:(r,g,b)=>cmyk(r,g,b)[2], off:off(1), name:"yellow"},
    {color:"#EC008C", ang:S.ang+30, cov:(r,g,b)=>cmyk(r,g,b)[1], off:off(2), name:"magenta"},
    {color:"#00AEEF", ang:S.ang-30, cov:(r,g,b)=>cmyk(r,g,b)[0], off:off(3), name:"cyan"},
    {color:S.ink,     ang:S.ang,    cov:(r,g,b)=>cmyk(r,g,b)[3], off:off(4), name:"key"}
  ];
}
export function renderHalftone(scale){
  const z = Math.max(1, Math.round(scale));
  const [W,H] = fit(S.img.width, S.img.height, MAX);   /* kadr podglądu */
  const OW = W*z, OH = H*z;                            /* kadr wyjścia */
  out.width=OW; out.height=OH;
  out.classList.remove("pixelated");
  octx.fillStyle = S.paper; octx.fillRect(0,0,OW,OH);
  const smp = sampler(W,H);
  for(const k of inkList()) drawScreen(octx, smp, W,H, k.ang, k.color, k.cov, k.off, z);

  if(S.grain){
    const d=octx.getImageData(0,0,OW,OH), p=d.data, g=S.grain*1.6;
    /* jedna próbka ziarna na kwadrat z×z — ziarno ma być fakturą papieru
       w skali podglądu, a nie drobnieć wraz z rozdzielczością zapisu */
    const bw=W, bh=H;
    const noise=new Float32Array(bw*bh);
    for(let i=0;i<noise.length;i++) noise[i]=(Math.random()-0.5)*g;
    for(let y=0;y<OH;y++){
      const row=((y/z)|0)*bw;
      for(let x=0;x<OW;x++){
        const n=noise[row+((x/z)|0)], i=(y*OW+x)*4;
        p[i]+=n; p[i+1]+=n; p[i+2]+=n;
      }
    }
    octx.putImageData(d,0,0);
  }
}
