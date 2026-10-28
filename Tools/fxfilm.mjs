// Savaş sahasının efektleri (kurallar.md 29d sonu): kuşatmada gedik (toz, taşlar, moloz), yanan oklar ve şehirde yangın,
// hücum, bozulanların kalkanları, atlıların tozu. Savaş bilgisayara oynatılır, belli anlarda fotoğraf.
//   node Tools/fxfilm.mjs [klasör]    (önce: node Tools/serve.mjs . 8060) -> Logs/fxfilm
import { mkdirSync } from "node:fs";
import { open } from "./edge.mjs";
const dir = process.argv[2] ?? "Logs/fxfilm";
mkdirSync(dir, { recursive: true });
const page = await open("http://localhost:8060/?seed=3", 1280, 720);
const frame = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`;
await page.evaluate(`(async () => {
  const M = window.MareNostrum;
  M.dispatch({ do: "pick", civ: "rome" }); M.dispatch({ do: "start" }); M.dispatch({ do: "close" });
  const p = M.pos("carthage");
  M.battle({
    att: { civ: "egypt", inf: 200, arch: 60, cav: 40, works: { ram: 1, tower: 1, catapult: 1 } }, def: { civ: "carthage", inf: 160, arch: 50 }, walls: "city", me: "att",
    field: { at: { x: p.x - 0.75, y: p.y + 0.25 }, dir: 0, seed: 9, place: "carthage" },
    owners: { att: "egypt", def: "carthage" }, names: { att: "Egypt", def: "Carthage" }, title: "Siege of Carthage", finish: () => null,
  });
  const B = M.ui.battle;
  B.intro = null; B.deploy = false; B.paused = false; B.auto = true;
  // Okçulara ateşli ok.
  const TT = await import("./src/rules/tactics.js");
  window.TT = TT;
  await ${frame};
  return true;
})()`);
const run = async (until) => page.evaluate(`(async () => {
  const B = window.MareNostrum.ui.battle, TT = window.TT;
  let n = 0;
  while (B.b.t < ${until} && !B.b.over && n < 4000) { if (n % 7 === 0) { TT.aiOrders(B.b, "att", true); TT.aiOrders(B.b, "def", true); TT.useAbility(B.b, B.b.units.filter((u) => u.side === "att" && u.shoot > 0 && TT.abilityOf(B.b, u) === "fire").map((u) => u.id)); } TT.step(B.b, 0.1); n++; if (n % 5 === 0) { window.MareNostrum.redraw(); await new Promise((r) => requestAnimationFrame(r)); } }
  await ${frame};
  return B.b.t;
})()`);
for (const t of [12, 22, 30, 36, 42, 50]) {
  const at = await run(t);
  await page.shot(dir, `t${String(Math.round(at)).padStart(2, "0")}`);
}
console.log(page.errors ? "HATA\n" + page.log.join("\n") : "konsol temiz");
page.close();
process.exit(0);
