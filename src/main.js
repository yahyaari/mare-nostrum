// Açılış, girdi ve çizim döngüsü.
//
// Çizim sadece bir şey değiştiğinde yapılıyor: sıra tabanlı bir haritada boşta bekleyen bir
// döngü telefonun pilini yemekten başka bir şey yapmaz.

import { PLACES } from "./data/world.js";
import { clamp, focus, makeCamera, panBy, resize, toScreen, zoomAt } from "./view/camera.js";
import { drawFrame, placeAt } from "./view/draw.js";

const started = performance.now();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const cam = makeCamera();

const view = {
  lang: pickLang(),
  selected: null,
  // Kim neye sahip. Şimdilik başlangıç haritası; oyun durumu gelince oradan okunacak.
  owners: Object.fromEntries(PLACES.map((p) => [p.id, p.owner])),
};

let dpr = 1;
let boxes = [];
let queued = false;

function pickLang() {
  const asked = new URLSearchParams(location.search).get("lang");
  if (asked === "en" || asked === "tr") return asked;
  try {
    const saved = localStorage.getItem("mn.lang");
    if (saved === "en" || saved === "tr") return saved;
  } catch { /* gizli pencere: kaydedemiyorsak varsayılan */ }
  return "en";
}

function setLang(l) {
  view.lang = l;
  try { localStorage.setItem("mn.lang", l); } catch { /* bkz. pickLang */ }
  redraw();
}

function redraw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    boxes = drawFrame(ctx, cam, view, dpr);
  });
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

// ---- girdi ----
//
// Tek parmak/fare: sürükle = kaydır, yerinde bırak = bas. İki parmak: kıstır = yakınlaş.
// Tekerlek: imlecin altındaki yere doğru yakınlaş.

const pointers = new Map();
let gesture = null; // { moved, startX, startY } ya da kıstırma { dist, cx, cy }

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
  if (!gesture) return;
  if (gesture.pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (gesture.dist > 0) zoomAt(cam, dist / gesture.dist, (a.x + b.x) / 2, (a.y + b.y) / 2);
    // İki parmak birlikte kayarsa harita da kaysın.
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
  // Kıstırmadan kalan tek parmak yeni bir sürükleme başlatmasın, basış da sayılmasın.
  if (!pointers.size) gesture = null;
};
window.addEventListener("pointerup", release);
window.addEventListener("pointercancel", release);

window.addEventListener("wheel", (e) => {
  e.preventDefault();
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
    Escape: () => { view.selected = null; },
  };
  if (keys[e.key]) { keys[e.key](); redraw(); }
});

function tap(x, y) {
  const hit = boxes.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (hit) {
    if (hit.id.startsWith("lang:")) setLang(hit.id.slice(5));
    return; // kartın içine basmak seçimi kaldırmasın
  }
  view.selected = nearest(x, y)?.id ?? null;
  redraw();
}

/** Basılan yere en yakın yerleşim, parmak ucunun kapladığı alan içindeyse. */
function nearest(x, y) {
  let best = null, bestD = 22;
  for (const p of PLACES) {
    const m = placeAt(p.id);
    const s = toScreen(cam, m.x, m.y);
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

window.addEventListener("resize", fit);
fit();

// Araçlar (Tools/peek.mjs) için: oyunun içine bakma ve bir anı kurma kapısı.
window.MareNostrum = {
  cam, view, redraw, setLang,
  select(id) { view.selected = id; redraw(); },
  /** Bir yerleşimi ortala; `zoom` en uzak hâlin kaç katı. */
  look(id, zoom = 1) {
    const m = placeAt(id);
    focus(cam, m.x, m.y, cam.min * zoom);
    redraw();
  },
  overview() { cam.scale = cam.min; clamp(cam); redraw(); },
};

requestAnimationFrame(() => console.log(`[MareNostrum] ready · ${Math.round(performance.now() - started)}ms`));
