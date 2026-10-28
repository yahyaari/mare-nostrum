// Kuşatma (kurallar.md bölüm 20): surlu bir yere (kale, başkent, 3. seviye ve üstü şehir) hemen
// saldırmak yerine önüne kamp kurmak. Her tur içerideki asker açlıktan erir, yer bir şey
// üretmez, sadakati düşer; garnizon tükenince yer teslim olur. Kuşatma makineleri erimeyi
// hızlandırır. Ordu yürürse, saldırırsa ya da yer artık düşman değilse kuşatma kalkar.
//
// Kuşatılan yer ordunun `besieging` alanında (`siege` alanı kuşatma makinelerinin sayısı). Kuşatan ordu her tur
// yerinde bir alet yapar (`works`: koçbaşı, merdiven; en çok N.siege.works.max): saldırınca surun bir kısmını söker
// (combat.js enginesOf), taktik savaşta koçbaşı olarak sahaya çıkar. Ya aç bırakıp beklemek ya aletleri yapıp saldırmak.

import { access, bySea, capture, defenders, hostile, inReach } from "./moves.js";
import { POS, dist } from "./map.js";
import { N, UNITS } from "./numbers.js";
import { armyById, empty, fleetOf, men } from "./state.js";

/**
 * Bu ordu bu yeri kuşatabilir mi: menzilde, karadan bir yer (kullanıcı 28.10: her yere saldırmadan önce kuşatma hazırlığı -
 * sursuz kasabaya da; moves.js prepOf).
 */
export function canBesiege(state, army, id) {
  return !!army && inReach(state, army, id) && !bySea(army, POS[id]) && army.besieging !== id;
}

/** Yerinde yapılan alet türleri (sırasıyla; bölüm 20). */
export const WORKS = ["ram", "tower", "catapult"];

/** Ordunun yaptığı aletler, türleriyle: { ram, tower, catapult } (eski kayıtta sayı: hepsi koçbaşı). */
export const worksOf = (a) => (typeof a?.works === "number" ? { ram: a.works } : { ...(a?.works ?? {}) });

/** Kaç alet. */
export const worksCount = (a) => Object.values(worksOf(a)).reduce((n, v) => n + v, 0);

/** Kuşatmanın turluk erimesi: %10, her 10 kuşatma makinesi +%2, her mancınık +%2, en fazla %25. */
export const siegeRate = (army) => Math.min(N.siege.max, N.siege.starve + N.siege.perEngines * ((army.siege ?? 0) / N.company)
  + (worksOf(army).catapult ?? 0) * N.siege.works.kinds.catapult.starve);

/** Kampın bundan sonra yapacağı alet (oyuncu seçer; yoksa koçbaşı). */
export function setWorkType(state, armyId, kind) {
  const a = armyById(state, armyId);
  if (!a || !WORKS.includes(kind)) return false;
  a.workType = kind;
  return true;
}

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
  a.mp = 0;
  a.route = [];
  events?.push({ type: "siege", turn: state.turn, by: a.owner, place: id, defender: state.places[id].owner });
  return true;
}

/** Kuşatmayı kaldır: aletler kampta kalır (yakılır). */
export function lift(state, armyId) {
  const a = armyById(state, armyId);
  if (!a?.besieging) return false;
  delete a.besieging;
  delete a.besiegedSince;
  delete a.works;
  return true;
}

/** Kuşatan ordu bu tur alet yapabilir mi: en az `crew` dövüşen askeri var ve tavana varmadı. */
export const canBuildWorks = (a) => men(a) - (a.siege ?? 0) >= N.siege.works.crew && worksCount(a) < N.siege.works.max;

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
    const ok = state.armies.includes(a) && men(a) > 0 && !a.at && dist(a, POS[id]) <= N.reach.strike + 1e-9
      && hostile(access(state, a.owner, id));
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
    // Aletler: her tur bir koçbaşı ya da merdiven.
    if (canBuildWorks(a)) {
      const w = worksOf(a), k = WORKS.includes(a.workType) ? a.workType : "ram";
      w[k] = (w[k] ?? 0) + 1;
      a.works = w;
    }
    if (pl.owner) pl.loyalty = Math.max(0, pl.loyalty - N.siege.loyalty);
    if (men(defenders(state, id)) > 0) continue;
    // Teslim: kuşatan ordu içeri girer.
    const from = pl.owner;
    state.trace?.push({ type: "move", army: a.id, owner: a.owner, men: men(a), ships: fleetOf(a), path: [[a.x, a.y], [POS[id].x, POS[id].y]] });
    capture(state, id, a.owner);
    a.at = id;
    a.x = POS[id].x;
    a.y = POS[id].y;
    lift(state, a.id);
    events.push({ type: "surrender", turn: state.turn, by: a.owner, place: id, from, fallen: from && !state.civs[from].alive ? from : null });
  }
  return events;
}
