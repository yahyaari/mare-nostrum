// İki sürümü aynı tohumla oynatır, her turun özetini yazar (diff ile ilk ayrılık bulunur):
//   node Tools/diverge.mjs <kök> > a.txt
import { pathToFileURL } from "node:url";
const root = process.argv[2];
const { play } = await import(pathToFileURL(root + "/Tools/bot.mjs").href);
const out = [];
play({
  seed: 2004, player: "macedon", turns: 40,
  watch(s, events) {
    const places = Object.entries(s.places).map(([id, p]) => `${id}:${p.owner}:${p.inf}/${p.arch}:${p.pop}:${p.level}${p.farms}${p.industry}${p.barracks}:${p.loyalty}`).join(" ");
    const armies = s.armies.map((a) => `${a.id}@${a.at}:${a.inf}/${a.arch}:${a.general?.name ?? ""}`).join(" ");
    const civs = Object.entries(s.civs).map(([c, v]) => `${c}:${v.money.toFixed(2)}/${v.weapons.toFixed(2)}/${v.food.toFixed(2)}`).join(" ");
    out.push(`T${s.turn} rng=${s.rng}\n  ${civs}\n  ${places}\n  ${armies}\n  ${events.map((e) => e.type + ":" + (e.place ?? e.on ?? "") + ":" + (e.won ?? "")).join(" ")}`);
  },
});
console.log(out.join("\n"));
