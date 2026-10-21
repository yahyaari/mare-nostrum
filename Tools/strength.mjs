// 20. turda medeniyetlerin ortalama gücü, yer sayısı, geliri, gemisi: node Tools/strength.mjs <kök>
import { pathToFileURL } from "node:url";
const root = process.argv[2] ?? ".";
const { play } = await import(pathToFileURL(root + "/Tools/bot.mjs").href);
const S = await import(pathToFileURL(root + "/src/rules/state.js").href);
const civs = ["rome", "carthage", "egypt", "macedon", "parthia", "gaul", "saka"];
const sum = Object.fromEntries(civs.map((c) => [c, { men: 0, places: 0, income: 0, ships: 0 }]));
const G = 21;
for (let i = 0; i < G; i++) {
  play({ seed: 2000 + i, player: civs[i % 7], turns: 20, watch(s) {
    if (s.turn !== 21) return;
    for (const c of civs) {
      sum[c].men += S.strength(s, c) / G;
      sum[c].places += S.placesOf(s, c).length / G;
      sum[c].income += S.budget(s, c).money / G;
      sum[c].ships += [...S.placesOf(s, c).map((id) => s.places[id]), ...s.armies.filter((a) => a.owner === c)].reduce((n, u) => n + (u.ships ?? 0), 0) / G;
    }
  } });
}
for (const c of civs) console.log(c.padEnd(9), `asker ${Math.round(sum[c].men)}`.padEnd(11), `yer ${sum[c].places.toFixed(1)}`.padEnd(9), `gelir ${sum[c].income.toFixed(1)}`.padEnd(12), `gemi ${sum[c].ships.toFixed(1)}`);
