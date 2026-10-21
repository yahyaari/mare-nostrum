// Animasyon: kurallar anında uygulanır, ekran ise olanı sırayla gösterir. Ordular yol
// boyunca yürür, savaşan yerde kılıçlar çarpışır, el değiştiren yer yeni rengine geçer,
// tur değişince bir şerit geçer.
//
// Kurallar hamleleri `state.trace`e yazar (moves.js); burası o izden bir zaman çizelgesi
// kurar. Çizelge sürerken harita, durumun SON hâlini değil, çizelgenin o anını gösterir:
// yürüyen ordunun sancağı yolda, alınan şehir eski renginde - ta ki sıra ona gelene kadar.
//
// Hiçbir kuralı değiştirmez. Ekrana dokununca hepsi biter (`finish`).

import { colorOf } from "./kit.js";
import { roadBetween } from "../rules/graph.js";
import { alongRoad, placeAt } from "./draw.js";

export const LEG = 420; // bir yolu yürümek, ms
const CLASH = 700;
const MAX = 4500; // tur arası gösterinin en uzun hâli; aşarsa adımlar kısalır

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

const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

/**
 * Bir izden çizelge kur. Art arda gelen aynı medeniyetin hamleleri bir bölüm: bölümün bütün
 * orduları birlikte yürür, sonra sıradaki medeniyet. Ekranda görünmeyen bölüm beklemeden geçer.
 * Dönen: çizelgenin bittiği an.
 */
export function timeline(trace, start, visible, leg = LEG) {
  const build = (legMs, dry) => {
    const out = [];
    let cursor = start;
    for (const seg of segments(trace)) {
      const seen = seg.some((m) => m.path.some(visible));
      const L = seen ? legMs : 0, C = seen ? CLASH : 0;
      let end = cursor;
      for (const m of seg) {
        const legs = m.path.length - 1;
        const walk = legs * L;
        const dur = walk + (m.attack ? C : 0);
        out.push({ kind: "march", t0: cursor, dur: Math.max(dur, 1), leg: L, army: m.army, owner: m.owner, men: m.men, path: m.path, attack: m.attack });
        if (m.attack) {
          const at = m.path[legs];
          out.push({ kind: "clash", t0: cursor + walk - L * 0.15, dur: C, at });
          if (m.attack.won) {
            out.push({ kind: "repaint", t0: cursor + walk + C * 0.45, dur: seen ? 1100 : 1, at, from: m.attack.oldOwner, to: m.owner });
          }
        }
        end = Math.max(end, cursor + dur);
      }
      cursor = end + (seen ? 120 : 0);
    }
    if (!dry) add(...out);
    return cursor;
  };
  const end = build(leg, true);
  // Çok hamle varsa hepsi sığsın diye adımlar kısalır, ama yürüyüş görünmez olacak kadar değil.
  const legMs = end - start > MAX ? Math.max(160, leg * (MAX / (end - start))) : leg;
  return build(legMs, false);
}

/** İzi bölümlere ayırır: [[{ army, owner, men, path, attack }...], ...]. */
function segments(trace) {
  const out = [];
  let seg = null, owner = undefined;
  for (const e of trace) {
    if (e.owner !== owner) { seg = []; out.push(seg); owner = e.owner; }
    let m = seg.find((x) => x.army === e.army && x.path[x.path.length - 1] === e.from && !x.attack);
    if (!m) { m = { army: e.army, owner: e.owner, men: e.men, path: [e.from], attack: null }; seg.push(m); }
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
 * eski renginde, yürüyen ordular yolun üstünde, efektler listede.
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
      const legs = i.path.length - 1;
      const walk = legs * i.leg;
      const e = Math.max(0, t - i.t0);
      let pos, alpha = 1, sea = false;
      if (legs > 0 && e < walk) {
        const k = Math.min(legs - 1, Math.floor(e / i.leg));
        sea = !!roadBetween(i.path[k], i.path[k + 1])?.sea; // deniz yolunda: gemide
        // Saldırı yolunda hedefin içine girmez, kapısında durur.
        const stop = i.attack && k === legs - 1 ? 0.78 : 1;
        pos = alongRoad(i.path[k], i.path[k + 1], ease((e - k * i.leg) / i.leg) * stop);
      } else if (legs > 0 && i.attack) {
        pos = alongRoad(i.path[legs - 1], i.path[legs], i.attack.won ? 0.78 + 0.22 * Math.min(1, (e - walk) / (i.dur - walk)) : 0.78);
        if (!i.attack.won) alpha = Math.max(0, 1 - (e - walk) / (i.dur - walk));
      } else pos = placeAt(i.path[legs]);
      moving.push({ id: i.army, owner: i.owner, men: i.men, float: pos, alpha, at: null, sea });
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
