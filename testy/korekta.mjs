/* Korekta przed rastrem: cienie i światła, nasycenie, odcień, odszumianie,
   wyostrzanie, a do tego głębia koloru i dopasowanie percepcyjne (Oklab).
   Uruchom z katalogu projektu: node testy/korekta.mjs */
import { S, DEFAULTS } from "../src/state.js";
import { lut, adjustPixels, korektaPrzestrzenna } from "../src/image.js";
import { palette, quantizer, oklab } from "../src/palettes.js";
import { ditherPixels } from "../src/dither-core.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };
const ustaw = o => Object.assign(S, DEFAULTS, o);
let ziarno = 5;
const los = () => (ziarno = (Math.imul(ziarno, 1664525) + 1013904223) >>> 0) / 4294967296;
function obraz(w, h, f){
  const p = new Uint8ClampedArray(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const o=(y*w+x)*4, c=f(x,y); p[o]=c[0]; p[o+1]=c[1]; p[o+2]=c[2]; p[o+3]=255; }
  return p;
}

console.log("--- krzywa tonalna ---");
ustaw({});
sprawdz(lut().every((v, i) => v === i), "wszystko neutralne: krzywa = tożsamość");
for(const [k, v] of [["cienie", 100], ["cienie", -100], ["swiatla", 100], ["swiatla", -100]]){
  ustaw({[k]: v});
  const t = lut();
  const rosnie = t.every((x, i) => !i || x >= t[i-1]);
  const kraj = t[0] === 0 && t[255] === 255;
  const sr = k === "cienie" ? t[64] - 64 : t[192] - 192;
  sprawdz(rosnie && kraj && Math.sign(sr) === Math.sign(v), `${k} ${v > 0 ? "+" : ""}${v}: rośnie, czerń i biel na miejscu, ${k === "cienie" ? "poziom 64" : "poziom 192"} → ${k === "cienie" ? t[64] : t[192]}`);
}

console.log("--- barwa ---");
{
  const p = obraz(16, 16, (x, y) => [x*16, y*16, 128]);
  ustaw({nasycenie: -100}); const a = new Uint8ClampedArray(p); adjustPixels(a);
  let szare = true; for(let i=0;i<a.length;i+=4) if(Math.abs(a[i]-a[i+1]) > 1 || Math.abs(a[i+1]-a[i+2]) > 1) szare = false;
  sprawdz(szare, "nasycenie −100: same szarości");
  ustaw({odcien: 120}); const g = obraz(4, 4, () => [77, 77, 77]); adjustPixels(g);
  sprawdz(g.every((v, i) => i % 4 === 3 || Math.abs(v - 77) <= 1), "obrót odcienia nie zabarwia szarości");
  ustaw({odcien: 180}); const c = obraz(1, 1, () => [220, 40, 40]); adjustPixels(c);
  sprawdz(c[2] > c[0] || c[1] > c[0], `czerwień obrócona o 180° przestaje być czerwona: ${[c[0], c[1], c[2]]}`);
  ustaw({odcien: 0, nasycenie: 0}); const n = new Uint8ClampedArray(p); adjustPixels(n);
  sprawdz(n.every((v, i) => v === p[i]), "zero = obraz bez zmian co do bajtu");
}

console.log("--- odszumianie i wyostrzanie ---");
{
  /* płaska szarość z szumem i ostrą krawędzią pośrodku */
  const w = 64, h = 32;
  const p = obraz(w, h, x => { const v = (x < 32 ? 60 : 190) + (los() - 0.5)*40; return [v, v, v]; });
  const war = (q, od, doo) => { let s = 0, s2 = 0, n = 0; for(let y=4;y<h-4;y++) for(let x=od;x<doo;x++){ const v = q[(y*w+x)*4]; s += v; s2 += v*v; n++; } return s2/n - (s/n)**2; };
  ustaw({odszum: 80}); const d = new Uint8ClampedArray(p); korektaPrzestrzenna(d, w, h, 1);
  sprawdz(war(d, 4, 26) < war(p, 4, 26)*0.4, `szum w płaskim polu: wariancja ${war(p, 4, 26).toFixed(0)} → ${war(d, 4, 26).toFixed(0)}`);
  const kr = q => q[(16*w + 34)*4] - q[(16*w + 29)*4];
  sprawdz(kr(d) > 100, `krawędź zostaje ostra (skok ${kr(d)})`);
  const g = obraz(w, h, x => { const v = x < 32 ? 80 : 170; return [v, v, v]; });
  ustaw({ostrosc: 60}); const o = new Uint8ClampedArray(g); korektaPrzestrzenna(o, w, h, 1);
  sprawdz(o[(16*w + 31)*4] < 80 && o[(16*w + 32)*4] > 170, `wyostrzanie: po obu stronach krawędzi obwódka (${o[(16*w + 31)*4]} | ${o[(16*w + 32)*4]})`);
  ustaw({}); const z = new Uint8ClampedArray(p); korektaPrzestrzenna(z, w, h, 1);
  sprawdz(z.every((v, i) => v === p[i]), "wszystko na zero: bez zmian");
}

console.log("--- głębia koloru ---");
{
  ustaw({pal: "glebia", glebia: 2}); const a = palette();
  ustaw({pal: "rgb3"}); const b = palette();
  sprawdz(JSON.stringify(a) === JSON.stringify(b), "głębia 2 = 3-bit RGB (te same kolory, ta sama kolejność)");
  ustaw({pal: "glebia", glebia: 4}); const c = palette();
  ustaw({pal: "quant"}); const d = palette();
  sprawdz(JSON.stringify(c) === JSON.stringify(d), "głębia 4 = „Kolor — 4 poziomy na kanał”");
  for(const n of [3, 7, 16]){
    ustaw({pal: "glebia", glebia: n, algo: "floyd"});
    const q = quantizer(), pal = palette();
    let zle = 0;
    for(let i=0;i<500;i++){
      const r = los()*300 - 20, g = los()*300 - 20, bl = los()*300 - 20;
      let best = 0, bd = Infinity;
      pal.forEach((k, j) => { const dd = (r-k[0])**2*0.299 + (g-k[1])**2*0.587 + (bl-k[2])**2*0.114; if(dd < bd){ bd = dd; best = j; } });
      if(q(r, g, bl).join() !== pal[best].join()) zle++;
    }
    sprawdz(!zle && pal.length === n**3, `głębia ${n}: ${pal.length} kolorów, szybkie szukanie = pełny skan (${zle} różnic na 500)`);
  }
}

console.log("--- dopasowanie percepcyjne ---");
{
  const L = oklab(255, 255, 255), C = oklab(0, 0, 0);
  sprawdz(Math.abs(L[0] - 1) < 1e-6 && Math.abs(L[1]) < 1e-6 && Math.abs(L[2]) < 1e-6 && C.every(v => v === 0), "Oklab: biel (1, 0, 0), czerń (0, 0, 0)");
  for(const [pal, ile] of [["pico8", 16], ["c64", 16]]){
    ustaw({pal, percept: true, algo: "floyd"});
    const dozw = new Set(palette().map(c => c.join()));
    const p = obraz(80, 60, (x, y) => [x*3, y*4, (x*y) & 255]);
    ditherPixels(p, 80, 60);
    let obce = 0; for(let i=0;i<p.length;i+=4) if(!dozw.has(p[i]+","+p[i+1]+","+p[i+2])) obce++;
    ustaw({pal, percept: false, algo: "floyd"});
    const r = obraz(80, 60, (x, y) => [x*3, y*4, (x*y) & 255]);
    ditherPixels(r, 80, 60);
    let rozne = 0; for(let i=0;i<p.length;i++) if(p[i] !== r[i]) rozne++;
    sprawdz(!obce && rozne > 0, `${pal}: tylko kolory palety, wynik inny niż w RGB (${rozne} różnych bajtów)`);
  }
  /* duża paleta: pamięć kubełków — ten sam wynik przy powtórzeniu */
  S.custom = {nazwa: "duża", kolory: Array.from({length: 100}, () => [los()*256|0, los()*256|0, los()*256|0])};
  ustaw({pal: "custom", percept: true, algo: "atkinson"});
  const a = obraz(64, 64, (x, y) => [x*4, y*4, 128]), b = obraz(64, 64, (x, y) => [x*4, y*4, 128]);
  ditherPixels(a, 64, 64); ditherPixels(b, 64, 64);
  sprawdz(a.every((v, i) => v === b[i]), "paleta 100 kolorów: powtarzalnie co do bajtu");
}

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
