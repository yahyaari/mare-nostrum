// Açılış, girdi, kayıt ve çizim döngüsü. Oyunun kuralları src/rules/ içinde; burası sadece
// basışı bir kurala çeviriyor ve sonucu ekrana getiriyor.
//
// Kontroller (masaüstü, Total War gibi): sol tık seçer, sağ tık seçili orduyu yürütür ya da
// saldırtır. Fare bir yerin üstündeyken seçili ordunun oraya yolu ve kaç tur süreceği görünür.

import { CIVS, PLACES } from "./data/world.js";
import { breakAlliance, declareWar, proposeAlliance, proposePeace, proposeTrade } from "./rules/diplomacy.js";
import { roadBetween } from "./rules/graph.js";
import {
  access, attack, canAttack, canStrike, forecast, forecastField, hostile, isFoe, menace, mpMax, nearestPlace, needsShips, order, routeTo, strike, turnsFor,
} from "./rules/moves.js";
import { PLACE_CELL, POS, cellOf, centre, dist, isLand, pathCost, regionOf, search, smooth, stepCost } from "./rules/map.js";
import {
  VERSION, aliveHumans, armiesAt, armyById, buildShip, canSail, cancelBuild, chosen, detach, fleetOf, holdGames, humansOf, merge, men, migrate, muster, newGame, placesOf, recruit, startWonder, station, upgrade,
} from "./rules/state.js";
import { ownerOf, resolve as answer } from "./rules/events.js";
import { appoint } from "./rules/generals.js";
import { accept as acceptMission, check as checkMissions, decline as declineMission } from "./rules/missions.js";
import { blockaded } from "./rules/state.js";
import { veteranRank } from "./rules/combat.js";
import { banditsOf, spawnBandits } from "./rules/bandits.js";
import { available, choose, turnsLeft as techTurns } from "./rules/research.js";
import { gift } from "./rules/leaders.js";
import { N } from "./rules/numbers.js";
import { checkOver, endTurn } from "./rules/turn.js";
import { TEXT, fill } from "./text.js";
import { clamp, focus, makeCamera, panBy, resize, toMap, toScreen, zoomAt } from "./view/camera.js";
import * as anim from "./view/anim.js";
import * as sound from "./view/sound.js";
import { relation } from "./rules/state.js";
import { eyes, seen as seenBy, sight } from "./rules/sight.js";
import { plagueAt } from "./rules/crises.js";
import { closeRoute, flowing, openRoute, routesFrom, routesOf, slotsOf, valueOf } from "./rules/trade.js";
import { besiege, lift } from "./rules/siege.js";
import { record } from "./rules/chronicle.js";
import { sendSpy } from "./rules/spies.js";
import { SCENE_MS } from "./view/battle.js";
import { isWinter, seasonOf, yearOf } from "./rules/season.js";
import { drawMap, drawOverlay, placeAt, placeOnScreen, reach } from "./view/draw.js";
import { INK, civName, colorOf, pointer } from "./view/kit.js";
import { CARD_H, FIGHT_MS, MODAL_MS, campNear, gainText, SIDE_W, armyTip, drawUI, eventLines, goLine, missionText, picksOf, placeTip, startLayout } from "./view/ui.js";
import { TOP, chipRise } from "./view/hud.js";
import { SIZE, project } from "./geo.js";
import { trait } from "./rules/numbers.js";

const started = performance.now();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const cam = makeCamera();

let game = null;
const ui = { screen: "start", lang: pickLang(), level: pickLevel(), players: 1, picks: [], pick: null, saved: null, sel: null, army: null, modal: null, toast: null, news: null, tip: null, fog: pickFog(), coach: pickCoach() };
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

// Kayıt yuvaları (kullanıcının istediği "olmazsa olmazlar"ın üçüncüsü, 26.10): otomatik kaydın yanında
// üç yuva; yeni oyun yuvalardakini silmez. Her yuvanın özeti (medeniyet, tur, saat) ayrı bir anahtarda,
// liste her açılışta bütün oyunu okumasın.
const SLOTS = 3;
const slotKey = (n) => `mn.slot.${n}`;

function slotMeta() {
  try {
    const m = JSON.parse(localStorage.getItem("mn.slots") ?? "{}");
    return Object.fromEntries(Object.entries(m).filter(([n]) => localStorage.getItem(slotKey(n))));
  } catch { return {}; }
}

function saveSlot(n) {
  if (!game) return false;
  try {
    localStorage.setItem(slotKey(n), JSON.stringify(game));
    const m = slotMeta();
    m[n] = { player: game.player, turn: game.turn, at: Date.now(), players: humansOf(game).length };
    localStorage.setItem("mn.slots", JSON.stringify(m));
    return true;
  } catch { return false; }
}

function load(key = SAVE) {
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? "null");
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
    // Haritadaki savaş: sahne bitince sıradaki pencere (oyun bittiyse son) açılır, şerit kendiliğinden kaybolur.
    if (ui.fight && !ui.fight.done && now - ui.fight.t0 > SCENE_MS) { ui.fight.done = true; ui.modal ??= next(); }
    if (ui.fight && now - ui.fight.t0 > FIGHT_MS) ui.fight = null;
    const scene = !!ui.fight;
    const opening = (ui.modal && now - ui.modalAt < MODAL_MS) || (ui.modal?.kind === "summary" && ui.modal.playing);
    const sliding = ui.screen === "start" && now - (ui.pickAt ?? 0) < 320;
    if (anim.busy() || gliding || scene || opening || sliding) redraw();
    // Canlı harita: bulutlar süzülür, sancaklar dalgalanır - saniyede 20 kare, sekme arkadayken hiç.
    else if (!ambient && !document.hidden) ambient = setTimeout(() => { ambient = null; redraw(); }, 50);
    if (!anim.busy()) settle();
  });
}

/** Aynı bilgisayarda sıra başkasına geçer: seçimler unutulur, ekran kapanır, kaydedilir. */
function passTo(civ) {
  game.player = civ;
  ui.sel = null;
  ui.army = null;
  ui.cards = null;
  ui.news = null;
  ui.tip = null;
  ui.fight = null;
  ui.modal = { kind: "handoff" };
  save();
}

/** Sıradaki pencere: oyun bittiyse son, bekleyen mektup varsa karar, yoksa hiçbiri. */
function next() {
  if (!game) return null;
  if (game.over) return { kind: "over" };
  // Harikan tamamlandı (her biri bir pencere).
  if (ui.wondersDone?.length) return { kind: "wonder", ...ui.wondersDone.shift() };
  // Sana savaş açan lider konuşur (her biri bir pencere).
  if (ui.speeches?.length) return { kind: "speech", civ: ui.speeches.shift() };
  if (game.inbox?.some((it) => ownerOf(game, it) === game.player)) return { kind: "decide" };
  // Araştırma bitti: sıradakini seçmek için ağaç açılır (Civilization gibi).
  if (ui.pickTech) {
    ui.pickTech = false;
    if (!game.civs[game.player].research && available(game, game.player).length) return { kind: "research" };
  }
  const fresh = game.missions?.find((x) => !x.seen && x.civ === game.player);
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
    // Yürüyüşün ortası denizdeyse kürek, karadaysa davul.
    const mid = c.pts[Math.floor(c.pts.length / 2)];
    if (!isLand(cellOf(mid.x, mid.y))) sound.row(walk);
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
      // Savaş haritada oynar (pencere değil); sesler sahneyle aynı anda (oklar, çarpışma, sonuç).
      const ev = pending.ev;
      ui.fight = { ev, t0: performance.now() };
      if (!ev.drowned && ((ev.before.att.arch ?? 0) + (ev.before.def.arch ?? 0)) > 0) setTimeout(sound.volley, 250);
      setTimeout(sound.clash, ev.drowned ? 1500 : 1450);
      setTimeout(ev.won ? sound.victory : sound.defeat, SCENE_MS - 300);
      pending = null;
      redraw();
      return;
    }
    if (pending.kind === "over") (game?.over?.result === "won" ? sound.victory : sound.defeat)();
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

/** Ekranda görünüyor mu - bir yerleşim ya da bir nokta (çizelge görünmeyen hamleleri beklemeden geçer). */
const visible = (q) => {
  const s = typeof q === "string" ? placeOnScreen(cam, q) : toScreen(cam, q.x, q.y);
  return s.x > -40 && s.y > -40 && s.x < cam.w + 40 && s.y < cam.h + 40;
};

const ownArmy = () => {
  if (!game || ui.sel?.kind !== "army") return null;
  const a = armyById(game, ui.sel.id);
  return a && a.owner === game.player ? a : null;
};

// Ticaret yolunun çizgisi: deniz yolu denizden, kara yolu karadan (map.js arama, düzleştirilmiş); bir
// kere hesaplanır. Bulunamazsa düz çizgi.
const tradePaths = new Map();
function tradePath(from, to, sea) {
  const k = `${from}|${to}|${sea ? 1 : 0}`;
  if (!tradePaths.has(k)) {
    const goal = PLACE_CELL[to];
    // Limanın karesi denize bitişik olmayabilir (Roma: limanı Ostia): iki ucun yakınındaki karadan geçilir.
    const port = (c) => dist(centre(c), POS[from]) < 1.2 || dist(centre(c), POS[to]) < 1.2;
    // Deniz yolu karaya da girebilir ama pahalı: hep denizden gider, boğazlardaki kısa karayı (ızgarada
    // İstanbul ve Çanakkale kapalı) geçer.
    const opts = sea ? { extra: (c) => (isLand(c) && !port(c) ? 6 : 0) } : { enter: (c) => isLand(c) };
    const p = search(PLACE_CELL[from], (c) => c === goal, opts, centre(goal));
    tradePaths.set(k, p ? [POS[from], ...smooth(p.cells).slice(1, -1), POS[to]] : [POS[from], POS[to]]);
  }
  return tradePaths.get(k);
}

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
  // Savaş sisi: oyuncunun gözleri (yerleşimlerinin ve ordularının çevresi) ve dost topraklar.
  view.me = game.player;
  view.fog = ui.fog;
  view.eyes = eyes(game, game.player);
  view.seen = sight(game, game.player, view.eyes);
  view.friends = new Set(PLACES.filter((p) => { const o = game.places[p.id].owner; return o === game.player || (o && relation(game, game.player, o) === "ally"); }).map((p) => p.id));
  view.winter = isWinter(game.turn);
  view.levels = Object.fromEntries(Object.entries(game.places).map(([id, p]) => [id, p.level]));
  view.goals = Object.fromEntries((game.missions ?? []).filter((x) => x.place && x.civ === game.player).map((x) => [x.place, true]));
  view.spies = Object.fromEntries((game.spies ?? []).filter((s) => s.civ === game.player).map((s) => [s.target, s.at ? "in" : "road"]));
  view.building = Object.fromEntries(placesOf(game, game.player).filter((id) => game.places[id].builds?.length).map((id) => [id, true]));
  view.docked = Object.fromEntries(PLACES.filter((p) => p.port && fleetOf(game.places[p.id]) > 0).map((p) => [p.id, fleetOf(game.places[p.id])]));
  view.blockade = Object.fromEntries(PLACES.filter((p) => p.port && blockaded(game, p.id)).map((p) => [p.id, true]));
  view.unrest = Object.fromEntries(placesOf(game, game.player)
    .filter((id) => game.places[id].loyalty < N.loyalty.unrest).map((id) => [id, game.places[id].loyalty]));
  view.threats = Object.fromEntries(placesOf(game, game.player).map((id) => [id, menace(game, id)]).filter(([, n]) => n > 0));
  view.armies = game.armies.map((a) => ({
    id: a.id, owner: a.owner, at: a.at, men: men(a), gen: a.general?.level ?? 0, rank: veteranRank(a.xp), ships: fleetOf(a),
    selected: ui.sel?.kind === "army" && ui.sel.id === a.id,
    spent: a.owner === game.player && a.mp <= 0.05,
    // Yerleşimin dışındaki ordu bulunduğu yerde: denizdeyse filo, kuşatıyorsa kampında.
    float: a.at ? null : { x: a.x, y: a.y },
    sea: !a.at && !isLand(cellOf(a.x, a.y)),
    camp: !!a.besieging || !!a.bandit || !!a.camp,
    barb: !!a.camp,
    horde: !!a.horde,
  }));
  // Oyuncunun ticaret yolları (kendi kurdukları ve ortağı olduğu): haritada kesik altın çizgi, kervan.
  view.trade = routesOf(game, game.player).map((r) => ({ pts: tradePath(r.from, r.to, r.way === "sea"), sea: r.way === "sea", mine: game.places[r.from].owner === game.player, on: flowing(game, r) }));
  view.plague = plagueAt(game);
  view.sieges = Object.fromEntries(game.armies.filter((a) => a.besieging).map((a) => [a.besieging, a.owner]));
  // İnşa edilen harikaların yerleri (haritada işaret).
  view.built = Object.fromEntries(Object.values(game.built ?? {}).map((id) => [id, true]));
  const a = ownArmy();
  if (a) {
    view.marks = {};
    // Menzildeki saldırılabilecek yerler tahmin renginde.
    if (a.mp > 0) for (const id of Object.keys(game.places)) if (canAttack(game, a, id)) view.marks[id] = forecast(game, a, a.owner, id).odds;
    // Seçili ordunun kalan yolu, her turun sonu işaretli.
    if (a.route.length) view.route = routeShape(a, [cellOf(a.x, a.y), ...a.route]);
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

/** Oyunda kamera alttan panel kadar taşabilir (camera.js clamp). */
const GAME_PAD = { bottom: 270 };

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
function keepVisible(pt, side = false) {
  const s = toScreen(cam, pt.x, pt.y);
  const bottom = cam.h - 12 - CARD_H - 40;
  // Yer seçilince solda da kart açılır: yer onun arkasında kalmasın.
  const left = side ? 12 + SIDE_W + 40 : 40;
  const dy = s.y > TOP + 40 && s.y < bottom ? 0 : s.y - (TOP + bottom) / 2;
  const dx = s.x < left ? s.x - (left + 120) : 0;
  if (!dx && !dy) return;
  glide(cam.x + dx / cam.scale, cam.y + dy / cam.scale);
}

/** Rakibin bölümünün şeridi: adı ve en önemli işi. */
function captionOf(part) {
  const name = civName(part.owner, ui.lang);
  const b = part.onMe[0] ?? part.seenBattles[0];
  if (b) {
    // Yerleşime saldırı: aldı ya da püskürtüldü; meydan muharebesi: nerede savaştığı.
    const at = b.attack.at ?? nearestPlace(b.pts[b.pts.length - 1]);
    const where = PLACES.find((p) => p.id === at).name[ui.lang];
    return { title: name, sub: fill(!b.attack.at ? T().capField : b.attack.won ? T().capTook : T().capHeld, where) };
  }
  if (part.fogBattles.length) return { title: name, sub: T().capFog };
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

/** Bir kart seçiminin sahibi: "p:<yer>" garnizon, "a:<ordu>" ordu. */
function unitOf(of) {
  if (!game) return null;
  const [k, id] = [of.slice(0, 1), of.slice(2)];
  return k === "p" ? game.places[id] ?? null : armyById(game, Number(id));
}
const sigOf = (u) => ["inf", "arch", "cav", "siege", "ships", "trireme", "quinq"].map((k) => u[k] ?? 0).join(",");

const T = () => TEXT[ui.lang];

function dispatch(act) {
  const me = game?.player;
  const m = ui.modal;
  // Bir şey değişti: eski ipucu ve yol önizlemesi artık doğru olmayabilir.
  ui.tip = null;
  ui.preview = null;
  hoverKey = "";
  if (act.do !== "aim") ui.aim = null;
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
    case "players":
      ui.players = act.n;
      ui.picks = [];
      break;
    case "pickPlayer": {
      // Aynı bilgisayarda: bu oyuncu bu medeniyeti aldı, sıradaki oyuncu boştakilerden seçer.
      if (!ui.pick || ui.picks.includes(ui.pick)) break;
      ui.picks.push(ui.pick);
      const free = CIVS.find((c) => !ui.picks.includes(c.id));
      if (free) { ui.pick = free.id; ui.pickAt = performance.now(); showCiv(free.id); }
      break;
    }
    case "start": {
      if (!ui.pick) break;
      const many = ui.players > 1;
      if (many && ui.picks.includes(ui.pick)) break;
      const who = many ? [...ui.picks, ui.pick] : ui.pick;
      // ?seed=123 aynı oyunu tekrar kurar (araçlar ve hata ayıklama için).
      game = newGame(who, Number(new URLSearchParams(location.search).get("seed")) || (Date.now() % 1e9) | 0, ui.level);
      ui.picks = [];
      // Öğretici açıksa (ve bitirilmediyse) başkentin yanında haydutlar: ilk ordu, ilk savaş.
      // Zincirin balonları baştan: önceki oyunlarda görülmüş olsalar da (öğretici bitene kadar).
      // Birkaç oyuncuda öğretici yok.
      if (!many && !ui.coach.off && !ui.coach.done.has("loot") && spawnBandits(game)) {
        for (const id of ["city", "recruit", "garrison", "pick", "form", "hunt", "strike", "preview", "camp", "raid"]) ui.coach.done.delete(id);
        saveCoach();
      }
      ui.screen = "game";
      cam.pad = GAME_PAD;
      ui.sel = null;
      ui.army = null;
      ui.news = null;
      ui.modal = many ? { kind: "handoff" } : null;
      lookAtHome();
      save();
      break;
    }
    case "slots":
      // Kaydet / Yükle penceresi: yuvaların özeti.
      ui.slots = slotMeta();
      ui.modal = { kind: "slots", mode: act.mode, count: SLOTS };
      break;
    case "openRoute": {
      // Ticaret yolu (trade.js): kurulunca şehrin üstünden turluk parası yükselir.
      const r = openRoute(game, act.from, act.to);
      if (!r) break;
      sound.click();
      const v = valueOf(game, act.from, act.to);
      anim.rise(act.from, `+${v} ◎`, INK.good);
      toast(fill(T().tradeOpened, PLACES.find((p) => p.id === act.from).name[ui.lang], PLACES.find((p) => p.id === act.to).name[ui.lang], v));
      if (routesFrom(game, act.from).length >= slotsOf(game, act.from)) ui.modal = null;
      save();
      break;
    }
    case "closeRoute":
      if (closeRoute(game, act.from, act.to)) { sound.click(); save(); }
      break;
    case "saveSlot":
      if (saveSlot(act.n)) {
        sound.click();
        ui.slots = slotMeta();
        toast(fill(T().savedTo, act.n));
      } else toast(T().saveFail);
      break;
    case "continue":
      // Otomatik kayıt ya da bir yuva; yüklenen oyun otomatik kayda da geçer ("Devam et" onu açar).
      game = load(act.slot ? slotKey(act.slot) : SAVE);
      if (!game) { if (!act.slot) ui.saved = null; break; }
      if (act.slot) save();
      ui.saved = { player: game.player, turn: game.turn };
      ui.screen = "game";
      cam.pad = GAME_PAD;
      ui.sel = null;
      ui.army = null;
      ui.modal = humansOf(game).length > 1 ? { kind: "handoff" } : next();
      lookAtHome();
      break;
    case "ready": {
      // Sırası gelen oyuncu hazır: kendi haberleri, savaş ilanları, harikaları, araştırması.
      if (m?.kind !== "handoff") break;
      ui.modal = null;
      const evs = game.events ?? [];
      if (evs.some((e) => e.type === "tech" && e.civ === me)) ui.pickTech = true;
      ui.speeches = evs.filter((e) => e.type === "war" && e.on === me).map((e) => e.by);
      ui.wondersDone = evs.filter((e) => e.type === "wonderBuilt" && e.civ === me).map((e) => ({ wonder: e.wonder, place: e.place }));
      const lines = eventLines(game, ui.lang);
      ui.news = lines.length ? { lines } : null;
      ui.modal = next();
      lookAtHome();
      break;
    }
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
      ui.modal = act.modal ? { kind: act.modal, ...(act.id ? { id: act.id } : {}) } : null;
      if (act.modal === "report") { ui.news = null; coachDone("news"); }
      if (act.modal === "diplo") coachDone("diplo");
      break;
    case "coach": {
      coachDone(act.id);
      // Öğretici bitti: kamera sıradaki hedefe, başkentin yanındaki barbar kampına kayar.
      const c = act.id === "loot" ? campNear(game) : null;
      if (c) glide(c.x, c.y, cam.scale, 700);
      break;
    }
    case "research": {
      if (!choose(game, game.player, act.tech)) break;
      sound.click();
      coachDone("research");
      toast(fill(T().techChosen, T().techs[act.tech][0], techTurns(game, game.player, act.tech)));
      ui.modal = next();
      save();
      break;
    }
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
      // Sıra değişirken ekran kendiliğinden açılmaz (öteki oyuncunun haritası görünmesin).
      if (m?.kind === "handoff") break;
      ui.modal = next();
      break;
    case "fightOff":
      ui.fight = null;
      break;
    case "summary":
      // Oyun sonu özeti: harita tekrarı baştan oynar.
      ui.modal = { kind: "summary", playing: true, from: performance.now(), turn: 0 };
      break;
    case "summaryPlay":
      if (m?.kind !== "summary") break;
      if (m.playing) m.playing = false;
      else {
        const n = game.chronicle?.owners?.length ?? 0;
        if ((m.turn ?? 0) >= n - 1) m.turn = 0;
        m.playing = true;
        m.from = performance.now() - (m.turn ?? 0) * 90;
      }
      break;
    case "summaryTurn":
      if (m?.kind !== "summary") break;
      m.playing = false;
      m.turn = Math.max(0, act.turn);
      break;
    case "cardTab":
      ui.cardTab = act.tab;
      if (act.tab === "garrison") coachDone("garrison");
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
      glide(a.x, a.y, Math.max(cam.scale, cam.min * 2.4));
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
      // Aynı bilgisayarda birkaç oyuncu: sıradaki oyuncu oynar; dünya (bilgisayarlar, üretim)
      // ancak sıranın sonuncusundan sonra döner. Gösteri yok, sıra değişince ekran kapanır.
      const hs = aliveHumans(game);
      if (hs.length > 1) {
        const i = hs.indexOf(me);
        if (i < 0 || i < hs.length - 1) { passTo(hs[i + 1] ?? hs[0]); break; }
        ui.modal = null;
        ui.news = null;
        traced(() => endTurn(game));
        if (checkOver(game)) { ui.modal = { kind: "over" }; save(); break; }
        passTo(aliveHumans(game)[0]);
        break;
      }
      ui.modal = null;
      ui.news = null;
      const before = { ...game.civs[me] };
      const eyesBefore = eyes(game, me), sawBefore = sight(game, me, eyesBefore);
      const [, trace] = traced(() => endTurn(game));
      const eyesAfter = eyes(game, me), sawAfter = sight(game, me, eyesAfter);
      if (ui.sel?.kind === "army" && !armyById(game, ui.sel.id)) ui.sel = null;
      // Gösteri: önce tur şeridi, sonra rakiplerin hamleleri sırayla, en son kendi
      // ordularının güzergâh adımları. Kaynakların artışı üst banttan yükselir.
      const t = anim.clock();
      anim.banner(fill(T().turn, game.turn), `${T().seasons[seasonOf(game.turn)]} · ${fill(T().year, yearOf(game.turn))}`);
      // Kamera bütün dünyaya uzaklaşır, rakipler oynar (sisin içindekiler görünmez ama sisteki
      // savaş bir parıltıyla belli olur), sonra oyuncunun bıraktığı yere döner.
      showHome = { x: cam.x, y: cam.y, scale: cam.scale };
      const showEnd = anim.timeline(trace, t + 300, visible, me, {
        seen: (q) => !ui.fog || (typeof q === "string" ? sawBefore.has(q) || sawAfter.has(q) : seenBy(eyesBefore, q) || seenBy(eyesAfter, q)),
        overview: { x: SIZE.x / 2, y: SIZE.y / 2, scale: cam.min },
        home: showHome,
        caption: captionOf,
      });
      // Biten inşaatlar: kamera döndükten sonra şehrin üstünden yükselir.
      game.events.filter((e) => e.type === "built" && e.civ === me).forEach((e, i) => {
        // Ne kazandırdığı da: "Tarla 2 · +4 buğday" (kullanıcı 26.10: yükseltme bir şey yapıyormuşum gibi hissettirmedi).
        anim.rise(e.place, `${T()[e.what] ?? ""} ${e.level} · ${gainText(game, e.place, e.what, ui.lang)}`, INK.good, showEnd - anim.clock() + i * 250);
        anim.pulse(e.place, INK.good, showEnd - anim.clock() + i * 250);
      });
      ["money", "weapons", "food"].forEach((k, i) => {
        const d = Math.round((game.civs[me][k] - before[k]) * 10) / 10;
        if (d) anim.riseAt(chipRise(cam, k), (d > 0 ? "+" : "−") + Math.abs(d), d > 0 ? INK.good : INK.bad, 500 + i * 120);
      });
      blocking = true;
      hurried = false;
      // Rapor pencere açmaz: haberler sağ üstte belirir. Kararlar ve görevler yine pencere.
      if (game.events.some((e) => e.type === "tech" && e.civ === me)) ui.pickTech = true;
      ui.speeches = game.events.filter((e) => e.type === "war" && e.on === me).map((e) => e.by);
      ui.wondersDone = game.events.filter((e) => e.type === "wonderBuilt" && e.civ === me).map((e) => ({ wonder: e.wonder, place: e.place }));
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
      if (buildShip(game, act.id, act.type ?? "ships")) {
        sound.launch();
        anim.rise(act.id, "+ " + T().shipNames[act.type ?? "ships"], INK.lane);
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
        // İnşaat başladı: ne zaman biteceği yükselir.
        const b = game.places[act.id].builds.at(-1);
        anim.rise(act.id, `${T()[act.what]} · ${b.total === 1 ? T().turnsOne : fill(T().turnsN, b.total)}`, INK.good);
        anim.pulse(act.id, INK.good);
      }
      save();
      break;
    case "cancelBuild": {
      const b = game.places[act.id].builds?.find((x) => x.what === act.what);
      if (b && cancelBuild(game, act.id, act.what)) anim.rise(act.id, `+${b.paid}`, INK.ink);
      save();
      break;
    }
    case "recruit":
      if (recruit(game, act.id, act.type)) {
        coachDone("recruit");
        sound.recruit();
        anim.rise(act.id, T()["add" + act.type[0].toUpperCase() + act.type.slice(1)], INK.ink);
      }
      save();
      break;
    case "pickCard": {
      // Kart seç / bırak. Seçim bir yerin ya da ordunun, o anki askerleriyle (sayılar değişince düşer).
      const u = unitOf(act.of);
      if (!u) break;
      const picks = new Set(picksOf(ui, act.of, u));
      if (picks.has(act.i)) picks.delete(act.i); else picks.add(act.i);
      coachDone("pick");
      ui.cards = { of: act.of, sig: sigOf(u), picks, page: ui.cards?.of === act.of ? ui.cards.page : 0 };
      break;
    }
    case "pickAll": {
      const u = unitOf(act.of);
      if (!u) break;
      ui.cards = { of: act.of, sig: sigOf(u), picks: new Set(act.all ? [...Array(act.n).keys()] : []), page: ui.cards?.of === act.of ? ui.cards.page : 0 };
      if (act.all) coachDone("pick");
      break;
    }
    case "cardPage": {
      const u = unitOf(act.of);
      if (!u) break;
      const keep = ui.cards?.of === act.of ? ui.cards : { of: act.of, sig: sigOf(u), picks: new Set(), page: 0 };
      ui.cards = { ...keep, page: Math.max(0, (keep.page ?? 0) + act.by) };
      break;
    }
    case "march": {
      // Garnizondan seçili kartlar dışarı çıkar: ordu (istenirse generalli).
      const pl = game.places[act.id];
      const want = chosen(pl, picksOf(ui, "p:" + act.id, pl));
      const a = muster(game, act.id, want);
      if (!a) break;
      coachDone("form");
      sound.muster();
      const g = act.general ? appoint(game, a.id) : null;
      if (g) anim.rise(a.at, fill(T().general, g.name), INK.warn);
      ui.cards = null;
      ui.sel = { kind: "army", id: a.id };
      ui.army = a.id;
      anim.pulse(a.at, colorOf(a.owner));
      // Öğretici: sıradaki iş haydutlara yürümek; kamp ordu kartının arkasında kalmasın.
      const bandits = banditsOf(game);
      if (bandits && !ui.coach.off) keepVisible(bandits);
      save();
      break;
    }
    case "detach": {
      // Seçili kartlar ayrı bir ordu olur ve o seçilir.
      const a = armyById(game, act.army);
      const b = a && detach(game, a.id, chosen(a, picksOf(ui, "a:" + a.id, a)));
      if (!b) break;
      sound.muster();
      ui.cards = null;
      ui.sel = { kind: "army", id: b.id };
      ui.army = b.id;
      anim.pulse(b.at, colorOf(b.owner));
      save();
      break;
    }
    case "station": {
      // Bütün ordu ya da sadece seçili kartlar garnizona katılır.
      const a = armyById(game, act.army);
      if (!a) break;
      const at = a.at;
      const want = chosen(a, picksOf(ui, "a:" + a.id, a));
      const part = men(want) + fleetOf(want) > 0 ? detach(game, a.id, want) : null;
      if (station(game, (part ?? a).id)) anim.pulse(at, INK.ink);
      ui.cards = null;
      if (!part) { ui.sel = null; ui.army = null; }
      save();
      break;
    }
    case "merge": {
      // Aynı yerdeki öteki ordular bu orduya katılır.
      const a = armyById(game, act.army);
      if (!a) break;
      for (const b of armiesAt(game, a.at).filter((x) => x !== a && x.owner === a.owner)) merge(game, a.id, b.id);
      ui.cards = null;
      anim.pulse(a.at, colorOf(a.owner));
      save();
      break;
    }
    case "trespass":
      // Tarafsızın toprağından geçmek onaylandı: bu medeniyet için bir daha sorulmaz.
      ui.trespassOk = new Set([...(ui.trespassOk ?? []), ...act.civs]);
      ui.modal = null;
      command(act.target);
      break;
    case "spy": {
      // Casus: en yakın kendi yerinden yola çıkar, uzaklığa göre birkaç turda varır.
      const s = sendSpy(game, me, act.id);
      if (s) {
        sound.click();
        const n = s.eta - game.turn;
        toast(fill(T().spySent, PLACES.find((p) => p.id === act.id).name[ui.lang], n === 1 ? T().turnsOne : fill(T().turnsN, n)));
        anim.pulse(act.id, INK.warn);
      }
      save();
      break;
    }
    case "aim":
      // Yürü: sıradaki basış ordunun gideceği yer.
      ui.aim = act.army;
      toast(T().aimHint);
      break;
    case "nextArmy": {
      // Hareketi kalan bir sonraki ordu: seçili olanın ardından, sırayla.
      const mine = game.armies.filter((a) => a.owner === me && a.mp > 0.05);
      if (!mine.length) break;
      const cur = ui.sel?.kind === "army" ? ui.sel.id : -1;
      const next = mine.find((a) => a.id > cur) ?? mine[0];
      ui.sel = { kind: "army", id: next.id };
      ui.army = next.id;
      glide(next.x, next.y, Math.max(cam.scale, cam.min * 2));
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
      coachDone("preview");
      if (m.target) coachDone("strike");
      const [ev, trace] = traced(() => (m.target ? strike(game, m.army, m.target) : attack(game, m.army, m.id)));
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
      ui.modal = { kind: "confirm", text: fill(T().declareQ, civName(act.civ, ui.lang)), yes: { do: "war", civ: act.civ, back: m?.kind === "leader" ? "leader" : m?.kind === "diplo" ? "diplo" : null } };
      break;
    case "war":
      sound.war();
      record(game, [declareWar(game, me, act.civ)]);
      // Liderin ekranından açıldıysa lider cevap verir.
      ui.modal = act.back === "leader" ? { kind: "leader", civ: act.civ, line: "hostile" } : act.back === "diplo" ? { kind: "diplo" } : null;
      save();
      break;
    case "ally": {
      const ev = proposeAlliance(game, me, act.civ);
      record(game, [ev]);
      if (ev && m?.kind === "leader") ui.modal = { kind: "leader", civ: act.civ, line: ev.type === "ally" ? "yes" : "no" };
      else if (ev) toast(fill(ev.type === "ally" ? T().accepted : T().refused, civName(act.civ, ui.lang)));
      save();
      break;
    }
    case "askBreak":
      ui.modal = { kind: "confirm", text: fill(T().breakQ, civName(act.civ, ui.lang)), yes: { do: "break", civ: act.civ, back: m?.kind === "leader" ? "leader" : "diplo" } };
      break;
    case "break":
      record(game, [breakAlliance(game, me, act.civ)]);
      ui.modal = act.back === "leader" ? { kind: "leader", civ: act.civ, line: "hostile" } : { kind: "diplo" };
      save();
      break;
    case "peace": {
      const ev = proposePeace(game, me, act.civ, act.gold ?? 0);
      record(game, [ev]);
      if (ev && m?.kind === "leader") ui.modal = { kind: "leader", civ: act.civ, line: ev.type === "peace" ? "yes" : "no" };
      else if (ev) toast(fill(ev.type === "peace" ? T().accepted : T().refused, civName(act.civ, ui.lang)));
      if (ev?.type === "peace") sound.chime();
      save();
      break;
    }
    case "leader":
      ui.modal = { kind: "leader", civ: act.civ, line: null };
      break;
    case "wonder":
      if (!startWonder(game, act.id, act.wonder)) break;
      sound.horn(true);
      anim.rise(act.id, T().wonders[act.wonder][0], INK.warn);
      save();
      break;
    case "gift": {
      if (!gift(game, me, act.civ, act.amount)) break;
      sound.chime();
      ui.modal = { kind: "leader", civ: act.civ, line: "thanks" };
      save();
      break;
    }
    case "trade": {
      const ev = proposeTrade(game, me, act.civ);
      if (!ev) break;
      record(game, [ev]);
      if (ev.type === "trade") sound.chime();
      ui.modal = { kind: "leader", civ: act.civ, line: ev.type === "trade" ? "yes" : "no" };
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

/** Sol tık: orduyu ya da yeri seçer. Yürü'ye basılmışsa basılan yer ordunun gideceği yer. */
function tapMap(x, y) {
  if (ui.aim && ownArmy()?.id === ui.aim) {
    ui.aim = null;
    return command(targetAt(x, y));
  }
  ui.aim = null;
  const t = tokenAt(x, y);
  if (t) {
    const a = armyById(game, t.army);
    ui.sel = { kind: "army", id: a.id };
    ui.army = a.owner === game.player ? a.id : null;
    keepVisible(a);
    return redraw();
  }
  const p = nearest(x, y);
  // Yer seçilince son seçilen kendi ordu hatırlanır: yerin kartında saldırı tahmini çıkar.
  ui.sel = p ? { kind: "place", id: p.id } : null;
  if (p && game.places[p.id].owner === game.player) coachDone("city");
  if (p) keepVisible(POS[p.id], true);
  else ui.army = null;
  redraw();
}

/** Sağ tık: seçili kendi ordusunu oraya yürüt ya da (menzildeyse) saldırt. */
function rightTap(x, y) {
  if (ui.modal || ui.screen !== "game" || !ownArmy()) return;
  if (boxes.some((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)) return;
  command(targetAt(x, y));
}

/** Ekrandaki bir noktanın altındaki hedef: bir ordu, bir yerleşim ya da haritada bir nokta. */
function targetAt(x, y) {
  const t = tokenAt(x, y);
  if (t) {
    const b = armyById(game, t.army);
    if (b.at) return { place: b.at };
    return b.owner === game.player ? { x: b.x, y: b.y } : { army: b.id };
  }
  const p = nearest(x, y);
  if (p) return { place: p.id };
  return toMap(cam, x, y);
}

/** Bir yolun ekrandaki şekli: yumuşatılmış çizgi ve her turun bittiği yer (advance ile aynı hesap). */
function routeShape(a, cells) {
  const turns = [];
  let left = a.mp, n = 1;
  for (let i = 1; i < cells.length; i++) {
    const c = stepCost(cells[i - 1], cells[i], dist(centre(cells[i - 1]), centre(cells[i])));
    if (c > left + 1e-9) {
      if (i > 1) turns.push({ ...centre(cells[i - 1]), n });
      n++;
      left = mpMax(a);
    }
    left -= c;
  }
  turns.push({ ...centre(cells[cells.length - 1]), n, end: true });
  return { pts: smooth(cells), turns };
}

/**
 * Seçili ordunun bir hedefe gitmesi ne olurdu: ipucu, önizleme ve sağ tık aynı hesabı kullanır.
 * Dönen: { kind: "walk" | "approach" | "attack" | "strike" | "neutral" | "spent" | "ships" | "none",
 * turns, cells, shape, trespass } ya da null (zaten orada).
 */
function goTo(a, target) {
  if (target.place) {
    const id = target.place;
    if (a.at === id) return null;
    const k = access(game, a.owner, id);
    if (k === null) return { kind: "neutral", civ: game.places[id].owner };
    if (hostile(k) && dist(a, POS[id]) <= N.reach.strike) {
      if (a.mp <= 0) return { kind: "spent" };
      if (canAttack(game, a, id)) return { kind: "attack", odds: forecast(game, a, a.owner, id).odds };
      return { kind: "ships" };
    }
  } else if (target.army) {
    const b = armyById(game, target.army);
    if (!b) return null;
    // Savaşmadığın birinin ordusu: yanına yürünür.
    if (!isFoe(game, a.owner, b.owner)) return goTo(a, { x: b.x, y: b.y });
    if (dist(a, b) <= N.reach.strike) {
      if (a.mp <= 0) return { kind: "spent" };
      if (canStrike(game, a, b)) return { kind: "strike", odds: forecastField(game, a, b).odds };
      return { kind: "ships" };
    }
  }
  const r = routeTo(game, a, target);
  if (!r) return { kind: needsShips(game, a, target) ? "ships" : "none" };
  if (r.cells.length < 2) return null;
  // Yol tarafsız birinin toprağından geçiyorsa o medeniyetler (girersen öfkelenir).
  const trespass = [...new Set(r.cells.map(regionOf).filter(Boolean).map((id) => game.places[id].owner))]
    .filter((o) => o && o !== a.owner && relation(game, a.owner, o) === "neutral");
  return { kind: r.kind, turns: turnsFor(a, r.cost), cells: r.cells, cost: r.cost, shape: routeShape(a, r.cells), trespass };
}

function command(target) {
  const a = ownArmy();
  const go = a && goTo(a, target);
  if (!go) return;
  ui.tip = null;
  ui.preview = null;
  hoverKey = "";
  if (go.kind === "attack") {
    ui.modal = { kind: "attack", army: a.id, id: target.place };
    return redraw();
  }
  if (go.kind === "strike") {
    ui.modal = { kind: "attack", army: a.id, target: target.army };
    return redraw();
  }
  if (go.kind === "neutral") return toast(fill(T().neutralBlock, civName(go.civ, ui.lang)));
  if (go.kind === "spent") return toast(T().tipSpent);
  if (go.kind === "ships") return toast(T().needShips);
  if (go.kind === "none") return toast(T().noPath);
  // Tarafsızın toprağından geçecekse (kullanıcı 22.10: "girilsin ama ilişki bozulsun") önce sorulur;
  // aynı medeniyet için bu oturumda bir kere.
  const ask = go.trespass.filter((c) => !ui.trespassOk?.has(c));
  if (ask.length) {
    ui.modal = { kind: "confirm", text: fill(T().trespassQ, ask.map((c) => civName(c, ui.lang)).join(", ")), yes: { do: "trespass", target, civs: ask } };
    return redraw();
  }
  sound.click();
  coachDone("move");
  if (target.army && armyById(game, target.army)?.bandit) coachDone("hunt");
  const [, trace] = traced(() => order(game, a.id, target));
  // Kışın denizde fırtına: oyuncuya hemen söyle (raporda da çıkar).
  const caught = (game.storms ?? []).filter((s) => s.army === a.id && s.turn === game.turn && !s.told);
  for (const s of caught) { s.told = true; toast(fill(T().stormToast, s.lost, s.sunk)); }
  const t0 = anim.clock();
  const arrive = anim.timeline(trace, t0, () => true, game.player) - t0;
  if (!game.armies.includes(a)) return redraw();
  if (a.route.length) {
    // Yolun kalanı: varış yerinde kaç tur sonra orada olacağı yükselir.
    const left = pathCost([cellOf(a.x, a.y), ...a.route]);
    anim.rise(centre(a.route[a.route.length - 1]), fill(T().eta, Math.max(1, Math.ceil(left / mpMax(a)))), INK.ink, arrive);
  } else if (trace.length) anim.pulse(a.at ?? { x: a.x, y: a.y }, INK.ink, arrive);
  save();
  redraw();
}

/**
 * Basılan yerdeki ordu. Uzaktan bakınca bir ordu (ya da limandaki filo) komşu bir şehrin
 * üstüne düşebiliyor: bir şehrin tam üstüne basıldıysa şehir kazanır. Ordu kendi şehrinin
 * sağında durduğu için kendi şehri onu örtmez. Sahadaki ordu bir şehrin kapısında durabiliyor
 * (saldırmaya gitti): onun sancağı şehrin maketinin üstüne biner, o yüzden ordu önce gelir.
 */
function tokenAt(x, y) {
  // Üst üste binen jetonlardan (denizde yan yana iki filo) ortası basılan yere en yakın olanı;
  // eşitse üstteki. (Hep üstteki seçilince alttakinin ortasına basmak öbürünü seçiyordu.)
  const off = (b) => Math.hypot(b.x + b.w / 2 - x, b.y + b.h / 2 - y);
  const t = [...tokens].reverse().filter((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
    .sort((a, b) => off(a) - off(b))[0];
  if (!t) return t;
  const pl = nearest(x, y);
  // Sahadaki ordu (bir şehrin kapısında duruyor olabilir) önce gelir: şehir ancak tam üstüne basılınca.
  const field = !armyById(game, t.army)?.at;
  return pl && reach(cam, pl.id, x, y) < (field ? 6 : t.fleet ? 16 : 11) ? null : t;
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
        // Seçili ordu varken bir yabancı ordunun üstü: ona saldırı (ya da yanına yürüyüş).
        if (mine && a.owner !== game.player) {
          const go = goTo(mine, targetAt(p.x, p.y));
          if (go) tip = [...tip, goLine(go, ui.lang)];
          preview = go?.shape ?? null;
        }
      }
    } else if (pl) {
      key = "p" + pl.id;
      hot = true;
      place = pl.id;
      const hid = ui.fog && !sight(game, game.player).has(pl.id);
      const go = mine ? goTo(mine, { place: pl.id }) : null;
      tip = placeTip(game, pl.id, ui.lang, hid, go);
      preview = go?.shape ?? null;
    } else if (mine) {
      // Boş arazi ya da deniz: oraya yürüyüş (kare değişince yeniden hesaplanır).
      const m = toMap(cam, p.x, p.y);
      key = "c" + cellOf(m.x, m.y);
      const go = goTo(mine, m);
      if (go) tip = [isLand(cellOf(m.x, m.y)) ? TEXT[ui.lang].groundHere : TEXT[ui.lang].seaHere, goLine(go, ui.lang)];
      preview = go?.shape ?? null;
    }
  }
  canvas.style.cursor = ui.aim && !boxes.some((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) ? "crosshair" : hot ? "pointer" : "";
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
    Escape: () => { if (ui.modal) dispatch({ do: "close" }); else if (ui.aim) ui.aim = null; else { ui.sel = null; ui.army = null; } },
    // Başlangıç ekranında oklar medeniyetler arasında gezer.
    ...(ui.screen === "start" && !ui.modal ? {
      ArrowLeft: () => stepCiv(-1), ArrowRight: () => stepCiv(1), ArrowUp: () => stepCiv(-1), ArrowDown: () => stepCiv(1),
    } : {}),
    // Total War gibi: Enter turu bitirir, Tab sıradaki orduyu seçer (karar penceresi açıkken değil).
    Enter: () => {
      if (ui.modal?.kind === "handoff") dispatch({ do: "ready" });
      else if (ui.screen === "start" && !ui.modal) dispatch({ do: (ui.players ?? 1) > 1 && ui.picks.length < ui.players - 1 ? "pickPlayer" : "start" });
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
  ui.slots = slotMeta();
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
  set game(g) { game = g; ui.screen = g ? "game" : "start"; if (g) cam.pad = GAME_PAD; redraw(); },
  /** Kayma bitene kadar çizer; araç beklemek isterse. */
  get gliding() { return !!glideTo; },
  look(id, zoom = 1) {
    glideTo = null;
    const mm = placeAt(id);
    focus(cam, mm.x, mm.y, cam.min * zoom);
    redraw();
  },
  overview() { cam.scale = cam.min; clamp(cam); redraw(); },
  /** Bir yerleşimin harita birimindeki yeri (araçlar orduyu oraya koyabilsin). */
  pos(id) { return { ...placeAt(id) }; },
  /** Kamerayı bir harita noktasına getir (sahadaki ordu için). */
  lookAt(x, y, zoom = 1) { glideTo = null; focus(cam, x, y, cam.min * zoom); redraw(); },
  /** Bir enlem/boylamın ekrandaki yeri (araçlar haritanın boş bir yerine basabilsin). */
  toScreen(lat, lon) { const m = project(lon, lat); return toScreen(cam, m.x, m.y); },
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
