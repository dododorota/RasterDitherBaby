/* Minimalny zapis ZIP bez kompresji (metoda „stored"). Czysty moduł, bez DOM-u.

   Bez kompresji, bo w paczce lądują głównie PNG, które skompresowane już są —
   deflate dałby parę procent, a kosztowałby własną implementację albo zależność.
   Nazwy w UTF-8 (flaga 0x0800), więc polskie znaki przechodzą. Bez ZIP64: jeden
   plik, cała paczka i liczba wpisów muszą zmieścić się w limitach klasycznego
   formatu — przy przekroczeniu rzucamy błąd z opisem zamiast pisać zepsuty plik.

   Części trzymamy osobno i sklejamy dopiero w Blob, żeby przy dużej paczce nie
   budować jednej wielkiej tablicy w pamięci. */

const TAB = (()=>{
  const t = new Uint32Array(256);
  for(let n=0; n<256; n++){
    let c = n;
    for(let k=0; k<8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(b){
  let c = 0xFFFFFFFF;
  for(let i=0; i<b.length; i++) c = TAB[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const MAX32 = 0xFFFFFFFF;

/* ZIP trzyma czas w formacie DOS: dwusekundowa dokładność, lata od 1980 */
function dos(d){
  const rok = Math.max(1980, d.getFullYear());
  return {
    czas: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    data: ((rok - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

/* ścieżka wewnątrz paczki: ukośniki, bez wiodących „/" i bez „..", żeby rozpakowanie
   nie mogło wyjść poza katalog docelowy */
export function bezpiecznaSciezka(s){
  const czesci = String(s).replace(/\\/g, "/").split("/").filter(c => c && c !== "." && c !== "..");
  return czesci.join("/") || "plik";
}

export class Zip {
  constructor(){ this.czesci = []; this.wpisy = []; this.przesuniecie = 0; this.nazwy = new Set(); }

  /* dodaje plik; przy powtórzonej nazwie dokłada „-2", „-3"… przed rozszerzeniem */
  dodaj(sciezka, bajty, kiedy = new Date()){
    let nazwa = bezpiecznaSciezka(sciezka);
    if(this.nazwy.has(nazwa)){
      const m = nazwa.match(/^(.*?)(\.[^./]*)?$/);
      let i = 2;
      while(this.nazwy.has(m[1]+"-"+i+(m[2]||""))) i++;
      nazwa = m[1]+"-"+i+(m[2]||"");
    }
    this.nazwy.add(nazwa);
    if(this.wpisy.length >= 0xFFFF) throw new Error("Za dużo plików na jedną paczkę ZIP (limit 65 535).");
    if(bajty.length > MAX32 || this.przesuniecie > MAX32)
      throw new Error("Paczka przekroczyła 4 GB — podziel folder na mniejsze części.");

    const n = new TextEncoder().encode(nazwa);
    const crc = crc32(bajty), t = dos(kiedy);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);  lh.setUint16(6, 0x0800, true);  lh.setUint16(8, 0, true);
    lh.setUint16(10, t.czas, true);  lh.setUint16(12, t.data, true);
    lh.setUint32(14, crc, true);  lh.setUint32(18, bajty.length, true);  lh.setUint32(22, bajty.length, true);
    lh.setUint16(26, n.length, true);  lh.setUint16(28, 0, true);
    this.czesci.push(new Uint8Array(lh.buffer), n, bajty);
    this.wpisy.push({n, crc, rozmiar: bajty.length, t, offset: this.przesuniecie});
    this.przesuniecie += 30 + n.length + bajty.length;
    return nazwa;
  }

  blob(){
    const katalog = [];
    let rozmiarKat = 0;
    for(const w of this.wpisy){
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);  c.setUint16(6, 20, true);  c.setUint16(8, 0x0800, true);  c.setUint16(10, 0, true);
      c.setUint16(12, w.t.czas, true);  c.setUint16(14, w.t.data, true);
      c.setUint32(16, w.crc, true);  c.setUint32(20, w.rozmiar, true);  c.setUint32(24, w.rozmiar, true);
      c.setUint16(28, w.n.length, true);  c.setUint16(30, 0, true);  c.setUint16(32, 0, true);
      c.setUint16(34, 0, true);  c.setUint16(36, 0, true);  c.setUint32(38, 0, true);
      c.setUint32(42, w.offset, true);
      katalog.push(new Uint8Array(c.buffer), w.n);
      rozmiarKat += 46 + w.n.length;
    }
    if(this.przesuniecie + rozmiarKat > MAX32) throw new Error("Paczka przekroczyła 4 GB — podziel folder na mniejsze części.");
    const k = new DataView(new ArrayBuffer(22));
    k.setUint32(0, 0x06054b50, true);
    k.setUint16(4, 0, true);  k.setUint16(6, 0, true);
    k.setUint16(8, this.wpisy.length, true);  k.setUint16(10, this.wpisy.length, true);
    k.setUint32(12, rozmiarKat, true);  k.setUint32(16, this.przesuniecie, true);
    k.setUint16(20, 0, true);
    return new Blob([...this.czesci, ...katalog, new Uint8Array(k.buffer)], {type: "application/zip"});
  }
}
