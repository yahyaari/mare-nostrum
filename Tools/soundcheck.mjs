// Seslerin gerçekten ses ürettiğini ölçer: çevrimdışı bir ses bağlamına çaldırır, dalgaya bakar.
//   node Tools/soundcheck.mjs     (önce: node Tools/serve.mjs . 8060)
import { open } from "./edge.mjs";

const run = async (label, body) => {
  const p = await open("http://localhost:8060/?seed=1", 800, 600);
  const out = await p.evaluate(`(async () => {
    const off = new OfflineAudioContext(1, 44100 * 4, 44100);
    off.resume = () => Promise.resolve();
    window.AudioContext = function () { return off; };
    const S = await import("./src/view/sound.js?" + Math.random());
    ${body}
    const buf = await off.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0, sum = 0, nan = 0;
    for (const v of d) { if (Number.isNaN(v)) nan++; peak = Math.max(peak, Math.abs(v)); sum += v * v; }
    const win = [];
    for (let w = 0; w < 8; w++) { let s = 0; for (let i = w * 22050; i < (w + 1) * 22050; i++) s += d[i] * d[i]; win.push(Math.sqrt(s / 22050).toFixed(3)); }
    return { peak: peak.toFixed(3), rms: Math.sqrt(sum / d.length).toFixed(4), nan, win: win.join(" ") };
  })()`);
  console.log(label.padEnd(10), JSON.stringify(out), p.errors ? "HATA " + p.log.join(" | ") : "temiz");
  p.close();
};

await run("sessiz", `S.setMusic(false); S.wake();`);
await run("efektler", `S.setMusic(false); S.wake(); S.click(); S.build(); S.recruit(); S.muster(); S.launch(); S.march(2); S.row(2); S.clash(); S.horn(true); S.turnCall(); S.victory(); S.chime(); S.scroll(); S.war(); S.cheer(); S.defeat();`);
await run("kapalı", `S.setMusic(false); S.setSound(false); S.wake(); S.clash(); S.build(); S.victory();`);
await run("müzik", `S.setSound(false); S.setMusic(true); S.wake();`);
await run("savaş", `S.setSound(false); S.setMusic(true); S.setMood("war"); S.wake();`);
process.exit(0);
