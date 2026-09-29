import { S } from "./state.js";
import { palette, nearest, quantizer } from "./palettes.js";
import { K, BAYER2, BAYER4, BAYER8, CLUSTER } from "./kernels.js";
import { adjustPixels } from "./image.js";
import { efektyWlaczone, permutacjaSortu, zastosujPermutacje, przesuniecieRGB, przesunRGB } from "./effects.js";

/* Samo liczenie ditheringu: korekta tonalna i algorytm, w miejscu na buforze
   RGBA. Ani jednego odwołania do DOM-u, bo ten moduł biega też w workerze
   (src/worker.js) — canvas i ImageData zostają po stronie dither.js. */
export function ditherPixels(p, w, h){
  adjustPixels(p);

  const pal = palette(), q = quantizer(), bias = S.thr*2.55;
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
        const n = q ? q(or,og,ob) : nearest(pal, or,og,ob);
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
        const n = q ? q(p[i]+o, p[i+1]+o, p[i+2]+o) : nearest(pal, p[i]+o, p[i+1]+o, p[i+2]+o);
        p[i]=n[0]; p[i+1]=n[1]; p[i+2]=n[2];
      }
    }
  }
}

/* Dithering razem z efektami po rastrze — to woła worker i fallback, żeby oba
   liczyły dokładnie to samo. Efekty idą na buforze roboczym, jeszcze przed
   powiększeniem do podglądu, więc zapis w dowolnej skali jest powiększeniem.
   Przesunięcie podajemy w pikselach obrazu, a bufor jest po pikselizacji,
   stąd jednostka 1/pix. */
export function ditherIEfekty(p, w, h){
  ditherPixels(p, w, h);
  if(!efektyWlaczone()) return;
  const perm = permutacjaSortu(p, w, h);
  if(perm) zastosujPermutacje(p, perm, w, h, 1);
  const [dx, dy] = przesuniecieRGB(1/S.pix);
  przesunRGB(p, w, h, dx, dy);
}
