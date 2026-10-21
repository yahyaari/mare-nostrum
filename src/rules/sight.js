// Savaş sisi (kurallar.md bölüm 19): oyuncunun ne gördüğü. Kendi ve müttefiklerinin yerleri ve
// orduları, artı bunların bir yol ötesi. Ötesindeki ordular, filolar ve garnizonlar görünmez;
// yerleşimler ve sahipleri bilinir (haritalar herkesin elinde).
//
// Sadece ekran içindir: bilgisayar her şeyi görür (basitlik için, plan.md 2.7), kurallar sisi
// bilmez.

import { neighbours } from "./graph.js";
import { relation } from "./state.js";

/** Bu medeniyetin gördüğü yerleşimler. */
export function sight(state, civ) {
  const friend = (o) => o === civ || (o && relation(state, civ, o) === "ally");
  const eyes = new Set();
  for (const [id, pl] of Object.entries(state.places)) if (friend(pl.owner)) eyes.add(id);
  for (const a of state.armies) if (friend(a.owner)) eyes.add(a.at);
  const seen = new Set(eyes);
  for (const id of eyes) for (const n of neighbours(id)) seen.add(n);
  return seen;
}
