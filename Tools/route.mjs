// Harita verisi yazarken yardımcı. İki iş yapar:
//
//   1. Karaya düşmeyen bir yerleşim için en yakın kara noktasını önerir.
//   2. Denizden geçen bir kara yolu (ya da karadan geçen bir deniz geçişi) için ara noktaları
//      bulur: ızgara üzerinde A* ile kıyıyı izleyen bir güzergâh çıkarır, sonra onu düz
//      parçaları hâlâ karada (denizde) kalan en az sayıda noktaya indirir.
//
//   node Tools/route.mjs
//
// Çıktıyı src/data/world.js'e elle yapıştırmak için yazar; hiçbir dosyayı değiştirmez.
// Oyunun parçası değil - ölçen şey Tools/test.mjs.

import { PLACES, ROADS } from "../src/data/world.js";
import { onLand, project } from "../src/geo.js";
import { byId, roadLine } from "../src/rules/graph.js";

const CELL = 0.1; // derece
const r2 = (v) => Math.round(v * 100) / 100;

// ---- 1. yerleşimler ----
for (const p of PLACES) {
  if (onLand(p.lon, p.lat)) continue;
  let best = null;
  for (let dy = -0.3; dy <= 0.3; dy += 0.01) {
    for (let dx = -0.3; dx <= 0.3; dx += 0.01) {
      const lon = p.lon + dx, lat = p.lat + dy;
      // Kıyının hemen dibi değil, biraz içerisi: bütün komşuları da karada olsun.
      const deep = [[0, 0], [0.04, 0], [-0.04, 0], [0, 0.04], [0, -0.04]]
        .every(([a, b]) => onLand(lon + a, lat + b));
      const d = Math.hypot(dx * 0.77, dy);
      if (deep && (!best || d < best.d)) best = { lat: r2(lat), lon: r2(lon), d };
    }
  }
  console.log(`${p.id}: ${p.lat}, ${p.lon} denizde -> öneri ${best ? `${best.lat}, ${best.lon}` : "YOK"}`);
}

// ---- 2. yollar ----

function sampleWet(pts, wantLand, skip) {
  // pts: [[lon,lat]...]. Uçların `skip` kadar yakını sayılmaz (liman kıyıdadır).
  const P = pts.map(([lon, lat]) => ({ lon, lat, ...project(lon, lat) }));
  let total = 0;
  for (let i = 1; i < P.length; i++) total += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
  let walked = 0, bad = 0;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let t = 0; t < len; t += 0.015) {
      const at = walked + t;
      if (at < skip.start || at > total - skip.end) continue;
      const k = t / len;
      if (onLand(a.lon + (b.lon - a.lon) * k, a.lat + (b.lat - a.lat) * k) !== wantLand) bad++;
    }
    walked += len;
  }
  return bad;
}

function astar(from, to, wantLand) {
  const lo = Math.min(from[0], to[0]) - 3, hi = Math.max(from[0], to[0]) + 3;
  const so = Math.min(from[1], to[1]) - 3, no = Math.max(from[1], to[1]) + 3;
  const W = Math.ceil((hi - lo) / CELL) + 1, H = Math.ceil((no - so) / CELL) + 1;
  const ok = new Int8Array(W * H).fill(-1);
  const good = (i, j) => {
    const k = j * W + i;
    // Hücrenin ortası yetmez: iki komşu ortanın arasındaki düz çizgi bir burnu kesebilir.
    // Hücrenin dört kenarı da doğru zeminde olsun, güzergâh kıyıdan yarım hücre uzak kalsın.
    if (ok[k] < 0) {
      const x = lo + i * CELL, y = so + j * CELL, e = CELL / 2;
      ok[k] = [[0, 0], [e, 0], [-e, 0], [0, e], [0, -e]]
        .every(([dx, dy]) => onLand(x + dx, y + dy) === wantLand) ? 1 : 0;
    }
    return ok[k] === 1;
  };
  const cellOf = ([lon, lat]) => [Math.round((lon - lo) / CELL), Math.round((lat - so) / CELL)];
  const [si, sj] = cellOf(from), [ti, tj] = cellOf(to);
  const g = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const open = [[0, si, sj]];
  g[sj * W + si] = 0;
  const h = (i, j) => Math.hypot((i - ti) * 0.77, j - tj);
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [, i, j] = open.shift();
    if (i === ti && j === tj) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= W || b >= H) continue;
      // Yanlış zemin yasak değil ama pahalı: boğazdan geçmek gerekirse en dar yerinden geçsin.
      let step = Math.hypot(di * 0.77, dj);
      if (!good(a, b)) step *= 40;
      // Kıyının dibine yapışmasın: yanlış zemine komşu hücre biraz pahalı.
      else if (!good(a + 1, b) || !good(a - 1, b) || !good(a, b + 1) || !good(a, b - 1)) step *= 2;
      const k = b * W + a;
      if (g[j * W + i] + step < g[k]) {
        g[k] = g[j * W + i] + step;
        prev[k] = j * W + i;
        open.push([g[k] + h(a, b), a, b]);
      }
    }
  }
  const out = [];
  for (let k = tj * W + ti; k >= 0; k = prev[k]) out.unshift([lo + (k % W) * CELL, so + Math.floor(k / W) * CELL]);
  out[0] = from;
  out[out.length - 1] = to;
  return out;
}

/** Güzergâhı, her düz parçası doğru zeminde kalan en az noktaya indirir. */
function reduce(pts, wantLand, skip) {
  const keep = [0];
  let i = 0;
  while (i < pts.length - 1) {
    // i'den gidilebilecek en uzak noktayı ara.
    let j = pts.length - 1;
    for (; j > i + 1; j--) {
      const s = { start: i === 0 ? skip : 0, end: j === pts.length - 1 ? skip : 0 };
      if (sampleWet([pts[i], pts[j]], wantLand, s) === 0) break;
    }
    keep.push(j);
    i = j;
  }
  return keep.map((k) => pts[k]);
}

for (const r of ROADS) {
  const wantLand = !r.sea;
  const skip = 0.15;
  const bad = sampleWet(roadLine(r), wantLand, { start: skip, end: skip });
  if (bad * 0.015 <= (r.sea ? 0 : 0.15)) continue;
  const a = byId[r.a], b = byId[r.b];
  const route = astar([a.lon, a.lat], [b.lon, b.lat], wantLand);
  const via = reduce(route, wantLand, skip).slice(1, -1).map(([lon, lat]) => [r2(lat), r2(lon)]);
  console.log(`  ${r.sea ? "S" : "R"}("${r.a}", "${r.b}", ${JSON.stringify(via).replaceAll(",", ", ")}),`);
}
