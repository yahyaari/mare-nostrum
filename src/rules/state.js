// Oyun durumu ve şehir kuralları: yeni oyun, üretim, yükseltme, asker basma, ordu kurma.
// Saf kurallar, DOM yok. Durum düz bir nesne: JSON'a yazılıp okunabilir (kayıt bu).
//
// Asker sayıları ADAM olarak tutuluyor; bölük 10 adam. Kaynaklar kesirli olabilir (kalenin
// yarım silahı), ekran aşağı yuvarlayarak gösteriyor.

import { CIVS, PLACES } from "../data/world.js";
import { byId } from "./graph.js";
import { LEVELS, N, UNITS, trait } from "./numbers.js";

export const VERSION = 3;

/** Eski kayıtları bugünün biçimine getirir (1 -> 2: sadakat, gelen kutusu, ateşkes). */
export function migrate(s) {
  if (s.version === 1) {
    for (const p of Object.values(s.places)) { p.loyalty ??= 100; p.games ??= false; }
    for (const a of s.armies) a.general ??= null;
    s.inbox ??= [];
    s.truce ??= {};
    s.offered ??= {};
    s.version = 2;
  }
  if (s.version === 2) {
    for (const u of [...Object.values(s.places), ...s.armies]) { u.cav ??= 0; u.siege ??= 0; }
    s.version = 3;
  }
  return s;
}

// ---- yeni oyun ----

export function newGame(player, seed = 1, level = "normal") {
  const civs = {};
  for (const c of CIVS) civs[c.id] = { ...N.start.stock, alive: true };
  const places = {};
  for (const p of PLACES) {
    const free = p.owner === null;
    const start = free ? N.start.free[p.big ? "big" : p.kind] : null;
    const lv = free ? start.level : p.capital ? 2 : 1;
    const place = {
      owner: p.owner, level: lv, industry: 1, farms: 1, barracks: 1,
      pop: 0, inf: 0, arch: 0, cav: 0, siege: 0, upgraded: false, recruited: 0,
      loyalty: 100, games: false,
    };
    place.pop = Math.round(popCap(place, p.kind) * N.startPop);
    if (free) { place.inf = start.inf; place.arch = start.arch; }
    else place.inf = N.start.garrison[p.capital ? "capital" : p.kind];
    places[p.id] = place;
  }
  return {
    version: VERSION, turn: 1, player, level, rng: seed | 0 || 1,
    civs, places, armies: [], nextArmy: 1,
    relations: {}, // "a|b" -> "ally" | "war"; yazılmayan tarafsız
    cooldown: {}, // "a|b" -> ittifakın bozulduğu tur: o tur savaş ilan edilemez
    asked: {}, // "a|b" -> ittifak teklif edilen tur: turda bir kere
    truce: {}, // "a|b" -> bu tura kadar bilgisayar savaş açmaz (haraç ödendi)
    offered: {}, // "a|b" -> bilgisayarın oyuncuya son teklif ettiği tur
    inbox: [], // oyuncunun karar vermesi gereken olaylar ve teklifler
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

/** Nüfus tavanı. `kind`: "city" ya da "castle". */
export function popCap(place, kind) {
  const per = kind === "castle" ? N.castlePopPerLevel : N.popPerLevel;
  return place.level * per * trait(place.owner, "popCap");
}

/** Bir yerleşimin turluk üretimi. */
export function output(state, id) {
  const pl = state.places[id], p = byId[id], c = pl.owner;
  const castle = p.kind === "castle" ? N.castleOutput : 1;
  // Zorluk: bilgisayar medeniyetlerinin üretimi (oyuncunun değil).
  const ai = c && c !== state.player ? (LEVELS[state.level] ?? LEVELS.normal).aiOutput : 1;
  return {
    money: (pl.pop / N.taxPer) * trait(c, "money") * ai,
    weapons: pl.industry * castle * trait(c, "weapons") * ai,
    food: (pl.farms * N.wheatPerFarm * castle * trait(c, "wheat") + (p.port ? N.fish * trait(c, "fish") : 0)) * ai,
  };
}

/** Bir medeniyetin bütün askeri, adam. */
export function strength(state, civ) {
  let n = 0;
  for (const id of placesOf(state, civ)) n += men(state.places[id]);
  for (const a of armiesOf(state, civ)) n += men(a);
  return n;
}

/** Turluk gelir ve gider: ekrandaki "+12" ile tur sonunda olan aynı hesap. */
export function budget(state, civ) {
  const b = { money: 0, weapons: 0, food: 0, upkeep: 0 };
  for (const id of placesOf(state, civ)) {
    const o = output(state, id);
    b.money += o.money;
    b.weapons += o.weapons;
    b.food += o.food;
  }
  // İaşeci generalin ordusu yarı yiyecek yer.
  const fed = armiesOf(state, civ).reduce((n, a) => n + (a.general?.traits.includes("supply") ? men(a) / 2 : 0), 0);
  // Süvarinin atları da yer: süvari bölüğü iki bölük sayılır.
  const horses = [...placesOf(state, civ).map((id) => state.places[id]), ...armiesOf(state, civ)].reduce((n, u) => n + (u.cav ?? 0), 0);
  b.upkeep = Math.ceil((strength(state, civ) - fed + horses * (N.cavUpkeep - 1)) / N.company) * N.upkeep;
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
export const atWar = (state, a, b) => relation(state, a, b) === "war";
export const enemiesOf = (state, civ) => CIVS.map((c) => c.id).filter((o) => state.civs[o].alive && atWar(state, civ, o));

// ---- yükseltme ----

export const UPGRADES = ["level", "farms", "industry", "barracks"];

/** Bir yükseltmenin fiyatı ve yapılıp yapılamayacağı. `why`: neden olmuyor. */
export function upgradeInfo(state, id, what) {
  const pl = state.places[id], p = byId[id];
  const now = pl[what];
  const max = what === "level" ? (p.kind === "castle" ? N.maxCastle : N.maxCity) : pl.level;
  const cost = (now + 1) * N.upgradeCost * (what === "level" ? N.levelCostMul : 1);
  let why = null;
  if (now >= max) why = what === "level" ? "max" : "needLevel";
  else if (pl.upgraded) why = "done";
  else if (state.civs[pl.owner].money < cost) why = "money";
  return { now, max, cost, why };
}

export function upgrade(state, id, what) {
  const u = upgradeInfo(state, id, what);
  if (u.why) return false;
  const pl = state.places[id];
  state.civs[pl.owner].money -= u.cost;
  pl[what] += 1;
  pl.upgraded = true;
  return true;
}

// ---- sadakat: oyunlar ----

/** Oyunlar düzenle: para karşılığı sadakat, yerleşim başına turda bir kere. */
export function gamesInfo(state, id) {
  const pl = state.places[id];
  let why = null;
  if (pl.games) why = "done";
  else if (pl.loyalty >= 100) why = "max";
  else if (state.civs[pl.owner].money < N.loyalty.gamesCost) why = "money";
  return { cost: N.loyalty.gamesCost, gain: N.loyalty.gamesGain, why };
}

export function holdGames(state, id) {
  if (gamesInfo(state, id).why) return false;
  const pl = state.places[id];
  state.civs[pl.owner].money -= N.loyalty.gamesCost;
  pl.loyalty = Math.min(100, pl.loyalty + N.loyalty.gamesGain);
  pl.games = true;
  return true;
}

// ---- asker basma ----

export function recruitCost(civ, type) {
  const c = N.cost[type];
  return { money: c.money * trait(civ, "recruitMoney", 1), weapons: c.weapons, food: c.food };
}

export function recruitInfo(state, id, type) {
  const pl = state.places[id];
  const civ = state.civs[pl.owner];
  const cost = recruitCost(pl.owner, type);
  let why = null;
  if (type === "arch" && pl.barracks < 2) why = "needBarracks";
  else if (type === "cav" && pl.barracks < 3) why = "needBarracks3";
  else if (type === "siege" && pl.industry < 3) why = "needIndustry3";
  else if (pl.recruited >= pl.barracks) why = "done";
  else if (pl.pop < N.company + 10) why = "pop"; // şehri boşaltma: en az 10 kişi kalsın
  else if (civ.money < cost.money) why = "money";
  else if (civ.weapons < cost.weapons) why = "weapons";
  else if (civ.food < cost.food) why = "food";
  return { cost, why, left: Math.max(0, pl.barracks - pl.recruited) };
}

export function recruit(state, id, type) {
  const r = recruitInfo(state, id, type);
  if (r.why) return false;
  const pl = state.places[id];
  const civ = state.civs[pl.owner];
  civ.money -= r.cost.money;
  civ.weapons -= r.cost.weapons;
  civ.food -= r.cost.food;
  pl.pop -= N.company;
  pl[type] += N.company;
  pl.recruited += 1;
  return true;
}

// ---- ordular ----

/**
 * Garnizondan ordu çıkarır. Sayılar bölüğün katı olmak zorunda değil: savaş ve açlık
 * kayıpları bölük gözetmiyor, garnizonda kalan 7 adam da yola çıkabilmeli.
 */
export function formArmy(state, id, inf, arch, cav = 0, siege = 0) {
  const pl = state.places[id];
  const want = { inf, arch, cav, siege };
  if (!UNITS.every((k) => Number.isInteger(want[k]) && want[k] >= 0 && want[k] <= pl[k])) return null;
  if (men(want) <= 0) return null;
  for (const k of UNITS) pl[k] -= want[k];
  const army = { id: state.nextArmy++, owner: pl.owner, at: id, ...want, moves: trait(pl.owner, "moves"), route: [], general: null };
  state.armies.push(army);
  return army;
}

/** Ordu kendi yerleşimindeyse garnizona katılır. */
export function station(state, armyId) {
  const a = armyById(state, armyId);
  if (!a || state.places[a.at].owner !== a.owner) return false;
  for (const k of UNITS) state.places[a.at][k] += a[k];
  state.armies = state.armies.filter((x) => x !== a);
  return true;
}

/** Aynı yerdeki iki ordu birleşir. Kalan hareket, ikisinin azı. */
export function merge(state, intoId, fromId) {
  const a = armyById(state, intoId), b = armyById(state, fromId);
  if (!a || !b || a === b || a.at !== b.at || a.owner !== b.owner) return false;
  for (const k of UNITS) a[k] += b[k];
  a.moves = Math.min(a.moves, b.moves);
  // İki general varsa daha tecrübelisi komutayı alır, öteki emekli olur (adı yine kullanılabilir).
  if (b.general && (!a.general || b.general.xp > a.general.xp)) a.general = b.general;
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
  const b = { id: state.nextArmy++, owner: a.owner, at: a.at, ...part, moves: a.moves, route: [], general: null };
  state.armies.push(b);
  return b;
}
