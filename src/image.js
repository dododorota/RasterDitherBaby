import { S } from "./state.js";

/* ---------- korekta ---------- */
export function lut(){
  const t=new Uint8ClampedArray(256);
  const c = S.con, f = (259*(c+255))/(255*(259-c));
  for(let i=0;i<256;i++){
    let v = i + S.bri*2.55;
    v = f*(v-128)+128;
    v = 255*Math.pow(Math.max(0,Math.min(255,v))/255, 1/S.gam);
    t[i] = S.inv ? 255-v : v;
  }
  return t;
}
export function adjust(d){
  const t=lut(), p=d.data;
  for(let i=0;i<p.length;i+=4){ p[i]=t[p[i]]; p[i+1]=t[p[i+1]]; p[i+2]=t[p[i+2]]; }
}
export function fit(w,h,max){
  const s = Math.min(1, max/Math.max(w,h));
  return [Math.max(1,Math.round(w*s)), Math.max(1,Math.round(h*s))];
}
