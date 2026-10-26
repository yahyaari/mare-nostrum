// Savaş sahnesi (plan.md 2.8): savaş sonucu penceresinin üstünde üç saniyelik küçük bir
// sahne. Okçular ok yağdırır, süvari hücum eder, saflar ortada çarpışır, kayıplar oranında
// askerler düşer, kaybeden geri çekilir. Surlu yerde savunanlar surun ardında durur. Ordu
// denizde battıysa sahne denizde geçer.
//
// Sadece gösteri: sonuç kurallarda çoktan belli (ev.before / ev.after), sahne onu canlandırır.
// Rastgelelik yok: aynı savaş hep aynı oynar (figürlerin sırası sayılardan çıkar).

import { CREAM, GOLD, GOLD_LIGHT, galley, shade } from "./pieces.js";
import { TAU, colorOf } from "./kit.js";

export const SCENE_MS = 2900;
const MAX_FIGS = 16;

const menOf = (u) => (u ? (u.inf ?? 0) + (u.arch ?? 0) + (u.cav ?? 0) + (u.siege ?? 0) + (u.elite ?? 0) : 0);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

/** Bir tarafın figürleri: türlerine göre (her tür en az bir), toplam en fazla MAX_FIGS. */
function figures(u) {
  const total = menOf(u);
  if (!total) return [];
  const n = Math.max(2, Math.min(MAX_FIGS, Math.round(4 + total / 25)));
  const out = [];
  for (const k of ["elite", "inf", "arch", "cav", "siege"]) {
    if (!u[k]) continue;
    const c = Math.max(1, Math.round((u[k] / total) * n));
    for (let i = 0; i < c; i++) out.push(k);
  }
  return out.slice(0, MAX_FIGS);
}

/** Figürlerin sahnedeki yerleri: özel birlik en önde, piyade önde, okçu arkada, süvari kanatta, makine en arkada. */
function layout(figs, side, r, walls) {
  const mid = r.x + r.w / 2, base = r.y + r.h - 12;
  const pos = [];
  const counts = { inf: 0, arch: 0, cav: 0, siege: 0, elite: 0 };
  const col = { inf: 0, arch: 1, cav: 0, siege: 2, elite: -0.8 };
  for (const k of figs) {
    const i = counts[k]++;
    const rowLen = k === "cav" || k === "elite" ? 3 : 4;
    const c = col[k] + Math.floor(i / rowLen) * (k === "cav" ? 0.9 : 1);
    const lane = i % rowLen;
    const front = walls && side < 0 ? 42 : 58;
    const x = mid - side * (front + c * 34 + (k === "cav" ? 14 : 0)) + (lane % 2) * side * -9;
    const y = base - lane * (k === "cav" || k === "elite" ? 19 : 15);
    pos.push({ k, x, y });
  }
  return pos;
}

/** Tek bir figür; `side` -1 sağa (saldıran), +1 sola bakar. */
export function trooper(ctx, k, owner, x, y, side, s = 1.05) {
  const color = colorOf(owner);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-side * s, s);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#2d2318";
  if (k === "elite") eliteFigure(ctx, owner, color);
  else if (k === "cav") {
    // At: gövde, boyun ve baş, bacaklar; üstünde süvari.
    ctx.fillStyle = "#6e4e33";
    ctx.beginPath();
    ctx.ellipse(0, -10, 11, 5, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, -12);
    ctx.lineTo(14, -20);
    ctx.lineTo(17, -18);
    ctx.lineTo(12, -9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (const lx of [-8, -4, 5, 9]) { ctx.moveTo(lx, -6); ctx.lineTo(lx + 1, 0); }
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(-3, -24, 6, 10);
    ctx.strokeRect(-3, -24, 6, 10);
    ctx.beginPath();
    ctx.arc(0, -27, 2.8, 0, TAU);
    ctx.fillStyle = "#d9b48c";
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#8a8f92";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-2, -20);
    ctx.lineTo(18, -30);
    ctx.stroke();
  } else if (k === "siege") {
    // Koçbaşı arabası: tekerlekler, çatı, kütük.
    ctx.fillStyle = "#7a5634";
    ctx.fillRect(-12, -14, 24, 9);
    ctx.lineWidth = 1;
    ctx.strokeRect(-12, -14, 24, 9);
    ctx.beginPath();
    ctx.moveTo(-14, -14);
    ctx.lineTo(0, -22);
    ctx.lineTo(14, -14);
    ctx.closePath();
    ctx.fillStyle = "#5b3f26";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#3b2a1a";
    for (const wx of [-8, 8]) {
      ctx.beginPath();
      ctx.arc(wx, -4, 4, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "#4a3523";
    ctx.fillRect(10, -12, 9, 3);
  } else {
    // Piyade ve okçu: bacaklar, tunik, baş; piyadede kalkan ve mızrak, okçuda yay.
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-1.6, 0);
    ctx.lineTo(-1.2, -6);
    ctx.moveTo(1.6, 0);
    ctx.lineTo(1.2, -6);
    ctx.stroke();
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
    ctx.beginPath();
    ctx.arc(0, -16.8, 2.8, 0, TAU);
    ctx.fillStyle = "#d9b48c";
    ctx.fill();
    ctx.stroke();
    if (k === "arch") {
      ctx.strokeStyle = "#6e4e33";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(4, -11, 6, -1.2, 1.2);
      ctx.stroke();
    } else {
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(5, 0);
      ctx.lineTo(9, -22);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(3.2, -9.5, 3.3, 4.5, 0, 0, TAU);
      ctx.fillStyle = shade(color, -0.2);
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---- medeniyete özel birlikler (numbers.js N.unique) ----
//
// Her medeniyetin kendi figürü, trooper'ın ölçeğinde (ayak y=0, ileri +x): Roma lejyoneri (büyük
// kalkan, sorguç), Kartaca fili (sırtında kule), Mısır savaş arabası, Makedon falanksı (uzun sarisa),
// Part katafraktı (zırhlı at ve atlı), Galya savaşçısı (çıplak gövde, uzun kalkan, kalkık kılıç),
// Saka atlı okçusu (sivri börk, yay). Bağımsızın elindeki seçkin asker sıradan piyade gibi.

const SKIN = "#d9b48c", INK_D = "#2d2318", STEEL = "#8a8f92", BRONZE = "#b08d3c";

function eliteFigure(ctx, owner, color) {
  if (owner === "carthage") elephant(ctx, color);
  else if (owner === "egypt") chariot(ctx, color);
  else if (owner === "parthia") { horse(ctx, "#7d8186", true); rider(ctx, shade(color, -0.25), "cone"); lance(ctx, -6, -19, 23, -23); }
  else if (owner === "saka") { horse(ctx, "#8a6a45", false); rider(ctx, color, "peak"); bow(ctx, 4, -23); }
  else if (owner === "gaul") warrior(ctx, color);
  else if (owner === "macedon") { footman(ctx, color, "bronze"); pike(ctx); roundShield(ctx, BRONZE); }
  else if (owner === "rome") { footman(ctx, color, "crest"); scutum(ctx, color); }
  else footman(ctx, color, null);
}

/** Yaya: bacaklar, tunik, baş; `helm`: "crest" (sorguçlu Roma miğferi), "bronze" (Yunan). */
function footman(ctx, color, helm) {
  ctx.strokeStyle = INK_D;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-1.6, 0); ctx.lineTo(-1.2, -6);
  ctx.moveTo(1.6, 0); ctx.lineTo(1.2, -6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-3.5, -5); ctx.lineTo(3.5, -5); ctx.lineTo(2.6, -14); ctx.lineTo(-2.6, -14);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -16.8, 2.8, 0, TAU);
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.stroke();
  if (helm) {
    ctx.beginPath();
    ctx.arc(0, -17.2, 3.1, Math.PI, TAU);
    ctx.fillStyle = helm === "bronze" ? BRONZE : STEEL;
    ctx.fill();
    ctx.stroke();
    if (helm === "crest") {
      ctx.fillStyle = "#b8332a";
      ctx.fillRect(-2.6, -22.6, 5.2, 2.4);
    }
  }
}

/** Roma kalkanı: uzun, kavisli dikdörtgen, ortasında altın göbek; arkasında kısa kılıç. */
function scutum(ctx, color) {
  ctx.strokeStyle = STEEL;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(4, -9); ctx.lineTo(10, -12);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(1.4, -15.5, 6, 14, 1.6) : ctx.rect(1.4, -15.5, 6, 14);
  ctx.fillStyle = shade(color, -0.15);
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(4.4, -8.5, 1.3, 0, TAU);
  ctx.fillStyle = GOLD_LIGHT;
  ctx.fill();
}

/** Makedon sarisası: yatıktan biraz kalkık, çok uzun mızrak. */
function pike(ctx) {
  ctx.strokeStyle = "#6e4e33";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-7, -7); ctx.lineTo(25, -18);
  ctx.stroke();
  ctx.strokeStyle = STEEL;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(23, -17.3); ctx.lineTo(27, -18.7);
  ctx.stroke();
}

function roundShield(ctx, fill) {
  ctx.beginPath();
  ctx.arc(3.6, -9.6, 4.8, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK_D;
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(3.6, -9.6, 1.4, 0, TAU);
  ctx.fillStyle = GOLD_LIGHT;
  ctx.fill();
}

/** Galya savaşçısı: renkli pantolon, çıplak gövde, dikleşmiş saç, uzun oval kalkan, kalkık kılıç. */
function warrior(ctx, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-1.7, 0); ctx.lineTo(-1.3, -7);
  ctx.moveTo(1.7, 0); ctx.lineTo(1.3, -7);
  ctx.stroke();
  ctx.strokeStyle = INK_D;
  ctx.beginPath();
  ctx.moveTo(-3.2, -6); ctx.lineTo(3.2, -6); ctx.lineTo(2.8, -14); ctx.lineTo(-2.8, -14);
  ctx.closePath();
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -16.8, 2.8, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#c9a14a";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (const dx of [-2, 0, 2]) { ctx.moveTo(dx, -19); ctx.lineTo(dx * 1.4, -22); }
  ctx.stroke();
  ctx.strokeStyle = STEEL;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-2, -13); ctx.lineTo(-6, -25);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(3.8, -9, 2.7, 6.8, 0, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.strokeStyle = INK_D;
  ctx.beginPath();
  ctx.moveTo(3.8, -15); ctx.lineTo(3.8, -3);
  ctx.stroke();
}

/** At: gövde, boyun ve baş, bacaklar; `armour`: pullu zırh (katafrakt). */
function horse(ctx, coat, armour) {
  ctx.strokeStyle = INK_D;
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.ellipse(0, -10, 11, 5, 0, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(8, -12); ctx.lineTo(14, -20); ctx.lineTo(17, -18); ctx.lineTo(12, -9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (armour) {
    ctx.strokeStyle = "rgba(240,240,235,0.55)";
    ctx.lineWidth = 0.7;
    for (let i = -8; i <= 8; i += 3) for (const yy of [-12, -9]) {
      ctx.beginPath();
      ctx.arc(i, yy, 1.4, 0, Math.PI);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = INK_D;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (const lx of [-8, -4, 5, 9]) { ctx.moveTo(lx, -6); ctx.lineTo(lx + 1, 0); }
  ctx.stroke();
}

/** Atlı: gövde ve baş; `hat`: "cone" (konik miğfer) ya da "peak" (Saka'nın sivri börkü). */
function rider(ctx, color, hat) {
  ctx.strokeStyle = INK_D;
  ctx.lineWidth = 1;
  ctx.fillStyle = color;
  ctx.fillRect(-3, -24, 6, 10);
  ctx.strokeRect(-3, -24, 6, 10);
  ctx.beginPath();
  ctx.arc(0, -27, 2.8, 0, TAU);
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  if (hat === "peak") { ctx.moveTo(-3, -28); ctx.lineTo(3, -28); ctx.lineTo(-1.5, -36); }
  else { ctx.moveTo(-3.1, -27.5); ctx.lineTo(3.1, -27.5); ctx.lineTo(0, -32.5); }
  ctx.closePath();
  ctx.fillStyle = hat === "peak" ? color : STEEL;
  ctx.fill();
  ctx.stroke();
}

function lance(ctx, x0, y0, x1, y1) {
  ctx.strokeStyle = "#6e4e33";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  ctx.stroke();
}

function bow(ctx, x, y) {
  ctx.strokeStyle = "#6e4e33";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, 6, -1.2, 1.2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(240,230,200,0.8)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(x + 6 * Math.cos(-1.2), y + 6 * Math.sin(-1.2));
  ctx.lineTo(x + 6 * Math.cos(1.2), y + 6 * Math.sin(1.2));
  ctx.stroke();
}

/** Kartaca fili: iri gri gövde, kalın bacaklar, kulak, hortum, fildişi; sırtında renkli kule. */
function elephant(ctx, color) {
  ctx.strokeStyle = INK_D;
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  for (const lx of [-8, -3, 4, 9]) { ctx.moveTo(lx, -8); ctx.lineTo(lx, 0); }
  ctx.stroke();
  ctx.strokeStyle = "#8d8a86";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const lx of [-8, -3, 4, 9]) { ctx.moveTo(lx, -8); ctx.lineTo(lx, -0.8); }
  ctx.stroke();
  ctx.strokeStyle = INK_D;
  ctx.fillStyle = "#8d8a86";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -14, 13, 8.5, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(12.5, -17, 5.8, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(16.5, -14);
  ctx.quadraticCurveTo(20.5, -8, 18.5, -2);
  ctx.stroke();
  ctx.strokeStyle = "#8d8a86";
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.strokeStyle = "#f3ead6";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(15, -12.5);
  ctx.quadraticCurveTo(18, -11, 20.5, -12.5);
  ctx.stroke();
  ctx.fillStyle = "#77736e";
  ctx.strokeStyle = INK_D;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.ellipse(9.5, -17, 3.2, 4.8, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  // Kule ve içinde bir mızraklı.
  ctx.fillStyle = color;
  ctx.fillRect(-7, -29, 11, 7);
  ctx.strokeRect(-7, -29, 11, 7);
  ctx.strokeStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(-7, -26); ctx.lineTo(4, -26);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-1.5, -31, 2.3, 0, TAU);
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.strokeStyle = INK_D;
  ctx.stroke();
  lance(ctx, -3, -29, 9, -36);
}

/** Mısır savaş arabası: önde at, arkada tekerlekli araba, üstünde yaylı. */
function chariot(ctx, color) {
  ctx.save();
  ctx.translate(9, 0);
  ctx.scale(0.82, 0.82);
  horse(ctx, "#a0784c", false);
  ctx.restore();
  ctx.strokeStyle = "#5b3f26";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-3, -9); ctx.lineTo(4, -9);
  ctx.stroke();
  ctx.strokeStyle = INK_D;
  ctx.fillStyle = shade(color, -0.1);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-12, -14); ctx.lineTo(-3, -14); ctx.lineTo(-3, -8); ctx.lineTo(-12, -8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-7.5, -5, 5, 0, TAU);
  ctx.fillStyle = "#6e4e33";
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    ctx.moveTo(-7.5 - 4.5 * Math.cos(a), -5 - 4.5 * Math.sin(a));
    ctx.lineTo(-7.5 + 4.5 * Math.cos(a), -5 + 4.5 * Math.sin(a));
  }
  ctx.stroke();
  // Arabadaki yaylı.
  ctx.strokeStyle = INK_D;
  ctx.lineWidth = 1;
  ctx.fillStyle = color;
  ctx.fillRect(-10, -23, 5, 9);
  ctx.strokeRect(-10, -23, 5, 9);
  ctx.beginPath();
  ctx.arc(-7.5, -25.6, 2.6, 0, TAU);
  ctx.fillStyle = SKIN;
  ctx.fill();
  ctx.stroke();
  bow(ctx, -4, -20);
}

/** Düşenler: kayıp oranı kadar figür, dağınık sırayla (her üç figürde bir değil). */
function fallers(n, lost) {
  const k = Math.round(n * clamp01(lost));
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => ((a * 7 + 3) % 11) - ((b * 7 + 3) % 11));
  return new Set(order.slice(0, k));
}

/**
 * Sahneyi çiz. `r` sahnenin kutusu, `t` başlangıçtan beri ms. `ev` savaşın olayı (saldıran
 * oyuncu), `walls` hedefin suru var mı.
 */
export function drawBattle(ctx, r, ev, t, walls) {
  const p = clamp01(t / SCENE_MS);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  // Denizde: limanın önünde batan saldırı ya da denizdeki meydan muharebesi.
  if (ev.drowned || (ev.field && ev.naval)) seaScene(ctx, r, ev, p);
  else landScene(ctx, r, ev, p, walls);
  ctx.restore();
  ctx.strokeStyle = "#2a2016";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}

function landScene(ctx, r, ev, p, walls) {
  // Gökyüzü ve toprak
  const sky = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  sky.addColorStop(0, "#c9cfc4");
  sky.addColorStop(0.45, "#e2d8bd");
  sky.addColorStop(0.46, "#a8a06a");
  sky.addColorStop(1, "#7f7a48");
  ctx.fillStyle = sky;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = "rgba(60,70,40,0.35)";
  for (let i = 0; i < 9; i++) {
    const hx = r.x + ((i * 53) % r.w);
    ctx.beginPath();
    ctx.ellipse(hx, r.y + r.h * 0.47, 40, 7, 0, Math.PI, 0);
    ctx.fill();
  }
  const mid = r.x + r.w / 2;
  if (walls) {
    // Sur: savunanların önünde, mazgallı, taş sıralı bir duvar.
    const wx = mid + 16, ww = 18, top = r.y + r.h * 0.52;
    ctx.fillStyle = "#d8ccb3";
    ctx.fillRect(wx, top, ww, r.y + r.h - top);
    ctx.fillStyle = "#b9ab8e";
    ctx.fillRect(wx + ww - 5, top, 5, r.y + r.h - top);
    ctx.strokeStyle = "#3b3024";
    ctx.lineWidth = 1;
    ctx.strokeRect(wx + 0.5, top + 0.5, ww - 1, r.y + r.h - top);
    ctx.beginPath();
    for (let y = top + 8, row = 0; y < r.y + r.h; y += 8, row++) {
      ctx.moveTo(wx, y);
      ctx.lineTo(wx + ww, y);
      const off = row % 2 ? 6 : 12;
      ctx.moveTo(wx + off, y - 8);
      ctx.lineTo(wx + off, y);
    }
    ctx.stroke();
    for (const mx of [wx - 1, wx + 7, wx + 14]) {
      ctx.fillStyle = "#d8ccb3";
      ctx.fillRect(mx, top - 6, 5, 6);
      ctx.strokeRect(mx + 0.5, top - 5.5, 4, 5.5);
    }
  }

  const att = figures(ev.before.att), def = figures(ev.before.def);
  const A = layout(att, 1, r, false), D = layout(def, -1, r, walls);
  const lostA = 1 - menOf(ev.after.att) / Math.max(1, menOf(ev.before.att));
  const lostD = 1 - menOf(ev.after.def) / Math.max(1, menOf(ev.before.def));
  const fallA = fallers(A.length, lostA), fallD = fallers(D.length, lostD);

  // Hareket: saldıranlar ilerler (süvari önce ve daha hızlı), savunanlar sur yoksa biraz ilerler.
  // Sonda kaybeden geri çekilip solar.
  const adv = (k, side) => {
    const go = side > 0 ? (k === "cav" ? ease(clamp01((p - 0.12) / 0.35)) * 70 : k === "inf" ? ease(clamp01((p - 0.25) / 0.35)) * 40 : 0)
      : walls ? 0 : k === "inf" ? ease(clamp01((p - 0.3) / 0.3)) * 18 : 0;
    const loser = (side > 0) !== ev.won;
    const back = loser ? ease(clamp01((p - 0.8) / 0.2)) * 50 : 0;
    return (go - back) * side;
  };

  // Oklar: okçulardan karşı tarafa yay çizerek.
  const volley = (from, to, side, start) => {
    for (let i = 0; i < from.length; i++) {
      if (from[i].k !== "arch") continue;
      for (const lag of [0, 0.12]) {
        const q = clamp01((p - start - lag - (i % 3) * 0.03) / 0.22);
        if (q <= 0 || q >= 1) continue;
        const tx = to.length ? to[i % to.length].x : mid - side * 60;
        const x0 = from[i].x, y0 = from[i].y - 14;
        const x = x0 + (tx - x0) * q, y = y0 + (to.length ? to[i % to.length].y - 10 - y0 : 0) * q - Math.sin(q * Math.PI) * 38;
        const dx = tx - x0, dy = -Math.cos(q * Math.PI) * 38 * Math.PI;
        const len = Math.hypot(dx, dy) || 1;
        ctx.strokeStyle = "#2d2318";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - (dx / len) * 7, y - (dy / len) * 7 * 0.4);
        ctx.stroke();
      }
    }
  };
  volley(A, D, 1, 0.05);
  volley(D, A, -1, 0.1);

  // Figürler: arkadakiler önce (y küçük önce).
  const draw = (list, owner, side, fall) => {
    const sorted = list.map((f, i) => ({ ...f, i })).sort((a, b) => a.y - b.y);
    for (const f of sorted) {
      const x = f.x + adv(f.k, side);
      const dying = fall.has(f.i);
      const loser = (side > 0) !== ev.won;
      const when = 0.45 + ((f.i * 0.37) % 0.35);
      const q = dying ? clamp01((p - when) / 0.12) : 0;
      ctx.save();
      ctx.globalAlpha = (dying ? 1 - q * 0.45 : 1) * (loser ? 1 - clamp01((p - 0.85) / 0.15) * 0.6 : 1);
      if (q > 0) {
        ctx.translate(x, f.y);
        ctx.rotate(side * q * 1.45);
        trooper(ctx, f.k, owner, 0, 0, side);
      } else trooper(ctx, f.k, owner, x, f.y + (f.k === "cav" && p > 0.12 && p < 0.5 ? -Math.abs(Math.sin(p * 40)) * 2 : 0), side);
      ctx.restore();
    }
  };
  draw(D, ev.defender, -1, fallD);
  draw(A, ev.attacker, 1, fallA);

  // Çarpışma: ortada kıvılcımlar.
  const hit = clamp01((p - 0.5) / 0.3);
  if (hit > 0 && hit < 1) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + p * 6, rr = 6 + hit * 22;
      const sx = mid + (walls ? 8 : 0) + Math.cos(a) * rr * 0.6, sy = r.y + r.h - 34 + Math.sin(a) * rr * 0.4;
      ctx.strokeStyle = i % 2 ? GOLD_LIGHT : "#d9532e";
      ctx.globalAlpha = 1 - hit;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a) * 5, sy + Math.sin(a) * 5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // Kazananın sancağı yükselir.
  const raise = clamp01((p - 0.82) / 0.18);
  if (raise > 0) {
    const winner = ev.won ? ev.attacker : ev.defender;
    const bx = ev.won ? mid + 10 : mid + 40, by = r.y + r.h - 20;
    const top = by - 26 - raise * 30;
    ctx.strokeStyle = "#3b3024";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, top);
    ctx.stroke();
    ctx.fillStyle = colorOf(winner);
    ctx.fillRect(bx, top, 16, 12);
    ctx.strokeRect(bx, top, 16, 12);
  }
}

function seaScene(ctx, r, ev, p) {
  const sea = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  sea.addColorStop(0, "#c9d3d0");
  sea.addColorStop(0.4, "#9fb6b8");
  sea.addColorStop(0.41, "#4f7680");
  sea.addColorStop(1, "#33545e");
  ctx.fillStyle = sea;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = "rgba(230,240,238,0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const wx = r.x + ((i * 37 + p * 60) % r.w), wy = r.y + r.h * 0.5 + (i % 5) * 14;
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.quadraticCurveTo(wx + 6, wy - 3, wx + 12, wy);
    ctx.stroke();
  }
  const mid = r.x + r.w / 2;
  // Kaç gemi çizilir, kaçı batar: meydan muharebesinde iki filonun sayıları biliniyor; limanın
  // önünde batan saldırıda saldıranın hepsi batar.
  const nv = ev.naval ?? {};
  const known = nv.att !== undefined;
  const na = Math.max(1, Math.min(4, known ? nv.att : nv.lost ?? 2)), nd = Math.max(1, Math.min(4, known ? nv.def : (nv.sunk ?? 0) + 1));
  const sinkA = known ? Math.round((na * nv.lost) / Math.max(1, nv.att)) : na;
  const sinkD = known ? Math.round((nd * nv.sunk) / Math.max(1, nv.def)) : nv.sunk ?? 0;
  const ship = (owner, i, n, side, sinking, sunkFrom) => {
    const go = ease(clamp01((p - 0.1) / 0.4)) * 50;
    const x = mid - side * (70 + i * 34) + side * go; // saldıran soldan sağa, savunan sağdan sola
    const y = r.y + r.h * 0.62 + (i % 2) * 18;
    const q = sinking ? clamp01((p - sunkFrom - i * 0.05) / 0.3) : 0;
    ctx.save();
    ctx.globalAlpha = 1 - q * 0.8;
    ctx.translate(x, y + q * 18);
    ctx.rotate(side * q * 0.6);
    galley(ctx, owner, 0, 0, 0.8, { flip: side < 0, troops: true });
    ctx.restore();
  };
  for (let i = nd - 1; i >= 0; i--) ship(ev.defender, i, nd, -1, i < sinkD, 0.55);
  for (let i = na - 1; i >= 0; i--) ship(ev.attacker, i, na, 1, i < sinkA, 0.55);
  // Ateş okları
  const q = clamp01((p - 0.35) / 0.25);
  if (q > 0 && q < 1) {
    for (let i = 0; i < 6; i++) {
      const x = mid - 40 + i * 14, y = r.y + r.h * 0.45 - Math.sin(q * Math.PI) * 24 + i * 3;
      ctx.fillStyle = i % 2 ? "#e8a53a" : CREAM;
      ctx.fillRect(x + q * 20, y, 3, 2);
    }
  }
}
