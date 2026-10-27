// Bildirimlerin ve araştırmanın görselleri (kullanıcı 27.10: "akıncılar mesajı geldiğinde ekranda atlı adamlar çıksın,
// altında yazı; yazıların arka planı olmasın, arka plan görsel olsun; bütün bildirimlerde, araştırmada da. Sonra hepsine
// kendim güzel görseller ayarlayacağım, şimdilik temsili").
//
// Her görselin bir anahtarı var: "notice/raid", "notice/mercs", "tech/irrigation"... `art/<anahtar>.jpg` (ya da .png,
// .webp) varsa o resim pencereyi kaplar (ortalanıp kırpılarak); yoksa burada kodla çizilen temsili bir sahne. Anahtarların
// listesi ve önerilen boyutlar: Docs/gorseller.md. Resim sonradan gelirse (yüklenince) ekran kendiliğinden yenilenir.

import { TAU, colorOf, text } from "./kit.js";
import { trooper } from "./battle.js";
import { CREAM, GOLD, GOLD_DARK, GOLD_LIGHT, galley, roundRect, shield } from "./pieces.js";
import { field, forge, house, temple, tent } from "./buildings.js";

// ---- resimler ----

const EXT = ["jpg", "png", "webp"];
const cache = new Map(); // anahtar -> { img, ok }

/** Anahtarın resmi yüklendiyse o, yoksa null (ilk istekte yüklemeye başlar: jpg, olmazsa png, olmazsa webp). */
export function artImage(key) {
  let e = cache.get(key);
  if (!e) {
    e = { img: null, ok: false };
    cache.set(key, e);
    if (typeof Image !== "undefined") load(e, key, 0);
  }
  return e.ok ? e.img : null;
}

function load(e, key, i) {
  if (i >= EXT.length) return;
  const img = new Image();
  img.onload = () => { e.img = img; e.ok = true; globalThis.MareNostrum?.redraw?.(); };
  img.onerror = () => load(e, key, i + 1);
  img.src = `art/${key}.${EXT[i]}`;
}

/**
 * Bir görseli kutuya çiz: resmi varsa kaplayarak (oran korunur, taşan kırpılır), yoksa temsili sahne. `o.owner`,
 * `o.them`: sahnedeki sancakların renkleri; `o.round`: köşe yarıçapı; `o.pic`: temsili sahnenin yüksekliği (altı koyu).
 */
export function artBox(ctx, key, x, y, w, h, o = {}) {
  ctx.save();
  roundRect(ctx, x, y, w, h, o.round ?? 0);
  ctx.clip();
  const img = artImage(key);
  if (img) {
    const k = Math.max(w / img.width, h / img.height), iw = img.width * k, ih = img.height * k;
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  } else {
    // Temsili sahne görselin alanına (`o.pic`: pencerenin üst kısmı) çizilir, altı kararır: figürler yazının altında kalmasın.
    const ph = Math.min(h, o.pic ?? h);
    ctx.translate(x, y);
    (SCENES[key] ?? SCENES[key.split("/")[0]] ?? SCENES.notice)(ctx, w, ph, o);
    if (ph < h) {
      const g = ctx.createLinearGradient(0, ph - 1, 0, h);
      g.addColorStop(0, "#2a1d12");
      g.addColorStop(1, "#120c07");
      ctx.fillStyle = g;
      ctx.fillRect(0, ph - 1, w, h - ph + 1);
    }
  }
  ctx.restore();
}

// ---- resimli pencere ----

/**
 * Bildirim penceresi: görsel bütün pencereyi kaplar; yazının okunması için görselin alt kısmı aşağıya doğru kararır
 * (yazının zemini yok, görselin kendisi). Dönen: { x, y, w, h }.
 */
export function pictureFrame(ctx, cam, boxes, key, h, wMax = 520, o = {}) {
  ctx.fillStyle = "rgba(12,9,6,0.55)";
  ctx.fillRect(0, 0, cam.w, cam.h);
  boxes.push({ x: 0, y: 0, w: cam.w, h: cam.h, act: null });
  const w = Math.min(cam.w - 24, wMax);
  h = Math.min(cam.h - 24, h);
  const x = Math.round((cam.w - w) / 2), y = Math.max(12, Math.round((cam.h - h) / 2));
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#1c150e";
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.restore();
  artBox(ctx, key, x, y, w, h, { ...o, round: 8 });
  ctx.save();
  roundRect(ctx, x, y, w, h, 8);
  ctx.clip();
  const from = o.fade ?? 0.36;
  const g = ctx.createLinearGradient(0, y + h * from, 0, y + h);
  g.addColorStop(0, "rgba(12,8,4,0)");
  g.addColorStop(0.35, "rgba(12,8,4,0.55)");
  g.addColorStop(1, "rgba(12,8,4,0.9)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y + h * from, w, h * (1 - from));
  ctx.restore();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 8);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.stroke();
  roundRect(ctx, x + 4.5, y + 4.5, w - 9, h - 9, 6);
  ctx.strokeStyle = "rgba(236,212,154,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  boxes.push({ x, y, w, h, act: null });
  return { x, y, w, h };
}

/** Görselin üstünde yazı: krem, gölgeli (zemin yok). */
export function lit(ctx, s, x, y, o = {}) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  const w = text(ctx, s, x, y, { color: CREAM, ...o });
  ctx.restore();
  return w;
}

/** Görselin üstünde düğme: yarı saydam koyu, altın kenarlı. */
export function glassButton(ctx, boxes, b, hot = false) {
  const { x, y, w, h } = b;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fillStyle = b.off ? "rgba(20,14,8,0.35)" : hot ? "rgba(70,52,30,0.85)" : b.main ? "rgba(40,28,14,0.78)" : "rgba(20,14,8,0.6)";
  ctx.fill();
  ctx.strokeStyle = b.off ? "rgba(201,164,90,0.3)" : hot ? GOLD_LIGHT : b.main ? GOLD : "rgba(201,164,90,0.7)";
  ctx.lineWidth = b.main ? 1.8 : 1.3;
  ctx.stroke();
  lit(ctx, b.label, x + w / 2, y + h / 2 + 1, { bold: true, size: b.size ?? 14, align: "center", base: "middle", color: b.off ? "rgba(243,231,201,0.45)" : CREAM });
  boxes.push({ x, y, w, h, act: b.off ? null : b.act, tip: b.tip, want: b.act });
}

// ---- temsili sahneler ----
//
// Hepsi (0, 0)'dan (w, h)'ye çizer. Gökyüzü, uzak tepeler, toprak ve önde birkaç figür: sonradan gerçek resimlerle
// değişecek, yeter ki neyi anlattığı belli olsun.

function sky(ctx, w, h, top, bottom, horizon = 0.62) {
  const g = ctx.createLinearGradient(0, 0, 0, h * horizon);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function hills(ctx, w, h, y, color, amp = 0.05, seed = 1) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += w / 24) ctx.lineTo(x, h * y - Math.sin(x / w * 7 + seed) * h * amp - Math.sin(x / w * 17 + seed * 2) * h * amp * 0.4);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

function ground(ctx, w, h, y, top, bottom) {
  const g = ctx.createLinearGradient(0, h * y, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, h * y, w, h * (1 - y));
}

function disc(ctx, x, y, r, color, glow) {
  if (glow) {
    const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3);
    g.addColorStop(0, glow);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** Şehir silueti: sur, kuleler, damlar, bir tapınak. */
function skyline(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y - h * 0.35, w, h * 0.35);
  for (let i = 0; i < 7; i++) {
    const bx = x + (i + 0.5) * (w / 7), bw = w / 9, bh = h * (0.45 + ((i * 37) % 5) * 0.09);
    ctx.fillRect(bx - bw / 2, y - bh, bw, bh);
    ctx.beginPath();
    ctx.moveTo(bx - bw / 2 - 2, y - bh);
    ctx.lineTo(bx, y - bh - h * 0.12);
    ctx.lineTo(bx + bw / 2 + 2, y - bh);
    ctx.fill();
  }
  for (const tx of [x, x + w]) ctx.fillRect(tx - w * 0.04, y - h * 0.62, w * 0.08, h * 0.62);
}

function smoke(ctx, x, y, s, color = "rgba(40,36,30,0.45)") {
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + Math.sin(i * 1.7) * s * 0.4 + i * s * 0.18, y - i * s * 0.55, s * (0.35 + i * 0.12), 0, TAU);
    ctx.fill();
  }
}

function flame(ctx, x, y, s) {
  const g = ctx.createRadialGradient(x, y - s * 0.4, 0, x, y - s * 0.4, s * 1.4);
  g.addColorStop(0, "rgba(255,220,120,0.9)");
  g.addColorStop(0.4, "rgba(240,120,40,0.75)");
  g.addColorStop(1, "rgba(160,40,10,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - s * 1.4, y - s * 1.8, s * 2.8, s * 2.4);
  ctx.fillStyle = "rgba(255,190,80,0.95)";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.35, y);
  ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.6, x, y - s * 1.2);
  ctx.quadraticCurveTo(x + s * 0.45, y - s * 0.6, x + s * 0.35, y);
  ctx.fill();
}

/** Basit bir insan silueti (kalabalık için). */
function person(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - s * 1.55, s * 0.32, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.42, y);
  ctx.lineTo(x - s * 0.3, y - s * 1.2);
  ctx.lineTo(x + s * 0.3, y - s * 1.2);
  ctx.lineTo(x + s * 0.42, y);
  ctx.fill();
}

function camel(ctx, x, y, s, color = "#5a3f26") {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y - s * 1.1, s * 0.8, s * 0.38, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x - s * 0.1, y - s * 1.45, s * 0.35, s * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.lineWidth = s * 0.14;
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (const lx of [-0.55, -0.25, 0.3, 0.6]) { ctx.moveTo(x + lx * s, y - s * 0.95); ctx.lineTo(x + lx * s, y); }
  ctx.moveTo(x + s * 0.7, y - s * 1.2);
  ctx.quadraticCurveTo(x + s * 1.1, y - s * 1.5, x + s * 1.05, y - s * 1.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x + s * 1.15, y - s * 1.88, s * 0.22, s * 0.12, 0.2, 0, TAU);
  ctx.fill();
}

function coins(ctx, x, y, s) {
  for (let i = 0; i < 14; i++) {
    const cx = x + ((i * 0.6180339) % 1 - 0.5) * s * 2.2, cy = y - Math.floor(i / 4) * s * 0.22 - ((i * 0.37) % 1) * s * 0.2;
    ctx.fillStyle = i % 3 ? GOLD : GOLD_LIGHT;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.32, s * 0.13, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function scroll(ctx, x, y, s) {
  ctx.fillStyle = "#efe0bb";
  ctx.fillRect(x - s, y - s * 0.65, s * 2, s * 1.3);
  ctx.strokeStyle = "#7a5a34";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - s, y - s * 0.65, s * 2, s * 1.3);
  ctx.fillStyle = "#c9a56a";
  for (const ex of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + ex * s, y, s * 0.12, s * 0.72, 0, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = "rgba(90,70,40,0.6)";
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x - s * 0.7, y - s * 0.4 + i * s * 0.2); ctx.lineTo(x + s * (0.4 + (i % 2) * 0.25), y - s * 0.4 + i * s * 0.2); ctx.stroke(); }
}

/** Bir sıra figür (ordu): `kinds` sırasıyla, `side` -1 sağa bakar. */
function host(ctx, kinds, owner, x0, y0, dx, dy, s, side) {
  kinds.forEach((k, i) => trooper(ctx, k, owner, x0 + i * dx + ((i * 7) % 3) * 4, y0 + (i % 2) * dy, side, s * (1 - (i % 2) * 0.08)));
}

/** Uçuşan kuşlar (uzakta V'ler). */
function birds(ctx, x, y, s, n = 5) {
  ctx.strokeStyle = "rgba(30,24,20,0.7)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < n; i++) {
    const bx = x + i * s * 2.2 + (i % 2) * s, by = y + ((i * 13) % 5) * s * 0.5;
    ctx.beginPath();
    ctx.moveTo(bx - s, by);
    ctx.quadraticCurveTo(bx - s * 0.4, by - s * 0.6, bx, by);
    ctx.quadraticCurveTo(bx + s * 0.4, by - s * 0.6, bx + s, by);
    ctx.stroke();
  }
}

const SCENES = {
  // Akın: alacakaranlıkta tozu dumana katan atlılar.
  "notice/raid"(ctx, w, h, o) {
    sky(ctx, w, h, "#7a2f1e", "#f0a860");
    disc(ctx, w * 0.78, h * 0.32, h * 0.07, "#ffd9a0", "rgba(255,200,120,0.5)");
    hills(ctx, w, h, 0.5, "#5a3426", 0.04, 2);
    ground(ctx, w, h, 0.55, "#8a6038", "#4a3020");
    for (let i = 0; i < 8; i++) smoke(ctx, w * (0.15 + i * 0.1), h * 0.72, h * 0.06, "rgba(190,150,100,0.35)");
    host(ctx, ["cav", "cav", "cav", "cav", "cav", "cav"], o.them ?? null, w * 0.12, h * 0.78, w * 0.13, h * 0.05, h / 95, -1);
  },
  // Paralı askerler: kamp, askerler, bir yığın para.
  "notice/mercs"(ctx, w, h, o) {
    sky(ctx, w, h, "#5d86a8", "#e8dcb8");
    hills(ctx, w, h, 0.52, "#6f8a5a", 0.03, 4);
    ground(ctx, w, h, 0.56, "#9a8a58", "#5e5232");
    tent(ctx, w * 0.82, h * 0.6, h * 0.16, null);
    tent(ctx, w * 0.68, h * 0.58, h * 0.12, null);
    host(ctx, ["inf", "arch", "inf", "inf", "arch"], o.them ?? null, w * 0.12, h * 0.8, w * 0.1, h * 0.04, h / 100, -1);
    coins(ctx, w * 0.72, h * 0.86, h * 0.09);
  },
  // Veba: hasta şehir, kara duman, kuzgunlar.
  "notice/plague"(ctx, w, h) {
    sky(ctx, w, h, "#4e5644", "#b7b48a");
    skyline(ctx, w * 0.12, h * 0.66, w * 0.76, h * 0.42, "#2e2b24");
    smoke(ctx, w * 0.32, h * 0.38, h * 0.08, "rgba(30,30,24,0.5)");
    smoke(ctx, w * 0.62, h * 0.32, h * 0.1, "rgba(30,30,24,0.5)");
    birds(ctx, w * 0.2, h * 0.14, h * 0.025, 6);
    ground(ctx, w, h, 0.66, "#55513c", "#2a2820");
  },
  // Bolluk: altın tarlalar, demetler, güneş.
  "notice/harvest"(ctx, w, h) {
    sky(ctx, w, h, "#f0b860", "#fbecc0");
    disc(ctx, w * 0.2, h * 0.24, h * 0.08, "#fff2c8", "rgba(255,230,160,0.6)");
    hills(ctx, w, h, 0.5, "#b8a050", 0.03, 1);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = i % 2 ? "#d8b048" : "#c89a38";
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.52);
      ctx.lineTo(w * (-0.6 + i * 0.28), h);
      ctx.lineTo(w * (-0.46 + i * 0.28), h);
      ctx.fill();
    }
    for (const sx of [0.3, 0.5, 0.7]) {
      ctx.fillStyle = "#a87a28";
      ctx.beginPath();
      ctx.moveTo(w * sx - h * 0.04, h * 0.84);
      ctx.lineTo(w * sx, h * 0.68);
      ctx.lineTo(w * sx + h * 0.04, h * 0.84);
      ctx.fill();
    }
  },
  // Yangın: gece, alevler içinde şehir.
  "notice/fire"(ctx, w, h) {
    sky(ctx, w, h, "#1a0e0a", "#7a2c14");
    skyline(ctx, w * 0.1, h * 0.7, w * 0.8, h * 0.44, "#120a06");
    for (const [fx, s] of [[0.22, 0.12], [0.4, 0.16], [0.58, 0.1], [0.74, 0.14]]) { flame(ctx, w * fx, h * 0.5, h * s); smoke(ctx, w * fx, h * 0.3, h * 0.06, "rgba(20,14,10,0.5)"); }
    ground(ctx, w, h, 0.7, "#2a160c", "#0e0806");
  },
  // Huzursuzluk: meşaleli kalabalık, arkada tapınak.
  "notice/unrest"(ctx, w, h) {
    sky(ctx, w, h, "#2e2440", "#a86a58");
    temple(ctx, w * 0.5, h * 0.6, h / 55);
    ground(ctx, w, h, 0.6, "#4a3a30", "#1e1610");
    for (let i = 0; i < 14; i++) {
      const px = w * (0.08 + i * 0.065), py = h * (0.86 + (i % 3) * 0.04), s = h * 0.06;
      person(ctx, px, py, s, "#1a120c");
      if (i % 3 === 0) { ctx.strokeStyle = "#3a2a1a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + s * 0.3, py - s); ctx.lineTo(px + s * 0.5, py - s * 2.3); ctx.stroke(); flame(ctx, px + s * 0.5, py - s * 2.2, s * 0.4); }
    }
  },
  // Kervan: çölde develer.
  "notice/caravan"(ctx, w, h) {
    sky(ctx, w, h, "#e0985a", "#f8e2b0");
    disc(ctx, w * 0.75, h * 0.28, h * 0.07, "#fff0c8", "rgba(255,230,170,0.5)");
    hills(ctx, w, h, 0.56, "#d8a868", 0.05, 3);
    hills(ctx, w, h, 0.68, "#c89050", 0.04, 5);
    for (let i = 0; i < 5; i++) camel(ctx, w * (0.14 + i * 0.16), h * (0.84 + (i % 2) * 0.02), h * 0.1);
  },
  // İç savaş: aynı sancağın iki yarısı karşı karşıya.
  "notice/civilWar"(ctx, w, h, o) {
    sky(ctx, w, h, "#4a1410", "#c0563a");
    hills(ctx, w, h, 0.52, "#5a2a1e", 0.04, 6);
    ground(ctx, w, h, 0.58, "#6a4028", "#2a1810");
    host(ctx, ["inf", "inf", "cav"], o.owner ?? null, w * 0.08, h * 0.82, w * 0.11, h * 0.04, h / 95, -1);
    host(ctx, ["inf", "inf", "cav"], null, w * 0.64, h * 0.82, w * 0.11, h * 0.04, h / 95, 1);
  },
  // Teklifler: saray, iki sancak; ittifakta defne, barışta zeytin dalı, ticarette amforalar, haraçta para.
  "notice/ally"(ctx, w, h, o) { court(ctx, w, h, o, "#5a7aa0", "#e8dcc0"); laurel(ctx, w * 0.5, h * 0.42, h * 0.12); },
  "notice/peace"(ctx, w, h, o) { court(ctx, w, h, o, "#9ab8c8", "#f4ecd8"); branch(ctx, w * 0.5, h * 0.42, h * 0.14); },
  "notice/trade"(ctx, w, h, o) {
    court(ctx, w, h, o, "#5a9aa8", "#ece0c0");
    for (let i = 0; i < 4; i++) amphora(ctx, w * (0.38 + i * 0.08), h * 0.62, h / 40);
  },
  "notice/tribute"(ctx, w, h, o) { court(ctx, w, h, o, "#6a3a3a", "#d8b890"); coins(ctx, w * 0.5, h * 0.62, h * 0.12); },
  // Sana saldırı: düşman ordusu şehrine yürüyor.
  "notice/incoming"(ctx, w, h, o) {
    sky(ctx, w, h, "#46566a", "#d8c8a0");
    hills(ctx, w, h, 0.5, "#5a6a4a", 0.04, 7);
    ground(ctx, w, h, 0.56, "#8a7a4a", "#4a3e24");
    skyline(ctx, w * 0.02, h * 0.66, w * 0.3, h * 0.3, "#3a3026");
    host(ctx, ["inf", "inf", "cav", "inf", "arch", "cav"], o.them ?? null, w * 0.4, h * 0.82, w * 0.1, h * 0.05, h / 100, 1);
  },
  // Denizde: kadırgalar.
  "notice/naval"(ctx, w, h, o) {
    sky(ctx, w, h, "#4a6a8a", "#dce4e0");
    const g = ctx.createLinearGradient(0, h * 0.5, 0, h);
    g.addColorStop(0, "#3a6a80");
    g.addColorStop(1, "#173040");
    ctx.fillStyle = g;
    ctx.fillRect(0, h * 0.5, w, h * 0.5);
    for (let i = 0; i < 4; i++) galley(ctx, i % 2 ? o.them ?? null : o.owner ?? null, w * (0.18 + i * 0.22), h * (0.66 + (i % 2) * 0.12), h / 70, { flip: i % 2 === 1 });
  },
  // Savaş: iki ordu çarpışıyor.
  "notice/battle"(ctx, w, h, o) {
    sky(ctx, w, h, "#5a4a3a", "#d8b890");
    hills(ctx, w, h, 0.52, "#6a5a40", 0.04, 8);
    ground(ctx, w, h, 0.58, "#7a6a40", "#3a301c");
    for (let i = 0; i < 5; i++) smoke(ctx, w * (0.3 + i * 0.1), h * 0.62, h * 0.05, "rgba(160,140,110,0.35)");
    host(ctx, ["inf", "inf", "cav"], o.owner ?? null, w * 0.12, h * 0.84, w * 0.1, h * 0.04, h / 95, -1);
    host(ctx, ["inf", "cav", "inf"], o.them ?? null, w * 0.58, h * 0.84, w * 0.1, h * 0.04, h / 95, 1);
  },
  // Kıtlık: kurumuş tarla.
  "notice/famine"(ctx, w, h) {
    sky(ctx, w, h, "#a87a48", "#e8d0a0");
    ground(ctx, w, h, 0.55, "#8a6a40", "#4a361e");
    for (let i = 0; i < 12; i++) { ctx.strokeStyle = "rgba(60,40,20,0.6)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(w * (0.05 + i * 0.08), h * 0.7); ctx.lineTo(w * (0.05 + i * 0.08) + 10, h * 0.6); ctx.stroke(); }
    birds(ctx, w * 0.55, h * 0.18, h * 0.03, 4);
  },
  // Tur: sabah, şehir ve tarlalar.
  "notice/turn"(ctx, w, h, o) {
    sky(ctx, w, h, "#7aa0c0", "#f4e8c8");
    disc(ctx, w * 0.82, h * 0.26, h * 0.06, "#fff6dc", "rgba(255,240,200,0.6)");
    hills(ctx, w, h, 0.52, "#8aa070", 0.03, 9);
    ground(ctx, w, h, 0.58, "#a09060", "#5a5030");
    field(ctx, w * 0.12, h * 0.74, w * 0.2, 0);
    for (let i = 0; i < 4; i++) house(ctx, w * (0.5 + i * 0.08), h * 0.68, h / 70);
    temple(ctx, w * 0.78, h * 0.68, h / 70);
  },
  // Yapı: iskele, demirhane, ev.
  "notice/build"(ctx, w, h) {
    sky(ctx, w, h, "#8ab0c8", "#f0e6c8");
    ground(ctx, w, h, 0.6, "#a08a5a", "#5a4a2e");
    forge(ctx, w * 0.3, h * 0.68, h / 60, 2);
    house(ctx, w * 0.55, h * 0.68, h / 55);
    temple(ctx, w * 0.75, h * 0.68, h / 60);
  },
  // Görev: mühürlü tomar.
  "notice/mission"(ctx, w, h, o) {
    sky(ctx, w, h, "#4a3424", "#a8804a", 1);
    scroll(ctx, w * 0.5, h * 0.36, h * 0.18);
    ctx.fillStyle = colorOf(o.owner ?? null);
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.48, h * 0.04, 0, TAU);
    ctx.fill();
  },
  // Zafer ve yenilgi.
  "notice/victory"(ctx, w, h, o) {
    sky(ctx, w, h, "#c89040", "#fbe8b0");
    disc(ctx, w * 0.5, h * 0.36, h * 0.1, "#fff6dc", "rgba(255,230,160,0.7)");
    laurel(ctx, w * 0.5, h * 0.36, h * 0.16);
    shield(ctx, o.owner ?? null, w * 0.5 - h * 0.06, h * 0.3, h * 0.12);
  },
  "notice/defeat"(ctx, w, h, o) {
    sky(ctx, w, h, "#1e1a1a", "#5a4a40");
    skyline(ctx, w * 0.15, h * 0.66, w * 0.7, h * 0.38, "#0e0a08");
    smoke(ctx, w * 0.45, h * 0.36, h * 0.09, "rgba(10,8,6,0.55)");
    ground(ctx, w, h, 0.66, "#2a2018", "#0e0a08");
  },
  notice(ctx, w, h) { sky(ctx, w, h, "#5a4a36", "#cdb488", 1); },
  // Araştırma: dalının rengi ve ortada simgesi.
  tech(ctx, w, h, o) {
    const lane = ["#6a8a4a", "#8a5a3a", "#3a6a8a", "#7a5a8a"][o.lane ?? 0];
    sky(ctx, w, h, lane, "#e8dcc0", 1.2);
    // Araştırma kartında simge sağda (yazılar solda).
    if (o.card) ctx.translate(w * 0.24, 0);
    (TECH_ICON[o.id] ?? (() => {}))(ctx, w, h, o);
  },
};

// Saray avlusu: sütunlar, iki tarafın sancakları.
function court(ctx, w, h, o, top, bottom) {
  sky(ctx, w, h, top, bottom);
  ground(ctx, w, h, 0.66, "#c8b890", "#7a6a4a");
  temple(ctx, w * 0.5, h * 0.66, h / 38);
  shield(ctx, o.owner ?? null, w * 0.16, h * 0.5, h * 0.14);
  shield(ctx, o.them ?? null, w * 0.84 - h * 0.14, h * 0.5, h * 0.14);
}

function laurel(ctx, x, y, r) {
  ctx.strokeStyle = "#5a7a3a";
  ctx.fillStyle = "#7a9a4a";
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI / 2 + side * 0.3, Math.PI / 2 + side * 2.6, side < 0);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const a = Math.PI / 2 + side * (0.4 + i * 0.32);
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.16, r * 0.07, a + side * 0.8, 0, TAU);
      ctx.fill();
    }
  }
}

function branch(ctx, x, y, r) {
  ctx.strokeStyle = "#6a5a3a";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - r, y + r * 0.4);
  ctx.quadraticCurveTo(x, y - r * 0.2, x + r, y - r * 0.4);
  ctx.stroke();
  ctx.fillStyle = "#8aa05a";
  for (let i = 0; i < 8; i++) {
    const t = i / 7, bx = x - r + t * r * 2, by = y + r * 0.4 - t * r * 0.8;
    ctx.beginPath();
    ctx.ellipse(bx, by + (i % 2 ? -r * 0.16 : r * 0.16), r * 0.2, r * 0.07, (i % 2 ? -0.6 : 0.6), 0, TAU);
    ctx.fill();
  }
}

function amphora(ctx, x, y, s) {
  ctx.fillStyle = "#a8603a";
  ctx.beginPath();
  ctx.ellipse(x, y, s * 3, s * 5, 0, 0, TAU);
  ctx.fill();
  ctx.fillRect(x - s, y - s * 8, s * 2, s * 4);
  ctx.strokeStyle = "#6a3a20";
  ctx.lineWidth = s;
  ctx.beginPath();
  ctx.arc(x - s * 2, y - s * 6, s * 1.5, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(x + s * 2, y - s * 6, s * 1.5, Math.PI * 1.5, Math.PI * 0.5);
  ctx.stroke();
}

// Teknolojilerin simgeleri (temsili): kutunun ortasında.
const TECH_ICON = {
  irrigation(ctx, w, h) { field(ctx, w * 0.2, h * 0.8, w * 0.6, 0); ctx.strokeStyle = "#3a7aa0"; ctx.lineWidth = h * 0.06; ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.92); ctx.lineTo(w * 0.9, h * 0.92); ctx.stroke(); },
  bronze(ctx, w, h) { forge(ctx, w * 0.5, h * 0.85, h / 50, 1); },
  sailing(ctx, w, h, o) { galley(ctx, o.owner ?? null, w * 0.5, h * 0.72, h / 45); },
  writing(ctx, w, h) { scroll(ctx, w * 0.5, h * 0.55, h * 0.24); },
  horseback(ctx, w, h, o) { trooper(ctx, "cav", o.owner ?? null, w * 0.5, h * 0.88, -1, h / 42); },
  ironWorking(ctx, w, h, o) { trooper(ctx, "inf", o.owner ?? null, w * 0.5, h * 0.9, -1, h / 40); },
  harbours(ctx, w, h, o) { galley(ctx, o.owner ?? null, w * 0.42, h * 0.75, h / 55); house(ctx, w * 0.78, h * 0.8, h / 60); },
  currency(ctx, w, h) { coins(ctx, w * 0.5, h * 0.75, h * 0.22); },
  tactics(ctx, w, h, o) { host(ctx, ["inf", "arch", "cav"], o.owner ?? null, w * 0.22, h * 0.9, w * 0.26, 0, h / 48, -1); },
  engineering(ctx, w, h, o) { trooper(ctx, "siege", o.owner ?? null, w * 0.5, h * 0.88, -1, h / 30); },
  shipbuilding(ctx, w, h, o) { galley(ctx, o.owner ?? null, w * 0.5, h * 0.72, h / 38); },
  mathematics(ctx, w, h) { ctx.strokeStyle = "#4a3a24"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.55, h * 0.25, 0, TAU); ctx.moveTo(w * 0.5 - h * 0.3, h * 0.55); ctx.lineTo(w * 0.5 + h * 0.3, h * 0.55); ctx.moveTo(w * 0.5, h * 0.25); ctx.lineTo(w * 0.5 + h * 0.22, h * 0.72); ctx.lineTo(w * 0.5 - h * 0.22, h * 0.72); ctx.closePath(); ctx.stroke(); },
  strategy(ctx, w, h) { scroll(ctx, w * 0.5, h * 0.55, h * 0.24); ctx.strokeStyle = "#a83a2a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w * 0.42, h * 0.62); ctx.quadraticCurveTo(w * 0.5, h * 0.42, w * 0.6, h * 0.5); ctx.stroke(); },
  fortification(ctx, w, h) { skyline(ctx, w * 0.25, h * 0.9, w * 0.5, h * 0.55, "#5a4a36"); },
  navigation(ctx, w, h, o) { galley(ctx, o.owner ?? null, w * 0.5, h * 0.78, h / 50); disc(ctx, w * 0.75, h * 0.22, h * 0.04, "#fff6dc", "rgba(255,240,200,0.6)"); },
  medicine(ctx, w, h) { ctx.fillStyle = "#8a6a4a"; ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.72, h * 0.22, h * 0.1, 0, 0, Math.PI); ctx.fill(); ctx.fillStyle = "#6a9a4a"; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(w * (0.4 + i * 0.05), h * 0.6, h * 0.04, h * 0.1, (i - 2) * 0.3, 0, TAU); ctx.fill(); } },
};
