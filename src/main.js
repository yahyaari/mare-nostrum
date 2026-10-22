// Açılış, girdi, kayıt ve çizim döngüsü. Oyunun kuralları src/rules/ içinde; burası sadece
// basışı bir kurala çeviriyor ve sonucu ekrana getiriyor.
//
// Kontroller (masaüstü, Total War gibi): sol tık seçer, sağ tık seçili orduyu yürütür ya da
// saldırtır. Fare bir yerin üstündeyken seçili ordunun oraya yolu ve kaç tur süreceği görünür.

import { CIVS, PLACES } from "./data/world.js";
import { breakAlliance, declareWar, proposeAlliance, proposePeace } from "./rules/diplomacy.js";
import { neighbours, roadBetween } from "./rules/graph.js";
import { access, attack, canAttack, canUse, forecast, hostile, menace, needsShips, order, routeTo } from "./rules/moves.js";
import {
  VERSION, armyById, buildShip, canSail, formArmy, holdGames, merge, men, migrate, newGame, placesOf, recruit, split, station, upgrade,
} from "./rules/state.js";
import { resolve as answer } from "./rules/events.js";
import { appoint } from "./rules/generals.js";
import { accept as acceptMission, check as checkMissions, decline as declineMission } from "./rules/missions.js";
import { blockaded } from "./rules/state.js";
import { N } from "./rules/numbers.js";
import { checkOver, endTurn } from "./rules/turn.js";
import { TEXT, fill } from "./text.js";
import { clamp, focus, makeCamera, panBy, resize, zoomAt } from "./view/camera.js";
import * as anim from "./view/anim.js";
import * as sound from "./view/sound.js";
import { relation } from "./rules/state.js";
import { sight } from "./rules/sight.js";
import { besiege, lift } from "./rules/siege.js";
import { record } from "./rules/chronicle.js";
import { SCENE_MS } from "./view/battle.js";
import { isWinter, seasonOf, yearOf } from "./rules/season.js";
import { alongRoad, drawMap, drawOverlay, placeAt, placeOnScreen, reach } from "./view/draw.js";
import { INK, civName, colorOf, pointer } from "./view/kit.js";
import { CARD_H, MODAL_MS, armyTip, drawUI, eventLines, missionText, placeTip, startLayout } from "./view/ui.js";
import { TOP, chipRise } from "./view/hud.js";
import { SIZE } from "./geo.js";
import { trait } from "./rules/numbers.js";

const started = performance.now();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const cam = makeCamera();

let game = null;
const ui = { screen: "start", lang: pickLang(), level: pickLevel(), pick: null, saved: null, sel: null, army: null, modal: null, toast: null, news: null, tip: null, fog: pickFog(), coach: pickCoach() };
const startOwners = Object.fromEntries(PLACES.map((p) => [p.id, p.owner]));

let dpr = 1;
let boxes = [];
let tokens = [];
let queued = false;
let ambient = null; // canlı haritanın bir sonraki karesi

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
    if (s && s.places && s.civs) migrate(s);
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

/** İpucu balonları: görülenler ve kapalı mı (tarayıcıda saklanır; ui.js COACH). */
function pickCoach() {
  try {
    return { off: localStorage.getItem("mn.coachOff") === "1", done: new Set(JSON.parse(localStorage.getItem("mn.coach") ?? "[]")) };
  } catch { return { off: false, done: new Set() }; }
}

function saveCoach() {
  try {
    localStorage.setItem("mn.coach", JSON.stringify([...ui.coach.done]));
    localStorage.setItem("mn.coachOff", ui.coach.off ? "1" : "0");
  } catch { /* saklanamadı: bu oturumda yine geçerli */ }
}

/** Oyuncu bir ipucunun gösterdiği şeyi yaptı: o ipucu bir daha çıkmaz. */
function coachDone(id) {
  if (ui.coach.done.has(id)) return;
  ui.coach.done.add(id);
  saveCoach();
}

/** Savaş sisi açık mı (menüden; tarayıcıda saklanır). Varsayılan açık. */
function pickFog() {
  try { return localStorage.getItem("mn.fog") !== "0"; } catch { return true; }
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

// Animasyon sürerken her kare çizilir; bitince bekleyen pencere (savaş sonucu, karar) açılır.
let pending = null; // animasyon bitince açılacak pencere
let pendingNews = null; // animasyon bitince sağ üstte belirecek haberler
let shownModal = null; // açılış geçişi için: en son çizilen pencere
let showHome = null; // tur gösterisi kamerayı gezdirirken oyuncunun bıraktığı yer
let blocking = false; // tur arası gösterisi: ekrana dokunmak onu hızlandırır, ikinci dokunuş atlar
let hurried = false;

function redraw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    const gliding = stepGlide();
    const view = anim.shape(mapView());
    for (const c of anim.cues()) cue(c);
    if (ui.modal !== shownModal) { shownModal = ui.modal; ui.modalAt = performance.now(); }
    tokens = drawMap(ctx, cam, view, dpr);
    boxes = [];
    drawUI(ctx, cam, game, ui, boxes, view);
    drawOverlay(ctx, cam, view.fx);
    // Savaş sahnesi sürerken ve pencere açılırken her kare çizilir.
    const now = performance.now();
    const scene = ui.modal?.kind === "battle" && now - (ui.modal.t0 ?? 0) < SCENE_MS;
    const opening = ui.modal && now - ui.modalAt < MODAL_MS;
    const sliding = ui.screen === "start" && now - (ui.pickAt ?? 0) < 320;
    if (anim.busy() || gliding || scene || opening || sliding) redraw();
    // Canlı harita: bulutlar süzülür, sancaklar dalgalanır - saniyede 20 kare, sekme arkadayken hiç.
    else if (!ambient && !document.hidden) ambient = setTimeout(() => { ambient = null; redraw(); }, 50);
    if (!anim.busy()) settle();
  });
}

/** Sıradaki pencere: oyun bittiyse son, bekleyen mektup varsa karar, yoksa hiçbiri. */
function next() {
  if (!game) return null;
  if (game.over) return { kind: "over" };
  if (game.inbox?.length) return { kind: "decide" };
  const fresh = game.missions?.find((x) => !x.seen);
  if (fresh) return { kind: "mission", id: fresh.id };
  return null;
}

// ---- ses ----

let lastMarch = 0;
/** Animasyonun yeni başlayan bir parçası: sesi. Görünmeyen (süresi 1 ms) parça sessiz. */
function cue(c) {
  if (c.dur <= 2) return;
  if (c.kind === "march") {
    // Bir medeniyetin bütün orduları birlikte yürür: üst üste davul olmasın.
    const now = performance.now();
    if (now - lastMarch < 700) return;
    lastMarch = now;
    const walk = Math.min(2.6, c.legs.reduce((a, b) => a + b, 0) / 1000);
    if (roadBetween(c.path[0], c.path[1])?.sea) sound.row(walk);
    else sound.march(walk);
  } else if (c.kind === "clash") sound.clash();
  else if (c.kind === "repaint" && c.from !== undefined) sound.horn(c.to === game?.player);
  else if (c.kind === "banner") sound.turnCall();
  // Tur gösterisi: kamera rakibin önemli hamlesine (ve sonunda oyuncunun bıraktığı yere) kayar.
  else if (c.kind === "camera") glide(c.x, c.y, c.scale, c.dur);
  else if (c.kind === "fogfight") sound.clash();
}

/** Müzik: oyuncu biriyle savaştaysa gergin. */
function updateMood() {
  if (!game) return sound.setMood("peace");
  sound.setMood(CIVS.some((c) => c.id !== game.player && relation(game, game.player, c.id) === "war") ? "war" : "peace");
}

/** Animasyon bitti ya da atlandı: bekleyen pencereyi aç, haberleri göster. */
function settle() {
  blocking = false;
  showHome = null;
  if (pendingNews) {
    ui.news = { lines: pendingNews };
    pendingNews = null;
  }
  if (pending) {
    if (pending.kind === "battle") {
      // Savaş sahnesi: sesler sahneyle aynı anda (oklar, çarpışma, sonuç).
      pending.t0 = performance.now();
      const ev = pending.ev;
      if (!ev.drowned && ((ev.before.att.arch ?? 0) + (ev.before.def.arch ?? 0)) > 0) setTimeout(sound.volley, 250);
      setTimeout(sound.clash, ev.drowned ? 1500 : 1450);
      setTimeout(ev.won ? sound.victory : sound.defeat, SCENE_MS - 300);
    }
    else if (pending.kind === "over") (game?.over?.result === "won" ? sound.victory : sound.defeat)();
    else if (pending.kind === "decide" || pending.kind === "mission") sound.scroll();
    ui.modal = pending;
    pending = null;
    redraw();
  }
}

/** Bir kuralı çalıştırırken hamlelerin izini tut (ekran için); iz kayda girmesin diye silinir. */
function traced(fn) {
  game.trace = [];
  const result = fn();
  const trace = game.trace;
  delete game.trace;
  return [result, trace];
}

/** Ekranda görünüyor mu (çizelge görünmeyen hamleleri beklemeden geçer). */
const visible = (id) => {
  const s = placeOnScreen(cam, id);
  return s.x > -40 && s.y > -40 && s.x < cam.w + 40 && s.y < cam.h + 40;
};

const ownArmy = () => {
  if (!game || ui.sel?.kind !== "army") return null;
  const a = armyById(game, ui.sel.id);
  return a && a.owner === game.player ? a : null;
};

function mapView() {
  const view = { lang: ui.lang, owners: startOwners, selected: null, armies: [], marks: null, route: null };
  if (!game) {
    // Başlangıç ekranı: seçilen medeniyetin yerleri halkalı.
    view.halo = new Set(PLACES.filter((p) => p.owner === ui.pick).map((p) => p.id));
    return view;
  }
  view.owners = Object.fromEntries(Object.entries(game.places).map(([id, p]) => [id, p.owner]));
  view.selected = ui.sel?.kind === "place" ? ui.sel.id : null;
  view.hover = ui.hover ?? null;
  // Savaş sisi: oyuncunun gördüğü yerler ve dost topraklar.
  view.me = game.player;
  view.fog = ui.fog;
  view.seen = sight(game, game.player);
  view.friends = new Set(PLACES.filter((p) => { const o = game.places[p.id].owner; return o === game.player || (o && relation(game, game.player, o) === "ally"); }).map((p) => p.id));
  view.winter = isWinter(game.turn);
  view.levels = Object.fromEntries(Object.entries(game.places).map(([id, p]) => [id, p.level]));
  view.goals = Object.fromEntries((game.missions ?? []).filter((x) => x.place).map((x) => [x.place, true]));
  view.docked = Object.fromEntries(PLACES.filter((p) => p.port && game.places[p.id].ships > 0).map((p) => [p.id, game.places[p.id].ships]));
  view.blockade = Object.fromEntries(PLACES.filter((p) => p.port && blockaded(game, p.id)).map((p) => [p.id, true]));
  view.unrest = Object.fromEntries(placesOf(game, game.player)
    .filter((id) => game.places[id].loyalty < N.loyalty.unrest).map((id) => [id, game.places[id].loyalty]));
  view.threats = Object.fromEntries(placesOf(game, game.player).map((id) => [id, menace(game, id)]).filter(([, n]) => n > 0));
  view.armies = game.armies.map((a) => ({
    id: a.id, owner: a.owner, at: a.at, men: men(a), gen: a.general?.level ?? 0, ships: a.ships,
    selected: ui.sel?.kind === "army" && ui.sel.id === a.id,
    spent: a.owner === game.player && a.moves <= 0,
    // Kuşatan ordu kendi yerinde değil, hedefin surlarının önünde kamp kurmuş görünür.
    camp: a.besieging ? alongRoad(a.at, a.besieging, 0.6) : null,
  }));
  view.sieges = Object.fromEntries(game.armies.filter((a) => a.besieging).map((a) => [a.besieging, a.owner]));
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
          if (!canUse(a, roadBetween(id, n))) continue; // gemisiz deniz yolu, askersiz kara yolu yok
          seen.add(n);
          next.push(n);
          view.marks[n] = "walk";
        }
      }
      ring = next;
    }
    if (a.moves > 0) {
      for (const n of neighbours(a.at)) {
        if (!canAttack(game, a, n)) continue;
        view.marks[n] = forecast(game, a, a.owner, n).odds;
      }
    }
    if (a.route.length) view.route = [a.at, ...a.route];
    if (ui.preview) view.preview = ui.preview;
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
  glide(m.x, m.y, cam.min * (cam.w < 640 ? 1.5 : 2.4), 900);
}

// ---- kamera kayması ----
//
// Kamera bir yerden ötekine zıplamaz, kayar: oyuncu nereye gittiğini görsün. Kayma sürerken
// her kare çizilir (redraw bunu glideOn ile bilir).

let glideTo = null;

function glide(x, y, scale = cam.scale, ms = 450) {
  glideTo = { from: { x: cam.x, y: cam.y, scale: cam.scale }, to: { x, y, scale }, t0: performance.now(), ms };
  redraw();
}

function stepGlide() {
  if (!glideTo) return false;
  const g = glideTo;
  const p = Math.min(1, (performance.now() - g.t0) / g.ms);
  const e = 1 - (1 - p) ** 3;
  // Yakınlık logaritmik kayar, yoksa uzaklaşırken başta hızlı sonra yavaş gibi görünür.
  const scale = Math.exp(Math.log(g.from.scale) + (Math.log(g.to.scale) - Math.log(g.from.scale)) * e);
  focus(cam, g.from.x + (g.to.x - g.from.x) * e, g.from.y + (g.to.y - g.from.y) * e, scale);
  if (p >= 1) glideTo = null;
  return !!glideTo;
}

/**
 * Seçim kartı ekranın altında: seçilen yer (ya da ordunun durduğu yer) kartın arkasında
 * kalacaksa harita onu kartın üstündeki boşluğun ortasına kaydırır.
 */
function keepVisible(id) {
  const s = placeOnScreen(cam, id);
  const bottom = cam.h - 12 - CARD_H - 40;
  if (s.y > TOP + 40 && s.y < bottom) return;
  const want = (TOP + bottom) / 2;
  glide(cam.x, cam.y + (s.y - want) / cam.scale);
}

/**
 * Tur gösterisinde kameranın bir rakibin hamlesini göstereceği yer: o yerler üst bantla alt menü
 * arasındaki alana sığar. Hepsi zaten rahatça görünüyorsa null (kamera kıpırdamaz). `sim`:
 * gösterinin o anındaki kamera (önceki duraklardan sonra); burada güncellenir.
 */
function frameOf(ids, sim) {
  const pts = ids.map((id) => placeAt(id));
  const top = TOP + 70, bottom = cam.h - 110, left = 40, right = cam.w - 300;
  const onScreen = (m, c) => {
    const x = (m.x - c.x) * c.scale + cam.w / 2, y = (m.y - c.y) * c.scale + cam.h / 2;
    return x > left && x < right && y > top && y < bottom;
  };
  if (sim.scale >= cam.min * 1.4 && pts.every((m) => onScreen(m, sim))) return null;
  const xs = pts.map((m) => m.x), ys = pts.map((m) => m.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = 2.2;
  const scale = Math.max(cam.min * 1.5, Math.min(cam.min * 3, (right - left) / (x1 - x0 + 2 * pad), (bottom - top) / (y1 - y0 + 2 * pad)));
  const sx = (left + right) / 2, sy = (top + bottom) / 2;
  const out = { x: (x0 + x1) / 2 - (sx - cam.w / 2) / scale, y: (y0 + y1) / 2 - (sy - cam.h / 2) / scale, scale };
  Object.assign(sim, out);
  return out;
}

/** Rakibin bölümünün şeridi: adı ve en önemli işi. */
function captionOf(stop) {
  const name = civName(stop.owner, ui.lang);
  const b = stop.onMe[0] ?? stop.seenBattles[0];
  if (b) {
    const where = PLACES.find((p) => p.id === b.path[b.path.length - 1]).name[ui.lang];
    return { title: name, sub: fill(b.attack.won ? T().capTook : T().capHeld, where) };
  }
  if (stop.fogBattles.length) return { title: name, sub: T().capFog };
  return { title: name, sub: T().capMarch };
}

/**
 * Başlangıç ekranında haritayı bir medeniyetin topraklarına kaydır: yerleri, panelle sancak
 * listesinin arasındaki açık alanın ortasına sığacak yakınlıkta.
 */
function showCiv(civ, ms = 900) {
  const S = startLayout(cam), L = S.map;
  cam.pad = { left: S.list.w, right: cam.w - S.panel.x };
  const pts = PLACES.filter((p) => p.owner === civ).map((p) => placeAt(p.id));
  const xs = pts.map((m) => m.x), ys = pts.map((m) => m.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = 3.2; // harita birimi: çevresi de görünsün
  const scale = Math.max(cam.min * 1.3, Math.min(cam.min * 3.2, L.w / (x1 - x0 + 2 * pad), L.h / (y1 - y0 + 2 * pad)));
  const sx = L.x + L.w / 2, sy = L.y + L.h / 2;
  glide((x0 + x1) / 2 - (sx - cam.w / 2) / scale, (y0 + y1) / 2 - (sy - cam.h / 2) / scale, scale, ms);
}

/** Sıradaki ya da önceki medeniyet (başlangıç ekranında ‹ › ve klavye). */
function stepCiv(by) {
  const i = CIVS.findIndex((c) => c.id === ui.pick);
  dispatch({ do: "pick", civ: CIVS[(i + by + CIVS.length) % CIVS.length].id });
}

// ---- eylemler ----

const T = () => TEXT[ui.lang];

function dispatch(act) {
  const me = game?.player;
  const m = ui.modal;
  // Bir şey değişti: eski ipucu ve yol önizlemesi artık doğru olmayabilir.
  ui.tip = null;
  ui.preview = null;
  hoverKey = "";
  switch (act.do) {
    case "sound":
      sound.setSound(act.on);
      if (act.on) sound.click();
      break;
    case "music":
      sound.setMusic(act.on);
      break;
    case "fog":
      ui.fog = act.on;
      try { localStorage.setItem("mn.fog", act.on ? "1" : "0"); } catch { /* tercih saklanamadı */ }
      break;
    case "lang":
      ui.lang = act.lang;
      try { localStorage.setItem("mn.lang", act.lang); } catch { /* varsayılan */ }
      break;
    case "pick":
      if (ui.pick !== act.civ) { ui.pick = act.civ; ui.pickAt = performance.now(); showCiv(act.civ); }
      break;
    case "level":
      ui.level = act.level;
      try { localStorage.setItem("mn.level", act.level); } catch { /* varsayılan */ }
      break;
    case "start":
      if (!ui.pick) break;
      // ?seed=123 aynı oyunu tekrar kurar (araçlar ve hata ayıklama için).
      game = newGame(ui.pick, Number(new URLSearchParams(location.search).get("seed")) || (Date.now() % 1e9) | 0, ui.level);
      ui.screen = "game";
      cam.pad = null;
      ui.sel = null;
      ui.army = null;
      ui.news = null;
      ui.modal = null;
      lookAtHome();
      save();
      break;
    case "continue":
      game = load();
      if (!game) { ui.saved = null; break; }
      ui.screen = "game";
      cam.pad = null;
      ui.sel = null;
      ui.army = null;
      ui.modal = next();
      lookAtHome();
      break;
    case "newGame":
      forget();
      ui.pick = game?.player ?? ui.pick;
      game = null;
      ui.saved = null;
      ui.screen = "start";
      ui.sel = null;
      ui.army = null;
      ui.news = null;
      ui.modal = null;
      ui.pick ??= CIVS[0].id;
      ui.pickAt = performance.now();
      showCiv(ui.pick, 1200);
      break;
    case "askNew":
      ui.modal = { kind: "confirm", text: T().newGameQ, yes: { do: "newGame" } };
      break;
    case "open":
      ui.modal = { kind: act.modal };
      if (act.modal === "report") { ui.news = null; coachDone("news"); }
      if (act.modal === "diplo") coachDone("diplo");
      break;
    case "coach":
      coachDone(act.id);
      break;
    case "coachOff":
      ui.coach.off = true;
      saveCoach();
      toast(T().coachOffToast);
      break;
    case "coachSet":
      // Menüden açılınca ipuçları baştan gösterilir.
      ui.coach.off = !act.on;
      if (act.on) ui.coach.done.clear();
      saveCoach();
      break;
    case "close":
      ui.modal = next();
      break;
    case "cardTab":
      ui.cardTab = act.tab;
      break;
    case "missionAccept":
      sound.scroll();
      acceptMission(game, act.id);
      ui.modal = next();
      save();
      break;
    case "missionDecline":
      declineMission(game, act.id);
      ui.modal = next();
      save();
      break;
    case "pickMission": {
      // Görev listesinden: yeri olan görevde harita oraya kayar, ittifak görevinde diplomasi.
      const mi = game.missions?.find((x) => x.id === act.id);
      ui.modal = null;
      if (mi?.place) {
        ui.sel = { kind: "place", id: mi.place };
        const mm = placeAt(mi.place);
        glide(mm.x, mm.y, Math.max(cam.scale, cam.min * 2.4));
      } else if (mi?.other) ui.modal = { kind: "diplo" };
      break;
    }
    case "chronicleMode":
      if (m) { m.mode = act.mode; m.page = 0; }
      break;
    case "modalPage":
      if (m) m.page = act.page;
      break;
    case "pickArmy": {
      // Ordu listesinden: seç, haritayı oraya kaydır.
      const a = armyById(game, act.army);
      ui.modal = null;
      if (!a) break;
      ui.sel = { kind: "army", id: a.id };
      ui.army = a.id;
      const mm = placeAt(a.at);
      glide(mm.x, mm.y, Math.max(cam.scale, cam.min * 2.4));
      break;
    }
    case "pickPlace": {
      ui.modal = null;
      ui.sel = { kind: "place", id: act.id };
      const mm = placeAt(act.id);
      glide(mm.x, mm.y, Math.max(cam.scale, cam.min * 2.4));
      break;
    }
    case "overview":
      // Harita düğmesi: yakındaysan bütün haritayı göster, uzaktaysan başkentine dön.
      if (cam.scale > cam.min * 1.15) glide(SIZE.x / 2, SIZE.y / 2, cam.min, 600);
      else lookAtHome();
      break;
    case "minimap":
      // Mini haritada basılan yer ekranın ortasına gelir.
      glide(act.fx * SIZE.x, act.fy * SIZE.y);
      break;
    case "deselect":
      ui.sel = null;
      ui.army = null;
      break;
    case "endTurn": {
      coachDone("endturn");
      ui.modal = null;
      ui.news = null;
      const before = { ...game.civs[me] };
      const sawBefore = sight(game, me);
      const [, trace] = traced(() => endTurn(game));
      const sawAfter = sight(game, me);
      if (ui.sel?.kind === "army" && !armyById(game, ui.sel.id)) ui.sel = null;
      // Gösteri: önce tur şeridi, sonra rakiplerin hamleleri sırayla, en son kendi
      // ordularının güzergâh adımları. Kaynakların artışı üst banttan yükselir.
      const t = anim.clock();
      anim.banner(fill(T().turn, game.turn), `${T().seasons[seasonOf(game.turn)]} · ${fill(T().year, yearOf(game.turn))}`);
      // Rakiplerin önemli hamlelerine kamera gider; sisin içindekiler görünmez ama sisteki
      // savaş bir parıltıyla belli olur. Sonunda kamera oyuncunun bıraktığı yere döner.
      showHome = { x: cam.x, y: cam.y, scale: cam.scale };
      anim.timeline(trace, t + 900, visible, me, {
        seen: (id) => !ui.fog || sawBefore.has(id) || sawAfter.has(id),
        frame: frameOf,
        home: showHome,
        caption: captionOf,
      });
      ["money", "weapons", "food"].forEach((k, i) => {
        const d = Math.round((game.civs[me][k] - before[k]) * 10) / 10;
        if (d) anim.riseAt(chipRise(cam, k), (d > 0 ? "+" : "−") + Math.abs(d), d > 0 ? INK.good : INK.bad, 500 + i * 120);
      });
      blocking = true;
      hurried = false;
      // Rapor pencere açmaz: haberler sağ üstte belirir. Kararlar ve görevler yine pencere.
      pending = next();
      pendingNews = eventLines(game, ui.lang);
      if (!pendingNews.length) pendingNews = null;
      if (game.events.some((e) => e.type === "war" && e.on === me)) setTimeout(sound.war, 900);
      save();
      break;
    }
    case "appoint": {
      const g = appoint(game, act.army);
      if (g) {
        sound.horn(true);
        const a = armyById(game, act.army);
        anim.rise(a.at, fill(T().general, g.name), INK.warn);
        anim.pulse(a.at, INK.warn);
      }
      save();
      break;
    }
    case "buildShip":
      if (buildShip(game, act.id)) {
        sound.launch();
        anim.rise(act.id, T().addShip, INK.lane);
        anim.pulse(act.id, INK.lane);
      }
      save();
      break;
    case "games":
      if (holdGames(game, act.id)) {
        sound.cheer();
        anim.rise(act.id, `${T().loyalty} +${N.loyalty.gamesGain}`, INK.good);
        anim.pulse(act.id, INK.good);
      }
      save();
      break;
    case "decide": {
      const it = game.inbox.find((x) => x.id === act.id);
      if (!it) { ui.modal = next(); break; }
      const r = answer(game, it, act.choice);
      // Sonuç: kısa bir haber, ve olay bir yere aitse orada bir halka.
      if (it.key === "raid" && r.choice === "fight") toast(r.result.held ? T().raidHeld : fill(T().raidLost, PLACES.find((p) => p.id === it.place).name[ui.lang]));
      if (it.key === "tribute" && r.choice === "refuse") toast(fill(T().tributeWar, civName(it.civ, ui.lang)));
      if (it.place) anim.pulse(it.place, r.choice === "endure" || r.choice === "ignore" ? INK.bad : INK.good);
      checkOver(game);
      ui.modal = next();
      save();
      break;
    }
    case "upgrade":
      if (upgrade(game, act.id, act.what)) {
        coachDone("upgrade");
        sound.build();
        anim.rise(act.id, T()[act.what] + " " + game.places[act.id][act.what], INK.good);
        anim.pulse(act.id, INK.good);
      }
      save();
      break;
    case "recruit":
      if (recruit(game, act.id, act.type)) {
        coachDone("recruit");
        sound.recruit();
        anim.rise(act.id, T()["add" + act.type[0].toUpperCase() + act.type.slice(1)], INK.ink);
      }
      save();
      break;
    case "formOpen": {
      const pl = game.places[act.id];
      ui.modal = { kind: "form", id: act.id, inf: pl.inf, arch: pl.arch, cav: pl.cav, siege: pl.siege, ships: pl.ships };
      break;
    }
    case "formStep": {
      const max = game.places[m.id][act.type];
      m[act.type] = act.by === Infinity ? max : Math.max(0, Math.min(max, m[act.type] + act.by));
      break;
    }
    case "formOk": {
      const a = formArmy(game, m.id, m.inf, m.arch, m.cav ?? 0, m.siege ?? 0, m.ships ?? 0);
      ui.modal = null;
      if (a) {
        coachDone("form");
        sound.muster();
        ui.sel = { kind: "army", id: a.id };
        ui.army = a.id;
        anim.pulse(a.at, colorOf(a.owner));
      }
      save();
      break;
    }
    case "station": {
      const at = armyById(game, act.army)?.at;
      if (station(game, act.army)) anim.pulse(at, INK.ink);
      ui.sel = null;
      ui.army = null;
      save();
      break;
    }
    case "split": {
      const b = split(game, act.army);
      if (b) { ui.sel = { kind: "army", id: b.id }; ui.army = b.id; }
      save();
      break;
    }
    case "merge":
      merge(game, act.army, act.from);
      save();
      break;
    case "nextArmy": {
      // Hareketi kalan bir sonraki ordu: seçili olanın ardından, sırayla.
      const mine = game.armies.filter((a) => a.owner === me && a.moves > 0);
      if (!mine.length) break;
      const cur = ui.sel?.kind === "army" ? ui.sel.id : -1;
      const next = mine.find((a) => a.id > cur) ?? mine[0];
      ui.sel = { kind: "army", id: next.id };
      ui.army = next.id;
      const mm = placeAt(next.at);
      glide(mm.x, mm.y, Math.max(cam.scale, cam.min * 2));
      break;
    }
    case "attackAsk":
      ui.modal = { kind: "attack", army: act.army, id: act.id };
      break;
    case "besiege": {
      // Saldırı penceresinden: hemen saldırmak yerine kuşat.
      if (m?.kind !== "attack") break;
      ui.modal = null;
      const sev = [];
      if (besiege(game, m.army, m.id, sev)) {
        record(game, sev);
        sound.war();
        anim.pulse(m.id, INK.bad);
        ui.sel = { kind: "army", id: m.army };
      }
      save();
      break;
    }
    case "lift":
      lift(game, act.army);
      save();
      break;
    case "attack": {
      if (m?.kind !== "attack") break;
      // Ordu kapıya kadar yürür, kılıçlar çarpışır, sonra sonuç penceresi.
      coachDone("attack");
      const [ev, trace] = traced(() => attack(game, m.army, m.id));
      record(game, [ev]);
      ui.modal = null;
      anim.timeline(trace, anim.clock(), () => true, me);
      pending = ev ? { kind: "battle", ev } : null;
      ui.sel = ev?.won ? { kind: "army", id: m.army } : null;
      ui.army = ev?.won ? m.army : null;
      checkOver(game);
      save();
      break;
    }
    case "askWar":
      ui.modal = { kind: "confirm", text: fill(T().declareQ, civName(act.civ, ui.lang)), yes: { do: "war", civ: act.civ, back: m?.kind === "diplo" } };
      break;
    case "war":
      sound.war();
      record(game, [declareWar(game, me, act.civ)]);
      ui.modal = act.back ? { kind: "diplo" } : null;
      save();
      break;
    case "ally": {
      const ev = proposeAlliance(game, me, act.civ);
      record(game, [ev]);
      if (ev) toast(fill(ev.type === "ally" ? T().accepted : T().refused, civName(act.civ, ui.lang)));
      save();
      break;
    }
    case "askBreak":
      ui.modal = { kind: "confirm", text: fill(T().breakQ, civName(act.civ, ui.lang)), yes: { do: "break", civ: act.civ } };
      break;
    case "break":
      record(game, [breakAlliance(game, me, act.civ)]);
      ui.modal = { kind: "diplo" };
      save();
      break;
    case "peace": {
      const ev = proposePeace(game, me, act.civ);
      record(game, [ev]);
      if (ev) toast(fill(ev.type === "peace" ? T().accepted : T().refused, civName(act.civ, ui.lang)));
      save();
      break;
    }
  }
  // Görev yapıldığı anda tamamlanır: ödül ambara, haber ekrana.
  if (game && !game.over && ui.screen === "game" && act.do !== "endTurn") {
    const r = checkMissions(game);
    record(game, r.done.map((mission) => ({ type: "mission", ok: true, mission })));
    if (r.done.length) sound.chime();
    r.done.forEach((mi, i) => {
      toast(fill(T().missionDone, missionText(game, mi, ui.lang).title));
      ["money", "weapons", "food"].forEach((k, j) => {
        if (mi.reward[k]) anim.riseAt(chipRise(cam, k), "+" + mi.reward[k], INK.good, 300 + (i * 3 + j) * 120);
      });
      if (mi.place) anim.pulse(mi.place, "#e3b23c", 200);
    });
    if (r.done.length || r.failed.length) save();
  }
  updateMood();
  redraw();
}

// ---- haritaya basış ----

/** Sol tık: orduyu ya da yeri seçer. Hiçbir zaman bir şey yürütmez. */
function tapMap(x, y) {
  const t = tokenAt(x, y);
  if (t) {
    const a = armyById(game, t.army);
    ui.sel = { kind: "army", id: a.id };
    ui.army = a.owner === game.player ? a.id : null;
    keepVisible(a.at);
    return redraw();
  }
  const p = nearest(x, y);
  // Yer seçilince son seçilen kendi ordu hatırlanır: yerin kartında saldırı tahmini çıkar.
  ui.sel = p ? { kind: "place", id: p.id } : null;
  if (p && game.places[p.id].owner === game.player) coachDone("city");
  if (p) keepVisible(p.id);
  else ui.army = null;
  redraw();
}

/** Sağ tık: seçili kendi ordusunu oraya yürüt ya da (yanındaysa) saldırt. */
function rightTap(x, y) {
  if (ui.modal || ui.screen !== "game" || !ownArmy()) return;
  if (boxes.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)) return;
  const t = tokenAt(x, y);
  if (t) {
    const b = armyById(game, t.army);
    if (b.owner !== game.player) command(b.at);
    return;
  }
  const p = nearest(x, y);
  if (p) command(p.id);
}

/** Seçili ordunun `id`ye gitmesi ne olurdu: ipucu ve sağ tık aynı hesabı kullanır. */
function goTo(a, id) {
  if (id === a.at) return null;
  const k = access(game, a.owner, id);
  if (k === null) return { kind: "neutral" };
  if (hostile(k) && neighbours(a.at).includes(id)) {
    if (a.moves <= 0) return { kind: "spent" };
    if (canAttack(game, a, id)) return { kind: "attack", odds: forecast(game, a, a.owner, id).odds };
    return { kind: "ships" };
  }
  const route = routeTo(game, a, id);
  if (route === null) return { kind: needsShips(game, a, id) ? "ships" : "none" };
  if (!route.length) return null;
  // Kaç tur: bu turun kalan hareketi, sonra her tur tam hareket (Sakalar ve hızlı general 2).
  const per = trait(a.owner, "moves") + (a.general?.traits.includes("swift") ? 1 : 0);
  const turns = route.length <= a.moves ? 1 : Math.ceil((route.length - a.moves) / per) + (a.moves > 0 ? 1 : 0);
  return { kind: hostile(k) ? "approach" : "walk", turns, route };
}

function command(id) {
  const a = ownArmy();
  const go = a && goTo(a, id);
  if (!go) return;
  ui.tip = null;
  ui.preview = null;
  hoverKey = "";
  if (go.kind === "attack") {
    ui.modal = { kind: "attack", army: a.id, id };
    return redraw();
  }
  if (go.kind === "neutral") return toast(fill(T().neutralBlock, civName(game.places[id].owner, ui.lang)));
  if (go.kind === "spent") return toast(T().tipSpent);
  if (go.kind === "ships") return toast(T().needShips);
  if (go.kind === "none") return toast(T().noPath);
  sound.click();
  coachDone("move");
  const [, trace] = traced(() => order(game, a.id, id));
  // Kışın denizde fırtına: oyuncuya hemen söyle (raporda da çıkar).
  const caught = (game.storms ?? []).filter((s) => s.army === a.id && s.turn === game.turn && !s.told);
  for (const s of caught) { s.told = true; toast(fill(T().stormToast, s.lost, s.sunk)); }
  const t0 = anim.clock();
  const arrive = anim.timeline(trace, t0, () => true, game.player) - t0;
  if (a.route.length) {
    // Yolun kalanı: varış yerinde kaç tur sonra orada olacağı yükselir.
    const turns = Math.ceil(a.route.length / trait(a.owner, "moves"));
    anim.rise(a.route[a.route.length - 1], fill(T().eta, turns), INK.ink, arrive);
  } else if (trace.length) anim.pulse(a.at, INK.ink, arrive);
  save();
  redraw();
}

/**
 * Basılan yerdeki ordu. Uzaktan bakınca bir ordu (ya da limandaki filo) komşu bir şehrin
 * üstüne düşebiliyor: bir şehrin tam üstüne basıldıysa şehir kazanır. Ordu kendi şehrinin
 * sağında durduğu için kendi şehri onu örtmez.
 */
function tokenAt(x, y) {
  const t = [...tokens].reverse().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (!t) return t;
  const pl = nearest(x, y);
  return pl && reach(cam, pl.id, x, y) < (t.fleet ? 16 : 11) ? null : t;
}

/** Basılan yere en yakın yerleşim (maketi ya da sancağı), yeterince yakınsa. */
function nearest(x, y) {
  let best = null, bestD = 24;
  for (const p of PLACES) {
    const d = reach(cam, p.id, x, y);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

function tap(x, y) {
  // Tur arası gösterisi sürerken ilk dokunuş hızlandırır, ikincisi bitirir. (Tek dokunuşla
  // bitince ordular yerlerine sıçrıyordu: "ışınlanıyor".)
  if (blocking && anim.busy()) {
    if (!hurried) {
      anim.hurry(4);
      hurried = true;
    } else {
      // İkinci dokunuş gösteriyi bitirir: kamera gezdiyse oyuncunun bıraktığı yere döner.
      const home = showHome;
      anim.finish();
      settle();
      if (home) glide(home.x, home.y, home.scale, 400);
    }
    return redraw();
  }
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      if (b.act) sound.click();
      // Mini harita: eylemi basılan noktayı da bilmeli.
      if (b.act?.do === "minimap") dispatch({ ...b.act, fx: (x - b.x) / b.w, fy: (y - b.y) / b.h });
      else if (b.act) dispatch(b.act);
      return; // kutunun boş yeri de basışı yutar
    }
  }
  if (ui.screen === "game") tapMap(x, y);
}

// ---- girdi ----
//
// Sol tuş: sürükle = kaydır, yerinde bırak = seç. Sağ tuş: yerinde bırak = yürü / saldır.
// Tekerlek: imlecin altındaki yere doğru yakınlaş.

const pointers = new Map();
let gesture = null;

const at = (e) => {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

window.addEventListener("pointerdown", (e) => {
  // Ses bağlamı ancak bir basıştan sonra açılabilir (tarayıcı kuralı).
  sound.wake();
  pointers.set(e.pointerId, at(e));
  glideTo = null;
  if (e.button === 0) { pointer.down = true; redraw(); }
  if (pointers.size === 1) {
    const p = at(e);
    gesture = { moved: 0, startX: p.x, startY: p.y, button: e.button };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { pinch: true, dist: Math.hypot(a.x - b.x, a.y - b.y), moved: 99 };
  }
});

// Sağ tıkın tarayıcı menüsü açılmasın: sağ tık oyunun komutu.
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// Fare: üstüne gelinen düğme ve yerleşim parlar, imleç el olur, ipucu çıkar. Sadece üstüne
// gelinen şey değişince yeniden hesaplanır.
let hoverKey = "";
function hoverAt(p) {
  pointer.x = p.x;
  pointer.y = p.y;
  let key = "", hot = false, place = null, tip = null, preview = null;
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
      key = (b.act ? "b" + JSON.stringify(b.act) : "x" + i) + (b.tip ? "t" + b.tip[0] : "");
      hot = !!b.act;
      tip = b.tip ?? null;
      break;
    }
  }
  if (!key && game && ui.screen === "game" && !blocking && !ui.modal) {
    const t = tokenAt(p.x, p.y);
    const pl = t ? null : nearest(p.x, p.y);
    const mine = ownArmy();
    if (t) {
      key = "a" + t.army;
      hot = true;
      const a = armyById(game, t.army);
      if (a) {
        tip = armyTip(game, a, ui.lang);
        // Seçili ordu varken bir düşman ordusunun üstü: onun durduğu yere saldırı.
        if (mine && a.owner !== game.player) {
          const go = goTo(mine, a.at);
          if (go) tip = [...tip, placeTip(game, a.at, ui.lang, false, go).at(-1)];
          preview = go?.route ? [mine.at, ...go.route] : null;
        }
      }
    } else if (pl) {
      key = "p" + pl.id;
      hot = true;
      place = pl.id;
      const hid = ui.fog && !sight(game, game.player).has(pl.id);
      const go = mine ? goTo(mine, pl.id) : null;
      tip = placeTip(game, pl.id, ui.lang, hid, go);
      preview = go?.route ? [mine.at, ...go.route] : null;
    }
  }
  canvas.style.cursor = hot ? "pointer" : "";
  if (key !== hoverKey) {
    hoverKey = key;
    ui.hover = place;
    ui.preview = preview;
    ui.tip = tip ? { lines: tip, since: performance.now() } : null;
    redraw();
  }
}
canvas.addEventListener("pointerleave", () => { pointer.x = pointer.y = -1; hoverAt({ x: -1, y: -1 }); });

window.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse" && !pointers.size) hoverAt(at(e));
  else if (e.pointerType === "mouse") { pointer.x = at(e).x; pointer.y = at(e).y; }
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
      // Kaydırırken ipucu ve önizleme kaybolur (fare yerinden kalkınca yeniden hesaplanır).
      if (ui.tip || ui.preview) { ui.tip = null; ui.preview = null; hoverKey = ""; }
      redraw();
    }
  }
});

const release = (e) => {
  if (e.button === 0 || e.type === "pointercancel") { pointer.down = false; redraw(); }
  if (!pointers.has(e.pointerId)) return;
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (gesture && !gesture.pinch && gesture.moved <= 6 && e.type === "pointerup") {
    if (gesture.button === 2) rightTap(p.x, p.y);
    else if (gesture.button === 0) tap(p.x, p.y);
  }
  if (!pointers.size) {
    gesture = null;
    if (e.pointerType === "mouse") { hoverKey = ""; hoverAt(p); }
  }
};
window.addEventListener("pointerup", release);
window.addEventListener("pointercancel", release);

window.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (ui.modal) return;
  const p = at(e);
  zoomAt(cam, Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  if (ui.tip || ui.preview) { ui.tip = null; hoverKey = ""; }
  redraw();
}, { passive: false });

window.addEventListener("keydown", (e) => {
  sound.wake();
  const step = 80;
  const playing = game && ui.screen === "game" && !game.over;
  const keys = {
    "+": () => zoomAt(cam, 1.25, cam.w / 2, cam.h / 2),
    "=": () => zoomAt(cam, 1.25, cam.w / 2, cam.h / 2),
    "-": () => zoomAt(cam, 0.8, cam.w / 2, cam.h / 2),
    ArrowLeft: () => panBy(cam, step, 0),
    ArrowRight: () => panBy(cam, -step, 0),
    ArrowUp: () => panBy(cam, 0, step),
    ArrowDown: () => panBy(cam, 0, -step),
    Escape: () => { if (ui.modal) dispatch({ do: "close" }); else { ui.sel = null; ui.army = null; } },
    // Başlangıç ekranında oklar medeniyetler arasında gezer.
    ...(ui.screen === "start" && !ui.modal ? {
      ArrowLeft: () => stepCiv(-1), ArrowRight: () => stepCiv(1), ArrowUp: () => stepCiv(-1), ArrowDown: () => stepCiv(1),
    } : {}),
    // Total War gibi: Enter turu bitirir, Tab sıradaki orduyu seçer (karar penceresi açıkken değil).
    Enter: () => {
      if (ui.screen === "start" && !ui.modal) dispatch({ do: "start" });
      else if (playing && !ui.modal && !blocking) dispatch({ do: "endTurn" });
    },
    Tab: () => { if (playing && !ui.modal) dispatch({ do: "nextArmy" }); },
  };
  if (keys[e.key]) {
    if (e.key === "Tab") e.preventDefault();
    keys[e.key]();
    redraw();
  }
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
// Açılışta harita bütün Akdeniz'den seçili medeniyetin topraklarına süzülür.
ui.pick ??= CIVS[0].id;
ui.pickAt = performance.now();
showCiv(ui.pick, 1800);

// Yazı tipleri (index.html, Google Fonts) gelince yeniden çiz: tuval bir yazı tipinin
// yüklenmesini beklemez, o ana kadar yedeğiyle (Georgia) yazar.
if (document.fonts) {
  Promise.all(["600 12px Cinzel", "700 12px Cinzel", "13px 'EB Garamond'", "italic 13px 'EB Garamond'", "600 13px 'EB Garamond'"]
    .map((f) => document.fonts.load(f).catch(() => null))).then(redraw);
}

// Araçlar (Tools/peek.mjs) için: oyunun içine bakma ve bir anı kurma kapısı.
window.MareNostrum = {
  cam, ui, dispatch, redraw, tap, rightTap, anim,
  get game() { return game; },
  set game(g) { game = g; ui.screen = g ? "game" : "start"; if (g) cam.pad = null; redraw(); },
  /** Kayma bitene kadar çizer; araç beklemek isterse. */
  get gliding() { return !!glideTo; },
  look(id, zoom = 1) {
    glideTo = null;
    const mm = placeAt(id);
    focus(cam, mm.x, mm.y, cam.min * zoom);
    redraw();
  },
  overview() { cam.scale = cam.min; clamp(cam); redraw(); },
  /** Bir yerleşimin ekrandaki yeri: araç oraya gerçek bir basış gönderebilsin. */
  where(id) { return placeOnScreen(cam, id); },
  /** Fareyi bir noktaya getir (ipucu ve yol önizlemesi için). */
  hover(x, y) { hoverKey = ""; hoverAt({ x, y }); },
  tokens: () => tokens,
  /** Tur arası gösterisi sürüyor mu (dokunmak onu atlar). */
  get blocking() { return blocking; },
  /** Animasyon bitince açılacak bir pencere bekliyor mu (savaş sonucu, karar). */
  get waiting() { return !!pending; },
  boxes: () => boxes,
};

requestAnimationFrame(() => console.log(`[MareNostrum] ready · ${Math.round(performance.now() - started)}ms`));
