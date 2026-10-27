// Deniz savaşı sahada (kurallar.md bölüm 29h; kullanıcı 27.10, önerilerden: "deniz savaşları sahada - gemiler, mahmuzla
// çarpma, gemiye çıkma"). Saf kurallar, DOM yok; taktik savaşın (tactics.js) kardeşi, aynı ekran ve düğmelerle.
//
// Her gemi bir birlik: kadırga (taşıma, hafif), trireme (hızlı, mahmuzu sert), kinkerem (ağır, kalabalık, güvertesinde
// okçular). Gemiler yavaş döner, hızlanıp yavaşlar. Hızla çarpan mahmuz gövdeyi deler - yandan çarpan çok, burun burna
// az; çarpışan iki gemi kancalanır, tayfaları (gemideki askerler de, deniz piyadesi) birbirine geçer; tayfası biten
// ya da bozulan gemi ele geçer. Gövdesi biten batar. Güvertedeki okçular menzildekine ok atar. Morali bozulan gemi
// kendi kenarına kaçar. Bir tarafın savaşan gemisi kalmayınca biter; süre dolarsa savunan kazanır.
//
// Sonuç combat.js naval'ın biçiminde: { attWins, att: { ships, trireme, quinq }, def: {...}, naval: true }.

import { N, SHIPS } from "./numbers.js";

const K = () => N.tactics.naval;
const PI2 = Math.PI * 2;

function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const alive = (u) => !u.dead && !u.gone && !u.taken;
const fighting = (u) => alive(u) && !u.routed;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleTo = (from, to) => ((to - from + Math.PI * 3) % PI2) - Math.PI;
const unitById = (b, id) => b.units.find((v) => v.id === id);

/** Bir geminin boyu ve eni (saha birimi). */
export const hullOf = (u) => K().types[u.type];

/**
 * Deniz savaşını kur. `att`, `def`: { civ, ships, trireme, quinq, troops: { inf, arch, ... }, gen?, mods? } - filo
 * ve taşıdığı askerler. Askerler gemilere taşıma güçleri oranında dağılır (tayfaya katılır, okçular güvertede atar).
 */
export function setupNaval(att, def, seed = 1) {
  const T = K();
  const b = {
    t: 0, over: null, naval: true, seed, rand: rng(seed), units: [], shots: [], fx: [], nextId: 1, gaps: [], reserve: [],
    sides: { att: { civ: att.civ, gen: !!att.gen }, def: { civ: def.civ, gen: !!def.gen } },
    field: { w: N.tactics.w, h: N.tactics.h, islands: [] }, weather: att.weather ?? null, wx: { volley: 1, range: 1, charge: 1, speed: 1, ...(att.wx ?? {}) },
  };
  // Kayalık adacıklar: sahanın ortasında birkaç tane (gemiler etrafından dolanır).
  const r = rng(seed * 7 + 3), n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) b.field.islands.push({ x: N.tactics.w * (0.35 + r() * 0.3), y: N.tactics.h * (0.15 + r() * 0.7), r: 2 + r() * 3.5 });
  for (const side of ["att", "def"]) {
    const s = side === "att" ? att : def;
    const list = [];
    for (const type of SHIPS) for (let i = 0; i < (s[type] ?? 0); i++) list.push(type);
    // Taşıdığı askerler: gemilerin taşıma gücü oranında; okçuların payı güvertede atar.
    const carry = list.reduce((m, k) => m + N.navy.types[k].carry, 0) || 1;
    const troops = Object.values(s.troops ?? {}).reduce((m, v) => m + (v ?? 0), 0);
    const archShare = troops ? ((s.troops.arch ?? 0) + (s.troops.elite ?? 0) * 0.5) / troops : 0;
    const navy = (s.mods?.navy ?? 1) * (s.gen?.traits?.includes("admiral") ? N.officers.admiral : 1);
    list.forEach((type, i) => {
      const Y = T.types[type];
      const marines = Math.round((troops * N.navy.types[type].carry) / carry);
      const men = Y.crew + marines;
      const m = 100 + (s.gen ? 10 : 0);
      b.units.push({
        id: b.nextId++, side, type, ship: true, hull: Y.hull * navy, hullMax: Y.hull * navy, men, start: men, morale: m, moraleMax: m,
        bow: Y.bow * navy, board: Y.board * navy, shoot: Y.archers + archShare * marines * T.marineArchers, v: 0, x: 0, y: 0,
        facing: side === "att" ? 0 : Math.PI, order: null, cool: b.rand() * T.volley.every, grapple: null, routed: false, dead: false, gone: false, taken: false,
      });
    });
    // Diziliş: kendi kenarında bir hat, ağır gemiler ortada.
    const mine = b.units.filter((u) => u.side === side).sort((a, c) => T.types[c.type].hull - T.types[a.type].hull);
    const gap = Math.min(9, (N.tactics.h - 8) / Math.max(1, mine.length));
    mine.forEach((u, i) => {
      const k = i % 2 ? Math.ceil(i / 2) : -Math.ceil(i / 2);
      u.x = side === "att" ? 14 : N.tactics.w - 14;
      u.y = N.tactics.h / 2 + k * gap;
    });
  }
  return b;
}

/** Bir noktadaki gemi (yan tarafınki), yoksa null: gövdesinin yakınına tıklanınca. */
export function shipAt(b, p, side = null) {
  let best = null, bd = Infinity;
  for (const u of b.units) {
    if (!alive(u) || (side && u.side !== side)) continue;
    const H = hullOf(u), c = Math.cos(u.facing), s = Math.sin(u.facing), dx = p.x - u.x, dy = p.y - u.y;
    const along = dx * c + dy * s, across = -dx * s + dy * c;
    if (Math.abs(along) > H.len / 2 + 1.5 || Math.abs(across) > H.beam / 2 + 1.5) continue;
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

/** Emir: bir yere git (`{ x, y }`) ya da bir gemiye saldır (`{ unit }`). */
export function navalCommand(b, ids, target) {
  for (const id of ids) {
    const u = unitById(b, id);
    if (!u || !fighting(u)) continue;
    u.order = target.unit ? { unit: target.unit } : { x: Math.max(3, Math.min(N.tactics.w - 3, target.x)), y: Math.max(3, Math.min(N.tactics.h - 3, target.y)) };
    u.manual = true;
    if (u.grapple && !target.unit) cutLoose(b, u);
  }
}

/** Kancalar çözülür (ikisinin de). */
function cutLoose(b, u) {
  const v = unitById(b, u.grapple);
  if (v && v.grapple === u.id) v.grapple = null;
  u.grapple = null;
}

/**
 * Bilgisayarın emirleri: trireme yandan çarpmak için hedefinin yanına, ötekiler en yakın düşmana (kancalamak için);
 * morali düşük gemi ve okçusu güçlü kinkerem biraz uzakta durup atar. Elle emir verilmişe dokunmaz (`all` hariç).
 */
export function aiNaval(b, side, all = false) {
  const foes = b.units.filter((u) => u.side !== side && fighting(u));
  for (const u of b.units.filter((v) => v.side === side && fighting(v))) {
    if (u.manual && !all) continue;
    if (!foes.length) { u.order = null; continue; }
    if (u.grapple) continue;
    const near = foes.reduce((m, v) => (!m || dist(u, v) < dist(u, m) ? v : m), null);
    u.order = { unit: near.id };
  }
}

/** Savaşı `dt` saniye ilerlet. */
export function stepNaval(b, dt) {
  if (b.over) return;
  b.t += dt;
  const T = K();
  // 1. Yürüyüş: hedefe dön, hızlan; yanına çarpmak için trireme hedefin yanını hedefler.
  for (const u of b.units.filter(alive)) {
    const Y = T.types[u.type];
    let aim = null;
    if (u.routed) aim = { x: u.side === "att" ? -10 : N.tactics.w + 10, y: u.y };
    else if (u.grapple) aim = null;
    else if (u.order?.unit) {
      const t = unitById(b, u.order.unit);
      if (!t || !alive(t) || t.routed) { u.order = null; u.manual = false; }
      else {
        // Önüne düşen yer (hedef de yürüyor); trireme hedefin bordasına doğru (yandan çarpmak için).
        const lead = Math.min(2, dist(u, t) / Math.max(1, Y.speed));
        aim = { x: t.x + Math.cos(t.facing) * t.v * lead, y: t.y + Math.sin(t.facing) * t.v * lead };
        if (u.type === "trireme" && dist(u, t) > 8) {
          const side = Math.sign(-Math.sin(t.facing) * (u.x - t.x) + Math.cos(t.facing) * (u.y - t.y)) || 1;
          aim = { x: aim.x - Math.sin(t.facing) * side * 4, y: aim.y + Math.cos(t.facing) * side * 4 };
        }
      }
    } else if (u.order) aim = u.order;
    let want = 0;
    if (aim) {
      const d = dist(u, aim), to = Math.atan2(aim.y - u.y, aim.x - u.x);
      const turn = Y.turn * dt * (0.4 + 0.6 * Math.min(1, u.v / Y.speed + 0.3));
      const da = angleTo(u.facing, to);
      u.facing += Math.max(-turn, Math.min(turn, da));
      // Yönü tutmadan tam hız yok; varınca yavaşlar.
      want = Y.speed * b.wx.speed * Math.max(0.25, Math.cos(Math.min(Math.PI / 2, Math.abs(da)))) * (u.order?.unit || u.routed ? 1 : Math.min(1, d / 6));
      if (!u.order?.unit && !u.routed && d < 1) { u.order = null; u.manual = false; want = 0; }
    }
    // Ağır tayfa kaybı küreği yavaşlatır.
    want *= 0.5 + 0.5 * Math.min(1, u.men / Math.max(1, Y.crew));
    u.v += Math.max(-T.brake * dt, Math.min(T.accel * dt, want - u.v));
    if (u.grapple) u.v = 0;
    u.px = u.x;
    u.py = u.y;
    u.x += Math.cos(u.facing) * u.v * dt;
    u.y += Math.sin(u.facing) * u.v * dt;
    if (u.routed && (u.x < -6 || u.x > N.tactics.w + 6)) u.gone = true;
    // Kayalıklar: çarpan durur, kenara itilir.
    for (const is of b.field.islands) {
      const d = Math.hypot(u.x - is.x, u.y - is.y), min = is.r + hullOf(u).beam;
      if (d < min) { u.x = is.x + ((u.x - is.x) / (d || 1)) * min; u.y = is.y + ((u.y - is.y) / (d || 1)) * min; u.v *= 0.3; }
    }
    if (!u.routed) { u.x = Math.max(2, Math.min(N.tactics.w - 2, u.x)); u.y = Math.max(2, Math.min(N.tactics.h - 2, u.y)); }
  }
  // 2. Çarpma: bir geminin burnu düşman gövdesine değerse mahmuz - hızı ve açısıyla; sonra kancalanırlar. Bütün çarpmalar
  // önce bulunur, sonra birlikte işlenir (sırası önce gelen taraf, burun burna karşılaşmada hep önce vurmasın).
  const hits = [];
  for (const u of b.units.filter(fighting)) {
    if (u.grapple) continue;
    const H = hullOf(u), bx = u.x + Math.cos(u.facing) * H.len / 2, by = u.y + Math.sin(u.facing) * H.len / 2;
    for (const v of b.units) {
      if (v.side === u.side || !alive(v) || v === u) continue;
      const V = hullOf(v), c = Math.cos(v.facing), s = Math.sin(v.facing), dx = bx - v.x, dy = by - v.y;
      const along = dx * c + dy * s, across = -dx * s + dy * c;
      if (Math.abs(along) > V.len / 2 + 0.3 || Math.abs(across) > V.beam / 2 + 0.3) continue;
      // Yandan çarpma (açı dik) en serti; burun burna, kıçtan az.
      const broad = Math.abs(Math.sin(angleTo(u.facing, v.facing)));
      const speed = Math.max(0, u.v - (v.v * Math.cos(angleTo(u.facing, v.facing))));
      hits.push({ u, v, bx, by, dmg: u.bow * speed * T.ram * (T.ramSide * broad + (1 - broad) * T.ramHead) });
      break;
    }
  }
  for (const { u, v, bx, by, dmg } of hits) {
    v.hull -= dmg;
    u.hull -= dmg * T.recoil;
    v.morale -= dmg * T.ramMorale;
    if (dmg > 0.5) b.fx.push({ kind: "ram", x: bx, y: by, t: b.t, power: dmg });
  }
  for (const { u, v, bx, by } of hits) {
    u.v = 0;
    v.v *= 0.5;
    if (!u.grapple && !v.grapple && !v.routed) { u.grapple = v.id; v.grapple = u.id; b.fx.push({ kind: "grapple", x: bx, y: by, t: b.t }); }
  }
  // Gemiler üst üste binmez (kancalılar da dahil, ama yan yana dururlar).
  const live = b.units.filter(alive);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], c = live[j], min = (hullOf(a).beam + hullOf(c).beam) / 2 + 0.6;
      const d = dist(a, c);
      if (d >= min || d < 1e-6) continue;
      const push = (min - d) / 2;
      const nx = (c.x - a.x) / d, ny = (c.y - a.y) / d;
      a.x -= nx * push; a.y -= ny * push; c.x += nx * push; c.y += ny * push;
    }
  }
  // 3. Gemiye çıkma: kancalı iki geminin tayfaları dövüşür (kalabalık ve ağır gemi güçlü).
  const pairs = new Set();
  for (const u of b.units.filter(alive)) {
    if (!u.grapple) continue;
    const v = unitById(b, u.grapple);
    if (!v || !alive(v) || v.grapple !== u.id) { u.grapple = null; continue; }
    const key = Math.min(u.id, v.id) + "|" + Math.max(u.id, v.id);
    if (pairs.has(key)) continue;
    pairs.add(key);
    const hitU = v.men * v.board * T.melee * dt * (0.85 + b.rand() * 0.3), hitV = u.men * u.board * T.melee * dt * (0.85 + b.rand() * 0.3);
    u.men = Math.max(0, u.men - hitU);
    v.men = Math.max(0, v.men - hitV);
    u.morale -= hitU * T.boardMorale;
    v.morale -= hitV * T.boardMorale;
  }
  // 4. Ok: güvertedeki okçular menzildeki en yakın düşmana (kancalı değilse).
  for (const u of b.units.filter((v) => fighting(v) && v.shoot > 0 && !v.grapple)) {
    u.cool -= dt;
    if (u.cool > 0) continue;
    const range = T.volley.range * b.wx.range;
    const t = b.units.filter((v) => v.side !== u.side && alive(v) && dist(u, v) <= range).reduce((m, v) => (!m || dist(u, v) < dist(u, m) ? v : m), null);
    if (!t) continue;
    u.cool = T.volley.every * (0.9 + b.rand() * 0.2);
    b.shots.push({ from: { x: u.x, y: u.y }, to: t.id, at: { x: t.x, y: t.y }, t0: b.t, t1: b.t + 0.8, kills: u.shoot * T.volley.kill * b.wx.volley * (0.85 + b.rand() * 0.3), side: u.side, n: Math.min(10, Math.ceil(u.shoot * 2) + 2) });
  }
  for (const s of b.shots.filter((x) => x.t1 <= b.t)) {
    const v = unitById(b, s.to);
    if (v && alive(v)) { v.men = Math.max(0, v.men - s.kills); v.morale -= T.arrowMorale; }
  }
  b.shots = b.shots.filter((x) => x.t1 > b.t);
  // 5. Batma, ele geçme, bozulma.
  for (const u of b.units.filter(alive)) {
    if (u.hull <= 0) {
      u.dead = true;
      u.sankAt = b.t;
      if (u.grapple) cutLoose(b, u);
      b.fx.push({ kind: "sink", x: u.x, y: u.y, t: b.t });
      for (const v of b.units) if (v.side === u.side && fighting(v) && dist(u, v) < 20) v.morale -= T.sinkMorale;
      continue;
    }
    const lost = 1 - u.men / Math.max(1, u.start), broken = 1 - u.hull / u.hullMax;
    const mor = u.morale - lost * 100 * T.lossMorale - broken * 100 * T.hullMorale;
    if (u.men < 1 || (u.grapple && mor <= T.surrender)) {
      // Tayfası biten ya da kancalıyken direnci kırılan gemi ele geçer.
      u.taken = true;
      u.takenAt = b.t;
      if (u.grapple) cutLoose(b, u);
      b.fx.push({ kind: "taken", x: u.x, y: u.y, t: b.t });
      continue;
    }
    if (!u.routed && mor <= T.rout) {
      u.routed = true;
      u.order = null;
      if (u.grapple) cutLoose(b, u);
      b.fx.push({ kind: "rout", x: u.x, y: u.y, t: b.t });
    }
    if (!u.grapple) u.morale = Math.min(u.moraleMax, u.morale + T.recover * dt);
  }
  b.fx = b.fx.filter((e) => b.t - e.t < 3);
  // 6. Bitti mi.
  const left = (side) => b.units.some((u) => u.side === side && fighting(u));
  if (!left("def")) b.over = { winner: "att" };
  else if (!left("att")) b.over = { winner: "def" };
  else if (b.t >= T.time) b.over = { winner: "def", timeout: true };
}

/** Geminin kalan morali (ekran için): kayıp tayfa ve delik gövde düşer. */
export function shipMorale(u) {
  const T = K();
  return u.morale - (1 - u.men / Math.max(1, u.start)) * 100 * T.lossMorale - (1 - u.hull / u.hullMax) * 100 * T.hullMorale;
}

/** Sonuç, combat.js naval'ın biçiminde: iki tarafın kalan gemileri (batan ve ele geçen düşer, kaçanlar kalır). */
export function navalOutcome(b) {
  const attWins = b.over?.winner === "att";
  const left = (side) => {
    const out = Object.fromEntries(SHIPS.map((k) => [k, 0]));
    for (const u of b.units) if (u.side === side && !u.dead && !u.taken) out[u.type]++;
    return out;
  };
  const none = Object.fromEntries(SHIPS.map((k) => [k, 0]));
  return { attWins, att: attWins ? left("att") : none, def: attWins ? none : left("def"), naval: true, tactical: true };
}

/** Bütün deniz savaşını bilgisayara oynat (ayar ve testler için). */
export function autoplayNaval(b, limit = Infinity) {
  let next = 0;
  while (!b.over && b.t < limit) {
    if (b.t >= next) { aiNaval(b, "att", true); aiNaval(b, "def", true); next = b.t + 0.7; }
    stepNaval(b, 0.1);
  }
  return b;
}
