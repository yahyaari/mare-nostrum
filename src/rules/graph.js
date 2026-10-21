// Yol ağı: komşular ve en kısa yol. Saf kurallar, DOM yok.
//
// Bir yol bir turdur (Sakalar hariç, onlar iki yol yürür), uzunluğu ne olursa olsun.
// O yüzden en kısa yol, en az yol sayısıdır: genişlik öncelikli arama yeter.

import { PLACES, ROADS } from "../data/world.js";

export const byId = Object.fromEntries(PLACES.map((p) => [p.id, p]));

const links = Object.fromEntries(PLACES.map((p) => [p.id, []]));
for (const r of ROADS) {
  links[r.a].push({ to: r.b, road: r });
  links[r.b].push({ to: r.a, road: r });
}

/** Bir yerleşimden tek yolla gidilen yerler. */
export const neighbours = (id) => links[id].map((l) => l.to);

/** İki yerleşim arasındaki yol, varsa. */
export const roadBetween = (a, b) => links[a].find((l) => l.to === b)?.road ?? null;

/**
 * `from`dan `to`ya en az yollu güzergâh: [from, ..., to]. Gidilemiyorsa null.
 * `canEnter(id)` yolun üstündeki ve sondaki yerleşimlere girilip girilemeyeceğini söyler
 * (tarafsız toprak gibi); başlangıç her zaman serbest. `canUse(road)` bir yolun kullanılıp
 * kullanılamayacağını (gemisi olmayan deniz yolunu kullanamaz).
 */
export function path(from, to, canEnter = () => true, canUse = () => true) {
  if (from === to) return [from];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const at = queue.shift();
    for (const next of neighbours(at)) {
      if (next in prev || !canEnter(next) || !canUse(roadBetween(at, next))) continue;
      prev[next] = at;
      if (next === to) {
        const out = [to];
        for (let p = at; p !== null; p = prev[p]) out.unshift(p);
        return out;
      }
      queue.push(next);
    }
  }
  return null;
}

/** Bir yolun çizilecek noktaları, [boylam, enlem], a'dan b'ye ara noktalarıyla. */
export function roadLine(road) {
  const a = byId[road.a], b = byId[road.b];
  return [[a.lon, a.lat], ...road.via.map(([lat, lon]) => [lon, lat]), [b.lon, b.lat]];
}
