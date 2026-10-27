// Deniz savaşının ayarı (kurallar.md 29h): iki taraf da bilgisayarda, sahadaki sonuç combat.js naval ile ne kadar aynı
// (kazanan), saldıran kaç kez kazanır, ortalama süre, batan ve ele geçen gemi. N.tactics.naval sayıları denenebilir:
//   node Tools/naval-cal.mjs                          (son: %85 aynı, saldıran otomatik 159 / taktik 173 / 289)
//   node Tools/naval-cal.mjs '{"types.trireme.bow":2.4}'
import { naval } from "../src/rules/combat.js";
import { setupNaval, autoplayNaval, navalOutcome } from "../src/rules/naval.js";
import { N } from "../src/rules/numbers.js";
const patch = JSON.parse(process.argv[2] ?? "{}");
for (const [k, v] of Object.entries(patch)) { const p = k.split("."); let o = N.tactics.naval; for (const q of p.slice(0, -1)) o = o[q]; o[p.at(-1)] = v; }
let seed = 5; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const fleet = () => ({ civ: null, ships: Math.floor(r() * 5), trireme: Math.floor(r() * 4), quinq: Math.floor(r() * 3), troops: { inf: Math.round(r() * 8) * 10, arch: Math.round(r() * 3) * 10 } });
let n = 0, same = 0, time = 0, sunk = 0, taken = 0, timeouts = 0, attAuto = 0, attTac = 0;
for (let i = 0; i < 300; i++) {
  const a = fleet(), d = fleet();
  const cnt = (f) => f.ships + f.trireme + f.quinq;
  if (!cnt(a) || !cnt(d)) continue;
  n++;
  const f = naval(a, d), b = autoplayNaval(setupNaval(a, d, i + 1)), o = navalOutcome(b);
  if (f.attWins === o.attWins) same++;
  attAuto += f.attWins; attTac += o.attWins;
  time += b.t; sunk += b.units.filter((u) => u.dead).length; taken += b.units.filter((u) => u.taken).length; if (b.over.timeout) timeouts++;
}
console.log(JSON.stringify(patch), `${n} deniz savaşı: kazanan aynı %${(100 * same / n).toFixed(0)}, saldıran kazanır otomatik ${attAuto} taktik ${attTac}, ortalama ${(time / n).toFixed(0)} sn, batan ${sunk}, ele geçen ${taken}, süre dolan ${timeouts}`);
