// Zafer yolları ve skor (kullanıcı 23.10: "ne için oynadığım belli değil"; Civilization gibi olsun,
// zafer yolları Fetih, Harikalar, Skor). Saf kurallar, DOM yok.
//
//   Fetih     - bütün rakipler yıkılır (eskiden tek zafer buydu).
//   Harikalar - 6 dünya harikasından N.victory.wonders tanesini N.victory.hold tur üst üste tutan
//               kazanır. Sayaç başlayınca herkes duyar; bilgisayarlar öndekinin üstüne gider.
//   Skor      - N.victory.turns. turun sonunda en yüksek skor kazanır.
// Bilgisayar da Harikalar ya da Skor zaferi kazanabilir: o zaman oyuncu kaybeder.
//
// Skor: toprak (yerleşim, seviyesi, başkent), nüfus, harikalar, ordu, kazanılan savaşlar.

import { CIVS } from "../data/world.js";
import { N } from "./numbers.js";
import { info, placesOf, strength } from "./state.js";
import { wondersOf } from "./wonders.js";

/** Bir medeniyetin skoru ve parçaları. Yıkılmış medeniyetin skoru 0. */
export function scoreOf(state, civ) {
  const S = N.score;
  if (!state.civs[civ]?.alive) return { total: 0, parts: { lands: 0, people: 0, wonders: 0, army: 0, wins: 0, techs: 0 } };
  const ids = placesOf(state, civ);
  const lands = ids.reduce((n, id) => n + S.place + state.places[id].level * S.level + (info(id).capital ? S.capital : 0), 0);
  const people = Math.floor(ids.reduce((n, id) => n + state.places[id].pop, 0) / S.popPer);
  const wonders = wondersOf(state, civ).length * S.wonder;
  const army = Math.floor(strength(state, civ) / S.armyPer);
  const wins = (state.wins?.[civ] ?? 0) * S.win;
  const techs = (state.civs[civ].techs?.length ?? 0) * S.tech;
  return { total: lands + people + wonders + army + wins + techs, parts: { lands, people, wonders, army, wins, techs } };
}

/** Bütün medeniyetler, skora göre büyükten küçüğe: [{ civ, total }]. */
export const ranking = (state) => CIVS.map((c) => ({ civ: c.id, total: scoreOf(state, c.id).total })).sort((a, b) => b.total - a.total);

/** Bir medeniyetin sırası (1 = birinci). */
export const rankOf = (state, civ) => ranking(state).findIndex((r) => r.civ === civ) + 1;

/** Kazanılan bir savaşı say (moves.js: yerleşim savaşı ve meydan muharebesi). */
export function countWin(state, civ) {
  if (!civ) return;
  state.wins ??= {};
  state.wins[civ] = (state.wins[civ] ?? 0) + 1;
}

/** Harikalar zaferine kaç tur kaldı (sayacı yoksa null). */
export function wonderTurnsLeft(state, civ) {
  const n = state.wonderHold?.[civ];
  return n ? N.victory.hold - n : null;
}

/**
 * Tur sonu: harika sayaçları. N.victory.wonders harikayı tutanın sayacı bir artar; düşenin sayacı
 * sıfırlanır. Başlayan ve biten sayaç haber olur.
 */
export function tickVictory(state, events = []) {
  state.wonderHold ??= {};
  for (const c of CIVS) {
    const civ = c.id;
    const n = state.civs[civ].alive ? wondersOf(state, civ).length : 0;
    const was = state.wonderHold[civ] ?? 0;
    if (n >= N.victory.wonders) {
      state.wonderHold[civ] = was + 1;
      if (!was) events.push({ type: "wonderRace", turn: state.turn, civ, left: N.victory.hold });
    } else if (was) {
      delete state.wonderHold[civ];
      events.push({ type: "wonderLost", turn: state.turn, civ });
    }
  }
  return events;
}

/**
 * Oyun bitti mi: { result: "won" | "lost", turn, kind: "conquest" | "wonders" | "score" | "fallen",
 * winner }. Oyuncu yerlerinin hepsini kaybettiyse ya da başkası Harikalar / Skor zaferi
 * kazandıysa kaybeder.
 */
export function overOf(state) {
  const me = state.player;
  const end = (winner, kind) => ({ result: winner === me ? "won" : "lost", turn: state.turn, kind, winner });
  if (!placesOf(state, me).length) return { result: "lost", turn: state.turn, kind: "fallen", winner: null };
  if (CIVS.every((c) => c.id === me || !state.civs[c.id].alive)) return end(me, "conquest");
  const racer = CIVS.find((c) => (state.wonderHold?.[c.id] ?? 0) >= N.victory.hold);
  if (racer) return end(racer.id, "wonders");
  if (state.turn > N.victory.turns) return end(ranking(state)[0].civ, "score");
  return null;
}
