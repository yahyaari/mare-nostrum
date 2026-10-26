// Taktik savaş (kurallar.md bölüm 29). Kullanıcı 26.10: "savaşa girerken sonuçları gör ve savaş seçeneği
// olsun; savaş dediğimizde birlikleri tepeden görüp onlara tıklayıp şuraya git buraya git diye komut
// vererek canlı bir savaş; sadece yuvarlak noktalar bile yeter, okçu süvari ayrılsın".
//
// Saf hesap: DOM yok. Ekranı view/tactics.js çizer, main.js sürer; bitince sonuç moves.js attack / strike'a
// hazır sonuç (`result`) olarak gider - yerin alınması, geri çekilme, tecrübe aynı kurallardan.
//
// Saha W x H birim; saldıran solda, savunan sağda. Her taraf askerlerini türlerine göre birliklere toplar
// (N.tactics.per); her birlik bir blok, her nokta bir asker. Birlik emredilen yere yürür; düşmana değince
// göğüs göğüse dövüşür (ikisi de durur); okçu menzildeki düşmana ok yağdırır (oklar uçar, varınca düşürür);
// süvari dalarken hücum vurur (en çok okçuya; falanks durdurur). Kayıp verdikçe, kuşatılınca, hücum yiyince
// moral düşer; moral bitince birlik bozulup kendi kenarına kaçar - kaçanlar sağ kalır. Bir tarafın dövüşen
// birliği kalmayınca savaş biter; süre dolarsa savunan kazanır. Çarpanlar otomatik savaştakiyle aynı
// (combat.js): medeniyet, araştırma, general, tecrübe, arazi, sur.

import { archMul, cavMul, eliteMelee, eliteMul, infMul, sideMuls } from "./combat.js";
import { N, UNITS, uniqueOf } from "./numbers.js";

const K = () => N.tactics;

/** Tohumlu küçük rastgele sayı üreteci (savaş kendi içinde tekrarlanabilir). */
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

/** Bir türün sahadaki davranışı: hız, göğüs göğüse güç (adam başı), ok (bölük başı), hücum, hücum durdurma. */
function profile(type, s, defending, assault) {
  const U = uniqueOf(s.civ);
  if (type === "inf") return { kind: "inf", speed: K().speed.inf, melee: infMul(s, defending), shoot: 0, charge: 0, stop: 0 };
  if (type === "arch") return { kind: "arch", speed: K().speed.inf, melee: N.archMelee * archMul(s), shoot: archMul(s), charge: 0, stop: 0 };
  if (type === "cav") return { kind: "cav", speed: K().speed.cav, melee: N.cavMelee * cavMul(s) * (assault ? N.cavWall : 1), shoot: 0, charge: cavMul(s), stop: 0 };
  if (type === "siege") return { kind: "siege", speed: K().speed.siege, melee: 0.1, shoot: 0, charge: 0, stop: 0 };
  // Özel birlik: dövüştüğü türün yeri ve hızı (atlılar hızlı; atlı okçu atar ve kaçar).
  const mounted = U.as === "cav" || (U.as === "arch" && (U.charge ?? 0) > 0);
  return {
    kind: U.as === "arch" ? "arch" : U.as, elite: true, mounted,
    speed: mounted ? K().speed.cav * 0.9 : K().speed.inf,
    melee: eliteMelee(U, defending) * eliteMul(s) * (assault && U.as === "cav" ? N.cavWall : 1),
    shoot: (U.volley ?? 0) * eliteMul(s), charge: (U.charge ?? 0) * eliteMul(s), stop: U.stop ?? 0,
  };
}

/** Bir türün dizilişi: noktalar arası uzaklık ve kaç sıra. */
const SPACING = { inf: 0.9, arch: 1.25, cav: 1.35, siege: 2.4, elite: 1.0 };
const ROWS = { inf: 5, arch: 4, cav: 4, siege: 2, elite: 5 };

/** Birliğin kapladığı yer: genişlik (cephe), derinlik, yarıçap. */
export function footprint(u) {
  const sp = SPACING[u.type] * (u.mounted ? 1.25 : 1);
  const n = Math.max(1, Math.ceil(u.men));
  const rows = Math.min(ROWS[u.type], n);
  const cols = Math.ceil(n / rows);
  const w = cols * sp, d = rows * sp;
  return { w, d, r: Math.hypot(w, d) / 2 * 0.62, sp, rows, cols };
}

/**
 * Savaşı kur. `att`, `def`: moves.js sides / fieldSides'ın tarafları ({ civ, inf, arch, ..., gen, vet,
 * terrain, mods }); `walls`: null | "city" | "castle". Dönen savaş durumu.
 */
export function setupBattle(att, def, walls, seed = 1) {
  const muls = sideMuls(att, def, walls);
  const b = { t: 0, over: null, walls, seed, rand: rng(seed), units: [], shots: [], fx: [], nextId: 1, sides: { att: { civ: att.civ, muls: muls.att, gen: !!att.gen }, def: { civ: def.civ, muls: muls.def, gen: !!def.gen } } };
  for (const side of ["att", "def"]) {
    const s = side === "att" ? att : def;
    const groups = {};
    for (const type of UNITS) {
      let left = Math.floor(s[type] ?? 0);
      const per = K().per[type];
      // Eşit büyüklükte birlikler (100 piyade: 34, 33, 33 değil 40, 40, 20).
      const n = Math.ceil(left / per);
      for (let i = 0; i < n; i++) {
        const men = Math.ceil(left / (n - i));
        left -= men;
        const p = profile(type, s, side === "def", side === "att" && !!walls);
        const u = { id: b.nextId++, side, type, ...p, men, start: men, morale: 100 + (s.gen ? 10 : 0), moraleMax: 100 + (s.gen ? 10 : 0), x: 0, y: 0, facing: side === "att" ? 0 : Math.PI, order: null, target: null, state: "idle", cool: b.rand() * K().volley.every, engaged: false, routed: false, gone: false, dead: false, wasMoving: false };
        (groups[p.mounted || type === "cav" ? "cav" : p.kind === "arch" ? "arch" : type === "siege" ? "siege" : "front"] ??= []).push(u);
        b.units.push(u);
      }
    }
    deploy(b, side, groups);
  }
  return b;
}

/**
 * Diziliş (kullanıcının görseli gibi): piyade ve özel piyade önde bir hat, okçular arkasında, atlılar hattın
 * iki ucunda, makineler en arkada. Her birlik cephesi kadar yer tutar; hat sahaya sığmazsa aralar daralır.
 */
function deploy(b, side, g) {
  const { w, h } = K();
  const mirror = (x) => (side === "att" ? x : w - x);
  const gap = 2.5;
  // Bir hat: birlikler yan yana (y boyunca), ortası `cy`; dönen hattın üst ve alt ucu.
  const line = (list, x, cy) => {
    if (!list.length) return [cy, cy];
    const widths = list.map((u) => footprint(u).w);
    const total = widths.reduce((s, v) => s + v, 0);
    const g2 = Math.max(0.5, Math.min(gap, (h * 0.92 - total) / Math.max(1, list.length - 1)));
    let y = cy - (total + g2 * (list.length - 1)) / 2;
    const top = y;
    list.forEach((u, i) => {
      u.x = mirror(x);
      u.y = Math.max(footprint(u).w / 2 + 1, Math.min(h - footprint(u).w / 2 - 1, y + widths[i] / 2));
      y += widths[i] + g2;
    });
    return [top, y - g2];
  };
  // Savunan (aynalı) surun ardında: sur `wallX`'te, savunanın hattı onun 4 birim gerisinde.
  const front = b.walls && side === "def" ? w - K().wallX - 4 : 20;
  const [top, bottom] = line(g.front ?? [], front, h / 2);
  line(g.arch ?? [], front - 8, h / 2);
  // Atlılar: hattın üst ve alt ucunun ötesinde (sığmazsa sahanın kenarına).
  const cav = g.cav ?? [];
  const up = cav.filter((_, i) => i % 2 === 0), down = cav.filter((_, i) => i % 2 === 1);
  const span = (list) => list.reduce((s, u) => s + footprint(u).w + gap, 0);
  // Hattın ucunda yer yoksa okçuların arkasına.
  const fits = top - gap - span(up) >= 0 && bottom + gap + span(down) <= h;
  if (fits) {
    line(up, front - 2, top - gap - span(up) / 2);
    line(down, front - 2, bottom + gap + span(down) / 2);
  } else {
    line(up, front - 15, h * 0.25);
    line(down, front - 15, h * 0.75);
  }
  line(g.siege ?? [], front - 15, h / 2);
  // Yine de üst üste binenler biraz açılır.
  for (let pass = 0; pass < 4; pass++) separate(b, 1);
}

const alive = (u) => !u.dead && !u.gone;
const fighting = (u) => alive(u) && !u.routed && u.type !== "siege";
const foes = (b, u) => b.units.filter((v) => v.side !== u.side && alive(v) && !v.routed);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Emir ver: bir yere yürü (`{ x, y }`) ya da bir düşman birliğine saldır (`{ unit: id }`). */
export function command(b, ids, target) {
  for (const id of ids) {
    const u = b.units.find((v) => v.id === id);
    if (!u || !alive(u) || u.routed) continue;
    u.order = target.unit ? { unit: target.unit } : { x: Math.max(1, Math.min(K().w - 1, target.x)), y: Math.max(1, Math.min(K().h - 1, target.y)) };
    u.manual = true;
  }
}

/** Birlikler birbirinin içine girmesin: dosttan itilir, düşmana değince durur. */
function separate(b, k) {
  const us = b.units.filter(alive);
  for (let i = 0; i < us.length; i++) {
    for (let j = i + 1; j < us.length; j++) {
      const a = us[i], c = us[j];
      if (a.side !== c.side && !a.routed && !c.routed) continue;
      const ra = footprint(a).r, rc = footprint(c).r;
      const d = dist(a, c), need = (ra + rc) * 0.8;
      if (d >= need || d === 0) continue;
      const push = ((need - d) / 2) * k, nx = (a.x - c.x) / d, ny = (a.y - c.y) / d;
      a.x += nx * push; a.y += ny * push;
      c.x -= nx * push; c.y -= ny * push;
    }
  }
}

/** Bir birliğin değdiği düşmanlar (göğüs göğüse). */
function contacts(b, u) {
  const ru = footprint(u).r;
  return foes(b, u).filter((v) => dist(u, v) <= ru + footprint(v).r + K().reach);
}

/** Bilgisayarın emirleri (düşman tarafı; ya da Otomatik'te oyuncunun tarafı). Elle emir verilmiş birliğe dokunmaz. */
export function aiOrders(b, side, all = false) {
  const enemy = (u) => foes(b, u);
  for (const u of b.units.filter((v) => v.side === side && alive(v) && !v.routed)) {
    if (u.manual && !all) continue;
    const en = enemy(u);
    if (!en.length) { u.order = null; continue; }
    const near = (list) => list.reduce((m, v) => (!m || dist(u, v) < dist(u, m) ? v : m), null);
    const nearest = near(en);
    // Surun ardındaki savunan yerinden kıpırdamaz, düşman yaklaşınca karşılar.
    if (b.walls && side === "def" && dist(u, nearest) > K().hold) { u.order = null; continue; }
    if (u.type === "siege") { u.order = null; continue; }
    if (u.shoot > 0 && !u.mounted) {
      // Okçu: menzildeyse durup atar; değilse menzile kadar yaklaşır.
      u.order = dist(u, nearest) <= K().volley.range * 0.9 ? null : { unit: nearest.id };
      continue;
    }
    if (u.shoot > 0 && u.mounted && u.charge < 1) {
      // Atlı okçu: menzilde atar, yaklaşan yaya düşmandan kaçar.
      const threat = en.find((v) => !v.mounted && v.type !== "cav" && dist(u, v) < 9);
      if (threat) {
        const d = dist(u, threat) || 1;
        u.order = { x: u.x + ((u.x - threat.x) / d) * 8, y: u.y + ((u.y - threat.y) / d) * 8 };
      } else u.order = dist(u, nearest) <= K().volley.range * 0.85 ? null : { unit: nearest.id };
      continue;
    }
    if (u.charge > 0) {
      // Süvari: önce okçulara, yoksa en yakına.
      const archers = en.filter((v) => v.kind === "arch" && !v.mounted);
      u.order = { unit: (near(archers) ?? nearest).id };
      continue;
    }
    u.order = { unit: nearest.id };
  }
}

/** Savaşı `dt` saniye ilerlet. */
export function step(b, dt) {
  if (b.over) return;
  b.t += dt;
  const T = K();
  // 1. Yürüyüş (dövüşmeyen, bozulmamış birlikler emirlerine; bozulanlar kendi kenarına).
  for (const u of b.units.filter(alive)) {
    const fighting_ = contacts(b, u).length > 0 && !u.routed;
    u.engaged = fighting_;
    let goal = null;
    if (u.routed) goal = { x: u.side === "att" ? -6 : T.w + 6, y: u.y };
    else if (!fighting_ && u.order) {
      if (u.order.unit) {
        const t = b.units.find((v) => v.id === u.order.unit);
        if (!t || !alive(t) || t.routed) { u.order = null; u.manual = false; }
        else if (u.shoot > 0 && u.charge < 1 && dist(u, t) <= T.volley.range * 0.9) goal = null; // atıcı menzilde durur
        else goal = t;
      } else goal = u.order;
    }
    u.wasMoving = false;
    if (goal) {
      const d = dist(u, goal);
      const sp = u.speed * (u.routed ? 1.15 : 1) * dt;
      if (d > 0.3) {
        u.facing = Math.atan2(goal.y - u.y, goal.x - u.x);
        const k = Math.min(1, sp / d);
        u.x += (goal.x - u.x) * k;
        u.y += (goal.y - u.y) * k;
        u.wasMoving = true;
      } else if (!u.order?.unit) { u.order = null; u.manual = false; }
    } else if (!u.routed) {
      // Duran birlik en yakın düşmana döner.
      const n = foes(b, u).reduce((m, v) => (!m || dist(u, v) < dist(u, m) ? v : m), null);
      if (n) u.facing = Math.atan2(n.y - u.y, n.x - u.x);
    }
    if (u.routed && (u.x < -4 || u.x > T.w + 4)) u.gone = true;
  }
  separate(b, 0.5);
  // Sur: saldıran duvarın önünde, savunan ardında kalır; göğüs göğüse dövüş duvarın iki yanından. Duvarı
  // tutacak yaya (okçu olmayan) savunan kalmayınca saldıranlar surdan geçer (yoksa okçulara hiç ulaşamazlar).
  const guarded = b.walls && b.units.some((v) => v.side === "def" && fighting(v) && v.kind !== "arch");
  if (guarded) {
    for (const u of b.units.filter((v) => alive(v) && !v.routed)) {
      const r = footprint(u).r;
      if (u.side === "att") u.x = Math.min(u.x, T.wallX - r - 0.4);
      else u.x = Math.max(u.x, T.wallX + r + 0.4);
    }
  }
  // 2. Hücum: atlı birlik yeni değdiği düşmana dalar (okçuya tam, ötekine az); falanks durdurur.
  for (const u of b.units.filter((v) => alive(v) && !v.routed && v.charge > 0)) {
    for (const v of contacts(b, u)) {
      u.hit ??= new Set();
      if (u.hit.has(v.id) || !u.wasMoving && u.engagedBefore) continue;
      u.hit.add(v.id);
      const stop = v.stop > 0 ? (v.men / N.company) * v.stop : 0;
      const raw = (u.men / N.company) * N.charge * u.charge * T.charge * (v.kind === "arch" ? 1 : T.chargeOther) * b.sides[u.side].muls.power;
      const kills = Math.max(0, raw - stop * N.charge * T.charge);
      hurt(b, v, kills);
      v.morale -= kills > 0 ? T.morale.charge : 0;
      if (stop > 0) hurt(b, u, stop * T.charge * 2);
      b.fx.push({ kind: "charge", x: v.x, y: v.y, t: b.t });
    }
    u.engagedBefore = contacts(b, u).length > 0;
  }
  // 3. Göğüs göğüse: her birlik değdiği düşmanlara gücü oranında asker düşürür (hedefine ağırlıklı).
  const dmg = new Map();
  for (const u of b.units.filter((v) => alive(v) && !v.routed)) {
    const cs = contacts(b, u);
    if (!cs.length) continue;
    const out = u.men * u.melee * b.sides[u.side].muls.power * T.melee * dt;
    const tgt = cs.find((v) => v.id === u.order?.unit) ?? cs[0];
    for (const v of cs) dmg.set(v, (dmg.get(v) ?? 0) + out * (v === tgt ? 0.7 : 0.3 / Math.max(1, cs.length - 1)) * (cs.length === 1 ? 1 / 0.7 : 1));
    // Birden çok düşmana değen (kuşatılan) birliğin morali hızla düşer.
    if (cs.length >= 2) u.morale -= T.morale.flank * dt;
  }
  for (const [v, k] of dmg) hurt(b, v, k);
  // 4. Ok: atıcı (dövüşmüyorsa) menzildeki hedefine ya da en yakın düşmana atar; ok uçar, varınca düşürür.
  for (const u of b.units.filter((v) => alive(v) && !v.routed && v.shoot > 0)) {
    u.cool -= dt;
    if (u.cool > 0 || contacts(b, u).length) continue;
    const ordered = u.order?.unit ? b.units.find((v) => v.id === u.order.unit) : null;
    const inRange = foes(b, u).filter((v) => dist(u, v) <= T.volley.range);
    const t = ordered && inRange.includes(ordered) ? ordered : inRange.reduce((m, v) => (!m || dist(u, v) < dist(u, m) ? v : m), null);
    if (!t) continue;
    u.cool = T.volley.every * (0.9 + b.rand() * 0.2);
    const kills = (u.men / N.company) * N.volley * u.shoot * b.sides[u.side].muls.volley * T.volley.kill * (0.85 + b.rand() * 0.3);
    b.shots.push({ from: { x: u.x, y: u.y }, to: t.id, at: { x: t.x, y: t.y }, t0: b.t, t1: b.t + T.volley.flight, kills, side: u.side, n: Math.min(12, Math.ceil(u.men / 3)) });
  }
  for (const s of b.shots.filter((x) => x.t1 <= b.t)) {
    const v = b.units.find((x) => x.id === s.to);
    if (v && alive(v)) { hurt(b, v, s.kills); v.morale -= T.morale.arrow; }
  }
  b.shots = b.shots.filter((x) => x.t1 > b.t);
  // 5. Moral: kayıp oranı, kuşatılma; dövüşmeyen toparlanır. Biten bozulur, yakındaki dostlar sarsılır.
  for (const u of b.units.filter((v) => alive(v) && !v.routed)) {
    const lost = 1 - u.men / u.start;
    if (!u.engaged) u.morale = Math.min(u.moraleMax ?? 110, u.morale + T.morale.recover * dt);
    if (u.morale - lost * 100 * T.morale.loss <= T.morale.rout || u.men < u.start * T.morale.floor) {
      u.routed = true;
      u.order = null;
      b.fx.push({ kind: "rout", x: u.x, y: u.y, t: b.t });
      for (const v of b.units.filter((x) => x.side === u.side && alive(x) && !x.routed && dist(x, u) < 15)) v.morale -= T.morale.nearby;
    }
  }
  b.fx = b.fx.filter((e) => b.t - e.t < 2);
  // 6. Bitti mi: bir tarafın dövüşen birliği kalmadıysa; süre dolduysa savunan kazanır.
  const left = (side) => b.units.some((u) => u.side === side && fighting(u));
  if (!left("def")) b.over = { winner: "att" };
  else if (!left("att")) b.over = { winner: "def" };
  else if (b.t >= T.time) b.over = { winner: "def", timeout: true };
}

/** Bir birlikten asker düşer (kesirli; sayılırken aşağı yuvarlanır). */
function hurt(b, u, k) {
  if (!alive(u) || k <= 0) return;
  u.men = Math.max(0, u.men - k);
  if (u.men < 0.5) { u.men = 0; u.dead = true; }
}

/** Bir tarafın sağ kalanları, türleriyle (bozulup kaçanlar dahil). */
function survivors(b, side) {
  const out = Object.fromEntries(UNITS.map((k) => [k, 0]));
  for (const u of b.units) if (u.side === side && !u.dead) out[u.type] += Math.floor(u.men);
  return out;
}

/**
 * Savaşın sonucu, combat.js fight'ın biçiminde (moves.js attack / strike'a hazır sonuç): kazananın sağ
 * kalanları; kaybedeninki sıfır, ama sahadan kaçabilenleri `escaped` (geri çekilen ordu olur).
 */
export function outcome(b) {
  const attWins = b.over?.winner === "att";
  const att = survivors(b, "att"), def = survivors(b, "def");
  const none = Object.fromEntries(UNITS.map((k) => [k, 0]));
  const sum = (u) => UNITS.reduce((n, k) => n + u[k], 0);
  return {
    attWins, att: attWins ? att : none, def: attWins ? none : def,
    attPow: Math.max(1, sum(att)), defPow: Math.max(1, sum(def)), escaped: attWins ? def : att, tactical: true,
  };
}

/** Ekran için: bir tarafın toplam askeri ve dövüşen askeri. */
export function strength(b, side) {
  let men = 0, start = 0;
  for (const u of b.units) if (u.side === side) { start += u.start; if (!u.dead && !u.gone && !u.routed) men += u.men; }
  return { men: Math.floor(men), start };
}

/** Bütün savaşı bilgisayara oynat (Otomatik bitir; testler ve ayar için). */
export function autoplay(b, limit = Infinity) {
  const dt = 0.1;
  let next = 0;
  while (!b.over && b.t < limit) {
    if (b.t >= next) { aiOrders(b, "att", true); aiOrders(b, "def", true); next = b.t + 0.7; }
    step(b, dt);
  }
  return b;
}
