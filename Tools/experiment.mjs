// Denge deneyi: N.nin (ya da medeniyet özelliklerinin) bazı sayıları değiştirilerek 70 oyun.
//   node Tools/experiment.mjs '{"march.mp":4,"T.saka.moves":1.5}' 70 [başlangıç tohumu]
import { N, TRAITS } from "../src/rules/numbers.js";
import { play } from "./bot.mjs";
import { CIVS } from "../src/data/world.js";
const patch = JSON.parse(process.argv[2] ?? "{}");
const G = Number(process.argv[3] ?? 70), seed0 = Number(process.argv[4] ?? 2000);
for (const [k, v] of Object.entries(patch)) {
  const path = k.split(".");
  let o = path[0] === "T" ? TRAITS : N;
  for (const p of path.slice(path[0] === "T" ? 1 : 0, -1)) o = o[p];
  o[path.at(-1)] = v;
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const first = [], alive = Object.fromEntries(CIVS.map((c) => [c.id, 0]));
for (let i = 0; i < G; i++) {
  const g = play({ seed: seed0 + i, player: CIVS[i % 7].id, turns: 150 });
  first.push(g.fallen.length ? g.fallen[0][1] : 999);
  for (const c of CIVS) if (!g.fallen.some(([x]) => x === c.id)) alive[c.id]++;
}
console.log(`${JSON.stringify(patch).padEnd(40)} ilk düşüş ${String(med(first)).padStart(3)} (en erken ${Math.min(...first)}) | ayakta: ` + CIVS.map((c) => `${c.id} ${alive[c.id]}`).join(" ") + ` | toplam ${Object.values(alive).reduce((a, b) => a + b, 0)}`);
