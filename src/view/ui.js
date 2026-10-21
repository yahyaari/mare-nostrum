// Arayüz: başlangıç ekranı, üst bant, kartlar ve pencereler. Hiçbir kuralı değiştirmez;
// her düğme bir `act` bırakır, main.js onu çalıştırır.
//
// `ui` görünüm durumu: { screen, lang, pick, saved, sel, modal, toast }.
//   sel:   { kind: "place" | "army", id }
//   modal: { kind: "attack" | "form" | "diplo" | "report" | "battle" | "menu" | "help" |
//            "confirm" | "over", ... }

import { CIVS } from "../data/world.js";
import { canDeclare, canPropose } from "../rules/diplomacy.js";
import { byId, neighbours, roadBetween } from "../rules/graph.js";
import { access, canAttack, defenders, forecast, fortOf, hostile, menace, shipsAt, wallsOf } from "../rules/moves.js";
import { N, UNITS, trait } from "../rules/numbers.js";
import {
  PORT_UPGRADES, UPGRADES, armiesAt, armyById, blockaded, budget, canSail, gamesInfo, key, men, output, placesOf, popCap, recruitCost, shipInfo,
  recruitInfo, relation, strength, upgradeInfo,
} from "../rules/state.js";
import { TEXT, fill } from "../text.js";
import { drift } from "../rules/loyalty.js";
import { appointInfo } from "../rules/generals.js";
import { options as letterOptions } from "../rules/events.js";
import {
  INK, SERIF, amount, button, civName, colorOf, costLine, delta, fmt, icon, measure, panel, text, wrap,
} from "./kit.js";
import { BOTTOM_H, TOP, drawBottomBar, drawRightColumn, drawTopBar } from "./hud.js";
import { CREAM, DARK, GOLD, GOLD_DARK, roundRect, shield, soldier } from "./pieces.js";
import { drawVignette } from "./draw.js";

const placeName = (id, lang) => byId[id].name[lang];

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
      else placeCard(ctx, cam, game, ui, boxes, T);
    } else if (ui.sel?.kind === "army" && armyById(game, ui.sel.id)) {
      armyCard(ctx, cam, game, ui, boxes, T);
    }
  }
  if (ui.toast && ui.toast.until > performance.now()) drawToast(ctx, cam, ui.toast.text);
  if (ui.modal) drawModal(ctx, cam, game, ui, boxes, T);
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
  // Dar ekranda güçlü ve zayıf yan tek satıra sığmıyor: iki satır, daha yüksek satır.
  const twoLines = CIVS.some((c) => {
    const [good, bad] = T.traits[c.id];
    return measure(ctx, `▲ ${good}   ▼ ${bad}`, { size: 12, italic: true }) > W - 80;
  });
  const rowH = twoLines ? 66 : 52;
  const H = 104 + CIVS.length * rowH + 52 + 76 + (ui.saved ? 56 : 0);
  const x = Math.round((cam.w - W) / 2), y = Math.max(12, Math.round((cam.h - H) / 2));
  panel(ctx, x, y, W, H, boxes);
  text(ctx, T.title, x + W / 2, y + 44, { title: true, bold: true, size: 30, align: "center" });
  ornament(ctx, x + W / 2, y + 56, 150);
  text(ctx, T.era, x + W / 2, y + 76, { italic: true, size: 14, color: INK.soft, align: "center" });
  text(ctx, T.chooseCiv, x + 22, y + 94, { bold: true, size: 13 });

  CIVS.forEach((c, i) => {
    const ry = y + 104 + i * rowH;
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
    text(ctx, c.name[ui.lang], x + 54, ry + 24, { title: true, bold: true, size: 16 });
    const [good, bad] = T.traits[c.id];
    const o = { size: 12, color: INK.soft, italic: true };
    if (!twoLines) text(ctx, `▲ ${good}   ▼ ${bad}`, x + 54, ry + 42, o);
    else {
      text(ctx, `▲ ${good}`, x + 54, ry + 42, o);
      text(ctx, `▼ ${bad}`, x + 54, ry + 58, o);
    }
    boxes.push({ x: x + 12, y: ry, w: W - 24, h: rowH, act: { do: "pick", civ: c.id } });
  });

  // Zorluk: üç düğme yan yana, seçili olan dolu.
  const ly = y + 104 + CIVS.length * rowH + 8;
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

/** Kartın sağ üst köşesinde kapatma düğmesi: telefonda kart haritanın yarısını kaplıyor. */
function closeX(ctx, boxes, r) {
  const s = 34, x = r.x + r.w - s - 6, y = r.y + 6;
  button(ctx, boxes, { x, y, w: s, h: s, label: "×", size: 20, act: { do: "deselect" } });
}

function cardRect(cam, h) {
  // Sol altta; üstü bandın ve ondan sarkan sancağın altında kalır.
  return { x: 12, y: Math.max(TOP + 40, cam.h - 12 - h), w: 360, h };
}

function kindLine(id, game, T) {
  const p = byId[id], pl = game.places[id];
  return [p.capital ? T.capital : null, p.kind === "castle" ? T.castle : T.city, p.port ? T.port : null]
    .filter(Boolean).join(" · ") + " · " + fill(T.lvl, pl.level) + (pl.ships ? ` · ${pl.ships} ${T.ships}` : "");
}

/** "120 piyade · 40 okçu · 20 süvari": piyade ve okçu hep, ötekiler varsa. */
function troops(T, u) {
  return UNITS.filter((k) => k === "inf" || k === "arch" || u[k] > 0).map((k) => `${u[k] ?? 0} ${T[k]}`).join(" · ");
}

function cityCard(ctx, cam, game, ui, boxes, T) {
  const id = ui.sel.id, pl = game.places[id], p = byId[id];
  // Liman şehrinin kartı iki sekmeli: Şehir (yükseltme, sadakat, asker) ve Liman (liman
  // yapıları, gemi, filo). Sekme çubuğu başlığın altında, kart iki sekmede de aynı boyda.
  const tabs = p.port ? 42 : 0;
  const tab = p.port && ui.cardTab === "port" ? "port" : "city";
  const vh = vignetteHeight(cam, 538 + tabs);
  const r = cardRect(cam, 538 + tabs + vh);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  if (vh) drawVignette(ctx, id, pl.owner, { x: r.x + 8, y: r.y + 8, w: r.w - 16, h: vh - 4 });
  closeX(ctx, boxes, r);
  const x = r.x + 18, right = r.x + r.w - 18;
  let y = r.y + vh;

  text(ctx, p.name[ui.lang], x, y + 32, { title: true, bold: true, size: 20 });
  text(ctx, kindLine(id, game, T), x, y + 52, { italic: true, size: 13, color: INK.soft });

  const cap = popCap(pl, p.kind);
  amount(ctx, "pop", `${pl.pop} / ${Math.round(cap)}`, x, y + 80, { size: 14 });
  if (blockaded(game, id)) text(ctx, T.blockadeNote, right, y + 80, { italic: true, bold: true, size: 12, color: INK.bad, align: "right" });
  // Garnizon kendi satırında: dört tür yan yana nüfusun yanına sığmıyor.
  text(ctx, troops(T, pl), x, y + 102, { size: 13 });

  const o = output(game, id);
  text(ctx, T.perTurn, x, y + 126, { italic: true, size: 12, color: INK.soft });
  let cx = x + measure(ctx, T.perTurn, { italic: true, size: 12 }) + 12;
  for (const k of ["money", "weapons", "food"]) cx += amount(ctx, k, delta(o[k]), cx, y + 126, { size: 13 }) + 14;

  if (p.port) {
    // Sekmeler: seçili olan dolu.
    const tw = (r.w - 36 - 8) / 2;
    [["city", T.tabCity], ["port", "⚓ " + T.tabPort]].forEach(([k, label], i) => {
      button(ctx, boxes, { x: x + i * (tw + 8), y: y + 140, w: tw, h: 32, label, size: 13, main: tab === k, act: { do: "cardTab", tab: k } });
    });
    y += tabs;
  }

  y += 22;
  rule(ctx, x, right, y + 116);
  if (tab === "port") portTab(ctx, game, boxes, T, id, x, right, r, y);
  else cityTab(ctx, game, boxes, T, id, x, right, r, y);
}

/** Bir yükseltme satırı: ad, seviye, etkisi ya da neden olmadığı, fiyatlı düğme. */
function upgradeRow(ctx, game, boxes, T, id, what, x, right, ry) {
  const u = upgradeInfo(game, id, what);
  const done = u.why === "max" || u.why === "needLevel";
  text(ctx, `${T[what]}  ${u.now}${done ? "" : " → " + (u.now + 1)}`, x, ry + 17, { bold: true, size: 13 });
  const note = u.why === "max" ? T.whyMax : u.why === "needLevel" ? fill(T.whyNeedLevel, u.now + 1)
    : u.why === "done" ? T.whyDone : effect(game, id, what, T);
  text(ctx, note, x, ry + 33, { italic: true, size: 12, color: u.why && u.why !== "money" ? INK.faint : INK.soft });
  if (!done) {
    const bx = right - 92, by = ry + 5;
    button(ctx, boxes, { x: bx, y: by, w: 92, h: 30, label: "", off: !!u.why, act: { do: "upgrade", id, what } });
    const c = u.why ? INK.faint : INK.ink;
    const w = 16 + measure(ctx, String(u.cost), { bold: true, size: 13 });
    amount(ctx, "money", u.cost, bx + 46 - w / 2, by + 20, { size: 13, bold: true, color: c });
  }
}

function cityTab(ctx, game, boxes, T, id, x, right, r, y) {
  const pl = game.places[id];
  const Y = 44; // sadakat satırı: altındaki her şey bu kadar aşağıda

  // Sadakat: çubuk, bu turki değişim, oyunlar düğmesi.
  const lo = pl.loyalty, dr = drift(game, id).total;
  const color = lo < N.loyalty.revolt ? INK.bad : lo < N.loyalty.unrest ? INK.warn : INK.good;
  text(ctx, `${T.loyalty}  ${lo}`, x, y + 138, { bold: true, size: 13 });
  text(ctx, delta(dr), x + measure(ctx, `${T.loyalty}  ${lo}`, { bold: true, size: 13 }) + 8, y + 138, { size: 12, bold: true, color: dr < 0 ? INK.bad : INK.good });
  const bw0 = r.w - 36 - 110;
  ctx.fillStyle = "rgba(90,70,40,0.18)";
  ctx.fillRect(x, y + 145, bw0, 8);
  const lg = ctx.createLinearGradient(0, y + 145, 0, y + 153);
  lg.addColorStop(0, color);
  lg.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = color;
  ctx.fillRect(x, y + 145, (bw0 * lo) / 100, 8);
  ctx.fillStyle = lg;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x, y + 145, (bw0 * lo) / 100, 8);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#5a4630";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 145.5, bw0 - 1, 7);
  const gi = gamesInfo(game, id);
  if (gi.why !== "max") {
    const gx = right - 100, gy = y + 124;
    button(ctx, boxes, { x: gx, y: gy, w: 100, h: 30, label: "", off: !!gi.why, act: { do: "games", id } });
    const c = gi.why ? INK.faint : INK.ink;
    const lw = measure(ctx, T.games, { bold: true, size: 12 });
    text(ctx, T.games, gx + 8, gy + 20, { bold: true, size: 12, color: c });
    amount(ctx, "money", gi.cost, gx + 14 + lw, gy + 20, { size: 12, bold: true, color: c });
  }
  rule(ctx, x, right, y + 116 + Y);

  // Dört yükseltme
  UPGRADES.forEach((what, i) => upgradeRow(ctx, game, boxes, T, id, what, x, right, y + Y + 122 + i * 42));

  y += Y;
  rule(ctx, x, right, y + 292);

  // Asker basma: dört tür, iki sıra. Kapalı düğmenin altında maliyet yerine neden kapalı olduğu.
  const ri = recruitInfo(game, id, "inf");
  text(ctx, T.recruit, x, y + 312, { bold: true, size: 13 });
  const why = ri.why && ri.why !== "done" ? whyText(ri.why, T) : fill(T.recruitLeft, ri.left);
  text(ctx, why, right, y + 312, { italic: true, size: 12, color: ri.why && ri.why !== "done" ? INK.bad : INK.soft, align: "right" });
  const bw = (r.w - 36 - 10) / 2;
  UNITS.forEach((type, i) => {
    const info = recruitInfo(game, id, type);
    const locked = info.why && info.why.startsWith("need");
    button(ctx, boxes, {
      x: x + (i % 2) * (bw + 10), y: y + 320 + Math.floor(i / 2) * 54, w: bw, h: 46, label: T["add" + type[0].toUpperCase() + type.slice(1)], size: 13, off: !!info.why,
      act: { do: "recruit", id, type },
      sub: (cx2, cy2, color) => (locked
        ? text(ctx, whyText(info.why, T), cx2, cy2 + 2, { size: 11, italic: true, color, align: "center" })
        : costLine(ctx, recruitCost(game.player, type), cx2, cy2 + 2, color)),
    });
  });

  button(ctx, boxes, {
    x, y: y + 428, w: r.w - 36, h: 32, label: T.formArmy, size: 13,
    off: men(pl) === 0 && !pl.ships, act: { do: "formOpen", id },
  });
}

/** Liman sekmesi: filo durumu, dört liman yapısı, gemi yapımı. */
function portTab(ctx, game, boxes, T, id, x, right, r, y) {
  const pl = game.places[id];
  // Filo: limandaki gemiler, sahibinin buradaki ordularındakiler, abluka durumu.
  const here = shipsAt(game, id);
  text(ctx, `⛵ ${T.fleetHere}: ${here}`, x, y + 140, { bold: true, size: 14 });
  const shut = blockaded(game, id);
  text(ctx, shut ? T.blockaded.toLocaleUpperCase() : T.openSea, right, y + 140, { italic: true, bold: shut, size: 12, color: shut ? INK.bad : INK.good, align: "right" });
  text(ctx, fill(T.navalDefence, Math.round(fortOf(game, id) * 100) / 100), x, y + 158, { italic: true, size: 12, color: INK.soft });
  rule(ctx, x, right, y + 170);

  PORT_UPGRADES.forEach((what, i) => upgradeRow(ctx, game, boxes, T, id, what, x, right, y + 176 + i * 42));
  rule(ctx, x, right, y + 346);

  // Gemi yapımı: tersane hakkından (asker hakkından ayrı).
  const si = shipInfo(game, id);
  text(ctx, T.shipyardLabel, x, y + 366, { bold: true, size: 13 });
  const note = si.why && si.why !== "done" ? whyText(si.why, T) : fill(T.shipsLeft, si.left);
  text(ctx, note, right, y + 366, { italic: true, size: 12, color: si.why && si.why !== "done" ? INK.bad : INK.soft, align: "right" });
  button(ctx, boxes, {
    x, y: y + 376, w: r.w - 36, h: 46, label: `⛵ ${T.addShip}  ·  ${pl.ships} ${T.ships}`, size: 13, off: !!si.why,
    act: { do: "buildShip", id },
    sub: (cx2, cy2, color) => costLine(ctx, si.cost, cx2, cy2 + 2, color),
  });
  button(ctx, boxes, {
    x, y: y + 428, w: r.w - 36, h: 32, label: T.formArmy, size: 13,
    off: men(pl) === 0 && !pl.ships, act: { do: "formOpen", id },
  });
}

function whyText(why, T) {
  return T["why" + why[0].toUpperCase() + why.slice(1)] ?? why;
}

function effect(game, id, what, T) {
  const pl = game.places[id], p = byId[id], c = pl.owner;
  const castle = p.kind === "castle" ? N.castleOutput : 1;
  const r1 = (n) => String(Math.round(n * 10) / 10);
  if (what === "level") return fill(T.levelFx, Math.round(popCap({ ...pl, level: pl.level + 1 }, p.kind)));
  if (what === "farms") return fill(T.farmsFx, r1(N.wheatPerFarm * castle * trait(c, "wheat")));
  if (what === "industry") return fill(T.industryFx, r1(castle * trait(c, "weapons"))) + (pl.industry + 1 === 3 ? " · " + T.industrySiege : "");
  if (what === "fishery") return fill(T.fisheryFx, r1(N.port.fishPerLevel * castle * trait(c, "fish")));
  if (what === "trade") return fill(T.tradeFx, r1(N.port.tradePerLevel * castle * trait(c, "money")));
  if (what === "fort") return fill(T.fortFx, Math.round((1 + (pl.fort + 1) * N.port.fortPerLevel) * 100) / 100);
  if (what === "shipyard") return fill(T.shipyardFx, pl.shipyard + 1, Math.max(1, N.navy.cost.money - pl.shipyard * N.port.shipDiscount));
  const unlock = pl.barracks + 1 === 2 ? " · " + T.barracksArch : pl.barracks + 1 === 3 ? " · " + T.barracksCav : "";
  return fill(T.barracksFx, pl.barracks + 1) + unlock;
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
function placeCard(ctx, cam, game, ui, boxes, T) {
  const id = ui.sel.id, pl = game.places[id], p = byId[id];
  const me = game.player;
  const army = ui.army ? armyById(game, ui.army) : null;
  const can = army && canAttack(game, army, id);
  const roads = neighbours(id).map((n) => placeName(n, ui.lang) + (roadBetween(id, n).sea ? ` (${T.bySea})` : "")).join(", ");
  const W = cardRect(cam, 0).w;
  const lines = wrap(ctx, roads, W - 36, { size: 13 });
  const h = 150 + lines.length * 18 + (can ? 52 : 0);
  const vh = vignetteHeight(cam, h);
  const r = cardRect(cam, h + vh);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  if (vh) drawVignette(ctx, id, pl.owner, { x: r.x + 8, y: r.y + 8, w: r.w - 16, h: vh - 4 });
  closeX(ctx, boxes, r);
  const x = r.x + 18, right = r.x + r.w - 18;
  const y = r.y + vh;

  text(ctx, p.name[ui.lang], x, y + 32, { title: true, bold: true, size: 20 });
  shield(ctx, pl.owner, x, y + 40, 13);
  const w = text(ctx, civName(pl.owner, ui.lang, T.free), x + 20, y + 54, { size: 14 });
  if (pl.owner) {
    const rel = relation(game, me, pl.owner);
    const [label, color] = rel === "war" ? [T.war, INK.bad] : rel === "ally" ? [T.ally, INK.good] : [T.neutral, INK.soft];
    text(ctx, "· " + label, x + 26 + w, y + 54, { size: 13, italic: true, color });
  }
  text(ctx, kindLine(id, game, T), x, y + 76, { italic: true, size: 13, color: INK.soft });

  const d = defenders(game, id);
  const walls = wallsOf(game, id);
  text(ctx, `${T.defenders}: ${men(d) ? troops(T, d) : T.undefended}`, x, y + 100, { size: 13 });
  text(ctx, `${T.walls}: ${walls === "castle" ? T.wallsCastle : walls === "city" ? T.wallsCity : T.wallsNone}`, x, y + 118, { size: 13, color: INK.soft });

  text(ctx, T.roads.toLocaleUpperCase(ui.lang), x, y + 142, { bold: true, size: 11 });
  lines.forEach((l, i) => text(ctx, l, x, y + 160 + i * 18, { size: 13 }));

  if (can) {
    const e = forecast(game, army, me, id);
    const by = y + h - 50;
    const [label, color] = oddsLabel(e.odds, T);
    text(ctx, `${T.odds}: `, x, by + 24, { size: 14 });
    text(ctx, label, x + measure(ctx, `${T.odds}: `, { size: 14 }), by + 24, { size: 14, bold: true, color });
    button(ctx, boxes, { x: right - 120, y: by + 2, w: 120, h: 34, label: T.attack, main: true, act: { do: "attackAsk", army: army.id, id } });
  }
}

const oddsLabel = (odds, T) => (odds === "easy" ? [T.easy, INK.good] : odds === "risky" ? [T.risky, INK.warn] : [T.hopeless, INK.bad]);

function armyCard(ctx, cam, game, ui, boxes, T) {
  const a = armyById(game, ui.sel.id);
  const mine = a.owner === game.player;
  const here = armiesAt(game, a.at).filter((b) => b !== a && b.owner === a.owner);
  const hint = mine ? wrap(ctx, T.armyHint, cardRect(cam, 0).w - 36, { size: 12, italic: true }) : [];
  const g = a.general;
  // Generali olan ordu: ad ve yetenek satırı. Olmayan kendi ordun: kendi satırında "General ata".
  const genH = g ? 22 + (g.traits.length ? 18 : 0) : mine ? 40 : 0;
  const h = 116 + genH + (a.ships ? 20 : 0) + (a.route.length ? 20 : 0) + hint.length * 16 + (mine ? 52 : 0);
  const r = cardRect(cam, h);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  closeX(ctx, boxes, r);
  const x = r.x + 18;
  let y = r.y + 32;

  shield(ctx, a.owner, x, y - 17, 17);
  text(ctx, `${T.army} · ${civName(a.owner, ui.lang)}`, x + 24, y, { title: true, bold: true, size: 18 });
  y += 26;
  text(ctx, troops(T, a), x, y, { size: 14 });
  if (g) {
    // General: yıldızlar seviyesi kadar, adı, ve yetenekleri.
    y += 22;
    const stars = "★".repeat(g.level);
    const sw = text(ctx, stars, x, y, { size: 13, color: INK.warn, bold: true });
    text(ctx, `${fill(T.general, g.name)} · ${fill(T.rank, g.level)}`, x + sw + 6, y, { size: 14, bold: true });
    if (g.traits.length) {
      y += 18;
      text(ctx, g.traits.map((t) => T.skills[t][0] + " (" + T.skills[t][1] + ")").join(", "), x, y, { size: 12, italic: true, color: INK.soft });
    }
  }
  if (a.ships) {
    y += 20;
    text(ctx, `⛵ ${a.ships} ${T.ships} · ${fill(T.carry, a.ships * N.navy.carry)}`, x, y, { size: 13, color: canSail(a) ? INK.ink : INK.bad });
  }
  y += 22;
  const maxMoves = trait(a.owner, "moves") + (g?.traits.includes("swift") ? 1 : 0);
  text(ctx, `${fill(T.moves, a.moves, maxMoves)} · ${placeName(a.at, ui.lang)}`, x, y, { size: 13, color: INK.soft });
  if (a.route.length) {
    y += 20;
    text(ctx, fill(T.marching, placeName(a.route[a.route.length - 1], ui.lang)), x, y, { size: 13, italic: true });
  }
  if (mine) {
    y += 8;
    for (const l of hint) { y += 16; text(ctx, l, x, y, { size: 12, italic: true, color: INK.soft }); }
    const acts = [];
    if (game.places[a.at].owner === a.owner) acts.push([T.station, { do: "station", army: a.id }]);
    if (men(a) >= 2 * N.company) acts.push([T.split, { do: "split", army: a.id }]);
    if (here.length) acts.push([T.merge, { do: "merge", army: a.id, from: here[0].id }]);
    const bw = acts.length ? Math.min(150, (r.w - 36 - (acts.length - 1) * 8) / acts.length) : 0;
    acts.forEach(([label, act], i) => button(ctx, boxes, { x: x + i * (bw + 8), y: r.y + r.h - 46, w: bw, h: 32, label, act, size: 13 }));
    if (!g) {
      // "General ata" ve fiyatı, kendi satırında: yazı + para simgesi ortada.
      const ai = appointInfo(game, a.id);
      const off = ai.why === "money";
      const b = { x, y: r.y + r.h - 86, w: r.w - 36, h: 32, label: "", act: { do: "appoint", army: a.id }, off };
      button(ctx, boxes, b);
      const c = off ? INK.faint : INK.ink;
      const lw = measure(ctx, T.appoint, { bold: true, size: 13 });
      const total = lw + 8 + 13 + 3 + measure(ctx, String(ai.cost), { bold: true, size: 13 });
      const sx = b.x + (b.w - total) / 2;
      text(ctx, "★ " + T.appoint, sx - 8, b.y + 21, { bold: true, size: 13, color: c });
      amount(ctx, "money", ai.cost, sx + lw + 14, b.y + 21, { size: 13, bold: true, color: c });
    }
  }
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
    menu: menuModal, help: helpModal, confirm: confirmModal, over: overModal, decide: decideModal,
    armies: armiesModal, cities: citiesModal,
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
  const d = defenders(game, m.id), walls = wallsOf(game, m.id);
  const e = forecast(game, a, a.owner, m.id);
  const bySea = roadBetween(a.at, m.id)?.sea && shipsAt(game, m.id) > 0;
  const r = modalFrame(ctx, cam, boxes, 290 + (bySea ? 22 : 0));
  const x = r.x + 22;
  text(ctx, fill(T.attackQ, placeName(m.id, ui.lang)), r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  text(ctx, T.yours, x, r.y + 76, { bold: true, size: 13 });
  text(ctx, troops(T, a), x, r.y + 96, { size: 13 });
  text(ctx, T.defenders, x, r.y + 124, { bold: true, size: 13 });
  text(ctx, men(d) ? troops(T, d) : T.undefended, x, r.y + 144, { size: 13 });
  text(ctx, `${T.walls}: ${walls === "castle" ? T.wallsCastle : walls === "city" ? T.wallsCity : T.wallsNone}`, x, r.y + 166, { size: 13, color: INK.soft });
  let oy = r.y + 196;
  if (bySea) {
    // Önce deniz savaşı: kaybedilirse ordu batar.
    const [sl, sc] = oddsLabel(e.sea, T);
    const sw = text(ctx, fill(T.navalOdds, a.ships, shipsAt(game, m.id)) + " · ", x, r.y + 190, { size: 13 });
    text(ctx, sl, x + sw, r.y + 190, { size: 13, bold: true, color: sc });
    oy += 18;
  }
  const [label, color] = oddsLabel(e.odds, T);
  const ow = text(ctx, `${T.odds}: `, x, oy, { size: 15 });
  text(ctx, label, x + ow, oy, { size: 15, bold: true, color });
  text(ctx, fill(T.expect, e.lost, e.killed), x, oy + 20, { size: 12, italic: true, color: INK.soft });
  twoButtons(ctx, boxes, r, { label: T.attack, act: { do: "attack" } }, { label: T.cancel, act: { do: "close" } });
}

function formModal(ctx, cam, game, ui, boxes, T, m) {
  const pl = game.places[m.id];
  // Garnizonda olan türler (piyade ve okçu her zaman).
  const rows = UNITS.filter((k) => k === "inf" || k === "arch" || pl[k] > 0).map((k) => [k, T[k]]);
  if (pl.ships > 0) rows.push(["ships", T.ships]);
  const r = modalFrame(ctx, cam, boxes, 146 + rows.length * 52 + (pl.ships > 0 ? 22 : 0));
  const x = r.x + 22, right = r.x + r.w - 22;
  text(ctx, `${T.formArmy} · ${placeName(m.id, ui.lang)}`, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 19, align: "center" });
  rows.forEach(([type, label], i) => {
    const y = r.y + 64 + i * 52;
    const max = pl[type];
    const step = type === "ships" ? 1 : N.company;
    text(ctx, label[0].toLocaleUpperCase(ui.lang) + label.slice(1), x, y + 26, { bold: true, size: 14 });
    const bx = right - 210;
    button(ctx, boxes, { x: bx, y, w: 40, h: 38, label: "−", size: 18, off: m[type] <= 0, act: { do: "formStep", type, by: -step } });
    text(ctx, `${m[type]} / ${max}`, bx + 80, y + 25, { bold: true, size: 14, align: "center" });
    button(ctx, boxes, { x: bx + 120, y, w: 40, h: 38, label: "+", size: 18, off: m[type] >= max, act: { do: "formStep", type, by: step } });
    button(ctx, boxes, { x: bx + 166, y, w: 44, h: 38, label: T.all, size: 11, off: m[type] >= max, act: { do: "formStep", type, by: Infinity } });
  });
  if (pl.ships > 0) {
    // Seçilen gemiler seçilen askeri taşıyor mu: denize açılabilir mi.
    const ok = (m.ships ?? 0) * N.navy.carry >= men(m);
    text(ctx, fill(T.carry, (m.ships ?? 0) * N.navy.carry) + " · " + T.shipHint, r.x + r.w / 2, r.y + r.h - 76, { size: 12, italic: true, align: "center", color: ok ? INK.soft : INK.warn });
  }
  twoButtons(ctx, boxes, r, { label: T.march, act: { do: "formOk" }, off: men(m) <= 0 && !(m.ships > 0) }, { label: T.cancel, act: { do: "close" } });
}

function diploModal(ctx, cam, game, ui, boxes, T) {
  const me = game.player;
  const others = CIVS.filter((c) => c.id !== me);
  const rowH = 56;
  const r = modalFrame(ctx, cam, boxes, 84 + others.length * rowH + 70, 560);
  text(ctx, T.diplomacy, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  const narrow = r.w < 460;
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
    const info = `${label} · ${fill(T.soldiers, strength(game, c.id))}` + (narrow ? "" : ` · ${fill(T.placesN, placesOf(game, c.id).length)}`);
    text(ctx, info, x + 26, y + 40, { italic: true, size: 12, color });

    const acts = rel === "neutral"
      ? [[T.declare, { do: "askWar", civ: c.id }, !canDeclare(game, me, c.id)], [T.propose, { do: "ally", civ: c.id }, !canPropose(game, me, c.id)]]
      : rel === "ally" ? [[T.breakAlly, { do: "askBreak", civ: c.id }, false]]
      : [[T.peace, { do: "peace", civ: c.id }, game.asked[key(me, c.id)] === game.turn]];
    const bw = narrow ? 70 : 92;
    acts.forEach(([l, act, off], j) => {
      const bx = r.x + r.w - 18 - (acts.length - j) * (bw + 6) + 6;
      button(ctx, boxes, { x: bx, y: y + 8, w: bw, h: 34, label: l, act, off, size: 12 });
    });
  });
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

/** Bu turun olaylarından oyuncuyu ilgilendirenler, yazıya dökülmüş. */
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
      else if (!e.drowned) out.push([fill(T.evHeld, name(e.defender), where, name(e.attacker)), e.defender === me ? "good" : "bad"]);
    }
    if (e.type === "battle" && e.fallen) out.push([fill(T.evFallen, name(e.fallen)), e.fallen === me ? "bad" : null]);
    if (e.type === "battle" && e.drowned && e.defender === me) out.push([fill(T.evDrowned, name(e.attacker), placeName(e.place, lang)), "good"]);
    if (e.type === "riot" && e.civ === me) out.push([fill(T.evRiot, placeName(e.place, lang)), null]);
    if (e.type === "revolt" && e.civ === me) out.push([fill(T.evRevolt, placeName(e.place, lang)), "bad"]);
    if (e.type === "revolt" && e.fallen) out.push([fill(T.evFallen, name(e.fallen)), e.fallen === me ? "bad" : null]);
  }
  return out;
}

function reportModal(ctx, cam, game, ui, boxes, T) {
  const lines = eventLines(game, ui.lang);
  if (!lines.length) lines.push([T.quiet, null]);
  const W = Math.min(cam.w - 24, 460) - 60;
  const rows = lines.flatMap(([s, tone]) => wrap(ctx, s, W, { size: 14 }).map((l, i) => [l, tone, i === 0]));
  const shown = rows.slice(0, 14);
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
  // Ek satırlar: medeniyet yıkıldı, general seviye atladı / yetenek kazandı / düştü.
  const extra = [];
  if (e.fallen) extra.push([fill(T.evFallen, civName(e.fallen, ui.lang)), INK.ink]);
  if (e.gen?.up) extra.push([fill(T.genUp, e.gen.name, e.gen.up), INK.warn]);
  if (e.gen?.trait) extra.push([fill(T.genSkill, T.skills[e.gen.trait][0], T.skills[e.gen.trait][1]), INK.warn]);
  if (e.genFell) extra.push([fill(T.genFell, e.genFell), INK.bad]);
  if (e.drowned) extra.unshift([T.drowned, INK.bad]);
  else if (e.naval?.won && e.naval.sunk) extra.unshift([fill(T.navalWin, e.naval.sunk), INK.good]);
  const r = modalFrame(ctx, cam, boxes, 190 + extra.length * 22);
  text(ctx, e.won ? fill(T.won, where) : fill(T.lost, where), r.x + r.w / 2, r.y + 50, {
    title: true, bold: true, size: 19, align: "center", color: e.won ? INK.good : INK.bad,
  });
  text(ctx, fill(T.losses, lost), r.x + r.w / 2, r.y + 84, { size: 14, align: "center" });
  extra.forEach(([s, color], i) => text(ctx, s, r.x + r.w / 2, r.y + 108 + i * 22, { size: 14, bold: true, align: "center", color }));
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

function menuModal(ctx, cam, game, ui, boxes, T) {
  const r = modalFrame(ctx, cam, boxes, 316, 360);
  text(ctx, T.menu, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  const x = r.x + 20, w = r.w - 40;
  button(ctx, boxes, { x, y: r.y + 62, w, h: 42, label: T.resume, main: true, size: 15, act: { do: "close" } });
  button(ctx, boxes, { x, y: r.y + 114, w, h: 42, label: T.help, size: 15, act: { do: "open", modal: "help" } });
  button(ctx, boxes, { x, y: r.y + 166, w, h: 42, label: T.newGame, size: 15, act: { do: "askNew" } });
  text(ctx, T.language, x, r.y + 248, { bold: true, size: 14 });
  ["en", "tr"].forEach((l, i) => {
    button(ctx, boxes, { x: x + w - 2 * 56 + i * 56, y: r.y + 226, w: 50, h: 34, label: l.toUpperCase(), main: ui.lang === l, size: 13, act: { do: "lang", lang: l } });
  });
  text(ctx, "Natural Earth · github.com/yahyaari/mare-nostrum", r.x + r.w / 2, r.y + r.h - 22, { size: 10, color: INK.faint, align: "center" });
}

function helpModal(ctx, cam, game, ui, boxes, T) {
  const W = Math.min(cam.w - 24, 520) - 64;
  const rows = T.helpLines.flatMap((s, n) => wrap(ctx, s, W, { size: 14 }).map((l, i) => [l, i === 0 ? n + 1 : null]));
  const r = modalFrame(ctx, cam, boxes, 90 + rows.length * 21 + 76, 520);
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

/** Bir mektubun yazıları: başlık, açıklama, seçeneklerin etiketleri. */
export function letterText(game, it, lang) {
  const T = TEXT[lang];
  const L = T.letters[it.key];
  const who = it.type === "offer" ? civName(it.civ, lang) : placeName(it.place, lang);
  const a = it.type === "offer" ? it.amount ?? "" : it.raiders ?? "";
  const b = it.type === "offer" ? N.offers.truce : it.bribe ?? "";
  return {
    title: fill(L.title, who, a, b),
    body: fill(L.body, who, a, b),
    options: letterOptions(game, it).map((o) => ({ ...o, label: fill(L[o.key], who, a, b) })),
  };
}

/** Olay ya da teklif: bir karar, kapatılamaz; seçenekler alt alta. */
function decideModal(ctx, cam, game, ui, boxes, T) {
  const it = game.inbox[0];
  if (!it) return;
  const L = letterText(game, it, ui.lang);
  const W = Math.min(cam.w - 24, 460);
  const body = wrap(ctx, L.body, W - 48, { size: 14 });
  const r = modalFrame(ctx, cam, boxes, 92 + body.length * 20 + L.options.length * 54 + 14, 460);
  if (it.type === "offer") {
    shield(ctx, it.civ, r.x + r.w / 2 - 10, r.y + 12, 20);
  }
  text(ctx, L.title, r.x + r.w / 2, r.y + (it.type === "offer" ? 58 : 44), { title: true, bold: true, size: 19, align: "center" });
  body.forEach((l, i) => text(ctx, l, r.x + r.w / 2, r.y + 84 + i * 20, { size: 14, align: "center", color: INK.soft, italic: true }));
  const by = r.y + 96 + body.length * 20;
  L.options.forEach((o, i) => {
    button(ctx, boxes, {
      x: r.x + 20, y: by + i * 54, w: r.w - 40, h: 44, label: o.label, size: 14, off: o.off, main: i === 0 && !o.off,
      act: { do: "decide", id: it.id, choice: o.key },
    });
  });
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
    const g = a.general ? `  ·  ★ ${a.general.name}` : "";
    text(ctx, placeName(a.at, ui.lang) + g, x + 30, y + 20, { bold: true, size: 15 });
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
  const ids = placesOf(game, game.player).sort((a, b) => (byId[b].capital ? 1 : 0) - (byId[a].capital ? 1 : 0) || game.places[b].pop - game.places[a].pop);
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
    const lo = pl.loyalty;
    const lc = lo < N.loyalty.revolt ? INK.bad : lo < N.loyalty.unrest ? INK.warn : INK.good;
    const pw = amount(ctx, "pop", `${pl.pop} / ${Math.round(popCap(pl, p.kind))}`, x, y + 40, { size: 13 });
    const gw = text(ctx, `·  ${fill(T.garrisonN, men(pl))}`, x + pw + 10, y + 40, { size: 13, color: INK.soft });
    text(ctx, `·  ${fill(T.loyaltyShort, lo)}`, x + pw + gw + 20, y + 40, { size: 13, bold: true, color: lc });
    const threat = menace(game, id);
    if (threat > 0) text(ctx, T.threatShort, right, y + 20, { bold: true, italic: true, size: 13, color: INK.bad, align: "right" });
    else if (blockaded(game, id)) text(ctx, T.blockadeNote, right, y + 20, { bold: true, italic: true, size: 12, color: INK.bad, align: "right" });
  });
  pager(ctx, boxes, r, r.y + 62 + pg.rows.length * rowH + 6, pg);
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

function overModal(ctx, cam, game, ui, boxes, T) {
  const won = game.over.result === "won";
  const r = modalFrame(ctx, cam, boxes, 210);
  text(ctx, won ? T.victory : T.defeat, r.x + r.w / 2, r.y + 56, { title: true, bold: true, size: 28, align: "center", color: won ? INK.good : INK.bad });
  text(ctx, fill(won ? T.victoryText : T.defeatText, game.over.turn), r.x + r.w / 2, r.y + 94, { size: 14, align: "center" });
  oneButton(ctx, boxes, r, { label: T.newGame, act: { do: "newGame" } });
}

