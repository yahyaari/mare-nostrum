// Taktik savaş ekranı (rules/tactics.js; kurallar.md bölüm 29). Kullanıcının gönderdiği görsel gibi: tepeden
// bir saha, her birlik bir nokta bloku (her nokta bir asker), sahibinin renginde. Türler hem dizilişten hem
// birliğin üstündeki rozetten ayrılır: piyade sık blok ve kılıç, okçu seyrek ve yay, süvari uzunca noktalar
// ve nal, kuşatma makinesi kareler ve tekerlek, özel birlik altın kenarlı noktalar ve yıldız. Üstte iki
// tarafın gücü ve süre, altta oyuncunun birliklerinin kartları ve düğmeler (duraklat, hız, otomatik, geri
// çekil); bir birlik seçiliyken sahanın altında Böl, Birleştir, Genişlet, Derinleştir. Sağ sürüklerken çizilen
// hat ve birliklerin orada alacağı yer soluk dikdörtgenlerle görünür. Savaş duraklatılmış başlar: önce
// emirler, sonra Başlat. Bitince sonuç panosu.

import { N } from "../rules/numbers.js";
import { extent, footprint, inside, moraleOf, strength } from "../rules/tactics.js";
import { CREAM, DARK, GOLD, GOLD_DARK, GOLD_LIGHT, roundRect, shade } from "./pieces.js";
import { INK, TAU, button, colorOf, measure, panel, text, wrap } from "./kit.js";

const TOP_H = 58, BOTTOM_H = 120;

/** Sahanın ekrandaki yeri: kenarlardan ve bantlardan arta kalan, 100 x 60 oranında. */
export function fieldRect(cam) {
  const { w: W, h: H } = N.tactics;
  const aw = cam.w - 24, ah = cam.h - TOP_H - BOTTOM_H - 12;
  const k = Math.min(aw / W, ah / H);
  return { x: (cam.w - W * k) / 2, y: TOP_H + 6 + (ah - H * k) / 2, w: W * k, h: H * k, k };
}

/** Ekran noktası -> saha noktası. */
export function toField(cam, x, y) {
  const f = fieldRect(cam);
  return { x: (x - f.x) / f.k, y: (y - f.y) / f.k };
}

/** Bir saha noktasındaki birlik (`side` verilirse yalnız o tarafın), yoksa null. */
export function unitAt(b, p, side = null) {
  let best = null, bd = Infinity;
  for (const u of b.units) {
    if (u.dead || u.gone || (side && u.side !== side) || !inside(u, p, 1.6)) continue;
    const d = Math.hypot(u.x - p.x, u.y - p.y);
    if (d < bd) { best = u; bd = d; }
  }
  return best;
}

// ---- çizim ----

export function drawTactics(ctx, cam, B, T, lang, boxes, now) {
  const b = B.b;
  const f = fieldRect(cam);
  // Arka plan: koyu çerçeve, ortada saha.
  ctx.fillStyle = "#2a2016";
  ctx.fillRect(0, 0, cam.w, cam.h);
  field(ctx, f, b);
  if (b.walls) wall(ctx, f, b);
  // Emir çizgileri (seçili birliklerin).
  for (const u of b.units) if (B.sel.has(u.id) && !u.dead && !u.gone && !u.routed && u.order) orderLine(ctx, f, b, u);
  // Birlikler: önce bozulanlar (altta), sonra ötekiler.
  const owner = { att: B.owners.att, def: B.owners.def };
  for (const u of [...b.units].sort((a, c) => (a.routed ? 0 : 1) - (c.routed ? 0 : 1))) {
    if (u.dead || u.gone) continue;
    block(ctx, f, u, owner[u.side], B.sel.has(u.id), now);
  }
  for (const s of b.shots) arrows(ctx, f, b, s);
  for (const e of b.fx) burst(ctx, f, b, e);
  for (const u of b.units) {
    if (u.dead || u.gone) continue;
    badge(ctx, f, u, owner[u.side], B.sel.has(u.id));
  }
  // Seçim kutusu.
  if (B.drag) {
    const x = Math.min(B.drag.x0, B.drag.x1), y = Math.min(B.drag.y0, B.drag.y1);
    ctx.strokeStyle = GOLD_LIGHT;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(B.drag.x1 - B.drag.x0), Math.abs(B.drag.y1 - B.drag.y0));
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(236,212,154,0.08)";
    ctx.fillRect(x, y, Math.abs(B.drag.x1 - B.drag.x0), Math.abs(B.drag.y1 - B.drag.y0));
  }
  // Sağ sürükleme: çizilen hat ve birliklerin orada alacağı yer.
  if (B.plan?.length) plan(ctx, f, B);
  topBar(ctx, cam, B, T, lang);
  bottomBar(ctx, cam, B, T, boxes);
  if (B.sel.size && !b.over) formationBar(ctx, cam, f, B, T, boxes);
  if (b.over) endPanel(ctx, cam, B, T, lang, boxes);
  else if (B.paused && b.t === 0) startHint(ctx, cam, f, T, boxes);
}

/** Saha: parşömen rengi toprak, kenarlarda ot ve kaya (tohumla hep aynı yerde). */
function field(ctx, f, b) {
  const g = ctx.createRadialGradient(f.x + f.w / 2, f.y + f.h / 2, f.h * 0.2, f.x + f.w / 2, f.y + f.h / 2, f.w * 0.75);
  g.addColorStop(0, "#d9c9a0");
  g.addColorStop(1, "#b9a47a");
  ctx.fillStyle = g;
  ctx.fillRect(f.x, f.y, f.w, f.h);
  let s = b.seed * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  // Toprakta lekeler.
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(120,100,60,${0.05 + r() * 0.06})`;
    ctx.beginPath();
    ctx.ellipse(f.x + r() * f.w, f.y + r() * f.h, (2 + r() * 8) * f.k, (1 + r() * 4) * f.k, r() * 3, 0, TAU);
    ctx.fill();
  }
  // Ot öbekleri ve kayalar, çoğu kenarlara yakın.
  for (let i = 0; i < 46; i++) {
    const edge = r() < 0.75;
    const x = f.x + r() * f.w;
    const y = edge ? (r() < 0.5 ? f.y + r() * f.h * 0.12 : f.y + f.h - r() * f.h * 0.12) : f.y + r() * f.h;
    if (r() < 0.75) {
      ctx.strokeStyle = `rgba(${70 + r() * 30},${95 + r() * 30},50,0.8)`;
      ctx.lineWidth = Math.max(1, 0.25 * f.k);
      ctx.beginPath();
      for (let j = -2; j <= 2; j++) { ctx.moveTo(x + j * 0.5 * f.k, y); ctx.lineTo(x + j * 0.9 * f.k, y - (1.2 + r()) * f.k); }
      ctx.stroke();
    } else {
      ctx.fillStyle = "#9a7b5c";
      ctx.strokeStyle = "rgba(60,45,30,0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, (1.2 + r() * 1.6) * f.k, (0.8 + r()) * f.k, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }
  // Kenar gölgesi.
  const v = ctx.createRadialGradient(f.x + f.w / 2, f.y + f.h / 2, f.h * 0.45, f.x + f.w / 2, f.y + f.h / 2, f.w * 0.62);
  v.addColorStop(0, "rgba(40,30,15,0)");
  v.addColorStop(1, "rgba(40,30,15,0.35)");
  ctx.fillStyle = v;
  ctx.fillRect(f.x, f.y, f.w, f.h);
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 2;
  ctx.strokeRect(f.x - 1, f.y - 1, f.w + 2, f.h + 2);
}

/** Sur: savunanın önünde taş bir duvar, burçlarıyla; ardında birkaç ev. */
function wall(ctx, f, b) {
  const x = f.x + N.tactics.wallX * f.k;
  ctx.fillStyle = "#8f8574";
  ctx.strokeStyle = "rgba(40,32,22,0.8)";
  ctx.lineWidth = 1.2;
  ctx.fillRect(x - 1.1 * f.k, f.y, 2.2 * f.k, f.h);
  ctx.strokeRect(x - 1.1 * f.k, f.y, 2.2 * f.k, f.h);
  for (let y = 0; y < N.tactics.h; y += 8) {
    ctx.fillStyle = "#a39985";
    ctx.fillRect(x - 2 * f.k, f.y + (y + 2) * f.k, 4 * f.k, 3.2 * f.k);
    ctx.strokeRect(x - 2 * f.k, f.y + (y + 2) * f.k, 4 * f.k, 3.2 * f.k);
  }
  // Evler.
  for (let i = 0; i < 9; i++) {
    const hx = f.x + (N.tactics.wallX + 6 + (i % 3) * 6) * f.k, hy = f.y + (8 + Math.floor(i / 3) * 18 + (i % 2) * 5) * f.k;
    ctx.fillStyle = "#cdb995";
    ctx.fillRect(hx, hy, 3.2 * f.k, 2.4 * f.k);
    ctx.fillStyle = "#9c5b3e";
    ctx.beginPath();
    ctx.moveTo(hx - 0.4 * f.k, hy);
    ctx.lineTo(hx + 1.6 * f.k, hy - 1.4 * f.k);
    ctx.lineTo(hx + 3.6 * f.k, hy);
    ctx.closePath();
    ctx.fill();
  }
}

/** Bir birliğin noktaları: cephe yönüne dik sıralar; ölenler arkadan eksilir. */
function block(ctx, f, u, owner, selected, now) {
  const fp = footprint(u);
  const color = colorOf(owner);
  const n = Math.max(1, Math.round(u.men));
  const cos = Math.cos(u.facing), sin = Math.sin(u.facing);
  const r = Math.max(1.6, 0.36 * f.k * (u.mounted || u.type === "cav" ? 1.15 : 1));
  const shake = u.engaged ? 0.25 : 0;
  ctx.save();
  if (u.routed) ctx.globalAlpha = 0.55;
  if (selected) {
    rectPath(ctx, f, u.x, u.y, u.facing, fp.d / 2 + 0.9, fp.w / 2 + 0.9);
    ctx.fillStyle = "rgba(236,212,154,0.18)";
    ctx.fill();
    ctx.strokeStyle = GOLD_LIGHT;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Cephe: önünde küçük bir ok.
    const tx = f.x + (u.x + cos * (fp.d / 2 + 2.2)) * f.k, ty = f.y + (u.y + sin * (fp.d / 2 + 2.2)) * f.k;
    ctx.beginPath();
    ctx.moveTo(tx + cos * 5, ty + sin * 5);
    ctx.lineTo(tx - sin * 4, ty + cos * 4);
    ctx.lineTo(tx + sin * 4, ty - cos * 4);
    ctx.closePath();
    ctx.fillStyle = GOLD_LIGHT;
    ctx.fill();
  }
  for (let i = 0; i < n; i++) {
    const row = i % fp.rows, col = Math.floor(i / fp.rows);
    // Yerel: ileri (cephe) -row, yan col; bozulan dağınık.
    let fx = (fp.rows / 2 - row - 0.5) * fp.sp, fy = (col - (fp.cols - 1) / 2) * fp.sp;
    if (u.routed) { fx += Math.sin(i * 12.9898) * 2.5; fy += Math.cos(i * 78.233) * 2.5; }
    if (shake) { fx += Math.sin(now / 90 + i) * shake; fy += Math.cos(now / 110 + i * 1.7) * shake; }
    const x = f.x + (u.x + fx * cos - fy * sin) * f.k, y = f.y + (u.y + fx * sin + fy * cos) * f.k;
    ctx.beginPath();
    if (u.type === "siege") ctx.rect(x - r, y - r, r * 2, r * 2);
    else if (u.mounted || u.type === "cav") ctx.ellipse(x, y, r * 1.35, r * 0.85, u.facing, 0, TAU);
    else ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = u.kind === "arch" && !u.elite ? shade(color, 0.25) : color;
    ctx.fill();
    ctx.lineWidth = u.elite ? 1.4 : 0.9;
    ctx.strokeStyle = u.elite ? GOLD_LIGHT : "rgba(20,14,8,0.85)";
    ctx.stroke();
  }
  ctx.restore();
}

/** Bir birliğin dikdörtgen yolu (saha birimiyle merkez, cephe yönü, yarı derinlik, yarı genişlik). */
function rectPath(ctx, f, x, y, facing, hd, hw) {
  const c = Math.cos(facing), s = Math.sin(facing);
  const pt = (a, b) => [f.x + (x + a * c - b * s) * f.k, f.y + (y + a * s + b * c) * f.k];
  ctx.beginPath();
  for (const [i, [a, b]] of [[hd, -hw], [hd, hw], [-hd, hw], [-hd, -hw]].entries()) {
    const [px, py] = pt(a, b);
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

/** Sağ sürüklemenin önizlemesi: hat ve her birliğin varacağı yer (soluk dikdörtgen, cephesi altın). */
function plan(ctx, f, B) {
  ctx.save();
  ctx.strokeStyle = "rgba(236,212,154,0.9)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(B.drawLine.x0, B.drawLine.y0);
  ctx.lineTo(B.drawLine.x1, B.drawLine.y1);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const t of B.plan) {
    const u = B.b.units.find((v) => v.id === t.id);
    if (!u) continue;
    const fp = footprint({ ...u, cols: t.cols });
    rectPath(ctx, f, t.x, t.y, t.facing, fp.d / 2, fp.w / 2);
    ctx.fillStyle = "rgba(236,212,154,0.22)";
    ctx.fill();
    ctx.strokeStyle = GOLD_LIGHT;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

/** Seçili birlikler için: Böl, Birleştir, Genişlet, Derinleştir (sahanın alt kenarında). */
function formationBar(ctx, cam, f, B, T, boxes) {
  const sel = B.b.units.filter((u) => B.sel.has(u.id) && !u.dead && !u.gone && !u.routed);
  if (!sel.length) return;
  const one = sel.length === 1 ? sel[0] : null;
  const sameType = sel.length > 1 && sel.every((u) => u.type === sel[0].type);
  const btns = [
    { label: T.tacSplit, act: { do: "tacSplit" }, off: !one || one.men < N.tactics.minSplit * 2, tip: [T.tacSplit, T.tacSplitTip] },
    { label: T.tacMerge, act: { do: "tacMerge" }, off: !sameType, tip: [T.tacMerge, T.tacMergeTip] },
    { label: T.tacWide, act: { do: "tacWide" }, tip: [T.tacWide, T.tacWideTip] },
    { label: T.tacDeep, act: { do: "tacDeep" }, tip: [T.tacDeep, T.tacDeepTip] },
  ];
  const bw = 112, gap = 6, w = btns.length * bw + (btns.length - 1) * gap;
  const x0 = cam.w / 2 - w / 2, y = f.y + f.h - 40;
  ctx.fillStyle = "rgba(28,21,14,0.75)";
  roundRect(ctx, x0 - 8, y - 6, w + 16, 40, 6);
  ctx.fill();
  btns.forEach((o, i) => button(ctx, boxes, { x: x0 + i * (bw + gap), y, w: bw, h: 28, size: 13, ...o }));
  // Seçili birliğin dizilişi: kaç sıra, kaç asker cephe.
  if (one) {
    const fp = footprint(one);
    text(ctx, `${fp.cols} × ${fp.rows}`, x0 + w + 16, y + 19, { bold: true, size: 12, color: GOLD_LIGHT });
  }
}

/** Birliğin rozeti: türünün simgesi, sayısı, moral çubuğu. */
function badge(ctx, f, u, owner, selected) {
  const x = f.x + u.x * f.k, y = f.y + (u.y - extent(u).y) * f.k - 13;
  const R = 9;
  ctx.save();
  if (u.routed) ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fillStyle = selected ? GOLD_LIGHT : colorOf(owner);
  ctx.fill();
  ctx.strokeStyle = selected ? DARK : u.elite ? GOLD_LIGHT : "rgba(20,14,8,0.9)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  glyph(ctx, u.elite ? "elite" : u.type, x, y, selected ? DARK : CREAM);
  // Moral (yeşil -> kızıl) ve sayı.
  const m = Math.max(0, Math.min(1, moraleOf(u) / 100));
  ctx.fillStyle = "rgba(20,14,8,0.7)";
  ctx.fillRect(x - 11, y + R + 2, 22, 3.5);
  ctx.fillStyle = u.routed ? "#9a4a3a" : m > 0.5 ? "#7fb85a" : m > 0.25 ? "#d6a63a" : "#c4523a";
  ctx.fillRect(x - 11, y + R + 2, 22 * (u.routed ? 1 : m), 3.5);
  text(ctx, u.routed ? "!" : String(Math.ceil(u.men)), x + R + 3, y + 4, { bold: true, size: 11, color: CREAM });
  ctx.restore();
}

/** Tür simgesi: kılıç (piyade), yay (okçu), nal (süvari), tekerlek (makine), yıldız (özel). */
function glyph(ctx, kind, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (kind === "inf") {
    ctx.moveTo(-4, 4); ctx.lineTo(4, -4); ctx.moveTo(4, 4); ctx.lineTo(-4, -4);
    ctx.moveTo(-5, 1.5); ctx.lineTo(-1.5, 5); ctx.moveTo(5, 1.5); ctx.lineTo(1.5, 5);
    ctx.stroke();
  } else if (kind === "arch") {
    ctx.arc(-1, 0, 5, -1.1, 1.1);
    ctx.moveTo(-1 + 5 * Math.cos(-1.1), 5 * Math.sin(-1.1)); ctx.lineTo(-1 + 5 * Math.cos(1.1), 5 * Math.sin(1.1));
    ctx.moveTo(-3, 0); ctx.lineTo(5, 0);
    ctx.stroke();
  } else if (kind === "cav") {
    ctx.arc(0, -0.5, 4, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-3.6, 1.5); ctx.lineTo(-3.6, 4); ctx.moveTo(3.6, 1.5); ctx.lineTo(3.6, 4);
    ctx.stroke();
  } else if (kind === "siege") {
    ctx.arc(0, 0, 4.2, 0, TAU);
    for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.moveTo(-4.2 * Math.cos(a), -4.2 * Math.sin(a)); ctx.lineTo(4.2 * Math.cos(a), 4.2 * Math.sin(a)); }
    ctx.stroke();
  } else {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 2.3 : 5.4;
      if (i) ctx.lineTo(rr * Math.cos(a), rr * Math.sin(a)); else ctx.moveTo(rr * Math.cos(a), rr * Math.sin(a));
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Seçili birliğin emri: hedefe kesik çizgi, ucunda işaret (düşmansa kızıl). */
function orderLine(ctx, f, b, u) {
  const t = u.order.unit ? b.units.find((v) => v.id === u.order.unit) : u.order;
  if (!t) return;
  const foe = !!u.order.unit;
  ctx.save();
  ctx.strokeStyle = foe ? "rgba(214,90,60,0.9)" : "rgba(236,212,154,0.9)";
  ctx.lineWidth = 1.6;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(f.x + u.x * f.k, f.y + u.y * f.k);
  ctx.lineTo(f.x + t.x * f.k, f.y + t.y * f.k);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(f.x + t.x * f.k, f.y + t.y * f.k, foe ? 6 : 4, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Uçan oklar: atandan hedefe kavisli, varınca söner. */
function arrows(ctx, f, b, s) {
  const p = Math.max(0, Math.min(1, (b.t - s.t0) / (s.t1 - s.t0)));
  ctx.save();
  ctx.strokeStyle = "rgba(40,28,16,0.85)";
  ctx.lineWidth = 1.1;
  for (let i = 0; i < s.n; i++) {
    const ox = Math.sin(i * 7.31) * 2.2, oy = Math.cos(i * 3.17) * 2.2;
    const x0 = s.from.x + ox * 0.4, y0 = s.from.y + oy * 0.4, x1 = s.at.x + ox, y1 = s.at.y + oy;
    const x = x0 + (x1 - x0) * p, y = y0 + (y1 - y0) * p - Math.sin(p * Math.PI) * 5;
    const dx = (x1 - x0) / (Math.hypot(x1 - x0, y1 - y0) || 1), dy = (y1 - y0) / (Math.hypot(x1 - x0, y1 - y0) || 1) - Math.cos(p * Math.PI) * 0.6;
    ctx.beginPath();
    ctx.moveTo(f.x + x * f.k, f.y + y * f.k);
    ctx.lineTo(f.x + (x - dx * 1.2) * f.k, f.y + (y - dy * 1.2) * f.k);
    ctx.stroke();
  }
  ctx.restore();
}

/** Hücum tozu ve bozulma işareti. */
function burst(ctx, f, b, e) {
  const age = b.t - e.t;
  const a = Math.max(0, 1 - age / 1.6);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  if (e.kind === "charge") {
    ctx.strokeStyle = "rgba(120,90,50,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(f.x + e.x * f.k, f.y + e.y * f.k, (2 + age * 6) * f.k, 0, TAU);
    ctx.stroke();
  } else {
    text(ctx, "!", f.x + e.x * f.k, f.y + e.y * f.k - 20 - age * 12, { bold: true, size: 20, color: "#c4523a", align: "center" });
  }
  ctx.restore();
}

/** Üst bant: iki tarafın adı ve gücü, ortada başlık ve süre. */
function topBar(ctx, cam, B, T, lang) {
  ctx.fillStyle = "#1c150e";
  ctx.fillRect(0, 0, cam.w, TOP_H);
  ctx.fillStyle = GOLD_DARK;
  ctx.fillRect(0, TOP_H - 2, cam.w, 2);
  const side = (s, x, align) => {
    const st = strength(B.b, s);
    const name = B.names[s];
    text(ctx, name, x, 24, { bold: true, size: 15, color: CREAM, align });
    const bw = Math.min(260, cam.w * 0.24), bx = align === "left" ? x : x - bw;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(bx, 34, bw, 10);
    ctx.fillStyle = colorOf(B.owners[s]);
    const k = st.start ? st.men / st.start : 0;
    if (align === "left") ctx.fillRect(bx, 34, bw * k, 10); else ctx.fillRect(bx + bw * (1 - k), 34, bw * k, 10);
    ctx.strokeStyle = GOLD_DARK;
    ctx.strokeRect(bx + 0.5, 34.5, bw - 1, 9);
    text(ctx, String(st.men), align === "left" ? bx + bw + 8 : bx - 8, 44, { bold: true, size: 12, color: GOLD_LIGHT, align: align === "left" ? "left" : "right" });
  };
  side("att", 18, "left");
  side("def", cam.w - 18, "right");
  const left = Math.max(0, Math.ceil(N.tactics.time - B.b.t));
  text(ctx, B.title, cam.w / 2, 24, { title: true, bold: true, size: 16, color: GOLD_LIGHT, align: "center" });
  const status = B.b.over ? "" : B.paused ? T.tacPaused : `${T.tacTime} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}${B.speed > 1 ? `  ·  x${B.speed}` : ""}${B.auto ? `  ·  ${T.tacAuto}` : ""}`;
  text(ctx, status, cam.w / 2, 45, { italic: true, size: 12, color: B.paused ? GOLD_LIGHT : CREAM, align: "center" });
}

/** Alt bant: oyuncunun birliklerinin kartları (basınca seçer) ve düğmeler. */
function bottomBar(ctx, cam, B, T, boxes) {
  const y0 = cam.h - BOTTOM_H;
  ctx.fillStyle = "#1c150e";
  ctx.fillRect(0, y0, cam.w, BOTTOM_H);
  ctx.fillStyle = GOLD_DARK;
  ctx.fillRect(0, y0, cam.w, 2);
  const mine = B.b.units.filter((u) => u.side === "att");
  const bw = 120, right = cam.w - 16 - bw;
  const cw = Math.min(62, (right - 24 - 6 * mine.length) / Math.max(1, mine.length));
  mine.forEach((u, i) => {
    const x = 16 + i * (cw + 6), y = y0 + 14, h = BOTTOM_H - 28;
    const on = B.sel.has(u.id), out = u.dead || u.gone;
    roundRect(ctx, x, y, cw, h, 4);
    ctx.fillStyle = out ? "rgba(60,50,40,0.5)" : on ? "#4a3a26" : DARK;
    ctx.fill();
    ctx.strokeStyle = on ? GOLD_LIGHT : GOLD_DARK;
    ctx.lineWidth = on ? 2 : 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + cw / 2, y + 22, 13, 0, TAU);
    ctx.fillStyle = out ? "#555" : colorOf(B.owners.att);
    ctx.fill();
    ctx.strokeStyle = u.elite ? GOLD_LIGHT : "rgba(20,14,8,0.9)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    glyph(ctx, u.elite ? "elite" : u.type, x + cw / 2, y + 22, CREAM);
    text(ctx, out ? (u.dead ? "✕" : "↩") : u.routed ? "!" : String(Math.ceil(u.men)), x + cw / 2, y + 52, { bold: true, size: 13, color: u.routed ? "#d97a5a" : CREAM, align: "center" });
    const nm = B.unitName(u);
    let size = 10;
    while (size > 7 && measure(ctx, nm, { size }) > cw - 4) size -= 0.5;
    text(ctx, nm, x + cw / 2, y + 66, { size, color: "rgba(243,231,201,0.75)", align: "center" });
    const m = out || u.routed ? 0 : Math.max(0, Math.min(1, moraleOf(u) / 100));
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x + 6, y + h - 12, cw - 12, 5);
    ctx.fillStyle = m > 0.5 ? "#7fb85a" : m > 0.25 ? "#d6a63a" : "#c4523a";
    ctx.fillRect(x + 6, y + h - 12, (cw - 12) * m, 5);
    if (!out) boxes.push({ x, y, w: cw, h, act: { do: "tacPick", id: u.id }, tip: [B.unitName(u), `${Math.ceil(u.men)} / ${u.start}`] });
  });
  // Düğmeler: sağda alt alta.
  const bx = right, by = y0 + 10;
  const over = !!B.b.over;
  button(ctx, boxes, { x: bx - bw - 8, y: by, w: bw, h: 30, label: B.paused ? (B.b.t === 0 ? T.tacBegin : T.tacGo) : T.tacPause, main: B.paused, size: 13, off: over, act: { do: "tacPause" }, tip: [T.tacPause, T.tacSpaceTip] });
  button(ctx, boxes, { x: bx, y: by, w: bw, h: 30, label: `${T.tacSpeed} x${B.speed}`, size: 13, off: over, act: { do: "tacSpeed" } });
  button(ctx, boxes, { x: bx - bw - 8, y: by + 36, w: bw, h: 30, label: T.tacAuto, main: B.auto, size: 13, off: over, act: { do: "tacAuto" }, tip: [T.tacAuto, T.tacAutoTip] });
  button(ctx, boxes, { x: bx, y: by + 36, w: bw, h: 30, label: T.tacRetreat, size: 13, off: over, act: { do: "tacRetreat" }, tip: [T.tacRetreat, T.tacRetreatTip] });
  wrap(ctx, T.tacHelp, bw * 2 + 8, { italic: true, size: 11 }).slice(0, 2).forEach((l, i) => text(ctx, l, bx - bw - 8, by + 84 + i * 13, { italic: true, size: 11, color: "rgba(243,231,201,0.6)" }));
}

/** Başlangıç: savaş duraklatılmış; emirleri ver, sonra başlat. */
function startHint(ctx, cam, f, T, boxes) {
  const w = Math.min(520, f.w * 0.5), h = 104, x = (cam.w - w) / 2, y = f.y + f.h / 2 - h / 2;
  panel(ctx, x, y, w, h);
  text(ctx, T.tacStartTitle, cam.w / 2, y + 30, { bold: true, size: 16, align: "center" });
  wrap(ctx, T.tacStartHint, w - 30, { italic: true, size: 12 }).slice(0, 2).forEach((l, i) => text(ctx, l, cam.w / 2, y + 48 + i * 14, { italic: true, size: 12, color: INK.soft, align: "center" }));
  button(ctx, boxes, { x: cam.w / 2 - 90, y: y + h - 32, w: 180, h: 26, label: T.tacStart, main: true, size: 13, act: { do: "tacPause" } });
}

/** Sonuç panosu: zafer ya da yenilgi, iki tarafın kaybı, haritaya dön. */
function endPanel(ctx, cam, B, T, lang, boxes) {
  const won = B.b.over.winner === "att";
  const w = Math.min(460, cam.w - 40), h = 176, x = (cam.w - w) / 2, y = (cam.h - h) / 2 - 20;
  panel(ctx, x, y, w, h);
  text(ctx, won ? T.tacWon : B.b.over.retreat ? T.tacFled : T.tacLost, cam.w / 2, y + 42, { title: true, bold: true, size: 24, align: "center", color: won ? INK.good : INK.bad });
  const lost = (s) => B.b.units.filter((u) => u.side === s).reduce((n, u) => n + (u.start - Math.floor(u.dead ? 0 : u.men)), 0);
  const fled = (s) => B.b.units.filter((u) => u.side === s && (u.routed || u.gone) && !u.dead).reduce((n, u) => n + Math.floor(u.men), 0);
  text(ctx, `${T.tacYourLoss}: ${lost("att")}  ·  ${T.tacTheirLoss}: ${lost("def")}`, cam.w / 2, y + 74, { size: 14, align: "center" });
  const note = B.b.over.timeout ? T.tacTimeout : won ? (fled("def") ? `${T.tacTheyFled}: ${fled("def")}` : "") : fled("att") ? `${T.tacWeFled}: ${fled("att")}` : "";
  if (note) text(ctx, note, cam.w / 2, y + 98, { italic: true, size: 12, color: INK.soft, align: "center" });
  button(ctx, boxes, { x: cam.w / 2 - 110, y: y + h - 52, w: 220, h: 38, label: T.tacBack, main: true, size: 15, act: { do: "tacEnd" } });
}
