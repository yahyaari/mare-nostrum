// Her yerleşimin toprağı: haritada ona en yakın noktalar (Voronoi hücresi). Sadece çizim
// içindir, kurallar bunu bilmez - kimin neye sahip olduğu yerleşimlerde tutuluyor.
//
// Hücre, haritanın dikdörtgeninden başlayıp her öteki yerleşime karşı "ona değil bana yakın"
// yarı düzlemiyle kırpılarak bulunur. Karaya kırpmak çizimin işi (kıyı yolu ile `clip`).

import { PLACES } from "../data/world.js";
import { project } from "../geo.js";

function cut(poly, nx, ny, c) {
  // nx*x + ny*y <= c olan yarıyı tut.
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[(i + poly.length - 1) % poly.length], b = poly[i];
    const da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c;
    if (db <= 0) {
      if (da > 0) out.push(cross(a, b, da, db));
      out.push(b);
    } else if (da <= 0) out.push(cross(a, b, da, db));
  }
  return out;
}
const cross = (a, b, da, db) => {
  const t = da / (da - db);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};

// Bir toprağın en fazla uzanabildiği yer, harita birimi (~350 km). Sınırsız bırakınca kenardaki
// yerleşimlerin hücresi bozkıra ve çöle doğru haritanın sonuna kadar uzanıyordu.
const REACH = 3.2;

export function regions() {
  const pts = PLACES.map((p) => project(p.lon, p.lat));
  return PLACES.map((p, i) => {
    const a = pts[i];
    // Başlangıç dikdörtgen değil, yerleşimin çevresinde 32 kenarlı bir daire.
    let poly = Array.from({ length: 32 }, (_, k) => {
      const t = (k / 32) * Math.PI * 2;
      return [a.x + Math.cos(t) * REACH, a.y + Math.sin(t) * REACH];
    });
    for (let j = 0; j < pts.length && poly.length; j++) {
      if (j === i) continue;
      const b = pts[j];
      poly = cut(poly, b.x - a.x, b.y - a.y, (b.x * b.x + b.y * b.y - a.x * a.x - a.y * a.y) / 2);
    }
    return { id: p.id, poly };
  });
}
