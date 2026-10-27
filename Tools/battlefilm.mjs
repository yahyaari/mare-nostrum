// Taktik savaşın girişi ve bitişi, kare kare (kurallar.md 29d): bulutlar, kamera, ad, bantlar; sonra sonuç panosunun
// aşağıdan gelişi. Bir şeyin ekranda doğru göründüğünü görmek için.
//   node Tools/battlefilm.mjs [klasör]     (önce: node Tools/serve.mjs . 8060) -> Logs/battlefilm
import { mkdirSync } from "node:fs";
import { open } from "./edge.mjs";
const dir = process.argv[2] ?? "Logs/battlefilm";
mkdirSync(dir, { recursive: true });
const page = await open("http://localhost:8060/?seed=3", 1280, 720);
const frame = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`;
await page.evaluate(`(async () => {
  // Saat dondurulur: her kare tam istenen anda.
  const real = performance.now.bind(performance);
  window.frozen = null;
  performance.now = () => window.frozen ?? real();
  const M = window.MareNostrum;
  M.dispatch({ do: "pick", civ: "rome" }); M.dispatch({ do: "start" }); M.dispatch({ do: "close" });
  const p = M.pos("bibracte");
  M.battle({
    att: { civ: "rome", inf: 160, arch: 60, cav: 40 }, def: { civ: "gaul", inf: 160, arch: 30, cav: 60 }, walls: null, me: "att",
    field: { at: { x: p.x - 0.75, y: p.y + 0.25 }, dir: 0, seed: 9, place: null },
    owners: { att: "rome", def: "gaul" }, names: { att: "Rome", def: "Gaul" }, title: "Battle of Bibracte", finish: () => null,
  });
  await ${frame};
  return true;
})()`);
// Giriş: saat geriye alınarak (t0 = şimdi - k).
for (let k = 0; k <= 3600; k += 300) {
  await page.evaluate(`(async () => { const B = window.MareNostrum.ui.battle; window.frozen = 1e6 + ${k}; B.intro = { ...(B.intro ?? {}), t0: 1e6 }; await ${frame}; return true; })()`);
  await page.shot(dir, `giris_${String(k).padStart(4, "0")}`);
}
// Bitiş: savaş kazanıldı; pano aşağıdan gelir.
for (const k of [0, 500, 800, 1000, 1200, 1500, 2200]) {
  await page.evaluate(`(async () => { const B = window.MareNostrum.ui.battle; B.intro = null; B.b.over = { winner: "att" }; window.frozen = 2e6 + ${k}; B.endAt = 2e6; await ${frame}; return true; })()`);
  await page.shot(dir, `bitis_${String(k).padStart(4, "0")}`);
}
console.log(page.errors ? "HATA\n" + page.log.join("\n") : "konsol temiz");
page.close();
process.exit(0);
