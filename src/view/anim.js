// Animasyon: kurallar anında uygulanır, ekran ise olanı sırayla gösterir. Ordular yol
// boyunca yürür, savaşan yerde kılıçlar çarpışır, el değiştiren yer yeni rengine geçer,
// tur değişince bir şerit geçer.
//
// Kurallar hamleleri `state.trace`e yazar (moves.js); burası o izden bir zaman çizelgesi
// kurar. Çizelge sürerken harita, durumun SON hâlini değil, çizelgenin o anını gösterir:
// yürüyen ordunun sancağı yolda, alınan şehir eski renginde - ta ki sıra ona gelene kadar.
//
// Ordu yolun UZUNLUĞUNA göre yürür (kısa yol yarım saniye, uzun yol bir buçuk) ve arkasında
// yolda kendi renginde bir iz bırakır. İlk hâlinde her yol 0.4 saniyeydi, tur arasında da
// kısalıyordu: oyuncu "ordu ışınlanıyor" dedi.
//
// Hiçbir kuralı değiştirmez. Tur gösterisinde ilk dokunuş hızlandırır (`hurry`), ikincisi
// bitirir (`finish`).

import { colorOf } from "./kit.js";
import { roadBetween } from "../rules/graph.js";
import { alongRoad, placeAt, roadLength } from "./draw.js";

const PER_UNIT = 230; // harita biriminde yol başına ms ...
const LEG_MIN = 520; // ... ama en kısa yol bile bu kadar sürer ...
const LEG_MAX = 1500; // ... ve en uzunu bu kadar.
const CLASH = 700;
const MAX = 6000; // rakiplerin hamleleri en fazla bu kadar sürsün; aşarsa onlar hızlanır

let fixed = null;
/** Animasyonun saati. Araçlar belirli bir anın fotoğrafını çekmek için dondurabilir. */
export const clock = () => fixed ?? performance.now();
export const freeze = (t) => { fixed = t; };

let items = [];

export function add(...xs) { items.push(...xs); }
export function finish() { items = []; }
export function busy() {
  const t = clock();
  items = items.filter((i) => i.t0 + i.dur > t);
  return items.length > 0;
}
export const endsAt = () => items.reduce((m, i) => Math.max(m, i.t0 + i.dur), clock());

/**
 * Kalan her şeyi `k` kat hızlandır: başlamamışlar öne çekilir, süren animasyon kaldığı
 * yerden hızlanır (atlamaz).
 */
export function hurry(k = 4) {
  const t = clock();
  for (const i of items) {
    if (i.t0 >= t) {
      i.t0 = t + (i.t0 - t) / k;
    } else {
      const done = t - i.t0;
      i.t0 = t - done / k;
    }
    i.dur /= k;
    if (i.legs) i.legs = i.legs.map((x) => x / k);
  }
}

const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

/** Bir yolu yürümenin süresi: uzunluğuyla orantılı, sınırlar içinde. */
export const legTime = (a, b) => Math.max(LEG_MIN, Math.min(LEG_MAX, roadLength(a, b) * PER_UNIT));

/**
 * Bir izden çizelge kur. Art arda gelen aynı medeniyetin hamleleri bir bölüm: bölümün bütün
 * orduları birlikte yürür, sonra sıradaki medeniyet. Ekranda görünmeyen bölüm beklemeden geçer.
 * `own`: oyuncunun medeniyeti - onun yürüyüşü hiç kısalmaz ve ekran dışında da oynar.
 * Dönen: çizelgenin bittiği an.
 */
export function timeline(trace, start, visible, own = null) {
  const build = (scale, dry) => {
    const out = [];
    let cursor = start;
    for (const seg of segments(trace)) {
      const mine = seg[0]?.owner === own;
      const seen = mine || seg.some((m) => m.path.some(visible));
      const k = mine ? 1 : scale;
      let end = cursor;
      for (const m of seg) {
        const legs = m.path.slice(1).map((to, j) => (seen ? legTime(m.path[j], to) * k : 0));
        const walk = legs.reduce((a, b) => a + b, 0);
        const C = seen ? CLASH : 0;
        const dur = walk + (m.attack ? C : 0);
        out.push({ kind: "march", t0: cursor, dur: Math.max(dur, 1), legs, army: m.army, owner: m.owner, men: m.men, ships: m.ships, path: m.path, attack: m.attack });
        if (m.attack) {
          const at = m.path[m.path.length - 1];
          const last = legs[legs.length - 1] ?? 0;
          out.push({ kind: "clash", t0: cursor + walk - last * 0.15, dur: C, at });
          if (m.attack.won) {
            out.push({ kind: "repaint", t0: cursor + walk + C * 0.45, dur: seen ? 1100 : 1, at, from: m.attack.oldOwner, to: m.owner });
          }
        }
        end = Math.max(end, cursor + dur);
      }
      cursor = end + (seen ? 150 : 0);
    }
    if (!dry) add(...out);
    return cursor;
  };
  // Rakiplerin hamleleri çoksa onlar hızlanır (oyuncununki asla), ama yürüyüş görünür kalır.
  const end = build(1, true);
  const scale = end - start > MAX ? Math.max(0.35, MAX / (end - start)) : 1;
  return build(scale, false);
}

/** İzi bölümlere ayırır: [[{ army, owner, men, path, attack }...], ...]. */
function segments(trace) {
  const out = [];
  let seg = null, owner = undefined;
  for (const e of trace) {
    if (e.owner !== owner) { seg = []; out.push(seg); owner = e.owner; }
    let m = seg.find((x) => x.army === e.army && x.path[x.path.length - 1] === e.from && !x.attack);
    if (!m) { m = { army: e.army, owner: e.owner, men: e.men, ships: e.ships ?? 0, path: [e.from], attack: null }; seg.push(m); }
    m.path.push(e.to);
    if (e.type === "attack") m.attack = { won: e.won, oldOwner: e.oldOwner };
  }
  return out;
}

/** Bir yerin üstünden yükselen yazı. */
export function rise(at, text, color, delay = 0, size = 14) {
  add({ kind: "float", t0: clock() + delay, dur: 1400, at, text, color, size });
}

/** Ekranın bir noktasından yükselen yazı (üst banttaki kaynaklar). */
export function riseAt(screen, text, color, delay = 0) {
  add({ kind: "float", t0: clock() + delay, dur: 1600, screen, text, color, size: 15 });
}

export function pulse(at, color, delay = 0) {
  add({ kind: "repaint", t0: clock() + delay, dur: 900, at, from: undefined, to: null, color, small: true });
}

export function banner(text, sub, delay = 0) {
  add({ kind: "banner", t0: clock() + delay, dur: 1500, text, sub });
}

/**
 * Haritanın görünümünü çizelgenin bu anına göre ayarla: henüz sırası gelmemiş alınan yerler
 * eski renginde, yürüyen ordular yolun üstünde (arkalarında izleriyle), efektler listede.
 */
export function shape(view) {
  const t = clock();
  const owners = { ...view.owners };
  const hidden = new Set();
  const moving = [];
  const fx = [];
  for (const i of items) {
    const p = (t - i.t0) / i.dur;
    if (i.kind === "repaint") {
      if (t < i.t0 && i.from !== undefined) owners[i.at] = i.from;
      else if (p >= 0 && p < 1) fx.push({ kind: "pulse", at: i.at, p, color: i.color ?? colorOf(i.to), big: !i.small });
    } else if (i.kind === "march") {
      if (p >= 1) continue;
      hidden.add(i.army);
      const n = i.path.length - 1;
      const walk = i.legs.reduce((a, b) => a + b, 0);
      const e = Math.max(0, t - i.t0);
      let pos, alpha = 1, sea = false, walking = false, dir = 1;
      // Hangi yöne gidiyor (kadırga o yöne baksın): yolun biraz ilerisi solda mı sağda mı.
      const heading = (a, b, f) => {
        const f0 = Math.min(f, 0.97);
        return alongRoad(a, b, f0 + 0.03).x < alongRoad(a, b, f0).x ? -1 : 1;
      };
      if (n > 0 && e < walk) {
        // Hangi yoldayız, ve o yolun ne kadarındayız.
        let k = 0, before = 0;
        while (k < n - 1 && e >= before + i.legs[k]) before += i.legs[k++];
        const f = ease(Math.min(1, (e - before) / (i.legs[k] || 1)));
        sea = !!roadBetween(i.path[k], i.path[k + 1])?.sea; // deniz yolunda: gemide
        // Saldırı yolunda hedefin içine girmez, kapısında durur.
        const stop = i.attack && k === n - 1 ? 0.78 : 1;
        pos = alongRoad(i.path[k], i.path[k + 1], f * stop);
        dir = heading(i.path[k], i.path[k + 1], f * stop);
        walking = e > 0;
        fx.push({ kind: "trail", path: i.path, k, f: f * stop, color: colorOf(i.owner), sea });
      } else if (n > 0 && i.attack) {
        // Kapıda çarpışırken: denizden geldiyse hâlâ gemide.
        sea = !!roadBetween(i.path[n - 1], i.path[n])?.sea;
        dir = heading(i.path[n - 1], i.path[n], 0.78);
        pos = alongRoad(i.path[n - 1], i.path[n], i.attack.won ? 0.78 + 0.22 * Math.min(1, (e - walk) / (i.dur - walk)) : 0.78);
        if (!i.attack.won) alpha = Math.max(0, 1 - (e - walk) / (i.dur - walk));
      } else pos = placeAt(i.path[n]);
      moving.push({ id: i.army, owner: i.owner, men: i.men, ships: i.ships ?? 0, float: pos, alpha, at: null, sea, walking, dir });
    } else if (p >= 0 && p < 1) {
      if (i.kind === "clash") fx.push({ kind: "clash", at: i.at, p });
      else if (i.kind === "float") fx.push({ kind: "float", at: i.at, screen: i.screen, p, text: i.text, color: i.color, size: i.size });
      else if (i.kind === "banner") fx.push({ kind: "banner", p, text: i.text, sub: i.sub });
    }
  }
  view.owners = owners;
  view.armies = [...(view.armies ?? []).filter((a) => !hidden.has(a.id)), ...moving];
  view.fx = fx;
  return view;
}
