/* Kontener MP4 dla obrazu H.264 z WebCodecs. Czysty moduł, bez DOM-u —
   testowany w Node (testy/mp4.mjs), a odtwarzanie w przeglądarce.

   Koder (VideoEncoder) oddaje gotowe kawałki H.264 w formacie „avc", czyli
   z długościami zamiast znaczników startu, i opis dekodera (avcC). Tu zostaje
   tylko ułożyć z nich plik: ftyp, moov z tablicami próbek, mdat z danymi.
   Moov idzie przed mdat („faststart"), żeby film dało się odtwarzać, zanim
   cały się wczyta — tego chcą serwisy, do których się go wrzuca.

   Wszystkie próbki w jednym kawałku (chunk), więc tabela stco ma jeden wpis.
   Bez dźwięku. Bez 64-bitowych przesunięć: plik do 4 GB, powyżej błąd. */

export const SKALA_CZASU = 90000;   /* 30, 29,97, 25, 24 i 12 kl/s dają całe tyknięcia */

const tekst = s => Uint8Array.from(s, c => c.charCodeAt(0));
/* liczby big-endian, wszystkie tej samej szerokości (2 albo 4 bajty) */
function liczby(szer, v){
  const b = new Uint8Array(v.length*szer), d = new DataView(b.buffer);
  v.forEach((x, i) => szer === 2 ? d.setUint16(i*2, x) : d.setUint32(i*4, x >>> 0));
  return b;
}
const u32 = (...v) => liczby(4, v);
const u16 = (...v) => liczby(2, v);
const zera = n => new Uint8Array(n);

function pudlo(typ, ...czesci){
  const dl = 8 + czesci.reduce((s, c) => s + c.length, 0);
  const b = new Uint8Array(dl);
  new DataView(b.buffer).setUint32(0, dl);
  b.set(tekst(typ), 4);
  let o = 8;
  for(const c of czesci){ b.set(c, o); o += c.length; }
  return b;
}
const pelne = (typ, wersja, flagi, ...czesci) => pudlo(typ, u32((wersja << 24) | flagi), ...czesci);

const MACIERZ = u32(0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000);

/* Czasy próbek. Koder podaje znaczniki prezentacji w mikrosekundach,
   w kolejności dekodowania. Bez klatek B (typowo dla WebCodecs) to ta sama
   kolejność i ctts nie jest potrzebne; z klatkami B liczymy czasy dekodowania
   z posortowanych znaczników, przesuwamy je tak, żeby żadna próbka nie była
   pokazywana przed zdekodowaniem, a przesunięcie zdejmujemy listą edycji. */
export function czasyProbek(probki){
  const pts = probki.map(p => Math.round(p.pts*SKALA_CZASU/1e6));
  const pos = pts.slice().sort((a, b) => a - b);
  let przes = 0;
  for(let i=0; i<pts.length; i++) przes = Math.max(przes, pos[i] - pts[i]);
  const dts = pos.map(t => t - przes);
  const ostatnia = probki.reduce((m, p, i) => pts[i] > pts[m] ? i : m, 0);
  const dlOstatniej = Math.max(1, Math.round(probki[ostatnia].dur*SKALA_CZASU/1e6));
  const delty = dts.map((t, i) => i < dts.length-1 ? dts[i+1] - t : dlOstatniej);
  const ctts = pts.map((t, i) => t - dts[i]);
  const trwanie = pos[pos.length-1] - pos[0] + dlOstatniej;
  return {delty, ctts, przes, trwanie, start: pos[0]};
}

/* tablica [ile, wartość] z sąsiadujących powtórzeń */
function serie(a){
  const s = [];
  for(const v of a){
    if(s.length && s[s.length-1][1] === v) s[s.length-1][0]++;
    else s.push([1, v]);
  }
  return s;
}

function moov({szer, wys, avcC, probki, przesuniecieDanych}){
  const {delty, ctts, przes, trwanie, start} = czasyProbek(probki);
  const n = probki.length;
  const stts = serie(delty);
  const kluczowe = probki.map((p, i) => p.klucz ? i+1 : 0).filter(Boolean);
  const bezCtts = ctts.every(v => v === 0);

  const stbl = pudlo("stbl",
    pelne("stsd", 0, 0, u32(1), pudlo("avc1",
      zera(6), u16(1),                       /* data_reference_index */
      zera(16), u16(szer, wys),
      u32(0x00480000, 0x00480000, 0), u16(1),
      zera(32), u16(0x0018, 0xFFFF),
      pudlo("avcC", avcC))),
    pelne("stts", 0, 0, u32(stts.length), ...stts.map(([k, v]) => u32(k, v))),
    ...(bezCtts ? [] : [pelne("ctts", 0, 0, u32(serie(ctts).length), ...serie(ctts).map(([k, v]) => u32(k, v)))]),
    ...(kluczowe.length === n ? [] : [pelne("stss", 0, 0, u32(kluczowe.length), ...kluczowe.map(k => u32(k)))]),
    pelne("stsc", 0, 0, u32(1, 1, n, 1)),
    pelne("stsz", 0, 0, u32(0, n), ...probki.map(p => u32(p.dane.length))),
    pelne("stco", 0, 0, u32(1, przesuniecieDanych))
  );
  /* lista edycji: film zaczyna się od pierwszej pokazywanej klatki, nawet gdy
     czasy dekodowania zostały przesunięte w tył albo pierwszy znacznik nie jest zerem */
  const media = przes + start;
  const edts = media ? [pudlo("edts", pelne("elst", 0, 0, u32(1, trwanie, media, 0x00010000)))] : [];

  return pudlo("moov",
    pelne("mvhd", 0, 0, u32(0, 0, SKALA_CZASU, trwanie, 0x00010000), u16(0x0100), zera(10), MACIERZ, zera(24), u32(2)),
    pudlo("trak",
      pelne("tkhd", 0, 3, u32(0, 0, 1, 0, trwanie), zera(8), u16(0, 0, 0, 0), MACIERZ, u32(szer << 16, wys << 16)),
      ...edts,
      pudlo("mdia",
        pelne("mdhd", 0, 0, u32(0, 0, SKALA_CZASU, trwanie), u16(0x55C4, 0)),   /* język „und" */
        pelne("hdlr", 0, 0, u32(0), tekst("vide"), zera(12), tekst("VideoHandler\0")),
        pudlo("minf",
          pelne("vmhd", 0, 1, zera(8)),
          pudlo("dinf", pelne("dref", 0, 0, u32(1), pelne("url ", 0, 1))),
          stbl)))
  );
}

/* probki: [{dane: Uint8Array, pts: µs, dur: µs, klucz: bool}] w kolejności,
   w jakiej oddał je koder; avcC: opis dekodera z metadanych kodera.
   Zwraca tablicę części pliku — do sklejenia w Blob po stronie przeglądarki. */
export function zlozMp4({szer, wys, avcC, probki}){
  if(!probki.length) throw new Error("Brak klatek do zapisania.");
  if(!avcC || !avcC.length) throw new Error("Koder nie oddał opisu strumienia H.264.");
  const ftyp = pudlo("ftyp", tekst("isom"), u32(0x200), tekst("isomiso2avc1mp41"));
  const dane = probki.reduce((s, p) => s + p.dane.length, 0);
  if(dane + 8 > 0xFFFFFFFF - 1e6) throw new Error("Film przekroczył 4 GB — skróć zakres albo zmniejsz skalę.");
  /* moov ma stały rozmiar niezależnie od przesunięcia, więc liczymy go dwa razy:
     raz, żeby poznać długość, drugi raz z prawdziwym położeniem danych */
  const proba = moov({szer, wys, avcC, probki, przesuniecieDanych: 0});
  const m = moov({szer, wys, avcC, probki, przesuniecieDanych: ftyp.length + proba.length + 8});
  return [ftyp, m, u32(dane + 8), tekst("mdat"), ...probki.map(p => p.dane)];
}
