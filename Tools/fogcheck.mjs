// Sis bir orduyu saklıyor mu: Saka olarak oyna, Roma'da bir Roma ordusu kur; sis açıkken
// haritada yok, kapalıyken var. Yakındaki (görülen) düşman ordusu her zaman var.
//   node Tools/fogcheck.mjs     (önce: node Tools/serve.mjs . 8060)
import { open } from "./edge.mjs";
const p = await open("http://localhost:8060/?seed=7", 1672, 941);
const ev = (js) => p.evaluate(`(async () => { const M = window.MareNostrum; ${js} })()`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await ev(`M.dispatch({ do: "pick", civ: "saka" }); M.dispatch({ do: "start" }); M.dispatch({ do: "close" }); return 1;`);
await wait(1500);
await ev(`  const S = await import("./src/rules/state.js");
  const far = S.formArmy(M.game, "rome", 10, 0); window.__far = far.id;
  const near = S.formArmy(M.game, "odessos", 10, 0); window.__near = near.id;
  M.overview(); return 1;`);
await wait(400);
const on = await ev(`return M.tokens().map((t) => t.army);`);
await ev(`M.dispatch({ do: "fog", on: false }); return 1;`);
await wait(400);
const off = await ev(`return M.tokens().map((t) => t.army);`);
await ev(`M.dispatch({ do: "fog", on: true }); return 1;`);
const ids = await ev(`return [window.__far, window.__near];`);
console.log("sis açık:", on.includes(ids[0]) ? "uzak ordu GÖRÜNÜYOR (hata)" : "uzak ordu gizli", "|", on.includes(ids[1]) ? "yakın ordu görünüyor" : "yakın ordu GİZLİ (hata)");
console.log("sis kapalı:", off.includes(ids[0]) ? "uzak ordu görünüyor" : "uzak ordu GİZLİ (hata)");
console.log(p.errors ? "HATA\n" + p.log.join("\n") : "konsol temiz");
p.close();
process.exit(0);
