// Oyuncuya saldırılar (kurallar.md bölüm 29c). Kullanıcı 27.10: "biri benim kaleme saldırdığında bildirim
// gelsin; simüle et ya da savaş desin, savaş dersem gideyim kaledeki birlikleri ben yöneteyim".
//
// Bilgisayarın ya da barbar akıncılarının oyuncunun yerine ya da ordusuna saldırısı hemen çözülmez: saldıran
// kapıda (ordunun önünde) durur, saldırı \`state.incoming\`e yazılır. Oyuncunun turu başlarken her biri sorulur:
// sonucu gör (otomatik savaş) ya da savaş (taktik savaş, oyuncu savunur); sonuç aynı kurallardan (moves.js
// attack / strike, barbarians.js raid) - taktik savaştaysa hazır sonuçla. Yalnız gerçek oyunda (\`state.defer\`,
// main.js açar) ve tek oyunculu oyunda; bot oyunları ve testler eskisi gibi hemen çözer.

import { attack, canAttack, canStrike, fieldSides, mpMax, sides, strike } from "./moves.js";
import { armyById, humansOf, isHuman } from "./state.js";
import { raidOn } from "./barbarians.js";

/** Bu saldırı ertelenir mi: gerçek oyun, tek oyuncu, hedefin sahibi oyuncu. */
const deferrable = (state, owner) => !!state.defer && !!owner && isHuman(state, owner) && humansOf(state).length === 1;

/**
 * Bilgisayarın saldırısını ertele (ai.js go): \`target\` { kind: "place" | "army", id }. Ertelendiyse true; ordu
 * olduğu yerde, hareketsiz bekler.
 */
export function deferAttack(state, a, target) {
  const owner = target.kind === "place" ? state.places[target.id].owner : armyById(state, target.id)?.owner;
  if (!deferrable(state, owner)) return false;
  state.incoming ??= [];
  if (!state.incoming.some((x) => x.from === a.id)) state.incoming.push({ id: (state.nextItem = (state.nextItem ?? 0) + 1), from: a.id, by: a.owner, to: owner, kind: target.kind, target: target.id, turn: state.turn });
  a.mp = 0;
  a.route = [];
  return true;
}

/** Barbar akıncılarının saldırısını ertele (barbarians.js). */
export function deferRaid(state, r, place) {
  const owner = state.places[place].owner;
  if (!deferrable(state, owner)) return false;
  state.incoming ??= [];
  if (!state.incoming.some((x) => x.from === r.id)) state.incoming.push({ id: (state.nextItem = (state.nextItem ?? 0) + 1), from: r.id, by: null, to: owner, kind: "raid", target: place, turn: state.turn });
  return true;
}

/** Bir oyuncunun bekleyen saldırıları (geçersizleşenler atlanır: saldıran yok olduysa, hedef el değiştirdiyse). */
export function incomingFor(state, civ) {
  state.incoming = (state.incoming ?? []).filter((it) => valid(state, it));
  return state.incoming.filter((it) => it.to === civ);
}

function valid(state, it) {
  const a = armyById(state, it.from);
  if (!a) return false;
  if (it.kind === "army") { const b = armyById(state, it.target); return !!b && b.owner === it.to && !b.at; }
  return state.places[it.target]?.owner === it.to;
}

/**
 * Savaşın iki tarafı (pencere ve taktik savaş için): { att, def, walls, sea, attacker, place, field } -
 * moves.js sides / fieldSides'ın sayıları.
 */
export function incomingSides(state, it) {
  const a = armyById(state, it.from);
  if (it.kind === "army") {
    const b = armyById(state, it.target);
    return { ...fieldSides(state, a, b), walls: null, sea: false, attacker: a, target: b, field: true };
  }
  const sd = sides(state, a, a.owner, it.target);
  return { ...sd, attacker: a, place: it.target, field: false };
}

/**
 * Saldırıyı çöz: \`result\` taktik savaşın hazır sonucu (yoksa otomatik savaş). Dönen savaş olayı (\`incoming\`
 * işaretli) ya da null (saldırı geçersizleştiyse).
 */
export function resolveIncoming(state, it, result = null, luck = null) {
  state.incoming = (state.incoming ?? []).filter((x) => x.id !== it.id);
  if (!valid(state, it)) return null;
  const a = armyById(state, it.from);
  let ev = null;
  if (it.kind === "raid") ev = raidOn(state, a, it.target, result);
  else {
    // Saldıran kapıda bekledi: saldırabilmesi için hareketi geri gelir (saldırı onu yine sıfırlar).
    a.mp = Math.max(a.mp, mpMax(a));
    if (it.kind === "place" && canAttack(state, a, it.target)) ev = attack(state, a.id, it.target, luck, result);
    else if (it.kind === "army") { const b = armyById(state, it.target); if (canStrike(state, a, b)) ev = strike(state, a.id, b.id, luck, result); }
    if (armyById(state, a.id)) a.mp = 0;
  }
  if (ev) ev.incoming = true;
  return ev;
}
