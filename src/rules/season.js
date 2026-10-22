// Mevsimler (kurallar.md bölüm 22): her tur bir mevsim - ilkbahar, yaz, sonbahar, kış; dört
// tur bir yıl. Oyun MÖ 270 ilkbaharında başlar. Kışın denizde fırtına, karada yıpranma.

export const SEASONS = ["spring", "summer", "autumn", "winter"];

export const seasonOf = (turn) => SEASONS[(turn - 1) % 4];
export const yearOf = (turn) => 270 - Math.floor((turn - 1) / 4);
export const isWinter = (turn) => seasonOf(turn) === "winter";
