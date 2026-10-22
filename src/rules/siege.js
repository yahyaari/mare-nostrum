// Kuşatma (kurallar.md bölüm 20): surlu bir yere (kale, başkent, 3. seviye ve üstü şehir) hemen
// saldırmak yerine önüne kamp kurmak. Her tur içerideki asker açlıktan erir, yer bir şey
// üretmez, sadakati düşer; garnizon tükenince yer teslim olur. Kuşatma makineleri erimeyi
// hızlandırır. Ordu yürürse, saldırırsa ya da yer artık düşman değilse kuşatma kalkar.
//
// Kuşatılan yer ordunun `besieging` alanında (`siege` alanı kuşatma makinelerinin sayısı).

import { neighbours, roadBetween } from "./graph.js";
import { access, canAttack, capture, defenders, hostile, wallsOf } from "./moves.js";
import { N, UNITS } from "./numbers.js";
import { armyById, empty, men } from "./state.js";

/** Bu ordu bu yeri kuşatabilir mi: saldırabileceği, surlu, kara yoluyla komşu bir yer. */
export function canBesiege(state, army, id) {
  return !!army && canAttack(state, army, id) && !!wallsOf(state, id) && !roadBetween(army.at, id).sea && army.besieging !== id;
}

/** Kuşatmanın turluk erimesi: %10, her 10 kuşatma makinesi +%2, en fazla %25. */
export const siegeRate = (army) => Math.min(N.siege.max, N.siege.starve + N.siege.perEngines * ((army.siege ?? 0) / N.company));

/** Garnizon kaç turda tükenir (kaba tahmin: bugünkü erimeyle). */
export function turnsToFall(state, army, id) {
  const r = siegeRate(army);
  let left = men(defenders(state, id)), t = 0;
  while (left > 0 && t < 99) {
    left -= Math.max(1, Math.ceil(left * r));
    t++;
  }
  return t;
}

/** Kuşatmayı başlat: ordu bu turun hareketini harcar. */
export function besiege(state, armyId, id, events = null) {
  const a = armyById(state, armyId);
  if (!canBesiege(state, a, id)) return false;
  a.besieging = id;
  a.besiegedSince = state.turn;
  a.moves = 0;
  a.route = [];
  events?.push({ type: "siege", turn: state.turn, by: a.owner, place: id, defender: state.places[id].owner });
  return true;
}

/** Kuşatmayı kaldır. */
export function lift(state, armyId) {
  const a = armyById(state, armyId);
  if (!a?.besieging) return false;
  delete a.besieging;
  delete a.besiegedSince;
  return true;
}

/** Bir yeri kuşatan ordular. */
export const besiegers = (state, id) => state.armies.filter((a) => a.besieging === id);

/**
 * Tur sonu: her kuşatma bir tur ilerler. Geçersiz olan (ordu yürüdü, yer düşman değil) kalkar.
 * Yer teslim olursa kuşatan ordu içeri girer.
 */
export function tickSieges(state, events = []) {
  for (const a of [...state.armies]) {
    const id = a.besieging;
    if (!id) continue;
    const ok = state.armies.includes(a) && men(a) > 0 && neighbours(a.at).includes(id)
      && hostile(access(state, a.owner, id)) && !!wallsOf(state, id);
    if (!ok) { lift(state, a.id); continue; }
    const pl = state.places[id];
    const r = siegeRate(a);
    // Açlık: garnizon ve sahibinin oradaki orduları aynı oranda erir (en az bir adam).
    for (const u of [pl, ...state.armies.filter((b) => b.at === id && b.owner === pl.owner)]) {
      for (const k of UNITS) if (u[k] > 0) u[k] -= Math.max(1, Math.ceil(u[k] * r));
    }
    state.armies = state.armies.filter((b) => !(b.at === id && b.owner === pl.owner && empty(b)));
    // Kampta da salgın ve kaçak: kuşatan ordu turda %3 erir (aşağı yuvarlanır; küçük ordu erimez ama zaten bir şey yapamaz).
    for (const k of UNITS) a[k] -= Math.floor(a[k] * N.siege.camp);
    if (pl.owner) pl.loyalty = Math.max(0, pl.loyalty - N.siege.loyalty);
    if (men(defenders(state, id)) > 0) continue;
    // Teslim: kuşatan ordu içeri girer.
    const from = pl.owner;
    state.trace?.push({ type: "move", army: a.id, owner: a.owner, men: men(a), ships: a.ships, from: a.at, to: id });
    capture(state, id, a.owner);
    a.at = id;
    lift(state, a.id);
    events.push({ type: "surrender", turn: state.turn, by: a.owner, place: id, from, fallen: from && !state.civs[from].alive ? from : null });
  }
  return events;
}
