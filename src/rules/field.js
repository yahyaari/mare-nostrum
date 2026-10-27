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

export const OPEN = 0, WATER = 1, FOREST = 2, BRIDGE = 3, HOUSE = 4, WALL = 5;

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
    if (!spec.walls) F.labels.push({ kind: "place", id: spec.place, x: vx, y: Math.max(4, vy - 10) });
  }
  // 6. Surlu şehir (kullanıcı 27.10, kuşatma görselleri: "şehirlerin surlarla etrafı çevrili"): sahanın ortasında
  // dört yanı surlu bir şehir, yerleşimin sahadaki yerinde; deniz kıyısındaysa deniz tarafı suyla kapalı.
  if (spec.walls) {
    const p = at ?? { x: w * 0.68, y: h / 2 };
    const C = addCity(F, spec.walls, p.x, p.y, r);
    if (spec.place) F.labels.push({ kind: "place", id: spec.place, x: C.cx, y: Math.max(3, C.y0 - 3.5) });
  }
  F.obstacles = F.kind.some((k) => k === WATER || k === HOUSE || k === WALL);
  return F;
}

// ---- surlu şehir ----

/**
 * Şehri sahaya koy: dikdörtgen sur (kale küçük), içinde ana caddeler, evler ve ortada kale (saray); her yanın
 * ortasında kapı. Sur hücreleri WALL (geçilmez - merdivenle tırmanılır, gedikten geçilir); suyun üstüne sur
 * çekilmez. Şehrin içi ve çevresi ormansız. `F.city`: { x0, y0, x1, y1, cx, cy, houses, streets, keep, gates }.
 */
export function addCity(F, walls, px, py, r = rng(7)) {
  const { w, h } = F;
  const big = walls !== "castle";
  const hx = big ? 15 : 11, hy = big ? 13 : 10;
  const idx0 = (x, y) => Math.floor(y) * w + Math.floor(x);
  // Kıyıda: şehir yerleşimin yakınında, içi en çok karada kalacak yere kayar (Siraküza denize düşüyordu).
  const fit = (x, y) => ({ x: Math.max(40 + hx, Math.min(w - 4 - hx, x)), y: Math.max(hy + 4, Math.min(h - hy - 4, y)) });
  const landShare = (c) => {
    let n = 0, l = 0;
    for (let y = c.y - hy; y <= c.y + hy; y += 2) for (let x = c.x - hx; x <= c.x + hx; x += 2) { n++; if (F.kind[idx0(x, y)] !== WATER) l++; }
    return l / n;
  };
  let best = fit(px, py), bestScore = -Infinity;
  for (let dy = -14; dy <= 14; dy += 3.5) {
    for (let dx = -14; dx <= 14; dx += 3.5) {
      const c = fit(px + dx, py + dy), share = landShare(c);
      const score = Math.min(share, 0.88) * 100 - Math.hypot(c.x - px, c.y - py) * 0.4;
      if (score > bestScore) { bestScore = score; best = c; }
    }
  }
  const cx = best.x, cy = best.y;
  const C = { x0: cx - hx, y0: cy - hy, x1: cx + hx, y1: cy + hy, cx, cy, houses: [], streets: [], keep: null, gates: [], big };
  const idx = (x, y) => Math.floor(y) * w + Math.floor(x);
  const water = (x, y) => x >= 0 && y >= 0 && x < w && y < h && F.kind[idx(x, y)] === WATER;
  // Orman: şehrin içinden ve 4 birim çevresinden kalkar.
  for (let y = Math.max(0, Math.floor(C.y0 - 4)); y < Math.min(h, C.y1 + 4); y++) for (let x = Math.max(0, Math.floor(C.x0 - 4)); x < Math.min(w, C.x1 + 4); x++) if (F.kind[idx(x, y)] === FOREST) F.kind[idx(x, y)] = OPEN;
  // Sur: dikdörtgenin kenarından 1 birim içeri ve dışarı.
  for (let y = Math.floor(C.y0 - 1); y <= C.y1 + 1; y++) {
    for (let x = Math.floor(C.x0 - 1); x <= C.x1 + 1; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || water(x + 0.5, y + 0.5)) continue;
      const qx = x + 0.5, qy = y + 0.5;
      const onX = Math.abs(qx - C.x0) <= 1 || Math.abs(qx - C.x1) <= 1, onY = Math.abs(qy - C.y0) <= 1 || Math.abs(qy - C.y1) <= 1;
      const within = qx >= C.x0 - 1 && qx <= C.x1 + 1 && qy >= C.y0 - 1 && qy <= C.y1 + 1;
      if (within && ((onX && qy >= C.y0 - 1 && qy <= C.y1 + 1) || (onY && qx >= C.x0 - 1 && qx <= C.x1 + 1))) F.kind[idx(x, y)] = WALL;
    }
  }
  // Kapılar: her yanın ortasında (suyun üstünde değilse).
  for (const s of SIDES) {
    const g = sidePoint(C, s, 0.5);
    if (!water(g.x, g.y)) C.gates.push({ ...g, side: s });
  }
  // Ana caddeler: kapılardan ortaya; yan sokaklar.
  C.streets.push([{ x: C.x0, y: cy }, { x: C.x1, y: cy }], [{ x: cx, y: C.y0 }, { x: cx, y: C.y1 }]);
  for (const t of [0.27, 0.73]) {
    if (r() < 0.8) C.streets.push([{ x: C.x0 + 2, y: C.y0 + (C.y1 - C.y0) * t }, { x: C.x1 - 2, y: C.y0 + (C.y1 - C.y0) * t + (r() - 0.5) * 2 }]);
    if (r() < 0.8) C.streets.push([{ x: C.x0 + (C.x1 - C.x0) * t, y: C.y0 + 2 }, { x: C.x0 + (C.x1 - C.x0) * t + (r() - 0.5) * 2, y: C.y1 - 2 }]);
  }
  // Kale (saray): ortanın yanında, büyük.
  C.keep = { x: cx + (r() < 0.5 ? -1 : 1) * hx * 0.38, y: cy + (r() < 0.5 ? -1 : 1) * hy * 0.32, w: big ? 6 : 4.5, h: big ? 4.6 : 3.6 };
  // Kale suya düştüyse şehrin karadaki bir köşesine.
  if (water(C.keep.x, C.keep.y)) {
    const spots = [[-0.4, -0.35], [0.4, -0.35], [-0.4, 0.35], [0.4, 0.35], [0, 0], [-0.2, 0], [0.2, 0]].map(([a, c]) => ({ x: cx + a * hx * 1.8, y: cy + c * hy * 1.8 }));
    const land = spots.find((p) => !water(p.x, p.y));
    if (land) Object.assign(C.keep, land);
    else C.keep = null;
  }
  // Evler: sokakların ve kalenin dışında, gevşek bir ızgarada.
  const nearStreet = (x, y) => C.streets.some(([a, b]) => segDist({ x, y }, a, b) < 1.3);
  for (let y = C.y0 + 2.2; y < C.y1 - 1.6; y += 2.8) {
    for (let x = C.x0 + 2.2; x < C.x1 - 1.6; x += 3) {
      const hx2 = x + (r() - 0.5) * 1.2, hy2 = y + (r() - 0.5) * 1.2;
      if (r() < 0.22 || nearStreet(hx2, hy2) || water(hx2, hy2)) continue;
      if (C.keep && Math.abs(hx2 - C.keep.x) < C.keep.w / 2 + 1.6 && Math.abs(hy2 - C.keep.y) < C.keep.h / 2 + 1.6) continue;
      C.houses.push({ x: hx2, y: hy2, w: 1.4 + r() * 1.1, h: 1.1 + r() * 0.8, rot: (r() - 0.5) * 0.7, tone: r() });
    }
  }
  F.city = C;
  F.obstacles = true;
  return C;
}

const SIDES = ["W", "N", "S", "E"];
const NORMAL = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };

/** Şehrin bir yanında, `t` (0..1) oranındaki nokta ve yanın dışa bakan yönü. */
export function sidePoint(C, s, t) {
  const [nx, ny] = NORMAL[s];
  if (s === "W" || s === "E") return { x: s === "W" ? C.x0 : C.x1, y: C.y0 + (C.y1 - C.y0) * t, nx, ny, side: s };
  return { x: C.x0 + (C.x1 - C.x0) * t, y: s === "N" ? C.y0 : C.y1, nx, ny, side: s };
}

/** Şehrin içinde mi. */
export const insideCity = (C, p) => p.x > C.x0 && p.x < C.x1 && p.y > C.y0 && p.y < C.y1;

/** Sura en yakın nokta: { x, y, nx, ny (dışa), side, d (uzaklık), t (yan boyunca oran) }. */
export function wallPoint(C, p) {
  let best = null;
  for (const s of SIDES) {
    const vertical = s === "W" || s === "E";
    const t = vertical ? (p.y - C.y0) / (C.y1 - C.y0) : (p.x - C.x0) / (C.x1 - C.x0);
    const q = sidePoint(C, s, Math.max(0, Math.min(1, t)));
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (!best || d < best.d) best = { ...q, d, t: Math.max(0, Math.min(1, t)) };
  }
  return best;
}

/** Bu noktada sur var mı (su değil, gedik değil). */
export const wallAt = (F, q) => kindAt(F, q.x - q.nx * 0.5, q.y - q.ny * 0.5) === WALL || kindAt(F, q.x + q.nx * 0.5, q.y + q.ny * 0.5) === WALL;

/** Surun bir yanının ne kadarı karada (suyun üstünde sur yok). */
export function wallShare(F, C, s) {
  let n = 0;
  for (let i = 1; i < 10; i++) if (wallAt(F, sidePoint(C, s, i / 10))) n++;
  return n / 9;
}

/** Gedik aç: surun `q` noktasında, yan boyunca `half` kadar iki yana (hücreler açılır). */
export function breach(F, q, half) {
  const { w, h } = F;
  for (let y = Math.floor(q.y - half - 2); y <= q.y + half + 2; y++) {
    for (let x = Math.floor(q.x - half - 2); x <= q.x + half + 2; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || F.kind[y * w + x] !== WALL) continue;
      const along = q.nx ? Math.abs(y + 0.5 - q.y) : Math.abs(x + 0.5 - q.x), across = q.nx ? Math.abs(x + 0.5 - q.x) : Math.abs(y + 0.5 - q.y);
      if (along <= half && across <= 1.6) F.kind[y * w + x] = OPEN;
    }
  }
  F.rev = (F.rev ?? 0) + 1;
}

/** Noktanın doğru parçasına uzaklığı. */
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
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

/** Yürünebilir mi (su, ev ve sur değil; köprü olur). */
export const passable = (F, x, y) => { const k = kindAt(F, x, y); return k !== WATER && k !== HOUSE && k !== WALL; };
/** Türüne göre geçilmez hücre. */
const BLOCK = [false, true, false, false, true, true];

/**
 * Sahanın yol ızgaraları (hücre başına; saha değişince - gedik - yeniden): `clear` en yakın geçilmez hücreye ya da
 * saha kenarına uzaklık; `region` birbirine yürünerek varılan bölgenin numarası (geçilmezde -1); `main` şehrin
 * dışındaki en büyük bölge (ordular burada dizilir: suyla çevrili küçük bir cebe değil).
 */
function grids(F) {
  if (F.grid && F.grid.kind === F.kind && F.grid.rev === (F.rev ?? 0)) return F.grid;
  const { w, h } = F, n = w * h, D = Math.SQRT2;
  const clear = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i / w) | 0;
    clear[i] = BLOCK[F.kind[i]] ? 0 : Math.min(x, y, w - 1 - x, h - 1 - y) + 1;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = clear[i];
      if (x > 0) v = Math.min(v, clear[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, clear[i - w] + 1);
        if (x > 0) v = Math.min(v, clear[i - w - 1] + D);
        if (x < w - 1) v = Math.min(v, clear[i - w + 1] + D);
      }
      clear[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = clear[i];
      if (x < w - 1) v = Math.min(v, clear[i + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, clear[i + w] + 1);
        if (x < w - 1) v = Math.min(v, clear[i + w + 1] + D);
        if (x > 0) v = Math.min(v, clear[i + w - 1] + D);
      }
      clear[i] = v;
    }
  }
  const region = new Int32Array(n).fill(-1), size = [];
  const C = F.city;
  for (let i = 0; i < n; i++) {
    if (BLOCK[F.kind[i]] || region[i] >= 0) continue;
    const id = size.length, stack = [i];
    let k = 0;
    region[i] = id;
    while (stack.length) {
      const c = stack.pop(), x = c % w, y = (c / w) | 0;
      if (!C || !insideCity(C, { x: x + 0.5, y: y + 0.5 })) k++;
      for (const m of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1]) {
        if (m < 0 || BLOCK[F.kind[m]] || region[m] >= 0) continue;
        region[m] = id;
        stack.push(m);
      }
    }
    size.push(k);
  }
  const main = size.indexOf(Math.max(...size));
  F.grid = { kind: F.kind, rev: F.rev ?? 0, clear, region, main };
  return F.grid;
}

const cellAt = (F, p) => Math.max(0, Math.min(F.h - 1, Math.floor(p.y))) * F.w + Math.max(0, Math.min(F.w - 1, Math.floor(p.x)));

/** Bu nokta ordunun dizilebileceği ana bölgede mi (suyla çevrili cepte, şehrin içinde değil). */
export function onMain(F, x, y) {
  if (!F.obstacles) return true;
  const G = grids(F), i = cellAt(F, { x, y });
  return !BLOCK[F.kind[i]] && G.region[i] === G.main;
}

/** Ana bölgede `p`ye en yakın yer (dizilişte yakında kara bulunamazsa). */
export function nearestMain(F, p) {
  const G = grids(F);
  let best = null, bd = Infinity;
  for (let i = 0; i < F.w * F.h; i++) {
    if (G.region[i] !== G.main) continue;
    const x = (i % F.w) + 0.5, y = ((i / F.w) | 0) + 0.5, d = Math.hypot(x - p.x, y - p.y);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best ?? { x: p.x, y: p.y };
}

/** `p`ye en yakın yürünebilir yer, `from`un bölgesinde (suya ya da sura verilen emir kıyıya, surun bu yanına). */
export function nearestOpen(F, p, from = p) {
  const G = grids(F), want = G.region[cellAt(F, from)];
  const px = Math.floor(p.x), py = Math.floor(p.y);
  let best = null, bd = Infinity;
  for (let r = 0; r <= 16 && !best; r++) {
    for (let y = py - r; y <= py + r; y++) {
      for (let x = px - r; x <= px + r; x++) {
        if (Math.max(Math.abs(x - px), Math.abs(y - py)) !== r || x < 0 || y < 0 || x >= F.w || y >= F.h) continue;
        const i = y * F.w + x;
        if (BLOCK[F.kind[i]] || (want >= 0 && G.region[i] !== want)) continue;
        const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
        if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
      }
    }
  }
  return best ?? { x: p.x, y: p.y };
}

/** İki nokta arasında su var mı (köprü dışında): karşı kıyıdaki düşmanla göğüs göğüse dövüşülmez. */
export function waterBetween(F, a, b) {
  for (let t = 0.2; t < 1; t += 0.2) if (kindAt(F, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t) === WATER) return true;
  return false;
}

/**
 * Doğru parçasının geçtiği her hücre (köşeden geçerken iki yanındaki de): `f(hücre, t)` (t: parçanın 0..1'i, hücreye
 * girdiği yer) false dönerse durur ve false döner. Saha dışı geçilir.
 */
function alongLine(F, a, b, f) {
  const { w, h } = F, dx = b.x - a.x, dy = b.y - a.y;
  let x = Math.floor(a.x), y = Math.floor(a.y);
  const x1 = Math.floor(b.x), y1 = Math.floor(b.y), sx = Math.sign(dx), sy = Math.sign(dy);
  const tdx = dx ? 1 / Math.abs(dx) : Infinity, tdy = dy ? 1 / Math.abs(dy) : Infinity;
  let tx = dx ? (sx > 0 ? x + 1 - a.x : a.x - x) * tdx : Infinity, ty = dy ? (sy > 0 ? y + 1 - a.y : a.y - y) * tdy : Infinity;
  const at = (cx, cy, t) => cx < 0 || cy < 0 || cx >= w || cy >= h || f(cy * w + cx, Math.min(1, t));
  if (!at(x, y, 0)) return false;
  for (let k = Math.abs(x1 - x) + Math.abs(y1 - y); k > 0; k--) {
    if (Math.abs(tx - ty) < 1e-9) {
      if (!at(x + sx, y, tx) || !at(x, y + sy, ty)) return false;
      x += sx; y += sy; k--;
      const t = tx;
      tx += tdx; ty += tdy;
      if (!at(x, y, t)) return false;
    } else if (tx < ty) {
      x += sx;
      if (!at(x, y, tx)) return false;
      tx += tdx;
    } else {
      y += sy;
      if (!at(x, y, ty)) return false;
      ty += tdy;
    }
  }
  return true;
}

/** İki nokta arası düz yürünebilir mi (geçtiği her hücre). */
export const lineFree = (F, a, b) => alongLine(F, a, b, (i) => !BLOCK[F.kind[i]]);

// A* için yeniden kullanılan diziler.
let AS = null;

/**
 * Yürüyüş yolu (1 birimlik hücrelerde, 8 yönlü, köşeden kesmeden, A*): geçilmez hücrelerden kaçar, ormanı pahalı
 * sayar; `want` (birliğin yarı genişliği) verilirse engele ondan yakın hücreler pahalı - dar geçidin ortasından,
 * kıyıya ve sura yapışmadan gider (kullanıcı 27.10: "nehir kenarında takılıyor; daralan geçitte tam ortadan
 * gitsin"). Varılamayan hedefe (suyun ötesi, surun içi) bu yandaki en yakın yere, sonra hedefe doğru. Dönen:
 * [{ x, y }] (bulunulan yer hariç, son nokta hedef).
 */
export function pathOn(F, from, to, mounted = false, want = 0) {
  if (!F.obstacles) return [to];
  const P = N.tactics.path, { w, h } = F, n = w * h, G = grids(F), { clear, region } = G;
  want = Math.min(P.want, Math.max(0, want));
  // Kestirme: geçtiği her hücre yürünür ve engelden iki ucunun uzaklığı kadar (en çok `want`) uzak.
  const roomy = (a, c) => {
    const ca = Math.min(want, clear[cellAt(F, a)]), cc = Math.min(want, clear[cellAt(F, c)]);
    return alongLine(F, a, c, (i, t) => !BLOCK[F.kind[i]] && clear[i] >= ca + (cc - ca) * t - P.slack);
  };
  if (roomy(from, to)) return [to];
  let s = cellAt(F, from), g = cellAt(F, to);
  if (BLOCK[F.kind[s]]) s = cellAt(F, nearestOpen(F, from));
  if (BLOCK[F.kind[s]]) return [to];
  // Hedef başka bölgedeyse: bu bölgede hedefe en yakın hücreye.
  const reach = !BLOCK[F.kind[g]] && region[g] === region[s];
  if (!reach) {
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (region[i] !== region[s]) continue;
      const d = Math.hypot((i % w) + 0.5 - to.x, ((i / w) | 0) + 0.5 - to.y);
      if (d < bd) { bd = d; g = i; }
    }
  }
  if (s === g) return [to];
  if (!AS || AS.cost.length !== n) AS = { cost: new Float32Array(n), prev: new Int32Array(n), stamp: new Int32Array(n), gen: 0, hp: [], hn: [] };
  const A = AS;
  A.gen++;
  const { cost, prev, stamp } = A, hp = A.hp, hn = A.hn;
  hp.length = 0; hn.length = 0;
  const push = (p, v) => {
    let i = hp.length;
    hp.push(p); hn.push(v);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (hp[up] <= p) break;
      hp[i] = hp[up]; hn[i] = hn[up]; hp[up] = p; hn[up] = v; i = up;
    }
  };
  const pop = () => {
    const top = hn[0], lp = hp.pop(), ln = hn.pop();
    if (hp.length) {
      let i = 0;
      hp[0] = lp; hn[0] = ln;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < hp.length && hp[l] < hp[m]) m = l;
        if (r < hp.length && hp[r] < hp[m]) m = r;
        if (m === i) break;
        [hp[i], hp[m]] = [hp[m], hp[i]];
        [hn[i], hn[m]] = [hn[m], hn[i]];
        i = m;
      }
    }
    return top;
  };
  const gx = (g % w) + 0.5, gy = ((g / w) | 0) + 0.5;
  stamp[s] = A.gen; cost[s] = 0; prev[s] = -1;
  push(0, s);
  while (hp.length) {
    const c = pop();
    if (c === g) break;
    const cx = c % w, cy = (c / w) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const m = y * w + x;
        if (BLOCK[F.kind[m]]) continue;
        // Çaprazda köşeden kesmez: iki yanı da açık olmalı.
        if (dx && dy && (BLOCK[F.kind[cy * w + x]] || BLOCK[F.kind[y * w + cx]])) continue;
        const pinch = want > 0 ? 1 + (P.pinch * Math.max(0, want - clear[m])) / want : 1;
        const v = cost[c] + (dx && dy ? Math.SQRT2 : 1) * (F.kind[m] === FOREST ? (mounted ? 2.2 : 1.6) : 1) * pinch;
        if (stamp[m] === A.gen && v >= cost[m]) continue;
        stamp[m] = A.gen; cost[m] = v; prev[m] = c;
        push(v + Math.hypot(x + 0.5 - gx, y + 0.5 - gy), m);
      }
    }
  }
  if (stamp[g] !== A.gen) return [to];
  const cells = [];
  for (let c = g; c !== s && c >= 0; c = prev[c]) cells.push(c);
  cells.reverse();
  // Düz giden kısımları atla (yalnız dönüş noktaları kalsın); kestirme engele yolun kendisinden yakın geçmez.
  const pts = cells.map((c) => ({ x: (c % w) + 0.5, y: ((c / w) | 0) + 0.5 }));
  if (reach) pts[pts.length - 1] = to;
  const out = [];
  let last = from;
  for (let i = 0; i < pts.length - 1; i++) {
    if (roomy(last, pts[i + 1])) continue;
    out.push(pts[i]);
    last = pts[i];
  }
  out.push(pts.at(-1));
  if (!reach) out.push(to);
  return out;
}

/** Yerleşimin adı için: sahada köy olan yer (etiket). */
export const placeName = (id, lang) => PLACES.find((p) => p.id === id)?.name[lang] ?? id;
