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
import { BOTTOM_H, RIGHT_W, TOP, drawBottomBar, drawRightColumn, drawTopBar } from "./hud.js";
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
  let card = null;
  if (ui.screen === "start") {
    drawStart(ctx, cam, ui, boxes, T);
  } else {
    drawTopBar(ctx, cam, game, ui, boxes, T);
    if (!game.over) drawRightColumn(ctx, cam, game, ui, boxes, T, view);
    // Seçim kartı altta ortada; açıkken alttaki menünün yerini alır.
    if (ui.sel?.kind === "place") {
      card = game.places[ui.sel.id].owner === game.player ? cityCard(ctx, cam, game, ui, boxes, T) : placeCard(ctx, cam, game, ui, boxes, T, view);
    } else if (ui.sel?.kind === "army" && armyById(game, ui.sel.id)) {
      card = armyCard(ctx, cam, game, ui, boxes, T);
    }
    if (!game.over && !card) drawBottomBar(ctx, cam, game, ui, boxes, T);
    if (ui.news && !ui.modal) drawNews(ctx, cam, ui, boxes, T);
  }
  if (ui.toast && ui.toast.until > performance.now()) drawToast(ctx, cam, ui.toast.text, card ? card.y - 56 : cam.h - BOTTOM_H - 58);
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
//
// Seçim kartı ekranın altında ortada, yatay bir panel (Total War gibi; kullanıcı 22.10:
// "şehir yükseltmeleri vs aşağıda ortada çıksın, ekranın solunda istemiyorum"). Kart açıkken
// alttaki menü (Ordu, Şehirler...) gizlenir: yeri kartın. Sütunlar soldan sağa okunur; ekran
// genişse en solda yerin manzarası.

/** En yüksek kartın boyu: main.js seçilen yeri bunun üstüne kaydırır. */
export const CARD_H = 182;
const PAD = 16, GAP = 18;

/** Kartın yeri: altta ortada; sağ alttaki sütuna (sıradaki ordu, mini harita, Turu bitir) değmez. */
function cardRect(cam, w, h) {
  const right = cam.w - 12 - RIGHT_W - 12;
  const x = Math.max(12, Math.min(Math.round((cam.w - w) / 2), right - w));
  return { x, y: cam.h - 12 - h, w, h };
}

/** Manzara (yerin resmi) kartın ortada kalmasını bozmuyorsa eklenir: genişliği, yoksa 0. */
const vignetteWidth = (cam, w, v) => (cam.w - 2 * (RIGHT_W + 24) >= w + v + 10 ? v : 0);

/** Kartın sağ üst köşesine oturan kapatma düğmesi. */
function closeX(ctx, boxes, r) {
  const s = 30;
  button(ctx, boxes, { x: r.x + r.w - s + 8, y: r.y - 10, w: s, h: s, label: "×", size: 18, main: true, act: { do: "deselect" } });
}

/** Sütunların arasına ince dik çizgi. */
function vrule(ctx, x, y1, y2) {
  ctx.strokeStyle = INK.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, y1);
  ctx.lineTo(Math.round(x) + 0.5, y2);
  ctx.stroke();
}

/** Bir sütuna sarılmış yazı, en çok `max` satır; dönen: satır sayısı. */
function lines(ctx, s, x, y, w, o, max = 2, step = 16) {
  const ls = wrap(ctx, s, w, o).slice(0, max);
  ls.forEach((l, i) => text(ctx, l, o.align === "center" ? x + w / 2 : x, y + i * step, o));
  return ls.length;
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

/**
 * Kendi şehrinin kartı, dört sütun: şehir (ad, garnizon, gelir, Ordu çıkar) | Geliştir |
 * Asker bas (üç tür ve üçgen) | limansa gemiler.
 */
function cityCard(ctx, cam, game, ui, boxes, T) {
  const id = ui.sel.id, pl = game.places[id], p = byId[id];
  const A = 180, B = 156, C = 234, D = p.port ? 116 : 0;
  const body = A + GAP + B + GAP + C + (D ? GAP + D : 0) + PAD;
  const V = vignetteWidth(cam, PAD + body, 128);
  const left = V ? 8 + V + GAP : PAD;
  const r = cardRect(cam, left + body, CARD_H);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  if (V) drawVignette(ctx, id, pl.owner, { x: r.x + 8, y: r.y + 8, w: V, h: r.h - 16 }, pl.level);
  const y = r.y, H = r.h;
  let x = r.x + left;

  // Şehir: ad, türü, garnizon, turluk gelir; altta Ordu çıkar.
  text(ctx, p.name[ui.lang], x, y + 34, { title: true, bold: true, size: 19 });
  text(ctx, [p.capital ? T.capital : null, p.kind === "castle" ? T.castle : T.city, p.port ? T.port : null].filter(Boolean).join(" · "), x, y + 54, { italic: true, size: 12, color: INK.soft });
  lines(ctx, `${T.garrison}: ${troops(T, pl)}`, x, y + 78, A, { size: 13 }, 2, 17);
  let cx = x + text(ctx, T.perTurn + ":", x, y + 122, { italic: true, size: 12, color: INK.soft }) + 8;
  const o = output(game, id);
  cx += amount(ctx, "money", delta(o.money), cx, y + 122, { size: 13, bold: true }) + 12;
  amount(ctx, "food", delta(o.food), cx, y + 122, { size: 13, bold: true });
  button(ctx, boxes, {
    x, y: y + H - 48, w: A, h: 34, label: T.formArmy, main: true, size: 14,
    off: men(pl) === 0 && !pl.ships, act: { do: "formOpen", id }, tip: [T.formArmy, T.tipForm],
  });

  // Geliştir
  x += A + GAP;
  vrule(ctx, x - GAP / 2, y + 16, y + H - 16);
  upgradeBlock(ctx, game, boxes, T, id, x, y, B, H);

  // Asker bas: üç tür yan yana, altında hangisinin hangisini yendiği.
  x += B + GAP;
  vrule(ctx, x - GAP / 2, y + 16, y + H - 16);
  const ri = recruitInfo(game, id, "inf");
  text(ctx, T.recruit, x, y + 34, { bold: true, size: 15 });
  text(ctx, ri.left > 0 ? fill(T.recruitLeft, ri.left) : T.whyDone, x + C, y + 34, { italic: true, size: 12, color: ri.left > 0 ? INK.soft : INK.faint, align: "right" });
  const bw = (C - 12) / 3;
  UNITS.forEach((type, i) => {
    const info = recruitInfo(game, id, type);
    button(ctx, boxes, {
      x: x + i * (bw + 6), y: y + 48, w: bw, h: 58, label: T[type + "Name"], size: 14, off: !!info.why,
      act: { do: "recruit", id, type },
      tip: [T[type + "Name"], T["tip" + cap(type)], info.why ? [whyText(info.why, T), "bad"] : null],
      sub: (cx2, cy2, color) => costLine(ctx, { money: info.cost }, cx2, cy2 + 4, color, 12),
    });
  });
  lines(ctx, T.beats, x, y + 130, C, { italic: true, size: 12, color: INK.soft, align: "center" }, 2, 15);

  // Gemiler (liman)
  if (D) {
    x += C + GAP;
    vrule(ctx, x - GAP / 2, y + 16, y + H - 16);
    const si = shipInfo(game, id);
    text(ctx, "⛵ " + cap(T.ships), x, y + 34, { bold: true, size: 15 });
    text(ctx, fill(T.shipsHere, pl.ships), x, y + 56, { size: 13 });
    text(ctx, fill(T.carry, pl.ships * N.ship.carry), x, y + 74, { italic: true, size: 12, color: INK.soft });
    button(ctx, boxes, {
      x, y: y + H - 58, w: D, h: 44, label: T.buildShip, size: 13, off: !!si.why, act: { do: "buildShip", id },
      tip: [T.buildShip, T.tipShip, si.why ? [whyText(si.why, T), "bad"] : null],
      sub: (cx2, cy2, color) => costLine(ctx, { money: si.cost }, cx2, cy2 + 3, color, 12),
    });
  }
  closeX(ctx, boxes, r);
  return r;
}

/** Geliştir sütunu: seviye, bir seviye yukarıda kazancı, fiyatlı düğme. */
function upgradeBlock(ctx, game, boxes, T, id, x, y, w, H) {
  const u = upgradeInfo(game, id), pl = game.places[id];
  const top = u.why === "max";
  text(ctx, `${T.level} ${u.now}${top ? "" : "  →  " + (u.now + 1)}`, x, y + 34, { bold: true, size: 15 });
  if (top) {
    text(ctx, T.whyMax, x, y + 56, { italic: true, size: 12, color: INK.faint });
    return;
  }
  const now = output(game, id);
  const next = output({ ...game, places: { ...game.places, [id]: { ...pl, level: pl.level + 1 } } }, id);
  const n = lines(ctx, fill(T.upgradeFx, delta(next.money - now.money), delta(next.food - now.food)), x, y + 56, w, { italic: true, size: 12, color: INK.soft }, 2, 15);
  if (!walled(game, id) && pl.level + 1 >= N.wallLevel) text(ctx, "+ " + T.wallsGain, x, y + 58 + n * 15, { italic: true, bold: true, size: 12, color: INK.good });
  button(ctx, boxes, {
    x, y: y + H - 58, w, h: 44, label: T.upgrade, size: 14, off: !!u.why, act: { do: "upgrade", id },
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
 * Başkasının ya da bağımsız bir yerin kartı: yer (ad, sahibi, tür, sur) | savunanlar ve yollar |
 * eylem (yanında ordun varsa saldırı tahmini, tarafsızsa savaş ilanı).
 */
function placeCard(ctx, cam, game, ui, boxes, T, view) {
  const id = ui.sel.id, pl = game.places[id], p = byId[id];
  const me = game.player;
  const army = ui.army ? armyById(game, ui.army) : null;
  const can = army && canAttack(game, army, id);
  const rel = pl.owner ? relation(game, me, pl.owner) : "free";
  const declare = !can && rel === "neutral";
  const A = 210, B = 250, C = can || declare ? 170 : 0;
  const body = A + GAP + B + (C ? GAP + C : 0) + PAD;
  const V = vignetteWidth(cam, PAD + body, 112);
  const left = V ? 8 + V + GAP : PAD;
  const r = cardRect(cam, left + body, 150);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  if (V) drawVignette(ctx, id, pl.owner, { x: r.x + 8, y: r.y + 8, w: V, h: r.h - 16 }, pl.level);
  const y = r.y, H = r.h;
  let x = r.x + left;

  // Yer
  text(ctx, p.name[ui.lang], x, y + 34, { title: true, bold: true, size: 19 });
  shield(ctx, pl.owner, x, y + 43, 13);
  const w = text(ctx, civName(pl.owner, ui.lang, T.free), x + 20, y + 57, { size: 14 });
  if (pl.owner) {
    const [label, color] = rel === "war" ? [T.war, INK.bad] : rel === "ally" ? [T.ally, INK.good] : [T.neutral, INK.soft];
    text(ctx, "· " + label, x + 26 + w, y + 57, { size: 13, italic: true, color });
  }
  // Sisin içindeki yerin garnizonu ve gemileri bilinmez.
  const hid = view?.fog && !view.seen.has(id);
  lines(ctx, kindLine(id, game, T, hid), x, y + 80, A, { italic: true, size: 12, color: INK.soft }, 2, 15);
  lines(ctx, `${T.walls}: ${walled(game, id) ? T.wallsYes : T.wallsNo}`, x, y + 114, A, { size: 12, color: INK.soft }, 2, 15);

  // Savunanlar ve yollar
  x += A + GAP;
  vrule(ctx, x - GAP / 2, y + 16, y + H - 16);
  const d = defenders(game, id);
  text(ctx, T.defenders.toLocaleUpperCase(ui.lang), x, y + 30, { bold: true, size: 11 });
  lines(ctx, hid ? T.fogUnknown : men(d) ? troops(T, d) : T.undefended, x, y + 48, B, { size: 13, italic: hid, color: hid ? INK.soft : INK.ink }, 2, 17);
  const roads = neighbours(id).map((n) => placeName(n, ui.lang) + (roadBetween(id, n).sea ? ` (${T.bySea})` : "")).join(", ");
  text(ctx, T.roads.toLocaleUpperCase(ui.lang), x, y + 88, { bold: true, size: 11 });
  lines(ctx, roads, x, y + 106, B, { size: 12 }, 3, 15);

  // Eylem
  if (C) {
    x += B + GAP;
    vrule(ctx, x - GAP / 2, y + 16, y + H - 16);
    if (can) {
      const e = forecast(game, army, me, id);
      const [label, color] = oddsLabel(e.odds, T);
      text(ctx, T.odds, x, y + 34, { size: 13, color: INK.soft });
      text(ctx, label, x, y + 58, { size: 18, bold: true, color });
      lines(ctx, fill(T.expect, e.lost, e.killed), x, y + 78, C, { italic: true, size: 11, color: INK.soft }, 2, 13);
      button(ctx, boxes, { x, y: y + H - 50, w: C, h: 36, label: T.attack, main: true, size: 15, act: { do: "attackAsk", army: army.id, id } });
    } else {
      // Tarafsız bir medeniyet: saldırmak için önce savaş ilan edilir - düğmesi burada.
      lines(ctx, fill(T.neutralBlock, civName(pl.owner, ui.lang)), x, y + 34, C, { italic: true, size: 12, color: INK.soft }, 3, 15);
      button(ctx, boxes, {
        x, y: y + H - 50, w: C, h: 36, label: T.declareLong, size: 13, off: !canDeclare(game, me, pl.owner),
        act: { do: "askWar", civ: pl.owner }, tip: [T.declareLong, fill(T.neutralBlock, civName(pl.owner, ui.lang))],
      });
    }
  }
  closeX(ctx, boxes, r);
  return r;
}

const oddsLabel = (odds, T) => (odds === "easy" ? [T.easy, INK.good] : odds === "risky" ? [T.risky, INK.warn] : [T.hopeless, INK.bad]);

/** Ordu kartı: ordu (askerleri, gemileri, hareketi) | kendi ordunsa nasıl yürütüleceği ve eylemler. */
function armyCard(ctx, cam, game, ui, boxes, T) {
  const a = armyById(game, ui.sel.id);
  const mine = a.owner === game.player;
  const here = armiesAt(game, a.at).filter((b) => b !== a && b.owner === a.owner);
  const A = 250, B = mine ? 300 : 0;
  const r = cardRect(cam, PAD + A + (B ? GAP + B : 0) + PAD, 150);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  const y = r.y, H = r.h;
  let x = r.x + PAD;

  shield(ctx, a.owner, x, y + 17, 17);
  text(ctx, `${T.army} · ${civName(a.owner, ui.lang)}`, x + 24, y + 34, { title: true, bold: true, size: 17 });
  let ly = y + 58 + (lines(ctx, troops(T, a), x, y + 58, A, { size: 14 }, 2, 18) - 1) * 18;
  if (a.ships) {
    ly += 20;
    text(ctx, `⛵ ${a.ships} ${T.ships} · ${fill(T.carry, a.ships * N.ship.carry)}`, x, ly, { size: 13, color: canSail(a) ? INK.ink : INK.bad });
  }
  ly += 22;
  text(ctx, `${fill(T.moves, a.moves, trait(a.owner, "moves"))} · ${placeName(a.at, ui.lang)}`, x, ly, { size: 13, color: INK.soft });
  if (a.route.length) text(ctx, fill(T.marching, placeName(a.route[a.route.length - 1], ui.lang)), x, ly + 20, { size: 13, italic: true });

  if (mine) {
    x += A + GAP;
    vrule(ctx, x - GAP / 2, y + 16, y + H - 16);
    lines(ctx, T.armyHint, x, y + 34, B, { size: 13, italic: true, color: INK.soft }, 3, 17);
    const acts = [];
    if (game.places[a.at].owner === a.owner) acts.push([T.station, { do: "station", army: a.id }, !canStation(game, a), T.whyAshore]);
    if (men(a) >= 2 * N.company) acts.push([T.split, { do: "split", army: a.id }]);
    if (here.length) acts.push([T.merge, { do: "merge", army: a.id, from: here[0].id }]);
    const bw = (B - 16) / 3;
    acts.forEach(([label, act, off, why], i) => button(ctx, boxes, { x: x + i * (bw + 8), y: y + H - 50, w: bw, h: 36, label, act, off, size: 13, tip: off ? [label, [why, "bad"]] : null }));
  }
  closeX(ctx, boxes, r);
  return r;
}

function drawToast(ctx, cam, s, y) {
  const w = Math.min(cam.w - 24, measure(ctx, s, { bold: true, size: 15 }) + 44);
  const x = (cam.w - w) / 2;
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
