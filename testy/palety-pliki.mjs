/* Parsery plików palet: PICO-8 w każdym formacie daje te same 16 kolorów,
   binarny .ase z RGB/Gray/CMYK/Lab, pliki złe są odrzucane z opisem.
   Uruchom z katalogu projektu: node testy/palety-pliki.mjs */
import { czytajPalete } from "../src/palette-files.js";

const PICO = ["000000","1d2b53","7e2553","008751","ab5236","5f574f","c2c3c7","fff1e8",
              "ff004d","ffa300","ffec27","00e436","29adff","83769c","ff77a8","ffccaa"];
const rgb = h => [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
const oczekiwane = PICO.map(rgb);
const buf = s => new TextEncoder().encode(s).buffer;

const pliki = {
  "pico-8.hex": PICO.join("\n")+"\n",
  "pico-8.gpl": "GIMP Palette\nName: PICO-8\nColumns: 4\n#\n" +
                oczekiwane.map(([r,g,b],i)=>`${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\tkolor ${i}`).join("\n")+"\n",
  "pico-8.pal": "JASC-PAL\r\n0100\r\n16\r\n" + oczekiwane.map(c=>c.join(" ")).join("\r\n")+"\r\n",
  "pico-8.txt": ";paint.net Palette File\n;Downloaded from Lospec.com/palette-list\n;Palette Name: PICO-8\n;Colors: 16\n" +
                PICO.map(h=>"FF"+h.toUpperCase()).join("\n")+"\n",
  "z-bomem.hex": "﻿#000000\r\n#1D2B53\r\n\r\n#7e2553\r\n"
};

/* binarny .ase: grupa z nazwą, 3 kolory RGB (jeden powtórzony), Gray, CMYK, Lab */
function zbudujAse(){
  const bloki = [];
  const nazwaUtf16 = s => { const b=[]; const n=s.length+1; b.push(n>>8,n&255); for(const ch of s){ const c=ch.charCodeAt(0); b.push(c>>8,c&255);} b.push(0,0); return b; };
  const f32 = x => { const a=new DataView(new ArrayBuffer(4)); a.setFloat32(0,x); return [...new Uint8Array(a.buffer)]; };
  const blok = (typ, tresc) => { const d=tresc.length; return [typ>>8,typ&255, (d>>>24)&255,(d>>>16)&255,(d>>>8)&255,d&255, ...tresc]; };
  const kolor = (nazwa, model, wart) => blok(0x0001, [...nazwaUtf16(nazwa), ...[...model].map(c=>c.charCodeAt(0)), ...wart.flatMap(f32), 0,2]);
  bloki.push(blok(0xC001, nazwaUtf16("Moja Grupa")));
  bloki.push(kolor("czerwony","RGB ",[1,0,0]));
  bloki.push(kolor("granat","RGB ",[29/255,43/255,83/255]));
  bloki.push(kolor("czerwony znowu","RGB ",[1,0,0]));
  bloki.push(kolor("szary","Gray",[0.5]));
  bloki.push(kolor("cyjan","CMYK",[1,0,0,0]));
  bloki.push(kolor("lab","LAB ",[50,20,-30]));
  bloki.push(blok(0xC002, []));
  const glowa = [0x41,0x53,0x45,0x46, 0,1,0,0, 0,0,0,bloki.length];
  return new Uint8Array([...glowa, ...bloki.flat()]).buffer;
}

let bledy = 0;
const zgodne = (a,b) => a.length===b.length && a.every((c,i)=>c[0]===b[i][0]&&c[1]===b[i][1]&&c[2]===b[i][2]);
for(const [plik, tresc] of Object.entries(pliki)){
  try{
    const p = czytajPalete(plik, buf(tresc));
    const ok = plik==="z-bomem.hex" ? zgodne(p.kolory, oczekiwane.slice(0,3)) : zgodne(p.kolory, oczekiwane);
    if(!ok) bledy++;
    console.log(plik.padEnd(13), (ok?"ok":"ZŁE KOLORY").padEnd(11), String(p.kolory.length).padStart(3), "kolorów  nazwa:", JSON.stringify(p.nazwa), p.uwagi.length?" uwagi: "+p.uwagi.join("; "):"");
  }catch(e){ bledy++; console.log(plik.padEnd(13), "WYJĄTEK:", e.message); }
}
const a = czytajPalete("cokolwiek.bin", zbudujAse());
const okAse = zgodne(a.kolory, [[255,0,0],[29,43,83],[128,128,128],[0,255,255]]) && a.nazwa === "Moja Grupa";
if(!okAse) bledy++;
console.log("paleta.ase".padEnd(13), (okAse?"ok":"ŹLE").padEnd(11), String(a.kolory.length).padStart(3), "kolorów  nazwa:", JSON.stringify(a.nazwa), " uwagi:", a.uwagi.join("; "));

console.log("\n--- pliki złe (mają zostać odrzucone) ---");
const zle = {
  "pusty.hex": "",
  "jeden.hex": "ff0000\n",
  "same-duplikaty.hex": "ff0000\nFF0000\n#ff0000\n",
  "smieci.hex": "to nie jest paleta\nani trochę\n",
  "zdjecie.png": "\x89PNG\r\n\x1a\n\0\0\0\rIHDR",
  "uciety.ase": null
};
for(const [plik, tresc] of Object.entries(zle)){
  const b = tresc===null ? zbudujAse().slice(0, 40) : buf(tresc);
  try{ const p=czytajPalete(plik, b); bledy++; console.log(plik.padEnd(19), "NIE ODRZUCONY:", p.kolory.length, "kolorów"); }
  catch(e){ console.log(plik.padEnd(19), "odrzucony →", e.message); }
}
const duza = Array.from({length:300},(_,i)=>((i*40503)&0xffffff).toString(16).padStart(6,"0")).join("\n");
const d = czytajPalete("duza.hex", buf(duza));
console.log("duza.hex".padEnd(19), d.kolory.length, "kolorów, uwagi:", d.uwagi.join("; "));
if(d.kolory.length!==256) bledy++;

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
