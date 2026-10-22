// Oyunu başsız Edge'de açıp belirli anların fotoğrafını çeker. Bir şeyin ekranda doğru
// göründüğünü görmek için; dengeyi ölçmek için değil.
//
//   node Tools/peek.mjs [url] [klasör] [genişlik] [yükseklik]
//   node Tools/peek.mjs http://localhost:8060/ Logs/peek 1280 720
//   node Tools/peek.mjs http://localhost:8060/ Logs/peek-phone 390 844     (telefon, dikey)
//
// Önce sunucu: node Tools/serve.mjs . 8060
//
// Oyun açılmazsa ("[MareNostrum] ready" gelmezse) fotoğraf çekmeden durur: boş bir sayfa da
// fotoğraflanır ve bembeyaz kareler bakmadan "temiz" diye geçer. Konsolda bir hata ya da
// istisna varsa sıfır olmayan kodla çıkar.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Edge'i süreç ağacıyla kapat: browser.kill() sadece ana süreci öldürüyordu, alt süreçler
// (çizici, GPU, yardımcılar) ortada kalıyordu - bir gün 81 tane birikti ve bilgisayarı
// yavaşlattı (kullanıcı 22.10). Betik hatayla çıksa da çıkışta kapatılır.
// Edge'in ilk süreci hemen çıkıp tarayıcıyı ayrı bırakıyor (süreç ağacı kopuk): o yüzden bu
// aracın kendine ait profil klasörünü taşıyan bütün Edge süreçleri kapatılır.
function killTree(browser, profile) {
  if (!browser || browser.done) return;
  browser.done = true;
  try { browser.kill(); } catch { /* */ }
  const ps = `Get-CimInstance Win32_Process -Filter "name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profile}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try { spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" }); } catch { /* */ }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* geçici klasör: kalırsa da zararsız */ }
}

const args = process.argv.slice(2);
if (args.some((a) => a.startsWith("--"))) {
  console.log("bu araç bayrak almaz. kullanım: node Tools/peek.mjs [url] [klasör] [genişlik] [yükseklik]");
  process.exit(2);
}
const [url = "http://localhost:8060/", outDir = "Logs/peek"] = args;
const W = Number(args[2] ?? 1280), H = Number(args[3] ?? 720);
const phone = H > W;

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9700 + (process.pid % 200);
mkdirSync(outDir, { recursive: true });

const profile = join(tmpdir(), "mn-peek-" + Date.now() + "-" + process.pid);
const browser = spawn(EDGE, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, "--no-first-run", "about:blank",
], { stdio: "ignore" });
process.on("exit", () => killTree(browser, profile));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
let bad = 0;
const watchdog = setTimeout(() => { console.log("ZAMAN AŞIMI"); killTree(browser, profile); process.exit(2); }, 90000);

let target;
for (let i = 0; i < 60 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === "page");
  } catch { /* hazır değil */ }
  if (!target) await sleep(200);
}
if (!target) { console.log("EDGE AÇILMADI"); killTree(browser, profile); process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let nextId = 1;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === "Runtime.consoleAPICalled") {
    const text = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
    log.push(`[${m.params.type}] ${text}`);
    if (m.params.type === "error") bad++;
  } else if (m.method === "Runtime.exceptionThrown") {
    log.push(`[exception] ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    bad++;
  }
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  const timer = setTimeout(() => reject(new Error(`${method} cevap vermedi`)), 30000);
  pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
  ws.send(JSON.stringify({ id, method, params }));
});

/** Sayfada bir ifade. Patlarsa susmaz: istisna fırlatır. */
const evaluate = async (e) => {
  const r = (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result;
  if (r?.exceptionDetails) {
    const why = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text;
    log.push(`[exception] ${e} -> ${why}`);
    bad++;
    throw new Error(why);
  }
  return r?.result?.value;
};

async function shot(name, setup) {
  if (setup) await evaluate(`(() => { const M = window.MareNostrum; ${setup}; return true; })()`);
  await sleep(250);
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(outDir, name + ".png"), Buffer.from(r.result.data, "base64"));
  console.log(`  ${name}.png`);
}

await send("Runtime.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: phone ? 2 : 1, mobile: phone });
await send("Page.navigate", { url });

const deadline = Date.now() + 20000;
const ready = () => log.some((l) => l.includes("[MareNostrum] ready"));
while (Date.now() < deadline && !ready()) await sleep(200);
if (!ready()) {
  console.log("OYUN AÇILMADI: " + url);
  for (const line of log) console.log("  " + line);
  if (!log.length) console.log("  konsolda tek satır yok - sunucu açık mı? node Tools/serve.mjs . 8060");
  clearTimeout(watchdog);
  killTree(browser, profile);
  process.exit(3);
}

// Bir eylem, oyunun kendi düğmelerinin bıraktığı biçimde.
const D = (act) => `M.dispatch(${JSON.stringify(act)})`;
// Gerçek bir basış: bir yerleşimin ekrandaki yerine, oyunun kendi girdi yolundan.
const TAP = (id) => `{ const p = M.where('${id}'); M.tap(p.x, p.y); }`;
// Animasyonun belirli bir anını dondur (ms, şimdiden itibaren) ya da çözüp sonuna atla.
const AT = (ms) => `M.anim.freeze(performance.now() + ${ms})`;
const DONE = "M.anim.freeze(null); M.anim.finish(); M.redraw()";

await shot("01_baslangic", "");
await shot("02_secim_tr", `${D({ do: "lang", lang: "tr" })}; ${D({ do: "pick", civ: "saka" })}`);
await shot("03_basla_yardim", `${D({ do: "lang", lang: "en" })}; ${D({ do: "pick", civ: "rome" })}; ${D({ do: "start" })}`);
await shot("04_harita", D({ do: "close" }));
await shot("05_sehir_karti", TAP("rome"));
await shot("06_ordu_cikar", D({ do: "formOpen", id: "rome" }));
await shot("07_ordu_secili", D({ do: "formOk" }));
await shot("08_yolda", `${TAP("ariminum")}; ${AT(200)}`);
await shot("08b_vardi", DONE);
await shot("09_tur_seridi", `${D({ do: "endTurn" })}; ${AT(450)}`);
await shot("09b_tur_raporu", DONE);
await shot("10_saldiri_isaretleri", `${D({ do: "close" })}; const a = M.game.armies.find((x) => x.owner === 'rome');
  a.inf = 120; M.ui.sel = { kind: 'army', id: a.id }; M.look('ariminum', 2.6)`);
await shot("11_saldiri_penceresi", TAP("mediolanum"));
await shot("12_saldiri_ani", `${D({ do: "attack" })}; ${AT(520)}`);
await shot("12b_savas_sonucu", DONE);
await shot("13_diplomasi", `${D({ do: "close" })}; ${D({ do: "open", modal: "diplo" })}`);
await shot("14_menu", `${D({ do: "close" })}; ${D({ do: "open", modal: "menu" })}`);
await shot("15_tr_sehir", `${D({ do: "close" })}; ${D({ do: "lang", lang: "tr" })}; M.ui.sel = { kind: 'place', id: 'mediolanum' }; M.redraw()`);
await shot("16_yabanci_kart", "M.ui.sel = { kind: 'place', id: 'massalia' }; M.look('massalia', 2.2)");
// Tehdit: Kartaca Siraküza'yı almış, savaş açmış, ordusu Tarentum'un yanında.
await shot("17_tehdit_raporu", `${D({ do: "lang", lang: "en" })}; const g = M.game;
  g.places.syracuse.owner = 'carthage'; g.relations['carthage|rome'] = 'war';
  g.armies.push({ id: 999, owner: 'carthage', at: 'syracuse', inf: 80, arch: 20, moves: 1, route: [] });
  M.ui.sel = null; M.look('tarentum', 2.2); ${D({ do: "open", modal: "report" })}`);
await shot("18_tehdit_halkasi", D({ do: "close" }));
// Rakibin hamlesi: Kartaca'nın 100 askeri Tarentum'a yürüyüp saldırır, tur arası gösterisinde.
await shot("19_rakip_yuruyor", `${D({ do: "endTurn" })}; ${AT(1150)}`);
await shot("19b_rakip_carpisma", AT(1350));
await shot("19c_el_degisti", AT(1900));
await shot("19d_rapor", DONE);
// Mektuplar: akın ve haraç; karar penceresi.
await shot("20_mektup_akin", `M.ui.modal = null; M.game.inbox.push({ id: 900, turn: M.game.turn, type: 'event', key: 'raid', civ: 'rome',
  place: 'ariminum', raiders: 45, bribe: 14 }); ${D({ do: "close" })}`);
await shot("21_mektup_harac", `${D({ do: "decide", id: 900, choice: "bribe" })}; M.game.inbox.push({ id: 901, turn: M.game.turn,
  type: 'offer', key: 'tribute', civ: 'gaul', amount: 32 }); ${D({ do: "close" })}`);
// Sadakat: huzursuz Mediolanum, kartı ve haritadaki rozeti.
await shot("22_sadakat", `${D({ do: "decide", id: 901, choice: "pay" })}; ${DONE}; M.ui.modal = null;
  M.game.places.mediolanum.loyalty = 18; M.game.places.ariminum.loyalty = 33; M.ui.sel = { kind: 'place', id: 'mediolanum' }; M.look('mediolanum', 2.2)`);
await shot("23_sadakat_tr", `${D({ do: "lang", lang: "tr" })}`);
// General: ata, sonra bir zaferde seviye atlasın.
await shot("24_general_ata", `${D({ do: "lang", lang: "en" })}; M.game.civs.rome.money = 100;
  const a = M.game.armies.find((x) => x.owner === 'rome' && x.at === 'mediolanum'); a.moves = 1; a.inf = 160;
  M.ui.sel = { kind: 'army', id: a.id }; M.look('mediolanum', 2.4)`);
await shot("25_general_atandi", `${D({ do: "appoint", army: 0 }).replace("0", "M.ui.sel.id")}; ${DONE}`);
await shot("26_general_zafer", `const a = M.game.armies.find((x) => x.owner === 'rome' && x.at === 'mediolanum'); a.general.xp = 2;
  ${TAP("massalia")}; ${D({ do: "attack" })}; ${DONE}`);
await shot("28_dort_tur", `M.ui.modal = null; const r = M.game.places.rome; r.level = 3; r.barracks = 3; r.industry = 3; r.cav = 20; r.siege = 10;
  r.upgraded = false; r.recruited = 0; M.game.civs.rome.money = 90; M.game.civs.rome.weapons = 30; M.game.civs.rome.food = 30;
  M.ui.sel = { kind: 'place', id: 'rome' }; M.look('rome', 2.2)`);
await shot("29_ordu_cikar_dort", D({ do: "formOpen", id: "rome" }));
await evaluate(`(() => { const M = window.MareNostrum; M.dispatch({ do: "close" }); return true; })()`);
await shot("27_general_kart", `${D({ do: "close" })}; const a = M.game.armies.find((x) => x.owner === 'rome' && x.general);
  M.ui.sel = { kind: 'army', id: a.id }; M.redraw()`);
// Donanma: Kartaca ile yeni oyun.
await shot("30_kartaca_liman", `M.ui.modal = null; ${D({ do: "newGame" })}; ${D({ do: "pick", civ: "carthage" })}; ${D({ do: "start" })};
  ${D({ do: "close" })}; M.game.civs.carthage.money = 80; M.ui.sel = { kind: 'place', id: 'carthage' }; M.look('carthage', 2.4)`);
await shot("30b_liman_sekmesi", `${D({ do: "cardTab", tab: "port" })}; M.game.places.carthage.fishery = 1; M.game.places.carthage.trade = 1`);
await shot("30c_liman_tr", `${D({ do: "lang", lang: "tr" })}`);
await shot("31_gemili_ordu_cikar", `${D({ do: "lang", lang: "en" })}; ${D({ do: "cardTab", tab: "city" })}; ${D({ do: "formOpen", id: "carthage" })}`);
await shot("32_denizde", `M.ui.modal.ships = 2; ${D({ do: "formOk" })}; ${TAP("lilybaeum")}; ${AT(190)}`);
await shot("33_deniz_saldiri", `${DONE}; const g = M.game; const a = g.armies.find((x) => x.owner === 'carthage');
  a.at = 'carthage'; a.moves = 1; a.inf = 70; a.ships = 3; a.route = []; M.ui.sel = { kind: 'army', id: a.id }; M.look('carthage', 2.2);
  ${TAP("caralis")}`);
await shot("34_deniz_zafer", `${D({ do: "attack" })}; ${DONE}`);
await shot("35_abluka", `${D({ do: "close" })}; const g = M.game; g.relations['carthage|rome'] = 'war';
  g.places.lilybaeum.owner = 'carthage'; g.places.syracuse.owner = 'rome';
  g.armies.push({ id: 990, owner: 'rome', at: 'syracuse', inf: 0, arch: 0, cav: 0, siege: 0, ships: 4, moves: 1, route: [], general: null });
  g.places.tarentum.ships = 0; g.armies.push({ id: 991, owner: 'carthage', at: 'syracuse', inf: 0, arch: 0, cav: 0, siege: 0, ships: 0, moves: 0, route: [], general: null });
  g.armies = g.armies.filter((x) => x.id !== 991);
  g.places.syracuse.owner = 'carthage'; g.places.tarentum.owner = 'carthage'; g.armies.find((x) => x.id === 990).at = 'epidamnos';
  g.places.epidamnos.owner = 'rome';
  M.ui.sel = { kind: 'place', id: 'tarentum' }; M.look('tarentum', 2.4)`);
await evaluate(`(() => { const M = window.MareNostrum; ${D({ do: "lang", lang: "en" })}; return true; })()`);

for (const line of log) console.log("  " + line);
console.log(bad ? `${bad} HATA` : "konsol temiz");
clearTimeout(watchdog);
killTree(browser, profile);
process.exit(bad ? 1 : 0);
