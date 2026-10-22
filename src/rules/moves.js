// Ordu hareketi ve saldırı (SADE SÜRÜM, kurallar.md). Saf kurallar, DOM yok.
//
// Ordular sadece yerleşimlerde durur. Her ordu her tur `moves` yol yürür (Sakalar 2). Uzak bir
// yere gönderilen ordu güzergâhını saklar ve her tur kendiliğinden ilerler; ama yabancı bir
// yere asla kendi başına girmez - saldırı her zaman açık bir emirdir. Deniz yolu gemi ister
// (gemiler orduyu taşıyabilmeli); deniz savaşı yok.

import { CIVS } from "../data/world.js";
import { estimate, fight } from "./combat.js";
import { neighbours, path, roadBetween } from "./graph.js";
import { N, UNITS, trait } from "./numbers.js";
import { between } from "./rng.js";
import { armiesAt, armyById, canSail, empty, men, placesOf, relation, walled } from "./state.js";

/**
 * `civ` buraya girebilir mi, girerse ne olur:
 *   "own" / "ally"  - yürür
 *   "enemy" / "free" - saldırır (savaştığı medeniyet / bağımsız)
 *   null            - giremez (tarafsız birinin toprağı)
 */
export function access(state, civ, id) {
  const r = relation(state, civ, state.places[id].owner);
  if (r === "self") return "own";
  if (r === "free") return "free";
  if (r === "ally") return "ally";
  if (r === "war") return "enemy";
  return null;
}

export const hostile = (kind) => kind === "enemy" || kind === "free";

/** Bir yeri savunanlar: garnizon ve sahibinin orada duran orduları. */
export function defenders(state, id) {
  const pl = state.places[id];
  const own = armiesAt(state, id).filter((a) => a.owner === pl.owner);
  const out = { civ: pl.owner };
  for (const k of UNITS) out[k] = pl[k] + own.reduce((n, a) => n + a[k], 0);
  return out;
}

/** Bu ordu bu yolu kullanabilir mi: deniz yolu, gemileri bütün askerini taşıyabiliyorsa. */
export const canUse = (army, road, sail = canSail(army)) => !!road && (!road.sea || sail);

/**
 * Bir ordunun `dest`e güzergâhı: aradaki her durak kendi ya da müttefik yeri olmalı.
 * `dest` düşmansa güzergâh onun bir önceki durağında biter (saldırı ayrı emir).
 */
export function routeTo(state, army, dest, sail = canSail(army)) {
  if (army.at === dest) return [];
  const kind = access(state, army.owner, dest);
  if (kind === null) return null;
  const walkable = (id) => {
    const k = access(state, army.owner, id);
    return k === "own" || k === "ally";
  };
  const usable = (r) => canUse(army, r, sail);
  if (hostile(kind)) {
    // Düşmana komşu, yürünebilir en yakın durak - ve oradan düşmana giden yol da kullanılabilir olmalı.
    let best = null;
    for (const n of neighbours(dest)) {
      if (!usable(roadBetween(n, dest))) continue;
      const p = n === army.at ? [army.at] : walkable(n) ? path(army.at, n, walkable, usable) : null;
      if (p && (!best || p.length < best.length)) best = p;
    }
    return best ? best.slice(1) : null;
  }
  const p = path(army.at, dest, walkable, usable);
  return p ? p.slice(1) : null;
}

/** Bu orduyu bir yere götürmek gemi istiyor mu: karadan yol yok ama denizden var. */
export const needsShips = (state, army, dest) => routeTo(state, army, dest) === null && routeTo(state, army, dest, true) !== null;

/** Güzergâhı koy ve hareketi kalan kadar yürü. Dönen: yürünen adım sayısı. */
export function order(state, armyId, dest) {
  const army = armyById(state, armyId);
  if (!army) return -1;
  const route = routeTo(state, army, dest);
  if (route === null) return -1;
  army.route = route;
  return advance(state, army);
}

/**
 * Ordunun güzergâhında kalan hareketi kadar yürü. Önündeki yer artık yürünemez olduysa
 * (sahibi değişti, savaş çıktı) durur ve güzergâhı siler.
 */
export function advance(state, army) {
  let steps = 0;
  while (army.moves > 0 && army.route.length) {
    const next = army.route[0];
    const k = access(state, army.owner, next);
    const road = roadBetween(army.at, next);
    if (!(k === "own" || k === "ally") || !canUse(army, road)) {
      army.route = [];
      break;
    }
    // Ekran için iz (state.trace sadece ekran isterse var, kayda girmez).
    state.trace?.push({ type: "move", army: army.id, owner: army.owner, men: men(army), ships: army.ships, from: army.at, to: next });
    army.at = next;
    army.moves -= 1;
    army.route.shift();
    steps++;
  }
  return steps;
}

/** Bir yerin yanındaki, sahibinin savaştığı orduların toplam askeri: oyuncuya uyarı için. */
export function menace(state, id) {
  const owner = state.places[id].owner;
  let n = 0;
  for (const nb of neighbours(id)) {
    for (const a of armiesAt(state, nb)) if (owner && relation(state, owner, a.owner) === "war") n += men(a);
  }
  return n;
}

/** Saldırının tahmini: `unit` bir ordu ya da { inf, arch, cav }. Savaşın kendisiyle aynı sayılar. */
export function forecast(state, unit, civ, id) {
  return estimate({ civ, inf: unit.inf ?? 0, arch: unit.arch ?? 0, cav: unit.cav ?? 0 }, defenders(state, id), walled(state, id));
}

/** Saldırabilir mi: komşu, düşman/bağımsız, hareketi var, deniz yolundaysa gemisi yetiyor. */
export function canAttack(state, army, id) {
  if (!army || army.moves <= 0 || men(army) <= 0) return false;
  const road = roadBetween(army.at, id);
  return canUse(army, road) && hostile(access(state, army.owner, id));
}

/**
 * Saldırı. Dönen olay: { type: "battle", ... }. Kazanırsa yer saldıranın olur, ordu içeri
 * girer; kaybederse ordu yok olur ve savunanların kayıpları garnizona ve ordulara oranla düşer.
 */
export function attack(state, armyId, id, luck = null) {
  const army = armyById(state, armyId);
  if (!canAttack(state, army, id)) return null;
  const pl = state.places[id];
  const def = defenders(state, id);
  const walls = walled(state, id);
  const r = fight({ civ: army.owner, ...pickUnits(army) }, def, walls, luck ?? rollLuck(state));
  const ev = {
    type: "battle", turn: state.turn, attacker: army.owner, defender: pl.owner, place: id, walls,
    won: r.attWins, before: { att: pickUnits(army), def: pickUnits(def) }, after: { att: r.att, def: r.def },
  };
  state.trace?.push({
    type: "attack", army: army.id, owner: army.owner, men: men(army), ships: army.ships, from: army.at, to: id,
    won: r.attWins, oldOwner: pl.owner,
  });
  army.moves = 0;
  army.route = [];
  if (r.attWins) {
    for (const k of UNITS) army[k] = r.att[k];
    const loser = pl.owner;
    capture(state, id, army.owner);
    army.at = id;
    ev.fallen = loser && !state.civs[loser].alive ? loser : null;
  } else {
    // Savunanların sağ kalanları: her birim aynı oranda.
    const units = [pl, ...armiesAt(state, id).filter((a) => a.owner === pl.owner)];
    for (const k of UNITS) {
      const keep = def[k] > 0 ? r.def[k] / def[k] : 0;
      for (const u of units) u[k] = Math.floor(u[k] * keep);
    }
    state.armies = state.armies.filter((a) => a !== army && !(a.at === id && a.owner === pl.owner && empty(a)));
  }
  return ev;
}

const pickUnits = (u) => Object.fromEntries(UNITS.map((k) => [k, u[k] ?? 0]));
const rollLuck = (state) => [between(state, 1 - N.luck, 1 + N.luck), between(state, 1 - N.luck, 1 + N.luck)];

/** Yer el değiştirir: savunanlar yok olur, limandaki gemiler yanar, seviye kalır. */
export function capture(state, id, civ) {
  const pl = state.places[id];
  const loser = pl.owner;
  for (const k of UNITS) pl[k] = 0;
  pl.ships = 0;
  pl.owner = civ;
  pl.upgraded = true; // alındığı tur geliştirilmez
  pl.recruited = pl.level; // ve asker basılmaz
  // Eski sahibin oradaki orduları savunurken öldü; başkalarının (müttefik) orduları en yakın
  // kendi yerlerine çekilir, yoksa dağılır.
  state.armies = state.armies.filter((a) => !(a.at === id && a.owner === loser));
  for (const a of armiesAt(state, id)) {
    if (a.owner === civ) continue;
    const home = nearestOwn(state, a.owner, id);
    if (home) { a.at = home; a.route = []; } else state.armies = state.armies.filter((x) => x !== a);
  }
  if (loser && !placesOf(state, loser).length) eliminate(state, loser);
}

/** İttifak bozulunca birbirinin topraklarında duran ordular evlerine döner. */
export function expel(state, a, b) {
  for (const army of state.armies) {
    const owner = state.places[army.at].owner;
    if ((army.owner === a && owner === b) || (army.owner === b && owner === a)) {
      const home = nearestOwn(state, army.owner, army.at);
      if (home) { army.at = home; army.route = []; } else { for (const k of UNITS) army[k] = 0; army.ships = 0; }
    }
  }
  state.armies = state.armies.filter((x) => !empty(x));
}

function nearestOwn(state, civ, from) {
  const seen = new Set([from]);
  for (const q = [from]; q.length;) {
    const at = q.shift();
    for (const n of neighbours(at)) {
      if (seen.has(n)) continue;
      if (state.places[n].owner === civ) return n;
      seen.add(n);
      q.push(n);
    }
  }
  return null;
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
  for (const a of state.armies) if (a.owner === civ) a.moves = trait(civ, "moves");
}
