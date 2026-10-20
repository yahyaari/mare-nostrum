// Arayüzün tuğlaları: renkler, panel, düğme, yazı, küçük simgeler. Hepsi CSS pikseliyle.
//
// Düğmeler çizilirken `boxes` listesine bir kutu bırakır: { x, y, w, h, act }. Girdi bir
// basışı bu kutulara bakarak çözer; `act` null olan kutu basışı yutar (panelin boş yeri
// haritaya geçmesin diye).

import { CIVS, FREE_COLOR } from "../data/world.js";

export const INK = {
  ink: "#2b2a27",
  soft: "#6d665b",
  faint: "#a39a8b",
  paper: "#efe8d8",
  card: "#f7f2e7",
  sea: "#d6dfdc",
  ripple: "#a7b9b6",
  river: "#86a4a9",
  road: "#86765e",
  lane: "#5c838c",
  border: "#c4b598",
  good: "#3f7a37",
  warn: "#b07a12",
  bad: "#a8322a",
};
export const SERIF = 'Georgia, "Times New Roman", serif';
export const TAU = Math.PI * 2;

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

export function panel(ctx, x, y, w, h, boxes = null) {
  ctx.fillStyle = INK.card;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.lineWidth = 0.75;
  ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
  if (boxes) boxes.push({ x, y, w, h, act: null });
}

export function text(ctx, s, x, y, o = {}) {
  ctx.font = `${o.italic ? "italic " : ""}${o.bold ? "bold " : ""}${o.size ?? 13}px ${SERIF}`;
  ctx.fillStyle = o.color ?? INK.ink;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = o.base ?? "alphabetic";
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

export function measure(ctx, s, o = {}) {
  ctx.font = `${o.italic ? "italic " : ""}${o.bold ? "bold " : ""}${o.size ?? 13}px ${SERIF}`;
  return ctx.measureText(s).width;
}

export function wrap(ctx, s, width, o = {}) {
  ctx.font = `${o.italic ? "italic " : ""}${o.bold ? "bold " : ""}${o.size ?? 13}px ${SERIF}`;
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

/**
 * Düğme. `b`: { x, y, w, h, label, act, off, main, size, sub }.
 * `off` (kapalı) düğme basılmaz ama basışı yutar. `main` dolu mürekkep. `sub` ikinci satır.
 */
export function button(ctx, boxes, b) {
  const { x, y, w, h } = b;
  ctx.fillStyle = b.off ? INK.paper : b.main ? INK.ink : INK.card;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = b.off ? INK.faint : INK.ink;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const color = b.off ? INK.faint : b.main ? INK.card : INK.ink;
  const size = b.size ?? 13;
  if (b.sub) {
    text(ctx, b.label, x + w / 2, y + h / 2 - 3, { bold: true, size, color, align: "center" });
    b.sub(x + w / 2, y + h / 2 + 12, color);
  } else {
    text(ctx, b.label, x + w / 2, y + h / 2 + 1, { bold: true, size, color, align: "center", base: "middle" });
  }
  boxes.push({ x, y, w, h, act: b.off ? null : b.act });
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
  ctx.font = `${size}px ${SERIF}`;
  const widths = parts.map((k) => size + 3 + ctx.measureText(String(cost[k])).width);
  const total = widths.reduce((a, b) => a + b, 0) + (parts.length - 1) * 8;
  let x = cx - total / 2;
  parts.forEach((k, i) => {
    amount(ctx, k, cost[k], x, y, { size, color });
    x += widths[i] + 8;
  });
}
