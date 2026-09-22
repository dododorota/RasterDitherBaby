import { S, MAX } from "./state.js";
import { out, octx } from "./dom.js";
import { palette, nearest } from "./palettes.js";
import { K, BAYER2, BAYER4, BAYER8, CLUSTER } from "./kernels.js";
import { adjust, fit } from "./image.js";

/* ---------- tryb 1: dithering ---------- */
export function ditherData(){
  const [fw,fh] = fit(S.img.width, S.img.height, MAX);
  const w = Math.max(1, Math.round(fw/S.pix)), h = Math.max(1, Math.round(fh/S.pix));
  const c = document.createElement("canvas"); c.width=w; c.height=h;
  const ctx = c.getContext("2d");
  ctx.drawImage(S.img, 0,0, w,h);
  const d = ctx.getImageData(0,0,w,h);
  adjust(d);

  const pal = palette(), p = d.data, bias = S.thr*2.55;
  const diff = K[S.algo];

  if(diff){
    const buf = new Float32Array(w*h*3);
    for(let i=0,j=0;i<p.length;i+=4,j+=3){ buf[j]=p[i]+bias; buf[j+1]=p[i+1]+bias; buf[j+2]=p[i+2]+bias; }
    for(let y=0;y<h;y++){
      const rev = S.serp && (y&1);
      for(let k=0;k<w;k++){
        const x = rev ? w-1-k : k;
        const idx=(y*w+x)*3;
        const or=buf[idx], og=buf[idx+1], ob=buf[idx+2];
        const n = nearest(pal, or,og,ob);
        buf[idx]=n[0]; buf[idx+1]=n[1]; buf[idx+2]=n[2];
        const er=(or-n[0])*S.str, eg=(og-n[1])*S.str, eb=(ob-n[2])*S.str;
        for(const [dx,dy,wt] of diff.m){
          const nx = x + (rev ? -dx : dx), ny = y+dy;
          if(nx<0||nx>=w||ny>=h) continue;
          const ni=(ny*w+nx)*3, f=wt/diff.d;
          buf[ni]+=er*f; buf[ni+1]+=eg*f; buf[ni+2]+=eb*f;
        }
      }
    }
    for(let i=0,j=0;i<p.length;i+=4,j+=3){ p[i]=buf[j]; p[i+1]=buf[j+1]; p[i+2]=buf[j+2]; }
  } else {
    let mat=null, size=1, div=1;
    if(S.algo==="bayer2"){mat=BAYER2;size=2;div=4;}
    else if(S.algo==="bayer4"){mat=BAYER4;size=4;div=16;}
    else if(S.algo==="bayer8"){mat=BAYER8;size=8;div=64;}
    else if(S.algo==="cluster"){mat=CLUSTER;size=4;div=16;}
    const spread = 255/Math.max(2, pal.length-1) * S.str;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        let t = 0;
        if(mat) t = (mat[y%size][x%size]/div - 0.5);
        else if(S.algo==="noise") t = Math.random()-0.5;
        const o=t*spread + bias, i=(y*w+x)*4;
        const n = nearest(pal, p[i]+o, p[i+1]+o, p[i+2]+o);
        p[i]=n[0]; p[i+1]=n[1]; p[i+2]=n[2];
      }
    }
  }
  ctx.putImageData(d,0,0);
  return {c, w, h, d};
}
export function renderDither(scale){
  const {c,w,h} = ditherData();
  const S2 = Math.max(1, Math.round(S.pix*scale));
  out.width = w*S2; out.height = h*S2;
  octx.imageSmoothingEnabled = false;
  octx.clearRect(0,0,out.width,out.height);
  octx.drawImage(c, 0,0, out.width, out.height);
  out.classList.add("pixelated");
}
