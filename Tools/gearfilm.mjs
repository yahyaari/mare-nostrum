// Donanım (kurallar.md 6d): şehirdeki ordunun kartında silah ve zırh, birlik kartlarında çizgiler, ipucu.
//   node Tools/gearfilm.mjs [dil] [klasör]    (önce: node Tools/serve.mjs . 8060) -> Logs/gearfilm
import { mkdirSync } from "node:fs";
import { open } from "./edge.mjs";
const lang = process.argv[2] ?? "tr", dir = process.argv[3] ?? "Logs/gearfilm";
mkdirSync(dir, { recursive: true });
const page = await open("http://localhost:8060/?seed=5", 1280, 720);
const frame = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`;
await page.evaluate(`(async () => {
  const M = window.MareNostrum;
  M.dispatch({ do: "lang", lang: "${lang}" });
  M.dispatch({ do: "pick", civ: "rome" }); M.dispatch({ do: "start" }); M.dispatch({ do: "close" }); M.dispatch({ do: "coachOff" });
  const g = M.game;
  const S = await import("./src/rules/state.js");
  g.civs.rome.weapons = 120; g.civs.rome.money = 200; g.places.rome.industry = 2; g.places.rome.inf = 120;
  const a = S.formArmy(g, "rome", 100, 0);
  a.xp = 3;
  S.equip(g, a.id, "arms");
  M.ui.sel = { kind: "army", id: a.id };
  const p = M.pos("rome"); M.lookAt(p.x, p.y, 3);
  M.redraw(); await ${frame};
  return true;
})()`);
await page.shot(dir, "1_ordu_karti");
await page.evaluate(`(async () => { window.dispatchEvent(new PointerEvent("pointermove", { clientX: 350, clientY: 537, pointerType: "mouse" })); window.MareNostrum.redraw(); await ${frame}; return true; })()`);
await page.shot(dir, "2_ipucu");
console.log(page.errors ? "HATA\n" + page.log.join("\n") : "konsol temiz");
page.close();
process.exit(0);
