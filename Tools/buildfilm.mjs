// Şehrin yolu (kurallar.md 4c) ve kuşatmanın aletleri (bölüm 20), fotoğraf fotoğraf: Şehir sekmesinde uzmanlık kartı,
// yolun penceresi, seçilen yol yapılırken ve bitince; kuşatan ordunun kartı ve kampındaki koçbaşılar; taktik sahada
// koçbaşılar. Bir şeyin ekranda doğru göründüğünü görmek için.
//   node Tools/buildfilm.mjs [dil] [klasör]    (önce: node Tools/serve.mjs . 8060) -> Logs/buildfilm
import { mkdirSync } from "node:fs";
import { open } from "./edge.mjs";
const lang = process.argv[2] ?? "tr", dir = process.argv[3] ?? "Logs/buildfilm";
mkdirSync(dir, { recursive: true });
const page = await open("http://localhost:8060/?seed=5", 1280, 720);
const frame = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`;
await page.evaluate(`(async () => {
  const M = window.MareNostrum;
  M.dispatch({ do: "lang", lang: "${lang}" });
  M.dispatch({ do: "pick", civ: "rome" }); M.dispatch({ do: "start" }); M.dispatch({ do: "close" }); M.dispatch({ do: "coachOff" });
  const g = M.game;
  g.turn = 30;
  g.civs.rome.money = 400;
  Object.assign(g.places.rome, { level: 3, farms: 3, industry: 2, barracks: 2, market: 1 });
  return true;
})()`);
const shot = async (name, setup) => {
  await page.evaluate(`(async () => { const M = window.MareNostrum, g = M.game; const S = await import("./src/rules/state.js"); ${setup}; M.redraw(); await ${frame}; return true; })()`);
  await page.shot(dir, name);
};
await shot("1_sehir_sekmesi", `M.ui.modal = null; M.ui.sel = { kind: "place", id: "rome" }; M.ui.cardTab = "city"`);
await shot("2_yol_penceresi", `M.dispatch({ do: "open", modal: "spec", id: "rome" })`);
await shot("3_yol_yapiliyor", `M.dispatch({ do: "spec", id: "rome", spec: "farm" }); M.dispatch({ do: "open", modal: "spec", id: "rome" })`);
await shot("4_kart_yapiliyor", `M.ui.modal = null`);
await shot("5_yol_bitti", `const ev = []; for (let i = 0; i < 3; i++) S.progressBuilds(g, ev); g.places.rome.upgraded = false`);
await shot("6_pencere_secili", `M.dispatch({ do: "open", modal: "spec", id: "rome" })`);
// Kuşatma: Roma ordusu Kartaca'nın bir şehrini kuşatıyor, üç koçbaşı.
await shot("7_kusatma_karti", `
  M.ui.modal = null;
  const id = Object.keys(g.places).find((k) => g.places[k].owner === "carthage" && g.places[k].level >= 3) ?? "carthage";
  g.places[id].level = Math.max(3, g.places[id].level);
  g.relations[S.key("rome", "carthage")] = "war";
  const p = M.pos(id);
  const a = S.formArmy(g, "rome", 10, 0);
  Object.assign(a, { x: p.x - 0.5, y: p.y, at: null, inf: 200, besieging: id, besiegedSince: g.turn - 3, works: 3, mp: 0 });
  M.ui.sel = { kind: "army", id: a.id };
  M.lookAt(p.x, p.y, 3);
  window.siegeAt = id; window.siegeArmy = a.id;
`);
await shot("8_saldiri_penceresi", `const a = S.armyById(g, window.siegeArmy); a.mp = 4; M.dispatch({ do: "attackAsk", army: a.id, id: window.siegeAt })`);
// Taktik sahada koçbaşılar.
await page.evaluate(`(async () => {
  const M = window.MareNostrum;
  M.ui.modal = null;
  const p = M.pos("carthage");
  M.battle({
    att: { civ: "rome", inf: 160, arch: 40, works: 3 }, def: { civ: "carthage", inf: 120, arch: 40 }, walls: "city", me: "att",
    field: { at: { x: p.x - 0.75, y: p.y + 0.25 }, dir: 0, seed: 9, place: "carthage" },
    owners: { att: "rome", def: "carthage" }, names: { att: "Rome", def: "Carthage" }, title: "Siege of Carthage", finish: () => null,
  });
  window.MareNostrum.ui.battle.intro = null;
  await ${frame};
  return true;
})()`);
await page.shot(dir, "9_saha_kocbasi");
console.log(page.errors ? "HATA\n" + page.log.join("\n") : "konsol temiz");
page.close();
process.exit(0);
