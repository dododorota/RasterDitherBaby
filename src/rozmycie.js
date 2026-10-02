/* Rozmycie gaussowskie na buforze RGBA. Czysty moduł, bez DOM-u — używa go
   raster (rozmycie przed siatką, halftone.js) i poświata (effects.js, także
   w workerze). Działa na dowolnej tablicy z krokiem 4: Uint8 przycina wynik,
   Float32 zostawia ułamki i wartości ponad 255 (poświata ponad 100%).

   Rozdzielone na przebieg poziomy i pionowy (pionowy to ten sam kod po
   transpozycji). Brzeg domykamy powtórzeniem skrajnej próbki, alfy nie
   ruszamy — i raster, i poświata patrzą tylko na RGB.

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
export function rozmyj(p, w, h, sigma){
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
