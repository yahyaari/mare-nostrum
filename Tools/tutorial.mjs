// Öğreticiyi (haydutlar) gerçek basışlarla baştan sona oynar, her balonun fotoğrafını çeker.
//   node Tools/tutorial.mjs [dil] [medeniyet]      örn. node Tools/tutorial.mjs tr egypt
// Önce sunucu: node Tools/serve.mjs . 8060. Her adımda hangi balonun çıktığını yazar.
import { mkdirSync } from "node:fs";
import { open } from "./edge.mjs";
import { PLACES } from "../src/data/world.js";
const lang = process.argv[2] ?? "tr";
const civ = process.argv[3] ?? "rome";
const dir = `Logs/tutorial/${civ}-${lang}`;
mkdirSync(dir, { recursive: true });
const page = await open(`http://localhost:8060/?lang=${lang}&seed=7`, 1280, 720);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (s) => page.evaluate(`(() => { const M = window.MareNostrum; ${s} })()`);
// Ekrandaki bir düğmeye bas (kutunun ortasına gerçek bir dokunuş).
const press = (pred) => ev(`const b = M.boxes().find((x) => x.act && (${pred})(x.act)); if (!b) return false; M.tap(b.x + b.w / 2, b.y + b.h / 2); return true`);
const bubble = () => ev(`const b = M.boxes().find((x) => x.act?.do === "coach"); return b ? b.act.id : null`);
let n = 0;
const step = async (label) => {
  await wait(450);
  const id = await bubble();
  await page.shot(dir, `${String(++n).padStart(2, "0")}_${label}`);
  console.log(`${n}. ${label}: balon ${id}`);
  return id;
};
try {
  await wait(2000);
  await press(`(a) => a.do === "toStart"`); // ana menü: Yeni oyun
  await wait(600);
  await press(`(a) => a.do === "pick" && a.civ === "${civ}"`);
  await press(`(a) => a.do === "start"`);
  await wait(1500);
  await step("haydutlar");
  await press(`(a) => a.do === "coach" && a.id === "bandits"`);
  await step("baskent");
  const cap = PLACES.find((p) => p.capital && p.owner === civ).id;
  await ev(`const p = M.where("${cap}"); M.tap(p.x, p.y); return 1`);
  await step("asker_sekmesi");
  await press(`(a) => a.do === "cardTab" && a.tab === "troops"`);
  await step("asker_bas");
  await press(`(a) => a.do === "recruit" && a.type === "inf"`);
  await step("garnizon_sekmesi");
  await press(`(a) => a.do === "cardTab" && a.tab === "garrison"`);
  await step("kart_sec");
  await press(`(a) => a.do === "pickAll" && a.all`);
  await step("disari_cik");
  await press(`(a) => a.do === "march" && !a.general`);
  await step("haydutlara_yuru");
  // Haydutlara sağ tık: ordu yanlarına yürür.
  await ev(`const b = M.game.armies.find((a) => a.bandit); const t = M.tokens().find((x) => x.army === b.id); M.rightTap(t.x + t.w / 2, t.y + t.h / 2); return 1`);
  for (let i = 0; i < 40 && (await ev(`return M.anim.busy()`)); i++) await wait(100);
  await step("saldir");
  await ev(`const b = M.game.armies.find((a) => a.bandit); const t = M.tokens().find((x) => x.army === b.id); M.rightTap(t.x + t.w / 2, t.y + t.h / 2); return 1`);
  await step("savas_penceresi");
  await press(`(a) => a.do === "attack"`);
  for (let i = 0; i < 60 && !(await ev(`return !!M.ui.fight`)); i++) await wait(100);
  await wait(3300);
  await step("sonuc_seridi");
  await wait(5500);
  await step("ganimet");
  // Öğreticiden sonra sıradaki hedef: başkentin yanındaki barbar kampı.
  await press(`(a) => a.do === "coach" && a.id === "loot"`);
  await wait(700); // kamera kampa kayar
  const next = await step("barbar_kampi");
  if (next !== "camp") console.log("HATA: kamp balonu çıkmadı");
  const left = await ev(`return M.game.armies.some((a) => a.bandit)`);
  console.log("para:", await ev(`return M.game.civs[M.game.player].money`), left ? "HATA: haydutlar duruyor" : "haydutlar dağıldı");
  console.log(page.errors ? "HATA " + page.log.slice(-8).join("\n") : "konsol temiz");
  if (left || page.errors) process.exitCode = 1;
} finally { page.close(); }
