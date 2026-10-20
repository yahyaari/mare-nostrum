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

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = INK.sea;
  ctx.fillRect(0, 0, cam.w, cam.h);

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
  return drawPlaces(ctx, cam, view, L);
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
  for (const a of view.armies ?? []) (at[a.at] ??= []).push(a);
  for (const { p, s } of shown) {
    (at[p.id] ?? []).forEach((a, i) => {
      const label = a.men >= 1000 ? (a.men / 1000).toFixed(1) + "k" : String(a.men);
      ctx.font = `bold 10px ${SERIF}`;
      const w = Math.max(24, ctx.measureText(label).width + 10);
      tokens.push({ x: s.x + 8 + i * (w + 4), y: s.y - 30, w, h: 16, army: a, label });
    });
  }

  // Adlar: önce seçili, sonra başkentler, şehirler, kaleler. Bir ad başka bir adın, bir
  // işaretin ya da bir sancağın üstüne düşecekse yazılmaz - yakınlaşınca yer açılır.
  const taken = [...shown.map(({ s }) => ({ x: s.x - 8, y: s.y - 8, w: 16, h: 16 })), ...tokens];
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
    ctx.fillStyle = INK.card;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = army.spent ? 0.4 : 1;
    ctx.fillStyle = colorOf(army.owner);
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = army.spent ? INK.ink : "#fff";
    ctx.font = `bold 10px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t.label, x + w / 2, y + h / 2 + 1);
  }
  // Parmak için kutuyu biraz büyüt.
  return tokens.map((t) => ({ x: t.x - 6, y: t.y - 8, w: t.w + 12, h: t.h + 16, army: t.army.id }));
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
