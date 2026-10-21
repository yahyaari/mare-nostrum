// Haritanın süsleri, eski atlaslardaki gibi: Latince deniz ve bölge adları, pusula gülü, savaş
// sisi, ağır ağır süzülen bulut gölgeleri. Kullanıcı (21.10): "fog ve görsel güzellikler".
//
// Adlar ve pusula durağan katmana (draw.js still) bir kere çizilir; bulutlar her karede.
// Burada harita noktası (x, y) katman pikseline şöyle iner: X = ox + x * k * dpr.

import { project } from "../geo.js";
import { TAU } from "./kit.js";

// [ad, boylam, enlem, açı (derece, saat yönü), büyüklük]
const SEAS = [
  ["MARE NOSTRUM", 18.2, 33.9, 0, 1.6],
  ["MARE TYRRHENUM", 11.4, 39.7, -8, 1],
  ["MARE ADRIATICUM", 15.7, 43.0, 38, 0.95],
  ["MARE IONIUM", 19.3, 37.2, 0, 1],
  ["MARE AEGAEUM", 25.1, 38.4, -78, 0.85],
  ["PONTUS EUXINUS", 34.2, 43.1, -3, 1.3],
  ["MARE CASPIUM", 50.9, 41.7, -82, 1.1],
  ["SINUS ARABICUS", 34.9, 27.4, 57, 0.75],
  ["SINUS PERSICUS", 50.4, 27.6, 33, 0.8],
  ["OCEANUS ATLANTICUS", -10.2, 40.3, -90, 1.05],
  ["MARE BALEARICUM", 5.0, 39.1, -12, 0.85],
  ["SINUS GALLICUS", 4.4, 42.4, 0, 0.7],
  ["MAEOTIS", 36.7, 46.2, 0, 0.7],
  ["PROPONTIS", 28.1, 40.75, 0, 0.55],
];
const LANDS = [
  ["HISPANIA", -4.0, 39.6, 0, 1.1],
  ["GALLIA", 0.2, 45.4, 0, 1.1],
  ["GERMANIA", 10.5, 50.6, 0, 1],
  ["ITALIA", 14.6, 41.7, 45, 0.7],
  ["ILLYRICUM", 18.4, 44.1, 0, 0.8],
  ["DACIA", 25.0, 46.7, 0, 0.9],
  ["THRACIA", 25.0, 41.75, 0, 0.7],
  ["SCYTHIA", 37.0, 49.6, 0, 1.2],
  ["SARMATIA", 46.0, 47.8, 0, 1],
  ["ASIA MINOR", 31.0, 38.2, 0, 0.9],
  ["ARMENIA", 41.6, 39.3, 0, 0.8],
  ["SYRIA", 38.4, 34.7, 0, 0.8],
  ["MESOPOTAMIA", 41.8, 35.9, 0, 0.75],
  ["ARABIA", 42.5, 28.6, 0, 1.2],
  ["AEGYPTUS", 29.6, 27.4, 0, 1],
  ["LIBYA", 20.5, 29.2, 0, 1.2],
  ["NUMIDIA", 4.2, 34.3, 0, 0.85],
  ["MAURETANIA", -5.4, 32.9, 0, 0.9],
  ["MEDIA", 47.4, 33.6, 0, 0.85],
  ["PERSIS", 53.0, 30.0, 0, 0.95],
  ["PARTHIA", 57.2, 35.2, 0, 0.9],
];
const COMPASS = [-7.4, 28.8];

const AT = Object.fromEntries([...SEAS, ...LANDS].map(([n, lon, lat]) => [n, project(lon, lat)]));

/** Deniz ve bölge adları: denizler açık renk italik, karalar soluk kahve, aralıklı harfler. */
export function paintLabels(ctx, ox, oy, k, dpr) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const put = ([name, , , angle, scale], sea) => {
    const m = AT[name];
    const size = (sea ? Math.max(11, Math.min(26, 0.3 * k)) : Math.max(13, Math.min(34, 0.42 * k))) * scale * dpr;
    ctx.font = sea ? `italic 500 ${size}px "EB Garamond", Georgia, serif` : `600 ${size}px "Cinzel", Georgia, serif`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${Math.round(size * (sea ? 0.3 : 0.45))}px`;
    ctx.save();
    ctx.translate(ox + m.x * k * dpr, oy + m.y * k * dpr);
    ctx.rotate((angle * Math.PI) / 180);
    if (sea) {
      ctx.fillStyle = "rgba(14,40,52,0.25)";
      ctx.fillText(name, 0.8 * dpr, 1 * dpr);
      ctx.fillStyle = "rgba(232,241,238,0.66)";
    } else ctx.fillStyle = "rgba(62,40,16,0.3)";
    ctx.fillText(name, 0, 0);
    ctx.restore();
  };
  for (const l of LANDS) put(l, false);
  for (const s of SEAS) put(s, true);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.restore();
}

/** Pusula gülü: haritanın sol altında, Moritanya çölünde - eski haritaların köşe süsü. */
export function paintCompass(ctx, ox, oy, k, dpr) {
  const m = project(COMPASS[0], COMPASS[1]);
  const r = Math.max(26, Math.min(72, 1.0 * k)) * dpr;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, ox + m.x * k * dpr, oy + m.y * k * dpr);
  ctx.globalAlpha = 0.85;
  // Halkalar ve derece çentikleri
  ctx.strokeStyle = "#4a3418";
  ctx.lineWidth = 1.2 * dpr;
  for (const rr of [r * 0.98, r * 0.86]) {
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, TAU);
    ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i < 32; i++) {
    const t = (i / 32) * TAU, a = i % 4 ? r * 0.92 : r * 0.86;
    ctx.moveTo(Math.cos(t) * a, Math.sin(t) * a);
    ctx.lineTo(Math.cos(t) * r * 0.98, Math.sin(t) * r * 0.98);
  }
  ctx.lineWidth = 0.8 * dpr;
  ctx.stroke();
  // Kollar: önce dört ara yön (kısa), sonra dört ana yön (uzun); her kol iki tonlu.
  const arm = (t, len, wide, light, dark) => {
    const c = Math.cos(t), s = Math.sin(t), px = -s, py = c;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(c * len, s * len);
    ctx.lineTo(px * wide, py * wide);
    ctx.closePath();
    ctx.fillStyle = light;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(c * len, s * len);
    ctx.lineTo(-px * wide, -py * wide);
    ctx.closePath();
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.strokeStyle = "#3a2810";
    ctx.lineWidth = 0.7 * dpr;
    ctx.beginPath();
    ctx.moveTo(px * wide, py * wide);
    ctx.lineTo(c * len, s * len);
    ctx.lineTo(-px * wide, -py * wide);
    ctx.stroke();
  };
  for (let i = 0; i < 4; i++) arm(Math.PI / 4 + (i * Math.PI) / 2, r * 0.58, r * 0.1, "#e8d7ae", "#9a7a45");
  for (let i = 0; i < 4; i++) arm(-Math.PI / 2 + (i * Math.PI) / 2, r * 0.84, r * 0.15, i === 0 ? "#f0dfa8" : "#efe3c4", i === 0 ? "#a5321f" : "#5a4426");
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.07, 0, TAU);
  ctx.fillStyle = "#c9a45a";
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#3a2810";
  ctx.font = `700 ${r * 0.26}px "Cinzel", Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", 0, -r * 1.16);
  ctx.restore();
}

// ---- sis ----

let fogCanvas = null, puffs = null;

/** Sisin dokusu: 512 piksellik, kenarları birbirine uyan bir karo; yumuşak beyaz ve gri lekeler. */
function mist() {
  if (puffs) return puffs;
  puffs = document.createElement("canvas");
  puffs.width = puffs.height = 512;
  const g = puffs.getContext("2d");
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 512, y = rnd() * 512, r = 30 + rnd() * 110;
    const light = rnd() < 0.65;
    for (const dx of [-512, 0, 512]) {
      for (const dy of [-512, 0, 512]) {
        const rg = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        rg.addColorStop(0, light ? `rgba(246,246,242,${0.12 + rnd() * 0.16})` : `rgba(96,104,110,${0.08 + rnd() * 0.08})`);
        rg.addColorStop(1, "rgba(250,250,246,0)");
        g.fillStyle = rg;
        g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
      }
    }
  }
  return puffs;
}

/**
 * Savaş sisi: katmanın tamamına dokulu, yarı saydam bir sis; görülen her yerleşimin çevresi ve
 * dost toprakları yumuşak kenarla silinir. Doku haritaya bağlı: kaydırınca sisle birlikte kayar.
 * `seen`: görülen yerleşimler, `friends`: kendi ve müttefik yerleşimler, `pos`: harita noktaları.
 */
export function paintFog(ctx, canvas, cells, pos, seen, friends, ox, oy, k, dpr) {
  const W = canvas.width, H = canvas.height;
  fogCanvas ??= document.createElement("canvas");
  if (fogCanvas.width !== W || fogCanvas.height !== H) { fogCanvas.width = W; fogCanvas.height = H; }
  const f = fogCanvas.getContext("2d");
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.globalCompositeOperation = "source-over";
  f.clearRect(0, 0, W, H);
  f.fillStyle = "rgba(170,176,174,0.42)";
  f.fillRect(0, 0, W, H);
  const pat = f.createPattern(mist(), "repeat");
  pat.setTransform?.(new DOMMatrix([1, 0, 0, 1, ox % 512, oy % 512]));
  f.fillStyle = pat;
  f.fillRect(0, 0, W, H);

  // Görülen yerler: çevreleri yumuşakça açılır.
  f.globalCompositeOperation = "destination-out";
  f.setTransform(dpr * k, 0, 0, dpr * k, ox, oy);
  const R1 = 0.9, R2 = 2.1;
  for (const id of seen) {
    const p = pos[id];
    const g = f.createRadialGradient(p.x, p.y, R1, p.x, p.y, R2);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    f.fillStyle = g;
    f.fillRect(p.x - R2, p.y - R2, 2 * R2, 2 * R2);
  }
  // Dost topraklar tamamen açık; kenarı gölge bulanıklığıyla yumuşak.
  f.shadowColor = "rgba(0,0,0,1)";
  f.shadowBlur = 28 * dpr;
  f.fillStyle = "rgba(0,0,0,1)";
  for (const c of cells) if (friends.has(c.id)) f.fill(c.path);
  f.shadowBlur = 0;
  f.globalCompositeOperation = "source-over";

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(fogCanvas, 0, 0);
  ctx.restore();
}

/** Bu harita noktası sisten açık mı (yürüyen ordu sisin içinde görünmesin). */
export function clear(m, seen, pos) {
  for (const id of seen) if (Math.hypot(pos[id].x - m.x, pos[id].y - m.y) < 1.6) return true;
  return false;
}

// ---- bulutlar ----
//
// Batıdan doğuya ağır ağır süzülen gölgeler (her karede, çok ucuz: on degrade). Uzaktan bakınca
// üstlerinde soluk beyaz bulutlar da görünür; yakında sadece gölgeleri.

const CLOUDS = Array.from({ length: 11 }, (_, i) => ({
  x: (i * 7.31) % 66, y: 1.5 + ((i * 11.7) % 24), rx: 3 + (i % 3) * 1.6, ry: 1.5 + (i % 2) * 1.0, v: 0.05 + (i % 4) * 0.014,
}));

let cloudSprites = null;
/** Bulut gölgesi ve beyaz bulut: bir kere küçük tuvallere çizilir, her karede sadece kopyalanır. */
function sprites() {
  if (cloudSprites) return cloudSprites;
  cloudSprites = ["rgba(14,20,26,A)", "rgba(250,250,246,A)"].map((color) => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const g = c.getContext("2d");
    const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, color.replace("A", 1));
    rg.addColorStop(0.6, color.replace("A", 0.55));
    rg.addColorStop(1, color.replace("A", 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    return c;
  });
  return cloudSprites;
}

export function drawClouds(ctx, cam, dpr, width, t) {
  const k = cam.scale, zoom = cam.scale / cam.min;
  const white = Math.max(0, Math.min(1, (2.2 - zoom) / 1.2));
  const [shadow, puff] = sprites();
  ctx.save();
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (cam.w / 2 - cam.x * k), dpr * (cam.h / 2 - cam.y * k));
  const hw = cam.w / 2 / k + 8, hh = cam.h / 2 / k + 5;
  for (const c of CLOUDS) {
    const x = ((c.x + t * c.v) % (width + 14)) - 7;
    if (Math.abs(x - cam.x) > hw || Math.abs(c.y - cam.y) > hh) continue;
    ctx.globalAlpha = 0.13;
    ctx.drawImage(shadow, x - c.rx, c.y - c.ry, 2 * c.rx, 2 * c.ry);
    if (white > 0) {
      ctx.globalAlpha = 0.3 * white;
      ctx.drawImage(puff, x - 0.9 - c.rx, c.y - 1.1 - c.ry, 2 * c.rx, 2 * c.ry);
      ctx.globalAlpha = 0.2 * white;
      ctx.drawImage(puff, x - 0.2 - c.rx * 0.8, c.y - 1.4 - c.ry * 0.8, 1.6 * c.rx, 1.6 * c.ry);
    }
  }
  ctx.restore();
}
