// Sadakat ve isyan (kurallar.md bölüm 12). Saf kurallar, DOM yok.
//
// Her yerleşimin 0-100 sadakati var. Başlangıçta herkes 100; alınan yer 20 ile başlar. Her tur:
//   + kendiliğinden yatışma, + garnizon (10 askere 1, en fazla 8)
//   - başkentten uzaklık (2 yoldan sonrası, yol başına 1.5, en fazla 8), - kıtlık
// 25'in altında isyan ihtimali doğar (her eksik puan %4). İsyancılar nüfusun dörtte biri:
// savunanlar onlardan güçlüyse ayaklanma bastırılır, değilse yer bağımsızlığına döner.
//
// Fethetmek böylece "saldır"dan ibaret değil: aldığın yeri tutmak için asker bırakmak, uzağa
// yayılırken bedel ödemek gerekiyor.

import { byId, neighbours } from "./graph.js";
import { capture, defenders } from "./moves.js";
import { N, UNITS } from "./numbers.js";
import { random } from "./rng.js";
import { men, placesOf } from "./state.js";
import { holds } from "./wonders.js";

const L = N.loyalty;

/** Bir medeniyetin başkenti: kendi asıl başkenti hâlâ elindeyse o, değilse en büyük yeri. */
export function seat(state, civ) {
  const mine = placesOf(state, civ);
  return mine.find((id) => byId[id].capital && byId[id].owner === civ)
    ?? mine.sort((a, b) => state.places[b].level - state.places[a].level || state.places[b].pop - state.places[a].pop)[0]
    ?? null;
}

/** Başkentten yol sayısı (sahiplik gözetmeden, harita üstünde). */
export function distances(from) {
  const d = { [from]: 0 };
  for (const q = [from]; q.length;) {
    const at = q.shift();
    for (const n of neighbours(at)) if (!(n in d)) { d[n] = d[at] + 1; q.push(n); }
  }
  return d;
}

/** Bir yerin bu turki sadakat değişimi ve parçaları (kart bunu gösteriyor). */
export function drift(state, id, starving = false, dist = null) {
  const pl = state.places[id];
  if (!dist) {
    const home = seat(state, pl.owner);
    dist = home ? distances(home) : {};
  }
  const far = Math.max(0, (dist[id] ?? 0) - 2);
  const parts = {
    settle: L.settle,
    garrison: Math.min(L.garrisonCap, men(defenders(state, id)) / L.perGarrison),
    far: -Math.min(L.farCap, far * L.far),
    famine: starving ? -L.famine : 0,
    // Sert bir generalin ordusu oradaysa halk hizaya gelir.
    general: state.armies.some((a) => a.at === id && a.owner === pl.owner && a.general?.traits.includes("stern")) ? 4 : 0,
    // Piramitleri tutan medeniyetin halkı huşu içinde.
    wonder: holds(state, pl.owner, "pyramids") ? N.wonders.pyramidsLoyalty : 0,
  };
  return { total: parts.settle + parts.garrison + parts.far + parts.famine + parts.general + parts.wonder, parts };
}

/** İsyancıların gücü: nüfusun dörtte biri. */
export const rebels = (state, id) => Math.round(state.places[id].pop * L.rebels);

/** Tur sonu: bir medeniyetin bütün yerlerinde sadakat ve isyan. Olayları `events`e ekler. */
export function tick(state, civ, starving, events) {
  const home = seat(state, civ);
  const dist = home ? distances(home) : {};
  for (const id of placesOf(state, civ)) {
    const pl = state.places[id];
    pl.loyalty = Math.max(0, Math.min(100, Math.round(pl.loyalty + drift(state, id, starving, dist).total)));
    if (pl.loyalty >= L.revolt) continue;
    if (random(state) >= (L.revolt - pl.loyalty) * L.revoltChance) continue;
    const r = rebels(state, id);
    const def = defenders(state, id);
    if (men(def) >= r) {
      // Bastırıldı: isyancıların yarısı kadar asker kaybı, ama sadakat biraz toparlanır.
      let loss = Math.ceil(r / 2);
      for (const t of UNITS) {
        const n = Math.min(pl[t], loss);
        pl[t] -= n;
        loss -= n;
      }
      pl.loyalty = Math.min(100, pl.loyalty + 10);
      events.push({ type: "riot", turn: state.turn, civ, place: id, rebels: r });
    } else {
      capture(state, id, null);
      pl.inf = r;
      events.push({ type: "revolt", turn: state.turn, civ, place: id, rebels: r, fallen: state.civs[civ].alive ? null : civ });
    }
  }
}
