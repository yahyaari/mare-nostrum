// Haritada serbest yürüyüş (kullanıcı 22.10: "haritadan tıkladığımız yere kaç tur sürecekse
// yürüsün, sadece şehirlere kalelere değil, ordular etrafta gezebilsin"). Saf kurallar, DOM yok.
//
// Harita CELL harita birimlik karelere bölünmüş (src/data/grid.js, Tools/grid.mjs üretir). Bir
// ordu kareden kareye yürür; her adımın bir bedeli var ve ordunun turda harcayabileceği hareket
// puanı (N.march.mp) sınırlı:
//   yol üstünde birim başına 1, yol dışında 2.5, denizde 1; karadan gemiye binmek ya da gemiden
//   karaya çıkmak ayrıca N.march.embark.
// Yani yolda turda 4, yol dışında 1.6 harita birimi (~440 / ~180 km), denizde 4.
//
// Toprak: her kara karesi kendisine en yakın yerleşimin (en fazla REACH uzakta), ekranda çizilen
// topraklarla aynı kural (view/regions.js). Deniz kimsenin değil.

import { CELL, GRID, GRID_H, GRID_W } from "../data/grid.js";
import { PLACES } from "../data/world.js";
import { project } from "../geo.js";
import { N } from "./numbers.js";

export { CELL };
export const W = GRID_W, H = GRID_H;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const bits = new Uint8Array(W * H);
for (let c = 0; c < W * H; c++) bits[c] = B64.indexOf(GRID[c]);

export const isLand = (c) => (bits[c] & 1) === 1;
export const isRoad = (c) => (bits[c] & 2) === 2;
export const cellOf = (x, y) => Math.max(0, Math.min(H - 1, Math.floor(y / CELL))) * W + Math.max(0, Math.min(W - 1, Math.floor(x / CELL)));
export const centre = (c) => ({ x: ((c % W) + 0.5) * CELL, y: (Math.floor(c / W) + 0.5) * CELL });
// Karelerin ortaları dizide: yol bulmanın iç döngüsü nesne yaratmasın.
const CX = new Float64Array(W * H), CY = new Float64Array(W * H);
for (let c = 0; c < W * H; c++) { CX[c] = ((c % W) + 0.5) * CELL; CY[c] = (Math.floor(c / W) + 0.5) * CELL; }
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Yerleşimlerin yerleri (harita birimi) ve kareleri; bir karedeki yerleşim. */
export const POS = Object.fromEntries(PLACES.map((p) => [p.id, project(p.lon, p.lat)]));
export const PLACE_CELL = Object.fromEntries(PLACES.map((p) => [p.id, cellOf(POS[p.id].x, POS[p.id].y)]));
const placeIn = new Map(PLACES.map((p) => [PLACE_CELL[p.id], p.id]));
export const placeAtCell = (c) => placeIn.get(c) ?? null;

// ---- komşular ----
//
// Sekiz yön. Bir geçiş, iki kareden kuzeyde / batıda olanın bitinde kesik yazılı (grid.mjs).
const N8 = new Int32Array(W * H * 8).fill(-1);
const L8 = new Float32Array(W * H * 8);
{
  const cut = (c, bit) => (bits[c] & bit) !== 0;
  const D = Math.SQRT2 * CELL;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const c = j * W + i;
      const put = (k, ni, nj, len, blocked) => {
        if (ni < 0 || nj < 0 || ni >= W || nj >= H || blocked) return;
        N8[c * 8 + k] = nj * W + ni;
        L8[c * 8 + k] = len;
      };
      put(0, i + 1, j, CELL, cut(c, 4));
      put(1, i - 1, j, CELL, i > 0 && cut(c - 1, 4));
      put(2, i, j + 1, CELL, cut(c, 8));
      put(3, i, j - 1, CELL, j > 0 && cut(c - W, 8));
      put(4, i + 1, j + 1, D, cut(c, 16));
      put(5, i - 1, j - 1, D, i > 0 && j > 0 && cut(c - W - 1, 16));
      put(6, i - 1, j + 1, D, cut(c, 32));
      put(7, i + 1, j - 1, D, j > 0 && i < W - 1 && cut(c - W + 1, 32));
    }
  }
}

/** Bir karenin komşuları: [[kare, uzunluk], ...]. */
export function around(c) {
  const out = [];
  for (let k = 0; k < 8; k++) if (N8[c * 8 + k] >= 0) out.push([N8[c * 8 + k], L8[c * 8 + k]]);
  return out;
}

/** Bir adımın bedeli (hareket puanı): yol, kara, deniz; karaya çıkış ve gemiye biniş ayrıca. */
export function stepCost(a, b, len) {
  // Yol üstünde yol hızı - boğazı aşan yolda (feribot, su karesi) da.
  if (isRoad(a) && isRoad(b)) return len * N.march.road;
  const la = isLand(a), lb = isLand(b);
  if (la && lb) return len * N.march.land;
  if (!la && !lb) return len * N.march.sea;
  return len * N.march.land + N.march.embark;
}

// ---- toprak ----

const REACH = 3.2; // view/regions.js ile aynı
const region = new Int16Array(W * H).fill(-1);
for (let c = 0; c < W * H; c++) {
  if (!isLand(c)) continue;
  const m = centre(c);
  let best = -1, bd = REACH;
  PLACES.forEach((p, i) => {
    const d = dist(m, POS[p.id]);
    if (d < bd) { bd = d; best = i; }
  });
  region[c] = best;
}
/** Bu kare kimin toprağı: yerleşimin kimliği, ya da null (deniz, sahipsiz bozkır ve çöl). */
export const regionOf = (c) => (region[c] >= 0 ? PLACES[region[c]].id : null);
/** Aynısı, yerleşimin PLACES içindeki sırası (-1: kimsenin). Sık sorulduğunda hızlı. */
export const regionIndex = (c) => region[c];

// ---- yol bulma ----
//
// `opts`:
//   enter(c) -> bool   bu kareye girilebilir mi (kara/deniz, düşman şehri...)
//   extra(c) -> number bu kareye girmenin ek bedeli (bilgisayar tarafsız topraktan kaçınır)
// Bedel en az yol bedeli kadar: A*'ın tahmini düz uzaklık x en ucuz oran.

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      for (;;) {
        let m = 2 * i + 1;
        if (m >= k.length) break;
        if (m + 1 < k.length && k[m + 1] < k[m]) m++;
        if (k[m] >= lk) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

const cost = new Float64Array(W * H);
const prev = new Int32Array(W * H);
const stamp = new Uint32Array(W * H);
let round = 0;

/**
 * En ucuz yol: `from`dan `goal(c)` doğru olan ilk kareye. `aim`: tahmin için hedefin yeri
 * (yoksa Dijkstra). `limit`: bundan pahalı yollara bakılmaz.
 * Dönen: { cells: [from, ..., hedef], cost } ya da null.
 */
export function search(from, goal, opts = {}, aim = null, limit = Infinity) {
  round++;
  const enter = opts.enter ?? (() => true), extra = opts.extra ?? null;
  // Tahmin: hedefe düz uzaklık x en ucuz oran (yol ya da deniz) - hiçbir zaman fazla değil.
  const rate = Math.min(N.march.road, N.march.sea);
  const ax = aim?.x ?? 0, ay = aim?.y ?? 0, rad = opts.radius ?? 0;
  const h = aim ? (c) => Math.max(0, Math.hypot(CX[c] - ax, CY[c] - ay) - rad) * rate : () => 0;
  const open = new Heap();
  stamp[from] = round; cost[from] = 0; prev[from] = -1;
  open.push(h(from), from);
  while (open.size) {
    const c = open.pop();
    const g = cost[c];
    if (goal(c)) {
      const cells = [];
      for (let x = c; x >= 0; x = prev[x]) cells.push(x);
      return { cells: cells.reverse(), cost: g };
    }
    for (let k = 0; k < 8; k++) {
      const n = N8[c * 8 + k];
      if (n < 0 || !enter(n)) continue;
      const ng = g + stepCost(c, n, L8[c * 8 + k]) + (extra ? extra(n) : 0);
      if (ng > limit) continue;
      if (stamp[n] === round && ng >= cost[n]) continue;
      stamp[n] = round; cost[n] = ng; prev[n] = c;
      open.push(ng + h(n), n);
    }
  }
  return null;
}

/** Bir kareye en ucuz yol. */
export const pathTo = (from, to, opts = {}, limit = Infinity) => search(from, (c) => c === to, opts, centre(to), limit);

/** Bir noktanın `radius` yakınına (bir şehrin ya da ordunun önüne) en ucuz yol. */
export const pathNear = (from, at, radius, opts = {}, limit = Infinity) =>
  search(from, (c) => Math.hypot(CX[c] - at.x, CY[c] - at.y) <= radius, { ...opts, radius }, at, limit);

/**
 * Bir kareden çevresine bütün bedeller (sınırlı Dijkstra): { cost(c), path(c) }. Bilgisayar bir
 * ordunun bu tur nereye yetişebildiğine bununla bakar. Bir sonraki aramaya kadar geçerli.
 */
export function field(from, opts = {}, limit = Infinity) {
  search(from, () => false, opts, null, limit);
  const r = round;
  return {
    cost: (c) => (stamp[c] === r ? cost[c] : Infinity),
    path: (c) => {
      if (stamp[c] !== r) return null;
      const out = [];
      for (let x = c; x >= 0; x = prev[x]) out.push(x);
      return out.reverse();
    },
  };
}

/** Bir yolun kareleri boyunca bedeli. */
export function pathCost(cells) {
  let n = 0;
  for (let i = 1; i < cells.length; i++) n += stepCost(cells[i - 1], cells[i], dist(centre(cells[i - 1]), centre(cells[i])));
  return n;
}

// ---- ekran için: yumuşatılmış yol ----

/**
 * Kare kare yol ekranda merdiven gibi durur: aynı türden (yol, kara, deniz) kareler arasında
 * düz bir çizgi o türden çıkmıyorsa aradaki köşeler atlanır. Kurallar kareleri kullanır;
 * bu sadece çizilen çizgi. Dönen: [{ x, y }, ...].
 */
export function smooth(cells) {
  if (cells.length < 3) return cells.map(centre);
  const kind = (c) => (isLand(c) ? (isRoad(c) ? 2 : 1) : 0);
  const clear = (a, b) => {
    const A = centre(a), B = centre(b), k = kind(a);
    if (kind(b) !== k) return false;
    const n = Math.ceil(dist(A, B) / (CELL / 3));
    for (let s = 1; s < n; s++) {
      const c = cellOf(A.x + ((B.x - A.x) * s) / n, A.y + ((B.y - A.y) * s) / n);
      if (kind(c) !== k) return false;
    }
    return true;
  };
  const out = [centre(cells[0])];
  let from = 0;
  while (from < cells.length - 1) {
    let to = from + 1;
    for (let k = cells.length - 1; k > from + 1; k--) if (clear(cells[from], cells[k])) { to = k; break; }
    out.push(centre(cells[to]));
    from = to;
  }
  return out;
}

// ---- yerleşimlerin çevresi ----
//
// Her yerleşimin `r` yakınındaki kareler (moves.js: yabancı yerleşimin çevresinden geçilmez) ve
// tersine, bir kareyi çevresine alan yerleşimler. Yarıçapa göre bir kere hesaplanır.

const ringCache = new Map();
export function rings(r) {
  if (ringCache.has(r)) return ringCache.get(r);
  const of = {}, at = new Map();
  for (const p of PLACES) {
    const m = POS[p.id], cells = [];
    const i0 = Math.floor((m.x - r) / CELL), i1 = Math.floor((m.x + r) / CELL);
    const j0 = Math.floor((m.y - r) / CELL), j1 = Math.floor((m.y + r) / CELL);
    for (let j = Math.max(0, j0); j <= Math.min(H - 1, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(W - 1, i1); i++) {
        const c = j * W + i;
        if (Math.hypot(CX[c] - m.x, CY[c] - m.y) > r) continue;
        cells.push(c);
        if (!at.has(c)) at.set(c, []);
        at.get(c).push(p.id);
      }
    }
    of[p.id] = cells;
  }
  const out = { of, at: (c) => at.get(c) ?? [] };
  ringCache.set(r, out);
  return out;
}
