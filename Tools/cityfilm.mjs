// Şehir manzarası (view/city.js), fotoğraf fotoğraf: oyunun başında Roma, gelişmiş bir liman şehri (bütün yapılar, yol,
// harika, filo), kuşatılan bir kale, kışın içerideki bir şehir; üstüne gelinen yapının ipucu. Bir şeyin ekranda doğru
// göründüğünü görmek için.
//   node Tools/cityfilm.mjs [dil] [klasör]    (önce: node Tools/serve.mjs . 8060) -> Logs/cityfilm
import { mkdirSync } from "node:fs";
import { open } from "./edge.mjs";
const lang = process.argv[2] ?? "tr", dir = process.argv[3] ?? "Logs/cityfilm";
mkdirSync(dir, { recursive: true });
const page = await open("http://localhost:8060/?seed=5", 1280, 720);
const frame = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`;
await page.evaluate(`(async () => {
  const M = window.MareNostrum;
  M.dispatch({ do: "lang", lang: "${lang}" });
  M.dispatch({ do: "pick", civ: "rome" }); M.dispatch({ do: "start" }); M.dispatch({ do: "close" }); M.dispatch({ do: "coachOff" });
  return true;
})()`);
const shot = async (name, setup) => {
  await page.evaluate(`(async () => { const M = window.MareNostrum, g = M.game; ${setup}; M.redraw(); await ${frame}; return true; })()`);
  await page.shot(dir, name);
};
const view = (id) => `M.ui.sel = { kind: "place", id: "${id}" }; M.ui.modal = { kind: "cityView", id: "${id}" }`;
await shot("1_roma_bas", view("rome"));
await shot("2_roma_gelismis", `g.turn = 34; Object.assign(g.places.rome, { level: 5, farms: 5, industry: 4, barracks: 4, temple: 3, market: 3, school: 2, baths: 2, academy: 1, fishery: 3, shipyard: 3, trade: 3, fort: 3, ships: 3, trireme: 2, spec: "trade" });
  g.places.rome.inf = 300; g.places.rome.builds = [{ what: "baths", left: 2, total: 3, paid: 30 }]; g.built = { ...(g.built ?? {}), colosseum: "rome" }; ${view("rome")}`);
await shot("3_ipucu", `window.dispatchEvent(new PointerEvent("pointermove", { clientX: 470, clientY: 470, pointerType: "mouse" }))`);
await shot("3b_ipucu_tapinak", `window.dispatchEvent(new PointerEvent("pointermove", { clientX: 530, clientY: 290, pointerType: "mouse" }))`);
await shot("4_tarim_kis", `g.turn = 36; Object.assign(g.places.mediolanum ?? {}, {}); const id = "ariminum"; Object.assign(g.places[id], { level: 3, farms: 4, industry: 1, barracks: 2, temple: 1, spec: "farm" }); ${view("ariminum")}`);
await shot("5_kale_kusatma", `g.turn = 35; const id = Object.keys(g.places).find((k) => g.places[k].owner === "rome" && M.pos && k !== "rome" && k !== "ariminum" && k !== "tarentum") ?? "tarentum";
  const S = await import("./src/rules/state.js"); const castle = "ariminum";
  g.relations[S.key("rome", "gaul")] = "war"; const p = M.pos(castle); const a = S.formArmy(g, "rome", 10, 0); a.owner = "gaul"; Object.assign(a, { x: p.x - 0.5, y: p.y, at: null, inf: 200, besieging: castle, besiegedSince: g.turn - 2 });
  Object.assign(g.places[castle], { spec: "forge", industry: 3 }); ${view("ariminum")}`);
console.log(page.errors ? "HATA\n" + page.log.join("\n") : "konsol temiz");
page.close();
process.exit(0);
