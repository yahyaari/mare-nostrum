// Savaş sisi (kurallar.md bölüm 19): oyuncunun ne gördüğü. Kendi ve müttefiklerinin yerleşimleri
// ve orduları birer göz: çevrelerinde bir çember (yerleşim N.reach.sightPlace, ordu
// N.reach.sightArmy) açık. Ordu yürüdükçe sis onunla açılır (kullanıcı 22.10: "yürüdüğü yerlerde
// sisler açılsın"). Çemberin dışındaki ordular, filolar ve garnizonlar görünmez; yerleşimler ve
// sahipleri bilinir (haritalar herkesin elinde).
//
// Sadece ekran içindir: bilgisayar her şeyi görür (basitlik için, plan.md 2.7), kurallar sisi
// bilmez.

import { N } from "./numbers.js";
import { POS, dist } from "./map.js";
import { relation } from "./state.js";

/** Bu medeniyetin gözleri: [{ x, y, r }]. */
export function eyes(state, civ) {
  const friend = (o) => o === civ || (o && relation(state, civ, o) === "ally");
  const out = [];
  for (const [id, pl] of Object.entries(state.places)) if (friend(pl.owner)) out.push({ ...POS[id], r: N.reach.sightPlace });
  for (const a of state.armies) if (friend(a.owner) && !a.at) out.push({ x: a.x, y: a.y, r: N.reach.sightArmy });
  // Yerine varmış casus: o yerin içi ve kapısı görünür (spies.js).
  for (const s of state.spies ?? []) if (s.civ === civ && s.at) out.push({ ...POS[s.at], r: N.spy.eye });
  return out;
}

/** Bir nokta gözlerden birinin çemberinde mi. */
export const seen = (eyesList, pt) => eyesList.some((e) => dist(e, pt) <= e.r);

/** Bu medeniyetin gördüğü yerleşimler. */
export function sight(state, civ, list = eyes(state, civ)) {
  return new Set(Object.keys(state.places).filter((id) => seen(list, POS[id])));
}
