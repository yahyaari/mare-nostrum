// Arazi (kurallar.md bölüm 22): nehir geçen yoldan saldıran zayıf vurur, dağ geçidini savunan
// güçlü durur.
//
// Nehirler harita verisinden (Natural Earth, src/data/geo.js) hesaplanır: kara yolunun çizgisi
// bir nehri kesiyorsa nehir geçişidir. Yolun iki ucuna 0.3 dereceden yakın kesişmeler sayılmaz:
// nehir kıyısındaki şehirlerin (Babil, Roma, Memphis) yolları hemen kapıda nehri "kesiyordu".
// Geçitler elle: tarihte bilinen dağ yolları.

import { RIVERS } from "../data/geo.js";
import { ROADS } from "../data/world.js";
import { roadLine } from "./graph.js";

const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const PASSES = new Set([
  ["numantia", "gergovia"], // Pireneler
  ["bibracte", "mediolanum"], // Alpler
  ["massalia", "mediolanum"], // Deniz Alpleri
  ["ariminum", "rome"], // Apeninler
  ["epidamnos", "pella"], // Pindos
  ["demetrias", "athens"], // Thermopylai
  ["mazaka", "antioch"], // Kilikya Kapıları (Toroslar)
  ["babylon", "ecbatana"], // Zagroslar
  ["ecbatana", "artaxata"], // Ermeni yaylası
  ["mazaka", "artaxata"], // Ermeni yaylası
  ["artaxata", "tanais"], // Kafkaslar
  ["rhagae", "hecatompylos"], // Hazar Kapıları
].map(([a, b]) => key(a, b)));

const NEAR = 0.3;

/** İki doğru parçasının kesişimi ([lon, lat]) ya da null. */
function cross(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

let fords = null;
/** Nehir geçen kara yolları: yol anahtarı -> geçiş noktası [lon, lat]. Bir kere hesaplanır. */
export function crossings() {
  if (fords) return fords;
  fords = {};
  const segs = [];
  for (const r of RIVERS) for (let i = 2; i < r.length; i += 2) segs.push([[r[i - 2] / 100, r[i - 1] / 100], [r[i] / 100, r[i + 1] / 100]]);
  for (const road of ROADS) {
    if (road.sea) continue;
    const pts = roadLine(road);
    const a = pts[0], b = pts[pts.length - 1];
    const far = (p) => Math.hypot(p[0] - a[0], p[1] - a[1]) > NEAR && Math.hypot(p[0] - b[0], p[1] - b[1]) > NEAR;
    found: for (let i = 1; i < pts.length; i++) {
      for (const [s0, s1] of segs) {
        const p = cross(pts[i - 1], pts[i], s0, s1);
        if (p && far(p)) { fords[key(road.a, road.b)] = p; break found; }
      }
    }
  }
  return fords;
}

/** İki komşu yer arasındaki yolun arazisi. */
export const groundOf = (a, b) => ({ river: !!crossings()[key(a, b)], pass: PASSES.has(key(a, b)) });
