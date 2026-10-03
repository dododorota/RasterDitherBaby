/* Raster jako aplikacja na pulpit (Electron). Tylko opakowanie: okno ładuje
   tę samą stronę co przeglądarka, bez żadnych zmian w kodzie apki.

   Pliki idą przez własny protokół app://, nie file:// — moduły ES i worker
   jako moduł z file:// Chromium blokuje (pochodzenie „null"), a WebCodecs
   (zapis MP4) wymaga bezpiecznego kontekstu. app:// jest zarejestrowany jako
   standardowy i bezpieczny, więc działa jak https: localStorage, workery,
   VideoEncoder. Typy MIME podajemy sami — moduł bez text/javascript się
   nie załaduje.

   Zapis plików: apka pobiera blob przez <a download>, a Electron zamienia
   to w systemowe okno „Zapisz jako" — podpowiadamy ostatni użyty folder. */
import { app, BrowserWindow, protocol, shell, Menu } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KORZEN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPY = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon"
};

protocol.registerSchemesAsPrivileged([{
  scheme: "app",
  privileges: {standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true}
}]);

/* jedno okno — drugie uruchomienie tylko je wyciąga na wierzch */
if(!app.requestSingleInstanceLock()) app.quit();

let okno = null, ostatniFolder = null;

function menu(){
  return Menu.buildFromTemplate([
    {label: "Plik", submenu: [{role: "quit", label: "Zamknij"}]},
    {label: "Edycja", submenu: [
      {role: "undo", label: "Cofnij"}, {role: "redo", label: "Ponów"}, {type: "separator"},
      {role: "cut", label: "Wytnij"}, {role: "copy", label: "Kopiuj"}, {role: "paste", label: "Wklej"}, {role: "selectAll", label: "Zaznacz wszystko"}
    ]},
    {label: "Widok", submenu: [
      {role: "reload", label: "Odśwież"}, {role: "togglefullscreen", label: "Pełny ekran"}, {type: "separator"},
      {role: "zoomIn", label: "Powiększ"}, {role: "zoomOut", label: "Pomniejsz"}, {role: "resetZoom", label: "Rzeczywisty rozmiar"},
      {type: "separator"}, {role: "toggleDevTools", label: "Narzędzia deweloperskie"}
    ]}
  ]);
}

function otworz(){
  okno = new BrowserWindow({
    width: 1440, height: 960, minWidth: 900, minHeight: 600,
    title: "Raster", backgroundColor: "#0b0b0b", autoHideMenuBar: true,
    icon: path.join(KORZEN, "electron", "ikona.png"),
    webPreferences: {contextIsolation: true, sandbox: true, nodeIntegration: false}
  });
  /* linki na zewnątrz — do przeglądarki; z okna apki nie wychodzimy */
  okno.webContents.setWindowOpenHandler(({url}) => {
    if(/^https?:/.test(url)) shell.openExternal(url);
    return {action: "deny"};
  });
  okno.webContents.on("will-navigate", (e, url) => {
    if(!url.startsWith("app://")){ e.preventDefault(); if(/^https?:/.test(url)) shell.openExternal(url); }
  });
  okno.loadURL("app://raster/index.html");
  if(process.env.RASTER_ZRZUT) zrzut(process.env.RASTER_ZRZUT);
}

/* Szybki test bez klikania: RASTER_ZRZUT=plik.png npm start — po starcie
   wczytuje „Próbkę", zapisuje zrzut okna i błędy z konsoli, zamyka się. */
function zrzut(plik){
  const bledy = [];
  okno.webContents.on("console-message", e => { if(e.level === "error") bledy.push(e.message); });
  okno.webContents.once("did-finish-load", async () => {
    await new Promise(r => setTimeout(r, 1500));
    const stan = await okno.webContents.executeJavaScript(`(async () => {
      document.querySelector("#sample").click();
      await new Promise(r => setTimeout(r, 2500));
      const o = document.querySelector("#out");
      return {szer: o.width, wys: o.height, font: document.fonts.check("14px Archivo"), worker: typeof Worker, koder: typeof VideoEncoder};
    })()`);
    const obraz = await okno.webContents.capturePage();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(plik, obraz.toPNG());
    console.log(JSON.stringify({stan, bledy}));
    app.quit();
  });
}

app.whenReady().then(() => {
  protocol.handle("app", async req => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if(p === "/" || p === "") p = "/index.html";
    const plik = path.normalize(path.join(KORZEN, p));
    /* tylko pliki apki — ścieżka nie może wyjść poza jej katalog */
    if(!plik.startsWith(KORZEN + path.sep)) return new Response("", {status: 403});
    try{
      return new Response(await readFile(plik), {headers: {"content-type": TYPY[path.extname(plik).toLowerCase()] || "application/octet-stream"}});
    }catch{
      return new Response("", {status: 404});
    }
  });
  Menu.setApplicationMenu(menu());
  otworz();
  okno.webContents.session.on("will-download", (e, item) => {
    item.setSaveDialogOptions({defaultPath: path.join(ostatniFolder || app.getPath("pictures"), item.getFilename())});
    item.once("done", (ev, stan) => { if(stan === "completed") ostatniFolder = path.dirname(item.getSavePath()); });
  });
});

app.on("second-instance", () => { if(okno){ if(okno.isMinimized()) okno.restore(); okno.focus(); } });
app.on("window-all-closed", () => app.quit());
