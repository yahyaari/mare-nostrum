// Lider portreleri (rules/leaders.js): her medeniyetin liderinin büstü, kendi renginde bir
// madalyonun içinde. Çizimle (resim dosyası yok), oyunun geri kalanı gibi. Yüz ifadesi tutuma göre:
// dostça gülümser, nötr düz, soğuk somurtur, düşmanca kaşlarını çatar.
//
// Koordinatlar birim çemberde: (0, 0) madalyonun ortası, yarıçap 1; baş (0, -0.12) civarında.

import { TAU, colorOf } from "./kit.js";
import { DARK, GOLD, GOLD_LIGHT, shade } from "./pieces.js";

const LOOK = {
  rome: { skin: "#d9a982", hair: "#3b2a1c", garment: "#efe6d2", sash: true },
  carthage: { skin: "#b9805a", hair: "#1f1712", garment: null, beard: "#1f1712" },
  egypt: { skin: "#c08a5e", hair: "#120d0a", garment: null, female: true },
  macedon: { skin: "#e0b08a", hair: "#8a5a2b", garment: null },
  parthia: { skin: "#c58f64", hair: "#2a1d14", garment: null, beard: "#2a1d14" },
  gaul: { skin: "#e3b693", hair: "#c9a24a", garment: null },
  saka: { skin: "#d19c72", hair: "#3a2416", garment: null, female: true },
};

/** Liderin portresi: (cx, cy) ortası, `r` yarıçapı; `mood`: friendly | neutral | cold | hostile. */
export function portrait(ctx, civ, cx, cy, r, mood = "neutral") {
  const L = LOOK[civ] ?? LOOK.rome, color = colorOf(civ);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(r, r);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Zemin: medeniyetin renginde, ortası aydınlık.
  const g = ctx.createRadialGradient(-0.2, -0.35, 0.1, 0, 0, 1);
  g.addColorStop(0, shade(color, 0.35));
  g.addColorStop(1, shade(color, -0.35));
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, 0.94, 0, TAU);
  ctx.clip();
  // Büst madalyonu doldursun: biraz büyük ve aşağıda.
  ctx.translate(0, 0.14);
  ctx.scale(1.3, 1.3);

  // Arkadaki saç (uzun saçlılar) ve başlıkların arkası.
  if (civ === "egypt") {
    ctx.fillStyle = L.hair;
    ctx.beginPath();
    ctx.moveTo(-0.36, -0.3);
    ctx.quadraticCurveTo(-0.42, 0.2, -0.32, 0.36);
    ctx.lineTo(0.32, 0.36);
    ctx.quadraticCurveTo(0.42, 0.2, 0.36, -0.3);
    ctx.closePath();
    ctx.fill();
  } else if (civ === "gaul") {
    ctx.fillStyle = L.hair;
    ctx.beginPath();
    ctx.moveTo(-0.32, -0.3);
    ctx.quadraticCurveTo(-0.46, 0.15, -0.4, 0.5);
    ctx.lineTo(0.4, 0.5);
    ctx.quadraticCurveTo(0.46, 0.15, 0.32, -0.3);
    ctx.closePath();
    ctx.fill();
  } else if (civ === "saka") {
    // Örgüler omuzlara iner.
    ctx.strokeStyle = L.hair;
    ctx.lineWidth = 0.09;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(d * 0.26, -0.05);
      ctx.quadraticCurveTo(d * 0.34, 0.25, d * 0.3, 0.55);
      ctx.stroke();
    }
  }

  // Omuzlar ve giysi.
  ctx.beginPath();
  ctx.moveTo(-1, 1.1);
  ctx.quadraticCurveTo(-0.9, 0.5, -0.4, 0.42);
  ctx.lineTo(0.4, 0.42);
  ctx.quadraticCurveTo(0.9, 0.5, 1, 1.1);
  ctx.closePath();
  ctx.fillStyle = L.garment ?? shade(color, -0.15);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 0.025;
  ctx.stroke();
  if (L.sash) {
    // Roma: togada mor şerit (sahibinin renginde).
    ctx.beginPath();
    ctx.moveTo(-0.55, 0.5);
    ctx.quadraticCurveTo(0, 0.95, 0.35, 1.1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.12;
    ctx.stroke();
  }
  if (civ === "egypt") {
    // Altın gerdanlık (usekh).
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0.3, 0.3 + i * 0.07, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.strokeStyle = i === 1 ? "#2f7d8c" : GOLD;
      ctx.lineWidth = 0.06;
      ctx.stroke();
    }
  }
  if (civ === "macedon" || civ === "carthage") {
    // Pelerin iğnesi.
    ctx.beginPath();
    ctx.arc(-0.45, 0.62, 0.07, 0, TAU);
    ctx.fillStyle = GOLD;
    ctx.fill();
  }

  // Boyun ve baş.
  ctx.fillStyle = L.skin;
  ctx.fillRect(-0.1, 0.1, 0.2, 0.36);
  ctx.beginPath();
  ctx.ellipse(-0.27, -0.1, 0.05, 0.08, 0, 0, TAU);
  ctx.ellipse(0.27, -0.1, 0.05, 0.08, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -0.12, 0.27, 0.34, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(60,30,15,0.35)";
  ctx.lineWidth = 0.02;
  ctx.stroke();
  if (civ === "gaul") {
    // Torc: boynunda altın halka.
    ctx.beginPath();
    ctx.arc(0, 0.32, 0.14, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 0.05;
    ctx.stroke();
  }

  face(ctx, L, mood, civ);

  // Saç, sakal ve başlık (yüzün üstünde).
  hair(ctx, civ, L);
  ctx.restore();

  // Altın çerçeve.
  ctx.beginPath();
  ctx.arc(0, 0, 0.97, 0, TAU);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 0.07;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 1.01, 0, TAU);
  ctx.strokeStyle = DARK;
  ctx.lineWidth = 0.03;
  ctx.stroke();
  ctx.restore();
}

/** Gözler, kaşlar, burun, ağız: ifade tutuma göre. */
function face(ctx, L, mood, civ) {
  const dark = "#2a1a10";
  // Gözler (Kleopatra'da sürmeli).
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(d * 0.1, -0.14, 0.045, 0.025, 0, 0, TAU);
    ctx.fillStyle = "#f4ead8";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(d * 0.1, -0.14, 0.018, 0, TAU);
    ctx.fillStyle = dark;
    ctx.fill();
    if (civ === "egypt") {
      ctx.beginPath();
      ctx.moveTo(d * 0.05, -0.15);
      ctx.lineTo(d * 0.17, -0.15);
      ctx.lineTo(d * 0.2, -0.17);
      ctx.strokeStyle = "#0d0907";
      ctx.lineWidth = 0.018;
      ctx.stroke();
    }
    // Kaşlar: düşmancaysa içe çatık, soğuksa düz ve alçak, dostçaysa kalkık.
    const tilt = mood === "hostile" ? 0.05 : mood === "cold" ? 0.015 : mood === "friendly" ? -0.02 : 0;
    ctx.beginPath();
    ctx.moveTo(d * 0.05, -0.215 + tilt);
    ctx.lineTo(d * 0.16, -0.225 - tilt * 0.4);
    ctx.strokeStyle = L.hair;
    ctx.lineWidth = 0.028;
    ctx.stroke();
  }
  // Burun.
  ctx.beginPath();
  ctx.moveTo(0.01, -0.12);
  ctx.lineTo(0.035, -0.02);
  ctx.lineTo(-0.01, 0);
  ctx.strokeStyle = "rgba(90,45,20,0.6)";
  ctx.lineWidth = 0.018;
  ctx.stroke();
  // Ağız.
  const curve = mood === "friendly" ? 0.045 : mood === "cold" ? -0.025 : mood === "hostile" ? -0.045 : 0;
  ctx.beginPath();
  ctx.moveTo(-0.07, 0.08);
  ctx.quadraticCurveTo(0, 0.08 + curve * 2, 0.07, 0.08);
  ctx.strokeStyle = L.female ? "#8d3b32" : "#6b3424";
  ctx.lineWidth = L.female ? 0.03 : 0.022;
  ctx.stroke();
}

function hair(ctx, civ, L) {
  ctx.fillStyle = L.hair;
  ctx.strokeStyle = L.hair;
  if (L.beard) {
    // Sakal: çenenin çevresi.
    ctx.beginPath();
    ctx.moveTo(-0.26, -0.08);
    ctx.quadraticCurveTo(-0.26, civ === "parthia" ? 0.42 : 0.26, 0, civ === "parthia" ? 0.46 : 0.28);
    ctx.quadraticCurveTo(0.26, civ === "parthia" ? 0.42 : 0.26, 0.26, -0.08);
    ctx.quadraticCurveTo(0.15, 0.12, 0.08, 0.06);
    ctx.lineTo(-0.08, 0.06);
    ctx.quadraticCurveTo(-0.15, 0.12, -0.26, -0.08);
    ctx.closePath();
    ctx.fill();
    // Ağız sakalın üstünde yeniden.
    ctx.beginPath();
    ctx.moveTo(-0.06, 0.09);
    ctx.lineTo(0.06, 0.09);
    ctx.strokeStyle = "#6b3424";
    ctx.lineWidth = 0.02;
    ctx.stroke();
  }
  if (civ === "gaul") {
    // Uzun sarkık bıyık.
    ctx.beginPath();
    ctx.moveTo(0, 0.03);
    ctx.quadraticCurveTo(-0.12, 0.03, -0.15, 0.2);
    ctx.moveTo(0, 0.03);
    ctx.quadraticCurveTo(0.12, 0.03, 0.15, 0.2);
    ctx.strokeStyle = L.hair;
    ctx.lineWidth = 0.05;
    ctx.stroke();
  }
  ctx.fillStyle = L.hair;
  if (civ === "rome") {
    // Kısa saç ve defne tacı.
    cap(ctx, 0.29, -0.26);
    ctx.fillStyle = "#6e8f3a";
    for (let i = 0; i < 9; i++) {
      const t = Math.PI * (1.08 + i * 0.105);
      ctx.beginPath();
      ctx.ellipse(Math.cos(t) * 0.3, -0.18 + Math.sin(t) * 0.3, 0.07, 0.03, t + 1.2, 0, TAU);
      ctx.fill();
    }
  } else if (civ === "carthage") {
    cap(ctx, 0.3, -0.24, true);
    band(ctx, -0.3, GOLD);
  } else if (civ === "macedon") {
    // Kıvırcık, alnından kalkık saç (anastole) ve beyaz diadem.
    cap(ctx, 0.31, -0.22, true);
    ctx.beginPath();
    ctx.arc(-0.04, -0.47, 0.09, 0, TAU);
    ctx.arc(0.08, -0.48, 0.08, 0, TAU);
    ctx.fill();
    band(ctx, -0.3, "#f2ecdf");
  } else if (civ === "egypt") {
    // Kâkül ve kobralı altın taç.
    ctx.beginPath();
    ctx.moveTo(-0.3, -0.18);
    ctx.quadraticCurveTo(-0.3, -0.5, 0, -0.5);
    ctx.quadraticCurveTo(0.3, -0.5, 0.3, -0.18);
    ctx.lineTo(0.22, -0.24);
    ctx.lineTo(-0.22, -0.24);
    ctx.closePath();
    ctx.fill();
    band(ctx, -0.3, GOLD);
    ctx.beginPath();
    ctx.moveTo(0, -0.33);
    ctx.quadraticCurveTo(0.06, -0.42, 0, -0.47);
    ctx.quadraticCurveTo(-0.05, -0.42, 0, -0.33);
    ctx.fillStyle = GOLD_LIGHT;
    ctx.fill();
  } else if (civ === "parthia") {
    // Part tacı: yuvarlak, yüksek, kulak kapaklı; boncuk dizili.
    ctx.beginPath();
    ctx.moveTo(-0.32, -0.08);
    ctx.lineTo(-0.3, -0.3);
    ctx.quadraticCurveTo(-0.28, -0.72, 0, -0.72);
    ctx.quadraticCurveTo(0.28, -0.72, 0.3, -0.3);
    ctx.lineTo(0.32, -0.08);
    ctx.lineTo(0.22, -0.1);
    ctx.lineTo(0.22, -0.26);
    ctx.lineTo(-0.22, -0.26);
    ctx.lineTo(-0.22, -0.1);
    ctx.closePath();
    ctx.fillStyle = "#e7dcc4";
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 0.03;
    ctx.stroke();
    ctx.fillStyle = GOLD;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * 0.1, -0.45 - Math.cos(i * 0.5) * 0.08, 0.025, 0, TAU);
      ctx.fill();
    }
  } else if (civ === "gaul") {
    cap(ctx, 0.31, -0.22);
  } else if (civ === "saka") {
    // Sivri İskit keçe başlığı, altın süslü.
    ctx.beginPath();
    ctx.moveTo(-0.33, -0.05);
    ctx.lineTo(-0.3, -0.3);
    ctx.quadraticCurveTo(-0.18, -0.62, 0.12, -0.92);
    ctx.quadraticCurveTo(0.24, -0.55, 0.3, -0.3);
    ctx.lineTo(0.33, -0.05);
    ctx.lineTo(0.22, -0.08);
    ctx.lineTo(0.22, -0.26);
    ctx.lineTo(-0.22, -0.26);
    ctx.lineTo(-0.22, -0.08);
    ctx.closePath();
    ctx.fillStyle = "#9b3b2a";
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(-0.28, -0.3);
    ctx.lineTo(0.3, -0.3);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    for (const [x, y] of [[-0.12, -0.42], [0.04, -0.5], [0.1, -0.68]]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.03, 0, TAU);
      ctx.fill();
    }
  }
}

/** Başın üstünü örten saç: `r` yarıçap, `y` alnın çizgisi; `curly` kıvırcık kenar. */
function cap(ctx, r, y, curly = false) {
  ctx.beginPath();
  ctx.moveTo(-r, y + 0.12);
  ctx.quadraticCurveTo(-r, -0.5, 0, -0.5);
  ctx.quadraticCurveTo(r, -0.5, r, y + 0.12);
  ctx.quadraticCurveTo(r * 0.6, y - 0.02, 0, y);
  ctx.quadraticCurveTo(-r * 0.6, y - 0.02, -r, y + 0.12);
  ctx.closePath();
  ctx.fill();
  if (curly) {
    for (let i = 0; i < 7; i++) {
      const t = Math.PI * (1.05 + i * 0.15);
      ctx.beginPath();
      ctx.arc(Math.cos(t) * r * 0.98, -0.16 + Math.sin(t) * 0.34, 0.06, 0, TAU);
      ctx.fill();
    }
  }
}

/** Alında bir bant (diadem). */
function band(ctx, y, color) {
  ctx.beginPath();
  ctx.moveTo(-0.29, y + 0.04);
  ctx.quadraticCurveTo(0, y - 0.04, 0.29, y + 0.04);
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.05;
  ctx.stroke();
}
