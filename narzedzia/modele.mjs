/* npm run modele — przygotowuje automatyczne usuwanie tła:
   1. kopiuje środowisko ONNX Runtime Web (onnxruntime-web, MIT) z node_modules
      do vendor/onnx/ — apka nie ma bundlera, więc pliki muszą leżeć obok niej;
   2. pobiera model IS-Net „isnet-general-use" (Apache 2.0, z wydań rembg,
      MIT) do modele/ i sprawdza sumę MD5 z rembg.
   Oba katalogi są w .gitignore (razem ~200 MB). Wersja na pulpit pakuje je
   do instalatora, więc tam działa bez sieci. */
import { copyFileSync, mkdirSync, existsSync, createWriteStream, readFileSync, statSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KORZEN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ZRODLO = path.join(KORZEN, "node_modules", "onnxruntime-web", "dist");
const VENDOR = path.join(KORZEN, "vendor", "onnx"), MODELE = path.join(KORZEN, "modele");
const PLIKI = ["ort.webgpu.min.mjs", "ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];
const MODEL = {plik: "isnet-general-use.onnx", md5: "fc16ebd8b0c10d971d3513d564d01e29",
  url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx"};

if(!existsSync(ZRODLO)){ console.error("Brak node_modules/onnxruntime-web — najpierw npm install."); process.exit(1); }
mkdirSync(VENDOR, {recursive: true});
for(const p of PLIKI) copyFileSync(path.join(ZRODLO, p), path.join(VENDOR, p));
console.log("ONNX Runtime → vendor/onnx/ (" + PLIKI.length + " pliki)");

mkdirSync(MODELE, {recursive: true});
const cel = path.join(MODELE, MODEL.plik);
const md5 = p => createHash("md5").update(readFileSync(p)).digest("hex");
if(existsSync(cel) && md5(cel) === MODEL.md5){
  console.log("Model już jest: modele/" + MODEL.plik);
} else {
  console.log("Pobieram " + MODEL.plik + " (~180 MB)…");
  const r = await fetch(MODEL.url);
  if(!r.ok){ console.error("Nie udało się pobrać modelu: HTTP " + r.status); process.exit(1); }
  const tymczasowy = cel + ".czesc";
  await pipeline(Readable.fromWeb(r.body), createWriteStream(tymczasowy));
  const suma = md5(tymczasowy);
  if(suma !== MODEL.md5){ console.error("Zła suma MD5 (" + suma + ") — plik uszkodzony, spróbuj jeszcze raz."); process.exit(1); }
  renameSync(tymczasowy, cel);
  console.log("Model: modele/" + MODEL.plik + " (" + (statSync(cel).size/1e6).toFixed(0) + " MB)");
}
