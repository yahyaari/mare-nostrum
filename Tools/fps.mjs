// Kamera hareket ederken kare süreleri ve katmanın kaç kez yeniden çizildiği (kullanıcı 22.10:
// "kamera hızlı hareket ederken fps düşüyor"). Önce sunucu: node Tools/serve.mjs . 8060
//
//   node Tools/fps.mjs [genişlik] [yükseklik]
//
// (1) başlangıç ekranında medeniyet değişince kayma,
// (2) oyunda fare tekerleğiyle sürekli yakınlaşma, (3) oyunda sürükleyerek kaydırma.
import { open } from "./edge.mjs";

const [W = "1920", H = "1080"] = process.argv.slice(2);
const page = await open("http://localhost:8060/?lang=tr&seed=5", Number(W), Number(H));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Sayfada: `act` her karede çalışır, `ms` boyunca kare aralıkları ölçülür.
const measure = (act, ms) => page.evaluate(`new Promise((done) => {
  const M = window.MareNostrum, gaps = []; window.__r0 = window.__rebuilds ?? 0; let last = performance.now(); const t0 = last; let i = 0;
  const step = (t) => { gaps.push(t - last); last = t; (${act})(i++); if (t - t0 < ${ms}) requestAnimationFrame(step); else {
    gaps.shift(); gaps.sort((a, b) => a - b);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    done({ rebuilds: (window.__rebuilds ?? 0) - (window.__r0 ?? 0), frames: gaps.length, avg: Math.round(avg * 10) / 10, p90: Math.round(gaps[Math.floor(gaps.length * 0.9)]), max: Math.round(gaps[gaps.length - 1]) });
  } };
  requestAnimationFrame(step);
})`);
try {
  await wait(2500);
  const civs = ["egypt", "gaul", "parthia", "rome"];
  const glide = [];
  for (const c of civs) {
    glide.push(await measure(`(i) => { if (i === 0) M.dispatch({ do: "pick", civ: "${c}" }); }`, 1100));
  }
  console.log("medeniyet değişimi (kayma):", JSON.stringify(glide));
  await page.evaluate(`(() => { const M = window.MareNostrum; M.dispatch({ do: "pick", civ: "rome" }); M.dispatch({ do: "start" }); M.dispatch({ do: "close" }); })()`);
  await wait(1500);
  const zoomIn = await measure(`() => window.dispatchEvent(new WheelEvent("wheel", { deltaY: -25, clientX: ${Number(W) / 2}, clientY: ${Number(H) / 2}, cancelable: true }))`, 1200);
  const zoomOut = await measure(`() => window.dispatchEvent(new WheelEvent("wheel", { deltaY: 25, clientX: ${Number(W) / 2}, clientY: ${Number(H) / 2}, cancelable: true }))`, 1200);
  console.log("tekerlekle yakınlaşma:", JSON.stringify(zoomIn), " uzaklaşma:", JSON.stringify(zoomOut));
  const pan = await measure(`(i) => { M.cam.x += 0.15; M.redraw(); }`, 1200);
  console.log("kaydırma:", JSON.stringify(pan));
  const idle = await measure(`() => {}`, 1000);
  console.log("boşta:", JSON.stringify(idle));
  if (page.errors) console.log("HATA", page.log.slice(-5).join("\n"));
} finally {
  page.close();
}
