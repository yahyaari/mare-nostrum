// Generaller (kurallar.md bölüm 14, 14b). Saf kurallar, DOM yok.
//
// Bir orduya para karşılığı general atanır. General savaştıkça tecrübe kazanır, seviye atlar
// (her seviye ordunun gücüne %6) ve 2. ile 4. seviyede bir özellik edinir (en çok üç). Ordusu yenilirse
// general de ölür - ordulara bağlanmanın bedeli bu.
//
// Şehirde yetişen komutanlar (14b): şehirlerde kendiliğinden, rastgele yetişirler - şehrin binalarına ve
// arazisine göre: ormanlık yerden okçu ustası, ovadan süvari ustası, kışlası büyük şehirden piyade ustası,
// tapınaklı şehirden ilham veren... Akademi yetişme ihtimalini ve rütbesini artırır. Yetişen komutan
// şehrinde bekler (şehri savunur), bir orduya bedava atanır.

import { PLACES, ROADS, CIVS } from "../data/world.js";
import { TREES } from "../data/trees.js";
import { byId } from "./graph.js";
import { isMountain, rings } from "./map.js";
import { N, trait } from "./numbers.js";
import { random } from "./rng.js";
import { armyById, besieged, placesOf } from "./state.js";
import { holds } from "./wonders.js";

// Tarihî adlar, medeniyete göre. Aynı medeniyette aynı ad iki kez kullanılmaz; liste biterse
// "II" eklenir.
export const NAMES = {
  rome: ["Paullus", "Fabius", "Marcellus", "Regulus", "Flaminius", "Aemilius", "Claudius", "Duilius", "Metellus", "Cato"],
  carthage: ["Hamilcar", "Hasdrubal", "Hanno", "Mago", "Himilco", "Bomilcar", "Carthalo", "Maharbal", "Gisco", "Adherbal"],
  egypt: ["Ptolemy", "Sosibius", "Agathocles", "Scopas", "Patroclus", "Callicrates", "Tlepolemus", "Andromachus", "Echecrates", "Philammon"],
  macedon: ["Antigonus", "Demetrius", "Craterus", "Perseus", "Polyperchon", "Cassander", "Taurion", "Leontius", "Apelles", "Philocles"],
  parthia: ["Arsaces", "Tiridates", "Gotarzes", "Surena", "Vologases", "Phraates", "Artabanus", "Sinatruces", "Orodes", "Pacorus"],
  gaul: ["Brennus", "Bolgios", "Ambiorix", "Dumnorix", "Litaviccus", "Commius", "Cingetorix", "Indutiomarus", "Lutorius", "Leonnorius"],
  saka: ["Madyes", "Alp Er Tunga", "Skunkha", "Saulius", "Spargapises", "Ariapeithes", "Scylas", "Octamasades", "Idanthyrsus", "Ateas"],
};

export const TRAITS = ["siege", "swift", "tactician", "archer", "supply", "stern", "cavalry", "infantry", "inspiring", "admiral"];

/** Seviye için gereken toplam tecrübe: 1, 2, 3, 4, 5. seviye. */
export const XP = [0, 3, 7, 12, 18];

const G = () => N.generals;

/**
 * Orduya general atanabilir mi. `officer`: bekleyen bir komutanın numarası (bedava); yoksa para karşılığı
 * (yeteneksiz, 1. seviye). Dönen: { cost, why }.
 */
export function appointInfo(state, armyId, officer = null) {
  const a = armyById(state, armyId);
  const o = officer != null && a ? (state.civs[a.owner].officers ?? []).find((x) => x.id === officer) : null;
  let why = null;
  if (!a) why = "none";
  else if (a.general) why = "has";
  else if (officer != null && !o) why = "none";
  else if (!o && state.civs[a.owner].money < G().cost) why = "money";
  return { cost: o ? 0 : G().cost, why };
}

/** Orduya general ata: bekleyen komutanı (`officer`) ya da parayla yenisini. Dönen: general ya da null. */
export function appoint(state, armyId, officer = null) {
  if (appointInfo(state, armyId, officer).why) return null;
  const a = armyById(state, armyId);
  const civ = state.civs[a.owner];
  if (officer != null) {
    const o = civ.officers.find((x) => x.id === officer);
    civ.officers = civ.officers.filter((x) => x !== o);
    a.general = { name: o.name, level: o.level, xp: o.xp, traits: [...o.traits], from: o.from };
    return a.general;
  }
  civ.money -= G().cost;
  a.general = { name: freshName(state, a.owner), level: 1, xp: 0, traits: [] };
  return a.general;
}

function freshName(state, civ, roll = () => random(state)) {
  const used = new Set(state.armies.filter((x) => x.owner === civ && x.general).map((x) => x.general.name));
  for (const o of state.civs[civ]?.officers ?? []) used.add(o.name);
  state.fallenGenerals ??= {};
  for (const n of state.fallenGenerals[civ] ?? []) used.add(n);
  const pool = NAMES[civ] ?? ["Strategos"];
  const free = pool.filter((n) => !used.has(n));
  if (free.length) return free[Math.floor(roll() * free.length)];
  return pool[Math.floor(roll() * pool.length)] + " II";
}

/** Generalin savaş çarpanı: seviye başına %6, taktisyen ×1.1. */
export function might(gen) {
  if (!gen) return 1;
  return (1 + G().perLevel * (gen.level - 1)) * (gen.traits.includes("tactician") ? 1.1 : 1);
}

export const has = (gen, t) => !!gen?.traits?.includes(t);

/**
 * Savaştan sonra tecrübe. Seviye atlarsa ve 2. ya da 4. seviyeye geldiyse yeni bir özellik.
 * Dönen: { up: yeni seviye | null, trait: kazanılan özellik | null }.
 */
export function learn(state, gen, won, owner = null) {
  if (!gen) return { up: null, trait: null };
  // Parthenon'u tutanın generalleri iki kat öğrenir.
  gen.xp += (won ? G().xpWin : G().xpLoss) * (holds(state, owner, "parthenon") ? N.wonders.parthenonXp : 1);
  let up = null, trait = null;
  while (gen.level < XP.length && gen.xp >= XP[gen.level]) {
    gen.level += 1;
    up = gen.level;
    // Şehirde yetişen komutan yeteneğiyle doğar: en çok üç yetenek.
    if ((gen.level === 2 || gen.level === 4) && gen.traits.length < 3) {
      const options = TRAITS.filter((t) => !gen.traits.includes(t));
      trait = options[Math.floor(random(state) * options.length)];
      gen.traits.push(trait);
    }
  }
  return { up, trait };
}

/** General öldü: adı bir daha kullanılmasın. */
export function bury(state, civ, gen) {
  if (!gen) return;
  state.fallenGenerals ??= {};
  (state.fallenGenerals[civ] ??= []).push(gen.name);
}

/** Bir yerdeki en iyi general (savunma için): o yerin sahibinin orada duran orduları ve orada bekleyen komutanları arasından. */
export function bestAt(state, id, owner) {
  let best = null;
  const take = (g) => { if (!best || might(g) > might(best)) best = g; };
  for (const a of state.armies) if (a.at === id && a.owner === owner && a.general) take(a.general);
  for (const o of (owner && state.civs[owner]?.officers) || []) if (o.at === id) take(o);
  return best;
}

// ---- şehirde yetişen komutanlar (bölüm 14b) ----

const O = () => N.officers;
let FEATURES = null;

/**
 * Yerleşimlerin arazisi (bir kere hesaplanır): çevresindeki orman (0..1, ağaç noktaları), dağ (0..1, dağlık
 * hücrelerin payı), açık ova (ikisi de yoksa), kaç yol çıkıyor.
 */
export function features() {
  if (FEATURES) return FEATURES;
  FEATURES = {};
  const near = rings(3);
  for (const p of PLACES) {
    let trees = 0;
    const k = Math.cos((p.lat * Math.PI) / 180);
    for (let i = 0; i < TREES.length; i += 2) {
      const dx = (TREES[i] / 100 - p.lon) * k, dy = TREES[i + 1] / 100 - p.lat;
      if (dx * dx + dy * dy < 0.64) trees++;
    }
    const cells = near.of[p.id];
    const forest = Math.min(1, trees / 20), mountain = Math.min(1, cells.filter(isMountain).length / Math.max(1, cells.length) / 0.12);
    FEATURES[p.id] = { forest, mountain, open: (1 - forest) * (1 - mountain) * (p.port ? 0.6 : 1), roads: ROADS.filter((r) => r.a === p.id || r.b === p.id).length };
  }
  return FEATURES;
}

/**
 * Bu şehirde yetişecek komutanın yeteneklere yatkınlığı (ağırlık): binaları, arazisi ve medeniyetinin
 * askerleri. Ormanlık yer okçu, ova ve atlı millet süvari, büyük kışla ve piyadesi güçlü millet piyade ustası;
 * sanayi kuşatma, okul ve akademi taktisyen, pazar ve tarla iaşeci, tapınak ilham veren, kale ve dağ sert,
 * yol kavşağı hızlı, tersane amiral yetiştirir.
 */
export function leanings(state, id) {
  const pl = state.places[id], p = byId[id], f = features()[id], c = pl.owner;
  const lv = (k) => pl[k] ?? 0;
  return {
    infantry: 1 + Math.max(0, lv("barracks") - 1) * 0.8 + (trait(c, "inf") > 1 ? 2 : 0),
    archer: 0.8 + f.forest * 4 + (trait(c, "arch") > 1 ? 2 : 0),
    cavalry: 0.8 + f.open * 2.5 + (lv("barracks") >= 3 ? 1.5 : 0) + (trait(c, "cav") > 1 ? 2.5 : 0),
    siege: 0.6 + Math.max(0, lv("industry") - 2) * 1,
    swift: 0.6 + Math.max(0, f.roads - 2) * 0.8,
    tactician: 0.6 + (lv("school") + lv("academy")) * 0.5,
    supply: 0.6 + lv("market") * 0.6 + Math.max(0, lv("farms") - 2) * 0.3,
    stern: 0.6 + (p.kind === "castle" ? 2 : 0) + f.mountain * 2,
    inspiring: 0.6 + lv("temple") * 0.8,
    admiral: p.port ? 0.6 + lv("shipyard") * 0.8 : 0,
  };
}

/** Bu şehirde bir turda komutan yetişme ihtimali. */
export function chanceOf(state, id) {
  const pl = state.places[id];
  const raw = O().chance + Math.max(0, pl.level - 1) * O().perLevel + (pl.school ?? 0) * O().school + (pl.academy ?? 0) * O().academy;
  return raw * (byId[id].kind === "castle" ? O().castle : 1);
}

/** Medeniyetin komutan tavanı: temel + her birkaç yer için bir (+1 büyük bir akademi varsa), bir sınırla. */
export function capOf(state, civ) {
  const own = placesOf(state, civ), C = O().cap;
  const big = own.some((id) => (state.places[id].academy ?? 0) >= C.academy) ? 1 : 0;
  return Math.min(C.max, C.base + Math.floor(own.length / C.perPlaces) + big);
}

/** Medeniyetin komutanları: ordulardakiler ve şehirlerde bekleyenler. */
export const generalsOf = (state, civ) => state.armies.filter((a) => a.owner === civ && a.general).length + (state.civs[civ].officers?.length ?? 0);

/** Ağırlıklara göre `n` farklı yetenek. */
function draw(weights, n, roll) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const opts = Object.entries(weights).filter(([t, w]) => w > 0 && !out.includes(t));
    const total = opts.reduce((s, [, w]) => s + w, 0);
    let r = roll() * total;
    for (const [t, w] of opts) { r -= w; if (r <= 0) { out.push(t); break; } }
    if (out.length === k) out.push(opts.at(-1)[0]);
  }
  return out;
}

/**
 * Tur sonunda: şehirlerde komutan yetişir mi (her şehir kendi ihtimaliyle, medeniyetin tavanına kadar); el
 * değiştiren şehirde bekleyen komutan medeniyetin başka bir yerine kaçar (yeri kalmadıysa ölür). Zar kendi
 * sayacından (state.orng): komutan yetişsin yetişmesin dünyanın zarları aynı kalır.
 */
export function raiseOfficers(state, events) {
  const box = { rng: (state.orng ??= (state.rng ^ 0x27d4eb2f) | 0 || 11) };
  const roll = () => random(box);
  for (const c of CIVS) {
    const cs = state.civs[c.id];
    cs.officers ??= [];
    if (!cs.alive) { for (const o of cs.officers) bury(state, c.id, o); cs.officers = []; continue; }
    const own = placesOf(state, c.id);
    for (const o of cs.officers.filter((x) => state.places[x.at]?.owner !== c.id)) {
      const to = own.find((id) => byId[id].capital) ?? own[0];
      if (to) o.at = to;
      else { bury(state, c.id, o); cs.officers = cs.officers.filter((x) => x !== o); }
    }
    if (state.turn < O().from) continue;
    for (const id of own) {
      if (generalsOf(state, c.id) >= capOf(state, c.id)) break;
      if (besieged(state, id) || roll() >= chanceOf(state, id)) continue;
      const pl = state.places[id], ac = pl.academy ?? 0;
      const level = 1 + (ac >= 3 ? 1 : 0) + (ac >= 5 ? 1 : 0);
      const o = { id: (cs.nextOfficer = (cs.nextOfficer ?? 0) + 1), name: freshName(state, c.id, roll), level, xp: XP[level - 1], traits: draw(leanings(state, id), ac >= O().second ? 2 : 1, roll), from: id, at: id };
      cs.officers.push(o);
      events?.push({ type: "officer", turn: state.turn, civ: c.id, place: id, name: o.name, level: o.level, traits: o.traits });
    }
  }
  state.orng = box.rng;
}

/**
 * Bir orduya en uygun bekleyen komutan: yetenekleri ordunun askerine ne kadar uyuyorsa (atlısı çok orduya süvari
 * ustası), seviyesi; eşitlikte ordunun durduğu şehirde bekleyen. Yoksa null.
 */
export function officerFor(state, army) {
  const list = state.civs[army.owner]?.officers ?? [];
  if (!list.length) return null;
  const n = (k) => army[k] ?? 0, total = Math.max(1, ["inf", "arch", "cav", "siege", "elite"].reduce((s, k) => s + n(k), 0));
  const fit = { infantry: n("inf") / total, archer: n("arch") / total, cavalry: n("cav") / total, siege: n("siege") > 0 ? 0.5 : 0, admiral: (army.ships ?? 0) + (army.trireme ?? 0) + (army.quinq ?? 0) > 0 ? 0.5 : 0 };
  const score = (o) => o.level + o.traits.reduce((s, t) => s + (fit[t] ?? 0.3), 0) + (o.at === army.at ? 0.05 : 0);
  return list.reduce((b, o) => (!b || score(o) > score(b) ? o : b), null);
}
