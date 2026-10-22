// Tek bot. Oyuncunun yerine bilgisayar rakibin kendisini (src/rules/ai.js) oynatır ve oyunu
// sonuna kadar götürür. Hem test.mjs hem tune.mjs bunu kullanır - ikinci bir kopya yazma
// (HOTICE-Notes/tuzaklar.md, 1: "ikinci kopya alet").
//
//   node Tools/bot.mjs [oyun sayısı] [tur sınırı]

import { CIVS } from "../src/data/world.js";
import { aiTurn } from "../src/rules/ai.js";
import { endTurn } from "../src/rules/turn.js";
import { newGame, placesOf, strength } from "../src/rules/state.js";

/**
 * Bir oyun oynat. `watch(state, events)` her turdan sonra çağrılır (değişmez kontrolleri
 * oradan). Dönen: turlara göre özet.
 */
export function play({ seed = 1, player = "rome", turns = 200, level = "normal", watch = null } = {}) {
  const state = newGame(player, seed, level);
  const log = { seed, player, turns: 0, battles: 0, captures: 0, wars: 0, famines: 0, fallen: [], firstWar: null, freeLeft: [] };
  for (let t = 0; t < turns && !state.over; t++) {
    const mine = [];
    aiTurn(state, player, mine); // oyuncunun yerine
    const events = [...mine, ...endTurn(state)];
    for (const e of events) {
      if (e.type === "battle") { log.battles++; if (e.won) log.captures++; if (e.fallen) log.fallen.push([e.fallen, state.turn]); }
      if (e.type === "war") { log.wars++; log.firstWar ??= state.turn; }
      if (e.type === "famine") log.famines++;


    }
    log.freeLeft.push(Object.values(state.places).filter((p) => p.owner === null).length);
    if (watch) watch(state, events);
    log.turns = state.turn;
  }
  log.over = state.over;
  log.state = state;
  log.places = Object.fromEntries(CIVS.map((c) => [c.id, placesOf(state, c.id).length]));
  log.strength = Object.fromEntries(CIVS.map((c) => [c.id, strength(state, c.id)]));
  return log;
}

if (import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`) {
  const games = Number(process.argv[2] ?? 6), turns = Number(process.argv[3] ?? 200);
  for (let i = 0; i < games; i++) {
    const player = CIVS[i % CIVS.length].id;
    const t0 = performance.now();
    const g = play({ seed: 1000 + i, player, turns });
    const free = g.freeLeft;
    console.log(
      `#${i} ${player.padEnd(8)} ${g.over ? g.over.result + "@" + g.over.turn : "sürüyor@" + g.turns}`.padEnd(30) +
      ` savaş ${g.battles} alış ${g.captures} ilan ${g.wars} (ilk ${g.firstWar}) kıtlık ${g.famines}` +
      ` | bağımsız t10 ${free[9]} t25 ${free[24]} t50 ${free[49]}` +
      ` | düşen ${g.fallen.map(([c, t]) => c + "@" + t).join(" ")}` +
      ` | ${Math.round(performance.now() - t0)}ms`,
    );
    console.log("   yer   " + Object.entries(g.places).map(([c, n]) => `${c} ${n}`).join("  "));
    console.log("   asker " + Object.entries(g.strength).map(([c, n]) => `${c} ${n}`).join("  "));
  }
}
