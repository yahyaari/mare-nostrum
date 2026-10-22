// Savaş (SADE SÜRÜM, kurallar.md): asker sayıları, bir üçgen, sur ve biraz şans. Saf hesap.
//
//   Güç = her tür için  asker x türün gücü x medeniyetin çarpanı x üçgen avantajı
//   Üçgen: piyade süvariyi, süvari okçuyu, okçu piyadeyi yener - yendiği türe karşı x1.5,
//          karşı ordudaki o türün payı kadar (karşı ordu hep süvariyse piyade tam x1.5).
//   Sur:   savunan x1.5; surlara saldıran süvari yarı güç.
//   Sonuç: güçlü olan kazanır (eşitlikte savunan). Kaybedenin hepsi düşer; kazanan, güçler ne
//          kadar yakınsa o kadar kayıp verir.

import { N, UNITS, trait } from "./numbers.js";

const men = (u) => UNITS.reduce((n, k) => n + (u[k] ?? 0), 0);
const pick = (u) => Object.fromEntries(UNITS.map((k) => [k, u[k] ?? 0]));
const share = (u, k) => { const t = men(u); return t ? (u[k] ?? 0) / t : 0; };

/** Hangi tür hangisini yener. */
export const BEATS = { inf: "cav", cav: "arch", arch: "inf" };

/**
 * Bir tarafın gücü, karşısındaki orduya göre. `side`, `foe`: { civ, inf, arch, cav }.
 * `o.defending`: savunan mı; `o.walls`: surlu yer mi.
 */
export function power(side, foe, o = {}) {
  let p = 0;
  for (const k of UNITS) {
    let v = (side[k] ?? 0) * N.power[k] * trait(side.civ, k) * (1 + N.edge * share(foe, BEATS[k]));
    if (k === "cav" && o.walls && !o.defending) v *= N.cavWall;
    p += v;
  }
  if (o.defending) p *= trait(side.civ, "defend") * (o.walls ? N.walls : 1);
  return p;
}

/**
 * Savaş. `att`, `def`: { civ, inf, arch, cav } (bağımsızın civ'i null). `walls`: sur var mı.
 * `luck`: [saldıran, savunan] çarpanları. Dönen: kazanan ve iki tarafın kalanları.
 */
export function fight(att, def, walls, luck = [1, 1]) {
  const attPow = power(att, def, { walls }) * luck[0];
  const defPow = power(def, att, { defending: true, walls }) * luck[1];
  const a = pick(att), d = pick(def);
  const attWins = men(d) === 0 ? men(a) > 0 : attPow > defPow;
  const [win, losePow, winPow] = attWins ? [a, defPow, attPow] : [d, attPow, defPow];
  const toll = winPow > 0 ? Math.round(men(win) * (losePow / winPow) ** 2 * N.winnerLoss) : 0;
  lose(win, toll);
  for (const k of UNITS) (attWins ? d : a)[k] = 0;
  return { attWins, att: a, def: d, attPow, defPow };
}

/**
 * Saldırmadan önce tahmin: en kötü şansla bile kazanıyorsa "easy", en iyi şansla bile
 * kaybediyorsa "hopeless", arası "risky". Kayıplar şanssız hesapla.
 */
export function estimate(att, def, walls) {
  const worst = fight(att, def, walls, [1 - N.luck, 1 + N.luck]);
  const best = fight(att, def, walls, [1 + N.luck, 1 - N.luck]);
  const even = fight(att, def, walls);
  const odds = worst.attWins ? "easy" : best.attWins ? "risky" : "hopeless";
  return { odds, lost: men(pick(att)) - men(even.att), killed: men(pick(def)) - men(even.def), even };
}

/** Kayıpları türlere oranla dağıtır (yuvarlamadan artan, en kalabalık türden düşer). */
function lose(u, n) {
  const total = men(u);
  n = Math.min(n, total);
  if (n <= 0) return;
  let left = n;
  for (const k of UNITS) {
    const take = Math.min(u[k], Math.floor((n * u[k]) / total));
    u[k] -= take;
    left -= take;
  }
  while (left > 0) {
    const k = UNITS.reduce((m, x) => (u[x] > u[m] ? x : m), UNITS[0]);
    if (u[k] <= 0) break;
    u[k] -= 1;
    left -= 1;
  }
}
