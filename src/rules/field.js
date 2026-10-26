// Savaş sahasının arazisi (kurallar.md bölüm 29b). Kullanıcı 26.10 (bir görsel gönderdi: ağaçlı kıyılarıyla bir
// nehir, yanında bir köy, büyük bir dağ, adlarıyla): "haritalarda dağlar nehirler köprüler olsun, harita
// çeşitliliği açısından; coğrafyaya göre şekillensin".
//
// Saha, savaşın haritadaki yerinin çevresinden çıkar: saldırandan savunana bakan, `SPAN` harita birimi
// genişliğinde bir dikdörtgen. Gerçek veriden: deniz (kıyı çizgileri), nehirler (Natural Earth), ormanlar
// (ağaç noktalarının yoğunluğu), dağlar (dağ sıraları, map.js), yakındaki yerleşim (köy). Ayrıntı tohumlu
// gürültüyle: nehrin kıvrımları, orman öbekleri, tepeler, evler. Nehir saldırıyla geçiliyorsa (moves.js
// terrainOf) ve sahada gerçek nehir yoksa sahanın ortasından bir nehir geçer. Nehirde köprüler.
//
// Hücre başına tür (`kind`, 1 x 1 saha birimi): açık, su (geçilmez), orman, köprü, ev (geçilmez); ve yükseklik
// (0..1). Kurallar (tactics.js) bunları okur: yürüyüş yolu, hız, tepeden vuruş, ormanda süvari ve ok.

import { PLACES } from "../data/world.js";
import { RIVERS } from "../data/geo.js";
import { TREES } from "../data/trees.js";
import { MOUNTAINS } from "../data/mountains.js";
import { BOUNDS, LON_SCALE } from "../data/bounds.js";
import { onLand, project } from "../geo.js";
import { N } from "./numbers.js";
import { POS, cellOf, isMountain } from "./map.js";

export const OPEN = 0, WATER = 1, FOREST = 2, BRIDGE = 3, HOUSE = 4;

/** Sahanın kapladığı harita birimi (enine); boyu oranla. */
const SPAN = 1.2;

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Düz saha (eski kayıtlar, testler; sur savaşı da arazisiz değil ama nehirsiz). */
export function flatField() {
  const { w, h } = N.tactics;
  return { w, h, kind: new Uint8Array(w * h), height: new Float32Array(w * h), rivers: [], bridges: [], hills: [], houses: [], forests: 0, labels: [], obstacles: false };
}

/**
 * Sahayı kur. `spec`: { at: { x, y } (harita birimi, sahanın ortası), dir (saldırandan savunana açı, harita
 * birimiyle), seed, walls, place (yakındaki yerleşim, köy olur; null), river (nehir geçişi: sahada gerçek nehir
 * yoksa ortadan bir nehir), pass (dağ geçidi) }.
 */
export function makeField(spec) {
  const { w, h } = N.tactics;
  const F = flatField();
  const r = rng(spec.seed ?? 1);
  const S = SPAN / w; // saha birimi başına harita birimi
  const cos = Math.cos(spec.dir), sin = Math.sin(spec.dir);
  const toWorld = (fx, fy) => ({ x: spec.at.x + ((fx - w / 2) * cos - (fy - h / 2) * sin) * S, y: spec.at.y + ((fx - w / 2) * sin + (fy - h / 2) * cos) * S });
  const toField = (p) => {
    const dx = (p.x - spec.at.x) / S, dy = (p.y - spec.at.y) / S;
    return { x: w / 2 + dx * cos + dy * sin, y: h / 2 - dx * sin + dy * cos };
  };
  const lonlat = (p) => [p.x / LON_SCALE + BOUNDS.w, BOUNDS.n - p.y];
  const idx = (x, y) => Math.floor(y) * w + Math.floor(x);
  const set = (x, y, k) => { if (x >= 0 && y >= 0 && x < w && y < h) F.kind[idx(x, y)] = k; };

  // 1. Deniz: kıyı çizgisi gerçek; 2 birimlik örnekler, aradakiler en yakından (kenar biraz gürültülü).
  const step = 2;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const jx = x + step / 2 + (r() - 0.5) * 1.2, jy = y + step / 2 + (r() - 0.5) * 1.2;
      if (onLand(...lonlat(toWorld(jx, jy)))) continue;
      for (let yy = y; yy < Math.min(h, y + step); yy++) for (let xx = x; xx < Math.min(w, x + step); xx++) F.kind[idx(xx, yy)] = WATER;
    }
  }
  F.sea = F.kind.some((k) => k === WATER);

  // 2. Nehirler: gerçek çizgiler sahaya; yoksa ama yol nehirden geçiyorsa ortadan bir nehir.
  if (!spec.walls) {
    const lines = [];
    for (const line of RIVERS) {
      const pts = [];
      for (let i = 0; i < line.length; i += 2) pts.push(toField(project(line[i] / 100, line[i + 1] / 100)));
      if (pts.some((p) => p.x > -10 && p.x < w + 10 && p.y > -10 && p.y < h + 10)) lines.push(pts);
    }
    if (!lines.length && spec.river) {
      // Saldıranla savunanın arasından, yukarıdan aşağı, hafif eğri.
      const x0 = w / 2 + (r() - 0.5) * 10, x1 = w / 2 + (r() - 0.5) * 14;
      lines.push([{ x: x0, y: -5 }, { x: (x0 + x1) / 2 + (r() - 0.5) * 12, y: h / 2 }, { x: x1, y: h + 5 }]);
    }
    for (const pts of lines) {
      const river = meander(pts, r);
      if (river.length < 2) continue;
      F.rivers.push(river);
      paint(F, river, N.tactics.terrain.riverWidth, WATER);
      // Kıyılarda ağaçlar (görseldeki gibi).
      for (const p of river) {
        for (let k = 0; k < 2; k++) {
          const a = r() * Math.PI * 2, d = N.tactics.terrain.riverWidth / 2 + 1 + r() * 3;
          if (r() < 0.55) blob(F, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 1 + r() * 1.6, FOREST, r);
        }
      }
      bridges(F, river, r);
    }
  }

  // 3. Orman: çevredeki ağaç noktalarının yoğunluğu kadar öbek (dizilme yerlerinin dışında).
  let trees = 0;
  const c = lonlat(spec.at);
  for (let i = 0; i < TREES.length; i += 2) {
    const dx = (TREES[i] / 100 - c[0]) * LON_SCALE, dy = TREES[i + 1] / 100 - c[1];
    if (dx * dx + dy * dy < 0.8 * 0.8) trees++;
  }
  F.forests = Math.min(7, Math.round(trees / 6));
  for (let i = 0; i < F.forests; i++) {
    const x = 30 + r() * 40, y = 4 + r() * (h - 8);
    const rad = 3 + r() * 5;
    for (let k = 0; k < 5; k++) blob(F, x + (r() - 0.5) * rad * 1.6, y + (r() - 0.5) * rad * 1.2, rad * (0.5 + r() * 0.5), FOREST, r);
  }
  // Dizilme yerlerinin önü açık kalsın (ordular ormanın içinde başlamasın).
  for (let y = 0; y < h; y++) for (const x0 of [10, 70]) for (let x = x0; x < x0 + 20; x++) if (F.kind[idx(x, y)] === FOREST) F.kind[idx(x, y)] = OPEN;

  // 4. Tepeler: dağda büyükler (en büyüğü dağ sırasının adıyla), yakınında orta, düzlükte belki bir alçak tepe.
  const cell = cellOf(spec.at.x, spec.at.y);
  const range = nearRange(spec.at);
  const hilly = isMountain(cell) || spec.pass ? 1 : range ? 0.5 : 0;
  const count = hilly >= 1 ? 3 : hilly > 0 ? 2 : r() < 0.6 ? 1 : 0;
  for (let i = 0; i < count; i++) {
    const big = i === 0 && hilly >= 1;
    const hx = big ? (r() < 0.5 ? 25 + r() * 15 : 60 + r() * 15) : 20 + r() * 60;
    const hy = r() < 0.5 ? 8 + r() * 12 : h - 8 - r() * 12;
    const rx = (big ? 14 : 7) + r() * 6, ry = (big ? 10 : 5) + r() * 4, peak = big ? 1 : 0.45 + r() * 0.35;
    F.hills.push({ x: hx, y: hy, rx, ry, rot: r() * Math.PI, peak, big });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const q = F.hills.at(-1), a = Math.cos(q.rot), b = Math.sin(q.rot);
        const u = ((x + 0.5 - hx) * a + (y + 0.5 - hy) * b) / rx, v = (-(x + 0.5 - hx) * b + (y + 0.5 - hy) * a) / ry;
        const d2 = u * u + v * v;
        if (d2 < 1.6) F.height[idx(x, y)] = Math.max(F.height[idx(x, y)], peak * Math.max(0, 1 - d2 / 1.6) ** 1.3);
      }
    }
  }
  if (range && F.hills.length) F.labels.push({ kind: "range", id: range, x: F.hills[0].x, y: F.hills[0].y });

  // 5. Köy: saldırılan sursuz yer ya da yakındaki yerleşim, sahadaki yerinde (yoksa savunanın ardında).
  const at = spec.place ? toField(POS[spec.place]) : null;
  // Meydan muharebesinde yakındaki yerleşim ancak sahanın ortasına düşerse (dizilme yerlerine değil).
  if (at && !spec.attacked && !(at.x > 34 && at.x < 66 && at.y > 8 && at.y < h - 8)) spec = { ...spec, place: null };
  if (spec.place) {
    const vx = spec.attacked ? Math.max(78, Math.min(w - 6, at.x)) : at.x, vy = Math.max(10, Math.min(h - 10, at.y));
    if (!spec.walls) {
      const n = 9 + Math.floor(r() * 6);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = 1.5 + r() * 6;
        const hx = vx + Math.cos(a) * d, hy = vy + Math.sin(a) * d * 1.2;
        if (F.kind[idx(Math.max(0, Math.min(w - 1, hx)), Math.max(0, Math.min(h - 1, hy)))] === WATER) continue;
        const house = { x: hx, y: hy, w: 1.8 + r() * 1.4, h: 1.4 + r(), rot: (r() - 0.5) * 0.8 };
        F.houses.push(house);
        for (let yy = Math.floor(hy - house.h / 2); yy <= hy + house.h / 2; yy++) for (let xx = Math.floor(hx - house.w / 2); xx <= hx + house.w / 2; xx++) set(xx, yy, HOUSE);
      }
    }
    F.labels.push({ kind: "place", id: spec.place, x: vx, y: Math.max(4, vy - 10) });
  }
  F.obstacles = F.kind.some((k) => k === WATER || k === HOUSE);
  return F;
}

/** Nehrin çizgisi kıvrımlı: her 2 birimde bir nokta, dik yönde yumuşak gürültü. */
function meander(pts, r) {
  const out = [];
  const ph = r() * 10, amp = 1.5 + r() * 2;
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / (len || 1), ny = (b.x - a.x) / (len || 1);
    for (let t = 0; t < len; t += 2) {
      const k = Math.sin((s + t) * 0.18 + ph) * amp + Math.sin((s + t) * 0.07 + ph * 2) * amp * 0.8;
      out.push({ x: a.x + ((b.x - a.x) * t) / len + nx * k, y: a.y + ((b.y - a.y) * t) / len + ny * k });
    }
    s += len;
  }
  out.push(pts.at(-1));
  return out;
}

/** Bir çizgi boyunca `width` genişliğinde boya. */
function paint(F, pts, width, kind) {
  const { w, h } = F;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let t = 0; t <= len; t += 0.5) {
      const x = a.x + ((b.x - a.x) * t) / (len || 1), y = a.y + ((b.y - a.y) * t) / (len || 1);
      for (let yy = Math.floor(y - width / 2); yy <= y + width / 2; yy++) {
        for (let xx = Math.floor(x - width / 2); xx <= x + width / 2; xx++) {
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= (width / 2) ** 2) F.kind[yy * w + xx] = kind;
        }
      }
    }
  }
}

/** Yuvarlak bir öbek (orman), suyun ve evin üstüne değil. */
function blob(F, cx, cy, rad, kind, r) {
  const { w, h } = F;
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++) {
    for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const k = F.kind[y * w + x];
      if (k === WATER || k === HOUSE || k === BRIDGE) continue;
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad * (0.75 + r() * 0.5)) F.kind[y * w + x] = kind;
    }
  }
}

/**
 * Köprüler: nehrin sahanın içindeki kısmında, ortaya (iki ordunun arasındaki yol) en yakın noktada bir köprü,
 * nehir uzunsa bir tane daha. Köprü nehre dik, nehrin genişliğinden biraz uzun.
 */
function bridges(F, river, r) {
  const { w, h } = F;
  const inside = river.map((p, i) => ({ p, i })).filter(({ p }) => p.x > 4 && p.x < w - 4 && p.y > 4 && p.y < h - 4);
  if (inside.length < 3) return;
  const byMid = [...inside].sort((a, b) => Math.abs(a.p.y - h / 2) + Math.abs(a.p.x - w / 2) * 0.3 - (Math.abs(b.p.y - h / 2) + Math.abs(b.p.x - w / 2) * 0.3));
  const picks = [byMid[0]];
  const far = inside.filter(({ p }) => Math.hypot(p.x - byMid[0].p.x, p.y - byMid[0].p.y) > 18);
  if (far.length) picks.push(far[Math.floor(r() * far.length)]);
  for (const { i } of picks) {
    const a = river[Math.max(0, i - 1)], b = river[Math.min(river.length - 1, i + 1)];
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
    const len = N.tactics.terrain.riverWidth + 3, half = 1.6;
    const p = river[i];
    F.bridges.push({ x: p.x, y: p.y, a: ang, len, w: half * 2 });
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let t = -len / 2; t <= len / 2; t += 0.4) {
      for (let q = -half; q <= half; q += 0.4) {
        const x = Math.floor(p.x + c * t - s * q), y = Math.floor(p.y + s * t + c * q);
        if (x >= 0 && y >= 0 && x < w && y < h) F.kind[y * w + x] = BRIDGE;
      }
    }
  }
}

/** Yakındaki dağ sırası (yarı genişliği + 0.6 içinde), yoksa null. */
function nearRange(at) {
  let best = null, bd = Infinity;
  for (const m of MOUNTAINS) {
    for (let i = 1; i < m.pts.length; i++) {
      const a = project(m.pts[i - 1][1], m.pts[i - 1][0]), b = project(m.pts[i][1], m.pts[i][0]);
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(a.x + t * dx - at.x, a.y + t * dy - at.y) - m.w;
      if (d < bd) { bd = d; best = m.id; }
    }
  }
  return bd < 0.6 ? best : null;
}

// ---- kuralların okuduğu ----

/** Bir noktadaki hücrenin türü (saha dışı açık sayılır). */
export function kindAt(F, x, y) {
  if (x < 0 || y < 0 || x >= F.w || y >= F.h) return OPEN;
  return F.kind[Math.floor(y) * F.w + Math.floor(x)];
}

/** Bir noktadaki yükseklik (0..1). */
export function heightAt(F, x, y) {
  if (x < 0 || y < 0 || x >= F.w || y >= F.h) return 0;
  return F.height[Math.floor(y) * F.w + Math.floor(x)];
}

/** Yürünebilir mi (su ve ev değil; köprü olur). */
export const passable = (F, x, y) => { const k = kindAt(F, x, y); return k !== WATER && k !== HOUSE; };

/** İki nokta arasında su var mı (köprü dışında): karşı kıyıdaki düşmanla göğüs göğüse dövüşülmez. */
export function waterBetween(F, a, b) {
  for (let t = 0.2; t < 1; t += 0.2) if (kindAt(F, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) === WATER) return true;
  return false;
}

/**
 * Yürüyüş yolu (2 birimlik ızgarada, 8 yönlü, A*): geçilmez hücrelerden kaçar, ormanı pahalı sayar. Dönen:
 * [{ x, y }] (ilk nokta hariç), bulunamazsa düz çizgi [{ goal }].
 */
export function pathOn(F, from, to, mounted = false) {
  if (!F.obstacles) return [to];
  const G = 2, gw = Math.ceil(F.w / G), gh = Math.ceil(F.h / G);
  const node = (x, y) => Math.max(0, Math.min(gh - 1, Math.floor(y / G))) * gw + Math.max(0, Math.min(gw - 1, Math.floor(x / G)));
  const free = (n) => passable(F, (n % gw) * G + G / 2, Math.floor(n / gw) * G + G / 2);
  const slow = (n) => (kindAt(F, (n % gw) * G + G / 2, Math.floor(n / gw) * G + G / 2) === FOREST ? (mounted ? 2.2 : 1.6) : 1);
  const s = node(from.x, from.y), g = node(to.x, to.y);
  if (s === g) return [to];
  const cost = new Float32Array(gw * gh).fill(Infinity), prev = new Int32Array(gw * gh).fill(-1);
  const open = [[0, s]];
  cost[s] = 0;
  const gx = g % gw, gy = Math.floor(g / gw);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, n] = open.splice(bi, 1)[0];
    if (n === g) break;
    const nx = n % gw, ny = Math.floor(n / gw);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = nx + dx, y = ny + dy;
        if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
        const m = y * gw + x;
        if (m !== g && !free(m)) continue;
        const c = cost[n] + Math.hypot(dx, dy) * slow(m);
        if (c >= cost[m]) continue;
        cost[m] = c;
        prev[m] = n;
        open.push([c + Math.hypot(x - gx, y - gy), m]);
      }
    }
  }
  if (prev[g] < 0) return [to];
  const cells = [];
  for (let n = g; n !== s && n >= 0; n = prev[n]) cells.push(n);
  cells.reverse();
  // Düz giden kısımları atla (yalnız dönüş noktaları kalsın).
  const pts = cells.map((n) => ({ x: (n % gw) * G + G / 2, y: Math.floor(n / gw) * G + G / 2 }));
  const out = [];
  let last = from;
  for (let i = 0; i < pts.length - 1; i++) {
    if (clearLine(F, last, pts[i + 1])) continue;
    out.push(pts[i]);
    last = pts[i];
  }
  out.push(to);
  return out;
}

/** İki nokta arası düz yürünebilir mi. */
function clearLine(F, a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.8);
  for (let i = 1; i < n; i++) if (!passable(F, a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false;
  return true;
}

/** Yerleşimin adı için: sahada köy olan yer (etiket). */
export const placeName = (id, lang) => PLACES.find((p) => p.id === id)?.name[lang] ?? id;
