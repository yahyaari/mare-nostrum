// Generaller (kurallar.md bölüm 14). Saf kurallar, DOM yok.
//
// Bir orduya para karşılığı general atanır. General savaştıkça tecrübe kazanır, seviye atlar
// (her seviye ordunun gücüne %6) ve 2. ile 4. seviyede bir özellik edinir. Ordusu yenilirse
// general de ölür - ordulara bağlanmanın bedeli bu.

import { N } from "./numbers.js";
import { random } from "./rng.js";
import { armyById } from "./state.js";
import { holds } from "./wonders.js";

// Tarihî adlar, medeniyete göre. Aynı medeniyette aynı ad iki kez kullanılmaz; liste biterse
// "II" eklenir.
export const NAMES = {
  rome: ["Scipio", "Fabius", "Marcellus", "Regulus", "Flaminius", "Aemilius", "Claudius", "Duilius", "Metellus", "Cato"],
  carthage: ["Hamilcar", "Hasdrubal", "Hanno", "Mago", "Himilco", "Bomilcar", "Carthalo", "Maharbal", "Gisco", "Adherbal"],
  egypt: ["Ptolemy", "Sosibius", "Agathocles", "Scopas", "Patroclus", "Callicrates", "Tlepolemus", "Andromachus", "Echecrates", "Philammon"],
  macedon: ["Antigonus", "Demetrius", "Craterus", "Perseus", "Alexander", "Cassander", "Taurion", "Leontius", "Apelles", "Philocles"],
  parthia: ["Arsaces", "Tiridates", "Mithridates", "Surena", "Vologases", "Phraates", "Artabanus", "Sinatruces", "Orodes", "Pacorus"],
  gaul: ["Brennus", "Bolgios", "Ambiorix", "Dumnorix", "Litaviccus", "Commius", "Cingetorix", "Indutiomarus", "Lutorius", "Leonnorius"],
  saka: ["Tomris", "Alp Er Tunga", "Skunkha", "Saulius", "Spargapises", "Ariapeithes", "Scylas", "Octamasades", "Idanthyrsus", "Ateas"],
};

export const TRAITS = ["siege", "swift", "tactician", "archer", "supply", "stern"];

/** Seviye için gereken toplam tecrübe: 1, 2, 3, 4, 5. seviye. */
export const XP = [0, 3, 7, 12, 18];

const G = () => N.generals;

export function appointInfo(state, armyId) {
  const a = armyById(state, armyId);
  let why = null;
  if (!a) why = "none";
  else if (a.general) why = "has";
  else if (state.civs[a.owner].money < G().cost) why = "money";
  return { cost: G().cost, why };
}

/** Orduya general ata. Dönen: general ya da null. */
export function appoint(state, armyId) {
  if (appointInfo(state, armyId).why) return null;
  const a = armyById(state, armyId);
  state.civs[a.owner].money -= G().cost;
  a.general = { name: freshName(state, a.owner), level: 1, xp: 0, traits: [] };
  return a.general;
}

function freshName(state, civ) {
  const used = new Set(state.armies.filter((x) => x.owner === civ && x.general).map((x) => x.general.name));
  state.fallenGenerals ??= {};
  for (const n of state.fallenGenerals[civ] ?? []) used.add(n);
  const pool = NAMES[civ] ?? ["Strategos"];
  const free = pool.filter((n) => !used.has(n));
  if (free.length) return free[Math.floor(random(state) * free.length)];
  return pool[Math.floor(random(state) * pool.length)] + " II";
}

/** Generalin savaş çarpanı: seviye başına %6, taktisyen ×1.1. */
export function might(gen) {
  if (!gen) return 1;
  return (1 + G().perLevel * (gen.level - 1)) * (gen.traits.includes("tactician") ? 1.1 : 1);
}

export const has = (gen, t) => !!gen && gen.traits.includes(t);

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
    if (gen.level === 2 || gen.level === 4) {
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

/** Bir yerdeki en iyi general (savunma için): o yerin sahibinin orada duran orduları arasından. */
export function bestAt(state, id, owner) {
  let best = null;
  for (const a of state.armies) {
    if (a.at !== id || a.owner !== owner || !a.general) continue;
    if (!best || might(a.general) > might(best)) best = a.general;
  }
  return best;
}
