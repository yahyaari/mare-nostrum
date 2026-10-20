// Diplomasi (kurallar.md bölüm 8). Durumlar: tarafsız (yazılmayan), müttefik, savaş.
//
// Teklifleri bilgisayar kabul eder ya da etmez; karar `wants*` fonksiyonlarında ve oyuncu
// için de, bilgisayarlar arası teklifler için de aynısı kullanılıyor.

import { expel } from "./moves.js";
import { random } from "./rng.js";
import { enemiesOf, key, relation, strength } from "./state.js";

const set = (state, a, b, r) => {
  if (r === "neutral") delete state.relations[key(a, b)];
  else state.relations[key(a, b)] = r;
};

/** Savaş ilanı: tarafsızdan, anında. İttifakın bozulduğu tur olmaz. */
export function canDeclare(state, a, b) {
  return relation(state, a, b) === "neutral" && state.cooldown[key(a, b)] !== state.turn;
}

export function declareWar(state, a, b) {
  if (!canDeclare(state, a, b)) return null;
  set(state, a, b, "war");
  return { type: "war", turn: state.turn, by: a, on: b };
}

/** İttifak teklifi; turda bir kere. Kabul edilirse olay, edilmezse ret olayı döner. */
export function canPropose(state, a, b) {
  return relation(state, a, b) === "neutral" && state.asked[key(a, b)] !== state.turn;
}

export function proposeAlliance(state, a, b) {
  if (!canPropose(state, a, b)) return null;
  state.asked[key(a, b)] = state.turn;
  const yes = wantsAlliance(state, b, a);
  if (yes) set(state, a, b, "ally");
  return { type: yes ? "ally" : "refused", turn: state.turn, by: a, to: b };
}

/** İttifakı bozmak: tarafsız olunur, savaş ancak bir sonraki tur. */
export function breakAlliance(state, a, b) {
  if (relation(state, a, b) !== "ally") return null;
  set(state, a, b, "neutral");
  state.cooldown[key(a, b)] = state.turn;
  expel(state, a, b);
  return { type: "broke", turn: state.turn, by: a, with: b };
}

/** Barış teklifi (savaştan tarafsıza); turda bir kere. */
export function proposePeace(state, a, b) {
  if (relation(state, a, b) !== "war" || state.asked[key(a, b)] === state.turn) return null;
  state.asked[key(a, b)] = state.turn;
  const yes = wantsPeace(state, b, a);
  if (yes) {
    set(state, a, b, "neutral");
    state.cooldown[key(a, b)] = state.turn;
  }
  return { type: yes ? "peace" : "refusedPeace", turn: state.turn, by: a, to: b };
}

// ---- kararlar ----

/** `who`, `from`un ittifak teklifini kabul eder mi. */
export function wantsAlliance(state, who, from) {
  const mine = enemiesOf(state, who), theirs = enemiesOf(state, from);
  if (mine.some((e) => theirs.includes(e))) return true; // ortak düşman
  const allies = Object.entries(state.relations).filter(([k, r]) => r === "ally" && k.split("|").includes(who)).length;
  if (allies >= 2) return false;
  const ratio = strength(state, from) / Math.max(1, strength(state, who));
  return random(state) < (ratio >= 1 ? 0.6 : 0.25);
}

/** `who`, `from`un barış teklifini kabul eder mi: kaybediyorsa evet, kazanıyorsa pek değil. */
export function wantsPeace(state, who, from) {
  const ratio = strength(state, who) / Math.max(1, strength(state, from));
  if (ratio < 0.8) return true;
  return random(state) < (ratio < 1.2 ? 0.35 : 0.1);
}
