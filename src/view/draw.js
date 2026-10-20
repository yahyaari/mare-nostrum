// Haritayı çizer. Hiçbir şeyi değiştirmez: kamera, seçim ve sahiplik dışarıdan gelir.
//
// Harita katmanları harita biriminde bir kere Path2D olarak kurulur, her karede kamera
// dönüşümüyle çizilir. Çizgi kalınlıkları ekran pikseli cinsinden yazılıyor (`px`), yoksa
// yakınlaştıkça kıyılar kalınlaşırdı.

import { LAND, LAKES, RIVERS } from "../data/geo.js";
import { CIVS, FREE_COLOR, PLACES, ROADS } from "../data/world.js";
import { project } from "../geo.js";
import { byId, neighbours, roadBetween, roadLine } from "../rules/graph.js";
import { TEXT } from "../text.js";
import { toScreen } from "./camera.js";
import { regions } from "./regions.js";

export const INK = {
  ink: "#2b2a27",
  soft: "#6d665b",
  paper: "#efe8d8",
  card: "#f7f2e7",
  sea: "#d6dfdc",
  ripple: "#a7b9b6",
  river: "#86a4a9",
  road: "#86765e",
  lane: "#5c838c",
  border: "#c4b598",
};
const SERIF = 'Georgia, "Times New Roman", serif';
const TAU = Math.PI * 2;

const civ = Object.fromEntries(CIVS.map((c) => [c.id, c]));
export const colorOf = (owner) => (owner ? civ[owner].color : FREE_COLOR);

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

// ---- kare ----

/**
 * Bütün kareyi çizer. `view`: { owners, selected, lang }.
 * Dönüş: bu karede çizilen basılabilir kutular, CSS pikseli - girdi bunlara bakıyor.
 */
export function drawFrame(ctx, cam, view, dpr) {
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
    for (const n of neighbours(view.selected)) {
      const r = roadBetween(view.selected, n);
      const p = new Path2D();
      trace(p, roadLine(r), false);
      ctx.strokeStyle = r.sea ? INK.lane : INK.ink;
      ctx.lineWidth = px(2.8);
      if (r.sea) ctx.setLineDash([px(6), px(4)]);
      ctx.stroke(p);
      ctx.setLineDash([]);
    }
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const boxes = [];
  drawPlaces(ctx, cam, view, L);
  drawTitle(ctx, cam, view, boxes);
  if (view.selected) drawCard(ctx, cam, view, boxes);
  else drawLegend(ctx, cam, view);
  return boxes;
}

// ---- yerleşimler ----

function drawPlaces(ctx, cam, view, L) {
  const shown = [];
  for (const p of PLACES) {
    const s = toScreen(cam, L.at[p.id].x, L.at[p.id].y);
    if (s.x < -60 || s.y < -40 || s.x > cam.w + 60 || s.y > cam.h + 40) continue;
    shown.push({ p, s });
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

  // Adlar: önce başkentler, sonra şehirler, sonra kaleler. Bir ad başka bir adın ya da bir
  // işaretin üstüne düşecekse yazılmaz - yakınlaşınca yer açılır ve görünür.
  const taken = shown.map(({ s }) => ({ x: s.x - 8, y: s.y - 8, w: 16, h: 16 }));
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

// ---- arayüz ----

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = INK.card;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.lineWidth = 0.75;
  ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
}

function drawTitle(ctx, cam, view, boxes) {
  const T = TEXT[view.lang];
  ctx.font = `bold 15px ${SERIF}`;
  const tw = ctx.measureText(T.title).width;
  ctx.font = `12px ${SERIF}`;
  const ew = ctx.measureText(T.era).width;
  const w = Math.max(tw, ew) + 28;
  panel(ctx, 12, 12, w, 50);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK.ink;
  ctx.font = `bold 15px ${SERIF}`;
  ctx.fillText(T.title, 26, 34);
  ctx.font = `italic 12px ${SERIF}`;
  ctx.fillStyle = INK.soft;
  ctx.fillText(T.era, 26, 51);

  // Dil düğmesi: iki kutu, seçili olan dolu.
  const bw = 38, bh = 30, y = 16;
  ["en", "tr"].forEach((l, i) => {
    const x = cam.w - 12 - bw * (2 - i);
    const on = view.lang === l;
    ctx.fillStyle = on ? INK.ink : INK.card;
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = on ? INK.card : INK.ink;
    ctx.font = `bold 12px ${SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(l.toUpperCase(), x + bw / 2, y + bh / 2 + 1);
    boxes.push({ id: "lang:" + l, x, y, w: bw, h: bh });
  });
}

function wrap(ctx, text, width) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? line + " " + word : word;
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawCard(ctx, cam, view, boxes) {
  const T = TEXT[view.lang];
  const p = byId[view.selected];
  const owner = view.owners[p.id];
  const w = Math.min(320, cam.w - 24);
  const pad = 18;

  const kind = [p.capital ? T.capital : null, p.kind === "castle" ? T.castle : T.city, p.port ? T.port : null]
    .filter(Boolean).join(" · ");
  const roads = neighbours(p.id).map((n) => {
    const r = roadBetween(p.id, n);
    return byId[n].name[view.lang] + (r.sea ? ` (${T.bySea})` : "");
  }).join(", ");
  ctx.font = `13px ${SERIF}`;
  const lines = wrap(ctx, roads, w - pad * 2);
  const h = 124 + lines.length * 18;
  const x = 12, y = cam.h - h - 12;
  panel(ctx, x, y, w, h);
  boxes.push({ id: "card", x, y, w, h });

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK.ink;
  ctx.font = `bold 19px ${SERIF}`;
  ctx.fillText(p.name[view.lang], x + pad, y + 34);

  ctx.fillStyle = colorOf(owner);
  ctx.fillRect(x + pad, y + 45, 12, 12);
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + pad + 0.5, y + 45.5, 11, 11);
  ctx.fillStyle = INK.ink;
  ctx.font = `14px ${SERIF}`;
  ctx.fillText(owner ? civ[owner].name[view.lang] : T.free, x + pad + 20, y + 56);
  ctx.fillStyle = INK.soft;
  ctx.font = `italic 13px ${SERIF}`;
  ctx.fillText(kind, x + pad, y + 77);

  ctx.fillStyle = INK.ink;
  ctx.font = `bold 12px ${SERIF}`;
  ctx.fillText(T.roads.toLocaleUpperCase(view.lang === "tr" ? "tr" : "en"), x + pad, y + 102);
  ctx.font = `13px ${SERIF}`;
  lines.forEach((l, i) => ctx.fillText(l, x + pad, y + 122 + i * 18));
}

function drawLegend(ctx, cam, view) {
  if (cam.w < 640) return;
  const T = TEXT[view.lang];
  const rows = [...CIVS.map((c) => [c.color, c.name[view.lang]]), [FREE_COLOR, T.free]];
  ctx.font = `13px ${SERIF}`;
  const w = Math.max(...rows.map(([, n]) => ctx.measureText(n).width)) + 56;
  const h = rows.length * 20 + 24;
  const x = cam.w - w - 12, y = cam.h - h - 12;
  panel(ctx, x, y, w, h);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  rows.forEach(([color, name], i) => {
    const ry = y + 22 + i * 20;
    ctx.fillStyle = color;
    ctx.fillRect(x + 16, ry - 6, 12, 12);
    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 16.5, ry - 5.5, 11, 11);
    ctx.fillStyle = INK.ink;
    ctx.fillText(name, x + 38, ry + 1);
  });
}
