// Taktik savaş (kurallar.md bölüm 29). Kullanıcı 26.10: "savaşa girerken sonuçları gör ve savaş seçeneği
// olsun; savaş dediğimizde birlikleri tepeden görüp onlara tıklayıp şuraya git buraya git diye komut
// vererek canlı bir savaş; sadece yuvarlak noktalar bile yeter, okçu süvari ayrılsın". Sonra: "40 piyade tek
// bir taburdu, ikiye ayıramadım; 2 sütun şeklinde uzatabilsem, düşmanın etrafını sarsalar".
//
// Saf hesap: DOM yok. Ekranı view/tactics.js çizer, main.js sürer; bitince sonuç moves.js attack / strike'a
// hazır sonuç (`result`) olarak gider - yerin alınması, geri çekilme, tecrübe aynı kurallardan.
//
// Saha W x H birim; saldıran solda, savunan sağda. Her taraf askerlerini türlerine göre birliklere toplar
// (N.tactics.per); her birlik bir dikdörtgen blok - `cols` asker cephe, gerisi derinlik; her nokta bir asker.
// Birlik bölünür, birleşir, genişler, derinleşir; sağ sürükleyerek çizilen hatta dizilir. Emredilen yere
// yürür; düşmana değince göğüs göğüse dövüşür (ön sıraları, N.tactics.ranks); yandan ve arkadan vuran daha
// çok öldürür ve morali çökertir, dövüşen birlik yavaş döner - sarmak işe yarar. Okçu menzildekine ok
// yağdırır; süvari dalarken hücum vurur (falanks durdurur). Moral bitince birlik bozulup kendi kenarına kaçar
// - kaçanlar sağ kalır. Bir tarafın dövüşen birliği kalmayınca savaş biter; süre dolarsa savunan kazanır.
// Çarpanlar otomatik savaştakiyle aynı (combat.js): medeniyet, araştırma, general, tecrübe, arazi, sur.
// Saha arazisi (field.js): nehir köprüden geçilir (birlikler yolu kendileri bulur), karşı kıyıyla göğüs
// göğüse dövüşülmez; ormanda yürüyüş yavaş, süvari zayıf, oklar ağaçlara takılır; tepeden aşağı vuran
// güçlü, tepedeki okçunun menzili uzun; evler geçilmez.
//
// Kullanıcı 27.10: "birimler birbirine takılıyor, birbirinin içinden geçebilsinler; surlara tırmanıyormuş
// gibi olsun, kaç kişi gelirse gelsin surdan tek sıra geçebilmeli". Dost birlikler birbirini itmez (iç içe
// geçer). Sur: dışarıdakiler surun önünde, içeridekiler ardında kalır; sura dayanan birlik merdivenden tek
// sıra tırmanır - askerleri saniyede N.tactics.climb.rate kadar içeride ayrı bir birliğe geçer; merdivenin
// dibindeki sur tutan savunan tırmananları düşürür. Kuşatma makinesi sura dayanınca bir süre sonra gedik
// açar, gedikten herkes geçer. Surun iki yanı göğüs göğüse dövüşmez (gedik dışında); surdaki savunan sur
// bonusuyla, içerideki sursuz dövüşür.

import { archMul, cavMul, eliteMelee, eliteMul, infMul, sideMuls } from "./combat.js";
import { N, UNITS, uniqueOf } from "./numbers.js";
import { FOREST, WALL, addCity, breach as openBreach, flatField, heightAt, insideCity, kindAt, passable, pathOn, sidePoint, wallAt, wallPoint, wallShare, waterBetween } from "./field.js";

const K = () => N.tactics;
const PI2 = Math.PI * 2;

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

/** Bir türün dizilişi: noktalar arası uzaklık ve varsayılan derinlik (sıra). */
const SPACING = { inf: 0.9, arch: 1.25, cav: 1.35, siege: 2.4, elite: 1.0 };
const ROWS = { inf: 5, arch: 4, cav: 4, siege: 2, elite: 5 };

/** Birliğin kapladığı yer: cephe genişliği `w`, derinlik `d`, sıra ve sütun sayısı, kabaca yarıçap. */
export function footprint(u) {
  const sp = SPACING[u.type] * (u.mounted ? 1.25 : 1);
  const n = Math.max(1, Math.ceil(u.men));
  const cols = Math.max(1, Math.min(n, Math.round(u.cols ?? Math.ceil(n / Math.min(ROWS[u.type], n)))));
  const rows = Math.ceil(n / cols);
  const w = cols * sp, d = rows * sp;
  return { w, d, r: Math.hypot(w, d) / 2, sp, rows, cols };
}

/** Birliğin dikdörtgeni: merkez, cephe yönü (ileri) ve yarı derinlik / yarı genişlik. */
function rect(u) {
  const f = footprint(u);
  return { x: u.x, y: u.y, fx: Math.cos(u.facing), fy: Math.sin(u.facing), hd: f.d / 2, hw: f.w / 2, r: f.r };
}

/** Bir noktanın birliğin yerel çerçevesindeki yeri: ileri (`lx`) ve yan (`ly`). */
function local(u, p) {
  const c = Math.cos(u.facing), s = Math.sin(u.facing), dx = p.x - u.x, dy = p.y - u.y;
  return { lx: dx * c + dy * s, ly: -dx * s + dy * c };
}

/** Bir nokta birliğin üstünde mi (`pad` kadar pay ile). */
export function inside(u, p, pad = 0) {
  const f = footprint(u), q = local(u, p);
  return Math.abs(q.lx) <= f.d / 2 + pad && Math.abs(q.ly) <= f.w / 2 + pad;
}

/**
 * İki dikdörtgen arası (ayırma eksenleriyle): `gap` > 0 aralarındaki boşluk (kabaca), < 0 iç içelik; `axis`
 * A'dan B'ye itme yönü.
 */
function gapOf(A, B) {
  let best = -Infinity, axis = null;
  for (const [ax, ay] of [[A.fx, A.fy], [-A.fy, A.fx], [B.fx, B.fy], [-B.fy, B.fx]]) {
    const rA = A.hd * Math.abs(A.fx * ax + A.fy * ay) + A.hw * Math.abs(-A.fy * ax + A.fx * ay);
    const rB = B.hd * Math.abs(B.fx * ax + B.fy * ay) + B.hw * Math.abs(-B.fy * ax + B.fx * ay);
    const c = (B.x - A.x) * ax + (B.y - A.y) * ay;
    const g = Math.abs(c) - rA - rB;
    if (g > best) { best = g; axis = c < 0 ? [-ax, -ay] : [ax, ay]; }
  }
  return { gap: best, axis };
}

/** Bir birliğin x ve y boyunca yarı uzunluğu (dönüşüyle). */
export function extent(u) {
  const f = footprint(u), c = Math.abs(Math.cos(u.facing)), s = Math.abs(Math.sin(u.facing));
  return { x: c * f.d / 2 + s * f.w / 2, y: s * f.d / 2 + c * f.w / 2 };
}

/**
 * Savaşı kur. `att`, `def`: moves.js sides / fieldSides'ın tarafları ({ civ, inf, arch, ..., gen, vet,
 * terrain, mods }); `walls`: null | "city" | "castle". Dönen savaş durumu.
 */
export function setupBattle(att, def, walls, seed = 1, field = null) {
  const muls = sideMuls(att, def, walls), open = sideMuls(att, def, null);
  // Surlu savaş: sahada şehir yoksa (düz saha, testler) sağ ortaya bir şehir; gedikler sahayı değiştirir, kopyası.
  if (walls) {
    field = field ? { ...field, kind: field.kind.slice() } : flatField();
    if (!field.city) addCity(field, walls, K().w * 0.68, K().h / 2);
  }
  const b = {
    t: 0, over: null, walls, seed, field: field ?? flatField(), rand: rng(seed), units: [], shots: [], fx: [], touch: new Map(), nextId: 1, gaps: [],
    sides: { att: { civ: att.civ, muls: muls.att, open: muls.att, gen: !!att.gen }, def: { civ: def.civ, muls: muls.def, open: open.def, gen: !!def.gen } },
  };
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
        const u = {
          id: b.nextId++, side, type, ...p, men, start: men, cols: Math.ceil(men / Math.min(ROWS[type], men)),
          morale: 100 + (s.gen ? 10 : 0), moraleMax: 100 + (s.gen ? 10 : 0), x: 0, y: 0, facing: side === "att" ? 0 : Math.PI,
          order: null, cool: b.rand() * K().volley.every, engaged: false, routed: false, gone: false, dead: false, wasMoving: false,
          inside: side === "def",
        };
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
    const room = C && side === "def" ? C.y1 - C.y0 - 2 : h * 0.92;
    const g2 = Math.max(0.5, Math.min(gap, (room - total) / Math.max(1, list.length - 1)));
    let y = cy - (total + g2 * (list.length - 1)) / 2;
    const top = y;
    list.forEach((u, i) => {
      u.x = mirror(x);
      u.y = Math.max(footprint(u).w / 2 + 1, Math.min(h - footprint(u).w / 2 - 1, y + widths[i] / 2));
      y += widths[i] + g2;
    });
    return [top, y - g2];
  };
  // Savunan surlu şehrin içinde: hattı batı surunun 5 birim gerisinde (aynalı x).
  const C = b.walls ? b.field.city : null;
  const front = C && side === "def" ? w - (C.x0 + 5) : 20;
  const mid = C && side === "def" ? C.cy : h / 2;
  const [top, bottom] = line(g.front ?? [], front, mid);
  line(g.arch ?? [], front - 8, mid);
  // Atlılar: hattın üst ve alt ucunun ötesinde; yer yoksa okçuların arkasına.
  const cav = g.cav ?? [];
  const up = cav.filter((_, i) => i % 2 === 0), down = cav.filter((_, i) => i % 2 === 1);
  const span = (list) => list.reduce((s, u) => s + footprint(u).w + gap, 0);
  if (C && side === "def") {
    // Şehrin içinde atlılar ortada yedek.
    line(cav, w - C.cx - 4, C.cy);
  } else if (top - gap - span(up) >= 0 && bottom + gap + span(down) <= h) {
    line(up, front - 2, top - gap - span(up) / 2);
    line(down, front - 2, bottom + gap + span(down) / 2);
  } else {
    line(up, front - 15, h * 0.25);
    line(down, front - 15, h * 0.75);
  }
  line(g.siege ?? [], front - 15, h / 2);
  for (let pass = 0; pass < 4; pass++) separate(b, 1, true);
  // Su ya da ev üstüne düşen birlik en yakın yürünebilir yere (önce yanlara, sonra geriye).
  for (const u of b.units.filter((v) => v.side === side)) {
    const C2 = b.walls && side === "def" ? b.field.city : null;
    if (passable(b.field, u.x, u.y) && (!C2 || insideCity(C2, u))) continue;
    let best = null;
    for (let d = 1; d < 40 && !best; d += 1) {
      for (const [dx, dy] of [[0, d], [0, -d], [side === "att" ? -d : d, 0], [side === "att" ? d : -d, 0], [d, d], [-d, d], [d, -d], [-d, -d]]) {
        const x = u.x + dx, y = u.y + dy;
        const okC = !C2 || (x > C2.x0 + 2 && x < C2.x1 - 2 && y > C2.y0 + 2 && y < C2.y1 - 2);
        if (x > 1 && y > 1 && x < w - 1 && y < h - 1 && okC && passable(b.field, x, y)) { best = { x, y }; break; }
      }
    }
    if (best) Object.assign(u, best);
  }
}

const alive = (u) => !u.dead && !u.gone;
const fighting = (u) => alive(u) && !u.routed && u.type !== "siege";
const foes = (b, u) => b.units.filter((v) => v.side !== u.side && alive(v) && !v.routed);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const unitById = (b, id) => b.units.find((v) => v.id === id);
/** Açı farkı, -π..π. */
const angleTo = (from, to) => ((to - from + Math.PI * 3) % PI2) - Math.PI;
/** Yavaşça dön: en çok `rate` radyan. */
function turn(u, to, rate) {
  const d = angleTo(u.facing, to);
  u.facing += Math.max(-rate, Math.min(rate, d));
}

// ---- emirler ----

/** Emir ver: bir yere yürü (`{ x, y, facing?, cols? }`) ya da bir düşman birliğine saldır (`{ unit: id }`). */
export function command(b, ids, target) {
  for (const id of ids) {
    const u = unitById(b, id);
    if (!u || !alive(u) || u.routed) continue;
    if (target.unit) u.order = { unit: target.unit };
    else {
      u.order = { x: Math.max(1, Math.min(K().w - 1, target.x)), y: Math.max(1, Math.min(K().h - 1, target.y)), facing: target.facing ?? null };
      if (target.cols) u.cols = Math.max(1, Math.min(Math.ceil(u.men), target.cols));
    }
    u.manual = true;
  }
}

/**
 * Hat çiz (sağ sürükleme): seçili birlikler `p0`-`p1` çizgisine yan yana, hattın uzunluğunu askerleri
 * oranında paylaşarak, cepheleri çizgide ve düşmana dönük dizilir. Dönen: her birliğin hedefi (önizleme
 * ve emir için) - [{ id, x, y, facing, cols }].
 */
export function planLine(b, ids, p0, p1) {
  const us = ids.map((id) => unitById(b, id)).filter((u) => u && alive(u) && !u.routed);
  if (!us.length) return [];
  const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  // Cephe yönü: çizgiye dik, düşmanın ortasına doğru.
  const en = b.units.filter((v) => v.side !== us[0].side && alive(v) && !v.routed);
  const ex = en.length ? en.reduce((s, v) => s + v.x, 0) / en.length : (us[0].side === "att" ? K().w : 0);
  const ey = en.length ? en.reduce((s, v) => s + v.y, 0) / en.length : K().h / 2;
  let nx = -uy, ny = ux;
  if ((ex - (p0.x + p1.x) / 2) * nx + (ey - (p0.y + p1.y) / 2) * ny < 0) { nx = -nx; ny = -ny; }
  const facing = Math.atan2(ny, nx);
  // Çizgi boyunca sırala: birlikler birbirinin yolunu kesmesin.
  us.sort((a, c) => (a.x - p0.x) * ux + (a.y - p0.y) * uy - ((c.x - p0.x) * ux + (c.y - p0.y) * uy));
  const total = us.reduce((s, u) => s + u.men, 0), gap = us.length > 1 ? 1 : 0;
  const free = Math.max(1, len - gap * (us.length - 1));
  let at = 0;
  return us.map((u) => {
    const share = (free * u.men) / total;
    const sp = footprint(u).sp;
    const cols = Math.max(Math.min(2, Math.ceil(u.men)), Math.min(Math.ceil(u.men), Math.round(share / sp)));
    const d = Math.ceil(u.men / cols) * sp;
    const mid = at + share / 2;
    at += share + gap;
    // Cephe çizgide: merkez derinliğin yarısı kadar geride.
    return { id: u.id, x: p0.x + ux * mid - nx * d / 2, y: p0.y + uy * mid - ny * d / 2, facing, cols };
  });
}

/** Hat çizimini uygula. */
export function orderLine(b, ids, p0, p1) {
  for (const t of planLine(b, ids, p0, p1)) command(b, [t.id], t);
}

/** Birliği ikiye böl: iki yarısı cephe boyunca yan yana. Dönen yeni yarı (ya da bölünemiyorsa null). */
export function split(b, id) {
  const u = unitById(b, id);
  if (!u || !alive(u) || u.routed || u.men < K().minSplit * 2) return null;
  const half = Math.floor(u.men / 2);
  const v = { ...u, id: b.nextId++, men: u.men - half, start: Math.max(1, Math.round((u.start * (u.men - half)) / u.men)), order: null, manual: false, hit: new Set(u.hit ?? []) };
  u.start = Math.max(1, u.start - v.start);
  u.men = half;
  u.cols = v.cols = Math.max(1, Math.ceil(u.cols / 2));
  const off = footprint(u).w / 2 + 0.6, lx = -Math.sin(u.facing), ly = Math.cos(u.facing);
  u.x -= lx * off; u.y -= ly * off;
  v.x += lx * off; v.y += ly * off;
  u.order = null;
  b.units.splice(b.units.indexOf(u) + 1, 0, v);
  return v;
}

/** Aynı türden birlikleri birleştir (ilkinde toplanır; çok uzaktakiler katılmaz). Dönen: kalan birlik. */
export function merge(b, ids) {
  const us = ids.map((id) => unitById(b, id)).filter((u) => u && alive(u) && !u.routed);
  const head = us[0];
  if (!head) return null;
  const rest = us.slice(1).filter((u) => u.type === head.type && u.side === head.side && dist(u, head) <= K().mergeReach);
  if (!rest.length) return null;
  const all = [head, ...rest], men = all.reduce((s, u) => s + u.men, 0);
  head.x = all.reduce((s, u) => s + u.x * u.men, 0) / men;
  head.y = all.reduce((s, u) => s + u.y * u.men, 0) / men;
  head.morale = all.reduce((s, u) => s + u.morale * u.men, 0) / men;
  head.start = all.reduce((s, u) => s + u.start, 0);
  head.cols = all.reduce((s, u) => s + footprint(u).cols, 0);
  head.men = men;
  head.order = null;
  b.units = b.units.filter((u) => !rest.includes(u));
  return head;
}

/** Diziliş: `+1` daha geniş (cephe uzar, derinlik azalır), `-1` daha derin. */
export function reshape(b, ids, dir) {
  for (const id of ids) {
    const u = unitById(b, id);
    if (!u || !alive(u) || u.routed) continue;
    const c = footprint(u).cols, n = Math.ceil(u.men);
    u.cols = dir > 0 ? Math.min(n, Math.max(c + 1, Math.round(c * 1.5))) : Math.max(Math.min(2, n), Math.min(c - 1, Math.round(c / 1.5)));
  }
}

// ---- çarpışma ----

/**
 * Düşmanla değer ama iç içe geçmez; dost birlikler birbirinin içinden geçer (kullanıcı 27.10: "takılıyorlar,
 * iç içe geçebilirler") - yalnız dizilirken (`friends`) açılırlar.
 */
function separate(b, k, friends = false) {
  const us = b.units.filter(alive);
  const R = us.map(rect);
  for (let i = 0; i < us.length; i++) {
    for (let j = i + 1; j < us.length; j++) {
      const a = us[i], c = us[j];
      if (dist(a, c) > R[i].r + R[j].r) continue;
      const foe = a.side !== c.side && !a.routed && !c.routed;
      if (!foe && !friends) continue;
      // Surun iki yanındakiler birbirini itmez (sur aralarında).
      if (foe && b.walls && a.inside !== c.inside && !gapAt(b, a) && !gapAt(b, c)) continue;
      const g = gapOf(R[i], R[j]);
      const want = foe ? -0.2 : 0.4;
      if (g.gap >= want) continue;
      const push = ((want - g.gap) / 2) * k;
      a.x -= g.axis[0] * push; a.y -= g.axis[1] * push;
      c.x += g.axis[0] * push; c.y += g.axis[1] * push;
      R[i].x = a.x; R[i].y = a.y; R[j].x = c.x; R[j].y = c.y;
    }
  }
}

/** Her birliğin değdiği düşmanlar (göğüs göğüse), bu adım için. */
function contactMap(b) {
  const m = new Map();
  const us = b.units.filter((u) => alive(u) && !u.routed);
  const R = new Map(us.map((u) => [u, rect(u)]));
  for (const u of us) m.set(u, []);
  for (let i = 0; i < us.length; i++) {
    for (let j = i + 1; j < us.length; j++) {
      const a = us[i], c = us[j];
      if (a.side === c.side) continue;
      const A = R.get(a), C = R.get(c);
      if (dist(a, c) > A.r + C.r + K().reach) continue;
      if (gapOf(A, C).gap > K().reach) continue;
      if (b.field.obstacles && waterBetween(b.field, a, c)) continue;
      if (b.walls && a.inside !== c.inside && !gapAt(b, a) && !gapAt(b, c)) continue;
      m.get(a).push(c);
      m.get(c).push(a);
    }
  }
  return m;
}
const contacts = (b, u) => b.touch.get(u) ?? [];

/** Bu nokta bir gediğin önünde mi (yan boyunca gediğin içinde, sura 6 birimden yakın). */
export const gapAt = (b, p) => b.gaps.some((g) => {
  const along = g.nx ? Math.abs(p.y - g.y) : Math.abs(p.x - g.x), across = g.nx ? Math.abs(p.x - g.x) : Math.abs(p.y - g.y);
  return along < g.half && across < 6;
});

/**
 * Birliğin çarpanları. Sur bonusu (`wall`) yalnız surdakinin işine: merdivenden tırmananı düşürmek ve surdan
 * ok atmak. Göğüs göğüse dövüşte sur bonusu yok - surun avantajı tırmanmanın darboğazı (ikisi birden iki kez
 * saymak olurdu: saldıran otomatik savaştakinin yarısı kadar kazanıyordu).
 */
const mulsOf = (b, u, wall = false) => (wall && u.side === "def" && b.walls && u.inside && wallPoint(b.field.city, u).d < K().climb.wallZone ? b.sides.def.muls : b.sides[u.side].open);

/** `u`, `v`ye hangi yüzünden vuruyor: "front", "flank", "rear" (v'nin dikdörtgenine göre). */
export function faceOf(v, u) {
  const f = footprint(v), q = local(v, u);
  const outX = Math.abs(q.lx) - f.d / 2, outY = Math.abs(q.ly) - f.w / 2;
  if (outY > outX) return "flank";
  return q.lx >= 0 ? "front" : "rear";
}

// ---- bilgisayar ----

/** Bilgisayarın emirleri (düşman tarafı; ya da Otomatik'te oyuncunun tarafı). Elle emir verilmiş birliğe dokunmaz. */
export function aiOrders(b, side, all = false) {
  // Sura saldıran bilgisayar: tırmanacak birlikler önce surun önünde toplanır, hepsi gelince birlikte saldırır
  // (tek tek varıp merdivende kırılmasınlar).
  const T = K(), C = b.walls ? b.field.city : null;
  const plan = C && side === "att" ? siegePlan(b) : null;
  // Bir birliğin surdaki yeri (planındaki yan ve oran) ve oraya göre dışarıdaki duruş noktası.
  const post = (u, out) => {
    const q = sidePoint(C, plan.get(u.id).side, plan.get(u.id).t), ex = Math.abs(q.nx) * extent(u).x + Math.abs(q.ny) * extent(u).y;
    return { x: Math.max(2, Math.min(T.w - 2, q.x + q.nx * (out + ex))), y: Math.max(2, Math.min(T.h - 2, q.y + q.ny * (out + ex))), facing: Math.atan2(-q.ny, -q.nx) };
  };
  if (plan && !b.assault) {
    const climbers = b.units.filter((v) => plan.has(v.id) && alive(v) && !v.routed && !v.inside);
    if (!climbers.length || climbers.every((v) => dist(v, post(v, T.climb.stage)) < 4) || b.t > T.climb.wait) b.assault = true;
  }
  for (const u of b.units.filter((v) => v.side === side && alive(v) && !v.routed)) {
    if (u.manual && !all) continue;
    // Sura saldıran: önce planındaki yanın önünde toplanır, sonra o yerde sura dayanır (dört yandan, sur boyunca).
    if (plan?.has(u.id) && !u.inside && !gapAt(b, u)) {
      u.order = post(u, b.assault ? 0.2 : T.climb.stage);
      continue;
    }
    const en = foes(b, u);
    if (!en.length) { u.order = null; continue; }
    const near = (list) => list.reduce((m, v) => (!m || dist(u, v) < dist(u, m) ? v : m), null);
    const nearest = near(en);
    // Surun ardındaki savunan: içeri girenlere saldırır; tırmanan varsa (okçu değilse) en yakın merdivenin
    // dibine koşar; yoksa yerinden kıpırdamaz, düşman yaklaşınca karşılar.
    if (b.walls && side === "def" && u.inside) {
      const inner = en.filter((v) => v.inside);
      const ladders = b.units.filter((v) => v.side !== side && alive(v) && !v.routed && v.climbing);
      if (inner.length && (u.kind !== "arch" || dist(u, near(inner)) < K().volley.range)) { u.order = u.kind === "arch" ? null : { unit: near(inner).id }; continue; }
      if (ladders.length && u.kind !== "arch") {
        const l = near(ladders).ladder ?? wallPoint(C, near(ladders));
        const ex = Math.abs(l.nx) * extent(u).x + Math.abs(l.ny) * extent(u).y;
        u.order = { x: l.x - l.nx * (ex + 0.5), y: l.y - l.ny * (ex + 0.5) };
        continue;
      }
      if (dist(u, nearest) > K().hold) { u.order = null; continue; }
    }
    if (u.type === "siege") {
      // Kuşatma makinesi sura dayanır (gedik açar); sursuz savaşta yerinde.
      u.order = plan?.has(u.id) && !u.inside ? post(u, 0.6) : null;
      continue;
    }
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

// ---- adım ----

/** Savaşı `dt` saniye ilerlet. */
export function step(b, dt) {
  if (b.over) return;
  b.t += dt;
  const T = K(), F = b.field;
  for (const u of b.units) { u.px = u.x; u.py = u.y; }
  // 1. Yürüyüş (dövüşmeyen, bozulmamış birlikler emirlerine; bozulanlar kendi kenarına). Dövüşen birlik
  // yerinden kıpırdamaz, en çok vurduğu düşmana yavaşça döner (sarılan birlik arkasını hemen toplayamaz).
  for (const u of b.units.filter(alive)) {
    const cs = u.routed ? [] : contacts(b, u);
    u.engaged = cs.length > 0;
    let goal = null;
    if (u.routed) goal = { x: u.side === "att" ? -6 : T.w + 6, y: u.y };
    else if (!u.engaged && u.order) {
      if (u.order.unit) {
        const t = unitById(b, u.order.unit);
        if (!t || !alive(t) || t.routed) { u.order = null; u.manual = false; }
        else if (u.shoot > 0 && u.charge < 1 && dist(u, t) <= T.volley.range * 0.9) goal = null; // atıcı menzilde durur
        else goal = t;
      } else goal = u.order;
    }
    u.wasMoving = false;
    if (goal) {
      const d = dist(u, goal);
      // Arazi: engel varsa yol (köprüyü bulur), ormanda ve yokuşta yavaş.
      let aim = goal;
      if (F.obstacles && !(u.routed && b.walls)) {
        const key = `${Math.round(goal.x / 2)},${Math.round(goal.y / 2)}`;
        if (u.pathKey !== key || b.t - (u.pathAt ?? -9) > 1.5) { u.path = pathOn(F, u, goal, u.mounted || u.type === "cav"); u.pathKey = key; u.pathAt = b.t; }
        while (u.path.length > 1 && dist(u, u.path[0]) < 1.2) u.path.shift();
        aim = u.path[0] ?? goal;
      }
      const ground = kindAt(F, u.x, u.y) === FOREST ? (u.mounted || u.type === "cav" ? T.terrain.forestMounted : T.terrain.forest) : 1;
      const sp = u.speed * (u.routed ? 1.15 : 1) * ground * (1 - T.terrain.hillSlow * heightAt(F, u.x, u.y)) * dt;
      if (d > 0.3) {
        // Uzaktaysa yürüdüğü yöne, varmak üzereyken (ya da yanına kayarken) emredilen cepheye döner.
        const da = dist(u, aim) || 1;
        const to = goal.facing != null && d < 4 ? goal.facing : Math.atan2(aim.y - u.y, aim.x - u.x);
        turn(u, to, (u.routed ? 6 : T.turn.march) * dt);
        const k = Math.min(1, sp / da);
        const nx = u.x + (aim.x - u.x) * k, ny = u.y + (aim.y - u.y) * k;
        if (passable(F, nx, ny) || (u.routed && kindAt(F, nx, ny) === WALL)) { u.x = nx; u.y = ny; }
        else { u.pathAt = -9; }
        u.wasMoving = true;
      } else if (u.order && !u.order.unit) {
        if (u.order.facing != null) u.facing = u.order.facing;
        u.order = null;
        u.manual = false;
      }
    } else if (u.engaged) {
      const tgt = cs.find((v) => v.id === u.order?.unit) ?? cs[0];
      turn(u, Math.atan2(tgt.y - u.y, tgt.x - u.x), T.turn.fight * dt);
    } else if (!u.routed && !u.order) {
      // Duran birlik, yakına gelen düşmana yavaşça döner (uzaktakine değil: verilen cephe korunur).
      const n = foes(b, u).reduce((m, v) => (!m || dist(u, v) < dist(u, m) ? v : m), null);
      if (n && dist(u, n) < T.turn.near) turn(u, Math.atan2(n.y - u.y, n.x - u.x), T.turn.idle * dt);
    }
    if (u.routed && (u.x < -4 || u.x > T.w + 4)) u.gone = true;
    if (u.routed && b.walls) u.inside = insideCity(b.field.city, u);
  }
  separate(b, 0.5);
  if (b.walls) walls(b, dt);
  // İtilip suya ya da eve giren birlik eski yerine.
  if (F.obstacles) for (const u of b.units) if (alive(u) && !passable(F, u.x, u.y) && !(u.routed && kindAt(F, u.x, u.y) === WALL)) { u.x = u.px; u.y = u.py; }
  b.touch = contactMap(b);
  const sideMul = (v, u) => ({ front: 1, flank: T.flank.side, rear: T.flank.rear })[faceOf(v, u)];
  // Tepeden aşağı vuran güçlü, yokuş yukarı vuran zayıf.
  const hill = (u, v) => 1 + T.terrain.height * Math.max(-1, Math.min(1, heightAt(F, u.x, u.y) - heightAt(F, v.x, v.y)));
  // 2. Hücum: atlı birlik yeni değdiği düşmana dalar (okçuya tam, ötekine az; yandan ve arkadan daha
  // çok); falanks durdurur (önden).
  for (const u of b.units.filter((v) => alive(v) && !v.routed && v.charge > 0)) {
    for (const v of contacts(b, u)) {
      u.hit ??= new Set();
      if (u.hit.has(v.id) || (!u.wasMoving && u.engagedBefore)) continue;
      u.hit.add(v.id);
      const face = faceOf(v, u);
      const stop = v.stop > 0 && face === "front" ? (v.men / N.company) * v.stop : 0;
      const wood = kindAt(F, v.x, v.y) === FOREST || kindAt(F, u.x, u.y) === FOREST ? T.terrain.forestCharge : 1;
      const raw = (u.men / N.company) * N.charge * u.charge * T.charge * (v.kind === "arch" ? 1 : T.chargeOther) * mulsOf(b, u).power * sideMul(v, u) * wood * hill(u, v);
      const kills = Math.max(0, raw - stop * N.charge * T.charge);
      hurt(b, v, kills);
      v.morale -= kills > 0 ? T.morale.charge * (face === "front" ? 1 : 1.5) : 0;
      if (stop > 0) hurt(b, u, stop * T.charge * 2);
      b.fx.push({ kind: "charge", x: v.x, y: v.y, t: b.t });
    }
    u.engagedBefore = contacts(b, u).length > 0;
  }
  // 3. Göğüs göğüse: ön sıralar dövüşür (geniş hat çok askerle vurur); yandan ve arkadan vuran daha çok
  // öldürür; yandan ya da arkadan vurulan, birden çok düşmana değen birliğin morali hızla düşer.
  const dmg = new Map();
  for (const u of b.units.filter((v) => alive(v) && !v.routed)) {
    const cs = contacts(b, u);
    if (!cs.length) continue;
    const fighters = Math.min(u.men, footprint(u).cols * T.ranks);
    // Ormanda atlı zayıf.
    const wood = (u.mounted || u.type === "cav") && kindAt(F, u.x, u.y) === FOREST ? T.terrain.forestCav : 1;
    const out = fighters * u.melee * mulsOf(b, u).power * T.melee * wood * dt;
    const tgt = cs.find((v) => v.id === u.order?.unit) ?? cs[0];
    for (const v of cs) {
      const share = cs.length === 1 ? 1 : v === tgt ? 0.7 : 0.3 / (cs.length - 1);
      const face = faceOf(v, u);
      const wrap = face === "front" ? 1 + (Math.max(0, footprint(u).w - footprint(v).w) / footprint(u).w) * (T.flank.side - 1) * T.flank.wrap : 1;
      dmg.set(v, (dmg.get(v) ?? 0) + out * share * sideMul(v, u) * wrap * hill(u, v));
      if (face === "flank") v.morale -= T.morale.flanked * dt;
      if (face === "rear") v.morale -= T.morale.rear * dt;
    }
    if (cs.length >= 2) u.morale -= T.morale.flank * dt;
  }
  for (const [v, k] of dmg) hurt(b, v, k);
  // 4. Ok: atıcı (dövüşmüyorsa) menzildeki hedefine ya da en yakın düşmana atar; ok uçar, varınca düşürür.
  for (const u of b.units.filter((v) => alive(v) && !v.routed && v.shoot > 0)) {
    u.cool -= dt;
    if (u.cool > 0 || contacts(b, u).length) continue;
    const ordered = u.order?.unit ? unitById(b, u.order.unit) : null;
    const range = T.volley.range * (1 + T.terrain.hillRange * heightAt(F, u.x, u.y));
    const inRange = foes(b, u).filter((v) => dist(u, v) <= range);
    const t = ordered && inRange.includes(ordered) ? ordered : inRange.reduce((m, v) => (!m || dist(u, v) < dist(u, m) ? v : m), null);
    if (!t) continue;
    u.cool = T.volley.every * (0.9 + b.rand() * 0.2);
    const trees = kindAt(F, t.x, t.y) === FOREST ? T.terrain.forestArrow : 1;
    // Surun ardındaki savunan (surda ve evlerin arasında) oklardan korunur.
    const cover = b.walls && t.side === "def" && t.inside ? T.climb.cover : 1;
    const kills = (u.men / N.company) * N.volley * u.shoot * mulsOf(b, u, true).volley * T.volley.kill * trees * cover * (0.85 + b.rand() * 0.3);
    b.shots.push({ from: { x: u.x, y: u.y }, to: t.id, at: { x: t.x, y: t.y }, t0: b.t, t1: b.t + T.volley.flight, kills, side: u.side, n: Math.min(12, Math.ceil(u.men / 3)) });
  }
  for (const s of b.shots.filter((x) => x.t1 <= b.t)) {
    const v = unitById(b, s.to);
    if (v && alive(v)) { hurt(b, v, s.kills); v.morale -= T.morale.arrow; }
  }
  b.shots = b.shots.filter((x) => x.t1 > b.t);
  // 5. Moral: kayıp oranı (derin birlik daha dayanıklı, ince hat daha kırılgan), kuşatılma; dövüşmeyen
  // toparlanır. Biten bozulur, yakındaki dostlar sarsılır.
  for (const u of b.units.filter((v) => alive(v) && !v.routed)) {
    if (!u.engaged) u.morale = Math.min(u.moraleMax ?? 110, u.morale + T.morale.recover * dt);
    if (moraleOf(u) <= T.morale.rout || u.men < u.start * T.morale.floor) {
      u.routed = true;
      u.order = null;
      b.fx.push({ kind: "rout", x: u.x, y: u.y, t: b.t });
      // Yakındaki dostlar sarsılır - bozulan birliğin büyüklüğü oranında (tırmanıp içeride kırılan küçük
      // grup bütün orduyu bozmasın).
      const shake = T.morale.nearby * Math.min(1, u.start / T.morale.nearbyMen);
      for (const v of b.units.filter((x) => x.side === u.side && alive(x) && !x.routed && dist(x, u) < 15)) v.morale -= shake;
    }
  }
  b.fx = b.fx.filter((e) => b.t - e.t < 2);
  // 6. Bitti mi: bir tarafın dövüşen birliği kalmadıysa; süre dolduysa savunan kazanır.
  const left = (side) => b.units.some((u) => u.side === side && fighting(u));
  // Surlu yerde okçular şehri alamaz: gedik yokken saldıranın elinde yalnız okçu ve makine kaldıysa (içeride
  // kimse yoksa) hücum başarısız.
  const storm = !b.walls || b.gaps.length || b.units.some((u) => u.side === "att" && fighting(u) && (u.inside || u.kind !== "arch" || u.mounted));
  if (!left("def")) b.over = { winner: "att" };
  else if (!left("att") || !storm) b.over = { winner: "def", ...(left("att") ? { repelled: true } : {}) };
  else if (b.t >= (b.walls ? T.timeWalls : T.time)) b.over = { winner: "def", timeout: true };
}

/**
 * Sura saldırı planı (bilgisayar): tırmanacak her birliğe bir yan ve o yanda bir yer. Şehrin hizasındakiler
 * batı surundan, yukarıdakiler kuzeyden, aşağıdakiler güneyden (kullanıcının görselleri gibi dört yandan sarar);
 * bir yanın çoğu suysa ona en yakın kara yanı. Bir yandakiler sur boyunca eşit aralıkla.
 */
function siegePlan(b) {
  const C = b.field.city;
  const want = (v) => v.side === "att" && alive(v) && !v.routed && !v.inside && !v.from && (v.type === "siege" || v.kind !== "arch" || v.mounted);
  if (b.plan && [...b.units].every((v) => !want(v) || b.plan.has(v.id))) return b.plan;
  const land = ["W", "N", "S", "E"].filter((s) => wallShare(b.field, C, s) > 0.5);
  const pick = (s) => (land.includes(s) ? s : land[0] ?? "W");
  const plan = new Map(), bySide = {};
  for (const v of b.units.filter(want)) {
    const s = v.type === "siege" ? pick("W") : pick(v.y < C.y0 + 2 ? "N" : v.y > C.y1 - 2 ? "S" : "W");
    (bySide[s] ??= []).push(v);
  }
  for (const [s, list] of Object.entries(bySide)) {
    list.sort((a, c) => (s === "W" || s === "E" ? a.y - c.y : a.x - c.x));
    list.forEach((v, i) => plan.set(v.id, { side: s, t: 0.12 + (0.76 * (i + 0.5)) / list.length }));
  }
  b.plan = plan;
  return plan;
}

/**
 * Sur (kullanıcı 27.10: "surlara tırmanıyormuş gibi olsun, kaç kişi gelirse gelsin tek sıra geçebilmeli"; sonra
 * "şehirlerin surlarla etrafı çevrili"): şehir dört yanı surlu bir dikdörtgen (field.js addCity). Dışarıdakiler
 * surun dışında, içeridekiler içinde kalır; gedikten geçen tarafını değiştirir, bozulup kaçan surdan kaçar. Sura
 * dayanan saldıran birlik (okçu, emirle saldırmıyorsa tırmanmaz; makine tırmanmaz) en yakın sur noktasında
 * merdivenden tek sıra tırmanır: askerleri içeride ayrı bir birliğe geçer. Merdivenin dibindeki savunan
 * tırmananları düşürür. Sura dayanan kuşatma makinesi zamanla gedik açar.
 */
function walls(b, dt) {
  const T = K(), C = T.climb, W = b.field.city;
  for (const u of b.units.filter(alive)) {
    if (u.routed) continue;
    if (gapAt(b, u)) { u.inside = insideCity(W, u); continue; }
    const ex = extent(u), m = 0.4;
    if (u.inside) {
      u.x = Math.max(W.x0 + ex.x + m, Math.min(W.x1 - ex.x - m, u.x));
      u.y = Math.max(W.y0 + ex.y + m, Math.min(W.y1 - ex.y - m, u.y));
    } else if (u.x > W.x0 - ex.x - m && u.x < W.x1 + ex.x + m && u.y > W.y0 - ex.y - m && u.y < W.y1 + ex.y + m) {
      // Dışarıdaki surun içine girmesin: en az giren yandan dışarı.
      const pen = [[u.x - (W.x0 - ex.x - m), "x", W.x0 - ex.x - m], [W.x1 + ex.x + m - u.x, "x", W.x1 + ex.x + m], [u.y - (W.y0 - ex.y - m), "y", W.y0 - ex.y - m], [W.y1 + ex.y + m - u.y, "y", W.y1 + ex.y + m]];
      const [, ax, to] = pen.reduce((a, c) => (c[0] < a[0] ? c : a));
      u[ax] = to;
    }
  }
  for (const u of b.units.filter((v) => alive(v) && !v.routed && v.side === "att" && !v.inside)) {
    const q = wallPoint(W, u), ex = Math.abs(q.nx) * extent(u).x + Math.abs(q.ny) * extent(u).y;
    // Köşelerde merdiven kurulmaz.
    const atWall = q.d - ex <= 1.2 && q.t > 0.06 && q.t < 0.94 && wallAt(b.field, q) && !gapAt(b, u);
    // Makine: sura dayandıkça gedik açar.
    if (u.type === "siege") {
      if (!atWall) continue;
      u.ram = (u.ram ?? 0) + dt * (u.men / N.company);
      if (u.ram >= C.breach) {
        b.gaps.push({ x: q.x, y: q.y, nx: q.nx, ny: q.ny, half: C.gapHalf });
        openBreach(b.field, q, C.gapHalf);
        b.fx.push({ kind: "breach", x: q.x, y: q.y, t: b.t });
        u.ram = -Infinity;
      }
      continue;
    }
    // Atlı atından iner, tırmanır (içeride yaya, sura karşı yarı güçle - otomatik savaştaki gibi); okçu ancak
    // emirle saldırıyorsa tırmanır. Yalnız sura dayanıp duran, içerideki bir düşmana saldırmakla emredilen ya da
    // yürüdüğü yer surun dibi olan tırmanır - surun yanından geçen değil.
    const target = u.order?.unit ? unitById(b, u.order.unit) : null;
    const meant = !u.order || (target && target.inside) || (!u.order.unit && Math.hypot(u.order.x - u.x, u.order.y - u.y) < 2.5);
    const wants = meant && !(u.shoot > 0 && u.charge < 1 && !u.order?.unit && !u.mounted);
    u.climbing = atWall && wants;
    if (!u.climbing) continue;
    // Merdiven: surun en yakın noktasında; dibindeki savunanlar tırmananları düşürür.
    const L = { x: q.x, y: q.y, nx: q.nx, ny: q.ny };
    u.ladder = L;
    let repel = 0;
    for (const d of b.units) {
      if (d.side !== "def" || !fighting(d) || !d.inside || dist(d, L) > footprint(d).r + C.guard) continue;
      repel += Math.min(d.men, footprint(d).cols * T.ranks) * d.melee * mulsOf(b, d, true).power;
    }
    if (repel > 0) hurt(b, u, repel * T.melee * C.repel * dt);
    if (!alive(u)) continue;
    // Tek sıra: saniyede `rate` asker içeri.
    u.climbAcc = (u.climbAcc ?? 0) + C.rate * dt;
    const n = Math.min(Math.floor(u.climbAcc), Math.floor(u.men));
    if (n <= 0) continue;
    u.climbAcc -= n;
    let v = u.climbTo ? unitById(b, u.climbTo) : null;
    // Köprübaşı: yakındaki merdivenden çıkmış aynı türden grup varsa ona katılırlar.
    if (!v || !alive(v) || v.routed) v = b.units.find((x) => x.side === "att" && x.from && x.type === u.type && !!x.dismounted === (u.mounted || u.type === "cav") && alive(x) && !x.routed && x.inside && dist(x, L) < C.join) ?? null;
    if (!v || !alive(v) || v.routed) {
      const horse = u.mounted || u.type === "cav";
      v = {
        id: b.nextId++, side: "att", type: u.type, kind: horse ? "inf" : u.kind, elite: u.elite, mounted: false, speed: horse ? T.speed.inf : u.speed,
        melee: horse ? u.melee * N.cavWall : u.melee, shoot: horse ? 0 : u.shoot, charge: 0, stop: u.stop, dismounted: horse,
        men: 0, start: 0, cols: Math.max(2, Math.min(8, footprint(u).cols)), morale: u.morale, moraleMax: u.moraleMax,
        // Surun 2 birim içinde doğar (sur hücresinin üstünde değil); yürüyüş kontrolü için eski yeri de.
        x: Math.max(W.x0 + 2.5, Math.min(W.x1 - 2.5, L.x - L.nx * 2.5)), y: Math.max(W.y0 + 2.5, Math.min(W.y1 - 2.5, L.y - L.ny * 2.5)), facing: Math.atan2(-L.ny, -L.nx), ladder: L,
        order: u.order?.unit ? { unit: u.order.unit } : null, manual: u.manual, cool: 0, engaged: false, routed: false, gone: false, dead: false, wasMoving: false, inside: true, from: u.id,
      };
      v.px = v.x;
      v.py = v.y;
      b.units.push(v);
      u.climbTo = v.id;
    }
    const k = n * (u.start / Math.max(1e-6, u.men));
    u.men -= n; u.start -= k;
    v.men += n; v.start += k;
    u.climbed = (u.climbed ?? 0) + n; // ekran: bunlar ölmedi, tırmandı
    if (u.men < 0.5) { u.men = 0; u.gone = true; u.absorbed = true; }
  }
}

/** Birliğin kalan morali (kayıplar düşülmüş): 0 ve altı bozulma; derinlik kaybın etkisini değiştirir. */
export function moraleOf(u) {
  const rows = footprint(u).rows;
  // Surun üstünde tutunanlar (köprübaşı) dirençli: kaçacak yerleri yok.
  const depth = u.from ? K().climb.steady : rows >= 4 ? K().morale.deep : rows <= 2 ? K().morale.thin : 1;
  return u.morale - (1 - u.men / u.start) * 100 * K().morale.loss * depth;
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
