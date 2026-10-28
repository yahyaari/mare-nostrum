// Geç oyun ölçümü (kurallar.md bölüm 11): 200 tura kadar süren oyunlarda 160-200. turlar arası tur başına savaşan çift,
// bilgisayarların sahadaki ve garnizondaki askeri, kuşatma, savaş; kaç oyun 30+ tur barışta dondu.
//   node Tools/late.mjs ['{"aiAllyCrack":0}'] [oyun]
import { play } from "./bot.mjs";
import { N } from "../src/rules/numbers.js";
const patch = JSON.parse(process.argv[2] ?? "{}");
for (const [k, v] of Object.entries(patch)) N[k] = v;
const games = Number(process.argv[3] ?? 8);
import { CIVS } from "../src/data/world.js";
import { placesOf, men, relation, armiesOf, isHuman } from "../src/rules/state.js";
let n = 0, field = 0, gar = 0, wars = 0, sieges = 0, frozen = 0, samples = 0, battles = 0, longGames = 0, ends = [];
for (let i = 0; i < games; i++) {
  let peaceTurns = 0;
  const g = play({ seed: 5200 + i, player: CIVS[i % 7].id, turns: 200, watch: (s, ev) => {
    if (s.turn < 160) return;
    const live = CIVS.filter((c) => s.civs[c.id].alive);
    let w = 0;
    for (const a of live) for (const b of live) if (a.id < b.id && relation(s, a.id, b.id) === "war") w++;
    if (!w) peaceTurns++;
    wars += w; samples++;
    for (const c of live) {
      if (isHuman(s, c.id)) continue;
      field += armiesOf(s, c.id).filter((a) => !a.at).reduce((k, a) => k + men(a), 0);
      gar += placesOf(s, c.id).reduce((k, id) => k + men(s.places[id]), 0);
      sieges += armiesOf(s, c.id).filter((a) => a.besieging).length;
    }
    battles += ev.filter((e) => e.type === "battle").length;
  } });
  ends.push(g.over ? `${g.over.kind ?? g.over.result}@${g.over.turn}` : "200");
  if (g.turns >= 160) { longGames++; if (peaceTurns > 30) frozen++; }
}
const per = (v) => (samples ? (v / samples).toFixed(1) : "-");
console.log(`160+ süren oyun ${longGames}/${games}, barışta donan ${frozen} | tur başı: savaş çifti ${per(wars)}, sahada ${per(field)}, garnizon ${per(gar)}, kuşatma ${per(sieges)}, savaş ${per(battles)} | bitişler ${ends.join(" ")}`);
