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
import { BRIDGE, FOREST, WATER, placeName, sidePoint, wallAt } from "../rules/field.js";
import { TITLE_FONT } from "./kit.js";
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
  // Arazi bir kere çizilir (saha boyutu ya da dil değişince yeniden).
  ctx.drawImage(terrainLayer(f, b, T, lang, ctx.getTransform().a), f.x, f.y, f.w, f.h);
  if (b.field.city) wall(ctx, f, b);
  // Yerdeki ölüler.
  corpses(ctx, f, B);
  // Askerler kendi yerlerine yürür (duraklatılınca durur).
  const dt = B.paused || b.over ? 0 : Math.min(0.1, Math.max(0, (now - (B.dotT ?? now)) / 1000)) * B.speed;
  B.dotT = now;
  // Emir çizgileri (seçili birliklerin).
  for (const u of b.units) if (B.sel.has(u.id) && !u.dead && !u.gone && !u.routed && u.order) orderLine(ctx, f, b, u);
  // Birlikler: önce bozulanlar (altta), sonra ötekiler.
  const owner = { att: B.owners.att, def: B.owners.def };
  for (const u of [...b.units].sort((a, c) => (a.routed ? 0 : 1) - (c.routed ? 0 : 1))) {
    if (u.dead || u.gone) continue;
    block(ctx, f, B, u, owner[u.side], B.sel.has(u.id), dt);
  }
  // Merdivenler (askerlerin üstünde): sura dayanıp tırmanan birliklerin yerinde, üstünde tek sıra askerler.
  if (b.walls) for (const u of b.units) if (u.climbing && u.ladder && !u.dead && !u.gone) ladder(ctx, f, u, B.owners[u.side], now);
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

let layer = null; // { key, canvas }

/** Arazinin önbellek resmi: toprak, tepeler, su ve nehirler, orman, köprüler, evler, adlar. */
function terrainLayer(f, b, T, lang, dpr) {
  const key = `${Math.round(f.w)}|${Math.round(f.h)}|${dpr}|${b.seed}|${lang}`;
  if (layer?.key === key && layer.field === b.field) return layer.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(f.w * dpr);
  canvas.height = Math.round(f.h * dpr);
  const c = canvas.getContext("2d");
  c.scale(dpr, dpr);
  const g = { x: 0, y: 0, w: f.w, h: f.h, k: f.k };
  field(c, g, b);
  terrain(c, g, b.field, T, lang);
  layer = { key, canvas, field: b.field };
  return canvas;
}

/** Tepeler, su, orman, köprü, ev ve adlar (field.js). */
function terrain(ctx, f, F, T, lang) {
  const k = f.k;
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Tepeler: iç içe, kenarı gürültülü halkalar; dağ (en büyüğü) kalın, kayalık kenarlı (görseldeki gibi).
  for (const hl of F.hills) {
    const rings = hl.big ? 5 : 3;
    for (let i = 0; i < rings; i++) {
      const sc = 1.15 - (i / rings) * 0.85;
      ctx.beginPath();
      for (let a = 0; a <= 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        const n = 1 + Math.sin(t * 5 + hl.x) * 0.06 + Math.sin(t * 11 + hl.y) * 0.04;
        const ex = Math.cos(t) * hl.rx * sc * n, ey = Math.sin(t) * hl.ry * sc * n;
        const x = f.x + (hl.x + ex * Math.cos(hl.rot) - ey * Math.sin(hl.rot)) * k, y = f.y + (hl.y + ex * Math.sin(hl.rot) + ey * Math.cos(hl.rot)) * k;
        if (a) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(120,92,58,${0.06 + hl.peak * 0.05})`;
      ctx.fill();
      ctx.strokeStyle = i === 0 && hl.big ? "rgba(92,66,40,0.9)" : "rgba(110,84,52,0.45)";
      ctx.lineWidth = i === 0 && hl.big ? Math.max(3, k * 0.9) : 1.2;
      ctx.stroke();
      if (i === 0 && hl.big) {
        // Kayalık kenar: dışa doğru kısa çizgiler.
        ctx.strokeStyle = "rgba(80,58,36,0.7)";
        ctx.lineWidth = 1;
        for (let a = 0; a < 90; a++) {
          const t = (a / 90) * Math.PI * 2, n = 1 + Math.sin(t * 5 + hl.x) * 0.06 + Math.sin(t * 11 + hl.y) * 0.04;
          const ex = Math.cos(t) * hl.rx * sc * n, ey = Math.sin(t) * hl.ry * sc * n, len = 0.5 + r() * 0.9;
          const x = hl.x + ex * Math.cos(hl.rot) - ey * Math.sin(hl.rot), y = hl.y + ex * Math.sin(hl.rot) + ey * Math.cos(hl.rot);
          const dx = x - hl.x, dy = y - hl.y, d = Math.hypot(dx, dy) || 1;
          ctx.beginPath();
          ctx.moveTo(f.x + x * k, f.y + y * k);
          ctx.lineTo(f.x + (x + (dx / d) * len) * k, f.y + (y + (dy / d) * len) * k);
          ctx.stroke();
        }
      }
    }
  }
  if (F.city) cityGround(ctx, f, F.city);
  // Su: önce kıyı rengi geniş, sonra su; nehirler ayrıca kıvrımlı çizgi (kıyı, su, ortada açık).
  const cells = (kind) => { const out = []; for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) if (F.kind[y * F.w + x] === kind) out.push([x, y]); return out; };
  const water = cells(WATER);
  for (const [rad, color] of [[0.95, "#6d8a80"], [0.72, "#4f7a8f"]]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const [x, y] of water) { ctx.moveTo(f.x + (x + 0.5 + rad) * k, f.y + (y + 0.5) * k); ctx.arc(f.x + (x + 0.5) * k, f.y + (y + 0.5) * k, rad * k, 0, TAU); }
    ctx.fill();
  }
  const rw = N.tactics.terrain.riverWidth;
  for (const river of F.rivers) {
    for (const [wd, color] of [[rw + 0.8, "#5f7f78"], [rw - 0.4, "#3f6a82"], [rw * 0.35, "rgba(150,190,205,0.45)"]]) {
      ctx.beginPath();
      river.forEach((p, i) => (i ? ctx.lineTo(f.x + p.x * k, f.y + p.y * k) : ctx.moveTo(f.x + p.x * k, f.y + p.y * k)));
      ctx.strokeStyle = color;
      ctx.lineWidth = wd * k;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }
  // Orman: her hücrede bir ağaç (koyu yeşil taç, gölgeli), aşağıdakiler üstte.
  for (const [x, y] of cells(FOREST)) {
    const jx = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1, jy = (Math.sin(x * 39.346 + y * 11.135) * 24634.6345) % 1;
    const cx = f.x + (x + 0.5 + jx * 0.4) * k, cy = f.y + (y + 0.5 + jy * 0.4) * k, rad = k * (0.55 + Math.abs(jx) * 0.25);
    ctx.beginPath();
    ctx.arc(cx + rad * 0.25, cy + rad * 0.3, rad, 0, TAU);
    ctx.fillStyle = "rgba(30,40,20,0.35)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, TAU);
    ctx.fillStyle = Math.abs(jy) > 0.5 ? "#3f5c33" : "#4a6a3a";
    ctx.fill();
    ctx.strokeStyle = "rgba(22,32,16,0.75)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  // Köprüler: tahta, kenar çizgili.
  for (const br of F.bridges) {
    ctx.save();
    ctx.translate(f.x + br.x * k, f.y + br.y * k);
    ctx.rotate(br.a);
    ctx.fillStyle = "#8a6a45";
    ctx.fillRect((-br.len / 2) * k, (-br.w / 2) * k, br.len * k, br.w * k);
    ctx.strokeStyle = "rgba(50,34,20,0.9)";
    ctx.lineWidth = 1.2;
    ctx.strokeRect((-br.len / 2) * k, (-br.w / 2) * k, br.len * k, br.w * k);
    ctx.lineWidth = 0.7;
    for (let t = -br.len / 2 + 0.6; t < br.len / 2; t += 0.6) {
      ctx.beginPath();
      ctx.moveTo(t * k, (-br.w / 2) * k);
      ctx.lineTo(t * k, (br.w / 2) * k);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Evler: açık duvar, koyu çatı çizgisi.
  for (const hs of F.houses) {
    ctx.save();
    ctx.translate(f.x + hs.x * k, f.y + hs.y * k);
    ctx.rotate(hs.rot);
    ctx.fillStyle = "rgba(40,30,20,0.35)";
    ctx.fillRect((-hs.w / 2 + 0.2) * k, (-hs.h / 2 + 0.25) * k, hs.w * k, hs.h * k);
    ctx.fillStyle = "#d8c8a6";
    ctx.fillRect((-hs.w / 2) * k, (-hs.h / 2) * k, hs.w * k, hs.h * k);
    ctx.strokeStyle = "#5a4630";
    ctx.lineWidth = 1;
    ctx.strokeRect((-hs.w / 2) * k, (-hs.h / 2) * k, hs.w * k, hs.h * k);
    ctx.beginPath();
    ctx.moveTo((-hs.w / 2) * k, 0);
    ctx.lineTo((hs.w / 2) * k, 0);
    ctx.stroke();
    ctx.restore();
  }
  if (F.city) cityTown(ctx, f, F);
  // Adlar: köy (yerleşimin adı) ve dağ sırası, koyu kenarlı altın yazı.
  for (const l of F.labels) {
    const s2 = l.kind === "place" ? placeName(l.id, lang) : T.ranges?.[l.id] ?? l.id;
    ctx.font = `700 ${Math.round(Math.max(14, k * 3.2))}px ${TITLE_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(42,32,22,0.9)";
    ctx.lineWidth = 5;
    ctx.strokeText(s2, f.x + l.x * k, f.y + l.y * k);
    ctx.fillStyle = GOLD_LIGHT;
    ctx.fillText(s2, f.x + l.x * k, f.y + l.y * k);
  }
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

/** Şehrin zemini: surun içi toprak ve taş döşeli, hafif koyu (suyun altında kalır). */
function cityGround(ctx, f, C) {
  ctx.fillStyle = "rgba(150,118,78,0.32)";
  ctx.fillRect(f.x + C.x0 * f.k, f.y + C.y0 * f.k, (C.x1 - C.x0) * f.k, (C.y1 - C.y0) * f.k);
  // (Su sonra üstüne çizilir: deniz şehrin içine girdiyse liman gibi görünür.)
}

/**
 * Şehrin içi (kullanıcının görselleri gibi): sokaklar açık renk, evler küçük çatılar (kahve, kiremit, gri),
 * ortada kale ya da saray - avlusu, dört köşe kulesi.
 */
function cityTown(ctx, f, F) {
  const C = F.city, k = f.k;
  const water = (x, y) => F.kind[Math.floor(y) * F.w + Math.floor(x)] === WATER;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(228,206,160,0.75)";
  ctx.lineWidth = 1.3 * k;
  for (const [a, b] of C.streets) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n, y = a.y + ((b.y - a.y) * i) / n;
      if (water(x, y)) { pen = false; continue; }
      if (pen) ctx.lineTo(f.x + x * k, f.y + y * k); else ctx.moveTo(f.x + x * k, f.y + y * k);
      pen = true;
    }
    ctx.stroke();
  }
  const roofs = ["#6b4a35", "#8a5236", "#5d5650", "#7a3f2c"];
  for (const hs of C.houses) {
    if (water(hs.x, hs.y)) continue;
    ctx.save();
    ctx.translate(f.x + hs.x * k, f.y + hs.y * k);
    ctx.rotate(hs.rot);
    ctx.fillStyle = "rgba(30,20,12,0.35)";
    ctx.fillRect((-hs.w / 2 + 0.18) * k, (-hs.h / 2 + 0.22) * k, hs.w * k, hs.h * k);
    ctx.fillStyle = roofs[Math.floor(hs.tone * roofs.length)];
    ctx.fillRect((-hs.w / 2) * k, (-hs.h / 2) * k, hs.w * k, hs.h * k);
    ctx.strokeStyle = "rgba(25,16,10,0.8)";
    ctx.lineWidth = 0.8;
    ctx.strokeRect((-hs.w / 2) * k, (-hs.h / 2) * k, hs.w * k, hs.h * k);
    ctx.beginPath();
    ctx.moveTo((-hs.w / 2) * k, 0);
    ctx.lineTo((hs.w / 2) * k, 0);
    ctx.strokeStyle = "rgba(255,235,200,0.25)";
    ctx.stroke();
    ctx.restore();
  }
  // Kale: kalın duvarlı bir avlu, dört köşe kulesi, ortada büyük yapı.
  const kp = C.keep;
  if (kp) {
    const x = f.x + (kp.x - kp.w / 2) * k, y = f.y + (kp.y - kp.h / 2) * k, w = kp.w * k, h = kp.h * k;
    ctx.fillStyle = "rgba(30,20,12,0.4)";
    ctx.fillRect(x + 0.3 * k, y + 0.4 * k, w, h);
    ctx.fillStyle = "#cbb48a";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#5a3f2b";
    ctx.lineWidth = Math.max(2, 0.45 * k);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#9c6a48";
    ctx.fillRect(x + w * 0.28, y + h * 0.25, w * 0.44, h * 0.5);
    ctx.strokeStyle = "rgba(40,26,16,0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + w * 0.28, y + h * 0.25, w * 0.44, h * 0.5);
    for (const [tx, ty] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      ctx.beginPath();
      ctx.arc(tx, ty, 0.75 * k, 0, TAU);
      ctx.fillStyle = "#8a5a40";
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Sur: şehrin dört yanında kalın, kahverengi taş bir duvar - dış kenarında mazgallar, aralıklı ve köşelerde
 * kuleler, her yanın ortasında kapı (iki kule arasında kapalı kapı). Suyun üstünde sur yok; gedik yerinde
 * yıkıntı (taşlar).
 */
function wall(ctx, f, b) {
  const F = b.field, C = F.city, k = f.k, half = 1.25;
  ctx.save();
  for (const s of ["W", "N", "S", "E"]) {
    const len = s === "W" || s === "E" ? C.y1 - C.y0 : C.x1 - C.x0;
    const steps = Math.ceil(len / 0.5);
    let run = null;
    const flush = (end) => {
      if (!run) return;
      const a = run, z = end;
      // Duvar gövdesi: yan boyunca kalın şerit.
      const x0 = Math.min(a.x, z.x) - half, x1 = Math.max(a.x, z.x) + half, y0 = Math.min(a.y, z.y) - half, y1 = Math.max(a.y, z.y) + half;
      ctx.fillStyle = "#86634a";
      ctx.fillRect(f.x + x0 * k, f.y + y0 * k, (x1 - x0) * k, (y1 - y0) * k);
      ctx.strokeStyle = "#3e2a1c";
      ctx.lineWidth = 1.6;
      ctx.strokeRect(f.x + x0 * k, f.y + y0 * k, (x1 - x0) * k, (y1 - y0) * k);
      // Surun üstündeki yürüyüş yolu: ortada açık bir çizgi.
      ctx.strokeStyle = "rgba(214,184,140,0.55)";
      ctx.lineWidth = Math.max(1, 0.35 * k);
      ctx.beginPath();
      ctx.moveTo(f.x + a.x * k, f.y + a.y * k);
      ctx.lineTo(f.x + z.x * k, f.y + z.y * k);
      ctx.stroke();
      // Mazgallar: dış kenarda küçük kareler.
      ctx.fillStyle = "#5f4331";
      const n = Math.max(1, Math.floor(Math.hypot(z.x - a.x, z.y - a.y) / 1.1));
      for (let i = 0; i <= n; i++) {
        const t = i / n, mx = a.x + (z.x - a.x) * t + a.nx * half * 0.7, my = a.y + (z.y - a.y) * t + a.ny * half * 0.7;
        ctx.fillRect(f.x + (mx - 0.3) * k, f.y + (my - 0.3) * k, 0.6 * k, 0.6 * k);
      }
      run = null;
    };
    for (let i = 0; i <= steps; i++) {
      const q = sidePoint(C, s, Math.min(1, i / steps));
      if (wallAt(F, q)) { if (!run) run = q; run.last = q; }
      else { flush(run?.last ?? q); }
    }
    flush(run?.last);
    // Kuleler: köşeler ve her 6 birimde bir (sur olan yerde); kapılar ortada.
    const towers = Math.max(2, Math.round(len / 6));
    for (let i = 0; i <= towers; i++) {
      const q = sidePoint(C, s, i / towers);
      if (!wallAt(F, q) || Math.abs(i / towers - 0.5) < 0.06) continue;
      tower(ctx, f, q.x, q.y, 1.3);
    }
  }
  // Kapılar: iki kule arasında kalın, koyu, demir parmaklıklı kapı.
  for (const g of C.gates) {
    if (!wallAt(F, g)) continue;
    const ax = g.ny ? 1 : 0, ay = g.nx ? 1 : 0; // yan boyunca
    tower(ctx, f, g.x - ax * 2, g.y - ay * 2, 1.25);
    tower(ctx, f, g.x + ax * 2, g.y + ay * 2, 1.25);
    ctx.fillStyle = "#2e2016";
    const gw = ax ? 2.2 : 1.6, gh = ay ? 2.2 : 1.6;
    ctx.fillRect(f.x + (g.x - gw / 2) * k, f.y + (g.y - gh / 2) * k, gw * k, gh * k);
    ctx.strokeStyle = "rgba(200,170,120,0.55)";
    ctx.lineWidth = 0.8;
    for (let t = -0.8; t <= 0.8; t += 0.4) {
      ctx.beginPath();
      if (ax) { ctx.moveTo(f.x + (g.x + t) * k, f.y + (g.y - gh / 2) * k); ctx.lineTo(f.x + (g.x + t) * k, f.y + (g.y + gh / 2) * k); }
      else { ctx.moveTo(f.x + (g.x - gw / 2) * k, f.y + (g.y + t) * k); ctx.lineTo(f.x + (g.x + gw / 2) * k, f.y + (g.y + t) * k); }
      ctx.stroke();
    }
  }
  // Gedikler: yıkıntı.
  for (const g of b.gaps) {
    const ax = g.ny ? 1 : 0, ay = g.nx ? 1 : 0;
    for (let i = 0; i < 26; i++) {
      const t = (Math.sin(i * 7.1 + g.x) * 0.5 + 0.5) * 2 - 1, o = Math.cos(i * 3.3 + g.y) * 1.6;
      const sx = g.x + ax * t * g.half + g.nx * o, sy = g.y + ay * t * g.half + g.ny * o;
      ctx.beginPath();
      ctx.arc(f.x + sx * k, f.y + sy * k, (0.25 + ((i * 37) % 5) / 12) * k, 0, TAU);
      ctx.fillStyle = i % 3 ? "#86634a" : "#5f4331";
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Sur kulesi: kare, mazgallı, gölgeli. */
function tower(ctx, f, x, y, r) {
  const k = f.k;
  ctx.fillStyle = "rgba(25,16,10,0.35)";
  ctx.fillRect(f.x + (x - r + 0.25) * k, f.y + (y - r + 0.3) * k, 2 * r * k, 2 * r * k);
  ctx.fillStyle = "#9a7356";
  ctx.fillRect(f.x + (x - r) * k, f.y + (y - r) * k, 2 * r * k, 2 * r * k);
  ctx.strokeStyle = "#3e2a1c";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(f.x + (x - r) * k, f.y + (y - r) * k, 2 * r * k, 2 * r * k);
  ctx.fillStyle = "#6e4e39";
  ctx.fillRect(f.x + (x - r * 0.5) * k, f.y + (y - r * 0.5) * k, r * k, r * k);
}

/**
 * Askerler (kullanıcı 27.10: "arı kovanı gibi titriyorlar, düşmanlarla savaşsınlar; dinamik hareket etsinler"):
 * her nokta kendi yerinde yaşar (`B.dots`) ve birliğin dizilişindeki yerine doğru yürür - birlik dönerken ya da
 * kayıp verirken saflar akarak toplanır. Dövüşte ön sıralar değdikleri düşmanın kenarına kadar yürür (iki taraf
 * cephede karışır), cephesi taşan uçlar düşmanın yanına dolanır, arkadakiler ileri sıkışır. Ölen asker düşmana
 * en yakın olandan eksilir, yerde iz kalır; tırmanıp içeri geçen ölü sayılmaz.
 */
function soldiers(B, u, dt) {
  const b = B.b, fp = footprint(u);
  const n = Math.max(1, Math.round(u.men));
  const cos = Math.cos(u.facing), sin = Math.sin(u.facing);
  B.dots ??= new Map();
  let D = B.dots.get(u.id);
  const slot = (i) => {
    const row = i % fp.rows, col = Math.floor(i / fp.rows);
    const fx = (fp.rows / 2 - row - 0.5) * fp.sp, fy = (col - (fp.cols - 1) / 2) * fp.sp;
    return { x: u.x + fx * cos - fy * sin, y: u.y + fx * sin + fy * cos, row };
  };
  const jit = (i) => ({ a: Math.sin((u.id * 31 + i) * 12.9898) % 1, c: Math.cos((u.id * 17 + i) * 78.233) % 1 });
  if (!D) {
    // İlk kez: yerinde; surdan tırmanan grup ise surun dibinde belirir.
    D = { pts: [], seen: u.climbed ?? 0 };
    const L = u.ladder;
    for (let i = 0; i < n; i++) { const s = slot(i); D.pts.push(u.from && L ? { x: L.x - L.nx * 0.4 + L.ny * (jit(i).a - 0.5) * 1.5, y: L.y - L.ny * 0.4 + L.nx * (jit(i).a - 0.5) * 1.5 } : { x: s.x, y: s.y }); }
    B.dots.set(u.id, D);
  }
  // Değdiği düşmanlar (kurallardan).
  const foes = b.touch?.get(u) ?? [];
  const nearestFoe = (p) => foes.reduce((m, v) => (!m || Math.hypot(v.x - p.x, v.y - p.y) < Math.hypot(m.x - p.x, m.y - p.y) ? v : m), null);
  // Eksilen askerler: tırmananlar önden (sura en yakın), ölenler düşmana en yakın olandan; ölenler iz bırakır.
  while (D.pts.length > n) {
    const climbed = (u.climbed ?? 0) - D.seen;
    const toward = climbed > 0 && u.ladder ? u.ladder : nearestFoe(u) ?? { x: u.x + cos * 50, y: u.y + sin * 50 };
    let k = 0, best = Infinity;
    D.pts.forEach((p, i) => { const d = Math.hypot(p.x - toward.x, p.y - toward.y); if (d < best) { best = d; k = i; } });
    const [p] = D.pts.splice(k, 1);
    if (climbed > 0) D.seen += 1;
    else { B.corpses ??= []; B.corpses.push({ x: p.x, y: p.y, side: u.side }); if (B.corpses.length > 1500) B.corpses.shift(); }
  }
  while (D.pts.length < n) { const s = slot(D.pts.length), L = u.ladder; D.pts.push(u.from && L ? { x: L.x - L.nx * 0.4, y: L.y - L.ny * 0.4 } : { x: s.x, y: s.y }); }
  // Hedefler ve yürüyüş.
  const vmax = (u.speed * 1.4 + 1.5) * dt;
  D.pts.forEach((p, i) => {
    const s = slot(i), j = jit(i);
    let tx = s.x, ty = s.y;
    if (u.routed) { tx += j.a * 3; ty += j.c * 3; }
    else if (foes.length) {
      const v = nearestFoe(s);
      // Düşmanın dikdörtgeninin kenarındaki en yakın nokta (biraz içi: cephede karışırlar).
      const vf = footprint(v), vc = Math.cos(v.facing), vs = Math.sin(v.facing);
      const dx = s.x - v.x, dy = s.y - v.y;
      let lx = dx * vc + dy * vs, ly = -dx * vs + dy * vc;
      const hd = vf.d / 2 + 0.2, hw = vf.w / 2 + 0.2;
      const cx = Math.max(-hd, Math.min(hd, lx)), cy = Math.max(-hw, Math.min(hw, ly));
      if (Math.abs(lx) <= hd && Math.abs(ly) <= hw) { if (hd - Math.abs(lx) < hw - Math.abs(ly)) lx = Math.sign(lx || 1) * hd; else ly = Math.sign(ly || 1) * hw; } else { lx = cx; ly = cy; }
      const ex = v.x + lx * vc - ly * vs, ey = v.y + lx * vs + ly * vc;
      const gap = Math.hypot(ex - s.x, ey - s.y);
      if (s.row < N.tactics.ranks && gap < 4.5) { tx = ex + j.a * 0.5; ty = ey + j.c * 0.5; }
      else if (gap < 9) { const k = Math.min(1.2, gap * 0.4) / (gap || 1); tx = s.x + (ex - s.x) * k; ty = s.y + (ey - s.y) * k; }
    }
    const d = Math.hypot(tx - p.x, ty - p.y);
    if (d > 1e-3) { const k = Math.min(1, vmax / d); p.x += (tx - p.x) * k; p.y += (ty - p.y) * k; }
  });
  return D.pts;
}

/** Yerdeki ölüler: küçük, soluk, tarafının renginin koyusu. */
function corpses(ctx, f, B) {
  if (!B.corpses?.length) return;
  ctx.save();
  for (const c of B.corpses) {
    ctx.fillStyle = c.side === "att" ? shade(colorOf(B.owners.att), -0.45) : shade(colorOf(B.owners.def), -0.45);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(f.x + c.x * f.k - 1.2, f.y + c.y * f.k - 0.8, 2.4, 1.6);
  }
  ctx.restore();
}

/** Merdiven: surun üstünde, tırmanan birliğin yerinde, sura dik; üstünde tek sıra tırmanan askerler. */
function ladder(ctx, f, u, owner, now) {
  const L = u.ladder, k = f.k, len = 2.4, w = 0.6;
  const px = -L.ny, py = L.nx; // yan
  const P = (a, s) => [f.x + (L.x + L.nx * a + px * s) * k, f.y + (L.y + L.ny * a + py * s) * k];
  ctx.save();
  ctx.strokeStyle = "#6e4e33";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const s of [-w, w]) { const [x0, y0] = P(len, s), [x1, y1] = P(-len * 0.6, s); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
  ctx.stroke();
  ctx.lineWidth = 1;
  for (let a = -len * 0.6; a <= len; a += 0.7) { const [x0, y0] = P(a, -w), [x1, y1] = P(a, w); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  // Tek sıra: merdiven boyunca dışarıdan içeri kayan askerler.
  const r = Math.max(1.5, 0.32 * k);
  for (let i = 0; i < 3; i++) {
    const p = (now / 900 + i / 3) % 1;
    const [x, y] = P(len - p * len * 1.6, 0);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = colorOf(owner);
    ctx.fill();
    ctx.strokeStyle = "rgba(20,14,8,0.85)";
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }
  ctx.restore();
}

/** Bir birliğin noktaları (soldiers): her biri kendi yerinde. */
function block(ctx, f, B, u, owner, selected, dt) {
  const fp = footprint(u);
  const color = colorOf(owner);
  const pts = soldiers(B, u, dt);
  const cos = Math.cos(u.facing), sin = Math.sin(u.facing);
  const r = Math.max(1.6, 0.36 * f.k * (u.mounted || u.type === "cav" ? 1.15 : 1));
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
  for (const p of pts) {
    const x = f.x + p.x * f.k, y = f.y + p.y * f.k;
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
  const left = Math.max(0, Math.ceil((B.b.walls ? N.tactics.timeWalls : N.tactics.time) - B.b.t));
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
  const mine = B.b.units.filter((u) => u.side === "att" && !u.absorbed);
  // Kartlar düğmelerin soluna sığar; çok birlik olunca (tırmananlar yeni birlik olur) iki sıra, küçük kart.
  const bw = 120, right = cam.w - 16 - bw, avail = right - bw - 8 - 32;
  const rowsN = mine.length * 46 > avail ? 2 : 1, per = Math.ceil(mine.length / rowsN);
  const cw = Math.min(62, (avail - 6 * (per - 1)) / Math.max(1, per)), small = rowsN === 2;
  const ch = small ? (BOTTOM_H - 28 - 6) / 2 : BOTTOM_H - 28;
  mine.forEach((u, i) => {
    const x = 16 + (i % per) * (cw + 6), y = y0 + 14 + Math.floor(i / per) * (ch + 6), h = ch;
    const on = B.sel.has(u.id), out = u.dead || u.gone;
    roundRect(ctx, x, y, cw, h, 4);
    ctx.fillStyle = out ? "rgba(60,50,40,0.5)" : on ? "#4a3a26" : DARK;
    ctx.fill();
    ctx.strokeStyle = on ? GOLD_LIGHT : GOLD_DARK;
    ctx.lineWidth = on ? 2 : 1;
    ctx.stroke();
    const gy = small ? y + 12 : y + 22, gr = small ? 9 : 13;
    ctx.beginPath();
    ctx.arc(x + cw / 2, gy, gr, 0, TAU);
    ctx.fillStyle = out ? "#555" : colorOf(B.owners.att);
    ctx.fill();
    ctx.strokeStyle = u.elite ? GOLD_LIGHT : "rgba(20,14,8,0.9)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    glyph(ctx, u.elite ? "elite" : u.type, x + cw / 2, gy, CREAM);
    text(ctx, out ? (u.dead ? "✕" : "↩") : u.routed ? "!" : String(Math.ceil(u.men)), x + cw / 2, small ? y + 33 : y + 52, { bold: true, size: small ? 11 : 13, color: u.routed ? "#d97a5a" : CREAM, align: "center" });
    if (!small) {
      const nm = B.unitName(u);
      let size = 10;
      while (size > 7 && measure(ctx, nm, { size }) > cw - 4) size -= 0.5;
      text(ctx, nm, x + cw / 2, y + 66, { size, color: "rgba(243,231,201,0.75)", align: "center" });
    }
    const m = out || u.routed ? 0 : Math.max(0, Math.min(1, moraleOf(u) / 100));
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x + 4, y + h - (small ? 6 : 12), cw - 8, small ? 3 : 5);
    ctx.fillStyle = m > 0.5 ? "#7fb85a" : m > 0.25 ? "#d6a63a" : "#c4523a";
    ctx.fillRect(x + 4, y + h - (small ? 6 : 12), (cw - 8) * m, small ? 3 : 5);
    if (!out) boxes.push({ x, y, w: cw, h, act: { do: "tacPick", id: u.id }, tip: [B.unitName(u), `${Math.ceil(u.men)} / ${Math.round(u.start)}`] });
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
  const lost = (s) => Math.round(B.b.units.filter((u) => u.side === s).reduce((n, u) => n + (u.start - Math.floor(u.dead ? 0 : u.men)), 0));
  const fled = (s) => B.b.units.filter((u) => u.side === s && (u.routed || u.gone) && !u.dead).reduce((n, u) => n + Math.floor(u.men), 0);
  text(ctx, `${T.tacYourLoss}: ${lost("att")}  ·  ${T.tacTheirLoss}: ${lost("def")}`, cam.w / 2, y + 74, { size: 14, align: "center" });
  const note = B.b.over.timeout ? T.tacTimeout : won ? (fled("def") ? `${T.tacTheyFled}: ${fled("def")}` : "") : fled("att") ? `${T.tacWeFled}: ${fled("att")}` : "";
  if (note) text(ctx, note, cam.w / 2, y + 98, { italic: true, size: 12, color: INK.soft, align: "center" });
  button(ctx, boxes, { x: cam.w / 2 - 110, y: y + h - 52, w: 220, h: 38, label: T.tacBack, main: true, size: 15, act: { do: "tacEnd" } });
}
