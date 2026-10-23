// Olaylar ve teklifler (kurallar.md bölüm 13). Saf kurallar, DOM yok.
//
// Oyuncunun karar vermesi gereken her şey bir "mektup": state.inbox'a girer, arayüz sırayla
// sorar, `resolve` uygular. Oyuncu karar vermeden turu bitirirse bedava seçenek (en sondaki)
// seçilmiş sayılır. Bilgisayarlar aynı olayları yaşar ve kendi kararını hemen verir.
//
//   olay:  veba, hasat, akın, paralı asker, yangın, huzursuzluk, kervan
//   teklif (bilgisayardan oyuncuya): ittifak, barış, haraç

import { fight } from "./combat.js";
import { breakAlliance, declareWar, makeDeal } from "./diplomacy.js";
import { seat } from "./loyalty.js";
import { defenders, wallsOf } from "./moves.js";
import { N, UNITS } from "./numbers.js";
import { random } from "./rng.js";
import { armiesAt, budget, empty, info, key, men, placesOf, relation, strength } from "./state.js";

const pick = (state, list) => (list.length ? list[Math.floor(random(state) * list.length)] : null);
const placeWhere = (state, civ, ok) => pick(state, placesOf(state, civ).filter(ok));

/**
 * Her olay: `where` (kime ve nereye düşebilir; null = düşmez), `options` (seçenekler; para
 * isteyen seçenek `money` taşır, bedavası en sonda), `apply` (sonucu), `ai` (bilgisayarın seçimi).
 */
export const EVENTS = {
  plague: {
    where: (s, c) => placeWhere(s, c, (id) => s.places[id].pop >= 100),
    options: () => [{ key: "quarantine", money: 12 }, { key: "endure" }],
    apply(s, it, ch) {
      const pl = s.places[it.place];
      const lost = Math.round(pl.pop * (ch === "quarantine" ? 0.1 : 0.3));
      pl.pop -= lost;
      return { lost };
    },
    ai: (s, it) => (s.civs[it.civ].money >= 25 ? "quarantine" : "endure"),
  },
  harvest: {
    where: (s, c) => seat(s, c),
    options: () => [{ key: "store" }, { key: "sell" }],
    apply(s, it, ch) {
      if (ch === "store") s.civs[it.civ].food += 15;
      else s.civs[it.civ].money += 12;
      return {};
    },
    ai: (s, it) => (budget(s, it.civ).food < 3 ? "store" : "sell"),
  },
  raid: {
    where: (s, c) => placeWhere(s, c, (id) => !info(id).capital),
    make: (s) => ({ raiders: Math.min(90, 25 + s.turn), bribe: Math.min(40, 10 + Math.round(s.turn / 2)) }),
    options: (s, it) => [{ key: "bribe", money: it.bribe }, { key: "fight" }],
    apply(s, it, ch) {
      if (ch === "bribe") return {};
      const pl = s.places[it.place];
      const def = defenders(s, it.place);
      const r = fight({ civ: null, inf: it.raiders, arch: 0 }, def, wallsOf(s, it.place), [1, 1]);
      const own = armiesAt(s, it.place).filter((a) => a.owner === pl.owner);
      if (r.attWins) {
        // Akıncılar kazandı: savunanlar öldü, yağma: nüfusun dörtte biri ve bir tarla.
        for (const k of UNITS) pl[k] = 0;
        s.armies = s.armies.filter((a) => !own.includes(a));
        pl.pop = Math.round(pl.pop * 0.75);
        pl.farms = Math.max(1, pl.farms - 1);
        return { held: false };
      }
      for (const k of UNITS) {
        const keep = def[k] ? r.def[k] / def[k] : 0;
        for (const u of [pl, ...own]) u[k] = Math.floor(u[k] * keep);
      }
      s.armies = s.armies.filter((a) => !empty(a));
      return { held: true, lost: men(def) - men(r.def) };
    },
    ai: (s, it) => (men(defenders(s, it.place)) >= it.raiders * 1.3 || s.civs[it.civ].money < it.bribe + 5 ? "fight" : "bribe"),
  },
  mercs: {
    where: (s, c) => seat(s, c),
    options: () => [{ key: "hire", money: 25 }, { key: "refuse" }],
    apply(s, it, ch) {
      if (ch === "hire") s.places[it.place].inf += 30;
      return {};
    },
    ai: (s, it) => (s.civs[it.civ].money >= 45 && budget(s, it.civ).food >= 3 ? "hire" : "refuse"),
  },
  fire: {
    where: (s, c) => placeWhere(s, c, (id) => s.places[id].industry >= 2 || s.places[id].farms >= 2),
    options: () => [{ key: "rebuild", money: 15 }, { key: "endure" }],
    apply(s, it, ch) {
      if (ch === "endure") {
        const pl = s.places[it.place];
        const what = pl.industry >= 2 ? "industry" : "farms";
        pl[what] -= 1;
        return { what };
      }
      return {};
    },
    ai: (s, it) => (s.civs[it.civ].money >= 25 ? "rebuild" : "endure"),
  },
  unrest: {
    where: (s, c) => placeWhere(s, c, (id) => s.places[id].loyalty < 60 && !info(id).capital),
    options: () => [{ key: "games", money: N.loyalty.gamesCost }, { key: "ignore" }],
    apply(s, it, ch) {
      const pl = s.places[it.place];
      pl.loyalty = Math.max(0, Math.min(100, pl.loyalty + (ch === "games" ? N.loyalty.gamesGain : -15)));
      return {};
    },
    ai: (s, it) => (s.civs[it.civ].money >= 20 ? "games" : "ignore"),
  },
  caravan: {
    where: (s, c) => placeWhere(s, c, (id) => info(id).port),
    options: () => [{ key: "welcome" }],
    apply(s, it) {
      s.civs[it.civ].money += 20;
      return {};
    },
    ai: () => "welcome",
  },
};

// ---- teklifler: bilgisayardan oyuncuya ----

export const OFFERS = {
  ally: {
    options: () => [{ key: "accept" }, { key: "decline" }],
    apply(s, it, ch) {
      if (ch === "accept" && relation(s, it.civ, s.player) === "neutral") s.relations[key(it.civ, s.player)] = "ally";
      return {};
    },
    ai: () => "accept",
  },
  peace: {
    options: () => [{ key: "accept" }, { key: "decline" }],
    apply(s, it, ch) {
      if (ch === "accept" && relation(s, it.civ, s.player) === "war") {
        delete s.relations[key(it.civ, s.player)];
        s.cooldown[key(it.civ, s.player)] = s.turn;
      }
      return {};
    },
    ai: (s, it) => (strength(s, s.player) < strength(s, it.civ) * 1.2 ? "accept" : "decline"),
  },
  trade: {
    options: () => [{ key: "accept" }, { key: "decline" }],
    apply(s, it, ch) {
      if (ch === "accept" && relation(s, it.civ, s.player) !== "war") makeDeal(s, it.civ, s.player);
      return {};
    },
    ai: () => "accept",
  },
  tribute: {
    options: (s, it) => [{ key: "pay", money: it.amount }, { key: "refuse" }],
    apply(s, it, ch) {
      if (ch === "pay") {
        s.truce[key(it.civ, s.player)] = s.turn + N.offers.truce;
        return {};
      }
      // Reddedildi: savaş. Müttefikse önce ittifak bozulur (tehdit eden müttefik olmaz zaten).
      if (relation(s, it.civ, s.player) === "ally") breakAlliance(s, it.civ, s.player);
      delete s.cooldown[key(it.civ, s.player)];
      const ev = declareWar(s, it.civ, s.player);
      return { war: !!ev };
    },
    ai: (s, it) => (strength(s, s.player) < strength(s, it.civ) * 0.7 && s.civs[s.player].money >= it.amount ? "pay" : "refuse"),
  },
};

const kindOf = (it) => (it.type === "offer" ? OFFERS : EVENTS)[it.key];

/** Bir mektubun seçenekleri, parası yetmeyen seçenek kapalı (`off`). */
export function options(state, it) {
  const payer = it.type === "offer" ? state.player : it.civ;
  return kindOf(it).options(state, it).map((o) => ({ ...o, off: !!o.money && state.civs[payer].money < o.money }));
}

/**
 * Bir mektubu uygula. Parası yetmeyen ya da olmayan bir seçenek gelirse bedava olanı seçer.
 * Dönen: { item, choice, result }.
 */
export function resolve(state, it, choice) {
  const opts = options(state, it);
  let o = opts.find((x) => x.key === choice && !x.off);
  if (!o) o = opts[opts.length - 1];
  const payer = it.type === "offer" ? state.player : it.civ;
  if (o.money) state.civs[payer].money -= o.money;
  // Mektup yazıldıktan sonra yeri el değiştirmiş olabilir: o zaman olay boşa düşer.
  const stale = it.place && state.places[it.place].owner !== it.civ;
  const result = stale ? { stale: true } : kindOf(it).apply(state, it, o.key);
  state.inbox = (state.inbox ?? []).filter((x) => x !== it && x.id !== it.id);
  return { item: it, choice: o.key, result };
}

/** Bilgisayarın (ya da botun) seçimi. */
export const aiChoice = (state, it) => kindOf(it).ai(state, it);

/** Oyuncunun bekleyen mektupları: karar verilmediyse bedava seçenek. */
export function settleInbox(state, chooser = null) {
  const out = [];
  for (const it of [...(state.inbox ?? [])]) out.push(resolve(state, it, chooser ? chooser(state, it) : null));
  return out;
}

// Kimlik sayacı durumun içinde: aynı tohum aynı oyunu, kayıttan dönen oyun aynı kimlikleri versin.
const item = (state, fields) => {
  state.nextItem = (state.nextItem ?? 0) + 1;
  return { id: state.nextItem, turn: state.turn, ...fields };
};

/** Tur sonu: bir medeniyete olay düşer mi. Oyuncununki mektup olur, bilgisayarınki hemen çözülür. */
export function roll(state, civ) {
  if (state.turn < N.events.from || random(state) >= N.events.chance) return null;
  const keys = Object.keys(EVENTS);
  for (let tries = 0; tries < 4; tries++) {
    const k = keys[Math.floor(random(state) * keys.length)];
    const place = EVENTS[k].where(state, civ);
    if (!place) continue;
    const it = item(state, { type: "event", key: k, civ, place, ...(EVENTS[k].make?.(state) ?? {}) });
    if (civ === state.player) {
      state.inbox.push(it);
      return it;
    }
    return resolve(state, it, aiChoice(state, it));
  }
  return null;
}

/** Bilgisayardan oyuncuya bir teklif (ai.js çağırır). Aynı medeniyetten aynı tur bir tane. */
export function offer(state, civ, k, fields = {}) {
  if (state.inbox.some((x) => x.type === "offer" && x.civ === civ)) return null;
  state.offered[key(civ, state.player)] = state.turn;
  const it = item(state, { type: "offer", key: k, civ, ...fields });
  state.inbox.push(it);
  return it;
}

