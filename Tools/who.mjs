// Kim kimin yerini alıyor: node Tools/who.mjs <kurban> [oyun]
import { play } from "./bot.mjs";
import { CIVS } from "../src/data/world.js";
const victim = process.argv[2] ?? "rome", G = Number(process.argv[3] ?? 35);
const by = {}, firstLoss = [];
for (let i = 0; i < G; i++) {
  let first = null;
  play({ seed: 2000 + i, player: CIVS[i % 7].id, turns: 150, watch(s, events) {
    for (const e of events) {
      if (e.type === "battle" && e.won && e.defender === victim) { by[e.attacker] = (by[e.attacker] ?? 0) + 1; first ??= `${e.attacker}@${e.turn}`; }
      if (e.type === "revolt" && e.civ === victim) { by.revolt = (by.revolt ?? 0) + 1; first ??= `isyan@${e.turn}`; }
    }
  } });
  firstLoss.push(first);
}
console.log(victim, "yerlerini alan:", JSON.stringify(by));
console.log("ilk kayıplar:", firstLoss.filter(Boolean).slice(0, 20).join(" "));
