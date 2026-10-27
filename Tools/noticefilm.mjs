// Bildirimlerin görselli pencereleri, tek tek fotoğraf (kurallar.md 12d, Docs/gorseller.md): mektuplar (akın, paralı
// asker, veba...), teklifler, sana saldırı, tur raporu, görev, oyun sonu, araştırma. Resimleri art/ klasörüne koyunca
// nasıl durduklarını görmek için.
//   node Tools/noticefilm.mjs [dil] [klasör]    (önce: node Tools/serve.mjs . 8060) -> Logs/notices
import { mkdirSync } from "node:fs";
import { open } from "./edge.mjs";
const lang = process.argv[2] ?? "tr", dir = process.argv[3] ?? "Logs/notices";
mkdirSync(dir, { recursive: true });
const page = await open("http://localhost:8060/?seed=5", 1280, 720);
const frame = `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`;
await page.evaluate(`(async () => {
  const M = window.MareNostrum;
  M.dispatch({ do: "lang", lang: "${lang}" });
  M.dispatch({ do: "pick", civ: "rome" }); M.dispatch({ do: "start" }); M.dispatch({ do: "close" }); M.dispatch({ do: "coachOff" });
  M.game.turn = 12;
  return true;
})()`);
const shot = async (name, setup) => {
  await page.evaluate(`(async () => { const M = window.MareNostrum, g = M.game; const E = await import("./src/rules/events.js"); g.inbox = []; ${setup}; M.redraw(); await ${frame}; return true; })()`);
  await page.shot(dir, name);
};
for (const k of ["raid", "mercs", "plague", "harvest", "fire", "unrest", "caravan"]) {
  await shot(`mektup_${k}`, `E.letter(g, "rome", "${k}", "tarentum", E.EVENTS.${k}.make?.(g) ?? {}); M.ui.modal = { kind: "decide" }`);
}
await shot("mektup_civilWar", `E.letter(g, "rome", "civilWar", "tarentum", { bribe: 60, rebels: ["tarentum"] }); M.ui.modal = { kind: "decide" }`);
for (const [k, f] of [["ally", "{}"], ["peace", "{}"], ["trade", "{ money: 4, turns: 8 }"], ["tribute", "{ amount: 40 }"]]) {
  await shot(`teklif_${k}`, `E.offer(g, "carthage", "${k}", ${f}, "rome"); M.ui.modal = { kind: "decide" }`);
}
await shot("saldiri_akinci", `const it = E.letter(g, "rome", "raid", "tarentum", E.EVENTS.raid.make(g)); M.ui.modal = { kind: "incoming", letter: it.id }`);
await shot("rapor", `g.events = [{ type: "built", turn: g.turn, civ: "rome", place: "rome", what: "farms", level: 2 }]; M.ui.modal = { kind: "report" }`);
await shot("rapor_arastirma", `g.events = [{ type: "tech", turn: g.turn, civ: "rome", tech: "horseback" }]; M.ui.modal = { kind: "report" }`);
await shot("arastirma", `M.ui.modal = { kind: "research" }`);
console.log(page.errors ? "HATA\n" + page.log.join("\n") : "konsol temiz");
page.close();
process.exit(0);
