// Kamera: haritanın hangi parçası, hangi yakınlıkta görünüyor.
//
// `x, y` ekranın ortasındaki harita noktası (harita birimi), `scale` bir harita biriminin kaç
// CSS pikseli olduğu. Harita ekrandan küçükse ortalanır; büyükse kenarı ekranın içine girmez.

import { SIZE } from "../geo.js";

// En yakın hâl. 1:50m kıyı verisi bunun ötesinde köşeli görünüyor (260'ta denendi).
const MAX = 120;
// Görünen sınırın ötesinde kıyı verisi bu kadar devam ediyor (Tools/geo.mjs'teki pay, en dar
// yönde: 4 derece boylam = 3.06 birim). Kamera bundan fazlasını göstermemeli, yoksa kesilen
// verinin dümdüz kenarı ekrana girer.
const SPARE = 3;

export const makeCamera = () => ({ x: SIZE.x / 2, y: SIZE.y / 2, scale: 1, w: 1, h: 1, min: 1 });

/** Pencere boyu değişti: alt sınırı yeniden hesapla, yakınlığı aynı oranda koru. */
export function resize(cam, w, h) {
  const ratio = cam.scale / cam.min;
  cam.w = w;
  cam.h = h;
  // Bütün harita sığsın - ama verinin bittiği yer görünmesin. Geniş ekranda ikisi birlikte
  // oluyor; dik tutulan telefonda bütün harita ancak ortada incecik bir şerit olarak sığardı,
  // orada yükseklik dolar ve harita yana kaydırılır.
  cam.min = Math.max(Math.min(w / SIZE.x, h / SIZE.y), w / (SIZE.x + 2 * SPARE), h / (SIZE.y + 2 * SPARE));
  cam.scale = Math.min(MAX, cam.min * (Number.isFinite(ratio) && ratio > 0 ? ratio : 1));
  clamp(cam);
}

export function clamp(cam) {
  cam.scale = Math.max(cam.min, Math.min(MAX, cam.scale));
  const hw = cam.w / 2 / cam.scale, hh = cam.h / 2 / cam.scale;
  cam.x = SIZE.x <= hw * 2 ? SIZE.x / 2 : Math.max(hw, Math.min(SIZE.x - hw, cam.x));
  cam.y = SIZE.y <= hh * 2 ? SIZE.y / 2 : Math.max(hh, Math.min(SIZE.y - hh, cam.y));
}

export const toScreen = (cam, x, y) => ({
  x: (x - cam.x) * cam.scale + cam.w / 2,
  y: (y - cam.y) * cam.scale + cam.h / 2,
});

export const toMap = (cam, sx, sy) => ({
  x: (sx - cam.w / 2) / cam.scale + cam.x,
  y: (sy - cam.h / 2) / cam.scale + cam.y,
});

/** Ekrandaki (sx, sy) noktasının altındaki harita yerinden ayrılmadan yakınlaş/uzaklaş. */
export function zoomAt(cam, factor, sx, sy) {
  const m = toMap(cam, sx, sy);
  cam.scale = Math.max(cam.min, Math.min(MAX, cam.scale * factor));
  cam.x = m.x - (sx - cam.w / 2) / cam.scale;
  cam.y = m.y - (sy - cam.h / 2) / cam.scale;
  clamp(cam);
}

export function panBy(cam, dx, dy) {
  cam.x -= dx / cam.scale;
  cam.y -= dy / cam.scale;
  clamp(cam);
}

/** Bir harita noktasını ekranın ortasına getir. */
export function focus(cam, x, y, scale = cam.scale) {
  cam.scale = scale;
  cam.x = x;
  cam.y = y;
  clamp(cam);
}
