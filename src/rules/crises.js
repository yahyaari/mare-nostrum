// Oyun sonunu canlı tutan büyük krizler (kurallar.md bölüm 27; kullanıcının istediği "olmazsa olmazlar"ın
// dördüncüsü, 26.10). Strateji oyunlarının bilinen sorunu: büyüyen taraf bir noktadan sonra rahatça
// kazanır, oyun sıkıcılaşır (plan.md açık riskler: "dünyanın donması"). Çaresi büyüklerin başına gelenler:
//
//   - İç savaş: çok büyüyen imparatorluğun başkentten en uzak eyaletlerinin valileri ayaklanır, sadakatleri
//     düşer (loyalty.js'in isyanları gelir); valilere altın dağıtmak yatıştırır. Oyuncuya mektup.
//   - Büyük salgın: dünyanın en kalabalık şehrinde başlar, yollar boyunca komşu şehirlere yayılır; nüfusu ve
//     askeri eritir, hamamlar hafifletir.
//   - Büyük göç (Kimberler): en çok yeri olan medeniyetin sınırında büyük bir barbar ordusu belirir, şehir
//     şehir yağmalayarak ilerler (barbarians.js akıncıları gibi), yenilene ya da dağılana kadar.
//
// Hepsi `N.crises.from`. turdan sonra. Durumları \`state.crises\` (yoksa ilk turda kurulur).

import { neighbours } from "./graph.js";
import { POS, dist } from "./map.js";
import { N, UNITS } from "./numbers.js";
import { random } from "./rng.js";
import { armiesAt, men, placesOf } from "./state.js";
import { letter } from "./events.js";
import { seat } from "./loyalty.js";
import { landSpots } from "./barbarians.js";

const C = () => N.crises;

/** Tur sonu: krizler başlar, sürenler ilerler. Olaylar \`events\`e. */
export function tickCrises(state, events) {
  if (state.turn < C().from) return;
  state.crises ??= { war: {}, plague: null, lastPlague: 0, lastHorde: 0 };
  civilWars(state, events);
  plague(state, events);
  horde(state, events);
}

// ---- iç savaş ----

/** Ayaklanacak şehirler: başkent dışındakilerin başkentten en uzak \`share\` kadarı. */
export function rebelsOf(state, civ) {
  const home = seat(state, civ);
  const n = Math.ceil(placesOf(state, civ).length * C().civilWar.share);
  return placesOf(state, civ).filter((id) => id !== home)
    .sort((a, b) => dist(POS[b], POS[home]) - dist(POS[a], POS[home])).slice(0, n);
}

function civilWars(state, events) {
  const w = C().civilWar;
  for (const civ of Object.keys(state.civs)) {
    if (!state.civs[civ].alive || placesOf(state, civ).length < w.places) continue;
    if (state.turn - (state.crises.war[civ] ?? -Infinity) < w.gap || random(state) >= w.chance) continue;
    const rebels = rebelsOf(state, civ);
    if (!rebels.length) continue;
    state.crises.war[civ] = state.turn;
    events.push({ type: "civilWar", turn: state.turn, civ, place: rebels[0], count: rebels.length });
    // Mektup (events.js EVENTS.civilWar): oyuncu seçer, bilgisayar hemen (koparsa habere).
    const bribe = Math.max(w.pay * rebels.length, Math.round(state.civs[civ].money * w.treasury));
    const r = letter(state, civ, "civilWar", rebels[0], { rebels, count: rebels.length, bribe });
    if (r?.result?.seceded) events.push({ type: "seceded", turn: state.turn, civ, count: r.result.count });
  }
}

// ---- büyük salgın ----

function plague(state, events) {
  const p = C().plague, cur = state.crises.plague;
  if (!cur) {
    if (state.turn - state.crises.lastPlague < p.gap || random(state) >= p.chance) return;
    const origin = Object.keys(state.places).filter((id) => state.places[id].owner)
      .sort((a, b) => state.places[b].pop - state.places[a].pop)[0];
    if (!origin) return;
    state.crises.plague = { hit: [origin], front: [origin], left: p.turns };
    state.crises.lastPlague = state.turn;
    events.push({ type: "plagueStart", turn: state.turn, place: origin, owner: state.places[origin].owner });
    sicken(state, origin, events);
    return;
  }
  // Yayılır: cephedeki her şehirden yollarla, daha uğramadığı komşulara.
  const next = [];
  for (const id of cur.front) {
    for (const n of neighbours(id)) {
      if (cur.hit.includes(n) || next.includes(n) || random(state) >= p.spread) continue;
      next.push(n);
    }
  }
  for (const id of next) {
    cur.hit.push(id);
    sicken(state, id, events);
  }
  cur.front = next;
  cur.left -= 1;
  if (cur.left <= 0 || !next.length) {
    state.crises.plague = null;
    events.push({ type: "plagueEnd", turn: state.turn, places: cur.hit.length });
  }
}

/** Salgın bir yere vardı: nüfusun payı (her hamam seviyesi hafifletir), garnizonun ve kapıdaki orduların payı. */
function sicken(state, id, events) {
  const p = C().plague, pl = state.places[id];
  const lost = Math.round(pl.pop * p.pop * (1 - Math.min(p.bathsMax, (pl.baths ?? 0) * p.baths)));
  pl.pop -= lost;
  let dead = 0;
  for (const u of [pl, ...armiesAt(state, id)]) {
    for (const k of UNITS) {
      const n = Math.floor((u[k] ?? 0) * p.army);
      u[k] -= n;
      dead += n;
    }
  }
  events.push({ type: "plagueHit", turn: state.turn, place: id, owner: pl.owner, lost, men: dead });
}

/** Salgının uğradığı yerler (haritada işaret için), yoksa boş. */
export const plagueAt = (state) => new Set(state.crises?.plague?.hit ?? []);

// ---- büyük göç ----

function horde(state, events) {
  const h = C().horde;
  if (state.turn < h.from || state.armies.some((a) => a.horde)) return;
  if (state.turn - state.crises.lastHorde < h.gap || random(state) >= h.chance) return;
  // En çok yeri olan medeniyet; göç sınırına gelir: başkentinden en uzak yerinin yakınına.
  const leader = Object.keys(state.civs).filter((c) => state.civs[c].alive)
    .sort((a, b) => placesOf(state, b).length - placesOf(state, a).length)[0];
  if (!leader) return;
  const home = seat(state, leader);
  const edge = placesOf(state, leader).sort((a, b) => dist(POS[b], POS[home]) - dist(POS[a], POS[home]))[0];
  const spots = landSpots().filter((s) => dist(s, POS[edge]) >= h.near[0] && dist(s, POS[edge]) <= h.near[1]);
  if (!spots.length) return;
  const at = spots[Math.floor(random(state) * spots.length)];
  const total = Math.round(h.base + h.perTurn * state.turn);
  const a = {
    id: state.nextArmy++, owner: null, barbarian: true, raider: true, horde: true, target: edge, victim: leader, born: state.turn,
    at: null, x: at.x, y: at.y, inf: Math.round(total * (1 - h.arch - h.cav)), arch: Math.round(total * h.arch), cav: Math.round(total * h.cav),
    siege: 0, elite: 0, ships: 0, trireme: 0, quinq: 0, mp: N.march.mp, route: [], general: null, xp: 0,
  };
  state.armies.push(a);
  state.crises.lastHorde = state.turn;
  events.push({ type: "hordeCame", turn: state.turn, civ: leader, place: edge, men: men(a) });
}

/**
 * Göçün bir sonraki hedefi (barbarians.js bir yeri yağmaladıktan sonra): kurbanın en yakın yeri, o yoksa
 * herhangi birinin; \`next\` birimden uzak değil. Yoksa null (göç dağılır).
 */
export function hordeTarget(state, a, skip = null) {
  const near = (ids) => ids.filter((id) => id !== skip && state.places[id].owner && dist(POS[id], a) <= C().horde.next).sort((p, q) => dist(POS[p], a) - dist(POS[q], a))[0];
  return near(placesOf(state, a.victim)) ?? near(Object.keys(state.places)) ?? null;
}
