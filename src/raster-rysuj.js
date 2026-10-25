/* Rysowanie rastra — bez DOM-u, więc biega i na stronie, i w workerze
   (worker-raster.js). Wejście to gotowe próbki obrazu z sampler()
   (halftone.js — ten potrzebuje S.img i zostaje na stronie), wyjście —
   płótno 2D (<canvas> albo OffscreenCanvas, patrz plotno.js).

   `z` to krotność zapisu. Cała siatka liczy się zawsze w pikselach podglądu,
   a przez `z` mnożona jest dopiero gotowa geometria punktu — opis
   w halftone.js i CLAUDE.md. */
import { S } from "./state.js";
import { hex2rgb, wpisPalety, gradientLUT } from "./palettes.js";
import { efektyPo, uruchomWSkali } from "./stos.js";
import { geometria, obrys, konturLinii, odcinkiBarwne, kolorCSS, sciezkowy, grubostObrysu, znakPunktu } from "./siatki.js";
import { fakturaFarby } from "./faktura-farby.js";
import { skrot } from "./fx.js";
import { papier, wypelnijTlo } from "./papier.js";
import { znakiWGrupach, wersja, wymiaryZnaku, rozmiarWersji } from "./znaki-tonu.js";
import { plotno } from "./plotno.js";

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
  const c=plotno(W*z, H*z);
  const x=c.getContext("2d");
  x.fillStyle=ink.color; x.strokeStyle=ink.color;
  x.lineWidth = grubostObrysu()*z; x.lineJoin = "round";
  /* kwadraty kodu QR: kolor farby (przy kolorowych punktach — farba z panelu) */
  if(g.dodatki){ x.save(); x.fillStyle = ink.barwa ? S.ink : ink.color; x.beginPath(); for(const k of g.dodatki) sciezka(x, k); x.fill(); x.restore(); }
  if(ksztalt === "tony" && g.kropki) rysujZnaki(x, g, ink);
  else if(ink.barwa) rysujBarwne(x, g, ksztalt);
  else if(g.plamy){ x.beginPath(); for(const k of g.plamy) sciezka(x, k); if(grubostObrysu() > 0) x.stroke(); else x.fill("evenodd"); }
  else if(g.linie) rysujLinie(x, g.linie);
  else rysujGrupe(x, g.kropki, g, ksztalt);
  if(S.ostreKrawedzie) progKrycia(c);
  fakturaFarby(c, W, H, z, ink.color);
  target.save();
  target.globalCompositeOperation = mieszanieFarby(ink);
  if(ink.krycie !== undefined && ink.krycie < 1) target.globalAlpha = ink.krycie;
  target.drawImage(c,0,0);
  target.restore();
}
/* Ostre krawędzie (Crisp Edges): płótno 2D nie umie rysować ścieżek bez
   wygładzania, więc krycie warstwy farby przycinamy progiem ½ — zanim
   faktura farby zrobi swoje miękkie brzegi. W SVG: shape-rendering. */
function progKrycia(c){
  const x = c.getContext("2d"), d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  for(let i=3; i<p.length; i+=4) p[i] = p[i] >= 128 ? 255 : 0;
  x.putImageData(d, 0, 0);
}
/* Grupa punktów jednego koloru (fillStyle/strokeStyle już ustawione):
   znaki tekstem, kształty ścieżką (nowe, postrzępione, obrys) albo wprost
   (dawne — co do piksela jak przed dodaniem ścieżek). */
const PORCJA = 300;
const sciezka = (x, k) => { x.moveTo(k[0][0], k[0][1]); for(let i=1; i<k.length; i++) x.lineTo(k[i][0], k[i][1]); x.closePath(); };
function rysujGrupe(x, kropki, g, ksztalt, numery){
  const obr = grubostObrysu() > 0;
  if(ksztalt === "znak"){
    x.textAlign = "center"; x.textBaseline = "middle";
    kropki.forEach((kr, i) => {
      const [px, py, r, kat] = kr;
      x.save(); x.translate(px, py); x.rotate(kat);
      if(kr[7] !== undefined) x.scale(kr[7], kr[8]);
      x.font = '700 ' + (r*2.6).toFixed(2) + 'px Archivo, "Segoe UI Emoji", sans-serif';
      const z = znakPunktu(numery ? numery.get(kr) : i);
      if(obr) x.strokeText(z, 0, 0); else x.fillText(z, 0, 0);
      x.restore();
    });
    return;
  }
  /* Kształty ścieżką: reguła nonzero (nie evenodd — tam część wspólna
     nakładających się punktów wychodziła dziurą, w ciemnych tonach białe
     plamki) i porcjami po PORCJA punktów — jedna ścieżka z dziesiątkami
     tysięcy kształtów wypełniała się w Chrome kilka sekund. */
  if(sciezkowy(ksztalt, g)){
    for(let i=0; i<kropki.length; i+=PORCJA){
      x.beginPath();
      for(const kr of kropki.slice(i, i + PORCJA)) for(const k of obrys(ksztalt, kr, g.postrzep, g.cell)) sciezka(x, k);
      if(obr) x.stroke(); else x.fill("nonzero");
    }
    return;
  }
  /* Powrót do jednostkowej zamiast save/restore przy każdej kropce — płótno
     farby ma na wejściu transformację jednostkową (jak w rysujZnaki), a stos
     save/restore przy ~100 tys. kropek (oczko 2,5) to była połowa czasu
     renderu. Dalej translate + rotate, nie gotowa macierz z cos/sin: Chrome
     liczy rotate() o ostatnią cyfrę inaczej i kilka kropek CMYK zmieniało
     antyaliasing o 1/255. */
  const cell = g.cell;
  for(const [px,py,r,kat] of kropki){
    x.setTransform(1, 0, 0, 1, 0, 0); x.translate(px,py); x.rotate(kat);
    switch(ksztalt){
      case "square": x.fillRect(-r,-r,r*2,r*2); break;
      case "diamond": x.beginPath(); x.moveTo(0,-r*1.3); x.lineTo(r*1.3,0); x.lineTo(0,r*1.3); x.lineTo(-r*1.3,0); x.closePath(); x.fill(); break;
      case "line": x.fillRect(-cell*0.75, -r*0.9, cell*1.5, r*1.8); break;
      case "cross": x.fillRect(-r*1.5,-r*0.45,r*3,r*0.9); x.fillRect(-r*0.45,-r*1.5,r*0.9,r*3); break;
      default: x.beginPath(); x.arc(0,0,r,0,6.2832); x.fill();
    }
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
}
function rysujLinie(x, linie){
  x.beginPath();
  for(const l of linie) sciezka(x, konturLinii(l));
  if(grubostObrysu() > 0) x.stroke(); else x.fill();
}
/* Jak warstwa farby kładzie się na papier: farby mnożeniem (z dwóch robi
   się trzecia), kolory — zwyczajnie. Znaki według tonu w kolorach poziomów
   albo w oryginalnych barwach obrazków to kolory, nie farba — chyba że
   w risografie, gdzie każda warstwa jest farbą. */
export function mieszanieFarby(ink){
  if(ink.mieszanie) return ink.mieszanie;
  const tony = (ink.ksztalt || S.shape) === "tony" && S.inkmode !== "riso" && S.znakiBarwa !== "farba";
  return tony ? "source-over" : "multiply";
}
/* Znaki według tonu: grupy po poziomie i kolorze (znakiWGrupach — te same
   co w SVG). Poziom bez obrazka rysuje się kształtem z listy, jak zwykły
   punkt; z obrazkiem — obrazek wpisany w kwadrat 2r, obrócony z punktem. */
function rysujZnaki(x, g, ink){
  for(const gr of znakiWGrupach(g.kropki, ink)){
    if(!gr.znak){ x.fillStyle = x.strokeStyle = gr.kolor; rysujGrupe(x, gr.kropki, g, gr.ksztalt, gr.numery); continue; }
    const wersje = new Map();
    for(const kr of gr.kropki){
      const [px, py, r, kat] = kr, [w, h] = wymiaryZnaku(gr.znak, r, kr);
      if(w < 0.25 && h < 0.25) continue;
      const P = rozmiarWersji(Math.max(w, h));
      let o = wersje.get(P);
      if(!o) wersje.set(P, o = wersja(gr.znak, gr.kolorObrazka, S.znakiMiesz, P));
      const c = Math.cos(kat), s = Math.sin(kat);
      x.setTransform(c, s, -s, c, px, py);
      x.drawImage(o, -w/2, -h/2, w, h);
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
}
/* Punkty i linie z własnym kolorem: grupy po kolorze, linie odcinkami
   jednego koloru (odcinkiBarwne). Znaki zachowują kolejność z całej siatki. */
function rysujBarwne(x, g, ksztalt){
  const obr = grubostObrysu() > 0;
  if(g.linie){
    for(const l of g.linie) for(const [odc, kolor] of odcinkiBarwne(l)){
      x.fillStyle = x.strokeStyle = kolor; x.beginPath(); sciezka(x, konturLinii(odc)); if(obr) x.stroke(); else x.fill();
    }
    return;
  }
  const grupy = new Map(), numery = new Map();
  g.kropki.forEach((kr, i) => { numery.set(kr, i); const k = kolorCSS(kr[5]); let gr = grupy.get(k); if(!gr) grupy.set(k, gr = []); gr.push(kr); });
  for(const [kolor, kropki] of grupy){ x.fillStyle = x.strokeStyle = kolor; rysujGrupe(x, kropki, g, ksztalt, numery); }
}
export function inkList(){
  const lum = (r,g,b) => (0.299*r+0.587*g+0.114*b)/255;
  const m = S.mis;
  /* przesunięcie pasowania liczone deterministycznie, żeby podgląd i eksport były identyczne */
  const off = i => m ? [Math.sin(i*12.9898+1.3)*m/14, Math.cos(i*78.233+0.7)*m/14] : [0,0];

  if(S.inkmode==="mono")
    return [{color:S.ink, ang:S.ang, cov:(r,g,b)=>1-lum(r,g,b), off:[0,0], name:"farba"}];

  /* Jedna siatka, ale każdy punkt ma własny kolor: z obrazu albo z mapy
     gradientu (ton → kolor). Rozmiar z ciemności — albo z jasności, na
     ciemny papier. Kładzione zwyczajnie (source-over), nie mnożeniem —
     to kolory, nie farby. */
  if(S.inkmode==="obraz" || S.inkmode==="gradient"){
    const cov = S.rozmiarJasnosc ? (r,g,b)=>lum(r,g,b) : (r,g,b)=>1-lum(r,g,b);
    let barwa;
    if(S.inkmode==="obraz") barwa = (r,g,b) => [r, g, b];
    else {
      const wpis = wpisPalety(S.rasterGrad) || wpisPalety("g-zachod"), lut = gradientLUT(wpis.kolory, S.gradOdwroc);
      barwa = (r,g,b) => lut[Math.max(0, Math.min(255, Math.round(lum(r,g,b)*255)))];
    }
    return [{color:"#000000", ang:S.ang, cov, barwa, mieszanie:"source-over", off:[0,0], name:"kolory"}];
  }

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
function rysujRaster(ctx, W, H, z, smp){
  wypelnijTlo(ctx, W, H, z);
  papier(ctx, W, H, z);
  for(const k of inkList()) drawScreen(ctx, smp, W,H, k, z);
}
/* próbki tak gęsto, jak wymaga najdrobniejsza farba (risograf: każda ma
   własną gęstość) — sampler() w halftone.js bierze stąd oczko */
export const oczkoProbek = () => Math.min(...inkList().map(k => k.cell || S.cell));
/* Cały raster na płótnie ctx (W·z × H·z, świeże): papier, farby, efekty,
   ziarno. Efekty przed ziarnem: ziarno jest losowe, więc gdyby szło
   pierwsze, sortowanie wychodziłoby inaczej przy każdym renderze. Kolejność
   sortowania liczymy na siatce podglądu — przy zapisie w skali
   z pomocniczego renderu 1× (z tych samych próbek) — i przenosimy blokami
   z×z. Tylko tak zapis jest powiększeniem podglądu, a nie przesortowaniem
   od nowa w wyższej rozdzielczości. */
export function rasterPelny(ctx, W, H, z, smp){
  const OW = W*z, OH = H*z;
  rysujRaster(ctx, W, H, z, smp);

  if(efektyPo()){
    const d = ctx.getImageData(0,0,OW,OH);
    /* obraz w kadrze podglądu: przy z=1 to ten sam bufor, przy zapisie w skali
       pomocniczy render 1× — na nim liczą się sortowanie, poświata, JPEG… */
    let maly = d.data;
    if(z > 1){
      const x = plotno(W, H).getContext("2d");
      rysujRaster(x, W, H, 1, smp);
      maly = x.getImageData(0,0,W,H).data;
    }
    uruchomWSkali(d.data, maly, W, H, z);
    ctx.putImageData(d,0,0);
  }

  if(S.grain){
    const d=ctx.getImageData(0,0,OW,OH), p=d.data, g=S.grain*1.6;
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
    ctx.putImageData(d,0,0);
  }
}
