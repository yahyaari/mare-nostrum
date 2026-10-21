// Otomatik savaş (kurallar.md bölüm 7). Saf hesap: durumu değiştirmez, sonucu döndürür.
//
//   1. Ok yağmuru ve süvari hücumu, hepsi aynı anda: okçular atar, atlılar oklar havadayken
//      karşı tarafın okçularına dalar. (Hücum yağmurdan sonra gelince okçular atlıların yarısını
//      hücumdan önce öldürüyordu ve süvari tam da okçu ağırlıklı orduya yeniliyordu.)
//   3. Göğüs göğüse: güç = piyade + süvari x1.2 (sura karşı x0.5) + okçu (önünde piyade ya da
//      süvari varsa 0.6, yoksa korumasız: 0.25). Kuşatma makinesi dövüşmez ama surun bonusunu
//      söker. Bonuslarla çarpılır, üstüne ±%10 şans. Büyük güç kazanır.
//   4. Kaybeden dağılır. Kazanan, güçler ne kadar yakınsa o kadar çok kaybeder.
//
// Taş-kâğıt-makas: okçu piyadeyi yıpratır, süvari okçuyu biçer, piyade (ve sur) süvariyi durdurur,
// kuşatma makinesi suru açar.

import { has, might } from "./generals.js";
import { N, UNITS, trait } from "./numbers.js";

/**
 * `att`, `def`: { civ, inf, arch, cav, siege, gen? } (bağımsızın civ'i null; gen: o tarafın
 * generali; olmayan tür 0 sayılır). `walls`: null | "city" | "castle".
 * `luck`: [saldıran, savunan] çarpanları.
 */
export function fight(att, def, walls, luck = [1, 1]) {
  const siege = walls ? trait(att.civ, "siege") : 1;
  const a = pick(att), d = pick(def);
  // Surun bonusunu söken iki şey: kuşatma ustası general (yarıya) ve kuşatma makineleri (her
  // bölük dörtte bir). Sadece SALDIRANIN makineleri; savunmadakiler burada dövüşmüyor.
  const engines = Math.min(1, (a.siege / N.company) * N.siegeBreach);
  const breach = (m) => 1 + (m - 1) * (has(att.gen, "siege") ? 0.5 : 1) * (1 - engines);
  const volleyOf = (gen) => (has(gen, "archer") ? 1.5 : 1);

  // 1. Ok yağmuru ve süvari hücumu, aynı anda: herkes savaştan önceki sayısıyla vurur.
  // Hücum sadece okçuları biçer; sura dalan süvari yarı etkili.
  const byAtt = Math.round((a.arch / N.company) * N.volley * archMul(att.civ) * siege * volleyOf(att.gen));
  const byDef = Math.round((d.arch / N.company) * N.volley * archMul(def.civ) * breach(walls === "castle" ? N.castleVolley : 1) * volleyOf(def.gen));
  const chargeA = Math.round((a.cav / N.company) * N.charge * cavMul(att.civ) * (walls ? N.cavWall : 1));
  const chargeD = Math.round((d.cav / N.company) * N.charge * cavMul(def.civ));
  d.arch = Math.max(0, d.arch - chargeA);
  a.arch = Math.max(0, a.arch - chargeD);
  lose(d, byAtt);
  lose(a, byDef);

  // 2. Göğüs göğüse
  const wall = breach(walls === "castle" ? N.castleWall : walls === "city" ? N.cityWall : 1);
  const attPow = power(a, att.civ, false, !!walls) * siege * might(att.gen) * luck[0];
  const defPow = power(d, def.civ, true, false) * wall * might(def.gen) * luck[1];

  // 3. Sonuç. Savunan kimse kalmadıysa saldıran kayıpsız girer; eşitlikte savunan kazanır.
  // Kuşatma makinesinin mürettebatı tek başına bir yeri alamaz ve savunamaz.
  const fighters = (u) => men(u) - u.siege;
  const attWins = fighters(d) === 0 ? fighters(a) > 0 : attPow > defPow;
  const [win, losePow, winPow] = attWins ? [a, defPow, attPow] : [d, attPow, defPow];
  const toll = winPow > 0 ? Math.round(men(win) * (losePow / winPow) ** 2 * N.winnerLoss) : 0;
  lose(win, toll);
  for (const k of UNITS) (attWins ? d : a)[k] = 0;

  return { attWins, att: a, def: d, attPow, defPow, volley: { byAtt, byDef }, charge: { byAtt: chargeA, byDef: chargeD } };
}

/**
 * Deniz savaşı: gemi gemiye. Güç = gemi x medeniyetin denizciliği x şans. Kaybeden filonun
 * hepsi batar; kazanan, güçler ne kadar yakınsa o kadar gemi kaybeder. Eşitlikte savunan.
 */
export function naval(att, def, luck = [1, 1]) {
  const a = att.ships * trait(att.civ, "navy") * luck[0];
  const d = def.ships * trait(def.civ, "navy") * luck[1];
  const attWins = def.ships === 0 ? att.ships > 0 : a > d;
  const [winShips, losePow, winPow] = attWins ? [att.ships, d, a] : [def.ships, a, d];
  const left = winShips - (winPow > 0 ? Math.round(winShips * (losePow / winPow) ** 2 * N.winnerLoss) : 0);
  return { attWins, att: attWins ? left : 0, def: attWins ? 0 : left };
}

export function navalOdds(att, def) {
  if (!def.ships) return "easy";
  if (naval(att, def, [1 - N.luck, 1 + N.luck]).attWins) return "easy";
  return naval(att, def, [1 + N.luck, 1 - N.luck]).attWins ? "risky" : "hopeless";
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
  return { odds, lost: men(pick(att)) - men(even.att), killed: men(pick(def)) - men(even.def), even };
}

const pick = (u) => Object.fromEntries(UNITS.map((k) => [k, u[k] ?? 0]));
const men = (u) => UNITS.reduce((n, k) => n + (u[k] ?? 0), 0);
const all = (civ) => trait(civ, "all");
const archMul = (civ) => trait(civ, "arch") * all(civ);
const cavMul = (civ) => trait(civ, "cav") * all(civ);
const infMul = (civ, defending) => trait(civ, "inf") * all(civ) * (defending ? trait(civ, "defInf") : 1);

function power(u, civ, defending, assault) {
  const screen = u.inf + u.cav;
  const covered = Math.min(u.arch, screen), bare = u.arch - covered;
  return u.inf * infMul(civ, defending)
    + u.cav * N.cavMelee * cavMul(civ) * (assault ? N.cavWall : 1)
    + (covered * N.archMelee + bare * N.archBare) * archMul(civ);
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
