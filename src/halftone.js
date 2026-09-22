import { S, MAX } from "./state.js";
import { out, octx } from "./dom.js";
import { adjust, fit } from "./image.js";

/* ---------- tryb 2: raster drukarski ---------- */
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
  return {d:d.data, sw, sh, step};
}
export function collectScreen(smp, W,H, angle, cov, off){
  const dots=[];
  const a=angle*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a);
  const cell=S.cell, R=Math.ceil((W+H)/cell)+2, maxR=0.564*cell*S.dot;
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
      dots.push([px, py, maxR*Math.sqrt(Math.min(1.35,k))]);
    }
  }
  return {dots, a, cell};
}
function drawScreen(target, smp, W,H, angle, color, cov, off){
  const {dots,a,cell} = collectScreen(smp,W,H,angle,cov,off);
  const c=document.createElement("canvas"); c.width=W; c.height=H;
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
  const [W,H] = fit(S.img.width*scale, S.img.height*scale, MAX*scale);
  out.width=W; out.height=H;
  out.classList.remove("pixelated");
  octx.fillStyle = S.paper; octx.fillRect(0,0,W,H);
  const smp = sampler(W,H);
  for(const k of inkList()) drawScreen(octx, smp, W,H, k.ang, k.color, k.cov, k.off);

  if(S.grain){
    const d=octx.getImageData(0,0,W,H), p=d.data, g=S.grain*1.6;
    for(let i=0;i<p.length;i+=4){
      const n=(Math.random()-0.5)*g;
      p[i]+=n; p[i+1]+=n; p[i+2]+=n;
    }
    octx.putImageData(d,0,0);
  }
}
