// Barbarlar (kurallar.md bölüm 26). Kullanıcı 26.10: "oyun başta beni tutamıyor; savaşlar
// başladıktan sonra iyileşiyor" -> ilk turlardan itibaren savaşılacak düşman (Civilization'ın
// barbar kampları gibi).
//
// Kamp: sahibi olmayan, yerinden kıpırdamayan bir ordu (`camp`), haritanın boş yerlerinde; her
// başkentin yakınında bir tane (herkesin ilk hedefi), gerisi rastgele. Kamplar büyür; ara ara
// yakındaki bir yerleşime akıncı (`raider`) yollar. Akıncılar yürür, menzile girince saldırır:
// kazanırlarsa yağmalarlar (garnizon ölür, nüfusun dörtte biri ve kasadan para gider, süren
// inşaat yıkılır, sadakat düşer; yer sahibinde kalır), kaybederlerse dağılırlar. İlk denemede
// yerleşimi alıyorlardı: 14 bot oyununda 33 şehir, yeni oyuncu 10. turda şehrini kaybedebiliyordu.
// Kampı dağıtan ganimet alır (moves.js strike). Zamanla yeni kamplar kurulur.
//
// Barbarlar herkese düşman (moves.js isFoe: sahipsiz ordu), kimseyi öfkelendirmez, tutum ve
// diplomasiyle işi yoktur.

import { PLACES } from "../data/world.js";
import { N } from "./numbers.js";
import { between, random } from "./rng.js";
import { fight } from "./combat.js";
import { countWin } from "./victory.js";
import { H, PLACE_CELL, POS, W, centre, dist, field, isLand, isRoad, placeAtCell } from "./map.js";
import { canAttack, forecast, order, sides } from "./moves.js";
import { armiesAt, empty, men } from "./state.js";
import { UNITS } from "./numbers.js";
import { hordeTarget } from "./crises.js";
import { deferRaid } from "./incoming.js";

const B = () => N.barbarians;

// Kamp kurulabilecek kareler, sahiplikten bağımsız kısmı bir kere: kara, yol değil, her yerleşimin
// çevresinin dışında. (Her yeni oyunda bütün kareleri taramak 200 ms sürüyordu; testler yüzlerce oyun açar.)
let STATIC = null;
function staticSpots() {
  if (STATIC) return STATIC;
  const all = PLACES.map((p) => POS[p.id]);
  STATIC = [];
  for (let c = 0; c < W * H; c += 1) {
    if (!isLand(c) || placeAtCell(c) || isRoad(c)) continue;
    const p = centre(c);
    if (all.some((q) => dist(p, q) < N.reach.hold + 0.5)) continue;
    STATIC.push({ c, x: p.x, y: p.y });
  }
  return STATIC;
}

/** Kara, yol olmayan, yerleşimlerin dibinde olmayan noktalar (büyük göç de buralardan gelir, crises.js). */
export const landSpots = () => staticSpots();

/** Bir kamp kurulabilecek kareler: sahibi olan her yerleşimden ve öteki kamplardan uzak (`near`: bir başkentin yakını). */
function freeSpots(state, near = null) {
  const owned = PLACES.filter((p) => state.places[p.id].owner).map((p) => POS[p.id]);
  const camps = state.armies.filter((a) => a.camp);
  const out = [];
  for (const p of staticSpots()) {
    if (near && (dist(p, near) < B().minDist || dist(p, near) > B().nearMax)) continue;
    if (owned.some((q) => dist(p, q) < B().minDist)) continue;
    if (camps.some((a) => dist(p, a) < B().spacing)) continue;
    out.push(p.c);
  }
  return out;
}

function makeCamp(state, c) {
  const a = {
    id: state.nextArmy++, owner: null, barbarian: true, camp: true, at: null, ...centre(c),
    inf: B().start, arch: Math.round(B().start / 3), cav: 0, siege: 0, elite: 0, ships: 0, trireme: 0, quinq: 0,
    mp: 0, route: [], general: null, xp: 0, born: state.turn,
  };
  state.armies.push(a);
  return a;
}

/**
 * Oyun başı: her başkentin yakınında bir kamp, gerisi rastgele (`camps` tanesine kadar). Başkentin
 * kampı karadan yürünerek varılabilen bir yerde (Kartaca'nınki Sardinya'ya düşüyordu: ilk hedef için
 * gemi gerekmesin); `home`: kimin ilk hedefi (öğretici balonu onu gösterir).
 */
export function spawnCamps(state) {
  const pick = (list) => list[Math.floor(random(state) * list.length)];
  for (const p of PLACES.filter((q) => q.capital)) {
    const at = POS[p.id];
    const spots = freeSpots(state, at);
    // Başkentten kara yoluyla: arama başkentin çevresindeki daireyle sınırlı.
    const walk = field(PLACE_CELL[p.id], { enter: (c) => isLand(c) && dist(centre(c), at) <= B().nearMax + 1 });
    const land = spots.filter((c) => walk.cost(c) < Infinity);
    if (spots.length) makeCamp(state, pick(land.length ? land : spots)).home = state.places[p.id].owner;
  }
  for (let guard = 0; guard < 40 && state.armies.filter((a) => a.camp).length < B().camps; guard++) {
    const spots = freeSpots(state);
    if (!spots.length) break;
    makeCamp(state, pick(spots));
  }
  state.barbarians = { lastCamp: state.turn };
}

/**
 * Tur sonu (bilgisayarlar oynadıktan sonra): kamplar büyür ve akıncı yollar, akıncılar yürür ve
 * saldırır, ara ara yeni kamp kurulur. Dönen olaylar `events`e eklenir.
 */
export function tickBarbarians(state, events) {
  if (!state.barbarians) return;
  const b = B();
  for (const a of state.armies.filter((x) => x.camp)) {
    a.inf = Math.min(b.cap, a.inf + b.grow);
    // Akın: başta yok, sonra kamp büyükse ara ara.
    if (state.turn < b.from || men(a) < b.raidMin || random(state) > 1 / b.raidEvery) continue;
    const target = raidTarget(state, a);
    if (!target) continue;
    const k = 0.5;
    const r = {
      id: state.nextArmy++, owner: null, barbarian: true, raider: true, target, at: null, x: a.x, y: a.y,
      inf: Math.floor(a.inf * k), arch: Math.floor(a.arch * k), cav: 0, siege: 0, elite: 0, ships: 0, trireme: 0, quinq: 0,
      mp: N.march.mp, route: [], general: null, xp: 0,
    };
    a.inf -= r.inf;
    a.arch -= r.arch;
    state.armies.push(r);
    events.push({ type: "raidOut", turn: state.turn, target, owner: state.places[target].owner, men: men(r) });
  }
  // Akıncılar: hedefe yürür, menzildeyse saldırır; hedef artık yoksa ya da yol yoksa dağılır.
  for (const r of state.armies.filter((x) => x.raider && !x.at)) {
    r.mp = N.march.mp;
    // Büyük göç (crises.js): ömrü dolunca dağılır; hedefi el değiştirdiyse yenisini seçer.
    if (r.horde && state.turn - r.born > N.crises.horde.life) {
      state.armies = state.armies.filter((x) => x !== r);
      events.push({ type: "hordeGone", turn: state.turn, civ: r.victim });
      continue;
    }
    if (r.horde && !state.places[r.target]?.owner) r.target = hordeTarget(state, r) ?? r.target;
    const pl = state.places[r.target];
    if (!pl?.owner) { state.armies = state.armies.filter((x) => x !== r); continue; }
    if (!canAttack(state, r, r.target)) order(state, r.id, { place: r.target });
    if (!state.armies.includes(r)) continue;
    // Oyuncunun yerine akın: oyuncu kendi turunda karar verir (incoming.js); sorulmuşsa bekler.
    if (canAttack(state, r, r.target) && (state.incoming ?? []).some((x) => x.from === r.id)) continue;
    if (canAttack(state, r, r.target) && deferRaid(state, r, r.target)) continue;
    if (canAttack(state, r, r.target)) raid(state, r, r.target, events);
    else if (!r.route.length) state.armies = state.armies.filter((x) => x !== r);
  }
  // Yeni kamp: ara ara, en çok `max` tane.
  if (state.turn - (state.barbarians.lastCamp ?? 0) >= b.spawnEvery && state.armies.filter((x) => x.camp).length < b.max) {
    const spots = freeSpots(state);
    if (spots.length) {
      const c = makeCamp(state, spots[Math.floor(random(state) * spots.length)]);
      c.inf = Math.round(b.start * 0.7);
      events.push({ type: "campNew", turn: state.turn, x: c.x, y: c.y });
    }
    state.barbarians.lastCamp = state.turn;
  }
}

/**
 * Akın: akıncılar yerleşime saldırır. Kazanırlarsa yağmalar ve ganimetle döner (dağılır), kaybederse
 * dağılır; ikisinde de yer sahibinde kalır. Savunanların kayıpları normal savaştaki gibi.
 */
/** Oyuncunun kararından sonra akın (incoming.js): `result` taktik savaşın sonucu. Dönen savaş olayı. */
export function raidOn(state, r, id, result = null) {
  const events = [];
  raid(state, r, id, events, result);
  return events.find((e) => e.type === "battle") ?? null;
}

function raid(state, r, id, events, result = null) {
  const pl = state.places[id], owner = pl.owner;
  const sd = sides(state, r, null, id);
  const res = result ?? fight(sd.att, sd.def, sd.walls, [between(state, 1 - N.luck, 1 + N.luck), between(state, 1 - N.luck, 1 + N.luck)]);
  const ev = {
    type: "battle", turn: state.turn, attacker: null, defender: owner, place: id, won: res.attWins, barbarians: true,
    before: { att: Object.fromEntries(UNITS.map((k) => [k, r[k] ?? 0])), def: Object.fromEntries(UNITS.map((k) => [k, sd.def[k] ?? 0])) },
    after: { att: res.att, def: res.def }, naval: null,
  };
  // Tur gösterisinde akıncı kapıya yürür ve söner (içeri girmez).
  state.trace?.push({ type: "attack", army: r.id, owner: null, men: men(r), ships: 0, path: [[r.x, r.y], [POS[id].x, POS[id].y]], at: id, won: false, oldOwner: owner });
  // Savunanların sağ kalanları: her birim aynı oranda (yağmada hepsi ölür).
  const units = [pl, ...armiesAt(state, id).filter((a) => a.owner === owner)];
  for (const k of UNITS) {
    const keep = sd.def[k] > 0 ? res.def[k] / sd.def[k] : 0;
    for (const u of units) u[k] = Math.floor(u[k] * keep);
  }
  // Akıncı yağmadan sonra dağılır; büyük göç sağ kalanlarıyla bir sonraki şehre yürür.
  const onward = r.horde && res.attWins ? hordeTarget(state, { ...r, x: POS[id].x, y: POS[id].y }, id) : null;
  if (onward) {
    for (const k of UNITS) r[k] = res.att[k];
    r.target = onward;
  }
  state.armies = state.armies.filter((a) => (a !== r || (onward && !empty(r))) && !(a.at === id && a.owner === owner && empty(a)));
  if (res.attWins) {
    const b = B();
    const lost = Math.round(pl.pop * b.sackPop);
    const money = Math.min(Math.floor(state.civs[owner].money), b.sackMoney);
    pl.pop -= lost;
    state.civs[owner].money -= money;
    pl.loyalty = Math.max(0, pl.loyalty - b.sackLoyalty);
    pl.builds = [];
    ev.sacked = { pop: lost, money };
  } else countWin(state, owner);
  events.push(ev);
}

/** Akının hedefi: kampa en yakın, sahibi olan, akıncıların umutsuz olmadığı yerleşim (menzil içinde). */
function raidTarget(state, camp) {
  const r = { owner: null, inf: Math.floor(camp.inf / 2), arch: Math.floor(camp.arch / 2), cav: 0, siege: 0, elite: 0, x: camp.x, y: camp.y, xp: 0 };
  const cand = PLACES.filter((p) => state.places[p.id].owner && dist(POS[p.id], camp) <= B().reach)
    .filter((p) => forecast(state, r, null, p.id).odds !== "hopeless")
    .sort((p, q) => dist(POS[p.id], camp) - dist(POS[q.id], camp));
  return cand[0]?.id ?? null;
}

/** Bir medeniyetin yerine yürüyen akıncılar (tehdit uyarısı için). */
export const raidersOn = (state, id) => state.armies.filter((a) => a.raider && a.target === id);

/** Haritadaki kamplar. */
export const campsOf = (state) => state.armies.filter((a) => a.camp);

