// Tur sırası (kurallar.md bölüm 10):
//   1. Oyuncu oynar (arayüzden, doğrudan state.js / moves.js / diplomacy.js çağrılarıyla).
//   2. endTurn: bilgisayar medeniyetleri sırayla oynar.
//   3. Tur sonu hesabı: üretim ambara girer, askerler yer, nüfus artar.
//   4. Yeni tur: yükseltme/asker hakları ve hareketler yenilenir, oyuncunun ordularının
//      güzergâhları kendiliğinden bir adım ilerler.

import { CIVS } from "../data/world.js";
import { aiTurn } from "./ai.js";
import { advance, refresh } from "./moves.js";
import { N, trait } from "./numbers.js";
import { armiesOf, budget, info, placesOf, popCap } from "./state.js";

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
        for (const t of ["inf", "arch"]) {
          const n = Math.ceil(u[t] * N.starve);
          u[t] -= n;
          lost += n;
        }
      }
      state.armies = state.armies.filter((a) => a.inf + a.arch > 0);
      events.push({ type: "famine", turn: state.turn, civ: c.id, lost });
    }
    for (const id of placesOf(state, c.id)) {
      const pl = state.places[id];
      const cap = popCap(pl, info(id).kind);
      const grow = starving ? 0 : cap * N.growth * trait(c.id, "growth");
      pl.pop = Math.min(cap, Math.round(pl.pop + grow));
    }
  }
}

/** Oyuncu "Turu bitir" dedi. Dönen: bu turun olayları (state.events'e de yazılır). */
export function endTurn(state) {
  const events = [];
  for (const c of CIVS) {
    if (c.id !== state.player && state.civs[c.id].alive) aiTurn(state, c.id, events);
  }
  economy(state, events);
  state.turn += 1;
  for (const id in state.places) {
    state.places[id].upgraded = false;
    state.places[id].recruited = 0;
  }
  refresh(state, state.player);
  for (const a of armiesOf(state, state.player)) advance(state, a);
  checkOver(state);
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
