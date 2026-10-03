import { S, MAX } from "./state.js";
import { hex2rgb } from "./palettes.js";
import { out, octx } from "./dom.js";
import { adjust, fit, korektaPrzestrzenna } from "./image.js";
import { efektyPo, uruchomWSkali, zmiennoscCzynna } from "./stos.js";
import { zmiennoscPrzed } from "./fx.js";
import { geometria, kontury, konturLinii, NOWE_KSZTALTY } from "./siatki.js";
import { fakturaFarby } from "./faktura-farby.js";
import { skrot } from "./fx.js";

/* ---------- tryb 2: raster drukarski ----------

   `z` to krotność zapisu. Cała siatka liczy się zawsze w pikselach podglądu,
   a przez `z` mnożona jest dopiero gotowa geometria punktu. Dzięki temu plik
   w skali 4× jest dokładnie czterokrotnym powiększeniem podglądu, a nie
   czterokrotnie drobniejszym rastrem — i to z konstrukcji, bo próbkowanie
   i zaokrąglenia wypadają identycznie niezależnie od `z`. Liczenie od razu
   w pikselach wyjścia tego nie dawało: `round(px/step)` potrafiło przeskoczyć
   o próbkę na granicy zaokrąglenia i zmienić promień o ułamek procenta.
   Podgląd i eksport wektorowy idą z z=1, czyli mnożeniem przez jeden. */

export function sampler(W,H,cell){
  const step = Math.max(2, Math.round((cell || S.cell)/2));
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
  korektaPrzestrzenna(d.data, sw, sh, 1/step);
  if(zmiennoscCzynna()) zmiennoscPrzed(d.data, sw, sh, 1/step);
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
/* Rysuje jedną farbę na osobnym płótnie i nakłada ją mnożeniem. Geometria
   z siatki.js; dawne kształty rysowane dokładnie jak wcześniej, nowe i linie
   z konturów (ten sam opis trafia do SVG). */
function drawScreen(target, smp, W,H, ink, z){
  z = z || 1;
  const g = geometria(smp, W, H, ink, z), ksztalt = ink.ksztalt || S.shape;
  const c=document.createElement("canvas"); c.width=W*z; c.height=H*z;
  const x=c.getContext("2d");
  x.fillStyle=ink.color; x.strokeStyle=ink.color;
  if(g.linie){
    x.beginPath();
    for(const l of g.linie){
      const k = konturLinii(l);
      x.moveTo(k[0][0], k[0][1]);
      for(let i=1; i<k.length; i++) x.lineTo(k[i][0], k[i][1]);
      x.closePath();
    }
    x.fill();
  } else if(NOWE_KSZTALTY.includes(ksztalt)){
    x.beginPath();
    for(const [px,py,r,kat] of g.kropki) for(const k of kontury(ksztalt, px, py, r, kat)){
      x.moveTo(k[0][0], k[0][1]);
      for(let i=1; i<k.length; i++) x.lineTo(k[i][0], k[i][1]);
      x.closePath();
    }
    x.fill("evenodd");
  } else {
    const cell = g.cell;
    for(const [px,py,r,kat] of g.kropki){
      x.save(); x.translate(px,py); x.rotate(kat);
      switch(ksztalt){
        case "square": x.fillRect(-r,-r,r*2,r*2); break;
        case "diamond": x.beginPath(); x.moveTo(0,-r*1.3); x.lineTo(r*1.3,0); x.lineTo(0,r*1.3); x.lineTo(-r*1.3,0); x.closePath(); x.fill(); break;
        case "line": x.fillRect(-cell*0.75, -r*0.9, cell*1.5, r*1.8); break;
        case "cross": x.fillRect(-r*1.5,-r*0.45,r*3,r*0.9); x.fillRect(-r*0.45,-r*1.5,r*0.9,r*3); break;
        default: x.beginPath(); x.arc(0,0,r,0,6.2832); x.fill();
      }
      x.restore();
    }
  }
  fakturaFarby(c, W, H, z, ink.color);
  target.save();
  target.globalCompositeOperation="multiply";
  if(ink.krycie !== undefined && ink.krycie < 1) target.globalAlpha = ink.krycie;
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

  /* Risograf: 1–4 farby, każda z własnym rastrem (kąt, gęstość, kształt),
     kryciem i pasowaniem (przesunięcie, obrót płyty), i z tym, skąd bierze
     ilość farby: jasność, kanał R/G/B, rozbicie CMYK albo „swój kolor" —
     rzut ciemności piksela na ciemność farby (różowa farba bierze to, co
     w obrazie różowe i ciemne). Farby nakładane mnożeniem, więc z dwóch
     robi się trzecia, jak na papierze. */
  if(S.inkmode==="riso"){
    const zrodla = {
      jasnosc: () => (r,g,b) => 1 - lum(r,g,b),
      r: () => (r) => 1 - r/255, g: () => (r,g) => 1 - g/255, b: () => (r,g,b) => 1 - b/255,
      c: () => (r,g,b) => cmyk(r,g,b)[0], m: () => (r,g,b) => cmyk(r,g,b)[1],
      y: () => (r,g,b) => cmyk(r,g,b)[2], k: () => (r,g,b) => cmyk(r,g,b)[3],
      farba: kol => {
        const f = hex2rgb(kol).map(v => 1 - v/255), ff = f[0]*f[0] + f[1]*f[1] + f[2]*f[2] || 1;
        return (r,g,b) => Math.max(0, ((1-r/255)*f[0] + (1-g/255)*f[1] + (1-b/255)*f[2])/ff);
      }
    };
    /* losowe pasowanie: przesunięcie do ±6 px i obrót do ±1° na farbę,
       ze skrótu numeru farby i wariantu — powtarzalne, inne przy każdym wariancie */
    const farby = [], los = (S.risoLos || 0)/100, wr = S.risoWariant | 0;
    const rzut = (i, k) => (skrot(i, k, wr*31 + 7) - 0.5)*2*los;
    for(let i=1; i<=Math.max(1, Math.min(4, S.risoIle|0)); i++){
      const kol = S["risoK"+i], zr = zrodla[S["risoZ"+i]] || zrodla.farba;
      farby.push({color: kol, ang: S["risoA"+i], cov: zr(kol), name: "farba-"+i,
        off: los ? [S["risoX"+i] + rzut(i, 1)*6, S["risoY"+i] + rzut(i, 2)*6] : [S["risoX"+i], S["risoY"+i]],
        cell: S["risoC"+i], ksztalt: S["risoS"+i],
        krycie: S["risoO"+i]/100, obrot: S["risoR"+i]/10 + (los ? rzut(i, 3) : 0)});
    }
    return farby;
  }
  return [
    {color:"#FFE800", ang:S.ang-45, cov:(r,g,b)=>cmyk(r,g,b)[2], off:off(1), name:"yellow"},
    {color:"#EC008C", ang:S.ang+30, cov:(r,g,b)=>cmyk(r,g,b)[1], off:off(2), name:"magenta"},
    {color:"#00AEEF", ang:S.ang-30, cov:(r,g,b)=>cmyk(r,g,b)[0], off:off(3), name:"cyan"},
    {color:S.ink,     ang:S.ang,    cov:(r,g,b)=>cmyk(r,g,b)[3], off:off(4), name:"key"}
  ];
}
/* papier i wszystkie farby, bez ziarna i efektów, na płótnie (W·z)×(H·z) */
function rysujRaster(ctx, W, H, z){
  ctx.fillStyle = S.paper; ctx.fillRect(0,0,W*z,H*z);
  const farby = inkList();
  /* próbki tak gęsto, jak wymaga najdrobniejsza farba (risograf: każda ma własną gęstość) */
  const smp = sampler(W, H, Math.min(...farby.map(k => k.cell || S.cell)));
  for(const k of farby) drawScreen(ctx, smp, W,H, k, z);
}
export function renderHalftone(scale){
  const z = Math.max(1, Math.round(scale));
  const [W,H] = fit(S.img.width, S.img.height, MAX);   /* kadr podglądu */
  const OW = W*z, OH = H*z;                            /* kadr wyjścia */
  out.width=OW; out.height=OH;
  out.classList.remove("pixelated");
  rysujRaster(octx, W, H, z);

  /* Efekty przed ziarnem: ziarno jest losowe, więc gdyby szło pierwsze,
     sortowanie wychodziłoby inaczej przy każdym renderze. Kolejność sortowania
     liczymy na siatce podglądu — przy zapisie w skali z pomocniczego renderu
     1× — i przenosimy blokami z×z. Tylko tak zapis jest powiększeniem
     podglądu, a nie przesortowaniem od nowa w wyższej rozdzielczości. */
  if(efektyPo()){
    const d = octx.getImageData(0,0,OW,OH);
    /* obraz w kadrze podglądu: przy z=1 to ten sam bufor, przy zapisie w skali
       pomocniczy render 1× — na nim liczą się sortowanie, poświata, JPEG… */
    let maly = d.data;
    if(z > 1){
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d");
      rysujRaster(x, W, H, 1);
      maly = x.getImageData(0,0,W,H).data;
    }
    uruchomWSkali(d.data, maly, W, H, z);
    octx.putImageData(d,0,0);
  }

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
