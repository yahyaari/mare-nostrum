// Hava ve gün saati (kurallar.md bölüm 29g; kullanıcı 27.10, önerilerden: "yağmurda okçular zayıf, siste görüş kısa,
// gece saldırısı"). Savaşın yerine ve mevsimine göre: kışın kar yağar, kuzeyde (Galya, Germania) yağmur ve sis
// sık, güneyde (Mısır, Mezopotamya) yağmur az. Aynı tur aynı yerde hava aynıdır: saldırı penceresinin tahmini,
// otomatik savaş ve taktik savaş aynı havayı görür. Saf kurallar, durumu değiştirmez.

import { BOUNDS } from "../data/bounds.js";
import { N } from "./numbers.js";
import { seasonOf } from "./season.js";

const W = () => N.weather;

/** Tura ve yere bağlı, durumu ilerletmeyen bir zar (0..1). */
function hash(a, b, c) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Bir savaşın havası: { sky: "clear" | "rain" | "fog" | "snow", time: "day" | "dawn" | "dusk" | "night" }. */
export function weatherAt(state, at) {
  const lat = BOUNDS.n - at.y, gx = Math.round(at.x * 7), gy = Math.round(at.y * 7);
  const p = { ...W().chance[seasonOf(state.turn) === "winter" ? "winter" : "rest"] };
  if (lat < W().south) { p.rain *= 0.3; p.fog *= 0.5; p.snow = 0; }
  if (lat > W().north) { p.rain *= 1.4; p.fog *= 1.3; p.snow *= 1.5; }
  let r = hash(state.turn, gx, gy), sky = "clear";
  for (const k of ["rain", "fog", "snow"]) { if (r < p[k]) { sky = k; break; } r -= p[k]; }
  let q = hash(gy, state.turn * 3 + 1, gx), time = "day";
  for (const k of ["night", "dawn", "dusk"]) { if (q < W().time[k]) { time = k; break; } q -= W().time[k]; }
  return { sky, time };
}

/** Havanın savaştaki çarpanları (gökyüzü x gün saati): ok, ok menzili, hücum, yürüyüş hızı. */
export function weatherMods(w) {
  const out = { volley: 1, range: 1, charge: 1, speed: 1 };
  if (!w) return out;
  for (const e of [W().effects[w.sky], W().effects[w.time]]) for (const [k, v] of Object.entries(e ?? {})) out[k] *= v;
  return out;
}
