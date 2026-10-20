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

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

const browser = spawn(EDGE, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), "mn-peek-" + Date.now())}`,
  `--window-size=${W},${H}`, "--no-first-run", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
let bad = 0;
const watchdog = setTimeout(() => { console.log("ZAMAN AŞIMI"); browser.kill(); process.exit(2); }, 90000);

let target;
for (let i = 0; i < 60 && !target; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === "page");
  } catch { /* hazır değil */ }
  if (!target) await sleep(200);
}
if (!target) { console.log("EDGE AÇILMADI"); browser.kill(); process.exit(2); }

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
  browser.kill();
  process.exit(3);
}

await shot("01_genel", "M.setLang('en'); M.select(null); M.overview()");
await shot("02_yunanistan", "M.look('athens', 4)");
await shot("03_italya_secili", "M.look('rome', 3); M.select('rome')");
await shot("04_dogu", "M.select(null); M.look('babylon', 2.2)");
await shot("05_misir_tr", "M.setLang('tr'); M.look('alexandria', 3); M.select('alexandria')");
await shot("06_karadeniz_tr", "M.select('neapolis'); M.look('neapolis', 2.5)");
await shot("07_en_yakin", "M.select(null); M.look('corinth', 99)");
await evaluate("window.MareNostrum.setLang('en')");

for (const line of log) console.log("  " + line);
console.log(bad ? `${bad} HATA` : "konsol temiz");
clearTimeout(watchdog);
browser.kill();
process.exit(bad ? 1 : 0);
