// Oyun durumu ve şehir kuralları (SADE SÜRÜM, kurallar.md): yeni oyun, gelir-gider,
// geliştirme, asker basma, gemi, ordu kurma. Saf kurallar, DOM yok. Durum düz bir nesne:
// JSON'a yazılıp okunabilir (kayıt bu).
//
// Asker sayıları ADAM olarak tutuluyor; bölük 10 adam. Kaynaklar kesirli olabilir (kalenin
// yarım altını), ekran aşağı yuvarlayarak gösteriyor.

import { CIVS, PLACES } from "../data/world.js";
import { byId } from "./graph.js";
import { LEVELS, N, UNITS, trait } from "./numbers.js";

export const VERSION = 8;

/**
 * Eski kayıtları bugünün biçimine getirir. 8: sade sürüm - silah, nüfus, sadakat, liman
 * yapıları, generaller, kuşatma makineleri, görevler, mektuplar kalktı; makineler piyadeye
 * döner, seviyeler sınıra çekilir. Eski oyun kaldığı yerden sade kurallarla sürer.
 */
export function migrate(s) {
  if (!s || s.version >= VERSION) return s;
  for (const c of Object.values(s.civs)) { delete c.weapons; c.money ??= 0; c.food ??= 0; }
  for (const [id, p] of Object.entries(s.places)) {
    const max = byId[id]?.kind === "castle" ? N.maxCastle : N.maxCity;
    const keep = { owner: p.owner, level: Math.min(max, Math.max(1, p.level ?? 1)), inf: (p.inf ?? 0) + (p.siege ?? 0), arch: p.arch ?? 0, cav: p.cav ?? 0, ships: p.ships ?? 0, upgraded: false, recruited: 0, built: 0 };
    s.places[id] = keep;
  }
  s.armies = (s.armies ?? []).map((a) => ({ id: a.id, owner: a.owner, at: a.at, inf: (a.inf ?? 0) + (a.siege ?? 0), arch: a.arch ?? 0, cav: a.cav ?? 0, ships: a.ships ?? 0, moves: a.moves ?? 1, route: a.route ?? [] }));
  for (const k of ["inbox", "missions", "lastMission", "mrng", "truce", "offered", "fallenGenerals", "nextItem", "storms"]) delete s[k];
  s.chronicle ??= { places: [], men: [] };
  s.annals ??= [];
  s.cooldown ??= {};
  s.asked ??= {};
  s.version = VERSION;
  return s;
}

// ---- yeni oyun ----

export function newGame(player, seed = 1, level = "normal") {
  const civs = {};
  for (const c of CIVS) civs[c.id] = { money: N.start.money, food: N.start.food, alive: true };
  const places = {};
  for (const p of PLACES) {
    const free = p.owner === null;
    const start = free ? N.free[p.big ? "big" : p.kind] : null;
    const place = {
      owner: p.owner, level: free ? start.level : p.capital ? 2 : 1,
      inf: 0, arch: 0, cav: 0, ships: 0, upgraded: false, recruited: 0, built: 0,
    };
    if (free) { place.inf = start.inf; place.arch = start.arch; }
    else place.inf = N.garrison[p.capital ? "capital" : p.kind];
    if (p.port) place.ships = N.startShips[free ? "free" : p.capital ? "capital" : "port"];
    places[p.id] = place;
  }
  return {
    version: VERSION, turn: 1, player, level, rng: seed | 0 || 1,
    civs, places, armies: [], nextArmy: 1,
    relations: {}, // "a|b" -> "ally" | "war"; yazılmayan tarafsız
    cooldown: {}, // "a|b" -> ittifakın bozulduğu ya da barışın yapıldığı tur: o tur savaş açılmaz
    asked: {}, // "a|b" -> teklif edilen tur: turda bir kere
    chronicle: { places: [], men: [] }, annals: [], // kronik (chronicle.js)
    events: [], over: null,
  };
}

// ---- sorular ----

export const info = (id) => byId[id];
export const placesOf = (state, civ) => Object.keys(state.places).filter((id) => state.places[id].owner === civ);
export const armiesOf = (state, civ) => state.armies.filter((a) => a.owner === civ);
export const armiesAt = (state, id) => state.armies.filter((a) => a.at === id);
export const armyById = (state, id) => state.armies.find((a) => a.id === id) ?? null;
export const men = (u) => UNITS.reduce((n, k) => n + (u[k] ?? 0), 0);
/** Ne askeri ne gemisi kalmış ordu: silinir. (Sadece gemiden oluşan filo boş değildir.) */
export const empty = (u) => men(u) === 0 && !(u.ships > 0);
/** Gemileri bütün askerini taşıyabiliyor mu: deniz yolundan geçebilir mi. */
export const canSail = (u) => (u.ships ?? 0) > 0 && (u.ships ?? 0) * N.ship.carry >= men(u);
/** Sur: başkent, kale, 3. seviye ve üstü şehir. */
export const walled = (state, id) => byId[id].capital || byId[id].kind === "castle" || state.places[id].level >= N.wallLevel;

/** Bir yerin turluk geliri. Bilgisayarın geliri zorluğa göre. */
export function output(state, id) {
  const pl = state.places[id], p = byId[id], c = pl.owner, I = N.income;
  const k = p.kind === "castle" ? I.castle : 1;
  const ai = c && c !== state.player ? (LEVELS[state.level] ?? LEVELS.normal).aiOutput : 1;
  return {
    money: (I.money(pl.level) + (p.capital ? I.capital : 0)) * k * trait(c, "money") * ai,
    food: (I.food(pl.level) + (p.port ? I.port : 0)) * k * trait(c, "food") * ai,
  };
}

/** Bir medeniyetin bütün askeri, adam. */
export function strength(state, civ) {
  let n = 0;
  for (const id of placesOf(state, civ)) n += men(state.places[id]);
  for (const a of armiesOf(state, civ)) n += men(a);
  return n;
}

/** Bakım: bölük başına yemek (süvari iki). */
export const upkeepOf = (u) => UNITS.reduce((n, k) => n + ((u[k] ?? 0) / N.company) * N.upkeep[k], 0);

/** Turluk gelir ve gider: ekrandaki "+12" ile tur sonunda olan aynı hesap. */
export function budget(state, civ) {
  const b = { money: 0, food: 0, upkeep: 0 };
  for (const id of placesOf(state, civ)) {
    const o = output(state, id);
    b.money += o.money;
    b.food += o.food;
  }
  for (const u of [...placesOf(state, civ).map((id) => state.places[id]), ...armiesOf(state, civ)]) b.upkeep += upkeepOf(u);
  b.upkeep = Math.ceil(b.upkeep);
  b.food -= b.upkeep;
  return b;
}

// ---- ilişkiler ----

export const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export function relation(state, a, b) {
  if (a === b) return "self";
  if (a === null || b === null) return "free";
  return state.relations[key(a, b)] ?? "neutral";
}
export const enemiesOf = (state, civ) => CIVS.map((c) => c.id).filter((o) => o !== civ && state.civs[o].alive && relation(state, civ, o) === "war");

// ---- geliştirme ----

/** Geliştir: seviye +1. Dönen: { now, cost, why }; why: "max" | "done" | "money" | null. */
export function upgradeInfo(state, id) {
  const pl = state.places[id], p = byId[id];
  const max = p.kind === "castle" ? N.maxCastle : N.maxCity;
  const cost = (pl.level + 1) * N.upgradeCost;
  let why = null;
  if (pl.level >= max) why = "max";
  else if (pl.upgraded) why = "done";
  else if (state.civs[pl.owner].money < cost) why = "money";
  return { now: pl.level, max, cost, why };
}

export function upgrade(state, id) {
  const u = upgradeInfo(state, id);
  if (u.why) return false;
  const pl = state.places[id];
  state.civs[pl.owner].money -= u.cost;
  pl.level += 1;
  pl.upgraded = true;
  return true;
}

// ---- asker basma ----

/** Bir bölüğün altın fiyatı (Galyalılar ucuz). */
export const recruitCost = (civ, type) => Math.round(N.cost[type] * trait(civ, "price") * 10) / 10;

/** Turda kaç bölük basılabilir: şehrin seviyesi kadar. */
export const recruitLimit = (state, id) => state.places[id].level;

/** Bir bölük basılabilir mi. why: "done" (bu turun hakkı bitti) | "money" | null. */
export function recruitInfo(state, id, type) {
  const pl = state.places[id];
  const cost = recruitCost(pl.owner, type);
  const left = recruitLimit(state, id) - pl.recruited;
  let why = null;
  if (left <= 0) why = "done";
  else if (state.civs[pl.owner].money < cost) why = "money";
  return { cost, left: Math.max(0, left), why };
}

export function recruit(state, id, type) {
  const r = recruitInfo(state, id, type);
  if (r.why) return false;
  const pl = state.places[id];
  state.civs[pl.owner].money -= r.cost;
  pl[type] += N.company;
  pl.recruited += 1;
  return true;
}

// ---- gemi ----

/** Gemi: limanda, turda bir. why: "notPort" | "done" | "money" | null. */
export function shipInfo(state, id) {
  const pl = state.places[id];
  const cost = N.ship.cost * trait(pl.owner, "ship");
  let why = null;
  if (!byId[id].port) why = "notPort";
  else if (pl.built >= 1) why = "done";
  else if (state.civs[pl.owner].money < cost) why = "money";
  return { cost, why };
}

export function buildShip(state, id) {
  const si = shipInfo(state, id);
  if (si.why) return false;
  const pl = state.places[id];
  state.civs[pl.owner].money -= si.cost;
  pl.ships += 1;
  pl.built += 1;
  return true;
}

// ---- ordular ----

/** Garnizondan ordu çıkar. Sayılar adam (bölük değil); gemiler de alınabilir. */
export function formArmy(state, id, inf, arch, cav = 0, ships = 0) {
  const pl = state.places[id];
  const want = { inf, arch, cav };
  if (!UNITS.every((k) => Number.isInteger(want[k]) && want[k] >= 0 && want[k] <= pl[k])) return null;
  if (!Number.isInteger(ships) || ships < 0 || ships > pl.ships) return null;
  if (men(want) <= 0 && ships <= 0) return null;
  for (const k of UNITS) pl[k] -= want[k];
  pl.ships -= ships;
  const army = { id: state.nextArmy++, owner: pl.owner, at: id, ...want, ships, moves: trait(pl.owner, "moves"), route: [] };
  state.armies.push(army);
  return army;
}

/** Ordu garnizona katılabilir mi: kendi yerinde; gemisi varsa orası liman olmalı (gemi karada durmaz). */
export const canStation = (state, a) => !!a && state.places[a.at].owner === a.owner && (!(a.ships > 0) || !!byId[a.at].port);

/** Ordu kendi yerleşimindeyse garnizona katılır. */
export function station(state, armyId) {
  const a = armyById(state, armyId);
  if (!canStation(state, a)) return false;
  for (const k of UNITS) state.places[a.at][k] += a[k];
  state.places[a.at].ships += a.ships;
  state.armies = state.armies.filter((x) => x !== a);
  return true;
}

/** Aynı yerdeki iki ordu birleşir. Kalan hareket, ikisinin azı. */
export function merge(state, intoId, fromId) {
  const a = armyById(state, intoId), b = armyById(state, fromId);
  if (!a || !b || a === b || a.at !== b.at || a.owner !== b.owner) return false;
  for (const k of UNITS) a[k] += b[k];
  a.ships += b.ships;
  a.moves = Math.min(a.moves, b.moves);
  a.route = [];
  state.armies = state.armies.filter((x) => x !== b);
  return true;
}

/** Orduyu ikiye böler: her türün yarısı (bölük hesabıyla) yeni orduya. */
export function split(state, armyId) {
  const a = armyById(state, armyId);
  if (!a) return null;
  const half = (n) => Math.floor(n / N.company / 2) * N.company;
  const part = Object.fromEntries(UNITS.map((k) => [k, half(a[k])]));
  if (men(part) <= 0) return null;
  for (const k of UNITS) a[k] -= part[k];
  const ships = Math.floor(a.ships / 2);
  a.ships -= ships;
  const b = { id: state.nextArmy++, owner: a.owner, at: a.at, ...part, ships, moves: a.moves, route: [] };
  state.armies.push(b);
  return b;
}
