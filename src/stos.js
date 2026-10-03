/* Stos efektów: które efekty są włączone i w jakiej kolejności.

   Kolejność trzyma S.efekty — zwykły tekst, np. "jpeg,!rgb,glow": identyfikatory
   po przecinku, „!" przed nazwą to efekt ukryty (parametry zostają, efekt nie
   działa). Tekst, a nie tablica, bo przechodzi bez zmian przez presety, plik
   ustawień, localStorage i ich nieufną walidację (typ musi się zgadzać
   z DEFAULTS). Parametry efektów to zwykłe pola S — da się je animować.

   Pusty S.efekty to „po staremu": sortowanie, przesunięcie RGB i poświata
   w tej stałej kolejności, o ile mają niezerowe parametry. Dzięki temu presety
   i pliki sprzed stosu dają obraz co do bajtu taki jak wcześniej. */
import { S, DEFAULTS } from "./state.js";
import { permutacjaSortu, zastosujPermutacje, przesuniecieRGB, przesunRGB, warstwaPoswiaty, nalozPoswiate } from "./effects.js";
import { zabarwienie, aberracja, jpeg, warstwaGwiazd, faktura, obrobka } from "./fx.js";

/* id, nazwa w panelu, klucze w S, ustawienia przy dodaniu, czy zostaje w SVG
   z ditheringu (tylko te, które nie tworzą nowych kolorów… i przesunięcie RGB,
   które w SVG było od początku) */
export const EFEKTY = [
  {id:"sort",    nazwa:"Sortowanie pikseli", klucze:["sort","sortOd","sortDo"], start:{sort:"poziomo"}, wektor:true},
  {id:"rgb",     nazwa:"Przesunięcie RGB",   klucze:["rgb","rgbKat"], start:{rgb:6}, wektor:true},
  {id:"chrom",   nazwa:"Aberracja chromatyczna", klucze:["chrom"], start:{chrom:12}},
  {id:"jpeg",    nazwa:"JPEG glitch",        klucze:["jpegJakosc","jpegGlitch","jpegZiarno"], start:{jpegJakosc:12, jpegGlitch:30}},
  {id:"tint",    nazwa:"Zabarwienie",        klucze:["tint","tintKolor","tintTryb"], start:{tint:70}},
  {id:"glow",    nazwa:"Poświata",           klucze:["glow","glowR","glowProg","glowZrodlo","glowKolor"], start:{glow:90}},
  {id:"gwiazdy", nazwa:"Gwiazdki",           klucze:["gwiazdy","gwProg","gwRamiona","gwDlugosc","gwKat"], start:{gwiazdy:120}},
  {id:"faktura", nazwa:"Faktura",            klucze:["faktura","faktSkala","faktTryb","faktKrycie"], start:{faktura:"skanlinie"}},
  {id:"post",    nazwa:"Obróbka końcowa",    klucze:["postJas","postKon","postNas","winieta","postZiarno"], start:{winieta:45}},
  {id:"czas",    nazwa:"Zmienność w czasie", klucze:["czasSzum","czasDrganie","czasCykl"], start:{czasSzum:30}, przed:true}
];
export const wpisEfektu = id => EFEKTY.find(e => e.id === id);

/* czy efekt przy bieżących parametrach w ogóle coś zmienia */
const DZIALA = {
  sort: () => S.sort !== "brak", rgb: () => S.rgb > 0, glow: () => S.glow > 0,
  chrom: () => S.chrom > 0, jpeg: () => true, tint: () => S.tint > 0, gwiazdy: () => S.gwiazdy > 0,
  faktura: () => S.faktura !== "brak" && S.faktKrycie > 0,
  post: () => !!(S.postJas || S.postKon || S.postNas || S.winieta || S.postZiarno),
  czas: () => S.czasSzum > 0 || S.czasDrganie > 0 || !!S.czasCykl
};

/* [{id, widoczny}] w kolejności stosu */
export function lista(){
  if(!S.efekty){
    return ["sort", "rgb", "glow"].filter(id => DZIALA[id]()).map(id => ({id, widoczny: true}));
  }
  const wyn = [], byly = new Set();
  for(const kawalek of String(S.efekty).split(",")){
    const s = kawalek.trim(), widoczny = !s.startsWith("!"), id = s.replace(/^!/, "");
    if(!wpisEfektu(id) || byly.has(id)) continue;      /* nieznane i powtórzone — z ręcznie podłubanego pliku */
    byly.add(id); wyn.push({id, widoczny});
  }
  return wyn;
}
export function zapiszListe(l){ S.efekty = l.map(e => (e.widoczny ? "" : "!") + e.id).join(","); }
/* czynne efekty po ditheringu, w kolejności */
export const czynne = () => lista().filter(e => e.widoczny && !wpisEfektu(e.id).przed && DZIALA[e.id]()).map(e => e.id);
export const efektyPo = () => czynne().length > 0;
export const zmiennoscCzynna = () => lista().some(e => e.id === "czas" && e.widoczny) && DZIALA.czas();

/* dodanie, usunięcie (parametry wracają do domyślnych, żeby „po staremu"
   niczego nie wskrzesiło), ukrycie, przesunięcie */
export function dodaj(id){
  const l = lista();
  if(l.some(e => e.id === id)) return;
  Object.assign(S, wpisEfektu(id).start);
  l.push({id, widoczny: true});
  zapiszListe(l);
}
export function usun(id){
  const l = lista().filter(e => e.id !== id);
  for(const k of wpisEfektu(id).klucze) S[k] = DEFAULTS[k];
  zapiszListe(l);
}
export function przelacz(id){
  const l = lista(); const e = l.find(x => x.id === id);
  if(e){ e.widoczny = !e.widoczny; zapiszListe(l); }
}
export function przesun(id, o){
  const l = lista(), i = l.findIndex(e => e.id === id), j = i + o;
  if(i < 0 || j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]];
  zapiszListe(l);
}

/* ---------- uruchamianie: dithering ----------
   Na buforze po pikselizacji, w workerze. `jednostka` = piksele bufora na
   piksel obrazu (1/pix). {wektor:true} zostawia tylko efekty, które SVG
   z ditheringu potrafi oddać prostokątami. */
export function uruchomNaBuforze(p, w, h, jednostka, opcje){
  const tylkoWektor = opcje && opcje.wektor;
  for(const id of czynne()){
    if(tylkoWektor && !wpisEfektu(id).wektor) continue;
    if(id === "sort"){ const perm = permutacjaSortu(p, w, h); if(perm) zastosujPermutacje(p, perm, w, h, 1); }
    else if(id === "rgb"){ const [dx, dy] = przesuniecieRGB(jednostka); przesunRGB(p, w, h, dx, dy); }
    else if(id === "glow"){ const L = warstwaPoswiaty(p, w, h, jednostka); if(L) nalozPoswiate(p, L); }
    else if(id === "gwiazdy"){ const L = warstwaGwiazd(p, w, h, jednostka); if(L) nalozPoswiate(p, L); }
    else if(id === "chrom") aberracja(p, w, h);
    else if(id === "jpeg") jpeg(p, w, h);
    else if(id === "tint") zabarwienie(p);
    else if(id === "faktura") faktura(p, w, h, 1);
    else if(id === "post") obrobka(p, w, h, 1);
  }
}

/* ---------- uruchamianie: raster w skali z ----------
   Duży obraz (W·z × H·z) i mały w kadrze podglądu idą przez efekty razem,
   każdy efekt po swojemu, tak żeby duży był powiększeniem małego:
   - sortowanie: permutacja z małego, przeniesiona blokami z×z;
   - przesunięcie RGB: w pikselach podglądu × z;
   - poświata i gwiazdki: warstwa z małego, powiększona płynnie;
   - aberracja: względna do kadru, liczona wprost na dużym;
   - zabarwienie, faktura, obróbka: punktowe, faktura i ziarno w siatce z×z;
   - JPEG: bloki 8×8 są w pikselach podglądu, więc liczony na małym, a na duży
     przenosimy różnicę (przed − po) powiększoną blokami.
   Przy z=1 mały i duży to ten sam bufor i każdy efekt liczy się raz. */
export function uruchomWSkali(duzy, maly, W, H, z){
  const OW = W*z, OH = H*z, jeden = z === 1;
  for(const id of czynne()){
    if(id === "sort"){
      const perm = permutacjaSortu(maly, W, H);
      if(perm){ zastosujPermutacje(duzy, perm, W, H, z); if(!jeden) zastosujPermutacje(maly, perm, W, H, 1); }
    } else if(id === "rgb"){
      const [dx, dy] = przesuniecieRGB(1);
      przesunRGB(duzy, OW, OH, dx*z, dy*z); if(!jeden) przesunRGB(maly, W, H, dx, dy);
    } else if(id === "glow" || id === "gwiazdy"){
      const L = id === "glow" ? warstwaPoswiaty(maly, W, H, 1) : warstwaGwiazd(maly, W, H, 1);
      if(L){ nalozPoswiate(duzy, jeden ? L : powiekszGladko(L, W, H, z)); if(!jeden) nalozPoswiate(maly, L); }
    } else if(id === "chrom"){
      aberracja(duzy, OW, OH); if(!jeden) aberracja(maly, W, H);
    } else if(id === "tint"){
      zabarwienie(duzy); if(!jeden) zabarwienie(maly);
    } else if(id === "faktura"){
      faktura(duzy, OW, OH, z); if(!jeden) faktura(maly, W, H, 1);
    } else if(id === "post"){
      obrobka(duzy, OW, OH, z); if(!jeden) obrobka(maly, W, H, 1);
    } else if(id === "jpeg"){
      if(jeden){ jpeg(duzy, W, H); continue; }
      const przed = new Uint8ClampedArray(maly);
      jpeg(maly, W, H);
      for(let y=0; y<OH; y++){
        const sy = (y/z) | 0;
        for(let x=0; x<OW; x++){
          const s = (sy*W + ((x/z) | 0))*4, o = (y*OW + x)*4;
          duzy[o] += maly[s] - przed[s]; duzy[o+1] += maly[s+1] - przed[s+1]; duzy[o+2] += maly[s+2] - przed[s+2];
        }
      }
    }
  }
}
/* warstwa W×H (Float32 RGBA) → (W·z)×(H·z), dwuliniowo, środki pikseli wyrównane */
function powiekszGladko(L, W, H, z){
  const OW = W*z, OH = H*z, wyn = new Float32Array(OW*OH*4);
  for(let y=0; y<OH; y++){
    const sy = Math.max(0, Math.min(H - 1, (y + 0.5)/z - 0.5)), y0 = Math.floor(sy), y1 = Math.min(H - 1, y0 + 1), fy = sy - y0;
    for(let x=0; x<OW; x++){
      const sx = Math.max(0, Math.min(W - 1, (x + 0.5)/z - 0.5)), x0 = Math.floor(sx), x1 = Math.min(W - 1, x0 + 1), fx = sx - x0;
      const a = (y0*W + x0)*4, b = (y0*W + x1)*4, c = (y1*W + x0)*4, d = (y1*W + x1)*4, o = (y*OW + x)*4;
      for(let k=0; k<3; k++) wyn[o+k] = (L[a+k]*(1-fx) + L[b+k]*fx)*(1-fy) + (L[c+k]*(1-fx) + L[d+k]*fx)*fy;
    }
  }
  return wyn;
}
