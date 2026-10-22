// Casuslar (kullanıcı 22.10: "casus gönder şeyi yapacağız, şehirler hakkında bilgi toplamak için,
// mesafeye göre birkaç turda gidecek"). Saf kurallar, DOM yok.
//
// Oyuncu yabancı bir yerleşime casus gönderir: para şimdi ödenir, casus en yakın kendi yerinden
// yola çıkar ve uzaklığa göre birkaç turda varır. Vardığı yerde kalır ve her tur rapor verir:
// garnizon, içerideki ve kapıdaki ordular, yapılar, sadakat. Orası sisin içinde olsa da görünür.
// Her tur yakalanma ihtimali var (garnizon kalabalıksa daha çok); yakalanınca son raporu kalır,
// yaşlanarak. Yer el değiştirip kendi ya da müttefik yeri olursa casusun işi biter.
//
// state.spies: [{ id, civ, target, eta, at }] - at: vardıysa yer, yoldaysa null.
// state.intel: { civ: { yer: rapor } } - son raporlar (rapor.turn: ne zamanki).

import { N } from "./numbers.js";
import { random } from "./rng.js";
import { POS, dist } from "./map.js";
import { armiesAt, fleetOf, men, placesOf, relation } from "./state.js";
import { UNITS, SHIPS } from "./numbers.js";

const friend = (state, civ, id) => {
  const o = state.places[id].owner;
  return o === civ || (o && relation(state, civ, o) === "ally");
};

/** Bu medeniyetin bu yere giden ya da orada duran casusu. */
export const spyAt = (state, civ, id) => (state.spies ?? []).find((s) => s.civ === civ && s.target === id) ?? null;

/** Casusun yola çıkacağı yer: hedefe en yakın kendi yerleşimi. Yolculuk kaç tur sürer. */
export function spyTrip(state, civ, id) {
  const homes = placesOf(state, civ);
  if (!homes.length) return null;
  const from = homes.reduce((b, h) => (dist(POS[h], POS[id]) < dist(POS[b], POS[id]) ? h : b));
  return { from, turns: Math.max(1, Math.ceil(dist(POS[from], POS[id]) / N.spy.speed)) };
}

/** Casus gönderilebilir mi. Dönen: { cost, turns, why }; why: "own" | "already" | "max" | "money" | null. */
export function spyInfo(state, civ, id) {
  const trip = spyTrip(state, civ, id);
  let why = null;
  if (friend(state, civ, id)) why = "own";
  else if (spyAt(state, civ, id)) why = "already";
  else if ((state.spies ?? []).filter((s) => s.civ === civ).length >= N.spy.max) why = "max";
  else if (state.civs[civ].money < N.spy.cost) why = "money";
  else if (!trip) why = "own";
  return { cost: N.spy.cost, turns: trip?.turns ?? 0, from: trip?.from ?? null, why };
}

/** Casusu yola çıkar. */
export function sendSpy(state, civ, id) {
  const si = spyInfo(state, civ, id);
  if (si.why) return null;
  state.civs[civ].money -= si.cost;
  state.spies ??= [];
  state.nextSpy ??= 1;
  const spy = { id: state.nextSpy++, civ, target: id, from: si.from, eta: state.turn + si.turns, at: null };
  state.spies.push(spy);
  return spy;
}

/** Bir yerin bugünkü raporu: casusun gördüğü her şey. */
export function report(state, id) {
  const pl = state.places[id];
  const pick = (u) => Object.fromEntries([...UNITS, ...SHIPS].map((k) => [k, u[k] ?? 0]));
  const army = (a) => ({ owner: a.owner, men: men(a), ships: fleetOf(a), general: a.general?.name ?? null });
  return {
    turn: state.turn, owner: pl.owner, pop: pl.pop, loyalty: pl.loyalty,
    garrison: pick(pl),
    inside: armiesAt(state, id).map(army),
    gate: state.armies.filter((a) => !a.at && dist(a, POS[id]) <= N.reach.strike).map(army),
    level: pl.level, farms: pl.farms, industry: pl.industry, barracks: pl.barracks,
    fishery: pl.fishery, shipyard: pl.shipyard, trade: pl.trade, fort: pl.fort,
    builds: (pl.builds ?? []).map((b) => ({ what: b.what, left: b.left })),
  };
}

/** Bu medeniyetin bir yer hakkındaki son raporu (varsa). */
export const intelOf = (state, civ, id) => state.intel?.[civ]?.[id] ?? null;

/**
 * Tur başı: yoldaki casuslar varır, yerindekiler raporlar ve yakalanabilir. Yakalanma: turda
 * N.spy.caught, garnizonun her 100 askeri için +N.spy.perHundred. Olaylar `events`e.
 */
export function tickSpies(state, events = []) {
  if (!state.spies?.length) return events;
  state.intel ??= {};
  for (const s of [...state.spies]) {
    const gone = () => { state.spies = state.spies.filter((x) => x !== s); };
    if (!state.civs[s.civ]?.alive || friend(state, s.civ, s.target)) { gone(); continue; }
    if (!s.at) {
      if (state.turn < s.eta) continue;
      s.at = s.target;
      (state.intel[s.civ] ??= {})[s.target] = report(state, s.target);
      events.push({ type: "spyArrived", turn: state.turn, civ: s.civ, place: s.target });
      continue;
    }
    const risk = N.spy.caught + (men(state.places[s.target]) / 100) * N.spy.perHundred;
    if (random(state) < risk) {
      gone();
      events.push({ type: "spyCaught", turn: state.turn, civ: s.civ, place: s.target, by: state.places[s.target].owner });
      continue;
    }
    state.intel[s.civ][s.target] = report(state, s.target);
  }
  return events;
}
