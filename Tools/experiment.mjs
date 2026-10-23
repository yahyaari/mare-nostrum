// Denge deneyi: N.nin (ya da medeniyet özelliklerinin) bazı sayıları değiştirilerek 70 oyun.
//   node Tools/experiment.mjs '{"march.mp":4,"T.saka.moves":1.5}' 70 [başlangıç tohumu]
// Araştırma: "R.tactics.mods": {} bir teknolojinin etkisini kapatır (research.js TECHS).
import { N, TRAITS } from "../src/rules/numbers.js";
import { play } from "./bot.mjs";
import { CIVS } from "../src/data/world.js";
import { techById } from "../src/rules/research.js";
const patch = JSON.parse(process.argv[2] ?? "{}");
const G = Number(process.argv[3] ?? 70), seed0 = Number(process.argv[4] ?? 2000);
for (const [k, v] of Object.entries(patch)) {
  const path = k.split(".");
  const root = { T: TRAITS, R: techById }[path[0]];
  let o = root ?? N;
  for (const p of path.slice(root ? 1 : 0, -1)) o = o[p];
  o[path.at(-1)] = v;
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const first = [], alive = Object.fromEntries(CIVS.map((c) => [c.id, 0])), top = {};
for (let i = 0; i < G; i++) {
  const g = play({ seed: seed0 + i, player: CIVS[i % 7].id, turns: 150 });
  first.push(g.fallen.length ? g.fallen[0][1] : 999);
  for (const c of CIVS) if (!g.fallen.some(([x]) => x === c.id)) alive[c.id]++;
  const big = Object.entries(g.places).sort((a, b) => b[1] - a[1])[0][0];
  top[big] = (top[big] ?? 0) + 1;
}
console.log(`${JSON.stringify(patch).padEnd(40)} ilk düşüş ${String(med(first)).padStart(3)} (en erken ${Math.min(...first)}) | ayakta: ` + CIVS.map((c) => `${c.id} ${alive[c.id]}`).join(" ") + ` | toplam ${Object.values(alive).reduce((a, b) => a + b, 0)} | en büyük: ` + Object.entries(top).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(" "));
