// Bilgisayar rakip. Oyuncunun kullandığı kuralların AYNISIYLA oynar - state.js, moves.js,
// diplomacy.js - kendine ait bir kısayolu yok. Bot da oyuncunun yerine bunu çalıştırıyor.
//
// Bir tur: hareketleri yenile, güzergâhları yürü, diplomasi, yükseltme, asker, ordular.
// Kararlar basit önceliklerle (kurallar.md bölüm 11).

import { CIVS } from "../data/world.js";
import { estimate } from "./combat.js";
import { canDeclare, canPropose, declareWar, proposeAlliance, proposePeace } from "./diplomacy.js";
import { neighbours, path } from "./graph.js";
import { access, advance, attack, defenders, hostile, order, refresh, wallsOf } from "./moves.js";
import { N } from "./numbers.js";
import { random } from "./rng.js";
import {
  armiesAt, armiesOf, budget, enemiesOf, formArmy, info, merge, men, placesOf, popCap,
  recruit, recruitInfo, relation, station, strength, upgrade, upgradeInfo,
} from "./state.js";

// Okçu payı hedefi: güçlü okçusu olan daha çok, zayıf okçusu olan daha az basar.
const ARCHERS = { parthia: 0.55, gaul: 0.15, rome: 0.3 };

export function aiTurn(state, civ, events) {
  if (!state.civs[civ].alive) return;
  refresh(state, civ);
  for (const a of armiesOf(state, civ)) advance(state, a);
  diplomacy(state, civ, events);
  build(state, civ);
  recruitAll(state, civ);
  military(state, civ, events);
}

// ---- diplomasi ----

function neighbourCivs(state, civ) {
  const out = new Set();
  for (const id of placesOf(state, civ)) {
    for (const n of neighbours(id)) {
      const o = state.places[n].owner;
      if (o && o !== civ) out.add(o);
    }
  }
  return [...out];
}

function diplomacy(state, civ, events) {
  if (state.turn < N.aiPeace) return;
  const me = strength(state, civ);
  const wars = enemiesOf(state, civ);

  // Savaş: en fazla bir cephe, ve ancak açıkça güçlüyken.
  if (wars.length === 0 || (wars.length === 1 && random(state) < 0.1)) {
    const prey = neighbourCivs(state, civ)
      .filter((o) => canDeclare(state, civ, o))
      .sort((a, b) => strength(state, a) - strength(state, b));
    for (const o of prey) {
      if (me >= N.aiWarRatio * strength(state, o) && random(state) < N.aiWarChance) {
        events.push(declareWar(state, civ, o));
        break;
      }
    }
  }

  // Barış: kaybeden taraf ister (bilgisayarlar arasında; oyuncuya teklif gelmez).
  for (const e of enemiesOf(state, civ)) {
    if (e !== state.player && me < 0.6 * strength(state, e)) {
      const ev = proposePeace(state, civ, e);
      if (ev?.type === "peace") events.push(ev);
    }
  }

  // İttifak: aynı düşmana karşı.
  for (const o of neighbourCivs(state, civ)) {
    if (o === state.player || !canPropose(state, civ, o) || random(state) > 0.3) continue;
    const shared = enemiesOf(state, o).some((e) => enemiesOf(state, civ).includes(e));
    if (shared) {
      const ev = proposeAlliance(state, civ, o);
      if (ev?.type === "ally") events.push(ev);
    }
  }
}

// ---- yükseltme ----

function build(state, civ) {
  const mine = placesOf(state, civ).sort((a, b) => state.places[b].level - state.places[a].level);
  const reserve = 8; // asker basmaya para kalsın
  for (const id of mine) {
    const pl = state.places[id];
    if (pl.upgraded) continue;
    const b = budget(state, civ);
    const cap = popCap(pl, info(id).kind);
    const wish = [];
    if (b.food < 2) wish.push("farms");
    if (pl.pop >= cap * 0.9) wish.push("level");
    if (pl.barracks < 2) wish.push("barracks");
    if (b.weapons < mine.length) wish.push("industry");
    wish.push("farms", "level", "industry", "barracks");
    for (const w of wish) {
      const u = upgradeInfo(state, id, w);
      if (u.why === "max" || u.why === "needLevel") continue;
      if (!u.why && state.civs[civ].money >= u.cost + reserve) upgrade(state, id, w);
      break; // en çok istenene para yetmiyorsa ucuz olana kaçmıyor: biriktiriyor
    }
  }
}

// ---- asker ----

function recruitAll(state, civ) {
  const share = ARCHERS[civ] ?? 0.35;
  for (const id of placesOf(state, civ)) {
    for (let guard = 0; guard < 6; guard++) {
      // Her bölük turda 1 yiyecek yer: ambar eksiye düşmesin.
      if (budget(state, civ).food < 1) return;
      const total = strength(state, civ);
      const archers = placesOf(state, civ).reduce((n, p) => n + state.places[p].arch, 0)
        + armiesOf(state, civ).reduce((n, a) => n + a.arch, 0);
      const type = archers < total * share && !recruitInfo(state, id, "arch").why ? "arch" : "inf";
      if (!recruit(state, id, type)) break;
    }
  }
}

// ---- ordular ----

/**
 * Bir yerin etrafındaki tehlike: savaştığı medeniyetlerin komşudaki orduları, ve komşu
 * garnizonlarının yarısı - bir garnizon aynı tur ordu olup saldırabiliyor. Bağımsızlar saldırmaz.
 */
function threat(state, civ, id) {
  let n = 0;
  for (const nb of neighbours(id)) {
    for (const a of armiesAt(state, nb)) if (relation(state, civ, a.owner) === "war") n += men(a);
    const pl = state.places[nb];
    if (pl.owner && relation(state, civ, pl.owner) === "war") n += men(pl) * 0.5;
  }
  return n;
}

/** Bir yerde bırakılması gereken asker. */
function need(state, civ, id) {
  return Math.max(info(id).capital ? 20 : 10, Math.ceil(threat(state, civ, id) * 1.1));
}

const odds = (state, u, civ, id) => estimate({ civ, inf: u.inf, arch: u.arch }, defenders(state, id), wallsOf(state, id));

/** Bir yerin değeri: başkent ve büyük şehir daha değerli, savunması zayıf olan daha cazip. */
const worth = (state, id) => state.places[id].level * 10 + (info(id).capital ? 25 : 0) - men(defenders(state, id)) * 0.3;

function military(state, civ, events) {
  // 0. Aynı yerdeki ordular birleşsin.
  for (const a of armiesOf(state, civ)) {
    for (const b of armiesAt(state, a.at)) if (b !== a && b.owner === civ && b.moves > 0 && a.moves > 0) merge(state, a.id, b.id);
  }

  // 1. Tehdit altındaki yere ordular çekilsin.
  for (const id of placesOf(state, civ)) {
    if (men(defenders(state, id)) >= need(state, civ, id)) continue;
    for (const a of armiesOf(state, civ)) {
      if (a.at === id) { station(state, a.id); continue; }
      if (a.moves > 0 && neighbours(a.at).includes(id)) {
        order(state, a.id, id);
        if (a.at === id) station(state, a.id);
      }
    }
  }

  // 2. Komşudaki kolay hedeflere ordularla saldır.
  for (const a of armiesOf(state, civ)) {
    if (a.moves <= 0) continue;
    const target = bestTarget(state, civ, a, neighbours(a.at));
    if (target) {
      const ev = attack(state, a.id, target);
      if (ev) events.push(ev);
    }
  }

  // 3. Garnizonların fazlasından vurucu kuvvet: komşuda kolay hedef varsa çık ve vur.
  for (const id of placesOf(state, civ)) {
    const pl = state.places[id];
    const spare = men(pl) - need(state, civ, id);
    if (spare < 20) continue;
    const k = spare / men(pl);
    const force = { inf: Math.floor(pl.inf * k), arch: Math.floor(pl.arch * k) };
    const target = bestTarget(state, civ, force, neighbours(id));
    if (target) {
      const a = formArmy(state, id, force.inf, force.arch);
      const ev = a && attack(state, a.id, target);
      if (ev) events.push(ev);
    }
  }

  // 4. Uzaktaki hedefe yürü. Büyük garnizon fazlası da ordu olup yola çıkar.
  for (const id of placesOf(state, civ)) {
    const pl = state.places[id];
    const spare = men(pl) - need(state, civ, id);
    if (spare >= 50) {
      const k = spare / men(pl);
      formArmy(state, id, Math.floor(pl.inf * k), Math.floor(pl.arch * k));
    }
  }
  for (const a of armiesOf(state, civ)) {
    if (a.moves <= 0 || a.route.length) continue;
    const goal = farTarget(state, civ, a);
    if (goal) order(state, a.id, goal);
    else if (state.places[a.at].owner === civ) station(state, a.id);
  }
}

function bestTarget(state, civ, force, places) {
  let best = null, score = -Infinity;
  for (const id of places) {
    if (!hostile(access(state, civ, id))) continue;
    if (odds(state, force, civ, id).odds !== "easy") continue;
    const s = worth(state, id);
    if (s > score) { best = id; score = s; }
  }
  return best;
}

/** Yürüyerek ulaşılabilen, bu orduyla alınabilecek en yakın düşman ya da bağımsız yer. */
function farTarget(state, civ, a) {
  const walkable = (id) => {
    const k = access(state, civ, id);
    return k === "own" || k === "ally";
  };
  let best = null, dist = Infinity;
  for (const c of [...CIVS.map((x) => x.id), null]) {
    if (c === civ || (c && relation(state, civ, c) !== "war")) continue;
    for (const id of Object.keys(state.places)) {
      if (state.places[id].owner !== c || odds(state, a, civ, id).odds === "hopeless") continue;
      for (const n of neighbours(id)) {
        if (n !== a.at && !walkable(n)) continue;
        const p = n === a.at ? [a.at] : path(a.at, n, walkable);
        if (p && p.length < dist) { dist = p.length; best = id; }
      }
    }
  }
  return best;
}
