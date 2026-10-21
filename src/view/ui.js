// Arayüz: başlangıç ekranı, üst bant, kartlar ve pencereler. Hiçbir kuralı değiştirmez;
// her düğme bir `act` bırakır, main.js onu çalıştırır.
//
// `ui` görünüm durumu: { screen, lang, pick, saved, sel, modal, toast }.
//   sel:   { kind: "place" | "army", id }
//   modal: { kind: "attack" | "form" | "diplo" | "report" | "battle" | "menu" | "help" |
//            "confirm" | "over", ... }

import { CIVS } from "../data/world.js";
import { estimate } from "../rules/combat.js";
import { canDeclare, canPropose } from "../rules/diplomacy.js";
import { byId, neighbours, roadBetween } from "../rules/graph.js";
import { access, canAttack, defenders, hostile, menace, wallsOf } from "../rules/moves.js";
import { N, trait } from "../rules/numbers.js";
import {
  UPGRADES, armiesAt, armyById, budget, key, men, output, placesOf, popCap, recruitCost,
  recruitInfo, relation, strength, upgradeInfo,
} from "../rules/state.js";
import { TEXT, fill } from "../text.js";
import {
  INK, SERIF, amount, button, civName, colorOf, costLine, delta, fmt, icon, measure, panel, text, wrap,
} from "./kit.js";

const placeName = (id, lang) => byId[id].name[lang];
const narrowOf = (cam) => cam.w < 640;
export const topHeight = (cam) => (narrowOf(cam) ? 82 : 56);
const END = { w: 168, h: 50 };

export function drawUI(ctx, cam, game, ui, boxes) {
  const T = TEXT[ui.lang];
  if (ui.screen === "start") {
    drawStart(ctx, cam, ui, boxes, T);
  } else {
    drawTop(ctx, cam, game, ui, boxes, T);
    if (!game.over) {
      button(ctx, boxes, {
        x: cam.w - 12 - END.w, y: cam.h - 12 - END.h, w: END.w, h: END.h,
        label: T.endTurn, act: { do: "endTurn" }, main: true, size: 16,
      });
      // Hareketi kalan ordular: dar ekranda Turu bitir'in solunda, genişte üstünde.
      const ready = game.armies.filter((a) => a.owner === game.player && a.moves > 0).length;
      if (ready) {
        const nb = narrowOf(cam)
          ? { x: 12, y: cam.h - 12 - END.h, w: cam.w - 24 - END.w - 8, h: END.h }
          : { x: cam.w - 12 - END.w, y: cam.h - 12 - END.h - 8 - 40, w: END.w, h: 40 };
        button(ctx, boxes, { ...nb, label: fill(T.nextArmy, ready), size: 13, act: { do: "nextArmy" } });
      }
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
  ctx.fillStyle = "rgba(239,232,216,0.45)";
  ctx.fillRect(0, 0, cam.w, cam.h);
  const W = Math.min(cam.w - 24, 520);
  // Dar ekranda güçlü ve zayıf yan tek satıra sığmıyor: iki satır, daha yüksek satır.
  const twoLines = CIVS.some((c) => {
    const [good, bad] = T.traits[c.id];
    return measure(ctx, `▲ ${good}   ▼ ${bad}`, { size: 12, italic: true }) > W - 80;
  });
  const rowH = twoLines ? 66 : 52;
  const H = 104 + CIVS.length * rowH + 52 + 76 + (ui.saved ? 56 : 0);
  const x = Math.round((cam.w - W) / 2), y = Math.max(12, Math.round((cam.h - H) / 2));
  panel(ctx, x, y, W, H, boxes);
  text(ctx, T.title, x + W / 2, y + 42, { bold: true, size: 26, align: "center" });
  text(ctx, T.era, x + W / 2, y + 64, { italic: true, size: 14, color: INK.soft, align: "center" });
  text(ctx, T.chooseCiv, x + 22, y + 94, { bold: true, size: 13 });

  CIVS.forEach((c, i) => {
    const ry = y + 104 + i * rowH;
    const on = ui.pick === c.id;
    if (on) {
      ctx.fillStyle = INK.paper;
      ctx.fillRect(x + 12, ry + 2, W - 24, rowH - 4);
      ctx.strokeStyle = INK.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 13, ry + 3, W - 26, rowH - 6);
    }
    ctx.fillStyle = c.color;
    ctx.fillRect(x + 24, ry + 12, 18, 18);
    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + 24.5, ry + 12.5, 17, 17);
    text(ctx, c.name[ui.lang], x + 54, ry + 24, { bold: true, size: 16 });
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
// Üst bant

function drawTop(ctx, cam, game, ui, boxes, T) {
  const narrow = narrowOf(cam);
  const H = topHeight(cam);
  ctx.fillStyle = INK.card;
  ctx.fillRect(0, 0, cam.w, H);
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, H - 0.5);
  ctx.lineTo(cam.w, H - 0.5);
  ctx.moveTo(0, H - 4.5);
  ctx.lineTo(cam.w, H - 4.5);
  ctx.lineWidth = 0.75;
  ctx.stroke();
  boxes.push({ x: 0, y: 0, w: cam.w, h: H, act: null });

  const me = game.player;
  ctx.fillStyle = colorOf(me);
  ctx.fillRect(14, 12, 16, 16);
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(14.5, 12.5, 15, 15);
  text(ctx, civName(me, ui.lang), 38, 26, { bold: true, size: 16 });
  text(ctx, fill(T.turn, game.turn), 38, 44, { italic: true, size: 12, color: INK.soft });

  // Sağda: menü ve diplomasi
  const mw = 40, dw = narrow ? 96 : 120;
  button(ctx, boxes, { x: cam.w - 12 - mw, y: 9, w: mw, h: 34, label: "≡", size: 20, act: { do: "open", modal: "menu" } });
  button(ctx, boxes, { x: cam.w - 12 - mw - 8 - dw, y: 9, w: dw, h: 34, label: T.diplomacy, size: 13, act: { do: "open", modal: "diplo" } });

  // Kaynaklar: ambardaki ve turluk değişim
  const civ = game.civs[me], b = budget(game, me);
  for (const [k, have, d] of [["money", civ.money, b.money], ["weapons", civ.weapons, b.weapons], ["food", civ.food, b.food]]) {
    const c = chip(cam, k);
    const w = amount(ctx, k, fmt(have), c.x, c.y, { size: 16, bold: true });
    text(ctx, delta(d), c.x + w + 6, c.y, { size: 12, color: d < 0 ? INK.bad : INK.good, bold: true });
  }
}

/** Üst banttaki bir kaynağın yeri (yazının taban çizgisinin solu). */
function chip(cam, k) {
  const narrow = narrowOf(cam);
  const i = ["money", "weapons", "food"].indexOf(k);
  const step = narrow ? (cam.w - 28) / 3 : 130;
  return { x: (narrow ? 14 : 200) + i * step, y: narrow ? 70 : 34 };
}

/** Bir kaynağın değişimi yükselirken nereden çıksın: sayının hemen altı. */
export const chipRise = (cam, k) => {
  const c = chip(cam, k);
  return { x: c.x + 40, y: c.y + 32 };
};

// ---------------------------------------------------------------------------------------------
// Kartlar

/** Kartın sağ üst köşesinde kapatma düğmesi: telefonda kart haritanın yarısını kaplıyor. */
function closeX(ctx, boxes, r) {
  const s = 34, x = r.x + r.w - s - 6, y = r.y + 6;
  button(ctx, boxes, { x, y, w: s, h: s, label: "×", size: 20, act: { do: "deselect" } });
}

function cardRect(cam, h) {
  const narrow = narrowOf(cam);
  const w = narrow ? cam.w - 24 : 360;
  const bottom = narrow ? cam.h - 12 - END.h - 10 : cam.h - 12;
  return { x: 12, y: Math.max(topHeight(cam) + 8, bottom - h), w, h };
}

function kindLine(id, game, T) {
  const p = byId[id], pl = game.places[id];
  return [p.capital ? T.capital : null, p.kind === "castle" ? T.castle : T.city, p.port ? T.port : null]
    .filter(Boolean).join(" · ") + " · " + fill(T.lvl, pl.level);
}

function troops(T, u) {
  return `${u.inf} ${T.inf} · ${u.arch} ${T.arch}`;
}

function cityCard(ctx, cam, game, ui, boxes, T) {
  const id = ui.sel.id, pl = game.places[id], p = byId[id];
  const r = cardRect(cam, 418);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  closeX(ctx, boxes, r);
  const x = r.x + 18, right = r.x + r.w - 18;
  let y = r.y;

  text(ctx, p.name[ui.lang], x, y + 32, { bold: true, size: 20 });
  text(ctx, kindLine(id, game, T), x, y + 52, { italic: true, size: 13, color: INK.soft });

  const cap = popCap(pl, p.kind);
  amount(ctx, "pop", `${pl.pop} / ${Math.round(cap)}`, x, y + 80, { size: 14 });
  text(ctx, troops(T, pl), right, y + 80, { size: 13, align: "right" });

  const o = output(game, id);
  text(ctx, T.perTurn, x, y + 104, { italic: true, size: 12, color: INK.soft });
  let cx = x + measure(ctx, T.perTurn, { italic: true, size: 12 }) + 12;
  for (const k of ["money", "weapons", "food"]) cx += amount(ctx, k, delta(o[k]), cx, y + 104, { size: 13 }) + 14;

  rule(ctx, x, right, y + 116);

  // Dört yükseltme
  UPGRADES.forEach((what, i) => {
    const ry = y + 122 + i * 42;
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
  });

  rule(ctx, x, right, y + 292);

  // Asker basma
  const ri = recruitInfo(game, id, "inf"), ra = recruitInfo(game, id, "arch");
  text(ctx, T.recruit, x, y + 312, { bold: true, size: 13 });
  const why = ri.why && ri.why !== "done" ? whyText(ri.why, T) : fill(T.recruitLeft, ri.left);
  text(ctx, why, right, y + 312, { italic: true, size: 12, color: ri.why && ri.why !== "done" ? INK.bad : INK.soft, align: "right" });
  const bw = (r.w - 36 - 10) / 2;
  for (const [i, type, info, label] of [[0, "inf", ri, T.addInf], [1, "arch", ra, T.addArch]]) {
    button(ctx, boxes, {
      x: x + i * (bw + 10), y: y + 320, w: bw, h: 46, label, size: 13, off: !!info.why,
      act: { do: "recruit", id, type },
      sub: (cx2, cy2, color) => costLine(ctx, recruitCost(game.player, type), cx2, cy2 + 2, color),
    });
  }

  button(ctx, boxes, {
    x, y: y + 374, w: r.w - 36, h: 32, label: T.formArmy, size: 13,
    off: men(pl) === 0, act: { do: "formOpen", id },
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
  if (what === "industry") return fill(T.industryFx, r1(castle * trait(c, "weapons")));
  return fill(T.barracksFx, pl.barracks + 1) + (pl.barracks + 1 === 2 ? " · " + T.barracksArch : "");
}

function rule(ctx, x1, x2, y) {
  ctx.strokeStyle = INK.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y + 0.5);
  ctx.lineTo(x2, y + 0.5);
  ctx.stroke();
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
  const r = cardRect(cam, h);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  closeX(ctx, boxes, r);
  const x = r.x + 18, right = r.x + r.w - 18;
  const y = r.y;

  text(ctx, p.name[ui.lang], x, y + 32, { bold: true, size: 20 });
  ctx.fillStyle = colorOf(pl.owner);
  ctx.fillRect(x, y + 43, 12, 12);
  ctx.strokeStyle = INK.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 43.5, 11, 11);
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
    const e = estimate({ civ: me, inf: army.inf, arch: army.arch }, d, walls);
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
  const h = 116 + (a.route.length ? 20 : 0) + hint.length * 16 + (mine ? 52 : 0);
  const r = cardRect(cam, h);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  closeX(ctx, boxes, r);
  const x = r.x + 18;
  let y = r.y + 32;

  ctx.fillStyle = colorOf(a.owner);
  ctx.fillRect(x, y - 14, 16, 16);
  ctx.strokeStyle = INK.ink;
  ctx.strokeRect(x + 0.5, y - 13.5, 15, 15);
  text(ctx, `${T.army} · ${civName(a.owner, ui.lang)}`, x + 24, y, { bold: true, size: 18 });
  y += 26;
  text(ctx, troops(T, a), x, y, { size: 14 });
  y += 22;
  text(ctx, `${fill(T.moves, a.moves, trait(a.owner, "moves"))} · ${placeName(a.at, ui.lang)}`, x, y, { size: 13, color: INK.soft });
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
    const bw = acts.length ? Math.min(140, (r.w - 36 - (acts.length - 1) * 8) / acts.length) : 0;
    acts.forEach(([label, act], i) => button(ctx, boxes, { x: x + i * (bw + 8), y: r.y + r.h - 46, w: bw, h: 32, label, act, size: 13 }));
  }
}

function drawToast(ctx, cam, s) {
  ctx.font = `bold 14px ${SERIF}`;
  const w = Math.min(cam.w - 24, ctx.measureText(s).width + 36);
  const x = (cam.w - w) / 2, y = cam.h - 12 - END.h - 56;
  ctx.fillStyle = INK.ink;
  ctx.fillRect(x, y, w, 40);
  text(ctx, s, cam.w / 2, y + 21, { bold: true, size: 14, color: INK.card, align: "center", base: "middle" });
}

// ---------------------------------------------------------------------------------------------
// Pencereler

function modalFrame(ctx, cam, boxes, h, wMax = 440) {
  ctx.fillStyle = "rgba(43,42,39,0.35)";
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
  const e = estimate({ civ: a.owner, inf: a.inf, arch: a.arch }, d, walls);
  const r = modalFrame(ctx, cam, boxes, 290);
  const x = r.x + 22;
  text(ctx, fill(T.attackQ, placeName(m.id, ui.lang)), r.x + r.w / 2, r.y + 40, { bold: true, size: 20, align: "center" });
  text(ctx, T.yours, x, r.y + 76, { bold: true, size: 13 });
  text(ctx, troops(T, a), x, r.y + 96, { size: 13 });
  text(ctx, T.defenders, x, r.y + 124, { bold: true, size: 13 });
  text(ctx, men(d) ? troops(T, d) : T.undefended, x, r.y + 144, { size: 13 });
  text(ctx, `${T.walls}: ${walls === "castle" ? T.wallsCastle : walls === "city" ? T.wallsCity : T.wallsNone}`, x, r.y + 166, { size: 13, color: INK.soft });
  const [label, color] = oddsLabel(e.odds, T);
  const ow = text(ctx, `${T.odds}: `, x, r.y + 196, { size: 15 });
  text(ctx, label, x + ow, r.y + 196, { size: 15, bold: true, color });
  text(ctx, fill(T.expect, e.lost, e.killed), x, r.y + 216, { size: 12, italic: true, color: INK.soft });
  twoButtons(ctx, boxes, r, { label: T.attack, act: { do: "attack" } }, { label: T.cancel, act: { do: "close" } });
}

function formModal(ctx, cam, game, ui, boxes, T, m) {
  const pl = game.places[m.id];
  const r = modalFrame(ctx, cam, boxes, 250);
  const x = r.x + 22, right = r.x + r.w - 22;
  text(ctx, `${T.formArmy} · ${placeName(m.id, ui.lang)}`, r.x + r.w / 2, r.y + 40, { bold: true, size: 19, align: "center" });
  [["inf", T.inf], ["arch", T.arch]].forEach(([type, label], i) => {
    const y = r.y + 64 + i * 52;
    const max = pl[type];
    text(ctx, label[0].toLocaleUpperCase(ui.lang) + label.slice(1), x, y + 26, { bold: true, size: 14 });
    const bx = right - 210;
    button(ctx, boxes, { x: bx, y, w: 40, h: 38, label: "−", size: 18, off: m[type] <= 0, act: { do: "formStep", type, by: -N.company } });
    text(ctx, `${m[type]} / ${max}`, bx + 80, y + 25, { bold: true, size: 14, align: "center" });
    button(ctx, boxes, { x: bx + 120, y, w: 40, h: 38, label: "+", size: 18, off: m[type] >= max, act: { do: "formStep", type, by: N.company } });
    button(ctx, boxes, { x: bx + 166, y, w: 44, h: 38, label: T.all, size: 11, off: m[type] >= max, act: { do: "formStep", type, by: Infinity } });
  });
  twoButtons(ctx, boxes, r, { label: T.march, act: { do: "formOk" }, off: m.inf + m.arch <= 0 }, { label: T.cancel, act: { do: "close" } });
}

function diploModal(ctx, cam, game, ui, boxes, T) {
  const me = game.player;
  const others = CIVS.filter((c) => c.id !== me);
  const rowH = 56;
  const r = modalFrame(ctx, cam, boxes, 84 + others.length * rowH + 70, 560);
  text(ctx, T.diplomacy, r.x + r.w / 2, r.y + 40, { bold: true, size: 20, align: "center" });
  const narrow = r.w < 460;
  others.forEach((c, i) => {
    const y = r.y + 62 + i * rowH;
    const x = r.x + 18;
    const alive = game.civs[c.id].alive;
    ctx.fillStyle = c.color;
    ctx.fillRect(x, y + 10, 14, 14);
    ctx.strokeStyle = INK.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 10.5, 13, 13);
    text(ctx, c.name[ui.lang], x + 22, y + 22, { bold: true, size: 14, color: alive ? INK.ink : INK.faint });
    if (!alive) {
      text(ctx, fill(T.evFallen, ""), x + 22, y + 40, { italic: true, size: 12, color: INK.faint });
      return;
    }
    const rel = relation(game, me, c.id);
    const [label, color] = rel === "war" ? [T.war, INK.bad] : rel === "ally" ? [T.ally, INK.good] : [T.neutral, INK.soft];
    const info = `${label} · ${fill(T.soldiers, strength(game, c.id))}` + (narrow ? "" : ` · ${fill(T.placesN, placesOf(game, c.id).length)}`);
    text(ctx, info, x + 22, y + 40, { italic: true, size: 12, color });

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
  const shown = rows.slice(0, 14);
  const r = modalFrame(ctx, cam, boxes, 96 + shown.length * 22 + 70, 460);
  text(ctx, fill(T.turn, game.turn), r.x + r.w / 2, r.y + 40, { bold: true, size: 20, align: "center" });
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
  const r = modalFrame(ctx, cam, boxes, 190);
  text(ctx, e.won ? fill(T.won, where) : fill(T.lost, where), r.x + r.w / 2, r.y + 50, {
    bold: true, size: 19, align: "center", color: e.won ? INK.good : INK.bad,
  });
  text(ctx, fill(T.losses, lost), r.x + r.w / 2, r.y + 84, { size: 14, align: "center" });
  if (e.fallen) text(ctx, fill(T.evFallen, civName(e.fallen, ui.lang)), r.x + r.w / 2, r.y + 106, { size: 14, bold: true, align: "center" });
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

function menuModal(ctx, cam, game, ui, boxes, T) {
  const r = modalFrame(ctx, cam, boxes, 316, 360);
  text(ctx, T.menu, r.x + r.w / 2, r.y + 40, { bold: true, size: 20, align: "center" });
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
  text(ctx, T.help, r.x + r.w / 2, r.y + 40, { bold: true, size: 20, align: "center" });
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

function overModal(ctx, cam, game, ui, boxes, T) {
  const won = game.over.result === "won";
  const r = modalFrame(ctx, cam, boxes, 210);
  text(ctx, won ? T.victory : T.defeat, r.x + r.w / 2, r.y + 56, { bold: true, size: 28, align: "center", color: won ? INK.good : INK.bad });
  text(ctx, fill(won ? T.victoryText : T.defeatText, game.over.turn), r.x + r.w / 2, r.y + 94, { size: 14, align: "center" });
  oneButton(ctx, boxes, r, { label: T.newGame, act: { do: "newGame" } });
}

