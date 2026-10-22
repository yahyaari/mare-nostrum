// Tur sırası (SADE SÜRÜM, kurallar.md):
//   1. Oyuncu oynar (arayüzden, doğrudan state.js / moves.js / diplomacy.js çağrılarıyla).
//   2. endTurn: bilgisayar medeniyetleri sırayla oynar.
//   3. Tur sonu hesabı: altın ve yemek ambara girer, askerler yer; yemek biterse kıtlık.
//   4. Yeni tur: geliştirme / asker / gemi hakları ve hareketler yenilenir, oyuncunun
//      ordularının güzergâhları kendiliğinden bir adım ilerler.

import { CIVS } from "../data/world.js";
import { aiTurn } from "./ai.js";
import { record, snapshot } from "./chronicle.js";
import { advance, refresh } from "./moves.js";
import { N, UNITS } from "./numbers.js";
import { armiesOf, budget, empty, placesOf } from "./state.js";

const round2 = (n) => Math.round(n * 100) / 100;

/** Tur sonu hesabı. Olayları `events`e ekler. */
export function economy(state, events) {
  for (const c of CIVS) {
    const civ = state.civs[c.id];
    if (!civ.alive) continue;
    const b = budget(state, c.id);
    civ.money = round2(civ.money + b.money);
    civ.food = round2(civ.food + b.food);
    if (civ.food < 0) {
      // Kıtlık: her birlikten onda biri ölür.
      civ.food = 0;
      let lost = 0;
      for (const u of [...placesOf(state, c.id).map((id) => state.places[id]), ...armiesOf(state, c.id)]) {
        for (const t of UNITS) {
          const n = Math.ceil(u[t] * N.starve);
          u[t] -= n;
          lost += n;
        }
      }
      state.armies = state.armies.filter((a) => !empty(a));
      events.push({ type: "famine", turn: state.turn, civ: c.id, lost });
    }
  }
}

/** Oyuncu "Turu bitir" dedi. Dönen: bu turun olayları (state.events'e de yazılır). */
export function endTurn(state) {
  const events = [];
  // Kroniğin ilk fotoğrafı: oyunun başı.
  if (!state.chronicle?.places.length) snapshot(state);
  for (const c of CIVS) {
    if (c.id !== state.player && state.civs[c.id].alive) aiTurn(state, c.id, events);
  }
  economy(state, events);
  state.turn += 1;
  for (const id in state.places) {
    const pl = state.places[id];
    pl.upgraded = false;
    pl.recruited = 0;
    pl.built = 0;
  }
  refresh(state, state.player);
  for (const a of armiesOf(state, state.player)) advance(state, a);
  checkOver(state);
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
