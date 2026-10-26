// Bilgisayar rakip. Oyuncunun kullandığı kuralların AYNISIYLA oynar - state.js, moves.js,
// diplomacy.js - kendine ait bir kısayolu yok. Bot da oyuncunun yerine bunu çalıştırıyor.
//
// Bir tur: hareketleri yenile, güzergâhları yürü, diplomasi, yükseltme, asker, ordular.
// Kararlar basit önceliklerle (kurallar.md bölüm 11).

import { CIVS } from "../data/world.js";
import { angerOf, canDeclare, canPropose, declareWar, proposeAlliance, proposePeace } from "./diplomacy.js";
import { offer } from "./events.js";
import { appoint, appointInfo } from "./generals.js";
import { rebels } from "./loyalty.js";
import { neighbours } from "./graph.js";
import {
  access, advance, attack, avoidFor, bySea, canAttack, canStrike, defenders, forecast, forecastField, hostile, nearest, order, reachOf, refresh, routeTo, strike,
} from "./moves.js";
import { POS, centre, dist } from "./map.js";
import { BUILDABLE, wondersAt } from "./wonders.js";
import { besiege, canBesiege } from "./siege.js";
import { LEVELS, N, SHIPS, UNITS, trait } from "./numbers.js";
import { candidates, openRoute, routesFrom, slotsOf } from "./trade.js";
import { random } from "./rng.js";
import { aiResearch, unlocked } from "./research.js";
import { dealOf, moodOf, persona, warMoodMul } from "./leaders.js";
import {
  armiesAt, armiesOf, armyById, blockaded, budget, buildShip, canSail, carryOf, enemiesOf, fleetOf, gamesInfo, holdGames, info, key, merge, men,
  freeBuilders, humansOf, isHuman, muster, placesOf, popCap, recruit, recruitInfo, relation, shipInfo, shipsToCarry, startWonder, station, strength, together, upgrade, upgradeInfo, wonderInfo,
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

/** Boş ticaret yuvası olan her şehir en kazançlı yolu kurar (trade.js). */
function tradeAll(state, civ) {
  for (const id of placesOf(state, civ)) {
    for (let guard = 0; guard < 4 && routesFrom(state, id).length < slotsOf(state, id); guard++) {
      const best = candidates(state, id)[0];
      if (!best || !openRoute(state, id, best.to)) break;
    }
  }
}

export function aiTurn(state, civ, events) {
  if (!state.civs[civ].alive) return;
  refresh(state, civ);
  for (const a of armiesOf(state, civ)) advance(state, a);
  diplomacy(state, civ, events);
  offers(state, civ);
  calm(state, civ);
  aiResearch(state, civ);
  build(state, civ);
  buildWonders(state, civ);
  shipyard(state, civ);
  tradeAll(state, civ);
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
  const peace = (o) => (isHuman(state, o) ? level.peace : N.aiPeace);
  // Bilgisayarlar arası hırs zamanla artar: denk güçler arasında da er geç savaş çıksın.
  // (Donanma ve liman yapılarından sonra dengelenen dünyada 7 oyunun 2'sinde 120 tur hiç savaş
  // çıkmıyordu.) Alınacak bağımsız yer kalmamışsa daha da hırslı.
  const noFreeLeft = !Object.values(state.places).some((p) => p.owner === null);
  const greed = Math.max(N.aiWarRatioMin, N.aiWarRatio - N.aiGreed * Math.max(0, state.turn - N.aiPeace) - (noFreeLeft ? 0.15 : 0));
  const ratio = (o) => (isHuman(state, o) ? level.warRatio : greed);
  const me = strength(state, civ);
  // Toprağına giren tarafsıza öfke (diplomacy.js trespass): sabrı taşınca savaş, barış süresini
  // beklemeden - ancak açıkça zayıf değilse. Haraç alınmışsa ateşkes süresince dokunmaz.
  for (const c of CIVS) {
    const o = c.id;
    if (o === civ || !state.civs[o].alive || !canDeclare(state, civ, o)) continue;
    if (isHuman(state, o) && (state.truce[key(civ, o)] ?? 0) > state.turn) continue;
    if (angerOf(state, civ, o) >= persona(civ).anger && me >= N.anger.ratio * strength(state, o)) events.push(declareWar(state, civ, o));
  }
  if (state.turn < Math.min(N.aiPeace, level.peace)) return;
  // Harikalar zaferine giden medeniyet: herkes için hedef (gücü denkse savaş açılır).
  for (const c of CIVS) {
    const o = c.id;
    if (o === civ || !state.wonderHold?.[o] || !canDeclare(state, civ, o)) continue;
    if (isHuman(state, o) && state.turn < level.peace) continue;
    if (me >= 0.8 * strength(state, o) && random(state) < 0.35) events.push(declareWar(state, civ, o));
  }
  const wars = enemiesOf(state, civ);

  // Savaş: en fazla bir cephe, ve ancak açıkça güçlüyken.
  if (wars.length === 0 || (wars.length === 1 && random(state) < 0.1)) {
    // Haraç alınmışsa oyuncuya ateşkes süresince dokunmaz.
    const truce = (o) => isHuman(state, o) && (state.truce[key(civ, o)] ?? 0) > state.turn;
    const prey = neighbourCivs(state, civ)
      .filter((o) => canDeclare(state, civ, o) && state.turn >= peace(o) && !truce(o))
      .sort((a, b) => strength(state, a) - strength(state, b));
    // Kişilik (savaşçı lider daha az üstünlükle, daha sık) ve tutum (düşmanca olana daha istekli).
    const p = persona(civ);
    for (const o of prey) {
      const want = p.war * warMoodMul(moodOf(state, civ, o).score);
      if (me >= (ratio(o) / p.war) * strength(state, o) && random(state) < N.aiWarChance * want) {
        events.push(declareWar(state, civ, o));
        break;
      }
    }
  }

  // Barış: kaybeden taraf ister (bilgisayarlar arasında; oyuncuya teklif gelmez).
  for (const e of enemiesOf(state, civ)) {
    if (!isHuman(state, e) && me < 0.6 * strength(state, e)) {
      const ev = proposePeace(state, civ, e);
      if (ev?.type === "peace") events.push(ev);
    }
  }

  // İttifak: aynı düşmana karşı.
  for (const o of neighbourCivs(state, civ)) {
    if (isHuman(state, o) || !canPropose(state, civ, o) || random(state) > 0.3) continue;
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
  for (const P of humansOf(state)) offersTo(state, civ, P);
}

function offersTo(state, civ, P) {
  if (civ === P || !state.civs[P].alive) return;
  const k = key(civ, P);
  if (state.turn - (state.offered[k] ?? -99) < N.offers.spacing) return;
  const rel = relation(state, civ, P);
  const ratio = strength(state, civ) / Math.max(1, strength(state, P));
  const level = LEVELS[state.level] ?? LEVELS.normal;
  const mood = moodOf(state, civ, P).score;
  const deal = dealOf(state, civ, P);
  if (rel === "war" && ratio < 0.7 && random(state) < 0.35) offer(state, civ, "peace", {}, P);
  else if (rel === "neutral" && enemiesOf(state, civ).some((e) => enemiesOf(state, P).includes(e)) && random(state) < 0.3) {
    offer(state, civ, "ally", {}, P);
  } else if (rel !== "war" && mood >= 20 && !(deal && deal.until > state.turn) && random(state) < 0.2) {
    // Dostça bir komşu ticaret önerir.
    offer(state, civ, "trade", {}, P);
  } else if (rel === "neutral" && state.turn >= level.peace && ratio >= N.offers.tributeRatio && mood < 25
    && neighbourCivs(state, civ).includes(P) && (state.truce[k] ?? 0) <= state.turn && random(state) < 0.15) {
    offer(state, civ, "tribute", { amount: Math.round(15 + state.turn * 0.8) }, P);
  }
}

// ---- harikalar ----

/**
 * Parası artanda bir harikaya başla: ucuzdan pahalıya ilk yapılabilen, en büyük şehrinde. Turda
 * bir ihtimalle (hepsi aynı tur başlamasın), kasada pay bırakarak, aynı anda bir tane.
 */
function buildWonders(state, civ) {
  if (random(state) > 0.3) return;
  // Aynı anda en çok bir harika (bunsuz zengin medeniyet hepsini birden yapıp Harikalar zaferine koşuyordu).
  if (placesOf(state, civ).some((id) => state.places[id].builds?.some((b) => b.what.startsWith("wonder:")))) return;
  for (const w of BUILDABLE) {
    const ids = placesOf(state, civ).filter((id) => !wonderInfo(state, id, w.id).why && state.civs[civ].money >= wonderInfo(state, id, w.id).cost + 60).sort((a, b) => state.places[b].level - state.places[a].level);
    if (ids.length) {
      startWonder(state, ids[0], w.id);
      return;
    }
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
  // Huzursuz şehre tapınak.
  if (pl.loyalty < 60) wish.push("temple");
  wish.push("farms", ...(port ? ["fishery", "trade"] : []), "level", "market", "school", "industry", "barracks", "baths", "temple", ...(port ? ["shipyard", "fort"] : []));
  for (const w of wish) {
    const u = upgradeInfo(state, id, w);
    if (u.why === "max" || u.why === "needLevel" || u.why === "notPort" || u.why === "building" || u.why?.startsWith("tech_")) continue;
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
    // Denizin karşısında (yakında, arada deniz olan) başka bir yer yoksa liman gemi yapmaz.
    const across = info(id).port ? Object.keys(state.places).filter((n) => n !== id && dist(POS[id], POS[n]) <= 6 && bySea(POS[id], POS[n])) : [];
    if (!across.length) continue;
    const spare = Math.max(0, men(pl) - need(state, civ, id));
    // Filo ancak denizin karşısında alınacak bir yer varsa; yoksa savunma için tek gemi. (Her
    // limana 6 gemi yapınca limanı olanlar bakımdan eriyordu, limansız Galya Roma'yı yutuyordu.)
    const overseas = across.some((n) => hostile(access(state, civ, n)));
    const want = overseas ? Math.min(6, Math.max(1, Math.ceil(spare / N.navy.types.ships.carry))) : 1;
    for (let guard = 0; guard < 3 && fleetOf(pl) < want; guard++) {
      const type = overseas && carryOf(pl) < spare ? "ships" : warship(state, pl);
      // Gemi de yer: yiyecek darsa tersane durur (yoksa bilgisayar kıtlığa giriyordu).
      if (shipInfo(state, id, type).why || state.civs[civ].money < N.navy.types[type].money + 10 || budget(state, civ).food < 2) break;
      buildShip(state, id, type);
    }
  }
}

/** Bu limanın tersanesinin yapabildiği (ve araştırmanın açtığı) en güçlü gemi. */
const warship = (state, pl) => ["quinq", "trireme", "ships"].find((k) => (pl.shipyard ?? 0) >= N.navy.types[k].yard && unlocked(state, pl.owner, k));

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
      const have = (k) => units.reduce((n, u) => n + (u[k] ?? 0), 0) / total;
      // En çok eksik olan tür, basılabiliyorsa; yoksa piyade. Özel birlik de ordunun bir parçası,
      // ama ancak ilk turlardan sonra ve kasa ile cephanelik bolken: pahalı ve silah yiyor, erken
      // basınca bilgisayar bağımsızları çok geç alıyordu (25. turda 1-4 yerine 4-9 bağımsız kalıyordu).
      const want = { elite: N.aiElite, ...mix };
      const rich = (k) => {
        if (k !== "elite") return true;
        const c = recruitInfo(state, id, k).cost, me = state.civs[civ];
        return state.turn >= N.aiEliteFrom && me.money >= c.money * 3 && me.weapons >= c.weapons * 3;
      };
      const type = ["elite", "siege", "cav", "arch"]
        .filter((k) => have(k) < want[k] && rich(k) && !recruitInfo(state, id, k).why)
        .sort((a, b) => have(a) / want[a] - have(b) / want[b])[0] ?? "inf";
      if (!recruit(state, id, type)) break;
    }
  }
}

// ---- ordular ----
//
// Serbest yürüyüşle (kullanıcı 22.10): bilgisayar her ordusu için bu tur nereye yetişebildiğine
// bakar (moves.js reachOf). Yetişebildiği kolay bir hedef - düşman ya da bağımsız yerleşim, ya da
// yerleşimin dışındaki bir düşman ordusu (meydan muharebesi) - varsa yürür ve saldırır; yoksa
// surlu bir yeri kuşatır; o da yoksa uzaktaki hedefe birkaç turda yürür. Tehdit altındaki yerine
// yetişebilen ordular içeri girer. Tarafsızların toprağından kaçınır (öfkelenirler).

/**
 * Bir yerin etrafındaki tehlike: savaştığı medeniyetlerin yakındaki (N.reach.threat) orduları,
 * ve yakındaki garnizonlarının yarısı - bir garnizon aynı tur ordu olup saldırabiliyor.
 * Bağımsızlar saldırmaz.
 */
function threat(state, civ, id) {
  let n = 0;
  for (const a of state.armies) if (!a.at && (relation(state, civ, a.owner) === "war" || a.raider) && dist(a, POS[id]) <= N.reach.threat) n += men(a);
  for (const [o, pl] of Object.entries(state.places)) {
    if (o === id || !pl.owner || relation(state, civ, pl.owner) !== "war") continue;
    if (dist(POS[o], POS[id]) <= N.reach.threat) n += (men(pl) + armiesAt(state, o).reduce((k, a) => k + men(a), 0)) * 0.5;
  }
  return n;
}

/** Bir yerde bırakılması gereken asker. */
function need(state, civ, id) {
  // Huzursuz yer isyancılardan güçlü bir garnizon ister, yoksa elden çıkar.
  const unrest = state.places[id].loyalty < 45 ? rebels(state, id) + 5 : 0;
  return Math.max(info(id).capital ? 20 : 10, unrest, Math.ceil(threat(state, civ, id) * 1.1));
}

/**
 * Bir yerin değeri: başkent ve büyük şehir daha değerli, savunması zayıf olan daha cazip; Harikalar
 * zaferine gidenin harika şehri çok değerli (öndekini durdur).
 */
const worth = (state, id) => state.places[id].level * 10 + (info(id).capital ? 25 : 0) - men(defenders(state, id)) * 0.3
  + (wondersAt(state, id).length && state.wonderHold?.[state.places[id].owner] ? 60 : 0);

/** Bir kuvvet bir noktadan saldırsa: tahmin (ordunun askerleri, gemileri, generali o noktada). */
const oddsFrom = (state, u, civ, id, at) => forecast(state, { ...u, x: at.x, y: at.y }, civ, id).odds;

/** En hızlı oran: bir ordunun bu tur en fazla ne kadar uzağa gidebileceği (yolda ya da denizde). */
const farthest = (a) => a.mp / Math.min(N.march.road, N.march.sea);

/**
 * Bu ordunun bu tur yetişip saldırabileceği en iyi kolay hedef: { kind: "place" | "army", id,
 * at } ya da null. `easy`: hangi tahminler kabul (meydan muharebesinde kuşatılan yerin
 * kurtarılması için "risky" de).
 */
function bestStrike(state, civ, a) {
  const R = farthest(a) + N.reach.strike;
  const places = Object.keys(state.places).filter((id) => hostile(access(state, civ, id)) && dist(a, POS[id]) <= R);
  // Savaştığı medeniyetlerin orduları ve barbarlar (kamplar ve akıncılar; öğreticinin haydutları değil).
  const foes = state.armies.filter((b) => !b.at && (relation(state, civ, b.owner) === "war" || b.barbarian) && dist(a, b) <= R);
  if (!places.length && !foes.length) return null;
  const f = reachOf(state, a);
  // Hedefin çevresine (yabancı yerleşimin, N.reach.hold) ancak ona saldırmak için girilir: bedel
  // tablosunda çevrenin hemen dışına kadarki bedel, artı içeri adım.
  const near = N.reach.hold + 0.3, inward = 0.6;
  let best = null, score = -Infinity;
  for (const id of places) {
    const here = canAttack(state, a, id);
    const n = here ? { cell: -1, cost: 0 } : nearest(f, POS[id], near);
    if (!(n.cost + (here ? 0 : inward) < a.mp - 1e-6)) continue;
    const at = here ? a : centre(n.cell);
    if (oddsFrom(state, a, civ, id, at) !== "easy") continue;
    const s = worth(state, id);
    if (s > score) { best = { kind: "place", id }; score = s; }
  }
  for (const b of foes) {
    const here = canStrike(state, a, b);
    const n = here ? { cost: 0 } : nearest(f, b, N.reach.strike * 0.7);
    if (!(n.cost < a.mp - 1e-6)) continue;
    const o = forecastField(state, a, b).odds;
    // Kendi yerini kuşatan ordu: riskli de olsa vurulur.
    const saving = b.besieging && state.places[b.besieging].owner === civ;
    if (o !== "easy" && !(saving && o === "risky")) continue;
    const s = men(b) * 0.3 + (saving ? 40 : 10) + (b.camp ? 20 : 0);
    if (s > score) { best = { kind: "army", id: b.id }; score = s; }
  }
  return best;
}

/** Hedefe yürü ve saldır. Dönen olay ya da null. */
function go(state, a, t) {
  if (t.kind === "place") {
    if (!canAttack(state, a, t.id)) order(state, a.id, { place: t.id });
    return state.armies.includes(a) && canAttack(state, a, t.id) ? attack(state, a.id, t.id) : null;
  }
  const b = armyById(state, t.id);
  if (!b) return null;
  if (!canStrike(state, a, b)) order(state, a.id, { army: b.id });
  return state.armies.includes(a) && canStrike(state, a, b) ? strike(state, a.id, b.id) : null;
}

function military(state, civ, events) {
  const mine = () => armiesOf(state, civ);
  const alive = (a) => state.armies.includes(a);

  // 0. Yan yana duran ordular birleşsin.
  for (const a of mine()) {
    for (const b of mine()) {
      if (a === b || !alive(a) || !alive(b) || a.mp <= 0 || b.mp <= 0) continue;
      if (together(a, b)) merge(state, a.id, b.id);
    }
  }

  // 1. Tehdit altındaki yere bu tur yetişebilen ordular içeri girsin.
  for (const id of placesOf(state, civ)) {
    if (men(defenders(state, id)) >= need(state, civ, id)) continue;
    for (const a of mine()) {
      if (men(defenders(state, id)) >= need(state, civ, id)) break;
      if (a.at === id) { station(state, a.id); continue; }
      if (a.mp <= 0 || a.besieging || dist(a, POS[id]) > farthest(a)) continue;
      const r = routeTo(state, a, { place: id }, { limit: a.mp });
      if (!r) continue;
      order(state, a.id, { place: id });
      if (a.at === id) station(state, a.id);
    }
  }

  // 1b. Büyük ordulara general (para varsa).
  for (const a of mine()) {
    if (men(a) >= 80 && !appointInfo(state, a.id).why && state.civs[civ].money >= N.generals.cost + 25) appoint(state, a.id);
  }

  // 2. Her ordu: bu tur yetişebildiği kolay hedefe saldır; yoksa yanındaki surlu bir yeri kuşat
  // (ordu en az savunanların yarısıysa). Kuşatan ordu, hedefi kolaylaşınca saldırır.
  for (const a of mine()) {
    if (!alive(a) || a.mp <= 0 || men(a) <= 0) continue;
    const t = bestStrike(state, civ, a);
    if (t) {
      const ev = go(state, a, t);
      if (ev) events.push(ev);
      continue;
    }
    if (a.besieging) { a.mp = 0; continue; }
    let siege = null, score = -Infinity;
    for (const id of Object.keys(state.places)) {
      if (!canBesiege(state, a, id) || men(a) < men(defenders(state, id)) * 0.5) continue;
      if (forecast(state, a, civ, id).odds === "hopeless") continue;
      const s = worth(state, id);
      if (s > score) { siege = id; score = s; }
    }
    if (siege) besiege(state, a.id, siege, events);
  }

  // 3. Garnizonların fazlasından vurucu kuvvet: bu tur yetişebildiği kolay hedef varsa çık ve vur.
  for (const id of placesOf(state, civ)) {
    const pl = state.places[id];
    const spare = men(pl) - need(state, civ, id);
    if (spare < 20) continue;
    const k = spare / men(pl);
    const force = Object.fromEntries(UNITS.map((t) => [t, Math.floor(pl[t] * k)]));
    Object.assign(force, shipsFor(pl, force));
    const probe = { ...force, owner: civ, at: id, x: POS[id].x, y: POS[id].y, mp: N.march.mp * trait(civ, "moves"), general: null };
    const t = bestStrike(state, civ, probe);
    if (!t) continue;
    // Gemiye ancak gerekirse binilir: hedefe karadan da yetişiliyorsa gemiler limanda kalır.
    const dry = { ...probe, ships: 0, trireme: 0, quinq: 0 };
    const byLand = men(dry) > 0 && bestStrike(state, civ, dry)?.id === t.id;
    const a = muster(state, id, byLand ? { ...force, ships: 0, trireme: 0, quinq: 0 } : force);
    const ev = a && go(state, a, t);
    if (ev) events.push(ev);
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
  for (const a of mine()) {
    if (!alive(a) || a.mp <= 0 || a.route.length || a.besieging || men(a) <= 0) continue;
    // Kendi limanındaysa gemiye bin: denizden de hedef seçebilsin.
    const pl = a.at && state.places[a.at];
    if (pl && pl.owner === civ && fleetOf(pl) > 0 && !canSail(a)) {
      const take = shipsToCarry(pl, men(a) - carryOf(a));
      for (const k of SHIPS) { pl[k] -= take[k]; a[k] += take[k]; }
    }
    const goal = farTarget(state, civ, a);
    if (goal) order(state, a.id, { place: goal });
    else if (a.at && state.places[a.at].owner === civ) station(state, a.id);
    else {
      // Gidecek yer yok: en yakın kendi yerine dön.
      const home = placesOf(state, civ).sort((x, y) => dist(a, POS[x]) - dist(a, POS[y]))[0];
      if (home) order(state, a.id, { place: home });
    }
  }
}

/**
 * Bu orduyla alınabilecek (tahmini umutsuz olmayan), yolu en ucuz düşman ya da bağımsız yer.
 * Önce düz uzaklığa göre en yakın birkaç aday, sonra onların gerçek yolları karşılaştırılır (bir
 * adayın yolu bulunan en ucuzdan pahalıya çıkınca arama kesilir).
 */
function farTarget(state, civ, a) {
  const cands = Object.keys(state.places)
    .filter((id) => hostile(access(state, civ, id)))
    .sort((x, y) => dist(a, POS[x]) - dist(a, POS[y]))
    .slice(0, 6)
    .filter((id) => forecast(state, a, civ, id).odds !== "hopeless");
  let best = null, cost = Infinity;
  const extra = avoidFor(state, civ);
  for (const id of cands.slice(0, 4)) {
    const r = routeTo(state, a, { place: id }, { extra, limit: Math.min(cost, N.march.mp * 12) });
    if (r && r.cost < cost) { cost = r.cost; best = id; }
  }
  return best;
}
