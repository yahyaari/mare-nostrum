// Denge özeti: N oyunu (7 medeniyet sırayla oyuncu) 150 tur oynatır; ilk düşüş ortancası ve her
// medeniyetin düşüş ortancası, ayakta kalma, en büyük çıkma sayısı.
//   node Tools/balance.mjs 70      (28 oyun gürültülü: aynı sürüm bir 56 bir 41 okudu)
import { play } from "./bot.mjs";
import { CIVS } from "../src/data/world.js";
const firstFall = [], fallAt = Object.fromEntries(CIVS.map(c => [c.id, []])), wins = {};
const G = Number(process.argv[2] ?? 28);
for (let i = 0; i < G; i++) {
  const g = play({ seed: 2000 + i, player: CIVS[i % 7].id, turns: 150 });
  firstFall.push(g.fallen.length ? g.fallen[0][1] : 999);
  for (const c of CIVS) { const f = g.fallen.find(([x]) => x === c.id); fallAt[c.id].push(f ? f[1] : 999); }
  const top = Object.entries(g.places).sort((a, b) => b[1] - a[1])[0][0];
  wins[top] = (wins[top] ?? 0) + 1;
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log("ilk düşüş medyan", med(firstFall), "| en erken", Math.min(...firstFall));
for (const c of CIVS) console.log(`  ${c.id.padEnd(9)} düşüş medyan ${String(med(fallAt[c.id])).padStart(3)}  150 turda yaşıyor ${fallAt[c.id].filter(t => t === 999).length}/${G}  en büyük ${wins[c.id] ?? 0}`);
