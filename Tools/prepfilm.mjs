// Kuşatma hazırlığı (kurallar.md 20): düşman şehrinin önündeki ordu - saldırı penceresi (önce kuşat), kuşatma kurulunca
// ordu kartı (Saldırı · n tur), hazırlık bitince saldırı açık. Fotoğraf fotoğraf.
//   node Tools/prepfilm.mjs [dil] [klasör]    (önce: node Tools/serve.mjs . 8060) -> Logs/prepfilm
import { mkdirSync } from "node:fs";
import { open } from "./edge.mjs";
const lang = process.argv[2] ?? "tr", dir = process.argv[3] ?? "Logs/prepfilm";
mkdirSync(dir, { recursive: true });
const page = await open("http://localhost:8060/?seed=5", 1280, 720);
const frame = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`;
const step = async (name, js) => {
  await page.evaluate(`(async () => { const M = window.MareNostrum; const g = M.game; const S = await import("./src/rules/state.js"); ${js}; M.redraw(); await ${frame}; return true; })()`);
  await page.shot(dir, name);
};
await page.evaluate(`(async () => { const M = window.MareNostrum; M.dispatch({ do: "lang", lang: "${lang}" }); M.dispatch({ do: "toStart" }); M.dispatch({ do: "pick", civ: "rome" }); M.dispatch({ do: "start" }); M.dispatch({ do: "close" }); M.dispatch({ do: "coachOff" }); return true; })()`);
await step("1_pencere_once_kusat", `g.relations[S.key("rome", "gaul")] = "war"; const p = M.pos("bibracte") ?? M.pos("gergovia"); const a = S.formArmy(g, "rome", 30, 0); Object.assign(a, { x: p.x - 0.5, y: p.y, at: null, inf: 200, mp: 4 }); window.A = a.id; M.ui.sel = { kind: "army", id: a.id }; M.lookAt(p.x, p.y, 3); M.dispatch({ do: "attackAsk", army: a.id, id: "bibracte" })`);
await step("2_kusatildi_kart", `M.dispatch({ do: "besiege" })`);
await step("3_hazir", `const a = S.armyById(g, window.A); a.besiegedSince = g.turn - 3; a.mp = 4; M.dispatch({ do: "attackAsk", army: a.id, id: "bibracte" })`);
console.log(page.errors ? "HATA\n" + page.log.join("\n") : "konsol temiz");
page.close();
process.exit(0);
