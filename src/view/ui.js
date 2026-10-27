// Arayüz: başlangıç ekranı, üst bant, kartlar ve pencereler. Hiçbir kuralı değiştirmez;
// her düğme bir `act` bırakır, main.js onu çalıştırır.
//
// `ui` görünüm durumu: { screen, lang, pick, saved, sel, modal, toast }.
//   sel:   { kind: "place" | "army", id }
//   modal: { kind: "attack" | "diplo" | "report" | "menu" | "help" |
//            "confirm" | "over", ... }
//   army:  oyuncu bir yabancı yere bakarken son seçtiği kendi ordusu (kartta saldırı tahmini için)
//   news:  { lines, since } tur sonunda sağ üstte beliren haberler (pencere açmadan)
//   tip:   { lines, since } farenin altındaki şeyin açıklaması
//   cards: { of, sig, picks, page } seçili birlik kartları (kart çizimi: cardGrid)
//   aim:   Yürü'ye basılmış ordu: haritada basılan yer onun gideceği yer
//   fight: { ev, t0 } oyuncunun az önceki savaşı: haritada sahne, sonra sonuç şeridi (drawFight)

import { CIVS, PLACES } from "../data/world.js";
import { angerOf, canDeclare, canPropose, canTrade } from "../rules/diplomacy.js";
import { byId, neighbours, roadBetween } from "../rules/graph.js";
import {
  access, canAttack, canStrike, defenders, fieldSides, forecast, forecastField, fortOf, hostile, menace, mpMax, nearestPlace, shipsAt, sides, wallsOf,
} from "../rules/moves.js";
import { POS, cellOf, centre, dist, isLand, isMountain, placeAtCell } from "../rules/map.js";
import { intelOf, spyAt, spyInfo } from "../rules/spies.js";
import { banditsOf } from "../rules/bandits.js";
import { campsOf } from "../rules/barbarians.js";
import { restPlace } from "../rules/refill.js";
import { candidates as tradeCandidates, flowing, routesFrom, slotsOf, valueOf, wayOf } from "../rules/trade.js";
import { dealLeft, dealOf, moodLevel, moodOf, persona } from "../rules/leaders.js";
import { portrait } from "./leaders.js";
import { TECHS, canResearch, costFor, knows, scienceOf, techById, techMul, turnsLeft as techTurns } from "../rules/research.js";
import { N, SHIPS, UNITS, trait, uniqueOf } from "../rules/numbers.js";
import {
  ACADEMY, BUILDINGS, PORT_UPGRADES, UPGRADES, rushInfo, wonderInfo, humansOf, armiesAt, buildersOf, cardsOf, carryOf, fleetOf, together, startTroops, armyById, besieged, blockaded, budget, canSail, gamesInfo, key, men, output, placesOf, popCap, recruitCost, shipInfo,
  recruitInfo, relation, strength, upgradeInfo,
} from "../rules/state.js";
import { TEXT, fill } from "../text.js";
import { drift } from "../rules/loyalty.js";
import { artBox, glassButton, lit, pictureFrame } from "./art.js";
import { appointInfo, capOf, chanceOf, features, generalsOf, leanings, officerFor } from "../rules/generals.js";
import { options as letterOptions, ownerOf } from "../rules/events.js";
import { progress as missionProgress, turnsLeft } from "../rules/missions.js";
import {
  INK, SERIF, TAU, amount, button, civName, colorOf, costLine, delta, fmt, icon, measure, over, panel, pointer, text, wrap,
} from "./kit.js";
import { BOTTOM_H, RIGHT_W, TOP, drawBottomBar, drawRightColumn, drawTopBar, hanging, medal } from "./hud.js";
import { CREAM, DARK, GOLD, GOLD_DARK, GOLD_LIGHT, chevrons, galley, roundRect, shade, shield, soldier, wonderMark } from "./pieces.js";
import { ALL_WONDERS, BUILDABLE, WONDERS, placeOfWonder, wonderAt, wondersAt, wondersOf as wondersOfCiv } from "../rules/wonders.js";
import { rankOf, ranking, scoreOf, wonderTurnsLeft } from "../rules/victory.js";
import { ownersAt } from "../rules/chronicle.js";
import { musicEnabled, soundEnabled } from "./sound.js";
import { eyes, seen, sight } from "../rules/sight.js";
import { canBesiege, siegeRate, turnsToFall } from "../rules/siege.js";
import { SCENE_MS, drawBattle, trooper } from "./battle.js";
import { estimate, explain, fight, nextRankXp, veteranMul, veteranRank } from "../rules/combat.js";
import { incomingSides } from "../rules/incoming.js";
import { drawMinimap, drawVignette, placeOnScreen } from "./draw.js";
import { buildingArt } from "./buildings.js";
import { toScreen } from "./camera.js";
import { SIZE } from "../geo.js";

const placeName = (id, lang) => byId[id].name[lang];
/** Bir ordunun sahibinin adı: haydutların sahibi yok (rules/bandits.js). */
const ownerName = (a, T, lang) => (a.bandit ? T.bandits : a.camp ? T.barbCamp : a.horde ? T.horde : a.barbarian ? T.barbarians : civName(a.owner, lang, T.free));

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
    let side = null;
    if (ui.sel?.kind === "place") {
      // Solda şehrin kartı (her yer için); kendi şehrinse altta yükseltme ve asker paneli.
      card = game.places[ui.sel.id].owner === game.player ? cityCard(ctx, cam, game, ui, boxes, T) : null;
      side = sideCard(ctx, cam, game, ui, boxes, T, card?.y);
    } else if (ui.sel?.kind === "army" && armyById(game, ui.sel.id)) {
      card = armyCard(ctx, cam, game, ui, boxes, T);
    }
    if (!game.over && !card) drawBottomBar(ctx, cam, game, ui, boxes, T);
    if (ui.news && !ui.modal) drawNews(ctx, cam, ui, boxes, T);
    drawCoach(ctx, cam, game, ui, boxes, T);
    if (ui.fight) drawFight(ctx, cam, game, ui, boxes, T);
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
    if (ui.screen === "game") drawCoach(ctx, cam, game, ui, boxes, T, true);
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
  const choosing = (ui.players ?? 1) > 1 ? fill(T.choosePlayer, (ui.picks?.length ?? 0) + 1) : T.chooseCiv;
  text(ctx, `${T.era} · ${choosing}`, 30, 74, { italic: true, size: 14, color: GOLD_LIGHT });

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
    const taken = (ui.picks ?? []).indexOf(c.id);
    if (taken >= 0) {
      ctx.beginPath();
      ctx.arc(bx + bw - 2, y + (step - bh) / 2 + 6, 11, 0, TAU);
      ctx.fillStyle = GOLD;
      ctx.fill();
      text(ctx, fill(T.takenBy, taken + 1), bx + bw - 2, y + (step - bh) / 2 + 10, { bold: true, size: 11, color: DARK, align: "center" });
    }
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
  const st = startTroops(civ.id);
  const army = fill(T.startArmy, troops(T, { ...st, cav: 0, siege: 0 }));
  // Alttaki sabit kısım (gezinme, zorluk, oyuncular, başla, devam) ve metin; görsel kalan yeri alır.
  const anySlot = Object.keys(ui.slots ?? {}).length > 0;
  const bottomH = 40 + 14 + 36 + 14 + 36 + 14 + 48 + (ui.saved || anySlot ? 54 : 0) + 18;
  const textH = 44 + 20 + 18 + desc.length * 19 + 14 + 44 + 26 + landRows.length * 16 + 16 + 10;
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
  // Kendi birliği (bölüm 5b): figürü ve adı.
  trooper(ctx, "elite", civ.id, x + 11, y + 6, -1, 0.72);
  fit(ctx, fill(T.uniqueLine, unitTitle(T, "elite", civ.id), T.eliteOf[civ.id][1]), x + 30, y, w - 30, { bold: true, size: 14, color: GOLD_DARK });
  y += 26;
  landRows.forEach((l, i) => text(ctx, l, x, y + i * 16, { italic: true, size: 12, color: INK.soft }));
  text(ctx, army, x, y + landRows.length * 16, { italic: true, size: 12, color: INK.soft });
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

  // Oyuncular: aynı bilgisayarda sırayla (kullanıcı 23.10).
  text(ctx, T.players, x, by + 23, { bold: true, size: 13 });
  boxes.push({ x, y: by, w: 110, h: 36, act: null, tip: [T.players, T.tipPlayers] });
  const pw = Math.min(56, (w - 110) / 4);
  [1, 2, 3, 4].forEach((n, k) => {
    button(ctx, boxes, { x: x + w - (4 - k) * (pw + 6) + 6, y: by, w: pw, h: 36, label: String(n), size: 14, main: (ui.players ?? 1) === n, act: { do: "players", n } });
  });
  by += 36 + 14;
  const many = (ui.players ?? 1) > 1, picks = ui.picks ?? [];
  const last = !many || picks.length >= ui.players - 1;
  button(ctx, boxes, {
    x, y: by, w, h: 48, main: true, size: 17, off: picks.includes(civ.id),
    label: last ? `${T.start} · ${civ.name[ui.lang]}` : fill(T.pickPlayer, picks.length + 1, civ.name[ui.lang]),
    act: { do: last ? "start" : "pickPlayer" },
  });
  const loadW = anySlot ? 110 : 0;
  if (ui.saved) {
    const c = CIVS.find((cc) => cc.id === ui.saved.player);
    button(ctx, boxes, { x, y: by + 56, w: w - (loadW ? loadW + 8 : 0), h: 44, size: 14, label: `${T.cont} · ${fill(T.contInfo, c.name[ui.lang], ui.saved.turn)}`, act: { do: "continue" } });
  }
  if (anySlot) button(ctx, boxes, { x: ui.saved ? x + w - loadW : x, y: by + 56, w: ui.saved ? loadW : w, h: 44, size: 14, label: T.loadBtn, act: { do: "slots", mode: "load" } });
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
export const CARD_H = 270;
const PAD = 16, GAP = 18;

/** Kartın yeri: altta ortada; sağ alttaki sütuna (sıradaki ordu, mini harita, Turu bitir) değmez. */
function cardRect(cam, w, h) {
  const right = cam.w - 12 - RIGHT_W - 12;
  const x = Math.max(12, Math.min(Math.round((cam.w - w) / 2), right - w));
  return { x, y: cam.h - 12 - h, w, h };
}


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
  // `min` verilmişse sığana kadar küçülür (o sınıra dek), yoksa bir kez 1.5 küçülür (en az 10).
  if (measure(ctx, s, { ...o, size }) > w) size = Math.max(o.min ?? 10, o.min ? Math.min(size - 1.5, size * w / measure(ctx, s, { ...o, size })) : size - 1.5);
  while (s.length > 4 && measure(ctx, s, { ...o, size }) > w) s = s.slice(0, -2) + "…";
  return text(ctx, s, x, y, { ...o, size });
}

function kindLine(id, game, T, hid = false) {
  const p = byId[id], pl = game.places[id];
  return [p.capital ? T.capital : null, p.kind === "castle" ? T.castle : T.city, p.port ? T.port : null]
    .filter(Boolean).join(" · ") + " · " + fill(T.lvl, pl.level) + (fleetOf(pl) && !hid ? ` · ${fleetOf(pl)} ${T.ships}` : "");
}

/** Bir asker türünün adı (küçük harfle); özel birliğinki sahibinin medeniyetinden ("lejyoner"). */
const unitName = (T, k, civ) => (k === "elite" ? T.eliteOf[civ]?.[0] ?? T.elite : T[k]);
/** Büyük harfle başlayan ad (kartlarda). */
const unitTitle = (T, k, civ) => { const s = unitName(T, k, civ); return s[0].toLocaleUpperCase() + s.slice(1); };
/** Bir asker türünün ne işe yaradığı (ipucunda). */
const unitTip = (T, k, civ) => (k === "elite" ? T.eliteOf[civ]?.[2] ?? "" : T[UNIT_TIP[k]]);

/** "120 piyade · 40 okçu · 20 süvari": piyade ve okçu hep, ötekiler varsa. */
function troops(T, u, civ = u.owner) {
  return UNITS.filter((k) => k === "inf" || k === "arch" || u[k] > 0).map((k) => `${u[k] ?? 0} ${unitName(T, k, civ)}`).join(" · ");
}

function whyText(why, T) {
  // Araştırmanın açtığı birim: "tech_horseback" -> "Önce Atçılık araştırılmalı".
  if (why.startsWith("tech_")) return fill(T.whyTech, T.techs[why.slice(5)][0]);
  return T["why" + why[0].toUpperCase() + why.slice(1)] ?? why;
}

const UNIT_TIP = { inf: "tipInf", arch: "tipArch", cav: "tipCav", siege: "tipSiege" };

// ---- birlik kartları ----
//
// Her bölük bir kart (rules/state.js cardsOf): üstte sahibinin renginde gök, önünde o türün
// askerleri; altta kaç kişi kaldığı ve gücünü gösteren çubuk. Seçili kart altın çerçeveli ve
// biraz kalkık. Seçim ui.cards'ta: { of: "p:rome" | "a:12", sig, picks: Set(kart sırası), page }.
// `sig` askerlerin sayısı: biri değişince (asker basıldı, ordu çıktı) eski seçim düşer.

export const cardSig = (u) => [...UNITS, ...SHIPS].map((k) => u[k] ?? 0).join(",");

/** Bu garnizonun ya da ordunun seçili kartları (başka bir şeyinkiyse ya da sayılar değiştiyse boş). */
export const picksOf = (ui, of, u) => (ui.cards?.of === of && ui.cards.sig === cardSig(u) ? ui.cards.picks : new Set());

/** Kartın yüzü. `act` yoksa (yabancı ordu) seçilemez ama ipucu yine çıkar. */
function unitCard(ctx, boxes, T, c, owner, x, y, w, h, on, act, rest = false) {
  const hot = !!act && over(x, y, w, h);
  const lift = on ? 4 : hot ? 2 : 0;
  const k = w / 52;
  const strip = Math.round(15 * Math.max(0.85, k));
  ctx.save();
  ctx.fillStyle = "rgba(25,18,10,0.3)";
  roundRect(ctx, x + 1.5, y + 2.5, w, h, 4);
  ctx.fill();
  const top = y - lift;
  roundRect(ctx, x, top, w, h, 4);
  ctx.fillStyle = DARK;
  ctx.fill();
  // Resim: sahibinin renginde gök, ufukta açılır; altında toprak (gemide deniz).
  const ix = x + 3, iy = top + 3, iw = w - 6, ih = h - strip - 5;
  const boat = SHIPS.includes(c.type);
  troopArt(ctx, c.type, owner, ix, iy, iw, ih, k);
  // Alt şerit: kaç kişi, ve gücü (yarım bölük yarım çubuk).
  const sy = top + h - strip;
  if (boat) text(ctx, T.shipNames[c.type], x + w / 2, sy + strip / 2 + 1, { bold: true, size: Math.max(9, 10 * k), color: CREAM, align: "center", base: "middle" });
  else {
    const full = c.men >= N.company;
    const nw = text(ctx, String(c.men), x + 5, sy + strip / 2 + 1, { bold: true, size: Math.max(10, 12 * k), color: full ? CREAM : GOLD_LIGHT, base: "middle" });
    // Dinleniyor: her tur toparlanır (refill.js).
    if (!full && rest) text(ctx, "▲", x + 6 + nw, sy + strip / 2 + 1, { bold: true, size: Math.max(7, 8 * k), color: "#8fd88f", base: "middle" });
    const bx = x + w * 0.45, bw = w * 0.55 - 5, by = sy + strip / 2 - 2;
    ctx.fillStyle = "rgba(243,231,201,0.18)";
    ctx.fillRect(bx, by, bw, 4);
    ctx.fillStyle = full ? GOLD : INK.warn;
    ctx.fillRect(bx, by, (bw * c.men) / N.company, 4);
  }
  roundRect(ctx, x + 0.5, top + 0.5, w - 1, h - 1, 4);
  ctx.strokeStyle = on ? GOLD_LIGHT : hot ? GOLD : GOLD_DARK;
  ctx.lineWidth = on ? 2.2 : 1.2;
  if (on) { ctx.shadowColor = "rgba(255,200,90,0.85)"; ctx.shadowBlur = 8; }
  ctx.stroke();
  if (on) {
    // Seçili: sağ üst köşede altın bir onay.
    const mx = x + w - 8 * Math.max(0.8, k), my = top + 8 * Math.max(0.8, k), mr = 6.5 * Math.max(0.8, k);
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, TAU);
    ctx.fillStyle = GOLD_LIGHT;
    ctx.fill();
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx - mr * 0.5, my);
    ctx.lineTo(mx - mr * 0.1, my + mr * 0.42);
    ctx.lineTo(mx + mr * 0.55, my - mr * 0.45);
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  ctx.restore();
  const name = boat ? T.shipNames[c.type] : unitTitle(T, c.type, owner);
  const tip = boat
    ? [name, shipLine(c.type, T), T.shipTips[c.type], act ? T.cardPick : null]
    : [name, fill(T.cardMen, c.men, N.company), unitTip(T, c.type, owner), rest && c.men < N.company ? [fill(T.cardRest, N.refill.men), "good"] : null, act ? T.cardPick : null];
  boxes.push({ x, y: top, w, h: h + lift, act, tip, want: act });
}

/**
 * Kartları bir alana dizer: sığmazsa küçültür; en küçüğüyle de sığmazsa sayfa sayfa (‹ ›).
 * `of`: seçimin kime ait olduğu; `mine` değilse kartlar seçilemez.
 */
function cardGrid(ctx, boxes, T, ui, u, owner, of, r, mine) {
  const cards = cardsOf(u);
  const picks = picksOf(ui, of, u);
  const gap = 6;
  let cw = 0, ch = 0, cols = 1, rows = 1;
  for (const [w, h] of [[52, 70], [46, 62], [40, 54], [36, 48]]) {
    cw = w; ch = h;
    cols = Math.max(1, Math.floor((r.w + gap) / (w + gap)));
    rows = Math.max(1, Math.floor((r.h - 4 + gap) / (h + gap)));
    if (cols * rows >= cards.length) break;
  }
  const per = cols * rows;
  const pages = Math.max(1, Math.ceil(cards.length / per));
  const page = Math.min(pages - 1, ui.cards?.of === of ? ui.cards.page ?? 0 : 0);
  if (!cards.length) text(ctx, T.noTroops, r.x, r.y + 24, { italic: true, size: 13, color: INK.soft });
  cards.slice(page * per, page * per + per).forEach((c, j) => {
    const i = page * per + j;
    unitCard(ctx, boxes, T, c, owner, r.x + (j % cols) * (cw + gap), r.y + 4 + Math.floor(j / cols) * (ch + gap), cw, ch, picks.has(i), mine ? { do: "pickCard", of, i } : null, !!r.rest);
  });
  return { pages, page, count: cards.length, picked: picks.size };
}

/** Kartların başlığı: ad, kaç asker / kaç birlik; sağda Hepsi / Hiçbiri ve sayfa okları. */
function gridHead(ctx, boxes, T, u, of, title, x, y, w, g, mine) {
  const tw = text(ctx, title, x, y + 15, { bold: true, size: 14 });
  let right = x + w;
  if (g.pages > 1) {
    button(ctx, boxes, { x: right - 26, y, w: 26, h: 22, label: "›", size: 15, off: g.page >= g.pages - 1, act: { do: "cardPage", of, by: 1 } });
    text(ctx, `${g.page + 1}/${g.pages}`, right - 44, y + 15, { size: 12, color: INK.soft, align: "center" });
    button(ctx, boxes, { x: right - 88, y, w: 26, h: 22, label: "‹", size: 15, off: g.page <= 0, act: { do: "cardPage", of, by: -1 } });
    right -= 96;
  }
  if (mine && g.count) {
    const all = g.picked === g.count;
    button(ctx, boxes, { x: right - 74, y, w: 74, h: 22, label: all ? T.pickNone : T.pickAll, size: 12, act: { do: "pickAll", of, all: !all, n: g.count } });
    right -= 82;
  }
  const ships = fleetOf(u) ? ` · ${fleetOf(u)} ${T.ships}` : "";
  fit(ctx, fill(T.menUnits, men(u), g.count - fleetOf(u)) + ships, x + tw + 10, y + 15, right - x - tw - 14, { italic: true, size: 12, color: INK.soft });
}

/**
 * Kendi şehrinin kartı, üç sütun: şehir (nüfus, garnizon, üretim, sadakat; altta ordu
 * çıkarma) | sekmeler: Şehir (yükseltmeler), Asker bas (asker kartları), Liman (liman yapıları,
 * gemi yap), Yapılar, Harikalar, Garnizon (askerler kart kart: seç, dışarı çık).
 */
function cityCard(ctx, cam, game, ui, boxes, T) {
  const id = ui.sel.id, pl = game.places[id], p = byId[id];
  const tabs = ["city", "troops", ...(p.port ? ["port"] : []), "buildings", "officers", ...(p.kind === "castle" ? [] : ["wonders"]), "garrison"];
  const tab = tabs.includes(ui.cardTab) ? ui.cardTab : "city";
  const wonder = wondersAt(game, id)[0] ?? null;
  const A = 214, B = 265, C = 265, BC = B + GAP + C;
  const body = A + GAP + BC + PAD;
  // Görsel, garnizon ve içeridekiler soldaki kartta (sideCard); burada ne yapılacağı.
  const r = cardRect(cam, PAD + body, 252 + (wonder ? 18 : 0));
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  const y = r.y, H = r.h;
  let x = r.x + PAD;
  const of = "p:" + id;

  // Şehir: ad, türü, (harika), nüfus, garnizon, turluk üretim, sadakat.
  text(ctx, p.name[ui.lang], x, y + 32, { title: true, bold: true, size: 19 });
  fit(ctx, kindLine(id, game, T, true), x, y + 50, A, { italic: true, size: 12, color: INK.soft });
  let ay = y + 72;
  if (wonder) {
    wonderLine(ctx, id, T, x, ay - 2, A, wonder.id);
    ay += 18;
  }
  const pw = amount(ctx, "pop", `${pl.pop} / ${Math.round(popCap(pl, p.kind))}`, x, ay, { size: 13 });
  const note = besieged(game, id) ? T.besiegedNote : blockaded(game, id) ? T.blockadeNote : null;
  if (note) fit(ctx, note, x + pw + 10, ay, A - pw - 10, { italic: true, bold: true, size: 11, color: INK.bad });
  ay += 24;
  const o = output(game, id);
  let cx = x;
  for (const k of ["money", "weapons", "food"]) cx += amount(ctx, k, delta(o[k]), cx, ay, { size: 13 }) + 12;
  loyaltyRow(ctx, game, boxes, T, id, x, ay + 12, A);
  if (tab === "garrison") {
    // Seçili kartlar dışarı çıkar; istersen başlarına bir general geçer (fiyatıyla).
    const n = picksOf(ui, of, pl).size;
    const cost = N.generals.cost, rich = game.civs[game.player].money >= cost;
    const pick = n ? null : [T.pickFirst, "bad"];
    const gb = { x, y: y + H - 82, w: A, h: 30 };
    button(ctx, boxes, {
      ...gb, label: "", off: !n || !rich,
      act: { do: "march", id, general: true }, tip: [T.withGeneral, T.tipWithGeneral, pick ?? (rich ? null : [T.whyMoney, "bad"])],
    });
    const c = !n || !rich ? INK.faint : INK.ink;
    const lw = measure(ctx, "★ " + T.withGeneral, { bold: true, size: 13 });
    const total = lw + 6 + 13 + 3 + measure(ctx, String(cost), { bold: true, size: 13 });
    const sx = gb.x + (gb.w - total) / 2;
    text(ctx, "★ " + T.withGeneral, sx, gb.y + 20, { bold: true, size: 13, color: c });
    amount(ctx, "money", cost, sx + lw + 6, gb.y + 20, { size: 13, bold: true, color: c });
    button(ctx, boxes, {
      x, y: y + H - 44, w: A, h: 32, label: n ? fill(T.marchOutN, n) : T.marchOut, main: true, size: 14, off: !n,
      act: { do: "march", id }, tip: [T.marchOut, T.tipMarchOut, pick],
    });
  } else {
    button(ctx, boxes, {
      x, y: y + H - 44, w: A, h: 32, label: T.formArmy, main: true, size: 14,
      off: men(pl) === 0 && !fleetOf(pl), act: { do: "cardTab", tab: "garrison" }, tip: [T.formArmy, T.tipForm],
    });
  }

  // Sekmeler: ikinci ve üçüncü sütunun üstünde.
  x += A + GAP;
  vrule(ctx, x - GAP / 2, y + 14, y + H - 14);
  const label = { city: T.tabCity, troops: "⚑ " + T.tabTroops, port: "⚓ " + T.tabPort, buildings: "⌂ " + T.tabBuildings, officers: "★ " + T.tabOfficers, wonders: "✦ " + T.tabWonders, garrison: "⚔ " + T.tabGarrison + (cardsOf(pl).length ? ` · ${cardsOf(pl).length}` : "") };
  // Sekme genişliği yazısına göre; artan yer eşit dağılır.
  const tsize = tabs.length > 4 ? 12 : 13, tgap = tabs.length > 5 ? 6 : 8;
  const natural = tabs.map((k) => measure(ctx, label[k], { bold: true, size: tsize }) + 16);
  const spare = (BC - tgap * (tabs.length - 1) - natural.reduce((a, b) => a + b, 0)) / tabs.length;
  let tx = x;
  tabs.forEach((k, i) => {
    const tw = natural[i] + spare;
    button(ctx, boxes, { x: tx, y: y + 14, w: tw, h: 28, label: label[k], size: tsize, main: tab === k, act: { do: "cardTab", tab: k } });
    tx += tw + tgap;
  });
  const top = y + 50;
  if (tab === "wonders") wondersTab(ctx, game, ui, boxes, T, id, x, top, BC, y + H - 12 - top);
  else if (tab === "officers") officersTab(ctx, game, boxes, T, ui, id, x, top, BC, y + H - 12 - top);
  else if (tab === "buildings") {
    // Yapılar: dört bina solda (kartlarında etkileri), sağda şehrin ticaret yolları (pazar yol açar).
    buildersRow(ctx, game, boxes, T, id, x, top, B);
    buildingCards(ctx, game, boxes, T, id, BUILDINGS, x, top + 26, B, y + H - 12 - (top + 26));
    const xc = x + B + GAP;
    vrule(ctx, xc - GAP / 2, top + 4, y + H - 14);
    tradeBlock(ctx, game, boxes, T, ui, id, xc, top, C, y + H - 12 - top);
  }
  else if (tab === "garrison") {
    const g = cardGrid(ctx, boxes, T, ui, pl, pl.owner, of, { x, y: top + 26, w: BC, h: y + H - 12 - (top + 26), rest: !!restPlace(game, pl, id) }, true);
    gridHead(ctx, boxes, T, pl, of, T.garrison, x, top, BC, g, true);
  } else if (tab === "troops") recruitBlock(ctx, game, boxes, T, id, x, top, BC, y + H - 12 - (top + 26));
  else if (tab === "port") {
    buildersRow(ctx, game, boxes, T, id, x, top, B);
    buildingCards(ctx, game, boxes, T, id, PORT_UPGRADES, x, top + 26, B, y + H - 12 - (top + 26));
    // Gemi yap.
    const xc = x + B + GAP;
    vrule(ctx, xc - GAP / 2, top + 4, y + H - 14);
    fleetBlock(ctx, game, boxes, T, id, xc, y + 32, C, H - 32);
  } else {
    // Şehir: dört yükseltme kartı bütün genişlikte (asker basma kendi sekmesinde).
    buildersRow(ctx, game, boxes, T, id, x, top, BC);
    buildingCards(ctx, game, boxes, T, id, UPGRADES, x, top + 26, BC, y + H - 12 - (top + 26));
  }
  closeX(ctx, boxes, r);
  return r;
}

/**
 * Ticaret yolları (trade.js): başlıkta kaç yol / kaç yuva; her yol bir satır - nereye, karadan mı
 * denizden mi, turluk parası, kapatma; başkalarının bu şehre kurduğu yollar soluk. Altta Yol kur.
 */
function tradeBlock(ctx, game, boxes, T, ui, id, x, y, w, h) {
  const slots = slotsOf(game, id), out = routesFrom(game, id);
  const inn = (game.routes ?? []).filter((r) => r.to === id);
  const tw = text(ctx, T.tradeRoutes, x, y + 15, { bold: true, size: 13 });
  text(ctx, `${out.length} / ${slots}`, x + w, y + 15, { italic: true, size: 12, color: slots ? INK.soft : INK.faint, align: "right" });
  boxes.push({ x, y, w: tw, h: 20, act: null, tip: [T.tradeRoutes, T.tradeTip] });
  if (!slots && !inn.length) {
    lines(ctx, T.tradeNone, x, y + 40, w, { size: 12, italic: true, color: INK.soft }, 5, 16);
    return;
  }
  let ly = y + 26;
  const row = (r, mine) => {
    const other = mine ? r.to : r.from, on = flowing(game, r), v = valueOf(game, r.from, r.to);
    const name = (r.way === "sea" ? "⛵ " : "⇢ ") + placeName(other, ui.lang);
    const owner = game.places[other].owner;
    fit(ctx, name, x, ly + 15, w - 96, { bold: mine, size: 13, color: mine ? INK.ink : INK.soft });
    fit(ctx, owner && owner !== game.player ? civName(owner, ui.lang) : owner ? "" : T.free, x + 14, ly + 29, w - 110, { italic: true, size: 10.5, color: INK.soft });
    amount(ctx, "money", on ? `+${v}` : T.tradeHalted, x + w - (mine ? 88 : 54), ly + 15, { size: 12, bold: true, color: on ? INK.good : INK.faint });
    if (mine) button(ctx, boxes, { x: x + w - 26, y: ly + 3, w: 24, h: 22, label: "✕", size: 12, act: { do: "closeRoute", from: r.from, to: r.to }, tip: [T.tradeClose] });
    boxes.push({ x, y: ly, w: w - 30, h: 32, act: null, tip: [placeName(other, ui.lang), fill(T.tradeLine, v), r.way === "sea" ? T.tradeSea : T.tradeLand] });
    ly += 34;
  };
  for (const r of out) if (ly + 34 < y + h - 34) row(r, true);
  for (const r of inn) if (ly + 34 < y + h - 34) row(r, false);
  const free = out.length < slots;
  if (slots) button(ctx, boxes, { x, y: y + h - 32, w, h: 30, label: T.tradeOpen, size: 13, main: free, off: !free, act: { do: "open", modal: "trade", id }, tip: [T.tradeOpen, T.tradeTip, free ? null : [T.tradeFull, "bad"]] });
}

/**
 * Komutanlar sekmesi (bölüm 14b; kullanıcı 27.10: "komutanları şehirlerde eğitelim, şehrin özelliklerine göre
 * rastgele oluşsunlar"): solda akademi kartı; sağda burada her tur komutan yetişme ihtimali, medeniyetin komutanı ve
 * tavanı, şehrin çevresi, yetişecek komutanın en olası yetenekleri (çubukla) ve burada bekleyenler.
 */
function officersTab(ctx, game, boxes, T, ui, id, x, y, w, h) {
  const pl = game.places[id], owner = pl.owner, AW = 150;
  buildersRow(ctx, game, boxes, T, id, x, y, AW);
  buildingCard(ctx, game, boxes, T, id, ACADEMY, x, y + 26, AW, h - 26);
  const rx = x + AW + GAP, rw = w - AW - GAP;
  vrule(ctx, rx - GAP / 2, y + 4, y + h - 2);
  let ly = y + 15;
  const pct = (v) => String(Math.round(v * 1000) / 10);
  text(ctx, T.officersHead, rx, ly, { bold: true, size: 13 });
  ly += 18;
  text(ctx, fill(T.officerChance, pct(chanceOf(game, id))), rx, ly, { size: 12, color: INK.soft });
  if (owner) {
    const cs = fill(T.officerCap, generalsOf(game, owner), capOf(game, owner));
    const cw = text(ctx, cs, rx + rw, ly, { size: 12, bold: true, color: INK.soft, align: "right" });
    boxes.push({ x: rx + rw - cw, y: ly - 13, w: cw, h: 17, act: null, tip: [cs, T.officerCapTip] });
  }
  ly += 17;
  const f = features()[id];
  const feats = [f.forest >= 0.3 ? T.featForest : null, f.open >= 0.5 ? T.featOpen : null, f.mountain >= 0.3 ? T.featMountain : null, f.roads >= 3 ? T.featRoads : null, byId[id].port ? T.featCoast : null].filter(Boolean);
  fit(ctx, fill(T.officerFeatures, feats.join(", ") || "—"), rx, ly, rw, { italic: true, size: 11.5, color: INK.soft });
  ly += 21;
  // Yatkınlık: en olası üç yetenek, payıyla.
  const lw = text(ctx, T.officerLeans, rx, ly, { bold: true, size: 12.5 });
  boxes.push({ x: rx, y: ly - 13, w: lw, h: 17, act: null, tip: [T.officerLeans, T.officerLeansTip] });
  const L = Object.entries(leanings(game, id)).filter(([, v]) => v > 0);
  const tot = L.reduce((n, [, v]) => n + v, 0);
  for (const [t, v] of L.sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    ly += 17;
    fit(ctx, T.skills[t][0], rx + 6, ly, 108, { size: 12 });
    const bx = rx + 118, bw = rw - 118 - 40, k = v / tot;
    ctx.fillStyle = "rgba(90,70,40,0.18)";
    ctx.fillRect(bx, ly - 8, bw, 7);
    ctx.fillStyle = INK.warn;
    ctx.fillRect(bx, ly - 8, bw * Math.min(1, k * 2), 7);
    text(ctx, fill(T.pct, Math.round(k * 100)), rx + rw, ly, { size: 11.5, bold: true, color: INK.soft, align: "right" });
    boxes.push({ x: rx, y: ly - 13, w: rw, h: 17, act: null, tip: [T.skills[t][0], T.skills[t][1]] });
  }
  ly += 23;
  // Burada bekleyenler.
  const here = (owner ? game.civs[owner].officers ?? [] : []).filter((o) => o.at === id);
  text(ctx, T.officersWaiting, rx, ly, { bold: true, size: 12.5 });
  if (!here.length) text(ctx, T.officersNone, rx + rw, ly, { italic: true, size: 11.5, color: INK.faint, align: "right" });
  for (const o of here.slice(0, 2)) {
    ly += 17;
    const sw = text(ctx, "★".repeat(o.level), rx + 6, ly, { size: 11, bold: true, color: INK.warn });
    fit(ctx, `${o.name} · ${o.traits.map((t) => T.skills[t][0]).join(", ")}`, rx + 10 + sw, ly, rw - 14 - sw, { size: 12, bold: true });
    boxes.push({ x: rx, y: ly - 13, w: rw, h: 17, act: null, tip: [o.name, ...o.traits.map((t) => `${T.skills[t][0]}: ${T.skills[t][1]}`), T.officerWaitTip] });
  }
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
/**
 * Bina kartları (kullanıcı 26.10: "Total War'da görsel vardı, sağ üst köşesinde seviyesi
 * yazıyordu"): her yapı bir kart - üstte resmi (seviyesi arttıkça sahne zenginleşir, view/
 * buildings.js), sağ üst köşede seviye rozeti, altında adı ve şu an ne getirdiği; kartın kendisi
 * Yükselt düğmesi (actionCard: fiyat resmin altında, sürüyorsa ilerleme, kilitliyse neden).
 */
function buildingCards(ctx, game, boxes, T, id, list, x, y, w, h) {
  const gap = 6, cw = (w - gap * (list.length - 1)) / list.length;
  list.forEach((what, i) => buildingCard(ctx, game, boxes, T, id, what, x + i * (cw + gap), y, cw, h));
}

/** Süren inşaatı hızlandırma (bölüm 4): basılırsa { act, tip, cost }; para yetmiyorsa basılmaz, ipucunda neden. */
function rushOf(game, id, what, T) {
  const r = rushInfo(game, id, what);
  if (r.why === "none") return null;
  if (r.why === "soon") return { act: null, tip: T.rushSoon, cost: 0 };
  return { act: r.why ? null : { do: "rush", id, what }, tip: [fill(T.rushTip, r.cost), r.why === "money" ? [T.whyMoney, "bad"] : null], cost: r.cost };
}

function buildingCard(ctx, game, boxes, T, id, what, x, y, w, h) {
  const u = upgradeInfo(game, id, what), pl = game.places[id];
  const next = u.why === "max" ? null : fill(T.nextLevel, effect(game, id, what, T));
  const tip = [`${T[what]} · ${fill(T.levelOf, u.now)}`, T.tipUpgrade[what], next, u.why === "max" ? null : fill(T.takesTurns, turnsText(u.turns, T))];
  const locked = u.why === "needLevel" || u.why === "notPort" || !!u.why?.startsWith("tech_");
  // Kart dar: kısa neden (teknolojinin adı); uzun cümle ipucunda.
  const why = !locked ? null : u.why === "needLevel" ? fill(T.lockLevel, u.now + 1) : u.why.startsWith("tech_") ? T.techs[u.why.slice(5)][0] : whyText(u.why, T);
  const b = u.building;
  actionCard(ctx, boxes, {
    x, y, w, h, act: { do: "upgrade", id, what }, label: "▲",
    art: (ix, iy, iw, ih) => buildingArt(ctx, what, ix, iy, iw, ih, u.now, pl.owner),
    badge: u.now, name: what === "level" ? T.cityCard : T[what],
    sub: why ?? nowFx(game, id, what, T), subColor: u.now > 0 ? GOLD_LIGHT : "rgba(243,231,201,0.5)",
    state: b ? "busy" : u.why === "max" ? "max" : locked ? "locked" : u.why ? "off" : "ready",
    cost: { money: u.cost }, purse: game.civs[pl.owner], maxText: T.maxShort,
    busy: b && { part: (b.total - b.left) / b.total, text: b.left === 1 ? T.turnsOne : fill(T.turnsN, b.left), act: { do: "cancelBuild", id, what }, tip: [T.cancelBuild, fill(T.refundTip, b.paid)],
      rush: rushOf(game, id, what, T) },
    tip: [...tip, u.why && u.why !== "max" && u.why !== "building" ? [u.why === "done" ? T.whyJustTaken : whyText(u.why, T), "bad"] : null],
  });
}

/**
 * Kartın kendisi düğme (kullanıcı 26.10: "kartın altında para ve buton olmasın, görselin kendisi
 * buton olsun"): resmin her yerine basılır. Fiyat resmin alt kenarında koyu bir şeritte (kasada
 * yetmeyen kalem kırmızı); üstüne gelince kart kalkar, ortada ▲ ya da +10 belirir. Sağ üst köşede
 * rozet (seviye ya da sayı), altta ad ve bir satır (şu an getirdiği, işi ya da kilit nedeni).
 * Hâller: ready, off (para yok, hak bitti: kart soluk), locked (kilit resmin ortasında), busy
 * (inşaat: çekiç, ilerleme, sol üst köşede iptal), max (EN ÜST şeridi).
 */
function actionCard(ctx, boxes, o) {
  const { x, w, h, state } = o;
  const ready = state === "ready";
  const hot = over(x, o.y, w, h);
  const y = o.y + (ready && hot && !pointer.down ? -2 : 0);
  ctx.save();
  ctx.fillStyle = "rgba(25,18,10,0.3)";
  roundRect(ctx, x + 1.5, o.y + 2.5, w, h, 4);
  ctx.fill();
  if (ready && hot) {
    ctx.shadowColor = "rgba(255,200,90,0.6)";
    ctx.shadowBlur = 12;
  }
  roundRect(ctx, x, y, w, h, 4);
  ctx.fillStyle = DARK;
  ctx.fill();
  ctx.shadowBlur = 0;
  // Resim kartın büyük kısmı; altında ad ve bir satır.
  const ix = x + 3, iy = y + 3, iw = w - 6, ih = h - 6 - 36;
  const sh = 19, sy = iy + ih - sh, mid = iy + (ih - sh) / 2;
  ctx.save();
  roundRect(ctx, ix, iy, iw, ih, 2);
  ctx.clip();
  o.art(ix, iy, iw, ih);
  const dim = { off: 0.3, locked: 0.55, busy: 0.45 }[state] ?? 0;
  if (dim) {
    ctx.fillStyle = `rgba(20,14,8,${dim})`;
    ctx.fillRect(ix, iy, iw, ih);
  }
  // Alt şerit: fiyat, inşaat ilerlemesi ya da EN ÜST.
  const band = ctx.createLinearGradient(0, sy - 6, 0, iy + ih);
  band.addColorStop(0, "rgba(20,14,8,0)");
  band.addColorStop(0.35, "rgba(20,14,8,0.72)");
  band.addColorStop(1, "rgba(20,14,8,0.88)");
  ctx.fillStyle = band;
  ctx.fillRect(ix, sy - 6, iw, sh + 6);
  if (state === "busy") {
    text(ctx, o.busy.text, ix + iw / 2, sy + 9, { bold: true, size: 10.5, color: GOLD_LIGHT, align: "center" });
    ctx.fillStyle = "rgba(243,231,201,0.2)";
    ctx.fillRect(ix + 6, sy + 12, iw - 12, 4);
    ctx.fillStyle = GOLD;
    ctx.fillRect(ix + 6, sy + 12, (iw - 12) * o.busy.part, 4);
    ctx.save();
    ctx.translate(ix + iw / 2, mid);
    ctx.scale(2.2, 2.2);
    hammer(ctx, 0, 0, CREAM);
    ctx.restore();
  } else if (state === "max") {
    text(ctx, o.maxText, ix + iw / 2, sy + 14, { bold: true, size: 11, color: GOLD, align: "center" });
  } else {
    const parts = Object.entries(o.cost).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => [k, Math.round(v * 10) / 10]);
    let size = 11, gap = 9;
    const width = () => parts.reduce((t, [, v]) => t + 11 + 3 + measure(ctx, String(v), { size, bold: true }), 0) + gap * (parts.length - 1);
    if (width() > iw - 6) { size = 10; gap = 4; }
    let cx = ix + iw / 2 - width() / 2;
    for (const [k, v] of parts) {
      const short = (o.purse?.[k] ?? Infinity) < v;
      const color = short ? "#f08a70" : ready ? GOLD_LIGHT : "rgba(243,231,201,0.6)";
      cx += amount(ctx, k, v, cx, sy + 14, { size, bold: true, color }) + gap;
    }
  }
  if (state === "locked") {
    ctx.save();
    ctx.translate(ix + iw / 2, mid);
    ctx.scale(2.2, 2.2);
    lock(ctx, 0, -6);
    ctx.restore();
  }
  // Süren inşaat: üstüne gelince ortada » ve hızlandırmanın fiyatı.
  if (state === "busy" && o.busy.rush?.cost && hot) {
    ctx.beginPath();
    ctx.arc(ix + iw / 2, mid, 16, 0, TAU);
    ctx.fillStyle = "rgba(20,14,8,0.75)";
    ctx.fill();
    ctx.strokeStyle = o.busy.rush.act ? GOLD_LIGHT : "rgba(243,231,201,0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, "»", ix + iw / 2, mid + 6, { bold: true, size: 17, color: o.busy.rush.act ? GOLD_LIGHT : "rgba(243,231,201,0.5)", align: "center" });
    amount(ctx, "money", o.busy.rush.cost, ix + iw / 2 - 12, mid + 32, { size: 11, bold: true, color: o.busy.rush.act ? GOLD_LIGHT : "#f08a70" });
  }
  // Üstüne gelince: ortada ▲ ya da +10.
  if (ready && hot) {
    ctx.beginPath();
    ctx.arc(ix + iw / 2, mid, 16, 0, TAU);
    ctx.fillStyle = "rgba(20,14,8,0.6)";
    ctx.fill();
    ctx.strokeStyle = GOLD_LIGHT;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, o.label, ix + iw / 2, mid + 5, { bold: true, size: 14, color: GOLD_LIGHT, align: "center" });
  }
  ctx.restore();
  // Sağ üst köşe: seviye ya da sayı.
  const rx = x + w - 11, ry = y + 11;
  ctx.beginPath();
  ctx.arc(rx, ry, 9.5, 0, TAU);
  ctx.fillStyle = o.badge > 0 ? GOLD : "#6b6258";
  ctx.fill();
  ctx.strokeStyle = DARK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  text(ctx, String(o.badge), rx, ry + 4.5, { bold: true, size: 12, color: DARK, align: "center" });
  // Ad ve altındaki satır (kilitliyse neden).
  fit(ctx, o.name, x + w / 2, iy + ih + 16, w - 3, { bold: true, size: 12, min: 7.5, color: CREAM, align: "center" });
  const sub = state === "locked" ? { color: "#e9a58f", italic: false } : { color: o.subColor, italic: !!o.subItalic };
  fit(ctx, o.sub, x + w / 2, iy + ih + 30, w - 4, { size: 10.5, min: 8, ...sub, align: "center" });
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 4);
  ctx.strokeStyle = ready ? (hot ? GOLD_LIGHT : GOLD) : GOLD_DARK;
  ctx.lineWidth = ready ? (hot ? 2.2 : 1.8) : 1.1;
  ctx.stroke();
  ctx.restore();
  const rushTip = state === "busy" && o.busy.rush ? (Array.isArray(o.busy.rush.tip) ? o.busy.rush.tip : [o.busy.rush.tip]) : [];
  boxes.push({ x, y: o.y, w, h, act: ready ? o.act : state === "busy" ? o.busy.rush?.act ?? null : null, tip: rushTip.length ? [...o.tip, ...rushTip] : o.tip, want: o.act });
  // İnşaat sürüyorsa sol üst köşede iptal.
  if (state === "busy") {
    const bx = x + 11, by = y + 11, chot = over(bx - 9, by - 9, 18, 18);
    ctx.beginPath();
    ctx.arc(bx, by, 9, 0, TAU);
    ctx.fillStyle = chot ? "#8a2f20" : "rgba(20,14,8,0.75)";
    ctx.fill();
    ctx.strokeStyle = "rgba(243,231,201,0.7)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    text(ctx, "✕", bx, by + 4, { bold: true, size: 11, color: CREAM, align: "center" });
    boxes.push({ x: bx - 9, y: by - 9, w: 18, h: 18, act: o.busy.act, tip: o.busy.tip });
  }
}

/** Bir yükseltmenin bir seviyesinin getirdiği, yazıyla (main.js: bitince şehrin üstünden yükselir). */
export const gainText = (game, id, what, lang) => effect(game, id, what, TEXT[lang]);

/** Küçük asma kilit (kilitli bina kartında). */
function lock(ctx, cx, y) {
  ctx.save();
  ctx.strokeStyle = "rgba(243,231,201,0.6)";
  ctx.fillStyle = "rgba(243,231,201,0.6)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, y + 5, 3, Math.PI, TAU);
  ctx.stroke();
  ctx.fillRect(cx - 4.5, y + 5, 9, 7);
  ctx.restore();
}

/** Bir yapının şu an ne getirdiği (kartın altındaki satır). */
function nowFx(game, id, what, T) {
  const pl = game.places[id], p = byId[id], c = pl.owner;
  const castle = p.kind === "castle" ? N.castleOutput : 1;
  const r1 = (n) => String(Math.round(n * 10) / 10);
  // Henüz yapılmamış yapı bir şey getirmiyor.
  if (!pl[what] && !["level", "fishery"].includes(what)) return "—";
  switch (what) {
    case "level": return fill(T.fxPop, Math.round(popCap(pl, p.kind)));
    case "farms": return fill(T.fxFood, r1(pl.farms * N.wheatPerFarm * castle * trait(c, "wheat") * techMul(game, c, "wheat")));
    case "industry": return fill(T.fxWeapons, r1(pl.industry * castle * trait(c, "weapons") * techMul(game, c, "weapons")));
    case "barracks": return fill(T.fxCompanies, pl.barracks);
    case "fishery": return fill(T.fxFood, r1((N.fish + pl.fishery * N.port.fishPerLevel) * castle * trait(c, "fish") * techMul(game, c, "fish")));
    case "shipyard": return fill(T.fxShips, pl.shipyard);
    case "trade": return fill(T.fxMoney, r1(pl.trade * N.port.tradePerLevel * castle * trait(c, "money")));
    case "fort": return fill(T.fxFort, Math.round((1 + pl.fort * N.port.fortPerLevel) * 100) / 100);
    case "temple": return fill(T.fxLoyalty, pl.temple * N.buildings.temple);
    case "market": return fill(T.fxMoneyPct, Math.round(pl.market * N.buildings.market * 100));
    case "school": return fill(T.fxScience, pl.school * N.buildings.school);
    case "baths": return fill(T.fxGrowth, Math.round(pl.baths * N.buildings.baths * 100));
    case "academy": return `★ %${Math.round(chanceOf(game, id) * 1000) / 10}`;
    default: return "";
  }
}

/**
 * Bir birliğin resmi (birlik kartı ve asker basma kartı): sahibinin renginde gök, toprak (gemide
 * deniz); piyade ve okçu üç asker, süvari bir atlı, kuşatma makinesi; gemiler türüne göre.
 */
function troopArt(ctx, type, owner, ix, iy, iw, ih, k) {
  const ground = iy + ih * 0.8;
  ctx.save();
  roundRect(ctx, ix, iy, iw, ih, 2);
  ctx.clip();
  const boat = SHIPS.includes(type);
  const sky = ctx.createLinearGradient(0, iy, 0, ground);
  sky.addColorStop(0, shade(colorOf(owner), -0.35));
  sky.addColorStop(1, shade(colorOf(owner), 0.45));
  ctx.fillStyle = sky;
  ctx.fillRect(ix, iy, iw, ih);
  ctx.fillStyle = boat ? "#55777e" : "#9c8559";
  ctx.fillRect(ix, ground, iw, iy + ih - ground);
  const cx = ix + iw / 2;
  // Gemiler: kadırga yalın, trireme mahmuzlu ve büyük, kinkerem en büyüğü ve küpeştesinde askerler.
  if (boat) galley(ctx, owner, cx, ground + 1 * k, Math.min((type === "quinq" ? 1.02 : type === "trireme" ? 0.95 : 0.85) * k, iw / 54), { troops: type === "quinq" });
  else if (type === "cav" && iw > ih * 1.5) {
    trooper(ctx, "cav", owner, cx + 18 * k, ground - 1 * k, -1, 1.05 * k);
    trooper(ctx, "cav", owner, cx - 14 * k, ground + 4 * k, -1, 1.2 * k);
  } else if (type === "cav") trooper(ctx, "cav", owner, cx - 4 * k, ground + 4 * k, -1, 1.2 * k);
  else if (type === "siege") trooper(ctx, "siege", owner, cx - 3 * k, ground + 3 * k, -1, 1.4 * k);
  else if (type === "elite" && owner === "carthage") trooper(ctx, "elite", owner, cx - 4 * k, ground + 4 * k, -1, 1.2 * k);
  else if (type === "elite" && uniqueOf(owner).as !== "inf") {
    if (iw > ih * 1.5) trooper(ctx, "elite", owner, cx + 18 * k, ground - 1 * k, -1, 1.05 * k);
    trooper(ctx, "elite", owner, iw > ih * 1.5 ? cx - 14 * k : cx - 4 * k, ground + 4 * k, -1, 1.2 * k);
  } else if (iw > ih * 1.5) {
    for (const dx of [-24, 0, 24]) trooper(ctx, type, owner, cx + dx * k, ground - 1 * k, -1, 1.05 * k);
    for (const dx of [-12, 12]) trooper(ctx, type, owner, cx + dx * k, ground + 5 * k, -1, 1.3 * k);
  } else {
    // Üç asker: arkada iki, önde bir.
    trooper(ctx, type, owner, cx - 11 * k, ground - 1 * k, -1, 1.1 * k);
    trooper(ctx, type, owner, cx + 10 * k, ground - 1 * k, -1, 1.1 * k);
    trooper(ctx, type, owner, cx - 1 * k, ground + 5 * k, -1, 1.3 * k);
  }
  ctx.restore();
}

/**
 * Asker bas (kullanıcı 26.10: "asker basma işini de böyle yapmamız lazım" - bina kartları gibi):
 * dört tür, her biri bir kart - resmi, sağ üst köşede bu şehirde kaç bölüğü olduğu, adı ve işi,
 * maliyeti; karta basınca +10 (kilitliyse asma kilit ve neden). Üstte bu tur kaç hak kaldığı.
 */
function recruitBlock(ctx, game, boxes, T, id, x, y, w, h) {
  const ri = recruitInfo(game, id, "inf");
  const lw = text(ctx, T.recruit, x, y + 15, { bold: true, size: 13 });
  fit(ctx, fill(T.companyMen, N.company), x + lw + 10, y + 15, w / 2 - lw - 10, { italic: true, size: 12, color: INK.soft });
  const why = ri.why && ri.why !== "done" ? whyText(ri.why, T) : fill(T.recruitLeft, ri.left);
  fit(ctx, why, x + w, y + 15, w / 2, { italic: true, size: 12, color: ri.why && ri.why !== "done" ? INK.bad : INK.good, align: "right" });
  const gap = 6, cw = (w - gap * (UNITS.length - 1)) / UNITS.length;
  const pl = game.places[id];
  UNITS.forEach((type, i) => {
    const info = recruitInfo(game, id, type);
    const elite = type === "elite";
    const name = elite ? "★ " + unitTitle(T, type, pl.owner) : T.unitShort[type];
    troopCard(ctx, boxes, T, {
      x: x + i * (cw + gap), y: y + 26, w: cw, h, type, owner: pl.owner, name, have: Math.ceil((pl[type] ?? 0) / N.company),
      role: elite ? T.eliteOf[pl.owner]?.[1] : null,
      cost: recruitCost(game.player, type), purse: game.civs[game.player], why: info.why, plus: "+" + N.company, act: { do: "recruit", id, type },
      tip: [name, unitTip(T, type, pl.owner), info.why ? [whyText(info.why, T), "bad"] : null],
    });
  });
}

/** Asker ya da gemi kartı: resim (kartın kendisi düğme), köşede sayı, ad ve işi, resmin altında fiyat. */
function troopCard(ctx, boxes, T, o) {
  const { why } = o;
  const locked = !!why && (why.startsWith("need") || why.startsWith("tech_") || why === "notPort");
  actionCard(ctx, boxes, {
    ...o, label: o.plus,
    art: (ix, iy, iw, ih) => troopArt(ctx, o.type, o.owner, ix, iy, iw, ih, Math.min(iw / 58, ih / 62)),
    badge: o.have, sub: locked ? (why.startsWith("tech_") ? T.techs[why.slice(5)][0] : whyText(why, T)) : o.role ?? T.role[o.type],
    subColor: "rgba(243,231,201,0.7)", subItalic: true, state: locked ? "locked" : why ? "off" : "ready",
  });
}

/** Bir gemi türünün sayıları: kaç asker taşır, savaşta gücü. */
const shipLine = (type, T) => fill(T.shipStats, N.navy.types[type].carry, N.navy.types[type].might);

/**
 * Liman sekmesinde sağ sütun: buradaki filo ve abluka; üç gemi türü (kadırga, trireme,
 * kinkerem), her biri kendi düğmesiyle - kapalıysa altında neden (tersane 2 gerek...).
 */
function fleetBlock(ctx, game, boxes, T, id, x, y, w, H) {
  const pl = game.places[id];
  const shut = blockaded(game, id);
  const hw = text(ctx, `⛵ ${T.fleetHere}: ${shipsAt(game, id)}`, x, y + 32, { bold: true, size: 14 });
  boxes.push({ x, y: y + 18, w: hw, h: 20, act: null, tip: [T.fleetHere, fill(T.navalDefence, Math.round(fortOf(game, id) * 100) / 100)] });
  fit(ctx, shut ? T.blockaded.toLocaleUpperCase() : T.openSea, x + hw + 10, y + 32, w - hw - 10, { italic: true, bold: shut, size: 12, color: shut ? INK.bad : INK.good });
  const left = shipInfo(game, id).left;
  fit(ctx, fill(T.shipsLeft, left), x, y + 50, w, { italic: true, size: 12, color: INK.soft });
  // Üç gemi türü, her biri bir kart (asker basma kartları gibi).
  const gap = 6, cw = (w - gap * 2) / 3, top = y + 58, ch = H - 58 - 12;
  SHIPS.forEach((type, i) => {
    const si = shipInfo(game, id, type);
    troopCard(ctx, boxes, T, {
      x: x + i * (cw + gap), y: top, w: cw, h: ch, type, owner: pl.owner, name: T.shipNames[type], have: pl[type] ?? 0,
      cost: si.cost, purse: game.civs[game.player], why: si.why, plus: "+1", act: { do: "buildShip", id, type },
      tip: [T.shipNames[type], shipLine(type, T), T.shipTips[type], si.why ? [whyText(si.why, T), "bad"] : null],
    });
  });
}

function effect(game, id, what, T) {
  const pl = game.places[id], p = byId[id], c = pl.owner;
  const castle = p.kind === "castle" ? N.castleOutput : 1;
  const r1 = (n) => String(Math.round(n * 10) / 10);
  if (what === "level") return fill(T.levelFx, Math.round(popCap({ ...pl, level: pl.level + 1 }, p.kind)));
  if (what === "temple") return fill(T.templeFx, N.buildings.temple);
  if (what === "market") return fill(T.marketFx, Math.round(N.buildings.market * 100));
  if (what === "school") return fill(T.schoolFx, N.buildings.school);
  if (what === "baths") return fill(T.bathsFx, Math.round(N.buildings.baths * 100));
  if (what === "academy") return fill(T.academyFx, Math.round(N.officers.academy * 1000) / 10);
  if (what === "farms") return fill(T.farmsFx, r1(N.wheatPerFarm * castle * trait(c, "wheat")));
  if (what === "industry") return fill(T.industryFx, r1(castle * trait(c, "weapons"))) + (pl.industry + 1 === 3 ? " · " + T.industrySiege : "");
  if (what === "fishery") return fill(T.fisheryFx, r1(N.port.fishPerLevel * castle * trait(c, "fish")));
  if (what === "trade") return fill(T.tradeFx, r1(N.port.tradePerLevel * castle * trait(c, "money")));
  if (what === "fort") return fill(T.fortFx, Math.round((1 + (pl.fort + 1) * N.port.fortPerLevel) * 100) / 100);
  if (what === "shipyard") {
    const unlock = SHIPS.find((k) => N.navy.types[k].yard === pl.shipyard + 1);
    return fill(T.shipyardFx, pl.shipyard + 1, Math.max(1, N.navy.types.ships.money - pl.shipyard * N.port.shipDiscount)) + (unlock ? " · " + fill(T.shipyardUnlock, T.shipNames[unlock]) : "");
  }
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
function wonderLine(ctx, id, T, x, y, w = 324, wid = wonderAt(id)?.id) {
  const [name, gift] = T.wonders[wid];
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

const oddsLabel = (odds, T) => (odds === "easy" ? [T.easy, INK.good] : odds === "risky" ? [T.risky, INK.warn] : [T.hopeless, INK.bad]);

/**
 * Ordu kartı: ordu (sahibi, generali, kaç asker, gemileri, hareketi, yolu, kuşatması) |
 * birlikleri kart kart; kendi ordunsa kartları seçip ayırır, şehre bırakırsın; altta Yürü,
 * Ayır, Birleştir, Şehre gir (kuşatıyorsa Saldır, Kuşatmayı kaldır).
 */
function armyCard(ctx, cam, game, ui, boxes, T) {
  const a = armyById(game, ui.sel.id);
  const mine = a.owner === game.player;
  const g = a.general;
  const here = game.armies.filter((b) => b !== a && b.owner === a.owner && together(a, b));
  const A = 250, BC = 548;
  const r = cardRect(cam, PAD + A + GAP + BC + PAD, 252);
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  const y = r.y, H = r.h;
  let x = r.x + PAD;
  const of = "a:" + a.id;

  shield(ctx, a.owner, x, y + 15, 17);
  text(ctx, a.bandit || a.barbarian ? ownerName(a, T, ui.lang) : `${T.army} · ${civName(a.owner, ui.lang)}`, x + 24, y + 32, { title: true, bold: true, size: 17 });
  let ly = y + 56;
  if (g) {
    // General: yıldızlar seviyesi kadar, adı, ve yetenekleri.
    const sw = text(ctx, "★".repeat(g.level), x, ly, { size: 13, color: INK.warn, bold: true });
    fit(ctx, `${fill(T.general, g.name)} · ${fill(T.rank, g.level)}`, x + sw + 6, ly, A - sw - 6, { size: 14, bold: true });
    if (g.traits.length) { ly += 18; fit(ctx, g.traits.map((t) => T.skills[t][0] + " (" + T.skills[t][1] + ")").join(", "), x, ly, A, { size: 12, italic: true, color: INK.soft }); }
    ly += 24;
  } else if (mine && officerFor(game, a)) {
    // Şehirde yetişip bekleyen komutan (bölüm 14b): orduya en uygunu, bedava; ötekiler ipucunda.
    const o = officerFor(game, a), others = game.civs[a.owner].officers.filter((x) => x !== o);
    const skills = o.traits.map((t) => T.skills[t][0]).join(", ");
    const b = { x, y: ly - 18, w: A, h: 30, label: "", main: true, act: { do: "appoint", army: a.id, officer: o.id },
      tip: [fill(T.appointOfficer, o.name), fill(T.tipAppointOfficer, o.name, placeName(o.from, ui.lang)), ...o.traits.map((t) => `${T.skills[t][0]}: ${T.skills[t][1]}`), others.length ? fill(T.officersElse, others.map((x) => x.name).join(", ")) : null] };
    button(ctx, boxes, b);
    fit(ctx, `${"★".repeat(o.level)} ${fill(T.appointOfficer, o.name)} · ${skills}`, b.x + 8, b.y + 20, b.w - 16, { bold: true, size: 12.5, color: CREAM });
    ly += 30;
  } else if (mine) {
    // "General ata" ve fiyatı: yazı + para simgesi ortada.
    const ai = appointInfo(game, a.id);
    const off = ai.why === "money";
    const b = { x, y: ly - 18, w: A, h: 30, label: "", act: { do: "appoint", army: a.id }, off, tip: [T.appoint, T.tipAppoint, off ? [T.whyMoney, "bad"] : null] };
    button(ctx, boxes, b);
    const c = off ? INK.faint : INK.ink;
    const lw = measure(ctx, "★ " + T.appoint, { bold: true, size: 13 });
    const total = lw + 6 + 13 + 3 + measure(ctx, String(ai.cost), { bold: true, size: 13 });
    const sx = b.x + (b.w - total) / 2;
    text(ctx, "★ " + T.appoint, sx, b.y + 20, { bold: true, size: 13, color: c });
    amount(ctx, "money", ai.cost, sx + lw + 6, b.y + 20, { size: 13, bold: true, color: c });
    ly += 30;
  }
  // Tecrübe: rütbe şeritleri, adı ve savaştaki artısı; üstüne gelince ne zaman yükseleceği.
  const rk = veteranRank(a.xp), xp = a.xp ?? 0;
  if (rk || mine) {
    if (rk) chevrons(ctx, rk, x, ly - 13, 10);
    const rx = x + (rk ? 16 : 0);
    const rw = text(ctx, T.ranks[rk], rx, ly, { size: 13, bold: true, color: rk ? INK.warn : INK.soft });
    const bonus = Math.round((veteranMul(xp) - 1) * 100);
    if (rk) text(ctx, ` · +${fill(T.pct, bonus)}`, rx + rw, ly, { size: 13, color: INK.soft });
    const next = nextRankXp(xp);
    const line = next === null ? fill(T.rankTipTop, T.ranks[rk], bonus, xp) : fill(T.rankTip, T.ranks[rk], bonus, xp, next);
    boxes.push({ x, y: ly - 14, w: A, h: 18, act: null, tip: [T.mods.veteran, line, T.rankHow] });
    ly += 20;
  }
  ly += (lines(ctx, troops(T, a), x, ly, A, { size: 13 }, 2, 16) - 1) * 16 + 20;
  if (fleetOf(a)) {
    text(ctx, `⛵ ${fleetOf(a)} ${T.ships} · ${fill(T.carry, carryOf(a))}`, x, ly, { size: 13, color: canSail(a) ? INK.ink : INK.bad });
    ly += 20;
  }
  fit(ctx, whereText(a, T, ui.lang), x, ly, A, { size: 13, color: INK.soft });
  if (mine) {
    ly += 6;
    moveBar(ctx, boxes, T, a, x, ly, A);
    ly += 12;
  }
  if (a.route.length) {
    ly += 20;
    fit(ctx, routeText(a, T, ui.lang), x, ly, A, { size: 13, italic: true });
  }
  if (a.besieging) {
    ly += 20;
    lines(ctx, fill(T.siegeLine, placeName(a.besieging, ui.lang), game.turn - a.besiegedSince + 1, men(defenders(game, a.besieging))), x, ly, A, { size: 13, bold: true, color: INK.warn }, 2, 16);
  } else if (mine) lines(ctx, T.cardsHint, x, y + H - 34, A, { size: 12, italic: true, color: INK.soft }, 2, 15);

  // Birlikler: kart kart; kendi ordunsa altta eylemler.
  x += A + GAP;
  vrule(ctx, x - GAP / 2, y + 14, y + H - 14);
  const gy = y + 18;
  const bottom = mine ? y + H - 56 : y + H - 12;
  const grid = cardGrid(ctx, boxes, T, ui, a, a.owner, of, { x, y: gy + 26, w: BC, h: bottom - gy - 26, rest: mine && !!restPlace(game, a) }, mine);
  gridHead(ctx, boxes, T, a, of, T.units, x, gy, BC, grid, mine);
  if (mine) {
    const n = grid.picked;
    const part = n > 0 && n < grid.count;
    const acts = [];
    if (a.besieging) {
      if (canAttack(game, a, a.besieging)) acts.push({ label: T.attack, act: { do: "attackAsk", army: a.id, id: a.besieging }, main: true });
      acts.push({ label: T.liftSiege, act: { do: "lift", army: a.id } });
    }
    acts.push({ label: "➜ " + T.marchBtn, act: { do: "aim", army: a.id }, main: !a.besieging, tip: [T.marchBtn, T.tipMarchBtn] });
    if (!a.besieging) {
      acts.push({ label: part ? `${T.detachBtn} (${n})` : T.detachBtn, act: { do: "detach", army: a.id }, off: !part, tip: [T.detachBtn, T.tipDetach, part ? null : [T.pickFirst, "bad"]] });
      acts.push({ label: T.merge, act: { do: "merge", army: a.id }, off: !here.length, tip: [T.merge, T.tipMergeBtn] });
      if (a.at && game.places[a.at].owner === a.owner) acts.push({ label: T.station, act: { do: "station", army: a.id }, tip: [T.station, T.tipStationBtn] });
    }
    const bw = (BC - 8 * (acts.length - 1)) / acts.length;
    acts.forEach((b, i) => button(ctx, boxes, { x: x + i * (bw + 8), y: y + H - 46, w: bw, h: 34, size: 13, ...b }));
  }
  closeX(ctx, boxes, r);
  return r;
}

// ---------------------------------------------------------------------------------------------
// Soldaki şehir kartı
//
// Kullanıcı 22.10: "şehre tıkladığımızda ekranın sağında kart çıksın: şehir bilgileri, güzel bir
// şehir görseli, hangi millet, garnizon kaç kişi, şehir seviyeleri, içeride kim var; aşağıdaki
// panelde yine yükseltme, asker oluşturma; diğer şehirlerde de sağda kim var kim yok". Yabancı
// yerin içi ancak görülüyorsa (sis) ya da casusu oradaysa bilinir; yoksa son casus raporu
// (kaç tur önceki olduğuyla). Casus buradan gönderilir (rules/spies.js).

export const SIDE_W = 284;

/**
 * Şehir kartının yeri: ekranın solunda, medeniyetin sancağının altında (kullanıcı 23.10: "sağa
 * değil sola alalım"); altta kart varsa onun üstünde biter.
 */
export function sideRect(cam, bottomTop = Infinity) {
  const y = 92; // sancak (hud.js hanging) 80 piksel iner
  return { x: 12, y, w: SIDE_W, h: Math.max(240, Math.min(cam.h - 12, bottomTop - 10) - y) };
}

/** Bir yer hakkında oyuncunun bildikleri: canlı (kendi, müttefik, casus içeride), görülen (sis), ya da eski rapor. */
function factsOf(game, ui, id) {
  const me = game.player, pl = game.places[id];
  const ally = pl.owner === me || (pl.owner && relation(game, me, pl.owner) === "ally");
  const spy = spyAt(game, me, id);
  const live = ally || !!spy?.at;
  const seen = live || !ui.fog || sight(game, me).has(id);
  const army = (a) => ({ owner: a.owner, men: men(a), ships: fleetOf(a), general: a.general?.name ?? null });
  if (seen) {
    return {
      live, seen, spy, age: 0,
      pop: pl.pop, loyalty: live ? pl.loyalty : null,
      garrison: pl, inside: armiesAt(game, id).map(army),
      gate: game.armies.filter((a) => !a.at && dist(a, POS[id]) <= N.reach.strike).map(army),
      works: live ? pl : null, builds: live ? pl.builds ?? [] : [],
    };
  }
  const rep = intelOf(game, me, id);
  if (!rep) return { live: false, seen: false, spy, rep: null };
  return {
    live: false, seen: false, spy, rep, age: game.turn - rep.turn,
    pop: rep.pop, loyalty: rep.loyalty, garrison: rep.garrison, inside: rep.inside, gate: rep.gate, works: rep, builds: rep.builds,
  };
}

function sideCard(ctx, cam, game, ui, boxes, T, bottomTop) {
  const id = ui.sel.id, pl = game.places[id], p = byId[id];
  const me = game.player;
  const own = pl.owner === me;
  const f = factsOf(game, ui, id);
  const old = !f.seen && !!f.rep; // eski raporun bilgileri soluk yazılır
  const tone = old ? INK.soft : INK.ink;
  // Kartın boyu içeriği kadar: satırlar sayılır, kalan yer görsele (en çok 200), kart da o kadar.
  const area = sideRect(cam, bottomTop);
  const armyRows = (n) => (n ? Math.min(n, 3) * 17 + (n > 3 ? 15 : 0) : 0);
  const rowsH = 18 + (old ? 18 : 0) + (f.pop !== undefined ? 18 : 0) + (f.loyalty !== null && f.loyalty !== undefined ? 18 : 0)
    + (f.works ? (p.port ? 52 : 17) + (f.builds?.length ? 18 : 0) + (BUILDINGS.some((k) => (f.works[k] ?? 0) > 0) ? 17 : 0) : 0)
    + (f.garrison ? 18 + armyRows(f.inside.length) + armyRows(f.gate.length) : 50);
  const actsH = own ? 0 : 42 + 42 + (pl.owner && relation(game, me, pl.owner) === "neutral" ? 42 : 0);
  const need = 8 + 26 + 36 + wondersAt(game, id).length * 16 + 26 + rowsH + actsH + 12;
  const VH = Math.max(92, Math.min(200, area.h - need));
  const r = { ...area, h: Math.min(area.h, VH + need) };
  panel(ctx, r.x, r.y, r.w, r.h, boxes);
  const x = r.x + 14, w = r.w - 28;

  // Görsel: yerin kendi arazisinde maketi; içi biliniyorsa önünde garnizonu kadar asker.
  const vr = { x: r.x + 8, y: r.y + 8, w: r.w - 16, h: VH };
  drawVignette(ctx, id, pl.owner, vr, pl.level, 2.6, f.works);
  if (f.garrison) {
    const g = f.garrison, total = men(g);
    const n = Math.min(6, Math.ceil(total / 30));
    const fs = Math.max(1.1, VH / 85);
    const kinds = UNITS.filter((k) => g[k] > 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(vr.x, vr.y, vr.w, vr.h);
    ctx.clip();
    for (let i = 0; i < n; i++) {
      const k = kinds.length ? kinds[i % kinds.length] : "inf";
      const left = i % 2 === 0, j = Math.floor(i / 2);
      const fx = left ? vr.x + 20 * fs + j * 20 * fs : vr.x + vr.w - 20 * fs - j * 20 * fs;
      trooper(ctx, k, pl.owner, fx, vr.y + vr.h - 8 - (j % 2) * 4, left ? -1 : 1, fs);
    }
    ctx.restore();
  }
  let y = vr.y + VH + 26;

  // Ad, sahibi, türü.
  shield(ctx, pl.owner, x, y - 15, 15);
  fit(ctx, p.name[ui.lang], x + 22, y, w - 22, { title: true, bold: true, size: 18 });
  y += 19;
  const rel = own ? null : pl.owner ? relation(game, me, pl.owner) : "free";
  const relText = rel === "war" ? [T.war, INK.bad] : rel === "ally" ? [T.ally, INK.good] : rel === "neutral" ? [T.neutral, INK.soft] : null;
  const ow = text(ctx, civName(pl.owner, ui.lang, T.free), x, y, { size: 13, bold: true, color: colorOf(pl.owner) });
  if (relText) text(ctx, " · " + relText[0], x + ow, y, { size: 13, italic: true, color: relText[1] });
  y += 17;
  fit(ctx, kindLine(id, game, T, !f.seen), x, y, w, { italic: true, size: 12, color: INK.soft });
  y += 8;
  for (const wd of wondersAt(game, id)) { y += 16; wonderLine(ctx, id, T, x, y, w, wd.id); }
  rule(ctx, x, x + w, y + 8);
  y += 26;

  // Satırlar: küçük başlık + değer.
  const row = (label, value, color = tone, h = 18, size = 13) => {
    const lw = text(ctx, label.toLocaleUpperCase(ui.lang), x, y, { bold: true, size: 10, color: INK.soft });
    fit(ctx, value, x + Math.max(lw + 8, 74), y, w - Math.max(lw + 8, 74), { size, color });
    y += h;
  };
  const walls = wallsOf(game, id);
  row(T.wallsShort, wallsText(walls, T), INK.ink);
  if (old) {
    text(ctx, fill(T.spyOld, f.age), x, y, { italic: true, bold: true, size: 12, color: INK.warn });
    y += 18;
  }
  if (f.pop !== undefined) row(T.popShort, own ? `${f.pop} / ${Math.round(popCap(pl, p.kind))}` : String(f.pop));
  if (f.loyalty !== null && f.loyalty !== undefined) row(T.loyalty, String(f.loyalty), f.loyalty < N.loyalty.unrest ? INK.bad : tone);
  if (f.works) {
    const wk = f.works;
    row(T.worksShort, `${T.levelShort} ${wk.level} · ${T.farms} ${wk.farms} · ${T.industry} ${wk.industry} · ${T.barracks} ${wk.barracks}`, tone, 17, 12);
    if (p.port) {
      row("", `${T.fishery} ${wk.fishery} · ${T.shipyard} ${wk.shipyard}`, tone, 17, 12);
      row("", `${T.trade} ${wk.trade} · ${T.fort} ${wk.fort}`, tone, 18, 12);
    }
    // Şehir binaları: sadece olanlar.
    const bl = BUILDINGS.filter((k) => (wk[k] ?? 0) > 0).map((k) => `${T[k]} ${wk[k]}`).join(" · ");
    if (bl) row("", bl, tone, 17, 12);
    if (f.builds?.length) row(T.buildingShort, f.builds.map((b) => `${buildName(T, b.what)} (${b.left === 1 ? T.turnsOne : fill(T.turnsN, b.left)})`).join(" · "), INK.warn);
  }
  if (f.garrison) {
    const g = f.garrison;
    row(T.garrison, men(g) ? troops(T, g) + (fleetOf(g) ? ` · ⛵ ${fleetOf(g)}` : "") : T.undefended);
    const list = (label, armies) => {
      if (!armies.length) return;
      const shown = armies.slice(0, 3);
      shown.forEach((a, i) => {
        const lab = i === 0 ? label : "";
        const lw = lab ? text(ctx, lab.toLocaleUpperCase(ui.lang), x, y, { bold: true, size: 10, color: INK.soft }) : 0;
        const ax = x + Math.max(lw + 8, 74);
        shield(ctx, a.owner, ax, y - 11, 11);
        const s = `${civName(a.owner, ui.lang, T.free)} · ${a.men ? fill(T.soldiers, a.men) : ""}${a.ships ? ` ⛵${a.ships}` : ""}${a.general ? ` ★ ${a.general}` : ""}`;
        fit(ctx, s, ax + 15, y, w - (ax - x) - 15, { size: 12, color: tone });
        y += 17;
      });
      if (armies.length > 3) { fit(ctx, fill(T.moreArmies, armies.length - 3), x + 74, y, w - 74, { italic: true, size: 11, color: INK.soft }); y += 15; }
    };
    list(T.insideShort, f.inside);
    list(T.gateShort, f.gate);
  } else {
    // Hiç bilgi yok: sisin içinde, casus da yok.
    y += 2;
    y += 16 * lines(ctx, T.fogInside, x, y, w, { italic: true, size: 12, color: INK.soft }, 3, 16);
  }

  if (own) return r;
  // Eylemler: saldırı (seçili ordu menzildeyse), casus, savaş ilanı.
  const army = ui.army ? armyById(game, ui.army) : null;
  let by = r.y + r.h - 46;
  const btn = (b) => { button(ctx, boxes, { x, y: by, w, h: 34, size: 13, ...b }); by -= 42; };
  if (pl.owner && rel === "neutral") {
    btn({ label: T.declareLong, off: !canDeclare(game, me, pl.owner), act: { do: "askWar", civ: pl.owner }, tip: [T.declareLong, fill(T.neutralBlock, civName(pl.owner, ui.lang))] });
  }
  // Casus: yolda mı, içeride mi, yoksa gönder.
  if (f.spy) {
    const s = f.spy;
    const msg = s.at ? T.spyInside : fill(s.eta - game.turn <= 1 ? T.spyRoadOne : T.spyRoad, s.eta - game.turn);
    text(ctx, "👁 " + msg, x, by + 22, { italic: true, bold: true, size: 12, color: s.at ? INK.good : INK.warn });
    by -= 30;
  } else {
    const si = spyInfo(game, me, id);
    const turns = si.turns === 1 ? T.turnsOne : fill(T.turnsN, si.turns);
    const b = { x, y: by, w, h: 34, label: "", off: !!si.why, act: { do: "spy", id }, tip: [T.spySend, fill(T.tipSpy, turns), si.why ? [T["whySpy" + si.why[0].toUpperCase() + si.why.slice(1)] ?? whyText(si.why, T), "bad"] : null] };
    button(ctx, boxes, b);
    const c = si.why ? INK.faint : INK.ink;
    const lw = measure(ctx, T.spySend, { bold: true, size: 13 });
    const tail = ` · ${turns}`;
    const total = lw + 6 + 13 + 3 + measure(ctx, String(si.cost) + tail, { bold: true, size: 13 });
    const sx = b.x + (b.w - total) / 2;
    text(ctx, T.spySend, sx, b.y + 22, { bold: true, size: 13, color: c });
    amount(ctx, "money", si.cost, sx + lw + 6, b.y + 22, { size: 13, bold: true, color: c });
    text(ctx, tail, sx + lw + 6 + 16 + measure(ctx, String(si.cost), { bold: true, size: 13 }), b.y + 22, { bold: true, size: 13, color: c });
    by -= 42;
  }
  if (army && canAttack(game, army, id)) {
    const e = forecast(game, army, me, id);
    const [label] = oddsLabel(e.odds, T);
    btn({ label: `${T.attack} · ${label}`, main: true, act: { do: "attackAsk", army: army.id, id }, tip: [T.attack, `${T.odds}: ${label}`, fill(T.expect, e.lost, e.killed)] });
  }
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

// ---- haritada savaş ----
//
// Kullanıcı 23.10 "savaşlar cansız": sonuç penceresi yerine savaş haritada oynar. Sahne
// (battle.js) savaşın yerinin üstünde, ucu oraya bakan bir pano; bitince üstte sonuç şeridi
// belirir ve kendiliğinden kaybolur (basınca hemen). Pencere değil: harita görünür kalır.

/** Sonuç şeridi bu kadar milisaniye kalır (sahneden sonra). */
export const RIBBON_MS = 5200;
export const FIGHT_MS = SCENE_MS + RIBBON_MS;

function drawFight(ctx, cam, game, ui, boxes, T) {
  const e = ui.fight.ev;
  const t = performance.now() - ui.fight.t0;
  if (t < SCENE_MS + 400 && !e.tactical) fightScene(ctx, cam, game, e, t);
  if (t > SCENE_MS - 250) fightRibbon(ctx, cam, ui, boxes, T, e, t - SCENE_MS + 250, game.player);
}

/** Sahne: savaşın yerinin üstünde (sığmazsa altında) bir pano; açılırken belirir, biterken söner. */
function fightScene(ctx, cam, game, e, t) {
  const pt = e.at ?? POS[e.place];
  const s = toScreen(cam, pt.x, pt.y);
  const W = 340, H = 168;
  const x = Math.round(Math.max(12, Math.min(cam.w - W - 12, s.x - W / 2)));
  const above = s.y - H - 30 > TOP + 8;
  const y = Math.round(Math.max(TOP + 8, Math.min(cam.h - H - 12, above ? s.y - H - 30 : s.y + 30)));
  ctx.save();
  ctx.globalAlpha = Math.min(1, t / 220) * (t > SCENE_MS ? Math.max(0, 1 - (t - SCENE_MS) / 400) : 1);
  // Uç: panodan savaşın yerine.
  const tipX = Math.max(x + 24, Math.min(x + W - 24, s.x));
  ctx.beginPath();
  ctx.moveTo(tipX - 12, above ? y + H - 2 : y + 2);
  ctx.lineTo(s.x, above ? s.y - 8 : s.y + 8);
  ctx.lineTo(tipX + 12, above ? y + H - 2 : y + 2);
  ctx.closePath();
  ctx.fillStyle = "#2a2016";
  ctx.fill();
  panel(ctx, x, y, W, H);
  drawBattle(ctx, { x: x + 8, y: y + 8, w: W - 16, h: H - 16 }, e, t, e.field ? null : wallsOf(game, e.place));
  ctx.restore();
}

/** Sonuç şeridi: üstte ortada, uçları çentikli koyu bir kurdele; zafer altın, yenilgi kızıl. */
function fightRibbon(ctx, cam, ui, boxes, T, e, t, me) {
  if (t > RIBBON_MS) return;
  const where = placeName(e.place, ui.lang);
  // Geri çekilenler kayıp sayılmaz.
  const back = (who) => (e.retreat?.owner === who ? e.retreat.men : 0);
  // Oyuncu savunduysa (incoming.js) şerit onun gözünden: kazanmak saldırının püskürtülmesi.
  const defending = e.defender === me && e.attacker !== me;
  const won = defending ? !e.won : e.won;
  const attLost = men(e.before.att) - men(e.after.att) - back(e.attacker), defLost = men(e.before.def) - men(e.after.def) - back(e.defender);
  const lost = defending ? defLost : attLost, killed = defending ? attLost : defLost;
  const fled = e.retreat && e.retreat.owner === e.attacker && !e.won;
  const head = defending ? (e.field ? (won ? T.defFieldWon : T.defFieldLost) : won ? T.defWon : e.sacked ? T.defSacked : T.defLost)
    : e.bandits && e.won ? T.banditsWon : e.camp && e.won ? T.campWon : e.field ? (e.won ? T.fieldWon : fled ? T.fieldLostFled : T.fieldLost) : e.won ? T.won : fled ? T.lostFled : T.lost;
  const lines = [[e.drowned ? T.drowned : fill(T.fightLine, lost, killed), e.drowned ? "bad" : null]];
  if (!e.drowned && e.naval?.won && e.naval.sunk) lines.push([fill(T.navalWin, e.naval.sunk), "good"]);
  if (e.loot) lines.push([fill(T.lootLine, e.loot), "good"]);
  // Geri çekilen, rütbe ve general satırları: kimin olduklarına göre (savunurken saldıranınkiler senin değil).
  if (e.retreat) lines.push(e.retreat.owner === me ? [fill(T.retreatYou, e.retreat.men), "warn"] : [fill(T.retreatThem, e.retreat.men), null]);
  if (e.rankUp && !defending) lines.push([fill(T.rankUp, T.ranks[e.rankUp], Math.round(e.rankUp * N.veteran.per * 100)), "warn"]);
  if (e.fallen) lines.push([fill(T.evFallen, civName(e.fallen, ui.lang)), e.fallen === me ? "bad" : "good"]);
  if (e.gen?.up && !defending) lines.push([fill(T.genUp, e.gen.name, e.gen.up), "warn"]);
  if (e.gen?.trait && !defending) lines.push([fill(T.genSkill, T.skills[e.gen.trait][0], T.skills[e.gen.trait][1]), "warn"]);
  if (e.genFell) lines.push([fill(T.genFell, e.genFell), defending ? "good" : "bad"]);
  const W = Math.min(cam.w - 80, 560), H = 52 + lines.length * 20;
  const x = Math.round((cam.w - W) / 2), y = TOP + 16;
  // Belirir (yukarıdan iner), sonunda söner.
  const a = Math.min(1, t / 260) * Math.min(1, (RIBBON_MS - t) / 600);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(0, (1 - Math.min(1, t / 260)) * -12);
  const n = 16;
  ctx.beginPath();
  ctx.moveTo(x - n, y);
  ctx.lineTo(x + W + n, y);
  ctx.lineTo(x + W, y + H / 2);
  ctx.lineTo(x + W + n, y + H);
  ctx.lineTo(x - n, y + H);
  ctx.lineTo(x, y + H / 2);
  ctx.closePath();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "rgba(22,18,14,0.94)";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = won ? GOLD : "#a2412f";
  ctx.lineWidth = 2;
  ctx.stroke();
  // Kazananın renginde ince şerit.
  ctx.fillStyle = colorOf(e.won ? e.attacker : e.defender);
  ctx.fillRect(x + 8, y + 5, W - 16, 3);
  fit(ctx, fill(head, where).toLocaleUpperCase(ui.lang), cam.w / 2, y + 32, W - 40, { title: true, bold: true, size: 18, align: "center", color: won ? GOLD_LIGHT : TONE.bad });
  lines.forEach(([s, tone], i) => text(ctx, s, cam.w / 2, y + 54 + i * 20, { size: 14, align: "center", color: TONE[tone] ?? CREAM, bold: !!tone }));
  ctx.restore();
  boxes.push({ x: x - n, y, w: W + 2 * n, h: H, act: { do: "fightOff" } });
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
  out.push(hid ? T.fogUnknown : men(d) ? troops(T, d, pl.owner) : T.undefended);
  const walls = wallsOf(game, id);
  if (walls) out.push(`${T.walls}: ${wallsText(walls, T)}`);
  for (const wd of wondersAt(game, id)) out.push([T.wonders[wd.id][0], "warn"]);
  if (!go) return out;
  out.push(goLine(go, lang));
  if (go.trespass?.length) out.push([fill(T.tipTrespass, go.trespass.map((c) => civName(c, lang)).join(", ")), "bad"]);
  return out;
}

/** Seçili ordunun bir hedefe gidişinin tek satırı (main.js goTo): ne olur, kaç tur, tahmin. */
export function goLine(go, lang) {
  const T = TEXT[lang];
  const when = (n) => (n <= 1 ? T.tipOneTurn : fill(T.tipTurns, n));
  const tone = (o) => (o === "easy" ? "good" : o === "risky" ? "warn" : "bad");
  const hills = go.cells?.length && isMountain(go.cells[go.cells.length - 1]) ? ` · ${T.mountainNote}` : "";
  if (go.kind === "walk") return [`${T.tipWalk} · ${when(go.turns)}${hills}`, "warn"];
  if (go.kind === "attack") return [`${T.tipAttack} · ${T.odds}: ${oddsLabel(go.odds, T)[0]}`, tone(go.odds)];
  if (go.kind === "strike") return [`${T.tipStrike} · ${T.odds}: ${oddsLabel(go.odds, T)[0]}`, tone(go.odds)];
  if (go.kind === "approach") return [`${T.tipWalk} · ${when(go.turns)} → ${T.attack}`, "warn"];
  if (go.kind === "spent") return [T.tipSpent, "bad"];
  if (go.kind === "neutral") return [fill(T.neutralBlock, civName(go.civ, lang)), "bad"];
  if (go.kind === "ships") return [T.needShips, "bad"];
  return [T.tipNoWay, "bad"];
}

/** Ordunun nerede olduğu: bir yerleşimin içinde, sahada bir yerleşimin yakınında, ya da denizde. */
function whereText(a, T, lang) {
  if (a.at) return fill(T.inPlace, placeName(a.at, lang));
  const near = placeName(nearestPlace(a), lang);
  return fill(isLand(cellOf(a.x, a.y)) ? T.inField : T.atSea, near);
}

/** Yürüdüğü yer: bir yerleşimse adı, değilse en yakın yerleşim; kaç tur kaldığı. */
function routeText(a, T, lang) {
  const end = a.route[a.route.length - 1];
  const pl = placeAtCell(end);
  return pl ? fill(T.marching, placeName(pl, lang)) : fill(T.marchingNear, placeName(nearestPlace(centre(end)), lang));
}

/** Hareket çubuğu: bu tur kalan hareket (sahibinin rengi), etiketiyle. */
function moveBar(ctx, boxes, T, a, x, y, w) {
  const f = Math.max(0, Math.min(1, a.mp / mpMax(a)));
  const lw = text(ctx, T.moveLabel, x, y + 8, { size: 12, color: INK.soft });
  const bx = x + lw + 8, bw = w - lw - 8;
  ctx.fillStyle = "rgba(90,70,40,0.18)";
  ctx.fillRect(bx, y + 2, bw, 7);
  ctx.fillStyle = f > 0.05 ? INK.good : INK.faint;
  ctx.fillRect(bx, y + 2, bw * f, 7);
  ctx.strokeStyle = "#5a4630";
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, y + 2.5, bw - 1, 6);
  boxes.push({ x, y: y - 4, w, h: 16, act: null, tip: [T.moveLabel, f > 0.05 ? fill(T.movesLeft, Math.round(f * 100)) : T.spentShort, T.tipMoveBar] });
}

/** Haritada bir ordunun ipucu. */
export function armyTip(game, a, lang) {
  const T = TEXT[lang];
  const out = [a.bandit || a.barbarian ? ownerName(a, T, lang) : `${T.army} · ${civName(a.owner, lang)}`, troops(T, a)];
  if (a.camp) out.push([T.tipCamp, "warn"]);
  if (a.general) out.push(`★ ${fill(T.general, a.general.name)} · ${fill(T.rank, a.general.level)}`);
  const rk = veteranRank(a.xp);
  if (rk) out.push([`${T.ranks[rk]} · +${fill(T.pct, Math.round((veteranMul(a.xp) - 1) * 100))}`, "warn"]);
  if (fleetOf(a)) out.push(`⛵ ${fleetOf(a)} ${T.ships}`);
  if (a.besieging) out.push([fill(T.evSiege, civName(a.owner, lang), placeName(a.besieging, lang)), "warn"]);
  if (a.owner === game.player) out.push([a.mp > 0.05 ? fill(T.movesLeft, Math.round((a.mp / mpMax(a)) * 100)) : T.spentShort, a.mp > 0.05 ? "good" : null]);
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
  return a && a.owner === g.player && a.mp > 0.05 ? a : null;
};
/** Seçili ordunun menzilinde saldırılabilecek, umutsuz olmayan bir yer. */
const prey = (g, a) => Object.keys(g.places).find((n) => canAttack(g, a, n) && forecast(g, a, a.owner, n).odds !== "hopeless");
/** Bir ordunun ekrandaki yeri (ipucu balonu için). */
const armySpot = (cam, a) => {
  const s = toScreen(cam, a.x, a.y);
  return { x: s.x - 24, y: s.y - 44, w: 48, h: 58, ring: true };
};

// Öğretici (kullanıcı 23.10): yeni oyunda başkentin yanında haydutlar (rules/bandits.js). Balonlar
// sırayla: haydutlar -> başkente tıkla -> asker bas -> Garnizon sekmesi -> kartları seç -> Dışarı
// çık -> haydutlara yürü -> saldır -> savaş penceresi -> ganimet. Şehri büyütmek haydutlardan sonra.
const garrisonOf = (g, ui) => (ownPlace(g, ui) && men(g.places[ui.sel.id]) >= 40 ? ui.sel.id : null);
const picked = (ui, id) => ui.cards?.of === "p:" + id && ui.cards.picks.size > 0;
/**
 * Öğreticiden sonraki ilk hedef: oyuncunun ev kampı (başkentin yanında, karadan varılır), o yoksa
 * başkente en yakın kamp. Kamplar sisde de görünür.
 */
export const campNear = (g) => {
  const cap = POS[capitalOf(g)];
  const camps = campsOf(g);
  return camps.find((c) => c.home === g.player) ?? camps.sort((a, b) => (cap ? dist(a, cap) - dist(b, cap) : 0))[0] ?? null;
};
/** Oyuncunun bir yerine yürüyen, görünen barbar akıncıları. */
const raiderOn = (g) => {
  const e = eyes(g, g.player);
  return g.armies.find((a) => a.raider && g.places[a.target]?.owner === g.player && seen(e, a)) ?? null;
};
/** Haydutlar dururken turu bitirmek ancak ordusu bu tur bir şey yapamayacaksa önerilir. */
const idle = (g) => { const own = g.armies.filter((a) => a.owner === g.player); return !banditsOf(g) || (own.length > 0 && own.every((a) => a.mp <= 0.05)); };

/** Adımlar, öncelik sırasıyla: ne zaman gösterilir, neyi gösterir. */
const COACH = [
  { id: "bandits", when: (g, ui) => !ui.sel && !!banditsOf(g), at: (g, ui, boxes, cam) => armySpot(cam, banditsOf(g)) },
  { id: "loot", when: (g, ui) => !!g.tutorial && !banditsOf(g) && !ui.fight, at: (g, ui, boxes, cam, T) => boxSpot(boxes.find((b) => b.tip?.[0] === T.money)) },
  { id: "raid", when: (g, ui) => !ui.fight && !banditsOf(g) && !!raiderOn(g), at: (g, ui, boxes, cam) => armySpot(cam, raiderOn(g)) },
  { id: "camp", when: (g, ui) => !ui.fight && !banditsOf(g) && !ownPlace(g, ui) && !!campNear(g), at: (g, ui, boxes, cam) => armySpot(cam, campNear(g)) },
  { id: "city", when: (g, ui) => !ui.sel, at: (g, ui, boxes, cam) => placeSpot(cam, capitalOf(g)) },
  // Haydutlar dururken yiyecek uyarısı öğreticiyi bölmesin (Sakaların fazladan askeri başta yiyeceği eksiye düşürür, 10 tur yeter).
  { id: "research", when: (g, ui) => !ui.sel && !g.civs[g.player].research && !banditsOf(g), at: (g, ui, boxes) => boxSpot(findBox(boxes, (a) => a.do === "open" && a.modal === "research")) },
  { id: "food", when: (g) => budget(g, g.player).food < 0 && !banditsOf(g), at: (g, ui, boxes, cam, T) => boxSpot(boxes.find((b) => b.tip?.[0] === T.food)) },
  { id: "upgrade", when: (g, ui) => ownPlace(g, ui) && !banditsOf(g), at: (g, ui, boxes) => boxSpot(findBox(boxes, (a) => a.do === "upgrade")) },
  { id: "recruit", when: ownPlace, at: (g, ui, boxes) => boxSpot(findBox(boxes, (a) => a.do === "recruit") ?? findBox(boxes, (a) => a.do === "cardTab" && a.tab === "troops")) },
  { id: "garrison", when: (g, ui) => !!garrisonOf(g, ui) && ui.cardTab !== "garrison", at: (g, ui, boxes) => boxSpot(findBox(boxes, (a) => a.do === "cardTab" && a.tab === "garrison")) },
  { id: "pick", when: (g, ui) => { const id = garrisonOf(g, ui); return !!id && !picked(ui, id); }, at: (g, ui, boxes) => boxSpot(findBox(boxes, (a) => a.do === "pickAll" && a.all)) },
  { id: "form", when: (g, ui) => !!garrisonOf(g, ui), at: (g, ui, boxes) => boxSpot(findBox(boxes, (a) => a.do === "march" && !a.general) ?? findBox(boxes, (a) => a.do === "cardTab" && a.tab === "garrison")) },
  { id: "strike", when: (g, ui) => { const a = ownArmy(g, ui), b = banditsOf(g); return !!(a && b && canStrike(g, a, b)); }, at: (g, ui, boxes, cam) => armySpot(cam, banditsOf(g)) },
  { id: "attack", when: (g, ui) => { const a = ownArmy(g, ui); return !!(a && prey(g, a)); }, at: (g, ui, boxes, cam) => placeSpot(cam, prey(g, ownArmy(g, ui))) },
  { id: "hunt", when: (g, ui) => !!(ownArmy(g, ui) && banditsOf(g)), at: (g, ui, boxes, cam) => armySpot(cam, banditsOf(g)) },
  { id: "move", when: (g, ui) => !!ownArmy(g, ui), at: (g, ui, boxes, cam) => armySpot(cam, ownArmy(g, ui)) },
  { id: "endturn", when: (g, ui, done) => !ui.sel && idle(g) && (done.has("upgrade") || done.has("recruit") || g.turn > 1), at: (g, ui, boxes) => boxSpot(findBox(boxes, (a) => a.do === "endTurn")) },
  { id: "news", when: (g, ui) => !!ui.news, at: (g, ui, boxes) => boxSpot(boxes.find((b) => b.act?.do === "open" && b.act.modal === "report" && b.w > 100)) },
  { id: "diplo", when: (g, ui) => !ui.sel && g.turn >= 4, at: (g, ui, boxes) => boxSpot(findBox(boxes, (a) => a.do === "open" && a.modal === "diplo")) },
];

/** Pencerenin üstündeki adımlar: haydutlara saldırı penceresinde güç çubuğu ve artılar/eksiler. */
const MODAL_COACH = [
  { id: "preview", when: (g, ui) => ui.modal?.kind === "attack" && !!armyById(g, ui.modal.target)?.bandit, at: (g, ui, boxes) => boxes.find((b) => b.coach === "power") },
];

function drawCoach(ctx, cam, game, ui, boxes, T, modal = false) {
  // Aynı bilgisayarda birkaç oyuncu: öğretici yok.
  if (!ui.coach || ui.coach.off || !!ui.modal !== modal || game.over || humansOf(game).length > 1) return;
  for (const step of modal ? MODAL_COACH : COACH) {
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
  // `beside`: gösterilen şey bir pencerenin içinde; balon pencerenin sağına (sığarsa), ucu sola bakar.
  const side = spot.beside && spot.beside + 18 + W < cam.w - 10;
  const above = spot.y - h - 18 > TOP + 6;
  const y = side ? Math.round(spot.y + spot.h / 2 - h / 2) : above ? spot.y - h - 18 : spot.y + spot.h + 18;
  const x = side ? spot.beside + 18 : Math.max(10, Math.min(cam.w - W - 10, ax - W / 2));
  darkPanel(ctx, x, y, W, h);
  // Gösterdiği yere doğru küçük bir sivri uç.
  const tx = Math.max(x + 18, Math.min(x + W - 18, ax));
  ctx.beginPath();
  if (side) { const ty = y + h / 2; ctx.moveTo(x + 1, ty - 9); ctx.lineTo(x - 10, ty); ctx.lineTo(x + 1, ty + 9); }
  else if (above) { ctx.moveTo(tx - 9, y + h - 1); ctx.lineTo(tx, y + h + 10); ctx.lineTo(tx + 9, y + h - 1); }
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
    attack: attackModal, diplo: diploModal, report: reportModal,
    menu: menuModal, slots: slotsModal, trade: tradeModal, incoming: incomingModal, help: helpModal, confirm: confirmModal, over: overModal, decide: decideModal,
    armies: armiesModal, cities: citiesModal, victory: victoryModal, research: researchModal, summary: summaryModal, leader: leaderModal, speech: speechModal, wonder: wonderModal, handoff: handoffModal, mission: missionModal, missions: missionsModal, chronicle: chronicleModal,
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

/**
 * Savaş penceresi (kullanıcı 23.10: "savaşlar cansız"; Civilization'ın savaş önizlemesi gibi): iki
 * taraf yan yana - askerleri, sayıları, generali, rütbesi, gücü; ortada iki tarafın gücünü
 * karşılaştıran çubuk ve tahmin; altında savaşı çeviren artılar ve eksiler (rules/combat.js
 * explain), beklenen kayıplar. Yerleşime saldırı (m.id) ya da meydan muharebesi (m.target).
 */
function attackModal(ctx, cam, game, ui, boxes, T, m) {
  const a = armyById(game, m.army);
  if (!a) return;
  const me = game.player;
  const b = m.target ? armyById(game, m.target) : null;
  if (m.target && !b) return;
  let sd, e, walls = null, title, sub, theirs, theirOwner, theirGen = null, theirXp = 0, sea = false, sg = false;
  if (b) {
    e = forecastField(game, a, b);
    sd = fieldSides(game, a, b);
    sea = !!e.sea;
    title = b.bandit ? T.banditsQ : b.camp ? T.campQ : b.barbarian ? T.barbQ : fill(T.fieldQ, ownerName(b, T, ui.lang));
    sub = fill(sea ? T.atSea : T.inField, placeName(nearestPlace(b), ui.lang));
    theirs = b; theirOwner = b.owner; theirGen = b.general; theirXp = b.xp ?? 0;
  } else {
    const pl = game.places[m.id];
    sd = sides(game, a, me, m.id);
    e = forecast(game, a, me, m.id);
    walls = sd.walls;
    sea = sd.sea && shipsAt(game, m.id) > 0;
    sg = canBesiege(game, a, m.id);
    title = fill(T.attackQ, placeName(m.id, ui.lang));
    sub = `${civName(pl.owner, ui.lang, T.free)} · ${T.walls}: ${wallsText(walls, T)}`;
    theirs = sd.def; theirOwner = pl.owner; theirGen = sd.def.gen;
  }
  // Hava ve gün saati (bölüm 29g): alt başlığın sonunda.
  const wth = sd.att.weather;
  if (wth && !(sea && b)) {
    const ws = [wth.sky !== "clear" ? T.sky[wth.sky] : null, T.dayTime[wth.time] || null].filter(Boolean).join(" · ");
    if (ws) sub = `${sub} · ${ws}`;
  }
  const pow = sea && b ? null : fight(sd.att, sd.def, walls);
  const ex = sea && b ? { att: [], def: [] } : explain(sd.att, sd.def, walls);
  const hint = sg ? wrap(ctx, fill(T.siegeHint, Math.round(siegeRate(a) * 100), turnsToFall(game, a, m.id)), 552, { size: 12, italic: true }) : [];
  const modRows = Math.max(ex.att.length, ex.def.length);
  const r = modalFrame(ctx, cam, boxes, 360 + modRows * 18 + (sea ? 20 : 0) + hint.length * 17, 600);
  const x = r.x + 22, w = r.w - 44, cw = (w - 16) / 2;
  text(ctx, title, r.x + r.w / 2, r.y + 38, { title: true, bold: true, size: 20, align: "center" });
  fit(ctx, sub, r.x + r.w / 2, r.y + 60, w, { italic: true, size: 12, color: INK.soft, align: "center" });

  // İki taraf: sol sen, sağ onlar.
  const side = (bx, owner, u, label, gen, xp, power, flip, help = 0) => {
    const by = r.y + 74;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(bx, by, cw, 112);
    ctx.fillStyle = colorOf(owner);
    ctx.fillRect(bx, by, cw, 4);
    ctx.strokeStyle = INK.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, cw - 1, 111);
    shield(ctx, owner, bx + 10, by + 12, 14);
    fit(ctx, label, bx + 30, by + 26, cw - 40, { bold: true, size: 14 });
    const rk = veteranRank(xp);
    const tag = [gen ? `★ ${gen.name}` : null, rk ? T.ranks[rk] : null, help ? fill(T.helpTag, help) : null].filter(Boolean).join(" · ");
    if (tag) fit(ctx, tag, bx + 30, by + 43, cw - 40, { italic: true, size: 12, color: INK.warn });
    if (help) boxes.push({ x: bx, y: by + 30, w: cw, h: 18, act: null, tip: [fill(T.helpTag, help), T.helpTip] });
    // Askerler: türlerine göre küçük figürler (en çok 9).
    const total = men(u);
    if (sea && b) {
      for (let i = 0; i < Math.min(4, fleetOf(u)); i++) galley(ctx, owner, bx + 34 + i * 40, by + 82, 0.62, { flip: flip, troops: men(u) > 0 });
    } else if (total) {
      const n = Math.max(1, Math.min(9, Math.round(total / 25)));
      const figs = [];
      for (const k of UNITS) for (let i = 0; i < Math.max(u[k] > 0 ? 1 : 0, Math.round(((u[k] ?? 0) / total) * n)); i++) figs.push(k);
      figs.slice(0, 9).forEach((k, i) => trooper(ctx, k, owner, flip ? bx + cw - 20 - i * 21 : bx + 20 + i * 21, by + 84 - (i % 2) * 4, flip ? 1 : -1, 1.05));
    } else text(ctx, T.undefended, bx + 12, by + 80, { italic: true, size: 12, color: INK.soft });
    fit(ctx, sea && b ? `⛵ ${fleetOf(u)} ${T.ships}` : total ? troops(T, u, owner) : "", bx + 10, by + 104, cw - 20, { size: 12 });
    if (power !== null) text(ctx, fill(T.powerN, Math.round(power)), bx + cw - 10, by + 26, { bold: true, size: 13, align: "right", color: INK.soft });
  };
  // Takviye (bölüm 7b): yakındaki ordular da katılır - askerleri tarafın kutusunda.
  const ah = sea ? 0 : sd.att.help?.length ?? 0, dh = sea ? 0 : sd.def.help?.length ?? 0;
  side(x, me, ah ? sd.att : a, T.yours, a.general, a.xp ?? 0, pow?.attPow ?? null, false, ah);
  side(x + cw + 16, theirOwner, dh && b ? sd.def : theirs, b ? (b.bandit || b.barbarian ? ownerName(b, T, ui.lang) : T.theirs) : T.defenders, theirGen, theirXp, pow?.defPow ?? null, true, dh);

  // Güç çubuğu ve tahmin.
  let y = r.y + 206;
  const [label, color] = oddsLabel(e.odds, T);
  text(ctx, `${T.odds}: `, r.x + r.w / 2 - measure(ctx, label, { bold: true, size: 16 }) / 2, y, { size: 15, align: "right" });
  text(ctx, label, r.x + r.w / 2 - measure(ctx, label, { bold: true, size: 16 }) / 2, y, { bold: true, size: 16, color });
  y += 10;
  boxes.push({ x, y: y - 26, w, h: 44, act: null, coach: "power", beside: r.x + r.w });
  if (pow) {
    const f = pow.attPow / Math.max(1e-6, pow.attPow + pow.defPow);
    ctx.fillStyle = colorOf(theirOwner);
    ctx.fillRect(x, y, w, 14);
    ctx.fillStyle = colorOf(me);
    ctx.fillRect(x, y, w * f, 14);
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 13);
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y - 3);
    ctx.lineTo(x + w / 2, y + 17);
    ctx.strokeStyle = GOLD_LIGHT;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    y += 24;
  } else y += 6;

  // Artılar ve eksiler: her sütun kendi tarafının; yeşil o tarafa yarar, kırmızı zarar.
  const fmt1 = (key, v) => (key === "engines" ? fill(T.pct, Math.round(v * 100))
    : key === "siegeGeneral" ? "−" + fill(T.pct, 50) : (v > 1 ? "+" : "−") + fill(T.pct, Math.round(Math.abs(v - 1) * 100)));
  const good = (key, v) => key === "engines" || key === "siegeGeneral" || v > 1;
  const list = (bx, mods) => mods.forEach(([key, v], i) => {
    const ly = y + 12 + i * 18;
    const s = fmt1(key, v);
    const sw = text(ctx, s, bx, ly, { bold: true, size: 13, color: good(key, v) ? INK.good : INK.bad });
    const label = key.startsWith("elite:") ? unitTitle(T, "elite", key.slice(6) || null) : T.mods[key] ?? key;
    fit(ctx, label, bx + Math.max(sw + 6, 46), ly, cw - Math.max(sw + 6, 46), { size: 13 });
  });
  if (!modRows) text(ctx, T.noMods, r.x + r.w / 2, y + 12, { italic: true, size: 12, color: INK.soft, align: "center" });
  list(x, ex.att);
  list(x + cw + 16, ex.def);
  y += 12 + Math.max(1, modRows) * 18 + 6;
  if (sea && !b) {
    const [sl, sc] = oddsLabel(e.sea, T);
    const sw = text(ctx, fill(T.navalOdds, fleetOf(a), shipsAt(game, m.id)) + " · ", x, y, { size: 13 });
    text(ctx, sl, x + sw, y, { size: 13, bold: true, color: sc });
    y += 20;
  }
  text(ctx, b && sea ? T.seaFieldHint : fill(T.expect, e.lost, e.killed), r.x + r.w / 2, y, { size: 13, italic: true, color: b && sea ? INK.warn : INK.soft, align: "center" });
  hint.forEach((l, i) => text(ctx, l, x, y + 22 + i * 17, { size: 12, italic: true, color: INK.warn }));
  // Düğmeler: Sonucu gör (otomatik savaş), Savaş (taktik savaş; yalnız karada ve savunan varsa), Kuşat, Vazgeç.
  const tactical = !sea && men(theirs) > 0;
  const btns = [
    { label: tactical ? T.seeResult : T.attack, main: true, act: { do: "attack" }, tip: [T.seeResult, T.seeResultTip] },
    ...(tactical ? [{ label: T.fightIt, main: true, act: { do: "battleStart" }, tip: [T.fightIt, T.fightItTip] }] : []),
    ...(sg ? [{ label: T.besiege, act: { do: "besiege" } }] : []),
    { label: T.cancel, act: { do: "close" } },
  ];
  const bw = (r.w - 40 - 8 * (btns.length - 1)) / btns.length, by = r.y + r.h - 62;
  btns.forEach((o, i) => button(ctx, boxes, { x: r.x + 20 + i * (bw + 8), y: by, w: bw, h: 44, size: btns.length > 3 ? 14 : 15, ...o }));
}

/**
 * Diplomasi: her medeniyetin lideri (portresi, adı, sana karşı tutumu) ve ilişkisi. Satıra
 * basınca liderle görüşme ekranı açılır (leaderModal).
 */
function diploModal(ctx, cam, game, ui, boxes, T) {
  const me = game.player;
  const others = CIVS.filter((c) => c.id !== me);
  const rowH = 62;
  const r = modalFrame(ctx, cam, boxes, 84 + others.length * rowH + 70, 560);
  text(ctx, T.diplomacy, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  others.forEach((c, i) => {
    const y = r.y + 58 + i * rowH;
    const x = r.x + 18;
    const alive = game.civs[c.id].alive;
    if (alive) listRow(ctx, boxes, r, y, rowH - 4, i, { do: "leader", civ: c.id });
    const mood = moodOf(game, c.id, me), level = moodLevel(mood.score);
    ctx.save();
    if (!alive) ctx.globalAlpha = 0.45;
    portrait(ctx, c.id, x + 26, y + rowH / 2 - 2, 25, alive ? level : "neutral");
    ctx.restore();
    const L = T.leaders[c.id];
    text(ctx, L.name, x + 62, y + 24, { title: true, bold: true, size: 14, color: alive ? INK.ink : INK.faint });
    if (!alive) {
      text(ctx, fill(T.evFallen, c.name[ui.lang]), x + 62, y + 44, { italic: true, size: 12, color: INK.faint });
      return;
    }
    const rel = relation(game, me, c.id);
    const [label, color] = rel === "war" ? [T.war, INK.bad] : rel === "ally" ? [T.ally, INK.good] : [T.neutral, INK.soft];
    const iw = text(ctx, `${c.name[ui.lang]} · ${label}`, x + 62, y + 44, { italic: true, size: 12, color });
    // Toprağına girdiğin tarafsızın öfkesi: sabrı taşınca savaş açar.
    const mad = angerOf(game, c.id, me);
    if (rel === "neutral" && mad > 0) text(ctx, ` · ${fill(T.angry, Math.ceil(mad), persona(c.id).anger)}`, x + 62 + iw, y + 44, { italic: true, bold: true, size: 12, color: INK.bad });
    // Sağda tutum ve görüş düğmesi.
    const mc = MOOD_INK[level];
    text(ctx, T.moods[level], r.x + r.w - 130, y + 24, { bold: true, size: 13, color: mc, align: "right" });
    text(ctx, (mood.score > 0 ? "+" : "") + mood.score, r.x + r.w - 130, y + 42, { size: 12, color: INK.soft, align: "right" });
    button(ctx, boxes, { x: r.x + r.w - 116, y: y + 12, w: 92, h: 32, label: T.talk, size: 12, act: { do: "leader", civ: c.id } });
  });
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

const MOOD_INK = { friendly: INK.good, neutral: INK.soft, cold: INK.warn, hostile: INK.bad };

/** Liderin sözü: `line` verilmediyse tutumuna göre selam. */
function leaderLine(T, civ, line, level) {
  const L = T.leaders[civ];
  if (line === "thanks") return T.thanks;
  if (line === "peaceAsk") return T.peaceAsk;
  if (line && L[line]) return L[line];
  return L[level === "friendly" ? "friendly" : level === "neutral" ? "neutral" : "hostile"];
}

/**
 * Liderle görüşme (Civilization gibi): solda portre, adı ve unvanı; sağda konuşma balonu,
 * kişiliği, ilişki, tutum ve gerekçeleri; altta yapılabilecekler. Bir şey önerince lider
 * cevap verir (balon değişir), pencere açık kalır.
 */
function leaderModal(ctx, cam, game, ui, boxes, T, m) {
  const me = game.player, civ = m.civ, L = T.leaders[civ];
  if (!game.civs[civ]?.alive) return;
  const mood = moodOf(game, civ, me), level = moodLevel(mood.score);
  const rel = relation(game, me, civ);
  const r = modalFrame(ctx, cam, boxes, 486, 680);
  const lx = r.x + 24, rx = r.x + 236, rw = r.x + r.w - 24 - rx;
  // Sol: portre ve kimlik.
  portrait(ctx, civ, lx + 96, r.y + 118, 90, level);
  text(ctx, L.name, lx + 96, r.y + 234, { title: true, bold: true, size: 17, align: "center" });
  text(ctx, L.title, lx + 96, r.y + 254, { italic: true, size: 13, color: INK.soft, align: "center" });
  const cw = measure(ctx, civName(civ, ui.lang), { size: 13, bold: true });
  shield(ctx, civ, lx + 96 - cw / 2 - 18, r.y + 264, 13);
  text(ctx, civName(civ, ui.lang), lx + 96 - cw / 2, r.y + 276, { size: 13, bold: true });
  // Sağ üst: konuşma balonu, ucu portreye bakar.
  const say = "“" + leaderLine(T, civ, m.line, level) + "”";
  const rows = wrap(ctx, say, rw - 32, { size: 16, italic: true });
  const bh = 26 + rows.length * 22;
  roundRect(ctx, rx, r.y + 24, rw, bh, 10);
  ctx.fillStyle = "rgba(255,252,240,0.92)";
  ctx.fill();
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rx + 1, r.y + 44);
  ctx.lineTo(rx - 14, r.y + 56);
  ctx.lineTo(rx + 1, r.y + 62);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,252,240,0.92)";
  ctx.fill();
  rows.forEach((l, k) => text(ctx, l, rx + 16, r.y + 50 + k * 22, { size: 16, italic: true }));
  // Kişilik, ilişki, anlaşma.
  let y = r.y + 24 + bh + 26;
  const pw = text(ctx, L.persona + ": ", rx, y, { bold: true, size: 13 });
  fit(ctx, L.desc, rx + pw, y, rw - pw, { size: 13, color: INK.soft });
  y += 22;
  const [label, color] = rel === "war" ? [T.war, INK.bad] : rel === "ally" ? [T.ally, INK.good] : [T.neutral, INK.soft];
  const dw = text(ctx, label, rx, y, { bold: true, size: 13, color });
  const deal = dealOf(game, me, civ);
  if (deal && deal.until > game.turn) text(ctx, " · " + fill(T.dealLeft, dealLeft(game, deal)), rx + dw, y, { size: 13, color: INK.good });
  else if (rel === "neutral" && angerOf(game, civ, me) > 0) text(ctx, " · " + fill(T.angry, Math.ceil(angerOf(game, civ, me)), persona(civ).anger), rx + dw, y, { size: 13, bold: true, color: INK.bad });
  // Tutum ve gerekçeleri.
  y += 28;
  const aw = text(ctx, T.attitude + ": ", rx, y, { bold: true, size: 14 });
  text(ctx, `${T.moods[level]} (${mood.score > 0 ? "+" : ""}${mood.score})`, rx + aw, y, { bold: true, size: 14, color: MOOD_INK[level] });
  const parts = [...mood.parts].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 7);
  parts.forEach(([k, v], n) => {
    const ly = y + 22 + n * 19;
    text(ctx, (v > 0 ? "+" : "−") + Math.abs(v), rx + 34, ly, { bold: true, size: 13, color: v > 0 ? INK.good : INK.bad, align: "right" });
    fit(ctx, T.moodParts[k] ?? k, rx + 44, ly, rw - 44, { size: 13 });
  });
  // Altta yapılabilecekler.
  const money = game.civs[me].money;
  const acts = [];
  if (rel === "neutral") {
    acts.push({ label: T.declare, act: { do: "askWar", civ }, off: !canDeclare(game, me, civ) });
    acts.push({ label: T.propose, act: { do: "ally", civ }, off: !canPropose(game, me, civ) });
  } else if (rel === "ally") acts.push({ label: T.breakAlly, act: { do: "askBreak", civ } });
  else {
    acts.push({ label: T.peace, act: { do: "peace", civ }, off: game.asked[key(me, civ)] === game.turn });
    const g = N.diplo.peaceGold;
    acts.push({ label: fill(T.peaceGold, g), act: { do: "peace", civ, gold: g }, off: game.asked[key(me, civ)] === game.turn || money < g, tip: [fill(T.peaceGold, g), fill(T.tipPeaceGold, g)] });
  }
  if (rel !== "war") acts.push({ label: T.tradeDeal, act: { do: "trade", civ }, off: !canTrade(game, me, civ), tip: [T.tradeDeal, fill(T.tipTrade, N.diplo.tradeMoney, N.diplo.tradeTurns)] });
  for (const g of N.diplo.giftSizes) acts.push({ label: fill(T.giftN, g), act: { do: "gift", civ, amount: g }, off: money < g, tip: [fill(T.giftN, g), T.tipGift] });
  const bw = (r.w - 48 - (acts.length - 1) * 8) / acts.length, by = r.y + r.h - 112;
  acts.forEach((a, n) => button(ctx, boxes, { x: r.x + 24 + n * (bw + 8), y: by, w: bw, h: 38, size: 12, ...a }));
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "open", modal: "diplo" } });
}

/** Bir lider sana savaş açtı: portresi, sözü, tek düğme. */
function speechModal(ctx, cam, game, ui, boxes, T, m) {
  const L = T.leaders[m.civ];
  const say = "“" + L[m.line ?? "war"] + "”";
  const rows = wrap(ctx, say, 380, { size: 16, italic: true });
  const r = modalFrame(ctx, cam, boxes, 300 + rows.length * 22, 440);
  portrait(ctx, m.civ, r.x + r.w / 2, r.y + 86, 64, "hostile");
  text(ctx, fill(T.warOnYou, L.name), r.x + r.w / 2, r.y + 186, { title: true, bold: true, size: 18, align: "center", color: INK.bad });
  rows.forEach((l, k) => text(ctx, l, r.x + r.w / 2, r.y + 218 + k * 22, { size: 16, italic: true, align: "center" }));
  oneButton(ctx, boxes, r, { label: T.toArms, act: { do: "close" } });
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
    else if (e.type === "officer" && e.civ === me) out.push([fill(T.evOfficer, placeName(e.place, lang), `${"★".repeat(e.level)} ${e.name}`, e.traits.map((t) => T.skills[t][0]).join(", ")), "good"]);
    else if (e.type === "battle" && mine && e.field && e.bandits && e.won) out.push([fill(T.evBandits, name(e.attacker), placeName(e.place, lang)), "good"]);
    else if (e.type === "battle" && mine && e.field) {
      const [w, l] = e.won ? [e.attacker, e.defender] : [e.defender, e.attacker];
      out.push([fill(T.evField, name(w), name(l), placeName(e.place, lang)), w === me ? "good" : "bad"]);
    } else if (e.type === "battle" && mine && !e.barbarians) {
      const where = placeName(e.place, lang);
      if (e.won) out.push([fill(T.evTook, name(e.attacker), where), e.attacker === me ? "good" : "bad"]);
      else if (!e.drowned) out.push([fill(T.evHeld, name(e.defender), where, name(e.attacker)), e.defender === me ? "good" : "bad"]);
    }
    if (e.type === "raidOut" && e.owner === me) out.push([fill(T.evRaidOut, placeName(e.target, lang), e.men), "bad"]);
    if (e.type === "campNew") out.push([T.evCampNew, null]);
    // Büyük krizler (crises.js).
    if (e.type === "civilWar" && e.civ !== me) out.push([fill(T.evCivilWar, civName(e.civ, lang), e.count), null]);
    if (e.type === "seceded") out.push([fill(T.evSeceded, e.count, civName(e.civ, lang)), e.civ === me ? "bad" : null]);
    if (e.type === "plagueStart") out.push([fill(T.evPlagueStart, placeName(e.place, lang)), e.owner === me ? "bad" : "warn"]);
    if (e.type === "plagueHit" && e.owner === me) out.push([fill(T.evPlagueHit, placeName(e.place, lang), e.lost, e.men), "bad"]);
    if (e.type === "plagueEnd") out.push([fill(T.evPlagueEnd, e.places), null]);
    if (e.type === "hordeCame") out.push([fill(T.evHorde, e.men, placeName(e.place, lang), civName(e.civ, lang)), e.civ === me ? "bad" : "warn"]);
    if (e.type === "hordeGone") out.push([T.evHordeGone, null]);
    if (e.type === "routeCut" && e.civ === me) out.push([fill(T.evRouteCut, placeName(e.from, lang), placeName(e.to, lang)), "bad"]);
    if (e.type === "battle" && e.barbarians && !e.field && e.defender === me) out.push(e.won ? [fill(T.evRaidTook, placeName(e.place, lang), e.sacked?.pop ?? 0, e.sacked?.money ?? 0), "bad"] : [fill(T.evRaidHeld, placeName(e.place, lang)), "good"]);
    if (e.type === "wonderBuilt") out.push([fill(T.evWonderBuilt, name(e.civ), T.wonders[e.wonder][0], placeName(e.place, lang)), e.civ === me ? "good" : "bad"]);
    if (e.type === "wonderMissed" && e.civ === me) out.push([fill(T.evWonderMissed, T.wonders[e.wonder][0], e.refund), "bad"]);
    if (e.type === "dealEnded") out.push([fill(T.evDealEnded, name(e.civ)), null]);
    if (e.type === "trade" && mine) out.push([fill(T.evTrade, name(e.by), name(e.to)), "good"]);
    if (e.type === "tech" && e.civ === me) out.push([fill(T.evTech, T.techs[e.tech][0]), "good"]);
    if (e.type === "wonderRace") out.push([fill(e.civ === me ? T.evWonderRaceMe : T.evWonderRace, name(e.civ), N.victory.wonders, e.left), e.civ === me ? "good" : "bad"]);
    if (e.type === "wonderLost") out.push([fill(T.evWonderLost, name(e.civ)), e.civ === me ? "bad" : "good"]);
    if (e.type === "spyArrived" && e.civ === me) out.push([fill(T.evSpyArrived, placeName(e.place, lang)), "good"]);
    if (e.type === "spyCaught" && e.civ === me) out.push([fill(T.evSpyCaught, placeName(e.place, lang), name(e.by)), "bad"]);
    if (e.type === "trespass" && e.by === me) out.push([fill(T.evTrespassBy, name(e.victim), Math.ceil(e.anger), N.anger.war), "bad"]);
    if (e.type === "trespass" && e.victim === me) out.push([fill(T.evTrespassOn, name(e.by)), "warn"]);
    if (e.type === "battle" && e.won && !e.field && wondersAt(game, e.place).length) {
      out.push([fill(T.evWonder, name(e.attacker), T.wonders[wondersAt(game, e.place)[0].id][0]), e.attacker === me ? "good" : e.defender === me ? "bad" : null]);
    }
    if (e.type === "storm" && e.civ === me) out.push([fill(T.evStorm, e.lost, e.sunk), "bad"]);
    if (e.type === "winter" && e.civ === me) out.push([fill(T.evWinter, e.lost), "bad"]);
    if (e.type === "refill" && e.civ === me) out.push([fill(T.evRefill, e.men), "good"]);
    if (e.type === "missionNew") out.push([fill(T.evMissionNew, missionText(game, e.mission, lang).title), null]);
    if (e.type === "mission") out.push([fill(e.ok ? T.evMissionOk : T.evMissionFail, missionText(game, e.mission, lang).title), e.ok ? "good" : "bad"]);
    if (e.type === "siege" && (e.by === me || e.defender === me)) out.push([fill(T.evSiege, name(e.by), placeName(e.place, lang)), e.defender === me ? "bad" : null]);
    if (e.type === "surrender" && (e.by === me || e.from === me || wonderAt(e.place))) out.push([fill(T.evSurrender, name(e.by), placeName(e.place, lang)), e.by === me ? "good" : e.from === me ? "bad" : null]);
    if (e.type === "surrender" && e.fallen) out.push([fill(T.evFallen, name(e.fallen)), e.fallen === me ? "bad" : null]);
    if (e.type === "battle" && e.fallen) out.push([fill(T.evFallen, name(e.fallen)), e.fallen === me ? "bad" : null]);
    if (e.type === "battle" && e.drowned && !e.field && e.defender === me) out.push([fill(T.evDrowned, name(e.attacker), placeName(e.place, lang)), "good"]);
    if (e.type === "riot" && e.civ === me) out.push([fill(T.evRiot, placeName(e.place, lang)), null]);
    if (e.type === "revolt" && e.civ === me) out.push([fill(T.evRevolt, placeName(e.place, lang)), "bad"]);
    if (e.type === "revolt" && e.fallen) out.push([fill(T.evFallen, name(e.fallen)), e.fallen === me ? "bad" : null]);
  }
  return out;
}

/**
 * Tur raporu: görselli (art.js) - turun en önemli olayının görseli (savaş, kıtlık, araştırma, yapı; yoksa sabah), altında
 * olaylar.
 */
function reportModal(ctx, cam, game, ui, boxes, T) {
  const lines = eventLines(game, ui.lang);
  if (!lines.length) lines.push([T.quiet, null]);
  const W = Math.min(cam.w - 24, 520) - 70;
  const rows = lines.flatMap(([s, tone]) => wrap(ctx, s, W, { size: 14 }).map((l, i) => [l, tone, i === 0]));
  const shown = rows.slice(0, 12);
  const me = game.player, ev = game.events ?? [];
  const tech = ev.find((e) => e.type === "tech" && e.civ === me);
  const key = ev.some((e) => e.type === "battle" && (e.attacker === me || e.defender === me)) ? "notice/battle"
    : ev.some((e) => e.type === "famine" && e.civ === me) ? "notice/famine"
    : tech ? `tech/${tech.tech}` : ev.some((e) => e.type === "built" && e.civ === me) ? "notice/build" : "notice/turn";
  const pic = 200;
  const r = pictureFrame(ctx, cam, boxes, key, pic + 40 + shown.length * 22 + 74, 540, { owner: me, id: tech?.tech, lane: tech ? techById[tech.tech].lane : 0, pic, fade: Math.max(0.15, (pic - 60) / (pic + 40 + shown.length * 22 + 74)) });
  lit(ctx, fill(T.turn, game.turn), r.x + r.w / 2, r.y + pic, { title: true, bold: true, size: 22, align: "center", color: GOLD_LIGHT });
  shown.forEach(([l, tone, first], i) => {
    const y = r.y + pic + 36 + i * 22;
    const color = tone === "good" ? "#a8d88a" : tone === "bad" ? "#f08a70" : CREAM;
    if (first) { ctx.fillStyle = color; ctx.fillRect(r.x + 28, y - 9, 6, 6); }
    lit(ctx, l, r.x + 44, y, { size: 14, color });
  });
  const bw = 180;
  glassButton(ctx, boxes, { x: r.x + r.w / 2 - bw / 2, y: r.y + r.h - 56, w: bw, h: 40, label: T.ok, main: true, act: { do: "close" } }, over(r.x + r.w / 2 - bw / 2, r.y + r.h - 56, bw, 40));
}

/**
 * Araştırma ağacı (Civilization gibi; rules/research.js): dört çağ yan yana, her çağda dört kol
 * (toprak ve at, maden ve yapı, deniz, bilgi ve para). Bilinen altın, araştırılan parlak
 * çerçeveli ve ilerleme çubuklu, açık olan basılabilir, kilitli soluk; çizgiler neyin neyi
 * istediğini gösterir. Basınca araştırma o olur.
 */
const LANE_GLYPH = ["helmet", "temple", "compass", "scroll"];
function researchModal(ctx, cam, game, ui, boxes, T) {
  const me = game.player, c = game.civs[me];
  const NW = 196, NH = 84, GX = 42, GY = 12;
  const r = modalFrame(ctx, cam, boxes, 112 + 4 * NH + 3 * GY + 108, 4 * NW + 3 * GX + 48);
  const x0 = r.x + 24, y0 = r.y + 110;
  text(ctx, T.research, r.x + r.w / 2, r.y + 38, { title: true, bold: true, size: 20, align: "center" });
  const sci = Math.round(scienceOf(game, me) * 10) / 10;
  const status = c.research ? fill(T.researching, T.techs[c.research][0], techTurns(game, me, c.research)) : T.noResearch;
  const head = [fill(T.sciencePer, sci), c.bank >= 1 ? fill(T.banked, Math.floor(c.bank)) : null, status].filter(Boolean).join(" · ");
  fit(ctx, head, r.x + r.w / 2, r.y + 64, r.w - 48, { size: 14, align: "center", bold: true, color: c.research ? INK.ink : INK.bad });
  T.tiers.forEach((t, i) => text(ctx, t.toLocaleUpperCase(ui.lang), x0 + i * (NW + GX) + NW / 2, y0 - 12, { title: true, bold: true, size: 12, align: "center", color: INK.soft }));
  const pos = (t) => ({ x: x0 + (t.tier - 1) * (NW + GX), y: y0 + t.lane * (NH + GY) });
  // Önce çizgiler (düğümlerin altında): biliniyorsa altın, değilse soluk.
  for (const t of TECHS) for (const n of t.needs) {
    const a = pos(techById[n]), b = pos(t), known = knows(game, me, n);
    ctx.beginPath();
    ctx.moveTo(a.x + NW, a.y + NH / 2);
    ctx.bezierCurveTo(a.x + NW + GX * 0.6, a.y + NH / 2, b.x - GX * 0.6, b.y + NH / 2, b.x, b.y + NH / 2);
    ctx.strokeStyle = known ? GOLD_DARK : "rgba(90,70,45,0.3)";
    ctx.lineWidth = known ? 2.4 : 1.5;
    ctx.stroke();
  }
  for (const t of TECHS) {
    const p = pos(t), id = t.id, [name, effect] = T.techs[id];
    const known = knows(game, me, id), now = c.research === id, open = canResearch(game, me, id);
    const hot = open && over(p.x, p.y, NW, NH);
    ctx.save();
    if (!known && !open) ctx.globalAlpha = 0.5;
    // Kartın zemini teknolojinin görseli (art.js "tech/<ad>"); yazılar üstünde, soldan sağa koyulaşan bir gölgeyle.
    artBox(ctx, `tech/${id}`, p.x, p.y, NW, NH, { round: 6, id, lane: t.lane, owner: me, card: true });
    const veil = ctx.createLinearGradient(p.x, 0, p.x + NW, 0);
    veil.addColorStop(0, known ? "rgba(60,44,16,0.86)" : now ? "rgba(48,34,16,0.9)" : "rgba(20,14,8,0.82)");
    veil.addColorStop(0.62, "rgba(20,14,8,0.55)");
    veil.addColorStop(1, "rgba(20,14,8,0.1)");
    roundRect(ctx, p.x, p.y, NW, NH, 6);
    ctx.fillStyle = veil;
    ctx.fill();
    ctx.strokeStyle = now ? GOLD : known ? GOLD_DARK : hot ? GOLD : INK.border;
    ctx.lineWidth = now ? 2.6 : hot ? 1.8 : 1.2;
    ctx.stroke();
    medal(ctx, null, p.x + 19, p.y + 20, 12, LANE_GLYPH[t.lane]);
    fit(ctx, name, p.x + 38, p.y + 25, NW - 46, { bold: true, size: 14, color: CREAM });
    lines(ctx, effect, p.x + 10, p.y + 45, NW - 20, { size: 11.5, color: "rgba(243,231,201,0.85)" }, 2, 13);
    if (known) text(ctx, "✓ " + T.techKnown, p.x + NW - 10, p.y + NH - 8, { size: 11.5, bold: true, color: "#a8d88a", align: "right" });
    else if (now) {
      const f = Math.min(1, (c.progress[id] ?? 0) / costFor(game, me, id));
      ctx.fillStyle = "rgba(60,45,25,0.18)";
      ctx.fillRect(p.x + 10, p.y + NH - 13, NW - 64, 6);
      ctx.fillStyle = GOLD;
      ctx.fillRect(p.x + 10, p.y + NH - 13, (NW - 64) * f, 6);
      text(ctx, fill(T.turnsN, techTurns(game, me, id)), p.x + NW - 10, p.y + NH - 7, { size: 11.5, bold: true, align: "right", color: CREAM });
    } else text(ctx, fill(T.techCost, costFor(game, me, id), techTurns(game, me, id)), p.x + NW - 10, p.y + NH - 8, { size: 11, color: "rgba(243,231,201,0.75)", align: "right" });
    ctx.restore();
    const needs = t.needs.filter((n) => !knows(game, me, n)).map((n) => T.techs[n][0]).join(", ");
    if (open) boxes.push({ x: p.x, y: p.y, w: NW, h: NH, act: { do: "research", tech: id }, tip: [name, effect, fill(T.techCost, costFor(game, me, id), techTurns(game, me, id))] });
    else if (!known) boxes.push({ x: p.x, y: p.y, w: NW, h: NH, act: null, tip: [name, effect, [fill(T.techNeeds, needs), "bad"]] });
  }
  lines(ctx, T.techPick, r.x + 24, y0 + 4 * NH + 3 * GY + 26, r.w - 48, { size: 12, italic: true, color: INK.soft, align: "center" }, 2, 15);
  oneButton(ctx, boxes, r, { label: T.close ?? T.ok, act: { do: "close" } });
}

/**
 * Aynı bilgisayarda sıra değişti: ekranın tamamı kapanır (öteki oyuncunun haritası, sisi ve
 * kartları görünmesin), sırası gelenin lideri ve adı; "Hazırım" ile oyun açılır.
 */
function handoffModal(ctx, cam, game, ui, boxes, T) {
  const g = ctx.createRadialGradient(cam.w / 2, cam.h / 2, 40, cam.w / 2, cam.h / 2, Math.max(cam.w, cam.h) * 0.7);
  g.addColorStop(0, "#2b2219");
  g.addColorStop(1, "#0d0a07");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cam.w, cam.h);
  boxes.push({ x: 0, y: 0, w: cam.w, h: cam.h, act: null });
  const civ = game.player, n = humansOf(game).indexOf(civ) + 1;
  const cx = cam.w / 2, cy = cam.h / 2;
  portrait(ctx, civ, cx, cy - 100, 96, "friendly");
  text(ctx, fill(T.handoffTitle, civName(civ, ui.lang)), cx, cy + 44, { title: true, bold: true, size: 30, color: GOLD_LIGHT, align: "center" });
  text(ctx, `${T.leaders[civ].name} · ${fill(T.handoffSub, n, game.turn)}`, cx, cy + 74, { size: 16, italic: true, color: CREAM, align: "center" });
  text(ctx, T.handoffHint, cx, cy + 102, { size: 14, color: "rgba(243,231,201,0.65)", align: "center" });
  button(ctx, boxes, { x: cx - 120, y: cy + 126, w: 240, h: 50, main: true, size: 18, label: T.ready, act: { do: "ready" } });
}

/** Oyuncunun harikası tamamlandı: büyük harika işareti, adı, armağanı, şehri. */
function wonderModal(ctx, cam, game, ui, boxes, T, m) {
  const [name, gift] = T.wonders[m.wonder];
  const r = modalFrame(ctx, cam, boxes, 300, 440);
  wonderMark(ctx, r.x + r.w / 2, r.y + 74, 34);
  text(ctx, fill(T.wonderDone, name), r.x + r.w / 2, r.y + 150, { title: true, bold: true, size: 20, align: "center", color: "#7a5418" });
  text(ctx, gift[0].toLocaleUpperCase(ui.lang) + gift.slice(1), r.x + r.w / 2, r.y + 178, { size: 15, italic: true, align: "center" });
  text(ctx, fill(T.wonderDoneSub, placeName(m.place, ui.lang)), r.x + r.w / 2, r.y + 202, { size: 13, align: "center", color: INK.soft });
  oneButton(ctx, boxes, r, { label: T.hail, act: { do: "close" } });
}

/** İnşaatın adı: yapı (tarla, sanayi...) ya da harika. */
const buildName = (T, what) => (what.startsWith("wonder:") ? T.wonders[what.slice(7)][0] : T[what]);

/**
 * Şehir kartında Harikalar sekmesi: inşa edilebilen altı harika iki sütunda. Her biri: adı,
 * armağanı, ve durumu - yapılabilirse fiyatı, süresi ve İnşa et; burada yapılıyorsa kalan tur ve
 * Vazgeç; başkası yaptıysa kim ve nerede; kilitliyse neden.
 */
function wondersTab(ctx, game, ui, boxes, T, id, x, top, w, h) {
  buildersRow(ctx, game, boxes, T, id, x, top, w);
  const cw = (w - 10) / 2, ch = Math.min(52, (h - 30) / 3);
  BUILDABLE.forEach((d, i) => {
    const cx = x + (i % 2) * (cw + 10), cy = top + 26 + Math.floor(i / 2) * ch;
    const wi = wonderInfo(game, id, d.id), [name, gift] = T.wonders[d.id];
    const at = placeOfWonder(game, d.id);
    ctx.fillStyle = i % 2 === Math.floor(i / 2) % 2 ? "rgba(90,70,40,0.07)" : "rgba(90,70,40,0.03)";
    ctx.fillRect(cx, cy, cw, ch - 4);
    wonderMark(ctx, cx + 12, cy + 15, 7);
    fit(ctx, name, cx + 24, cy + 18, cw - 112, { bold: true, size: 13, color: at ? INK.soft : INK.ink });
    fit(ctx, gift, cx + 6, cy + 35, cw - 110, { size: 11, italic: true, color: INK.soft });
    const bx = cx + cw - 98, bw = 92;
    if (at) {
      fit(ctx, fill(T.wonderOf, civName(game.places[at].owner, ui.lang, T.free), placeName(at, ui.lang)), bx - 6, cy + 30, bw + 6, { size: 11, bold: true, color: game.places[at].owner === game.player ? INK.good : INK.bad, align: "left" });
    } else if (wi.why === "building") {
      const b = wi.building;
      text(ctx, fill(T.turnsN, b.left), bx + bw, cy + 16, { size: 12, bold: true, align: "right", color: INK.warn });
      ctx.fillStyle = "rgba(90,70,40,0.18)";
      ctx.fillRect(bx, cy + 22, bw, 5);
      ctx.fillStyle = GOLD;
      ctx.fillRect(bx, cy + 22, bw * (1 - b.left / b.total), 5);
      button(ctx, boxes, { x: bx + bw - 60, y: cy + 29, w: 60, h: 18, label: T.cancel, size: 10, act: { do: "cancelBuild", id, what: "wonder:" + d.id } });
    } else {
      text(ctx, fill(T.wonderTurns, wi.cost, wi.turns), bx + bw, cy + 14, { size: 11, align: "right", color: INK.soft });
      button(ctx, boxes, {
        x: bx, y: cy + 20, w: bw, h: 26, label: T.buildWonder, size: 12, main: !wi.why, off: !!wi.why,
        act: { do: "wonder", id, wonder: d.id }, tip: [name, gift, fill(T.wonderTurns, wi.cost, wi.turns), wi.why ? [whyText(wi.why, T), "bad"] : null, T.wonderRaceHint],
      });
    }
  });
}

function menuModal(ctx, cam, game, ui, boxes, T) {
  const r = modalFrame(ctx, cam, boxes, 596, 360);
  text(ctx, T.menu, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  const x = r.x + 20, w = r.w - 40;
  button(ctx, boxes, { x, y: r.y + 62, w, h: 42, label: T.resume, main: true, size: 15, act: { do: "close" } });
  button(ctx, boxes, { x, y: r.y + 114, w, h: 42, label: T.help, size: 15, act: { do: "open", modal: "help" } });
  button(ctx, boxes, { x, y: r.y + 166, w, h: 42, label: T.chronicle, size: 15, act: { do: "open", modal: "chronicle" } });
  const hw = (w - 8) / 2;
  button(ctx, boxes, { x, y: r.y + 218, w: hw, h: 42, label: T.saveBtn, size: 15, act: { do: "slots", mode: "save" } });
  button(ctx, boxes, { x: x + hw + 8, y: r.y + 218, w: hw, h: 42, label: T.loadBtn, size: 15, act: { do: "slots", mode: "load" } });
  button(ctx, boxes, { x, y: r.y + 270, w, h: 42, label: T.newGame, size: 15, act: { do: "askNew" } });
  text(ctx, T.language, x, r.y + 352, { bold: true, size: 14 });
  ["en", "tr"].forEach((l, i) => {
    button(ctx, boxes, { x: x + w - 2 * 56 + i * 56, y: r.y + 330, w: 50, h: 34, label: l.toUpperCase(), main: ui.lang === l, size: 13, act: { do: "lang", lang: l } });
  });
  // Ses ve müzik: ayrı ayrı aç-kapa.
  [["sound", T.soundLabel, soundEnabled()], ["music", T.musicLabel, musicEnabled()], ["fog", T.fogLabel, ui.fog], ["coachSet", T.tipsLabel, !ui.coach?.off]].forEach(([k, label, on], j) => {
    const yy = r.y + 374 + j * 44;
    text(ctx, label, x, yy + 22, { bold: true, size: 14 });
    [[true, T.sndOn], [false, T.sndOff]].forEach(([v, l], i) => {
      button(ctx, boxes, { x: x + w - 2 * 74 + i * 74, y: yy, w: 68, h: 34, label: l, main: on === v, size: 13, act: { do: k, on: v } });
    });
  });
  text(ctx, "Natural Earth · github.com/yahyaari/mare-nostrum", r.x + r.w / 2, r.y + r.h - 22, { size: 10, color: INK.faint, align: "center" });
}

/** Ticaret yolu kur: menzildeki yerler, kazancına göre (en çok 7); her biri Kur düğmesiyle. */
function tradeModal(ctx, cam, game, ui, boxes, T, m) {
  const id = m.id;
  const list = tradeCandidates(game, id).slice(0, 7);
  const r = modalFrame(ctx, cam, boxes, 96 + Math.max(1, list.length) * 46 + 66, 480);
  text(ctx, fill(T.tradeTitle, placeName(id, ui.lang)), r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 19, align: "center" });
  fit(ctx, fill(T.tradeSlots, routesFrom(game, id).length, slotsOf(game, id)), r.x + r.w / 2, r.y + 62, r.w - 40, { italic: true, size: 12, color: INK.soft, align: "center" });
  const x = r.x + 22, w = r.w - 44;
  if (!list.length) text(ctx, T.tradeNoCand, r.x + r.w / 2, r.y + 100, { italic: true, size: 13, color: INK.soft, align: "center" });
  list.forEach((c, i) => {
    const y = r.y + 76 + i * 46;
    const owner = game.places[c.to].owner;
    fit(ctx, (c.way === "sea" ? "⛵ " : "⇢ ") + placeName(c.to, ui.lang), x, y + 18, w - 190, { bold: true, size: 14 });
    fit(ctx, (owner === game.player ? T.tradeOwn : owner ? civName(owner, ui.lang) : T.free) + " · " + (c.way === "sea" ? T.tradeSea : T.tradeLand), x + 18, y + 34, w - 200, { italic: true, size: 11, color: INK.soft });
    amount(ctx, "money", `+${c.value}`, x + w - 170, y + 24, { size: 14, bold: true, color: INK.good });
    button(ctx, boxes, { x: x + w - 96, y: y + 6, w: 96, h: 32, label: T.tradeGo, main: true, size: 13, act: { do: "openRoute", from: id, to: c.to }, tip: [placeName(c.to, ui.lang), fill(T.tradeLine, c.value)] });
  });
  button(ctx, boxes, { x: r.x + r.w / 2 - 80, y: r.y + r.h - 52, w: 160, h: 36, label: T.closeBtn, size: 14, act: { do: "close" } });
}

/**
 * Sana saldırı (incoming.js; kullanıcı 27.10: "biri kaleme saldırdığında bildirim gelsin, simüle et ya da savaş
 * desin"): kim, nereye; iki tarafın askerleri; senin şansın; Sonucu gör ya da Savaş (savunmayı sen yönetirsin).
 * Akın mektubunda "garnizonla savaş" da buraya gelir.
 */
function incomingModal(ctx, cam, game, ui, boxes, T, m) {
  let title, them, mine, owner, sd, sea = false;
  if (m.letter) {
    const it = game.inbox.find((x) => x.id === m.letter);
    if (!it) return;
    const pl = game.places[it.place];
    them = { inf: it.raiders };
    mine = defenders(game, it.place);
    owner = null;
    sd = { att: { civ: null, inf: it.raiders }, def: { ...mine, civ: pl.owner }, walls: wallsOf(game, it.place) };
    title = fill(T.incomingTitle, T.raiders, placeName(it.place, ui.lang));
  } else {
    const it = (game.incoming ?? []).find((x) => x.id === m.id);
    if (!it) return;
    sd = incomingSides(game, it);
    const a = sd.attacker;
    owner = a.owner;
    them = a;
    mine = sd.def;
    sea = !!sd.sea;
    const who = a.bandit ? T.bandits : a.horde ? T.horde : a.barbarian ? T.barbarians : civName(a.owner, ui.lang);
    title = sd.field ? fill(T.incomingArmy, who, placeName(nearestPlace(sd.target), ui.lang)) : fill(T.incomingTitle, who, placeName(it.target, ui.lang));
  }
  // Görsel: akıncılar atlı, ordu yürüyen asker, denizden gelen kadırga (art.js).
  const key = m.letter || them.bandit || them.barbarian || them.horde ? "notice/raid" : sea ? "notice/naval" : "notice/incoming";
  const r = pictureFrame(ctx, cam, boxes, key, 470, 560, { owner: game.player, them: owner, pic: 260, fade: 0.42 });
  const x = r.x + 30, w = r.w - 60;
  let y = r.y + 262;
  wrap(ctx, title, w, { title: true, bold: true, size: 20 }).slice(0, 2).forEach((l, i) => lit(ctx, l, r.x + r.w / 2, y + i * 25, { title: true, bold: true, size: 20, align: "center", color: GOLD_LIGHT }));
  y += 56;
  litFit(ctx, fill(T.incomingThem, troops(T, them, owner)), x, y, w, { size: 14, bold: true, color: "#f0a088" });
  litFit(ctx, fill(T.incomingSub, men(mine) ? troops(T, mine, game.player) : T.undefended), x, y + 22, w, { size: 14, bold: true });
  // Şans: saldıranın tahmininin tersi.
  const e = estimate(sd.att, sd.def, sd.walls).odds;
  const mineOdds = e === "easy" ? "hopeless" : e === "hopeless" ? "easy" : "risky";
  const [label, color] = oddsLabel(mineOdds, T);
  const lw = lit(ctx, `${T.incomingOdds}: `, x, y + 50, { size: 15 });
  lit(ctx, label, x + lw, y + 50, { size: 15, bold: true, color: { easy: "#a8d88a", risky: "#f0c860", hopeless: "#f08a70" }[mineOdds] ?? color });
  const bw = (r.w - 72) / 2, by = r.y + r.h - 62;
  glassButton(ctx, boxes, { x: r.x + 28, y: by, w: bw, h: 44, size: 15, label: T.incomingSee, act: { do: "incomingSee" }, tip: [T.incomingSee, T.seeResultTip] }, over(r.x + 28, by, bw, 44));
  glassButton(ctx, boxes, { x: r.x + 44 + bw, y: by, w: bw, h: 44, size: 15, main: true, label: T.incomingFight, off: sea, act: { do: "incomingFight" }, tip: [T.incomingFight, T.incomingFightTip] }, over(r.x + 44 + bw, by, bw, 44) && !sea);
}

/**
 * Kaydet / Yükle (kayıt yuvaları, main.js): her yuva bir satır - medeniyetin rengi ve adı, tur, ne zaman
 * kaydedildiği; sağda Kaydet ya da Yükle. Yüklerken en üstte otomatik kayıt da var.
 */
function slotsModal(ctx, cam, game, ui, boxes, T, m) {
  const load = m.mode === "load";
  const rows = [...(load && ui.saved ? [{ key: "auto", meta: ui.saved }] : []), ...Array.from({ length: m.count }, (_, i) => ({ key: i + 1, meta: ui.slots?.[i + 1] ?? null }))];
  const r = modalFrame(ctx, cam, boxes, 92 + rows.length * 62 + 66, 460);
  text(ctx, load ? T.loadTitle : T.saveTitle, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  const x = r.x + 22, w = r.w - 44;
  rows.forEach((row, i) => {
    const y = r.y + 64 + i * 62, s = row.meta;
    ctx.fillStyle = "rgba(120,95,60,0.08)";
    roundRect(ctx, x, y, w, 54, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(90,70,48,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Medeniyetin rengi; boş yuvada soluk halka.
    ctx.beginPath();
    ctx.arc(x + 24, y + 27, 12, 0, TAU);
    if (s) { ctx.fillStyle = colorOf(s.player); ctx.fill(); }
    ctx.strokeStyle = s ? GOLD_DARK : "rgba(90,70,48,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const label = row.key === "auto" ? T.autoSlot : fill(T.slotN, row.key);
    text(ctx, label, x + 46, y + 22, { bold: true, size: 14 });
    const sub = !s ? T.slotEmpty
      : fill(T.contInfo, civName(s.player, ui.lang), s.turn) + (s.players > 1 ? ` · ${fill(T.playersN, s.players)}` : "")
        + (s.at ? " · " + new Date(s.at).toLocaleString(ui.lang === "tr" ? "tr-TR" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
    fit(ctx, sub, x + 46, y + 41, w - 46 - 112, { italic: true, size: 12, color: s ? INK.soft : INK.faint });
    const act = load ? { do: "continue", slot: row.key === "auto" ? null : row.key } : { do: "saveSlot", n: row.key };
    button(ctx, boxes, { x: x + w - 100, y: y + 10, w: 92, h: 34, label: load ? T.loadBtn : T.saveBtn, main: !load || !!s, size: 14, off: load && !s, act });
  });
  button(ctx, boxes, { x: r.x + r.w / 2 - 80, y: r.y + r.h - 54, w: 160, h: 38, label: T.closeBtn, size: 14, act: { do: "close" } });
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
  const a = it.type === "offer" ? it.amount ?? "" : it.raiders ?? it.count ?? "";
  const b = it.type === "offer" ? N.offers.truce : it.bribe ?? "";
  return {
    title: fill(L.title, who, a, b),
    body: fill(L.body, who, a, b),
    options: letterOptions(game, it).map((o) => ({ ...o, label: fill(L[o.key], who, a, b) })),
  };
}

/** Olay ya da teklif: bir karar, kapatılamaz; seçenekler alt alta. */
/**
 * Mektup (olay ya da teklif): görselli pencere (kullanıcı 27.10: "akıncılar geldiğinde ekranda atlı adamlar, altında
 * yazı; yazıların arka planı görsel olsun"). Üstte olayın görseli (art.js, "notice/<olay>"), altında başlık, mektup
 * ve seçenekler; teklifte liderin portresi görselin köşesinde, sözü başlığın üstünde.
 */
function decideModal(ctx, cam, game, ui, boxes, T) {
  const it = game.inbox.find((x) => ownerOf(game, x) === game.player);
  if (!it) return;
  const L = letterText(game, it, ui.lang);
  const W = Math.min(cam.w - 24, 540);
  const body = wrap(ctx, L.body, W - 64, { size: 15 });
  const offer = it.type === "offer";
  const level = offer ? moodLevel(moodOf(game, it.civ, game.player).score) : null;
  const line = offer ? leaderLine(T, it.civ, { tribute: "demand", peace: "peaceAsk", ally: "friendly", trade: "friendly" }[it.key], level) : null;
  const say = offer ? wrap(ctx, "“" + line + "”", W - 64, { size: 15, italic: true }) : [];
  const pic = 270, sayH = say.length ? say.length * 21 + 8 : 0;
  const H = pic + sayH + 36 + body.length * 21 + 14 + L.options.length * 50 + 16;
  const r = pictureFrame(ctx, cam, boxes, `notice/${it.key}`, H, 560, { owner: game.player, them: it.civ ?? null, pic, fade: Math.max(0.2, (pic - 70) / H) });
  if (offer) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 10;
    portrait(ctx, it.civ, r.x + 64, r.y + 64, 44, it.key === "tribute" ? "cold" : level);
    ctx.restore();
  }
  let y = r.y + pic;
  say.forEach((l, i) => lit(ctx, l, r.x + r.w / 2, y + i * 21, { size: 15, italic: true, align: "center" }));
  y += sayH;
  lit(ctx, L.title, r.x + r.w / 2, y + 14, { title: true, bold: true, size: 22, align: "center", color: GOLD_LIGHT });
  y += 40;
  body.forEach((l, i) => lit(ctx, l, r.x + r.w / 2, y + i * 21, { size: 15, align: "center", italic: true }));
  const by = y + body.length * 21 + 4;
  L.options.forEach((o, i) => glassButton(ctx, boxes, { x: r.x + 28, y: by + i * 50, w: r.w - 56, h: 42, label: o.label, size: 14, off: o.off, main: i === 0 && !o.off, act: { do: "decide", id: it.id, choice: o.key } }, over(r.x + 28, by + i * 50, r.w - 56, 42) && !o.off));
}

/** Görselin üstünde, genişliğe sığdırılmış gölgeli yazı. */
function litFit(ctx, s, x, y, w, o = {}) {
  let size = o.size ?? 14;
  while (size > 9 && measure(ctx, s, { ...o, size }) > w) size -= 0.5;
  return lit(ctx, s, x, y, { ...o, size });
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
    fit(ctx, whereText(a, T, ui.lang) + g, x + 30, y + 20, r.w - 220, { bold: true, size: 15 });
    text(ctx, troops(T, a) + (fleetOf(a) ? `  ·  ⛵ ${fleetOf(a)}` : ""), x + 30, y + 39, { size: 13, color: INK.soft });
    const [state, color] = a.route.length ? [routeText(a, T, ui.lang), INK.ink]
      : a.mp > 0.05 ? [fill(T.movesLeft, Math.round((a.mp / mpMax(a)) * 100)), INK.good] : [T.spentShort, INK.faint];
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
    if (wondersAt(game, id).length) { wonderMark(ctx, x + nw + 14, y + 15, 7.5); nw += 22; }
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
  const body = wrap(ctx, L.body, 440, { size: 15, italic: true });
  const pic = 200;
  const r = pictureFrame(ctx, cam, boxes, `notice/mission`, pic + 70 + body.length * 22 + 100, 540, { owner: game.player, pic, fade: Math.max(0.2, (pic - 60) / (pic + 70 + body.length * 22 + 100)) });
  const cx = r.x + r.w / 2;
  lit(ctx, fill(T.mFrom, T.councils[game.player]), cx, r.y + pic - 26, { italic: true, size: 13, align: "center" });
  lit(ctx, L.title, cx, r.y + pic + 2, { title: true, bold: true, size: 22, align: "center", color: GOLD_LIGHT });
  body.forEach((l, i) => lit(ctx, l, cx, r.y + pic + 34 + i * 22, { size: 15, italic: true, align: "center" }));
  const y = r.y + pic + 34 + body.length * 22 + 8;
  lit(ctx, leftText(game, m, T), r.x + 30, y + 4, { bold: true, size: 13, color: "#f0c860" });
  const rw = lit(ctx, T.mReward + ":", r.x + r.w - 160, y + 4, { bold: true, size: 13 });
  costLine(ctx, m.reward, r.x + r.w - 160 + rw + 52, y + 4, CREAM, 13);
  const bw = (r.w - 72) / 2, by = r.y + r.h - 58;
  glassButton(ctx, boxes, { x: r.x + 28, y: by, w: bw, h: 42, label: T.mAccept, main: true, act: { do: "missionAccept", id: m.id } }, over(r.x + 28, by, bw, 42));
  glassButton(ctx, boxes, { x: r.x + 44 + bw, y: by, w: bw, h: 42, label: T.mDecline, act: { do: "missionDecline", id: m.id } }, over(r.x + 44 + bw, by, bw, 42));
}

/** Alt menüden: açık görevler. Yeri olan göreve basınca harita oraya kayar. */
function missionsModal(ctx, cam, game, ui, boxes, T) {
  const list = (game.missions ?? []).filter((x) => x.civ === game.player);
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

/**
 * Zafer yolları (rules/victory.js): Fetih (kaç rakip ayakta), Harikalar (altı harikanın sahipleri,
 * sayaçlar), Skor (sıralama, kaç tur kaldığı). Üst banttaki skor çipinden açılır.
 */
function victoryModal(ctx, cam, game, ui, boxes, T) {
  const me = game.player;
  const r = modalFrame(ctx, cam, boxes, 596, 560);
  const x = r.x + 24, w = r.w - 48;
  text(ctx, T.victoryTitle, r.x + r.w / 2, r.y + 40, { title: true, bold: true, size: 20, align: "center" });
  let y = r.y + 76;
  const head = (title, sub) => {
    text(ctx, title.toLocaleUpperCase(ui.lang), x, y, { title: true, bold: true, size: 13, color: INK.warn });
    fit(ctx, sub, x + 110, y, w - 110, { italic: true, size: 12, color: INK.soft });
    y += 20;
  };
  const bar = (f, color, h = 8) => {
    ctx.fillStyle = "rgba(90,70,40,0.18)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h);
    ctx.strokeStyle = "#5a4630";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  };
  // Fetih
  const rivals = CIVS.filter((c) => c.id !== me), standing = rivals.filter((c) => game.civs[c.id].alive).length;
  head(T.vConquest, T.vConquestText);
  bar((rivals.length - standing) / rivals.length, INK.bad);
  y += 22;
  text(ctx, fill(T.vConquestProg, standing, rivals.length, placesOf(game, me).length), x, y, { size: 13 });
  y += 30;
  // Harikalar: altı harika, her birinin şimdiki sahibi.
  head(T.vWonders, fill(T.vWondersText, N.victory.wonders, N.victory.hold, ALL_WONDERS.length));
  const cw = w / 3;
  ALL_WONDERS.forEach((wid, i) => {
    const cx = x + (i % 3) * cw, cy = y + Math.floor(i / 3) * 20 + 12;
    const at = placeOfWonder(game, wid), owner = at ? game.places[at].owner : undefined;
    // Henüz yapılmamış harika soluk, sahipsiz.
    if (at) shield(ctx, owner, cx, cy - 11, 11);
    else text(ctx, "·", cx + 5, cy, { size: 14, color: INK.faint });
    fit(ctx, T.wonders[wid][0], cx + 15, cy, cw - 18, { size: 12, bold: owner === me, color: !at ? INK.faint : owner === me ? INK.good : INK.ink });
  });
  y += 4 * 20 + 12;
  const mine = ALL_WONDERS.filter((wid) => { const at = placeOfWonder(game, wid); return at && game.places[at].owner === me; }).length;
  text(ctx, fill(T.vWondersYou, mine, ALL_WONDERS.length), x, y, { size: 13 });
  for (const c of CIVS) {
    const left = wonderTurnsLeft(game, c.id);
    if (left === null) continue;
    y += 18;
    text(ctx, fill(T.vRace, civName(c.id, ui.lang), left), x, y, { size: 13, bold: true, color: c.id === me ? INK.good : INK.bad });
  }
  y += 30;
  // Skor
  head(T.vScore, fill(T.vScoreText, N.victory.turns) + " · " + fill(T.vTurnsLeft, Math.max(0, N.victory.turns - game.turn + 1)));
  const rank = ranking(game), top = Math.max(1, rank[0].total);
  rank.forEach((row, i) => {
    const ry = y + i * 24, dead = !game.civs[row.civ].alive;
    if (row.civ === me) { ctx.fillStyle = "rgba(201,164,90,0.18)"; ctx.fillRect(x - 6, ry - 4, w + 12, 22); }
    text(ctx, `${i + 1}.`, x, ry + 12, { size: 13, bold: true, color: dead ? INK.faint : INK.ink });
    shield(ctx, row.civ, x + 22, ry, 13);
    fit(ctx, civName(row.civ, ui.lang), x + 42, ry + 12, 110, { size: 13, bold: row.civ === me, color: dead ? INK.faint : INK.ink });
    ctx.fillStyle = dead ? "rgba(90,70,40,0.15)" : colorOf(row.civ);
    ctx.fillRect(x + 160, ry + 3, (w - 210) * (row.total / top), 10);
    text(ctx, String(row.total), x + w, ry + 12, { size: 13, bold: true, align: "right", color: dead ? INK.faint : INK.ink });
    if (row.civ === me) {
      const p = scoreOf(game, me).parts;
      boxes.push({ x: x - 6, y: ry - 4, w: w + 12, h: 22, act: null, tip: [T.scoreChip, fill(T.scoreParts, p.lands, p.people, p.wonders, p.army, p.wins, p.techs)] });
    }
  });
  oneButton(ctx, boxes, r, { label: T.ok, act: { do: "close" } });
}

function overModal(ctx, cam, game, ui, boxes, T) {
  const o = game.over, won = o.result === "won";
  const r = pictureFrame(ctx, cam, boxes, won ? "notice/victory" : "notice/defeat", 420, 540, { owner: game.player, pic: 250, fade: 0.45 });
  const many = humansOf(game).length > 1;
  const cx = r.x + r.w / 2;
  lit(ctx, many && o.winner ? fill(T.winnerIs, civName(o.winner, ui.lang)) : won ? T.victory : T.defeat, cx, r.y + 228, { title: true, bold: true, size: 30, align: "center", color: won ? "#a8d88a" : "#f08a70" });
  // Hangi yoldan: fetih, harikalar, skor; kaybedildiyse kim kazandı.
  const kind = { conquest: T.vConquest, wonders: T.vWonders, score: T.vScore }[o.kind];
  if (kind) lit(ctx, kind.toLocaleUpperCase(ui.lang), cx, r.y + 254, { title: true, bold: true, size: 13, align: "center", color: "#f0c860" });
  const who = civName(o.winner, ui.lang);
  const line = won && !many ? fill({ conquest: T.victoryText, wonders: T.winWonders, score: T.winScore }[o.kind] ?? T.victoryText, o.turn)
    : o.kind === "wonders" ? fill(T.loseWonders, who) : o.kind === "score" ? fill(T.loseScore, who, rankOf(game, game.player)) : fill(T.defeatText, o.turn);
  wrap(ctx, line, r.w - 60, { size: 15 }).slice(0, 2).forEach((l, i) => lit(ctx, l, cx, r.y + 284 + i * 20, { size: 15, align: "center" }));
  const bw = (r.w - 72) / 2, by = r.y + r.h - 60;
  glassButton(ctx, boxes, { x: r.x + 28, y: by, w: bw, h: 42, label: T.newGame, main: true, act: { do: "newGame" } }, over(r.x + 28, by, bw, 42));
  glassButton(ctx, boxes, { x: r.x + 44 + bw, y: by, w: bw, h: 42, label: T.summary, act: { do: "summary" } }, over(r.x + 44 + bw, by, bw, 42));
}

/**
 * Oyun sonu özeti (kullanıcı 23.10, önerilen küçük işlerin sonuncusu; Civilization'ın oyun sonu
 * ekranı gibi): solda dünyanın tur tur tekrarı (mini harita, oynat/durdur, zaman çizgisi), sağda
 * herkesin skoru oyun boyunca ve son sıralama, altta oyuncunun sayıları.
 */
function summaryModal(ctx, cam, game, ui, boxes, T, m) {
  const me = game.player, ch = game.chronicle ?? {};
  const turns = ch.owners?.length ?? 0;
  const r = modalFrame(ctx, cam, boxes, Math.min(cam.h - 24, 640), 1040);
  text(ctx, T.summaryTitle, r.x + r.w / 2, r.y + 38, { title: true, bold: true, size: 22, align: "center" });
  const o = game.over;
  if (o) {
    const line = humansOf(game).length > 1 && o.winner ? fill(T.winnerIs, civName(o.winner, ui.lang)) : o.result === "won" ? T.victory : T.defeat;
    text(ctx, line, r.x + r.w / 2, r.y + 60, { italic: true, size: 14, align: "center", color: o.result === "won" ? INK.good : INK.bad });
  }
  // Sol: harita tekrarı.
  const mw = Math.min(500, r.w * 0.5 - 40), mh = Math.round((mw * SIZE.y) / SIZE.x);
  const mx = r.x + 24, my = r.y + 96;
  text(ctx, T.sumMap.toLocaleUpperCase(ui.lang), mx, my - 10, { title: true, bold: true, size: 12, color: INK.warn });
  const now = performance.now();
  const step = 90; // milisaniye / tur
  let i = m.turn ?? turns - 1;
  if (m.playing && turns) i = Math.min(turns - 1, Math.floor((now - m.from) / step));
  if (m.playing && i >= turns - 1) m.playing = false;
  m.turn = i;
  const owners = turns ? ownersAt(game, Math.max(0, i)) : Object.fromEntries(Object.keys(game.places).map((id) => [id, game.places[id].owner]));
  drawMinimap(ctx, { x: mx, y: my, w: mw, h: mh }, null, owners);
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 2;
  ctx.strokeRect(mx - 1, my - 1, mw + 2, mh + 2);
  // Zaman çizgisi: oynat/durdur, çubuk (basılan tura atlar), tur.
  const ty = my + mh + 14;
  button(ctx, boxes, { x: mx, y: ty, w: 40, h: 30, label: m.playing ? "❚❚" : "▶", size: 13, act: { do: "summaryPlay" } });
  const bx = mx + 50, bw = mw - 50 - 90;
  ctx.fillStyle = "rgba(90,70,40,0.18)";
  ctx.fillRect(bx, ty + 12, bw, 6);
  ctx.fillStyle = GOLD;
  ctx.fillRect(bx, ty + 12, turns > 1 ? (bw * i) / (turns - 1) : bw, 6);
  for (let k = 0; k < 20; k++) {
    const x0 = bx + (bw * k) / 20;
    boxes.push({ x: x0, y: ty, w: bw / 20 + 1, h: 30, act: { do: "summaryTurn", turn: Math.round(((turns - 1) * (k + 0.5)) / 20) } });
  }
  text(ctx, fill(T.chrTurn, i + 1), mx + mw, ty + 20, { bold: true, size: 13, align: "right" });
  // Sağ: skor grafiği ve sıralama.
  const gx = mx + mw + 40, gw = r.x + r.w - 24 - gx, gy = my, gh = mh;
  text(ctx, T.sumScore.toLocaleUpperCase(ui.lang), gx, gy - 10, { title: true, bold: true, size: 12, color: INK.warn });
  ctx.fillStyle = "rgba(90,70,40,0.07)";
  ctx.fillRect(gx, gy, gw, gh);
  const sc = ch.score ?? [];
  const top = Math.max(1, ...sc.flat());
  CIVS.forEach((c, k) => {
    if (sc.length < 2) return;
    ctx.beginPath();
    sc.forEach((row, t) => {
      const px = gx + (gw * t) / (sc.length - 1), py = gy + gh - (gh * row[k]) / top;
      if (t) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    });
    ctx.strokeStyle = colorOf(c.id);
    ctx.lineWidth = c.id === me ? 3 : 1.6;
    ctx.stroke();
  });
  // Tekrarın şimdiki turu grafikte de.
  if (sc.length > 1) {
    const px = gx + (gw * Math.min(i, sc.length - 1)) / (sc.length - 1);
    ctx.beginPath();
    ctx.moveTo(px + 0.5, gy);
    ctx.lineTo(px + 0.5, gy + gh);
    ctx.strokeStyle = "rgba(60,45,25,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const rank = ranking(game);
  rank.forEach((row, k) => {
    const cx = gx + (k % 2) * (gw / 2), cy = ty + 16 + Math.floor(k / 2) * 19;
    shield(ctx, row.civ, cx, cy - 11, 11);
    fit(ctx, `${fill(T.rankN, k + 1)} ${civName(row.civ, ui.lang)} · ${row.total}`, cx + 16, cy, gw / 2 - 20, { size: 12, bold: row.civ === me, color: game.civs[row.civ].alive ? INK.ink : INK.faint });
  });
  // Alt: oyuncunun sayıları.
  const k = CIVS.findIndex((c) => c.id === me);
  const most = Math.max(0, ...(ch.places ?? []).map((row) => row[k]));
  const army = Math.max(0, ...(ch.men ?? []).map((row) => row[k]));
  const taken = (game.annals ?? []).filter((a) => a.k === "took" && a.by === me).length;
  const stats = [
    [T.stScore, `${scoreOf(game, me).total} (${fill(T.rankN, rankOf(game, me))})`],
    [T.stPlaces, `${placesOf(game, me).length} (${most})`],
    [T.stArmy, fill(T.soldiers, army)],
    [T.stWins, String(game.wins?.[me] ?? 0)],
    [T.stTaken, String(taken)],
    [T.stTech, `${game.civs[me].techs?.length ?? 0} / ${TECHS.length}`],
    [T.stWonders, String(wondersOfCiv(game, me).length)],
  ];
  const sy = ty + 16 + Math.ceil(rank.length / 2) * 19 + 26;
  const sw = (r.w - 48) / stats.length;
  stats.forEach(([label, v], n) => {
    const sx = r.x + 24 + n * sw;
    ctx.fillStyle = n % 2 ? "rgba(90,70,40,0.05)" : "rgba(90,70,40,0.1)";
    ctx.fillRect(sx, sy, sw - 6, 52);
    fit(ctx, label, sx + (sw - 6) / 2, sy + 18, sw - 14, { size: 11, color: INK.soft, align: "center" });
    fit(ctx, v, sx + (sw - 6) / 2, sy + 40, sw - 14, { size: 16, bold: true, align: "center" });
  });
  const bw2 = (r.w - 56) / 3, by = r.y + r.h - 62;
  button(ctx, boxes, { x: r.x + 20, y: by, w: bw2, h: 44, size: 15, main: true, label: T.newGame, act: { do: "newGame" } });
  button(ctx, boxes, { x: r.x + 28 + bw2, y: by, w: bw2, h: 44, size: 15, label: T.chronicle, act: { do: "open", modal: "chronicle" } });
  button(ctx, boxes, { x: r.x + 36 + 2 * bw2, y: by, w: bw2, h: 44, size: 15, label: T.ok, act: { do: "open", modal: game.over ? "over" : null } });
}

