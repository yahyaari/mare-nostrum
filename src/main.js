// Açılış, girdi, kayıt ve çizim döngüsü. Oyunun kuralları src/rules/ içinde; burası sadece
// basışı bir kurala çeviriyor ve sonucu ekrana getiriyor.
//
// Çizim sadece bir şey değiştiğinde yapılıyor: sıra tabanlı bir haritada boşta bekleyen bir
// döngü telefonun pilini yemekten başka bir şey yapmaz.

import { CIVS, PLACES } from "./data/world.js";
import { estimate } from "./rules/combat.js";
import { breakAlliance, declareWar, proposeAlliance, proposePeace } from "./rules/diplomacy.js";
import { neighbours } from "./rules/graph.js";
import { access, attack, canAttack, defenders, hostile, order, routeTo, wallsOf } from "./rules/moves.js";
import {
  VERSION, armyById, formArmy, merge, men, newGame, placesOf, recruit, split, station, upgrade,
} from "./rules/state.js";
import { checkOver, endTurn } from "./rules/turn.js";
import { TEXT, fill } from "./text.js";
import { clamp, focus, makeCamera, panBy, resize, zoomAt } from "./view/camera.js";
import { drawMap, placeAt, placeOnScreen } from "./view/draw.js";
import { civName } from "./view/kit.js";
import { drawUI, eventLines } from "./view/ui.js";

const started = performance.now();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const cam = makeCamera();

let game = null;
const ui = { screen: "start", lang: pickLang(), level: pickLevel(), pick: null, saved: null, sel: null, modal: null, toast: null };
const startOwners = Object.fromEntries(PLACES.map((p) => [p.id, p.owner]));

let dpr = 1;
let boxes = [];
let tokens = [];
let queued = false;

// ---- kayıt ----
//
// Tarayıcının kendi deposu: gizli pencerede ya da engellenmişse hata fırlatabilir. Kayıt bir
// kolaylık; yazılamazsa oyun yine oynanır.

const SAVE = "mn.save";

function save() {
  if (!game) return;
  try { localStorage.setItem(SAVE, JSON.stringify(game)); } catch { /* bkz. yukarı */ }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE) ?? "null");
    if (s && s.version === VERSION && s.places && s.civs) return s;
  } catch { /* bozuk kayıt: yokmuş gibi */ }
  return null;
}

function forget() {
  try { localStorage.removeItem(SAVE); } catch { /* bkz. yukarı */ }
}

function pickLevel() {
  try {
    const saved = localStorage.getItem("mn.level");
    if (saved === "easy" || saved === "normal" || saved === "hard") return saved;
  } catch { /* varsayılan */ }
  return "normal";
}

function pickLang() {
  const asked = new URLSearchParams(location.search).get("lang");
  if (asked === "en" || asked === "tr") return asked;
  try {
    const saved = localStorage.getItem("mn.lang");
    if (saved === "en" || saved === "tr") return saved;
  } catch { /* varsayılan */ }
  return "en";
}

// ---- çizim ----

function redraw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    tokens = drawMap(ctx, cam, mapView(), dpr);
    boxes = [];
    drawUI(ctx, cam, game, ui, boxes);
  });
}

const ownArmy = () => {
  if (!game || ui.sel?.kind !== "army") return null;
  const a = armyById(game, ui.sel.id);
  return a && a.owner === game.player ? a : null;
};

function mapView() {
  const view = { lang: ui.lang, owners: startOwners, selected: null, armies: [], marks: null, route: null };
  if (!game) return view;
  view.owners = Object.fromEntries(Object.entries(game.places).map(([id, p]) => [id, p.owner]));
  view.selected = ui.sel?.kind === "place" ? ui.sel.id : null;
  view.armies = game.armies.map((a) => ({
    id: a.id, owner: a.owner, at: a.at, men: men(a),
    selected: ui.sel?.kind === "army" && ui.sel.id === a.id,
    spent: a.owner === game.player && a.moves <= 0,
  }));
  const a = ownArmy();
  if (a) {
    view.marks = {};
    // Bu tur yürünebilecek yerler, ve yanındaki saldırılabilecek yerler tahmin renginde.
    let ring = [a.at];
    const seen = new Set(ring);
    for (let step = 0; step < a.moves; step++) {
      const next = [];
      for (const id of ring) {
        for (const n of neighbours(id)) {
          const k = access(game, a.owner, n);
          if (seen.has(n) || !(k === "own" || k === "ally")) continue;
          seen.add(n);
          next.push(n);
          view.marks[n] = "walk";
        }
      }
      ring = next;
    }
    if (a.moves > 0) {
      for (const n of neighbours(a.at)) {
        if (!hostile(access(game, a.owner, n))) continue;
        view.marks[n] = estimate({ civ: a.owner, inf: a.inf, arch: a.arch }, defenders(game, n), wallsOf(game, n)).odds;
      }
    }
    if (a.route.length) view.route = [a.at, ...a.route];
  }
  return view;
}

function fit() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  resize(cam, w, h);
  redraw();
}

function toast(text) {
  ui.toast = { text, until: performance.now() + 2600 };
  setTimeout(redraw, 2700);
  redraw();
}

function lookAtHome() {
  const home = placesOf(game, game.player).find((id) => PLACES.find((p) => p.id === id).capital) ?? placesOf(game, game.player)[0];
  if (!home) return;
  const m = placeAt(home);
  focus(cam, m.x, m.y, cam.min * (cam.w < 640 ? 1.5 : 2.4));
}

// ---- eylemler ----

const T = () => TEXT[ui.lang];

function dispatch(act) {
  const me = game?.player;
  const m = ui.modal;
  switch (act.do) {
    case "lang":
      ui.lang = act.lang;
      try { localStorage.setItem("mn.lang", act.lang); } catch { /* varsayılan */ }
      break;
    case "pick":
      ui.pick = act.civ;
      break;
    case "level":
      ui.level = act.level;
      try { localStorage.setItem("mn.level", act.level); } catch { /* varsayılan */ }
      break;
    case "start":
      if (!ui.pick) break;
      game = newGame(ui.pick, (Date.now() % 1e9) | 0, ui.level);
      ui.screen = "game";
      ui.sel = null;
      ui.modal = { kind: "help" };
      lookAtHome();
      save();
      break;
    case "continue":
      game = load();
      if (!game) { ui.saved = null; break; }
      ui.screen = "game";
      ui.sel = null;
      ui.modal = game.over ? { kind: "over" } : null;
      lookAtHome();
      break;
    case "newGame":
      forget();
      ui.pick = game?.player ?? ui.pick;
      game = null;
      ui.saved = null;
      ui.screen = "start";
      ui.sel = null;
      ui.modal = null;
      cam.scale = cam.min;
      clamp(cam);
      break;
    case "askNew":
      ui.modal = { kind: "confirm", text: T().newGameQ, yes: { do: "newGame" } };
      break;
    case "open":
      ui.modal = { kind: act.modal };
      break;
    case "close":
      ui.modal = game?.over ? { kind: "over" } : null;
      break;
    case "endTurn": {
      ui.modal = null;
      endTurn(game);
      if (ui.sel?.kind === "army" && !armyById(game, ui.sel.id)) ui.sel = null;
      if (game.over) ui.modal = { kind: "over" };
      else if (eventLines(game, ui.lang).length) ui.modal = { kind: "report" };
      else toast(T().quiet);
      save();
      break;
    }
    case "upgrade":
      upgrade(game, act.id, act.what);
      save();
      break;
    case "recruit":
      recruit(game, act.id, act.type);
      save();
      break;
    case "formOpen": {
      const pl = game.places[act.id];
      ui.modal = { kind: "form", id: act.id, inf: pl.inf, arch: pl.arch };
      break;
    }
    case "formStep": {
      const max = game.places[m.id][act.type];
      m[act.type] = act.by === Infinity ? max : Math.max(0, Math.min(max, m[act.type] + act.by));
      break;
    }
    case "formOk": {
      const a = formArmy(game, m.id, m.inf, m.arch);
      ui.modal = null;
      if (a) ui.sel = { kind: "army", id: a.id };
      save();
      break;
    }
    case "station":
      station(game, act.army);
      ui.sel = null;
      save();
      break;
    case "split": {
      const b = split(game, act.army);
      if (b) ui.sel = { kind: "army", id: b.id };
      save();
      break;
    }
    case "merge":
      merge(game, act.army, act.from);
      save();
      break;
    case "attackAsk":
      ui.modal = { kind: "attack", army: act.army, id: act.id };
      break;
    case "attack": {
      const ev = attack(game, m.army, m.id);
      ui.modal = ev ? { kind: "battle", ev } : null;
      ui.sel = ev?.won ? { kind: "army", id: m.army } : null;
      checkOver(game);
      save();
      break;
    }
    case "askWar":
      ui.modal = { kind: "confirm", text: fill(T().declareQ, civName(act.civ, ui.lang)), yes: { do: "war", civ: act.civ } };
      break;
    case "war":
      declareWar(game, me, act.civ);
      ui.modal = { kind: "diplo" };
      save();
      break;
    case "ally": {
      const ev = proposeAlliance(game, me, act.civ);
      if (ev) toast(fill(ev.type === "ally" ? T().accepted : T().refused, civName(act.civ, ui.lang)));
      save();
      break;
    }
    case "askBreak":
      ui.modal = { kind: "confirm", text: fill(T().breakQ, civName(act.civ, ui.lang)), yes: { do: "break", civ: act.civ } };
      break;
    case "break":
      breakAlliance(game, me, act.civ);
      ui.modal = { kind: "diplo" };
      save();
      break;
    case "peace": {
      const ev = proposePeace(game, me, act.civ);
      if (ev) toast(fill(ev.type === "peace" ? T().accepted : T().refused, civName(act.civ, ui.lang)));
      save();
      break;
    }
  }
  redraw();
}

// ---- haritaya basış ----

function tapMap(x, y) {
  // Ordu sancağı
  const t = [...tokens].reverse().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  const mine = ownArmy();
  if (t) {
    const a = armyById(game, t.army);
    // Seçili ordu varken yabancı bir sancağa basmak, onun durduğu yere basmaktır.
    if (mine && a.owner !== game.player) return tapPlace(a.at);
    ui.sel = { kind: "army", id: a.id };
    return redraw();
  }
  const p = nearest(x, y);
  if (!p) { ui.sel = null; return redraw(); }
  tapPlace(p.id);
}

function tapPlace(id) {
  const a = ownArmy();
  if (!a || id === a.at) {
    ui.sel = { kind: "place", id };
    return redraw();
  }
  const k = access(game, a.owner, id);
  if (k === null) {
    ui.sel = { kind: "place", id };
    toast(fill(T().neutralBlock, civName(game.places[id].owner, ui.lang)));
    return;
  }
  if (hostile(k) && canAttack(game, a, id)) {
    ui.modal = { kind: "attack", army: a.id, id };
    return redraw();
  }
  if (hostile(k) && neighbours(a.at).includes(id)) {
    // Yanında ama hareketi bitmiş: bilgi kartını göster.
    ui.sel = { kind: "place", id };
    return redraw();
  }
  if (routeTo(game, a, id) === null || order(game, a.id, id) < 0) toast(T().noPath);
  save();
  redraw();
}

/** Basılan yere en yakın yerleşim, parmak ucunun kapladığı alan içindeyse. */
function nearest(x, y) {
  let best = null, bestD = 22;
  for (const p of PLACES) {
    const s = placeOnScreen(cam, p.id);
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

function tap(x, y) {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      if (b.act) dispatch(b.act);
      return; // kutunun boş yeri de basışı yutar
    }
  }
  if (ui.screen === "game") tapMap(x, y);
}

// ---- girdi ----
//
// Tek parmak/fare: sürükle = kaydır, yerinde bırak = bas. İki parmak: kıstır = yakınlaş.
// Tekerlek: imlecin altındaki yere doğru yakınlaş.

const pointers = new Map();
let gesture = null;

const at = (e) => {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

window.addEventListener("pointerdown", (e) => {
  pointers.set(e.pointerId, at(e));
  if (pointers.size === 1) {
    const p = at(e);
    gesture = { moved: 0, startX: p.x, startY: p.y };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { pinch: true, dist: Math.hypot(a.x - b.x, a.y - b.y), moved: 99 };
  }
});

window.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const now = at(e);
  pointers.set(e.pointerId, now);
  if (!gesture || ui.modal) return;
  if (gesture.pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (gesture.dist > 0) zoomAt(cam, dist / gesture.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
    panBy(cam, (now.x - prev.x) / 2, (now.y - prev.y) / 2);
    gesture.dist = dist;
    redraw();
  } else if (!gesture.pinch) {
    gesture.moved = Math.max(gesture.moved, Math.hypot(now.x - gesture.startX, now.y - gesture.startY));
    if (gesture.moved > 6) {
      panBy(cam, now.x - prev.x, now.y - prev.y);
      redraw();
    }
  }
});

const release = (e) => {
  if (!pointers.has(e.pointerId)) return;
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (gesture && !gesture.pinch && gesture.moved <= 6 && e.type === "pointerup") tap(p.x, p.y);
  if (!pointers.size) gesture = null;
};
window.addEventListener("pointerup", release);
window.addEventListener("pointercancel", release);

window.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (ui.modal) return;
  const p = at(e);
  zoomAt(cam, Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  redraw();
}, { passive: false });

window.addEventListener("keydown", (e) => {
  const step = 80;
  const keys = {
    "+": () => zoomAt(cam, 1.25, cam.w / 2, cam.h / 2),
    "=": () => zoomAt(cam, 1.25, cam.w / 2, cam.h / 2),
    "-": () => zoomAt(cam, 0.8, cam.w / 2, cam.h / 2),
    ArrowLeft: () => panBy(cam, step, 0),
    ArrowRight: () => panBy(cam, -step, 0),
    ArrowUp: () => panBy(cam, 0, step),
    ArrowDown: () => panBy(cam, 0, -step),
    Escape: () => { if (ui.modal) dispatch({ do: "close" }); else ui.sel = null; },
  };
  if (keys[e.key]) { keys[e.key](); redraw(); }
});

window.addEventListener("resize", fit);

// ---- açılış ----

{
  const s = load();
  if (s) {
    ui.saved = { player: s.player, turn: s.turn };
    ui.pick = s.player;
  }
}
fit();

// Araçlar (Tools/peek.mjs) için: oyunun içine bakma ve bir anı kurma kapısı.
window.MareNostrum = {
  cam, ui, dispatch, redraw, tap,
  get game() { return game; },
  set game(g) { game = g; ui.screen = g ? "game" : "start"; redraw(); },
  look(id, zoom = 1) {
    const mm = placeAt(id);
    focus(cam, mm.x, mm.y, cam.min * zoom);
    redraw();
  },
  overview() { cam.scale = cam.min; clamp(cam); redraw(); },
  /** Bir yerleşimin ekrandaki yeri: araç oraya gerçek bir basış gönderebilsin. */
  where(id) { return placeOnScreen(cam, id); },
  tokens: () => tokens,
  boxes: () => boxes,
};

requestAnimationFrame(() => console.log(`[MareNostrum] ready · ${Math.round(performance.now() - started)}ms`));
