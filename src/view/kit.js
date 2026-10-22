// Arayüzün tuğlaları: renkler, panel, düğme, yazı, küçük simgeler. Hepsi CSS pikseliyle.
//
// Düğmeler çizilirken `boxes` listesine bir kutu bırakır: { x, y, w, h, act }. Girdi bir
// basışı bu kutulara bakarak çözer; `act` null olan kutu basışı yutar (panelin boş yeri
// haritaya geçmesin diye).

import { CIVS, FREE_COLOR } from "../data/world.js";

export const INK = {
  ink: "#2b2118",
  soft: "#6b5a44",
  faint: "#a8977a",
  paper: "#e3d3ae",
  card: "#f1e5c8",
  sea: "#d6dfdc",
  ripple: "#a7b9b6",
  river: "#86a4a9",
  road: "#86765e",
  lane: "#3f6f7c",
  border: "#b9a27a",
  good: "#3f7a37",
  warn: "#a87410",
  bad: "#a8322a",
};
// Yazı: EB Garamond (index.html, Google Fonts), gelmezse Georgia. Garamond aynı piksel
// boyunda Georgia'dan küçük duruyor; boylar FONT_K ile büyütülür ki eski yerleşim tutsun.
export const SERIF = '"EB Garamond", Georgia, "Times New Roman", serif';
export const TITLE_FONT = '"Cinzel", Georgia, serif';
const FONT_K = 1.12;
export const TAU = Math.PI * 2;

/** Farenin ekrandaki yeri ve basılı mı (main.js günceller): üstüne gelinen düğme parlar, basılan çöker. */
export const pointer = { x: -1, y: -1, down: false };
export const over = (x, y, w, h) => pointer.x >= x && pointer.x <= x + w && pointer.y >= y && pointer.y <= y + h;

const civ = Object.fromEntries(CIVS.map((c) => [c.id, c]));
export const colorOf = (owner) => (owner ? civ[owner].color : FREE_COLOR);
export const civName = (owner, lang, freeText) => (owner ? civ[owner].name[lang] : freeText);

/** 12.3 -> "12", +2.5 -> "+2.5", -1 -> "−1". */
export const fmt = (n) => String(Math.floor(n + 1e-9));
export function delta(n) {
  const r = Math.round(n * 10) / 10;
  const s = Number.isInteger(r) ? String(Math.abs(r)) : Math.abs(r).toFixed(1);
  return (r < 0 ? "−" : "+") + s;
}

// ---- parşömen ----
//
// Kâğıdın dokusu bir kere, 256 piksellik bir karoya çizilir (rastgele benekler ve büyük, soluk
// lekeler) ve desen olarak kullanılır. Rastgelelik sabit tohumlu: her açılışta aynı kâğıt.

let grain = null;
function parchment(ctx) {
  if (grain) return grain;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = INK.card;
  g.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = 30 + rnd() * 70;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(150,115,60,${0.04 + rnd() * 0.05})`);
    rg.addColorStop(1, "rgba(150,115,60,0)");
    g.fillStyle = rg;
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { g.save(); g.translate(dx, dy); g.fillRect(x - r, y - r, 2 * r, 2 * r); g.restore(); }
  }
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(90,65,30,${rnd() * 0.07})` : `rgba(255,250,235,${rnd() * 0.12})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  grain = ctx.createPattern(c, "repeat");
  return grain;
}

/**
 * Parşömen panel: gölgesi, dokulu kâğıdı, kenarlarına doğru koyulaşan rengi, koyu bir dış
 * çerçeve ve içinde altın bir çizgi, köşelerde küçük baklavalar.
 */
export function panel(ctx, x, y, w, h, boxes = null) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = INK.card;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = parchment(ctx);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  // Kenarlar: içe doğru solan koyu bir şerit.
  const e = 22;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
    [x, 0, x + e, 0, x, y, e, h], [x + w, 0, x + w - e, 0, x + w - e, y, e, h],
    [0, y, 0, y + e, x, y, w, e], [0, y + h, 0, y + h - e, x, y + h - e, w, e],
  ]) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(120,85,40,0.2)");
    g.addColorStop(1, "rgba(120,85,40,0)");
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  }
  ctx.strokeStyle = "#2a2016";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  ctx.strokeStyle = "#b48d48";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11);
  for (const [cx, cy] of [[x + 5.5, y + 5.5], [x + w - 5.5, y + 5.5], [x + 5.5, y + h - 5.5], [x + w - 5.5, y + h - 5.5]]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4);
    ctx.lineTo(cx + 4, cy);
    ctx.lineTo(cx, cy + 4);
    ctx.lineTo(cx - 4, cy);
    ctx.closePath();
    ctx.fillStyle = "#b48d48";
    ctx.fill();
    ctx.strokeStyle = "#2a2016";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  if (boxes) boxes.push({ x, y, w, h, act: null });
}

const fontOf = (o) => o.title
  ? `${o.bold ? 700 : 600} ${o.size ?? 13}px ${TITLE_FONT}`
  : `${o.italic ? "italic " : ""}${o.bold ? "600 " : ""}${Math.round((o.size ?? 13) * FONT_K * 10) / 10}px ${SERIF}`;

/** Yazı. `o`: size, bold, italic, color, align, base; `title` Cinzel ile (başlıklar). */
export function text(ctx, s, x, y, o = {}) {
  ctx.font = fontOf(o);
  ctx.fillStyle = o.color ?? INK.ink;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = o.base ?? "alphabetic";
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

export function measure(ctx, s, o = {}) {
  ctx.font = fontOf(o);
  return ctx.measureText(s).width;
}

export function wrap(ctx, s, width, o = {}) {
  ctx.font = fontOf(o);
  const lines = [];
  let line = "";
  for (const word of s.split(" ")) {
    const next = line ? line + " " + word : word;
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Düğme. `b`: { x, y, w, h, label, act, off, main, size, sub, tip }.
 * `off` (kapalı) düğme basılmaz ama basışı yutar. `main` koyu, altın çerçeveli (asıl eylem).
 * `sub` ikinci satır. Ötekiler açık kâğıt, kahve çerçeveli, hafif kabarık. Basılı tutulan
 * düğme bir piksel aşağı iner ve koyulaşır (kullanıcı 22.10: "tepki az"). `tip`: üstüne
 * gelince çıkan açıklama (kapalı düğmede de: neden kapalı olduğunu söyler).
 */
export function button(ctx, boxes, b) {
  const hot = !b.off && over(b.x, b.y, b.w, b.h);
  const down = hot && pointer.down;
  const { x, w, h } = b, y = b.y + (down ? 1 : 0);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  if (b.off) { g.addColorStop(0, "rgba(226,212,178,0.75)"); g.addColorStop(1, "rgba(214,198,160,0.75)"); }
  else if (b.main) { g.addColorStop(0, down ? "#241c14" : hot ? "#54432f" : "#3a2e22"); g.addColorStop(1, down ? "#3a2e22" : hot ? "#241c14" : "#17120d"); }
  else { g.addColorStop(0, down ? "#e4d3ab" : hot ? "#fffbf0" : "#fbf3df"); g.addColorStop(1, down ? "#f5ead0" : hot ? "#efe0bb" : "#e4d3ab"); }
  rounded(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 3);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = b.off ? "rgba(140,120,90,0.55)" : b.main ? (hot ? "#ecd49a" : "#c9a45a") : hot ? "#a87f3a" : "#5a4630";
  ctx.lineWidth = b.main ? 1.6 : 1.2;
  ctx.stroke();
  if (!b.off && !down) {
    // İçte ince bir çizgi: kabarık dursun (basılıyken çökük).
    rounded(ctx, x + 2.5, y + 2.5, w - 5, h - 5, 2);
    ctx.strokeStyle = b.main ? "rgba(201,164,90,0.35)" : "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const color = b.off ? INK.faint : b.main ? "#f3e7c9" : INK.ink;
  const size = b.size ?? 13;
  if (b.sub) {
    text(ctx, b.label, x + w / 2, y + h / 2 - 3, { bold: true, size, color, align: "center" });
    b.sub(x + w / 2, y + h / 2 + 12, color);
  } else {
    text(ctx, b.label, x + w / 2, y + h / 2 + 1, { bold: true, size, color, align: "center", base: "middle" });
  }
  boxes.push({ x, y: b.y, w, h, act: b.off ? null : b.act, tip: b.tip, want: b.act });
}

// ---- simgeler: para, silah, yiyecek, nüfus ----

export function icon(ctx, kind, x, y, s = 14, color = INK.ink) {
  const k = s / 14;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (kind === "money") {
    ctx.arc(7, 7, 6, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(7, 7, 3, 0, TAU);
    ctx.stroke();
  } else if (kind === "weapons") {
    ctx.moveTo(2, 12);
    ctx.lineTo(12, 2);
    ctx.moveTo(3.5, 7.5);
    ctx.lineTo(6.5, 10.5);
    ctx.moveTo(1.5, 12.5);
    ctx.lineTo(3, 11);
    ctx.lineWidth = 1.8;
    ctx.stroke();
  } else if (kind === "food") {
    ctx.moveTo(7, 13);
    ctx.lineTo(7, 2);
    for (const yy of [4, 7, 10]) {
      ctx.moveTo(7, yy + 1.5);
      ctx.quadraticCurveTo(4, yy + 1, 3.5, yy - 1.5);
      ctx.moveTo(7, yy + 1.5);
      ctx.quadraticCurveTo(10, yy + 1, 10.5, yy - 1.5);
    }
    ctx.stroke();
  } else if (kind === "pop") {
    ctx.arc(7, 4, 2.6, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(2.5, 13);
    ctx.quadraticCurveTo(2.5, 7.5, 7, 7.5);
    ctx.quadraticCurveTo(11.5, 7.5, 11.5, 13);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Simge + sayı yan yana; genişliği döndürür. */
export function amount(ctx, kind, n, x, y, o = {}) {
  const s = o.size ?? 13;
  icon(ctx, kind, x, y - s + 2, s, o.color ?? INK.ink);
  return s + 3 + text(ctx, String(n), x + s + 3, y, { bold: o.bold, size: s, color: o.color });
}

/** Bir maliyeti (para/silah/yiyecek) simgelerle, ortalanmış çizer. */
export function costLine(ctx, cost, cx, y, color, size = 11) {
  const parts = ["money", "weapons", "food"].filter((k) => cost[k] > 0);
  const widths = parts.map((k) => size + 3 + measure(ctx, String(cost[k]), { size }));
  const total = widths.reduce((a, b) => a + b, 0) + (parts.length - 1) * 8;
  let x = cx - total / 2;
  parts.forEach((k, i) => {
    amount(ctx, k, cost[k], x, y, { size, color });
    x += widths[i] + 8;
  });
}
