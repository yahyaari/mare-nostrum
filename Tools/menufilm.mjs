// Ana menü (kurallar.md 12f): açılış, senaryolar, medeniyet seçimi, ayarlar, oyun içi menü; kayıt varken Devam et.
//   node Tools/menufilm.mjs [dil] [klasör]    (önce: node Tools/serve.mjs . 8060) -> Logs/menufilm
import { mkdirSync } from "node:fs";
import { open } from "./edge.mjs";
const lang = process.argv[2] ?? "tr", dir = process.argv[3] ?? "Logs/menufilm";
mkdirSync(dir, { recursive: true });
const page = await open("http://localhost:8060/?seed=5", 1280, 720);
const frame = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`;
const step = async (name, js, wait = 0) => {
  await page.evaluate(`(async () => { const M = window.MareNostrum; ${js}; M.redraw(); await new Promise((r) => setTimeout(r, ${wait})); await ${frame}; return true; })()`);
  await page.shot(dir, name);
};
await step("1_ana_menu", `localStorage.clear(); M.dispatch({ do: "lang", lang: "${lang}" })`, 1900);
await step("2_senaryolar", `M.dispatch({ do: "scenarios" })`, 200);
await step("3_medeniyet", `M.dispatch({ do: "toStart", scenario: "bc270" })`, 1300);
await step("4_oyun_menu", `M.dispatch({ do: "start" }); M.dispatch({ do: "close" }); M.dispatch({ do: "coachOff" }); M.dispatch({ do: "open", modal: "menu" })`, 300);
await step("5_ayarlar", `M.dispatch({ do: "open", modal: "settings" })`, 300);
await step("6_ana_menu_devam", `M.dispatch({ do: "close" }); M.dispatch({ do: "title" })`, 1400);
const state = await page.evaluate(`(async () => { const M = window.MareNostrum; M.dispatch({ do: "continue" }); await ${frame}; return M.ui.screen + " " + M.game?.scenario + " tur " + M.game?.turn; })()`);
console.log("devam:", state);
console.log(page.errors ? "HATA\n" + page.log.join("\n") : "konsol temiz");
page.close();
process.exit(0);
