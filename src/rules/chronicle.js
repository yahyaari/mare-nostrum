// Kronik (kurallar.md bölüm 21): oyunun tarihi. Her tur her medeniyetin yer ve asker sayısı
// (grafik için), ve önemli olayların yıllığı: kim neyi aldı, kim kime savaş açtı, kim çöktü,
// hangi harika el değiştirdi, oyuncunun görevleri.
//
// Kayıt küçük tutulur: tur başına iki kere yedi sayı, yıllık en fazla MAX satır (taşarsa önce
// oyuncuyu ilgilendirmeyen eski satırlar düşer).

import { CIVS, PLACES } from "../data/world.js";
import { scoreOf } from "./victory.js";
import { byId } from "./graph.js";
import { placesOf, strength } from "./state.js";
import { wonderAt } from "./wonders.js";

const MAX = 300;

/**
 * Bu turun fotoğrafı: her medeniyetin yer ve asker sayısı ve skoru; her yerleşimin sahibi (oyun
 * sonu özetindeki harita tekrarı için: yerleşim başına bir harf, medeniyetin sırası ya da "-").
 */
export function snapshot(state) {
  state.chronicle ??= { places: [], men: [] };
  state.chronicle.score ??= [];
  state.chronicle.owners ??= [];
  state.chronicle.places.push(CIVS.map((c) => placesOf(state, c.id).length));
  state.chronicle.men.push(CIVS.map((c) => (state.civs[c.id].alive ? strength(state, c.id) : 0)));
  state.chronicle.score.push(CIVS.map((c) => scoreOf(state, c.id).total));
  state.chronicle.owners.push(PLACES.map((p) => { const i = CIVS.findIndex((c) => c.id === state.places[p.id].owner); return i < 0 ? "-" : String(i); }).join(""));
}

/** Kayıttaki bir turun sahipleri: { yer: medeniyet | null }. */
export const ownersAt = (state, i) => {
  const row = state.chronicle?.owners?.[i];
  if (!row) return null;
  return Object.fromEntries(PLACES.map((p, k) => [p.id, row[k] === "-" ? null : CIVS[Number(row[k])].id]));
};

/**
 * Olayları yıllığa yaz. Oyuncuyu ilgilendiren her şey; başkalarının arasındakilerden sadece
 * büyükleri (başkent ya da harika el değiştirmesi, savaş ve barış, çöküş).
 */
export function record(state, events) {
  state.annals ??= [];
  const me = state.player;
  const big = (id) => byId[id]?.capital || !!wonderAt(id);
  const add = (e) => state.annals.push({ t: state.turn, ...e });
  for (const e of events) {
    if (!e) continue;
    if ((e.type === "battle" && e.won) || e.type === "surrender") {
      const by = e.attacker ?? e.by, from = e.defender ?? e.from;
      if (by === me || from === me || big(e.place)) add({ k: "took", by, place: e.place, from: from ?? null });
    }
    if (e.type === "revolt" && (e.civ === me || big(e.place))) add({ k: "revolt", place: e.place, from: e.civ });
    if (e.fallen) add({ k: "fallen", civ: e.fallen });
    if (e.type === "war") add({ k: "war", by: e.by, on: e.on });
    if (e.type === "ally") add({ k: "ally", by: e.by, to: e.to });
    if (e.type === "peace") add({ k: "peace", by: e.by, to: e.to });
    if (e.type === "broke") add({ k: "broke", by: e.by, with: e.with });
    if (e.type === "siege" && (e.by === me || e.defender === me)) add({ k: "siege", by: e.by, place: e.place });
    if (e.type === "mission" && e.ok) add({ k: "mission", m: { key: e.mission.key, place: e.mission.place, other: e.mission.other, need: e.mission.need, what: e.mission.what } });
  }
  // Taşarsa: önce oyuncuyu ilgilendirmeyen en eski satır düşer.
  while (state.annals.length > MAX) {
    const i = state.annals.findIndex((a) => ![a.by, a.from, a.on, a.to, a.with, a.civ].includes(me) && a.k !== "mission");
    state.annals.splice(i >= 0 ? i : 0, 1);
  }
}
