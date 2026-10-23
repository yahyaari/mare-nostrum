// Diplomasi (kurallar.md bölüm 8). Durumlar: tarafsız (yazılmayan), müttefik, savaş.
//
// Teklifleri bilgisayar kabul eder ya da etmez; karar `wants*` fonksiyonlarında ve oyuncu
// için de, bilgisayarlar arası teklifler için de aynısı kullanılıyor.

import { expel } from "./moves.js";
import { random } from "./rng.js";
import { enemiesOf, key, relation, strength } from "./state.js";
import { dealOf, moodOf, persona, rememberBroke, rememberWar } from "./leaders.js";
import { N } from "./numbers.js";
import { cellOf, regionOf } from "./map.js";

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
  // Savaş açılan hatırlar; aralarındaki ticaret biter.
  rememberWar(state, a, b);
  state.deals = (state.deals ?? []).filter((d) => d !== dealOf(state, a, b));
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
  rememberBroke(state, a, b);
  expel(state, a, b);
  return { type: "broke", turn: state.turn, by: a, with: b };
}

/** Barış teklifi (savaştan tarafsıza); turda bir kere. `gold`: barışla birlikte verilen para (kabul edilirse ödenir). */
export function proposePeace(state, a, b, gold = 0) {
  if (relation(state, a, b) !== "war" || state.asked[key(a, b)] === state.turn) return null;
  if (gold > state.civs[a].money) return null;
  state.asked[key(a, b)] = state.turn;
  const yes = wantsPeace(state, b, a, gold);
  if (yes) {
    set(state, a, b, "neutral");
    state.cooldown[key(a, b)] = state.turn;
    if (gold) { state.civs[a].money -= gold; state.civs[b].money += gold; }
  }
  return { type: yes ? "peace" : "refusedPeace", turn: state.turn, by: a, to: b, gold: yes ? gold : 0 };
}

/** Ticaret anlaşması teklif edilebilir mi: savaşta değil, sürmekte olan anlaşma yok, turda bir kere. */
export function canTrade(state, a, b) {
  const d = dealOf(state, a, b);
  return relation(state, a, b) !== "war" && !(d && d.until > state.turn) && state.asked[key(a, b)] !== state.turn;
}

/** Ticaret anlaşması teklifi: kabul edilirse ikisi de `tradeTurns` tur, turda `tradeMoney` para. */
export function proposeTrade(state, a, b) {
  if (!canTrade(state, a, b)) return null;
  state.asked[key(a, b)] = state.turn;
  const yes = wantsTrade(state, b, a);
  if (yes) makeDeal(state, a, b);
  return { type: yes ? "trade" : "refusedTrade", turn: state.turn, by: a, to: b };
}

/** Anlaşmayı yaz (eskisi varsa yerine). */
export function makeDeal(state, a, b) {
  state.deals = (state.deals ?? []).filter((d) => d !== dealOf(state, a, b));
  state.deals.push({ a, b, until: state.turn + N.diplo.tradeTurns });
}

// ---- kararlar ----

/** `who`, `from`un ittifak teklifini kabul eder mi: tutumu soğuksa hayır, dostçaysa daha kolay. */
export function wantsAlliance(state, who, from) {
  if (angerOf(state, who, from) > 0) return false; // toprağına giren müttefik olamaz
  const mood = moodOf(state, who, from).score;
  if (mood <= -10) return false;
  const mine = enemiesOf(state, who), theirs = enemiesOf(state, from);
  if (mine.some((e) => theirs.includes(e))) return true; // ortak düşman
  const allies = Object.entries(state.relations).filter(([k, r]) => r === "ally" && k.split("|").includes(who)).length;
  if (allies >= 2) return false;
  const ratio = strength(state, from) / Math.max(1, strength(state, who));
  return random(state) < ((ratio >= 1 ? 0.6 : 0.25) + mood / 100) * persona(who).ally;
}

/**
 * `who`, `from`un barış teklifini kabul eder mi: kaybediyorsa evet, kazanıyorsa pek değil.
 * Tutum (savaşın kendisi sayılmadan) ve teklif edilen para ihtimali artırır; kişilik çarpar.
 */
export function wantsPeace(state, who, from, gold = 0) {
  const ratio = strength(state, who) / Math.max(1, strength(state, from));
  if (ratio < 0.8) return true;
  const mood = moodOf(state, who, from).score + 40;
  const chance = ((ratio < 1.2 ? 0.35 : 0.1) + mood / 200 + gold / 100) * persona(who).peace;
  return random(state) < chance;
}

/** `who`, `from`un ticaret teklifini kabul eder mi: müttefikse evet, tutumu nötrse çoğunlukla. */
export function wantsTrade(state, who, from) {
  if (relation(state, who, from) === "ally") return true;
  const mood = moodOf(state, who, from).score;
  if (mood < 0 || angerOf(state, who, from) > 0) return false;
  return random(state) < 0.6 + mood / 100;
}

// ---- tarafsızın toprağı ----

/** `victim`in `by`a öfkesi: `by`ın orduları onun toprağında kaç tur durdu (sönerek). */
export const angerOf = (state, victim, by) => state.anger?.[`${victim}>${by}`] ?? 0;

/**
 * Tur sonu (kullanıcı 22.10: "tarafsızın toprağına girilsin ama ilişki bozulsun"): bir ordu,
 * tarafsız olduğu birinin toprağında (yerleşimin dışında) duruyorsa o medeniyet öfkelenir: turda
 * +1. O tur kimse girmediyse öfke -0.5 söner. Öfke N.anger.war olunca bilgisayar savaş açar
 * (ai.js). Oyuncunun ordusu girdiyse ya da oyuncunun toprağına girildiyse haber olur.
 */
export function trespass(state, events = []) {
  const now = new Set();
  for (const a of state.armies) {
    if (a.at) continue;
    const id = regionOf(cellOf(a.x, a.y));
    const o = id && state.places[id].owner;
    if (!o || o === a.owner || relation(state, o, a.owner) !== "neutral") continue;
    now.add(`${o}>${a.owner}`);
  }
  state.anger ??= {};
  for (const k of new Set([...Object.keys(state.anger), ...now])) {
    const v = (state.anger[k] ?? 0) + (now.has(k) ? 1 : -0.5);
    if (v <= 0) delete state.anger[k];
    else state.anger[k] = v;
    const [victim, by] = k.split(">");
    if (now.has(k) && (by === state.player || victim === state.player)) {
      events.push({ type: "trespass", turn: state.turn, victim, by, anger: state.anger[k] });
    }
  }
  return events;
}
