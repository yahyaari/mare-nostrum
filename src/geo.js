// Coğrafya: izdüşüm ve kara/deniz soruları. DOM'a dokunmaz; ekran da test de bunu kullanır,
// yani testin "karada" dediği yer ekranda karada çizilen yerdir.

import { LAND, LAKES } from "./data/geo.js";
import { BOUNDS, LON_SCALE } from "./data/bounds.js";

/**
 * Derece -> harita birimi. Bir birim, 40. paralelde bir enlem derecesi kadar uzunluk.
 * y aşağı doğru büyür (ekran gibi).
 */
export const project = (lon, lat) => ({ x: (lon - BOUNDS.w) * LON_SCALE, y: BOUNDS.n - lat });

export const SIZE = project(BOUNDS.e, BOUNDS.s); // haritanın harita birimi cinsinden eni ve boyu

/** Paketlenmiş [boylam*100, enlem*100, ...] dizisini [[boylam, enlem], ...] yapar. */
export const unpack = (flat) => {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i] / 100, flat[i + 1] / 100]);
  return out;
};

let rings = null, lakes = null;
const load = () => {
  if (!rings) { rings = LAND.map(unpack); lakes = LAKES.map(unpack); }
};

function inRing(lon, lat, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * Karada mı. Halkalar "evenodd" kuralıyla sayılıyor - ekranda nasıl dolduruluyorsa öyle:
 * Hazar gibi delikler bir kez daha sayılınca boşluk oluyor. Göller su.
 */
export function onLand(lon, lat) {
  load();
  let inside = false;
  for (const r of rings) if (inRing(lon, lat, r)) inside = !inside;
  if (!inside) return false;
  return !lakes.some((r) => inRing(lon, lat, r));
}

/** En yakın kıyı çizgisine uzaklık, harita birimi. */
export function coastDistance(lon, lat) {
  load();
  const p = project(lon, lat);
  let best = Infinity;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = project(r[j][0], r[j][1]), b = project(r[i][0], r[i][1]);
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y));
    }
  }
  return best;
}
