// Ordu hareketi ve saldırı (kurallar.md bölüm 6-7). Saf kurallar, DOM yok.
//
// Serbest yürüyüş (kullanıcı 22.10): ordu haritanın her yerinde durabilir - yeri (a.x, a.y)
// harita biriminde; bir yerleşimin içindeyse a.at o yer, değilse null. Her tur hareket puanı
// (a.mp, N.march.mp; Sakalar iki katı) harcayarak kareden kareye yürür (map.js). Uzaktaki bir
// yere gönderilen ordu kalan yolunu (a.route: kareler) saklar ve her tur kendiliğinden ilerler.
// Savaştığı birinin ordusunun önüne gelince durur ("önünü kesti", N.reach.zoc). Saldırı - bir
// yerleşime ya da yerleşimin dışındaki bir orduya (meydan muharebesi) - her zaman açık bir
// emirdir ve ancak menzilden (N.reach.strike) yapılır.

import { CIVS, PLACES, ROADS } from "../data/world.js";
import { estimate, fight, naval, navalOdds, sinkShips, veteranMul, veteranRank } from "./combat.js";
import { byId, roadLine } from "./graph.js";
import { bestAt, bury, has, learn } from "./generals.js";
import { N, SHIPS, UNITS, trait } from "./numbers.js";
import { between, random } from "./rng.js";
import { armiesAt, armyById, canSail, empty, fleetOf, info, isHuman, men, placesOf, relation, shipsOnly } from "./state.js";
import { holds } from "./wonders.js";
import { groundOf } from "./ground.js";
import { isWinter } from "./season.js";
import { CELL, H, PLACE_CELL, POS, W, around, cellOf, centre, dist, field, isLand, isMountain, isRoad, pathNear, pathTo, placeAtCell, regionIndex, rings, stepCost } from "./map.js";
import { project } from "../geo.js";
import { countWin } from "./victory.js";
import { modsOf } from "./research.js";

/**
 * `civ` buraya girebilir mi, girerse ne olur:
 *   "own" / "ally"  - yürür
 *   "enemy" / "free" - saldırır (savaştığı medeniyet / bağımsız)
 *   null            - giremez (tarafsız birinin yerleşimi: önce savaş ilan edilmeli)
 */
export function access(state, civ, id) {
  const owner = state.places[id].owner;
  const r = relation(state, civ, owner);
  if (r === "self") return "own";
  if (r === "free") return "free";
  if (r === "ally") return "ally";
  if (r === "war") return "enemy";
  return null;
}

export const hostile = (kind) => kind === "enemy" || kind === "free";

/** Surlar: kale güçlü sur; başkent ve büyümüş (3+) şehir hafif sur. */
export function wallsOf(state, id) {
  if (info(id).kind === "castle") return "castle";
  return info(id).capital || state.places[id].level >= N.cityWallLevel ? "city" : null;
}

/** Bir yeri savunanlar: garnizon ve sahibinin içinde duran orduları. */
export function defenders(state, id) {
  const pl = state.places[id];
  const own = armiesAt(state, id).filter((a) => a.owner === pl.owner);
  const out = { civ: pl.owner };
  for (const k of UNITS) out[k] = pl[k] + own.reduce((n, a) => n + a[k], 0);
  return out;
}

// ---- yürüyüş ----

/** Ordunun turluk hareket puanı: Sakalar iki kat, hızlı general bir buçuk kat. */
export const mpMax = (a) => N.march.mp * trait(a.owner, "moves") * (has(a.general, "swift") ? 1.5 : 1);

/**
 * Ordunun yürüyüşü: "both" gemileri bütün askerini taşıyor (karadan da denizden de), "land"
 * sadece karadan, "sea" askersiz filo (sadece denizden; limana girer).
 */
export function modeOf(army) {
  if (men(army) === 0) return "sea";
  // Denizdeyken gemisi batıp askerini taşıyamaz olan ordu yine de kıyıya çıkabilsin. Boğazdaki
  // feribot yolu (su ama yol) deniz sayılmaz: orada duran gemisiz ordu açık denizden yol planlıyor
  // ve Ege'yi yürüyerek geçiyordu (bot oyunu, tohum 505).
  if (army.x !== undefined) {
    const c = cellOf(army.x, army.y);
    if (!isLand(c) && !isRoad(c)) return "both";
  }
  return canSail(army) ? "both" : "land";
}

/**
 * Yabancı (düşman, bağımsız, tarafsız) yerleşimlerin çevresinden (N.reach.hold) geçilmez - Total
 * War'ın kontrol alanı gibi: ordu ya dolaşır ya da şehri alır. Bağımsız şehirler yine tampon,
 * boğazdaki Bizans yine kapı. Ordunun şu an içinde durduğu çevreler ve `except` (hedef) hariç.
 */
function heldFor(state, army, except = []) {
  const R = rings(N.reach.hold);
  const mask = new Uint8Array(W * H);
  const inside = R.at(cellOf(army.x, army.y));
  for (const id of Object.keys(state.places)) {
    if (except.includes(id) || inside.includes(id)) continue;
    const k = access(state, army.owner, id);
    if (k === "own" || k === "ally") continue;
    for (const c of R.of[id]) mask[c] = 1;
  }
  return mask;
}

/** Bu ordunun girebildiği kareler. Yerleşimin içinden ancak kendi ya da müttefik yeriyse geçilir. */
function enterFor(state, army, mode = modeOf(army), except = []) {
  const held = heldFor(state, army, except);
  return (c) => {
    if (held[c]) return false;
    const pl = placeAtCell(c);
    if (pl) {
      const k = access(state, army.owner, pl);
      if (k !== "own" && k !== "ally") return false;
      return mode !== "sea" || !!byId[pl].port;
    }
    // Kara ordusu yoldan (boğazdaki feribottan da) ve karadan; filo sudan.
    return mode === "both" || (mode === "land" ? isLand(c) || isRoad(c) : !isLand(c));
  };
}

/** Bilgisayar tarafsızların toprağından kaçınır (girerse öfkelenirler): o kareler pahalı. */
export function avoidFor(state, civ) {
  // Hangi yerleşimlerin toprağı tarafsızın: bir kere, sonra kare başına bir dizi okuması.
  const bad = new Uint8Array(PLACES.length);
  PLACES.forEach((p, i) => { const o = state.places[p.id].owner; if (o && relation(state, civ, o) === "neutral") bad[i] = 1; });
  return (c) => { const i = regionIndex(c); return i >= 0 && bad[i] ? 2.5 : 0; };
}

/**
 * Bir ordunun hedefe yolu. `target`: { place } | { army } | { x, y }. Kendi ya da müttefik
 * yerine: içine; düşmana (yerleşim ya da ordu): önüne, saldırı menzilinin içine; boş araziye: o
 * kareye. Dönen: { cells: [şimdiki, ..., son], cost, kind: "walk" | "approach" } ya da null.
 */
export function routeTo(state, army, target, o = {}) {
  const from = cellOf(army.x, army.y);
  const mode = o.mode ?? modeOf(army);
  // Hedef bir yerleşimse onun çevresine, bir ordu ya da noktaysa oranın çevresindeki yerleşimlerinkine girilir.
  const R = rings(N.reach.hold);
  const except = target.place ? [target.place]
    : target.army ? (() => { const b = armyById(state, target.army); return b ? R.at(cellOf(b.x, b.y)) : []; })()
    : Number.isFinite(target.x) ? R.at(cellOf(target.x, target.y)) : [];
  const opts = { enter: enterFor(state, army, mode, except), extra: o.extra ?? null };
  const near = N.reach.strike * 0.7;
  const kinded = (r, kind) => r && { ...r, kind };
  if (target.place) {
    const id = target.place, k = access(state, army.owner, id);
    if (k === null) return null;
    if (hostile(k)) return kinded(pathNear(from, POS[id], near, opts, o.limit), "approach");
    if (mode === "sea" && !byId[id].port) return null;
    return kinded(pathTo(from, PLACE_CELL[id], opts, o.limit), "walk");
  }
  if (target.army) {
    const b = armyById(state, target.army);
    if (!b) return null;
    if (b.at) return routeTo(state, army, { place: b.at }, o);
    return kinded(pathNear(from, b, near, opts, o.limit), "approach");
  }
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return null;
  const to = cellOf(target.x, target.y);
  if (!opts.enter(to) && to !== from) return null;
  return kinded(pathTo(from, to, opts, o.limit), "walk");
}

/** Bu hedefe gitmek gemi istiyor mu: karadan yol yok ama gemileri olsaydı denizden vardı. */
export const needsShips = (state, army, target) => modeOf(army) === "land" && routeTo(state, army, target) === null && routeTo(state, army, target, { mode: "both" }) !== null;

/** Hedefe kaç tur: bu turun kalan hareketi, sonra her tur tam hareket. */
export function turnsFor(army, cost) {
  if (cost <= army.mp + 1e-9) return 1;
  return 1 + Math.ceil((cost - army.mp - 1e-9) / mpMax(army));
}

/**
 * Kışın denizdeki ordu %25 ihtimalle fırtınaya yakalanır, her birliğinden %10 ve bir gemisi
 * gider. Olay state.storms'a yazılır (tur raporu ve ekran oradan okur).
 */
function storm(state, army) {
  if (!isWinter(state.turn) || random(state) >= N.season.storm) return;
  let lost = 0;
  for (const k of UNITS) {
    const n = Math.floor(army[k] * N.season.stormLoss);
    army[k] -= n;
    lost += n;
  }
  const sunk = fleetOf(army) > 1 ? 1 : 0;
  sinkShips(army, sunk);
  (state.storms ??= []).push({ type: "storm", turn: state.turn, civ: army.owner, army: army.id, at: nearestPlace(army), lost, sunk });
}

/** Bir noktaya en yakın yerleşim (olaylarda "X yakınında" için). */
export function nearestPlace(pt) {
  let best = null, bd = Infinity;
  for (const [id, m] of Object.entries(POS)) {
    const d = dist(pt, m);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

/** Savaştığı birinin, yerleşimin dışındaki orduları. */
const foes = (state, army) => state.armies.filter((b) => b !== army && !b.at && relation(state, army.owner, b.owner) === "war");

/** Güzergâhı koy ve hareketi kalan kadar yürü. Dönen: yürünen adım sayısı (-1: gidilemez). */
export function order(state, armyId, target) {
  const army = armyById(state, armyId);
  if (!army) return -1;
  const r = routeTo(state, army, target, isHuman(state, army.owner) ? {} : { extra: avoidFor(state, army.owner) });
  if (r === null) return -1;
  army.route = r.cells.slice(1);
  return advance(state, army);
}

/**
 * Ordunun güzergâhında kalan hareketi kadar yürü. Önündeki kare artık girilemez olduysa (yerin
 * sahibi değişti, savaş çıktı, gemileri battı) durur ve güzergâhı siler: "durur ve sana sorar".
 * Savaştığı birinin ordusunun önüne gelince de durur.
 */
export function advance(state, army) {
  if (!army.route?.length) return 0;
  const enter = enterFor(state, army, modeOf(army), rings(N.reach.hold).at(army.route[army.route.length - 1]));
  const pts = [[army.x, army.y]];
  let steps = 0, sea = false;
  while (army.route.length) {
    const here = cellOf(army.x, army.y), next = army.route[0];
    const link = around(here).find(([c]) => c === next);
    if (!link || !enter(next)) { army.route = []; break; }
    const c = stepCost(here, next, link[1]);
    if (c > army.mp + 1e-9) break; // bu turluk bu kadar; yol yarın sürer
    const watch = foes(state, army).filter((b) => dist(army, b) > N.reach.zoc);
    army.mp -= c;
    army.route.shift();
    // Yürüyen ordu kuşatmayı bırakır, yerleşimden çıkar.
    delete army.besieging;
    delete army.besiegedSince;
    const pl = placeAtCell(next);
    const m = pl ? POS[pl] : centre(next);
    army.x = m.x;
    army.y = m.y;
    // Bir yerleşimin karesinde durulursa (yolu bitti ya da turu bitti) içindedir; geçip gidince çıkar.
    army.at = pl ?? null;
    pts.push([army.x, army.y]);
    steps++;
    if (!isLand(next)) sea = true;
    // Önünü kesen düşman: menzile yeni girdiği bir düşman ordusu.
    if (watch.some((b) => dist(army, b) <= N.reach.zoc)) { army.route = []; break; }
  }
  if (steps) {
    if (sea) storm(state, army);
    // Ekran için iz: kim nereden nereye yürüdü (state.trace sadece ekran isterse var, kayda girmez).
    state.trace?.push({ type: "move", army: army.id, owner: army.owner, men: men(army), ships: fleetOf(army), path: pts });
  }
  return steps;
}

/** Bir yerin çevresindeki, sahibinin savaştığı orduların toplam askeri: oyuncuya uyarı için. */
export function menace(state, id) {
  const owner = state.places[id].owner;
  if (!owner) return 0;
  let n = 0;
  // Barbar akıncıları da tehdit (kimseyle savaşta değiller ama saldırırlar).
  for (const a of state.armies) if ((relation(state, owner, a.owner) === "war" || a.raider) && !a.at && dist(a, POS[id]) <= N.reach.threat) n += men(a);
  return n;
}

// ---- saldırı ----

/** Bir ordunun yeri (ordu ya da { at } gibi bir kuvvet). */
const spot = (u) => (u.x !== undefined ? { x: u.x, y: u.y } : POS[u.at]);

/** Bir noktadan bir hedefe saldırı denizden mi: saldıran denizde, ya da arada deniz var (boğazdaki yol kara sayılır). */
export function bySea(from, to) {
  const wet = (c) => !isLand(c) && !isRoad(c);
  if (wet(cellOf(from.x, from.y))) return true;
  const n = Math.ceil(dist(from, to) / (CELL / 2));
  for (let s = 1; s < n; s++) {
    if (wet(cellOf(from.x + ((to.x - from.x) * s) / n, from.y + ((to.y - from.y) * s) / n))) return true;
  }
  return false;
}

/**
 * Saldırıda arazi: nehir geçen yoldan saldıran ve dağ geçidini tutan savunanın çarpanları.
 * Saldıran hedefe giden bir kara yolunun üstündeyse (yarım birim yakınında) o yolun arazisi
 * sayılır; yoldan gelmeyen (kuşatan, dolaşan) ordu nehri ya da geçidi aşmadan vurur.
 * `from`: bir yerleşimin kimliği (o yoldan) ya da bir nokta.
 */
export function terrainOf(from, id) {
  let g = { river: false, pass: false };
  if (typeof from === "string") g = groundOf(from, id);
  else if (from) {
    let best = 0.5;
    for (const r of ROADS) {
      if (r.sea || (r.a !== id && r.b !== id)) continue;
      const pts = roadLine(r).map(([lon, lat]) => project(lon, lat));
      for (let i = 1; i < pts.length; i++) {
        const d = segDist(from, pts[i - 1], pts[i]);
        if (d < best) { best = d; g = groundOf(r.a, r.b); }
      }
    }
  }
  return { att: g.river ? N.ground.river : 1, def: g.pass ? N.ground.pass : 1, river: g.river, pass: g.pass };
}

function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

/**
 * Bir yerleşime saldırının iki tarafı, savaşın kendisinin kullandığı gibi: { att, def, walls, ter,
 * sea }. `unit` bir ordu ya da { inf, arch, at | x, y, general?, xp? }. Tahmin, savaş penceresi
 * ve savaş bunu kullanır - hepsi aynı sayılar.
 */
export function sides(state, unit, civ, id) {
  const pl = state.places[id];
  const from = spot(unit);
  const ter = terrainOf(from, id);
  return {
    att: { civ, inf: unit.inf ?? 0, arch: unit.arch ?? 0, cav: unit.cav ?? 0, siege: unit.siege ?? 0, gen: unit.general ?? null, vet: veteranMul(unit.xp), terrain: ter.att, mods: modsOf(state, civ) },
    def: { ...defenders(state, id), gen: bestAt(state, id, pl.owner), vet: insideVet(state, id), terrain: ter.def, mods: modsOf(state, pl.owner) },
    walls: wallsOf(state, id), ter, sea: !!from && bySea(from, POS[id]),
  };
}

/** İçeridekilerin tecrübe çarpanı: orduların rütbesi, kişi sayısıyla tartılı (garnizon acemi). */
function insideVet(state, id) {
  const pl = state.places[id];
  const own = armiesAt(state, id).filter((a) => a.owner === pl.owner);
  const total = men(pl) + own.reduce((n, a) => n + men(a), 0);
  if (!total) return 1;
  return (men(pl) + own.reduce((n, a) => n + men(a) * veteranMul(a.xp), 0)) / total;
}

/** Meydan muharebesinin iki tarafı: { att, def }. Dağda duran savunan dağ geçidi gibi güçlü. */
export const fieldSides = (state, army, b) => ({
  att: { civ: army.owner, ...pickUnits(army), gen: army.general ?? null, vet: veteranMul(army.xp), mods: modsOf(state, army.owner) },
  def: { civ: b.owner, ...pickUnits(b), gen: b.general ?? null, vet: veteranMul(b.xp), mods: modsOf(state, b.owner),
    terrain: isMountain(cellOf(b.x, b.y)) ? N.ground.pass : 1 },
});

/** Deniz savaşının bir tarafı: gemileri ve araştırması. */
const fleetSide = (state, civ, u, extra = {}) => ({ civ, ...shipsOnly(u), mods: modsOf(state, civ), ...extra });

/**
 * Bir saldırının tahmini, generaller ve tecrübe dahil: `unit` bir ordu ya da { inf, arch, at, general? }.
 * Arayüz ve bilgisayar bunu kullanır - savaşın kendisiyle aynı sayılar.
 */
export function forecast(state, unit, civ, id) {
  const pl = state.places[id];
  const sd = sides(state, unit, civ, id);
  const sea = sd.sea ? navalOdds(fleetSide(state, civ, unit), fleetSide(state, pl.owner, fleetAt(state, id), { fort: fortOf(state, id) })) : "easy";
  const land = estimate(sd.att, sd.def, sd.walls);
  // Denizde batılırsa karaya çıkılmaz: tahmin ikisinin kötüsü.
  const rank = { easy: 0, risky: 1, hopeless: 2 };
  if (rank[sea] > rank[land.odds]) return { ...land, odds: sea, sea };
  return { ...land, sea };
}

/** Saldırabilir mi: düşman ya da bağımsız yer, menzilde, hareketi var; denizdense gemileri yetiyor. */
export function canAttack(state, army, id) {
  if (!army || army.mp <= 0 || men(army) <= 0 || army.at === id) return false;
  if (!hostile(access(state, army.owner, id))) return false;
  if (dist(army, POS[id]) > N.reach.strike + 1e-9) return false;
  return !bySea(army, POS[id]) || canSail(army);
}

/** Liman kalesinin savunan filoya çarpanı. */
export const fortOf = (state, id) => {
  const pl = state.places[id];
  // İskenderiye Feneri'ni tutanın bütün limanlarında liman kalesi bir seviye fazla sayılır.
  const pharos = holds(state, pl.owner, "pharos") ? N.wonders.pharosFort : 0;
  return 1 + ((pl.fort ?? 0) + pharos) * N.port.fortPerLevel;
};

/** Bir yerin gemileri, türleriyle: limandakiler ve sahibinin içinde duran ordularınınkiler. */
export function fleetAt(state, id) {
  const pl = state.places[id];
  const out = shipsOnly(pl);
  for (const a of armiesAt(state, id)) if (a.owner === pl.owner) for (const k of SHIPS) out[k] += a[k] ?? 0;
  return out;
}

/** Bir yerin bütün gemileri (sayı). */
export const shipsAt = (state, id) => fleetOf(fleetAt(state, id));

/**
 * Bir yerleşime saldırı. Dönen olay: { type: "battle", ... }. Kazanırsa yer saldıranın olur, ordu
 * içeri girer; kaybederse ordu yok olur ve savunanların kayıpları garnizona ve ordulara oranla düşer.
 */
export function attack(state, armyId, id, luck = null, result = null) {
  const army = armyById(state, armyId);
  if (!canAttack(state, army, id)) return null;
  // Saldırı kuşatmayı bitirir (kazansa da kaybetse de).
  delete army.besieging;
  delete army.besiegedSince;
  const pl = state.places[id];
  const from = { x: army.x, y: army.y };
  const sea = bySea(from, POS[id]);
  const path = [[army.x, army.y], [POS[id].x, POS[id].y]];
  // Kışın denizden saldıran önce fırtınaya yakalanabilir.
  if (sea) storm(state, army);
  // Denizden saldırı: önce limandaki gemilerle deniz savaşı. Filo batarsa ordu denizde kaybolur.
  let navalEv = null;
  if (sea && shipsAt(state, id) > 0) {
    const theirs = fleetAt(state, id);
    const nr = naval(fleetSide(state, army.owner, army), fleetSide(state, pl.owner, theirs, { fort: fortOf(state, id) }), luck ?? rollLuck(state));
    navalEv = { won: nr.attWins, sunk: fleetOf(theirs) - fleetOf(nr.def), lost: fleetOf(army) - fleetOf(nr.att) };
    sinkAt(state, id, nr.def);
    for (const k of SHIPS) army[k] = nr.att[k];
    if (!nr.attWins) {
      countWin(state, pl.owner);
      state.trace?.push({ type: "attack", army: army.id, owner: army.owner, men: men(army), ships: fleetOf(army), path, at: id, won: false, oldOwner: pl.owner });
      bury(state, army.owner, army.general);
      state.armies = state.armies.filter((a) => a !== army);
      return {
        type: "battle", turn: state.turn, attacker: army.owner, defender: pl.owner, place: id, won: false, drowned: true,
        naval: navalEv, before: { att: pickUnits(army), def: pickUnits(defenders(state, id)) },
        after: { att: pickUnits({}), def: pickUnits(defenders(state, id)) }, genFell: army.general?.name,
      };
    }
  }
  const sd = sides(state, army, army.owner, id);
  const def = sd.def, walls = sd.walls, defGen = def.gen;
  // Taktik savaş (tactics.js) bittiyse onun sonucu; yoksa otomatik savaş.
  const r = result ?? fight(sd.att, def, walls, luck ?? rollLuck(state));
  const ev = {
    type: "battle", turn: state.turn, attacker: army.owner, defender: pl.owner, place: id,
    won: r.attWins, before: { att: pickUnits(army), def: pickUnits(def) },
    after: { att: r.att, def: r.def }, naval: navalEv,
  };
  const trace = { type: "attack", army: army.id, owner: army.owner, men: men(army), ships: fleetOf(army), path, at: id, won: r.attWins, oldOwner: pl.owner };
  state.trace?.push(trace);
  army.mp = 0;
  army.route = [];
  countWin(state, r.attWins ? army.owner : pl.owner);

  if (r.attWins) {
    for (const k of UNITS) army[k] = r.att[k];
    ev.rankUp = gainXp(army, N.veteran.win);
    const loser = pl.owner;
    capture(state, id, army.owner);
    army.at = id;
    army.x = POS[id].x;
    army.y = POS[id].y;
    ev.fallen = loser && !state.civs[loser].alive ? loser : null;
    if (army.general) ev.gen = { name: army.general.name, ...learn(state, army.general, true, army.owner) };
  } else {
    // Savunanların sağ kalanları: her birim aynı oranda. (Bölüğe yuvarlanıyordu: 7 kişi 10
    // oluyordu, savaşı kazanan savunma asker kazanabiliyordu.)
    const units = [pl, ...armiesAt(state, id).filter((a) => a.owner === pl.owner)];
    for (const k of UNITS) {
      const keep = def[k] > 0 ? r.def[k] / def[k] : 0;
      for (const u of units) u[k] = Math.floor(u[k] * keep);
    }
    // Saldıran, savaş yakınsa askerinin bir kısmıyla geri çekilir (durduğu yerde, kapının önünde
    // kalır); ezildiyse ordusu ve generali yok olur. Savunmayı tutan general tecrübe kazandı.
    // Taktik savaşta geri çekilen, sahadan kaçabilenlerdir.
    const keep = N.retreat.keep * Math.max(0, Math.min(1, r.attPow / Math.max(1e-6, r.defPow)));
    const left = r.escaped ?? Object.fromEntries(UNITS.map((k) => [k, Math.floor((ev.before.att[k] ?? 0) * keep)]));
    const fled = men(left) >= N.retreat.min;
    if (fled) {
      for (const k of UNITS) army[k] = left[k];
      ev.retreat = { army: army.id, owner: army.owner, men: men(army) };
      trace.fled = true;
    } else {
      bury(state, army.owner, army.general);
      if (army.general) ev.genFell = army.general.name;
    }
    if (defGen) learn(state, defGen, true, pl.owner);
    // Yerleşimini tutan içerideki ordular tecrübe kazanır.
    for (const a of armiesAt(state, id)) if (a.owner === pl.owner) a.xp = (a.xp ?? 0) + N.veteran.held;
    for (const a of state.armies) if (a.at === id && a.owner === pl.owner && empty(a)) bury(state, a.owner, a.general);
    state.armies = state.armies.filter((a) => (a !== army || fled) && !(a.at === id && a.owner === pl.owner && empty(a)));
  }
  return ev;
}

// ---- meydan muharebesi ----
//
// Kullanıcı 22.10: "düşman gelirse kuşatmadan önce meydan muharebesi yapabilsin". Yerleşimin
// dışındaki bir orduya saldırı: karada sursuz bir savaş, ikisi de denizdeyse deniz savaşı.
// Kaybeden yok olur (yerleşim savaşındaki gibi); denizde kaybeden filo askerleriyle batar.

/** Bu ordu şu orduya saldırabilir mi: savaştığı birinin, yerleşimin dışındaki, menzilde. */
/** Bir orduya saldırılabilir mi: savaştığın birinin ordusu ya da sahipsiz (haydut) ordu. */
export const isFoe = (state, a, b) => { const r = relation(state, a, b); return r === "war" || r === "free"; };

export function canStrike(state, army, b) {
  if (!army || !b || army === b || army.mp <= 0 || b.at) return false;
  if (!isFoe(state, army.owner, b.owner)) return false;
  if (dist(army, b) > N.reach.strike + 1e-9) return false;
  const sa = !isLand(cellOf(army.x, army.y)), sb = !isLand(cellOf(b.x, b.y));
  if (sa !== sb) return false; // biri denizde biri karada
  return sa ? fleetOf(army) > 0 : men(army) > 0 && men(b) + fleetOf(b) > 0;
}

/** Meydan muharebesinin tahmini (karada; denizdeyse deniz savaşının). */
export function forecastField(state, army, b) {
  if (!isLand(cellOf(b.x, b.y))) return { odds: navalOdds(fleetSide(state, army.owner, army), fleetSide(state, b.owner, b)), lost: 0, killed: 0, sea: true };
  const sd = fieldSides(state, army, b);
  return estimate(sd.att, sd.def, null);
}

/** Meydan muharebesi. Dönen olay: { type: "battle", field: true, place: en yakın yer, at: { x, y }, ... }. */
export function strike(state, armyId, targetId, luck = null, result = null) {
  const army = armyById(state, armyId), b = armyById(state, targetId);
  if (!canStrike(state, army, b)) return null;
  delete army.besieging;
  delete army.besiegedSince;
  const at = { x: b.x, y: b.y };
  const ev = {
    type: "battle", field: true, turn: state.turn, attacker: army.owner, defender: b.owner, place: nearestPlace(at), at,
    before: { att: pickUnits(army), def: pickUnits(b) }, naval: null, bandits: !!b.bandit, barbarians: !!b.barbarian, camp: !!b.camp,
  };
  let won;
  if (!isLand(cellOf(b.x, b.y))) {
    // Denizde: filo filoya; yenilen filo askerleriyle batar.
    const nr = naval(fleetSide(state, army.owner, army), fleetSide(state, b.owner, b), luck ?? rollLuck(state));
    won = nr.attWins;
    ev.naval = { won, sunk: fleetOf(b) - fleetOf(nr.def), lost: fleetOf(army) - fleetOf(nr.att), att: fleetOf(army), def: fleetOf(b) };
    const winner = won ? army : b;
    for (const k of SHIPS) winner[k] = (won ? nr.att : nr.def)[k];
    ev.drowned = !won;
    ev.after = { att: won ? pickUnits(army) : pickUnits({}), def: won ? pickUnits({}) : pickUnits(b) };
  } else {
    const sd = fieldSides(state, army, b);
    const r = result ?? fight(sd.att, sd.def, null, luck ?? rollLuck(state));
    ev.escaped = r.escaped ?? null;
    won = r.attWins;
    ev.power = won ? r.defPow / Math.max(1e-6, r.attPow) : r.attPow / Math.max(1e-6, r.defPow);
    for (const k of UNITS) (won ? army : b)[k] = (won ? r.att : r.def)[k];
    ev.after = { att: r.att, def: r.def };
  }
  ev.won = won;
  const trace = { type: "attack", army: army.id, owner: army.owner, men: men(army), ships: fleetOf(army), path: [[army.x, army.y], [at.x, at.y]], at: null, point: at, won, oldOwner: b.owner };
  state.trace?.push(trace);
  army.mp = 0;
  army.route = [];
  const [winner, loser] = won ? [army, b] : [b, army];
  // Karada yenilen geri çekilebilir (denizde yenilen filo askerleriyle batar).
  // Kamp çekilmez: dağıtılır.
  const fled = !ev.naval && !loser.camp && retreat(state, loser, winner, won ? ev.before.def : ev.before.att, ev.power, ev.escaped);
  delete ev.escaped;
  if (fled) ev.retreat = { army: loser.id, owner: loser.owner, men: men(loser) };
  if (fled && loser === army) trace.fled = true;
  countWin(state, winner.owner);
  const up = gainXp(winner, N.veteran.win);
  if (won) ev.rankUp = up;
  if (!fled) {
    bury(state, loser.owner, loser.general);
    if (loser.general) ev.genFell = loser.general.name;
  }
  if (winner.general) {
    const l = learn(state, winner.general, true, winner.owner);
    if (won) ev.gen = { name: winner.general.name, ...l };
  }
  // Haydutları dağıtan ganimetlerini alır (geri çekilseler de).
  if (loser.bandit && winner.owner) {
    state.civs[winner.owner].money += N.bandits.loot;
    ev.loot = N.bandits.loot;
  }
  // Barbar kampını ya da akıncıları dağıtan da (barbarians.js).
  if (loser.barbarian && winner.owner && !fled) {
    const loot = loser.camp ? N.barbarians.loot : N.barbarians.raiderLoot;
    state.civs[winner.owner].money += loot;
    ev.loot = loot;
  }
  if (!fled) state.armies = state.armies.filter((x) => x !== loser);
  return ev;
}

const pickUnits = (u) => Object.fromEntries(UNITS.map((k) => [k, u[k] ?? 0]));

/**
 * Yenilen ordu geri çekilir (kullanıcı 23.10 önerilerden: "kaybeden kaçmıyor, yok oluyor"):
 * savaştan önceki askerlerinden `keep` x (yenilenin gücü / kazananın gücü) kadarı, kazanandan
 * uzak, karadan yürünebilir bir kareye (en çok `dist` birim). Pek az asker kalırsa ya da gidecek
 * yer yoksa dağılır. `ratio` 0..1: savaş ne kadar yakındı. Dönen: çekildi mi.
 */
function retreat(state, loser, winner, before, ratio, escaped = null) {
  const R = N.retreat;
  const keep = R.keep * Math.max(0, Math.min(1, ratio ?? 0));
  // Taktik savaşta: sahadan kaçabilenler.
  const left = escaped ?? Object.fromEntries(UNITS.map((k) => [k, Math.floor((before[k] ?? 0) * keep)]));
  if (men(left) < R.min) return false;
  const from = cellOf(loser.x, loser.y);
  const enter = enterFor(state, { ...loser, ...left }, "land");
  const cand = [];
  for (let c = 0; c < W * H; c++) {
    if (!isLand(c) || placeAtCell(c)) continue;
    const p = centre(c), d = dist(p, loser);
    if (d < 0.4 || d > R.dist || !enter(c)) continue;
    cand.push([dist(p, winner) - d * 0.3, c]);
  }
  cand.sort((a, b) => b[0] - a[0]);
  for (const [, c] of cand.slice(0, 6)) {
    if (!pathTo(from, c, { enter }, N.march.mp * 2)) continue;
    for (const k of UNITS) loser[k] = left[k];
    Object.assign(loser, centre(c), { at: null, route: [], mp: 0 });
    delete loser.besieging;
    delete loser.besiegedSince;
    return true;
  }
  return false;
}

/** Tecrübe ekler; rütbe atladıysa yeni rütbeyi, atlamadıysa 0 döndürür (olay ekranda gösterir). */
function gainXp(army, n) {
  const before = veteranRank(army.xp);
  army.xp = (army.xp ?? 0) + n;
  const after = veteranRank(army.xp);
  return after > before ? after : 0;
}

/** Bir yerin gemilerini her türden `left`te kalan kadara indirir: önce limandakiler, sonra ordularınkiler batar. */
function sinkAt(state, id, left) {
  const pl = state.places[id];
  const now = fleetAt(state, id);
  const own = armiesAt(state, id).filter((a) => a.owner === pl.owner);
  for (const k of SHIPS) {
    let sink = now[k] - (left[k] ?? 0);
    for (const u of [pl, ...own]) {
      const n = Math.min(u[k] ?? 0, sink);
      u[k] -= n;
      sink -= n;
    }
  }
}

const rollLuck = (state) => [between(state, 1 - N.luck, 1 + N.luck), between(state, 1 - N.luck, 1 + N.luck)];

/** Bir yerleşimin içindeki ordu dışarı çıkar: kapısının önündeki bir kareye (gemiliyse denize de). */
export function stepOut(state, army) {
  const id = army.at;
  army.at = null;
  if (!id) return;
  const mode = modeOf(army);
  const ok = (c) => !placeAtCell(c) && (mode === "both" || (mode === "land" ? isLand(c) : !isLand(c)));
  const out = around(PLACE_CELL[id]).map(([c]) => c).find(ok);
  const m = out !== undefined ? centre(out) : POS[id];
  army.x = m.x;
  army.y = m.y;
  army.route = [];
}

/** Yer el değiştirir: savunanlar yok olur, nüfusun dörtte biri kaçar, yapılar kalır. */
export function capture(state, id, civ) {
  const pl = state.places[id];
  const loser = pl.owner;
  for (const k of UNITS) pl[k] = 0;
  for (const k of SHIPS) pl[k] = 0; // limandaki gemiler yakıldı
  pl.owner = civ;
  pl.pop = Math.round(pl.pop * (1 - N.captureLoss));
  pl.upgraded = true; // alındığı tur yükseltilmez
  pl.builds = []; // yarım kalan inşaat yıkılır, parası gider
  pl.recruited = pl.barracks;
  // Yeni alınan yer huzursuz; bağımsızlığına dönen (isyan eden) yer ise kendi halkının.
  pl.loyalty = civ ? N.loyalty.captured : 100;
  // Eski sahibin içerideki orduları savunurken öldü; başkalarının (müttefik) orduları kapının
  // önüne çıkar.
  for (const a of state.armies) if (a.at === id && a.owner === loser) bury(state, loser, a.general);
  state.armies = state.armies.filter((a) => !(a.at === id && a.owner === loser));
  for (const a of armiesAt(state, id)) if (a.owner !== civ) stepOut(state, a);
  if (loser && !placesOf(state, loser).length) eliminate(state, loser);
}

/** İttifak bozulunca birbirinin yerleşimlerinin içindeki ordular kapının önüne çıkar. */
export function expel(state, a, b) {
  for (const army of state.armies) {
    if (!army.at) continue;
    const owner = state.places[army.at].owner;
    if ((army.owner === a && owner === b) || (army.owner === b && owner === a)) stepOut(state, army);
  }
}

/** Son yerini kaybeden medeniyet oyundan çıkar: orduları dağılır, ilişkileri silinir. */
export function eliminate(state, civ) {
  state.civs[civ].alive = false;
  state.armies = state.armies.filter((a) => a.owner !== civ);
  for (const c of CIVS) {
    const k = civ < c.id ? `${civ}|${c.id}` : `${c.id}|${civ}`;
    delete state.relations[k];
  }
}

/** Bir medeniyetin ordularına turun başında hareketlerini geri ver. */
export function refresh(state, civ) {
  for (const a of state.armies) if (a.owner === civ) a.mp = mpMax(a);
}

// ---- bilgisayar için ----

/** Bu ordunun bu tur yetişebildiği her kareye bedel (map.js field): bilgisayar hedefe bakar. */
export function reachOf(state, army, limit = army.mp) {
  return field(cellOf(army.x, army.y), { enter: enterFor(state, army), extra: avoidFor(state, army.owner) }, limit);
}

/** Bir bedel tablosunda bir noktanın `r` yakınındaki en ucuz kare: { cell, cost } (yoksa cost Infinity). */
export function nearest(f, at, r) {
  let best = { cell: -1, cost: Infinity };
  const i0 = Math.floor((at.x - r) / CELL), i1 = Math.floor((at.x + r) / CELL);
  const j0 = Math.floor((at.y - r) / CELL), j1 = Math.floor((at.y + r) / CELL);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const c = cellOf((i + 0.5) * CELL, (j + 0.5) * CELL);
      if (dist(centre(c), at) > r) continue;
      const k = f.cost(c);
      if (k < best.cost) best = { cell: c, cost: k };
    }
  }
  return best;
}
