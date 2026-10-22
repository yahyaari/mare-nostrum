// Bilgisayar rakip (SADE SÜRÜM). Oyuncunun kullandığı kuralların AYNISIYLA oynar - state.js,
// moves.js, diplomacy.js - kendine ait bir kısayolu yok. Bot da oyuncunun yerine bunu
// çalıştırıyor.
//
// Bir tur: hareketleri yenile, güzergâhları yürü, diplomasi, geliştirme, gemi, asker, ordular.

import { CIVS } from "../data/world.js";
import { canDeclare, canPropose, declareWar, proposeAlliance, proposePeace } from "./diplomacy.js";
import { neighbours, path, roadBetween } from "./graph.js";
import { access, advance, attack, canAttack, defenders, forecast, hostile, order, refresh } from "./moves.js";
import { LEVELS, N, UNITS } from "./numbers.js";
import { random } from "./rng.js";
import {
  armiesAt, armiesOf, budget, buildShip, canSail, enemiesOf, formArmy, info, merge, men, placesOf,
  recruit, recruitCost, recruitInfo, relation, shipInfo, station, strength, upgrade, upgradeInfo, upkeepOf,
} from "./state.js";

// Ordunun hedeflenen bileşimi (payları; gerisi piyade): medeniyetin güçlü türü biraz fazla.
const MIX = {
  default: { arch: 0.3, cav: 0.15 },
  parthia: { arch: 0.5, cav: 0.15 },
  saka: { arch: 0.2, cav: 0.4 },
  rome: { arch: 0.2, cav: 0.1 },
};

export function aiTurn(state, civ, events) {
  if (!state.civs[civ].alive) return;
  refresh(state, civ);
  for (const a of armiesOf(state, civ)) advance(state, a);
  diplomacy(state, civ, events);
  build(state, civ);
  shipyard(state, civ);
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
  const level = LEVELS[state.level] ?? LEVELS.normal;
  // Oyuncuya karşı zorluğun sayıları, bilgisayarlar arasında her zaman aynıları.
  const peace = (o) => (o === state.player ? level.peace : N.aiPeace);
  // Bilgisayarlar arası hırs zamanla artar: denk güçler arasında da er geç savaş çıksın.
  // Alınacak bağımsız yer kalmamışsa daha da hırslı.
  const noFreeLeft = !Object.values(state.places).some((p) => p.owner === null);
  const greed = Math.max(N.aiWarRatioMin, N.aiWarRatio - N.aiGreed * Math.max(0, state.turn - N.aiPeace) - (noFreeLeft ? 0.15 : 0));
  const ratio = (o) => (o === state.player ? level.warRatio : greed);
  if (state.turn < Math.min(N.aiPeace, level.peace)) return;
  const me = strength(state, civ);
  const wars = enemiesOf(state, civ);

  // Savaş: en fazla bir cephe, ve ancak açıkça güçlüyken.
  if (wars.length === 0 || (wars.length === 1 && random(state) < 0.1)) {
    const prey = neighbourCivs(state, civ)
      .filter((o) => canDeclare(state, civ, o) && state.turn >= peace(o))
      .sort((a, b) => strength(state, a) - strength(state, b));
    for (const o of prey) {
      if (me >= ratio(o) * strength(state, o) && random(state) < N.aiWarChance) {
        events.push(declareWar(state, civ, o));
        break;
      }
    }
  }

  // Barış: kaybeden taraf ister (bilgisayarlar arasında; oyuncu kendisi teklif eder).
  for (const e of enemiesOf(state, civ)) {
    if (e !== state.player && me < 0.6 * strength(state, e)) {
      const ev = proposePeace(state, civ, e);
      if (ev?.type === "peace") events.push(ev);
    }
  }

  // İttifak: aynı düşmana karşı (bilgisayarlar arasında).
  for (const o of neighbourCivs(state, civ)) {
    if (o === state.player || !canPropose(state, civ, o) || random(state) > 0.3) continue;
    const shared = enemiesOf(state, o).some((e) => enemiesOf(state, civ).includes(e));
    if (shared) {
      const ev = proposeAlliance(state, civ, o);
      if (ev?.type === "ally") events.push(ev);
    }
  }
}

// ---- ekonomi ----

/**
 * Geliştir: en ucuzu önce (her seviye aynı geliri getirir, ucuzu daha kârlı); kale yarım
 * ürettiği için en sona. Asker basmaya para kalsın. (Başkenti bekleyip hiçbir şeyi
 * geliştirmeyen küçük medeniyetler büyüyemiyor, 20. turda yıkılıyordu.)
 */
function build(state, civ) {
  const castle = (id) => (info(id).kind === "castle" ? 1 : 0);
  const mine = placesOf(state, civ).sort((a, b) => castle(a) - castle(b) || state.places[a].level - state.places[b].level || (info(b).capital ? 1 : 0) - (info(a).capital ? 1 : 0));
  const reserve = 15;
  for (const id of mine) {
    const u = upgradeInfo(state, id);
    if (u.why === "max" || u.why === "done") continue;
    if (state.civs[civ].money >= u.cost + reserve) upgrade(state, id);
    else break; // en ucuzuna para yetmiyorsa biriktir
  }
}

/** Gemi: denizin karşısında alınacak bir yer varsa ve garnizonun fazlası denize açılabilsin. */
function shipyard(state, civ) {
  for (const id of placesOf(state, civ)) {
    const pl = state.places[id];
    if (!info(id).port) continue;
    const overseas = neighbours(id).some((n) => roadBetween(id, n).sea && hostile(access(state, civ, n)));
    if (!overseas) continue;
    const spare = Math.max(0, men(pl) - need(state, civ, id));
    const want = Math.min(4, Math.max(1, Math.ceil(spare / N.ship.carry)));
    if (pl.ships < want && !shipInfo(state, id).why && state.civs[civ].money >= shipInfo(state, id).cost + 10) buildShip(state, id);
  }
}

/** Asker: yemek yettiği kadar; en çok eksik olan tür. */
function recruitAll(state, civ) {
  const mix = MIX[civ] ?? MIX.default;
  for (const id of placesOf(state, civ)) {
    for (let guard = 0; guard < 6; guard++) {
      const b = budget(state, civ);
      const total = strength(state, civ) || 1;
      const units = [...placesOf(state, civ).map((p) => state.places[p]), ...armiesOf(state, civ)];
      const have = (k) => units.reduce((n, u) => n + u[k], 0) / total;
      const type = ["cav", "arch"].filter((k) => have(k) < mix[k]).sort((a, b) => have(a) / mix[a] - have(b) / mix[b])[0] ?? "inf";
      // Yeni bölüğün bakımı ambarı eritmesin: ambarda yemek varsa turluk denge biraz eksiye
      // düşebilir (stok yaklaşık 25 turda biter), yoksa artıda kalmalı.
      if (b.food - upkeepOf({ [type]: N.company }) < Math.min(0.5, -state.civs[civ].food / 25)) return;
      if (recruitInfo(state, id, type).why) break;
      recruit(state, id, type);
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
const need = (state, civ, id) => Math.max(info(id).capital ? 20 : 10, Math.ceil(threat(state, civ, id) * 1.1));

const odds = (state, u, civ, id) => forecast(state, u, civ, id);

/** Bir yerin değeri: başkent ve büyük şehir daha değerli, savunması zayıf olan daha cazip. */
const worth = (state, id) => state.places[id].level * 10 + (info(id).capital ? 25 : 0) - men(defenders(state, id)) * 0.3;

/** Limandan çıkan kuvvete gemi: taşıyabileceği kadar. */
const shipsFor = (pl, force) => Math.max(0, Math.min(pl.ships, Math.ceil(men(force) / N.ship.carry)));

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

  // 2. Komşudaki kolay hedeflere ordularla saldır (denizden ancak gemisi yetiyorsa).
  for (const a of armiesOf(state, civ)) {
    if (a.moves <= 0) continue;
    const target = bestTarget(state, civ, a, neighbours(a.at).filter((n) => canAttack(state, a, n)));
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
    const force = Object.fromEntries(UNITS.map((t) => [t, Math.floor(pl[t] * k)]));
    force.ships = shipsFor(pl, force);
    force.at = id;
    const reach = neighbours(id).filter((n) => !roadBetween(id, n).sea || canSail(force));
    const target = bestTarget(state, civ, force, reach);
    if (target) {
      const sea = roadBetween(id, target).sea;
      const a = formArmy(state, id, force.inf, force.arch, force.cav, sea ? force.ships : 0);
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
      const force = Object.fromEntries(UNITS.map((t) => [t, Math.floor(pl[t] * k)]));
      formArmy(state, id, force.inf, force.arch, force.cav, shipsFor(pl, force));
    }
  }
  for (const a of armiesOf(state, civ)) {
    if (a.moves <= 0 || a.route.length) continue;
    // Kendi limanındaysa gemiye bin: denizden de hedef seçebilsin.
    const pl = state.places[a.at];
    if (pl.owner === civ && pl.ships > 0 && !canSail(a)) {
      const take = Math.min(pl.ships, Math.ceil(men(a) / N.ship.carry) - a.ships);
      pl.ships -= take;
      a.ships += take;
    }
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
  const usable = (r) => !r.sea || canSail(a);
  let best = null, dist = Infinity;
  for (const c of [...CIVS.map((x) => x.id), null]) {
    if (c === civ || (c && relation(state, civ, c) !== "war")) continue;
    for (const id of Object.keys(state.places)) {
      if (state.places[id].owner !== c || odds(state, a, civ, id).odds === "hopeless") continue;
      for (const n of neighbours(id)) {
        if (n !== a.at && !walkable(n)) continue;
        if (!usable(roadBetween(n, id))) continue;
        const p = n === a.at ? [a.at] : path(a.at, n, walkable, usable);
        if (p && p.length < dist) { dist = p.length; best = id; }
      }
    }
  }
  return best;
}
