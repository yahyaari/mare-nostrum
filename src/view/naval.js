// Deniz savaşının sahası (rules/naval.js; kurallar.md bölüm 29h): tepeden deniz, kayalık adacıklar, gemiler. Her gemi
// boyuyla: ahşap gövde, burnunda tunç mahmuz, iki yanında kürekler (yürürken çekilir), ortada sahibinin renginde
// yelken, güvertede tayfa noktaları; arkasında hızı kadar köpüklü iz. Kancalı gemiler arasında halatlar; batan gemi
// yavaşça kaybolur, ele geçen gemi soluk ve sancağı düşmüş. Üstünde rozet: tür, tayfa, gövde çubuğu.

import { hullOf, shipMorale } from "../rules/naval.js";
import { CREAM, DARK, GOLD_LIGHT, roundRect, shade } from "./pieces.js";
import { TAU, colorOf, text } from "./kit.js";

let sea = null; // { key, canvas }

/** Denizin önbellek resmi: derinden sığa koyu mavi, dalga çizgileri, adacıklar. */
function seaLayer(f, b, dpr) {
  const key = `${Math.round(f.w)}|${Math.round(f.h)}|${dpr}|${b.seed}`;
  if (sea?.key === key) return sea.canvas;
  const c = document.createElement("canvas");
  c.width = Math.round(f.w * dpr);
  c.height = Math.round(f.h * dpr);
  const g = c.getContext("2d");
  g.scale(dpr, dpr);
  const grad = g.createLinearGradient(0, 0, f.w, f.h);
  grad.addColorStop(0, "#2f5f78");
  grad.addColorStop(0.5, "#26506a");
  grad.addColorStop(1, "#1d4258");
  g.fillStyle = grad;
  g.fillRect(0, 0, f.w, f.h);
  // Dalgalar: kısa, kıvrık çizgiler.
  g.strokeStyle = "rgba(220,235,240,0.12)";
  g.lineWidth = 1.2;
  for (let i = 0; i < 260; i++) {
    const x = ((i * 0.6180339) % 1) * f.w, y = ((i * 0.41421356) % 1) * f.h, l = 6 + (i % 5) * 3;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + l / 2, y - 2.5, x + l, y);
    g.stroke();
  }
  // Adacıklar: sığlık, kum, kaya, biraz yeşil.
  for (const is of b.field.islands) {
    const x = is.x * f.k, y = is.y * f.k, r = is.r * f.k;
    const s = g.createRadialGradient(x, y, r * 0.6, x, y, r * 1.9);
    s.addColorStop(0, "rgba(120,170,170,0.55)");
    s.addColorStop(1, "rgba(120,170,170,0)");
    g.fillStyle = s;
    g.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    g.fillStyle = "#d8c690";
    g.beginPath();
    g.ellipse(x, y, r * 1.05, r * 0.9, 0.4, 0, TAU);
    g.fill();
    g.fillStyle = "#8a8070";
    g.beginPath();
    g.ellipse(x - r * 0.15, y - r * 0.1, r * 0.75, r * 0.6, 0.6, 0, TAU);
    g.fill();
    g.fillStyle = "#6a7a4a";
    g.beginPath();
    g.ellipse(x + r * 0.2, y + r * 0.1, r * 0.4, r * 0.32, 0, 0, TAU);
    g.fill();
  }
  sea = { key, canvas: c };
  return c;
}

/** Deniz savaşının sahası: deniz, izler, gemiler, halatlar, oklar, çarpma ve batma izleri, rozetler. */
export function drawNavalField(ctx, f, B, T, now) {
  const b = B.b, dpr = ctx.getTransform().a;
  ctx.drawImage(seaLayer(f, b, dpr), f.x, f.y, f.w, f.h);
  const s = now / 1000;
  const P = (x, y) => ({ x: f.x + x * f.k, y: f.y + y * f.k });
  // İzler (gemilerin altında).
  for (const u of b.units) {
    if (u.dead || u.gone || u.v < 0.4) continue;
    const H = hullOf(u), c = Math.cos(u.facing), sn = Math.sin(u.facing), k = Math.min(1, u.v / 7);
    const tail = P(u.x - c * H.len / 2, u.y - sn * H.len / 2);
    ctx.strokeStyle = `rgba(235,245,248,${0.35 * k})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(tail.x - (c * 10 + side * sn * 4) * k * f.k * 0.6, tail.y - (sn * 10 - side * c * 4) * k * f.k * 0.6);
    }
    ctx.stroke();
  }
  // Kancalar: halatlar.
  ctx.strokeStyle = "rgba(60,44,26,0.9)";
  ctx.lineWidth = 1.2;
  for (const u of b.units) {
    if (!u.grapple || u.dead) continue;
    const v = b.units.find((x) => x.id === u.grapple);
    if (!v || v.id < u.id) continue;
    const a = P(u.x, u.y), c = P(v.x, v.y);
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) { ctx.moveTo(a.x + i * 4, a.y - i * 3); ctx.lineTo(c.x + i * 4, c.y - i * 3); }
    ctx.stroke();
  }
  for (const u of [...b.units].sort((a, c) => (a.dead ? 0 : 1) - (c.dead ? 0 : 1))) ship(ctx, f, B, u, s);
  // Oklar.
  for (const sh of b.shots) {
    const k = Math.max(0, Math.min(1, (b.t - sh.t0) / (sh.t1 - sh.t0)));
    const t = b.units.find((v) => v.id === sh.to) ?? sh.at;
    const x = sh.from.x + (t.x - sh.from.x) * k, y = sh.from.y + (t.y - sh.from.y) * k - Math.sin(k * Math.PI) * 4;
    const p = P(x, y);
    ctx.strokeStyle = "rgba(30,24,18,0.75)";
    ctx.lineWidth = 1;
    for (let i = 0; i < sh.n; i++) {
      const ox = ((i * 7) % 5 - 2) * 1.6, oy = ((i * 3) % 5 - 2) * 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x + ox, p.y + oy);
      ctx.lineTo(p.x + ox - 4, p.y + oy - 1);
      ctx.stroke();
    }
  }
  // Çarpma: köpük ve kıymıklar; batma: halkalar.
  for (const e of b.fx) {
    const age = b.t - e.t, p = P(e.x, e.y);
    if (e.kind === "ram") {
      const a = Math.max(0, 1 - age / 1.2);
      ctx.fillStyle = `rgba(240,248,250,${0.7 * a})`;
      for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(p.x + Math.cos(i * 0.7) * (4 + age * 20), p.y + Math.sin(i * 0.7) * (4 + age * 20), 2 * a + 0.5, 0, TAU); ctx.fill(); }
    } else if (e.kind === "sink") {
      const a = Math.max(0, 1 - age / 3);
      ctx.strokeStyle = `rgba(220,235,240,${0.6 * a})`;
      ctx.lineWidth = 1.5;
      for (const r of [1, 2]) { ctx.beginPath(); ctx.arc(p.x, p.y, (age * 8 + r * 6) * f.k * 0.3, 0, TAU); ctx.stroke(); }
    }
  }
  for (const u of b.units) if (!u.dead && !u.gone) badge(ctx, f, B, u);
}

/** Bir gemi: gövde, mahmuz, kürekler, yelken, tayfa; batıyorsa solar, ele geçtiyse soluk. */
function ship(ctx, f, B, u, s) {
  if (u.gone) return;
  const H = hullOf(u), b = B.b;
  const sinking = u.dead ? Math.min(1, (b.t - (u.sankAt ?? b.t)) / 3) : 0;
  if (sinking >= 1) return;
  const p = { x: f.x + u.x * f.k, y: f.y + u.y * f.k }, L = H.len * f.k, W = H.beam * f.k;
  const color = colorOf(B.owners[u.side]);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(u.facing + (u.dead ? sinking * 0.5 : 0));
  ctx.globalAlpha = (1 - sinking) * (u.taken ? 0.7 : u.routed ? 0.8 : 1);
  if (B.sel.has(u.id)) {
    ctx.strokeStyle = GOLD_LIGHT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, L / 2 + 5, W / 2 + 5, 0, 0, TAU);
    ctx.stroke();
  }
  // Kürekler: iki yanda, yürürken çekilir.
  const oars = u.type === "quinq" ? 9 : u.type === "trireme" ? 8 : 6, stroke = Math.sin(s * 5 + u.id) * (u.v > 0.4 && !u.dead ? 0.5 : 0.1);
  ctx.strokeStyle = "#4a3420";
  ctx.lineWidth = Math.max(0.8, f.k * 0.12);
  ctx.beginPath();
  for (let i = 0; i < oars; i++) {
    const ox = -L * 0.32 + (i / (oars - 1)) * L * 0.6;
    for (const side of [-1, 1]) { ctx.moveTo(ox, side * W * 0.45); ctx.lineTo(ox - stroke * W * 0.6, side * W * 1.15); }
  }
  ctx.stroke();
  // Gövde: sivri burun, yuvarlak kıç.
  ctx.beginPath();
  ctx.moveTo(L / 2, 0);
  ctx.quadraticCurveTo(L * 0.3, -W / 2, -L * 0.25, -W / 2);
  ctx.quadraticCurveTo(-L / 2, -W / 2, -L / 2, 0);
  ctx.quadraticCurveTo(-L / 2, W / 2, -L * 0.25, W / 2);
  ctx.quadraticCurveTo(L * 0.3, W / 2, L / 2, 0);
  const wound = 1 - u.hull / u.hullMax;
  ctx.fillStyle = shade("#8a5a32", -0.35 * wound);
  ctx.fill();
  ctx.strokeStyle = "#3a2614";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Güverte çizgisi ve sahibinin renginde şerit.
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, W * 0.14);
  ctx.beginPath();
  ctx.moveTo(L * 0.32, 0);
  ctx.lineTo(-L * 0.42, 0);
  ctx.stroke();
  // Mahmuz.
  ctx.fillStyle = "#b08a3a";
  ctx.beginPath();
  ctx.moveTo(L / 2 + L * 0.08, 0);
  ctx.lineTo(L / 2 - L * 0.04, -W * 0.14);
  ctx.lineTo(L / 2 - L * 0.04, W * 0.14);
  ctx.fill();
  // Tayfa: güvertede noktalar (her 6 asker bir).
  const n = Math.min(24, Math.ceil(u.men / 6));
  ctx.fillStyle = shade(color, 0.25);
  for (let i = 0; i < n; i++) {
    const row = i % 2, col = Math.floor(i / 2), cols = Math.ceil(n / 2);
    ctx.beginPath();
    ctx.arc(-L * 0.3 + (col + 0.5) * (L * 0.55 / cols), (row ? 1 : -1) * W * 0.18, Math.max(1, W * 0.1), 0, TAU);
    ctx.fill();
  }
  // Yelken: ortada, sahibinin renginde (ele geçende düşük).
  if (!u.taken) {
    ctx.fillStyle = shade(color, 0.15);
    ctx.strokeStyle = "rgba(30,20,10,0.8)";
    ctx.lineWidth = 1;
    roundRect(ctx, -L * 0.06, -W * 0.85, L * 0.12, W * 1.7, 1.5);
    ctx.fill();
    ctx.stroke();
  }
  // Delik gövde: duman.
  if (wound > 0.5 && !u.dead) {
    ctx.fillStyle = `rgba(40,36,32,${0.3 + wound * 0.3})`;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-L * 0.1 + i * 3, -W * 0.3 - i * 3 - (s * 6 % 6), 2 + i, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}

/** Rozet: tür simgesi, tayfa, gövde çubuğu (yeşil -> kızıl), moral rengi. */
function badge(ctx, f, B, u) {
  // Rozet geminin üstünde: gemi yatay dururken eni, dikey dururken boyu kadar yukarıda.
  const H = hullOf(u), up = Math.abs(Math.sin(u.facing)) * H.len / 2 + Math.abs(Math.cos(u.facing)) * H.beam / 2;
  const x = f.x + u.x * f.k, y = f.y + (u.y - up - 1) * f.k - 8;
  const sel = B.sel.has(u.id);
  ctx.save();
  if (u.routed || u.taken) ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, TAU);
  ctx.fillStyle = sel ? GOLD_LIGHT : colorOf(B.owners[u.side]);
  ctx.fill();
  ctx.strokeStyle = sel ? DARK : "rgba(20,14,8,0.9)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  boat(ctx, x, y, sel ? DARK : CREAM, u.type);
  const k = Math.max(0, Math.min(1, u.hull / u.hullMax)), m = Math.max(0, Math.min(1, shipMorale(u) / 100));
  ctx.fillStyle = "rgba(20,14,8,0.7)";
  ctx.fillRect(x - 12, y + 11, 24, 3.5);
  ctx.fillStyle = k > 0.5 ? "#7fb85a" : k > 0.25 ? "#d6a63a" : "#c4523a";
  ctx.fillRect(x - 12, y + 11, 24 * k, 3.5);
  ctx.fillStyle = "rgba(20,14,8,0.7)";
  ctx.fillRect(x - 12, y + 15.5, 24, 2.5);
  ctx.fillStyle = "#e8d8a8";
  ctx.fillRect(x - 12, y + 15.5, 24 * m, 2.5);
  text(ctx, u.taken ? "⚑" : u.routed ? "!" : String(Math.ceil(u.men)), x + 12, y + 4, { bold: true, size: 11, color: CREAM });
  ctx.restore();
}

/** Gemi simgesi (rozet ve kart): kayık gövde, direk; kinkeremde iki sıra kürek, triremede mahmuz. */
export function boat(ctx, x, y, color, type = "ships") {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-6, 1);
  ctx.lineTo(6, 1);
  ctx.lineTo(4, 4);
  ctx.lineTo(-4.5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.lineTo(0, -5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(4, -2);
  ctx.lineTo(0, -1);
  ctx.fill();
  if (type === "trireme") { ctx.beginPath(); ctx.moveTo(6, 2.5); ctx.lineTo(8.5, 2.5); ctx.stroke(); }
  if (type === "quinq") { ctx.beginPath(); ctx.moveTo(-5, 6); ctx.lineTo(5, 6); ctx.stroke(); }
  ctx.restore();
}
