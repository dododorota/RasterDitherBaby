/* Wideo w prawdziwej przeglądarce: Chrome bez okna, sterowany przez protokół
   DevTools (wbudowany WebSocket z Node 22+, bez zależności).

   W przeglądarce powstaje film testowy — każda klatka ma swój numer zapisany
   dwójkowo czarnymi i białymi kwadratami, które przeżyją i kompresję H.264,
   i dithering 1-bit. Film wczytujemy do apki przez „upuszczenie" pliku,
   zapisujemy przyciskiem we wszystkich trzech formatach i czytamy wyniki
   z powrotem: czy przewijanie trafia w klatkę, czy GIF jest co do piksela
   podglądem, czy MP4 się odtwarza i ma klatki we właściwej kolejności.

   Wymaga działającego serwera (python serwer.py) i Chrome albo Edge.
   Uruchom z katalogu projektu: node testy/przegladarka.mjs
   Inna przeglądarka albo port: CHROME="ścieżka" ADRES="http://localhost:8000/" */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ADRES = process.env.ADRES || "http://localhost:8000/";
const KANDYDACI = [process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
const CHROME = KANDYDACI.find(p => existsSync(p));
if(!CHROME){ console.log("Nie znalazłem Chrome ani Edge — podaj ścieżkę w zmiennej CHROME."); process.exit(2); }
try{ await (await fetch(ADRES)).arrayBuffer(); } catch{ console.log("Serwer nie odpowiada pod " + ADRES + " — uruchom najpierw: python serwer.py"); process.exit(2); }

let bledy = 0;
const sprawdz = (warunek, opis) => { console.log((warunek ? "  ok    " : "  ŹLE   ") + opis); if(!warunek) bledy++; };

/* ---------- przeglądarka ---------- */
const profil = mkdtempSync(join(tmpdir(), "raster-test-"));
const PORT = 9300 + Math.floor(Math.random()*500);
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + profil,
  "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--no-default-browser-check", "about:blank"],
  {stdio: "ignore"});
const sprzataj = () => { try{ chrome.kill(); } catch{} setTimeout(() => { try{ rmSync(profil, {recursive: true, force: true}); } catch{} }, 500); };

let ws, nr = 0;
const czekajace = new Map(), sluchacze = [];
async function polacz(){
  for(let i=0; i<100; i++){
    try{
      const lista = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const strona = lista.find(t => t.type === "page");
      if(strona){
        ws = new WebSocket(strona.webSocketDebuggerUrl);
        await new Promise((ok, zle) => { ws.onopen = ok; ws.onerror = zle; });
        ws.onmessage = e => {
          const m = JSON.parse(e.data);
          if(m.id && czekajace.has(m.id)){ czekajace.get(m.id)(m); czekajace.delete(m.id); }
          else for(const s of sluchacze) s(m);
        };
        return;
      }
    } catch{}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("Chrome nie wystartował");
}
const wyslij = (method, params = {}) => new Promise(ok => { const id = ++nr; czekajace.set(id, ok); ws.send(JSON.stringify({id, method, params})); });
async function wykonaj(fn, ...arg){
  const r = await wyslij("Runtime.evaluate", {expression: `(${fn})(...${JSON.stringify(arg)})`, awaitPromise: true, returnByValue: true});
  if(r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text);
  return r.result.result.value;
}

const bledyStrony = [];
try{
  await polacz();
  sluchacze.push(m => {
    if(m.method === "Runtime.exceptionThrown") bledyStrony.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if(m.method === "Runtime.consoleAPICalled" && m.params.type === "error") bledyStrony.push(m.params.args.map(a => a.value || a.description).join(" "));
  });
  await wyslij("Runtime.enable");
  await wyslij("Page.enable");
  const zaladowana = new Promise(ok => sluchacze.push(m => { if(m.method === "Page.loadEventFired") ok(); }));
  await wyslij("Page.navigate", {url: ADRES});
  await zaladowana;
  await new Promise(r => setTimeout(r, 500));

  /* ---------- pomocnicze w stronie ---------- */
  await wykonaj(() => {
    /* numer klatki: 8 kwadratów 16×16 w górnym wierszu, biały = 1 */
    window.rysujKlatke = (ctx, i, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, `hsl(${i*6 % 360},60%,30%)`); g.addColorStop(1, `hsl(${(i*6+120) % 360},60%,75%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc((i*7) % w, h*0.6, 40, 0, 7); ctx.fill();
      for(let b=0; b<8; b++){ ctx.fillStyle = (i >> b) & 1 ? "#fff" : "#000"; ctx.fillRect(b*24, 0, 24, 24); }
    };
    window.czytajNumer = (zrodlo, skala = 1) => {
      const c = document.createElement("canvas"); c.width = zrodlo.width || zrodlo.videoWidth || zrodlo.displayWidth; c.height = zrodlo.height || zrodlo.videoHeight || zrodlo.displayHeight;
      const x = c.getContext("2d"); x.drawImage(zrodlo, 0, 0);
      let n = 0;
      for(let b=0; b<8; b++){
        /* środek kwadratu, uśredniony po 6×6, żeby dithering nie przeszkadzał */
        const d = x.getImageData(Math.round((b*24 + 9)*skala), Math.round(9*skala), Math.round(6*skala), Math.round(6*skala)).data;
        let s = 0; for(let i=0; i<d.length; i+=4) s += d[i] + d[i+1] + d[i+2];
        if(s/(d.length/4)/3 > 128) n |= 1 << b;
      }
      return n;
    };
    /* przechwytywanie pobrań: apka klika w <a download>, a my zabieramy blob */
    window.pobrane = [];
    HTMLAnchorElement.prototype.click = function(){ window.pobrane.push({nazwa: this.download, url: this.href}); };
    window.upusc = plik => {
      const dt = new DataTransfer(); dt.items.add(plik);
      document.querySelector("#stage").dispatchEvent(new DragEvent("drop", {dataTransfer: dt, bubbles: true, cancelable: true}));
    };
    window.czekaj = async (warunek, ms = 60000) => {
      const t = performance.now();
      while(!warunek()){ if(performance.now() - t > ms) throw new Error("przekroczony czas: " + warunek); await new Promise(r => setTimeout(r, 50)); }
    };
  });

  console.log("--- film testowy z WebCodecs ---");
  const film = await wykonaj(async () => {
    const { zlozMp4 } = await import("/src/mp4.js");
    const w = 320, h = 240, fps = 30, n = 60;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    const probki = []; let avcC = null;
    const enc = new VideoEncoder({
      output: (ch, meta) => {
        if(meta?.decoderConfig?.description) avcC = new Uint8Array(meta.decoderConfig.description.slice ? meta.decoderConfig.description.slice(0) : meta.decoderConfig.description.buffer.slice(0));
        const d = new Uint8Array(ch.byteLength); ch.copyTo(d);
        probki.push({dane: d, pts: ch.timestamp, dur: ch.duration || Math.round(1e6/fps), klucz: ch.type === "key"});
      },
      error: e => { throw e; }
    });
    enc.configure({codec: "avc1.42e01f", width: w, height: h, bitrate: 3e6, framerate: fps, avc: {format: "avc"}});
    for(let i=0; i<n; i++){
      rysujKlatke(ctx, i, w, h);
      const f = new VideoFrame(c, {timestamp: Math.round(i*1e6/fps), duration: Math.round(1e6/fps)});
      enc.encode(f, {keyFrame: i % 30 === 0}); f.close();
    }
    await enc.flush(); enc.close();
    window.plikFilmu = new File([new Blob(zlozMp4({szer: w, wys: h, avcC, probki}))], "próbny film.mp4", {type: "video/mp4"});
    /* czy sama przeglądarka odczytuje nasz kontener */
    const v = document.createElement("video"); v.muted = true;
    v.src = URL.createObjectURL(plikFilmu);
    await new Promise((ok, zle) => { v.onloadeddata = ok; v.onerror = () => zle(new Error("video error " + v.error?.code)); });
    return {rozmiar: plikFilmu.size, dlugosc: v.duration, w: v.videoWidth, h: v.videoHeight, kluczowe: probki.filter(p => p.klucz).length};
  });
  sprawdz(film.w === 320 && film.h === 240 && Math.abs(film.dlugosc - 2) < 0.01,
          `przeglądarka otwiera nasz MP4: ${film.w}×${film.h}, ${film.dlugosc} s, ${film.rozmiar} B, klatek kluczowych ${film.kluczowe}`);

  console.log("--- wczytanie filmu do apki ---");
  const wczyt = await wykonaj(async () => {
    const v = await import("/src/video.js");
    upusc(plikFilmu);
    await czekaj(() => v.W.z && !document.querySelector("#g-wideo").classList.contains("hidden"));
    const z = v.W.z;
    const opcje = [...document.querySelector("#fmt").options].map(o => o.value);
    return {rodzaj: z.rodzaj, fps: z.tempoPliku, klatek: z.klatki.length, info: document.querySelector("#wideo-info").textContent,
            opcje, os: !document.querySelector("#os").classList.contains("hidden")};
  });
  sprawdz(wczyt.rodzaj === "film" && wczyt.fps === 30 && wczyt.klatek === 60, `film, wykryte tempo ${wczyt.fps} kl/s, ${wczyt.klatek} klatek`);
  sprawdz(wczyt.os && wczyt.opcje.join() === "png,svg,mp4,gif,klatki", "oś czasu widoczna, formaty: " + wczyt.opcje.join(", "));
  console.log("        " + wczyt.info);
  /* ZRZUT=plik.png — zrzut ekranu apki z wczytanym filmem, do obejrzenia układu */
  if(process.env.ZRZUT){
    await wyslij("Emulation.setDeviceMetricsOverride", {width: 1440, height: 900, deviceScaleFactor: 1, mobile: false});
    await wykonaj(async () => { const s = document.querySelector("#fmt"); s.value = "mp4"; s.dispatchEvent(new Event("change")); await new Promise(r => setTimeout(r, 800)); });
    const z = await wyslij("Page.captureScreenshot", {format: "png"});
    (await import("node:fs")).writeFileSync(process.env.ZRZUT, Buffer.from(z.result.data, "base64"));
    await wyslij("Emulation.clearDeviceMetricsOverride");
  }

  const trafienia = await wykonaj(async () => {
    const { W } = await import("/src/video.js");
    const wyn = [];
    for(const i of [0, 1, 2, 14, 15, 29, 30, 31, 47, 58, 59, 3, 59, 0]){ await W.z.pokaz(i); wyn.push([i, czytajNumer(W.z.kanwa)]); }
    return wyn;
  });
  sprawdz(trafienia.every(([a, b]) => a === b), "przewijanie trafia w klatkę: " + trafienia.map(([a, b]) => a === b ? a : a + "≠" + b).join(" "));

  const tempo12 = await wykonaj(async () => {
    const { W, ustawTempo } = await import("/src/video.js");
    ustawTempo(12);
    const n = W.z.klatki.length, wyn = [];
    for(const i of [0, 1, 5, 23]){ await W.z.pokaz(i); wyn.push(czytajNumer(W.z.kanwa)); }
    ustawTempo(0);
    return {n, wyn};
  });
  /* klatka i przy 12 kl/s to środek przedziału [i/12, (i+1)/12) w filmie 30 kl/s */
  const oczek = [0, 1, 5, 23].map(i => Math.floor((i + 0.5)/12*30));
  sprawdz(tempo12.n === 24 && tempo12.wyn.join() === oczek.join(), `12 kl/s: ${tempo12.n} klatek, z filmu biorę ${tempo12.wyn.join(", ")} (oczekiwane ${oczek.join(", ")})`);

  console.log("--- odtwarzanie podglądu ---");
  const gra = await wykonaj(async () => {
    const { W } = await import("/src/video.js");
    const b = document.querySelector("#os-graj");
    const start = W.biezaca;
    b.click();
    await new Promise(r => setTimeout(r, 1200));
    const wTrakcie = {gra: W.gra, ikona: b.textContent, klatka: W.biezaca, os: +document.querySelector("#os-poz").value};
    b.click();
    await new Promise(r => setTimeout(r, 300));
    return {start, ...wTrakcie, poPauzie: W.gra, ikonaPo: b.textContent};
  });
  sprawdz(gra.gra && gra.ikona === "❚❚" && gra.klatka > gra.start + 10 && gra.os === gra.klatka,
          `gra: po 1,2 s klatka ${gra.klatka} (start ${gra.start}), suwak osi nadąża`);
  sprawdz(!gra.poPauzie && gra.ikonaPo === "▶", "pauza zatrzymuje");

  /* zapis przez przycisk, tak jak klika użytkowniczka */
  async function zapisz(fmt, tryb, od, doK){
    return wykonaj(async (fmt, tryb, od, doK) => {
      const { W } = await import("/src/video.js");
      const zak = (id, v) => { const el = document.querySelector(id); el.value = v; el.dispatchEvent(new Event("input")); };
      document.querySelector(tryb === "dither" ? "#tab-dither" : "#tab-half").click();
      zak("#od", od); zak("#do", doK);
      const sel = document.querySelector("#fmt"); sel.value = fmt; sel.dispatchEvent(new Event("change"));
      await new Promise(r => setTimeout(r, 300));
      pobrane.length = 0;
      const t = performance.now();
      document.querySelector("#save").click();
      const zablokowany = document.querySelector("#g-wideo").inert && document.querySelector("#os").inert;
      await czekaj(() => pobrane.length || /Nie udało/.test(document.querySelector("#save-msg").textContent), 120000);
      await czekaj(() => !document.querySelector(".panel").classList.contains("zajete"));
      const p = pobrane[0];
      if(p) window.ostatni = await (await fetch(p.url)).blob();
      return {nazwa: p && p.nazwa, msg: document.querySelector("#save-msg").textContent, rozmiar: p && ostatni.size,
              ms: Math.round(performance.now() - t), zablokowany, od: W.od, do: W.do, przycisk: document.querySelector("#save").textContent};
    }, fmt, tryb, od, doK);
  }

  console.log("--- zapis GIF (dithering) ---");
  const g = await zapisz("gif", "dither", 10, 39);
  console.log("        " + g.msg + " (" + g.ms + " ms)");
  sprawdz(g.nazwa === "próbny film-dither.gif" && g.zablokowany && g.przycisk === "Zapisz GIF", "plik " + g.nazwa + ", panel zablokowany na czas zapisu");
  const gifSpr = await wykonaj(async () => {
    const { W } = await import("/src/video.js");
    const { renderDither } = await import("/src/dither.js");
    const { out } = await import("/src/dom.js");
    const dek = new ImageDecoder({data: await ostatni.arrayBuffer(), type: "image/gif"});
    await dek.tracks.ready;
    await dek.completed;
    const n = dek.tracks.selectedTrack.frameCount;
    const numery = [], zgodne = [];
    for(let k=0; k<n; k++){
      const {image} = await dek.decode({frameIndex: k});
      const c = document.createElement("canvas"); c.width = image.displayWidth; c.height = image.displayHeight;
      c.getContext("2d").drawImage(image, 0, 0);
      numery.push(czytajNumer(c));
      if(k === 0 || k === 17 || k === n-1){
        /* ta sama klatka policzona na nowo jak do PNG — GIF ma być co do piksela taki sam */
        await W.z.pokaz(10 + k);
        await renderDither(1, {keep: true});
        const a = out.getContext("2d").getImageData(0, 0, out.width, out.height).data;
        const b = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        let rozne = 0; for(let i=0; i<a.length; i++) if(a[i] !== b[i]) rozne++;
        zgodne.push([k, out.width === c.width && out.height === c.height ? rozne : "inny rozmiar"]);
      }
      image.close();
    }
    return {n, numery, zgodne};
  });
  sprawdz(gifSpr.n === 30 && gifSpr.numery.every((v, k) => v === 10 + k), `GIF: ${gifSpr.n} klatek, numery ${gifSpr.numery[0]}…${gifSpr.numery[gifSpr.n-1]} po kolei`);
  sprawdz(gifSpr.zgodne.every(([, r]) => r === 0), "GIF co do piksela jak render klatki: " + gifSpr.zgodne.map(([k, r]) => "klatka " + k + ": " + r + " różnic").join(", "));

  console.log("--- animowany GIF jako wejście ---");
  const anim = await wykonaj(async () => {
    const { W } = await import("/src/video.js");
    upusc(new File([ostatni], "animacja.gif", {type: "image/gif"}));
    await czekaj(() => W.z && W.z.rodzaj === "animacja");
    const dl = W.z.klatki.map(k => Math.round(k.dur*100));
    await W.z.pokaz(7);
    return {n: W.z.klatki.length, dl, numer: czytajNumer(W.z.kanwa), tempoUkryte: document.querySelector("#tempo-opcje").classList.contains("hidden")};
  });
  sprawdz(anim.n === 30 && anim.dl.every(d => d === 3 || d === 4) && anim.dl.reduce((s, d) => s + d) === 100,
          `animacja: ${anim.n} klatek, opóźnienia ${anim.dl.slice(0, 6).join(",")}… = ${anim.dl.reduce((s, d) => s + d)} setnych`);
  sprawdz(anim.numer === 17 && anim.tempoUkryte, "klatka 7 animacji to klatka 17 filmu, wybór tempa ukryty (tempo z pliku)");

  console.log("--- zapis MP4 (raster drukarski, skala 2×) ---");
  await wykonaj(async () => {
    const { W } = await import("/src/video.js");
    upusc(plikFilmu);
    await czekaj(() => W.z && W.z.rodzaj === "film");
    const s = document.querySelector("#scl"); s.value = 2; s.dispatchEvent(new Event("input"));
  });
  const m = await zapisz("mp4", "half", 0, 59);
  console.log("        " + m.msg + " (" + m.ms + " ms)");
  sprawdz(/^Gotowe: 60 klatek/.test(m.msg) && m.nazwa === "próbny film-raster.mp4", "plik " + m.nazwa);
  const mp4Spr = await wykonaj(async () => {
    const v = document.createElement("video"); v.muted = true;
    v.src = URL.createObjectURL(ostatni);
    document.body.appendChild(v);
    await new Promise((ok, zle) => { v.onloadeddata = ok; v.onerror = () => zle(new Error("MP4 się nie otwiera: " + v.error?.code)); });
    const numery = [];
    for(const i of [0, 1, 29, 30, 59]){
      v.currentTime = (i + 0.5)/30;
      await new Promise(r => v.onseeked = r);
      numery.push([i, czytajNumer(v, 2)]);
    }
    const wyn = {w: v.videoWidth, h: v.videoHeight, dlugosc: v.duration, numery};
    v.remove();
    return wyn;
  });
  sprawdz(mp4Spr.w === 640 && mp4Spr.h === 480 && Math.abs(mp4Spr.dlugosc - 2) < 0.01, `MP4 odtwarza się: ${mp4Spr.w}×${mp4Spr.h}, ${mp4Spr.dlugosc} s`);
  sprawdz(mp4Spr.numery.every(([a, b]) => a === b), "klatki MP4 w dobrej kolejności: " + mp4Spr.numery.map(([a, b]) => a === b ? a : a + "≠" + b).join(" "));

  console.log("--- zapis klatek PNG w ZIP-ie, przerwany ---");
  const kl = await wykonaj(async () => {
    const { W } = await import("/src/video.js");
    const s = document.querySelector("#scl"); s.value = 1; s.dispatchEvent(new Event("input"));
    document.querySelector("#tab-dither").click();
    const sel = document.querySelector("#fmt"); sel.value = "klatki"; sel.dispatchEvent(new Event("change"));
    pobrane.length = 0;
    document.querySelector("#save").click();
    await czekaj(() => /Klatka [3-9]/.test(document.querySelector("#save-msg").textContent));
    document.querySelector("#save").click();               /* Przerwij */
    const przyciskPrzerwania = document.querySelector("#save").textContent;
    await czekaj(() => pobrane.length);
    await czekaj(() => !document.querySelector(".panel").classList.contains("zajete"));
    const b = new Uint8Array(await (await fetch(pobrane[0].url)).arrayBuffer());
    const v = new DataView(b.buffer), e = b.length - 22;
    const wpisow = v.getUint16(e + 10, true);
    let o = v.getUint32(e + 16, true);
    const nazwy = [];
    for(let i=0; i<wpisow; i++){ const nl = v.getUint16(o + 28, true); nazwy.push(new TextDecoder().decode(b.subarray(o + 46, o + 46 + nl))); o += 46 + nl; }
    return {msg: document.querySelector("#save-msg").textContent, nazwa: pobrane[0].nazwa, nazwy, przyciskPrzerwania,
            klatka: W.biezaca, przycisk: document.querySelector("#save").textContent};
  });
  console.log("        " + kl.msg);
  sprawdz(/^Przerwano — zapisano \d+ z 60/.test(kl.msg) && kl.przyciskPrzerwania === "Przerywam po bieżącej klatce…", "przerwanie oddaje to, co gotowe");
  sprawdz(kl.nazwa === "próbny film-dither-klatki.zip" && kl.nazwy[0] === "próbny film-00001.png" && kl.nazwy.length >= 3,
          `ZIP: ${kl.nazwy.length} klatek, ${kl.nazwy[0]} … ${kl.nazwy[kl.nazwy.length-1]}`);
  sprawdz(kl.przycisk === "Zapisz klatki (ZIP)", "przycisk wraca do „" + kl.przycisk + "”");

  console.log("--- powrót do zwykłego obrazu ---");
  const obraz = await wykonaj(async () => {
    const { W } = await import("/src/video.js");
    const { S } = await import("/src/state.js");
    document.querySelector("#sample").click();
    await czekaj(() => !W.z);
    await new Promise(r => setTimeout(r, 400));
    return {wideo: !document.querySelector("#g-wideo").classList.contains("hidden"), os: !document.querySelector("#os").classList.contains("hidden"),
            opcje: [...document.querySelector("#fmt").options].map(o => o.value).join(), fmt: S.fmt, zrodla: document.querySelectorAll("video.wideo-zrodlo").length,
            przycisk: document.querySelector("#save").textContent};
  });
  sprawdz(!obraz.wideo && !obraz.os && obraz.opcje === "png,svg" && obraz.fmt === "png" && obraz.przycisk === "Zapisz PNG",
          "próbka zamyka film: panel wideo i oś schowane, formaty png/svg, format wrócił do PNG");
  sprawdz(obraz.zrodla === 0, "element <video> usunięty ze strony");

  console.log("--- kolory: worker i główny wątek liczą to samo ---");
  const zgodnosc = await wykonaj(async () => {
    const { S, DEFAULTS, LOOK } = await import("/src/state.js");
    const { ditherData } = await import("/src/dither.js");
    const { ditherIEfekty } = await import("/src/dither-core.js");
    const { fit } = await import("/src/image.js");
    const wyn = [];
    for(const ust of [
      {pal: "g-poswiata", mapa: "jasnosc", algo: "floyd", glow: 120, glowR: 20, glowProg: 30},
      {pal: "pico8", mapa: "kolor", algo: "atkinson", glow: 80, sort: "poziomo", rgb: 4},
      {pal: "bw", mapa: "jasnosc", algo: "bayer8", pix: 3, glow: 60, glowR: 40},
      {pal: "g-termo", mapa: "jasnosc", algo: "jjn", serp: false, thr: 20, str: 0.8}
    ]){
      for(const k of LOOK) S[k] = DEFAULTS[k];
      Object.assign(S, ust);
      const r = await ditherData({keep: true});
      /* to samo na głównym wątku, z tych samych pikseli źródła */
      const [fw, fh] = fit(S.img.width, S.img.height, 1400);
      const w = Math.max(1, Math.round(fw/S.pix)), h = Math.max(1, Math.round(fh/S.pix));
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d"); x.drawImage(S.img, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h);
      ditherIEfekty(d.data, w, h);
      let rozne = 0; for(let i=0; i<d.data.length; i++) if(d.data[i] !== r.d.data[i]) rozne++;
      wyn.push([ust.pal + "/" + ust.mapa + "/" + ust.algo + (ust.glow ? " + poświata" : ""), r.w === w && r.h === h ? rozne : "inny rozmiar"]);
    }
    for(const k of LOOK) S[k] = DEFAULTS[k];
    return wyn;
  });
  sprawdz(zgodnosc.every(([, r]) => r === 0), "co do bajtu: " + zgodnosc.map(([n, r]) => n + " → " + r).join("; "));

  console.log("--- kolory: panel ---");
  const panel = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const $ = s => document.querySelector(s);
    const zmien = (s, v) => { const el = $(s); el.value = v; el.dispatchEvent(new Event("change")); };
    const wyn = {};
    document.querySelector("#tab-dither").click();
    zmien("#pal", "gray4");
    $("#pal-next").click();
    wyn.nastepna = [S.pal, S.mapa];
    zmien("#pal", "g-ogien");
    wyn.gradient = [S.pal, S.mapa, $("#mapa").value, $("#pal-probki").children.length];
    $("#pal-prev").click(); $("#pal-next").click();
    wyn.wraca = S.pal;
    /* edytor: dodanie zamienia wbudowaną w własną */
    $("#pal-dodaj").click();
    wyn.poDodaniu = [S.pal, S.custom && S.custom.kolory.length, S.custom && S.custom.nazwa, $("#pal").value];
    const k = $("#pal-kolor"); k.value = "#12ab34"; k.dispatchEvent(new Event("input"));
    wyn.kolor = S.custom.kolory.some(c => c.join() === "18,171,52");
    $("#pal-usun").click(); $("#pal-usun").click();
    wyn.poUsunieciu = S.custom.kolory.length;
    const przed = S.custom.kolory.map(c => c.join());
    $("#pal-odwroc").click();
    wyn.odwrocone = S.custom.kolory.map(c => c.join()).join("|") === przed.slice().reverse().join("|");
    $("#pal-sortuj").click();
    const jas = c => c[0]*0.299 + c[1]*0.587 + c[2]*0.114;
    wyn.posortowane = S.custom.kolory.every((c, i, a) => !i || jas(c) >= jas(a[i-1]));
    /* nie da się zejść poniżej dwóch kolorów */
    for(let i=0; i<10; i++) $("#pal-usun").click();
    wyn.minimum = [S.custom.kolory.length, $("#pal-msg").textContent];
    /* paleta ze zdjęcia */
    zmien("#pal-ile", "5");
    $("#pal-zdjecie").click();
    wyn.zdjecie = [S.pal, S.custom.kolory.length, S.custom.nazwa, $("#pal-msg").textContent];
    /* zapis .hex */
    pobrane.length = 0;
    $("#pal-save").click();
    const tekst = await (await fetch(pobrane[0].url)).text();
    wyn.hex = [pobrane[0].nazwa, tekst.trim().split("\n").length, /^[0-9a-f]{6}$/m.test(tekst)];
    /* 1-bit: farba i papier, nie próbki; w rastrze te same kolory */
    zmien("#pal", "bw");
    wyn.bw = [$("#duo").style.display, $("#pal-probki").classList.contains("hidden")];
    const ink = $("#ink-r"); ink.value = "#aa0000"; ink.dispatchEvent(new Event("input"));
    wyn.farba = [S.ink, $("#ink").value];
    /* stos efektów: dodanie poświaty z menu pokazuje jej kartę */
    $("#fx-dodaj").click();
    [...$("#fx-menu").children].find(b => b.dataset.dodaj === "glow").click();
    wyn.glowOpcje = !!$('#fx-lista .fx[data-fx="glow"]') && !$('#fx-lista .fx[data-fx="glow"]').classList.contains("hidden") && /glow/.test(S.efekty);
    return wyn;
  });
  sprawdz(JSON.stringify(panel.nastepna) === '["gray8","kolor"]', "▶ przechodzi do następnej palety: " + panel.nastepna);
  sprawdz(panel.gradient.join() === "g-ogien,jasnosc,jasnosc,6", "gradient z listy przełącza na „według jasności”, 6 próbek");
  sprawdz(panel.wraca === "g-ogien", "◀ ▶ wraca na to samo");
  sprawdz(panel.poDodaniu[0] === "custom" && panel.poDodaniu[1] === 7 && panel.poDodaniu[2] === "Ogień (zmieniona)" && panel.poDodaniu[3] === "custom",
          "„Dodaj” robi z wbudowanej własną: " + panel.poDodaniu.join(", "));
  sprawdz(panel.kolor, "wybierak koloru zmienia kolor w palecie");
  sprawdz(panel.poUsunieciu === 5 && panel.odwrocone && panel.posortowane, "usuń, odwróć, sortuj");
  sprawdz(panel.minimum[0] === 2 && /co najmniej dwa/.test(panel.minimum[1]), "nie schodzi poniżej dwóch kolorów");
  sprawdz(panel.zdjecie[0] === "custom" && panel.zdjecie[1] === 5 && panel.zdjecie[2] === "ze zdjęcia", "paleta ze zdjęcia: " + panel.zdjecie.join(" · "));
  sprawdz(panel.hex[0] === "ze-zdjęcia.hex" && panel.hex[1] === 5 && panel.hex[2], "zapis .hex: " + panel.hex.join(", "));
  sprawdz(panel.bw.join() === "flex,true", "1-bit pokazuje farbę i papier zamiast próbek");
  sprawdz(panel.farba.join() === "#aa0000,#aa0000", "kolor farby z rastra trafia też do pola w ditheringu");
  sprawdz(panel.glowOpcje, "„+ Dodaj efekt” → Poświata: karta na liście efektów");

  /* SVG z ditheringu nie zawiera poświaty: same kolory palety */
  const svg = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const { svgDither } = await import("/src/vector.js");
    Object.assign(S, {pal: "g-poswiata", mapa: "jasnosc", glow: 150, glowProg: 20, wektor: "piksele"});
    const {svg} = await svgDither();
    const kolory = new Set(svg.match(/rgb\(\d+,\d+,\d+\)/g));
    S.glow = 0;
    return kolory.size;
  });
  sprawdz(svg <= 5, "SVG z poświatą włączoną ma tylko kolory palety (" + svg + "), bez halo");

  console.log("--- paleta: lista kodów ---");
  const lista = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const $ = s => document.querySelector(s);
    const zmien = (s, v) => { const el = $(s); el.value = v; el.dispatchEvent(new Event("change")); };
    zmien("#pal", "d-granat");
    const wiersze = () => [...$("#pal-lista").children];
    const wyn = {n: wiersze().length, kody: wiersze().map(w => w.querySelector("input").value)};
    const pole = wiersze()[0].querySelector("input");
    pole.value = "FF8800"; pole.dispatchEvent(new Event("change"));
    wyn.poWpisaniu = [S.pal, S.custom.kolory[0].join()];
    const zle = wiersze()[1].querySelector("input");
    zle.value = "zielony"; zle.dispatchEvent(new Event("change"));
    wyn.zly = [zle.getAttribute("aria-invalid"), S.custom.kolory[1].join()];
    wiersze()[0].querySelectorAll(".btn")[1].click();      /* ↓ */
    wyn.poPrzesunieciu = S.custom.kolory.map(c => c.join());
    wyn.usunWylaczony = wiersze()[0].querySelectorAll(".btn")[2].disabled;
    return wyn;
  });
  sprawdz(lista.n === 2 && lista.kody.join() === "#1c2541,#f4ebd9", "lista: " + lista.kody.join(", "));
  sprawdz(lista.poWpisaniu.join("|") === "custom|255,136,0", "wpisany kod (bez #, wielkie litery) zmienia kolor i robi paletę własną");
  sprawdz(lista.zly[0] === "true" && lista.zly[1] === "244,235,217", "zły kod podświetlony, kolor bez zmian");
  sprawdz(lista.poPrzesunieciu.join("|") === "244,235,217|255,136,0", "↓ przesuwa kolor niżej");
  sprawdz(lista.usunWylaczony, "przy dwóch kolorach × jest wyłączone");

  console.log("--- animacja obrazu: klatki kluczowe ---");
  const animObrazu = await wykonaj(async () => {
    const { S, DEFAULTS, LOOK } = await import("/src/state.js");
    const { W, idzDo } = await import("/src/video.js");
    const { SCIEZKI } = await import("/src/animacja.js");
    const $ = s => document.querySelector(s);
    for(const k of LOOK) S[k] = DEFAULTS[k];
    /* próbka ładuje się asynchronicznie — czekamy na nowy obraz, nie na przycisk,
       który może być jeszcze widoczny dla poprzedniego */
    const stary = S.img;
    $("#sample").click();
    await czekaj(() => S.img !== stary && !$("#animuj").classList.contains("hidden"));
    $("#animuj").click();
    await czekaj(() => W.z && W.z.rodzaj === "stopklatka");
    const wyn = {rodzaj: W.z.rodzaj, klatek: W.z.klatki.length, tytul: $("#wideo-tytul").textContent,
                 diamenty: getComputedStyle($("#kl-bri")).display !== "none"};
    const naKlatce = async i => { idzDo(i); try{ await czekaj(() => W.biezaca === i, 8000); } catch{ throw new Error("klatka " + i + ": " + JSON.stringify({biezaca: W.biezaca, gra: W.gra, rodzaj: W.z && W.z.rodzaj, n: W.z && W.z.klatki.length})); } await new Promise(r => setTimeout(r, 50)); };
    const suwak = (id, v) => { const el = $("#" + id); el.value = v; el.dispatchEvent(new Event("input")); };
    /* jasność: −60 na początku, +60 na końcu */
    await naKlatce(0);
    suwak("bri", -60);
    $("#kl-bri").click();
    wyn.pierwszaKlatka = [SCIEZKI.bri && SCIEZKI.bri.length, $("#kl-bri").getAttribute("aria-pressed")];
    await naKlatce(95);
    suwak("bri", 60);                                   /* parametr już animowany — klatka sama */
    wyn.drugaKlatka = SCIEZKI.bri.map(k => k.v).join();
    await naKlatce(48);
    wyn.srodek = [S.bri, +$("#bri").value, $("#bri-v").textContent, $("#kl-bri").getAttribute("aria-pressed")];
    wyn.sciezki = [$("#os-sciezki").children.length, $("#os-sciezki").querySelectorAll(".kl").length];
    /* Shift+klik w pierwszy ◆: krzywa tej klatki — płynnie, liniowo… i z powrotem jak ścieżka */
    const shiftKlik = () => $("#os-sciezki .kl").dispatchEvent(new MouseEvent("click", {shiftKey: true, bubbles: true}));
    shiftKlik(); shiftKlik();
    await naKlatce(24);
    wyn.krzywaKlatki = [SCIEZKI.bri[0].k, $("#os-sciezki .kl").textContent, $("#os-sciezki .kl").classList.contains("wlasna"), S.bri, W.biezaca];
    shiftKlik(); shiftKlik();
    wyn.krzywaPowrot = [SCIEZKI.bri[0].k === undefined, $("#os-sciezki .kl").textContent];
    /* zapis GIF-a całej animacji */
    const sel = $("#fmt"); sel.value = "gif"; sel.dispatchEvent(new Event("change"));
    pobrane.length = 0;
    $("#save").click();
    await czekaj(() => pobrane.length, 120000);
    await czekaj(() => !$(".panel").classList.contains("zajete"));
    const gif = await (await fetch(pobrane[0].url)).blob();
    wyn.nazwa = pobrane[0].nazwa;
    const dek = new ImageDecoder({data: await gif.arrayBuffer(), type: "image/gif"});
    await dek.tracks.ready; await dek.completed;
    wyn.gifKlatek = dek.tracks.selectedTrack.frameCount;
    const jasnosc = async k => {
      const {image} = await dek.decode({frameIndex: k});
      const c = new OffscreenCanvas(image.displayWidth, image.displayHeight); c.getContext("2d").drawImage(image, 0, 0); image.close();
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let s = 0; for(let i=0; i<d.length; i+=4) s += d[i] + d[i+1] + d[i+2];
      return s/(d.length/4)/3;
    };
    wyn.jasnosci = [await jasnosc(0), await jasnosc(48), await jasnosc(95)].map(v => Math.round(v));
    /* animowana pikselizacja: wymiar obrazu zmienia się z klatki na klatkę, plik musi mieć jeden */
    await naKlatce(0); suwak("pix", 1); $("#kl-pix").click();
    await naKlatce(95); suwak("pix", 5);
    sel.value = "mp4"; sel.dispatchEvent(new Event("change"));
    pobrane.length = 0;
    $("#save").click();
    await czekaj(() => pobrane.length || /Nie udało/.test($("#save-msg").textContent), 120000);
    await czekaj(() => !$(".panel").classList.contains("zajete"));
    wyn.mp4msg = $("#save-msg").textContent;
    if(pobrane.length){
      const v = document.createElement("video"); v.muted = true;
      v.src = pobrane[0].url;
      await new Promise((ok, zle) => { v.onloadeddata = ok; v.onerror = () => zle(new Error("MP4 się nie otwiera")); });
      wyn.mp4 = [v.videoWidth, v.videoHeight, Math.round(v.duration*10)/10];
    }
    /* koniec animacji: z powrotem zwykły obraz */
    $("#anim-koniec").click();
    wyn.koniec = [!!W.z, $("#animuj").classList.contains("hidden"), getComputedStyle($("#kl-bri")).display];
    return wyn;
  });
  sprawdz(animObrazu.rodzaj === "stopklatka" && animObrazu.klatek === 96 && animObrazu.tytul === "Animacja obrazu" && animObrazu.diamenty,
          `obraz → animacja 4 s × 24 kl/s = ${animObrazu.klatek} klatek, ◆ przy suwakach`);
  sprawdz(animObrazu.pierwszaKlatka.join() === "1,true", "◆ dodaje klatkę i świeci w jej miejscu");
  sprawdz(animObrazu.drugaKlatka === "-60,60", "suwak animowanego parametru sam dodaje klatkę: " + animObrazu.drugaKlatka);
  sprawdz(Math.abs(animObrazu.srodek[0]) <= 1 && animObrazu.srodek[1] === animObrazu.srodek[0] && animObrazu.srodek[3] === "false",
          `w połowie jasność ${animObrazu.srodek[0]}, suwak pokazuje ${animObrazu.srodek[1]} (${animObrazu.srodek[2]}), ◆ zgaszony`);
  sprawdz(animObrazu.sciezki.join() === "1,2", "pod osią jedna ścieżka z dwiema klatkami");
  sprawdz(animObrazu.krzywaKlatki.slice(0, 3).join("|") === "liniowo|◆⟋|true" && animObrazu.krzywaKlatki[3] === -30 && animObrazu.krzywaPowrot.join("|") === "true|◆",
          "Shift+klik w ◆: własna krzywa klatki (liniowo: ćwierć drogi = −30), cztery kliknięcia — znów jak ścieżka: " + animObrazu.krzywaKlatki.join(" "));
  sprawdz(animObrazu.nazwa === "próbka-dither.gif" && animObrazu.gifKlatek === 96, `GIF: ${animObrazu.nazwa}, ${animObrazu.gifKlatek} klatek`);
  sprawdz(animObrazu.jasnosci[0] < animObrazu.jasnosci[1] && animObrazu.jasnosci[1] < animObrazu.jasnosci[2] && animObrazu.jasnosci[2] - animObrazu.jasnosci[0] > 60,
          "jasność klatek GIF-a rośnie: " + animObrazu.jasnosci.join(" → "));
  sprawdz(animObrazu.mp4 && animObrazu.mp4[2] === 4, "animowana pikselizacja 1→5 w MP4: " + (animObrazu.mp4 ? animObrazu.mp4.join("×").replace(/×([\d.]+)$/, ", $1 s") : animObrazu.mp4msg));
  sprawdz(animObrazu.koniec.join() === "false,false,none", "„Zakończ animację” wraca do obrazu, ◆ znikają");

  console.log("--- ASCII ---");
  const asc = await wykonaj(async () => {
    const { S, DEFAULTS, LOOK } = await import("/src/state.js");
    const $ = s => document.querySelector(s);
    for(const k of LOOK) S[k] = DEFAULTS[k];
    const stary = S.img; $("#sample").click(); await czekaj(() => S.img !== stary);
    $("#tab-ascii").click();
    await new Promise(r => setTimeout(r, 400));
    const wyn = {grupa: !$("#g-ascii").classList.contains("hidden"), dither: $("#g-dither").classList.contains("hidden"),
                 opcje: [...$("#fmt").options].map(o => o.value).join(), w: $("#out").width};
    const sel = $("#fmt"); sel.value = "txt"; sel.dispatchEvent(new Event("change"));
    pobrane.length = 0; $("#save").click();
    await czekaj(() => pobrane.length);
    const txt = await (await fetch(pobrane[0].url)).text();
    wyn.txt = [pobrane[0].nazwa.replace(/\d+/, "N"), txt.split("\n").length, /[@#%*+=]/.test(txt)];
    /* paleta widoczna tylko przy kolorach z palety */
    const k = $("#asciiKolor"); k.value = "paleta"; k.dispatchEvent(new Event("change"));
    wyn.paleta = !$("#g-pal").classList.contains("hidden");
    k.value = "obraz"; k.dispatchEvent(new Event("change"));
    wyn.bezPalety = $("#g-pal").classList.contains("hidden");
    $("#tab-dither").click();
    await new Promise(r => setTimeout(r, 300));
    wyn.powrot = [[...$("#fmt").options].map(o => o.value).join(), S.fmt];
    return wyn;
  });
  sprawdz(asc.grupa && asc.dither && asc.opcje === "png,svg,txt" && asc.w > 100, "zakładka ASCII: własna grupa, formaty png/svg/txt, obraz narysowany");
  sprawdz(asc.txt[0] === "ascii-N.txt" && asc.txt[1] > 30 && asc.txt[2], `TXT: ${asc.txt[1]} wierszy znaków`);
  sprawdz(asc.paleta && asc.bezPalety, "paleta pokazuje się tylko przy kolorach z palety");
  sprawdz(asc.powrot[0] === "png,svg" && asc.powrot[1] === "png", "po wyjściu z ASCII format TXT znika, zapis wraca do PNG");

  console.log("--- warstwy ---");
  const komp = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const { K } = await import("/src/warstwy.js");
    const $ = s => document.querySelector(s);
    const wyn = {start: !$("#komp-start").classList.contains("hidden")};
    $("#komp-start").click();
    await new Promise(r => setTimeout(r, 200));
    wyn.po = [K.aktywna, K.warstwy.length, !$("#g-warstwy").classList.contains("hidden"), S.img === K.kanwa];
    /* druga warstwa: czerwony kwadrat 100×100 przez „Otwórz plik" (w kompozycji = nowa warstwa) */
    const c = document.createElement("canvas"); c.width = 100; c.height = 100;
    const x = c.getContext("2d"); x.fillStyle = "#ff0000"; x.fillRect(0, 0, 100, 100);
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    upusc(new File([blob], "kwadrat.png", {type: "image/png"}));
    await czekaj(() => K.warstwy.length === 2);
    const fmt = $("#komp-format"); fmt.value = "1080x1080"; fmt.dispatchEvent(new Event("change"));
    wyn.plotno = [K.szer, K.wys, K.kanwa.width, K.kanwa.height];
    /* kwadrat: skala 10% w rogu (100, 100) */
    const ust = (id, v) => { const el = $("#" + id); el.value = v; el.dispatchEvent(new Event("input")); };
    ust("komp-skala", 10); ust("komp-x", 100); ust("komp-y", 100);
    const piksel = (px, py) => [...K.kanwa.getContext("2d").getImageData(px, py, 1, 1).data];
    wyn.kwadrat = [piksel(100, 100), piksel(1000, 1000)];
    /* przeciągnięcie myszą o 1/4 szerokości podglądu w prawo */
    const r = $("#out").getBoundingClientRect(), sx = r.left + 100/1080*r.width, sy = r.top + 100/1080*r.height;
    const zd = (typ, x, y) => $("#out").dispatchEvent(new PointerEvent(typ, {clientX: x, clientY: y, pointerId: 1, bubbles: true}));
    zd("pointerdown", sx, sy); zd("pointermove", sx + r.width/4, sy); zd("pointerup", sx + r.width/4, sy);
    wyn.ciagniecie = Math.round(K.warstwy[1].x);
    /* kolejność: kwadrat pod spód — zakrywa go zdjęcie */
    $('#komp-lista .warstwa[data-i="1"] [data-a="dol"]').click();
    wyn.podSpodem = [K.warstwy[0].nazwa, piksel(Math.round(K.warstwy[0].x), 100)];
    /* przezroczyste tło płótna */
    $("#komp-przezr").click();
    wyn.przezr = K.przezroczyste;
    $("#komp-przezr").click();
    $("#komp-koniec").click();
    await new Promise(r => setTimeout(r, 200));
    wyn.koniec = [K.aktywna, S.img.width, S.img.height, $("#g-warstwy").classList.contains("hidden")];
    return wyn;
  });
  sprawdz(komp.start && komp.po.join() === "true,1,true,true", "„Kompozycja z warstw”: obraz staje się pierwszą warstwą");
  sprawdz(komp.plotno.join() === "1080,1080,1080,1080", "format 1:1 → płótno 1080×1080");
  sprawdz(komp.kwadrat[0].slice(0, 3).join() === "255,0,0" && komp.kwadrat[1].slice(0, 3).join() !== "255,0,0",
          "druga warstwa (przeciągnięty plik) w zadanym miejscu i skali");
  sprawdz(Math.abs(komp.ciagniecie - 370) <= 2, `przeciągnięcie myszą: x 100 → ${komp.ciagniecie} (oczekiwane 370)`);
  sprawdz(komp.podSpodem[0] === "kwadrat.png" && komp.podSpodem[1].slice(0, 3).join() !== "255,0,0", "↓ przenosi kwadrat pod zdjęcie — zakryty");
  sprawdz(komp.przezr, "przezroczyste tło płótna");
  sprawdz(komp.koniec.join() === "false,1080,1080,true", "„Zakończ kompozycję”: zostaje spłaszczony obraz 1080×1080");

  console.log("--- usuwanie tła ---");
  const tlo = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const { K } = await import("/src/warstwy.js");
    const $ = s => document.querySelector(s);
    /* zdjęcie produktowe: szare tło, czerwone koło, w środku szara plama */
    const c = document.createElement("canvas"); c.width = 400; c.height = 300;
    const x = c.getContext("2d");
    x.fillStyle = "#e6e6e4"; x.fillRect(0, 0, 400, 300);
    x.fillStyle = "#c82828"; x.beginPath(); x.arc(200, 150, 100, 0, 7); x.fill();
    x.fillStyle = "#e6e6e4"; x.beginPath(); x.arc(200, 150, 25, 0, 7); x.fill();
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    const stary = S.img;
    upusc(new File([blob], "produkt.png", {type: "image/png"}));
    await czekaj(() => S.img !== stary && S.img.width === 400);
    await new Promise(r => setTimeout(r, 100));
    const wyn = {przycisk: !$("#usun-tlo").classList.contains("hidden")};
    $("#usun-tlo").click();
    const t = $("#komp-tlo"); t.value = "#0000ff"; t.dispatchEvent(new Event("input"));
    const piksel = (px, py) => [...K.kanwa.getContext("2d").getImageData(px, py, 1, 1).data].slice(0, 3).join();
    /* skrót najpierw próbuje automatycznie (sieć neuronowa); bez pobranego
       modelu zostaje po kolorze z komunikatem */
    await czekaj(() => /Gotowe|Nie udało|nie jest pobrany/.test($("#komp-ai-stan").textContent), 120000);
    const maModel = (await fetch("/modele/isnet-general-use.onnx", {method: "HEAD"})).ok;
    wyn.ai = {model: maModel, stan: $("#komp-ai-stan").textContent, sposob: K.warstwy[0].tlo.sposob,
              tlo: piksel(5, 5), obiekt: piksel(200, 70), wcisniety: $('#komp-sposob [data-s="ai"]').getAttribute("aria-pressed")};
    /* dalej — po kolorze, jak przed dodaniem automatu */
    $('#komp-sposob [data-s="kolor"]').click();
    wyn.po = [K.aktywna, K.warstwy[0].tlo.wl, K.warstwy[0].tlo.kolor.join(), $("#komp-wytnij").checked,
              !$("#komp-wytnij-opcje").classList.contains("hidden")];
    wyn.piksele = [piksel(5, 5), piksel(200, 70), piksel(200, 150)];
    /* bez „tylko połączone”: plama w środku też znika */
    $("#komp-spojne").click();
    wyn.srodek = piksel(200, 150);
    /* kroplomierz: klik w czerwone koło → wycina czerwień, szare zostaje */
    $("#komp-kroplomierz").click();
    wyn.kursor = $("#out").classList.contains("kroplomierz");
    /* położenie podglądu czytane przy każdym zdarzeniu — panel nad nim zmienia wysokość (np. pojawia się przycisk) */
    const zd = (typ, px, py) => { const r = $("#out").getBoundingClientRect();
      $("#out").dispatchEvent(new PointerEvent(typ, {clientX: r.left + px/400*r.width, clientY: r.top + py/300*r.height, pointerId: 1, bubbles: true})); };
    zd("pointerdown", 200, 70); zd("pointerup", 200, 70);
    wyn.kroplomierz = [K.warstwy[0].tlo.kolor.join(), $("#out").classList.contains("kroplomierz"), piksel(200, 70), piksel(5, 5), Math.round(K.warstwy[0].x)];
    /* pędzel: „Usuń” na zostawionym szarym tle, „Przywróć” na wyciętej czerwieni, potem „Wyczyść” */
    const pr = $("#komp-pedzel-r"); pr.value = 30; pr.dispatchEvent(new Event("input"));
    const malujPo = (tryb, punkty) => {
      $(`#komp-pedzel button[data-p="${tryb}"]`).click();
      zd("pointerdown", ...punkty[0]); for(const p of punkty.slice(1)) zd("pointermove", ...p); zd("pointerup", ...punkty[punkty.length - 1]);
    };
    malujPo("usun", [[40, 250], [80, 250]]);
    malujPo("dodaj", [[200, 70], [200, 75]]);
    wyn.pedzel = [piksel(60, 250), piksel(200, 70), piksel(5, 5), Math.round(K.warstwy[0].x), !$("#komp-pedzel-wyczysc").classList.contains("hidden"), $("#out").classList.contains("pedzel")];
    $("#komp-pedzel-wyczysc").click();
    wyn.wyczysc = [piksel(60, 250), piksel(200, 70)];
    $('#komp-pedzel button[data-p=""]').click();
    /* wyłączenie — oryginał wraca */
    $("#komp-wytnij").click();
    wyn.wylaczone = piksel(5, 5);
    $("#komp-koniec").click();
    await new Promise(r => setTimeout(r, 200));
    return wyn;
  });
  if(tlo.ai.model)
    sprawdz(tlo.ai.sposob === "ai" && /Gotowe/.test(tlo.ai.stan) && tlo.ai.tlo === "0,0,255" && tlo.ai.obiekt === "200,40,40" && tlo.ai.wcisniety === "true",
            `automatycznie (sieć neuronowa): tło → kolor płótna, czerwone koło zostaje — ${tlo.ai.stan}`);
  else sprawdz(/nie jest pobrany/.test(tlo.ai.stan) && tlo.ai.sposob === "kolor", "bez modelu: komunikat „npm run modele”, zostaje po kolorze");
  sprawdz(tlo.przycisk && tlo.po.join("|") === "true|true|230,230,228|true|true", "„Usuń tło i podłóż kolor”: kompozycja z wyciętą warstwą, kolor z brzegów " + tlo.po[2]);
  sprawdz(tlo.piksele.join("|") === "0,0,255|200,40,40|230,230,228", "tło → kolor płótna, obiekt i szara plama w środku zostają: " + tlo.piksele.join(" "));
  sprawdz(tlo.srodek === "0,0,255", "bez „tylko połączone z brzegami” plama w środku też znika");
  sprawdz(tlo.kursor && tlo.kroplomierz.join("|") === "200,40,40|false|0,0,255|230,230,228|200",
          "kroplomierz: klik w obiekt bierze jego kolor i go wycina, warstwa się nie przesuwa: " + tlo.kroplomierz.join(" "));
  sprawdz(tlo.wylaczone === "230,230,228", "wyłączenie usuwania tła przywraca oryginał");
  sprawdz(tlo.pedzel.join("|") === "0,0,255|200,40,40|230,230,228|200|true|true",
          "pędzel: „Usuń” zdejmuje tło, „Przywróć” oddaje wyciętą czerwień, reszta i położenie bez zmian: " + tlo.pedzel.join(" "));
  sprawdz(tlo.wyczysc.join("|") === "230,230,228|0,0,255", "„Wyczyść poprawki pędzla”: wraca sam automat: " + tlo.wyczysc.join(" "));

  console.log("--- animacja warstw ---");
  const aw = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const { K } = await import("/src/warstwy.js");
    const { W, idzDo } = await import("/src/video.js");
    const { SCIEZKI } = await import("/src/animacja.js");
    const $ = s => document.querySelector(s);
    const stary = S.img; $("#sample").click(); await czekaj(() => S.img !== stary);
    $("#komp-start").click();
    const fmt = $("#komp-format"); fmt.value = "1080x1080"; fmt.dispatchEvent(new Event("change"));
    /* druga warstwa: czerwony kwadrat 100×100 w skali 10% */
    const c = document.createElement("canvas"); c.width = 100; c.height = 100;
    c.getContext("2d").fillStyle = "#ff0000"; c.getContext("2d").fillRect(0, 0, 100, 100);
    upusc(new File([await new Promise(r => c.toBlob(r, "image/png"))], "kwadrat.png", {type: "image/png"}));
    await czekaj(() => K.warstwy.length === 2);
    const ust = (id, v) => { const el = $("#" + id); el.value = v; el.dispatchEvent(new Event("input")); };
    ust("komp-skala", 10); ust("komp-y", 540);
    $("#animuj").click();
    await czekaj(() => W.z && W.z.rodzaj === "stopklatka");
    const naKlatce = async i => { idzDo(i); await czekaj(() => W.biezaca === i, 8000); await new Promise(r => setTimeout(r, 50)); };
    const ost = W.z.klatki.length - 1;
    const wyn = {widac: getComputedStyle($("#kl-komp-x")).display !== "none", warstwy: !$("#g-warstwy").classList.contains("hidden")};
    await naKlatce(0); ust("komp-x", 100); $("#kl-komp-x").click();
    await naKlatce(ost); ust("komp-x", 900);
    const id = K.warstwy[1].id;
    wyn.klucze = (SCIEZKI["w:" + id + ":x"] || []).map(k => k.v).join();
    const piksel = (x, y) => [...K.kanwa.getContext("2d").getImageData(x, y, 1, 1).data].slice(0, 3).join();
    const pol = Math.round(ost/2);
    await naKlatce(pol);
    const t = W.z.klatki[pol].t, D = W.z.klatki[ost].t, u = t/D, s = u*u*(3 - 2*u);
    wyn.srodek = [K.warstwy[1].x, Math.round(100 + 800*s), +$("#komp-x").value, piksel(Math.round(K.warstwy[1].x), 540), piksel(100, 540) !== "255,0,0"];
    wyn.sciezka = [...$("#os-sciezki").querySelectorAll(".nazwa")].map(n => n.textContent).join("|");
    /* usunięcie warstwy usuwa jej animację */
    $('#komp-lista .warstwa[data-i="1"] [data-a="usun"]').click();
    wyn.poUsunieciu = Object.keys(SCIEZKI).filter(k => k.startsWith("w:")).length;
    $("#anim-koniec").click();
    $("#komp-koniec").click();
    await new Promise(r => setTimeout(r, 200));
    return wyn;
  });
  sprawdz(aw.widac && aw.warstwy, "w animacji kompozycji suwaki warstwy mają ◆");
  sprawdz(aw.klucze === "100,900", "◆ i ruszenie suwaka na innej klatce: klatki kluczowe położenia warstwy " + aw.klucze);
  sprawdz(aw.srodek[0] === aw.srodek[1] && aw.srodek[2] === aw.srodek[0] && aw.srodek[3] === "255,0,0" && aw.srodek[4],
          `w połowie warstwa w x ${aw.srodek[0]} (oczekiwane ${aw.srodek[1]}), suwak za nią, płótno złożone na nowo`);
  sprawdz(aw.sciezka.split("|").includes("kwadrat.png: Położenie X"), "ścieżka pod osią z nazwą warstwy: " + aw.sciezka);
  sprawdz(aw.poUsunieciu === 0, "usunięcie warstwy usuwa jej klatki kluczowe");

  console.log("--- warstwa efektu ---");
  const we = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const { K } = await import("/src/warstwy.js");
    const $ = s => document.querySelector(s);
    const stary = S.img; $("#sample").click(); await czekaj(() => S.img !== stary);
    $("#komp-start").click();
    const fmt = $("#komp-format"); fmt.value = "1080x1080"; fmt.dispatchEvent(new Event("change"));
    const c = document.createElement("canvas"); c.width = 100; c.height = 100;
    c.getContext("2d").fillStyle = "#ff0000"; c.getContext("2d").fillRect(0, 0, 100, 100);
    upusc(new File([await new Promise(r => c.toBlob(r, "image/png"))], "kwadrat.png", {type: "image/png"}));
    await czekaj(() => K.warstwy.length === 2);
    const ust = (id, v) => { const el = $("#" + id); el.value = v; el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input")); };
    ust("komp-skala", 20);
    const piksel = (x, y) => [...K.kanwa.getContext("2d").getImageData(x, y, 1, 1).data].slice(0, 3);
    const przed = piksel(200, 200);
    /* warstwa efektu: zabarwienie na niebiesko, mocno */
    $("#komp-dodaj-efekt").click();
    const wyn = {lista: K.warstwy.map(w => w.typ || "obraz").join(), panel: [!$("#komp-efektowe").classList.contains("hidden"), $("#komp-wlasciwosci .tylko-obraz").classList.contains("hidden")]};
    ust("komp-efekt", "tint");
    ust("tint__w" + K.warstwy[2].id, 100);
    ust("tintKolor__w" + K.warstwy[2].id, "#0000ff");
    wyn.nazwa = K.warstwy[2].nazwa;
    const nadWszystkim = [piksel(540, 540), piksel(200, 200)];
    /* pod kwadrat: ↓ — kwadrat zostaje czerwony, zdjęcie pod nim dalej zabarwione */
    $('#komp-lista .warstwa[data-i="2"] [data-a="dol"]').click();
    const podKwadratem = [piksel(540, 540), piksel(200, 200)];
    wyn.nad = nadWszystkim.map(p => p.join()); wyn.pod = podKwadratem.map(p => p.join()); wyn.przed = przed.join();
    wyn.stos = [S.efekty, K.warstwy.map(w => w.typ || "obraz").join()];
    $("#komp-koniec").click();
    await new Promise(r => setTimeout(r, 200));
    return wyn;
  });
  sprawdz(we.lista === "obraz,obraz,efekt" && we.panel.join() === "true,true" && we.nazwa === "Efekt: Zabarwienie",
          "„+ Warstwa efektu”: warstwa na wierzchu, panel efektu zamiast położenia i maski, nazwa po efekcie");
  const niebieski = s => { const [r, g, b] = s.split(",").map(Number); return b > r && b > g; };
  sprawdz(we.nad[0] !== "255,0,0" && we.nad[1] !== we.przed, `nad wszystkim: zabarwione i kwadrat (czerwień × niebieski = ${we.nad[0]}), i zdjęcie`);
  sprawdz(we.pod[0] === "255,0,0" && niebieski(we.pod[1]), `pod kwadratem: kwadrat czysty (${we.pod[0]}), zdjęcie dalej zabarwione (${we.pod[1]})`);
  sprawdz(we.stos[0] === "", "warstwa efektu nie dotyka stosu efektów po rastrze");

  console.log("--- kopie efektu ---");
  const kop = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const $ = s => document.querySelector(s);
    const stary = S.img; $("#sample").click(); await czekaj(() => S.img !== stary);
    /* odcisk podglądu, gdy przestał się zmieniać (render bywa w toku po poprzednim kroku) */
    const odcisk = async () => {
      const jeden = () => { const o = $("#out"), d = o.getContext("2d").getImageData(0, 0, o.width, o.height).data;
        let h = o.width; for(let i=0; i<d.length; i+=7) h = (h*31 + d[i]) >>> 0; return h; };
      let pop = -1;
      for(let k=0; k<40; k++){ await new Promise(r => setTimeout(r, 400)); const h = jeden(); if(h === pop) return h; pop = h; }
      return pop;
    };
    const dodajZMenu = () => { $("#fx-dodaj").click(); [...$("#fx-menu").children].find(b => b.dataset.dodaj === "rgb").click(); };
    dodajZMenu();
    const jeden = await odcisk();
    const wyn = {etykieta: ($("#fx-dodaj").click(), [...$("#fx-menu").children].find(b => b.dataset.dodaj === "rgb").textContent)};
    $("#fx-dodaj").click();
    dodajZMenu();
    const karta = document.querySelector('.fx[data-fx="rgb~2"]');
    wyn.karta = [!!karta && !karta.classList.contains("hidden"), karta && karta.querySelector(".fx-nazwa").textContent, !!(karta && karta.querySelector("#rgb__2")), !(karta && karta.querySelector(".klucz"))];
    const s = karta.querySelector("#rgb__2"); s.value = 14; s.dispatchEvent(new Event("input"));
    wyn.stan = [S.efekty, S.efektyKopie, S.rgb, karta.querySelector("#rgb-v__2").textContent];
    const dwa = await odcisk();
    wyn.zmiana = dwa !== jeden;
    karta.querySelector('[data-akcja="usun"]').click();
    wyn.po = [S.efekty, S.efektyKopie, !document.querySelector('.fx[data-fx="rgb~2"]')];
    wyn.powrot = (await odcisk()) === jeden;
    document.querySelector('.fx[data-fx="rgb"] [data-akcja="usun"]').click();
    return wyn;
  });
  sprawdz(kop.etykieta.includes("kolejna kopia"), "menu: efekt już na stosie można dodać jako kopię");
  sprawdz(kop.karta.join("|") === "true|Przesunięcie RGB 2|true|true", "karta kopii z własnymi kontrolkami, bez klatek kluczowych: " + kop.karta.join(" "));
  sprawdz(kop.stan[0] === "rgb,rgb~2" && JSON.parse(kop.stan[1])["rgb~2"].rgb === 14 && kop.stan[2] === 6, "suwak kopii pisze do jej parametrów, nie do S.rgb: " + kop.stan.join(" "));
  sprawdz(kop.zmiana, "kopia zmienia podgląd (liczony w workerze)");
  sprawdz(kop.po.join("|") === "rgb||true" && kop.powrot, "usunięcie kopii: karta i parametry znikają, obraz jak z jedną instancją");

  console.log("--- faktura papieru ---");
  /* Porównanie udziałem różnych pikseli, nie odciskiem: tysiące półprzezroczystych
     włókien płótno rasteryzuje z drobnymi różnicami między renderami (patrz CLAUDE.md) */
  const pap = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const $ = s => document.querySelector(s);
    const stary = S.img; $("#sample").click(); await czekaj(() => S.img !== stary);
    const ust = (id, v) => { const e = $("#" + id); e.value = v; e.dispatchEvent(new Event(e.tagName === "SELECT" ? "change" : "input")); };
    const piksele = () => { const o = $("#out"); return o.getContext("2d").getImageData(0, 0, o.width, o.height).data; };
    /* zmiana → czekamy na kolejny gotowy render (licznik w out.dataset.nr), potem chwila spokoju */
    const poRenderze = async zmiana => {
      const n = +$("#out").dataset.nr || 0;
      zmiana();
      for(let k=0; k<200 && (+$("#out").dataset.nr || 0) <= n; k++) await new Promise(r => setTimeout(r, 50));
      let m; do { m = +$("#out").dataset.nr; await new Promise(r => setTimeout(r, 300)); } while(+$("#out").dataset.nr !== m);
      return piksele();
    };
    const rozne = (a, b) => { let n = 0; for(let i=0; i<a.length; i+=4) if(Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]) > 6) n++; return n/(a.length/4); };
    await poRenderze(() => $("#tab-half").click());
    /* punkt odniesienia z renderu na pewno w rastrze: siła bez znaczenia przy gładkim papierze */
    const gladki = await poRenderze(() => ust("papierSila", 50));
    const a = await poRenderze(() => { ust("papierRodzaj", "makulatura"); ust("papierSila", 80); });
    const wyn = {opcje: !$("#papier-opcje").classList.contains("hidden")};
    const b = await poRenderze(() => { ust("papierSila", 79); ust("papierSila", 80); });
    const c = await poRenderze(() => ust("papierRodzaj", "gladki"));
    wyn.zmiana = rozne(gladki, a); wyn.powtorka = rozne(a, b); wyn.powrot = rozne(gladki, c);
    $("#tab-dither").click();
    return wyn;
  });
  sprawdz(pap.opcje && pap.zmiana > 0.02 && pap.powtorka < 0.002 && pap.powrot < 0.002,
          `faktura papieru: zmienia ${(pap.zmiana*100).toFixed(1)}% pikseli, powtórka ${(pap.powtorka*100).toFixed(2)}%, „Gładki” wraca (${(pap.powrot*100).toFixed(2)}%)`);

  console.log("--- własny kształt SVG ---");
  const ksz = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const $ = s => document.querySelector(s);
    const stary = S.img; $("#sample").click(); await czekaj(() => S.img !== stary);
    $("#tab-half").click();
    const sel = $("#shape"); sel.value = "wlasny"; sel.dispatchEvent(new Event("change"));
    /* serce z krzywych + kółko z przekształceniem i dziurą (evenodd) */
    const plik = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <path d="M50 85 C 10 55, 10 20, 35 20 C 45 20, 50 30, 50 35 C 50 30, 55 20, 65 20 C 90 20, 90 55, 50 85 Z"/>
      <g transform="translate(200 0) scale(2)"><path fill-rule="evenodd" d="M0 0 H20 V20 H0 Z M5 5 V15 H15 V5 Z"/></g></svg>`;
    const dt = new DataTransfer(); dt.items.add(new File([plik], "serce.svg", {type: "image/svg+xml"}));
    const inp = $("#wlasny-plik"); inp.files = dt.files; inp.dispatchEvent(new Event("change"));
    await czekaj(() => S.ksztaltWlasny !== "", 5000);
    const k = JSON.parse(S.ksztaltWlasny);
    const wyn = {opcje: !$("#wlasny-opcje").classList.contains("hidden"), kontury: k.length, info: $("#wlasny-info").textContent,
      szer: Math.max(...k.flat().map(p => p[0])) - Math.min(...k.flat().map(p => p[0]))};
    sel.value = "circle"; sel.dispatchEvent(new Event("change"));
    S.ksztaltWlasny = "";
    $("#tab-dither").click();
    return wyn;
  });
  sprawdz(ksz.opcje && ksz.kontury === 3 && /serce\.svg — 3 kontury/.test(ksz.info) && ksz.szer > 2,
          `plik SVG → ${ksz.kontury} kontury (serce z krzywych, kwadrat i dziura po przekształceniu): ${ksz.info}`);

  console.log("--- kadrowanie ---");
  const kad = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const $ = s => document.querySelector(s);
    const c = document.createElement("canvas"); c.width = 400; c.height = 300;
    const x = c.getContext("2d"); x.fillStyle = "#ff0000"; x.fillRect(0, 0, 200, 300); x.fillStyle = "#0000ff"; x.fillRect(200, 0, 200, 300);
    const stary = S.img;
    upusc(new File([await new Promise(r => c.toBlob(r, "image/png"))], "pol.png", {type: "image/png"}));
    await czekaj(() => S.img !== stary && S.img.width === 400);
    await new Promise(r => setTimeout(r, 300));
    $("#kadruj").click();
    const sel = $("#kadr-proporcje"); sel.value = "1"; sel.dispatchEvent(new Event("change"));
    const ramka = $("#kadr"), wyn = {widac: !ramka.classList.contains("hidden")};
    /* przeciągnięcie ramki maksymalnie w prawo (300×300 → x od 100) */
    const r = ramka.getBoundingClientRect(), k = $("#out").getBoundingClientRect().width/400;
    const zd = (el, typ, px, py) => el.dispatchEvent(new PointerEvent(typ, {clientX: px, clientY: py, pointerId: 1, bubbles: true}));
    zd(ramka, "pointerdown", r.left + 20, r.top + 20); zd(ramka, "pointermove", r.left + 20 + 300*k, r.top + 20); zd(ramka, "pointerup", r.left + 20 + 300*k, r.top + 20);
    /* róg: lewy górny do środka — kwadrat mniejszy, prawy dolny róg stoi */
    const rog = ramka.querySelector('[data-r="nw"]'), r2 = ramka.getBoundingClientRect();
    zd(rog, "pointerdown", r2.left, r2.top); zd(rog, "pointermove", r2.left + 100*k, r2.top + 100*k); zd(rog, "pointerup", r2.left + 100*k, r2.top + 100*k);
    $("#kadr-ok").click();
    await new Promise(r => setTimeout(r, 300));
    const piksel = (px, py) => [...S.img.getContext("2d").getImageData(px, py, 1, 1).data].slice(0, 3).join();
    wyn.po = [S.img.width, S.img.height, piksel(1, 1), piksel(S.img.width - 2, S.img.height - 2), !$("#kadr-oryginal").classList.contains("hidden"), ramka.classList.contains("hidden")];
    $("#kadr-oryginal").click();
    await new Promise(r => setTimeout(r, 200));
    wyn.oryginal = [S.img.width, S.img.height, $("#kadr-oryginal").classList.contains("hidden")];
    /* następne testy liczą na próbkę */
    const ten = S.img; $("#sample").click(); await czekaj(() => S.img !== ten);
    return wyn;
  });
  sprawdz(kad.widac && kad.po.slice(0, 2).join() === "200,200" && kad.po[2] === "0,0,255" && kad.po[3] === "0,0,255" && kad.po[4] && kad.po[5],
          `kadr 1:1, przesunięty w prawo i zmniejszony rogiem: ${kad.po[0]}×${kad.po[1]}, sam niebieski — ${kad.po.slice(2, 4).join(" / ")}`);
  sprawdz(kad.oryginal.join() === "400,300,true", "„Przywróć cały obraz”: wraca 400×300");

  console.log("--- cofnij / ponów ---");
  const hist = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const $ = s => document.querySelector(s);
    const pauza = ms => new Promise(r => setTimeout(r, ms));
    const ust = (id, v) => { const el = $("#" + id); el.value = v; el.dispatchEvent(new Event("input")); };
    const klawisz = (key, shift) => document.body.dispatchEvent(new KeyboardEvent("keydown", {key, ctrlKey: true, shiftKey: !!shift, bubbles: true}));
    /* parametr nieanimowany — animowane (np. jasność z wcześniejszego testu) są poza historią */
    const start = S.nasycenie;
    ust("nasycenie", 20); await pauza(600);
    /* przeciągnięcie suwaka: wiele zmian w krótkim czasie = jeden krok */
    for(const v of [25, 30, 35, 40]) ust("nasycenie", v);
    await pauza(600);
    const wyn = {przed: [S.nasycenie, $("#cofnij").disabled]};
    klawisz("z"); wyn.cofnij1 = [S.nasycenie, +$("#nasycenie").value];
    klawisz("z"); wyn.cofnij2 = S.nasycenie;
    klawisz("z", true); wyn.ponow = [S.nasycenie, $("#ponow").disabled];
    $("#cofnij").click(); wyn.przycisk = S.nasycenie;
    /* zmiana tuż przed cofnięciem (jeszcze niezapisana) też się cofa */
    ust("con", 33); klawisz("z"); wyn.niezapisana = S.con;
    $("#ponow").click(); wyn.ponowNiezap = S.con;
    ust("nasycenie", start); ust("con", 0); await pauza(600);
    return wyn;
  });
  sprawdz(hist.przed.join() === "40,false" && hist.cofnij1.join() === "20,20" && hist.cofnij2 !== 20 && hist.ponow[0] === 20,
          `Ctrl+Z: 40 → ${hist.cofnij1[0]} (całe przeciągnięcie jednym krokiem) → ${hist.cofnij2}; Ctrl+Shift+Z → ${hist.ponow[0]}; suwak za stanem`);
  sprawdz(hist.przycisk === hist.cofnij2, "przycisk ↶ cofa jak Ctrl+Z");
  sprawdz(hist.niezapisana === 0 && hist.ponowNiezap === 33, "zmiana sprzed chwili (niezapisana) też się cofa i ponawia");

  console.log("--- presety: podświetlenie, szybkość „Skan” ---");
  const pres = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const { renderuj } = await import("/src/render.js");
    const $ = s => document.querySelector(s);
    $("#tab-half").click();
    await new Promise(r => setTimeout(r, 300));
    const przycisk = n => [...document.querySelectorAll("#presets .btn")].find(b => b.textContent.trim() === n);
    const wyn = {};
    przycisk("Skan").click();
    wyn.wcisniety = [przycisk("Skan").getAttribute("aria-pressed"), przycisk("Offset").getAttribute("aria-pressed")];
    /* „Skan” na zdjęciu: postrzępione brzegi i chmury — dawniej kilka sekund (jedna ścieżka evenodd) */
    const t0 = performance.now(); await renderuj(1); wyn.czas = Math.round(performance.now() - t0);
    const el = $("#cell"); el.value = 12; el.dispatchEvent(new Event("input"));
    wyn.poZmianie = przycisk("Skan").getAttribute("aria-pressed");
    await new Promise(r => setTimeout(r, 600));
    document.body.dispatchEvent(new KeyboardEvent("keydown", {key: "z", ctrlKey: true, bubbles: true}));
    wyn.poCofnieciu = przycisk("Skan").getAttribute("aria-pressed");
    $("#tab-dither").click();
    return wyn;
  });
  sprawdz(pres.wcisniety.join() === "true,false" && pres.poZmianie === "false" && pres.poCofnieciu === "true",
          "preset podświetlony po kliknięciu, gaśnie po ruszeniu suwaka, wraca po Ctrl+Z: " + JSON.stringify(pres));
  sprawdz(pres.czas < 2000, `„Skan” renderuje się w ${pres.czas} ms (dawniej kilka sekund)`);

  console.log("--- sekcje rastra ---");
  const sek = await wykonaj(async () => {
    const { S, DEFAULTS } = await import("/src/state.js");
    const $ = s => document.querySelector(s);
    $("#tab-half").click();
    const d = $('details.pod[data-pod="nierowny"]'), kropka = () => d.querySelector(".zmiana").classList.contains("widac");
    d.querySelector(".pod-reset").click();          /* poprzednie testy zostawiają „Skan” */
    const wyn = {przed: kropka()};
    const el = $("#chmury"); el.value = 50; el.dispatchEvent(new Event("input"));
    const el2 = $("#drganie"); el2.value = 30; el2.dispatchEvent(new Event("input"));
    wyn.zmiana = [kropka(), S.chmury, S.drganie];
    d.querySelector(".pod-reset").click();
    wyn.reset = [kropka(), S.chmury === DEFAULTS.chmury, S.drganie === DEFAULTS.drganie, +$("#chmury").value];
    /* pamięć otwartych sekcji */
    d.open = true; await new Promise(r => setTimeout(r, 50));
    let zapis = {}; try{ zapis = JSON.parse(localStorage.getItem("raster.sekcje") || "{}"); }catch{}
    wyn.pamiec = zapis.nierowny === true;
    d.open = false; await new Promise(r => setTimeout(r, 50));
    $("#tab-dither").click();
    return wyn;
  });
  sprawdz(!sek.przed && sek.zmiana.join() === "true,50,30" && sek.reset.join() === "false,true,true,0" && sek.pamiec,
          "sekcja rastra: kropka przy zmianie, „Przywróć domyślne w tej sekcji” cofa tylko jej suwaki, otwarcie zapamiętane");

  console.log("--- przezroczyste tło w PNG ---");
  const przezr = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const $ = s => document.querySelector(s);
    const p = $("#pal"); p.value = "bw"; p.dispatchEvent(new Event("change"));
    const f = $("#fmt"); f.value = "png"; f.dispatchEvent(new Event("change"));
    const widac = !$("#przezr-opcja").classList.contains("hidden");
    $("#przezroczyste").click();
    pobrane.length = 0; $("#save").click();
    await czekaj(() => pobrane.length);
    const bmp = await createImageBitmap(await (await fetch(pobrane[0].url)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height); c.getContext("2d").drawImage(bmp, 0, 0);
    const d = c.getContext("2d").getImageData(0, 0, bmp.width, bmp.height).data;
    let przezroczystych = 0; for(let i=3; i<d.length; i+=4) if(d[i] === 0) przezroczystych++;
    $("#przezroczyste").click();
    p.value = "pico8"; p.dispatchEvent(new Event("change"));
    return {widac, udzial: przezroczystych/(d.length/4), ukryte: $("#przezr-opcja").classList.contains("hidden")};
  });
  sprawdz(przezr.widac && przezr.udzial > 0.1 && przezr.udzial < 0.95, `1-bit: kolor papieru przezroczysty (${(przezr.udzial*100).toFixed(0)}% pikseli)`);
  sprawdz(przezr.ukryte, "przy palecie bez papieru opcja znika");

  console.log("--- presety kolorów i ustawień ---");
  const pr = await wykonaj(async () => {
    const { S } = await import("/src/state.js");
    const { SCIEZKI } = await import("/src/animacja.js");
    const { W } = await import("/src/video.js");
    const $ = s => document.querySelector(s);
    const zmien = (s, v) => { const el = $(s); el.value = v; el.dispatchEvent(new Event("change")); };
    const wyn = {};
    /* paleta: zapamiętaj Termowizję, przełącz na inną, przywróć z listy */
    zmien("#pal", "g-termo");
    $("#pal-zap-nazwa").value = "Moja termo";
    $("#pal-zap").click();
    wyn.zapisana = [$("#pal-zap-ile").textContent, $("#pal-zap-lista").children.length];
    zmien("#pal", "gameboy");
    $("#pal-zap-lista .uzyj").click();
    wyn.uzyta = [S.pal, S.custom.nazwa, S.custom.kolory.length, S.mapa];
    /* preset z animacją: animuj obraz, klatka jasności, zapamiętaj preset
       (najpierw czyścimy klatki zostawione przez wcześniejsze testy) */
    for(const k of Object.keys(SCIEZKI)) delete SCIEZKI[k];
    const stary = S.img; $("#sample").click(); await czekaj(() => S.img !== stary);
    $("#animuj").click(); await czekaj(() => W.z && W.z.rodzaj === "stopklatka");
    const s = $("#bri"); s.value = -30; s.dispatchEvent(new Event("input")); $("#kl-bri").click();
    $("#preset-name").value = "Z animacją"; $("#preset-keep").click();
    const zapisany = JSON.parse(localStorage.getItem("raster.presety")).find(p => p.nazwa === "Z animacją");
    wyn.wPresecie = zapisany && JSON.stringify(zapisany.animacja);
    /* zmiana: usuń animację, potem preset ją przywraca */
    for(const k of Object.keys(SCIEZKI)) delete SCIEZKI[k];
    [...$("#presets").querySelectorAll(".moj .btn")].find(b => b.textContent === "Z animacją").click();
    wyn.przywrocona = [JSON.stringify(SCIEZKI.bri && SCIEZKI.bri.map(k => [k.t, k.v])), $("#preset-msg").textContent];
    /* wbudowany preset animacji nie rusza */
    [...document.querySelectorAll("#presets .btn")].find(b => b.textContent === "Promo").click();
    wyn.poWbudowanym = !!(SCIEZKI.bri && SCIEZKI.bri.length);
    $("#anim-koniec").click();
    return wyn;
  });
  sprawdz(pr.zapisana.join() === "1,1", "„Zapamiętaj” paletę: na liście zapisanych");
  sprawdz(pr.uzyta.join() === "custom,Moja termo,7,jasnosc", "klik w zapisaną: paleta i sposób przypisania wracają (" + pr.uzyta.join(", ") + ")");
  sprawdz(pr.wPresecie === "{\"bri\":[[0,-30]]}", "preset ustawień zapisuje klatki kluczowe: " + pr.wPresecie);
  sprawdz(pr.przywrocona[0] === "[[0,-30]]" && /animacją/.test(pr.przywrocona[1]), "preset przywraca animację: " + pr.przywrocona[1]);
  sprawdz(pr.poWbudowanym, "wbudowany preset animacji nie kasuje");

  console.log("--- dźwięk w MP4 ---");
  const dz = await wykonaj(async () => {
    const { zlozMp4 } = await import("/src/mp4.js");
    const { W } = await import("/src/video.js");
    const { S } = await import("/src/state.js");
    const $ = s => document.querySelector(s);
    const wyn = {};
    /* film testowy: 2 s obrazu i 2 s tonu 440 Hz, zakodowany tak jak zapis apki */
    const w = 320, h = 240, fps = 30, n = 60, R = 48000;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    const pv = []; let avcC = null;
    const ev = new VideoEncoder({output: (ch, m) => { if(m?.decoderConfig?.description) avcC = new Uint8Array(m.decoderConfig.description.slice ? m.decoderConfig.description.slice(0) : m.decoderConfig.description.buffer.slice(0));
      const d = new Uint8Array(ch.byteLength); ch.copyTo(d); pv.push({dane: d, pts: ch.timestamp, dur: Math.round(1e6/fps), klucz: ch.type === "key"}); }, error: e => { throw e; }});
    ev.configure({codec: "avc1.42e01f", width: w, height: h, bitrate: 2e6, framerate: fps, avc: {format: "avc"}});
    for(let i=0; i<n; i++){ rysujKlatke(ctx, i, w, h); const f = new VideoFrame(c, {timestamp: Math.round(i*1e6/fps)}); ev.encode(f, {keyFrame: i % 30 === 0}); f.close(); }
    await ev.flush(); ev.close();
    let kodek = null, cfg = null;
    for(const [k, cf] of [["aac", {codec: "mp4a.40.2", aac: {format: "aac"}}], ["opus", {codec: "opus"}]]){
      const p = {...cf, sampleRate: R, numberOfChannels: 1, bitrate: 128000};
      if((await AudioEncoder.isConfigSupported(p)).supported){ kodek = k; cfg = p; break; }
    }
    wyn.kodek = kodek;
    if(!kodek) return wyn;
    const pa = []; let opis = null;
    const ea = new AudioEncoder({output: (ch, m) => { const d0 = m?.decoderConfig?.description; if(d0 && !opis) opis = new Uint8Array(d0.slice ? d0.slice(0) : d0.buffer.slice(0));
      const d = new Uint8Array(ch.byteLength); ch.copyTo(d); pa.push({dane: d, pts: ch.timestamp, dur: ch.duration || 0}); }, error: e => { throw e; }});
    ea.configure(cfg);
    const ton = new Float32Array(2*R); for(let i=0; i<ton.length; i++) ton[i] = 0.5*Math.sin(2*Math.PI*440*i/R);
    for(let s=0; s<ton.length; s+=4800){ const ad = new AudioData({format: "f32-planar", sampleRate: R, numberOfFrames: 4800, numberOfChannels: 1, timestamp: Math.round(s*1e6/R), data: ton.subarray(s, s+4800)}); ea.encode(ad); ad.close(); }
    await ea.flush(); ea.close();
    for(const p of pa) if(!p.dur) p.dur = Math.round((kodek === "aac" ? 1024 : 960)*1e6/R);
    const plik = new File([new Blob(zlozMp4({szer: w, wys: h, avcC, probki: pv, dzwiek: {kodek, opis, czestotliwosc: R, kanaly: 1, bitrate: 128000, probki: pa}}))], "z dźwiękiem.mp4", {type: "video/mp4"});
    /* sam film testowy: czy przeglądarka czyta jego dźwięk */
    const zrodlo = await new OfflineAudioContext(1, 1, R).decodeAudioData(await plik.arrayBuffer());
    wyn.zrodlo = Math.round(zrodlo.duration*10)/10;
    upusc(plik);
    await czekaj(() => W.z && W.z.nazwa === "z dźwiękiem.mp4");
    const sel = $("#fmt"); sel.value = "mp4"; sel.dispatchEvent(new Event("change"));
    wyn.opcja = !$("#dzwiek-opcja").classList.contains("hidden") && $("#dzwiek").checked;
    /* zakres 0,5–1,5 s: dźwięk ma być przycięty tak samo */
    const zak = (id, v) => { const el = $(id); el.value = v; el.dispatchEvent(new Event("input")); };
    zak("#od", 15); zak("#do", 44);
    pobrane.length = 0; $("#save").click();
    await czekaj(() => pobrane.length, 120000);
    await czekaj(() => !$(".panel").classList.contains("zajete"));
    wyn.msg = $("#save-msg").textContent;
    const wyj = await (await fetch(pobrane[0].url)).arrayBuffer();
    const a = await new OfflineAudioContext(1, 1, R).decodeAudioData(wyj);
    const d = a.getChannelData(0); let rms = 0; for(let i=0; i<d.length; i++) rms += d[i]*d[i];
    wyn.wynik = [Math.round(a.duration*100)/100, Math.round(Math.sqrt(rms/d.length)*100)/100];
    /* bez dźwięku, gdy odznaczone */
    $("#dzwiek").click();
    pobrane.length = 0; $("#save").click();
    await czekaj(() => pobrane.length, 120000);
    await czekaj(() => !$(".panel").classList.contains("zajete"));
    try{ await new OfflineAudioContext(1, 1, R).decodeAudioData(await (await fetch(pobrane[0].url)).arrayBuffer(), undefined, () => {}); wyn.bez = "jest dźwięk"; }
    catch{ wyn.bez = "brak dźwięku"; }
    $("#dzwiek").click();
    return wyn;
  });
  if(!dz.kodek) console.log("        (ta przeglądarka nie ma kodera dźwięku — pomijam)");
  else {
    sprawdz(dz.zrodlo === 2, `film testowy z dźwiękiem (${dz.kodek}): przeglądarka czyta ${dz.zrodlo} s`);
    sprawdz(dz.opcja, "„Dźwięk z filmu” widoczne i zaznaczone przy MP4 z filmu");
    sprawdz(/z dźwiękiem/.test(dz.msg), "komunikat: " + dz.msg);
    sprawdz(Math.abs(dz.wynik[0] - 1) < 0.08 && dz.wynik[1] > 0.2, `dźwięk przycięty do zakresu: ${dz.wynik[0]} s, RMS ${dz.wynik[1]} (ton 0,5 → RMS 0,35)`);
    sprawdz(dz.bez === "brak dźwięku", "odznaczone: plik bez ścieżki dźwięku");
  }

  /* Pomiar, nie test: film Full HD (apka przycina go do 1400 px), 3 s.
     Włączany zmienną POMIAR=1, bo trwa kilkadziesiąt sekund. */
  if(process.env.POMIAR){
    console.log("--- pomiar: 1920×1080, 90 klatek ---");
    const pom = await wykonaj(async () => {
      const { zlozMp4 } = await import("/src/mp4.js");
      const { W } = await import("/src/video.js");
      const w = 1920, h = 1080, fps = 30, n = 90;
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      const probki = []; let avcC = null;
      const enc = new VideoEncoder({
        output: (ch, meta) => {
          if(meta?.decoderConfig?.description) avcC = new Uint8Array(meta.decoderConfig.description.slice ? meta.decoderConfig.description.slice(0) : meta.decoderConfig.description.buffer.slice(0));
          const d = new Uint8Array(ch.byteLength); ch.copyTo(d);
          probki.push({dane: d, pts: ch.timestamp, dur: Math.round(1e6/fps), klucz: ch.type === "key"});
        }, error: e => { throw e; }
      });
      enc.configure({codec: "avc1.640028", width: w, height: h, bitrate: 8e6, framerate: fps, avc: {format: "avc"}});
      for(let i=0; i<n; i++){ rysujKlatke(ctx, i, w, h); const f = new VideoFrame(c, {timestamp: Math.round(i*1e6/fps)}); enc.encode(f, {keyFrame: i % 60 === 0}); f.close(); }
      await enc.flush(); enc.close();
      upusc(new File([new Blob(zlozMp4({szer: w, wys: h, avcC, probki}))], "fullhd.mp4", {type: "video/mp4"}));
      await czekaj(() => W.z && W.z.nazwa === "fullhd.mp4");
      const wyniki = {};
      /* wybrany profil H.264 — podglądamy, co przyjmuje koder */
      for(const codec of ["avc1.640034", "avc1.4d0034", "avc1.42e034"])
        wyniki[codec] = (await VideoEncoder.isConfigSupported({codec, width: 1400, height: 788, bitrate: 1e7, framerate: 30, avc: {format: "avc"}})).supported;
      for(const [fmt, tryb, algo] of [["mp4", "dither", "floyd"], ["mp4", "dither", "bayer4"], ["gif", "dither", "floyd"], ["mp4", "half", "floyd"]]){
        document.querySelector(tryb === "dither" ? "#tab-dither" : "#tab-half").click();
        const a = document.querySelector("#algo"); a.value = algo; a.dispatchEvent(new Event("change"));
        const sel = document.querySelector("#fmt"); sel.value = fmt; sel.dispatchEvent(new Event("change"));
        pobrane.length = 0;
        const t = performance.now();
        document.querySelector("#save").click();
        await czekaj(() => pobrane.length, 300000);
        await czekaj(() => !document.querySelector(".panel").classList.contains("zajete"));
        const ms = performance.now() - t;
        wyniki[fmt + " " + tryb + " " + algo] = Math.round(ms/n) + " ms/klatkę · " + document.querySelector("#save-msg").textContent;
      }
      return wyniki;
    });
    for(const [k, v] of Object.entries(pom)) console.log("        " + k + ": " + v);
  }

  sprawdz(bledyStrony.length === 0, "bez błędów w konsoli" + (bledyStrony.length ? ": " + bledyStrony.join(" | ") : ""));
} catch(err){
  console.log("  ŹLE   " + err.message);
  bledy++;
} finally {
  sprzataj();
}
console.log("\nBŁĘDÓW:", bledy);
process.exitCode = bledy ? 1 : 0;
