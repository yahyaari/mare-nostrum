// Arayüz (SADE SÜRÜM): başlangıç ekranı, kartlar, pencereler, haber paneli ve ipuçları.
// Hiçbir kuralı değiştirmez; her düğme bir `act` bırakır, main.js onu çalıştırır.
//
// `ui` görünüm durumu: { screen, lang, pick, saved, sel, army, modal, modalAt, toast, news, tip }.
//   sel:   { kind: "place" | "army", id }
//   army:  oyuncu bir yabancı yere bakarken son seçtiği kendi ordusu (kartta saldırı tahmini için)
//   modal: { kind: "attack" | "form" | "diplo" | "report" | "battle" | "menu" | "help" |
//            "confirm" | "over" | "armies" | "cities" | "chronicle", ... }
//   news:  { lines, until } tur sonunda sağ üstte beliren haberler (pencere açmadan)
//   tip:   { lines, since } farenin altındaki şeyin açıklaması

import { CIVS } from "../data/world.js";
import { canDeclare, canPropose } from "../rules/diplomacy.js";
import { byId, neighbours, roadBetween } from "../rules/graph.js";
import { canAttack, defenders, forecast, menace } from "../rules/moves.js";
import { N, UNITS, trait } from "../rules/numbers.js";
import {
  armiesAt, armyById, canSail, canStation, key, men, output, placesOf, recruitInfo, relation, shipInfo, strength, upgradeInfo, walled,
} from "../rules/state.js";
import { TEXT, fill } from "../text.js";
import { INK, amount, button, civName, costLine, delta, measure, panel, pointer, text, wrap } from "./kit.js";
import { BOTTOM_H, TOP, drawBottomBar, drawRightColumn, drawTopBar } from "./hud.js";
import { CREAM, GOLD, GOLD_DARK, GOLD_LIGHT, roundRect, shield, soldier } from "./pieces.js";
import { musicEnabled, soundEnabled } from "./sound.js";
import { drawBattle } from "./battle.js";
import { drawVignette } from "./draw.js";

const placeName = (id, lang) => byId[id].name[lang];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** Pencere açılırken süzülerek gelsin: bu kadar milisaniye. */
export const MODAL_MS = 180;

export function drawUI(ctx, cam, game, ui, boxes, view) {
  const T = TEXT[ui.lang];
  if (ui.screen === "start") {
    drawStart(ctx, cam, ui, boxes, T);
  } else {
    drawTopBar(ctx, cam, game, ui, boxes, T);
    if (!game.over) {
      drawBottomBar(ctx, cam, game, ui, boxes, T);
      drawRightColumn(ctx, cam, game, ui, boxes, T, view);
    }
    if (ui.sel?.kind === "place") {
      if (game.places[ui.sel.id].owner === game.player) cityCard(ctx, cam, game, ui, boxes, T);
      else placeCard(ctx, cam, game, ui, boxes, T, view);
    } else if (ui.sel?.kind === "army" && armyById(game, ui.sel.id)) {
      armyCard(ctx, cam, game, ui, boxes, T);
    }
    if (ui.news && !ui.modal) drawNews(ctx, cam, ui, boxes, T);
  }
  if (ui.toast && ui.toast.until > performance.now()) drawToast(ctx, cam, ui.toast.text);
  if (ui.modal) {
    // Açılış: saydamdan belirir, biraz aşağıdan yerine oturur.
    const t = Math.min(1, (performance.now() - (ui.modalAt ?? 0)) / MODAL_MS);
    const e = 1 - (1 - t) ** 3;
    ctx.save();
    ctx.globalAlpha = e;
    ctx.translate(0, (1 - e) * 14);
    drawModal(ctx, cam, game, ui, boxes, T);
    ctx.restore();
  }
  if (ui.tip && performance.now() - ui.tip.since > 250) drawTip(ctx, cam, ui.tip.lines);
}

// ---------------------------------------------------------------------------------------------
// Başlangıç

function drawStart(ctx, cam, ui, boxes, T) {
  const veil = ctx.createRadialGradient(cam.w / 2, cam.h / 2, cam.h * 0.2, cam.w / 2, cam.h / 2, Math.hypot(cam.w, cam.h) * 0.6);
  veil.addColorStop(0, "rgba(15,11,7,0.25)");
  veil.addColorStop(1, "rgba(15,11,7,0.6)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, cam.w, cam.h);
  const W = Math.min(cam.w - 24, 540);
  const rowH = 50;
  const H = 128 + CIVS.length * rowH + 52 + 76 + (ui.saved ? 56 : 0);
  const x = Math.round((cam.w - W) / 2), y = Math.max(12, Math.round((cam.h - H) / 2));
  panel(ctx, x, y, W, H, boxes);
  text(ctx, T.title, x + W / 2, y + 44, { title: true, bold: true, size: 30, align: "center" });
  ornament(ctx, x + W / 2, y + 56, 150);
  text(ctx, T.era, x + W / 2, y + 76, { italic: true, size: 14, color: INK.soft, align: "center" });
  text(ctx, T.tagline, x + W / 2, y + 96, { size: 14, align: "center" });
  text(ctx, T.chooseCiv, x + 22, y + 120, { bold: true, size: 13 });

  CIVS.forEach((c, i) => {
    const ry = y + 128 + i * rowH;
    const on = ui.pick === c.id;
    if (on) {
      roundRect(ctx, x + 13, ry + 2, W - 26, rowH - 4, 4);
      ctx.fillStyle = "rgba(120,85,40,0.13)";
      ctx.fill();
      ctx.strokeStyle = GOLD_DARK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    shield(ctx, c.id, x + 22, ry + 8, 22);
    text(ctx, c.name[ui.lang], x + 54, ry + 23, { title: true, bold: true, size: 16 });
    text(ctx, "▲ " + T.traits[c.id], x + 54, ry + 41, { size: 12, color: INK.soft, italic: true });
    boxes.push({ x: x + 12, y: ry, w: W - 24, h: rowH, act: { do: "pick", civ: c.id } });
  });

  // Zorluk: üç düğme yan yana, seçili olan dolu.
  const ly = y + 128 + CIVS.length * rowH + 8;
  text(ctx, T.difficulty, x + 22, ly + 25, { bold: true, size: 13 });
  const lw = Math.min(110, (W - 150) / 3);
  [["easy", T.lvEasy], ["normal", T.lvNormal], ["hard", T.lvHard]].forEach(([lv, label], i) => {
    button(ctx, boxes, { x: x + W - 20 - (3 - i) * (lw + 6) + 6, y: ly + 4, w: lw, h: 34, label, size: 13, main: ui.level === lv, act: { do: "level", level: lv } });
  });

  const by = ly + 52 + 6;
  const picked = CIVS.find((c) => c.id === ui.pick);
  button(ctx, boxes, {
    x: x + 20, y: by, w: W - 40, h: 48, main: true, size: 16, off: !picked,
    label: picked ? `${T.start} · ${picked.name[ui.lang]}` : T.start, act: { do: "start" },
  });
  if (ui.saved) {
    const c = CIVS.find((cc) => cc.id === ui.saved.player);
    button(ctx, boxes, {
      x: x + 20, y: by + 58, w: W - 40, h: 44, size: 14,
      label: `${T.cont} · ${fill(T.contInfo, c.name[ui.lang], ui.saved.turn)}`, act: { do: "continue" },
    });
  }
  langToggle(ctx, cam, ui, boxes, 12);
}

function langToggle(ctx, cam, ui, boxes, y) {
  const bw = 40, bh = 30;
  ["en", "tr"].forEach((l, i) => {
    const x = cam.w - 12 - bw * (2 - i);
    button(ctx, boxes, { x, y, w: bw, h: bh, label: l.toUpperCase(), main: ui.lang === l, size: 12, act: { do: "lang", lang: l } });
  });
}

// ---------------------------------------------------------------------------------------------
// Kartlar

/** Kartın sağ üst köşesinde kapatma düğmesi. */
function closeX(ctx, boxes, r) {
  const s = 34, x = r.x + r.w - s - 6, y = r.y + 6;
  button(ctx, boxes, { x, y, w: s, h: s, label: "×", size: 20, act: { do: "deselect" } });
}

function cardRect(cam, h) {
  // Sol altta; üstü bandın ve ondan sarkan sancağın altında kalır.
  return { x: 12, y: Math.max(TOP + 40, cam.h - 12 - h), w: 360, h };
}

function kindLine(id, game, T, hid = false) {
  const p = byId[id], pl = game.places[id];
  return [p.capital ? T.capital : null, p.kind === "castle" ? T.castle : T.city, p.port ? T.port : null]
    .filter(Boolean).join(" · ") + " · " + fill(T.lvl, pl.level) + (pl.ships && !hid ? ` · ${pl.ships} ${T.ships}` : "");
}

/** "120 piyade · 40 okçu · 20 süvari": piyade ve okçu hep, süvari varsa. */
function troops(T, u) {
  return UNITS.filter((k) => k !== "cav" || u[k] > 0).map((k) => `${u[k] ?? 0} ${T[k]}`).join(" · ");
}

const whyText = (why, T) => T["why" + cap(why)] ?? why;

function cityCard(ctx, cam, game, ui, boxes, T) {
  const id = ui.sel.id, pl = game.places[id], p = byId[id];
  const H = 372 + (p.port ? 58 : 0);
  const vh = vignetteHeight(cam, H);
  const r = cardRect(cam, H + vh);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  if (vh) drawVignette(ctx, id, pl.owner, { x: r.x + 8, y: r.y + 8, w: r.w - 16, h: vh - 4 }, pl.level);
  closeX(ctx, boxes, r);
  const x = r.x + 18, right = r.x + r.w - 18;
  let y = r.y + vh;

  text(ctx, p.name[ui.lang], x, y + 32, { title: true, bold: true, size: 20 });
  text(ctx, kindLine(id, game, T), x, y + 52, { italic: true, size: 13, color: INK.soft });
  text(ctx, `${T.garrison}: ${troops(T, pl)}`, x, y + 76, { size: 14 });

  // Turluk gelir: bu şehrin altını ve yemeği.
  const o = output(game, id);
  let cx = x + text(ctx, T.perTurn + ":", x, y + 100, { italic: true, size: 13, color: INK.soft }) + 10;
  cx += amount(ctx, "money", delta(o.money), cx, y + 100, { size: 14, bold: true }) + 16;
  amount(ctx, "food", delta(o.food), cx, y + 100, { size: 14, bold: true });
  rule(ctx, x, right, y + 114);

  upgradeRow(ctx, game, boxes, T, id, x, right, y + 120);
  rule(ctx, x, right, y + 180);

  // Asker bas: üç tür yan yana, altında hangisinin hangisini yendiği.
  const ri = recruitInfo(game, id, "inf");
  text(ctx, T.recruit, x, y + 202, { bold: true, size: 14 });
  text(ctx, ri.left > 0 ? fill(T.recruitLeft, ri.left) : T.whyDone, right, y + 202, { italic: true, size: 12, color: ri.left > 0 ? INK.soft : INK.faint, align: "right" });
  const bw = (r.w - 36 - 16) / 3;
  UNITS.forEach((type, i) => {
    const info = recruitInfo(game, id, type);
    button(ctx, boxes, {
      x: x + i * (bw + 8), y: y + 212, w: bw, h: 50, label: T[type + "Name"], size: 14, off: !!info.why,
      act: { do: "recruit", id, type },
      tip: [T[type + "Name"], T["tip" + cap(type)], info.why ? [whyText(info.why, T), "bad"] : null],
      sub: (cx2, cy2, color) => costLine(ctx, { money: info.cost }, cx2, cy2 + 3, color, 12),
    });
  });
  wrap(ctx, T.beats, r.w - 36, { italic: true, size: 12 }).slice(0, 2)
    .forEach((l, i) => text(ctx, l, r.x + r.w / 2, y + 280 + i * 15, { italic: true, size: 12, color: INK.soft, align: "center" }));
  y += 306;

  if (p.port) {
    rule(ctx, x, right, y - 4);
    const si = shipInfo(game, id);
    text(ctx, "⛵ " + fill(T.shipsHere, pl.ships), x, y + 26, { bold: true, size: 14 });
    text(ctx, fill(T.carry, pl.ships * N.ship.carry), x, y + 44, { italic: true, size: 12, color: INK.soft });
    button(ctx, boxes, {
      x: right - 140, y: y + 4, w: 140, h: 44, label: T.buildShip, size: 13, off: !!si.why, act: { do: "buildShip", id },
      tip: [T.buildShip, T.tipShip, si.why ? [whyText(si.why, T), "bad"] : null],
      sub: (cx2, cy2, color) => costLine(ctx, { money: si.cost }, cx2, cy2 + 3, color, 12),
    });
  }
  button(ctx, boxes, {
    x, y: r.y + r.h - 52, w: r.w - 36, h: 38, label: T.formArmy, main: true, size: 15,
    off: men(pl) === 0 && !pl.ships, act: { do: "formOpen", id }, tip: [T.formArmy, T.tipForm],
  });
}

/** Geliştir satırı: seviye, kazancı, fiyatlı düğme. */
function upgradeRow(ctx, game, boxes, T, id, x, right, ry) {
  const u = upgradeInfo(game, id), pl = game.places[id];
  const top = u.why === "max";
  text(ctx, `${T.level} ${u.now}${top ? "" : "  →  " + (u.now + 1)}`, x, ry + 20, { bold: true, size: 16 });
  if (top) {
    text(ctx, T.whyMax, x, ry + 40, { italic: true, size: 12, color: INK.faint });
    return;
  }
  // Kazanç: bir seviye yukarıda bu şehrin geliri ne kadar artar.
  const now = output(game, id);
  const next = output({ ...game, places: { ...game.places, [id]: { ...pl, level: pl.level + 1 } } }, id);
  text(ctx, fill(T.upgradeFx, delta(next.money - now.money), delta(next.food - now.food)), x, ry + 40, { italic: true, size: 12, color: INK.soft });
  if (!walled(game, id) && pl.level + 1 >= N.wallLevel) text(ctx, "+ " + T.wallsGain, x, ry + 55, { italic: true, bold: true, size: 12, color: INK.good });
  button(ctx, boxes, {
    x: right - 118, y: ry + 4, w: 118, h: 46, label: T.upgrade, size: 14, off: !!u.why, act: { do: "upgrade", id },
    tip: [T.upgrade, T.tipUpgrade, u.why ? [whyText(u.why, T), "bad"] : null],
    sub: (cx, cy, color) => costLine(ctx, { money: u.cost }, cx, cy + 3, color, 12),
  });
}

function rule(ctx, x1, x2, y) {
  ctx.strokeStyle = INK.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y + 0.5);
  ctx.lineTo(x2, y + 0.5);
  ctx.stroke();
}

/** Başlığın altında: iki yana uzanan çizgi, ortada baklava. */
function ornament(ctx, cx, y, w) {
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, y + 0.5);
  ctx.lineTo(cx - 8, y + 0.5);
  ctx.moveTo(cx + 8, y + 0.5);
  ctx.lineTo(cx + w / 2, y + 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, y - 4);
  ctx.lineTo(cx + 5, y + 0.5);
  ctx.lineTo(cx, y + 5);
  ctx.lineTo(cx - 5, y + 0.5);
  ctx.closePath();
  ctx.fillStyle = GOLD;
  ctx.fill();
}

/**
 * Kartın başındaki manzaranın boyu: kart ekrana sığdıkça en fazla 120, sığmıyorsa hiç
 * (720 piksellik ekranda şehir kartına yer kalmıyor).
 */
function vignetteHeight(cam, h) {
  const room = cam.h - (TOP + 40) - 12 - h;
  const vh = Math.min(120, room);
  return vh >= 60 ? vh : 0;
}

/** Başkasının ya da bağımsız bir yerin kartı. */
function placeCard(ctx, cam, game, ui, boxes, T, view) {
  const id = ui.sel.id, pl = game.places[id], p = byId[id];
  const me = game.player;
  const army = ui.army ? armyById(game, ui.army) : null;
  const can = army && canAttack(game, army, id);
  const rel = pl.owner ? relation(game, me, pl.owner) : "free";
  const declare = rel === "neutral";
  const roads = neighbours(id).map((n) => placeName(n, ui.lang) + (roadBetween(id, n).sea ? ` (${T.bySea})` : "")).join(", ");
  const W = cardRect(cam, 0).w;
  const lines = wrap(ctx, roads, W - 36, { size: 13 });
  const h = 150 + lines.length * 18 + (can || declare ? 52 : 0);
  const vh = vignetteHeight(cam, h);
  const r = cardRect(cam, h + vh);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  if (vh) drawVignette(ctx, id, pl.owner, { x: r.x + 8, y: r.y + 8, w: r.w - 16, h: vh - 4 }, pl.level);
  closeX(ctx, boxes, r);
  const x = r.x + 18, right = r.x + r.w - 18;
  const y = r.y + vh;

  text(ctx, p.name[ui.lang], x, y + 32, { title: true, bold: true, size: 20 });
  shield(ctx, pl.owner, x, y + 40, 13);
  const w = text(ctx, civName(pl.owner, ui.lang, T.free), x + 20, y + 54, { size: 14 });
  if (pl.owner) {
    const [label, color] = rel === "war" ? [T.war, INK.bad] : rel === "ally" ? [T.ally, INK.good] : [T.neutral, INK.soft];
    text(ctx, "· " + label, x + 26 + w, y + 54, { size: 13, italic: true, color });
  }
  // Sisin içindeki yerin garnizonu ve gemileri bilinmez.
  const hid = view?.fog && !view.seen.has(id);
  text(ctx, kindLine(id, game, T, hid), x, y + 76, { italic: true, size: 13, color: INK.soft });
  const d = defenders(game, id);
  text(ctx, `${T.defenders}: ${hid ? T.fogUnknown : men(d) ? troops(T, d) : T.undefended}`, x, y + 100, { size: 13, italic: hid, color: hid ? INK.soft : INK.ink });
  text(ctx, `${T.walls}: ${walled(game, id) ? T.wallsYes : T.wallsNo}`, x, y + 118, { size: 13, color: INK.soft });

  text(ctx, T.roads.toLocaleUpperCase(ui.lang), x, y + 142, { bold: true, size: 11 });
  lines.forEach((l, i) => text(ctx, l, x, y + 160 + i * 18, { size: 13 }));

  const by = r.y + r.h - 50;
  if (can) {
    const e = forecast(game, army, me, id);
    const [label, color] = oddsLabel(e.odds, T);
    const ow = text(ctx, `${T.odds}: `, x, by + 24, { size: 14 });
    text(ctx, label, x + ow, by + 24, { size: 14, bold: true, color });
    button(ctx, boxes, { x: right - 120, y: by + 2, w: 120, h: 34, label: T.attack, main: true, act: { do: "attackAsk", army: army.id, id } });
  } else if (declare) {
    // Tarafsız bir medeniyet: saldırmak için önce savaş ilan edilir - düğmesi burada.
    button(ctx, boxes, {
      x: right - 150, y: by + 2, w: 150, h: 34, label: T.declareLong, size: 13, off: !canDeclare(game, me, pl.owner),
      act: { do: "askWar", civ: pl.owner }, tip: [T.declareLong, fill(T.neutralBlock, civName(pl.owner, ui.lang))],
    });
  }
}

const oddsLabel = (odds, T) => (odds === "easy" ? [T.easy, INK.good] : odds === "risky" ? [T.risky, INK.warn] : [T.hopeless, INK.bad]);

function armyCard(ctx, cam, game, ui, boxes, T) {
  const a = armyById(game, ui.sel.id);
  const mine = a.owner === game.player;
  const here = armiesAt(game, a.at).filter((b) => b !== a && b.owner === a.owner);
  const hint = mine ? wrap(ctx, T.armyHint, cardRect(cam, 0).w - 36, { size: 13, italic: true }) : [];
  const h = 112 + (a.ships ? 20 : 0) + (a.route.length ? 20 : 0) + hint.length * 17 + (mine ? 56 : 0);
  const r = cardRect(cam, h);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  closeX(ctx, boxes, r);
  const x = r.x + 18;
  let y = r.y + 32;

  shield(ctx, a.owner, x, y - 17, 17);
  text(ctx, `${T.army} · ${civName(a.owner, ui.lang)}`, x + 24, y, { title: true, bold: true, size: 18 });
  y += 26;
  text(ctx, troops(T, a), x, y, { size: 14 });
  if (a.ships) {
    y += 20;
    text(ctx, `⛵ ${a.ships} ${T.ships} · ${fill(T.carry, a.ships * N.ship.carry)}`, x, y, { size: 13, color: canSail(a) ? INK.ink : INK.bad });
  }
  y += 22;
  text(ctx, `${fill(T.moves, a.moves, trait(a.owner, "moves"))} · ${placeName(a.at, ui.lang)}`, x, y, { size: 13, color: INK.soft });
  if (a.route.length) {
    y += 20;
    text(ctx, fill(T.marching, placeName(a.route[a.route.length - 1], ui.lang)), x, y, { size: 13, italic: true });
  }
  if (!mine) return;
  y += 6;
  for (const l of hint) { y += 17; text(ctx, l, x, y, { size: 13, italic: true, color: INK.soft }); }
  const acts = [];
  if (game.places[a.at].owner === a.owner) acts.push([T.station, { do: "station", army: a.id }, !canStation(game, a), T.whyAshore]);
  if (men(a) >= 2 * N.company) acts.push([T.split, { do: "split", army: a.id }]);
  if (here.length) acts.push([T.merge, { do: "merge", army: a.id, from: here[0].id }]);
  const bw = acts.length ? Math.min(150, (r.w - 36 - (acts.length - 1) * 8) / acts.length) : 0;
  acts.forEach(([label, act, off, why], i) => button(ctx, boxes, { x: x + i * (bw + 8), y: r.y + r.h - 48, w: bw, h: 34, label, act, off, size: 13, tip: off ? [label, [why, "bad"]] : null }));
}

function drawToast(ctx, cam, s) {
  const w = Math.min(cam.w - 24, measure(ctx, s, { bold: true, size: 15 }) + 44);
  const x = (cam.w - w) / 2, y = cam.h - BOTTOM_H - 58;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 10;
  roundRect(ctx, x, y, w, 42, 5);
  ctx.fillStyle = "rgba(22,18,14,0.95)";
  ctx.fill();
  ctx.restore();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, 41, 5);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  text(ctx, s, cam.w / 2, y + 22, { bold: true, size: 15, color: CREAM, align: "center", base: "middle" });
}

// ---------------------------------------------------------------------------------------------
// Haber paneli ve ipuçları: koyu, altın çerçeveli, haritanın üstünde.

const TONE = { good: "#a6d98f", bad: "#f08a78", warn: "#ecc66a" };

function darkPanel(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 10;
  roundRect(ctx, x, y, w, h, 5);
  ctx.fillStyle = "rgba(22,18,14,0.93)";
  ctx.fill();
  ctx.restore();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 5);
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

/**
 * Tur sonunda olanlar: pencere açmadan sağ üstte bir liste, birkaç saniye sonra solar.
 * Basılınca bütün rapor açılır. (Kullanıcı 22.10: araya giren pencereler azalsın.)
 */
function drawNews(ctx, cam, ui, boxes, T) {
  const left = ui.news.until - performance.now();
  if (left <= 0) return;
  const W = 340, x = cam.w - 12 - W, y = TOP + 14;
  const rows = ui.news.lines.flatMap(([s, tone]) => wrap(ctx, s, W - 40, { size: 13 }).map((l, i) => [l, tone, i === 0])).slice(0, 9);
  const h = 42 + rows.length * 19;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, left / 800);
  darkPanel(ctx, x, y, W, h);
  text(ctx, T.news.toLocaleUpperCase(ui.lang), x + 16, y + 24, { title: true, bold: true, size: 12, color: GOLD_LIGHT });
  rows.forEach(([l, tone, first], i) => {
    const ly = y + 46 + i * 19;
    const color = TONE[tone] ?? CREAM;
    if (first) { ctx.fillStyle = color; ctx.fillRect(x + 16, ly - 8, 5, 5); }
    text(ctx, l, x + 28, ly, { size: 13, color });
  });
  ctx.restore();
  boxes.push({ x, y, w: W, h, act: { do: "open", modal: "report" } });
}

/** Farenin altındaki şeyin açıklaması. `lines`: dize ya da [dize, ton]; ilki başlık. */
function drawTip(ctx, cam, lines) {
  const items = lines.filter(Boolean).map((l, i) => (typeof l === "string" ? [l, i === 0 ? "title" : null] : l));
  const maxW = 300;
  const rows = items.flatMap(([s, tone]) => wrap(ctx, s, maxW, { size: 13, bold: tone === "title" }).map((l) => [l, tone]));
  const w = Math.min(maxW, Math.max(...rows.map(([l, tone]) => measure(ctx, l, { size: 13, bold: tone === "title" })))) + 24;
  const h = 14 + rows.length * 18;
  let x = pointer.x + 16, y = pointer.y + 20;
  if (x + w > cam.w - 8) x = pointer.x - 12 - w;
  if (y + h > cam.h - 8) y = pointer.y - 12 - h;
  x = Math.max(8, x);
  y = Math.max(8, y);
  darkPanel(ctx, x, y, w, h);
  rows.forEach(([l, tone], i) => text(ctx, l, x + 12, y + 20 + i * 18, {
    size: 13, bold: tone === "title", color: tone === "title" ? GOLD_LIGHT : TONE[tone] ?? CREAM,
  }));
}

/**
 * Haritada bir yerin ipucu: adı, sahibi, savunanları; oyuncunun seçili ordusu varsa oraya ne
 * olacağı (kaç turda yürür, saldırırsa tahmin). `go`: main.js'in hesabı { kind, turns, odds }.
 */
export function placeTip(game, id, lang, hid, go) {
  const T = TEXT[lang], pl = game.places[id];
  const owner = civName(pl.owner, lang, T.free);
  const rel = pl.owner && pl.owner !== game.player ? relation(game, game.player, pl.owner) : null;
  const relText = rel === "war" ? [T.war, "bad"] : rel === "ally" ? [T.ally, "good"] : rel === "neutral" ? [T.neutral, null] : null;
  const out = [placeName(id, lang), `${owner}${relText ? " · " + relText[0] : ""} · ${fill(T.lvl, pl.level)}`];
  const d = defenders(game, id);
  out.push(hid ? T.fogUnknown : men(d) ? troops(T, d) : T.undefended);
  if (walled(game, id)) out.push(`${T.walls}: ${T.wallsYes}`);
  if (!go) return out;
  if (go.kind === "walk") out.push([`${T.tipWalk} · ${go.turns <= 1 ? T.tipOneTurn : fill(T.tipTurns, go.turns)}`, "warn"]);
  else if (go.kind === "attack") out.push([`${T.tipAttack} · ${T.odds}: ${oddsLabel(go.odds, T)[0]}`, go.odds === "easy" ? "good" : go.odds === "risky" ? "warn" : "bad"]);
  else if (go.kind === "approach") out.push([`${T.tipWalk} · ${go.turns <= 1 ? T.tipOneTurn : fill(T.tipTurns, go.turns)} → ${T.attack}`, "warn"]);
  else if (go.kind === "spent") out.push([T.tipSpent, "bad"]);
  else if (go.kind === "neutral") out.push([fill(T.neutralBlock, owner), "bad"]);
  else if (go.kind === "ships") out.push([T.needShips, "bad"]);
  else out.push([T.tipNoWay, "bad"]);
  return out;
}

/** Haritada bir ordunun ipucu. */
export function armyTip(game, a, lang) {
  const T = TEXT[lang];
  const mine = a.owner === game.player;
  const out = [`${T.army} · ${civName(a.owner, lang)}`, troops(T, a)];
  if (a.ships) out.push(`⛵ ${a.ships} ${T.ships}`);
  if (mine) out.push([a.moves > 0 ? fill(T.movesLeft, a.moves) : T.spentShort, a.moves > 0 ? "good" : null]);
  else {
    const rel = relation(game, game.player, a.owner);
    if (rel === "war") out.push([T.war, "bad"]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Pencereler

function modalFrame(ctx, cam, boxes, h, wMax = 440) {
  ctx.fillStyle = "rgba(12,9,6,0.5)";
  ctx.fillRect(0, 0, cam.w, cam.h);
  boxes.push({ x: 0, y: 0, w: cam.w, h: cam.h, act: null });
  const w = Math.min(cam.w - 24, wMax);
  const x = Math.round((cam.w - w) / 2), y = Math.max(12, Math.round((cam.h - h) / 2));
  panel(ctx, x, y, w, h, boxes);
  return { x, y, w, h };
}

function drawModal(ctx, cam, game, ui, boxes, T) {
  const m = ui.modal;
  const f = {
    attack: attackModal, form: formModal, diplo: diploModal, report: reportModal, battle: battleModal,
    menu: menuModal, help: helpModal, confirm: confirmModal, over: overModal,
    armies: armiesModal, cities: citiesModal, chronicle: chronicleModal,
  }[m.kind];
  f?.(ctx, cam, game, ui, boxes, T, m);
}

function twoButtons(ctx, boxes, r, yes, no) {
  const bw = (r.w - 48) / 2, y = r.y + r.h - 62;
  button(ctx, boxes, { x: r.x + 20, y, w: bw, h: 44, size: 15, main: true, ...yes });
  button(ctx, boxes, { x: r.x + 28 + bw, y, w: bw, h: 44, size: 15, ...no });
}

function oneButton(ctx, boxes, r, b) {
  button(ctx, boxes, { x: r.x + 20, y: r.y + r.h - 62, w: r.w - 40, h: 44, size: 15, main: true, ...b });
}

function attackModal(ctx, cam, game, ui, boxes, T, m) {
  const a = armyById(game, m.army);
  if (!a) return;
  const d = defenders(game, m.id);
  const e = forecast(game, a, a.owner, m.id);
  const r = modalFrame(ctx, cam, boxes, 296);
  const x = r.x + 22;
  text(ctx, fill(T.attackQ, placeName(m.id, ui.lang)), r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  text(ctx, T.yours, x, r.y + 76, { bold: true, size: 13 });
  text(ctx, troops(T, a), x, r.y + 96, { size: 13 });
  text(ctx, T.defenders, x, r.y + 124, { bold: true, size: 13 });
  text(ctx, men(d) ? troops(T, d) : T.undefended, x, r.y + 144, { size: 13 });
  text(ctx, `${T.walls}: ${walled(game, m.id) ? T.wallsYes : T.wallsNo}`, x, r.y + 166, { size: 13, color: INK.soft });
  const [label, color] = oddsLabel(e.odds, T);
  const ow = text(ctx, `${T.odds}: `, x, r.y + 198, { size: 15 });
  text(ctx, label, x + ow, r.y + 198, { size: 15, bold: true, color });
  text(ctx, fill(T.expect, e.lost, e.killed), x, r.y + 218, { size: 12, italic: true, color: INK.soft });
  twoButtons(ctx, boxes, r, { label: T.attack, act: { do: "attack" } }, { label: T.cancel, act: { do: "close" } });
}

function formModal(ctx, cam, game, ui, boxes, T, m) {
  const pl = game.places[m.id];
  // Garnizonda olan türler (piyade ve okçu her zaman), gemi varsa gemi.
  const rows = UNITS.filter((k) => k !== "cav" || pl[k] > 0).map((k) => [k, T[k + "Name"]]);
  if (pl.ships > 0) rows.push(["ships", cap(T.ships)]);
  const r = modalFrame(ctx, cam, boxes, 146 + rows.length * 52 + (pl.ships > 0 ? 22 : 0));
  const x = r.x + 22, right = r.x + r.w - 22;
  text(ctx, `${T.formArmy} · ${placeName(m.id, ui.lang)}`, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 19, align: "center" });
  rows.forEach(([type, label], i) => {
    const y = r.y + 64 + i * 52;
    const max = pl[type];
    const step = type === "ships" ? 1 : N.company;
    text(ctx, label, x, y + 26, { bold: true, size: 14 });
    const bx = right - 210;
    button(ctx, boxes, { x: bx, y, w: 40, h: 38, label: "−", size: 18, off: m[type] <= 0, act: { do: "formStep", type, by: -step } });
    text(ctx, `${m[type]} / ${max}`, bx + 80, y + 25, { bold: true, size: 14, align: "center" });
    button(ctx, boxes, { x: bx + 120, y, w: 40, h: 38, label: "+", size: 18, off: m[type] >= max, act: { do: "formStep", type, by: step } });
    button(ctx, boxes, { x: bx + 166, y, w: 44, h: 38, label: T.all, size: 11, off: m[type] >= max, act: { do: "formStep", type, by: Infinity } });
  });
  if (pl.ships > 0) {
    // Seçilen gemiler seçilen askeri taşıyor mu: denize açılabilir mi.
    const ok = (m.ships ?? 0) * N.ship.carry >= men(m);
    text(ctx, fill(T.carry, (m.ships ?? 0) * N.ship.carry) + " · " + T.shipHint, r.x + r.w / 2, r.y + r.h - 76, { size: 12, italic: true, align: "center", color: ok ? INK.soft : INK.warn });
  }
  twoButtons(ctx, boxes, r, { label: T.march, act: { do: "formOk" }, off: men(m) <= 0 && !(m.ships > 0) }, { label: T.cancel, act: { do: "close" } });
}

function diploModal(ctx, cam, game, ui, boxes, T) {
  const me = game.player;
  const others = CIVS.filter((c) => c.id !== me);
  const rowH = 56;
  const r = modalFrame(ctx, cam, boxes, 84 + others.length * rowH + 70, 560);
  text(ctx, T.diplomacy, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  others.forEach((c, i) => {
    const y = r.y + 62 + i * rowH;
    const x = r.x + 18;
    const alive = game.civs[c.id].alive;
    shield(ctx, c.id, x, y + 6, 17);
    text(ctx, c.name[ui.lang], x + 26, y + 22, { title: true, bold: true, size: 14, color: alive ? INK.ink : INK.faint });
    if (!alive) {
      text(ctx, fill(T.evFallen, ""), x + 26, y + 40, { italic: true, size: 12, color: INK.faint });
      return;
    }
    const rel = relation(game, me, c.id);
    const [label, color] = rel === "war" ? [T.war, INK.bad] : rel === "ally" ? [T.ally, INK.good] : [T.neutral, INK.soft];
    text(ctx, `${label} · ${fill(T.soldiers, strength(game, c.id))} · ${fill(T.placesN, placesOf(game, c.id).length)}`, x + 26, y + 40, { italic: true, size: 12, color });

    const acts = rel === "neutral"
      ? [[T.declare, { do: "askWar", civ: c.id }, !canDeclare(game, me, c.id)], [T.propose, { do: "ally", civ: c.id }, !canPropose(game, me, c.id)]]
      : rel === "ally" ? [[T.breakAlly, { do: "askBreak", civ: c.id }, false]]
      : [[T.peace, { do: "peace", civ: c.id }, game.asked[key(me, c.id)] === game.turn]];
    const bw = 92;
    acts.forEach(([l, act, off], j) => {
      const bx = r.x + r.w - 18 - (acts.length - j) * (bw + 6) + 6;
      button(ctx, boxes, { x: bx, y: y + 8, w: bw, h: 34, label: l, act, off, size: 12 });
    });
  });
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

/** Bu turun olaylarından oyuncuyu ilgilendirenler, yazıya dökülmüş: [yazı, ton]. */
export function eventLines(game, lang) {
  const T = TEXT[lang];
  const me = game.player;
  const name = (c) => civName(c, lang, T.free);
  const out = [];
  // Önce tehlike: yanında düşman ordusu duran kendi yerlerin.
  for (const id of placesOf(game, me)) {
    const n = menace(game, id);
    if (n > 0) out.push([fill(T.evThreat, placeName(id, lang), n), "bad"]);
  }
  for (const e of game.events) {
    const mine = [e.by, e.on, e.to, e.with, e.attacker, e.defender, e.civ].includes(me);
    if (e.type === "war") out.push([fill(T.evWar, name(e.by), name(e.on)), mine ? "bad" : null]);
    else if (e.type === "ally") out.push([fill(T.evAlly, name(e.by), name(e.to)), mine ? "good" : null]);
    else if (e.type === "peace") out.push([fill(T.evPeace, name(e.by), name(e.to)), mine ? "good" : null]);
    else if (e.type === "broke") out.push([fill(T.evBroke, name(e.by), name(e.with)), mine ? "bad" : null]);
    else if (e.type === "famine" && e.civ === me) out.push([fill(T.evFamine, e.lost), "bad"]);
    else if (e.type === "battle" && mine) {
      const where = placeName(e.place, lang);
      if (e.won) out.push([fill(T.evTook, name(e.attacker), where), e.attacker === me ? "good" : "bad"]);
      else out.push([fill(T.evHeld, name(e.defender), where, name(e.attacker)), e.defender === me ? "good" : "bad"]);
    }
    if (e.type === "battle" && e.fallen) out.push([fill(T.evFallen, name(e.fallen)), e.fallen === me ? "bad" : null]);
  }
  return out;
}

function reportModal(ctx, cam, game, ui, boxes, T) {
  const lines = eventLines(game, ui.lang);
  if (!lines.length) lines.push([T.quiet, null]);
  const W = Math.min(cam.w - 24, 460) - 60;
  const rows = lines.flatMap(([s, tone]) => wrap(ctx, s, W, { size: 14 }).map((l, i) => [l, tone, i === 0]));
  const shown = rows.slice(0, 16);
  const r = modalFrame(ctx, cam, boxes, 96 + shown.length * 22 + 70, 460);
  text(ctx, fill(T.turn, game.turn), r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  shown.forEach(([l, tone, first], i) => {
    const y = r.y + 80 + i * 22;
    const color = tone === "good" ? INK.good : tone === "bad" ? INK.bad : INK.ink;
    if (first) { ctx.fillStyle = color; ctx.fillRect(r.x + 24, y - 9, 6, 6); }
    text(ctx, l, r.x + 40, y, { size: 14, color });
  });
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

function battleModal(ctx, cam, game, ui, boxes, T, m) {
  const e = m.ev;
  const where = placeName(e.place, ui.lang);
  const lost = men(e.before.att) - men(e.after.att);
  const extra = e.fallen ? [[fill(T.evFallen, civName(e.fallen, ui.lang)), INK.ink]] : [];
  // Üstte savaş sahnesi (battle.js): pencere açıldığından beri geçen süreyle oynar.
  const SH = 180;
  const r = modalFrame(ctx, cam, boxes, 190 + SH + 16 + extra.length * 22);
  drawBattle(ctx, { x: r.x + 16, y: r.y + 16, w: r.w - 32, h: SH }, e, performance.now() - (m.t0 ?? 0), e.walls);
  const y0 = r.y + SH + 16;
  text(ctx, e.won ? fill(T.won, where) : fill(T.lost, where), r.x + r.w / 2, y0 + 44, {
    title: true, bold: true, size: 19, align: "center", color: e.won ? INK.good : INK.bad,
  });
  text(ctx, fill(T.losses, lost), r.x + r.w / 2, y0 + 78, { size: 14, align: "center" });
  extra.forEach(([s, color], i) => text(ctx, s, r.x + r.w / 2, y0 + 102 + i * 22, { size: 14, bold: true, align: "center", color }));
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

function menuModal(ctx, cam, game, ui, boxes, T) {
  const r = modalFrame(ctx, cam, boxes, 500, 360);
  text(ctx, T.menu, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  const x = r.x + 20, w = r.w - 40;
  button(ctx, boxes, { x, y: r.y + 62, w, h: 42, label: T.resume, main: true, size: 15, act: { do: "close" } });
  button(ctx, boxes, { x, y: r.y + 114, w, h: 42, label: T.help, size: 15, act: { do: "open", modal: "help" } });
  button(ctx, boxes, { x, y: r.y + 166, w, h: 42, label: T.chronicle, size: 15, act: { do: "open", modal: "chronicle" } });
  button(ctx, boxes, { x, y: r.y + 218, w, h: 42, label: T.newGame, size: 15, act: { do: "askNew" } });
  text(ctx, T.language, x, r.y + 300, { bold: true, size: 14 });
  ["en", "tr"].forEach((l, i) => {
    button(ctx, boxes, { x: x + w - 2 * 56 + i * 56, y: r.y + 278, w: 50, h: 34, label: l.toUpperCase(), main: ui.lang === l, size: 13, act: { do: "lang", lang: l } });
  });
  // Ses, müzik ve sis: ayrı ayrı aç-kapa.
  [["sound", T.soundLabel, soundEnabled()], ["music", T.musicLabel, musicEnabled()], ["fog", T.fogLabel, ui.fog]].forEach(([k, label, on], j) => {
    const yy = r.y + 322 + j * 44;
    text(ctx, label, x, yy + 22, { bold: true, size: 14 });
    [[true, T.sndOn], [false, T.sndOff]].forEach(([v, l], i) => {
      button(ctx, boxes, { x: x + w - 2 * 74 + i * 74, y: yy, w: 68, h: 34, label: l, main: on === v, size: 13, act: { do: k, on: v } });
    });
  });
  text(ctx, "Natural Earth · github.com/yahyaari/mare-nostrum", r.x + r.w / 2, r.y + r.h - 22, { size: 10, color: INK.faint, align: "center" });
}

function helpModal(ctx, cam, game, ui, boxes, T) {
  const W = Math.min(cam.w - 24, 540) - 64;
  const rows = T.helpLines.flatMap((s, n) => wrap(ctx, s, W, { size: 14 }).map((l, i) => [l, i === 0 ? n + 1 : null]));
  const r = modalFrame(ctx, cam, boxes, 90 + rows.length * 21 + 76, 540);
  text(ctx, T.help, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  rows.forEach(([l, n], i) => {
    const y = r.y + 82 + i * 21;
    if (n) text(ctx, n + ".", r.x + 24, y, { bold: true, size: 14 });
    text(ctx, l, r.x + 44, y, { size: 14 });
  });
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

function confirmModal(ctx, cam, game, ui, boxes, T, m) {
  const W = Math.min(cam.w - 24, 420) - 44;
  const lines = wrap(ctx, m.text, W, { size: 16, bold: true });
  const r = modalFrame(ctx, cam, boxes, 70 + lines.length * 24 + 80, 420);
  lines.forEach((l, i) => text(ctx, l, r.x + r.w / 2, r.y + 48 + i * 24, { bold: true, size: 16, align: "center" }));
  twoButtons(ctx, boxes, r, { label: T.yes, act: m.yes }, { label: T.cancel, act: { do: "close" } });
}

/** Uzun bir listenin bu sayfası ve sayfa düğmeleri; dönen: { rows, pages, page }. */
function paged(list, per, m) {
  const pages = Math.max(1, Math.ceil(list.length / per));
  const page = Math.max(0, Math.min(m.page ?? 0, pages - 1));
  return { rows: list.slice(page * per, page * per + per), pages, page };
}

function pager(ctx, boxes, r, y, pg) {
  if (pg.pages <= 1) return;
  const cx = r.x + r.w / 2;
  button(ctx, boxes, { x: cx - 92, y, w: 44, h: 32, label: "‹", size: 18, off: pg.page === 0, act: { do: "modalPage", page: pg.page - 1 } });
  text(ctx, `${pg.page + 1} / ${pg.pages}`, cx, y + 21, { bold: true, size: 14, align: "center" });
  button(ctx, boxes, { x: cx + 48, y, w: 44, h: 32, label: "›", size: 18, off: pg.page >= pg.pages - 1, act: { do: "modalPage", page: pg.page + 1 } });
}

/** Satır zemini: tek sıralar hafif koyu, basılınca o satırın eylemi. */
function listRow(ctx, boxes, r, y, h, i, act) {
  if (i % 2 === 0) {
    ctx.fillStyle = "rgba(90,70,40,0.07)";
    ctx.fillRect(r.x + 12, y, r.w - 24, h);
  }
  boxes.push({ x: r.x + 12, y, w: r.w - 24, h, act });
}

/** Alt menüden: oyuncunun orduları. Satıra basınca ordu seçilir ve harita oraya kayar. */
function armiesModal(ctx, cam, game, ui, boxes, T, m) {
  const mine = game.armies.filter((a) => a.owner === game.player);
  const rowH = 50;
  const pg = paged(mine, Math.max(3, Math.floor((cam.h - 260) / rowH)), m);
  const listH = Math.max(1, pg.rows.length) * rowH + (pg.pages > 1 ? 44 : 0);
  const r = modalFrame(ctx, cam, boxes, 84 + listH + 74, 560);
  text(ctx, T.armiesTitle, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  const x = r.x + 22, right = r.x + r.w - 24;
  if (!mine.length) text(ctx, T.noArmies, r.x + r.w / 2, r.y + 90, { italic: true, size: 14, color: INK.soft, align: "center" });
  pg.rows.forEach((a, i) => {
    const y = r.y + 62 + i * rowH;
    listRow(ctx, boxes, r, y, rowH - 2, i, { do: "pickArmy", army: a.id });
    soldier(ctx, a.owner, x + 10, y + rowH - 9, 1, {});
    text(ctx, placeName(a.at, ui.lang), x + 30, y + 20, { bold: true, size: 15 });
    text(ctx, troops(T, a) + (a.ships ? `  ·  ⛵ ${a.ships}` : ""), x + 30, y + 39, { size: 13, color: INK.soft });
    const [state, color] = a.route.length ? [fill(T.marching, placeName(a.route[a.route.length - 1], ui.lang)), INK.ink]
      : a.moves > 0 ? [fill(T.movesLeft, a.moves), INK.good] : [T.spentShort, INK.faint];
    text(ctx, state, right, y + 20, { italic: true, size: 13, color, align: "right" });
  });
  pager(ctx, boxes, r, r.y + 62 + pg.rows.length * rowH + 6, pg);
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

/** Alt menüden: oyuncunun yerleşimleri, önce başkent, sonra büyükten küçüğe. */
function citiesModal(ctx, cam, game, ui, boxes, T, m) {
  const ids = placesOf(game, game.player).sort((a, b) => (byId[b].capital ? 1 : 0) - (byId[a].capital ? 1 : 0) || game.places[b].level - game.places[a].level);
  const rowH = 50;
  const pg = paged(ids, Math.max(3, Math.floor((cam.h - 260) / rowH)), m);
  const r = modalFrame(ctx, cam, boxes, 84 + Math.max(1, pg.rows.length) * rowH + (pg.pages > 1 ? 44 : 0) + 74, 600);
  text(ctx, T.citiesTitle, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  const x = r.x + 22, right = r.x + r.w - 24;
  pg.rows.forEach((id, i) => {
    const y = r.y + 62 + i * rowH, pl = game.places[id], p = byId[id];
    listRow(ctx, boxes, r, y, rowH - 2, i, { do: "pickPlace", id });
    const nw = text(ctx, p.name[ui.lang], x, y + 20, { bold: true, size: 15 });
    text(ctx, kindLine(id, game, T), x + nw + 10, y + 20, { italic: true, size: 12, color: INK.soft });
    const o = output(game, id);
    let cx = x;
    cx += amount(ctx, "money", delta(o.money), cx, y + 40, { size: 13 }) + 12;
    cx += amount(ctx, "food", delta(o.food), cx, y + 40, { size: 13 }) + 12;
    text(ctx, `·  ${fill(T.garrisonN, men(pl))}`, cx, y + 40, { size: 13, color: INK.soft });
    if (menace(game, id) > 0) text(ctx, T.threatShort, right, y + 20, { bold: true, italic: true, size: 13, color: INK.bad, align: "right" });
  });
  pager(ctx, boxes, r, r.y + 62 + pg.rows.length * rowH + 6, pg);
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

/** Yıllığın bir satırı: yazısı ve tonu (oyuncu için iyi mi kötü mü). */
function annalLine(game, a, lang) {
  const T = TEXT[lang], me = game.player;
  const name = (c) => civName(c, lang, T.free);
  const tone = (good, bad) => (good ? "good" : bad ? "bad" : null);
  switch (a.k) {
    case "took": return [fill(T.evTook, name(a.by), placeName(a.place, lang)), tone(a.by === me, a.from === me)];
    case "fallen": return [fill(T.evFallen, name(a.civ)), tone(false, a.civ === me)];
    case "war": return [fill(T.evWar, name(a.by), name(a.on)), tone(false, a.on === me || a.by === me)];
    case "ally": return [fill(T.evAlly, name(a.by), name(a.to)), tone(a.by === me || a.to === me, false)];
    case "peace": return [fill(T.evPeace, name(a.by), name(a.to)), tone(a.by === me || a.to === me, false)];
    case "broke": return [fill(T.evBroke, name(a.by), name(a.with)), tone(false, a.with === me)];
    default: return [a.k, null];
  }
}

/**
 * Kronik: üstte medeniyetlerin tur tur yer (ya da asker) sayısı, oyuncunun çizgisi kalın;
 * altında önemli olayların yıllığı, en yenisi üstte.
 */
function chronicleModal(ctx, cam, game, ui, boxes, T, m) {
  const H = Math.min(cam.h - 30, 660);
  const r = modalFrame(ctx, cam, boxes, H, 860);
  text(ctx, T.chronicle, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 22, align: "center" });
  const mode = m.mode ?? "places";
  [["places", T.chrPlaces], ["men", T.chrMen]].forEach(([k, l], i) => {
    button(ctx, boxes, { x: r.x + r.w - 26 - (2 - i) * 104 + 6, y: r.y + 20, w: 98, h: 30, label: l, size: 13, main: mode === k, act: { do: "chronicleMode", mode: k } });
  });
  // Grafik
  const series = game.chronicle?.[mode] ?? [];
  const gx = r.x + 62, gy = r.y + 70, gw = r.w - 96, gh = Math.max(140, Math.min(240, H * 0.36));
  ctx.fillStyle = "rgba(90,70,40,0.08)";
  ctx.fillRect(gx, gy, gw, gh);
  ctx.strokeStyle = INK.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);
  if (series.length < 2) {
    text(ctx, T.chrEmpty, gx + gw / 2, gy + gh / 2, { italic: true, size: 14, color: INK.soft, align: "center", base: "middle" });
  } else {
    const n = series.length, first = game.turn - n + 1;
    const top = Math.max(1, ...series.flat());
    const step = top > 400 ? 200 : top > 100 ? 50 : top > 20 ? 5 : top > 8 ? 2 : 1;
    const maxV = Math.ceil(top / step) * step;
    const X = (i) => gx + (i / (n - 1)) * gw, Y = (v) => gy + gh - (v / maxV) * gh;
    // Izgara ve etiketler
    for (let v = 0; v <= maxV; v += step * Math.max(1, Math.round(maxV / step / 5))) {
      ctx.strokeStyle = "rgba(90,70,40,0.15)";
      ctx.beginPath();
      ctx.moveTo(gx, Y(v) + 0.5);
      ctx.lineTo(gx + gw, Y(v) + 0.5);
      ctx.stroke();
      text(ctx, String(v), gx - 8, Y(v), { size: 11, color: INK.soft, align: "right", base: "middle" });
    }
    const every = Math.max(1, Math.ceil(n / 10));
    for (let i = 0; i < n; i += every) text(ctx, String(first + i), X(i), gy + gh + 16, { size: 11, color: INK.soft, align: "center" });
    // Çizgiler: önce ötekiler, en son oyuncu (kalın, koyu kenarlı).
    const order = CIVS.map((c, j) => j).sort((a, b) => (CIVS[a].id === game.player) - (CIVS[b].id === game.player));
    for (const j of order) {
      const mine = CIVS[j].id === game.player;
      ctx.beginPath();
      series.forEach((row, i) => (i ? ctx.lineTo(X(i), Y(row[j])) : ctx.moveTo(X(i), Y(row[j]))));
      ctx.lineJoin = "round";
      if (mine) {
        ctx.strokeStyle = "rgba(28,23,18,0.55)";
        ctx.lineWidth = 5.5;
        ctx.stroke();
      }
      ctx.strokeStyle = CIVS[j].color;
      ctx.lineWidth = mine ? 3.2 : 1.8;
      ctx.stroke();
    }
  }
  // Açıklama: kalkan, ad, bugünkü sayı.
  const last = series[series.length - 1];
  const ly = gy + gh + 30, cw = gw / CIVS.length;
  CIVS.forEach((c, j) => {
    const lx = gx + j * cw;
    shield(ctx, c.id, lx, ly, 13);
    const alive = game.civs[c.id].alive;
    text(ctx, c.name[ui.lang] + (last ? ` ${last[j]}` : ""), lx + 18, ly + 12, { size: 12, bold: c.id === game.player, color: alive ? INK.ink : INK.faint });
  });
  // Yıllık
  const list = [...(game.annals ?? [])].reverse();
  const top = ly + 34, rowH = 21;
  rule(ctx, r.x + 22, r.x + r.w - 22, top - 10);
  const per = Math.max(3, Math.floor((r.y + r.h - 70 - 44 - top) / rowH));
  const pg = paged(list, per, m);
  if (!list.length) text(ctx, T.chrNone, r.x + r.w / 2, top + 20, { italic: true, size: 14, color: INK.soft, align: "center" });
  pg.rows.forEach((a, i) => {
    const y = top + 14 + i * rowH;
    const [s, tone] = annalLine(game, a, ui.lang);
    text(ctx, fill(T.chrTurn, a.t), r.x + 26, y, { bold: true, size: 12, color: INK.soft });
    const color = tone === "good" ? INK.good : tone === "bad" ? INK.bad : INK.ink;
    text(ctx, s, r.x + 100, y, { size: 13, color });
  });
  pager(ctx, boxes, r, r.y + r.h - 108, pg);
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

function overModal(ctx, cam, game, ui, boxes, T) {
  const won = game.over.result === "won";
  const r = modalFrame(ctx, cam, boxes, 210);
  text(ctx, won ? T.victory : T.defeat, r.x + r.w / 2, r.y + 56, { title: true, bold: true, size: 28, align: "center", color: won ? INK.good : INK.bad });
  text(ctx, fill(won ? T.victoryText : T.defeatText, game.over.turn), r.x + r.w / 2, r.y + 94, { size: 14, align: "center" });
  twoButtons(ctx, boxes, r, { label: T.newGame, act: { do: "newGame" } }, { label: T.chronicle, act: { do: "open", modal: "chronicle" } });
}
