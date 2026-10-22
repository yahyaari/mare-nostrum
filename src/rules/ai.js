// Bilgisayar rakip. Oyuncunun kullandığı kuralların AYNISIYLA oynar - state.js, moves.js,
// diplomacy.js - kendine ait bir kısayolu yok. Bot da oyuncunun yerine bunu çalıştırıyor.
//
// Bir tur: hareketleri yenile, güzergâhları yürü, diplomasi, yükseltme, asker, ordular.
// Kararlar basit önceliklerle (kurallar.md bölüm 11).

import { CIVS } from "../data/world.js";
import { canDeclare, canPropose, declareWar, proposeAlliance, proposePeace } from "./diplomacy.js";
import { offer } from "./events.js";
import { appoint, appointInfo } from "./generals.js";
import { rebels } from "./loyalty.js";
import { neighbours, path, roadBetween } from "./graph.js";
import { access, advance, attack, canAttack, defenders, forecast, hostile, order, refresh } from "./moves.js";
import { besiege, canBesiege } from "./siege.js";
import { LEVELS, N, SHIPS, UNITS } from "./numbers.js";
import { random } from "./rng.js";
import {
  armiesAt, armiesOf, blockaded, budget, buildShip, canSail, carryOf, enemiesOf, fleetOf, gamesInfo, holdGames, info, key, merge, men,
  freeBuilders, muster, placesOf, popCap, recruit, recruitInfo, relation, shipInfo, shipsToCarry, station, strength, upgrade, upgradeInfo,
} from "./state.js";

// Ordunun hedeflenen bileşimi (payları; gerisi piyade). Güçlü okçusu olan daha çok okçu, zayıf
// okçusu olan daha az; Sakalar süvari. Kuşatma makinesi az ama hep biraz: surlu hedefler için.
// Okçu payları süvari gelmeden önceki değerler: 0.35 -> 0.3 indirmek savunmaları zayıflattı ve
// ilk düşüşü 70 oyunda 41. turdan 28. tura çekti (okçu sur arkasında iki kat atıyor).
const MIX = {
  default: { arch: 0.35, cav: 0.1, siege: 0.04 },
  parthia: { arch: 0.55, cav: 0.08, siege: 0.03 },
  gaul: { arch: 0.15, cav: 0.12, siege: 0.03 },
  rome: { arch: 0.3, cav: 0.06, siege: 0.06 },
  saka: { arch: 0.35, cav: 0.25, siege: 0.03 },
};

export function aiTurn(state, civ, events) {
  if (!state.civs[civ].alive) return;
  refresh(state, civ);
  for (const a of armiesOf(state, civ)) advance(state, a);
  diplomacy(state, civ, events);
  offers(state, civ);
  calm(state, civ);
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
  // (Donanma ve liman yapılarından sonra dengelenen dünyada 7 oyunun 2'sinde 120 tur hiç savaş
  // çıkmıyordu.) Alınacak bağımsız yer kalmamışsa daha da hırslı.
  const noFreeLeft = !Object.values(state.places).some((p) => p.owner === null);
  const greed = Math.max(N.aiWarRatioMin, N.aiWarRatio - N.aiGreed * Math.max(0, state.turn - N.aiPeace) - (noFreeLeft ? 0.15 : 0));
  const ratio = (o) => (o === state.player ? level.warRatio : greed);
  if (state.turn < Math.min(N.aiPeace, level.peace)) return;
  const me = strength(state, civ);
  const wars = enemiesOf(state, civ);

  // Savaş: en fazla bir cephe, ve ancak açıkça güçlüyken.
  if (wars.length === 0 || (wars.length === 1 && random(state) < 0.1)) {
    // Haraç alınmışsa oyuncuya ateşkes süresince dokunmaz.
    const truce = (o) => o === state.player && (state.truce[key(civ, o)] ?? 0) > state.turn;
    const prey = neighbourCivs(state, civ)
      .filter((o) => canDeclare(state, civ, o) && state.turn >= peace(o) && !truce(o))
      .sort((a, b) => strength(state, a) - strength(state, b));
    for (const o of prey) {
      if (me >= ratio(o) * strength(state, o) && random(state) < N.aiWarChance) {
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

/**
 * Oyuncuya teklifler (gelen kutusuna gider, oyuncu karar verir): kaybediyorsa barış, ortak
 * düşman varsa ittifak, çok güçlü bir komşuysa haraç. Aynı medeniyetten birkaç turda bir.
 */
function offers(state, civ) {
  const P = state.player;
  if (civ === P || !state.civs[P].alive) return;
  const k = key(civ, P);
  if (state.turn - (state.offered[k] ?? -99) < N.offers.spacing) return;
  const rel = relation(state, civ, P);
  const ratio = strength(state, civ) / Math.max(1, strength(state, P));
  const level = LEVELS[state.level] ?? LEVELS.normal;
  if (rel === "war" && ratio < 0.7 && random(state) < 0.35) offer(state, civ, "peace");
  else if (rel === "neutral" && enemiesOf(state, civ).some((e) => enemiesOf(state, P).includes(e)) && random(state) < 0.3) {
    offer(state, civ, "ally");
  } else if (rel === "neutral" && state.turn >= level.peace && ratio >= N.offers.tributeRatio
    && neighbourCivs(state, civ).includes(P) && (state.truce[k] ?? 0) <= state.turn && random(state) < 0.15) {
    offer(state, civ, "tribute", { amount: Math.round(15 + state.turn * 0.8) });
  }
}

// ---- sadakat ----

/** Huzursuz yerde oyun düzenle (para varsa). Garnizon ihtiyacını `need` zaten büyütüyor. */
function calm(state, civ) {
  for (const id of placesOf(state, civ)) {
    const pl = state.places[id];
    if (pl.loyalty < 35 && !gamesInfo(state, id).why && state.civs[civ].money >= N.loyalty.gamesCost + 10) holdGames(state, id);
  }
}

// ---- yükseltme ----

function build(state, civ) {
  const mine = placesOf(state, civ).sort((a, b) => state.places[b].level - state.places[a].level);
  const reserve = 8; // asker basmaya para kalsın
  for (const id of mine) {
    const pl = state.places[id];
    if (pl.upgraded) continue; // alındığı tur
    // Boş her inşaatçıya bir iş: istekler her seferinde yeniden (bütçe değişti).
    for (let slot = freeBuilders(state, id); slot > 0; slot--) {
      if (!buildOne(state, civ, id, mine, reserve)) break;
    }
  }
}

/** Bir yere bir inşaat başlat: en çok istenene para yetmiyorsa biriktirir. Başladıysa true. */
function buildOne(state, civ, id, mine, reserve) {
  const pl = state.places[id];
  const b = budget(state, civ);
  const cap = popCap(pl, info(id).kind);
  const port = info(id).port;
  const wish = [];
  // Yiyecek dar: tarla (limanda balıkçılık); tarla şehir seviyesine dayandıysa önce şehir seviyesi.
  // İnşaat birkaç tur sürdüğü için bu zincir önemli: eskiden anında bitiyordu, şimdi kışlaya kaçan
  // bilgisayar 10+ tur yiyeceksiz kalıp asker basamıyordu (Galya hiç büyüyemiyordu).
  if (b.food < 2) wish.push("farms", ...(port ? ["fishery"] : []), ...(pl.farms >= pl.level ? ["level"] : []));
  if (pl.pop >= cap * 0.9) wish.push("level");
  if (pl.barracks < 2) wish.push("barracks");
  if (b.weapons < mine.length) wish.push("industry");
  // Liman: ablukadaysa kale, ve erken bir ticaret (10 paraya turda +2: beş turda kendini öder).
  if (port && blockaded(state, id)) wish.push("fort");
  if (port && pl.trade < 1) wish.push("trade");
  wish.push("farms", ...(port ? ["fishery", "trade"] : []), "level", "industry", "barracks", ...(port ? ["shipyard", "fort"] : []));
  for (const w of wish) {
    const u = upgradeInfo(state, id, w);
    if (u.why === "max" || u.why === "needLevel" || u.why === "notPort" || u.why === "building") continue;
    if (!u.why && state.civs[civ].money >= u.cost + reserve) return upgrade(state, id, w);
    return false; // en çok istenene para yetmiyorsa ucuz olana kaçmıyor: biriktiriyor
  }
  return false;
}

// ---- donanma ----

/**
 * Limanlarda gemi: deniz yolu olan her liman savunma için en az bir gemi tutar, garnizonun
 * fazlası denize açılabilsin diye de ona yetecek kadar (bir kadırga 25 asker), en fazla 6.
 * Taşınacak asker gemilere sığmıyorsa kadırga; yoksa tersanenin yapabildiği en iyi savaş gemisi.
 */
function shipyard(state, civ) {
  for (const id of placesOf(state, civ)) {
    const pl = state.places[id];
    if (!info(id).port || !neighbours(id).some((n) => roadBetween(id, n).sea)) continue;
    const spare = Math.max(0, men(pl) - need(state, civ, id));
    // Filo ancak denizin karşısında alınacak bir yer varsa; yoksa savunma için tek gemi. (Her
    // limana 6 gemi yapınca limanı olanlar bakımdan eriyordu, limansız Galya Roma'yı yutuyordu.)
    const overseas = neighbours(id).some((n) => roadBetween(id, n).sea && hostile(access(state, civ, n)));
    const want = overseas ? Math.min(6, Math.max(1, Math.ceil(spare / N.navy.types.ships.carry))) : 1;
    for (let guard = 0; guard < 3 && fleetOf(pl) < want; guard++) {
      const type = overseas && carryOf(pl) < spare ? "ships" : warship(pl);
      // Gemi de yer: yiyecek darsa tersane durur (yoksa bilgisayar kıtlığa giriyordu).
      if (shipInfo(state, id, type).why || state.civs[civ].money < N.navy.types[type].money + 10 || budget(state, civ).food < 2) break;
      buildShip(state, id, type);
    }
  }
}

/** Bu limanın tersanesinin yapabildiği en güçlü gemi. */
const warship = (pl) => ["quinq", "trireme", "ships"].find((k) => (pl.shipyard ?? 0) >= N.navy.types[k].yard);

/** Limandan çıkan kuvvete gemi: taşıyabileceği kadar. (Limana savunma için bir gemi
 * bırakınca başlangıçtaki tek gemiyle kimse denize açılamıyordu; dünya donuyordu.) */
const shipsFor = (pl, force) => shipsToCarry(pl, men(force));

// ---- asker ----

function recruitAll(state, civ) {
  const mix = MIX[civ] ?? MIX.default;
  for (const id of placesOf(state, civ)) {
    for (let guard = 0; guard < 6; guard++) {
      // Her bölük turda 1 yiyecek yer (süvari 2): ambar eksiye düşmesin.
      if (budget(state, civ).food < 1) return;
      const total = strength(state, civ) || 1;
      const units = [...placesOf(state, civ).map((p) => state.places[p]), ...armiesOf(state, civ)];
      const have = (k) => units.reduce((n, u) => n + u[k], 0) / total;
      // En çok eksik olan tür, basılabiliyorsa; yoksa piyade.
      const type = ["siege", "cav", "arch"]
        .filter((k) => have(k) < mix[k] && !recruitInfo(state, id, k).why)
        .sort((a, b) => have(a) / mix[a] - have(b) / mix[b])[0] ?? "inf";
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
  // Huzursuz yer isyancılardan güçlü bir garnizon ister, yoksa elden çıkar.
  const unrest = state.places[id].loyalty < 45 ? rebels(state, id) + 5 : 0;
  return Math.max(info(id).capital ? 20 : 10, unrest, Math.ceil(threat(state, civ, id) * 1.1));
}

const odds = (state, u, civ, id) => forecast(state, u, civ, id);

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

  // 1b. Büyük ordulara general (para varsa).
  for (const a of armiesOf(state, civ)) {
    if (men(a) >= 80 && !appointInfo(state, a.id).why && state.civs[civ].money >= N.generals.cost + 25) appoint(state, a.id);
  }

  // 2. Komşudaki kolay hedeflere ordularla saldır (denizden ancak gemisi yetiyorsa). Kolay
  // hedef yoksa ve yanında zorlu bir sur varsa kuşat (ordu en az savunanların yarısıysa).
  // Kuşatan ordu, hedefi kolaylaşınca saldırır; yoksa beklemeye devam eder.
  for (const a of armiesOf(state, civ)) {
    if (a.moves <= 0) continue;
    const target = bestTarget(state, civ, a, neighbours(a.at).filter((n) => canAttack(state, a, n)));
    if (target) {
      const ev = attack(state, a.id, target);
      if (ev) events.push(ev);
      continue;
    }
    if (a.besieging) { a.moves = 0; continue; }
    let siege = null, score = -Infinity;
    for (const n of neighbours(a.at)) {
      if (!canBesiege(state, a, n) || men(a) < men(defenders(state, n)) * 0.5) continue;
      if (odds(state, a, civ, n).odds === "hopeless") continue;
      const s = worth(state, n);
      if (s > score) { siege = n; score = s; }
    }
    if (siege) besiege(state, a.id, siege, events);
  }

  // 3. Garnizonların fazlasından vurucu kuvvet: komşuda kolay hedef varsa çık ve vur.
  for (const id of placesOf(state, civ)) {
    const pl = state.places[id];
    const spare = men(pl) - need(state, civ, id);
    if (spare < 20) continue;
    const k = spare / men(pl);
    const force = Object.fromEntries(UNITS.map((t) => [t, Math.floor(pl[t] * k)]));
    Object.assign(force, shipsFor(pl, force));
    force.at = id;
    // Deniz aşırı komşu ancak gemiler kuvveti taşıyabiliyorsa.
    const reach = neighbours(id).filter((n) => !roadBetween(id, n).sea || canSail(force));
    const target = bestTarget(state, civ, force, reach);
    if (target) {
      const sea = roadBetween(id, target).sea;
      const a = muster(state, id, sea ? force : { ...force, ships: 0, trireme: 0, quinq: 0 });
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
      muster(state, id, { ...force, ...shipsFor(pl, force) });
    }
  }
  for (const a of armiesOf(state, civ)) {
    if (a.moves <= 0 || a.route.length || a.besieging) continue;
    // Kendi limanındaysa gemiye bin: denizden de hedef seçebilsin.
    const pl = state.places[a.at];
    if (pl.owner === civ && fleetOf(pl) > 0 && !canSail(a)) {
      const take = shipsToCarry(pl, men(a) - carryOf(a));
      for (const k of SHIPS) { pl[k] -= take[k]; a[k] += take[k]; }
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
  // Deniz yolu ancak gemiler orduyu taşıyabiliyorsa.
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
