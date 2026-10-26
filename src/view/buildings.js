// Bina resimleri (kullanıcı 26.10: "tarla 1->2 yazıyor yanında bir buton var, sıkıcı; Total War'da
// görsel vardı, sağ üst köşesinde seviyesi yazıyordu; yükseltmeler bir şey yapıyormuşum gibi
// hissettirmedi"). Her yapı küçük bir sahne: seviyesi arttıkça sahne zenginleşir (daha çok tarla
// şeridi, baca, çadır, tekne). Şehir kartındaki bina kartları ve soldaki şehir resmi bunu kullanır.
//
// Çizimle, resim dosyası yok. Parçalar (ev, tarla, ocak, çadır, tapınak...) `s` ölçeğiyle çizilir:
// (x, y) parçanın yere değdiği orta nokta.

import { TAU, colorOf } from "./kit.js";
import { CREAM, DARK, GOLD, shade } from "./pieces.js";

const WATER = ["fishery", "shipyard", "trade", "fort"];

/** Bina kartının resmi: gök ve toprak (limandakilerde deniz), üstünde yapının sahnesi. */
export function buildingArt(ctx, what, x, y, w, h, level, owner) {
  const water = WATER.includes(what);
  const ground = y + h * 0.7;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const sky = ctx.createLinearGradient(0, y, 0, ground);
  sky.addColorStop(0, shade(colorOf(owner), -0.3));
  sky.addColorStop(1, shade(colorOf(owner), 0.5));
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  // Uzakta tepe.
  ctx.fillStyle = "rgba(90,110,80,0.45)";
  ctx.beginPath();
  ctx.ellipse(x + w * 0.25, ground + 2, w * 0.45, h * 0.16, 0, Math.PI, TAU);
  ctx.fill();
  ctx.fillStyle = water ? "#4f7f8a" : "#a08a5c";
  ctx.fillRect(x, ground, w, y + h - ground);
  if (water) {
    ctx.strokeStyle = "rgba(230,240,240,0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 4 + i * w * 0.3, ground + 6 + i * 3);
      ctx.lineTo(x + 14 + i * w * 0.3, ground + 6 + i * 3);
      ctx.stroke();
    }
  }
  // Kart dar (70 piksel): sahne iri çizilsin, kenarlar taşabilir. Geniş kartta boy sınırlar.
  const s = Math.min(w / 48, h / 56), cx = x + w / 2, n = Math.max(0, level);
  SCENE[what]?.(ctx, cx, ground, s, n, owner, w);
  ctx.restore();
}

// ---- sahneler: (merkez x, zemin y, ölçek, seviye, sahibi, en) ----

const SCENE = {
  level(ctx, cx, g, s, n) {
    // Evler seviyesi kadar (en az bir), büyük şehirde ortada tapınak.
    const k = Math.min(5, Math.max(1, n));
    if (k >= 3) temple(ctx, cx, g - 2 * s, 0.75 * s);
    const spots = [[-18, 2], [16, 3], [-6, 6], [8, 8], [-22, 9]];
    spots.slice(0, k + 1).forEach(([dx, dy], i) => house(ctx, cx + dx * s, g + dy * s, (0.85 + (i % 2) * 0.15) * s));
  },
  farms(ctx, cx, g, s, n) {
    // Ekin şeritleri seviyesi kadar, solda ambar.
    for (let i = 0; i < Math.max(1, n); i++) field(ctx, cx - 4 * s + (i % 2) * 6 * s, g + 4 * s + i * 4.5 * s, 34 * s, i);
    barn(ctx, cx - 20 * s, g + 2 * s, s);
  },
  industry(ctx, cx, g, s, n) {
    // Ocak: seviyesi kadar baca, hepsinden duman; önde örs.
    forge(ctx, cx, g + 4 * s, s, Math.max(1, Math.min(4, n)));
    anvil(ctx, cx + 16 * s, g + 10 * s, s);
  },
  barracks(ctx, cx, g, s, n, owner) {
    // Çit, seviyesi kadar çadır, sancak.
    palisade(ctx, cx, g + 2 * s, 46 * s, s);
    for (let i = 0; i < Math.max(1, Math.min(4, n)); i++) tent(ctx, cx - 14 * s + i * 10 * s, g + 10 * s - (i % 2) * 3 * s, 8 * s, owner);
    flag(ctx, cx + 22 * s, g + 2 * s, s, owner);
  },
  fishery(ctx, cx, g, s, n) {
    for (let i = 0; i < Math.max(1, Math.min(3, n)); i++) boat(ctx, cx - 12 * s + i * 13 * s, g + 6 * s + (i % 2) * 4 * s, 0.8 * s, true);
  },
  shipyard(ctx, cx, g, s, n) {
    // Kızakta gövde, vinç.
    ctx.fillStyle = "#7b5a3a";
    ctx.beginPath();
    ctx.moveTo(cx - 26 * s, g + 2 * s);
    ctx.lineTo(cx + 20 * s, g - 6 * s);
    ctx.lineTo(cx + 20 * s, g - 3 * s);
    ctx.lineTo(cx - 26 * s, g + 5 * s);
    ctx.closePath();
    ctx.fill();
    hull(ctx, cx - 2 * s, g - 4 * s, (0.8 + 0.08 * Math.min(4, n)) * s);
    crane(ctx, cx + 18 * s, g - 4 * s, s);
  },
  trade(ctx, cx, g, s, n) {
    // Rıhtımda amforalar, açıkta tüccar gemisi.
    boat(ctx, cx + 10 * s, g + 6 * s, 0.9 * s, false);
    for (let i = 0; i < Math.max(1, Math.min(5, n + 1)); i++) amphora(ctx, cx - 22 * s + i * 6 * s, g - 1 * s, s);
  },
  fort(ctx, cx, g, s, n, owner) {
    tower(ctx, cx - 8 * s, g, s, Math.max(1, n));
    flag(ctx, cx - 8 * s, g - (22 + 4 * Math.min(4, n)) * s, s, owner);
    boat(ctx, cx + 16 * s, g + 7 * s, 0.6 * s, false);
  },
  temple(ctx, cx, g, s, n) {
    temple(ctx, cx, g + 4 * s, (0.95 + 0.06 * Math.min(4, n)) * s);
  },
  market(ctx, cx, g, s, n, owner) {
    for (let i = 0; i < Math.max(1, Math.min(4, n + 1)); i++) stall(ctx, cx - 18 * s + i * 12 * s, g + 6 * s + (i % 2) * 3 * s, s, owner);
  },
  school(ctx, cx, g, s, n) {
    // Sütunlu bina ve önünde açık bir tomar.
    temple(ctx, cx - 4 * s, g + 2 * s, 0.8 * s);
    scroll(ctx, cx + 16 * s, g + 10 * s, s);
    if (n >= 3) scroll(ctx, cx - 22 * s, g + 11 * s, 0.8 * s);
  },
  baths(ctx, cx, g, s, n) {
    // Kubbe, havuz, buhar.
    ctx.fillStyle = "#4f8fa0";
    ctx.beginPath();
    ctx.ellipse(cx + 10 * s, g + 10 * s, 16 * s, 4 * s, 0, 0, TAU);
    ctx.fill();
    dome(ctx, cx - 10 * s, g + 6 * s, s);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.2 * s;
    for (let i = 0; i < Math.max(1, Math.min(3, n)); i++) {
      ctx.beginPath();
      const sx = cx + (4 + i * 7) * s;
      ctx.moveTo(sx, g + 6 * s);
      ctx.quadraticCurveTo(sx - 3 * s, g, sx, g - 6 * s);
      ctx.quadraticCurveTo(sx + 3 * s, g - 11 * s, sx, g - 15 * s);
      ctx.stroke();
    }
  },
};

// ---- parçalar ----

const outline = (ctx, s) => { ctx.strokeStyle = "rgba(40,28,16,0.75)"; ctx.lineWidth = Math.max(0.6, 0.9 * s); ctx.stroke(); };

export function house(ctx, x, y, s) {
  ctx.beginPath();
  ctx.rect(x - 6 * s, y - 8 * s, 12 * s, 8 * s);
  ctx.fillStyle = "#efe2c4";
  ctx.fill();
  outline(ctx, s);
  ctx.beginPath();
  ctx.moveTo(x - 7.5 * s, y - 8 * s);
  ctx.lineTo(x, y - 13 * s);
  ctx.lineTo(x + 7.5 * s, y - 8 * s);
  ctx.closePath();
  ctx.fillStyle = "#b5523a";
  ctx.fill();
  outline(ctx, s);
  ctx.fillStyle = "#5a4630";
  ctx.fillRect(x - 1.5 * s, y - 4 * s, 3 * s, 4 * s);
}

export function field(ctx, x, y, w, i = 0) {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x + w / 2 - 6, y);
  ctx.lineTo(x + w / 2, y - 3);
  ctx.lineTo(x - w / 2 + 6, y - 3);
  ctx.closePath();
  ctx.fillStyle = i % 2 ? "#d9b24a" : "#c99a35";
  ctx.fill();
  ctx.strokeStyle = "rgba(90,60,20,0.5)";
  ctx.lineWidth = 0.7;
  ctx.stroke();
}

function barn(ctx, x, y, s) {
  ctx.beginPath();
  ctx.rect(x - 5 * s, y - 7 * s, 10 * s, 7 * s);
  ctx.fillStyle = "#8c5a36";
  ctx.fill();
  outline(ctx, s);
  ctx.beginPath();
  ctx.moveTo(x - 6.5 * s, y - 7 * s);
  ctx.lineTo(x, y - 11 * s);
  ctx.lineTo(x + 6.5 * s, y - 7 * s);
  ctx.closePath();
  ctx.fillStyle = "#6b3f24";
  ctx.fill();
  outline(ctx, s);
}

export function forge(ctx, x, y, s, chimneys = 1) {
  ctx.beginPath();
  ctx.rect(x - 14 * s, y - 10 * s, 24 * s, 10 * s);
  ctx.fillStyle = "#8e7a62";
  ctx.fill();
  outline(ctx, s);
  // Ateş ağzı.
  ctx.fillStyle = "#f08a2a";
  ctx.fillRect(x - 4 * s, y - 6 * s, 6 * s, 6 * s);
  for (let i = 0; i < chimneys; i++) {
    const hx = x - 11 * s + i * 7 * s;
    ctx.fillStyle = "#5e4e3e";
    ctx.fillRect(hx, y - 18 * s, 4 * s, 8 * s);
    // Duman.
    ctx.fillStyle = "rgba(210,205,200,0.55)";
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(hx + 2 * s + k * 2 * s, y - 21 * s - k * 4 * s, (2.2 + k) * s, 0, TAU);
      ctx.fill();
    }
  }
}

function anvil(ctx, x, y, s) {
  ctx.fillStyle = "#3b3530";
  ctx.beginPath();
  ctx.moveTo(x - 5 * s, y - 5 * s);
  ctx.lineTo(x + 5 * s, y - 5 * s);
  ctx.lineTo(x + 2 * s, y - 3 * s);
  ctx.lineTo(x + 2 * s, y);
  ctx.lineTo(x - 2 * s, y);
  ctx.lineTo(x - 2 * s, y - 3 * s);
  ctx.closePath();
  ctx.fill();
}

export function tent(ctx, x, y, w, owner) {
  ctx.beginPath();
  ctx.moveTo(x - w * 0.6, y);
  ctx.lineTo(x, y - w);
  ctx.lineTo(x + w * 0.6, y);
  ctx.closePath();
  ctx.fillStyle = "#e9dcbc";
  ctx.fill();
  ctx.strokeStyle = "#3b3024";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - w * 0.3, y - w * 0.5);
  ctx.lineTo(x + w * 0.3, y - w * 0.5);
  ctx.strokeStyle = colorOf(owner);
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

function palisade(ctx, x, y, w, s) {
  ctx.fillStyle = "#7a5a3a";
  for (let px = x - w / 2; px < x + w / 2; px += 3.2 * s) {
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px, y - 7 * s);
    ctx.lineTo(px + 1.4 * s, y - 9 * s);
    ctx.lineTo(px + 2.8 * s, y - 7 * s);
    ctx.lineTo(px + 2.8 * s, y);
    ctx.closePath();
    ctx.fill();
  }
}

function flag(ctx, x, y, s, owner) {
  ctx.strokeStyle = "#3b3024";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 16 * s);
  ctx.stroke();
  ctx.fillStyle = colorOf(owner);
  ctx.beginPath();
  ctx.moveTo(x, y - 16 * s);
  ctx.lineTo(x + 9 * s, y - 13 * s);
  ctx.lineTo(x, y - 10 * s);
  ctx.closePath();
  ctx.fill();
}

function boat(ctx, x, y, s, net) {
  ctx.beginPath();
  ctx.moveTo(x - 10 * s, y - 4 * s);
  ctx.quadraticCurveTo(x, y + 2 * s, x + 10 * s, y - 4 * s);
  ctx.closePath();
  ctx.fillStyle = "#6b4a2e";
  ctx.fill();
  ctx.strokeStyle = "#3b3024";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x, y - 3 * s);
  ctx.lineTo(x, y - 16 * s);
  ctx.stroke();
  ctx.fillStyle = CREAM;
  ctx.beginPath();
  ctx.moveTo(x + 0.5 * s, y - 15 * s);
  ctx.lineTo(x + 8 * s, y - 6 * s);
  ctx.lineTo(x + 0.5 * s, y - 5 * s);
  ctx.closePath();
  ctx.fill();
  if (net) {
    ctx.strokeStyle = "rgba(240,235,220,0.7)";
    ctx.beginPath();
    ctx.moveTo(x - 8 * s, y - 3 * s);
    ctx.quadraticCurveTo(x - 14 * s, y + 2 * s, x - 9 * s, y + 5 * s);
    ctx.stroke();
  }
}

function hull(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - 16 * s, y - 6 * s);
  ctx.quadraticCurveTo(x - 4 * s, y + 4 * s, x + 16 * s, y - 8 * s);
  ctx.lineTo(x + 14 * s, y - 11 * s);
  ctx.lineTo(x - 15 * s, y - 9 * s);
  ctx.closePath();
  ctx.fillStyle = "#8a6440";
  ctx.fill();
  outline(ctx, s);
  // Kaburgalar.
  ctx.strokeStyle = "rgba(60,40,20,0.7)";
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 5 * s, y - 9 * s);
    ctx.lineTo(x + i * 5 * s, y - 14 * s);
    ctx.stroke();
  }
}

function crane(ctx, x, y, s) {
  ctx.strokeStyle = "#5a3f26";
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 26 * s);
  ctx.lineTo(x - 14 * s, y - 20 * s);
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - 14 * s, y - 20 * s);
  ctx.lineTo(x - 14 * s, y - 12 * s);
  ctx.stroke();
}

function amphora(ctx, x, y, s) {
  ctx.beginPath();
  ctx.ellipse(x, y - 4 * s, 2.2 * s, 4 * s, 0, 0, TAU);
  ctx.fillStyle = "#b8643c";
  ctx.fill();
  ctx.fillRect(x - 0.8 * s, y - 10 * s, 1.6 * s, 3 * s);
}

function tower(ctx, x, y, s, n) {
  const h = (20 + 4 * Math.min(4, n)) * s;
  ctx.beginPath();
  ctx.rect(x - 6 * s, y - h, 12 * s, h);
  ctx.fillStyle = "#c9b48a";
  ctx.fill();
  outline(ctx, s);
  ctx.fillStyle = "#c9b48a";
  for (let i = 0; i < 3; i++) ctx.fillRect(x - 6 * s + i * 4.5 * s, y - h - 3 * s, 3 * s, 3 * s);
  ctx.fillStyle = "#3b3024";
  ctx.fillRect(x - 1 * s, y - h * 0.6, 2 * s, 4 * s);
}

export function temple(ctx, x, y, s) {
  ctx.fillStyle = "#e8dcc0";
  ctx.fillRect(x - 15 * s, y - 2 * s, 30 * s, 2 * s);
  for (let i = 0; i < 5; i++) ctx.fillRect(x - 13 * s + i * 6 * s, y - 14 * s, 2.4 * s, 12 * s);
  ctx.fillRect(x - 15 * s, y - 16 * s, 30 * s, 2.2 * s);
  ctx.beginPath();
  ctx.moveTo(x - 16 * s, y - 16 * s);
  ctx.lineTo(x, y - 23 * s);
  ctx.lineTo(x + 16 * s, y - 16 * s);
  ctx.closePath();
  ctx.fill();
  outline(ctx, s);
}

export function stall(ctx, x, y, s, owner) {
  ctx.fillStyle = "#7a5a3a";
  ctx.fillRect(x - 5 * s, y - 9 * s, 1.2 * s, 9 * s);
  ctx.fillRect(x + 4 * s, y - 9 * s, 1.2 * s, 9 * s);
  // Çizgili tente.
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? CREAM : colorOf(owner);
    ctx.fillRect(x - 6 * s + i * 3 * s, y - 12 * s, 3 * s, 4 * s);
  }
  ctx.fillStyle = "#b8643c";
  ctx.fillRect(x - 4 * s, y - 4 * s, 8 * s, 2 * s);
}

function scroll(ctx, x, y, s) {
  ctx.fillStyle = "#f3e7c9";
  ctx.fillRect(x - 6 * s, y - 8 * s, 12 * s, 7 * s);
  ctx.fillStyle = "#c9a45a";
  ctx.beginPath();
  ctx.arc(x - 6 * s, y - 4.5 * s, 1.8 * s, 0, TAU);
  ctx.arc(x + 6 * s, y - 4.5 * s, 1.8 * s, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(60,40,20,0.6)";
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x - 4 * s, y - 6.5 * s + i * 2 * s);
    ctx.lineTo(x + 4 * s, y - 6.5 * s + i * 2 * s);
    ctx.stroke();
  }
}

function dome(ctx, x, y, s) {
  ctx.fillStyle = "#e8dcc0";
  ctx.fillRect(x - 11 * s, y - 8 * s, 22 * s, 8 * s);
  ctx.beginPath();
  ctx.arc(x, y - 8 * s, 9 * s, Math.PI, TAU);
  ctx.fill();
  outline(ctx, s);
  ctx.fillStyle = GOLD;
  ctx.fillRect(x - 0.8 * s, y - 20 * s, 1.6 * s, 3 * s);
  ctx.fillStyle = DARK;
  ctx.fillRect(x - 2 * s, y - 5 * s, 4 * s, 5 * s);
}
