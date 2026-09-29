import { S, LOOK } from "./state.js";
import { out } from "./dom.js";
import { renderDither } from "./dither.js";
import { renderHalftone } from "./halftone.js";
import { svgDither, svgHalftone } from "./vector.js";
import { Zip } from "./zip.js";

/* Przetwarzanie całego folderu tymi samymi ustawieniami co podgląd.

   Wyniki idą do jednego pliku ZIP: przeglądarki blokują serię osobnych pobrań
   po kilku plikach, a zapis prosto do folderu (File System Access) działa tylko
   w Chrome i Edge. Struktura podfolderów zostaje zachowana w paczce.

   Ustawienia zapamiętujemy na starcie i przywracamy przed każdym plikiem — panel
   i tak jest zablokowany, ale gdyby coś ruszyło S w trakcie, paczka i tak nie
   wyjdzie z plikami w różnych ustawieniach. Obraz z podglądu wraca na miejsce
   po skończeniu, także po przerwaniu i po błędzie. */

const KLUCZE = [...LOOK, "mode", "scl", "fmt", "custom"];

/* ścieżka wewnątrz wybranego folderu, bez nazwy samego folderu — w paczce
   ląduje „podfolder/zdjecie", a nie „MojFolder/podfolder/zdjecie" */
export function sciezkaWPaczce(f){
  const rel = f.webkitRelativePath || "";
  const czesci = rel.split("/").filter(Boolean);
  return czesci.length > 1 ? czesci.slice(1).join("/") : (f.name || "obraz");
}

const toBlob = kanwa => new Promise((ok, zle) =>
  kanwa.toBlob(b => b ? ok(b) : zle(new Error("Przeglądarka nie zakodowała PNG (za duży obraz?)")), "image/png"));

export async function przetworzFolder(pliki, {postep = ()=>{}, przerwano = ()=>false} = {}){
  const obrazy = pliki.filter(f => /^image\//.test(f.type))
                      .sort((a,b) => sciezkaWPaczce(a).localeCompare(sciezkaWPaczce(b), "pl"));
  const stan = {}; for(const k of KLUCZE) stan[k] = S[k];
  const obrazPodgladu = S.img;
  const zip = new Zip(), pominiete = [];
  let zrobione = 0, przerwane = false;

  try{
    for(let i=0; i<obrazy.length; i++){
      if(przerwano()){ przerwane = true; break; }
      const f = obrazy[i], sciezka = sciezkaWPaczce(f);
      postep(i, obrazy.length, sciezka);
      Object.assign(S, stan);

      let obraz;
      try{ obraz = await createImageBitmap(f); }
      catch{ pominiete.push(sciezka); continue; }

      try{
        S.img = obraz;
        const baza = sciezka.replace(/\.[^./]+$/, "");
        if(S.fmt === "svg"){
          const {svg} = S.mode === "dither" ? await svgDither() : svgHalftone();
          zip.dodaj(baza + ".svg", new TextEncoder().encode(svg));
        } else {
          if(S.mode === "dither") await renderDither(S.scl, {keep:true}); else renderHalftone(S.scl);
          zip.dodaj(baza + ".png", new Uint8Array(await (await toBlob(out)).arrayBuffer()));
        }
        zrobione++;
      }
      catch(err){
        /* przekroczony limit ZIP-a psuje całą paczkę, więc nie ma sensu liczyć dalej */
        if(/ZIP|4 GB/.test(err.message)) throw err;
        pominiete.push(sciezka + " (" + err.message + ")");
      }
      finally{ obraz.close(); }
    }
  } finally {
    Object.assign(S, stan);
    S.img = obrazPodgladu;
  }
  return {zip: zrobione ? zip.blob() : null, zrobione, pominiete, przerwane,
          nieobrazy: pliki.length - obrazy.length, wszystkich: obrazy.length};
}
