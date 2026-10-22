// Ordu hareketi ve saldırı (kurallar.md bölüm 6-7). Saf kurallar, DOM yok.
//
// Ordular sadece yerleşimlerde durur. Her ordu her tur `moves` yol yürür (Sakalar 2).
// Uzak bir yere gönderilen ordu güzergâhını saklar ve her tur kendiliğinden ilerler; ama
// yabancı bir yere asla kendi başına girmez - saldırı her zaman açık bir emirdir.

import { CIVS } from "../data/world.js";
import { estimate, fight, naval, navalOdds } from "./combat.js";
import { byId, neighbours, path, roadBetween } from "./graph.js";
import { bestAt, bury, has, learn } from "./generals.js";
import { N, UNITS, trait } from "./numbers.js";
import { between, random } from "./rng.js";
import { armiesAt, armyById, canSail, empty, info, men, placesOf, relation } from "./state.js";
import { holds } from "./wonders.js";
import { groundOf } from "./ground.js";
import { isWinter } from "./season.js";

/**
 * `civ` buraya girebilir mi, girerse ne olur:
 *   "own" / "ally"  - yürür
 *   "enemy" / "free" - saldırır (savaştığı medeniyet / bağımsız)
 *   null            - giremez (tarafsız birinin toprağı)
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

/** Bir yeri savunanlar: garnizon ve sahibinin orada duran orduları. */
export function defenders(state, id) {
  const pl = state.places[id];
  const own = armiesAt(state, id).filter((a) => a.owner === pl.owner);
  const out = { civ: pl.owner };
  for (const k of UNITS) out[k] = pl[k] + own.reduce((n, a) => n + a[k], 0);
  return out;
}

/**
 * Bu ordu bu yolu kullanabilir mi. Deniz yolu, gemiler orduyu taşıyabiliyorsa (`sail`).
 * Askersiz filo karadan yürümez - ancak karada kalmışsa (eski kayıtlarda filolar karadan
 * yürüyebiliyordu) bir limana dönebilsin diye kara yolu açık.
 */
export function canUse(army, road, sail = canSail(army)) {
  if (!road) return false;
  if (road.sea) return sail;
  return men(army) > 0 || !byId[army.at]?.port;
}

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

/**
 * Kışın deniz yolu: ordu %25 ihtimalle fırtınaya yakalanır, her birliğinden %10 ve bir gemisi
 * gider. Olay state.storms'a yazılır (tur raporu ve ekran oradan okur).
 */
function storm(state, army, at) {
  if (!isWinter(state.turn) || random(state) >= N.season.storm) return;
  let lost = 0;
  for (const k of UNITS) {
    const n = Math.floor(army[k] * N.season.stormLoss);
    army[k] -= n;
    lost += n;
  }
  const sunk = army.ships > 1 ? 1 : 0;
  army.ships -= sunk;
  (state.storms ??= []).push({ type: "storm", turn: state.turn, civ: army.owner, army: army.id, at, lost, sunk });
}

/** Saldırıda arazi: nehir geçen saldıran ve dağ geçidini tutan savunanın çarpanları. */
export function terrainOf(from, id) {
  const g = from ? groundOf(from, id) : { river: false, pass: false };
  return { att: g.river ? N.ground.river : 1, def: g.pass ? N.ground.pass : 1, river: g.river, pass: g.pass };
}

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
 * (sahibi değişti, savaş çıktı) durur ve güzergâhı siler: "durur ve sana sorar".
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
    // Ekran için iz: kim nereden nereye yürüdü (state.trace sadece ekran isterse var, kayda girmez).
    state.trace?.push({ type: "move", army: army.id, owner: army.owner, men: men(army), ships: army.ships, from: army.at, to: next });
    // Yürüyen ordu kuşatmayı bırakır.
    delete army.besieging;
    delete army.besiegedSince;
    army.at = next;
    if (road.sea) storm(state, army, next);
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

/**
 * Bir saldırının tahmini, generaller dahil: `unit` bir ordu ya da { inf, arch, general? }.
 * Arayüz ve bilgisayar bunu kullanır - savaşın kendisiyle aynı sayılar.
 */
export function forecast(state, unit, civ, id) {
  const pl = state.places[id];
  const from = unit.at ?? null;
  const bySea = from && roadBetween(from, id)?.sea;
  const sea = bySea ? navalOdds({ civ, ships: unit.ships ?? 0 }, { civ: pl.owner, ships: shipsAt(state, id), fort: fortOf(state, id) }) : "easy";
  const ter = terrainOf(from, id);
  const land = estimate(
    { civ, inf: unit.inf, arch: unit.arch, cav: unit.cav ?? 0, siege: unit.siege ?? 0, gen: unit.general ?? null, terrain: ter.att },
    { ...defenders(state, id), gen: bestAt(state, id, pl.owner), terrain: ter.def },
    wallsOf(state, id),
  );
  // Denizde batılırsa karaya çıkılmaz: tahmin ikisinin kötüsü.
  const rank = { easy: 0, risky: 1, hopeless: 2 };
  if (rank[sea] > rank[land.odds]) return { ...land, odds: sea, sea };
  return { ...land, sea };
}

/** Saldırabilir mi: komşu, düşman/bağımsız, hareketi var. */
export function canAttack(state, army, id) {
  if (!army || army.moves <= 0 || men(army) <= 0) return false;
  const road = roadBetween(army.at, id);
  return !!road && (!road.sea || canSail(army)) && hostile(access(state, army.owner, id));
}

/** Liman kalesinin savunan filoya çarpanı. */
export const fortOf = (state, id) => {
  const pl = state.places[id];
  // İskenderiye Feneri'ni tutanın bütün limanlarında liman kalesi bir seviye fazla sayılır.
  const pharos = holds(state, pl.owner, "pharos") ? N.wonders.pharosFort : 0;
  return 1 + ((pl.fort ?? 0) + pharos) * N.port.fortPerLevel;
};

/** Bir yerin gemileri: limandakiler ve sahibinin orada duran ordularınınkiler. */
export function shipsAt(state, id) {
  const pl = state.places[id];
  return pl.ships + armiesAt(state, id).filter((a) => a.owner === pl.owner).reduce((n, a) => n + a.ships, 0);
}

/**
 * Saldırı. Dönen olay: { type: "battle", ... }. Kazanırsa yer saldıranın olur, ordu içeri
 * girer; kaybederse ordu yok olur ve savunanların kayıpları garnizona ve ordulara oranla düşer.
 */
export function attack(state, armyId, id, luck = null) {
  const army = armyById(state, armyId);
  if (!canAttack(state, army, id)) return null;
  // Saldırı kuşatmayı bitirir (kazansa da kaybetse de).
  delete army.besieging;
  delete army.besiegedSince;
  const pl = state.places[id];
  // Kışın denizden saldıran önce fırtınaya yakalanabilir.
  if (roadBetween(army.at, id).sea) storm(state, army, army.at);
  // Denizden saldırı: önce limandaki gemilerle deniz savaşı. Filo batarsa ordu denizde kaybolur.
  let navalEv = null;
  if (roadBetween(army.at, id).sea && shipsAt(state, id) > 0) {
    const nr = naval({ civ: army.owner, ships: army.ships }, { civ: pl.owner, ships: shipsAt(state, id), fort: fortOf(state, id) }, luck ?? rollLuck(state));
    navalEv = { won: nr.attWins, sunk: shipsAt(state, id) - nr.def, lost: army.ships - nr.att };
    sinkAt(state, id, nr.def);
    army.ships = nr.att;
    if (!nr.attWins) {
      state.trace?.push({ type: "attack", army: army.id, owner: army.owner, men: men(army), ships: army.ships, from: army.at, to: id, won: false, oldOwner: pl.owner });
      bury(state, army.owner, army.general);
      state.armies = state.armies.filter((a) => a !== army);
      return {
        type: "battle", turn: state.turn, attacker: army.owner, defender: pl.owner, place: id, won: false, drowned: true,
        naval: navalEv, before: { att: pickUnits(army), def: pickUnits(defenders(state, id)) },
        after: { att: pickUnits({}), def: pickUnits(defenders(state, id)) }, genFell: army.general?.name,
      };
    }
  }
  const def = defenders(state, id);
  const walls = wallsOf(state, id);
  const defGen = bestAt(state, id, pl.owner);
  const ter = terrainOf(army.at, id);
  const r = fight({ civ: army.owner, ...pickUnits(army), gen: army.general, terrain: ter.att }, { ...def, gen: defGen, terrain: ter.def }, walls, luck ?? rollLuck(state));
  const ev = {
    type: "battle", turn: state.turn, attacker: army.owner, defender: pl.owner, place: id,
    won: r.attWins, before: { att: pickUnits(army), def: pickUnits(def) },
    after: { att: r.att, def: r.def }, naval: navalEv,
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
    if (army.general) ev.gen = { name: army.general.name, ...learn(state, army.general, true, army.owner) };
  } else {
    // Savunanların sağ kalanları: her birim aynı oranda. (Bölüğe yuvarlanıyordu: 7 kişi 10
    // oluyordu, savaşı kazanan savunma asker kazanabiliyordu.)
    const units = [pl, ...armiesAt(state, id).filter((a) => a.owner === pl.owner)];
    for (const k of UNITS) {
      const keep = def[k] > 0 ? r.def[k] / def[k] : 0;
      for (const u of units) u[k] = Math.floor(u[k] * keep);
    }
    // Saldıranın generali ordusuyla öldü; savunmayı tutan general tecrübe kazandı.
    bury(state, army.owner, army.general);
    if (army.general) ev.genFell = army.general.name;
    if (defGen) learn(state, defGen, true, pl.owner);
    for (const a of state.armies) if (a.at === id && a.owner === pl.owner && empty(a)) bury(state, a.owner, a.general);
    state.armies = state.armies.filter((a) => a !== army && !(a.at === id && a.owner === pl.owner && empty(a)));
  }
  return ev;
}

const pickUnits = (u) => Object.fromEntries(UNITS.map((k) => [k, u[k] ?? 0]));

/** Bir yerin gemilerini `left` kadara indirir: önce limandakiler, sonra ordularınkiler batar. */
function sinkAt(state, id, left) {
  const pl = state.places[id];
  let sink = shipsAt(state, id) - left;
  const own = armiesAt(state, id).filter((a) => a.owner === pl.owner);
  for (const u of [pl, ...own]) {
    const n = Math.min(u.ships, sink);
    u.ships -= n;
    sink -= n;
  }
}

const rollLuck = (state) => [between(state, 1 - N.luck, 1 + N.luck), between(state, 1 - N.luck, 1 + N.luck)];

/** Yer el değiştirir: savunanlar yok olur, nüfusun dörtte biri kaçar, yapılar kalır. */
export function capture(state, id, civ) {
  const pl = state.places[id];
  const loser = pl.owner;
  for (const k of UNITS) pl[k] = 0;
  pl.ships = 0; // limandaki gemiler yakıldı
  pl.owner = civ;
  pl.pop = Math.round(pl.pop * (1 - N.captureLoss));
  pl.upgraded = true; // alındığı tur yükseltilmez
  pl.recruited = pl.barracks;
  // Yeni alınan yer huzursuz; bağımsızlığına dönen (isyan eden) yer ise kendi halkının.
  pl.loyalty = civ ? N.loyalty.captured : 100;
  // Eski sahibin oradaki orduları savunurken öldü; başkalarının (müttefik) orduları en yakın
  // kendi yerlerine çekilir, yoksa dağılır.
  for (const a of state.armies) if (a.at === id && a.owner === loser) bury(state, loser, a.general);
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
  for (const a of state.armies) if (a.owner === civ) a.moves = trait(civ, "moves") + (has(a.general, "swift") ? 1 : 0);
}
