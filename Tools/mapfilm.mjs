// Haritada yaşayan şehirler (kurallar.md 12e): yakından dört yol ve kuşatma, sonbahar ve ilkbahar. Fotoğraf fotoğraf.
//   node Tools/mapfilm.mjs [klasör]    (önce: node Tools/serve.mjs . 8060) -> Logs/mapfilm
import { mkdirSync } from "node:fs";
import { open } from "./edge.mjs";
const dir = process.argv[2] ?? "Logs/mapfilm";
mkdirSync(dir, { recursive: true });
const page = await open("http://localhost:8060/?seed=5", 1280, 720);
const frame = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`;
await page.evaluate(`(async () => {
  const M = window.MareNostrum;
  M.dispatch({ do: "lang", lang: "tr" });
  M.dispatch({ do: "pick", civ: "rome" }); M.dispatch({ do: "start" }); M.dispatch({ do: "close" }); M.dispatch({ do: "coachOff" });
  const g = M.game;
  Object.assign(g.places.rome, { level: 4, farms: 4, industry: 4, barracks: 3, market: 2, spec: "trade" });
  Object.assign(g.places.ariminum, { level: 3, farms: 4, industry: 1, barracks: 2, spec: "farm" });
  Object.assign(g.places.tarentum, { level: 3, farms: 2, industry: 3, barracks: 2, spec: "forge" });
  Object.assign(g.places.capua ?? g.places.neapolis ?? {}, { level: 3, farms: 2, industry: 1, barracks: 4, spec: "camp" });
  return true;
})()`);
const shot = async (name, setup) => {
  await page.evaluate(`(async () => { const M = window.MareNostrum, g = M.game; ${setup}; M.redraw(); await ${frame}; return true; })()`);
  await page.shot(dir, name);
};
await shot("1_italya_yakin_ilkbahar", `g.turn = 1; const p = M.pos("rome"); M.lookAt(p.x, p.y - 1.2, 9)`);
await shot("2_italya_sonbahar", `g.turn = 3`);
await shot("3_kusatma", `g.turn = 2; const S = await import("./src/rules/state.js"); g.relations[S.key("rome", "gaul")] = "war"; const p = M.pos("ariminum"); const a = S.formArmy(g, "rome", 10, 0); a.owner = "gaul"; Object.assign(a, { x: p.x - 0.6, y: p.y, at: null, inf: 200, besieging: "ariminum", besiegedSince: g.turn }); M.lookAt(p.x, p.y, 12)`);
await shot("4_uzak", `M.lookAt(M.pos("rome").x, M.pos("rome").y, 1.5)`);
console.log(page.errors ? "HATA\n" + page.log.join("\n") : "konsol temiz");
page.close();
process.exit(0);
