// Görevler (kurallar.md bölüm 17): oyuncunun meclisi (Roma'da Senato, Sakalarda Kurultay)
// birkaç turda bir bir iş verir - bir yeri al, filo kur, bir şehri büyüt, bir yeri savun.
// Süresi ve ödülü var; oyuncu kabul eder ya da reddeder. Bilgisayarlar görev almaz.
//
// Görevin zarı kendi sayacından (state.mrng): görev gelsin gelmesin dünyanın zarları
// (savaşlar, olaylar, bilgisayarın kararları) aynı kalır, bot ve denge ölçümleri görevlerle
// kaymaz - sadece ödüller fark eder.

import { CIVS } from "../data/world.js";
import { byId, neighbours } from "./graph.js";
import { XP } from "./generals.js";
import { menace } from "./moves.js";
import { N } from "./numbers.js";
import { random } from "./rng.js";
import { PORT_UPGRADES, UPGRADES, armiesOf, fleetOf, men, placesOf, relation, upgradeInfo } from "./state.js";

/** Görevlerin zarı: oyunun zarıyla aynı yöntem, ayrı sayaç. */
function roll(state) {
  const box = { rng: (state.mrng ??= (state.rng ^ 0x5bd1e995) | 0 || 7) };
  const r = random(box);
  state.mrng = box.rng;
  return r;
}
const pick = (state, list) => list[Math.floor(roll(state) * list.length)];

const totalShips = (state, civ) =>
  placesOf(state, civ).reduce((n, id) => n + fleetOf(state.places[id]), 0) + armiesOf(state, civ).reduce((n, a) => n + fleetOf(a), 0);
const generals = (state, civ) => armiesOf(state, civ).map((a) => a.general).filter(Boolean);
const capitalOf = (state, civ) => placesOf(state, civ).find((id) => byId[id].capital) ?? null;

/**
 * Görev türleri. `make`: bu oyuncuya bu tür şu an verilebilir mi, verilecekse ayrıntıları
 * (yoksa null). `done`: tamamlandı mı. `progress`: ekranda "3 / 5" için (yoksa null).
 * Ödüller tür başına sabit; büyük işin ödülü büyük.
 */
export const KINDS = {
  // Komşu bir yeri al: önce savaştığın birinin ya da bağımsız yerler.
  take: {
    turns: 8,
    make(state, me) {
      const mine = new Set(placesOf(state, me));
      const near = new Set();
      for (const id of mine) for (const n of neighbours(id)) if (!mine.has(n)) near.add(n);
      const ok = [...near].filter((id) => {
        const o = state.places[id].owner;
        return o === null || relation(state, me, o) === "war";
      });
      if (!ok.length) return null;
      const place = pick(state, ok);
      return { place, reward: { money: 30 + 10 * state.places[place].level, weapons: 5 } };
    },
    done: (state, m) => state.places[m.place].owner === m.civ,
  },
  // Filoyu büyüt: toplam gemi üç fazla.
  fleet: {
    turns: 7,
    make(state, me) {
      if (!placesOf(state, me).some((id) => byId[id].port)) return null;
      return { need: totalShips(state, me) + 3, reward: { money: 25, weapons: 10 } };
    },
    done: (state, m) => totalShips(state, m.civ) >= m.need,
    progress: (state, m) => [totalShips(state, m.civ), m.need],
  },
  // Tarafsız bir medeniyetle ittifak.
  ally: {
    turns: 10,
    make(state, me) {
      const ok = CIVS.filter((c) => c.id !== me && state.civs[c.id].alive && relation(state, me, c.id) === "neutral");
      return ok.length ? { other: pick(state, ok).id, reward: { money: 40 } } : null;
    },
    done: (state, m) => relation(state, m.civ, m.other) === "ally",
  },
  // Bir yerleşimin bir yapısını bir seviye yükselt (şehir seviyesi, tarla, sanayi, kışla ya da
  // limansa liman yapıları) - ancak yükselebilecek olanı.
  grow: {
    turns: 6,
    make(state, me) {
      const ok = [];
      for (const id of placesOf(state, me)) {
        for (const what of [...UPGRADES, ...(byId[id].port ? PORT_UPGRADES : [])]) {
          const u = upgradeInfo(state, id, what);
          if (u.why !== "max" && u.why !== "needLevel" && u.why !== "notPort") ok.push([id, what]);
        }
      }
      if (!ok.length) return null;
      const [place, what] = pick(state, ok);
      return { place, what, need: state.places[place][what] + 1, reward: what === "level" ? { money: 30, food: 15 } : { money: 15, food: 10 } };
    },
    done: (state, m) => state.places[m.place].owner === m.civ && state.places[m.place][m.what] >= m.need,
    progress: (state, m) => [state.places[m.place][m.what], m.need],
  },
  // Büyük bir ordu: en büyüğünün bir buçuk katı, en az 150 asker.
  army: {
    turns: 6,
    make(state, me) {
      const big = Math.max(0, ...armiesOf(state, me).map((a) => men(a)));
      return { need: Math.max(150, Math.round((big * 1.5) / 10) * 10), reward: { weapons: 15, food: 15 } };
    },
    done: (state, m) => armiesOf(state, m.civ).some((a) => men(a) >= m.need),
    progress: (state, m) => [Math.max(0, ...armiesOf(state, m.civ).map((a) => men(a))), m.need],
  },
  // Generali yoksa bir general ata; varsa birini bir rütbe yükselt.
  general: {
    turns: 10,
    make(state, me) {
      const gs = generals(state, me);
      if (!armiesOf(state, me).length) return null;
      if (!gs.length) return { need: 1, reward: { money: 20 } };
      const top = Math.max(...gs.map((g) => g.level));
      return top >= XP.length ? null : { need: top + 1, reward: { money: 50 } };
    },
    done: (state, m) => generals(state, m.civ).some((g) => g.level >= m.need),
  },
  // Sadakati düşük bir yeri yatıştır.
  loyal: {
    turns: 6,
    make(state, me) {
      const ok = placesOf(state, me).filter((id) => state.places[id].loyalty < 60);
      return ok.length ? { place: pick(state, ok), need: 80, reward: { money: 25 } } : null;
    },
    done: (state, m) => state.places[m.place].owner === m.civ && state.places[m.place].loyalty >= m.need,
    progress: (state, m) => [state.places[m.place].loyalty, m.need],
  },
  // Kapısında düşman olan bir yeri dört tur elde tut. Süre dolunca tamamlanır.
  hold: {
    turns: 4,
    hold: true,
    make(state, me) {
      const ok = placesOf(state, me).filter((id) => menace(state, id) > 0);
      return ok.length ? { place: pick(state, ok), reward: { money: 30, weapons: 10 } } : null;
    },
    done: (state, m) => state.places[m.place].owner === m.civ && state.turn >= m.until,
  },
};

/** Bir görev, belli bir türden (araçlar ve testler için); verilemiyorsa null. */
export function make(state, key, civ = state.player) {
  const k = KINDS[key];
  const fields = k.make(state, civ);
  if (!fields) return null;
  state.nextItem = (state.nextItem ?? 0) + 1;
  return { id: state.nextItem, key, civ, issued: state.turn, until: state.turn + k.turns, seen: false, ...fields };
}

/**
 * Tur sonu: yeni bir görev gelir mi. Başta hiç gelmez (N.missions.from), aynı anda en fazla
 * N.missions.max tane, ikisinin arası en az N.missions.spacing tur. Aynı türden iki görev olmaz.
 */
export function issue(state, events = null) {
  const M = N.missions;
  state.missions ??= [];
  if (state.over || state.turn < M.from || state.missions.length >= M.max) return null;
  if (state.lastMission && state.turn - state.lastMission < M.spacing) return null;
  if (roll(state) >= M.chance) return null;
  const keys = Object.keys(KINDS).filter((k) => !state.missions.some((m) => m.key === k));
  // Türleri karıştır, verilebilen ilkini ver.
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(roll(state) * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  for (const key of keys) {
    const m = make(state, key);
    if (!m) continue;
    state.missions.push(m);
    state.lastMission = state.turn;
    events?.push({ type: "missionNew", turn: state.turn, mission: m });
    return m;
  }
  return null;
}

/** Ödülü ver. */
function pay(state, m) {
  const civ = state.civs[m.civ];
  for (const k of ["money", "weapons", "food"]) civ[k] += m.reward[k] ?? 0;
}

/**
 * Görevlere bak: tamamlanan ödülünü alır, süresi geçen düşer (başkentin sadakati azalır:
 * meclis hayal kırıklığına uğradı). Hem tur sonunda hem oyuncunun her hamlesinden sonra
 * çağrılır - görev yapıldığı anda tamamlanır. Dönen: { done, failed }.
 */
export function check(state, events = null) {
  const out = { done: [], failed: [] };
  if (!state.missions?.length || state.over) return out;
  for (const m of [...state.missions]) {
    const k = KINDS[m.key];
    const lostHold = k.hold && state.places[m.place].owner !== m.civ;
    if (!lostHold && k.done(state, m)) {
      pay(state, m);
      out.done.push(m);
    } else if (lostHold || state.turn > m.until) {
      const cap = capitalOf(state, m.civ);
      if (cap) state.places[cap].loyalty = Math.max(0, state.places[cap].loyalty - N.missions.failLoyalty);
      out.failed.push(m);
    } else continue;
    state.missions = state.missions.filter((x) => x !== m);
    events?.push({ type: "mission", turn: state.turn, ok: out.done.includes(m), mission: m });
  }
  return out;
}

/** Oyuncu görevi gördü ve kabul etti. */
export function accept(state, id) {
  const m = state.missions?.find((x) => x.id === id);
  if (m) m.seen = true;
  return !!m;
}

/** Oyuncu görevi reddetti: düşer, ceza yok. */
export function decline(state, id) {
  const before = state.missions?.length ?? 0;
  state.missions = (state.missions ?? []).filter((x) => x.id !== id);
  return state.missions.length < before;
}

/**
 * Kaç tur kaldı (bu tur dahil). Savunma görevinde: kaç tur daha dayanmalı.
 */
export const turnsLeft = (state, m) => m.until - state.turn + (KINDS[m.key].hold ? 0 : 1);

/** Ekranda "3 / 5" için: [şimdi, gereken] ya da null. */
export const progress = (state, m) => KINDS[m.key].progress?.(state, m) ?? null;
