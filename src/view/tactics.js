// Taktik savaş ekranı (rules/tactics.js; kurallar.md bölüm 29). Kullanıcının gönderdiği görsel gibi: tepeden
// bir saha, her birlik bir nokta bloku (her nokta bir asker), sahibinin renginde. Türler hem dizilişten hem
// birliğin üstündeki rozetten ayrılır: piyade sık blok ve kılıç, okçu seyrek ve yay, süvari uzunca noktalar
// ve nal, kuşatma makinesi kareler ve tekerlek, özel birlik altın kenarlı noktalar ve yıldız. Üstte iki
// tarafın gücü ve süre, altta oyuncunun birliklerinin kartları ve düğmeler (duraklat, hız, otomatik, geri
// çekil); bir birlik seçiliyken sahanın altında Böl, Birleştir, Genişlet, Derinleştir. Sağ sürüklerken çizilen
// hat ve birliklerin orada alacağı yer soluk dikdörtgenlerle görünür. Savaş duraklatılmış başlar: önce
// emirler, sonra Başlat. Bitince sonuç panosu.
//
// Giriş (kullanıcı 27.10: "savaş alanı bulutlardan açılsın, biraz kamera oyunu"): ekran bulutla kaplı açılır,
// bulutlar iki yana dağılırken kamera yakından kendi ordunun üstünden düşmana kayar, sonra bütün sahayı görecek
// kadar geri çekilir; ortada savaşın adı belirip söner, üst ve alt bantlar kenarlardan kayarak gelir. Tıklamak
// ya da bir tuş girişi geçer. Bitişte saha kararır, sonuç panosu aşağıdan yavaşça çıkar.

import { N } from "../rules/numbers.js";
import { abilityOf, active, deployZone, extent, footprint, inside, moraleOf, strength } from "../rules/tactics.js";
import { BRIDGE, FOREST, WATER, insideCity, passable, placeName, sidePoint, wallAt } from "../rules/field.js";
import { TITLE_FONT } from "./kit.js";
import { CREAM, DARK, GOLD, GOLD_DARK, GOLD_LIGHT, roundRect, shade } from "./pieces.js";
import { INK, TAU, button, colorOf, measure, panel, text, wrap } from "./kit.js";
import { boat, drawNavalField } from "./naval.js";
import { shipMorale } from "../rules/naval.js";

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
export function unitAt(b, p, side = null, seeHidden = true) {
  let best = null, bd = Infinity;
  for (const u of b.units) {
    if (u.dead || u.gone || (side && u.side !== side) || (u.hidden && !seeHidden) || !inside(u, p, 1.6)) continue;
    const d = Math.hypot(u.x - p.x, u.y - p.y);
    if (d < bd) { best = u; bd = d; }
  }
  return best;
}

// ---- çizim ----

export function drawTactics(ctx, cam, B, T, lang, boxes, now) {
  const b = B.b;
  const f = fieldRect(cam);
  const dpr = ctx.getTransform().a;
  // Giriş sürüyor mu (sn); bitince kamera yerinde, bantlar yerinde.
  // İlk karede arazinin iki resmi hazırlanır (ekran bulutla kaplı); giriş ondan sonra başlar, yoksa ağır ilk kare girişin
  // başını yutar.
  if (B.intro && !B.intro.warm) {
    if (!b.naval) {
      terrainLayer(f, b, T, lang, dpr);
      terrainLayer(f, b, T, lang, Math.min(dpr * INTRO.zoom, 3200 / f.w), "zoom");
    }
    puffSprite();
    B.intro.warm = true;
    B.intro.t0 = performance.now();
  }
  const t = B.intro ? Math.max(0, (now - B.intro.t0) / 1000) : Infinity;
  if (t >= INTRO.end) { B.intro = null; layers.zoom = null; }
  // Arka plan: koyu çerçeve, ortada saha.
  ctx.fillStyle = "#2a2016";
  ctx.fillRect(0, 0, cam.w, cam.h);
  // Girişte kamera: sahanın bir yerine yakından bakar (saha bütün ekranı kaplayabilir).
  const view = B.intro ? introCamera(cam, f, B, t) : null;
  if (view) {
    ctx.save();
    ctx.translate(f.x + f.w / 2, f.y + f.h / 2);
    ctx.scale(view.z, view.z);
    ctx.translate(-view.x, -view.y);
  }
  // Deniz savaşı (bölüm 29h): deniz ve gemiler (view/naval.js); kara savaşında arazi ve birlikler.
  if (b.naval) drawNavalField(ctx, f, B, T, now);
  else {
    // Hücum çarpınca ve gedik açılınca saha sarsılır (marks).
    const M = marksOf(B, now);
    const shake = M.shake > 0 ? M.shake * 5 : 0;
    ctx.save();
    if (shake) ctx.translate(Math.sin(now * 0.09) * shake, Math.cos(now * 0.11) * shake * 0.7);
    landField(ctx, f, B, T, lang, now, t, dpr);
    ctx.restore();
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
  // Hava (bölüm 29g): yağmur çizgileri, kar taneleri, sis (askerlerin üstünde).
  sky(ctx, f, b, now, "air");
  if (view) {
    ctx.restore();
    clouds(ctx, cam, B, t);
    introTitle(ctx, cam, B, t);
  }
  // Bantlar girişin sonunda kenarlardan kayarak gelir (gelene kadar düğmeleri basılmaz).
  const bars = B.intro ? easeOut(ramp(t, INTRO.bars)) : 1;
  if (bars > 0) {
    ctx.save();
    ctx.translate(0, -(TOP_H + 6) * (1 - bars));
    topBar(ctx, cam, B, T, lang);
    ctx.restore();
    ctx.save();
    ctx.translate(0, (BOTTOM_H + 6) * (1 - bars));
    bottomBar(ctx, cam, B, T, bars < 1 ? [] : boxes);
    ctx.restore();
  }
  if (B.intro) return;
  if (B.sel.size && !b.over && !b.naval) formationBar(ctx, cam, f, B, T, boxes);
  if (b.over) endPanel(ctx, cam, B, T, lang, boxes, now);
  else if (B.deploy) deployBar(ctx, cam, f, T);
}

/** Kara savaşının sahası: arazi, sur, dizilme bölgeleri, ölüler, birlikler, merdivenler, oklar, rozetler. */
function landField(ctx, f, B, T, lang, now, t, dpr) {
  const b = B.b;
  // Arazi bir kere çizilir (saha boyutu ya da dil değişince yeniden); girişte yakından bakılırken keskin kalsın
  // diye daha büyük çizilmiş bir kopyası.
  const zoomScale = Math.min(dpr * INTRO.zoom, 3200 / f.w);
  ctx.drawImage(B.intro ? terrainLayer(f, b, T, lang, zoomScale, "zoom") : terrainLayer(f, b, T, lang, dpr), f.x, f.y, f.w, f.h);
  if (b.field.city) wall(ctx, f, b);
  // Dizilirken iki tarafın bölgesi (kullanıcı 27.10: "düşmanın ve benim sınır çizgilerim olsun").
  if (B.deploy) {
    const k = B.intro ? ramp(t, INTRO.bars) : 1;
    if (k > 0) for (const s of ["att", "def"]) zone(ctx, f, deployZone(b, s), B.owners[s], s === B.me, k);
  }
  // Gecenin, akşamın, şafağın rengi zeminde (askerler seçilebilsin diye altlarında).
  sky(ctx, f, b, now, "ground");
  // Yerdeki ölüler; gediklerin molozu, kaçanların düşürdüğü kalkanlar; koşan atlıların tozu.
  corpses(ctx, f, B);
  groundMarks(ctx, f, B);
  hoofDust(ctx, f, b, now);
  // Askerler kendi yerlerine yürür (duraklatılınca durur).
  // Askerlerin yürüyüşü: savaşla aynı hızda; duraklatılınca yerlerinde, ama birlik ışınlandıysa ya da dizilişi
  // değiştiyse yeni yerlerine akarlar (kullanıcı 27.10: "noktalar olduğu yerde kalıyor, seçemiyorum").
  const real = Math.min(0.1, Math.max(0, (now - (B.dotT ?? now)) / 1000));
  const dt = b.over ? 0 : B.paused ? real * 3 : real * B.speed;
  B.dotT = now;
  // Emir çizgileri (seçili birliklerin).
  for (const u of b.units) if (B.sel.has(u.id) && !u.dead && !u.gone && !u.routed && u.order) orderLine(ctx, f, b, u);
  // Generalin yanı (bölüm 29e): soluk, tarafının renginde bir halka - içindekiler daha dirençli.
  for (const u of b.units) {
    if (u.type !== "gen" || u.dead || u.gone || u.routed) continue;
    ctx.save();
    ctx.strokeStyle = colorOf(B.owners[u.side]);
    ctx.globalAlpha = B.sel.has(u.id) ? 0.55 : 0.25;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(f.x + u.x * f.k, f.y + u.y * f.k, N.tactics.general.aura * f.k, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  // Birlikler: önce bozulanlar (altta), sonra ötekiler.
  const owner = { att: B.owners.att, def: B.owners.def };
  for (const u of [...b.units].sort((a, c) => (a.routed ? 0 : 1) - (c.routed ? 0 : 1))) {
    if (u.dead || u.gone || (u.hidden && u.side !== B.me)) continue; // düşmanın pusudaki birliği görünmez
    ctx.save();
    if (u.hidden) ctx.globalAlpha = 0.55;
    block(ctx, f, B, u, u.owner ?? owner[u.side], B.sel.has(u.id), dt);
    ctx.restore();
  }
  // Merdivenler (askerlerin üstünde): sura dayanıp tırmanan birliklerin yerinde, üstünde tek sıra askerler.
  if (b.walls) for (const u of b.units) if (u.climbing && u.ladder && !u.dead && !u.gone) ladder(ctx, f, u, B.owners[u.side], now);
  for (const s of b.shots) arrows(ctx, f, b, s);
  airMarks(ctx, f, B, now);
  for (const e of b.fx) burst(ctx, f, b, e);
  for (const e of b.fx) if (e.kind === "genFell" || e.kind === "genFled" || e.kind === "reinforce" || e.kind === "ambush") fallen(ctx, f, B, e, T);
  for (const u of b.units) {
    if (u.dead || u.gone || (u.hidden && u.side !== B.me)) continue;
    badge(ctx, f, u, u.owner ?? owner[u.side], B.sel.has(u.id), b);
    if (u.hidden) leaf(ctx, f, u);
  }
}

// ---- giriş ----

/**
 * Girişin zamanları (sn): bulut örtüsü kalkar (`cover`), bulutlar iki yana dağılır (`part`) ve söner (`fade`);
 * kamera `zoom` kat yakından kendi ordunun üstünden düşmana kayar (`pan`), sonra geri çekilir (`back`); ad görünür
 * (`title`); bantlar gelir (`bars`).
 */
const INTRO = { cover: [0, 0.35], part: [0.1, 1.3], fade: [0.7, 1.6], pan: [0.6, 2.3], back: [2.3, 3.6], title: [0.4, 0.9, 2.4, 2.9], bars: [3.1, 3.7], end: 3.75, zoom: 2 };
const ramp = (t, [a, b]) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const easeInOut = (s) => (s < 0.5 ? 4 * s * s * s : 1 - (-2 * s + 2) ** 3 / 2);
const easeOut = (s) => 1 - (1 - s) ** 3;
/** Biraz öteye taşıp yerine yumuşakça oturan (pano aşağıdan gelirken). */
const backOut = (s) => 1 + 1.8 * (s - 1) ** 3 + 0.8 * (s - 1) ** 2;

/** Girişte kameranın baktığı yer (ekranda, sahanın yakınlaştırılmamış hâlinde) ve yakınlığı. */
function introCamera(cam, f, B, t) {
  const { w: W, h: H } = N.tactics;
  const centre = (side) => {
    const us = B.b.units.filter((u) => u.side === side && !u.dead && !u.gone);
    const n = us.reduce((s, u) => s + u.men, 0) || 1;
    return us.length ? { x: us.reduce((s, u) => s + u.x * u.men, 0) / n, y: us.reduce((s, u) => s + u.y * u.men, 0) / n } : { x: W / 2, y: H / 2 };
  };
  B.intro.mine ??= centre(B.me);
  B.intro.foe ??= centre(B.foe);
  const a = easeInOut(ramp(t, INTRO.pan)), c = easeInOut(ramp(t, INTRO.back));
  const lerp = (p, q, k) => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
  const p = lerp(lerp(B.intro.mine, B.intro.foe, a), { x: W / 2, y: H / 2 }, c);
  const z = INTRO.zoom - 0.2 * a + (1 - (INTRO.zoom - 0.2 * a)) * c;
  // Sahanın dışı görünmesin (ekranın göstereceği kadarı sahaya sığdıkça).
  const hx = Math.min(W / 2, cam.w / 2 / (f.k * z)), hy = Math.min(H / 2, cam.h / 2 / (f.k * z));
  return { z, x: f.x + Math.max(hx, Math.min(W - hx, p.x)) * f.k, y: f.y + Math.max(hy, Math.min(H - hy, p.y)) * f.k };
}

let puff = null;
/** Bir bulut öbeği: üst üste yumuşak beyaz yuvarlaklar, altı gölgeli. */
function puffSprite() {
  if (puff) return puff;
  const s = 160, c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  const blob = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(0.7, `rgba(248,250,252,${a * 0.92})`);
    gr.addColorStop(1, "rgba(240,244,248,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  };
  // Karnabahar gibi: ortada büyük bir öbek, üstünde ve yanlarında küçükleri.
  blob(80, 92, 62, 1);
  blob(46, 92, 38, 0.95);
  blob(116, 90, 36, 0.95);
  blob(62, 64, 34, 0.95);
  blob(98, 60, 32, 0.95);
  blob(80, 46, 26, 0.9);
  g.globalCompositeOperation = "source-atop";
  const sh = g.createLinearGradient(0, 40, 0, s - 10);
  sh.addColorStop(0, "rgba(150,160,176,0)");
  sh.addColorStop(0.55, "rgba(140,150,168,0.18)");
  sh.addColorStop(1, "rgba(96,108,130,0.6)");
  g.fillStyle = sh;
  g.fillRect(0, 0, s, s);
  // Gölgesi: aynı biçim, koyu ve yumuşak.
  const d = document.createElement("canvas");
  d.width = d.height = s;
  const q = d.getContext("2d");
  q.filter = "blur(6px)";
  q.drawImage(c, 0, 0);
  q.filter = "none";
  q.globalCompositeOperation = "source-in";
  q.fillStyle = "rgba(30,26,20,1)";
  q.fillRect(0, 0, s, s);
  puff = { img: c, shadow: d };
  return puff;
}

/** Bulutlar: önce ekranı kaplar, sonra ortadan iki yana açılıp söner. */
function clouds(ctx, cam, B, t) {
  B.intro.puffs ??= Array.from({ length: 70 }, () => {
    const x = Math.random();
    return { x: x * 1.2 - 0.1, y: Math.random() * 1.2 - 0.1, r: 0.11 + Math.random() * 0.15, dir: x < 0.5 ? -1 : 1, v: 0.55 + Math.random() * 0.6, dy: (Math.random() - 0.5) * 0.3, late: Math.random() * 0.3 };
  });
  const cover = 1 - ramp(t, INTRO.cover), fade = 1 - ramp(t, INTRO.fade);
  if (cover > 0) {
    ctx.fillStyle = `rgba(222,228,234,${cover})`;
    ctx.fillRect(0, 0, cam.w, cam.h);
  }
  if (fade <= 0) return;
  const sprite = puffSprite(), s = Math.max(cam.w, cam.h);
  const at = B.intro.puffs.map((p) => {
    const m = easeInOut(ramp(t - p.late, INTRO.part));
    // Ortadakiler daha çok yol alır: bulut ortadan yırtılır.
    return { m, a: fade * (1 - m * 0.35), x: (p.x + p.dir * m * p.v * (1.2 - Math.abs(p.x - 0.5))) * cam.w, y: (p.y + p.dy * m) * cam.h, r: p.r * s * (1 + m * 0.35) };
  });
  // Önce yere düşen gölgeler (güneş sol üstte), sonra bulutlar.
  for (const q of at) {
    if (q.a < 0.01) continue;
    ctx.globalAlpha = q.a * 0.28;
    ctx.drawImage(sprite.shadow, q.x - q.r + q.r * 0.35, q.y - q.r + q.r * 0.5, q.r * 2, q.r * 2);
  }
  for (const q of at) {
    if (q.a < 0.01) continue;
    ctx.globalAlpha = q.a;
    ctx.drawImage(sprite.img, q.x - q.r, q.y - q.r, q.r * 2, q.r * 2);
  }
  ctx.globalAlpha = 1;
}

/** Savaşın adı ve iki taraf, ekranın ortasında koyu bir şeridin üstünde: belirir, söner. */
function introTitle(ctx, cam, B, t) {
  const [a0, a1, b0, b1] = INTRO.title;
  const a = Math.min(ramp(t, [a0, a1]), 1 - ramp(t, [b0, b1]));
  if (a <= 0) return;
  const y = cam.h * 0.3;
  ctx.save();
  ctx.globalAlpha = a;
  const band = ctx.createLinearGradient(0, 0, cam.w, 0);
  band.addColorStop(0, "rgba(20,14,8,0)");
  band.addColorStop(0.25, "rgba(20,14,8,0.62)");
  band.addColorStop(0.75, "rgba(20,14,8,0.62)");
  band.addColorStop(1, "rgba(20,14,8,0)");
  ctx.fillStyle = band;
  ctx.fillRect(0, y - 46, cam.w, 84);
  ctx.fillStyle = GOLD_DARK;
  ctx.fillRect(cam.w * 0.3, y - 46, cam.w * 0.4, 1.5);
  ctx.fillRect(cam.w * 0.3, y + 36.5, cam.w * 0.4, 1.5);
  // Ad biraz büyükten yerine oturur.
  const k = 1 + 0.08 * (1 - easeOut(ramp(t, [a0, a1 + 0.3])));
  ctx.translate(cam.w / 2, y);
  ctx.scale(k, k);
  ctx.shadowColor = "rgba(0,0,0,0.7)";
  ctx.shadowBlur = 10;
  text(ctx, B.title, 0, 0, { title: true, bold: true, size: 38, color: GOLD_LIGHT, align: "center" });
  text(ctx, `${B.names.att}   ⚔   ${B.names.def}`, 0, 26, { italic: true, size: 16, color: CREAM, align: "center" });
  ctx.restore();
}

/**
 * Hava katmanı (sahanın üstünde, kırpılmış): zeminde (`ground`) akşam turuncu, şafak pembe, gece lacivert bir örtü;
 * askerlerin üstünde (`air`) sis sürüklenen beyaz
 * öbekler; yağmur eğik çizgiler; kar yavaş düşen taneler. Zaman gerçek saatle akar (duraklatınca da yağar).
 */
function sky(ctx, f, b, now, layer) {
  const w = b.weather;
  if (!w || (w.sky === "clear" && w.time === "day")) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(f.x, f.y, f.w, f.h);
  ctx.clip();
  if (layer === "ground") {
    const tint = { dawn: "rgba(240,170,170,0.14)", dusk: "rgba(230,130,60,0.18)", night: "rgba(10,16,46,0.55)" }[w.time];
    if (tint) { ctx.fillStyle = tint; ctx.fillRect(f.x, f.y, f.w, f.h); }
    ctx.restore();
    return;
  }
  const s = now / 1000;
  if (w.sky === "fog") {
    ctx.fillStyle = "rgba(225,228,232,0.28)";
    ctx.fillRect(f.x, f.y, f.w, f.h);
    for (let i = 0; i < 14; i++) {
      const x = f.x + ((i * 0.37 + s * 0.012 * (1 + (i % 3))) % 1.2 - 0.1) * f.w, y = f.y + ((i * 0.61) % 1) * f.h, r = f.w * (0.12 + (i % 4) * 0.03);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(235,238,242,0.45)");
      g.addColorStop(1, "rgba(235,238,242,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  } else if (w.sky === "rain") {
    ctx.fillStyle = "rgba(60,80,100,0.16)";
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.strokeStyle = "rgba(200,215,230,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 260; i++) {
      const x = f.x + (((i * 0.6180339) % 1) * f.w + s * 60) % f.w, y = f.y + (((i * 0.4142) % 1) * f.h + s * 520 + i * 13) % f.h;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 13);
    }
    ctx.stroke();
  } else if (w.sky === "snow") {
    ctx.fillStyle = "rgba(240,244,250,0.18)";
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 180; i++) {
      const x = f.x + (((i * 0.6180339) % 1) * f.w + Math.sin(s * 0.8 + i) * 8 + f.w) % f.w, y = f.y + (((i * 0.4142) % 1) * f.h + s * 28 * (0.6 + (i % 5) * 0.15)) % f.h;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 + (i % 3) * 0.5, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Araziyi önbelleğe alınmış resimler: `main` her zamanki, `zoom` girişte yakından bakmak için büyük çizilmiş. */
const layers = { main: null, zoom: null };

/** Arazinin önbellek resmi: toprak, tepeler, su ve nehirler, orman, köprüler, evler, adlar. */
function terrainLayer(f, b, T, lang, dpr, slot = "main") {
  const key = `${Math.round(f.w)}|${Math.round(f.h)}|${dpr}|${b.seed}|${lang}`;
  const layer = layers[slot];
  if (layer?.key === key && layer.field === b.field) return layer.canvas;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(f.w * dpr);
  canvas.height = Math.round(f.h * dpr);
  const c = canvas.getContext("2d");
  c.scale(dpr, dpr);
  const g = { x: 0, y: 0, w: f.w, h: f.h, k: f.k };
  field(c, g, b);
  terrain(c, g, b.field, T, lang);
  layers[slot] = { key, canvas, field: b.field };
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
  const b = B.b, fp = footprint(u), F = b.field, C = b.walls ? F.city : null;
  const n = Math.max(1, Math.round(u.men));
  const cos = Math.cos(u.facing), sin = Math.sin(u.facing);
  B.dots ??= new Map();
  let D = B.dots.get(u.id);
  const jit = (i) => ({ a: Math.sin((u.id * 31 + i) * 12.9898) % 1, c: Math.cos((u.id * 17 + i) * 78.233) % 1 });
  // Dağınıklık (kullanıcı 27.10: "hep satır sütun nizami ilerliyor, dağılsınlar"): her asker yerinin biraz yanında;
  // yürürken daha gevşek, dar yerde (daralmış birlik) iyice dağınık; dururken toplu.
  const loose = (u.march != null ? 0.55 : u.wasMoving ? 0.3 : 0.14) * fp.sp;
  // Bir nokta askere uygun mu: su, ev, sur değil; surun dışındaki şehre, içindeki dışarıya taşmaz.
  const ok = (x, y) => passable(F, x, y) && (!C || u.routed || (u.inside ? insideCity(C, { x, y }) : !insideCity(C, { x, y })));
  const slot = (i) => {
    const row = i % fp.rows, col = Math.floor(i / fp.rows), j = jit(i);
    const fx = (fp.rows / 2 - row - 0.5) * fp.sp + j.c * loose, fy = (col - (fp.cols - 1) / 2) * fp.sp + j.a * loose;
    let x = u.x + fx * cos - fy * sin, y = u.y + fx * sin + fy * cos;
    // Yeri engelin üstündeyse birliğin ortasına doğru çekilir: dar yerde asker kıyıya, ağaca, sura sokulur.
    if (F.obstacles && !ok(x, y)) {
      for (let k = 1; k <= 6; k++) {
        const t = k / 6, qx = x + (u.x - x) * t + j.a * 0.4, qy = y + (u.y - y) * t + j.c * 0.4;
        if (ok(qx, qy)) { x = qx; y = qy; break; }
      }
    }
    return { x, y, row };
  };
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
  // Hedefler ve yürüyüş (dizilirken ışınlanır: birlik nerede ise askerleri orada).
  const vmax = B.deploy ? Infinity : (u.speed * 1.4 + 1.5) * dt;
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
  if (u.work) {
    if (u.work === "tower") siegeTower(ctx, f, u, color, B.b);
    else if (u.work === "catapult") catapult(ctx, f, u, color, B.b);
    else ram(ctx, f, u, color);
    ctx.restore();
    return;
  }
  // Falanks: ön sıralardan ileri uzanan mızraklar.
  if (u.stance === "phalanx") {
    ctx.strokeStyle = "rgba(60,44,26,0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const row = i % fp.rows;
      if (row > 2) return;
      const x = f.x + p.x * f.k, y = f.y + p.y * f.k;
      ctx.moveTo(x, y);
      ctx.lineTo(x + cos * (2.4 - row * 0.6) * f.k, y + sin * (2.4 - row * 0.6) * f.k);
    });
    ctx.stroke();
  }
  for (const p of pts) {
    const x = f.x + p.x * f.k, y = f.y + p.y * f.k;
    ctx.beginPath();
    if (u.type === "siege" || u.stance === "testudo") ctx.rect(x - r, y - r, r * 2, r * 2);
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

/**
 * Kuşatmada yerinde yapılan koçbaşı (bölüm 20): deri kaplı çatılı ahşap sundurma, önünden çıkan tunç başlı kütük,
 * çatısında sahibinin renginde şerit. Sura dayanınca kütük ileri geri gider.
 */
function ram(ctx, f, u, color) {
  // Birliğin kutusunu doldursun: çizim 5.2 x 3.4 birimlik, kutunun boyuna göre büyür.
  const fp = footprint(u), z = Math.min(1.05, fp.d * 0.8 / 5.2, fp.w * 0.8 / 3.4);
  const k = f.k * z, swing = u.ram > 0 ? Math.sin(u.ram * 9) * 0.5 : 0;
  ctx.translate(f.x + u.x * f.k, f.y + u.y * f.k);
  ctx.rotate(u.facing);
  ctx.fillStyle = "#5a3e22";
  ctx.fillRect(-1 * k + swing * k, -0.35 * k, 4.4 * k, 0.7 * k);
  ctx.fillStyle = "#b08a3a";
  ctx.fillRect(3.2 * k + swing * k, -0.55 * k, 0.7 * k, 1.1 * k);
  roundRect(ctx, -2.6 * k, -1.7 * k, 5.2 * k, 3.4 * k, 0.4 * k);
  ctx.fillStyle = "#7a5634";
  ctx.fill();
  ctx.strokeStyle = "rgba(20,14,8,0.85)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = "rgba(40,28,16,0.6)";
  ctx.beginPath();
  for (let i = 1; i < 4; i++) { ctx.moveTo((-2.6 + i * 1.3) * k, -1.7 * k); ctx.lineTo((-2.6 + i * 1.3) * k, 1.7 * k); }
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(-2.6 * k, -0.25 * k, 5.2 * k, 0.5 * k);
}

/** Pusudaki kendi birliğin: rozetinin solunda yeşil yaprak (düşman göremez). */
function leaf(ctx, f, u) {
  const x = f.x + u.x * f.k - 16, y = f.y + u.y * f.k - footprint(u).w * f.k * 0.5 - 14;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.6);
  ctx.fillStyle = "#6fa04a";
  ctx.strokeStyle = "rgba(20,14,8,0.85)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 3.4, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(6, 0);
  ctx.stroke();
  ctx.restore();
}

/** Kuşatma kulesi: üç katlı ahşap kule, tepesinde sahibinin renginde şerit; sura yanaşınca önünde köprü. */
function siegeTower(ctx, f, u, color, b) {
  const k = f.k * 0.9;
  ctx.translate(f.x + u.x * f.k, f.y + u.y * f.k);
  ctx.rotate(u.facing);
  ctx.fillStyle = "rgba(20,14,8,0.25)";
  ctx.fillRect(-2.6 * k, -2.2 * k + 1, 5.2 * k, 4.4 * k);
  for (let i = 0; i < 3; i++) {
    const s = 1 - i * 0.16;
    ctx.fillStyle = i % 2 ? "#7a5634" : "#8a6440";
    ctx.fillRect(-2.6 * s * k, -2.2 * s * k, 5.2 * s * k, 4.4 * s * k);
    ctx.strokeStyle = "rgba(20,14,8,0.8)";
    ctx.lineWidth = 0.9;
    ctx.strokeRect(-2.6 * s * k, -2.2 * s * k, 5.2 * s * k, 4.4 * s * k);
  }
  ctx.fillStyle = color;
  ctx.fillRect(-1.6 * k, -0.35 * k, 3.2 * k, 0.7 * k);
  if (u.bridged) {
    ctx.fillStyle = "#6b4a2e";
    ctx.fillRect(2.4 * k, -1 * k, 2.6 * k, 2 * k);
    ctx.strokeStyle = "rgba(20,14,8,0.7)";
    ctx.strokeRect(2.4 * k, -1 * k, 2.6 * k, 2 * k);
  }
}

/** Mancınık: ahşap çatkı, kolu taş atınca öne fırlar, sonra yavaşça geri çekilir. */
function catapult(ctx, f, u, color, b) {
  const k = f.k * 0.85, since = b.t - (u.threw ?? -9), swing = since < 0.5 ? since / 0.5 : Math.max(0, 1 - (since - 0.5) / 2.5);
  ctx.translate(f.x + u.x * f.k, f.y + u.y * f.k);
  ctx.rotate(u.facing);
  ctx.fillStyle = "#6b4a2e";
  ctx.fillRect(-2.4 * k, -1.8 * k, 4.8 * k, 0.6 * k);
  ctx.fillRect(-2.4 * k, 1.2 * k, 4.8 * k, 0.6 * k);
  ctx.fillRect(-0.4 * k, -1.8 * k, 0.8 * k, 3.6 * k);
  ctx.fillStyle = "#3b3024";
  for (const [x, y] of [[-2, -1.8], [2, -1.8], [-2, 1.8], [2, 1.8]]) { ctx.beginPath(); ctx.arc(x * k, y * k, 0.5 * k, 0, TAU); ctx.fill(); }
  // Kol: geride (yatık) -> öne fırlamış.
  const ang = Math.PI - swing * 2.2;
  ctx.strokeStyle = "#8a6440";
  ctx.lineWidth = 0.7 * k;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(ang) * 3.4 * k, Math.sin(ang) * 0.6 * k);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(-0.5 * k, -0.5 * k, 1 * k, 1 * k);
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
  // Diziliş ya da yetenek (bölüm 29f): seçililerden birinin varsa; açıksa vurgulu, beklerken kaç saniye kaldığı.
  const able = sel.map((u) => [u, abilityOf(B.b, u)]).filter(([, a]) => a);
  if (able.length) {
    const [u0, ab] = able[0], A = N.tactics.abilities[ab], b = B.b;
    const on = able.some(([u, a]) => active(b, u, a));
    const wait = A.toggle ? 0 : Math.max(0, Math.ceil(Math.min(...able.map(([u]) => u.ready ?? 0)) - b.t));
    const name = T.abilities[ab][0];
    btns.push({ label: on && !A.toggle ? `${name} ✓` : wait ? `${name} · ${wait}` : name, main: on, off: !!wait, act: { do: "tacAbility" },
      tip: [name, T.abilities[ab][1], on ? T.abilityOn : wait ? T.abilityReady.replace("{0}", wait) : null], size: name.length > 12 ? 11.5 : 13 });
    void u0;
  }
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
function badge(ctx, f, u, owner, selected, b = null) {
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
  glyph(ctx, u.type === "gen" ? "gen" : u.elite ? "elite" : u.type, x, y, selected ? DARK : CREAM);
  // Moral (yeşil -> kızıl) ve sayı.
  const m = Math.max(0, Math.min(1, moraleOf(u) / 100));
  ctx.fillStyle = "rgba(20,14,8,0.7)";
  ctx.fillRect(x - 11, y + R + 2, 22, 3.5);
  ctx.fillStyle = u.routed ? "#9a4a3a" : m > 0.5 ? "#7fb85a" : m > 0.25 ? "#d6a63a" : "#c4523a";
  ctx.fillRect(x - 11, y + R + 2, 22 * (u.routed ? 1 : m), 3.5);
  text(ctx, u.routed ? "!" : String(Math.ceil(u.men)), x + R + 3, y + 4, { bold: true, size: 11, color: CREAM });
  // Açık diziliş ya da süren yetenek: rozetin solunda küçük altın bir işaret.
  const st = u.stance ?? (u.boost && b && u.boost.until > b.t ? u.boost.id : null);
  if (st) {
    const mark = { testudo: "▣", phalanx: "⇈", wedge: "▲", heavyWedge: "▲", warcry: "!", stampede: "»", fire: "✶", circle: "◎" }[st];
    ctx.beginPath();
    ctx.arc(x - R - 6, y, 6.5, 0, TAU);
    ctx.fillStyle = GOLD_LIGHT;
    ctx.fill();
    text(ctx, mark, x - R - 6, y + 3.5, { bold: true, size: 9.5, color: DARK, align: "center" });
  }
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
  } else if (kind === "gen") {
    // Taç: üç sivri uç.
    ctx.moveTo(-5, 4); ctx.lineTo(-5, -2); ctx.lineTo(-2.5, 1); ctx.lineTo(0, -5); ctx.lineTo(2.5, 1); ctx.lineTo(5, -2); ctx.lineTo(5, 4);
    ctx.closePath();
    ctx.fill();
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
  if (s.stone) {
    // Mancınık taşı: yüksek kavisle uçan iri bir taş, gölgesi yerde.
    const x = s.from.x + (s.at.x - s.from.x) * p, y = s.from.y + (s.at.y - s.from.y) * p;
    ctx.fillStyle = "rgba(20,14,8,0.25)";
    ctx.beginPath();
    ctx.ellipse(f.x + x * f.k, f.y + y * f.k, 0.7 * f.k, 0.4 * f.k, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#6a5e50";
    ctx.beginPath();
    ctx.arc(f.x + x * f.k, f.y + (y - Math.sin(p * Math.PI) * 14) * f.k, 0.75 * f.k, 0, TAU);
    ctx.fill();
    return;
  }
  ctx.save();
  // Yanan oklar: turuncu, parlak (ateşli ok yeteneği).
  ctx.strokeStyle = s.fire ? "rgba(255,150,50,0.95)" : "rgba(40,28,16,0.85)";
  ctx.lineWidth = s.fire ? 1.6 : 1.1;
  if (s.fire) { ctx.shadowColor = "rgba(255,170,60,0.9)"; ctx.shadowBlur = 6; }
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
/** General düştü ya da kaçtı: sahanın üst kısmında, tarafının renginde bir şerit; yavaşça söner. */
function fallen(ctx, f, B, e, T) {
  const age = B.b.t - e.t, a = Math.max(0, Math.min(1, age * 4, (4 - age) / 1.2));
  if (a <= 0) return;
  const mine = e.side === B.me;
  const s = e.kind === "ambush" ? (mine ? T.tacAmbushOurs : T.tacAmbush) : e.kind === "reinforce" ? T.tacReinforced.replace("{0}", e.men) : (e.kind === "genFell" ? T.tacGenFell : T.tacGenFled).replace("{0}", e.name ?? T.tacGeneral);
  const y = f.y + f.h * (e.kind === "reinforce" ? 0.85 : e.kind === "ambush" ? 0.5 : 0.18);
  ctx.save();
  ctx.globalAlpha = a;
  const w = Math.min(f.w - 40, measure(ctx, s, { title: true, bold: true, size: 24 }) + 80);
  ctx.fillStyle = "rgba(20,14,8,0.72)";
  roundRect(ctx, f.x + f.w / 2 - w / 2, y - 26, w, 40, 6);
  ctx.fill();
  ctx.fillStyle = colorOf(B.owners[e.side]);
  ctx.fillRect(f.x + f.w / 2 - w / 2, y + 12, w, 2);
  text(ctx, s, f.x + f.w / 2, y + 2, { title: true, bold: true, size: 24, color: e.kind === "reinforce" || e.kind === "ambush" ? (mine ? "#9fd07a" : "#e08a6a") : mine ? "#e08a6a" : GOLD_LIGHT, align: "center" });
  ctx.restore();
}

function burst(ctx, f, b, e) {
  if (e.kind === "genFell" || e.kind === "genFled" || e.kind === "reinforce" || e.kind === "breach" || e.kind === "ambush" || e.kind === "bridge") return;
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

// ---- efektler ----
//
// Kullanıcı 28.10 (önerilerden 3.: "gedik açılınca toz bulutu ve taş parçaları, yanan oklarla şehirde yangın, hücumda
// kamera sarsıntısı, bozulup kaçan birliğin ardında kalkanlar"): kuralların olaylarından (b.fx, b.shots) ekranda kalan
// izler. Kurallara dokunmaz; B.marks yalnız ekranın (savaş bitince gider).

/** Yeni olaylardan izler: gedik (toz, taşlar, moloz, sarsıntı), hücum (sarsıntı), bozulma (kalkanlar), yanan ok (yangın). */
function marksOf(B, now) {
  const b = B.b, M = (B.marks ??= { seen: new WeakSet(), list: [], shake: 0, at: now });
  M.shake = Math.max(0, M.shake - Math.min(0.1, (now - M.at) / 1000) * 2.2);
  M.at = now;
  for (const e of b.fx) {
    if (M.seen.has(e)) continue;
    M.seen.add(e);
    if (e.kind === "breach") {
      M.list.push({ kind: "dust", x: e.x, y: e.y, t: e.t }, { kind: "stones", x: e.x, y: e.y, t: e.t }, { kind: "rubble", x: e.x, y: e.y, t: e.t });
      M.shake = Math.max(M.shake, 1.2);
    } else if (e.kind === "charge") M.shake = Math.max(M.shake, 0.55);
    else if (e.kind === "rout") {
      const u = b.units.filter((v) => v.routed).reduce((m, v) => (!m || Math.hypot(v.x - e.x, v.y - e.y) < Math.hypot(m.x - e.x, m.y - e.y) ? v : m), null);
      M.list.push({ kind: "shields", x: e.x, y: e.y, t: e.t, owner: u ? u.owner ?? B.owners[u.side] : null, facing: u?.facing ?? 0 });
    }
  }
  // Yanan ok şehrin içine düşünce en yakın ev tutuşur (ok yere varınca).
  const C = b.field.city;
  for (const s of b.shots) {
    if (!(s.fire || s.stone) || M.seen.has(s)) continue;
    M.seen.add(s);
    if (s.stone) M.list.push({ kind: "dust", x: s.at.x, y: s.at.y, t: s.t1, small: true });
    if (!C || !insideCity(C, s.at)) continue;
    const h = C.houses.reduce((m, q) => (!m || Math.hypot(q.x - s.at.x, q.y - s.at.y) < Math.hypot(m.x - s.at.x, m.y - s.at.y) ? q : m), null);
    if (h && Math.hypot(h.x - s.at.x, h.y - s.at.y) < 6 && !M.list.some((m) => m.kind === "fire" && m.house === h && b.t - m.t < 14)) {
      M.list.push({ kind: "fire", x: h.x, y: h.y, t: s.t1, house: h });
    }
  }
  const life = { dust: 4, stones: 1.4, fire: 16, rubble: Infinity, shields: Infinity };
  M.list = M.list.filter((m) => b.t - m.t < life[m.kind]);
  // Yerdeki kalkanlar en çok 40 küme (eskisi silinir).
  const sh = M.list.filter((m) => m.kind === "shields");
  if (sh.length > 40) M.list = M.list.filter((m) => m !== sh[0]);
  return M;
}

/** Yerde kalanlar: gediğin molozu, kaçanların düşürdüğü kalkanlar ve mızraklar. */
function groundMarks(ctx, f, B) {
  for (const m of B.marks?.list ?? []) {
    const x = f.x + m.x * f.k, y = f.y + m.y * f.k, k = f.k;
    if (m.kind === "rubble") {
      ctx.fillStyle = "rgba(150,135,110,0.9)";
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39, r = (1 + (i % 4) * 0.9) * k;
        ctx.fillRect(x + Math.cos(a) * r * 1.6 - 0.5 * k, y + Math.sin(a) * r - 0.4 * k, (0.6 + (i % 3) * 0.3) * k, (0.5 + (i % 2) * 0.3) * k);
      }
    } else if (m.kind === "shields") {
      ctx.save();
      for (let i = 0; i < 6; i++) {
        const a = i * 1.7 + m.facing, r = (0.8 + (i % 3) * 1.1) * k;
        const sx = x + Math.cos(a) * r * 1.4, sy = y + Math.sin(a) * r;
        ctx.fillStyle = m.owner ? colorOf(m.owner) : "#7a5634";
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.ellipse(sx, sy, 0.55 * k, 0.4 * k, a, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "rgba(60,44,26,0.8)";
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(sx - Math.cos(a + 1) * 1.3 * k, sy - Math.sin(a + 1) * 1.3 * k);
        ctx.lineTo(sx + Math.cos(a + 1) * 1.3 * k, sy + Math.sin(a + 1) * 1.3 * k);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

/** Havadakiler: gediğin toz bulutu ve uçuşan taşları, yanan evlerin alevi ve dumanı. */
function airMarks(ctx, f, B, now) {
  const b = B.b;
  for (const m of B.marks?.list ?? []) {
    const age = b.t - m.t;
    if (age < 0) continue;
    const x = f.x + m.x * f.k, y = f.y + m.y * f.k, k = f.k;
    if (m.kind === "dust") {
      const a = Math.max(0, 1 - age / 4), sm = m.small ? 0.45 : 1;
      for (let i = 0; i < 10; i++) {
        const ang = i * 0.63, r = (1.5 + age * 3.5) * k * (0.7 + (i % 3) * 0.2) * sm;
        ctx.fillStyle = `rgba(170,150,120,${0.45 * a})`;
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * r, y + Math.sin(ang) * r * 0.7 - age * 1.5 * k, (1.6 + age * 1.2) * k, 0, TAU);
        ctx.fill();
      }
    } else if (m.kind === "stones") {
      ctx.fillStyle = "#8a7c66";
      for (let i = 0; i < 12; i++) {
        const ang = i * 0.52 + 0.3, v = 6 + (i % 4) * 3;
        const px = x + Math.cos(ang) * v * age * k, py = y + (Math.sin(ang) * v * age - 14 * age + 18 * age * age) * k;
        ctx.fillRect(px, py, 0.7 * k, 0.6 * k);
      }
    } else if (m.kind === "fire") {
      const s = now / 1000, a = Math.min(1, age * 2, (16 - age) / 3);
      // Duman: yükselen, rüzgârla kayan halkalar.
      for (let i = 0; i < 5; i++) {
        const q = (s * 0.4 + i / 5) % 1;
        ctx.fillStyle = `rgba(60,52,46,${0.4 * a * (1 - q)})`;
        ctx.beginPath();
        ctx.arc(x + q * 3 * k, y - (1 + q * 7) * k, (0.8 + q * 2.2) * k, 0, TAU);
        ctx.fill();
      }
      // Alev: titreyen turuncu diller.
      for (let i = 0; i < 3; i++) {
        const fl = 0.8 + 0.3 * Math.sin(s * 11 + i * 2);
        ctx.fillStyle = i === 1 ? `rgba(255,220,120,${0.9 * a})` : `rgba(240,120,40,${0.85 * a})`;
        ctx.beginPath();
        ctx.moveTo(x + (i - 1) * 0.6 * k - 0.5 * k, y);
        ctx.quadraticCurveTo(x + (i - 1) * 0.6 * k, y - 2.2 * fl * k, x + (i - 1) * 0.6 * k + 0.5 * k, y);
        ctx.fill();
      }
    }
  }
}

/** Koşan atlıların tozu: hızlı yürüyen atlı birliğin arkasında solan bulutçuklar. */
function hoofDust(ctx, f, b, now) {
  const s = now / 1000;
  for (const u of b.units) {
    if (u.dead || u.gone || !(u.mounted || u.type === "cav" || u.type === "gen") || !u.wasMoving || u.engaged) continue;
    const back = { x: -Math.cos(u.facing), y: -Math.sin(u.facing) }, d = footprint(u).d / 2 + 0.6;
    for (let i = 0; i < 4; i++) {
      const q = (s * 1.6 + i / 4) % 1, side = (i % 2 ? 1 : -1) * footprint(u).w * 0.3;
      const x = u.x + back.x * (d + q * 3) - back.y * side, y = u.y + back.y * (d + q * 3) + back.x * side;
      ctx.fillStyle = `rgba(180,160,125,${0.35 * (1 - q)})`;
      ctx.beginPath();
      ctx.arc(f.x + x * f.k, f.y + y * f.k, (0.8 + q * 1.6) * f.k, 0, TAU);
      ctx.fill();
    }
  }
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
    const nw = text(ctx, String(st.men), align === "left" ? bx + bw + 8 : bx - 8, 44, { bold: true, size: 12, color: GOLD_LIGHT, align: align === "left" ? "left" : "right" });
    // Yoldaki takviye (bölüm 7b).
    if (st.coming) text(ctx, T.tacComing.replace("{0}", st.coming).replace("{1}", st.eta), align === "left" ? bx + bw + 16 + nw : bx - 16 - nw, 44, { italic: true, size: 11.5, color: CREAM, align: align === "left" ? "left" : "right" });
  };
  side("att", 18, "left");
  side("def", cam.w - 18, "right");
  const left = Math.max(0, Math.ceil((B.b.walls ? N.tactics.timeWalls : N.tactics.time) - B.b.t));
  text(ctx, B.title, cam.w / 2, 24, { title: true, bold: true, size: 16, color: GOLD_LIGHT, align: "center" });
  const status = B.b.over ? "" : B.paused ? T.tacPaused : `${T.tacTime} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}${B.speed > 1 ? `  ·  x${B.speed}` : ""}${B.auto ? `  ·  ${T.tacAuto}` : ""}`;
  const wth = B.b.weather, ws = wth ? [wth.sky !== "clear" ? T.sky[wth.sky] : null, T.dayTime[wth.time] || null].filter(Boolean).join(" · ") : "";
  text(ctx, ws && status ? `${status}  ·  ${ws}` : status || ws, cam.w / 2, 45, { italic: true, size: 12, color: B.paused ? GOLD_LIGHT : CREAM, align: "center" });
}

/** Alt bant: oyuncunun birliklerinin kartları (basınca seçer) ve düğmeler. */
function bottomBar(ctx, cam, B, T, boxes) {
  const y0 = cam.h - BOTTOM_H;
  ctx.fillStyle = "#1c150e";
  ctx.fillRect(0, y0, cam.w, BOTTOM_H);
  ctx.fillStyle = GOLD_DARK;
  ctx.fillRect(0, y0, cam.w, 2);
  const mine = B.b.units.filter((u) => u.side === B.me && !u.absorbed);
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
    ctx.fillStyle = out ? "#555" : colorOf(B.owners[B.me]);
    ctx.fill();
    ctx.strokeStyle = u.elite ? GOLD_LIGHT : "rgba(20,14,8,0.9)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (u.ship) boat(ctx, x + cw / 2, gy, CREAM, u.type);
    else glyph(ctx, u.type === "gen" ? "gen" : u.elite ? "elite" : u.type, x + cw / 2, gy, CREAM);
    text(ctx, out ? (u.dead ? "✕" : "↩") : u.routed ? "!" : String(Math.ceil(u.men)), x + cw / 2, small ? y + 33 : y + 52, { bold: true, size: small ? 11 : 13, color: u.routed ? "#d97a5a" : CREAM, align: "center" });
    if (!small) {
      const nm = B.unitName(u);
      let size = 10;
      while (size > 7 && measure(ctx, nm, { size }) > cw - 4) size -= 0.5;
      text(ctx, nm, x + cw / 2, y + 66, { size, color: "rgba(243,231,201,0.75)", align: "center" });
    }
    const out2 = out || u.taken;
    const m = out2 || u.routed ? 0 : Math.max(0, Math.min(1, (u.ship ? shipMorale(u) : moraleOf(u)) / 100));
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x + 4, y + h - (small ? 6 : 12), cw - 8, small ? 3 : 5);
    ctx.fillStyle = m > 0.5 ? "#7fb85a" : m > 0.25 ? "#d6a63a" : "#c4523a";
    ctx.fillRect(x + 4, y + h - (small ? 6 : 12), (cw - 8) * m, small ? 3 : 5);
    if (!out) boxes.push({ x, y, w: cw, h, act: { do: "tacPick", id: u.id }, tip: [B.unitName(u), `${Math.ceil(u.men)} / ${Math.round(u.start)}`, u.type === "gen" ? T.tacGeneralTip : null] });
  });
  // Düğmeler: sağda alt alta.
  const bx = right, by = y0 + 10;
  const over = !!B.b.over;
  button(ctx, boxes, { x: bx - bw - 8, y: by, w: bw, h: 30, label: B.paused ? (B.deploy ? T.tacBegin : T.tacGo) : T.tacPause, main: B.paused, size: 13, off: over, act: { do: "tacPause" }, tip: [T.tacPause, T.tacSpaceTip] });
  button(ctx, boxes, { x: bx, y: by, w: bw, h: 30, label: `${T.tacSpeed} x${B.speed}`, size: 13, off: over, act: { do: "tacSpeed" } });
  button(ctx, boxes, { x: bx - bw - 8, y: by + 36, w: bw, h: 30, label: T.tacAuto, main: B.auto, size: 13, off: over, act: { do: "tacAuto" }, tip: [T.tacAuto, T.tacAutoTip] });
  button(ctx, boxes, { x: bx, y: by + 36, w: bw, h: 30, label: T.tacRetreat, size: 13, off: over, act: { do: "tacRetreat" }, tip: [T.tacRetreat, T.tacRetreatTip] });
  wrap(ctx, T.tacHelp, bw * 2 + 8, { italic: true, size: 11 }).slice(0, 2).forEach((l, i) => text(ctx, l, bx - bw - 8, by + 84 + i * 13, { italic: true, size: 11, color: "rgba(243,231,201,0.6)" }));
}

/**
 * Dizilme şeridi (kullanıcı 27.10: "ekranın ortasında yazı duruyor, diziliş yapamıyorum"): sahanın üst kenarında
 * ince bir şerit - ne yapılacağı ve Başlat'ın altta olduğu; sahanın ortası boş kalır.
 */
function deployBar(ctx, cam, f, T) {
  const w = Math.min(f.w - 20, 760), h = 26, x = cam.w / 2 - w / 2, y = f.y + 6;
  ctx.fillStyle = "rgba(28,21,14,0.82)";
  roundRect(ctx, x, y, w, h, 5);
  ctx.fill();
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 1;
  ctx.stroke();
  const s = `${T.tacDeployTitle} · ${T.tacDeployHint}`;
  let size = 12.5;
  while (size > 9 && measure(ctx, s, { size }) > w - 20) size -= 0.5;
  text(ctx, s, cam.w / 2, y + 17, { size, color: CREAM, align: "center" });
}

/** Dizilme bölgesi: tarafın renginde soluk zemin, kesik çizgili sınır; oyuncununki daha belirgin. */
function zone(ctx, f, Z, owner, mine, k = 1) {
  const x = f.x + Z.x0 * f.k, y = f.y + Z.y0 * f.k, w = (Z.x1 - Z.x0) * f.k, h = (Z.y1 - Z.y0) * f.k;
  ctx.save();
  ctx.fillStyle = colorOf(owner);
  ctx.globalAlpha = (mine ? 0.12 : 0.07) * k;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = (mine ? 0.9 : 0.55) * k;
  ctx.strokeStyle = colorOf(owner);
  ctx.lineWidth = mine ? 2.5 : 1.8;
  ctx.setLineDash([10, 6]);
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
}

/**
 * Sonuç panosu: zafer ya da yenilgi, iki tarafın kaybı, haritaya dön. Kullanıcı 27.10: "bir anda çıkmasın, aşağıdan
 * yavaşça gelsin" - saha yavaşça kararır, pano biraz sonra aşağıdan kayıp yerine oturur.
 */
function endPanel(ctx, cam, B, T, lang, boxes, now) {
  B.endAt ??= now;
  const t = (now - B.endAt) / 1000;
  ctx.fillStyle = `rgba(12,8,4,${0.5 * easeOut(ramp(t, [0.1, 1.1]))})`;
  ctx.fillRect(0, 0, cam.w, cam.h);
  const s = ramp(t, [0.5, 1.7]);
  if (s <= 0) return;
  const won = B.b.over.winner === B.me;
  const w = Math.min(460, cam.w - 40), h = 176, x = (cam.w - w) / 2, rest = (cam.h - h) / 2 - 20;
  const y = rest + (cam.h - rest + 12) * (1 - backOut(s));
  // Gelirken düğmesi basılmaz.
  if (s < 1) boxes = [];
  panel(ctx, x, y, w, h);
  text(ctx, won ? T.tacWon : B.b.over.retreat ? T.tacFled : T.tacLost, cam.w / 2, y + 42, { title: true, bold: true, size: 24, align: "center", color: won ? INK.good : INK.bad });
  const lost = (s) => B.b.naval ? B.b.units.filter((u) => u.side === s && (u.dead || u.taken)).length : Math.round(B.b.units.filter((u) => u.side === s && !u.work).reduce((n, u) => n + (u.start - Math.floor(u.dead ? 0 : u.men)), 0));
  const fled = (s) => B.b.units.filter((u) => u.side === s && (u.routed || u.gone) && !u.dead).reduce((n, u) => n + Math.floor(u.men), 0);
  text(ctx, `${B.b.naval ? T.navalYourLoss : T.tacYourLoss}: ${lost(B.me)}  ·  ${B.b.naval ? T.navalTheirLoss : T.tacTheirLoss}: ${lost(B.foe)}`, cam.w / 2, y + 74, { size: 14, align: "center" });
  const note = B.b.over.timeout ? (B.me === "def" ? T.tacTimeoutHeld : T.tacTimeout) : won ? (fled(B.foe) ? `${T.tacTheyFled}: ${fled(B.foe)}` : "") : fled(B.me) ? `${T.tacWeFled}: ${fled(B.me)}` : "";
  if (note) text(ctx, note, cam.w / 2, y + 98, { italic: true, size: 12, color: INK.soft, align: "center" });
  button(ctx, boxes, { x: cam.w / 2 - 110, y: y + h - 52, w: 220, h: 38, label: T.tacBack, main: true, size: 15, act: { do: "tacEnd" } });
}
