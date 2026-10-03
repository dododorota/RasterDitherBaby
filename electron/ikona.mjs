/* Generuje ikonę aplikacji (electron/ikona.png, 512×512): koło z rastra riso —
   niebieski i fluo róż pod różnymi kątami, nałożone mnożeniem na kremowym
   papierze. Bez zależności: własny zapis PNG przez zlib.
   Uruchom: node electron/ikona.mjs */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const N = 512, SS = 4, papier = [245, 241, 232];
const farby = [{kolor: [0, 120, 191], kat: 75, przes: [-10, 6]}, {kolor: [255, 72, 176], kat: 15, przes: [10, -6]}];
const KOMORKA = 34, PROMIEN = 200, ROG = 100;

/* pokrycie: koło jasne w lewym górnym rogu, ciemne w prawym dolnym */
const pokrycie = (x, y, [px, py]) => {
  const dx = x - N/2 - px, dy = y - N/2 - py, d = Math.hypot(dx, dy);
  if(d > PROMIEN) return 0;
  return Math.min(1, 0.25 + 0.75*((dx + dy)/(2*PROMIEN) + 0.5));
};
/* czy punkt (x, y) leży w kropce rastra farby */
const wKropce = (x, y, f) => {
  const a = f.kat*Math.PI/180, c = Math.cos(a), s = Math.sin(a);
  const u = x*c + y*s, v = -x*s + y*c;
  const cu = (Math.round(u/KOMORKA))*KOMORKA, cv = (Math.round(v/KOMORKA))*KOMORKA;
  const sx = cu*c - cv*s, sy = cu*s + cv*c;              /* środek kropki z powrotem w układ obrazu */
  const k = pokrycie(sx, sy, f.przes);
  return k > 0 && Math.hypot(u - cu, v - cv) < 0.5*KOMORKA*Math.sqrt(k);
};

const wiersze = Buffer.alloc(N*(N*4 + 1));
for(let y=0; y<N; y++){
  wiersze[y*(N*4 + 1)] = 0;
  for(let x=0; x<N; x++){
    let r = 0, g = 0, b = 0, al = 0;
    for(let j=0; j<SS; j++) for(let i=0; i<SS; i++){
      const px = x + (i + 0.5)/SS, py = y + (j + 0.5)/SS;
      /* zaokrąglony kwadrat */
      const qx = Math.max(ROG - px, px - (N - ROG), 0), qy = Math.max(ROG - py, py - (N - ROG), 0);
      if(Math.hypot(qx, qy) > ROG) continue;
      let c = papier.slice();
      for(const f of farby) if(wKropce(px, py, f)) c = c.map((v, k) => v*f.kolor[k]/255);
      r += c[0]; g += c[1]; b += c[2]; al += 255;
    }
    const o = y*(N*4 + 1) + 1 + x*4, n = SS*SS, w = al/255;
    wiersze[o] = w ? Math.round(r/w) : 0; wiersze[o+1] = w ? Math.round(g/w) : 0; wiersze[o+2] = w ? Math.round(b/w) : 0; wiersze[o+3] = Math.round(al/n);
  }
}

const crc = (() => { const t = new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n]=c>>>0; } return b => { let c = 0xffffffff; for(const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
const kawalek = (typ, dane) => { const d = Buffer.concat([Buffer.from(typ), dane]), o = Buffer.alloc(4), k = Buffer.alloc(4); o.writeUInt32BE(dane.length); k.writeUInt32BE(crc(d)); return Buffer.concat([o, d, k]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(new URL("./ikona.png", import.meta.url), Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), kawalek("IHDR", ihdr), kawalek("IDAT", deflateSync(wiersze)), kawalek("IEND", Buffer.alloc(0))]));
console.log("electron/ikona.png");
