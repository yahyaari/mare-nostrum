// Oyun durumu ve şehir kuralları: yeni oyun, üretim, yükseltme, asker basma, ordu kurma.
// Saf kurallar, DOM yok. Durum düz bir nesne: JSON'a yazılıp okunabilir (kayıt bu).
//
// Asker sayıları ADAM olarak tutuluyor; bölük 10 adam. Kaynaklar kesirli olabilir (kalenin
// yarım silahı), ekran aşağı yuvarlayarak gösteriyor.

import { CIVS, PLACES, ROADS } from "../data/world.js";
import { byId } from "./graph.js";
import { LEVELS, N, UNITS, trait } from "./numbers.js";
import { holds } from "./wonders.js";

export const VERSION = 8;

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
  if (s.version === 3) {
    for (const u of [...Object.values(s.places), ...s.armies]) u.ships ??= 0;
    s.version = 4;
  }
  if (s.version === 4) {
    for (const [id, p] of Object.entries(s.places)) {
      p.fishery ??= 0; p.trade ??= 0; p.fort ??= 0; p.built ??= 0;
      p.shipyard ??= byId[id].port ? 1 : 0;
    }
    s.version = 5;
  }
  if (s.version === 5) {
    s.missions ??= [];
    s.lastMission ??= 0;
    s.version = 6;
  }
  if (s.version === 6) {
    // Kronik: eski oyunun grafiği yükseltildiği turdan başlar.
    s.chronicle ??= { places: [], men: [] };
    s.annals ??= [];
    s.version = 7;
  }
  if (s.version === 7) {
    // İnşaatçılar: eski yükseltmeler anında bitmişti, yarım iş yok.
    for (const p of Object.values(s.places)) p.builds ??= [];
    s.version = 8;
  }
  return s;
}

// ---- yeni oyun ----

export function newGame(player, seed = 1, level = "normal") {
  const civs = {};
  for (const c of CIVS) civs[c.id] = { ...N.start.stock, alive: true };
  for (const [c, e] of Object.entries(N.start.extra ?? {})) civs[c].food += e.food ?? 0;
  const places = {};
  for (const p of PLACES) {
    const free = p.owner === null;
    const start = free ? N.start.free[p.big ? "big" : p.kind] : null;
    const lv = free ? start.level : p.capital ? 2 : 1;
    const place = {
      owner: p.owner, level: lv, industry: 1, farms: 1, barracks: 1,
      pop: 0, inf: 0, arch: 0, cav: 0, siege: 0, ships: 0, upgraded: false, recruited: 0,
      builds: [], // süren inşaatlar: { what, left, total, paid }
      // Liman yapıları (sadece limanda kullanılır). Tersane 1 ile başlar: gemi yapılabilsin.
      fishery: 0, shipyard: p.port ? 1 : 0, trade: 0, fort: 0, built: 0,
      loyalty: 100, games: false,
    };
    place.pop = Math.round(popCap(place, p.kind) * N.startPop);
    if (free) { place.inf = start.inf; place.arch = start.arch; }
    else place.inf = N.start.garrison[p.capital ? "capital" : p.kind];
    // Küçük medeniyetin fazladan askeri başkentinde.
    const extra = p.capital ? N.start.extra?.[p.owner] : null;
    if (extra) { place.inf += extra.inf ?? 0; place.arch += extra.arch ?? 0; }
    // Limanlarda başlangıç gemileri: Kartaca ilk turdan Sicilya'ya geçebilsin.
    if (p.port) place.ships = N.navy.start[free ? (p.big ? "freeBig" : "free") : p.capital ? "capital" : "port"];
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
    missions: [], lastMission: 0, // oyuncunun görevleri (missions.js); kendi zarı mrng
    chronicle: { places: [], men: [] }, annals: [], // kronik (chronicle.js)
    mrng: Math.imul(seed | 0 || 1, 0x9e3779b1) | 0 || 7,
    events: [], over: null,
  };
}

/** Bir medeniyetin başlangıç askeri (bütün yerlerinin garnizonu, küçüklerin fazlası dahil). */
export function startTroops(civ) {
  let inf = 0, arch = 0;
  for (const p of PLACES) {
    if (p.owner !== civ) continue;
    inf += N.start.garrison[p.capital ? "capital" : p.kind];
    if (p.capital) { inf += N.start.extra?.[civ]?.inf ?? 0; arch += N.start.extra?.[civ]?.arch ?? 0; }
  }
  return { inf, arch };
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

/** Karada dövüşenler (gemi ayrı sayılır). */
export const landMen = (u) => men(u);
/** Bir ordunun gemileri taşıyabildiği kadar askeri var mı: deniz yolundan geçebilir mi. */
// Askersiz filo da denize açılır (kullanıcı 21.10: "gemiler denizden yürüsün"); eskiden asker
// şartı vardı ve sadece gemiden filo deniz yolunu hiç kullanamıyordu.
export const canSail = (u) => (u.ships ?? 0) > 0 && (u.ships ?? 0) * N.navy.carry >= men(u);

/**
 * Abluka: limanın deniz yollarının öbür ucunda, sahibiyle savaşan birinin, limandakinden
 * fazla gemisi duruyor. Ablukadaki limanın balığı kesilir, vergisi yarıya iner.
 */
export function blockaded(state, id) {
  const p = byId[id], pl = state.places[id];
  if (!p.port || !pl.owner) return false;
  // Liman kalesi limanın gemilerini daha değerli kılar: ablukaya almak için daha çok gemi gerekir.
  const mine = (pl.ships + armiesAt(state, id).filter((a) => a.owner === pl.owner).reduce((n, a) => n + a.ships, 0))
    * (1 + (pl.fort ?? 0) * N.port.fortPerLevel);
  for (const r of seaLanes[id] ?? []) {
    const other = r.a === id ? r.b : r.a;
    let theirs = 0;
    for (const a of armiesAt(state, other)) if (relation(state, pl.owner, a.owner) === "war") theirs += a.ships;
    const op = state.places[other];
    if (op.owner && relation(state, pl.owner, op.owner) === "war") theirs += op.ships;
    if (theirs > mine) return true;
  }
  return false;
}

const seaLanes = {};
for (const r of ROADS) if (r.sea) { (seaLanes[r.a] ??= []).push(r); (seaLanes[r.b] ??= []).push(r); }

/** Nüfus tavanı. `kind`: "city" ya da "castle". */
export function popCap(place, kind) {
  const per = kind === "castle" ? N.castlePopPerLevel : N.popPerLevel;
  return place.level * per * trait(place.owner, "popCap");
}

/** Bir yerleşimin turluk üretimi. */
/** Bu yer kuşatmada mı (bir ordu önünde kamp kurmuş). */
export const besieged = (state, id) => state.armies.some((a) => a.besieging === id);

export function output(state, id) {
  const pl = state.places[id], p = byId[id], c = pl.owner;
  // Kuşatılan yer bir şey üretemez: tarlaya da limana da çıkılmıyor.
  if (besieged(state, id)) return { money: 0, weapons: 0, food: 0 };
  const castle = p.kind === "castle" ? N.castleOutput : 1;
  // Zorluk: bilgisayar medeniyetlerinin üretimi (oyuncunun değil).
  const ai = c && c !== state.player ? (LEVELS[state.level] ?? LEVELS.normal).aiOutput : 1;
  const shut = blockaded(state, id);
  // Liman: kendi 1 balığı + balıkçılık, ve ticaret parası. Ablukada balık yok, para yarı.
  const fish = p.port && !shut ? (N.fish + pl.fishery * N.port.fishPerLevel) * castle * trait(c, "fish") : 0;
  // Harikalar: Rodos Heykeli ticareti, Artemis Tapınağı bütün parayı artırır.
  const W = N.wonders;
  const trade = p.port ? pl.trade * N.port.tradePerLevel * castle * (holds(state, c, "colossus") ? W.colossusTrade : 1) : 0;
  const pilgrims = holds(state, c, "artemis") ? W.artemisMoney : 1;
  return {
    money: (pl.pop / N.taxPer + trade) * trait(c, "money") * ai * pilgrims * (shut ? N.navy.blockadeMoney : 1),
    weapons: pl.industry * castle * trait(c, "weapons") * ai,
    food: (pl.farms * N.wheatPerFarm * castle * trait(c, "wheat") + fish) * ai,
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
  // Gemiler: tayfa da yer.
  const ships = [...placesOf(state, civ).map((id) => state.places[id]), ...armiesOf(state, civ)].reduce((n, u) => n + (u.ships ?? 0), 0);
  b.upkeep += ships * N.navy.upkeep;
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
/** Sadece limanlarda: balıkçılık, tersane, ticaret, liman kalesi (bölüm 16). */
export const PORT_UPGRADES = ["fishery", "shipyard", "trade", "fort"];

/** Bir yükseltmenin fiyatı ve yapılıp yapılamayacağı. `why`: neden olmuyor. */
/** İnşaatçı sayısı: şehirde 2, kalede 1. */
export const buildersOf = (id) => (byId[id].kind === "castle" ? N.builders.castle : N.builders.city);

/** Boştaki inşaatçılar. */
export const freeBuilders = (state, id) => buildersOf(id) - (state.places[id].builds?.length ?? 0);

/** Bir yapının `next` seviyesine çıkması kaç tur sürer: o seviye kadar (şehir seviyesi, kışla, tersane +1). */
export const buildTurns = (what, next) => Math.max(1, next + (N.buildExtra[what] ?? 0));

/**
 * Bir yükseltme başlatılabilir mi. Dönen: { now, max, cost, turns, building, why }; why:
 * "notPort" | "max" | "needLevel" | "building" (o yapı zaten yapılıyor) | "done" (yer bu tur
 * alındı) | "busy" (boş inşaatçı yok) | "money" | null. `building`: süren iş.
 */
export function upgradeInfo(state, id, what) {
  const pl = state.places[id], p = byId[id];
  const now = pl[what];
  const max = what === "level" ? (p.kind === "castle" ? N.maxCastle : N.maxCity) : pl.level;
  const cost = (now + 1) * N.upgradeCost * (what === "level" ? N.levelCostMul : 1);
  const building = pl.builds?.find((b) => b.what === what) ?? null;
  let why = null;
  if (PORT_UPGRADES.includes(what) && !p.port) why = "notPort";
  else if (building) why = "building";
  else if (now >= max) why = what === "level" ? "max" : "needLevel";
  else if (pl.upgraded) why = "done";
  else if (freeBuilders(state, id) <= 0) why = "busy";
  else if (state.civs[pl.owner].money < cost) why = "money";
  return { now, max, cost, turns: buildTurns(what, now + 1), building, why };
}

/** Yükseltmeyi başlat: para şimdi ödenir, boş bir inşaatçı `turns` tur çalışır. */
export function upgrade(state, id, what) {
  const u = upgradeInfo(state, id, what);
  if (u.why) return false;
  const pl = state.places[id];
  state.civs[pl.owner].money -= u.cost;
  pl.builds.push({ what, left: u.turns, total: u.turns, paid: u.cost });
  return true;
}

/** Süren bir inşaatı bırak: parası geri gelir, inşaatçı boşalır. */
export function cancelBuild(state, id, what) {
  const pl = state.places[id];
  const b = pl.builds?.find((x) => x.what === what);
  if (!b) return false;
  state.civs[pl.owner].money += b.paid;
  pl.builds = pl.builds.filter((x) => x !== b);
  return true;
}

/**
 * Tur sonu: inşaatlar bir tur ilerler; biten yapı bir seviye yükselir, inşaatçısı boşalır.
 * Kuşatılan yerde inşaat durur (kimse dışarı çıkıp taş taşıyamaz).
 */
export function progressBuilds(state, events) {
  for (const [id, pl] of Object.entries(state.places)) {
    if (!pl.builds?.length || !pl.owner || besieged(state, id)) continue;
    for (const b of pl.builds) b.left -= 1;
    for (const b of pl.builds.filter((x) => x.left <= 0)) {
      pl[b.what] += 1;
      events.push({ type: "built", turn: state.turn, civ: pl.owner, place: id, what: b.what, level: pl[b.what] });
    }
    pl.builds = pl.builds.filter((x) => x.left > 0);
  }
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

// ---- gemi ----

/**
 * Gemi: limanın tersanesinde. Tersane seviyesi kadar gemi turda (asker hakkından ayrı); 1.
 * seviyeden sonraki her seviye gemiyi 1 para ucuzlatır.
 */
export function shipInfo(state, id) {
  const pl = state.places[id], civ = state.civs[pl.owner];
  const cost = { money: Math.max(1, N.navy.cost.money - Math.max(0, (pl.shipyard ?? 0) - 1) * N.port.shipDiscount), weapons: N.navy.cost.weapons };
  let why = null;
  if (!byId[id].port) why = "notPort";
  else if ((pl.shipyard ?? 0) < 1) why = "needShipyard";
  else if ((pl.built ?? 0) >= pl.shipyard) why = "done";
  else if (pl.pop < N.navy.pop + 10) why = "pop";
  else if (civ.money < cost.money) why = "money";
  else if (civ.weapons < cost.weapons) why = "weapons";
  return { cost, why, left: Math.max(0, (pl.shipyard ?? 0) - (pl.built ?? 0)) };
}

/** Limanda bir gemi yap. */
export function buildShip(state, id) {
  const si = shipInfo(state, id);
  if (si.why) return false;
  const pl = state.places[id], civ = state.civs[pl.owner];
  civ.money -= si.cost.money;
  civ.weapons -= si.cost.weapons;
  pl.pop -= N.navy.pop;
  pl.ships += 1;
  pl.built += 1;
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
export function formArmy(state, id, inf, arch, cav = 0, siege = 0, ships = 0) {
  const pl = state.places[id];
  const want = { inf, arch, cav, siege };
  if (!UNITS.every((k) => Number.isInteger(want[k]) && want[k] >= 0 && want[k] <= pl[k])) return null;
  if (!Number.isInteger(ships) || ships < 0 || ships > pl.ships) return null;
  if (men(want) <= 0 && ships <= 0) return null;
  for (const k of UNITS) pl[k] -= want[k];
  pl.ships -= ships;
  const army = { id: state.nextArmy++, owner: pl.owner, at: id, ...want, ships, moves: trait(pl.owner, "moves"), route: [], general: null };
  state.armies.push(army);
  return army;
}

/** Ordu kendi yerleşimindeyse garnizona katılır. */
export function station(state, armyId) {
  const a = armyById(state, armyId);
  if (!a || state.places[a.at].owner !== a.owner) return false;
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
  // İki general varsa daha tecrübelisi komutayı alır, öteki emekli olur (adı yine kullanılabilir).
  if (b.general && (!a.general || b.general.xp > a.general.xp)) a.general = b.general;
  a.route = [];
  state.armies = state.armies.filter((x) => x !== b);
  return true;
}

/**
 * Ordudan seçilen kartlar (`want`: { inf, arch, cav, siege, ships }) ayrı bir ordu olur, aynı
 * yerde ve aynı kalan hareketle. Hepsi ya da hiçbiri ayrılmaz; kuşatan ordu bölünmez.
 */
export function detach(state, armyId, want) {
  const a = armyById(state, armyId);
  if (!a || a.besieging) return null;
  const keys = [...UNITS, "ships"];
  const part = Object.fromEntries(keys.map((k) => [k, want[k] ?? 0]));
  if (!keys.every((k) => Number.isInteger(part[k]) && part[k] >= 0 && part[k] <= (a[k] ?? 0))) return null;
  const rest = Object.fromEntries(keys.map((k) => [k, (a[k] ?? 0) - part[k]]));
  if (empty(part) || empty(rest)) return null;
  for (const k of keys) a[k] = rest[k];
  const b = { id: state.nextArmy++, owner: a.owner, at: a.at, ...part, moves: a.moves, route: [], general: null };
  state.armies.push(b);
  return b;
}

// ---- birlik kartları ----
//
// Total War gibi (kullanıcı 22.10): askerler kart kart görünür, her kart bir bölük (10 adam);
// oyuncu kartları seçip ordu çıkarır, böler. Kartlar sayılardan çıkar - kurallar her türün adam
// sayısını tutmaya devam ediyor: 37 piyade 10, 10, 10 ve 7 kişilik dört kart. Savaşta eriyen
// bölük küçülür; yarım bölükler birleşince tamamlanır. Her gemi de bir kart.

/** Bir garnizonun ya da ordunun kartları, türlerin sırasıyla: [{ type, men }]. Gemiler sonda. */
export function cardsOf(u) {
  const out = [];
  for (const type of UNITS) {
    for (let n = u[type] ?? 0; n > 0; n -= N.company) out.push({ type, men: Math.min(N.company, n) });
  }
  for (let i = 0; i < (u.ships ?? 0); i++) out.push({ type: "ships", men: 1 });
  return out;
}

/** Seçilen kartların (`picks`: kartların sıraları) toplamı: { inf, arch, cav, siege, ships }. */
export function chosen(u, picks) {
  const cards = cardsOf(u);
  const want = { inf: 0, arch: 0, cav: 0, siege: 0, ships: 0 };
  for (const i of picks) if (cards[i]) want[cards[i].type] += cards[i].men;
  return want;
}
