/* Macierze dyfuzji błędu i mapy progowe. */
/* ---------- macierze dyfuzji ---------- */
export const K = {
  floyd:{d:16,m:[[1,0,7],[-1,1,3],[0,1,5],[1,1,1]]},
  atkinson:{d:8,m:[[1,0,1],[2,0,1],[-1,1,1],[0,1,1],[1,1,1],[0,2,1]]},
  jjn:{d:48,m:[[1,0,7],[2,0,5],[-2,1,3],[-1,1,5],[0,1,7],[1,1,5],[2,1,3],[-2,2,1],[-1,2,3],[0,2,5],[1,2,3],[2,2,1]]},
  stucki:{d:42,m:[[1,0,8],[2,0,4],[-2,1,2],[-1,1,4],[0,1,8],[1,1,4],[2,1,2],[-2,2,1],[-1,2,2],[0,2,4],[1,2,2],[2,2,1]]},
  burkes:{d:32,m:[[1,0,8],[2,0,4],[-2,1,2],[-1,1,4],[0,1,8],[1,1,4],[2,1,2]]},
  sierra:{d:32,m:[[1,0,5],[2,0,3],[-2,1,2],[-1,1,4],[0,1,5],[1,1,4],[2,1,2],[-1,2,2],[0,2,3],[1,2,2]]},
  sierra2:{d:16,m:[[1,0,4],[2,0,3],[-2,1,1],[-1,1,2],[0,1,3],[1,1,2],[2,1,1]]},
  sierraLite:{d:4,m:[[1,0,2],[-1,1,1],[0,1,1]]}
};
export const BAYER2=[[0,2],[3,1]];
export const BAYER4=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
export const BAYER8=(()=>{const b=[];for(let y=0;y<8;y++){b[y]=[];for(let x=0;x<8;x++){
  let v=0,mask=4,bit=0;for(let i=0;i<3;i++){const xc=(x&mask)?1:0,yc=(y&mask)?1:0;
  v|=((yc^xc)<<(2*(2-i)+1));v|=(yc<<(2*(2-i)));mask>>=1;}b[y][x]=v;}}return b;})();
export const CLUSTER=[[12,5,6,13],[4,0,1,7],[11,3,2,8],[15,10,9,14]];

/* Stevenson–Arce (1985): dyfuzja na siatce sześciokątnej, rozpisana na
   kwadratową co drugą kolumnę — stąd przerwy w przesunięciach. Dzielnik 200. */
K.stevenson = {d:200, m:[[2,0,32],[-3,1,12],[-1,1,26],[1,1,30],[3,1,16],[-2,2,12],[0,2,26],[2,2,12],
                         [-3,3,5],[-1,3,12],[1,3,12],[3,3,5]]};

/* Ostromukhov, „A Simple and Efficient Error-Diffusion Algorithm" (SIGGRAPH 2001).
   Wagi zależą od jasności wejściowego piksela: [w prawo, w dół-w lewo, w dół],
   suma wiersza jest mianownikiem. Przepisane programem z oryginalnego
   varcoeffED.c autora (tabela 256 wierszy jest symetryczna: wiersz i = wiersz
   255−i, więc trzymamy połowę). Nie poprawiaj ręcznie — testy/algorytmy.mjs
   porównuje wynik z wzorcowym output.pgm z tego samego archiwum. */
export const OSTRO = [
  [13,0,5],[13,0,5],[21,0,10],[7,0,4],
  [8,0,5],[47,3,28],[23,3,13],[15,3,8],
  [22,6,11],[43,15,20],[7,3,3],[501,224,211],
  [249,116,103],[165,80,67],[123,62,49],[489,256,191],
  [81,44,31],[483,272,181],[60,35,22],[53,32,19],
  [237,148,83],[471,304,161],[3,2,1],[459,304,161],
  [38,25,14],[453,296,175],[225,146,91],[149,96,63],
  [111,71,49],[63,40,29],[73,46,35],[435,272,217],
  [108,67,56],[13,8,7],[213,130,119],[423,256,245],
  [5,3,3],[281,173,162],[141,89,78],[283,183,150],
  [71,47,36],[285,193,138],[13,9,6],[41,29,18],
  [36,26,15],[289,213,114],[145,109,54],[291,223,102],
  [73,57,24],[293,233,90],[21,17,6],[295,243,78],
  [37,31,9],[27,23,6],[149,129,30],[299,263,54],
  [75,67,12],[43,39,6],[151,139,18],[303,283,30],
  [38,36,3],[305,293,18],[153,149,6],[307,303,6],
  [1,1,0],[101,105,2],[49,53,2],[95,107,6],
  [23,27,2],[89,109,10],[43,55,6],[83,111,14],
  [5,7,1],[172,181,37],[97,76,22],[72,41,17],
  [119,47,29],[4,1,1],[4,1,1],[4,1,1],
  [4,1,1],[4,1,1],[4,1,1],[4,1,1],
  [4,1,1],[4,1,1],[65,18,17],[95,29,26],
  [185,62,53],[30,11,9],[35,14,11],[85,37,28],
  [55,26,19],[80,41,29],[155,86,59],[5,3,2],
  [5,3,2],[5,3,2],[5,3,2],[5,3,2],
  [5,3,2],[5,3,2],[5,3,2],[5,3,2],
  [5,3,2],[5,3,2],[5,3,2],[5,3,2],
  [305,176,119],[155,86,59],[105,56,39],[80,41,29],
  [65,32,23],[55,26,19],[335,152,113],[85,37,28],
  [115,48,37],[35,14,11],[355,136,109],[30,11,9],
  [365,128,107],[185,62,53],[25,8,7],[95,29,26],
  [385,112,103],[65,18,17],[395,104,101],[4,1,1]
];
export function wagiOstro(poziom){
  const w = OSTRO[poziom > 127 ? 255 - poziom : poziom];
  return w;
}

/* ---------- wzory (macierze progowe) ----------
   Nie z literatury — zaprojektowane tu. Ranga 0 to miejsce, gdzie farba
   pojawia się pierwsza, gdy obraz ciemnieje. Linie rosną od środka pasa,
   a wzdłuż linii progi idą jak w Bayerze, żeby brzeg linii był ditherowany,
   a nie skakał o cały wiersz. */
const BAYER_WIERSZ = [0,4,2,6,1,5,3,7];
function rangi(rozmiar, klucz){
  const k = [];
  for(let y=0;y<rozmiar;y++) for(let x=0;x<rozmiar;x++) k.push({x, y, v: klucz(x, y)});
  k.sort((a, b) => { for(let i=0;i<a.v.length;i++) if(a.v[i] !== b.v[i]) return a.v[i] - b.v[i]; return (a.y - b.y) || (a.x - b.x); });
  const m = Array.from({length: rozmiar}, () => new Array(rozmiar));
  k.forEach((c, i) => { m[c.y][c.x] = i; });
  return m;
}
const ODL = v => Math.abs(v - 3.5);
export const WZORY = {
  linieH:  rangi(8, (x, y) => [ODL(y), BAYER_WIERSZ[x]]),
  linieV:  rangi(8, (x, y) => [ODL(x), BAYER_WIERSZ[y]]),
  ukosne:  rangi(8, (x, y) => [ODL((x + y) & 7), BAYER_WIERSZ[(x - y) & 7]]),
  krzyze:  rangi(8, (x, y) => [Math.min(ODL(x), ODL(y)), Math.max(ODL(x), ODL(y))]),
  kropki8: rangi(8, (x, y) => [ODL(x)**2 + ODL(y)**2, Math.atan2(y - 3.5, x - 3.5)])
};

/* ---------- niebieski szum ----------
   Void-and-cluster (Ulichney 1993) na torusie 64×64: rozkład progów bez
   powtarzalnej kratki Bayera i bez grudek białego szumu. Liczony raz na
   żądanie (~kilkadziesiąt ms), deterministycznie — z ustalonego ziarna,
   więc worker i główny wątek dostają tę samą macierz.
   Przy wzorze, gdzie każda komórka jest albo zajęta, albo pusta, „najciaśniejsze
   skupisko zer" to dokładnie „największa pustka" wśród zer, więc trzecia faza
   algorytmu jest tą samą pętlą co druga. */
let NIEBIESKI = null;
export function niebieskiSzum(){
  if(NIEBIESKI) return NIEBIESKI;
  const R = 64, n = R*R, SIG = 1.5, ZAS = 7;
  const jadro = [];
  for(let dy=-ZAS; dy<=ZAS; dy++) for(let dx=-ZAS; dx<=ZAS; dx++) jadro.push([dx, dy, Math.exp(-(dx*dx + dy*dy)/(2*SIG*SIG))]);
  const E = new Float64Array(n), wz = new Uint8Array(n);
  const przelacz = (i, znak) => {
    const x = i % R, y = (i / R) | 0;
    for(const [dx, dy, g] of jadro) E[((y + dy + R) % R)*R + ((x + dx + R) % R)] += znak*g;
  };
  let s = 0x2545F491;
  const los = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  let jedynek = 0;
  while(jedynek < n/10){ const i = (los()*n) | 0; if(!wz[i]){ wz[i] = 1; przelacz(i, 1); jedynek++; } }
  const skupisko = () => { let b = -1, bv = -Infinity; for(let i=0;i<n;i++) if(wz[i] && E[i] > bv){ bv = E[i]; b = i; } return b; };
  const pustka   = () => { let b = -1, bv = Infinity;  for(let i=0;i<n;i++) if(!wz[i] && E[i] < bv){ bv = E[i]; b = i; } return b; };
  /* faza 0: rozluźnianie wzoru startowego, aż najciaśniejsza jedynka sama jest największą pustką */
  for(let k=0; k<n; k++){
    const c = skupisko(); wz[c] = 0; przelacz(c, -1);
    const v = pustka(); wz[v] = 1; przelacz(v, 1);
    if(v === c) break;
  }
  const ranga = new Int32Array(n), proto = wz.slice(), Eproto = E.slice();
  /* faza 1: zdejmowanie jedynek z prototypu od najciaśniejszej — dostają rangi malejąco */
  for(let r = jedynek - 1; r >= 0; r--){ const c = skupisko(); wz[c] = 0; przelacz(c, -1); ranga[c] = r; }
  /* fazy 2 i 3: od prototypu dokładamy w największe pustki — rangi rosnąco */
  wz.set(proto); E.set(Eproto);
  for(let r = jedynek; r < n; r++){ const v = pustka(); wz[v] = 1; przelacz(v, 1); ranga[v] = r; }
  NIEBIESKI = Array.from({length: R}, (_, y) => Array.from(ranga.subarray(y*R, y*R + R)));
  return NIEBIESKI;
}

/* ---------- więcej klasyki ----------
   False Floyd–Steinberg (lista Lee Crockera, DHALF.TXT): trzy sąsiedzi, /8.
   Fan (SPIE 1992): Floyd–Steinberg z wagą 1/16 przeniesioną z prawego dołu
   o dwa piksele w lewo. Shiau–Fan i Shiau–Fan 2 (patent US 5 353 127,
   wagi przepisane z jego tekstu): połowa błędu w prawo, reszta w dół
   coraz dalej w lewo — mniej „robaków" niż u Floyda–Steinberga. */
K.falseFloyd = {d:8,  m:[[1,0,3],[0,1,3],[1,1,2]]};
K.fan        = {d:16, m:[[1,0,7],[-2,1,1],[-1,1,3],[0,1,5]]};
K.shiauFan   = {d:8,  m:[[1,0,4],[-2,1,1],[-1,1,1],[0,1,2]]};
K.shiauFan2  = {d:16, m:[[1,0,8],[-3,1,1],[-2,1,1],[-1,1,2],[0,1,4]]};

/* Bayer 16×16 z rekurencji M₂ₙ = [[4M, 4M+2], [4M+3, 4M+1]] na Bayerze 8×8 */
export const BAYER16 = Array.from({length:16}, (_, y) => Array.from({length:16}, (_, x) =>
  4*BAYER8[y % 8][x % 8] + BAYER2[y >> 3][x >> 3]));

/* Interleaved gradient noise (Jimenez, „Next Generation Post Processing in
   Call of Duty: Advanced Warfare", SIGGRAPH 2014): próg ze wzoru zamiast
   z macierzy — rozkład bez kratki, tani i stabilny w czasie */
const ulam = v => v - Math.floor(v);
export const ign = (x, y) => ulam(52.9829189 * ulam(0.06711056*x + 0.00583715*y));
