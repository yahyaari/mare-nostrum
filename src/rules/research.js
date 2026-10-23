// Araştırma ağacı (kurallar.md bölüm 23). Kullanıcı 23.10: "hâlâ bir oyun gibi hissettirmiyor",
// örnek Civilization; araştırma ağacı "evet, eklensin".
//
// Şehirlerin nüfusu bilim üretir (her `popPer` nüfus 1, başkent +`capital`). Medeniyet bir seferde
// bir teknoloji araştırır; bilim her tur ona akar, bitince etkisi o medeniyetin her yerinde hemen
// başlar. Araştırma seçilmemişken bilim boşa gitmez, birikir (`bank`) ve seçilince akar.
//
// Dört kol, dört çağ: her teknoloji kendi kolunda bir öncekini ister (bazıları komşu koldan da).
//   Toprak ve at:  Sulama -> Atçılık -> Taktik -> Strateji
//   Maden ve yapı: Bronz -> Demir -> Mühendislik -> Surculuk
//   Deniz:         Yelkencilik -> Limancılık -> Gemi inşası -> Seyir
//   Bilgi ve para: Yazı -> Para -> Matematik -> Tıp
//
// Etkiler:
//   mods   çarpanlar, millet özellikleri gibi (numbers.js TRAITS): üretimde wheat, weapons, money,
//          fish, trade, growth, build (yükseltme fiyatı), science; savaşta inf, arch, cav, all,
//          walls (savunanın suru), navy (filonun gücü).
//   unlock açtığı birim: cav (süvari), siege (kuşatma makinesi), quinq (kinkerem). Kışla, sanayi ve
//          tersane seviyesi yine gerekir.

import { PLACES } from "../data/world.js";
import { LEVELS, N, trait } from "./numbers.js";

export const TECHS = [
  { id: "irrigation", tier: 1, lane: 0, needs: [], mods: { wheat: 1.15 } },
  { id: "bronze", tier: 1, lane: 1, needs: [], mods: { weapons: 1.15 } },
  { id: "sailing", tier: 1, lane: 2, needs: [], mods: { fish: 1.3 } },
  { id: "writing", tier: 1, lane: 3, needs: [], mods: { science: 1.2 } },

  { id: "horseback", tier: 2, lane: 0, needs: ["irrigation"], unlock: "cav" },
  { id: "ironWorking", tier: 2, lane: 1, needs: ["bronze"], mods: { inf: 1.1 } },
  { id: "harbours", tier: 2, lane: 2, needs: ["sailing"], mods: { trade: 1.3 } },
  { id: "currency", tier: 2, lane: 3, needs: ["writing", "sailing"], mods: { money: 1.1 } },

  { id: "tactics", tier: 3, lane: 0, needs: ["horseback", "ironWorking"], mods: { arch: 1.15, cav: 1.15 } },
  { id: "engineering", tier: 3, lane: 1, needs: ["ironWorking"], unlock: "siege", mods: { build: 0.8 } },
  { id: "shipbuilding", tier: 3, lane: 2, needs: ["harbours"], unlock: "quinq" },
  { id: "mathematics", tier: 3, lane: 3, needs: ["currency"], mods: { science: 1.2 } },

  { id: "strategy", tier: 4, lane: 0, needs: ["tactics"], mods: { all: 1.1 } },
  { id: "fortification", tier: 4, lane: 1, needs: ["engineering"], mods: { walls: 1.2 } },
  { id: "navigation", tier: 4, lane: 2, needs: ["shipbuilding"], mods: { navy: 1.25 } },
  { id: "medicine", tier: 4, lane: 3, needs: ["mathematics"], mods: { growth: 1.2 } },
];
// Ekonomi etkileri ilk denemenin yarısı: tarla/silah +%25, balık/ticaret +%50, para +%15, bilim
// +%25, nüfus +%30 iken 70 oyunda ilk düşüş 49'dan 43'e indi, Partlar oyunların 36'sında en büyüğe
// çıktı (araştırmasız 23), Mısır 49'dan 37'ye düştü. Yarısıyla: ilk düşüş 48, Partlar 30, toplam
// ayakta kalan 339 (araştırmasız 328). Savaş etkilerini kapatmak ya da geniş ülke cezasını iki
// katına çıkarmak neredeyse hiç fark etmedi.

export const techById = Object.fromEntries(TECHS.map((t) => [t.id, t]));

/** Bir teknolojinin bedeli (bilim): çağına göre. */
export const costOf = (id) => N.research.cost[techById[id].tier - 1];

/** Bir medeniyet için bedeli: geniş ülke daha pahalı araştırır (`free` yerleşimden sonra her biri +`perPlace`). */
export function costFor(state, civ, id) {
  const n = Object.values(state.places).filter((p) => p.owner === civ).length;
  return Math.round(costOf(id) * (1 + N.research.perPlace * Math.max(0, n - N.research.free)));
}

/** Medeniyet bunu biliyor mu. Bağımsızlar (null) hiçbir şey bilmez. */
export const knows = (state, civ, id) => !!civ && !!state.civs[civ]?.techs?.includes(id);

/** Bilinen teknolojilerin bir çarpanı (ör. "wheat"): hepsinin çarpımı, yoksa 1. */
export function techMul(state, civ, key) {
  if (!civ) return 1;
  let m = 1;
  for (const id of state.civs[civ]?.techs ?? []) m *= techById[id].mods?.[key] ?? 1;
  return m;
}

/** Bir birim açık mı (`unlock` ile kilitliyse onu açan teknoloji biliniyor mu). */
export const unlocked = (state, civ, what) => TECHS.every((t) => t.unlock !== what || knows(state, civ, t.id));

/** Bir birimi açan teknoloji (yoksa null). */
export const unlockerOf = (what) => TECHS.find((t) => t.unlock === what)?.id ?? null;

const COMBAT = ["inf", "arch", "cav", "all", "walls", "navy"];
/** Savaş çarpanları, savaşın tarafına konur (combat.js): sadece 1'den farklı olanlar. */
export function modsOf(state, civ) {
  const out = {};
  for (const k of COMBAT) {
    const m = techMul(state, civ, k);
    if (m !== 1) out[k] = m;
  }
  return out;
}

/** Turluk bilim: nüfus ve başkent, millet ve araştırma çarpanlarıyla (bilgisayarda zorluğun üretimi). */
export function scienceOf(state, civ) {
  let n = 0;
  for (const p of PLACES) {
    const pl = state.places[p.id];
    if (pl.owner !== civ) continue;
    n += pl.pop / N.research.popPer + (p.capital ? N.research.capital : 0);
  }
  const ai = civ !== state.player ? (LEVELS[state.level] ?? LEVELS.normal).aiOutput : 1;
  return n * trait(civ, "science") * techMul(state, civ, "science") * ai;
}

/** Araştırılabilir mi: bilinmiyor ve istediklerinin hepsi biliniyor. */
export const canResearch = (state, civ, id) => !!techById[id] && !knows(state, civ, id) && techById[id].needs.every((n) => knows(state, civ, n));

/** Şu an araştırılabilenler. */
export const available = (state, civ) => TECHS.filter((t) => canResearch(state, civ, t.id)).map((t) => t.id);

/** Araştırılacak teknolojiyi seç (değiştirmek ilerlemeyi silmez). */
export function choose(state, civ, id) {
  if (!canResearch(state, civ, id)) return false;
  state.civs[civ].research = id;
  return true;
}

/** Bir teknoloji kaç turda biter (bu turun bilimiyle). */
export function turnsLeft(state, civ, id) {
  const c = state.civs[civ];
  const left = costFor(state, civ, id) - (c.progress?.[id] ?? 0) - (c.research === id || !c.research ? c.bank ?? 0 : 0);
  return Math.max(1, Math.ceil(left / Math.max(0.1, scienceOf(state, civ))));
}

/** Tur sonu: her medeniyetin bilimi araştırmasına akar; biten teknoloji olay olur. */
export function tickResearch(state, events) {
  for (const [civ, c] of Object.entries(state.civs)) {
    if (!c.alive) continue;
    c.bank = (c.bank ?? 0) + scienceOf(state, civ);
    if (!c.research) continue;
    const id = c.research;
    c.progress[id] = (c.progress[id] ?? 0) + c.bank;
    c.bank = 0;
    const cost = costFor(state, civ, id);
    if (c.progress[id] + 1e-9 < cost) continue;
    // Bitti: artan bilim birikir, sıradakine akar.
    c.bank = c.progress[id] - cost;
    delete c.progress[id];
    c.techs.push(id);
    c.research = null;
    events.push({ type: "tech", turn: state.turn, civ, tech: id });
  }
}

// Bilgisayarın sırası: önce üretim ve piyade, sonra süvari ve para; denizci medeniyet (filosu
// güçlü) deniz kolunu öne alır.
const ORDER = ["bronze", "irrigation", "writing", "ironWorking", "horseback", "sailing", "currency", "engineering", "tactics",
  "harbours", "mathematics", "fortification", "strategy", "shipbuilding", "medicine", "navigation"];
const SEA = ["sailing", "bronze", "harbours", "writing", "irrigation", "shipbuilding", "currency", "ironWorking", "navigation",
  "horseback", "engineering", "mathematics", "tactics", "fortification", "strategy", "medicine"];

/** Bilgisayar: araştırması yoksa sıradakini seçer. */
export function aiResearch(state, civ) {
  const c = state.civs[civ];
  if (c.research) return;
  const order = trait(civ, "navy") > 1 ? SEA : ORDER;
  const next = order.find((id) => canResearch(state, civ, id));
  if (next) c.research = next;
}

/** Bir medeniyete bir teknolojiyi istedikleriyle birlikte ver (eski kayıtlar ve testler için). */
export function grant(state, civ, id) {
  const c = state.civs[civ];
  for (const n of techById[id].needs) grant(state, civ, n);
  if (!c.techs.includes(id)) c.techs.push(id);
}
