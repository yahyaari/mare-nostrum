// Bir yürüyüşün film şeridi (saat dondurulup 300 ms aralıkla kare): node Tools/film.mjs -> Logs/film
import { mkdirSync } from "node:fs";
import { open } from "./edge.mjs";
const dir = "Logs/film";
mkdirSync(dir, { recursive: true });
const page = await open("http://localhost:8060/?seed=11", 1280, 720);
await page.evaluate(`(async () => {
  const M = window.MareNostrum;
  const f = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  M.dispatch({ do: "pick", civ: "saka" }); M.dispatch({ do: "start" }); M.dispatch({ do: "close" });
  await f();
  const a = M.game.armies.length ? M.game.armies[0] : null;
  M.dispatch({ do: "pickAll", of: "p:olbia", all: true, n: 999 }); M.dispatch({ do: "march", id: "olbia" });
  M.look("neapolis", 2.4); M.anim.finish(); await f();
  window.T0 = performance.now();
  M.anim.freeze(window.T0);
  const p = M.where("tanais"); M.tap(p.x, p.y);
  await f();
  return true;
})()`);
for (let k = 0; k <= 8; k++) {
  await page.evaluate(`(async () => { window.MareNostrum.anim.freeze(window.T0 + ${k * 300}); window.MareNostrum.redraw();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return true; })()`);
  await page.shot(dir, `kare_${String(k * 300).padStart(4, "0")}`);
}
console.log(page.errors ? "HATA" : "konsol temiz");
page.close();
