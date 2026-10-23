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
import { N, SHIPS, UNITS, trait } from "./numbers.js";

/**
 * `att`, `def`: { civ, inf, arch, cav, siege, gen?, vet?, terrain?, mods? } (bağımsızın civ'i null; gen:
 * o tarafın generali; vet: tecrübe çarpanı; mods: araştırmanın savaş çarpanları, research.js
 * modsOf; olmayan tür 0 sayılır). `walls`: null | "city" | "castle".
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
  const byAtt = Math.round((a.arch / N.company) * N.volley * archMul(att) * siege * volleyOf(att.gen));
  const byDef = Math.round((d.arch / N.company) * N.volley * archMul(def) * breach(walls === "castle" ? N.castleVolley : 1) * volleyOf(def.gen));
  const chargeA = Math.round((a.cav / N.company) * N.charge * cavMul(att) * (walls ? N.cavWall : 1));
  const chargeD = Math.round((d.cav / N.company) * N.charge * cavMul(def));
  d.arch = Math.max(0, d.arch - chargeA);
  a.arch = Math.max(0, a.arch - chargeD);
  lose(d, byAtt);
  lose(a, byDef);

  // 2. Göğüs göğüse
  // Surculuk (araştırma) savunanın surunu güçlendirir; makineler ve kuşatma ustası onu da söker.
  const wall = breach(walls ? (walls === "castle" ? N.castleWall : N.cityWall) * tech(def, "walls") : 1);
  // Arazi (ground.js): nehir geçen saldıran, dağ geçidini tutan savunan (çarpan dışarıdan gelir).
  const attPow = power(a, att, false, !!walls) * siege * might(att.gen) * (att.vet ?? 1) * (att.terrain ?? 1) * luck[0];
  const defPow = power(d, def, true, false) * wall * might(def.gen) * (def.vet ?? 1) * (def.terrain ?? 1) * luck[1];

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
 * Deniz savaşı: filo filoya. Güç = her türün gemisi x gücü (kadırga 1, trireme 2.5, kinkerem 4)
 * x medeniyetin denizciliği x şans. Kaybeden filonun hepsi batar; kazanan, güçler ne kadar
 * yakınsa o kadar gemi kaybeder, her türden aynı oranda. Eşitlikte savunan.
 * `att`, `def`: { civ, ships, trireme, quinq, fort? }. Dönen: iki tarafın kalan gemileri.
 */
export function naval(att, def, luck = [1, 1]) {
  const a = fleetMight(att) * trait(att.civ, "navy") * tech(att, "navy") * luck[0];
  const d = fleetMight(def) * trait(def.civ, "navy") * tech(def, "navy") * (def.fort ?? 1) * luck[1];
  const attWins = fleetCount(def) === 0 ? fleetCount(att) > 0 : a > d;
  const [win, losePow, winPow] = attWins ? [att, d, a] : [def, a, d];
  const left = pickShips(win);
  sinkShips(left, winPow > 0 ? Math.round(fleetCount(win) * (losePow / winPow) ** 2 * N.winnerLoss) : 0);
  const none = pickShips({});
  return { attWins, att: attWins ? left : none, def: attWins ? none : left };
}

const pickShips = (u) => Object.fromEntries(SHIPS.map((k) => [k, u[k] ?? 0]));
const fleetCount = (u) => SHIPS.reduce((n, k) => n + (u[k] ?? 0), 0);
const fleetMight = (u) => SHIPS.reduce((n, k) => n + (u[k] ?? 0) * N.navy.types[k].might, 0);

/** Bir filodan `n` gemi batar: her türden payına düşeni, artanı en kalabalık türden. */
export function sinkShips(u, n) {
  const total = fleetCount(u);
  n = Math.min(n, total);
  if (n <= 0) return;
  let left = n;
  for (const k of SHIPS) {
    const take = Math.min(u[k] ?? 0, Math.floor((n * (u[k] ?? 0)) / total));
    u[k] -= take;
    left -= take;
  }
  while (left > 0) {
    const k = SHIPS.reduce((m, x) => ((u[x] ?? 0) > (u[m] ?? 0) ? x : m), SHIPS[0]);
    if (!(u[k] > 0)) break;
    u[k] -= 1;
    left -= 1;
  }
}

export function navalOdds(att, def) {
  if (!fleetCount(def)) return "easy";
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
// Bir tarafın çarpanları: milletinin özelliği x araştırması (side.mods).
const tech = (s, k) => s.mods?.[k] ?? 1;
const all = (s) => trait(s.civ, "all") * tech(s, "all");
const archMul = (s) => trait(s.civ, "arch") * tech(s, "arch") * all(s);
const cavMul = (s) => trait(s.civ, "cav") * tech(s, "cav") * all(s);
const infMul = (s, defending) => trait(s.civ, "inf") * tech(s, "inf") * all(s) * (defending ? trait(s.civ, "defInf") : 1);

function power(u, s, defending, assault) {
  const screen = u.inf + u.cav;
  const covered = Math.min(u.arch, screen), bare = u.arch - covered;
  return u.inf * infMul(s, defending)
    + u.cav * N.cavMelee * cavMul(s) * (assault ? N.cavWall : 1)
    + (covered * N.archMelee + bare * N.archBare) * archMul(s);
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

// ---- tecrübe ----

/** Tecrübeden rütbe: 0 Acemi, 1 Kıdemli, 2 Usta, 3 Seçkin. */
export const veteranRank = (xp = 0) => N.veteran.xp.filter((t) => xp >= t).length;

/** Rütbenin savaştaki çarpanı. */
export const veteranMul = (xp = 0) => 1 + veteranRank(xp) * N.veteran.per;

/** Bir sonraki rütbe için gereken tecrübe (en üstteyse null). */
export const nextRankXp = (xp = 0) => N.veteran.xp.find((t) => xp < t) ?? null;

// ---- savaşın dökümü (ekran için) ----

/**
 * Bir savaşı ne çeviriyor: her taraf için [anahtar, değer] listesi (Civilization'ın savaş
 * önizlemesi gibi). Değer bir çarpan (1.25 = +%25); "engines" ise surun bonusunun ne kadarının
 * söküldüğü (0.4 = %40). Sadece etkisi olanlar. Anahtarların yazısı text.js `mods`.
 */
export function explain(att, def, walls) {
  const A = [], D = [];
  const put = (list, key, v) => { if (Math.abs(v - 1) > 1e-6) list.push([key, v]); };
  const units = (u, list, defending) => {
    put(list, "all", trait(u.civ, "all"));
    if ((u.inf ?? 0) > 0) put(list, "inf", trait(u.civ, "inf") * (defending ? trait(u.civ, "defInf") : 1));
    if ((u.arch ?? 0) > 0) put(list, "arch", trait(u.civ, "arch"));
    if ((u.cav ?? 0) > 0) put(list, "cav", trait(u.civ, "cav"));
    // Araştırma: ayrı satırlar (hangi teknolojinin yaradığı görünsün).
    put(list, "techAll", tech(u, "all"));
    if ((u.inf ?? 0) > 0) put(list, "techInf", tech(u, "inf"));
    if ((u.arch ?? 0) > 0) put(list, "techArch", tech(u, "arch"));
    if ((u.cav ?? 0) > 0) put(list, "techCav", tech(u, "cav"));
  };
  put(A, "general", might(att.gen));
  put(A, "veteran", att.vet ?? 1);
  put(A, "river", att.terrain ?? 1);
  units(att, A, false);
  if (walls) {
    put(A, "steppeWalls", trait(att.civ, "siege"));
    if ((att.cav ?? 0) > 0) put(A, "cavWalls", N.cavWall);
    const engines = Math.min(1, ((att.siege ?? 0) / N.company) * N.siegeBreach);
    if (engines > 0) A.push(["engines", engines]);
    if (has(att.gen, "siege")) A.push(["siegeGeneral", 0.5]);
    const breach = (m) => 1 + (m - 1) * (has(att.gen, "siege") ? 0.5 : 1) * (1 - engines);
    const fort = tech(def, "walls") > 1 ? "Tech" : "";
    put(D, (walls === "castle" ? "castleWalls" : "cityWalls") + fort, breach((walls === "castle" ? N.castleWall : N.cityWall) * tech(def, "walls")));
  }
  put(D, "general", might(def.gen));
  put(D, "veteran", def.vet ?? 1);
  put(D, "pass", def.terrain ?? 1);
  units(def, D, true);
  return { att: A, def: D };
}
