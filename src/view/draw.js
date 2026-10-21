// Haritayı çizer: kıyılar, topraklar, yollar, yerleşimler, ordular, seçimin işaretleri.
// Hiçbir şeyi değiştirmez; ne çizileceği `view` ile dışarıdan gelir. Arayüz (paneller,
// düğmeler) ui.js'te.
//
// Harita katmanları harita biriminde bir kere Path2D olarak kurulur, her karede kamera
// dönüşümüyle çizilir. Çizgi kalınlıkları ekran pikseli cinsinden yazılıyor (`px`), yoksa
// yakınlaştıkça kıyılar kalınlaşırdı.

import { LAND, LAKES, RIVERS } from "../data/geo.js";
import { PLACES, ROADS } from "../data/world.js";
import { project } from "../geo.js";
import { neighbours, roadBetween, roadLine } from "../rules/graph.js";
import { toScreen } from "./camera.js";
import { INK, SERIF, TAU, colorOf } from "./kit.js";
import { regions } from "./regions.js";

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

let cache = null;
function layers() {
  if (cache) return cache;
  const land = new Path2D(), lakes = new Path2D(), rivers = new Path2D();
  for (const r of LAND) trace(land, pairs(r), true);
  for (const r of LAKES) trace(lakes, pairs(r), true);
  for (const r of RIVERS) trace(rivers, pairs(r), false);
  const roads = new Path2D(), lanes = new Path2D();
  for (const r of ROADS) trace(r.sea ? lanes : roads, roadLine(r), false);
  const cells = regions().map(({ id, poly }) => {
    const p = new Path2D();
    poly.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return { id, path: p };
  });
  const at = Object.fromEntries(PLACES.map((p) => [p.id, project(p.lon, p.lat)]));
  return (cache = { land, lakes, rivers, roads, lanes, cells, at });
}

/** Bir yerleşimin harita birimindeki yeri. */
export const placeAt = (id) => layers().at[id];

/** Bir yerleşimin ekrandaki yeri. */
export const placeOnScreen = (cam, id) => toScreen(cam, layers().at[id].x, layers().at[id].y);

const MARK = { walk: INK.ink, easy: INK.good, risky: INK.warn, hopeless: INK.bad };

/**
 * Haritayı çiz. `view`:
 *   lang, owners {id: civ|null}, selected (yer id), armies [{id, owner, at, men, selected}],
 *   threats {id: asker} (oyuncunun tehdit altındaki yerleri),
 *   marks {id: "walk"|"easy"|"risky"|"hopeless"}, route [id, id, ...] (seçili ordunun yolu)
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
  ctx.drawImage(still(cam, view, dpr, L), 0, 0);

  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (cam.w / 2 - cam.x * k), dpr * (cam.h / 2 - cam.y * k));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  // Seçili yerleşimin yolları koyu.
  if (view.selected) {
    for (const n of neighbours(view.selected)) strokeRoad(ctx, roadBetween(view.selected, n), px, 2.8);
  }
  // Seçili ordunun güzergâhı: kalın kesik mürekkep.
  if (view.route?.length > 1) {
    for (let i = 1; i < view.route.length; i++) {
      strokeRoad(ctx, roadBetween(view.route[i - 1], view.route[i]), px, 3.6, [px(7), px(5)], INK.ink);
    }
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const tokens = drawPlaces(ctx, cam, view, L);
  drawEffects(ctx, cam, view.fx ?? []);
  return tokens;
}

let stillCanvas = null, stillKey = "";

function still(cam, view, dpr, L) {
  const W = Math.round(cam.w * dpr), H = Math.round(cam.h * dpr);
  const key = [cam.x, cam.y, cam.scale, W, H, PLACES.map((p) => view.owners[p.id] ?? "-").join(",")].join("|");
  if (stillCanvas && key === stillKey) return stillCanvas;
  stillCanvas ??= document.createElement("canvas");
  if (stillCanvas.width !== W || stillCanvas.height !== H) { stillCanvas.width = W; stillCanvas.height = H; }
  stillKey = key;
  const ctx = stillCanvas.getContext("2d");
  const k = cam.scale;
  const px = (n) => n / k;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = INK.sea;
  ctx.fillRect(0, 0, W, H);

  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (cam.w / 2 - cam.x * k), dpr * (cam.h / 2 - cam.y * k));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

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
  return stillCanvas;
}

/**
 * İki komşu yerleşim arasındaki yolun `f` (0..1) kadarındaki nokta, harita biriminde. Yolun
 * kıvrımlarını izler: ordu kıyı boyunca yürür, denizin üstünden kestirmez.
 */
export function alongRoad(from, to, f) {
  const r = roadBetween(from, to);
  if (!r) return layers().at[to];
  let pts = roadLine(r).map(([lon, lat]) => project(lon, lat));
  if (r.a !== from) pts = pts.reverse();
  let total = 0;
  const lens = [];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    lens.push(d);
    total += d;
  }
  let want = total * Math.max(0, Math.min(1, f));
  for (let i = 0; i < lens.length; i++) {
    if (want <= lens[i] || i === lens.length - 1) {
      const t = lens[i] ? Math.min(1, want / lens[i]) : 1;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
    }
    want -= lens[i];
  }
  return pts[pts.length - 1];
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
  const shown = [];
  for (const p of PLACES) {
    const s = toScreen(cam, L.at[p.id].x, L.at[p.id].y);
    if (s.x < -80 || s.y < -60 || s.x > cam.w + 80 || s.y > cam.h + 60) continue;
    shown.push({ p, s });
  }

  // Tehdit: yanında savaştığı birinin ordusu duran kendi yerin. Geniş, kırmızı, kesik halka.
  for (const { p, s } of shown) {
    if (!view.threats?.[p.id]) continue;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 19, 0, TAU);
    ctx.strokeStyle = INK.bad;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Huzursuz (sadakati düşük) kendi yerin: kırmızı bir ünlem rozeti.
  for (const { p, s } of shown) {
    const lo = view.unrest?.[p.id];
    if (lo === undefined) continue;
    const x = s.x - 12, y = s.y - 13;
    ctx.beginPath();
    ctx.arc(x, y, 6.5, 0, TAU);
    ctx.fillStyle = lo < 25 ? INK.bad : INK.warn;
    ctx.fill();
    ctx.strokeStyle = INK.card;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = INK.card;
    ctx.font = `bold 10px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", x, y + 0.5);
  }

  // Seçimin işaretleri: yürünebilir yerler ince halka, saldırılabilirler tahmin renginde.
  for (const { p, s } of shown) {
    const m = view.marks?.[p.id];
    if (!m) continue;
    ctx.beginPath();
    ctx.arc(s.x, s.y, m === "walk" ? 12 : 14, 0, TAU);
    ctx.strokeStyle = MARK[m];
    ctx.lineWidth = m === "walk" ? 1.5 : 3;
    ctx.setLineDash(m === "walk" ? [2, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  for (const { p, s } of shown) {
    const color = colorOf(view.owners[p.id]);
    if (p.id === view.selected) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, 15, 0, TAU);
      ctx.fillStyle = "rgba(247,242,231,0.85)";
      ctx.fill();
      ctx.strokeStyle = INK.ink;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.kind === "castle") castle(ctx, s.x, s.y, color);
    else city(ctx, s.x, s.y, color, p.capital);
    if (p.port) anchor(ctx, s.x + 9, s.y + 6);
  }

  // Ordu işaretleri: yerleşimin sağ üstünde, yan yana küçük sancaklar.
  const tokens = [];
  const at = {};
  const label = (a) => (a.men >= 1000 ? (a.men / 1000).toFixed(1) + "k" : String(a.men));
  ctx.font = `bold 10px ${SERIF}`;
  for (const a of view.armies ?? []) {
    // Yolda olan (animasyonla yürüyen) sancak bir yerleşime bağlı değil, yolun üstünde.
    if (a.float) {
      const s = toScreen(cam, a.float.x, a.float.y);
      const w = Math.max(24, ctx.measureText(label(a)).width + 10);
      tokens.push({ x: s.x + 8, y: s.y - 30, w, h: 16, army: a, label: label(a), moving: true });
    } else (at[a.at] ??= []).push(a);
  }
  for (const { p, s } of shown) {
    (at[p.id] ?? []).forEach((a, i) => {
      const w = Math.max(24, ctx.measureText(label(a)).width + 10);
      tokens.push({ x: s.x + 8 + i * (w + 4), y: s.y - 30, w, h: 16, army: a, label: label(a) });
    });
  }

  // Adlar: önce seçili, sonra başkentler, şehirler, kaleler. Bir ad başka bir adın, bir
  // işaretin ya da bir sancağın üstüne düşecekse yazılmaz - yakınlaşınca yer açılır.
  const taken = [...shown.map(({ s }) => ({ x: s.x - 8, y: s.y - 8, w: 16, h: 16 })), ...tokens.filter((t) => !t.moving)];
  const rank = (p) => (p.id === view.selected ? 0 : p.capital ? 1 : p.kind === "city" ? 2 : 3);
  for (const { p, s } of [...shown].sort((a, b) => rank(a.p) - rank(b.p))) {
    const name = p.name[view.lang];
    const big = p.capital;
    ctx.font = big ? `bold 12px ${SERIF}` : `12px ${SERIF}`;
    const text = big ? name.toLocaleUpperCase(view.lang === "tr" ? "tr" : "en") : name;
    const w = ctx.measureText(text).width;
    const box = { x: s.x - w / 2 - 2, y: s.y + (big ? 13 : 10), w: w + 4, h: 14 };
    if (p.id !== view.selected && taken.some((t) => overlap(t, box))) continue;
    taken.push(box);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK.paper;
    ctx.lineWidth = 3.5;
    ctx.strokeText(text, s.x, box.y + 1);
    ctx.fillStyle = INK.ink;
    ctx.fillText(text, s.x, box.y + 1);
  }

  for (const t of tokens) {
    const { x, y, w, h, army } = t;
    ctx.globalAlpha = army.alpha ?? 1;
    // Gölge: sancak haritanın üstünde duruyor, kâğıda yapışık değil.
    ctx.fillStyle = "rgba(43,42,39,0.22)";
    ctx.fillRect(x + 2.5, y + 2.5, w, h);
    ctx.beginPath();
    ctx.ellipse(x + 1, y + h + 9, 4, 1.6, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + h + 9);
    ctx.stroke();
    if (army.selected) {
      ctx.fillStyle = INK.card;
      ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(x - 3.5, y - 3.5, w + 7, h + 7);
      ctx.setLineDash([]);
    }
    // Hareketi bitmiş ordu soluk ve yazısı mürekkep: bu tur artık bir şey yapamaz.
    const base = army.alpha ?? 1;
    ctx.fillStyle = INK.card;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = base * (army.spent ? 0.4 : 1);
    ctx.fillStyle = colorOf(army.owner);
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = base;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = army.spent ? INK.ink : "#fff";
    ctx.font = `bold 10px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t.label, x + w / 2, y + h / 2 + 1);
    if (army.gen) {
      // Generalli ordu: sancağın sol üstünde altın bir yıldız.
      ctx.font = `bold 12px ${SERIF}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK.ink;
      ctx.strokeText("★", x - 1, y - 1);
      ctx.fillStyle = "#e3b23c";
      ctx.fillText("★", x - 1, y - 1);
    }
    ctx.globalAlpha = 1;
  }
  // Parmak için kutuyu biraz büyüt. Yürüyen sancağa basılmaz: ordu zaten varacağı yerde.
  return tokens.filter((t) => !t.moving).map((t) => ({ x: t.x - 6, y: t.y - 8, w: t.w + 12, h: t.h + 16, army: t.army.id }));
}

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function city(ctx, x, y, color, capital) {
  const r = capital ? 7 : 5.5;
  if (capital) {
    ctx.beginPath();
    ctx.arc(x, y, r + 3.5, 0, TAU);
    ctx.fillStyle = INK.paper;
    ctx.fill();
    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

/** Üç mazgallı bir kule. */
function castle(ctx, x, y, color) {
  ctx.beginPath();
  ctx.moveTo(x - 6, y + 6);
  ctx.lineTo(x - 6, y - 7);
  ctx.lineTo(x - 3.5, y - 7);
  ctx.lineTo(x - 3.5, y - 4.5);
  ctx.lineTo(x - 1.25, y - 4.5);
  ctx.lineTo(x - 1.25, y - 7);
  ctx.lineTo(x + 1.25, y - 7);
  ctx.lineTo(x + 1.25, y - 4.5);
  ctx.lineTo(x + 3.5, y - 4.5);
  ctx.lineTo(x + 3.5, y - 7);
  ctx.lineTo(x + 6, y - 7);
  ctx.lineTo(x + 6, y + 6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = "miter";
  ctx.stroke();
  ctx.lineJoin = "round";
}

function anchor(ctx, x, y) {
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
  ctx.strokeStyle = INK.paper;
  ctx.lineWidth = 3.4;
  ctx.stroke();
  shape();
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

// ---- efektler ----
//
// anim.js hangi efektin ne kadar ilerlediğini söyler (`p`: 0..1); burası sadece çizer.

function drawEffects(ctx, cam, fx) {
  for (const e of fx) {
    if (!e.at) continue;
    const m = layers().at[e.at];
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

/** Arayüzün de üstünde: tur geçişi ve üst banttan yükselen sayılar. */
export function drawOverlay(ctx, cam, fx) {
  for (const e of fx) {
    if (e.kind === "float" && e.screen) floatText(ctx, e.screen.x, e.screen.y, e);
    if (e.kind !== "banner") continue;
    // Ortadan geçen bir kâğıt şerit: önce açılır, durur, sonra solar.
    const open = e.p < 0.2 ? e.p / 0.2 : 1;
    const fade = e.p > 0.7 ? 1 - (e.p - 0.7) / 0.3 : 1;
    const h = 92 * (0.6 + 0.4 * open);
    const y = cam.h * 0.42 - h / 2;
    ctx.globalAlpha = fade * 0.94;
    ctx.fillStyle = INK.card;
    ctx.fillRect(0, y, cam.w, h);
    ctx.globalAlpha = fade;
    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = 1.5;
    for (const yy of [y + 0.5, y + h - 0.5]) {
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(cam.w, yy);
      ctx.stroke();
    }
    ctx.lineWidth = 0.75;
    for (const yy of [y + 4.5, y + h - 4.5]) {
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(cam.w, yy);
      ctx.stroke();
    }
    const slide = (1 - open) * 30;
    ctx.fillStyle = INK.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold 34px ${SERIF}`;
    ctx.fillText(e.text, cam.w / 2 - slide, y + h / 2 - (e.sub ? 8 : 0));
    if (e.sub) {
      ctx.font = `italic 14px ${SERIF}`;
      ctx.fillStyle = INK.soft;
      ctx.fillText(e.sub, cam.w / 2 - slide, y + h / 2 + 22);
    }
    ctx.globalAlpha = 1;
  }
}
