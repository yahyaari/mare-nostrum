// Kronik (kurallar.md bölüm 21): oyunun tarihi. Her tur her medeniyetin yer ve asker sayısı
// (grafik için), ve önemli olayların yıllığı: kim neyi aldı, kim kime savaş açtı, kim çöktü,
// hangi harika el değiştirdi, oyuncunun görevleri.
//
// Kayıt küçük tutulur: tur başına iki kere yedi sayı, yıllık en fazla MAX satır (taşarsa önce
// oyuncuyu ilgilendirmeyen eski satırlar düşer).

import { CIVS } from "../data/world.js";
import { byId } from "./graph.js";
import { placesOf, strength } from "./state.js";

const MAX = 300;

/** Bu turun fotoğrafı: her medeniyetin yer ve asker sayısı. */
export function snapshot(state) {
  state.chronicle ??= { places: [], men: [] };
  state.chronicle.places.push(CIVS.map((c) => placesOf(state, c.id).length));
  state.chronicle.men.push(CIVS.map((c) => (state.civs[c.id].alive ? strength(state, c.id) : 0)));
}

/**
 * Olayları yıllığa yaz. Oyuncuyu ilgilendiren her şey; başkalarının arasındakilerden sadece
 * büyükleri (başkent ya da harika el değiştirmesi, savaş ve barış, çöküş).
 */
export function record(state, events) {
  state.annals ??= [];
  const me = state.player;
  const big = (id) => !!byId[id]?.capital;
  const add = (e) => state.annals.push({ t: state.turn, ...e });
  for (const e of events) {
    if (!e) continue;
    if ((e.type === "battle" && e.won) || e.type === "surrender") {
      const by = e.attacker ?? e.by, from = e.defender ?? e.from;
      if (by === me || from === me || big(e.place)) add({ k: "took", by, place: e.place, from: from ?? null });
    }
    if (e.fallen) add({ k: "fallen", civ: e.fallen });
    if (e.type === "war") add({ k: "war", by: e.by, on: e.on });
    if (e.type === "ally") add({ k: "ally", by: e.by, to: e.to });
    if (e.type === "peace") add({ k: "peace", by: e.by, to: e.to });
    if (e.type === "broke") add({ k: "broke", by: e.by, with: e.with });
  }
  // Taşarsa: önce oyuncuyu ilgilendirmeyen en eski satır düşer.
  while (state.annals.length > MAX) {
    const i = state.annals.findIndex((a) => ![a.by, a.from, a.on, a.to, a.with, a.civ].includes(me) && true);
    state.annals.splice(i >= 0 ? i : 0, 1);
  }
}
