// Liderler ve tutum (kurallar.md bölüm 24). Kullanıcı 23.10: "başka ne yapabiliriz" -> sırayla:
// önce liderler ve canlı diplomasi (Civilization gibi: rakiplerin bir yüzü, kişiliği ve sana
// karşı bir tutumu olsun, konuşsunlar).
//
// Her medeniyetin bir lideri ve kişiliği var. Kişilik bilgisayarın diplomasisini çevirir:
//   war     savaş açma isteği (çarpan; eşiği de o kadar düşürür)
//   peace   barışı kabul etme isteği
//   ally    ittifakı kabul etme isteği
//   anger   toprağına girene kaç turda savaş açar (öfke eşiği)
//   gifts   hediyenin tutuma etkisi
//   grudge  savaş ilanını ne kadar uzun hatırlar (tur)
//   base    herkese karşı başlangıç tutumu
//
// Tutum (moodOf): bir medeniyetin başka birine karşı -100..100 puanı ve gerekçeleri, Civilization
// V'teki gibi ("Ortak düşmanımız var +20", "Bize savaş açtın -25"). Hafıza `state.memory`te:
// "A>B" = A'nın B hakkında hatırladıkları { warOn, broke, gift }.

import { CIVS, PLACES } from "../data/world.js";
import { POS, dist } from "./map.js";
import { N } from "./numbers.js";
import { enemiesOf, key, relation, strength } from "./state.js";

// 70 oyunla ayarlandı: ilk denemede savaş 0.75-1.3, barış 0.7-1.3 iken saldırgan liderler kendini
// yıpratıyordu (Makedonya 150 turda ayakta 44 -> 37/70, Sakalar 48 -> 40), temkinli Mithridates
// büyüyordu (Partlar en büyük 30 -> 40). Yumuşatılınca ve Mithridates kurnaz (biraz atak)
// olunca: ayakta kalan toplam 344 (önce 339), herkes 41+, Partlar en büyük 31.
export const LEADERS = {
  rome: { war: 1, peace: 1, ally: 1.2, anger: 3, gifts: 1, grudge: 30, base: 0 },
  carthage: { war: 1.15, peace: 0.9, ally: 1, anger: 3, gifts: 1, grudge: 40, base: -5, hates: "rome" },
  egypt: { war: 0.9, peace: 1.15, ally: 1.3, anger: 3, gifts: 1.5, grudge: 25, base: 10 },
  macedon: { war: 1.15, peace: 0.9, ally: 0.85, anger: 3, gifts: 1, grudge: 30, base: -5 },
  parthia: { war: 1.05, peace: 0.95, ally: 1, anger: 3, gifts: 1, grudge: 30, base: 0 },
  gaul: { war: 1.05, peace: 0.95, ally: 0.9, anger: 2, gifts: 0.75, grudge: 30, base: -5 },
  saka: { war: 1.05, peace: 0.85, ally: 1, anger: 3, gifts: 1, grudge: 60, base: 0 },
};

/** Liderin kişiliği (bağımsızların yok: hepsi 1). */
export const persona = (civ) => LEADERS[civ] ?? { war: 1, peace: 1, ally: 1, anger: N.anger.war, gifts: 1, grudge: 30, base: 0 };

const mem = (state, who, about) => state.memory?.[`${who}>${about}`] ?? {};
const remember = (state, who, about, fields) => {
  state.memory ??= {};
  state.memory[`${who}>${about}`] = { ...mem(state, who, about), ...fields };
};

/** `on`, `by`ın savaş ilanını hatırlar (diplomacy.js declareWar). */
export const rememberWar = (state, by, on) => remember(state, on, by, { warOn: state.turn });
/** `with`, `by`ın ittifakı bozduğunu hatırlar. */
export const rememberBroke = (state, by, withCiv) => remember(state, withCiv, by, { broke: state.turn });

/** Hediye: para gider, alanın tutumu yükselir (sönerek). Dönen: tutuma eklenen puan. */
export function gift(state, from, to, amount) {
  if (!to || !state.civs[to]?.alive || state.civs[from].money < amount || amount <= 0) return 0;
  state.civs[from].money -= amount;
  const add = Math.round(amount * N.diplo.giftPoints * persona(to).gifts);
  const now = Math.min(N.diplo.giftMax, giftLeft(state, to, from) + add);
  remember(state, to, from, { gift: now, giftTurn: state.turn });
  return add;
}

/** Hediyenin kalan etkisi: turda `giftFade` söner. */
const giftLeft = (state, who, from) => {
  const m = mem(state, who, from);
  return Math.max(0, (m.gift ?? 0) - (state.turn - (m.giftTurn ?? state.turn)) * N.diplo.giftFade);
};

/** İki medeniyet arasında süren ticaret anlaşması (yoksa null). */
export const dealOf = (state, a, b) => (state.deals ?? []).find((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a)) ?? null;

/** Ticaret anlaşmasının kalan turu. */
export const dealLeft = (state, d) => Math.max(0, d.until - state.turn);

/** Bir medeniyetin ticaret anlaşmalarından turluk parası. */
export const dealMoney = (state, civ) => (state.deals ?? []).filter((d) => (d.a === civ || d.b === civ) && d.until > state.turn).length * N.diplo.tradeMoney;

/**
 * Tutum: `who`nun `other`a karşı puanı ve gerekçeleri [[anahtar, puan]]. Bilgisayarın kararları
 * (ittifak, barış, savaş, teklif) ve ekrandaki yüz bundan.
 */
export function moodOf(state, who, other) {
  const p = persona(who), parts = [];
  const add = (k, v) => { if (v) parts.push([k, Math.round(v)]); };
  add("persona", p.base);
  if (p.hates === other) add("hates", -15);
  const rel = relation(state, who, other);
  if (rel === "war") add("atWar", -40);
  if (rel === "ally") add("allies", 25);
  const mine = enemiesOf(state, who), theirs = enemiesOf(state, other);
  if (rel !== "war" && mine.some((e) => theirs.includes(e))) add("sharedEnemy", 20);
  const m = mem(state, who, other);
  const fade = (t, span) => (t === undefined ? 0 : Math.max(0, 1 - (state.turn - t) / span));
  add("declaredOnUs", -25 * fade(m.warOn, p.grudge));
  add("brokeAlliance", -30 * fade(m.broke, p.grudge));
  add("trespass", -8 * (state.anger?.[`${who}>${other}`] ?? 0));
  add("gifts", giftLeft(state, who, other));
  if ((state.truce?.[key(who, other)] ?? 0) > state.turn) add("tribute", 10);
  const d = dealOf(state, who, other);
  if (d && d.until > state.turn) add("trade", 15);
  if (borders(state, who, other)) add("borders", -5);
  if (strength(state, other) > 1.6 * Math.max(1, strength(state, who))) add("tooStrong", -10);
  if (state.wonderHold?.[other]) add("wonderRace", -15);
  const score = Math.max(-100, Math.min(100, parts.reduce((n, [, v]) => n + v, 0)));
  return { score, parts };
}

/** Tutumun adı: dostça, nötr, soğuk, düşmanca. */
export const moodLevel = (score) => (score >= 25 ? "friendly" : score > -10 ? "neutral" : score > -30 ? "cold" : "hostile");

/** İki medeniyetin yerleşimleri birbirine yakın mı (sınır komşusu: N.diplo.border harita birimi). */
function borders(state, a, b) {
  const pa = PLACES.filter((p) => state.places[p.id].owner === a), pb = PLACES.filter((p) => state.places[p.id].owner === b);
  return pa.some((x) => pb.some((y) => dist(POS[x.id], POS[y.id]) < N.diplo.border));
}

/** Tutumun bilgisayarın kararlarına çarpanı: düşmancaysa savaşa daha istekli, dostçaysa daha az. */
export const warMoodMul = (score) => (score < -30 ? 1.6 : score < -10 ? 1.25 : score >= 25 ? 0.4 : 1);

/** Bütün liderlerin listesi (sıra CIVS ile aynı). */
export const leaderCivs = () => CIVS.map((c) => c.id);
