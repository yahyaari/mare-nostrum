// Bölüklerin dinlenince dolması (kurallar.md bölüm 6c; kullanıcı 26.10 strateji oyunlarının olmazsa
// olmazlarından, Total War gibi). Savaşta eriyen bölük (kartı 10'dan az) kendi topraklarında dinlenince
// toparlanır: kendi yerleşiminin garnizonu, ya da kendi yerleşiminde, kapısında veya kendi toprağında bu
// tur hiç yürümemiş, savaşmamış ordu. Her türün yarım bölüğü turda N.refill.men asker kazanır (bölüğü
// tamamlayana kadar); askerler o yerin nüfusundan gelir (en az N.refill.keep kişi kalır). Kuşatılan yerde
// ve ambar boşken toparlanma yok. Yok olan bölük geri gelmez - yenisi basılır.

import { N, UNITS } from "./numbers.js";
import { cellOf, regionOf } from "./map.js";
import { besieged, isHuman } from "./state.js";
import { mpMax } from "./moves.js";

/**
 * Bir garnizonun (`id`: yerleşimi) ya da ordunun dinlendiği yer - nüfusunu veren kendi yerleşimi;
 * dinlenmiyorsa null. Ordu: bu tur yürümemiş (hareketi dolu), kuşatmıyor, kendi toprağında.
 */
export function restPlace(state, u, id = null) {
  if (!u.owner) return null;
  let at = id;
  if (!at) {
    if (u.besieging || (u.mp ?? 0) < mpMax(u) - 1e-6) return null;
    at = u.at ?? regionOf(cellOf(u.x, u.y));
  }
  const pl = at ? state.places[at] : null;
  if (!pl || pl.owner !== u.owner || besieged(state, at)) return null;
  if ((state.civs[u.owner]?.food ?? 0) < 1) return null;
  return at;
}

/** Bir türün yarım bölüğünü tamamlamaya kaç asker eksik. */
const missing = (n) => (n % N.company ? N.company - (n % N.company) : 0);

/** Tur sonu: dinlenen garnizonlar ve ordular toparlanır. Oyuncuya kaç asker kazandığı habere. */
export function replenish(state, events) {
  const gained = {};
  const fill = (u, at) => {
    const pl = state.places[at];
    for (const k of UNITS) {
      const n = Math.min(missing(u[k] ?? 0), N.refill.men, Math.max(0, Math.floor(pl.pop - N.refill.keep)));
      if (n <= 0) continue;
      u[k] += n;
      pl.pop -= n;
      gained[u.owner] = (gained[u.owner] ?? 0) + n;
    }
  };
  for (const [id, pl] of Object.entries(state.places)) if (restPlace(state, pl, id)) fill(pl, id);
  for (const a of state.armies) {
    const at = restPlace(state, a);
    if (!at) continue;
    const before = UNITS.reduce((n, k) => n + (a[k] ?? 0), 0);
    fill(a, at);
    // Donanımsız acemiler katıldı: donanım askerlere göre incelir (bölüm 6d).
    const after = UNITS.reduce((n, k) => n + (a[k] ?? 0), 0);
    if (a.gear && after > before) for (const k of Object.keys(a.gear)) a.gear[k] = Math.round(((a.gear[k] * before) / after) * 100) / 100;
  }
  for (const [civ, men] of Object.entries(gained)) if (isHuman(state, civ)) events.push({ type: "refill", turn: state.turn, civ, men });
}
