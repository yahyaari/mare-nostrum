// Arayüz: başlangıç ekranı, üst bant, kartlar ve pencereler. Hiçbir kuralı değiştirmez;
// her düğme bir `act` bırakır, main.js onu çalıştırır.
//
// `ui` görünüm durumu: { screen, lang, pick, saved, sel, modal, toast }.
//   sel:   { kind: "place" | "army", id }
//   modal: { kind: "attack" | "form" | "diplo" | "report" | "battle" | "menu" | "help" |
//            "confirm" | "over", ... }
//   army:  oyuncu bir yabancı yere bakarken son seçtiği kendi ordusu (kartta saldırı tahmini için)
//   news:  { lines, since } tur sonunda sağ üstte beliren haberler (pencere açmadan)
//   tip:   { lines, since } farenin altındaki şeyin açıklaması

import { CIVS, PLACES } from "../data/world.js";
import { canDeclare, canPropose } from "../rules/diplomacy.js";
import { byId, neighbours, roadBetween } from "../rules/graph.js";
import { access, canAttack, defenders, forecast, fortOf, hostile, menace, shipsAt, terrainOf, wallsOf } from "../rules/moves.js";
import { N, UNITS, trait } from "../rules/numbers.js";
import {
  PORT_UPGRADES, UPGRADES, armiesAt, buildersOf, armyById, besieged, blockaded, budget, canSail, gamesInfo, key, men, output, placesOf, popCap, recruitCost, shipInfo,
  recruitInfo, relation, strength, upgradeInfo,
} from "../rules/state.js";
import { TEXT, fill } from "../text.js";
import { drift } from "../rules/loyalty.js";
import { appointInfo } from "../rules/generals.js";
import { options as letterOptions } from "../rules/events.js";
import { progress as missionProgress, turnsLeft } from "../rules/missions.js";
import {
  INK, SERIF, TAU, amount, button, civName, colorOf, costLine, delta, fmt, icon, measure, over, panel, pointer, text, wrap,
} from "./kit.js";
import { BOTTOM_H, RIGHT_W, TOP, drawBottomBar, drawRightColumn, drawTopBar, hanging, medal } from "./hud.js";
import { CREAM, DARK, GOLD, GOLD_DARK, GOLD_LIGHT, roundRect, shield, soldier, wonderMark } from "./pieces.js";
import { wonderAt } from "../rules/wonders.js";
import { musicEnabled, soundEnabled } from "./sound.js";
import { sight } from "../rules/sight.js";
import { canBesiege, siegeRate, turnsToFall } from "../rules/siege.js";
import { drawBattle, trooper } from "./battle.js";
import { drawVignette, placeOnScreen } from "./draw.js";
import { toScreen } from "./camera.js";
import { SIZE } from "../geo.js";

const placeName = (id, lang) => byId[id].name[lang];

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
      card = game.places[ui.sel.id].owner === game.player ? cityCard(ctx, cam, game, ui, boxes, T) : placeCard(ctx, cam, game, ui, boxes, T);
    } else if (ui.sel?.kind === "army" && armyById(game, ui.sel.id)) {
      card = armyCard(ctx, cam, game, ui, boxes, T);
    }
    if (!game.over && !card) drawBottomBar(ctx, cam, game, ui, boxes, T);
    if (ui.news && !ui.modal) drawNews(ctx, cam, ui, boxes, T);
    drawCoach(ctx, cam, game, ui, boxes, T);
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
// Başlangıç: medeniyet seçimi
//
// Mount & Blade Bannerlord'un kültür seçimi gibi (kullanıcı 22.10): solda medeniyetlerin
// sancakları alt alta, sağda TEK medeniyetin paneli - görseli (başkenti kendi arazisinde, önünde
// kendi askerleri), adı, tarihçesi, güçlü ve zayıf yanı, başlangıç toprakları. ‹ › (ya da
// klavyede ← →) ile geçilir; arkada harita o medeniyetin topraklarına kayar (main.js showCiv).

/** Başlangıç ekranının parçaları: main.js haritayı `map` alanının ortasına kaydırır. */
export function startLayout(cam) {
  const listW = 250;
  const w = Math.round(Math.min(540, Math.max(410, cam.w * 0.36)));
  const panel = { x: cam.w - 24 - w, y: 56, w, h: cam.h - 56 - 18 };
  return { list: { x: 0, y: 0, w: listW, h: cam.h }, panel, map: { x: listW + 20, y: 60, w: panel.x - listW - 40, h: cam.h - 80 } };
}

/** Görseldeki askerler: medeniyetin kendi gücü (Roma lejyonu, Partların atlı okçusu...). */
const SIGNATURE = {
  rome: ["inf", "inf", "inf", "inf", "inf", "inf"],
  carthage: ["inf", "arch", "cav", "cav", "arch", "inf"],
  egypt: ["arch", "inf", "inf", "inf", "inf", "arch"],
  macedon: ["inf", "inf", "inf", "inf", "inf", "inf"],
  parthia: ["arch", "cav", "arch", "arch", "cav", "arch"],
  gaul: ["inf", "inf", "cav", "cav", "inf", "inf"],
  saka: ["cav", "cav", "cav", "cav"],
};

function drawStart(ctx, cam, ui, boxes, T) {
  const L = startLayout(cam);
  const civ = CIVS.find((c) => c.id === ui.pick) ?? CIVS[0];
  // Solda koyu şerit (sancaklar okunsun), sağda panelin arkası hafif koyu; ortada harita açık.
  let g = ctx.createLinearGradient(0, 0, L.list.w + 140, 0);
  g.addColorStop(0, "rgba(12,9,6,0.85)");
  g.addColorStop(0.6, "rgba(12,9,6,0.6)");
  g.addColorStop(1, "rgba(12,9,6,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.list.w + 140, cam.h);
  g = ctx.createLinearGradient(L.panel.x - 90, 0, cam.w, 0);
  g.addColorStop(0, "rgba(12,9,6,0)");
  g.addColorStop(1, "rgba(12,9,6,0.5)");
  ctx.fillStyle = g;
  ctx.fillRect(L.panel.x - 90, 0, cam.w - L.panel.x + 90, cam.h);
  boxes.push({ x: 0, y: 0, w: L.list.w, h: cam.h, act: null });
  // Kenardaki medeniyette (Partlar) kamera haritanın kenarını geçer: verinin bittiği yerin
  // ötesi düz gri görünmesin, koyu bir örtüyle kapanır.
  for (const [mx, d] of [[SIZE.x + 2.6, 1], [-2.6, -1]]) {
    const ex = toScreen(cam, mx, 0).x;
    if (d > 0 ? ex >= cam.w : ex <= 0) continue;
    const eg = ctx.createLinearGradient(ex - d * 60, 0, ex + d * 8, 0);
    eg.addColorStop(0, "rgba(12,9,6,0)");
    eg.addColorStop(1, "rgba(12,9,6,0.95)");
    ctx.fillStyle = eg;
    if (d > 0) ctx.fillRect(ex - 60, 0, cam.w - ex + 60, cam.h);
    else ctx.fillRect(0, 0, ex + 60, cam.h);
  }

  // Oyunun adı
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 8;
  text(ctx, T.title, 28, 50, { title: true, bold: true, size: 30, color: CREAM });
  ctx.restore();
  text(ctx, `${T.era} · ${T.chooseCiv}`, 30, 74, { italic: true, size: 14, color: GOLD_LIGHT });

  // Sancaklar: seçili olan öne çıkar, altın şeritle işaretlenir.
  const step = Math.min(92, (cam.h - 96 - 16) / CIVS.length);
  const top = Math.max(96, Math.round((cam.h - step * CIVS.length) / 2 + 24));
  CIVS.forEach((c, i) => {
    const y = top + i * step, on = c.id === civ.id;
    const hot = over(0, y, L.list.w, step);
    if (on || hot) {
      const hg = ctx.createLinearGradient(0, 0, L.list.w, 0);
      hg.addColorStop(0, on ? "rgba(201,164,90,0.38)" : "rgba(201,164,90,0.16)");
      hg.addColorStop(1, "rgba(201,164,90,0)");
      ctx.fillStyle = hg;
      ctx.fillRect(0, y + 4, L.list.w, step - 8);
      if (on) { ctx.fillStyle = GOLD_LIGHT; ctx.fillRect(0, y + 4, 4, step - 8); }
    }
    const bw = Math.min(44, step * 0.52), bh = bw * 1.38;
    const bx = on ? 36 : 26;
    ctx.globalAlpha = on || hot ? 1 : 0.78;
    hanging(ctx, c.id, bx, y + (step - bh) / 2, bw, bh);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 6;
    text(ctx, c.name[ui.lang].toLocaleUpperCase(ui.lang === "tr" ? "tr" : "en"), bx + bw + 16, y + step / 2 + 6, { title: true, bold: true, size: on ? 18 : 15, color: on ? GOLD_LIGHT : CREAM });
    ctx.restore();
    ctx.globalAlpha = 1;
    boxes.push({ x: 0, y, w: L.list.w, h: step, act: { do: "pick", civ: c.id } });
  });

  civPanel(ctx, ui, boxes, T, civ, L.panel);
  langToggle(ctx, cam, ui, boxes, 12);
}

/**
 * Sağdaki panel: tek medeniyet. İçeriği kadar uzun ve ayrılan yerde dikeyde ortalı; üst kısmı
 * medeniyet değişince kayarak gelir.
 */
function civPanel(ctx, ui, boxes, T, civ, area) {
  const x = area.x + 24, w = area.w - 48, cx = area.x + area.w / 2;
  const [good, bad] = T.traits[civ.id];
  const desc = wrap(ctx, T.civDesc[civ.id], w, { size: 14 });
  const lands = PLACES.filter((p) => p.owner === civ.id).sort((a, b) => (b.capital ? 1 : 0) - (a.capital ? 1 : 0)).map((p) => p.name[ui.lang] + (p.capital ? ` (${T.capital.toLocaleLowerCase(ui.lang)})` : "")).join(" · ");
  const landRows = wrap(ctx, fill(T.startLands, lands), w, { italic: true, size: 12 });
  // Alttaki sabit kısım (gezinme, zorluk, başla, devam) ve metin; görsel kalan yeri alır.
  const bottomH = 40 + 14 + 36 + 14 + 48 + (ui.saved ? 54 : 0) + 18;
  const textH = 44 + 20 + 18 + desc.length * 19 + 14 + 44 + landRows.length * 16 + 10;
  const illH = Math.round(Math.max(110, Math.min(300, area.h * 0.32, area.h - 20 - bottomH - textH)));
  const h = 20 + illH + textH + bottomH;
  const r = { x: area.x, y: area.y + Math.max(0, Math.round((area.h - h) / 2)), w: area.w, h: Math.min(area.h, h) };
  panel(ctx, r.x, r.y, r.w, r.h, boxes);

  // Medeniyet değişince içerik sağdan kayarak, saydamdan belirir.
  const t = Math.min(1, (performance.now() - (ui.pickAt ?? 0)) / 300), e = 1 - (1 - t) ** 3;
  ctx.save();
  ctx.globalAlpha = e;
  ctx.translate((1 - e) * 28, 0);
  illustration(ctx, civ.id, { x: r.x + 10, y: r.y + 10, w: r.w - 20, h: illH });
  let y = r.y + 10 + illH + 42;
  text(ctx, civ.name[ui.lang], cx, y, { title: true, bold: true, size: 28, align: "center" });
  y += 22;
  text(ctx, T.civSub[civ.id], cx, y, { italic: true, size: 14, color: INK.soft, align: "center" });
  y += 14;
  ornament(ctx, cx, y, 180);
  y += 24;
  desc.forEach((l, i) => text(ctx, l, x, y + i * 19, { size: 14 }));
  y += desc.length * 19 + 10;
  text(ctx, "▲ " + good, x, y, { bold: true, size: 14, color: INK.good });
  text(ctx, "▼ " + bad, x, y + 22, { bold: true, size: 14, color: INK.bad });
  y += 44;
  landRows.forEach((l, i) => text(ctx, l, x, y + i * 16, { italic: true, size: 12, color: INK.soft }));
  ctx.restore();

  // Gezinme: ‹ noktalar ›
  let by = r.y + r.h - bottomH + 4;
  const i = CIVS.findIndex((c) => c.id === civ.id), n = CIVS.length;
  button(ctx, boxes, { x, y: by, w: 46, h: 36, label: "‹", size: 22, act: { do: "pick", civ: CIVS[(i + n - 1) % n].id }, tip: [CIVS[(i + n - 1) % n].name[ui.lang]] });
  button(ctx, boxes, { x: x + w - 46, y: by, w: 46, h: 36, label: "›", size: 22, act: { do: "pick", civ: CIVS[(i + 1) % n].id }, tip: [CIVS[(i + 1) % n].name[ui.lang]] });
  const gap = Math.min(30, (w - 120) / n);
  CIVS.forEach((c, j) => {
    const dx = cx + (j - (n - 1) / 2) * gap, dy = by + 18, on = j === i;
    ctx.beginPath();
    ctx.arc(dx, dy, on ? 7 : 5, 0, TAU);
    ctx.fillStyle = colorOf(c.id);
    ctx.fill();
    ctx.strokeStyle = on ? GOLD_DARK : "rgba(43,33,24,0.5)";
    ctx.lineWidth = on ? 2 : 1;
    ctx.stroke();
    boxes.push({ x: dx - gap / 2, y: by, w: gap, h: 36, act: { do: "pick", civ: c.id }, tip: [c.name[ui.lang]] });
  });
  by += 36 + 14;

  // Zorluk
  text(ctx, T.difficulty, x, by + 23, { bold: true, size: 13 });
  const lw = Math.min(104, (w - 110) / 3);
  [["easy", T.lvEasy], ["normal", T.lvNormal], ["hard", T.lvHard]].forEach(([lv, label], k) => {
    button(ctx, boxes, { x: x + w - (3 - k) * (lw + 6) + 6, y: by, w: lw, h: 36, label, size: 13, main: ui.level === lv, act: { do: "level", level: lv } });
  });
  by += 36 + 14;

  button(ctx, boxes, { x, y: by, w, h: 48, main: true, size: 17, label: `${T.start} · ${civ.name[ui.lang]}`, act: { do: "start" } });
  if (ui.saved) {
    const c = CIVS.find((cc) => cc.id === ui.saved.player);
    button(ctx, boxes, { x, y: by + 56, w, h: 44, size: 14, label: `${T.cont} · ${fill(T.contInfo, c.name[ui.lang], ui.saved.turn)}`, act: { do: "continue" } });
  }
}

/**
 * Medeniyetin görseli: başkenti kendi arazisinde (kartlardaki manzara), iki yanında kendi
 * askerleri sancağa dönük dizilmiş.
 */
function illustration(ctx, civ, r) {
  const cap = PLACES.find((p) => p.owner === civ && p.capital);
  const z = Math.max(2.4, r.h / 75);
  drawVignette(ctx, cap.id, civ, r, 3, z);
  const figs = SIGNATURE[civ];
  const s = Math.max(1.4, Math.min(3.2, r.h / 92));
  const half = Math.ceil(figs.length / 2);
  // Askerler şehrin iki yanında, maketin üstüne binmeden (maket yaklaşık 22 x z yarım genişlikte).
  const gap = Math.max(14 * s, Math.min(34 * s, (r.w / 2 - 34 - 22 * z) / half));
  const base = r.y + r.h - 10;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  figs.forEach((k, i) => {
    const left = i < half, j = left ? i : i - half;
    const x = left ? r.x + 26 + j * gap + (k === "cav" ? 10 * s : 0) : r.x + r.w - 26 - j * gap - (k === "cav" ? 10 * s : 0);
    // Soldakiler sağa (side -1), sağdakiler sola (side 1) bakar: ortadaki şehre.
    trooper(ctx, k, civ, x, base - (j % 2) * 5 * s, left ? -1 : 1, s);
  });
  ctx.restore();
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
// "şehir yükseltmeleri aşağıda ortada çıksın, ekranın solunda istemiyorum"). Kart açıkken alttaki
// menü (Ordu, Şehirler...) gizlenir: yeri kartın. Sütunlar soldan sağa okunur; ekran genişse en
// solda yerin manzarası.

/** En yüksek kartın boyu: main.js seçilen yeri bunun üstüne kaydırır. */
export const CARD_H = 256;
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

/** Sığmazsa küçülen, yine sığmazsa kısalan tek satır. */
function fit(ctx, s, x, y, w, o) {
  let size = o.size ?? 13;
  if (measure(ctx, s, { ...o, size }) > w) size = Math.max(10, size - 1.5);
  while (s.length > 4 && measure(ctx, s, { ...o, size }) > w) s = s.slice(0, -2) + "…";
  return text(ctx, s, x, y, { ...o, size });
}

function kindLine(id, game, T, hid = false) {
  const p = byId[id], pl = game.places[id];
  return [p.capital ? T.capital : null, p.kind === "castle" ? T.castle : T.city, p.port ? T.port : null]
    .filter(Boolean).join(" · ") + " · " + fill(T.lvl, pl.level) + (pl.ships && !hid ? ` · ${pl.ships} ${T.ships}` : "");
}

/** "120 piyade · 40 okçu · 20 süvari": piyade ve okçu hep, ötekiler varsa. */
function troops(T, u) {
  return UNITS.filter((k) => k === "inf" || k === "arch" || u[k] > 0).map((k) => `${u[k] ?? 0} ${T[k]}`).join(" · ");
}

function whyText(why, T) {
  return T["why" + why[0].toUpperCase() + why.slice(1)] ?? why;
}

const UNIT_TIP = { inf: "tipInf", arch: "tipArch", cav: "tipCav", siege: "tipSiege" };

/**
 * Kendi şehrinin kartı, üç sütun: şehir (nüfus, garnizon, üretim, sadakat, Ordu çıkar) |
 * yükseltmeler (limanda Şehir / Liman sekmeli) | asker bas ya da (Liman sekmesinde) gemi yap.
 */
function cityCard(ctx, cam, game, ui, boxes, T) {
  const id = ui.sel.id, pl = game.places[id], p = byId[id];
  const tab = p.port && ui.cardTab === "port" ? "port" : "city";
  const wonder = wonderAt(id);
  const A = 214, B = 300, C = 230;
  const body = A + GAP + B + GAP + C + PAD;
  const V = vignetteWidth(cam, PAD + body, 128);
  const left = V ? 8 + V + GAP : PAD;
  const r = cardRect(cam, left + body, 238 + (wonder ? 18 : 0));
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  if (V) drawVignette(ctx, id, pl.owner, { x: r.x + 8, y: r.y + 8, w: V, h: r.h - 16 }, pl.level);
  const y = r.y, H = r.h;
  let x = r.x + left;

  // Şehir: ad, türü, (harika), nüfus, garnizon, turluk üretim, sadakat; altta Ordu çıkar.
  text(ctx, p.name[ui.lang], x, y + 32, { title: true, bold: true, size: 19 });
  fit(ctx, kindLine(id, game, T, true), x, y + 50, A, { italic: true, size: 12, color: INK.soft });
  let ay = y + 72;
  if (wonder) {
    wonderLine(ctx, id, T, x, ay - 2, A);
    ay += 18;
  }
  const pw = amount(ctx, "pop", `${pl.pop} / ${Math.round(popCap(pl, p.kind))}`, x, ay, { size: 13 });
  const note = besieged(game, id) ? T.besiegedNote : blockaded(game, id) ? T.blockadeNote : null;
  if (note) fit(ctx, note, x + pw + 10, ay, A - pw - 10, { italic: true, bold: true, size: 11, color: INK.bad });
  const gl = lines(ctx, `${T.garrison}: ${troops(T, pl)}`, x, ay + 20, A, { size: 13 }, 2, 16);
  ay += 20 + gl * 16 + 4;
  const o = output(game, id);
  let cx = x;
  for (const k of ["money", "weapons", "food"]) cx += amount(ctx, k, delta(o[k]), cx, ay, { size: 13 }) + 12;
  loyaltyRow(ctx, game, boxes, T, id, x, ay + 12, A);
  button(ctx, boxes, {
    x, y: y + H - 44, w: A, h: 32, label: T.formArmy, main: true, size: 14,
    off: men(pl) === 0 && !pl.ships, act: { do: "formOpen", id }, tip: [T.formArmy, T.tipForm],
  });

  // Yükseltmeler: limanda iki sekme.
  x += A + GAP;
  vrule(ctx, x - GAP / 2, y + 14, y + H - 14);
  let by = y + 14;
  buildersRow(ctx, game, boxes, T, id, x, by, B);
  by += 26;
  if (p.port) {
    const tw = (B - 8) / 2;
    [["city", T.tabCity], ["port", "⚓ " + T.tabPort]].forEach(([k, label], i) => {
      button(ctx, boxes, { x: x + i * (tw + 8), y: by, w: tw, h: 28, label, size: 13, main: tab === k, act: { do: "cardTab", tab: k } });
    });
    by += 36;
  }
  (tab === "port" ? PORT_UPGRADES : UPGRADES).forEach((what, i) => upgradeRow(ctx, game, boxes, T, id, what, x, x + B, by + i * 40));

  // Asker bas ya da gemi yap.
  x += B + GAP;
  vrule(ctx, x - GAP / 2, y + 14, y + H - 14);
  if (tab === "port") fleetBlock(ctx, game, boxes, T, id, x, y, C, H);
  else recruitBlock(ctx, game, boxes, T, id, x, y, C);
  closeX(ctx, boxes, r);
  return r;
}

/** Sadakat: değer, bu turki değişim, çubuk, Oyunlar düğmesi. */
function loyaltyRow(ctx, game, boxes, T, id, x, y, w) {
  const pl = game.places[id];
  const lo = pl.loyalty, dr = drift(game, id).total;
  const color = lo < N.loyalty.revolt ? INK.bad : lo < N.loyalty.unrest ? INK.warn : INK.good;
  const gi = gamesInfo(game, id);
  const gw = gi.why === "max" ? 0 : 84;
  const lw = text(ctx, `${T.loyalty}  ${lo}`, x, y + 14, { bold: true, size: 13 });
  text(ctx, delta(dr), x + lw + 8, y + 14, { size: 12, bold: true, color: dr < 0 ? INK.bad : INK.good });
  const bw = w - gw - (gw ? 10 : 0);
  ctx.fillStyle = "rgba(90,70,40,0.18)";
  ctx.fillRect(x, y + 21, bw, 7);
  ctx.fillStyle = color;
  ctx.fillRect(x, y + 21, (bw * lo) / 100, 7);
  ctx.strokeStyle = "#5a4630";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 21.5, bw - 1, 6);
  if (!gw) return;
  const gx = x + w - gw, gy = y;
  button(ctx, boxes, { x: gx, y: gy, w: gw, h: 30, label: "", off: !!gi.why, act: { do: "games", id }, tip: [T.games, T.tipGames, gi.why ? [whyText(gi.why, T), "bad"] : null] });
  const c = gi.why ? INK.faint : INK.ink;
  const tw = measure(ctx, T.games, { bold: true, size: 12 });
  text(ctx, T.games, gx + 7, gy + 20, { bold: true, size: 12, color: c });
  amount(ctx, "money", gi.cost, gx + 12 + tw, gy + 20, { size: 12, bold: true, color: c });
}

/**
 * İnşaatçılar: her biri bir yuvarlak - çalışan dolu (çekiçli), boştaki halka; sağda kaçı boşta.
 */
function buildersRow(ctx, game, boxes, T, id, x, y, w) {
  const n = buildersOf(id), busy = game.places[id].builds.length, free = n - busy;
  const lw = text(ctx, T.builders, x, y + 15, { bold: true, size: 13 });
  for (let i = 0; i < n; i++) {
    const cx = x + lw + 16 + i * 20, cy = y + 10;
    ctx.beginPath();
    ctx.arc(cx, cy, 7.5, 0, TAU);
    if (i < busy) {
      ctx.fillStyle = GOLD_DARK;
      ctx.fill();
      hammer(ctx, cx, cy, CREAM);
    } else {
      ctx.strokeStyle = GOLD_DARK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  text(ctx, free ? fill(T.buildersFree, free) : T.buildersBusy, x + w, y + 15, { italic: true, size: 12, color: free ? INK.good : INK.faint, align: "right" });
  boxes.push({ x, y, w, h: 22, act: null, tip: [T.builders, fill(T.tipBuilders, n)] });
}

/** Küçük bir çekiç: sap ve baş. */
function hammer(ctx, cx, cy, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.75);
  ctx.fillStyle = color;
  ctx.fillRect(-0.9, -2, 1.8, 7);
  ctx.fillRect(-3.6, -4.5, 7.2, 3);
  ctx.restore();
}

/** Tur sayısı: "1 tur" / "3 tur". */
const turnsText = (n, T) => (n === 1 ? T.turnsOne : fill(T.turnsN, n));

/**
 * Bir yükseltme satırı: ad, seviye, etkisi ve süresi ya da neden olmadığı, fiyatlı düğme.
 * İnşa ediliyorsa: kalan tur, tur tur dolan çubuk, İptal.
 */
function upgradeRow(ctx, game, boxes, T, id, what, x, right, ry) {
  const u = upgradeInfo(game, id, what);
  const bw = 88;
  const b = u.building;
  if (b) {
    const nw = text(ctx, `${T[what]}  ${u.now} → ${u.now + 1}`, x, ry + 15, { bold: true, size: 13 });
    fit(ctx, b.left === 1 ? T.buildLeftOne : fill(T.buildLeft, b.left), x + nw + 8, ry + 15, right - x - bw - nw - 16, { italic: true, bold: true, size: 12, color: INK.warn });
    const pw = right - x - bw - 10;
    ctx.fillStyle = "rgba(90,70,40,0.18)";
    ctx.fillRect(x, ry + 23, pw, 7);
    ctx.fillStyle = INK.warn;
    ctx.fillRect(x, ry + 23, (pw * (b.total - b.left)) / b.total, 7);
    ctx.strokeStyle = "#5a4630";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, ry + 23.5, pw - 1, 6);
    ctx.beginPath();
    for (let k = 1; k < b.total; k++) { const tx = Math.round(x + (pw * k) / b.total) + 0.5; ctx.moveTo(tx, ry + 23); ctx.lineTo(tx, ry + 30); }
    ctx.stroke();
    button(ctx, boxes, { x: right - bw, y: ry + 3, w: bw, h: 30, label: T.cancelBuild, size: 12, act: { do: "cancelBuild", id, what }, tip: [T.cancelBuild, fill(T.refundTip, b.paid)] });
    return;
  }
  const done = u.why === "max" || u.why === "needLevel";
  text(ctx, `${T[what]}  ${u.now}${done ? "" : " → " + (u.now + 1)}`, x, ry + 15, { bold: true, size: 13 });
  const note = u.why === "max" ? T.whyMax : u.why === "needLevel" ? fill(T.whyNeedLevel, u.now + 1)
    : u.why === "done" ? T.whyJustTaken : u.why === "busy" ? T.whyBusy
    : `${effect(game, id, what, T)} · ${turnsText(u.turns, T)}`;
  fit(ctx, note, x, ry + 31, right - x - (done ? 0 : bw + 8), { italic: true, size: 12, color: u.why && u.why !== "money" ? INK.faint : INK.soft });
  if (done) return;
  const bx = right - bw, by = ry + 3;
  button(ctx, boxes, {
    x: bx, y: by, w: bw, h: 32, label: "", off: !!u.why, act: { do: "upgrade", id, what },
    tip: [T[what], T.tipUpgrade[what], fill(T.takesTurns, turnsText(u.turns, T)), u.why ? [u.why === "done" ? T.whyJustTaken : whyText(u.why, T), "bad"] : null],
  });
  const c = u.why ? INK.faint : INK.ink;
  const w = 16 + measure(ctx, String(u.cost), { bold: true, size: 13 });
  amount(ctx, "money", u.cost, bx + bw / 2 - w / 2, by + 21, { size: 13, bold: true, color: c });
}

/** Asker bas: dört tür, iki sıra; kapalı düğmenin altında maliyet yerine neden kapalı olduğu. */
function recruitBlock(ctx, game, boxes, T, id, x, y, w) {
  const ri = recruitInfo(game, id, "inf");
  text(ctx, T.recruit, x, y + 32, { bold: true, size: 14 });
  const why = ri.why && ri.why !== "done" ? whyText(ri.why, T) : fill(T.recruitLeft, ri.left);
  fit(ctx, why, x + 90, y + 32, w - 90, { italic: true, size: 12, color: ri.why && ri.why !== "done" ? INK.bad : INK.soft });
  const bw = (w - 8) / 2;
  UNITS.forEach((type, i) => {
    const info = recruitInfo(game, id, type);
    const locked = info.why && info.why.startsWith("need");
    button(ctx, boxes, {
      x: x + (i % 2) * (bw + 8), y: y + 44 + Math.floor(i / 2) * 54, w: bw, h: 48, label: T["add" + type[0].toUpperCase() + type.slice(1)], size: 13, off: !!info.why,
      act: { do: "recruit", id, type },
      tip: [T[type][0].toUpperCase() + T[type].slice(1), T[UNIT_TIP[type]], info.why ? [whyText(info.why, T), "bad"] : null],
      sub: (cx2, cy2, color) => (locked
        ? text(ctx, whyText(info.why, T), cx2, cy2 + 2, { size: 11, italic: true, color, align: "center" })
        : costLine(ctx, recruitCost(game.player, type), cx2, cy2 + 2, color)),
    });
  });
}

/** Liman sekmesinde sağ sütun: buradaki gemiler, abluka, deniz savunması, gemi yapımı. */
function fleetBlock(ctx, game, boxes, T, id, x, y, w, H) {
  const pl = game.places[id];
  text(ctx, `⛵ ${T.fleetHere}: ${shipsAt(game, id)}`, x, y + 32, { bold: true, size: 14 });
  const shut = blockaded(game, id);
  text(ctx, shut ? T.blockaded.toLocaleUpperCase() : T.openSea, x, y + 52, { italic: true, bold: shut, size: 12, color: shut ? INK.bad : INK.good });
  lines(ctx, fill(T.navalDefence, Math.round(fortOf(game, id) * 100) / 100), x, y + 72, w, { italic: true, size: 12, color: INK.soft }, 2, 15);
  const si = shipInfo(game, id);
  const note = si.why && si.why !== "done" ? whyText(si.why, T) : fill(T.shipsLeft, si.left);
  fit(ctx, note, x, y + H - 74, w, { italic: true, size: 12, color: si.why && si.why !== "done" ? INK.bad : INK.soft });
  button(ctx, boxes, {
    x, y: y + H - 62, w, h: 48, label: `⛵ ${T.addShip}  ·  ${pl.ships} ${T.ships}`, size: 13, off: !!si.why,
    act: { do: "buildShip", id }, tip: [T.addShip, T.tipShip, si.why ? [whyText(si.why, T), "bad"] : null],
    sub: (cx2, cy2, color) => costLine(ctx, si.cost, cx2, cy2 + 2, color),
  });
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

/** Kartta harika satırı: madalyon, adı ve armağanı (`w` genişliğe sığdırılır). */
function wonderLine(ctx, id, T, x, y, w = 324) {
  const wd = wonderAt(id);
  const [name, gift] = T.wonders[wd.id];
  wonderMark(ctx, x + 8, y - 5, 8);
  const nw = fit(ctx, name, x + 22, y, w - 22, { title: true, bold: true, size: 12, color: "#7a5418" });
  const room = w - 28 - nw;
  if (room > 40) fit(ctx, "· " + gift, x + 28 + nw, y, room, { italic: true, size: 12, color: INK.soft });
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

const wallsText = (walls, T) => (walls === "castle" ? T.wallsCastle : walls === "city" ? T.wallsCity : T.wallsNone);

/**
 * Başkasının ya da bağımsız bir yerin kartı: yer (ad, sahibi, tür, harika, sur) | savunanlar ve
 * yollar | eylem (yanında ordun varsa saldırı tahmini, tarafsızsa savaş ilanı).
 */
function placeCard(ctx, cam, game, ui, boxes, T) {
  const id = ui.sel.id, pl = game.places[id], p = byId[id];
  const me = game.player;
  const army = ui.army ? armyById(game, ui.army) : null;
  const can = army && canAttack(game, army, id);
  const rel = pl.owner ? relation(game, me, pl.owner) : "free";
  const declare = !can && rel === "neutral";
  const A = 230, B = 250, C = can || declare ? 170 : 0;
  const body = A + GAP + B + (C ? GAP + C : 0) + PAD;
  const V = vignetteWidth(cam, PAD + body, 112);
  const left = V ? 8 + V + GAP : PAD;
  const r = cardRect(cam, left + body, 156);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  if (V) drawVignette(ctx, id, pl.owner, { x: r.x + 8, y: r.y + 8, w: V, h: r.h - 16 }, pl.level);
  const y = r.y, H = r.h;
  let x = r.x + left;

  // Yer
  text(ctx, p.name[ui.lang], x, y + 32, { title: true, bold: true, size: 19 });
  shield(ctx, pl.owner, x, y + 41, 13);
  const w = text(ctx, civName(pl.owner, ui.lang, T.free), x + 20, y + 55, { size: 14 });
  if (pl.owner) {
    const [label, color] = rel === "war" ? [T.war, INK.bad] : rel === "ally" ? [T.ally, INK.good] : [T.neutral, INK.soft];
    text(ctx, "· " + label, x + 26 + w, y + 55, { size: 13, italic: true, color });
  }
  // Sisin içindeki yerin garnizonu ve gemileri bilinmez.
  const hid = ui.fog && !sight(game, me).has(id);
  fit(ctx, kindLine(id, game, T, hid), x, y + 76, A, { italic: true, size: 12, color: INK.soft });
  let ly = y + 96;
  if (wonderAt(id)) {
    wonderLine(ctx, id, T, x, ly + 2, A);
    ly += 20;
  }
  text(ctx, `${T.walls}: ${wallsText(wallsOf(game, id), T)}`, x, ly + 2, { size: 13, color: INK.soft });

  // Savunanlar ve yollar
  x += A + GAP;
  vrule(ctx, x - GAP / 2, y + 14, y + H - 14);
  const d = defenders(game, id);
  text(ctx, T.defenders.toLocaleUpperCase(ui.lang), x, y + 28, { bold: true, size: 11 });
  lines(ctx, hid ? T.fogUnknown : men(d) ? troops(T, d) : T.undefended, x, y + 46, B, { size: 13, italic: hid, color: hid ? INK.soft : INK.ink }, 2, 17);
  const roads = neighbours(id).map((n) => placeName(n, ui.lang) + (roadBetween(id, n).sea ? ` (${T.bySea})` : "")).join(", ");
  text(ctx, T.roads.toLocaleUpperCase(ui.lang), x, y + 88, { bold: true, size: 11 });
  lines(ctx, roads, x, y + 106, B, { size: 12 }, 3, 15);

  // Eylem
  if (C) {
    x += B + GAP;
    vrule(ctx, x - GAP / 2, y + 14, y + H - 14);
    if (can) {
      const e = forecast(game, army, me, id);
      const [label, color] = oddsLabel(e.odds, T);
      text(ctx, T.odds, x, y + 32, { size: 13, color: INK.soft });
      text(ctx, label, x, y + 56, { size: 18, bold: true, color });
      lines(ctx, fill(T.expect, e.lost, e.killed), x, y + 76, C, { italic: true, size: 11, color: INK.soft }, 2, 13);
      button(ctx, boxes, { x, y: y + H - 50, w: C, h: 36, label: T.attack, main: true, size: 15, act: { do: "attackAsk", army: army.id, id } });
    } else {
      // Tarafsız bir medeniyet: saldırmak için önce savaş ilan edilir - düğmesi burada.
      lines(ctx, fill(T.neutralBlock, civName(pl.owner, ui.lang)), x, y + 32, C, { italic: true, size: 12, color: INK.soft }, 3, 15);
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

/**
 * Ordu kartı: ordu (askerleri, gemileri, hareketi, kuşatması) | general, kendi ordunsa nasıl
 * yürütüleceği ve eylemler.
 */
function armyCard(ctx, cam, game, ui, boxes, T) {
  const a = armyById(game, ui.sel.id);
  const mine = a.owner === game.player;
  const g = a.general;
  const here = armiesAt(game, a.at).filter((b) => b !== a && b.owner === a.owner);
  const A = 270, B = mine || g ? 300 : 0;
  const r = cardRect(cam, PAD + A + (B ? GAP + B : 0) + PAD, 156);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  const y = r.y, H = r.h;
  let x = r.x + PAD;

  shield(ctx, a.owner, x, y + 15, 17);
  text(ctx, `${T.army} · ${civName(a.owner, ui.lang)}`, x + 24, y + 32, { title: true, bold: true, size: 17 });
  let ly = y + 56 + (lines(ctx, troops(T, a), x, y + 56, A, { size: 14 }, 2, 18) - 1) * 18;
  if (a.ships) {
    ly += 20;
    text(ctx, `⛵ ${a.ships} ${T.ships} · ${fill(T.carry, a.ships * N.navy.carry)}`, x, ly, { size: 13, color: canSail(a) ? INK.ink : INK.bad });
  }
  ly += 20;
  const maxMoves = trait(a.owner, "moves") + (g?.traits.includes("swift") ? 1 : 0);
  text(ctx, `${fill(T.moves, a.moves, maxMoves)} · ${placeName(a.at, ui.lang)}`, x, ly, { size: 13, color: INK.soft });
  if (a.route.length) {
    ly += 20;
    fit(ctx, fill(T.marching, placeName(a.route[a.route.length - 1], ui.lang)), x, ly, A, { size: 13, italic: true });
  }
  if (a.besieging) {
    ly += 20;
    fit(ctx, fill(T.siegeLine, placeName(a.besieging, ui.lang), game.turn - a.besiegedSince + 1, men(defenders(game, a.besieging))), x, ly, A, { size: 13, bold: true, color: INK.warn });
  }

  if (!B) { closeX(ctx, boxes, r); return r; }
  x += A + GAP;
  vrule(ctx, x - GAP / 2, y + 14, y + H - 14);
  let by = y + 30;
  if (g) {
    // General: yıldızlar seviyesi kadar, adı, ve yetenekleri.
    const sw = text(ctx, "★".repeat(g.level), x, by, { size: 13, color: INK.warn, bold: true });
    fit(ctx, `${fill(T.general, g.name)} · ${fill(T.rank, g.level)}`, x + sw + 6, by, B - sw - 6, { size: 14, bold: true });
    if (g.traits.length) fit(ctx, g.traits.map((t) => T.skills[t][0] + " (" + T.skills[t][1] + ")").join(", "), x, by + 18, B, { size: 12, italic: true, color: INK.soft });
    by += g.traits.length ? 40 : 22;
  } else if (mine) {
    // "General ata" ve fiyatı: yazı + para simgesi ortada.
    const ai = appointInfo(game, a.id);
    const off = ai.why === "money";
    const b = { x, y: y + 14, w: B, h: 30, label: "", act: { do: "appoint", army: a.id }, off };
    button(ctx, boxes, b);
    const c = off ? INK.faint : INK.ink;
    const lw = measure(ctx, T.appoint, { bold: true, size: 13 });
    const total = lw + 8 + 13 + 3 + measure(ctx, String(ai.cost), { bold: true, size: 13 });
    const sx = b.x + (b.w - total) / 2;
    text(ctx, "★ " + T.appoint, sx - 8, b.y + 20, { bold: true, size: 13, color: c });
    amount(ctx, "money", ai.cost, sx + lw + 14, b.y + 20, { size: 13, bold: true, color: c });
    by = y + 64;
  }
  if (mine) {
    lines(ctx, T.armyHint, x, by, B, { size: 12, italic: true, color: INK.soft }, 2, 15);
    const acts = [];
    // Kuşatan ordu: saldır ya da kuşatmayı kaldır (garnizona katılmak, bölünmek sonra).
    if (a.besieging) {
      if (canAttack(game, a, a.besieging)) acts.push([T.attack, { do: "attackAsk", army: a.id, id: a.besieging }]);
      acts.push([T.liftSiege, { do: "lift", army: a.id }]);
    } else if (game.places[a.at].owner === a.owner) acts.push([T.station, { do: "station", army: a.id }]);
    if (!a.besieging && men(a) >= 2 * N.company) acts.push([T.split, { do: "split", army: a.id }]);
    if (!a.besieging && here.length) acts.push([T.merge, { do: "merge", army: a.id, from: here[0].id }]);
    const bw = (B - 16) / 3;
    acts.forEach(([label, act], i) => button(ctx, boxes, { x: x + i * (bw + 8), y: y + H - 48, w: bw, h: 34, label, act, size: 13 }));
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
 * Tur sonunda olanlar: pencere açmadan sağ üstte bir liste, görüldükten 9 saniye sonra solar.
 * Basılınca bütün rapor açılır. (Kullanıcı 22.10: "tepki az / donuk"; her tur açılan rapor
 * penceresi araya giriyordu.) Kararlar ve görevler yine pencere olarak sorulur.
 */
function drawNews(ctx, cam, ui, boxes, T) {
  const now = performance.now();
  ui.news.since ??= now;
  const left = ui.news.since + 9000 - now;
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
  if (!items.length) return;
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
 * Haritada bir yerin ipucu: adı, sahibi, savunanları, suru, harikası; oyuncunun seçili ordusu
 * varsa oraya ne olacağı (kaç turda yürür, saldırırsa tahmin). `go`: main.js'in hesabı.
 */
export function placeTip(game, id, lang, hid, go) {
  const T = TEXT[lang], pl = game.places[id];
  const owner = civName(pl.owner, lang, T.free);
  const rel = pl.owner && pl.owner !== game.player ? relation(game, game.player, pl.owner) : null;
  const relText = rel === "war" ? T.war : rel === "ally" ? T.ally : rel === "neutral" ? T.neutral : null;
  const out = [placeName(id, lang), `${owner}${relText ? " · " + relText : ""} · ${fill(T.lvl, pl.level)}`];
  const d = defenders(game, id);
  out.push(hid ? T.fogUnknown : men(d) ? troops(T, d) : T.undefended);
  const walls = wallsOf(game, id);
  if (walls) out.push(`${T.walls}: ${wallsText(walls, T)}`);
  if (wonderAt(id)) out.push([T.wonders[wonderAt(id).id][0], "warn"]);
  if (!go) return out;
  const when = (n) => (n <= 1 ? T.tipOneTurn : fill(T.tipTurns, n));
  if (go.kind === "walk") out.push([`${T.tipWalk} · ${when(go.turns)}`, "warn"]);
  else if (go.kind === "attack") out.push([`${T.tipAttack} · ${T.odds}: ${oddsLabel(go.odds, T)[0]}`, go.odds === "easy" ? "good" : go.odds === "risky" ? "warn" : "bad"]);
  else if (go.kind === "approach") out.push([`${T.tipWalk} · ${when(go.turns)} → ${T.attack}`, "warn"]);
  else if (go.kind === "spent") out.push([T.tipSpent, "bad"]);
  else if (go.kind === "neutral") out.push([fill(T.neutralBlock, owner), "bad"]);
  else if (go.kind === "ships") out.push([T.needShips, "bad"]);
  else out.push([T.tipNoWay, "bad"]);
  return out;
}

/** Haritada bir ordunun ipucu. */
export function armyTip(game, a, lang) {
  const T = TEXT[lang];
  const out = [`${T.army} · ${civName(a.owner, lang)}`, troops(T, a)];
  if (a.general) out.push(`★ ${fill(T.general, a.general.name)} · ${fill(T.rank, a.general.level)}`);
  if (a.ships) out.push(`⛵ ${a.ships} ${T.ships}`);
  if (a.besieging) out.push([fill(T.evSiege, civName(a.owner, lang), placeName(a.besieging, lang)), "warn"]);
  if (a.owner === game.player) out.push([a.moves > 0 ? fill(T.movesLeft, a.moves) : T.spentShort, a.moves > 0 ? "good" : null]);
  else if (relation(game, game.player, a.owner) === "war") out.push([T.war, "bad"]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// İpucu balonları
//
// Kullanıcı 22.10: "nasıl oynanır diyor ama okumuyorum, çok sıkıcı, bütün yazılar aynı anda
// geliyor, beni boğuyor". Oyunun başında yazı penceresi yok: o an ne yapılacaksa onu gösteren
// TEK bir balon, gösterdiği yer altın bir çerçeveyle atar. Oyuncu o şeyi yapınca (main.js
// coachDone) ya da Tamam deyince sıradakine geçer. Görülenler tarayıcıda saklanır; menüden
// kapatılıp yeniden açılabilir.

const capitalOf = (g) => PLACES.find((p) => p.capital && g.places[p.id].owner === g.player)?.id ?? placesOf(g, g.player)[0];
/** Ekrandaki bir düğmenin kutusu: önce basılabilir olanı, yoksa kapalısını (`want`: niyet ettiği eylem). */
const findBox = (boxes, pred) => boxes.find((b) => b.act && pred(b.act)) ?? boxes.find((b) => b.want && pred(b.want));
const boxSpot = (b) => b && { x: b.x, y: b.y, w: b.w, h: b.h };
const placeSpot = (cam, id) => {
  if (!id) return null;
  const s = placeOnScreen(cam, id);
  return { x: s.x - 24, y: s.y - 44, w: 48, h: 58, ring: true };
};
const ownPlace = (g, ui) => ui.sel?.kind === "place" && g.places[ui.sel.id]?.owner === g.player;
const ownArmy = (g, ui) => {
  if (ui.sel?.kind !== "army") return null;
  const a = armyById(g, ui.sel.id);
  return a && a.owner === g.player && a.moves > 0 ? a : null;
};
/** Seçili ordunun yanında saldırılabilecek, umutsuz olmayan bir yer. */
const prey = (g, a) => neighbours(a.at).find((n) => canAttack(g, a, n) && forecast(g, a, a.owner, n).odds !== "hopeless");

/** Adımlar, öncelik sırasıyla: ne zaman gösterilir, neyi gösterir. */
const COACH = [
  { id: "city", when: (g, ui) => !ui.sel, at: (g, ui, boxes, cam) => placeSpot(cam, capitalOf(g)) },
  { id: "food", when: (g) => budget(g, g.player).food < 0, at: (g, ui, boxes, cam, T) => boxSpot(boxes.find((b) => b.tip?.[0] === T.food)) },
  { id: "upgrade", when: ownPlace, at: (g, ui, boxes) => boxSpot(findBox(boxes, (a) => a.do === "upgrade")) },
  { id: "recruit", when: ownPlace, at: (g, ui, boxes) => boxSpot(findBox(boxes, (a) => a.do === "recruit")) },
  { id: "form", when: (g, ui) => ownPlace(g, ui) && men(g.places[ui.sel.id]) >= 40, at: (g, ui, boxes) => boxSpot(findBox(boxes, (a) => a.do === "formOpen")) },
  { id: "attack", when: (g, ui) => { const a = ownArmy(g, ui); return !!(a && prey(g, a)); }, at: (g, ui, boxes, cam) => placeSpot(cam, prey(g, ownArmy(g, ui))) },
  { id: "move", when: (g, ui) => !!ownArmy(g, ui), at: (g, ui, boxes, cam) => placeSpot(cam, ownArmy(g, ui).at) },
  { id: "endturn", when: (g, ui, done) => !ui.sel && (done.has("upgrade") || done.has("recruit") || g.turn > 1), at: (g, ui, boxes) => boxSpot(findBox(boxes, (a) => a.do === "endTurn")) },
  { id: "news", when: (g, ui) => !!ui.news, at: (g, ui, boxes) => boxSpot(boxes.find((b) => b.act?.do === "open" && b.act.modal === "report" && b.w > 100)) },
  { id: "diplo", when: (g, ui) => !ui.sel && g.turn >= 4, at: (g, ui, boxes) => boxSpot(findBox(boxes, (a) => a.do === "open" && a.modal === "diplo")) },
];

function drawCoach(ctx, cam, game, ui, boxes, T) {
  if (!ui.coach || ui.coach.off || ui.modal || game.over) return;
  for (const step of COACH) {
    if (ui.coach.done.has(step.id) || !step.when(game, ui, ui.coach.done)) continue;
    const spot = step.at(game, ui, boxes, cam, T);
    if (!spot || spot.x + spot.w < 0 || spot.y + spot.h < 0 || spot.x > cam.w || spot.y > cam.h) continue;
    bubble(ctx, cam, boxes, T, step.id, spot);
    return;
  }
}

/** Gösterilen yerin çevresinde atan altın çerçeve, yanında kısa yazılı balon. */
function bubble(ctx, cam, boxes, T, id, spot) {
  // Hem açık kâğıtta hem koyu haritada görünsün: koyu bir alt çizgi, üstünde atan parlak altın.
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 250);
  const shape = () => {
    if (spot.ring) {
      ctx.beginPath();
      ctx.ellipse(spot.x + spot.w / 2, spot.y + spot.h - 12, 31 + pulse * 5, 14 + pulse * 2.5, 0, 0, TAU);
    } else roundRect(ctx, spot.x - 4 - pulse * 2, spot.y - 4 - pulse * 2, spot.w + 8 + pulse * 4, spot.h + 8 + pulse * 4, 6);
  };
  ctx.save();
  shape();
  ctx.strokeStyle = "rgba(28,20,10,0.75)";
  ctx.lineWidth = 6;
  ctx.stroke();
  shape();
  ctx.shadowColor = "rgba(255,190,60,0.95)";
  ctx.shadowBlur = 10 + pulse * 8;
  ctx.strokeStyle = "#ffc94a";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  const W = 300;
  const rows = wrap(ctx, T.coach[id], W - 32, { size: 14 });
  const h = 24 + rows.length * 19 + 44;
  const ax = spot.x + spot.w / 2;
  const above = spot.y - h - 18 > TOP + 6;
  const y = above ? spot.y - h - 18 : spot.y + spot.h + 18;
  const x = Math.max(10, Math.min(cam.w - W - 10, ax - W / 2));
  darkPanel(ctx, x, y, W, h);
  // Gösterdiği yere doğru küçük bir sivri uç.
  const tx = Math.max(x + 18, Math.min(x + W - 18, ax));
  ctx.beginPath();
  if (above) { ctx.moveTo(tx - 9, y + h - 1); ctx.lineTo(tx, y + h + 10); ctx.lineTo(tx + 9, y + h - 1); }
  else { ctx.moveTo(tx - 9, y + 1); ctx.lineTo(tx, y - 10); ctx.lineTo(tx + 9, y + 1); }
  ctx.closePath();
  ctx.fillStyle = "rgba(22,18,14,0.95)";
  ctx.fill();
  boxes.push({ x, y, w: W, h, act: null });
  rows.forEach((l, i) => text(ctx, l, x + 16, y + 28 + i * 19, { size: 14, color: CREAM }));
  button(ctx, boxes, { x: x + W - 16 - 86, y: y + h - 40, w: 86, h: 28, label: T.coachOk, size: 12, act: { do: "coach", id } });
  const lw = text(ctx, T.coachOff, x + 16, y + h - 21, { size: 12, italic: true, color: GOLD_LIGHT });
  boxes.push({ x: x + 10, y: y + h - 38, w: lw + 12, h: 26, act: { do: "coachOff" } });
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
    armies: armiesModal, cities: citiesModal, mission: missionModal, missions: missionsModal, chronicle: chronicleModal,
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
  // Surlu yer: hemen saldırmak yerine kuşatılabilir.
  const sg = canBesiege(game, a, m.id);
  const hint = sg ? wrap(ctx, fill(T.siegeHint, Math.round(siegeRate(a) * 100), turnsToFall(game, a, m.id)), 396, { size: 12, italic: true }) : [];
  const ter = terrainOf(a.at, m.id);
  const tl = (ter.river ? 1 : 0) + (ter.pass ? 1 : 0);
  const r = modalFrame(ctx, cam, boxes, 290 + (bySea ? 22 : 0) + tl * 18 + hint.length * 17 + (sg ? 8 : 0));
  const x = r.x + 22;
  text(ctx, fill(T.attackQ, placeName(m.id, ui.lang)), r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  text(ctx, T.yours, x, r.y + 76, { bold: true, size: 13 });
  text(ctx, troops(T, a), x, r.y + 96, { size: 13 });
  text(ctx, T.defenders, x, r.y + 124, { bold: true, size: 13 });
  text(ctx, men(d) ? troops(T, d) : T.undefended, x, r.y + 144, { size: 13 });
  text(ctx, `${T.walls}: ${wallsText(walls, T)}`, x, r.y + 166, { size: 13, color: INK.soft });
  let oy = r.y + 196;
  // Arazi: nehir geçişi ve dağ geçidi.
  [[ter.river, T.riverLine], [ter.pass, T.passLine]].filter(([on]) => on).forEach(([, l], i) => {
    text(ctx, l, x, r.y + 186 + i * 18, { size: 13, italic: true, color: INK.warn });
  });
  oy += tl * 18;
  if (bySea) {
    // Önce deniz savaşı: kaybedilirse ordu batar.
    const [sl, sc] = oddsLabel(e.sea, T);
    const sw = text(ctx, fill(T.navalOdds, a.ships, shipsAt(game, m.id)) + " · ", x, r.y + 190 + tl * 18, { size: 13 });
    text(ctx, sl, x + sw, r.y + 190 + tl * 18, { size: 13, bold: true, color: sc });
    oy += 18;
  }
  const [label, color] = oddsLabel(e.odds, T);
  const ow = text(ctx, `${T.odds}: `, x, oy, { size: 15 });
  text(ctx, label, x + ow, oy, { size: 15, bold: true, color });
  text(ctx, fill(T.expect, e.lost, e.killed), x, oy + 20, { size: 12, italic: true, color: INK.soft });
  if (!sg) {
    twoButtons(ctx, boxes, r, { label: T.attack, act: { do: "attack" } }, { label: T.cancel, act: { do: "close" } });
    return;
  }
  hint.forEach((l, i) => text(ctx, l, x, oy + 44 + i * 17, { size: 12, italic: true, color: INK.warn }));
  // Üç düğme: saldır, kuşat, vazgeç.
  const bw = (r.w - 56) / 3, by = r.y + r.h - 62;
  button(ctx, boxes, { x: r.x + 20, y: by, w: bw, h: 44, size: 15, main: true, label: T.attack, act: { do: "attack" } });
  button(ctx, boxes, { x: r.x + 28 + bw, y: by, w: bw, h: 44, size: 15, label: T.besiege, act: { do: "besiege" } });
  button(ctx, boxes, { x: r.x + 36 + 2 * bw, y: by, w: bw, h: 44, size: 15, label: T.cancel, act: { do: "close" } });
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
    else if (e.type === "built" && e.civ === me) out.push([fill(T.evBuilt, placeName(e.place, lang), T[e.what], e.level), "good"]);
    else if (e.type === "battle" && mine) {
      const where = placeName(e.place, lang);
      if (e.won) out.push([fill(T.evTook, name(e.attacker), where), e.attacker === me ? "good" : "bad"]);
      else if (!e.drowned) out.push([fill(T.evHeld, name(e.defender), where, name(e.attacker)), e.defender === me ? "good" : "bad"]);
    }
    if (e.type === "battle" && e.won && wonderAt(e.place)) {
      out.push([fill(T.evWonder, name(e.attacker), T.wonders[wonderAt(e.place).id][0]), e.attacker === me ? "good" : e.defender === me ? "bad" : null]);
    }
    if (e.type === "storm" && e.civ === me) out.push([fill(T.evStorm, e.lost, e.sunk), "bad"]);
    if (e.type === "winter" && e.civ === me) out.push([fill(T.evWinter, e.lost), "bad"]);
    if (e.type === "missionNew") out.push([fill(T.evMissionNew, missionText(game, e.mission, lang).title), null]);
    if (e.type === "mission") out.push([fill(e.ok ? T.evMissionOk : T.evMissionFail, missionText(game, e.mission, lang).title), e.ok ? "good" : "bad"]);
    if (e.type === "siege" && (e.by === me || e.defender === me)) out.push([fill(T.evSiege, name(e.by), placeName(e.place, lang)), e.defender === me ? "bad" : null]);
    if (e.type === "surrender" && (e.by === me || e.from === me || wonderAt(e.place))) out.push([fill(T.evSurrender, name(e.by), placeName(e.place, lang)), e.by === me ? "good" : e.from === me ? "bad" : null]);
    if (e.type === "surrender" && e.fallen) out.push([fill(T.evFallen, name(e.fallen)), e.fallen === me ? "bad" : null]);
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
  // Üstte savaş sahnesi (battle.js): pencere açıldığından beri geçen süreyle oynar.
  const SH = 180;
  const r = modalFrame(ctx, cam, boxes, 190 + SH + 16 + extra.length * 22);
  drawBattle(ctx, { x: r.x + 16, y: r.y + 16, w: r.w - 32, h: SH }, e, performance.now() - (m.t0 ?? 0), wallsOf(game, e.place));
  const y0 = r.y + SH + 16;
  text(ctx, e.won ? fill(T.won, where) : fill(T.lost, where), r.x + r.w / 2, y0 + 44, {
    title: true, bold: true, size: 19, align: "center", color: e.won ? INK.good : INK.bad,
  });
  text(ctx, fill(T.losses, lost), r.x + r.w / 2, y0 + 78, { size: 14, align: "center" });
  extra.forEach(([s, color], i) => text(ctx, s, r.x + r.w / 2, y0 + 102 + i * 22, { size: 14, bold: true, align: "center", color }));
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

function menuModal(ctx, cam, game, ui, boxes, T) {
  const r = modalFrame(ctx, cam, boxes, 544, 360);
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
  // Ses ve müzik: ayrı ayrı aç-kapa.
  [["sound", T.soundLabel, soundEnabled()], ["music", T.musicLabel, musicEnabled()], ["fog", T.fogLabel, ui.fog], ["coachSet", T.tipsLabel, !ui.coach?.off]].forEach(([k, label, on], j) => {
    const yy = r.y + 322 + j * 44;
    text(ctx, label, x, yy + 22, { bold: true, size: 14 });
    [[true, T.sndOn], [false, T.sndOff]].forEach(([v, l], i) => {
      button(ctx, boxes, { x: x + w - 2 * 74 + i * 74, y: yy, w: 68, h: 34, label: l, main: on === v, size: 13, act: { do: k, on: v } });
    });
  });
  text(ctx, "Natural Earth · github.com/yahyaari/mare-nostrum", r.x + r.w / 2, r.y + r.h - 22, { size: 10, color: INK.faint, align: "center" });
}

/**
 * Nasıl oynanır: her sayfada tek konu - madalyon, başlık, bir iki cümle (kullanıcı 22.10: bütün
 * yazılar aynı anda gelince okunmuyor). ‹ › ile sayfa, noktalar nerede olunduğunu gösterir.
 */
function helpModal(ctx, cam, game, ui, boxes, T, m) {
  const pages = T.helpPages, n = pages.length;
  const i = Math.max(0, Math.min(n - 1, m.page ?? 0));
  const [kind, title, body] = pages[i];
  const W = Math.min(cam.w - 24, 470);
  const rows = wrap(ctx, body, W - 72, { size: 15 });
  const r = modalFrame(ctx, cam, boxes, 186 + rows.length * 23 + 70, 470);
  const cx = r.x + r.w / 2;
  medal(ctx, null, cx, r.y + 52, 28, kind, null);
  text(ctx, title, cx, r.y + 112, { title: true, bold: true, size: 20, align: "center" });
  ornament(ctx, cx, r.y + 126, 150);
  rows.forEach((l, k) => text(ctx, l, cx, r.y + 156 + k * 23, { size: 15, align: "center" }));
  // Sayfa noktaları
  const dy = r.y + r.h - 86;
  pages.forEach((_, k) => {
    ctx.beginPath();
    ctx.arc(cx + (k - (n - 1) / 2) * 16, dy, k === i ? 5 : 3.5, 0, TAU);
    ctx.fillStyle = k === i ? GOLD_DARK : "rgba(43,33,24,0.35)";
    ctx.fill();
  });
  const by = r.y + r.h - 62, bw = (r.w - 48) / 2;
  button(ctx, boxes, { x: r.x + 20, y: by, w: bw, h: 44, size: 15, label: "‹  " + T.back, off: i === 0, act: { do: "modalPage", page: i - 1 } });
  button(ctx, boxes, i < n - 1
    ? { x: r.x + 28 + bw, y: by, w: bw, h: 44, size: 15, main: true, label: T.next + "  ›", act: { do: "modalPage", page: i + 1 } }
    : { x: r.x + 28 + bw, y: by, w: bw, h: 44, size: 15, main: true, label: T.ok, act: { do: "close" } });
  button(ctx, boxes, { x: r.x + r.w - 40, y: r.y + 10, w: 30, h: 30, label: "×", size: 18, act: { do: "close" } });
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
    let nw = text(ctx, p.name[ui.lang], x, y + 20, { bold: true, size: 15 });
    if (wonderAt(id)) { wonderMark(ctx, x + nw + 14, y + 15, 7.5); nw += 22; }
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

/** Bir görevin yazıları: başlık ve açıklama. */
export function missionText(game, m, lang) {
  const T = TEXT[lang];
  const L = T.missions[m.key];
  const a = m.place ? placeName(m.place, lang) : m.other ? civName(m.other, lang) : "";
  const b = m.need ?? "", c = m.what ? T[m.what] : "";
  return { title: fill(L.title, a, b, c), body: fill(L.body, a, b, c) };
}

const leftText = (game, m, T) => {
  const n = turnsLeft(game, m);
  return n <= 1 ? T.mLast : fill(T.mLeft, n);
};

/** Yeni görev: meclisin kalkanı, başlık, açıklama, süre, ödül; kabul ya da ret. */
function missionModal(ctx, cam, game, ui, boxes, T, mm) {
  const m = game.missions?.find((x) => x.id === mm.id);
  if (!m) return;
  const L = missionText(game, m, ui.lang);
  const body = wrap(ctx, L.body, 400, { size: 15, italic: true });
  const r = modalFrame(ctx, cam, boxes, 236 + body.length * 22, 460);
  const cx = r.x + r.w / 2;
  shield(ctx, game.player, cx - 13, r.y + 18, 26);
  text(ctx, fill(T.mFrom, T.councils[game.player]), cx, r.y + 70, { italic: true, size: 13, color: INK.soft, align: "center" });
  text(ctx, L.title, cx, r.y + 98, { title: true, bold: true, size: 20, align: "center" });
  ornament(ctx, cx, r.y + 110, 170);
  body.forEach((l, i) => text(ctx, l, cx, r.y + 138 + i * 22, { size: 15, italic: true, align: "center" }));
  const y = r.y + 138 + body.length * 22 + 6;
  text(ctx, leftText(game, m, T), r.x + 28, y + 4, { bold: true, size: 13, color: INK.warn });
  const rw = text(ctx, T.mReward + ":", r.x + r.w - 150, y + 4, { bold: true, size: 13 });
  costLine(ctx, m.reward, r.x + r.w - 150 + rw + 52, y + 4, INK.ink, 13);
  twoButtons(ctx, boxes, r, { label: T.mAccept, act: { do: "missionAccept", id: m.id } }, { label: T.mDecline, act: { do: "missionDecline", id: m.id } });
}

/** Alt menüden: açık görevler. Yeri olan göreve basınca harita oraya kayar. */
function missionsModal(ctx, cam, game, ui, boxes, T) {
  const list = game.missions ?? [];
  const rowH = 70;
  const r = modalFrame(ctx, cam, boxes, 84 + Math.max(1, list.length) * rowH + 74, 560);
  text(ctx, T.missionsTitle, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  if (!list.length) text(ctx, T.noMissions, r.x + r.w / 2, r.y + 100, { italic: true, size: 14, color: INK.soft, align: "center" });
  const x = r.x + 26, right = r.x + r.w - 26;
  list.forEach((m, i) => {
    const y = r.y + 62 + i * rowH;
    listRow(ctx, boxes, r, y, rowH - 4, i, { do: "pickMission", id: m.id });
    const L = missionText(game, m, ui.lang);
    text(ctx, L.title, x, y + 22, { title: true, bold: true, size: 15 });
    const pr = missionProgress(game, m);
    text(ctx, L.body + (pr ? `  (${pr[0]} / ${pr[1]})` : ""), x, y + 42, { italic: true, size: 13, color: INK.soft });
    text(ctx, leftText(game, m, T), right, y + 22, { bold: true, size: 13, color: INK.warn, align: "right" });
    costLine(ctx, m.reward, right - 50, y + 56, INK.ink, 12);
  });
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

/** Yıllığın bir satırı: yazısı ve tonu (oyuncu için iyi mi kötü mü). */
function annalLine(game, a, lang) {
  const T = TEXT[lang], me = game.player;
  const name = (c) => civName(c, lang, T.free);
  const where = (id) => placeName(id, lang);
  const tone = (good, bad) => (good ? "good" : bad ? "bad" : null);
  switch (a.k) {
    case "took": {
      const w = wonderAt(a.place);
      return [fill(T.evTook, name(a.by), where(a.place)) + (w ? `  ✦ ${T.wonders[w.id][0]}` : ""), tone(a.by === me, a.from === me)];
    }
    case "revolt": return [fill(T.evRevolt, where(a.place)), tone(false, a.from === me)];
    case "fallen": return [fill(T.evFallen, name(a.civ)), tone(false, a.civ === me)];
    case "war": return [fill(T.evWar, name(a.by), name(a.on)), tone(false, a.on === me || a.by === me)];
    case "ally": return [fill(T.evAlly, name(a.by), name(a.to)), tone(a.by === me || a.to === me, false)];
    case "peace": return [fill(T.evPeace, name(a.by), name(a.to)), tone(a.by === me || a.to === me, false)];
    case "broke": return [fill(T.evBroke, name(a.by), name(a.with)), tone(false, a.with === me)];
    case "siege": return [fill(T.evSiege, name(a.by), where(a.place)), tone(a.by === me, a.by !== me)];
    case "mission": return [fill(T.evMissionOk, missionText(game, a.m, lang).title), "good"];
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

