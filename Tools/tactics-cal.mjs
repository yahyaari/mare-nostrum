// Taktik savaşın ayarı (kurallar.md 29): iki tarafı da bilgisayara oynatılan rastgele savaşlar - kazanan otomatik
// savaşla (combat.js fight) ne kadar aynı, açık sahada ve surlu yerde; surda saldıranın kazanma sayısı.
//   node Tools/tactics-cal.mjs      (son: açık %91, surlu %87; surda saldıran otomatik 41 / taktik 44 / 149)
import { fight } from "../src/rules/combat.js";
import { setupBattle, autoplay, outcome } from "../src/rules/tactics.js";
const civs = ["rome", "carthage", "egypt", "macedon", "parthia", "gaul", "saka"];
let seed = 7;
const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const army = (civ, siege) => ({ civ, inf: Math.round(r() * 12) * 10, arch: Math.round(r() * 6) * 10, cav: Math.round(r() * 3) * 10, elite: r() < 0.4 ? Math.round(r() * 4) * 10 : 0, siege: siege ? Math.round(r() * 2) * 10 : 0 });
const stat = { open: [0, 0, 0], walls: [0, 0, 0] };
for (let i = 0; i < 400; i++) {
  const walls = i % 2 === 0 ? "city" : null;
  const a = army(civs[i % 7], !!walls), d = army(civs[(i * 3 + 2) % 7], false);
  if (a.inf + a.arch + a.cav + a.elite < 20 || d.inf + d.arch + d.cav + d.elite < 20) continue;
  const f = fight(a, d, walls);
  const b = autoplay(setupBattle(a, d, walls, i + 1));
  const o = outcome(b);
  const s = stat[walls ? "walls" : "open"];
  s[0]++; if (o.attWins === f.attWins) s[1]++; s[2] += b.t;
}
for (const [k, [n, same, t]] of Object.entries(stat)) console.log(k.padEnd(6), `${n} savaş, kazanan aynı %${(100 * same / n).toFixed(0)}, ortalama ${(t / n).toFixed(0)} sn`);
{
  let seed2 = 99; const r2 = () => ((seed2 = (seed2 * 16807) % 2147483647) / 2147483647);
  const army2 = (civ, sg) => ({ civ, inf: Math.round(r2() * 12) * 10, arch: Math.round(r2() * 6) * 10, cav: Math.round(r2() * 3) * 10, elite: 0, siege: sg ? Math.round(r2() * 2) * 10 : 0 });
  let autoW = 0, tacW = 0, n = 0, timeouts = 0, gaps = 0;
  for (let i = 0; i < 150; i++) {
    const a = army2(civs[i % 7], true), d = army2(civs[(i + 2) % 7], false);
    if (a.inf + a.arch + a.cav < 20 || d.inf + d.arch + d.cav < 20) continue;
    n++;
    if (fight(a, d, "city").attWins) autoW++;
    const b = autoplay(setupBattle(a, d, "city", i + 3));
    if (outcome(b).attWins) tacW++;
    if (b.over.timeout) timeouts++;
    if (b.gaps.length) gaps++;
  }
  console.log(`surlu: saldıran kazanır otomatik ${autoW}/${n}, taktik ${tacW}/${n}; süre doldu ${timeouts}, gedik açılan ${gaps}`);
}
