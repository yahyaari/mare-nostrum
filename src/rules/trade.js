// Ticaret yolları (kurallar.md bölüm 28; kullanıcının istediği "olmazsa olmazlar"ın beşincisi, 26.10).
// Pazarı (Yapılar) ya da ticaret limanı (Liman) olan şehir, yakınındaki bir yerleşime ticaret yolu kurar:
// şehir başına en çok üç yol (slotsOf). Yol kuranı her tur uzaklığa göre parayla besler, yabancı ortağı yarısıyla; yabancı
// bir yerle (medeniyet ya da bağımsız) ticaret daha kazançlı. Karadan `reach`, iki liman arasında denizden
// `seaReach` birime kadar. Savaş çıkınca ya da şehir el değiştirince yol kopar; uçlardan biri
// kuşatılmış ya da ablukadaysa o tur para gelmez. Bilgisayar da kurar. Haritada kesik altın çizgi,
// üstünde gidip gelen kervan (ya da gemi).

import { PLACES } from "../data/world.js";
import { POS, dist } from "./map.js";
import { N } from "./numbers.js";
import { besieged, blockaded, isHuman, relation } from "./state.js";

const T = () => N.trade;
const portOf = Object.fromEntries(PLACES.map((p) => [p.id, !!p.port]));

/**
 * Bir şehrin kaç yolu olabilir: pazarı varsa bir, limanında ticaret varsa bir, pazarı `marketMore`.
 * seviyedeyse bir daha (en çok üç). İlk denemede her seviye bir yoldu: bilgisayar pazarı ve ticareti
 * 5'e çıkarınca şehir başına 10 yol, medeniyet başına turda 360 para ticaret çıktı.
 */
export function slotsOf(state, id) {
  const pl = state.places[id], market = pl.market ?? 0;
  return (market >= 1 ? 1 : 0) + (portOf[id] && (pl.trade ?? 0) >= 1 ? 1 : 0) + (market >= T().marketMore ? 1 : 0);
}

/** Bir şehirden çıkan yollar. */
export const routesFrom = (state, id) => (state.routes ?? []).filter((r) => r.from === id);

/** Bir medeniyetin kurduğu ya da ortağı olduğu yollar. */
export const routesOf = (state, civ) => (state.routes ?? []).filter((r) => state.places[r.from].owner === civ || state.places[r.to].owner === civ);

/** İki yer arasında yol var mı (hangi yönde olursa). */
const linked = (state, a, b) => (state.routes ?? []).some((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a));

/** İki yer arasındaki yolun türü: kara, deniz, ya da yetişmiyor (null). */
export function wayOf(a, b) {
  const d = dist(POS[a], POS[b]);
  if (d <= T().reach) return "land";
  if (portOf[a] && portOf[b] && d <= T().seaReach) return "sea";
  return null;
}

/** Bir yolun turluk parası (her iki uca da). */
export function valueOf(state, a, b) {
  const foreign = state.places[a].owner !== state.places[b].owner;
  const v = (T().base + dist(POS[a], POS[b]) * T().perDist) * (foreign ? T().foreign : 1);
  return Math.min(T().max, Math.round(v));
}

/** Kurulamazsa nedeni: "slots" (yolu dolu), "war", "far", "self", "linked", "barbarian"; kurulabilirse null. */
export function whyNot(state, from, to) {
  const a = state.places[from], b = state.places[to];
  if (from === to) return "self";
  if (!a.owner) return "self";
  if (routesFrom(state, from).length >= slotsOf(state, from)) return "slots";
  if (linked(state, from, to)) return "linked";
  if (!wayOf(from, to)) return "far";
  if (b.owner && b.owner !== a.owner && relation(state, a.owner, b.owner) === "war") return "war";
  return null;
}

/** Bir şehrin kurabileceği yollar, kazancına göre: [{ to, value, way }]. */
export function candidates(state, from) {
  return Object.keys(state.places)
    .filter((to) => to !== from && !linked(state, from, to) && wayOf(from, to) && whyNot(state, from, to) !== "war")
    .map((to) => ({ to, value: valueOf(state, from, to), way: wayOf(from, to) }))
    .sort((x, y) => y.value - x.value || dist(POS[from], POS[x.to]) - dist(POS[from], POS[y.to]));
}

/** Yol kur. Dönen: kurulduysa yol, değilse null. */
export function openRoute(state, from, to) {
  if (whyNot(state, from, to)) return null;
  state.routes ??= [];
  const r = { from, to, owner: state.places[from].owner, way: wayOf(from, to), since: state.turn };
  state.routes.push(r);
  return r;
}

/** Yolu kaldır. */
export function closeRoute(state, from, to) {
  const n = (state.routes ?? []).length;
  state.routes = (state.routes ?? []).filter((r) => !(r.from === from && r.to === to));
  return state.routes.length < n;
}

/** Bu tur para getiriyor mu: uçlarından biri kuşatılmış ya da (deniz yoluysa) ablukada değil. */
export const flowing = (state, r) => !besieged(state, r.from) && !besieged(state, r.to) && !(r.way === "sea" && (blockaded(state, r.from) || blockaded(state, r.to)));

/** Bir medeniyetin ticaret yollarından turluk parası (state.js budget). */
export function tradeIncome(state, civ) {
  let n = 0;
  for (const r of state.routes ?? []) {
    if (!flowing(state, r)) continue;
    const v = valueOf(state, r.from, r.to);
    if (state.places[r.from].owner === civ) n += v;
    // Öbür uç (yabancıysa) yarısını alır: yolu kuran kazancın asıl sahibi (Civilization gibi).
    if (state.places[r.to].owner === civ && state.places[r.from].owner !== civ) n += Math.floor(v / 2);
  }
  return n;
}

/**
 * Tur sonu: yolların kopması. Kuranın şehri el değiştirdiyse ya da yuvası artık yetmiyorsa, iki uç
 * savaştaysa yol kopar. Oyuncunun yolu koparsa habere.
 */
export function tickTrade(state, events) {
  const keep = [];
  for (const r of state.routes ?? []) {
    const a = state.places[r.from].owner, b = state.places[r.to].owner;
    const war = a && b && a !== b && relation(state, a, b) === "war";
    const lost = !a || r.owner !== a;
    const full = keep.filter((x) => x.from === r.from).length >= slotsOf(state, r.from);
    if (war || lost || full) {
      for (const c of [r.owner, b].filter((x, i, l) => x && l.indexOf(x) === i && isHuman(state, x))) events.push({ type: "routeCut", turn: state.turn, civ: c, from: r.from, to: r.to, why: war ? "war" : "lost" });
      continue;
    }
    keep.push(r);
  }
  state.routes = keep;
}
