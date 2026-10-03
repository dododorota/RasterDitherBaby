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

function trakWideo({szer, wys, avcC, probki, przesuniecieDanych}){
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
  const trak = pudlo("trak",
    pelne("tkhd", 0, 3, u32(0, 0, 1, 0, trwanie), zera(8), u16(0, 0, 0, 0), MACIERZ, u32(szer << 16, wys << 16)),
    ...edts,
    pudlo("mdia",
      pelne("mdhd", 0, 0, u32(0, 0, SKALA_CZASU, trwanie), u16(0x55C4, 0)),   /* język „und" */
      pelne("hdlr", 0, 0, u32(0), tekst("vide"), zera(12), tekst("VideoHandler\0")),
      pudlo("minf",
        pelne("vmhd", 0, 1, zera(8)),
        pudlo("dinf", pelne("dref", 0, 0, u32(1), pelne("url ", 0, 1))),
        stbl)));
  return {trak, trwanie};
}

/* ---------- dźwięk ----------
   Druga ścieżka, w skali czasu równej częstotliwości próbkowania. AAC opisuje
   pudełko esds (deskryptory MPEG-4 z AudioSpecificConfig z kodera), Opus —
   dOps. Czasy próbek z zaokrąglanych znaczników, nie z sumy długości, żeby
   błąd się nie sumował (jak opóźnienia GIF-a). */
const bajty = (...v) => Uint8Array.from(v);
function deskryptor(tag, ...czesci){
  const dl = czesci.reduce((s, c) => s + c.length, 0);
  if(dl > 0x0FFFFFFF) throw new Error("za długi deskryptor");
  const b = new Uint8Array(5 + dl);
  b.set([tag, 0x80 | (dl >> 21) & 0x7F, 0x80 | (dl >> 14) & 0x7F, 0x80 | (dl >> 7) & 0x7F, dl & 0x7F]);
  let o = 5; for(const c of czesci){ b.set(c, o); o += c.length; }
  return b;
}
function wpisDzwieku(a){
  /* częstotliwość w polu 16.16 — powyżej 65 535 Hz wpisujemy zero, prawdziwa jest w mdhd */
  const naglowek = [zera(6), u16(1), zera(8), u16(a.kanaly, 16), u16(0, 0), u32(a.czestotliwosc > 65535 ? 0 : a.czestotliwosc*65536)];
  if(a.kodek === "opus"){
    /* OpusHead z kodera (jeśli jest) daje pre-skip; bez niego typowe 312 */
    let preskip = 312;
    if(a.opis && a.opis.length >= 12 && String.fromCharCode(...a.opis.subarray(0, 8)) === "OpusHead") preskip = a.opis[10] | (a.opis[11] << 8);
    return pudlo("Opus", ...naglowek, pudlo("dOps", bajty(0, a.kanaly), u16(preskip), u32(a.czestotliwosc), u16(0), bajty(0)));
  }
  if(!a.opis || !a.opis.length) throw new Error("Koder dźwięku nie oddał opisu strumienia AAC.");
  const esds = pelne("esds", 0, 0, deskryptor(3, u16(1), bajty(0),
    deskryptor(4, bajty(0x40, 0x15, 0, 0, 0), u32(a.bitrate || 0, a.bitrate || 0), deskryptor(5, a.opis)),
    deskryptor(6, bajty(2))));
  return pudlo("mp4a", ...naglowek, esds);
}
function trakDzwieku(a, przesuniecieDanych){
  const r = a.czestotliwosc, p = a.probki, n = p.length;
  const t0 = Math.round(p[0].pts*r/1e6);
  const tk = p.map(x => Math.round(x.pts*r/1e6) - t0);
  const delty = tk.map((t, i) => i < n - 1 ? Math.max(1, tk[i+1] - t) : Math.max(1, Math.round(p[n-1].dur*r/1e6)));
  const trwanieMedia = delty.reduce((s, d) => s + d, 0);
  const trwanie = Math.round(trwanieMedia*SKALA_CZASU/r);
  const stts = serie(delty);
  const stbl = pudlo("stbl",
    pelne("stsd", 0, 0, u32(1), wpisDzwieku(a)),
    pelne("stts", 0, 0, u32(stts.length), ...stts.map(([k, v]) => u32(k, v))),
    pelne("stsc", 0, 0, u32(1, 1, n, 1)),
    pelne("stsz", 0, 0, u32(0, n), ...p.map(x => u32(x.dane.length))),
    pelne("stco", 0, 0, u32(1, przesuniecieDanych)));
  const trak = pudlo("trak",
    pelne("tkhd", 0, 3, u32(0, 0, 2, 0, trwanie), zera(8), u16(0, 0, 0x0100, 0), MACIERZ, u32(0, 0)),
    pudlo("mdia",
      pelne("mdhd", 0, 0, u32(0, 0, r, trwanieMedia), u16(0x55C4, 0)),
      pelne("hdlr", 0, 0, u32(0), tekst("soun"), zera(12), tekst("SoundHandler\0")),
      pudlo("minf",
        pelne("smhd", 0, 0, u16(0, 0)),
        pudlo("dinf", pelne("dref", 0, 0, u32(1), pelne("url ", 0, 1))),
        stbl)));
  return {trak, trwanie};
}

function moov(d, przesuniecieDanych){
  const v = trakWideo({...d, przesuniecieDanych});
  const daneWideo = d.probki.reduce((s, p) => s + p.dane.length, 0);
  const a = d.dzwiek && d.dzwiek.probki.length ? trakDzwieku(d.dzwiek, przesuniecieDanych + daneWideo) : null;
  const trwanie = Math.max(v.trwanie, a ? a.trwanie : 0);
  return pudlo("moov",
    pelne("mvhd", 0, 0, u32(0, 0, SKALA_CZASU, trwanie, 0x00010000), u16(0x0100), zera(10), MACIERZ, zera(24), u32(a ? 3 : 2)),
    v.trak, ...(a ? [a.trak] : []));
}

/* probki: [{dane: Uint8Array, pts: µs, dur: µs, klucz: bool}] w kolejności,
   w jakiej oddał je koder; avcC: opis dekodera z metadanych kodera.
   dzwiek (opcjonalnie): {kodek: "aac"|"opus", opis, czestotliwosc, kanaly,
   bitrate, probki: [{dane, pts, dur}]} — druga ścieżka, dane za obrazem.
   Zwraca tablicę części pliku — do sklejenia w Blob po stronie przeglądarki. */
export function zlozMp4({szer, wys, avcC, probki, dzwiek}){
  if(!probki.length) throw new Error("Brak klatek do zapisania.");
  if(!avcC || !avcC.length) throw new Error("Koder nie oddał opisu strumienia H.264.");
  const ftyp = pudlo("ftyp", tekst("isom"), u32(0x200), tekst("isomiso2avc1mp41"));
  const dzw = dzwiek && dzwiek.probki.length ? dzwiek : null;
  const dane = probki.reduce((s, p) => s + p.dane.length, 0) + (dzw ? dzw.probki.reduce((s, p) => s + p.dane.length, 0) : 0);
  if(dane + 8 > 0xFFFFFFFF - 1e6) throw new Error("Film przekroczył 4 GB — skróć zakres albo zmniejsz skalę.");
  /* moov ma stały rozmiar niezależnie od przesunięcia, więc liczymy go dwa razy:
     raz, żeby poznać długość, drugi raz z prawdziwym położeniem danych */
  const d = {szer, wys, avcC, probki, dzwiek: dzw};
  const proba = moov(d, 0);
  const m = moov(d, ftyp.length + proba.length + 8);
  return [ftyp, m, u32(dane + 8), tekst("mdat"), ...probki.map(p => p.dane), ...(dzw ? dzw.probki.map(p => p.dane) : [])];
}
