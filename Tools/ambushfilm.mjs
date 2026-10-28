// Pusu (kurallar.md 29i): ormanlık bir sahada bilgisayar pusu kurar; dizilirken görünmez, yaklaşınca "Pusu!".
// Kendi birliğin ormanda gizlenince yaprak işareti. Fotoğraf fotoğraf.
//   node Tools/ambushfilm.mjs [klasör]    (önce: node Tools/serve.mjs . 8060) -> Logs/ambushfilm
import { mkdirSync } from "node:fs";
import { open } from "./edge.mjs";
const dir = process.argv[2] ?? "Logs/ambushfilm";
mkdirSync(dir, { recursive: true });
const page = await open("http://localhost:8060/?seed=3", 1280, 720);
const frame = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`;
// Ormanlık bir yer bul: birkaç yerleşimin yanında dene, savunanın bölgesinde pusu kurulana kadar.
const found = await page.evaluate(`(async () => {
  const M = window.MareNostrum;
  M.dispatch({ do: "lang", lang: "tr" });
  M.dispatch({ do: "pick", civ: "rome" }); M.dispatch({ do: "start" }); M.dispatch({ do: "close" });
  for (const id of ["bibracte", "alesia", "mediolanum", "numantia", "pella", "byzantium", "massalia", "tarraco"]) {
    const p = M.pos(id);
    if (!p) continue;
    for (const dx of [-0.75, 0.75, -1.5]) {
      M.battle({
        att: { civ: "rome", inf: 160, arch: 40, cav: 20 }, def: { civ: "gaul", inf: 120, arch: 30, cav: 40 }, walls: null, me: "att",
        field: { at: { x: p.x + dx, y: p.y + 0.25 }, dir: 0, seed: 9, place: null },
        owners: { att: "rome", def: "gaul" }, names: { att: "Rome", def: "Gaul" }, title: "Ambush", finish: () => null,
      });
      const B = M.ui.battle;
      if (B.b.units.some((u) => u.lurk)) { B.intro = null; window.TT = await import("./src/rules/tactics.js"); await ${frame}; return id + " " + dx; }
    }
  }
  return null;
})()`);
console.log("saha:", found);
await page.shot(dir, "1_dizilme_pusu_gorunmez");
await page.evaluate(`(async () => {
  const B = window.MareNostrum.ui.battle, TT = window.TT;
  B.deploy = false; B.paused = false;
  let n = 0;
  while (!B.b.fx.some((e) => e.kind === "ambush") && !B.b.over && n < 3000) { if (n % 7 === 0) { TT.aiOrders(B.b, "att", true); TT.aiOrders(B.b, "def"); } TT.step(B.b, 0.1); n++; }
  for (let i = 0; i < 6; i++) TT.step(B.b, 0.1);
  B.paused = true;
  window.MareNostrum.redraw(); await ${frame}; return true;
})()`);
await page.shot(dir, "2_pusu");
console.log(page.errors ? "HATA\n" + page.log.join("\n") : "konsol temiz");
page.close();
process.exit(0);
