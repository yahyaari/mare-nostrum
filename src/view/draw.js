// Haritayı çizer: kıyılar, topraklar, yollar, yerleşimler, ordular, seçimin işaretleri.
// Hiçbir şeyi değiştirmez; ne çizileceği `view` ile dışarıdan gelir. Arayüz (paneller,
// düğmeler) ui.js'te.
//
// Harita katmanları harita biriminde bir kere Path2D olarak kurulur, her karede kamera
// dönüşümüyle çizilir. Çizgi kalınlıkları ekran pikseli cinsinden yazılıyor (`px`), yoksa
// yakınlaştıkça kıyılar kalınlaşırdı.

import { LAND, LAKES, RIVERS } from "../data/geo.js";
import { PLACES, ROADS } from "../data/world.js";
import { SIZE, onLand, project } from "../geo.js";
import { BOUNDS, LON_SCALE } from "../data/bounds.js";
import { neighbours, roadBetween, roadLine } from "../rules/graph.js";
import { toScreen } from "./camera.js";
import { INK, SERIF, TAU, colorOf } from "./kit.js";
import { CREAM, DARK, GOLD, GOLD_LIGHT, TITLE, banner, castleModel, chevrons, cityModel, fleet, goalMark, plaque, roundRect, shield, ship, soldier, wonderMark } from "./pieces.js";
import { wonderAt } from "../rules/wonders.js";
import { field, forge, stall, temple, tent as campTent } from "./buildings.js";
import { clear, drawClouds, drawSnow, paintCompass, paintFog, paintGround, paintLabels } from "./atlas.js";
import { regions } from "./regions.js";
import { TREES } from "../data/trees.js";

// ---- bir kere kurulan yollar ----

function trace(path, pts, close) {
  pts.forEach(([lon, lat], i) => {
    const p = project(lon, lat);
    if (i) path.lineTo(p.x, p.y);
    else path.moveTo(p.x, p.y);
  });
  if (close) path.closePath();
}
const pairs = (flat) => {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i] / 100, flat[i + 1] / 100]);
  return out;
};

// Yerleşimlerin harita birimindeki yerleri: çizim katmanından ayrı (Path2D istemez), animasyon
// ve testler de kullanıyor.
const POS = Object.fromEntries(PLACES.map((p) => [p.id, project(p.lon, p.lat)]));

let cache = null;
function layers() {
  if (cache) return cache;
  const land = new Path2D(), lakes = new Path2D(), rivers = new Path2D();
  for (const r of LAND) trace(land, pairs(r), true);
  for (const r of LAKES) trace(lakes, pairs(r), true);
  for (const r of RIVERS) trace(rivers, pairs(r), false);
  // Kuru kara: kara, göller delik (çift-tek). Topraklar buna kırpılır; yoksa Azak Denizi ve
  // Hazar boyanıyordu.
  const dry = new Path2D();
  dry.addPath(land);
  dry.addPath(lakes);
  const roads = new Path2D(), lanes = new Path2D();
  for (const r of ROADS) trace(r.sea ? lanes : roads, roadLine(r), false);
  const cells = regions().map(({ id, poly }) => {
    const p = new Path2D();
    poly.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return { id, path: p };
  });
  const at = POS;
  return (cache = { land, lakes, dry, rivers, roads, lanes, cells, at });
}

/** Bir yerleşimin harita birimindeki yeri. */
export const placeAt = (id) => POS[id];

/** Bir yerleşimin ekrandaki yeri. */
export const placeOnScreen = (cam, id) => toScreen(cam, POS[id].x, POS[id].y);

const MARK = { walk: INK.ink, easy: INK.good, risky: INK.warn, hopeless: INK.bad };

/**
 * Haritayı çiz. `view`:
 *   lang, owners {id: civ|null}, selected (yer id), armies [{id, owner, at, men, selected}],
 *   threats {id: asker} (oyuncunun tehdit altındaki yerleri),
 *   marks {id: "walk"|"easy"|"risky"|"hopeless"}, route [id, id, ...] (seçili ordunun yolu),
 *   preview [id, id, ...] (farenin gösterdiği yere gidecek yol: henüz emir değil)
 * Dönen: ordu işaretlerinin kutuları [{ x, y, w, h, army }].
 */
export function drawMap(ctx, cam, view, dpr) {
  const L = layers();
  const k = cam.scale;
  const px = (n) => n / k;

  // Durağan katman (deniz, kara, topraklar, nehirler, yollar) kamera ve sahiplik değişmedikçe
  // aynı: önbellekten tek bir resim olarak basılıyor. Animasyon her karede çizdiği için bu
  // olmadan telefon kare başına bütün kıyıları beş kez boyuyordu.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const S = still(cam, view, dpr, L);
  const T = placement(S, cam, dpr);
  if (T.a === 1) ctx.drawImage(S.canvas, Math.round(T.x), Math.round(T.y));
  else {
    // Hareket sürerken: başka bir yakınlıkta çizilmiş katman ölçeklenir (bir an bulanık, sonra keskin).
    ctx.imageSmoothingQuality = "low";
    ctx.setTransform(T.a, 0, 0, T.a, T.x, T.y);
    ctx.drawImage(S.canvas, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (TERRAIN?.complete) drawClouds(ctx, cam, dpr, SIZE.x, performance.now() / 1000);
  if (view.winter) drawSnow(ctx, cam, dpr, performance.now() / 1000);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(vignette(Math.round(cam.w * dpr), Math.round(cam.h * dpr)), 0, 0);

  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (cam.w / 2 - cam.x * k), dpr * (cam.h / 2 - cam.y * k));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // Seçili yerleşimin yolları: koyu bir alt çizginin üstünde altın.
  if (view.selected) {
    for (const n of neighbours(view.selected)) {
      const r = roadBetween(view.selected, n);
      strokeRoad(ctx, r, px, 4.4, r.sea ? [px(6), px(4)] : [], "rgba(28,23,18,0.6)");
      strokeRoad(ctx, r, px, 2.2, r.sea ? [px(6), px(4)] : [], GOLD_LIGHT);
    }
  }
  // Seçili ordunun yolu: kalın kesik, koyu kenarlı krem. Önizleme (fare bir yerin üstündeyken
  // oraya gidecek yol): ince altın kesik.
  if (view.route?.pts.length > 1) strokeLine(ctx, view.route.pts, px, 6.6, 3.6, [9, 6], CREAM, "rgba(28,23,18,0.8)");
  if (view.preview?.pts.length > 1) strokeLine(ctx, view.preview.pts, px, 6, 3.2, [7, 5], GOLD_LIGHT, "rgba(28,23,18,0.7)");
  // Yürüyen orduların arkasındaki iz: geçtiği yollar ve şu anki yolun yürüdüğü kısmı, kendi
  // renginde. Ordu yolda yürüyor, bir yerden ötekine zıplamıyor - bunu gözle görülür kılan bu.
  for (const e of view.fx ?? []) if (e.kind === "trail") trail(ctx, e, px);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Turların bittiği yerler: numaralı halkalar (bu tur yetişilen yeşil, sonrakiler sarı).
  for (const r of [view.route, view.preview]) if (r) turnMarks(ctx, cam, r.turns);
  const tokens = drawPlaces(ctx, cam, view, L);
  drawEffects(ctx, cam, view.fx ?? []);
  return tokens;
}

// Durağan katman ekrandan her yönde %30 büyük çizilir: kaydırırken sadece yeri değişir, ancak
// kenara gelince, yakınlık ya da bir yerin sahibi değişince yeniden çizilir. (Her kaydırma
// karesinde araziyi, ağaçları ve toprakları baştan boyamak kareyi 25-45 ms'ye çıkarıyordu.)
let layer = null; // { canvas, content, k, q, cx, cy, mx, my }
// Kameranın en son kıpırdadığı an. Kamera kıpırdarken (kayma, yakınlaşma, sürükleme) katman her
// karede yeniden çizilmez: eskisi ölçeklenip kaydırılır; ekranı örtmez olursa yarım çözünürlükte
// (`q`) hızlıca yeniden çizilir. Kamera durunca bir kez keskin çizilir. (Kullanıcı 22.10:
// "kamera hızlı hareket ederken fps düşüyor" - her karede 2.5 ekranlık tuval baştan boyanıyordu.)
let lastCam = "", lastMoveAt = 0;
const SETTLE_MS = 160, MOVING_Q = 0.5;

/**
 * Katmanın ekrana nasıl basılacağı (cihaz pikseli): ölçek `a` ve sol üst köşe. Katman `S.k`
 * yakınlığında, `S.cx, S.cy` merkezli, `S.q` çözünürlükte çizildi; kamera şimdi `cam.scale`.
 */
function placement(S, cam, dpr) {
  const r = cam.scale / S.k;
  return {
    a: r / S.q,
    x: (dpr * cam.w) / 2 - r * (S.mx + (dpr * cam.w) / 2) + dpr * cam.scale * (S.cx - cam.x),
    y: (dpr * cam.h) / 2 - r * (S.my + (dpr * cam.h) / 2) + dpr * cam.scale * (S.cy - cam.y),
  };
}

/** Katman (ölçeklenmiş hâliyle) ekranın tamamını örtüyor mu. */
function covers(S, cam, dpr) {
  const T = placement(S, cam, dpr);
  return T.x <= 0.5 && T.y <= 0.5 && T.x + T.a * S.canvas.width >= dpr * cam.w - 0.5 && T.y + T.a * S.canvas.height >= dpr * cam.h - 0.5;
}


// Boyalı arazi: Natural Earth II (Tools/terrain.py), görünen sınırların her yönde PAY derece
// fazlası. Yüklenene kadar (açılışın ilk anı) eski çizgi harita çizilir.
const PAY = 4; // Tools/terrain.py ile aynı
const TERRAIN = typeof Image !== "undefined" ? new Image() : null;
if (TERRAIN) {
  TERRAIN.onload = () => { layer = null; window.MareNostrum?.redraw?.(); };
  TERRAIN.src = "assets/terrain.jpg";
}

// ---- kartın manzarası ----

/**
 * Şehir kartının başındaki resim: yerleşimin çevresinin arazisi yakından, ortasında büyük
 * maketi ve sancağı, altı kâğıda doğru solar. (Kullanıcının görselindeki liman tablosunun
 * yerine; resim yok, arazi resmi ve maket var.)
 */
const FY = 0.7;

export function drawVignette(ctx, id, owner, r, level = 2, zMax = 2.4, works = null) {
  const p = byIdPlace[id], m = POS[id];
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.fillStyle = "#4f6f73";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  if (TERRAIN?.complete && TERRAIN.naturalWidth) {
    const a = project(BOUNDS.w - PAY, BOUNDS.n + PAY), b = project(BOUNDS.e + PAY, BOUNDS.s - PAY);
    const kx = TERRAIN.naturalWidth / (b.x - a.x), ky = TERRAIN.naturalHeight / (b.y - a.y);
    // Yerleşim resmin yatay ortasında, dikeyde FY kadar aşağıda: maket tam onun üstünde durur.
    const hw = 1.6, hh = (hw * r.h) / r.w;
    ctx.drawImage(TERRAIN, (m.x - hw - a.x) * kx, (m.y - 2 * hh * FY - a.y) * ky, 2 * hw * kx, 2 * hh * ky, r.x, r.y, r.w, r.h);
  }
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = colorOf(owner);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = 1;
  const z = Math.min(zMax, r.h / 50);
  const cx = r.x + r.w / 2, cy = r.y + r.h * FY;
  const f = flagSize(p, owner, z * 0.62);
  banner(ctx, owner, cx, cy - 3 * z, f.w, f.h, f.pole, { gold: p.capital && !!owner });
  // Yapılar şehrin çevresinde (kullanıcı 26.10: "yükseltmeler bir şey yapıyormuşum gibi
  // hissettirmedi"): solda tarla şeritleri, sağda sanayinin bacaları, önde kışlanın çadırları,
  // arkada tapınak, yanında pazar. Seviye arttıkça çoğalır.
  if (works) {
    const s = z * 0.42;
    for (let i = 0; i < Math.min(5, works.farms ?? 0); i++) field(ctx, cx - 30 * z + (i % 2) * 3 * z, cy + 4 * z + i * 1.6 * z, 16 * z, i);
    if ((works.temple ?? 0) > 0) temple(ctx, cx - 16 * z, cy - 6 * z, s * 0.9);
    if ((works.industry ?? 0) > 0) forge(ctx, cx + 22 * z, cy + 3 * z, s, Math.min(4, works.industry));
    if ((works.market ?? 0) > 0) stall(ctx, cx + 11 * z, cy + 7 * z, s * 1.1, owner);
    for (let i = 0; i < Math.min(4, works.barracks ?? 0); i++) campTent(ctx, cx - 8 * z + i * 4 * z, cy + 10 * z - (i % 2) * z, 3.4 * z, owner);
  }
  if (p.kind === "castle") castleModel(ctx, cx, cy + 2 * z, z * 1.1, level);
  else cityModel(ctx, cx, cy + 2 * z, z, p.capital, level);
  // Üstte ve altta solma: üst koyu, alt kâğıda.
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, "rgba(20,14,8,0.35)");
  g.addColorStop(0.3, "rgba(20,14,8,0)");
  g.addColorStop(0.78, "rgba(241,229,200,0)");
  g.addColorStop(1, "rgba(241,229,200,0.85)");
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
  ctx.strokeStyle = "#2a2016";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}

// ---- mini harita ----
//
// Görünen sınırların tamamı küçük bir kutuda: arazi, sahiplerin renkleri, yerleşimler birer
// nokta, ve kameranın gördüğü yer bir çerçeve. Sahiplik değişmedikçe önbellekten basılır.

let miniCanvas = null, miniKey = "";

export function drawMinimap(ctx, r, cam, owners) {
  const L = layers();
  const key = [r.w, r.h, TERRAIN?.complete ? 1 : 0, PLACES.map((p) => owners[p.id] ?? "-").join(",")].join("|");
  if (key !== miniKey) {
    miniKey = key;
    const k = 2; // keskin dursun
    miniCanvas ??= document.createElement("canvas");
    miniCanvas.width = Math.round(r.w * k);
    miniCanvas.height = Math.round(r.h * k);
    const c = miniCanvas.getContext("2d");
    const sx = miniCanvas.width / SIZE.x, sy = miniCanvas.height / SIZE.y;
    c.setTransform(sx, 0, 0, sy, 0, 0);
    c.fillStyle = "#4f6f73";
    c.fillRect(0, 0, SIZE.x, SIZE.y);
    if (TERRAIN?.complete && TERRAIN.naturalWidth) {
      const a = project(BOUNDS.w - PAY, BOUNDS.n + PAY), b = project(BOUNDS.e + PAY, BOUNDS.s - PAY);
      c.drawImage(TERRAIN, a.x, a.y, b.x - a.x, b.y - a.y);
    } else {
      c.fillStyle = "#c9b98f";
      c.fill(L.land, "evenodd");
    }
    c.save();
    c.clip(L.dry, "evenodd");
    for (const cell of L.cells) {
      const owner = owners[cell.id];
      if (!owner) continue;
      c.globalAlpha = 0.55;
      c.fillStyle = colorOf(owner);
      c.fill(cell.path);
    }
    c.restore();
    c.globalAlpha = 1;
    for (const p of PLACES) {
      c.beginPath();
      c.arc(POS[p.id].x, POS[p.id].y, (p.capital ? 2.6 : 1.7) / sx, 0, TAU);
      c.fillStyle = colorOf(owners[p.id]);
      c.fill();
      c.lineWidth = 0.8 / sx;
      c.strokeStyle = "#1c1712";
      c.stroke();
    }
  }
  ctx.drawImage(miniCanvas, r.x, r.y, r.w, r.h);
  if (!cam) return; // özetteki harita tekrarı: kamera çerçevesi yok
  // Kameranın gördüğü yer
  const fx = r.w / SIZE.x, fy = r.h / SIZE.y;
  const x0 = Math.max(r.x, r.x + (cam.x - cam.w / 2 / cam.scale) * fx), y0 = Math.max(r.y, r.y + (cam.y - cam.h / 2 / cam.scale) * fy);
  const x1 = Math.min(r.x + r.w, r.x + (cam.x + cam.w / 2 / cam.scale) * fx), y1 = Math.min(r.y + r.h, r.y + (cam.y + cam.h / 2 / cam.scale) * fy);
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 3;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
}

// ---- ağaçlar ----
//
// Ormanlık yerlere (Tools/terrain.py, src/data/trees.js) serpiştirilmiş küçük ağaç kümeleri,
// kullanıcının görselindeki gibi. Haritayla birlikte büyürler; uzaktayken seyrekleşirler,
// çok uzakta hiç çizilmezler. Yerleşimlerin dibinde ağaç yok: maket ve sancak temiz dursun.

const TREE = 0.14; // bir kümenin eni, harita birimi
let treeAt = null, treeSprites = null;

function trees() {
  if (treeAt) return treeAt;
  const near = (x, y) => PLACES.some((p) => Math.hypot(POS[p.id].x - x, POS[p.id].y - y) < 0.45);
  treeAt = [];
  for (let i = 0; i < TREES.length; i += 2) {
    const m = project(TREES[i] / 100, TREES[i + 1] / 100);
    if (!near(m.x, m.y)) treeAt.push(m);
  }
  return treeAt;
}

function sprites() {
  if (treeSprites) return treeSprites;
  // Üç çeşit küme, 64 piksellik tuvallere bir kere çizilir.
  treeSprites = [[[-0.18, 0.05, 0.26], [0.17, 0.1, 0.24], [0, -0.12, 0.27]], [[-0.12, 0, 0.3], [0.2, 0.08, 0.22]], [[0, -0.04, 0.32], [-0.24, 0.12, 0.2], [0.24, 0.14, 0.18]]]
    .map((blobs) => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      g.translate(32, 36);
      g.scale(64, 64);
      g.fillStyle = "rgba(20,25,10,0.3)";
      g.beginPath();
      g.ellipse(0.04, 0.3, 0.42, 0.1, 0, 0, TAU);
      g.fill();
      for (const [x, y, r] of [...blobs].sort((p, q) => p[1] - q[1])) {
        g.fillStyle = "#4a3523";
        g.fillRect(x - 0.025, y + r * 0.5, 0.05, 0.16);
        const rg = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r);
        rg.addColorStop(0, "#7d9450");
        rg.addColorStop(0.55, "#4d6a32");
        rg.addColorStop(1, "#2f4521");
        g.fillStyle = rg;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
        g.strokeStyle = "rgba(25,32,15,0.7)";
        g.lineWidth = 0.025;
        g.stroke();
      }
      return c;
    });
  return treeSprites;
}

function paintTrees(ctx, cam) {
  const r = cam.scale / cam.min;
  if (TREE * cam.scale < 3.2) return;
  const step = r < 1.4 ? 3 : r < 2.2 ? 2 : 1;
  const hw = cam.w / 2 / cam.scale + TREE, hh = cam.h / 2 / cam.scale + TREE;
  const S = sprites();
  const list = trees();
  for (let i = 0; i < list.length; i += step) {
    const m = list[i];
    if (Math.abs(m.x - cam.x) > hw || Math.abs(m.y - cam.y) > hh) continue;
    ctx.drawImage(S[i % 3], m.x - TREE / 2, m.y - TREE * 0.56, TREE, TREE);
  }
}

function paintTerrain(ctx, view, L, px, cam) {
  const a = project(BOUNDS.w - PAY, BOUNDS.n + PAY), b = project(BOUNDS.e + PAY, BOUNDS.s - PAY);
  ctx.drawImage(TERRAIN, a.x, a.y, b.x - a.x, b.y - a.y);
  paintTrees(ctx, cam);

  // Kış: kara soğuk, beyazımsı bir örtü altında.
  if (view.winter) {
    ctx.save();
    ctx.fillStyle = "rgba(236,242,247,0.34)";
    ctx.fill(L.dry, "evenodd");
    ctx.restore();
  }

  // Topraklar: sahibinin renginde ince bir boya, kenarlarında içe doğru aynı renkte bir parıltı
  // (iki medeniyetin sınırı iki renkli görünür). Sadece karada.
  ctx.save();
  ctx.clip(L.dry, "evenodd");
  for (const c of L.cells) {
    const owner = view.owners[c.id];
    if (!owner) continue;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = colorOf(owner);
    ctx.fill(c.path);
  }
  for (const c of L.cells) {
    const owner = view.owners[c.id];
    if (!owner) continue;
    ctx.save();
    ctx.clip(c.path);
    ctx.strokeStyle = colorOf(owner);
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = px(10);
    ctx.stroke(c.path);
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = px(3);
    ctx.stroke(c.path);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,243,212,0.4)";
  ctx.lineWidth = px(1);
  for (const c of L.cells) ctx.stroke(c.path);
  ctx.restore();

  ctx.strokeStyle = "rgba(24,34,34,0.5)";
  ctx.lineWidth = px(1.1);
  ctx.stroke(L.land);

  // Yollar: koyu bir alt çizginin üstünde açık toprak rengi patika. Deniz yolları kesik, açık.
  ctx.strokeStyle = "rgba(52,36,20,0.5)";
  ctx.lineWidth = px(2.8);
  ctx.stroke(L.roads);
  ctx.strokeStyle = "rgba(231,208,160,0.92)";
  ctx.lineWidth = px(1.2);
  ctx.stroke(L.roads);
  ctx.strokeStyle = "rgba(236,240,228,0.6)";
  ctx.lineWidth = px(1.3);
  ctx.setLineDash([px(5), px(5)]);
  ctx.stroke(L.lanes);
  ctx.setLineDash([]);

}

/** Kenarlarda hafif bir karartma (göz ortaya toplanır); ekran boyu değişmedikçe aynı resim. */
let veil = null;
function vignette(W, H) {
  if (veil && veil.width === W && veil.height === H) return veil;
  veil = document.createElement("canvas");
  veil.width = W;
  veil.height = H;
  const c = veil.getContext("2d");
  const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.58);
  g.addColorStop(0, "rgba(20,14,8,0)");
  g.addColorStop(1, "rgba(20,14,8,0.42)");
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  return veil;
}

function still(cam, view, dpr, L) {
  const W = Math.round(cam.w * dpr), H = Math.round(cam.h * dpr);
  const k = cam.scale;
  const ready = !!(TERRAIN?.complete && TERRAIN.naturalWidth);
  // Sis görülen yerlere bağlı; adlar yazı tiplerine (yüklenince yeniden çizilsin).
  const fog = view.fog ? (view.eyes ?? []).map((e) => `${e.x},${e.y},${e.r}`).join(";") + "/" + [...view.friends].sort().join(",") : "-";
  const fonts = typeof document !== "undefined" ? document.fonts?.status : "";
  const content = [W, H, ready, fog, fonts, view.winter ? "W" : "", PLACES.map((p) => view.owners[p.id] ?? "-").join(",")].join("|");
  const now = performance.now();
  const at = `${cam.x}|${cam.y}|${k}`;
  if (at !== lastCam) { lastCam = at; lastMoveAt = now; }
  const moving = now - lastMoveAt < SETTLE_MS;
  if (layer && layer.content === content) {
    // Keskin ve aynı yakınlıkta: kamera katmanın payı içinde kaldıkça aynı resim.
    if (layer.q === 1 && layer.k === k && Math.abs(cam.x - layer.cx) * k * dpr <= layer.mx && Math.abs(cam.y - layer.cy) * k * dpr <= layer.my) return layer;
    // Kamera kıpırdıyor: ekranı örttüğü sürece eski resim ölçeklenir, kaydırılır.
    if (moving && covers(layer, cam, dpr)) return layer;
  }
  const q = moving ? MOVING_Q : 1;
  const mx = Math.round(W * 0.3), my = Math.round(H * 0.3);
  const cw = Math.round((W + 2 * mx) * q), ch = Math.round((H + 2 * my) * q);
  const canvas = layer?.canvas ?? document.createElement("canvas");
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  layer = { canvas, content, k, q, cx: cam.x, cy: cam.y, mx, my };
  // Kaç kez yeniden çizildiği: Tools/fps.mjs ölçer (kamera kıpırdarken az olmalı).
  if (typeof window !== "undefined") window.__rebuilds = (window.__rebuilds ?? 0) + 1;
  const ctx = canvas.getContext("2d");
  const px = (n) => n / k;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = INK.sea;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.setTransform(q * dpr * k, 0, 0, q * dpr * k, q * (mx + dpr * (cam.w / 2 - cam.x * k)), q * (my + dpr * (cam.h / 2 - cam.y * k)));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Ağaçlar için görünen alan: katmanın tamamı. Sonra sis, en üstte adlar ve pusula (sisin
  // içinde de okunur: haritalar herkesin elinde).
  if (ready) {
    paintTerrain(ctx, view, L, px, { ...cam, w: cam.w * 1.6, h: cam.h * 1.6 });
    // Sis, arazi işaretleri, adlar ve pusula kendi dönüşümlerini kurar: katmanın çözünürlüğüyle.
    const ox = q * (mx + dpr * (cam.w / 2 - cam.x * k)), oy = q * (my + dpr * (cam.h / 2 - cam.y * k));
    if (view.fog) paintFog(ctx, canvas, L.cells, view.eyes ?? [], view.friends, ox, oy, k, q * dpr);
    paintGround(ctx, ox, oy, k, q * dpr);
    paintLabels(ctx, ox, oy, k, q * dpr);
    paintCompass(ctx, ox, oy, k, q * dpr);
    return layer;
  }

  // Kıyıya paralel iki ince dalga çizgisi: kıyıyı kalın boyayıp içini deniz rengiyle sil,
  // geriye iki kenar kalır. Karanın içine düşen yarısını birazdan kara örtüyor.
  for (const [outer, inner] of [[15, 13.6], [8, 6.6]]) {
    ctx.strokeStyle = INK.ripple;
    ctx.lineWidth = px(outer);
    ctx.stroke(L.land);
    ctx.strokeStyle = INK.sea;
    ctx.lineWidth = px(inner);
    ctx.stroke(L.land);
  }
  ctx.fillStyle = INK.paper;
  ctx.fill(L.land, "evenodd");

  // Topraklar: sahibinin renginde hafif bir boya, aralarında noktalı sınır. Sadece karada.
  ctx.save();
  ctx.clip(L.land, "evenodd");
  for (const c of L.cells) {
    const owner = view.owners[c.id];
    ctx.globalAlpha = owner ? 0.26 : 0.08;
    ctx.fillStyle = colorOf(owner);
    ctx.fill(c.path);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = INK.border;
  ctx.lineWidth = px(1);
  ctx.setLineDash([px(1.5), px(3)]);
  for (const c of L.cells) ctx.stroke(c.path);
  ctx.setLineDash([]);
  ctx.restore();

  ctx.fillStyle = INK.sea;
  ctx.fill(L.lakes);
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = px(0.8);
  ctx.stroke(L.lakes);
  ctx.strokeStyle = INK.river;
  ctx.lineWidth = px(1.1);
  ctx.stroke(L.rivers);
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = px(1.3);
  ctx.stroke(L.land);

  ctx.strokeStyle = INK.road;
  ctx.lineWidth = px(1.6);
  ctx.stroke(L.roads);
  ctx.strokeStyle = INK.lane;
  ctx.lineWidth = px(1.4);
  ctx.setLineDash([px(5), px(4)]);
  ctx.stroke(L.lanes);
  ctx.setLineDash([]);
  return layer;
}

/** Bir nokta dizisini kesikli, koyu kenarlı çiz (yol ve önizleme). */
function strokeLine(ctx, pts, px, outer, inner, dash, color, edge) {
  const p = new Path2D();
  pts.forEach((m, i) => (i ? p.lineTo(m.x, m.y) : p.moveTo(m.x, m.y)));
  ctx.setLineDash(dash.map(px));
  ctx.strokeStyle = edge;
  ctx.lineWidth = px(outer);
  ctx.stroke(p);
  ctx.strokeStyle = color;
  ctx.lineWidth = px(inner);
  ctx.stroke(p);
  ctx.setLineDash([]);
}

/** Yolun üstünde her turun bittiği yer: koyu halka, içinde tur sayısı; bu tur yetişilen yer yeşil. */
function turnMarks(ctx, cam, turns) {
  const many = turns.length > 1 || turns[0]?.n > 1;
  for (const t of turns) {
    const s = toScreen(cam, t.x, t.y);
    const r = t.end ? 9 : 7.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, TAU);
    ctx.fillStyle = t.n === 1 ? "rgba(63,122,55,0.92)" : "rgba(168,116,16,0.92)";
    ctx.fill();
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = GOLD_LIGHT;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (!many) continue;
    ctx.fillStyle = CREAM;
    ctx.font = `bold 10px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(t.n), s.x, s.y + 0.5);
  }
}

function trail(ctx, e, px) {
  const p = new Path2D();
  e.pts.forEach((m, i) => (i ? p.lineTo(m.x, m.y) : p.moveTo(m.x, m.y)));
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK.card;
  ctx.lineWidth = px(6);
  ctx.globalAlpha = 0.7;
  ctx.stroke(p);
  ctx.strokeStyle = e.color;
  ctx.lineWidth = px(3.2);
  ctx.globalAlpha = 0.85;
  ctx.setLineDash(e.sea ? [px(4), px(4)] : []);
  ctx.stroke(p);
  ctx.restore();
}

function strokeRoad(ctx, r, px, width, dash = null, color = null) {
  if (!r) return;
  const p = new Path2D();
  trace(p, roadLine(r), false);
  ctx.strokeStyle = color ?? (r.sea ? INK.lane : INK.ink);
  ctx.lineWidth = px(width);
  ctx.setLineDash(dash ?? (r.sea ? [px(6), px(4)] : []));
  ctx.stroke(p);
  ctx.setLineDash([]);
}

// ---- yerleşimler ve ordular ----

function drawPlaces(ctx, cam, view, L) {
  const z = sizeAt(cam);
  const shown = [];
  for (const p of PLACES) {
    const s = toScreen(cam, L.at[p.id].x, L.at[p.id].y);
    if (s.x < -90 || s.y < -40 || s.x > cam.w + 90 || s.y > cam.h + 90) continue;
    shown.push({ p, s });
  }

  // Zemindeki halkalar (maketin altında, yere yatık): tehdit, seçim, yürünebilir ve
  // saldırılabilir yerler.
  const ring = (s, rx, color, width, dash = null, fill = null) => {
    ctx.beginPath();
    ctx.ellipse(s.x, s.y + 1, rx * z, rx * z * 0.42, 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash ?? []);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  for (const { p, s } of shown) {
    if (view.threats?.[p.id]) ring(s, 30, INK.bad, 2.5, [6, 4]);
    // Kuşatma: surların çevresinde koyu kırmızı, kalın, kesik bir halka.
    if (view.sieges?.[p.id] !== undefined) {
      ring(s, 36, "rgba(40,16,10,0.55)", 6, [4, 4]);
      ring(s, 36, "rgba(178,52,40,0.95)", 3, [4, 4]);
    }
    if (p.id === view.selected) ring(s, 24, GOLD_LIGHT, 2.2, null, "rgba(236,212,154,0.28)");
    // Başlangıç ekranında seçilen medeniyetin yerleri.
    if (view.halo?.has(p.id)) ring(s, 26, GOLD_LIGHT, 2.6, null, "rgba(236,212,154,0.22)");
    const m = view.marks?.[p.id];
    if (m === "walk") ring(s, 21, "rgba(243,231,201,0.95)", 1.8, [3, 4]);
    else if (m) ring(s, 23, MARK[m], 3.2, null, "rgba(255,255,255,0.12)");
  }

  docked(ctx, cam, view, shown, z);

  // Sancaklar ve maketler: önce sancak (direğin dibi maketin arkasında kalır), sonra maket.
  // Kuzeydekiler önce: güneydekinin sancağı onun üstüne düşer, tersi değil.
  const now0 = performance.now();
  for (const { p, s } of [...shown].sort((a, b) => a.s.y - b.s.y)) {
    const owner = view.owners[p.id];
    const f = flagSize(p, owner, z);
    // Sisin içindeki yer soluk: sahibi bilinir, içi görünmez.
    ctx.globalAlpha = view.fog && !view.seen.has(p.id) ? 0.62 : 1;
    const wave = now0 / 650 + (p.id.charCodeAt(0) + p.id.length * 7) * 0.9;
    banner(ctx, owner, s.x, s.y - 3 * z, f.w, f.h, f.pole, { gold: p.capital && !!owner, wave });
    const lv = view.levels?.[p.id] ?? 2;
    if (p.kind === "castle") castleModel(ctx, s.x, s.y + 2 * z, z * 1.15, lv);
    else cityModel(ctx, s.x, s.y + 2 * z, z * 1.15, p.capital, lv);
    if (p.port) anchor(ctx, s.x + 18 * z, s.y + 1, view.blockade?.[p.id]);
    ctx.globalAlpha = 1;
    // Dünya harikası: sancağın sağında altın tapınaklı madalyon.
    if (wonderAt(p.id) || view.built?.[p.id]) wonderMark(ctx, s.x + f.w / 2 + 10, s.y - f.pole + 22, 8.5 * Math.max(1, Math.min(1.3, z)));
    // Bir görevin hedefi: sancağın solunda altın bir madalyon.
    if (view.goals?.[p.id]) goalMark(ctx, s.x - f.w / 2 - 10, s.y - f.pole + 2);
    // İnşaatı süren kendi yerin: sancağın solunda küçük bir çekiç rozeti.
    if (view.building?.[p.id]) {
      const bx = s.x - f.w / 2 - 9, by = s.y - f.pole + 6;
      ctx.beginPath();
      ctx.arc(bx, by, 7, 0, TAU);
      ctx.fillStyle = DARK;
      ctx.fill();
      ctx.strokeStyle = GOLD_LIGHT;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(-0.75);
      ctx.fillStyle = GOLD_LIGHT;
      ctx.fillRect(-0.9, -2, 1.8, 6.5);
      ctx.fillRect(-3.4, -4.2, 6.8, 2.8);
      ctx.restore();
    }
    // Casusun olduğu (ya da yolda olduğu) yabancı yer: sancağın solunda bir göz rozeti.
    if (view.spies?.[p.id]) {
      const bx = s.x - f.w / 2 - 9, by = s.y - f.pole + 6, on = view.spies[p.id] === "in";
      ctx.globalAlpha = on ? 1 : 0.6;
      ctx.beginPath();
      ctx.arc(bx, by, 7.5, 0, TAU);
      ctx.fillStyle = DARK;
      ctx.fill();
      ctx.strokeStyle = on ? GOLD_LIGHT : "#9a8a6a";
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(bx, by, 4.6, 2.6, 0, 0, TAU);
      ctx.strokeStyle = CREAM;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx, by, 1.4, 0, TAU);
      ctx.fillStyle = CREAM;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Huzursuz (sadakati düşük) kendi yerin: sancağın yanında kırmızı bir ünlem rozeti.
    const lo = view.unrest?.[p.id];
    if (lo !== undefined) {
      const x = s.x + f.w / 2 + 7, y = s.y - f.pole + 2;
      ctx.beginPath();
      ctx.arc(x, y, 6.5, 0, TAU);
      ctx.fillStyle = lo < 25 ? INK.bad : INK.warn;
      ctx.fill();
      ctx.strokeStyle = CREAM;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = CREAM;
      ctx.font = `bold 10px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", x, y + 0.5);
    }
  }

  // Ordular. Karadakiler yerleşimin sağında yan yana asker figürleri, yanlarında sayıları.
  // Gemisi olan ordu limanda denizde bir filo olarak durur, deniz yolunda kadırga olarak yüzer
  // (kullanıcı 21.10: "gemiler denizlerde donanma olarak gözüksün, kara ordusu gibi değil").
  const tokens = [];
  const at = {};
  const beside = {}; // sahada aynı yerde duran orduların kaydırması
  // Sadece gemiden filo: etikette gemi sayısı (kadırgalar zaten gemi olduğunu söylüyor).
  const label = (a) => (a.men <= 0 && a.ships ? String(a.ships) : a.men >= 1000 ? (a.men / 1000).toFixed(1) + "k" : String(a.men));
  ctx.font = `bold 11px ${SERIF}`;
  const zt = Math.max(1, Math.min(1.4, z));
  // Filonun limandan uzaklığı: yakında 44 piksel, uzakta haritanın yarım birimi (yoksa dar
  // denizlerde karşı kıyıya, komşu şehrin üstüne düşüyordu), ama maketin içine girmeyecek kadar.
  const off = Math.max(26, Math.min(44 * z, 0.55 * cam.scale));
  const tagW = (a) => Math.max(22, ctx.measureText(label(a)).width + 10);
  const width = (a) => (17 + tagW(a)) * zt;
  const fleetBox = (a, sx, sy, extra) => ({
    x: sx - FLEET.ax * zt, y: sy - FLEET.ay * zt, w: (FLEET.tag + tagW(a)) * zt, h: FLEET.h * zt, army: a, label: label(a), fleet: true, ...extra,
  });
  for (const a of view.armies ?? []) {
    // Sisin içindeki yabancı ordu görünmez (yürürken de: bulunduğu nokta açık mı).
    if (view.fog && a.owner !== view.me && !(a.float ? clear(a.float, view.eyes ?? []) : view.seen.has(a.at))) continue;
    // Yerleşimin dışındaki ordu (sahada ya da animasyonla yürürken) bulunduğu yerde; aynı yerde
    // duran ordular yan yana. Kuşatan ordunun yanında kamp çadırları.
    if (a.float) {
      const s = toScreen(cam, a.float.x, a.float.y);
      const spot = a.moving ? null : `${Math.round(a.float.x * 4)},${Math.round(a.float.y * 4)}`;
      const before = spot ? (beside[spot] ?? 0) : 0;
      if (a.sea && a.ships > 0) {
        tokens.push(fleetBox(a, s.x + before, s.y + 6 * zt, { moving: !!a.moving, flip: a.dir < 0 }));
        if (spot) beside[spot] = before + FLEET.tag * zt + tagW(a) * zt + 3;
      } else {
        tokens.push({ x: s.x - 8 * zt + before, y: s.y - 30 * zt, w: width(a), h: 32 * zt, army: a, label: label(a), moving: !!a.moving, camp: !!a.camp });
        if (spot) beside[spot] = before + width(a) + 3;
      }
    } else (at[a.at] ??= []).push(a);
  }
  for (const { p, s } of shown) {
    const here = at[p.id] ?? [];
    const afloat = here.filter((a) => p.port && a.ships > 0);
    const ashore = here.filter((a) => !afloat.includes(a));
    ashore.forEach((a, i) => {
      const before = ashore.slice(0, i).reduce((n, b) => n + width(b) + 3, 0);
      tokens.push({ x: s.x + 20 * z + before, y: s.y - 30 * zt, w: width(a), h: 32 * zt, army: a, label: label(a) });
    });
    if (afloat.length) {
      // Limanın denize bakan yanında; birden çok filo yan yana.
      const d = seaDir(p.id);
      afloat.forEach((a, i) => {
        const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
        const fx = s.x + d.x * off * 1.3 - d.y * side * 74 * zt, fy = s.y + d.y * off + d.x * side * 40 * zt + 12 * zt;
        tokens.push(fleetBox(a, fx, fy, { flip: d.x < -0.3 }));
      });
    }
  }

  // Adlar: önce seçili, sonra başkentler, şehirler, kaleler. Bir levha başka bir levhanın, bir
  // maketin ya da bir ordunun üstüne düşecekse yazılmaz - yakınlaşınca yer açılır.
  const taken = [...shown.map(({ s }) => ({ x: s.x - 16 * z, y: s.y - 14 * z, w: 32 * z, h: 18 * z })), ...tokens.filter((t) => !t.moving && !t.fleet)];
  const rank = (p) => (p.id === view.selected || p.id === view.hover || view.halo?.has(p.id) ? 0 : p.capital ? 1 : p.kind === "city" ? 2 : 3);
  for (const { p, s } of [...shown].sort((a, b) => rank(a.p) - rank(b.p))) {
    const name = p.name[view.lang].toLocaleUpperCase(view.lang === "tr" ? "tr" : "en");
    const size = p.capital ? Math.max(11, Math.min(15, 10.5 * z)) : Math.max(9.5, Math.min(13, 9 * z));
    ctx.font = `${p.capital ? 700 : 600} ${size}px ${TITLE}`;
    const w = ctx.measureText(name).width + (p.capital ? 30 : 14);
    const box = { x: s.x - w / 2, y: s.y + 7 * z, w, h: size + 7 };
    const lit = p.id === view.selected || p.id === view.hover;
    if (!lit && taken.some((t) => overlap(t, box))) continue;
    taken.push(box);
    ctx.globalAlpha = view.fog && !view.seen.has(p.id) && !lit ? 0.78 : 1;
    plaque(ctx, name, s.x, box.y, { size, bold: p.capital, capital: p.capital, selected: lit });
    ctx.globalAlpha = 1;
  }

  const now = performance.now();
  for (const t of tokens) {
    const { army } = t;
    const bob = army.walking ? (army.sea ? Math.sin(now / 260) * 2 : -Math.abs(Math.sin(now / 110)) * 2.5) : 0;
    // Figür (ya da filo) ve etiket bir kutuda çizilir, kutu zt kadar büyütülür.
    ctx.save();
    ctx.translate(t.x, t.y + bob);
    ctx.scale(zt, zt);
    const base = army.alpha ?? 1;
    const w = t.w / zt;
    if (t.fleet) {
      if (army.selected) {
        ctx.beginPath();
        ctx.ellipse(FLEET.ax, FLEET.ay + 1, 34, 8, 0, 0, TAU);
        ctx.fillStyle = "rgba(236,212,154,0.35)";
        ctx.fill();
        ctx.strokeStyle = GOLD_LIGHT;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.globalAlpha = base * (army.spent ? 0.6 : 1);
      fleet(ctx, army.owner, FLEET.ax, FLEET.ay, army.ships, FLEET.k, { flip: t.flip, troops: army.men > 0, wake: army.walking, gold: army.selected });
      tag(ctx, army, t.label, FLEET.tag - 2, 4, w - FLEET.tag + 2, base);
    } else {
      const h = 32;
      ctx.globalAlpha = base;
      const feet = { x: 8, y: h - 2 };
      if (army.selected) {
        ctx.beginPath();
        ctx.ellipse(feet.x, feet.y, 11, 4, 0, 0, TAU);
        ctx.fillStyle = "rgba(236,212,154,0.5)";
        ctx.fill();
        ctx.strokeStyle = GOLD_LIGHT;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      // Kamp: askerin arkasında iki çadır.
      if (t.camp) {
        tent(ctx, -10, h - 3, 11, army.owner);
        tent(ctx, 1, h - 9, 9, army.owner);
        // Barbar kampı: çadırların önünde titreyen bir kamp ateşi (bağımsız ordudan ayırt edilsin).
        if (army.barb) campfire(ctx, -3, h + 1);
      }
      // Karadaki ordunun gemileri varsa (limanda değil): ayağının altında küçük bir tekne.
      const boat = army.ships > 0;
      if (boat) ship(ctx, feet.x + 2, feet.y + 2, 0.8);
      // Hareketi bitmiş ordu soluk: bu tur artık bir şey yapamaz.
      ctx.globalAlpha = base * (army.spent ? 0.5 : 1);
      soldier(ctx, army.owner, feet.x, feet.y - (boat ? 3 : 0), 1, { gold: army.selected });
      tag(ctx, army, t.label, 17, 8, w - 17, base);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // Basılacak kutu biraz büyük. Yürüyen orduya basılmaz: ordu zaten varacağı yerde. Filonun
  // kutusu sadece gemiler ve etiket (direğin tepesi ve boşluklar değil).
  return tokens.filter((t) => !t.moving).map((t) => (t.fleet
    ? { x: t.x + 2 * zt, y: t.y + 10 * zt, w: t.w - 2 * zt, h: t.h - 6 * zt, army: t.army.id, fleet: true }
    : { x: t.x - 4, y: t.y - 4, w: t.w + 8, h: t.h + 8, army: t.army.id }));
}

// Filonun kutusu (zt = 1'de): öndeki kadırganın su hattı (ax, ay), etiket `tag`tan sonra.
const FLEET = { ax: 30, ay: 43, h: 50, tag: 57, k: 1.15 };

/** Kamp ateşi: iki odun, üstünde titreyen alev. (x, y) zeminin ortası. */
function campfire(ctx, x, y) {
  const f = 0.85 + 0.15 * Math.sin(performance.now() / 120);
  ctx.save();
  ctx.strokeStyle = "#4a3320";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - 4, y);
  ctx.lineTo(x + 4, y - 2);
  ctx.moveTo(x - 4, y - 2);
  ctx.lineTo(x + 4, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 1);
  ctx.quadraticCurveTo(x - 2, y - 7 * f, x, y - 10 * f);
  ctx.quadraticCurveTo(x + 2, y - 7 * f, x + 3, y - 1);
  ctx.closePath();
  ctx.fillStyle = "#f08a2a";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 1.4, y - 1);
  ctx.quadraticCurveTo(x, y - 6 * f, x + 1.4, y - 1);
  ctx.closePath();
  ctx.fillStyle = "#ffd36a";
  ctx.fill();
  ctx.restore();
}

/** Kamp çadırı: krem bez, sahibinin renginde şerit, koyu kapı. (x, y) zeminin ortası. */
function tent(ctx, x, y, s, owner) {
  ctx.beginPath();
  ctx.moveTo(x - s * 0.7, y);
  ctx.lineTo(x, y - s);
  ctx.lineTo(x + s * 0.7, y);
  ctx.closePath();
  ctx.fillStyle = "#e9dcbc";
  ctx.fill();
  ctx.strokeStyle = "#3b3024";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.36, y - s * 0.5);
  ctx.lineTo(x + s * 0.36, y - s * 0.5);
  ctx.strokeStyle = colorOf(owner);
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - s * 0.45);
  ctx.strokeStyle = "#3b3024";
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Ordunun sayı etiketi: koyu, sahibinin renginde çerçeveli; generalliyse altın yıldız, tecrübeliyse rütbe şeritleri. */
function tag(ctx, army, label, tx, ty, tw, base) {
  const th = 16;
  ctx.globalAlpha = base;
  roundRect(ctx, tx, ty, tw, th, 3);
  ctx.fillStyle = army.spent ? "rgba(28,23,18,0.62)" : "rgba(28,23,18,0.88)";
  ctx.fill();
  ctx.strokeStyle = army.selected ? GOLD_LIGHT : colorOf(army.owner);
  ctx.lineWidth = army.selected ? 1.6 : 1.4;
  ctx.stroke();
  ctx.fillStyle = army.spent ? "rgba(243,231,201,0.6)" : CREAM;
  ctx.font = `bold 11px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, tx + tw / 2, ty + th / 2 + 0.5);
  if (army.gen) {
    // Generalli ordu: etiketin sağ üstünde altın bir yıldız.
    ctx.font = `bold 12px ${SERIF}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = DARK;
    ctx.strokeText("★", tx + tw, ty - 1);
    ctx.fillStyle = "#e3b23c";
    ctx.fillText("★", tx + tw, ty - 1);
  }
  // Tecrübeli ordu: etiketin sol üstünde rütbesi kadar altın V.
  if (army.rank > 0) chevrons(ctx, army.rank, tx - 4, ty - 5, 8);
}

// Bir limanın denize bakan yönü: çevresinde 24 yönde, birkaç uzaklıkta karaya mı denize mi
// düştüğüne bakılır; en çok deniz olan yön seçilir, eşitlikte yataya yakın olan (aşağıda isim
// levhası, yukarıda sancak var). Bir kere hesaplanır.
const seaDirs = {};
function seaDir(id) {
  if (seaDirs[id]) return seaDirs[id];
  const m = POS[id];
  let best = 0, bestV = -Infinity;
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * TAU;
    let n = 0;
    for (const r of [0.15, 0.28, 0.42, 0.6]) {
      const x = m.x + Math.cos(t) * r, y = m.y + Math.sin(t) * r;
      if (!onLand(x / LON_SCALE + BOUNDS.w, BOUNDS.n - y)) n++;
    }
    const v = n * 4 - Math.abs(Math.sin(t)) * 1.5;
    if (v > bestV) { bestV = v; best = t; }
  }
  return (seaDirs[id] = { x: Math.cos(best), y: Math.sin(best) });
}

/** Limanda bekleyen (orduya katılmamış) gemiler: denizde demirli, yelkenleri sarılı. */
function docked(ctx, cam, view, shown, z) {
  for (const { p, s } of shown) {
    const n = view.docked?.[p.id];
    if (!n || (view.fog && !view.seen.has(p.id))) continue;
    const d = seaDir(p.id);
    const k = 0.66 * Math.max(1, Math.min(1.4, z));
    const r = Math.max(22, Math.min(30 * z, 0.4 * cam.scale));
    const x = s.x + d.x * r * 1.2, y = s.y + d.y * r + 10 * k;
    fleet(ctx, view.owners[p.id], x, y, n, k, { furled: true, flip: d.x < -0.3 });
    if (n > 1) {
      const bx = x + 18 * k, by = y - 20 * k;
      ctx.beginPath();
      ctx.arc(bx, by, 7, 0, TAU);
      ctx.fillStyle = "rgba(28,23,18,0.88)";
      ctx.fill();
      ctx.strokeStyle = colorOf(view.owners[p.id]);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = CREAM;
      ctx.font = `bold 10px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n), bx, by + 0.5);
    }
  }
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Parçaların büyüklüğü: en uzakta 0.9, iki kat yakında 1.35, dört kat yakında 1.75. */
export function sizeAt(cam) {
  const r = Math.log2(Math.max(1, cam.scale / cam.min));
  return Math.max(0.9, Math.min(1.75, 0.9 + 0.45 * r));
}

/** Sancağın kumaşı ve direği: başkentte büyük, kalede ve bağımsız yerde küçük. */
function flagSize(p, owner, z) {
  const [w, h, pole] = !owner ? [12, 16, 28] : p.capital ? [22, 30, 46] : p.kind === "castle" ? [15, 20, 32] : [18, 24, 38];
  return { w: w * z, h: h * z, pole: pole * z };
}

/**
 * Ekrandaki bir noktanın bir yerleşime uzaklığı: maketine ya da sancağına (sancak yukarıda,
 * oyuncu ona da basıyor).
 */
export function reach(cam, id, x, y) {
  const s = toScreen(cam, POS[id].x, POS[id].y);
  const z = sizeAt(cam);
  const f = flagSize(byIdPlace[id], true, z);
  const flagY = s.y - 3 * z - f.pole + f.h / 2;
  return Math.min(Math.hypot(s.x - x, s.y - y), Math.hypot(s.x - x, flagY - y) * 1.3);
}
const byIdPlace = Object.fromEntries(PLACES.map((p) => [p.id, p]));

function anchor(ctx, x, y, blockaded = false) {
  const shape = () => {
    ctx.beginPath();
    ctx.arc(x, y - 4.5, 1.3, 0, TAU);
    ctx.moveTo(x, y - 3.2);
    ctx.lineTo(x, y + 3.5);
    ctx.moveTo(x - 2.3, y - 1.6);
    ctx.lineTo(x + 2.3, y - 1.6);
    ctx.moveTo(x - 3.4, y + 0.6);
    ctx.arc(x, y + 0.6, 3.4, Math.PI, 0, true);
  };
  shape();
  ctx.strokeStyle = DARK;
  ctx.lineWidth = 3.6;
  ctx.stroke();
  shape();
  // Ablukadaki liman: kırmızı çapa.
  ctx.strokeStyle = blockaded ? "#ff6a55" : CREAM;
  ctx.lineWidth = blockaded ? 1.8 : 1.3;
  ctx.stroke();
}

// ---- efektler ----
//
// anim.js hangi efektin ne kadar ilerlediğini söyler (`p`: 0..1); burası sadece çizer.

function drawEffects(ctx, cam, fx) {
  for (const e of fx) {
    if (!e.at) continue;
    const m = typeof e.at === "string" ? layers().at[e.at] : e.at;
    const s = toScreen(cam, m.x, m.y);
    if (e.kind === "pulse") {
      // El değiştiren yer: yeni sahibin renginde büyüyüp sönen iki halka.
      for (const lag of [0, 0.25]) {
        const q = Math.max(0, Math.min(1, (e.p - lag) / (1 - lag)));
        if (q <= 0 || q >= 1) continue;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 10 + q * (e.big ? 46 : 26), 0, TAU);
        ctx.strokeStyle = e.color;
        ctx.globalAlpha = 1 - q;
        ctx.lineWidth = e.big ? 4 : 2.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (e.kind === "clash") {
      clash(ctx, s.x, s.y, e.p);
    } else if (e.kind === "fogfight") {
      fogFight(ctx, s.x, s.y, e.p);
    } else if (e.kind === "float") {
      floatText(ctx, s.x, s.y - 22, e);
    }
  }
}

/** Çapraz iki kılıç, açılıp kapanan; etrafında kıvılcımlar. */
function clash(ctx, x, y, p) {
  const k = p < 0.3 ? p / 0.3 : 1;
  const fade = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
  const angle = (1 - k) * 0.7;
  const size = 14 + 6 * Math.sin(Math.min(1, p * 2) * Math.PI);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, y - 4);
  // Kıvılcımlar
  ctx.strokeStyle = INK.bad;
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * TAU + 0.3;
    const r0 = 14 + p * 12, r1 = r0 + 6 + 6 * (1 - p);
    ctx.beginPath();
    ctx.moveTo(Math.cos(t) * r0, Math.sin(t) * r0);
    ctx.lineTo(Math.cos(t) * r1, Math.sin(t) * r1);
    ctx.stroke();
  }
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.rotate(side * (Math.PI / 4 + angle));
    ctx.strokeStyle = INK.paper;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(0, size);
    ctx.stroke();
    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(0, size);
    ctx.moveTo(-5, size - 6);
    ctx.lineTo(5, size - 6);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Sisin içinde bir savaş: ne olduğu görünmez ama olduğu anlaşılır - yerin üstünde atan kızıl
 * bir parıltı, duman, çapraz kılıçlar ve bir soru işareti.
 */
function fogFight(ctx, x, y, p) {
  const fade = p < 0.15 ? p / 0.15 : p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
  const beat = 0.5 + 0.5 * Math.sin(p * Math.PI * 7);
  ctx.save();
  ctx.globalAlpha = fade;
  const r = 34 + beat * 10;
  const g = ctx.createRadialGradient(x, y - 4, 2, x, y - 4, r);
  g.addColorStop(0, "rgba(255,150,60,0.75)");
  g.addColorStop(0.5, "rgba(200,60,30,0.35)");
  g.addColorStop(1, "rgba(120,20,10,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y - 4, r, 0, TAU);
  ctx.fill();
  // Duman: yükselen gri öbekler.
  for (let i = 0; i < 4; i++) {
    const q = (p * 1.6 + i / 4) % 1;
    ctx.globalAlpha = fade * (1 - q) * 0.5;
    ctx.fillStyle = "#4a4440";
    ctx.beginPath();
    ctx.arc(x + Math.sin(i * 2.1 + q * 3) * 10, y - 14 - q * 34, 6 + q * 10, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  clash(ctx, x, y, 0.35 + (p % 0.3));
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.font = `700 22px ${TITLE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = DARK;
  ctx.lineWidth = 5;
  ctx.strokeText("?", x + 24, y - 30);
  ctx.fillStyle = CREAM;
  ctx.fillText("?", x + 24, y - 30);
  ctx.restore();
}

/** Yükselip sönen yazı: "+10 piyade", "+13". */
function floatText(ctx, x, y, e) {
  const rise = 28 * e.p;
  ctx.globalAlpha = e.p < 0.6 ? 1 : 1 - (e.p - 0.6) / 0.4;
  ctx.font = `bold ${e.size ?? 14}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK.card;
  ctx.lineWidth = 4;
  ctx.strokeText(e.text, x, y - rise);
  ctx.fillStyle = e.color ?? INK.ink;
  ctx.fillText(e.text, x, y - rise);
  ctx.globalAlpha = 1;
}

/**
 * Rakibin bölümü oynarken üstte, ortada: medeniyetin kalkanı, adı ve ne yaptığı ("Siraküza'yı
 * aldı"). Kayarak açılır, sonunda solar.
 */
function caption(ctx, cam, e) {
  const ms = e.p * e.dur;
  const open = Math.min(1, ms / 260), fade = Math.min(1, (e.dur - ms) / 300);
  const w = Math.min(cam.w - 40, 460), h = 58;
  const x = cam.w / 2 - w / 2, y = 62 - (1 - open) * 18;
  ctx.save();
  ctx.globalAlpha = open * fade;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 10;
  roundRect(ctx, x, y, w, h, 5);
  ctx.fillStyle = "rgba(22,18,14,0.94)";
  ctx.fill();
  ctx.shadowBlur = 0;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 5);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = colorOf(e.owner);
  ctx.fillRect(x + 6, y + 6, 4, h - 12);
  shield(ctx, e.owner, x + 20, y + 13, 30);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `700 17px ${TITLE}`;
  ctx.fillStyle = CREAM;
  ctx.fillText(e.title, x + 62, y + 21);
  if (e.sub) {
    ctx.font = `italic 15px ${SERIF}`;
    ctx.fillStyle = GOLD_LIGHT;
    ctx.fillText(e.sub, x + 62, y + 41);
  }
  ctx.restore();
}

/** Arayüzün de üstünde: tur geçişi ve üst banttan yükselen sayılar. */
export function drawOverlay(ctx, cam, fx) {
  for (const e of fx) {
    if (e.kind === "float" && e.screen) floatText(ctx, e.screen.x, e.screen.y, e);
    if (e.kind === "caption") caption(ctx, cam, e);
    if (e.kind !== "banner") continue;
    // Ortadan geçen koyu bir şerit, altın kenarlı: önce açılır, durur, sonra solar.
    const open = e.p < 0.2 ? e.p / 0.2 : 1;
    const fade = e.p > 0.7 ? 1 - (e.p - 0.7) / 0.3 : 1;
    const h = 96 * (0.6 + 0.4 * open);
    const y = cam.h * 0.42 - h / 2;
    ctx.globalAlpha = fade * 0.92;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#2c241b");
    g.addColorStop(0.5, "#1a1510");
    g.addColorStop(1, "#2c241b");
    ctx.fillStyle = g;
    ctx.fillRect(0, y, cam.w, h);
    ctx.globalAlpha = fade;
    ctx.strokeStyle = "#c9a45a";
    ctx.lineWidth = 2;
    for (const yy of [y + 1, y + h - 1]) {
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(cam.w, yy);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(201,164,90,0.45)";
    ctx.lineWidth = 1;
    for (const yy of [y + 5.5, y + h - 5.5]) {
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(cam.w, yy);
      ctx.stroke();
    }
    const slide = (1 - open) * 30;
    ctx.fillStyle = CREAM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 34px ${TITLE}`;
    ctx.fillText(e.text.toLocaleUpperCase(), cam.w / 2 - slide, y + h / 2 - (e.sub ? 8 : 0));
    if (e.sub) {
      ctx.font = `italic 16px ${SERIF}`;
      ctx.fillStyle = GOLD_LIGHT;
      ctx.fillText(e.sub, cam.w / 2 - slide, y + h / 2 + 24);
    }
    ctx.globalAlpha = 1;
  }
}
