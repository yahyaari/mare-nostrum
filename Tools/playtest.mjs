// Oyuncu gibi oynayan test: tarayıcıda oyunu açar, bir medeniyet seçer ve N tur boyunca her
// şeyi ekrandaki düğmelere ve haritaya gerçek basışlarla yapar (Tools/playtest.page.js).
// Bot (bot.mjs) kuralları sınar; bu, arayüzün o kurallara gerçek oyun durumlarında - savaşta,
// kuşatılmışken, raporlarla - doğru bağlandığını sınar.
//
//   node Tools/playtest.mjs [url] [medeniyet] [tur] [zorluk] [genişlik] [yükseklik]
//   node Tools/playtest.mjs http://localhost:8060/ saka 60 easy

import { mkdirSync, readFileSync } from "node:fs";
import { open } from "./edge.mjs";

const [url = "http://localhost:8060/", civ = "rome", turnsArg = "60", level = "normal", wArg = "1280", hArg = "720"] = process.argv.slice(2);
const turns = Number(turnsArg);
const dir = `Logs/playtest-${civ}-${level}-${wArg}x${hArg}`;
mkdirSync(dir, { recursive: true });

const page = await open(url, Number(wArg), Number(hArg));
const fail = (why) => { console.log("DURDU: " + why); for (const l of page.log.slice(-15)) console.log("  " + l); page.close(); process.exit(1); };
try {
  await page.evaluate(readFileSync(new URL("./playtest.page.js", import.meta.url), "utf8"));
  await page.evaluate(`(async () => {
    const M = window.MareNostrum;
    await PT.press((a) => a.do === "pick" && a.civ === "${civ}", "medeniyet");
    await PT.press((a) => a.do === "level" && a.level === "${level}", "zorluk");
    await PT.press((a) => a.do === "start", "başla");
    return M.ui.screen;
  })()`);
  await page.shot(dir, "00_basladi");

  let slow = 0, last = null;
  for (let i = 0; i < turns; i++) {
    const t0 = Date.now();
    const r = await page.evaluate("PT.turn()");
    if (Date.now() - t0 > 8000) console.log(`  YAVAŞ TUR: ${r.turn ?? r} ${Date.now() - t0}ms`);
    if (r === "over") break;
    last = r;
    slow = Math.max(slow, r.ms);
    if (r.report || i % 10 === 9) {
      console.log(`  tur ${String(r.turn).padStart(3)}  yer ${String(r.places).padStart(2)}  asker ${String(r.men).padStart(4)}  ${r.ms}ms  ${r.report ?? ""}`);
      for (const l of r.lines) console.log("           " + l);
    }
    if (i % 15 === 14 || r.report === "over") await page.shot(dir, `tur_${String(r.turn).padStart(3, "0")}`);
    if (page.errors) fail("konsolda hata");
  }
  const s = await page.evaluate("JSON.parse(JSON.stringify({ ...PT.stats, over: window.MareNostrum.game.over }))");

  // Kayıttan dönüş: sayfayı yenile, başlangıçta Devam et'e bas, aynı turda mıyız.
  const before = await page.evaluate("JSON.stringify(window.MareNostrum.game)");
  await page.reload();
  await page.evaluate(readFileSync(new URL("./playtest.page.js", import.meta.url), "utf8"));
  const cont = await page.evaluate("PT.press((a) => a.do === 'continue')");
  const after = await page.evaluate("JSON.stringify(window.MareNostrum.game)");
  console.log(cont && after === before ? "kayıttan dönüş: aynı oyun" : "KAYITTAN DÖNÜŞ BOZUK");
  if (!(cont && after === before)) process.exitCode = 1;
  await page.shot(dir, "99_son");
  console.log(`\nson: tur ${last?.turn} yer ${last?.places} asker ${last?.men} | en yavaş tur ${slow}ms`);
  console.log(`basış ${s.pressed} yükseltme ${s.upgrades} bölük ${s.recruits} ordu ${s.armies} yürüyüş ${s.marches} saldırı ${s.attacks} (zafer ${s.won}) savaş ilanı ${s.wars} ittifak ${s.allies} karar ${s.decided} liman yapısı ${s.port} gemi ${s.ships}`);
  if (s.over) console.log("oyun bitti: " + JSON.stringify(s.over));
  const missed = [...new Set(s.missed)];
  if (missed.length) console.log("bulunamayan düğmeler: " + missed.slice(0, 10).join(" | "));
  console.log(page.errors ? `${page.errors} HATA` : "konsol temiz");
  page.close();
  process.exit(page.errors ? 1 : process.exitCode ?? 0);
} catch (e) {
  fail(e.message);
}
