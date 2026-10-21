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
    return { id: p.id, poly: wobble(poly) };
  });
}

// Sınırlar cetvelle çizilmiş gibi durmasın: kenarlar sık noktalara bölünüp yumuşak bir
// gürültüyle kaydırılır. Kayma sadece noktanın YERİNE bağlı, iki komşu hücrenin ortak kenarı
// aynı noktalara bölünüp aynı yere kayar - aralarında boşluk ya da üst üste binme olmaz.
const STEP = 0.12, SWAY = 0.28;

function wobble(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
    for (let k = 0; k < n; k++) out.push(sway(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n));
  }
  return out;
}

function sway(x, y) {
  const dx = Math.sin(1.7 * x + 2.3 * y) * 0.5 + Math.sin(3.1 * y - 0.7 * x + 1.3) * 0.3 + Math.sin(6.3 * x + 4.1 * y) * 0.2;
  const dy = Math.sin(2.1 * x - 1.6 * y + 0.4) * 0.5 + Math.sin(2.9 * x + 3.3 * y + 2.1) * 0.3 + Math.sin(5.7 * y - 4.4 * x) * 0.2;
  return [x + dx * SWAY, y + dy * SWAY];
}
