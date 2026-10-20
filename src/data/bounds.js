// Haritanın görünen sınırları, derece. Kamera bunun dışına çıkmaz; Tools/geo.mjs kıyıları
// bunun biraz dışından keser.
//
// Batıda Portekiz kıyısı, doğuda Nisa (Partlar), kuzeyde Lutetia, güneyde Memphis'in altı.

export const BOUNDS = { w: -11, e: 62, s: 26, n: 52 };

// Eşit dikdörtgen izdüşüm, 40. paralelde gerçek oran. Boylam bu katsayıyla daralır,
// yoksa harita yatayda %30 şişkin görünür.
export const LON_SCALE = Math.cos((40 * Math.PI) / 180);
