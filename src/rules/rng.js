// Tohumlu rastgele sayı. Durum `state.rng` içinde bir tamsayı olarak duruyor, yani kayıtla
// birlikte saklanıyor ve aynı tohum aynı oyunu oynatıyor (bot ve testler buna dayanıyor).

/** [0, 1) arası bir sayı verir ve durumu ilerletir (mulberry32). */
export function random(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const between = (state, a, b) => a + (b - a) * random(state);
