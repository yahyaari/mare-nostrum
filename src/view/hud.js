// Oyun ekranının çerçevesi (kullanıcının gönderdiği Total War tarzı görselden, Docs/plan.md
// 2.0): üstte koyu-altın bant (asılı medeniyet sancağı, kaynaklar, tarih, rapor ve menü),
// altta ortada yuvarlak düğmeli menü (Ordu, Şehirler, Diplomasi, Harita), sağ altta sıradaki
// ordu, mini harita ve Turu bitir.
//
// Düğmeler ui.js'teki gibi `boxes` listesine kutu bırakır; eylemleri main.js çalıştırır.

import { menace } from "../rules/moves.js";
import { N } from "../rules/numbers.js";
import { budget, placesOf } from "../rules/state.js";
import { fill } from "../text.js";
import { seasonOf, yearOf } from "../rules/season.js";
import { drawMinimap } from "./draw.js";
import { INK, SERIF, TAU, colorOf, delta, fmt, icon, over } from "./kit.js";
import { CREAM, DARK, GOLD, GOLD_DARK, GOLD_LIGHT, TITLE, emblem, roundRect, shade } from "./pieces.js";

export const TOP = 50;
export const RIGHT_W = 244;
const END_H = 56, NEXT_H = 34, GAP = 8;
// Mini haritanın içi haritanın oranında (55.9 x 26 birim); çerçevesi her yandan 5 piksel.
const MINI_IN = RIGHT_W - 10, MINI_H = Math.round(MINI_IN / 2.15) + 10;
export const BOTTOM_H = 80;

/** Sağ alt sütunun parçaları. */
export function rightColumn(cam) {
  const x = cam.w - 12 - RIGHT_W;
  const end = { x, y: cam.h - 12 - END_H, w: RIGHT_W, h: END_H };
  const mini = { x, y: end.y - GAP - MINI_H, w: RIGHT_W, h: MINI_H };
  const next = { x, y: mini.y - GAP - NEXT_H, w: RIGHT_W, h: NEXT_H };
  return { end, mini, next };
}

// ---------------------------------------------------------------------------------------------
// Üst bant

const CHIPS = ["money", "food", "weapons", "pop"];
const chipX = (k) => 98 + CHIPS.indexOf(k) * 158;

/** Bir kaynağın değişimi yükselirken nereden çıksın: sayının hemen altı. */
export const chipRise = (cam, k) => ({ x: chipX(k) + 62, y: TOP + 22 });

export function drawTopBar(ctx, cam, game, ui, boxes, T) {
  const W = cam.w;
  const g = ctx.createLinearGradient(0, 0, 0, TOP);
  g.addColorStop(0, "#30271d");
  g.addColorStop(1, "#16120e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, TOP);
  const sh = ctx.createLinearGradient(0, TOP, 0, TOP + 12);
  sh.addColorStop(0, "rgba(0,0,0,0.4)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(0, TOP, W, 12);
  hline(ctx, 0, W, TOP - 1, GOLD_DARK, 2);
  hline(ctx, 0, W, TOP - 4.5, "rgba(201,164,90,0.45)", 1);
  boxes.push({ x: 0, y: 0, w: W, h: TOP, act: null });

  // Asılı sancak: bandın üstünden sarkar.
  hanging(ctx, game.player, 18, 0, 58, 80);
  boxes.push({ x: 18, y: 0, w: 58, h: 80, act: null });

  // Kaynaklar: ambardaki ve turluk değişim. Nüfus: bütün yerlerin toplamı.
  const me = game.player, civ = game.civs[me], b = budget(game, me);
  const pop = placesOf(game, me).reduce((n, id) => n + game.places[id].pop, 0);
  const have = { money: civ.money, food: civ.food, weapons: civ.weapons, pop };
  const per = { money: b.money, food: b.food, weapons: b.weapons, pop: null };
  // İpuçları: ne işe yarar, turda ne kadar gelir; yiyecek azalıyorsa kaç turda biteceği.
  const tips = {
    money: [T.money, T.tipMoney, [`${T.perTurn}: ${delta(b.money)}`, b.money < 0 ? "bad" : "good"]],
    food: [T.food, T.tipFood, [fill(T.tipIncome, delta(b.food + b.upkeep), b.upkeep, delta(b.food)), b.food < 0 ? "bad" : "good"]],
    weapons: [T.weapons, T.tipWeapons, [`${T.perTurn}: ${delta(b.weapons)}`, "good"]],
    pop: [T.pop, T.tipPop],
  };
  if (b.food < 0) tips.food.push([fill(T.tipStarve, Math.max(0, Math.floor(civ.food / -b.food))), "bad"]);
  for (const k of CHIPS) {
    const x = chipX(k), cy = TOP / 2 - 1;
    if (k !== CHIPS[0]) vline(ctx, x - 14, 9, TOP - 11, "rgba(201,164,90,0.35)");
    ctx.beginPath();
    ctx.arc(x + 14, cy, 14, 0, TAU);
    ctx.fillStyle = "#0f0c09";
    ctx.fill();
    ctx.strokeStyle = GOLD_DARK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    icon(ctx, k, x + 6, cy - 8, 16, GOLD_LIGHT);
    ctx.font = `600 18px ${TITLE}`;
    ctx.fillStyle = CREAM;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const s = fmt(have[k]);
    ctx.fillText(s, x + 36, cy + 1);
    const vw = ctx.measureText(s).width;
    if (per[k] !== null) {
      ctx.font = `600 13px ${SERIF}`;
      ctx.fillStyle = per[k] < 0 ? "#e8806e" : "#9fd18a";
      ctx.fillText(delta(per[k]), x + 42 + vw, cy + 2);
    }
    boxes.push({ x: x - 4, y: 4, w: 150, h: TOP - 8, act: null, tip: tips[k] });
  }

  // Sağda: tarih kutusu, rapor, menü.
  const mx = W - 14 - 38;
  medal(ctx, boxes, mx + 19, TOP / 2 - 1, 17, "menu", { do: "open", modal: "menu" });
  boxes[boxes.length - 1].tip = [T.menu, T.tipMenu];
  medal(ctx, boxes, mx - 44 + 19, TOP / 2 - 1, 17, "scroll", { do: "open", modal: "report" });
  boxes[boxes.length - 1].tip = [T.news, T.tipReport];
  const dw = 196, dx = mx - 52 - dw;
  roundRect(ctx, dx, 7, dw, TOP - 16, 4);
  ctx.fillStyle = "rgba(10,8,6,0.55)";
  ctx.fill();
  ctx.strokeStyle = "rgba(201,164,90,0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();
  const season = seasonOf(game.turn);
  seasonGlyph(ctx, season, dx + 18, TOP / 2 - 1, 7);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `600 13px ${TITLE}`;
  ctx.fillStyle = CREAM;
  ctx.fillText(`${T.seasons[season]} · ${fill(T.year, yearOf(game.turn))}`, dx + 33, TOP / 2 - 8);
  ctx.font = `italic 13px ${SERIF}`;
  ctx.fillStyle = GOLD_LIGHT;
  ctx.fillText(fill(T.turn, game.turn), dx + 33, TOP / 2 + 8);
}

/** Bandın sol köşesinden sarkan büyük sancak: oyuncunun medeniyeti. */
export function hanging(ctx, owner, x, y, w, h) {
  const color = colorOf(owner);
  const cut = 16;
  const shape = () => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h - cut);
    ctx.closePath();
  };
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  shape();
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, shade(color, -0.35));
  g.addColorStop(0.45, shade(color, 0.05));
  g.addColorStop(1, shade(color, -0.4));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  shape();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 4, y);
  ctx.lineTo(x + 4, y + h - cut - 1.5);
  ctx.lineTo(x + w / 2, y + h - 5);
  ctx.lineTo(x + w - 4, y + h - cut - 1.5);
  ctx.lineTo(x + w - 4, y);
  ctx.strokeStyle = "rgba(236,212,154,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();
  emblem(ctx, owner, x + w / 2, y + h * 0.42, w * 0.3, GOLD_LIGHT);
}

// ---------------------------------------------------------------------------------------------
// Alt menü

export function drawBottomBar(ctx, cam, game, ui, boxes, T) {
  const me = game.player;
  const ready = game.armies.filter((a) => a.owner === me && a.moves > 0).length;
  const trouble = placesOf(game, me).filter((id) => game.places[id].loyalty < N.loyalty.unrest || menace(game, id) > 0).length;
  const items = [
    ["helmet", T.hudArmies, { do: "open", modal: "armies" }, ready, GOLD, T.tipArmies],
    ["temple", T.hudCities, { do: "open", modal: "cities" }, trouble, INK.bad, T.tipCities],
    ["hands", T.hudDiplo, { do: "open", modal: "diplo" }, 0, null, T.tipDiplo],
    ["compass", T.hudMap, { do: "overview" }, 0, null, T.tipMap],
    ["scroll", T.hudMissions, { do: "open", modal: "missions" }, game.missions?.length ?? 0, GOLD, T.tipMissions],
  ];
  const bw = 96, H = BOTTOM_H;
  const W = items.length * bw + 48;
  const x = Math.round(cam.w / 2 - W / 2), y = cam.h - H;
  // Plaka: üst köşeleri pahlı koyu bir levha, üstünde altın çizgi.
  const plate = () => {
    ctx.beginPath();
    ctx.moveTo(x, cam.h);
    ctx.lineTo(x, y + 18);
    ctx.lineTo(x + 18, y);
    ctx.lineTo(x + W - 18, y);
    ctx.lineTo(x + W, y + 18);
    ctx.lineTo(x + W, cam.h);
    ctx.closePath();
  };
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 10;
  plate();
  const g = ctx.createLinearGradient(0, y, 0, cam.h);
  g.addColorStop(0, "#30271d");
  g.addColorStop(1, "#120f0b");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  plate();
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 4, cam.h);
  ctx.lineTo(x + 4, y + 19.5);
  ctx.lineTo(x + 19.5, y + 4);
  ctx.lineTo(x + W - 19.5, y + 4);
  ctx.lineTo(x + W - 4, y + 19.5);
  ctx.lineTo(x + W - 4, cam.h);
  ctx.strokeStyle = "rgba(201,164,90,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();
  boxes.push({ x, y, w: W, h: H, act: null });

  items.forEach(([kind, label, act, badge, badgeColor, tip], i) => {
    const cx = x + 24 + i * bw + bw / 2, cy = y + 32;
    if (i) vline(ctx, x + 24 + i * bw, y + 14, cam.h - 10, "rgba(201,164,90,0.25)");
    const hot = over(cx - bw / 2, y, bw, H);
    medal(ctx, null, cx, cy, 22, kind, null, hot);
    ctx.font = `600 12px ${TITLE}`;
    ctx.fillStyle = hot ? GOLD_LIGHT : CREAM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, y + H - 13);
    if (badge > 0) {
      const bx = cx + 17, by = cy - 17;
      ctx.beginPath();
      ctx.arc(bx, by, 9, 0, TAU);
      ctx.fillStyle = badgeColor;
      ctx.fill();
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = `bold 11px ${SERIF}`;
      ctx.fillStyle = badgeColor === GOLD ? DARK : CREAM;
      ctx.fillText(String(badge), bx, by + 0.5);
    }
    boxes.push({ x: cx - bw / 2, y, w: bw, h: H, act, tip: [label, tip] });
  });
}

// ---------------------------------------------------------------------------------------------
// Sağ alt: sıradaki ordu, mini harita, Turu bitir

export function drawRightColumn(ctx, cam, game, ui, boxes, T, view) {
  const { end, mini, next } = rightColumn(cam);
  const ready = game.armies.filter((a) => a.owner === game.player && a.moves > 0).length;
  if (ready) {
    darkBox(ctx, next, 4, over(next.x, next.y, next.w, next.h));
    // Cinzel'in 1'i Roma rakamı I gibi duruyor: sayı olan yazılar Garamond.
    ctx.font = `600 15px ${SERIF}`;
    ctx.fillStyle = CREAM;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("▸ " + fill(T.nextArmy, ready), next.x + next.w / 2, next.y + next.h / 2 + 1);
    boxes.push({ ...next, act: { do: "nextArmy" }, tip: [fill(T.nextArmy, ready), T.tipNext] });
  }

  darkBox(ctx, mini, 4);
  const inner = { x: mini.x + 5, y: mini.y + 5, w: mini.w - 10, h: mini.h - 10 };
  drawMinimap(ctx, inner, cam, view?.owners ?? {});
  boxes.push({ ...inner, act: { do: "minimap" } });

  // Turu bitir: koyu, çift altın çerçeveli, solunda defne.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 8;
  roundRect(ctx, end.x, end.y, end.w, end.h, 5);
  const hotEnd = over(end.x, end.y, end.w, end.h);
  const g = ctx.createLinearGradient(0, end.y, 0, end.y + end.h);
  g.addColorStop(0, hotEnd ? "#5a4732" : "#3a2e22");
  g.addColorStop(1, hotEnd ? "#241c14" : "#15110d");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, end.x + 0.5, end.y + 0.5, end.w - 1, end.h - 1, 5);
  ctx.strokeStyle = hotEnd ? GOLD_LIGHT : GOLD;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  roundRect(ctx, end.x + 4.5, end.y + 4.5, end.w - 9, end.h - 9, 3);
  ctx.strokeStyle = "rgba(201,164,90,0.45)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = `700 18px ${TITLE}`;
  const tw = ctx.measureText(T.endTurn).width;
  const lx = end.x + end.w / 2 - (tw + 34) / 2;
  laurel(ctx, lx + 12, end.y + end.h / 2, 12);
  ctx.fillStyle = CREAM;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(T.endTurn, lx + 34, end.y + end.h / 2 + 1);
  boxes.push({ ...end, act: { do: "endTurn" }, tip: [T.endTurn, T.tipEndTurn] });
}

function darkBox(ctx, r, rad, hot = false) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 8;
  roundRect(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.fillStyle = "rgba(22,18,14,0.94)";
  ctx.fill();
  ctx.restore();
  roundRect(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad);
  ctx.strokeStyle = hot ? GOLD_LIGHT : GOLD_DARK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ---------------------------------------------------------------------------------------------
// Yuvarlak, altın halkalı düğme ve simgeleri

/** Koyu bir madalyon, ortasında altın bir simge. `boxes` verilirse basılır. */
export function medal(ctx, boxes, cx, cy, r, kind, act, hot = boxes ? over(cx - r, cy - r, 2 * r, 2 * r) : false) {
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, hot ? "#5e4b36" : "#3d3125");
  g.addColorStop(1, "#110e0a");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = hot ? GOLD_LIGHT : GOLD;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 3.5, 0, TAU);
  ctx.strokeStyle = "rgba(201,164,90,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
  glyph(ctx, kind, cx, cy, r * 0.55);
  if (boxes) boxes.push({ x: cx - r - 2, y: cy - r - 2, w: 2 * r + 4, h: 2 * r + 4, act });
}

function glyph(ctx, kind, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = GOLD_LIGHT;
  ctx.strokeStyle = GOLD_LIGHT;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 0.13;
  ctx.beginPath();
  if (kind === "helmet") {
    // Korint miğferi, yandan: kubbe, ense, yanak siperi, göz yarığı, sorguç.
    ctx.moveTo(-0.62, 0);
    ctx.quadraticCurveTo(-0.55, -0.82, 0.12, -0.8);
    ctx.quadraticCurveTo(0.72, -0.72, 0.7, 0.05);
    ctx.lineTo(0.72, 0.5);
    ctx.quadraticCurveTo(0.62, 0.78, 0.32, 0.8);
    ctx.lineTo(0.12, 0.42);
    ctx.lineTo(-0.16, 0.42);
    ctx.lineTo(-0.3, 0.85);
    ctx.lineTo(-0.62, 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    ctx.moveTo(-0.6, 0.1);
    ctx.lineTo(-0.02, 0.1);
    ctx.moveTo(-0.36, 0.1);
    ctx.lineTo(-0.36, 0.55);
    ctx.stroke();
    ctx.strokeStyle = GOLD_LIGHT;
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    ctx.moveTo(-0.45, -0.72);
    ctx.quadraticCurveTo(0.1, -1.25, 0.85, -0.72);
    ctx.stroke();
  } else if (kind === "temple") {
    ctx.moveTo(-0.95, -0.32);
    ctx.lineTo(0, -0.9);
    ctx.lineTo(0.95, -0.32);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-0.95, 0.68, 1.9, 0.2);
    ctx.fillRect(-0.85, -0.3, 1.7, 0.14);
    for (const x of [-0.7, -0.24, 0.24, 0.7]) ctx.fillRect(x - 0.09, -0.12, 0.18, 0.78);
  } else if (kind === "hands") {
    // El sıkışma: iki kol ortada birleşir.
    ctx.moveTo(-1, 0.25);
    ctx.lineTo(-0.55, -0.25);
    ctx.lineTo(-0.3, 0);
    ctx.lineTo(-0.72, 0.5);
    ctx.closePath();
    ctx.moveTo(1, 0.25);
    ctx.lineTo(0.55, -0.25);
    ctx.lineTo(0.3, 0);
    ctx.lineTo(0.72, 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    roundRect(ctx, -0.5, -0.35, 1, 0.62, 0.25);
    ctx.fill();
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    for (const x of [-0.18, 0.04, 0.26]) { ctx.moveTo(x, -0.3); ctx.lineTo(x - 0.06, 0.15); }
    ctx.stroke();
  } else if (kind === "compass") {
    ctx.lineWidth = 0.1;
    ctx.arc(0, 0, 0.88, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const t = (i / 4) * TAU - Math.PI / 2, r = i === 0 ? 0.85 : 0.65;
      ctx.moveTo(Math.cos(t) * r, Math.sin(t) * r);
      ctx.lineTo(Math.cos(t + Math.PI / 4) * 0.2, Math.sin(t + Math.PI / 4) * 0.2);
      ctx.lineTo(0, 0);
      ctx.lineTo(Math.cos(t - Math.PI / 4) * 0.2, Math.sin(t - Math.PI / 4) * 0.2);
      ctx.closePath();
    }
    ctx.fill();
  } else if (kind === "scroll") {
    ctx.fillRect(-0.55, -0.62, 1.1, 1.24);
    ctx.beginPath();
    ctx.ellipse(-0.55, -0.62, 0.18, 0.12, 0, 0, TAU);
    ctx.ellipse(0.55, -0.62, 0.18, 0.12, 0, 0, TAU);
    ctx.ellipse(-0.55, 0.62, 0.18, 0.12, 0, 0, TAU);
    ctx.ellipse(0.55, 0.62, 0.18, 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    for (const y of [-0.3, -0.05, 0.2]) { ctx.moveTo(-0.35, y); ctx.lineTo(0.35, y); }
    ctx.stroke();
  } else if (kind === "menu") {
    ctx.lineWidth = 0.16;
    for (const y of [-0.45, 0, 0.45]) { ctx.moveTo(-0.6, y); ctx.lineTo(0.6, y); }
    ctx.stroke();
  }
  ctx.restore();
}

/** Defne: iki yay boyunca yapraklar. */
function laurel(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = GOLD_LIGHT;
  for (const d of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const t = Math.PI / 2 + d * (0.35 + i * 0.5);
      const x = cx + Math.cos(t) * r, y = cy + Math.sin(t) * r * 0.95;
      ctx.beginPath();
      ctx.ellipse(x, y, 4.2, 1.8, t + d * 1.1, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Mevsimin işareti: ilkbaharda filiz, yazın güneş, sonbaharda yaprak, kışın kar tanesi. */
function seasonGlyph(ctx, season, cx, cy, r) {
  if (season === "summer") return sun(ctx, cx, cy, r);
  ctx.save();
  ctx.strokeStyle = GOLD_LIGHT;
  ctx.fillStyle = GOLD_LIGHT;
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  if (season === "winter") {
    for (let i = 0; i < 3; i++) {
      const t = (i / 3) * Math.PI;
      ctx.moveTo(cx - Math.cos(t) * r, cy - Math.sin(t) * r);
      ctx.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
    }
    ctx.stroke();
  } else if (season === "autumn") {
    ctx.ellipse(cx, cy, r * 0.55, r, Math.PI / 4, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = DARK;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.6, cy + r * 0.6);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.5);
    ctx.stroke();
  } else {
    ctx.moveTo(cx, cy + r);
    ctx.lineTo(cx, cy - r * 0.2);
    ctx.stroke();
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + d * r * 0.45, cy - r * 0.35, r * 0.45, r * 0.25, d * -0.6, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function sun(ctx, cx, cy, r) {
  ctx.fillStyle = GOLD_LIGHT;
  ctx.strokeStyle = GOLD_LIGHT;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.5, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * TAU;
    ctx.moveTo(cx + Math.cos(t) * r * 0.75, cy + Math.sin(t) * r * 0.75);
    ctx.lineTo(cx + Math.cos(t) * r * 1.15, cy + Math.sin(t) * r * 1.15);
  }
  ctx.stroke();
}

function hline(ctx, x1, x2, y, color, w) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
}

function vline(ctx, x, y1, y2, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y1);
  ctx.lineTo(x + 0.5, y2);
  ctx.stroke();
}
