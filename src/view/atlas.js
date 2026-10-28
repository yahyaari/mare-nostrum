// Haritanın süsleri, eski atlaslardaki gibi: Latince deniz ve bölge adları, pusula gülü, savaş
// sisi, ağır ağır süzülen bulut gölgeleri. Kullanıcı (21.10): "fog ve görsel güzellikler".
//
// Adlar ve pusula durağan katmana (draw.js still) bir kere çizilir; bulutlar her karede.
// Burada harita noktası (x, y) katman pikseline şöyle iner: X = ox + x * k * dpr.

import { project } from "../geo.js";
import { TAU } from "./kit.js";
import { ROADS } from "../data/world.js";
import { roadLine } from "../rules/graph.js";
import { PASSES, crossings } from "../rules/ground.js";

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
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const put = ([name, , , angle, scale], sea) => {
    const m = AT[name];
    const size = (sea ? Math.max(11, Math.min(26, 0.3 * k)) : Math.max(13, Math.min(34, 0.42 * k))) * scale * dpr;
    // Katmanın dışına düşen ad hiç yazılmaz (yazı ayarı ve çizimi pahalı: yeniden çizimin en
    // uzun parçasıydı). Payı adın kabaca boyu kadar.
    const x = ox + m.x * k * dpr, y = oy + m.y * k * dpr, reach = size * (name.length * 1.1 + 1);
    if (x < -reach || y < -reach || x > W + reach || y > H + reach) return;
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

/**
 * Arazi işaretleri: dağ geçidi olan yolun ortasında iki tepe, nehir geçişinde küçük bir köprü
 * (kurallar.md 22). Uzaktan bakınca çizilmez.
 */
export function paintGround(ctx, ox, oy, k, dpr) {
  if (k < 40) return;
  const s = Math.min(1.3, k / 70) * dpr;
  const at = (lon, lat) => { const m = project(lon, lat); return [ox + m.x * k * dpr, oy + m.y * k * dpr]; };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const r of ROADS) {
    if (r.sea || !PASSES.has(r.a < r.b ? r.a + "|" + r.b : r.b + "|" + r.a)) continue;
    // Yolun gerçek ortası (uzunluğunun yarısı): iki noktalı yolda ortadaki nokta bir uçtu.
    const pts = roadLine(r);
    const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
    let half = seg.reduce((n, d) => n + d, 0) / 2, i = 0;
    while (i < seg.length - 1 && half > seg[i]) half -= seg[i++];
    const f = seg[i] ? half / seg[i] : 0;
    const [x, y] = at(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f);
    ctx.beginPath();
    ctx.moveTo(x - 9 * s, y + 4 * s);
    ctx.lineTo(x - 3 * s, y - 6 * s);
    ctx.lineTo(x + 1 * s, y - 1 * s);
    ctx.lineTo(x + 4 * s, y - 5 * s);
    ctx.lineTo(x + 9 * s, y + 4 * s);
    ctx.closePath();
    ctx.fillStyle = "rgba(92,72,48,0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(245,236,214,0.9)";
    ctx.lineWidth = 1.2 * dpr;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 4.6 * s, y - 3.6 * s);
    ctx.lineTo(x - 3 * s, y - 6 * s);
    ctx.lineTo(x - 1.6 * s, y - 4 * s);
    ctx.strokeStyle = "rgba(250,250,250,0.95)";
    ctx.stroke();
  }
  for (const p of Object.values(crossings())) {
    const [x, y] = at(p[0], p[1]);
    ctx.beginPath();
    ctx.moveTo(x - 7 * s, y + 2 * s);
    ctx.quadraticCurveTo(x, y - 6 * s, x + 7 * s, y + 2 * s);
    ctx.strokeStyle = "rgba(40,28,16,0.85)";
    ctx.lineWidth = 3.2 * dpr;
    ctx.stroke();
    ctx.strokeStyle = "rgba(226,206,160,0.95)";
    ctx.lineWidth = 1.6 * dpr;
    ctx.stroke();
    ctx.beginPath();
    for (const dx of [-5, 0, 5]) { ctx.moveTo(x + dx * s, y - (dx === 0 ? 2 : 0) * s); ctx.lineTo(x + dx * s, y + 3 * s); }
    ctx.strokeStyle = "rgba(40,28,16,0.85)";
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
  }
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
export function paintFog(ctx, canvas, cells, eyes, friends, ox, oy, k, dpr) {
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

  // Gözler (yerleşimler ve ordular, rules/sight.js): çemberleri yumuşakça açılır.
  f.globalCompositeOperation = "destination-out";
  f.setTransform(dpr * k, 0, 0, dpr * k, ox, oy);
  for (const e of eyes) {
    const g = f.createRadialGradient(e.x, e.y, e.r * 0.5, e.x, e.y, e.r);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    f.fillStyle = g;
    f.fillRect(e.x - e.r, e.y - e.r, 2 * e.r, 2 * e.r);
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

/** Bu harita noktası sisten açık mı (sisin içindeki ordu görünmesin): bir gözün çemberinde. */
export const clear = (m, eyes) => eyes.some((e) => Math.hypot(e.x - m.x, e.y - m.y) <= e.r);

// ---- bulutlar ----
//
// Batıdan doğuya ağır ağır süzülen gölgeler (her karede, çok ucuz: on degrade). Uzaktan bakınca
// üstlerinde soluk beyaz bulutlar da görünür; yakında sadece gölgeleri.

const CLOUDS = Array.from({ length: 11 }, (_, i) => ({
  x: (i * 7.31) % 66, y: 1.5 + ((i * 11.7) % 24), rx: 3 + (i % 3) * 1.6, ry: 1.5 + (i % 2) * 1.0, v: 0.05 + (i % 4) * 0.014,
}));

/** Kışın kar: ekranda ağır ağır inen taneler (her karede, zamana bağlı; rastgelelik yok). */
export function drawSnow(ctx, cam, dpr, t) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  for (let i = 0; i < 90; i++) {
    const sx = (i * 137.5) % cam.w, speed = 14 + (i % 7) * 4;
    const y = ((i * 71.3 + t * speed) % (cam.h + 20)) - 10;
    const x = (sx + Math.sin(t * 0.8 + i) * 14 + t * 6) % cam.w;
    ctx.globalAlpha = 0.45 + (i % 5) * 0.1;
    ctx.beginPath();
    ctx.arc(x, y, 1 + (i % 3) * 0.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** Sonbaharda turuncu yapraklar, ilkbaharda beyaz-pembe çiçek yaprakları: kar gibi ama seyrek, dönerek süzülür. */
export function drawPetals(ctx, cam, dpr, t, season) {
  const autumn = season === "autumn";
  const colors = autumn ? ["#c8742a", "#a8501e", "#d9a03a"] : ["#f6e6ea", "#f2cdd6", "#ffffff"];
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let i = 0; i < (autumn ? 34 : 26); i++) {
    const speed = 10 + (i % 5) * 4;
    const y = ((i * 97.1 + t * speed) % (cam.h + 20)) - 10;
    const x = ((i * 173.3) % cam.w + Math.sin(t * 0.7 + i) * 26 + t * 14) % cam.w;
    ctx.globalAlpha = 0.55 + (i % 3) * 0.12;
    ctx.fillStyle = colors[i % 3];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * (1 + (i % 3) * 0.6) + i);
    ctx.beginPath();
    ctx.ellipse(0, 0, autumn ? 4.2 : 3.2, autumn ? 2.1 : 1.8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

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
