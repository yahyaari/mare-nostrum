// Öğretici haydutlar. Kullanıcı 23.10: "yeni oyuna başladığında öğretici olması için şehir
// yakınlarında bir tane küçük düşman olsun; ordu oluşturup garnizondan çıkarmayı göstersin,
// savaştırsın". Sahibi olmayan küçük bir ordu: herkese düşman (bağımsız gibi), kimseye
// saldırmaz, yerinden kıpırdamaz, kimseyi öfkelendirmez. Dağıtan ganimet alır (moves.js strike).
// Sadece öğretici açıkken kurulur (main.js); bot ve denge oyunlarında yok.

import { PLACES } from "../data/world.js";
import { N } from "./numbers.js";
import { H, PLACE_CELL, POS, W, centre, dist, isLand, isRoad, pathNear, placeAtCell, regionOf } from "./map.js";

/**
 * Oyuncunun başkentinin yakınına, kendi toprağına haydut kampı kurar: başkentten çıkan bir ordu
 * aynı tur yanlarına yürüyüp saldırabilsin. Kurulan ordu (yer yoksa null).
 */
export function spawnBandits(state) {
  const cap = PLACES.find((p) => p.capital && state.places[p.id].owner === state.player)?.id;
  if (!cap) return null;
  const home = POS[cap], B = N.bandits;
  const spots = [];
  for (let c = 0; c < W * H; c++) {
    if (!isLand(c) || placeAtCell(c) || regionOf(c) !== cap) continue;
    const p = centre(c), d = dist(p, home);
    if (d < B.near || d > B.far) continue;
    // Başka bir yerleşimin dibinde değil (yabancı yerin çevresinden geçilmez).
    if (PLACES.some((q) => q.id !== cap && dist(p, POS[q.id]) < N.reach.hold + 0.4)) continue;
    // Başkentin güneyi ekranda alttaki kartların arkasında kalır: kuzeyi ya da yanı tercih edilir.
    spots.push([Math.abs(d - B.dist) + (p.y > home.y + 0.3 ? 1 : 0), c]);
  }
  spots.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // Başkentten karadan, bir turun dörtte üçüyle menzile girilebilen ilk yer (saldıracak hareket kalsın).
  const enter = (c) => isLand(c) || isRoad(c);
  const spot = spots.find(([, c]) => pathNear(PLACE_CELL[cap], centre(c), N.reach.strike - 0.1, { enter }, N.march.mp * 0.75));
  if (!spot) return null;
  const a = {
    id: state.nextArmy++, owner: null, bandit: true, at: null, ...centre(spot[1]),
    inf: B.inf, arch: B.arch, cav: 0, siege: 0, elite: 0, ships: 0, trireme: 0, quinq: 0, mp: 0, route: [], general: null, xp: 0,
  };
  state.armies.push(a);
  state.tutorial = true;
  return a;
}

/** Haydutlar hâlâ orada mı. */
export const banditsOf = (state) => state.armies.find((a) => a.bandit) ?? null;
