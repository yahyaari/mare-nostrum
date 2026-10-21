// Haritanın parçaları: armalar, direkli sancaklar, şehir/kale maketleri, isim levhaları, asker
// figürü. Hepsi ekran pikseliyle çizilir; `z` büyüklük katsayısı (uzaktan bakınca küçülürler).
//
// Kullanıcının gönderdiği Total War tarzı görselden (Docs/plan.md 2.0): her şehrin üstünde
// sahibinin renginde direkli bir sancak, altında koyu bir isim levhası. Resim kullanılmıyor,
// her şey kodla çiziliyor.

import { TAU, colorOf } from "./kit.js";

export const GOLD = "#c9a45a";
export const GOLD_DARK = "#7d5f2c";
export const GOLD_LIGHT = "#ecd49a";
export const DARK = "#1c1712";
export const CREAM = "#f3e7c9";
export const TITLE = '"Cinzel", Georgia, serif';

const STONE = "#ddd1b8", STONE_SHADE = "#a8977a", OUTLINE = "#3b3024", ROOF = "#a8563a", ROOF_DARK = "#7a3d29";

/** Rengi koyulaştır/açar: k < 0 koyu, k > 0 açık. "#rrggbb" alır. */
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

// ---- armalar ----
//
// Birim kutuda (-1..1) çizilir; `s` yarı genişlik. Küçükken de okunsun diye kalın ve sade.

const EMBLEMS = {
  // Roma: kanatlarını açmış kartal.
  rome(ctx) {
    ctx.beginPath();
    ctx.ellipse(0, 0.1, 0.2, 0.42, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -0.48, 0.17, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.12, -0.56);
    ctx.lineTo(-0.34, -0.5);
    ctx.lineTo(-0.12, -0.42);
    ctx.fill();
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(d * 0.12, -0.2);
      ctx.lineTo(d * 0.95, -0.72);
      ctx.lineTo(d * 0.86, -0.42);
      ctx.lineTo(d * 0.96, -0.36);
      ctx.lineTo(d * 0.78, -0.12);
      ctx.lineTo(d * 0.86, -0.05);
      ctx.lineTo(d * 0.6, 0.12);
      ctx.lineTo(d * 0.14, 0.15);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-0.16, 0.45);
    ctx.lineTo(0.16, 0.45);
    ctx.lineTo(0.3, 0.88);
    ctx.lineTo(-0.3, 0.88);
    ctx.closePath();
    ctx.fill();
  },
  // Kartaca: Tanit işareti.
  carthage(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -0.12);
    ctx.lineTo(0.55, 0.88);
    ctx.lineTo(-0.55, 0.88);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.17;
    ctx.beginPath();
    ctx.moveTo(-0.62, -0.42);
    ctx.lineTo(-0.62, -0.12);
    ctx.lineTo(0.62, -0.12);
    ctx.lineTo(0.62, -0.42);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -0.5, 0.26, 0, TAU);
    ctx.fill();
  },
  // Mısır: ankh.
  egypt(ctx) {
    ctx.lineWidth = 0.22;
    ctx.beginPath();
    ctx.ellipse(0, -0.46, 0.27, 0.36, 0, 0, TAU);
    ctx.moveTo(-0.62, 0.0);
    ctx.lineTo(0.62, 0.0);
    ctx.moveTo(0, -0.1);
    ctx.lineTo(0, 0.92);
    ctx.stroke();
  },
  // Makedonya: Vergina güneşi.
  macedon(ctx) {
    ctx.beginPath();
    ctx.arc(0, 0, 0.24, 0, TAU);
    ctx.fill();
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * TAU, r1 = i % 2 ? 0.7 : 0.95, w = 0.11;
      ctx.beginPath();
      ctx.moveTo(Math.cos(t - w) * 0.32, Math.sin(t - w) * 0.32);
      ctx.lineTo(Math.cos(t) * r1, Math.sin(t) * r1);
      ctx.lineTo(Math.cos(t + w) * 0.32, Math.sin(t + w) * 0.32);
      ctx.closePath();
      ctx.fill();
    }
  },
  // Partlar: yay ve ok - atlı okçuların halkı.
  parthia(ctx) {
    ctx.lineWidth = 0.17;
    ctx.beginPath();
    ctx.moveTo(-0.15, -0.85);
    ctx.quadraticCurveTo(0.85, 0, -0.15, 0.85);
    ctx.stroke();
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(-0.15, -0.85);
    ctx.lineTo(-0.15, 0.85);
    ctx.stroke();
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.moveTo(-0.85, 0);
    ctx.lineTo(0.62, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.9, 0);
    ctx.lineTo(0.55, -0.18);
    ctx.lineTo(0.55, 0.18);
    ctx.closePath();
    ctx.fill();
  },
  // Galyalılar: Taranis'in tekerleği.
  gaul(ctx) {
    ctx.lineWidth = 0.16;
    ctx.beginPath();
    ctx.arc(0, 0, 0.72, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 0.11;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * TAU;
      ctx.moveTo(Math.cos(t) * 0.2, Math.sin(t) * 0.2);
      ctx.lineTo(Math.cos(t) * 0.7, Math.sin(t) * 0.7);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 0.2, 0, TAU);
    ctx.fill();
  },
  // Sakalar: bozkırın geyiği (İskit hayvan üslubu), önden: baş ve dallı boynuzlar.
  saka(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.26, -0.2);
    ctx.lineTo(0.26, -0.2);
    ctx.lineTo(0.1, 0.62);
    ctx.lineTo(-0.1, 0.62);
    ctx.closePath();
    ctx.fill();
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(d * 0.24, -0.14);
      ctx.lineTo(d * 0.5, -0.02);
      ctx.lineTo(d * 0.3, -0.04);
      ctx.fill();
    }
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    for (const d of [-1, 1]) {
      ctx.moveTo(d * 0.14, -0.22);
      ctx.lineTo(d * 0.42, -0.62);
      ctx.lineTo(d * 0.5, -0.94);
      ctx.moveTo(d * 0.3, -0.45);
      ctx.lineTo(d * 0.72, -0.56);
      ctx.moveTo(d * 0.42, -0.62);
      ctx.lineTo(d * 0.82, -0.86);
      ctx.moveTo(d * 0.24, -0.36);
      ctx.lineTo(d * 0.15, -0.7);
    }
    ctx.stroke();
  },
  // Bağımsız: kule.
  free(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.45, 0.8);
    ctx.lineTo(-0.45, -0.5);
    ctx.lineTo(-0.25, -0.5);
    ctx.lineTo(-0.25, -0.3);
    ctx.lineTo(-0.08, -0.3);
    ctx.lineTo(-0.08, -0.5);
    ctx.lineTo(0.08, -0.5);
    ctx.lineTo(0.08, -0.3);
    ctx.lineTo(0.25, -0.3);
    ctx.lineTo(0.25, -0.5);
    ctx.lineTo(0.45, -0.5);
    ctx.lineTo(0.45, 0.8);
    ctx.closePath();
    ctx.fill();
  },
};

/** Bir medeniyetin arması, (cx, cy) ortalı, `s` yarı genişlik. */
export function emblem(ctx, owner, cx, cy, s, color = CREAM) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  (EMBLEMS[owner ?? "free"] ?? EMBLEMS.free)(ctx);
  ctx.restore();
}

// ---- sancak ----

/**
 * Direkli sancak: direğin dibi (x, y). Kumaş sahibinin renginde, ortasında arması, altı sivri.
 * `w`, `h` kumaşın boyu; direk kumaşın üstünden biraz taşar, ucunda altın bir topuz.
 */
export function banner(ctx, owner, x, y, w, h, pole, o = {}) {
  const top = y - pole;
  const color = colorOf(owner);
  // Direk
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, top - 5);
  ctx.stroke();
  ctx.strokeStyle = "#8a6a44";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 0.3, y);
  ctx.lineTo(x - 0.3, top - 5);
  ctx.stroke();
  // Çapraz çubuk
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 2.5, top);
  ctx.lineTo(x + w / 2 + 2.5, top);
  ctx.stroke();
  // Topuz
  ctx.beginPath();
  ctx.arc(x, top - 6.5, 2.4, 0, TAU);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // Kumaş: hafif dalgalı, altı sivri.
  const l = x - w / 2, r = x + w / 2, b = top + h;
  const cloth = () => {
    ctx.beginPath();
    ctx.moveTo(l, top + 1);
    ctx.lineTo(r, top + 1);
    ctx.lineTo(r, b - h * 0.2);
    ctx.lineTo(x, b);
    ctx.lineTo(l, b - h * 0.2);
    ctx.closePath();
  };
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1.5;
  ctx.shadowOffsetY = 2;
  cloth();
  const g = ctx.createLinearGradient(l, 0, r, 0);
  g.addColorStop(0, shade(color, -0.25));
  g.addColorStop(0.45, shade(color, 0.08));
  g.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  cloth();
  ctx.strokeStyle = o.gold ? GOLD : shade(color, -0.55);
  ctx.lineWidth = o.gold ? 1.6 : 1;
  ctx.stroke();
  if (o.gold) {
    // Başkent: içte ince bir altın şerit.
    ctx.beginPath();
    ctx.moveTo(l + 2.5, top + 3.5);
    ctx.lineTo(r - 2.5, top + 3.5);
    ctx.lineTo(r - 2.5, b - h * 0.2 - 1);
    ctx.lineTo(x, b - 3);
    ctx.lineTo(l + 2.5, b - h * 0.2 - 1);
    ctx.closePath();
    ctx.strokeStyle = "rgba(236,212,154,0.7)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  emblem(ctx, owner, x, top + h * 0.43, w * 0.32);
}

/**
 * Küçük kalkan: sahibinin renginde, altın kenarlı, ortasında arması. Listelerde ve kartlarda
 * renkli karenin yerine. (x, y) sol üst, `s` genişlik (boyu 1.2 katı).
 */
export function shield(ctx, owner, x, y, s) {
  const h = s * 1.2, color = colorOf(owner);
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x + s, y + h * 0.55);
    ctx.quadraticCurveTo(x + s, y + h * 0.85, x + s / 2, y + h);
    ctx.quadraticCurveTo(x, y + h * 0.85, x, y + h * 0.55);
    ctx.closePath();
  };
  path();
  const g = ctx.createLinearGradient(x, 0, x + s, 0);
  g.addColorStop(0, shade(color, -0.2));
  g.addColorStop(0.5, shade(color, 0.08));
  g.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  emblem(ctx, owner, x + s / 2, y + h * 0.45, s * 0.3);
}

/** Dünya harikası: koyu madalyon, altın halka, içinde küçük bir tapınak. */
export function wonderMark(ctx, x, y, r = 8.5) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
  g.addColorStop(0, "#4a3a26");
  g.addColorStop(1, DARK);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  const k = r / 8.5;
  ctx.fillStyle = GOLD_LIGHT;
  ctx.beginPath();
  ctx.moveTo(x - 5 * k, y - 2 * k);
  ctx.lineTo(x, y - 5.2 * k);
  ctx.lineTo(x + 5 * k, y - 2 * k);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - 5 * k, y + 3.4 * k, 10 * k, 1.4 * k);
  for (const cx of [-3.6, -1.2, 1.2, 3.6]) ctx.fillRect(x + (cx - 0.55) * k, y - 1.4 * k, 1.1 * k, 4.8 * k);
}

/** Görev hedefi: koyu madalyon, altın halka, içinde küçük bir tomar. */
export function goalMark(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 8.5, 0, TAU);
  ctx.fillStyle = DARK;
  ctx.fill();
  ctx.strokeStyle = GOLD_LIGHT;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = GOLD_LIGHT;
  ctx.fillRect(x - 3.2, y - 4, 6.4, 8);
  for (const [cx, cy] of [[x - 3.2, y - 4], [x + 3.2, y - 4], [x - 3.2, y + 4], [x + 3.2, y + 4]]) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, 1.2, 0.8, 0, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = DARK;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (const yy of [-1.8, 0.2, 2.2]) { ctx.moveTo(x - 2, y + yy); ctx.lineTo(x + 2, y + yy); }
  ctx.stroke();
}

// ---- maketler ----

function gable(ctx, x, y, w, h, roof) {
  // Önden ev: duvar ve üçgen çatı, (x, y) duvarın sol altı.
  ctx.fillStyle = STONE;
  ctx.fillRect(x, y - h, w, h);
  ctx.strokeRect(x, y - h, w, h);
  ctx.beginPath();
  ctx.moveTo(x - 1, y - h);
  ctx.lineTo(x + w / 2, y - h - w * 0.45);
  ctx.lineTo(x + w + 1, y - h);
  ctx.closePath();
  ctx.fillStyle = roof;
  ctx.fill();
  ctx.stroke();
}

function crenel(ctx, x, y, w, h, n) {
  // Mazgallı duvar parçası: (x, y) sol alt.
  const step = w / (2 * n - 1);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  for (let i = 0; i < n; i++) {
    const a = x + i * 2 * step;
    ctx.lineTo(a + step, y - h);
    if (i < n - 1) {
      ctx.lineTo(a + step, y - h + step * 0.9);
      ctx.lineTo(a + 2 * step, y - h + step * 0.9);
      ctx.lineTo(a + 2 * step, y - h);
    }
  }
  ctx.lineTo(x + w, y);
  ctx.closePath();
}

/** Şehir maketi: surların ardında evler, köşelerde kuleler. (x, y) zeminin ortası. */
export function cityModel(ctx, x, y, z, capital) {
  const k = z * (capital ? 1.2 : 1);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.lineWidth = 0.9;
  ctx.lineJoin = "miter";
  ctx.strokeStyle = OUTLINE;
  // Zemin gölgesi
  ctx.fillStyle = "rgba(20,14,8,0.32)";
  ctx.beginPath();
  ctx.ellipse(1, 1, 15, 4.5, 0, 0, TAU);
  ctx.fill();
  // Arkadaki evler (ve başkentte tapınak)
  gable(ctx, -9, -5, 6, 5, ROOF_DARK);
  gable(ctx, 2, -6, 7, 6, ROOF);
  if (capital) {
    // Tapınak: sütunlar ve alınlık
    ctx.fillStyle = "#efe6d2";
    ctx.fillRect(-4, -14, 9, 8);
    ctx.strokeRect(-4, -14, 9, 8);
    ctx.beginPath();
    for (const cx of [-2, 0.5, 3]) { ctx.moveTo(cx, -13); ctx.lineTo(cx, -6); }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, -14);
    ctx.lineTo(0.5, -17.5);
    ctx.lineTo(6, -14);
    ctx.closePath();
    ctx.fillStyle = "#efe6d2";
    ctx.fill();
    ctx.stroke();
  } else {
    gable(ctx, -3, -8, 5, 5, ROOF);
  }
  // Ön sur
  crenel(ctx, -12, 1, 24, 6, 6);
  ctx.fillStyle = STONE;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = STONE_SHADE;
  ctx.fillRect(-12, -1, 24, 2);
  // Kapı
  ctx.beginPath();
  ctx.moveTo(-2, 1);
  ctx.lineTo(-2, -2.5);
  ctx.arc(0, -2.5, 2, Math.PI, 0);
  ctx.lineTo(2, 1);
  ctx.fillStyle = "#4a3a28";
  ctx.fill();
  // Köşe kuleleri
  for (const tx of [-14, 10]) {
    crenel(ctx, tx, 1.5, 4.5, 10, 2);
    ctx.fillStyle = STONE;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = STONE_SHADE;
    ctx.fillRect(tx + 3, -8, 1.5, 9.5);
  }
  ctx.restore();
}

/** Kale maketi: yüksek bir burç ve yanında alçak bir kule. */
export function castleModel(ctx, x, y, z) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(z, z);
  ctx.lineWidth = 0.9;
  ctx.lineJoin = "miter";
  ctx.strokeStyle = OUTLINE;
  ctx.fillStyle = "rgba(20,14,8,0.32)";
  ctx.beginPath();
  ctx.ellipse(1, 1, 11, 3.8, 0, 0, TAU);
  ctx.fill();
  crenel(ctx, -3, 1, 10, 9, 3);
  ctx.fillStyle = STONE;
  ctx.fill();
  ctx.stroke();
  crenel(ctx, -8, 1, 8, 15, 3);
  ctx.fillStyle = STONE;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = STONE_SHADE;
  ctx.fillRect(-2.2, -12.5, 2.2, 13.5);
  ctx.fillStyle = "#4a3a28";
  ctx.fillRect(-5.5, -8, 1.6, 2.6);
  ctx.fillRect(2, -3.5, 2, 4.5);
  ctx.restore();
}

// ---- isim levhası ----

/**
 * Koyu, altın çerçeveli levha; (x, y) üst ortası. Başkentte iki yanda küçük birer baklava.
 * Dönen: kutusu.
 */
export function plaque(ctx, label, x, y, o = {}) {
  const size = o.size ?? 11;
  ctx.font = `${o.bold ? 700 : 600} ${size}px ${TITLE}`;
  const tw = ctx.measureText(label).width;
  const pad = o.capital ? 15 : 7;
  const w = tw + pad * 2, h = size + 7;
  const bx = x - w / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = o.selected ? "rgba(48,36,20,0.95)" : "rgba(28,23,18,0.86)";
  roundRect(ctx, bx, y, w, h, 3);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = o.selected ? GOLD_LIGHT : o.tint ?? "rgba(201,164,90,0.75)";
  ctx.lineWidth = o.selected ? 1.4 : 1;
  roundRect(ctx, bx + 0.5, y + 0.5, w - 1, h - 1, 3);
  ctx.stroke();
  if (o.capital) {
    for (const d of [-1, 1]) {
      const cx = x + d * (w / 2 - 7), cy = y + h / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 3);
      ctx.lineTo(cx + 2.4, cy);
      ctx.lineTo(cx, cy + 3);
      ctx.lineTo(cx - 2.4, cy);
      ctx.closePath();
      ctx.fillStyle = GOLD;
      ctx.fill();
    }
  }
  ctx.fillStyle = o.selected ? GOLD_LIGHT : CREAM;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y + h / 2 + 0.5);
  return { x: bx, y, w, h };
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- asker ----

/**
 * Ordunun figürü: kalkanlı, mızraklı bir asker. (x, y) ayaklarının ortası; boyu yaklaşık
 * 24 piksel (z = 1).
 */
export function soldier(ctx, owner, x, y, z = 1, o = {}) {
  const color = colorOf(owner);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(z, z);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.fillStyle = "rgba(20,14,8,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 2.2, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  // Mızrak
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(5.5, 0);
  ctx.lineTo(5.5, -25);
  ctx.stroke();
  ctx.fillStyle = "#cfd3d6";
  ctx.beginPath();
  ctx.moveTo(5.5, -29);
  ctx.lineTo(7, -25);
  ctx.lineTo(4, -25);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 0.7;
  ctx.stroke();
  // Bacaklar
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-1.6, 0);
  ctx.lineTo(-1.2, -6);
  ctx.moveTo(1.6, 0);
  ctx.lineTo(1.2, -6);
  ctx.stroke();
  // Gövde (tunik)
  ctx.beginPath();
  ctx.moveTo(-3.5, -5);
  ctx.lineTo(3.5, -5);
  ctx.lineTo(2.6, -14);
  ctx.lineTo(-2.6, -14);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.stroke();
  // Baş ve miğfer
  ctx.beginPath();
  ctx.arc(0, -16.8, 2.8, 0, TAU);
  ctx.fillStyle = "#d9b48c";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -17.3, 3.1, Math.PI * 1.02, Math.PI * 1.98);
  ctx.closePath();
  ctx.fillStyle = "#b08a3e";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-2, -20.5);
  ctx.quadraticCurveTo(0, -23.5, 2.5, -21);
  ctx.strokeStyle = shade(color, -0.2);
  ctx.lineWidth = 1.8;
  ctx.stroke();
  // Kalkan
  ctx.beginPath();
  ctx.ellipse(-3.2, -9.5, 3.6, 4.8, 0, 0, TAU);
  ctx.fillStyle = shade(color, -0.15);
  ctx.fill();
  ctx.strokeStyle = o.gold ? GOLD_LIGHT : GOLD;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-3.2, -9.5, 1, 0, TAU);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.restore();
}

/**
 * Kadırga, yandan: kürekler, burnunda mahmuz ve göz, kıçında kıvrık süs, direkte sahibinin
 * renginde armalı yelken. (x, y) su hattının ortası; `s` = 1'de gövde ~44 piksel.
 * `o`: flip (sola bakar), furled (limanda: yelken sarılı), troops (askerli: küpeştede
 * kalkanlar), wake (yürüyor: arkasında köpük), gold (seçili).
 */
export function galley(ctx, owner, x, y, s = 1, o = {}) {
  const color = colorOf(owner);
  const d = o.flip ? -1 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * d, s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Suya düşen gölge
  ctx.fillStyle = "rgba(8,26,34,0.3)";
  ctx.beginPath();
  ctx.ellipse(1, 2, 23, 3.4, 0, 0, TAU);
  ctx.fill();
  if (o.wake) {
    ctx.strokeStyle = "rgba(240,246,240,0.7)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-18, 0.5);
    ctx.lineTo(-38, -3.5);
    ctx.moveTo(-18, 1.5);
    ctx.lineTo(-38, 6);
    ctx.moveTo(22, 1);
    ctx.quadraticCurveTo(25, -1, 27, 1);
    ctx.stroke();
  }
  // Kürekler (gövdenin arkasında)
  ctx.strokeStyle = "#d8c29a";
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const ox = -12 + i * 4;
    ctx.moveTo(ox, -1.5);
    ctx.lineTo(ox - 3.5, 5);
  }
  ctx.stroke();
  // Direk, seren ve yelken
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(0, -31);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -31);
  ctx.lineTo(-7, -29.5);
  ctx.lineTo(0, -28);
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-11, -27);
  ctx.lineTo(11, -27);
  ctx.stroke();
  if (o.furled) {
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-10, -26);
    ctx.lineTo(10, -26);
    ctx.stroke();
  } else {
    const sail = () => {
      ctx.beginPath();
      ctx.moveTo(-10, -26.5);
      ctx.lineTo(10, -26.5);
      ctx.quadraticCurveTo(13.5, -18, 10, -9.5);
      ctx.lineTo(-10, -9.5);
      ctx.quadraticCurveTo(-6.5, -18, -10, -26.5);
      ctx.closePath();
    };
    sail();
    const g = ctx.createLinearGradient(-10, 0, 13, 0);
    g.addColorStop(0, shade(color, -0.3));
    g.addColorStop(0.6, shade(color, 0.1));
    g.addColorStop(1, shade(color, -0.15));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = o.gold ? GOLD_LIGHT : shade(color, -0.55);
    ctx.lineWidth = o.gold ? 1.4 : 0.9;
    ctx.stroke();
  }
  // Gövde
  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(-16, -5);
    ctx.lineTo(14, -5);
    ctx.quadraticCurveTo(18, -5, 19, -2);
    ctx.lineTo(23.5, 0.5);
    ctx.lineTo(17, 1.8);
    ctx.quadraticCurveTo(0, 3.8, -15, 1.6);
    ctx.quadraticCurveTo(-19, -1, -16, -5);
    ctx.closePath();
  };
  hull();
  const hg = ctx.createLinearGradient(0, -5, 0, 3);
  hg.addColorStop(0, "#6e4a2b");
  hg.addColorStop(1, "#33200f");
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.strokeStyle = "#1c120a";
  ctx.lineWidth = 0.9;
  ctx.stroke();
  // Kıç süsü
  ctx.strokeStyle = "#4a2f1a";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-16, -4.5);
  ctx.quadraticCurveTo(-23, -10, -20.5, -15.5);
  ctx.quadraticCurveTo(-18.5, -17.5, -17.2, -14.5);
  ctx.stroke();
  // Küpeştede sahibinin renginde şerit, askerliyse kalkanlar; burunda göz.
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-15, -3.3);
  ctx.lineTo(16, -3.3);
  ctx.stroke();
  if (o.troops) {
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(-11 + i * 4.4, -5.6, 1.7, 0, TAU);
      ctx.fillStyle = shade(color, -0.15);
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.arc(16.5, -2, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
  // Arma yelkende, aynalanmadan.
  if (!o.furled) emblem(ctx, owner, x + d * 1 * s, y - 18 * s, 5 * s);
}

/**
 * Filo: gemi sayısı kadar (en fazla üç) kadırga, arkadakiler küçük ve yukarıda. (x, y) öndeki
 * kadırganın su hattı.
 */
export function fleet(ctx, owner, x, y, ships, z = 1, o = {}) {
  const d = o.flip ? -1 : 1;
  const spots = [[0, 0, 1], [-18, -10, 0.8], [15, -13, 0.7]].slice(0, Math.max(1, Math.min(3, ships)));
  for (const [dx, dy, k] of [...spots].sort((a, b) => a[1] - b[1])) {
    galley(ctx, owner, x + dx * z * d, y + dy * z, k * z, { ...o, wake: o.wake && k === 1 });
  }
}

/** Ordunun altında küçük bir gemi: ordunun gemisi var ya da şu an denizde. */
export function ship(ctx, x, y, z = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(z, z);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-11, -3);
  ctx.lineTo(11, -3);
  ctx.quadraticCurveTo(9, 3, 0, 3);
  ctx.quadraticCurveTo(-9, 3, -11, -3);
  ctx.closePath();
  ctx.fillStyle = "#7a5a3a";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.lineTo(0, -15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.8, -14);
  ctx.quadraticCurveTo(7, -10, 0.8, -5);
  ctx.closePath();
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
