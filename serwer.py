"""Serwer do pracy nad apką: jak `python -m http.server`, ale z zakazem cache.

Zwykły http.server nie wysyła nagłówków cache i przeglądarka potrafi podać stary
moduł obok nowych (nowy app.js ze starym dither-core.js), co daje błędy,
których w kodzie nie ma. Tu każda odpowiedź ma Cache-Control: no-store, więc
zwykłe odświeżenie zawsze bierze pliki z dysku.

Uruchom z dowolnego miejsca:
    python serwer.py          (Windows: py serwer.py)
    python serwer.py 8080     (inny port)
Potem http://localhost:8000
"""
import functools
import http.server
import pathlib
import sys

KATALOG = pathlib.Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class BezCache(http.server.SimpleHTTPRequestHandler):
    # Windows potrafi zgłaszać .js jako text/plain z rejestru — moduły ES
    # wymagają typu JavaScript, więc ustawiamy go jawnie
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    obsluga = functools.partial(BezCache, directory=str(KATALOG))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), obsluga) as s:
        print(f"Raster: http://localhost:{PORT}  (Ctrl+C kończy)", flush=True)
        try:
            s.serve_forever()
        except KeyboardInterrupt:
            pass
