// Otomatik savaş (kurallar.md bölüm 7). Saf hesap: durumu değiştirmez, sonucu döndürür.
//
//   1. Ok yağmuru: iki tarafın okçuları aynı anda atar.
//   2. Göğüs göğüse: güç = piyade + okçu (piyadenin arkasındaysa 0.6, piyadesinden fazlaysa
//      korumasız: 0.25), bonuslarla çarpılır, üstüne ±%10 şans. Büyük güç kazanır.
//   3. Kaybeden dağılır. Kazanan, güçler ne kadar yakınsa o kadar çok kaybeder.
//
// Okçunun yeri: tek başına piyadeye ezilir (korumasız), piyadenin arkasında ise ok yağmuru
// sayesinde aynı sayıda düz piyadeyi yener ve sur arkasında iki kat atar.

import { has, might } from "./generals.js";
import { N, trait } from "./numbers.js";

/**
 * `att`, `def`: { civ, inf, arch, gen? } (bağımsızın civ'i null; gen: o tarafın generali).
 * `walls`: null | "city" | "castle". `luck`: [saldıran, savunan] çarpanları.
 */
export function fight(att, def, walls, luck = [1, 1]) {
  const siege = walls ? trait(att.civ, "siege") : 1;
  const a = { inf: att.inf, arch: att.arch }, d = { inf: def.inf, arch: def.arch };
  // Kuşatma ustası general: surun her bonusu yarıya iner.
  const breach = (m) => (has(att.gen, "siege") ? 1 + (m - 1) * 0.5 : m);
  const volleyOf = (gen) => (has(gen, "archer") ? 1.5 : 1);

  // 1. Ok yağmuru, aynı anda: iki taraf da atmadan önceki okçu sayısıyla atar.
  const byAtt = Math.round((a.arch / N.company) * N.volley * archMul(att.civ) * siege * volleyOf(att.gen));
  const byDef = Math.round((d.arch / N.company) * N.volley * archMul(def.civ) * breach(walls === "castle" ? N.castleVolley : 1) * volleyOf(def.gen));
  lose(d, byAtt);
  lose(a, byDef);

  // 2. Göğüs göğüse
  const wall = breach(walls === "castle" ? N.castleWall : walls === "city" ? N.cityWall : 1);
  const attPow = power(a, att.civ, false) * siege * might(att.gen) * luck[0];
  const defPow = power(d, def.civ, true) * wall * might(def.gen) * luck[1];

  // 3. Sonuç. Savunan kimse kalmadıysa saldıran kayıpsız girer; eşitlikte savunan kazanır.
  const attWins = men(d) === 0 ? men(a) > 0 : attPow > defPow;
  const [win, losePow, winPow] = attWins ? [a, defPow, attPow] : [d, attPow, defPow];
  const toll = winPow > 0 ? Math.round(men(win) * (losePow / winPow) ** 2 * N.winnerLoss) : 0;
  lose(win, toll);
  if (attWins) { d.inf = 0; d.arch = 0; } else { a.inf = 0; a.arch = 0; }

  return { attWins, att: a, def: d, attPow, defPow, volley: { byAtt, byDef } };
}

/**
 * Saldırmadan önce tahmin: en kötü şansla bile kazanıyorsa "easy", en iyi şansla bile
 * kaybediyorsa "hopeless", arası "risky". Kayıplar şanssız (1, 1) hesapla.
 */
export function estimate(att, def, walls) {
  const worst = fight(att, def, walls, [1 - N.luck, 1 + N.luck]);
  const best = fight(att, def, walls, [1 + N.luck, 1 - N.luck]);
  const even = fight(att, def, walls);
  const odds = worst.attWins ? "easy" : best.attWins ? "risky" : "hopeless";
  return { odds, lost: men(att) - men(even.att), killed: men(def) - men(even.def), even };
}

const men = (u) => u.inf + u.arch;
const all = (civ) => trait(civ, "all");
const archMul = (civ) => trait(civ, "arch") * all(civ);
const infMul = (civ, defending) => trait(civ, "inf") * all(civ) * (defending ? trait(civ, "defInf") : 1);

function power(u, civ, defending) {
  const covered = Math.min(u.arch, u.inf), bare = u.arch - covered;
  return u.inf * infMul(civ, defending) + (covered * N.archMelee + bare * N.archBare) * archMul(civ);
}

/** Kayıpları türlere oranla dağıtır. */
function lose(u, n) {
  const total = men(u);
  n = Math.min(n, total);
  if (n <= 0) return;
  const inf = Math.min(u.inf, Math.round((n * u.inf) / total));
  u.inf -= inf;
  u.arch -= Math.min(u.arch, n - inf);
}
