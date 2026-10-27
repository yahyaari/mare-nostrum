// Tur sırası (kurallar.md bölüm 10):
//   1. Oyuncu oynar (arayüzden, doğrudan state.js / moves.js / diplomacy.js çağrılarıyla).
//   2. endTurn: bilgisayar medeniyetleri sırayla oynar.
//   3. Tur sonu hesabı: üretim ambara girer, askerler yer, nüfus artar.
//   4. Yeni tur: yükseltme/asker hakları ve hareketler yenilenir, oyuncunun ordularının
//      güzergâhları kendiliğinden bir adım ilerler.

import { CIVS } from "../data/world.js";
import { aiTurn } from "./ai.js";
import { trespass } from "./diplomacy.js";
import { tickSpies } from "./spies.js";
import { overOf, tickVictory } from "./victory.js";
import { roll, settleInbox } from "./events.js";
import { check as checkMissions, issue } from "./missions.js";
import { tick } from "./loyalty.js";
import { advance, refresh } from "./moves.js";
import { N, UNITS, trait } from "./numbers.js";
import { armiesOf, budget, empty, humansOf, info, isHuman, placesOf, popCap, progressBuilds } from "./state.js";
import { holds } from "./wonders.js";
import { tickSieges } from "./siege.js";
import { record, snapshot } from "./chronicle.js";
import { isWinter } from "./season.js";
import { techMul, tickResearch } from "./research.js";
import { tickBarbarians } from "./barbarians.js";
import { replenish } from "./refill.js";
import { tickCrises } from "./crises.js";
import { tickTrade } from "./trade.js";
import { incomingFor, resolveIncoming } from "./incoming.js";

const round2 = (n) => Math.round(n * 100) / 100;

/** Tur sonu hesabı. Olayları `events`e ekler. */
export function economy(state, events) {
  for (const c of CIVS) {
    const civ = state.civs[c.id];
    if (!civ.alive) continue;
    const b = budget(state, c.id);
    civ.money = round2(civ.money + b.money);
    civ.weapons = round2(civ.weapons + b.weapons);
    civ.food = round2(civ.food + b.food);
    const starving = civ.food < 0;
    if (starving) {
      civ.food = 0;
      const units = [...placesOf(state, c.id).map((id) => state.places[id]), ...armiesOf(state, c.id)];
      let lost = 0;
      for (const u of units) {
        for (const t of UNITS) {
          const n = Math.ceil(u[t] * N.starve);
          u[t] -= n;
          lost += n;
        }
      }
      state.armies = state.armies.filter((a) => !empty(a));
      events.push({ type: "famine", turn: state.turn, civ: c.id, lost });
    }
    for (const id of placesOf(state, c.id)) {
      const pl = state.places[id];
      const cap = popCap(pl, info(id).kind);
      const gardens = (holds(state, c.id, "gardens") ? N.wonders.gardensGrowth : 1) * (holds(state, c.id, "aqueduct") ? N.wonders.aqueductGrowth : 1);
      const baths = 1 + (pl.baths ?? 0) * N.buildings.baths;
      const grow = starving ? 0 : cap * N.growth * trait(c.id, "growth") * techMul(state, c.id, "growth") * gardens * baths;
      pl.pop = Math.min(cap, Math.round(pl.pop + grow));
    }
    tick(state, c.id, starving, events);
  }
}

/** Oyuncu "Turu bitir" dedi. Dönen: bu turun olayları (state.events'e de yazılır). */
export function endTurn(state) {
  const events = [];
  // Kroniğin ilk fotoğrafı: oyunun başı (eski kayıtta yükseltildiği tur).
  if (!state.chronicle?.places.length) snapshot(state);
  // Oyuncu karar vermeden geçtiyse bekleyen mektuplar bedava seçenekle kapanır; bekleyen saldırılar otomatik savaşla.
  settleInbox(state);
  for (const h of humansOf(state)) for (const it of incomingFor(state, h)) { const ev = resolveIncoming(state, it); if (ev) events.push(ev); }
  for (const c of CIVS) {
    if (!isHuman(state, c.id) && state.civs[c.id].alive) aiTurn(state, c.id, events);
  }
  // Barbarlar: kamplar büyür, akıncılar yürür ve saldırır.
  tickBarbarians(state, events);
  // Büyük krizler: iç savaş, salgın, büyük göç (oyunun sonunu canlı tutar).
  tickCrises(state, events);
  // Kuşatmalar bir tur ilerler (üretimden önce: kuşatılan yer bu tur bir şey üretmez).
  tickSieges(state, events);
  // Tarafsızın toprağında duran ordular o medeniyeti öfkelendirir.
  trespass(state, events);
  // Kış: garnizonun dışındaki bütün ordular yıpranır (aşağı yuvarlanır: küçük birlik erimez).
  if (isWinter(state.turn)) {
    const lost = {};
    for (const a of state.armies) {
      for (const k of UNITS) {
        const n = Math.floor(a[k] * N.season.winterArmy);
        a[k] -= n;
        lost[a.owner] = (lost[a.owner] ?? 0) + n;
      }
    }
    state.armies = state.armies.filter((a) => !empty(a));
    for (const h of humansOf(state)) if (lost[h]) events.push({ type: "winter", turn: state.turn, civ: h, lost: lost[h] });
  }
  // Savaşın ya da el değiştirmenin kopardığı ticaret yolları düşer (üretimden önce).
  tickTrade(state, events);
  // İnşaatlar bir tur ilerler (üretimden önce: biten tarla bu tur üretir).
  progressBuilds(state, events);
  economy(state, events);
  // Dinlenen bölükler toparlanır (üretimden sonra: ambar boşaldıysa olmaz; turun hareketleri belli).
  replenish(state, events);
  // Bilim araştırmaya akar (üretimden sonra: bu turun nüfusuyla).
  tickResearch(state, events);
  // Son ödemesini yapan ticaret anlaşmaları düşer (oyuncununki habere).
  for (const d of (state.deals ?? []).filter((x) => x.until <= state.turn + 1)) {
    for (const h of [d.a, d.b].filter((c) => isHuman(state, c))) events.push({ type: "dealEnded", turn: state.turn, civ: h === d.a ? d.b : d.a, to: h });
  }
  state.deals = (state.deals ?? []).filter((x) => x.until > state.turn + 1);
  state.turn += 1;
  for (const id in state.places) {
    state.places[id].upgraded = false;
    state.places[id].recruited = 0;
    state.places[id].games = false;
    state.places[id].built = 0;
  }
  // Olaylar: oyuncununki gelen kutusuna, bilgisayarlarınki hemen çözülür.
  for (const c of CIVS) if (state.civs[c.id].alive) roll(state, c.id);
  // Casuslar: yoldakiler varır, yerindekiler raporlar ya da yakalanır.
  tickSpies(state, events);
  for (const h of humansOf(state)) {
    if (!state.civs[h].alive) continue;
    refresh(state, h);
    for (const a of armiesOf(state, h)) advance(state, a);
  }
  // Harikalar zaferinin sayaçları.
  tickVictory(state, events);
  // Görevler: tamamlanan ödülünü alır, süresi geçen düşer, belki yenisi gelir.
  checkMissions(state, events);
  issue(state, events);
  checkOver(state);
  // Bu tur denizde yakalanan fırtınalar (bilgisayarın ve oyuncunun yürüyüşleri) rapora.
  events.push(...(state.storms ?? []));
  delete state.storms;
  record(state, events);
  snapshot(state);
  state.events = events;
  return events;
}

/** Oyun bitti mi (victory.js overOf): bittiyse state.over'a yazılır. */
export function checkOver(state) {
  if (state.over) return state.over;
  state.over = overOf(state);
  return state.over;
}
