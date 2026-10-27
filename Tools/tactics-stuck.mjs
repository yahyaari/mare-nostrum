// Takılma ölçümü (kurallar.md 29a "Takılmaz"): rastgele engelli sahalarda (kıyı, nehir, köprü) iki taraf da
// bilgisayarda; emri olan, dövüşmeyen, düşmana 10 birimden uzak bir birlik 3 sn boyunca 0.5 birimden az yürüdüyse
// "takıldı". Yol bulma ya da dizilme değişince bak.
//   node Tools/tactics-stuck.mjs   (son: 59 savaş, takılan 0, süresi dolan 0; önce 96 ve 23)
import { POS } from "../src/rules/map.js";
import { makeField } from "../src/rules/field.js";
import { setupBattle, aiOrders, step } from "../src/rules/tactics.js";
const places = Object.keys(POS);
let seed = 11;
const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const civs = ["rome", "carthage", "egypt", "macedon", "parthia", "gaul", "saka"];
let battles = 0, stuckUnits = 0, stuckSecs = 0, unitSecs = 0, timeouts = 0, offSum = 0, offN = 0;
const examples = [];
const t0 = Date.now();
for (let i = 0; i < 60; i++) {
  const p = POS[places[Math.floor(r() * places.length)]];
  const spec = { at: { x: p.x + (r() - 0.5) * 1.5, y: p.y + (r() - 0.5) * 1.5 }, dir: r() * Math.PI * 2, place: null, seed: i + 1, river: r() < 0.6 };
  const F = makeField(spec);
  if (!F.obstacles) continue;
  const a = { civ: civs[i % 7], inf: 20 + Math.round(r() * 8) * 10, arch: Math.round(r() * 4) * 10, cav: Math.round(r() * 2) * 10 };
  const d = { civ: civs[(i + 3) % 7], inf: 20 + Math.round(r() * 8) * 10, arch: Math.round(r() * 4) * 10, cav: Math.round(r() * 2) * 10 };
  const b = setupBattle(a, d, null, i + 1, F);
  battles++;
  const hist = new Map();
  let next = 0;
  const flagged = new Set();
  while (!b.over) {
    if (b.t >= next) { aiOrders(b, "att", true); aiOrders(b, "def", true); next = b.t + 0.7; }
    step(b, 0.1);
    for (const u of b.units) {
      if (u.dead || u.gone || u.routed) continue;
      const busy = u.order && !u.engaged && !(u.order.unit && u.shoot > 0);
      const h = hist.get(u.id) ?? [];
      h.push({ t: b.t, x: u.x, y: u.y, busy });
      while (h.length && b.t - h[0].t > 3) h.shift();
      hist.set(u.id, h);
      if (busy) unitSecs += 0.1;
      const pressed = b.units.some((v) => v.side !== u.side && !v.dead && !v.gone && !v.routed && Math.hypot(v.x - u.x, v.y - u.y) < 10);
      if (!pressed && h.length > 25 && h.every((q) => q.busy) && Math.hypot(h[0].x - u.x, h[0].y - u.y) < 0.5) {
        stuckSecs += 0.1;
        if (!flagged.has(u.id)) {
          flagged.add(u.id); stuckUnits++;
          const g = u.order.unit ? b.units.find((v) => v.id === u.order.unit) : u.order;
          if (examples.length < 8) examples.push(`savaş ${i} t=${b.t.toFixed(1)} ${u.side} ${u.type} (${u.x.toFixed(1)},${u.y.toFixed(1)}) hedef (${g.x.toFixed(1)},${g.y.toFixed(1)}) yol ${JSON.stringify((u.path ?? []).slice(0, 3).map((q) => [+q.x.toFixed(1), +q.y.toFixed(1)]))} march ${u.march}`);
        }
      }
    }
    if (b.t > 400) break;
  }
  if (b.over?.timeout) timeouts++;
}
console.log(`${battles} savaş, takılan birlik ${stuckUnits}, takılı süre ${stuckSecs.toFixed(0)} sn / emirli ${unitSecs.toFixed(0)} sn, süre dolan ${timeouts}, ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
for (const e of examples) console.log("  " + e);
