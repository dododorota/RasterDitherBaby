/* Geometria rastra (siatki.js) i faktura farby (faktura-farby.js).
   Uruchom z katalogu projektu: node testy/siatki.mjs */
import { S, DEFAULTS } from "../src/state.js";
import { geometria, kontury, konturLinii, obrys, NOWE_KSZTALTY, odcinkiBarwne, przesuniecie, ustawieniaFarby, normalizujKsztalt, ksztaltWlasny, zaokraglij } from "../src/siatki.js";
import { gradientLUT } from "../src/palettes.js";
import { krycie, ziarnoFaktury } from "../src/faktura-farby.js";

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };
const ustaw = o => Object.assign(S, DEFAULTS, o);
const lum = (r, g, b) => (0.299*r + 0.587*g + 0.114*b)/255;
const cov = (r, g, b) => 1 - lum(r, g, b);
/* próbki jak z sampler(): obraz W×H co `step` */
function probki(W, H, step, f){
  const sw = Math.ceil(W/step), sh = Math.ceil(H/step), d = new Uint8ClampedArray(sw*sh*4);
  for(let y=0;y<sh;y++) for(let x=0;x<sw;x++){ const v = f(x*step, y*step), o = (y*sw+x)*4; d[o]=d[o+1]=d[o+2]=v; d[o+3]=255; }
  return {d, sw, sh, step};
}
const W = 200, H = 140;
const gradient = probki(W, H, 4, x => 255 - x*255/W);

console.log("--- kwadratowa = dawny collectScreen ---");
/* dawny collectScreen() z halftone.js, przepisany 1:1 (tamten moduł potrzebuje DOM-u) */
function stary(smp, W, H, angle, cov, off, z){
  const dots=[], a=angle*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a), cell=S.cell, maxR=0.564*cell*S.dot;
  const R = Math.ceil((W+H)/(2*cell) + 2 + (Math.abs(off[0])+Math.abs(off[1]))/cell) + 1;
  for(let v=-R; v<=R; v++) for(let u=-R; u<=R; u++){
    const px = (u*cell*ca - v*cell*sa) + W/2 + off[0], py = (u*cell*sa + v*cell*ca) + H/2 + off[1];
    if(px<-cell||py<-cell||px>W+cell||py>H+cell) continue;
    const sx = Math.min(smp.sw-1, Math.max(0, Math.round(px/smp.step))), sy = Math.min(smp.sh-1, Math.max(0, Math.round(py/smp.step)));
    const i=(sy*smp.sw+sx)*4, k = cov(smp.d[i], smp.d[i+1], smp.d[i+2]);
    if(k<=0.004) continue;
    dots.push([px*z, py*z, maxR*Math.sqrt(Math.min(1.35,k))*z]);
  }
  return dots;
}
for(const [ang, off, z] of [[45, [0, 0], 1], [15, [2.3, -1.1], 3], [72, [0, 0], 4]]){
  ustaw({cell: 9, dot: 1.1});
  const a = stary(gradient, W, H, ang, cov, off, z), b = geometria(gradient, W, H, {ang, cov, off}, z).kropki;
  sprawdz(a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1] && p[2] === b[i][2]),
          `kąt ${ang}°, z=${z}: ${a.length} punktów co do bitu jak wcześniej`);
}

console.log("--- zapis w skali = dokładne powiększenie ---");
for(const siatka of ["kwadrat", "heks", "okregi", "spirala", "promienie", "warstwice"]) for(const ksztalt of ["circle", "pasy"]){
  ustaw({cell: 8, siatka, shape: ksztalt, fala: 60, srodekX: 20, srodekY: -30, gladkosc: 40, liniaMin: 10, liniaMax: 120});
  const ink = {ang: 20, cov, off: [1.5, -2], obrot: 2.5};
  const g1 = geometria(gradient, W, H, ink, 1), g3 = geometria(gradient, W, H, ink, 3);
  const a = g1.kropki || g1.linie.flat(), b = g3.kropki || g3.linie.flat();
  const ok = a.length > 0 && a.length === b.length && a.every((p, i) => Math.abs(p[0]*3 - b[i][0]) < 1e-9 && Math.abs(p[1]*3 - b[i][1]) < 1e-9 && Math.abs(p[2]*3 - b[i][2]) < 1e-9);
  sprawdz(ok, `${siatka}, ${ksztalt === "pasy" ? "linie" : "punkty"} (z obrotem płyty): ${a.length} ${ksztalt === "pasy" ? "punktów linii" : "punktów"}, z=3 dokładnie ×3`);
}

console.log("--- układ siatek ---");
{
  const pelny = probki(W, H, 4, () => 0);           /* czerń: każdy punkt jest */
  ustaw({cell: 10, siatka: "heks"});
  const k = geometria(pelny, W, H, {ang: 0, cov, off: [0, 0]}, 1).kropki.filter(p => p[0] > 40 && p[0] < 160 && p[1] > 40 && p[1] < 100);
  let najm = Infinity;
  for(const p of k) for(const q of k){ if(p === q) continue; najm = Math.min(najm, Math.hypot(p[0]-q[0], p[1]-q[1])); }
  sprawdz(Math.abs(najm - 10) < 1e-9, "heksagonalna: najbliższy sąsiad dokładnie co komórkę (" + najm.toFixed(3) + ")");
  ustaw({cell: 10, siatka: "okregi"});
  const o = geometria(pelny, W, H, {ang: 0, cov, off: [0, 0]}, 1).kropki;
  sprawdz(o.every(p => { const r = Math.hypot(p[0] - W/2, p[1] - H/2); return Math.abs(r/10 - Math.round(r/10)) < 1e-9; }), "okręgi: każdy punkt na okręgu o promieniu k·komórka");
}

console.log("--- raster liniowy ---");
{
  const szary = probki(W, H, 4, () => 128);         /* pokrycie ≈ 0,5 */
  ustaw({cell: 10, shape: "pasy", siatka: "kwadrat", fala: 100, dot: 1});
  const l = geometria(szary, W, H, {ang: 0, cov, off: [0, 0]}, 1).linie;
  const k = cov(128, 128, 128);
  sprawdz(l.length > 10 && l.every(li => li.every(p => Math.abs(p[2] - 5*k) < 1e-9)), `szarość: półgrubość = pół komórki × pokrycie (${(5*k).toFixed(3)})`);
  const odchyl = l.flat().map(p => Math.abs(((p[1] - H/2) % 10 + 10) % 10));
  sprawdz(odchyl.every(d => Math.abs(d - (1.5*10*(k - 0.5) % 10 + 10) % 10) < 1e-6 || d < 1e-6 || Math.abs(d - 10) < 1e-6), "pokrycie bliskie ½: linie prawie proste");
  /* ciemna połowa: linie odsunięte w poziome pasy dalej niż w jasnej */
  const pol = probki(W, H, 4, x => x < W/2 ? 20 : 235);
  const lp = geometria(pol, W, H, {ang: 0, cov, off: [0, 0]}, 1).linie;
  /* jedna konkretna linia: ta, która w ciemnej połowie przechodzi blisko środka kadru */
  const linia = lp.find(l => l.some(p => p[0] > 30 && p[0] < 40 && Math.abs(p[1] - H/2 - 1.5*10*(cov(20,20,20) - 0.5)) < 1));
  const lewy = linia && linia.find(p => p[0] > 30 && p[0] < 40), prawy = linia && linia.find(p => p[0] > 160 && p[0] < 170);
  sprawdz(lewy && prawy && Math.abs(lewy[1] - prawy[1]) > 5 && lewy[2] > prawy[2]*3, `odkształcenie: ta sama linia w ciemnym (y ${lewy[1].toFixed(1)}, grubość ${lewy[2].toFixed(1)}) i jasnym (y ${prawy[1].toFixed(1)}, ${prawy[2].toFixed(1)})`);
  /* gładkość: ta sama linia, mniej skoków odkształcenia na granicy ciemne/jasne */
  const skok = lin => { let m = 0; for(let i=1;i<lin.length;i++) m = Math.max(m, Math.abs(lin[i][1] - lin[i-1][1])); return m; };
  ustaw({cell: 10, shape: "pasy", siatka: "kwadrat", fala: 100, dot: 1, gladkosc: 80});
  const lg = geometria(pol, W, H, {ang: 0, cov, off: [0, 0]}, 1).linie;
  const lgs = lg.reduce((m, l) => Math.max(m, skok(l)), 0), lps = lp.reduce((m, l) => Math.max(m, skok(l)), 0);
  sprawdz(lgs < lps*0.25, `gładkość: największy skok linii ${lps.toFixed(2)} → ${lgs.toFixed(2)} px`);
  const grub = l => { const g = {}; for(const p of l.flat()) g[p[2].toFixed(9)] = (g[p[2].toFixed(9)] || 0) + 1; return g; };
  const ga = grub(lp), gb = grub(lg);
  sprawdz(Object.keys(ga).sort().join() === Object.keys(gb).sort().join(), "gładkość nie rusza grubości: te same grubości linii (" + Object.keys(ga).length + " wartości)");
  /* najmniejsza i największa grubość */
  const bialy = probki(W, H, 4, () => 255);
  ustaw({cell: 10, shape: "pasy", siatka: "kwadrat", liniaMin: 20, liniaMax: 60});
  const lb = geometria(bialy, W, H, {ang: 0, cov, off: [0, 0]}, 1).linie, lc = geometria(probki(W, H, 4, () => 0), W, H, {ang: 0, cov, off: [0, 0]}, 1).linie;
  sprawdz(lb.length > 10 && lb.flat().every(p => Math.abs(p[2] - 1) < 1e-9) && lc.flat().every(p => Math.abs(p[2] - 3) < 1e-9),
          "grubość 20–60%: w bieli linia 1 px (pół z 20% komórki), w czerni 3 px");
  const kont = konturLinii([[0, 0, 2], [10, 0, 2], [20, 0, 2]]);
  sprawdz(kont.length === 6 && kont.every(p => Math.abs(Math.abs(p[1]) - 2) < 1e-9), "kontur linii: brzegi w odległości półgrubości");
}

console.log("--- promienie i warstwice ---");
{
  const pelny = probki(W, H, 4, () => 0);
  ustaw({cell: 10, siatka: "promienie", shape: "pasy"});
  const pr = geometria(pelny, W, H, {ang: 0, cov, off: [0, 0]}, 1).linie;
  const naPromieniu = pr.every(l => { const [x0, y0] = l[0], [x1, y1] = l[l.length - 1];
    return l.every(p => Math.abs((p[0] - W/2)*(y1 - H/2) - (p[1] - H/2)*(x1 - W/2)) < 1e-6*Math.max(1, Math.hypot(x1 - W/2, y1 - H/2))*Math.max(1, Math.hypot(p[0] - W/2, p[1] - H/2))); });
  sprawdz(pr.length >= 8 && naPromieniu, `promienie: ${pr.length} linii, każda na prostej przez środek`);
  const l = pr[0], blisko = l.find(p => Math.hypot(p[0] - W/2, p[1] - H/2) > 10), daleko = l[l.length - 1];
  sprawdz(blisko[2] < daleko[2], `promienie: przy środku cieńsze (${blisko[2].toFixed(2)}) niż dalej (${daleko[2].toFixed(2)})`);
  /* wzdłuż kształtu: płaski obraz → proste, równe linie co komórkę pod kątem farby */
  const szary = probki(W, H, 2, () => 128);
  ustaw({cell: 8, siatka: "warstwice", shape: "pasy", fala: 80, gladkosc: 0});
  const wp = geometria(szary, W, H, {ang: 30, cov, off: [0, 0]}, 1).linie;
  const a30 = 30*Math.PI/180, odl = p => ((p[0] - W/2)*-Math.sin(a30) + (p[1] - H/2)*Math.cos(a30));
  const proste = wp.every(l => l.every(p => Math.abs(odl(p) - odl(l[0])) < 1e-6));
  const pozycje = [...new Set(wp.map(l => Math.round(odl(l[0])*1000)/1000))].sort((x, y) => x - y);
  const odstepy = pozycje.slice(1).map((v, i) => v - pozycje[i]);
  sprawdz(wp.length > 10 && proste && odstepy.every(d => Math.abs(d - 8) < 1e-6), `płaski obraz: ${wp.length} prostych linii pod kątem farby, co ${odstepy[0]?.toFixed(3)} px`);
  /* ciemne koło: linie je obchodzą — przesunięte w poprzek nad kołem, nie obok */
  const kolo = probki(W, H, 2, (x, y) => Math.hypot(x - W/2, y - H/2) < 30 ? 0 : 255);
  ustaw({cell: 8, siatka: "warstwice", shape: "pasy", fala: 60, gladkosc: 0});
  const wk2 = geometria(kolo, W, H, {ang: 0, cov, off: [0, 0]}, 1).linie;
  /* przecięcia linii z pionową prostą x w pasie y0–y1 */
  const przeciecia = (x, y0, y1) => { let n = 0; for(const l of wk2) for(let i=1;i<l.length;i++){ const [ax, ay] = l[i-1], [bx, by] = l[i];
    if((ax - x)*(bx - x) <= 0 && ax !== bx){ const y = ay + (by - ay)*(x - ax)/(bx - ax); if(y >= y0 && y < y1) n++; } } return n; };
  const naKrawedzi = przeciecia(W/2, H/2 - 40, H/2 - 20), zBoku = przeciecia(12, H/2 - 40, H/2 - 20);
  sprawdz(naKrawedzi > zBoku*1.5, `ciemne koło wygina linie: na jego brzegu ${naKrawedzi} linii w pasie 20 px, z boku ${zBoku}`);
  sprawdz(wk2.flat().some(p => p[2] > 3.9) && wk2.flat().some(p => p[2] < 0.1), "grubość z tonu w każdym punkcie: grube na kole, cienkie na bieli");
  ustaw({cell: 8, siatka: "warstwice", shape: "circle"});
  const wk = geometria(szary, W, H, {ang: 0, cov, off: [0, 0]}, 1).kropki;
  sprawdz(wk.length > W*H/64*0.8 && wk.length < W*H/64*1.2, `wzdłuż kształtu z punktów: ${wk.length} punktów co komórkę (≈ ${Math.round(W*H/64)})`);
}

console.log("--- nierówny raster ---");
{
  const szary = probki(W, H, 4, () => 128), ink = {ang: 15, cov, off: [0, 0], name: "a", color: "#000000"};
  ustaw({cell: 8, shape: "circle", siatka: "kwadrat"});
  const gladki = geometria(szary, W, H, ink, 1).kropki;
  ustaw({cell: 8, shape: "circle", siatka: "kwadrat", chmury: 80});
  const ch = geometria(szary, W, H, ink, 1).kropki, rs = ch.map(p => p[2]);
  sprawdz(Math.max(...rs) > gladki[0][2]*1.15 && Math.min(...rs) < gladki[0][2]*0.85 && ch.every((p, i) => p[0] === gladki[i]?.[0] || true),
          `chmury: na równej szarości promienie ${Math.min(...rs).toFixed(2)}–${Math.max(...rs).toFixed(2)} (bez chmur ${gladki[0][2].toFixed(2)})`);
  const ch2 = geometria(szary, W, H, {...ink, name: "b"}, 1).kropki;
  sprawdz(ch2.some((p, i) => ch[i] && p[2] !== ch[i][2]), "chmury: inna farba = inne plamy");
  ustaw({cell: 8, shape: "circle", siatka: "kwadrat", chmury: 60, nierowne: 70, drganie: 50, postrzep: 80});
  const g1 = geometria(szary, W, H, ink, 1), g4 = geometria(szary, W, H, ink, 4), g1b = geometria(szary, W, H, ink, 1);
  sprawdz(JSON.stringify(g1) === JSON.stringify(g1b), "powtarzalnie: dwa liczenia co do bitu");
  const dokl = g1.kropki.length === g4.kropki.length && g1.kropki.every((p, i) => [0, 1, 2].every(j => Math.abs(p[j]*4 - g4.kropki[i][j]) < 1e-9) && p[4] === g4.kropki[i][4]);
  const o1 = g1.kropki.slice(0, 50).map(k => obrys("circle", k, g1.postrzep)[0]), o4 = g4.kropki.slice(0, 50).map(k => obrys("circle", k, g4.postrzep)[0]);
  const oDokl = o1.every((k, i) => k.every((p, j) => Math.abs(p[0]*4 - o4[i][j][0]) < 1e-9 && Math.abs(p[1]*4 - o4[i][j][1]) < 1e-9));
  sprawdz(dokl && oDokl && g1.postrzep > 0, `z=4: punkty, drgania i postrzępione obrysy dokładnie ×4 (${g1.kropki.length} punktów)`);
  const naSiatce = g1.kropki.filter(p => gladki.some(q => q[0] === p[0] && q[1] === p[1])).length;
  sprawdz(naSiatce < g1.kropki.length*0.1, `drganie: ${g1.kropki.length - naSiatce} z ${g1.kropki.length} punktów zeszło z siatki`);
  const pole = k => { let s = 0; for(let i=0;i<k.length;i++){ const [a, b] = k[i], [c, d] = k[(i+1) % k.length]; s += a*d - b*c; } return Math.abs(s/2); };
  const stos = g1.kropki.slice(0, 200).map(k => pole(obrys("circle", k, g1.postrzep)[0])/(Math.PI*k[2]*k[2]));
  const sr = stos.reduce((a, b) => a + b)/stos.length;
  sprawdz(Math.abs(sr - 1) < 0.08, `postrzępione brzegi: średnio ${(sr*100).toFixed(1)}% pola koła (ton się nie zmienia)`);
  ustaw({cell: 8, shape: "pasy", siatka: "kwadrat", chmury: 80});
  const lc = geometria(szary, W, H, ink, 1).linie.flat().map(p => p[2]);
  sprawdz(Math.max(...lc) - Math.min(...lc) > 1, "chmury działają też na raster liniowy");
}

console.log("--- kolory punktów (z obrazu, mapa gradientu) ---");
{
  /* obraz: lewa połowa czerwona, prawa niebieska */
  const W2 = 120, H2 = 60, step = 3, sw = Math.ceil(W2/step), sh = Math.ceil(H2/step), d = new Uint8ClampedArray(sw*sh*4);
  for(let y=0;y<sh;y++) for(let x=0;x<sw;x++){ const o = (y*sw+x)*4, lewa = x*step < W2/2; d[o] = lewa ? 200 : 20; d[o+1] = 30; d[o+2] = lewa ? 30 : 180; d[o+3] = 255; }
  const smp = {d, sw, sh, step}, lum = (r, g, b) => (0.299*r + 0.587*g + 0.114*b)/255;
  const ink = {ang: 30, cov: (r, g, b) => 1 - lum(r, g, b), barwa: (r, g, b) => [r, g, b], off: [0, 0]};
  ustaw({cell: 8, shape: "circle", siatka: "kwadrat"});
  const g1 = geometria(smp, W2, H2, ink, 1), g3 = geometria(smp, W2, H2, ink, 3);
  const dobre = g1.kropki.every(k => k.length === 6 && (k[0] < W2/2 - 4 ? k[5].join() === "200,30,30" : k[0] > W2/2 + 4 ? k[5].join() === "20,30,180" : true));
  sprawdz(g1.kropki.length > 50 && dobre, `kolory z obrazu: ${g1.kropki.length} punktów, każdy w kolorze swojego miejsca`);
  sprawdz(g1.kropki.every((k, i) => k[5] === g3.kropki[i][5] || k[5].join() === g3.kropki[i][5].join()) && g1.kropki.every((k, i) => Math.abs(k[0]*3 - g3.kropki[i][0]) < 1e-9 && Math.abs(k[2]*3 - g3.kropki[i][2]) < 1e-9),
          "z=3: te same kolory, geometria dokładnie ×3");
  ustaw({cell: 8, shape: "pasy", siatka: "kwadrat"});
  const gl = geometria(smp, W2, H2, ink, 1);
  const odc = gl.linie.flatMap(odcinkiBarwne);
  const ciagle = gl.linie.every(l => { const o = odcinkiBarwne(l); return o.every((x, i) => i === 0 || x[0].includes(o[i-1][0][o[i-1][0].length - 1])); });
  const pokryte = gl.linie.every(l => { const o = odcinkiBarwne(l); return o[0][0][0] === l[0] && o[o.length - 1][0][o[o.length - 1][0].length - 1] === l[l.length - 1]; });
  sprawdz(odc.some(([, k]) => k === "rgb(200,32,32)") && odc.some(([, k]) => k === "rgb(24,32,184)") && ciagle && pokryte,
          `linie: ${odc.length} odcinków jednego koloru, sąsiednie zachodzą na siebie, cała linia pokryta`);
  const lut = gradientLUT(["#000000", "#ff0000", "#ffffff"]), lutO = gradientLUT(["#000000", "#ff0000", "#ffffff"], true);
  sprawdz(lut.length === 256 && lut[0].join() === "0,0,0" && lut[255].join() === "255,255,255" && lutO[0].join() === "255,255,255" && lut[128][0] > 200 && lut[128][1] < 60,
          `gradient 256 kolorów: czarny → czerwony (${lut[128]}) → biały, odwrócony od białego`);
}

console.log("--- fala tonu, krzywa wielkości, odkształcenie siatki ---");
{
  const ink = {ang: 0, cov, off: [0, 0], name: "a", color: "#000000"};
  /* gradient poziomy: bez fali promienie rosną w lewo; piła ×3 — trzy razy od zera */
  ustaw({cell: 6, shape: "circle", siatka: "kwadrat", tonPowt: 3});
  const wiersz = g => g.kropki.filter(k => Math.abs(k[1] - H/2) < 1).sort((p, q) => p[0] - q[0]).map(k => k[2]);
  const r3 = wiersz(geometria(gradient, W, H, ink, 1));
  let skoki = 0; for(let i=1;i<r3.length;i++) if(r3[i-1] - r3[i] > 1) skoki++;   /* zawinięcie: duży punkt, a obok znów mały */
  sprawdz(skoki >= 2 && skoki <= 3, `piła ×3: promień ${skoki + 1} razy zaczyna od zera wzdłuż gradientu`);
  ustaw({cell: 6, shape: "circle", siatka: "kwadrat", tonPowt: 1, tonRodzaj: "trojkat"});
  const zwykly = JSON.stringify(geometria(gradient, W, H, ink, 1));
  ustaw({cell: 6, shape: "circle", siatka: "kwadrat"});
  sprawdz(zwykly === JSON.stringify(geometria(gradient, W, H, ink, 1)), "trójkąt ×1 bez przesunięcia = brak fali");
  ustaw({cell: 6, shape: "circle", siatka: "kwadrat", tonPowt: 2, tonRodzaj: "trojkat"});
  const rt = wiersz(geometria(gradient, W, H, ink, 1)), maksI = rt.indexOf(Math.max(...rt));
  sprawdz(maksI > rt.length*0.3 && maksI < rt.length*0.7, `trójkąt ×2: największy punkt w środku gradientu (${maksI}/${rt.length})`);
  /* krzywa wielkości */
  const szary = probki(W, H, 4, () => 128);
  ustaw({cell: 8, odpowiedz: 200}); const r2 = geometria(szary, W, H, ink, 1).kropki[0][2];
  ustaw({cell: 8, odpowiedz: 50});  const r05 = geometria(szary, W, H, ink, 1).kropki[0][2];
  ustaw({cell: 8});                 const r1 = geometria(szary, W, H, ink, 1).kropki[0][2];
  sprawdz(r2 < r1 && r1 < r05, `krzywa wielkości na szarości: ×2 → ${r2.toFixed(2)}, ×1 → ${r1.toFixed(2)}, ×0,5 → ${r05.toFixed(2)}`);
  const jasny = probki(W, H, 4, () => 245);
  ustaw({cell: 8, minPunkt: 40}); const rm = geometria(jasny, W, H, ink, 1).kropki[0][2];
  sprawdz(rm >= 0.4*0.564*8 - 1e-9, `najmniejszy punkt 40%: w światłach ${rm.toFixed(2)} px (≥ ${(0.4*0.564*8).toFixed(2)})`);
  /* rozciągnięcie: odstęp wzdłuż kierunku siatki ×2, w poprzek bez zmian */
  const pelny = probki(W, H, 4, () => 0);
  ustaw({cell: 10, rozciag: 200});
  const kd = geometria(pelny, W, H, ink, 1).kropki.filter(k => k[0] > 40 && k[0] < 160 && k[1] > 40 && k[1] < 100);
  const dx = Math.min(...kd.filter(k => k !== kd[0] && Math.abs(k[1] - kd[0][1]) < 1e-6).map(k => Math.abs(k[0] - kd[0][0])));
  const dy = Math.min(...kd.filter(k => k !== kd[0] && Math.abs(k[0] - kd[0][0]) < 1e-6).map(k => Math.abs(k[1] - kd[0][1])));
  sprawdz(Math.abs(dx - 20) < 1e-9 && Math.abs(dy - 10) < 1e-9, `rozciągnięcie 200%: odstęp ${dx} w kierunku siatki, ${dy} w poprzek`);
  ustaw({cell: 10, pochyl: 45});
  const kp = geometria(pelny, W, H, ink, 1).kropki;
  const nadSoba = kp.filter(k => Math.abs(k[0] - W/2 - 10) < 1e-6 && Math.abs(k[1] - H/2 - 10) < 1e-6).length;
  sprawdz(nadSoba === 1, "pochylenie 45°: wiersz niżej przesunięty o komórkę");
  /* płynięcie: przesunięcia sąsiadów podobne (pole gładkie), daleko — różne; z=3 dokładnie */
  ustaw({cell: 6, odksztalcenie: 60, odksztSkala: 80});
  const gz1 = geometria(pelny, W, H, ink, 1), gz3 = geometria(pelny, W, H, ink, 3);
  const u = ustawieniaFarby(ink);
  let sumaP = 0, sumaS = 0, n = 0;
  for(let y=10; y<H-10; y+=6) for(let x=10; x<W-10; x+=6){
    const [a1, b1] = przesuniecie(x, y, u), [a2, b2] = przesuniecie(x + 6, y, u);
    sumaP += Math.hypot(a1 - x, b1 - y); sumaS += Math.hypot((a2 - x - 6) - (a1 - x), (b2 - y) - (b1 - y)); n++;
  }
  sprawdz(sumaP/n > 2 && sumaS/n < sumaP/n*0.5, `płynięcie: średnio ${(sumaP/n).toFixed(1)} px, sąsiedzi (6 px) różnią się o ${(sumaS/n).toFixed(2)} px — pole gładkie`);
  sprawdz(gz1.kropki.every((k, i) => Math.abs(k[0]*3 - gz3.kropki[i][0]) < 1e-9 && Math.abs(k[1]*3 - gz3.kropki[i][1]) < 1e-9), "płynięcie, z=3: dokładnie ×3");
  ustaw({cell: 8, shape: "pasy", odksztalcenie: 60});
  const lz1 = geometria(szary, W, H, ink, 1).linie.flat(), lz3 = geometria(szary, W, H, ink, 3).linie.flat();
  sprawdz(lz1.length === lz3.length && lz1.every((p, i) => Math.abs(p[0]*3 - lz3[i][0]) < 1e-9 && Math.abs(p[1]*3 - lz3[i][1]) < 1e-9), "płynięcie linii, z=3: dokładnie ×3");
}

console.log("--- siatka trójkątna, przezroczystość ---");
{
  const ink = {ang: 0, cov, off: [0, 0]}, pelny = probki(W, H, 4, () => 0);
  ustaw({cell: 10, siatka: "trojkatna", shape: "trojkat"});
  const k = geometria(pelny, W, H, ink, 1).kropki, wnetrze = k.filter(p => p[0] > 30 && p[0] < 170 && p[1] > 30 && p[1] < 110);
  const gestosc = wnetrze.length/(140*80/100);
  const katy = new Set(wnetrze.map(p => Math.round((((p[3] % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI))*1000)));
  sprawdz(Math.abs(gestosc - 1) < 0.08 && katy.size === 2, `trójkątna: ${gestosc.toFixed(3)} punktu na komórkę² (≈1), dwa ułożenia (ostrze w górę i w dół)`);
  /* przezroczystość: lewa połowa przezroczysta (czarne RGB, alfa 0), środek półprzezroczysty */
  const pol = probki(W, H, 4, () => 0);
  for(let i=0; i<pol.d.length; i+=4){ const x = (i/4) % pol.sw*4; pol.d[i+3] = x < W/3 ? 0 : (x < 2*W/3 ? 128 : 255); }
  ustaw({cell: 10, siatka: "kwadrat", shape: "circle"});
  const kp = geometria(pol, W, H, ink, 1).kropki;
  const lewa = kp.filter(p => p[0] < W/3 - 6).length, srodek = kp.filter(p => p[0] > W/3 + 6 && p[0] < 2*W/3 - 6), prawa = kp.filter(p => p[0] > 2*W/3 + 6);
  sprawdz(lewa === 0 && srodek.every(p => p[2] < prawa[0][2]*0.75), `przezroczyste = papier: lewa ${lewa} punktów, półprzezroczysta mniejsze (${srodek[0][2].toFixed(2)} < ${prawa[0][2].toFixed(2)})`);
  ustaw({cell: 10, siatka: "kwadrat", shape: "circle", pustePrzezr: false});
  sprawdz(geometria(pol, W, H, ink, 1).kropki.filter(p => p[0] < W/3 - 6).length > 10, "wyłączone: przezroczyste liczy się jak kolor pod spodem (dawne zachowanie)");
}

console.log("--- zlewanie punktów (metaballe) ---");
{
  const ink = {ang: 0, cov, off: [0, 0]};
  const pole = k => { let s = 0; for(let i=0;i<k.length;i++){ const [a, b] = k[i], [c, d] = k[(i+1) % k.length]; s += a*d - b*c; } return Math.abs(s/2); };
  /* jasny szary — punkty daleko od siebie: każda plama to prawie dokładnie okrąg punktu */
  const jasny = probki(W, H, 4, () => 200);
  ustaw({cell: 12}); const kr = geometria(jasny, W, H, ink, 1).kropki;
  ustaw({cell: 12, zlewanie: 10}); const pl = geometria(jasny, W, H, ink, 1).plamy;
  const r = kr[0][2], srednie = pl.map(pole).reduce((a, b) => a + b)/pl.length;
  sprawdz(pl.length === kr.length && Math.abs(srednie/(Math.PI*r*r) - 1) < 0.03, `małe zlewanie, rzadkie punkty: ${pl.length} plam = ${kr.length} punktów, pole ${(srednie/(Math.PI*r*r)*100).toFixed(1)}% koła`);
  /* ciemniej i mocniej — punkty łączą się w mniej plam */
  const ciemny = probki(W, H, 4, () => 90);
  ustaw({cell: 12, zlewanie: 0}); const n0 = geometria(ciemny, W, H, ink, 1).kropki.length;
  ustaw({cell: 12, zlewanie: 80}); const n8 = geometria(ciemny, W, H, ink, 1).plamy.length;
  sprawdz(n8 < n0/3, `mocne zlewanie: ${n0} punktów → ${n8} plam`);
  const z1 = geometria(gradient, W, H, ink, 1).plamy, z3 = geometria(gradient, W, H, ink, 3).plamy;
  sprawdz(z1.length === z3.length && z1.every((k, i) => k.every((p, j) => Math.abs(p[0]*3 - z3[i][j][0]) < 1e-9 && Math.abs(p[1]*3 - z3[i][j][1]) < 1e-9)),
          `z=3: ${z1.length} plam dokładnie ×3`);
  sprawdz(z1.every(k => Math.hypot(k[0][0] - k[k.length-1][0], k[0][1] - k[k.length-1][1]) < 12), "każda plama zamknięta (koniec przy początku)");
}

console.log("--- stippling ---");
{
  const ink = {ang: 0, cov, off: [0, 0]};
  const szary = v => probki(W, H, 4, () => v);
  ustaw({cell: 8, siatka: "stipple"});
  const n25 = geometria(szary(191), W, H, ink, 1).kropki.length, n75 = geometria(szary(64), W, H, ink, 1).kropki.length;
  const oczek = c => W*H*c/64;
  sprawdz(Math.abs(n25/oczek(cov(191,191,191)) - 1) < 0.08 && Math.abs(n75/oczek(cov(64,64,64)) - 1) < 0.08,
          `liczba punktów z tonu: 25% → ${n25} (≈${oczek(cov(191,191,191)).toFixed(0)}), 75% → ${n75} (≈${oczek(cov(64,64,64)).toFixed(0)})`);
  const minOdl = kr => { const w = kr.filter(p => p[0] > 20 && p[0] < W - 20 && p[1] > 20 && p[1] < H - 20); let m = 0;
    for(const p of w){ let d = Infinity; for(const q of kr) if(q !== p) d = Math.min(d, Math.hypot(p[0]-q[0], p[1]-q[1])); m += d; } return m/w.length; };
  ustaw({cell: 8, siatka: "stipple", stipIter: 0}); const los = minOdl(geometria(szary(128), W, H, ink, 1).kropki);
  ustaw({cell: 8, siatka: "stipple", stipIter: 12}); const rown = minOdl(geometria(szary(128), W, H, ink, 1).kropki);
  sprawdz(rown > los*1.3, `Lloyd rozsuwa punkty: średni najbliższy sąsiad ${los.toFixed(2)} → ${rown.toFixed(2)} px`);
  const s1 = geometria(gradient, W, H, ink, 1).kropki, s3 = geometria(gradient, W, H, ink, 3).kropki, s1b = geometria(gradient, W, H, ink, 1).kropki;
  sprawdz(JSON.stringify(s1) === JSON.stringify(s1b) && s1.length === s3.length && s1.every((p, i) => Math.abs(p[0]*3 - s3[i][0]) < 1e-9 && Math.abs(p[2]*3 - s3[i][2]) < 1e-9),
          `powtarzalnie i z=3 dokładnie ×3 (${s1.length} punktów)`);
  const lewo = s1.filter(p => p[0] < W/3).length, prawo = s1.filter(p => p[0] > 2*W/3).length;
  sprawdz(prawo > lewo*3, `gradient: gęściej w ciemnym (${prawo}) niż w jasnym (${lewo})`);
}

console.log("--- scalanie równych obszarów ---");
{
  const ink = {ang: 0, cov, off: [0, 0]}, szary = probki(W, H, 4, () => 128);
  const pole = kr => kr.reduce((s, p) => s + p[2]*p[2], 0);
  ustaw({cell: 6}); const zwykle = geometria(szary, W, H, ink, 1).kropki;
  ustaw({cell: 6, scalanie: 50}); const sc = geometria(szary, W, H, ink, 1).kropki;
  sprawdz(sc.length < zwykle.length/8 && Math.abs(pole(sc)/pole(zwykle) - 1) < 1e-9,
          `równa szarość: ${zwykle.length} punktów → ${sc.length}, suma pól ta sama (ton bez zmian)`);
  const gz = geometria(gradient, W, H, ink, 1).kropki, gz3 = geometria(gradient, W, H, ink, 3).kropki;
  ustaw({cell: 6}); const gzw = geometria(gradient, W, H, ink, 1).kropki;
  const wielkie = gz.filter(p => p[2] > 0.564*6*1.5).length;
  sprawdz(gz.length < gzw.length && wielkie > 0 && Math.abs(pole(gz)/pole(gzw) - 1) < 1e-9, `gradient: ${gzw.length} → ${gz.length} punktów, ${wielkie} scalonych dużych, ton bez zmian`);
  sprawdz(gz.length === gz3.length && gz.every((p, i) => Math.abs(p[0]*3 - gz3[i][0]) < 1e-9 && Math.abs(p[2]*3 - gz3[i][2]) < 1e-9), "z=3: dokładnie ×3");
}

console.log("--- nowe kształty ---");
const pole = k => { let s = 0; for(let i=0;i<k.length;i++){ const [a, b] = k[i], [c, d] = k[(i+1) % k.length]; s += a*d - b*c; } return s/2; };
for(const n of NOWE_KSZTALTY){
  const k = kontury(n, 50, 50, 5, 0.3);
  const p = k.reduce((s, c) => s + pole(c), 0);
  sprawdz(k.length >= 1 && Math.abs(p) > 10 && Math.abs(p) < 400, `${n}: ${k.length} kontur(y), pole ${Math.abs(p).toFixed(1)}`);
}
{
  const k = kontury("pierscien", 0, 0, 10, 0);
  sprawdz(Math.sign(pole(k[0])) !== Math.sign(pole(k[1])), "pierścień: wewnętrzny kontur w przeciwną stronę (dziura)");
}

{
  /* kształty z panelu: pole równe polu koła, niezależnie od boków, wcięcia i wykładnika */
  const pk = k => k.reduce((s, c) => s + Math.abs(pole(c)), 0), cel = Math.PI*25;
  const wyn = [];
  for(const [n, o] of [["trojkat", {}], ["wielokat", {boki: 5}], ["wielokat", {boki: 8, wciecie: 60}], ["superelipsa", {wykladnik: 20}], ["superelipsa", {wykladnik: 100}]]){
    ustaw(o); const k = kontury(n, 0, 0, 5, 0.4); wyn.push([n + JSON.stringify(o), pk(k)]);
  }
  sprawdz(wyn.every(([, p]) => Math.abs(p - cel) < 1e-6), "trójkąt, wielokąt, gwiazda, superelipsa: pole = pole koła r=5 (" + wyn.map(([, p]) => p.toFixed(3)).join(", ") + ")");
  ustaw({boki: 6, wciecie: 50}); const g = kontury("wielokat", 0, 0, 5, 0)[0];
  sprawdz(g.length === 12, "gwiazda 6-ramienna: 12 wierzchołków");
  const dawne = ["circle", "square", "diamond", "line", "cross"].map(n => pk(kontury(n, 0, 0, 5, 0, 10)));
  sprawdz(Math.abs(dawne[1] - 100) < 1e-9 && Math.abs(dawne[2] - 2*1.3*1.3*25) < 1e-9 && Math.abs(dawne[3] - 15*9) < 1e-9 && Math.abs(dawne[4] - (2*15*4.5 - 4.5*4.5)) < 1e-9 && Math.abs(dawne[0] - cel) < cel*0.02,
          "dawne kształty jako kontury (do obrysu): pola jak rysowane wprost");
}

console.log("--- własny kształt ---");
{
  const pk = k => k.reduce((s, c) => s + pole(c), 0);
  /* kwadrat 100×100 z kwadratową dziurą 50×50 (przeciwny obieg), przesunięty */
  const k = normalizujKsztalt([[[200,200],[300,200],[300,300],[200,300]], [[225,225],[225,275],[275,275],[275,225]]]);
  const netto = Math.abs(pole(k[0])) - Math.abs(pole(k[1]));
  const sr = k.flat().reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]).map(v => v/k.flat().length);
  sprawdz(k.length === 2 && Math.abs(netto - Math.PI) < 0.02 && Math.abs(sr[0]) < 0.01 && Math.abs(sr[1]) < 0.01 && k.flat().length <= 130,
          `kwadrat z dziurą: pole netto ${netto.toFixed(3)} (π), środek w zerze, ${k.flat().length} punktów`);
  ustaw({ksztaltWlasny: JSON.stringify(k)});
  const w = kontury("wlasny", 10, 20, 5, 0);
  sprawdz(w.length === 2 && Math.abs(Math.abs(pole(w[0])) - Math.abs(pole(w[1])) - Math.PI*25) < 0.5, "kontury punktu: pole π·r² po skalowaniu");
  for(const zly of ["{zepsuty", "[[[1,2],[3,4]]]", JSON.stringify([[[0,0],[1,0],[1e9,1]]]), "[]"]){
    ustaw({ksztaltWlasny: zly});
    if(ksztaltWlasny() !== null){ sprawdz(false, "zepsuty kształt przyjęty: " + zly); break; }
  }
  ustaw({ksztaltWlasny: "{zepsuty"});
  sprawdz(kontury("wlasny", 0, 0, 5, 0).length === 1 && kontury("wlasny", 0, 0, 5, 0)[0].length === 24, "zepsuty albo pusty kształt — koło, bez wyjątku");
}

console.log("--- zaokrąglanie rogów ---");
{
  const kw = [[[-5, -5], [5, -5], [5, 5], [-5, 5]]], z = zaokraglij(kw, 1, 0, 0)[0];
  const maksR = Math.max(...z.map(p => Math.hypot(...p)));
  sprawdz(z.length === 20 && Math.abs(Math.abs(pole(z)) - 100) < 1e-9 && maksR < 5*Math.SQRT2 - 0.5,
          `kwadrat zaokrąglony: 20 punktów, pole bez zmian (${Math.abs(pole(z)).toFixed(3)}), róg cofnięty (${maksR.toFixed(2)} < ${(5*Math.SQRT2).toFixed(2)})`);
  ustaw({zaokraglenie: 60, boki: 5, wciecie: 50});
  const g = obrys("wielokat", [10, 10, 4, 0], 0), gz = kontury("wielokat", 10, 10, 4, 0);
  sprawdz(g[0].length === gz[0].length*5 && Math.abs(Math.abs(pole(g[0])) - Math.abs(pole(gz[0]))) < 1e-6, "gwiazda zaokrąglona w obrysie punktu, pole jak przed");
  ustaw({zaokraglenie: 60});
  sprawdz(obrys("circle", [0, 0, 4, 0], 0)[0].length === 32, "koło zostaje kołem (bez zaokrąglania)");
}

console.log("--- znaki według tonu ---");
{
  const lumP = (smp, x, y) => { const sx = Math.min(smp.sw-1, Math.max(0, Math.round(x/smp.step))), sy = Math.min(smp.sh-1, Math.max(0, Math.round(y/smp.step))); return smp.d[(sy*smp.sw + sx)*4]; };
  for(const n of [2, 6, 16]){
    ustaw({cell: 8, shape: "tony", znakiIle: n});
    const k = geometria(gradient, W, H, {ang: 30, cov, off: [0, 0]}, 1).kropki;
    /* poziom = przedział pokrycia, cienie (największe pokrycie) to 0 */
    const zgodne = k.every(p => p.length === 7 && p[6] === Math.min(n - 1, Math.max(0, Math.floor((1 - Math.min(1, cov(...Array(3).fill(lumP(gradient, p[0], p[1])))))*n))));
    const uzyte = new Set(k.map(p => p[6]));
    sprawdz(k.length > 0 && zgodne && uzyte.size === n, `${n} tonów: każdy punkt niesie poziom z przedziału pokrycia, użyte wszystkie ${uzyte.size}`);
  }
  /* ten sam układ i wielkości co zwykły punkt — kształt tonu zmienia tylko rysunek */
  ustaw({cell: 9, shape: "circle"});
  const a = geometria(gradient, W, H, {ang: 15, cov, off: [1, 2]}, 1).kropki;
  ustaw({cell: 9, shape: "tony"});
  const b = geometria(gradient, W, H, {ang: 15, cov, off: [1, 2]}, 1).kropki;
  sprawdz(a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1] && p[2] === b[i][2] && p[3] === b[i][3]), `położenia i promienie co do bitu jak przy punkcie (${a.length})`);
  /* zapis w skali, z nierównym rastrem, kolorami punktów i obrotem płyty */
  for(const [siatka, opcje, barwa] of [["kwadrat", {}, false], ["heks", {nierowne: 50, drganie: 40}, false], ["stipple", {}, false],
                                       ["kwadrat", {}, true], ["okregi", {postrzep: 60}, true], ["qr", {}, false]]){
    ustaw({cell: 7, shape: "tony", znakiIle: 5, siatka, ...opcje});
    const ink = {ang: 20, cov, off: [1.5, -2], obrot: 2.5, ...(barwa ? {barwa: (r, g, bb) => [r, g, bb]} : {})};
    const g1 = geometria(gradient, W, H, ink, 1), g3 = geometria(gradient, W, H, ink, 3);
    const ok = g1.kropki.length > 0 && g1.kropki.length === g3.kropki.length && g1.kropki.every((p, i) => { const q = g3.kropki[i];
      return Math.abs(p[0]*3 - q[0]) < 1e-9 && Math.abs(p[1]*3 - q[1]) < 1e-9 && Math.abs(p[2]*3 - q[2]) < 1e-9 && p[6] === q[6] && p.length === 7 && (barwa ? Array.isArray(p[5]) : p[5] === null); });
    sprawdz(ok, `${siatka}${Object.keys(opcje).length ? " + " + Object.keys(opcje).join(", ") : ""}${barwa ? ", kolory punktów" : ""}: z=3 dokładnie ×3, te same poziomy`);
  }
  /* scalanie: scalony punkt zachowuje poziom (średni z bloku), bez koloru zostaje null */
  ustaw({cell: 6, shape: "tony", znakiIle: 4, scalanie: 100});
  const plaski = probki(W, H, 4, () => 90);
  const s = geometria(plaski, W, H, {ang: 0, cov, off: [0, 0]}, 1).kropki;
  ustaw({cell: 6, shape: "tony", znakiIle: 4});
  const bez = geometria(plaski, W, H, {ang: 0, cov, off: [0, 0]}, 1).kropki;
  sprawdz(s.length < bez.length/4 && s.every(p => p.length === 7 && p[5] === null && p[6] === bez[0][6]), `scalanie: ${bez.length} → ${s.length} punktów, poziom zachowany`);
  /* zlewanie nie zamienia znaków w plamy */
  ustaw({cell: 8, shape: "tony", zlewanie: 80});
  const zl = geometria(gradient, W, H, {ang: 0, cov, off: [0, 0]}, 1);
  sprawdz(!!zl.kropki && !zl.plamy, "zlewanie pomija znaki według tonu (zostają punkty)");

  /* podmiana tonów */
  const ink = {ang: 25, cov, off: [0, 0]};
  const poziomy = (o, z = 1) => { ustaw({cell: 6, shape: "tony", znakiIle: 8, ...o}); return geometria(gradient, W, H, ink, z).kropki.map(p => p[6]); };
  const baza = poziomy({});
  sprawdz(poziomy({znakiPodmiana: 0, znakiUklad: 7}).every((v, i) => v === baza[i]), "podmiana 0 — poziomy bez zmian, układ bez znaczenia");
  for(const [proc, zas] of [[30, 1], [60, 3]]){
    const p = poziomy({znakiPodmiana: proc, znakiZasieg: zas});
    const zm = p.filter((v, i) => v !== baza[i]).length/p.length;
    const oIle = p.every((v, i) => Math.abs(v - baza[i]) <= zas && v >= 0 && v < 8);
    sprawdz(Math.abs(zm - proc/100) < 0.06 && oIle, `${proc}%, zasięg ${zas}: zmienionych ${(zm*100).toFixed(1)}%, każdy o najwyżej ${zas}`);
  }
  const p1 = poziomy({znakiPodmiana: 40, znakiUklad: 1}), p1b = poziomy({znakiPodmiana: 40, znakiUklad: 1}), p2 = poziomy({znakiPodmiana: 40, znakiUklad: 2});
  sprawdz(p1.every((v, i) => v === p1b[i]) && p2.some((v, i) => v !== p1[i]), "ten sam układ — ten sam wynik, inny układ — inny");
  sprawdz(poziomy({znakiPodmiana: 40}, 3).every((v, i) => v === p1[i]), "zapis 3× — ten sam układ podmiany");
  const klatka = k => poziomy({znakiPodmiana: 40, znakiCzas: 4, klatkaNr: k});
  const k0 = klatka(0);
  sprawdz([1, 2, 3].every(k => klatka(k).every((v, i) => v === k0[i])) && klatka(4).some((v, i) => v !== k0[i]),
          "nowy układ co 4 klatki: klatki 0–3 jednakowe, 4 — nowy");
  S.klatkaNr = 0;
}

console.log("--- ruch punktów ---");
{
  const ink = {ang: 20, cov, off: [0, 0]};
  const g = (o, z = 1, t = 0) => { ustaw({cell: 8, ...o}); S.czasKlatki = t; return geometria(gradient, W, H, ink, z).kropki; };
  const baza = g({});
  /* pulsowanie: każdy punkt między (1 − puls) a pełną wielkością, cykl się powtarza */
  for(const krzywa of ["liniowo", "gladko", "szesc"]){
    const p = g({ruchPuls: 70, ruchFala: 60, ruchKrzywa: krzywa}, 1, 0.37);
    const wZakresie = p.every((q, i) => q[2] <= baza[i][2] + 1e-9 && q[2] >= baza[i][2]*0.3 - 1e-9);
    const rozne = new Set(p.map((q, i) => (q[2]/baza[i][2]).toFixed(3))).size;
    const petla = g({ruchPuls: 70, ruchFala: 60, ruchKrzywa: krzywa}, 1, 0.37 + 2).every((q, i) => Math.abs(q[2] - p[i][2]) < 1e-9);
    sprawdz(wZakresie && rozne > 5 && petla, `pulsowanie (${krzywa}): wielkości 30–100%, fala daje ${rozne} faz, po cyklu 2 s to samo`);
  }
  /* zapis w skali — z ruchem w każdym rodzaju */
  const o = {ruchPuls: 50, ruchFala: 40, ruchFalaKat: 120, ruchKat: 15, ruchObrot: 45, ruchSkok: 30, ruchPostoj: 3, ruchDrzenie: 60, shape: "square"};
  const a = g(o, 1, 1.23), b = g(o, 3, 1.23);
  sprawdz(a.length === b.length && a.every((p, i) => Math.abs(p[0]*3 - b[i][0]) < 1e-9 && Math.abs(p[2]*3 - b[i][2]) < 1e-9 && Math.abs(p[3] - b[i][3]) < 1e-12),
          "pulsowanie, fala, obrót skokami i drżenie: z=3 dokładnie ×3, te same kąty");
  /* obrót: stała prędkość i skokami z postojem */
  const kat = (o, t) => g({shape: "square", ...o}, 1, t)[0][3] - baza[0][3];
  sprawdz(Math.abs(kat({ruchObrot: 90}, 1) - Math.PI/2) < 1e-12 && Math.abs(kat({ruchKat: -30}, 5) + Math.PI/6) < 1e-12, "obrót 90°/s po 1 s = 90°, stały kąt −30°");
  /* skok 45° przy 90°/s: ruch 0,5 s, postój 1 s — w postoju kąt stoi */
  const sk = {ruchObrot: 90, ruchSkok: 45, ruchPostoj: 10};
  sprawdz(Math.abs(kat(sk, 0.6) - Math.PI/4) < 1e-12 && Math.abs(kat(sk, 1.4) - Math.PI/4) < 1e-12 && Math.abs(kat(sk, 1.75) - Math.PI/4*1.5) < 1e-12,
          "skokami co 45°: w postoju stoi, w połowie ruchu kolejnego skoku — w połowie drogi");
  ustaw({}); S.czasKlatki = 0;
  const bezObr = g({shape: "square", obrotZSiatka: false, ruchKat: 30});
  sprawdz(bezObr.every(p => Math.abs(p[3] - Math.PI/6) < 1e-12), "„obracaj z siatką” wyłączone — zostaje tylko obrót kształtów");
  sprawdz(g({ruchCykl: 55, ruchFala: 80, ruchSkok: 90}, 1, 3.3).every((p, i) => p.length === baza[i].length && p.every((v, j) => v === baza[i][j])),
          "bez pulsowania, obrotu i drżenia — co do bitu jak bez ruchu (inne suwaki ruchu bez znaczenia)");
  S.czasKlatki = 0;
}

console.log("--- cyfry na punktach ---");
{
  const ink = {ang: 20, cov, off: [0, 0]};
  ustaw({cell: 9, shape: "cyfra"});
  const a = geometria(gradient, W, H, ink, 1).kropki, b = geometria(gradient, W, H, ink, 3).kropki;
  const liczba = kr => obrys("cyfra", kr, 0, 9).length;     /* liczba segmentów rozróżnia cyfry (1 → 2, 8 → 7) */
  sprawdz(a.length === b.length && a.every((p, i) => p[4] >= 0 && p[4] === b[i][4]), "każdy punkt ma kod położenia, ten sam w zapisie 3×");
  const rozne = new Set(a.map(liczba));
  sprawdz(rozne.size >= 4, `cyfry rozłożone losowo (${rozne.size} różnych liczb segmentów)`);
  ustaw({cell: 9, shape: "cyfra", nierowne: 30});
  const c = geometria(gradient, W, H, ink, 1).kropki;
  sprawdz(c.every((p, i) => p[4] === i), "z nierównym rastrem — numer punktu zostaje (nie kod położenia)");
  ustaw({cell: 9, shape: "circle"});
  sprawdz(geometria(gradient, W, H, ink, 1).kropki.every(p => p.length === 4), "inny kształt — punkty bez kodu");
}

console.log("--- proporcje punktu ---");
{
  const ink = {ang: 30, cov, off: [0, 0]};
  const g = (o, z = 1) => { ustaw({cell: 9, shape: "square", ...o}); return geometria(gradient, W, H, ink, z); };
  const baza = g({}).kropki;
  sprawdz(baza.every(p => p.length === 4) && !g({}).rozciag, "neutralne — punkty w dawnej postaci, bez rozciągania");
  const a = g({punktSzer: 200, punktWys: 50});
  sprawdz(a.rozciag && a.kropki.every(p => p.length === 9 && p[7] === 2 && p[8] === 0.5 && p[4] === -1 && p[5] === null && p[6] === -1), "stała szerokość 200%, wysokość 50% — mnożniki w punkcie");
  /* kwadrat pod kątem 0 (obrotZSiatka wył.), 2× szerzej i 2× niżej */
  const [kw] = obrys("square", [50, 50, 10, 0, -1, null, -1, 2, 0.5], 0, 9);
  const xs = kw.map(p => p[0]), ys = kw.map(p => p[1]);
  sprawdz(Math.max(...xs) - Math.min(...xs) === 40 && Math.max(...ys) - Math.min(...ys) === 10, "obrys kwadratu 20×20 → 40×10");
  const [kw2] = obrys("square", [0, 0, 10, Math.PI/2, -1, null, -1, 2, 0.5], 0, 9);
  sprawdz(Math.abs(Math.max(...kw2.map(p => p[1])) - 20) < 1e-9, "rozciąga w osiach kształtu (obrócony o 90° — wzdłuż pionu)");
  const l = g({punktLosSzer: 100, punktLosWys: 40}).kropki;
  const sx = l.map(p => p[7]), sy = l.map(p => p[8]);
  sprawdz(Math.min(...sx) >= 0.25 && Math.max(...sx) <= 1.75 && Math.min(...sy) >= 0.7 && Math.max(...sy) <= 1.3 && new Set(sx).size > l.length*0.9,
          `losowe: szerokość 25–175%, wysokość 70–130%, każdy punkt inaczej (${new Set(sx).size}/${l.length})`);
  const l3 = g({punktLosSzer: 100, punktLosWys: 40}, 3).kropki;
  sprawdz(l3.length === l.length && l3.every((p, i) => p[7] === l[i][7] && p[8] === l[i][8] && Math.abs(p[0] - l[i][0]*3) < 1e-9), "zapis 3× — te same proporcje każdego punktu");
  const t = g({shape: "tony", znakiIle: 4, punktSzer: 150}).kropki;
  sprawdz(t.every(p => p.length === 9 && p[6] >= 0 && p[7] === 1.5), "znaki według tonu zachowują poziom obok proporcji");
}

console.log("--- papier w gradiencie ---");
{
  const { stopnieTla, geometriaTla, svgTla, GRADIENT_PAPIERU } = await import("../src/papier.js");
  const dom = JSON.stringify(GRADIENT_PAPIERU);
  for(const [opis, t] of [["pusty", ""], ["zepsuty JSON", "[[#fff"], ["jeden punkt", '[["#ffffff",0]]'], ["nie tablica", '{"a":1}']]){
    ustaw({papierGrad: t});
    sprawdz(JSON.stringify(stopnieTla()) === dom, `${opis} — domyślny gradient`);
  }
  ustaw({papierGrad: JSON.stringify([["#FF0000", 80], ["zly", 10], ["#00ff00", -40], ["#0000ff", 250], ["#123456", "5"]])});
  sprawdz(JSON.stringify(stopnieTla()) === JSON.stringify([["#00ff00", 0], ["#ff0000", 80], ["#0000ff", 100]]), "złe punkty odrzucone, położenia przycięte do 0–100, kolejność wg położenia");
  ustaw({papierTlo: "liniowy", papierKat: 0});
  let g = geometriaTla(200, 100);
  sprawdz(g.x1 === 0 && g.x2 === 200 && g.y1 === 50 && g.y2 === 50, "0° — od lewej do prawej przez cały kadr");
  ustaw({papierTlo: "liniowy", papierKat: 45});
  g = geometriaTla(200, 100);
  const rzut = (x, y) => ((x - g.x1)*(g.x2 - g.x1) + (y - g.y1)*(g.y2 - g.y1))/((g.x2 - g.x1)**2 + (g.y2 - g.y1)**2);
  sprawdz(Math.abs(rzut(0, 0)) < 1e-9 && Math.abs(rzut(200, 100) - 1) < 1e-9, "45° — rogi dostają skrajne kolory (0 i 1)");
  const [def, wyp] = svgTla(200, 100);
  sprawdz(/^<linearGradient id="papier" gradientUnits="userSpaceOnUse"/.test(def) && wyp === "url(#papier)" && (def.match(/<stop /g) || []).length === 3, "SVG: linearGradient w jednostkach kadru, 3 punkty");
  ustaw({papierTlo: "promienisty"});
  g = geometriaTla(300, 400);
  sprawdz(g.r === 250 && /<radialGradient[^>]* r="250"/.test(svgTla(300, 400)[0]), "promienisty — promień do rogów");
  ustaw({papierTlo: "kolor", paper: "#abcdef"});
  sprawdz(JSON.stringify(svgTla(10, 10)) === JSON.stringify(["", "#abcdef"]), "jeden kolor — bez gradientu w SVG");
}

console.log("--- faktura farby ---");
{
  /* farba: koło na pustym papierze */
  const fw = 80, fh = 60, z = 2, OW = fw*z, OH = fh*z;
  const kolo = () => { const p = new Uint8ClampedArray(OW*OH*4); for(let y=0;y<OH;y++) for(let x=0;x<OW;x++){ const o=(y*OW+x)*4, d = Math.hypot(x - 80, y - 60); p[o]=255; p[o+3] = d < 30 ? 255 : (d < 31 ? Math.round((31 - d)*255) : 0); } return p; };
  const suma = p => { let s = 0; for(let i=3;i<p.length;i+=4) s += p[i]; return s/255; };
  const zr = kolo();
  ustaw({});
  const a = kolo(); krycie(a, fw, fh, z, 7);
  sprawdz(a.every((v, i) => v === zr[i]), "wszystko na zero: farba bez zmian");
  ustaw({szorstkosc: 80});
  const b = kolo(); krycie(b, fw, fh, z, 7);
  let poza = 0, brzeg = 0;
  for(let y=0;y<OH;y++) for(let x=0;x<OW;x++){ const d = Math.hypot(x-80, y-60), v = b[(y*OW+x)*4+3]; if(d > 40 && v > 0) poza++; if(d > 26 && d < 34 && v !== zr[(y*OW+x)*4+3]) brzeg++; }
  sprawdz(poza === 0 && brzeg > 50, `szorstkość: brzeg poszarpany (${brzeg} pikseli zmienionych), na czystym papierze nic`);
  const b2 = kolo(); krycie(b2, fw, fh, z, 7);
  sprawdz(b.every((v, i) => v === b2[i]), "powtarzalnie (to samo ziarno = ten sam brzeg)");
  ustaw({rozlanie: 70}); const c = kolo(); krycie(c, fw, fh, z, 7);
  ustaw({plamy: 90}); const d = kolo(); krycie(d, fw, fh, z, 7);
  ustaw({dziury: 90}); const e = kolo(); krycie(e, fw, fh, z, 7);
  sprawdz(suma(c) > suma(zr)*1.05, `rozlanie: więcej farby (${suma(zr).toFixed(0)} → ${suma(c).toFixed(0)})`);
  sprawdz(suma(d) < suma(zr)*0.97 && suma(e) < suma(zr)*0.97, `plamy i dziury: mniej farby (${suma(d).toFixed(0)}, ${suma(e).toFixed(0)})`);
  ustaw({walek: 90}); const g = kolo(); krycie(g, fw, fh, z, 7);
  /* smugi poziome: krycie zmienia się bardziej w pionie niż w poziomie */
  let pion = 0, poz = 0;
  for(let y=40;y<80;y++) for(let x=60;x<100;x++){ const v = g[(y*OW+x)*4+3]; pion += Math.abs(v - g[((y+1)*OW+x)*4+3]); poz += Math.abs(v - g[(y*OW+x+1)*4+3]); }
  sprawdz(suma(g) < suma(zr)*0.97 && pion > poz*2, `ślady wałka: mniej farby, smugi poziome (zmiany w pionie ${pion} vs w poziomie ${poz})`);
}

console.log("--- plamy bez płatów, skala faktury, faktura w czasie ---");
{
  /* pełna farba 240×180: wykruszenia mają być drobne i rozsiane, nie płatami */
  const fw = 240, fh = 180, pelna = () => { const p = new Uint8ClampedArray(fw*fh*4); for(let i=0;i<fw*fh;i++){ p[i*4] = 255; p[i*4+3] = 255; } return p; };
  const platy = p => {
    const dziura = new Uint8Array(fw*fh), byl = new Uint8Array(fw*fh); let n = 0, maks = 0, ile = 0;
    for(let i=0;i<fw*fh;i++) if(p[i*4+3] < 128){ dziura[i] = 1; ile++; }
    for(let i=0;i<fw*fh;i++) if(dziura[i] && !byl[i]){
      n++; let roz = 0; const st = [i]; byl[i] = 1;
      while(st.length){ const j = st.pop(); roz++; const x = j % fw, y = (j/fw)|0;
        for(const k of [x > 0 ? j-1 : -1, x < fw-1 ? j+1 : -1, y > 0 ? j-fw : -1, y < fh-1 ? j+fw : -1]) if(k >= 0 && dziura[k] && !byl[k]){ byl[k] = 1; st.push(k); } }
      maks = Math.max(maks, roz);
    }
    return {n, maks, udzial: ile/(fw*fh)};
  };
  ustaw({plamy: 100}); const a = pelna(); krycie(a, fw, fh, 1, 7);
  const pa = platy(a);
  sprawdz(pa.maks <= 60 && pa.n > 200 && pa.udzial > 0.05 && pa.udzial < 0.4,
          `plamy 100%: ${pa.n} drobnych wykruszeń, największe ${pa.maks} px, ${(pa.udzial*100).toFixed(0)}% powierzchni — bez dużych płatów`);
  ustaw({plamy: 100, fakturaSkala: 200}); const b = pelna(); krycie(b, fw, fh, 1, 7);
  const pb = platy(b);
  sprawdz(pb.n < pa.n*0.5 && pb.maks > pa.maks, `skala faktury 200%: wykruszeń ${pa.n} → ${pb.n}, większe (do ${pb.maks} px)`);
  ustaw({plamy: 100, fakturaSkala: 100}); const c = pelna(); krycie(c, fw, fh, 1, 7);
  sprawdz(c.every((v, i) => v === a[i]), "skala 100% — co do bitu jak bez suwaka");
  ustaw({}); S.klatkaNr = 3;
  const stale = ziarnoFaktury(77);
  ustaw({fakturaCzas: true}); S.klatkaNr = 3; const k3 = ziarnoFaktury(77); S.klatkaNr = 4; const k4 = ziarnoFaktury(77); S.klatkaNr = 3;
  sprawdz(stale === 77 && k3 !== k4 && k3 === ziarnoFaktury(77) && k3 >= 1 && k3 <= 99991, "faktura w czasie: inne ziarno co klatkę, powtarzalne; wyłączona — stałe");
  S.klatkaNr = 0;
}

console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
