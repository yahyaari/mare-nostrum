// Haritanın ızgarası: serbest yürüyüş için (kullanıcı 22.10: "haritadan tıkladığımız yere kaç tur
// sürecekse yürüsün, sadece şehirlere kalelere değil"). Harita CELL harita birimlik karelere
// bölünür; her karenin karada mı, yolun üstünde mi olduğu, ve komşusuna geçişin bir boğazla
// (karada) ya da bir kıstakla (denizde) kesilip kesilmediği.
//
//   node Tools/grid.mjs        ->  src/data/grid.js
//
// Ekranda çizilen kıyıların aynısıyla ölçer (src/geo.js onLand). Kara yolları ızgaraya
// "yakılır": yolun geçtiği kareler kara ve yol sayılır, birbirine geçişleri hiç kesilmez -
// Bizans'ın boğazı gibi yolun deniz geçtiği yerlerde de.
//
// Kare başına 6 bit, bir base64 harfi:
//   1 kara · 2 yol · 4 doğuya geçiş kesik · 8 güneye · 16 güneydoğuya · 32 güneybatıya
// (öteki yönler komşunun bitlerinden okunur).

import { writeFileSync } from "node:fs";
import { PLACES, ROADS } from "../src/data/world.js";
import { LAND, LAKES } from "../src/data/geo.js";
import { BOUNDS, LON_SCALE } from "../src/data/bounds.js";
import { SIZE, project, unpack } from "../src/geo.js";
import { roadLine } from "../src/rules/graph.js";

export const CELL = 0.25;
const W = Math.ceil(SIZE.x / CELL), H = Math.ceil(SIZE.y / CELL);

// Hızlı "karada mı": halkaların kutusu dışındaki noktalar o halkaya hiç bakmadan geçer.
// geo.js onLand ile aynı kural (evenodd, göller su).
const box = (r) => {
  let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  for (const [x, y] of r) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return { r, w, e, s, n };
};
const rings = LAND.map(unpack).map(box), lakes = LAKES.map(unpack).map(box);
function inRing(lon, lat, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const inside = (lon, lat, b) => lon >= b.w && lon <= b.e && lat >= b.s && lat <= b.n && inRing(lon, lat, b.r);
function land(x, y) {
  const lon = x / LON_SCALE + BOUNDS.w, lat = BOUNDS.n - y;
  let c = false;
  for (const b of rings) if (inside(lon, lat, b)) c = !c;
  return c && !lakes.some((b) => inside(lon, lat, b));
}

const idx = (i, j) => j * W + i;
const cellOf = (x, y) => idx(Math.max(0, Math.min(W - 1, Math.floor(x / CELL))), Math.max(0, Math.min(H - 1, Math.floor(y / CELL))));
const centre = (c) => ({ x: ((c % W) + 0.5) * CELL, y: (Math.floor(c / W) + 0.5) * CELL });

const bits = new Uint8Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (land((i + 0.5) * CELL, (j + 0.5) * CELL)) bits[idx(i, j)] |= 1;

// Yerleşimlerin kareleri karada (kıyıdaki liman karesinin ortası denize düşebiliyor).
for (const p of PLACES) { const m = project(p.lon, p.lat); bits[cellOf(m.x, m.y)] |= 1; }

// Yönler: doğu, güney, güneydoğu, güneybatı (öteki dördü komşunun bu bitleri).
const DIRS = [[1, 0, 4], [0, 1, 8], [1, 1, 16], [-1, 1, 32]];

// Geçişlerin kesilmesi: iki kara karesi arasında su (boğaz), iki deniz karesi arasında kara
// (kıstak, dar burun) varsa. Ortalarını birleştiren çizgide üç noktaya bakılır. Kara ile deniz
// arası hiç kesilmez: kıyıdan gemiye binilir, gemiden karaya çıkılır.
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const a = idx(i, j), A = centre(a);
    for (const [di, dj, bit] of DIRS) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || ni >= W || nj >= H) continue;
      const b = idx(ni, nj), B = centre(b);
      const la = bits[a] & 1, lb = bits[b] & 1;
      if (la !== lb) continue;
      for (const t of [0.25, 0.5, 0.75]) {
        if (land(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t) !== !!la) { bits[a] |= bit; break; }
      }
    }
  }
}

// Boğazlar: Çanakkale ve İstanbul. Izgaranın çözünürlüğünde (28 km) kara görünüyorlar; gemiler
// geçebilsin diye elle su açılır. Boğazı aşan kara yolu (Bizans) orada feribot: su ve yol.
const STRAITS = [
  [[39.95, 26.1], [40.2, 26.4], [40.42, 26.68], [40.55, 26.95], [40.7, 27.3]], // Çanakkale
  [[40.9, 29.05], [41.08, 29.06], [41.25, 29.12], [41.35, 29.2]], // İstanbul
];
const strait = new Set();
for (const line of STRAITS) {
  const pts = line.map(([lat, lon]) => project(lon, lat));
  for (let k = 1; k < pts.length; k++) {
    const A = pts[k - 1], B = pts[k];
    const n = Math.ceil(Math.hypot(B.x - A.x, B.y - A.y) / 0.04);
    for (let st = 0; st <= n; st++) {
      const c = cellOf(A.x + ((B.x - A.x) * st) / n, A.y + ((B.y - A.y) * st) / n);
      if (!PLACES.some((p) => { const m = project(p.lon, p.lat); return cellOf(m.x, m.y) === c; })) strait.add(c);
    }
  }
}
for (const c of strait) bits[c] &= ~1;

// Kara yolları: geçtiği kareler kara ve yol, birbirine geçişleri açık (boğazda su ve yol).
function open(a, b) {
  const ia = a % W, ja = Math.floor(a / W), ib = b % W, jb = Math.floor(b / W);
  let from = a, di = ib - ia, dj = jb - ja;
  if (dj < 0 || (dj === 0 && di < 0)) { from = b; di = -di; dj = -dj; }
  const d = DIRS.find(([x, y]) => x === di && y === dj);
  if (d) bits[from] &= ~d[2];
}
for (const r of ROADS) {
  if (r.sea) continue;
  const pts = roadLine(r).map(([lon, lat]) => project(lon, lat));
  let last = -1;
  for (let k = 1; k < pts.length; k++) {
    const A = pts[k - 1], B = pts[k];
    const n = Math.max(1, Math.ceil(Math.hypot(B.x - A.x, B.y - A.y) / 0.04));
    for (let s = 0; s <= n; s++) {
      const c = cellOf(A.x + ((B.x - A.x) * s) / n, A.y + ((B.y - A.y) * s) / n);
      if (c === last) continue;
      bits[c] |= strait.has(c) ? 2 : 1 | 2;
      if (last >= 0) {
        // Köşeden geçtiyse (çapraz) iki kare de açık kalsın.
        open(last, c);
      }
      last = c;
    }
  }
}

// Boğaz karesinin sudaki komşularına geçiş açık: gemi boğazdan denize çıkar.
for (const c of strait) {
  const i = c % W, j = Math.floor(c / W);
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const ni = i + di, nj = j + dj;
    if ((di || dj) && ni >= 0 && nj >= 0 && ni < W && nj < H && !(bits[idx(ni, nj)] & 1)) open(c, idx(ni, nj));
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const data = Array.from(bits, (v) => B64[v]).join("");
const rows = [];
for (let j = 0; j < H; j++) rows.push(`  "${data.slice(j * W, (j + 1) * W)}",`);
writeFileSync(new URL("../src/data/grid.js", import.meta.url), `// Tools/grid.mjs tarafından üretildi - elle düzenleme. Haritanın ızgarası: kare başına bir
// base64 harfi (1 kara, 2 yol, 4/8/16/32 doğuya/güneye/güneydoğuya/güneybatıya geçiş kesik).

export const CELL = ${CELL};
export const GRID_W = ${W};
export const GRID_H = ${H};
export const GRID = [
${rows.join("\n")}
].join("");
`);
let landN = 0, roadN = 0, cut = 0;
for (const v of bits) { landN += v & 1; roadN += (v >> 1) & 1; cut += ((v >> 2) & 1) + ((v >> 3) & 1) + ((v >> 4) & 1) + ((v >> 5) & 1); }
console.log(`${W}x${H} = ${W * H} kare · kara ${landN} · yol ${roadN} · kesik geçiş ${cut}`);
