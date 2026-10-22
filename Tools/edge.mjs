// Başsız Edge'i açıp oyunla konuşan küçük kapı (Chrome DevTools Protocol). peek.mjs ve
// playtest.mjs bunu kullanır. Paket yok: Node'un kendi fetch ve WebSocket'i.

import { spawn, spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

export async function open(url, W = 1280, H = 720) {
  const phone = H > W;
  const port = 9500 + (process.pid % 300);
  const profile = join(tmpdir(), "mn-edge-" + Date.now() + "-" + process.pid);
  const browser = spawn(EDGE, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`, "--no-first-run", "about:blank",
  ], { stdio: "ignore" });
  process.on("exit", () => killTree(browser, profile));

  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch { /* hazır değil */ }
    if (!target) await sleep(200);
  }
  if (!target) { killTree(browser, profile); throw new Error("Edge açılmadı"); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  const log = [];
  let errors = 0, nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === "Runtime.consoleAPICalled") {
      log.push(`[${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
      if (m.params.type === "error") errors++;
    } else if (m.method === "Runtime.exceptionThrown") {
      log.push(`[exception] ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
      errors++;
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => reject(new Error(`${method} cevap vermedi`)), 180000);
    pending.set(id, (m) => { clearTimeout(timer); resolve(m); });
    ws.send(JSON.stringify({ id, method, params }));
  });

  /** Sayfada bir ifade. Patlarsa susmaz: istisna fırlatır. */
  const evaluate = async (e) => {
    const r = (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result;
    if (r?.exceptionDetails) {
      const why = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text;
      log.push(`[exception] ${why}`);
      errors++;
      throw new Error(why);
    }
    return r?.result?.value;
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: phone ? 2 : 1, mobile: phone });
  await send("Page.navigate", { url });
  const ready = () => log.some((l) => l.includes("[MareNostrum] ready"));
  for (let t = Date.now(); Date.now() - t < 20000 && !ready();) await sleep(150);
  if (!ready()) { killTree(browser, profile); throw new Error("OYUN AÇILMADI: " + url + "\n" + log.join("\n")); }

  return {
    log, evaluate,
    get errors() { return errors; },
    async shot(dir, name) {
      await sleep(120);
      const r = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(dir, name + ".png"), Buffer.from(r.result.data, "base64"));
    },
    /** Sayfayı yeniden yükle ve oyunun yeniden açılmasını bekle (kayıttan dönüşü sınamak için). */
    async reload() {
      const before = log.filter((l) => l.includes("[MareNostrum] ready")).length;
      await send("Page.reload");
      for (let t = Date.now(); Date.now() - t < 20000;) {
        if (log.filter((l) => l.includes("[MareNostrum] ready")).length > before) return;
        await sleep(150);
      }
      throw new Error("yeniden yükleme açılmadı");
    },
    close() { try { ws.close(); } catch { /* */ } killTree(browser, profile); },
  };
}
