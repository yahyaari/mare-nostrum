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
import { roll, settleInbox } from "./events.js";
import { check as checkMissions, issue } from "./missions.js";
import { tick } from "./loyalty.js";
import { advance, refresh } from "./moves.js";
import { N, UNITS, trait } from "./numbers.js";
import { armiesOf, budget, empty, info, placesOf, popCap, progressBuilds } from "./state.js";
import { holds } from "./wonders.js";
import { tickSieges } from "./siege.js";
import { record, snapshot } from "./chronicle.js";
import { isWinter } from "./season.js";

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
      const gardens = holds(state, c.id, "gardens") ? N.wonders.gardensGrowth : 1;
      const grow = starving ? 0 : cap * N.growth * trait(c.id, "growth") * gardens;
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
  // Oyuncu karar vermeden geçtiyse bekleyen mektuplar bedava seçenekle kapanır.
  settleInbox(state);
  for (const c of CIVS) {
    if (c.id !== state.player && state.civs[c.id].alive) aiTurn(state, c.id, events);
  }
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
    if (lost[state.player]) events.push({ type: "winter", turn: state.turn, civ: state.player, lost: lost[state.player] });
  }
  // İnşaatlar bir tur ilerler (üretimden önce: biten tarla bu tur üretir).
  progressBuilds(state, events);
  economy(state, events);
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
  refresh(state, state.player);
  for (const a of armiesOf(state, state.player)) advance(state, a);
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

export function checkOver(state) {
  if (state.over) return state.over;
  if (!placesOf(state, state.player).length) state.over = { result: "lost", turn: state.turn };
  else if (CIVS.every((c) => c.id === state.player || !state.civs[c.id].alive)) {
    state.over = { result: "won", turn: state.turn };
  }
  return state.over;
}
