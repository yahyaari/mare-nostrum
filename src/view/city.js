// Şehir manzarası (kullanıcı 28.10, "güzel görünmesi için" önerilerden 1.: Total War'daki yerleşim görünümü gibi):
// şehrin kendisi geniş bir sahnede ve yapılan her şey yerinde. Arkada akropolde tapınak, surların ardında evler (şehir
// seviyesi kadar sıra), okul, hamam, akademi, harika; önde surlar, kapı ve üstünde nöbetçiler (garnizon kadar); solda
// tarlalar, sağda (limanda solda arkada) bacalı demirhaneler, önde pazar ve kışlanın talim alanı; limanda rıhtım,
// demirli savaş gemileri, balıkçılar, tersane, tüccar gemileri ve fener. Yapılan inşaatın üstünde iskele, kuşatılan
// şehrin önünde düşman kampı ve dumanlar. Mevsimle toprak ve gök değişir; bulutlar, duman, dalgalar, talim canlı.
//
// Sahne 1000 x 440 birimlik sanal bir tuvalde çizilir (üstten TOP kadarı görünmez), istenen kutuya ölçeklenir. Dönen: üstüne gelinip basılabilen
// yerler ({ what, x, y, w, h } ekran koordinatıyla; what bir yapı adı, "spec" ya da "wonder:<id>").

import { TAU, colorOf } from "./kit.js";
import { DARK, GOLD, GOLD_LIGHT, galley, shade } from "./pieces.js";
import { amphora, barn, boat, crane, dome, field, flag, forge, house, hull, palisade, scroll, stall, temple, tent, tower } from "./buildings.js";
import { trooper } from "./battle.js";

// Gökün üst kısmı kadrajın dışında (TOP): şehir büyük görünsün.
const VW = 1000, VH = 440, HORIZON = 205, TOP = 95;

/** Mevsimin renkleri: gök üst ve alt, toprak üst ve alt, tarla. */
const SEASON = {
  spring: { sky: ["#7fb0d0", "#e8e2c8"], ground: ["#93ad66", "#6f8a4a"], crop: ["#9cbf5a", "#b9cf6a"] },
  summer: { sky: ["#6fa6cf", "#f1e4c0"], ground: ["#b4a660", "#8c8048"], crop: ["#d9b24a", "#c99a35"] },
  autumn: { sky: ["#8ea6b8", "#ead6b0"], ground: ["#a98d55", "#7e6a40"], crop: ["#b8803a", "#a46a2c"] },
  winter: { sky: ["#9fb1bd", "#e3e6e4"], ground: ["#e4e8e6", "#c4ccc8"], crop: ["#dfe3e2", "#cfd5d3"] },
};

/** Şehre göre sabit rastgele: aynı şehir her açılışta aynı görünür. */
function seeded(id) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

/**
 * Şehrin manzarası. `o`: { id, owner, kind ("city" | "castle"), capital, port, walls, works (yapıların seviyeleri ve
 * `spec`), builds (süren inşaatlar), guards (garnizondaki asker), fleet (limandaki gemi), besieger (kuşatanın sahibi ya
 * da undefined), wonders (harika adları), season }. `r`: ekrandaki kutu. `now`: ms.
 */
export function drawCityView(ctx, o, r, now) {
  const k = Math.min(r.w / VW, r.h / (VH - TOP)), t = now / 1000;
  const W = o.works ?? {}, lv = (key) => Math.max(0, W[key] ?? 0);
  const S = SEASON[o.season] ?? SEASON.summer, color = colorOf(o.owner);
  const rnd = seeded(o.id);
  const spots = [];
  const spot = (what, x, y, w, h) => spots.push({ what, x: r.x + x * k, y: r.y + (y - TOP) * k, w: w * k, h: h * k });
  const port = !!o.port, level = Math.max(1, lv("level"));
  const core = port ? { x0: 250, x1: 650 } : { x0: 300, x1: 720 };
  const mid = (core.x0 + core.x1) / 2;
  const building = new Set((o.builds ?? []).map((b) => b.what));
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, VW * k, (VH - TOP) * k);
  ctx.clip();
  ctx.translate(r.x, r.y - TOP * k);
  ctx.scale(k, k);

  // Kendi resmin (art/city/<yer> ya da art/city/backdrop; Docs/gorseller.md): gökü ve uzak tepeleri kaplar, şehir önüne çizilir.
  if (o.backdrop) {
    const img = o.backdrop, bw = VW, bh = HORIZON + 60 - TOP, s2 = Math.max(bw / img.width, bh / img.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, TOP, bw, bh);
    ctx.clip();
    ctx.drawImage(img, (bw - img.width * s2) / 2, TOP + (bh - img.height * s2) / 2, img.width * s2, img.height * s2);
    ctx.restore();
  }
  // Gök, güneş, bulutlar.
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON + 20);
  sky.addColorStop(0, S.sky[0]);
  sky.addColorStop(1, S.sky[1]);
  ctx.fillStyle = sky;
  if (!o.backdrop) ctx.fillRect(0, 0, VW, HORIZON + 20);
  const sun = ctx.createRadialGradient(170, 135, 4, 170, 135, 70);
  sun.addColorStop(0, "rgba(255,246,214,0.95)");
  sun.addColorStop(0.25, "rgba(255,236,190,0.5)");
  sun.addColorStop(1, "rgba(255,236,190,0)");
  ctx.fillStyle = sun;
  if (!o.backdrop) ctx.fillRect(100, 65, 140, 140);
  for (let i = 0; i < (o.backdrop ? 0 : 5); i++) {
    const cx = ((i * 260 + t * (6 + i * 1.5)) % (VW + 260)) - 130, cy = 118 + (i % 3) * 18;
    cloud(ctx, cx, cy, 0.7 + (i % 2) * 0.4);
  }
  // Uzak dağlar ve tepeler (kendi resmin yoksa).
  if (!o.backdrop) {
    ctx.fillStyle = shade(S.ground[1], -0.05);
    ctx.globalAlpha = 0.45;
    ridge(ctx, 0, HORIZON - 30, VW, 34, rnd, 9);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = shade(S.ground[0], -0.12);
    ridge(ctx, 0, HORIZON - 8, VW, 20, rnd, 14);
    ctx.globalAlpha = 1;
  }
  // Toprak.
  const ground = ctx.createLinearGradient(0, HORIZON, 0, VH);
  ground.addColorStop(0, S.ground[0]);
  ground.addColorStop(1, S.ground[1]);
  ctx.fillStyle = ground;
  ctx.fillRect(0, HORIZON, VW, VH - HORIZON);
  // Deniz (liman): sağda, kıyı çizgisi kavisli; dalgalar kayar.
  if (port) sea(ctx, t, S);
  // Kapıdan aşağı inen yol.
  ctx.fillStyle = shade(S.ground[1], 0.18);
  ctx.beginPath();
  ctx.moveTo(mid - 14, 330);
  ctx.lineTo(mid + 14, 330);
  ctx.lineTo(mid + 60, VH);
  ctx.lineTo(mid - 60, VH);
  ctx.closePath();
  ctx.fill();

  // ---- arka: akropol ve tapınak, harika, okul, hamam, akademi ----
  ctx.fillStyle = shade(S.ground[0], -0.08);
  ctx.beginPath();
  ctx.ellipse(mid - 50, 262, 110, 46, 0, Math.PI, TAU);
  ctx.fill();
  if (lv("temple") > 0) {
    temple(ctx, mid - 50, 222, 1.7 + 0.15 * Math.min(5, lv("temple")));
    spot("temple", mid - 50 - 32, 170, 64, 54);
  }
  if (building.has("temple")) scaffold(ctx, mid - 50, 222, 70, 50);
  if (o.wonders?.length) {
    monument(ctx, mid + 70, 250, color, t);
    spot("wonder:" + o.wonders[0], mid + 40, 168, 60, 84);
  }
  // Evler: şehir seviyesi kadar sıra, her sırada 5-8 ev; kalede az ve sıkışık.
  const rows = o.kind === "castle" ? Math.min(2, level) : Math.min(5, level + 1);
  for (let row = 0; row < rows; row++) {
    const y = 236 + row * 14 + (rows < 4 ? 20 : 0), n = 5 + Math.min(3, level) + (row % 2);
    for (let i = 0; i < n; i++) {
      const x = core.x0 + 20 + ((i + (row % 2) * 0.5) * (core.x1 - core.x0 - 40)) / n + (rnd() - 0.5) * 10;
      if (Math.abs(x - (mid - 50)) < 70 && row === 0 && lv("temple") > 0) continue; // akropolün önü açık
      house(ctx, x, y, 1.9 + rnd() * 0.5 + (level >= 4 && rnd() < 0.3 ? 0.4 : 0));
    }
  }
  spot("level", core.x0 + 10, 222, core.x1 - core.x0 - 20, 70);
  if (building.has("level")) scaffold(ctx, mid + 110, 286, 70, 50);
  if (lv("school") > 0) {
    temple(ctx, core.x0 + 70, 280, 1.15);
    scroll(ctx, core.x0 + 100, 286, 1.4);
    spot("school", core.x0 + 40, 238, 70, 48);
  }
  if (building.has("school")) scaffold(ctx, core.x0 + 70, 280, 50, 40);
  if (lv("baths") > 0) {
    dome(ctx, core.x1 - 70, 282, 1.8);
    steam(ctx, core.x1 - 50, 270, t);
    spot("baths", core.x1 - 100, 238, 60, 46);
  }
  if (building.has("baths")) scaffold(ctx, core.x1 - 70, 282, 50, 40);
  if (lv("academy") > 0) {
    temple(ctx, mid + 120, 270, 1.0);
    flag(ctx, mid + 150, 270, 1.6, o.owner);
    spot("academy", mid + 95, 230, 70, 42);
  }
  if (building.has("academy")) scaffold(ctx, mid + 120, 270, 45, 36);

  // ---- surlar, kapı, nöbetçiler; sur yoksa alçak çit ----
  if (o.walls) {
    const castle = o.walls === "castle", h = castle ? 52 : 40, base = 336;
    wall(ctx, core.x0 - 14, core.x1 + 14, base, h, castle);
    // Kapı: ortada kemer, iki yanında kule.
    gate(ctx, mid, base, h, castle);
    flag(ctx, mid - 34, base - h - 18, 2, o.owner);
    flag(ctx, mid + 34, base - h - 18, 2, o.owner);
    // Nöbetçiler: garnizonun her 25 askerine bir, en çok 14.
    const n = Math.min(14, Math.ceil((o.guards ?? 0) / 25));
    for (let i = 0; i < n; i++) {
      const gx = core.x0 + 10 + ((i + 0.5) * (core.x1 - core.x0 - 20)) / n;
      if (Math.abs(gx - mid) < 44) continue;
      trooper(ctx, i % 3 === 2 ? "arch" : "inf", o.owner, gx, base - h + 1, i % 2 ? 1 : -1, 0.62);
    }
    spot("walls", core.x0 - 14, base - h - 6, core.x1 - core.x0 + 28, h + 6);
  } else {
    palisade(ctx, mid, 332, core.x1 - core.x0, 2);
  }
  // Şehrin yolu: kapının üstünde sahibinin renginde uzun bir sancak ve yolun simgesi.
  if (W.spec || [...building].some((b) => b.startsWith("spec:"))) {
    const sp = W.spec ?? [...building].find((b) => b.startsWith("spec:")).slice(5);
    pennant(ctx, mid, o.walls ? 336 - (o.walls === "castle" ? 52 : 40) + 4 : 300, color, sp, !W.spec);
    spot("spec", mid - 18, o.walls ? 280 : 250, 36, 64);
  }

  // ---- solda tarlalar ----
  const farmX0 = 18, farmX1 = core.x0 - 26;
  const strips = Math.min(12, lv("farms") * 2);
  for (let i = 0; i < strips; i++) {
    const y = 352 + i * 7, inset = (12 - i) * 2.5;
    ctx.beginPath();
    ctx.moveTo(farmX0 + inset, y);
    ctx.lineTo(farmX1 - inset * 0.3, y);
    ctx.lineTo(farmX1 - inset * 0.3 - 8, y + 6);
    ctx.lineTo(farmX0 + inset - 6, y + 6);
    ctx.closePath();
    ctx.fillStyle = S.crop[i % 2];
    ctx.fill();
    ctx.strokeStyle = "rgba(80,60,30,0.35)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  if (lv("farms") > 0) {
    for (let i = 0; i < 1 + Math.floor(lv("farms") / 2); i++) barn(ctx, farmX0 + 40 + i * 46, 344 - (i % 2) * 6, 2.2);
    if (W.spec === "farm") for (let i = 0; i < 3; i++) granary(ctx, farmX1 - 30 - i * 26, 346);
    spot("farms", farmX0, 300, farmX1 - farmX0, 140);
  }
  if (building.has("farms")) scaffold(ctx, farmX0 + 90, 360, 70, 40);

  // ---- demirhaneler: sağda (limanda solda, arkada) ----
  const forgeAt = port ? { x: 60, y: 300, dx: 46 } : { x: core.x1 + 50, y: 330, dx: 52 };
  const forges = Math.min(5, lv("industry"));
  for (let i = 0; i < forges; i++) {
    const fx = forgeAt.x + i * forgeAt.dx, fy = forgeAt.y + (i % 2) * 8;
    forge(ctx, fx, fy, 1.7, 1 + (i % 2));
    smoke(ctx, fx - 14, fy - 32, t + i * 1.7, W.spec === "forge" ? 1.4 : 1);
    if (W.spec === "forge") glow(ctx, fx - 2, fy - 4, t + i);
  }
  if (forges) spot("industry", forgeAt.x - 30, forgeAt.y - 70, forges * forgeAt.dx + 30, 80);
  if (building.has("industry")) scaffold(ctx, forgeAt.x + 10, forgeAt.y, 60, 44);

  // ---- önde pazar (kapının solunda) ----
  const stalls = lv("market") > 0 ? Math.min(6, lv("market") + 1) : 0;
  for (let i = 0; i < stalls; i++) stall(ctx, mid - 70 - (i % 3) * 30, 370 + Math.floor(i / 3) * 34 - (i % 3) * 4, 2.2, o.owner);
  if (W.spec === "trade") caravan(ctx, mid + 32, 400, t);
  if (stalls) spot("market", mid - 150, 330, 110, 100);
  if (building.has("market")) scaffold(ctx, mid - 100, 380, 60, 40);

  // ---- önde kışla: çit, çadırlar, talim eden askerler ----
  const bx0 = mid + 60, bx1 = port ? core.x1 + 20 : core.x1 + 10;
  if (lv("barracks") > 0) {
    palisade(ctx, (bx0 + bx1) / 2, 362, bx1 - bx0, 1.6);
    const tents = Math.min(6, lv("barracks") + (W.spec === "camp" ? 1 : 0));
    for (let i = 0; i < tents; i++) tent(ctx, bx0 + 18 + i * ((bx1 - bx0 - 36) / Math.max(1, tents - 1)), 352, 20, o.owner);
    const drill = Math.min(W.spec === "camp" ? 12 : 8, 2 + lv("barracks") * 2);
    for (let i = 0; i < drill; i++) {
      const col = i % 4, row = Math.floor(i / 4), step = Math.sin(t * 4 + i) * 2;
      trooper(ctx, "inf", o.owner, bx0 + 30 + col * 26 + step, 396 + row * 18, 1, 0.8);
    }
    spot("barracks", bx0, 320, bx1 - bx0, 110);
  }
  if (building.has("barracks")) scaffold(ctx, (bx0 + bx1) / 2, 380, 60, 40);

  // ---- liman ----
  if (port) harbour(ctx, o, W, lv, t, spot, building, color);

  // ---- kuşatma: önde düşman kampı, şehirden dumanlar ----
  if (o.besieger !== undefined) {
    for (let i = 0; i < 5; i++) tent(ctx, 40 + i * 34, 432 - (i % 2) * 8, 22, o.besieger);
    for (let i = 0; i < 4; i++) trooper(ctx, "inf", o.besieger, 70 + i * 30, 420 - (i % 2) * 6, -1, 0.75);
    for (let i = 0; i < 3; i++) smoke(ctx, core.x0 + 60 + i * 120, 250, t + i * 2.3, 1.8);
  }

  // Kenarlarda hafif karartma (resim çerçevesi gibi).
  const v = ctx.createRadialGradient(VW / 2, (VH + TOP) / 2, VH * 0.4, VW / 2, (VH + TOP) / 2, VW * 0.6);
  v.addColorStop(0, "rgba(20,14,8,0)");
  v.addColorStop(1, "rgba(20,14,8,0.35)");
  ctx.fillStyle = v;
  ctx.fillRect(0, TOP, VW, VH - TOP);
  ctx.restore();
  return spots;
}

// ---- parçalar ----

function cloud(ctx, x, y, s) {
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  for (const [dx, dy, rr] of [[0, 0, 18], [20, -6, 22], [42, 0, 17], [22, 6, 18]]) {
    ctx.moveTo(x + (dx + rr) * s, y + dy * s);
    ctx.arc(x + dx * s, y + dy * s, rr * s, 0, TAU);
  }
  ctx.fill();
}

/** Uzak sırt: sabit rastgele tepelerle yumuşak bir çizgi. */
function ridge(ctx, x0, y, w, h, rnd, n) {
  ctx.beginPath();
  ctx.moveTo(x0, y + h);
  const pts = Array.from({ length: n + 1 }, (_, i) => [x0 + (i * w) / n, y + h * (0.2 + rnd() * 0.8) - h * 0.6]);
  ctx.lineTo(...pts[0]);
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1], [qx, qy] = pts[i];
    ctx.quadraticCurveTo(px + (qx - px) / 2, Math.min(py, qy) - h * 0.3, qx, qy);
  }
  ctx.lineTo(x0 + w, y + 40);
  ctx.lineTo(x0, y + 40);
  ctx.closePath();
  ctx.fill();
}

function sea(ctx, t, S) {
  const g = ctx.createLinearGradient(0, HORIZON, 0, VH);
  g.addColorStop(0, "#5f93a8");
  g.addColorStop(1, "#2f6178");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(700, HORIZON);
  ctx.lineTo(VW, HORIZON);
  ctx.lineTo(VW, VH);
  ctx.lineTo(760, VH);
  ctx.quadraticCurveTo(700, 340, 720, 280);
  ctx.quadraticCurveTo(735, 240, 700, HORIZON);
  ctx.closePath();
  ctx.fill();
  // Kum şeridi.
  ctx.strokeStyle = S === SEASON.winter ? "#e8ece9" : "#d8c690";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(760, VH);
  ctx.quadraticCurveTo(700, 340, 720, 280);
  ctx.quadraticCurveTo(735, 240, 700, HORIZON);
  ctx.stroke();
  ctx.strokeStyle = "rgba(235,245,248,0.35)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    const x = 760 + ((i * 97 + t * 12) % 250), y = HORIZON + 12 + ((i * 53) % 220);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 7, y - 3, x + 14, y);
    ctx.stroke();
  }
}

/** Liman: rıhtım ve iskeleler, demirli savaş gemileri, balıkçılar, tersane, tüccar gemileri, fener. */
function harbour(ctx, o, W, lv, t, spot, building, color) {
  // Rıhtım: taş şerit ve denize uzanan iki iskele.
  ctx.fillStyle = "#b8a682";
  ctx.fillRect(700, 236, 26, 204);
  for (const y of [300, 380]) {
    ctx.fillStyle = "#8a6a46";
    ctx.fillRect(724, y, 120, 8);
    for (let x = 730; x < 844; x += 16) ctx.fillRect(x, y + 8, 3, 8);
  }
  // Demirli savaş gemileri (limandaki gemiler kadar, en çok 6), iskelelerin iki yanında.
  const ships = Math.min(6, o.fleet ?? 0);
  for (let i = 0; i < ships; i++) {
    const y = (i % 2 ? 380 : 300) + (Math.floor(i / 2) % 2 ? 26 : -8), x = 770 + Math.floor(i / 2) * 22;
    galley(ctx, o.owner, x, y + Math.sin(t * 1.5 + i) * 1.2, 1.5, { flip: i % 2 === 1 });
  }
  if (ships) spot("fleet", 740, 270, 140, 150);
  // Balıkçı tekneleri: açıkta, yavaşça.
  for (let i = 0; i < Math.min(4, lv("fishery")); i++) {
    const x = 880 + ((i * 47 + t * 4) % 110), y = 240 + i * 22;
    boat(ctx, x, y + Math.sin(t * 2 + i) * 1.5, 1.2, true);
  }
  if (lv("fishery") > 0) spot("fishery", 870, 225, 130, 95);
  // Tersane: kıyıda kızakta gövde, vinç.
  if (lv("shipyard") > 0) {
    hull(ctx, 670, 268, 1.5);
    crane(ctx, 694, 262, 1.6);
    spot("shipyard", 640, 222, 70, 52);
  }
  if (building.has("shipyard")) scaffold(ctx, 670, 268, 50, 40);
  // Ticaret: rıhtımda amforalar, ufukta gelip giden tüccar gemileri.
  if (lv("trade") > 0) {
    for (let i = 0; i < Math.min(6, lv("trade") + 2); i++) amphora(ctx, 706 + (i % 3) * 7, 352 + Math.floor(i / 3) * 12, 1.4);
    for (let i = 0; i < Math.min(3, lv("trade")); i++) boat(ctx, 760 + ((i * 140 + t * 9) % 260), HORIZON + 14 + i * 8, 1.1, false);
    spot("trade", 700, 330, 30, 50);
  }
  if (building.has("trade")) scaffold(ctx, 712, 360, 36, 34);
  // Fener: dalgakıranın ucunda, liman kalesiyle yükselir; 2. seviyeden sonra tepesinde ateş.
  if (lv("fort") > 0) {
    tower(ctx, 960, 300, 1.6, lv("fort"));
    if (lv("fort") >= 2) glow(ctx, 960, 300 - (20 + 4 * Math.min(4, lv("fort"))) * 1.6 - 8, t);
    flag(ctx, 960, 300 - (20 + 4 * Math.min(4, lv("fort"))) * 1.6 - 4, 1.4, o.owner);
    spot("fort", 940, 200, 40, 104);
  }
  if (building.has("fort")) scaffold(ctx, 960, 300, 30, 50);
}

/** Taş sur: dişli üst kenar, aralıklı kuleler. */
function wall(ctx, x0, x1, base, h, castle) {
  const stone = castle ? "#a89a82" : "#c9b892";
  ctx.fillStyle = stone;
  ctx.fillRect(x0, base - h, x1 - x0, h);
  ctx.strokeStyle = "rgba(60,46,30,0.75)";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x0, base - h, x1 - x0, h);
  // Taş sıraları.
  ctx.strokeStyle = "rgba(60,46,30,0.18)";
  for (let y = base - h + 9; y < base; y += 9) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
  // Mazgallar.
  ctx.fillStyle = stone;
  for (let x = x0; x < x1 - 4; x += 12) { ctx.fillRect(x, base - h - 6, 7, 6); ctx.strokeStyle = "rgba(60,46,30,0.55)"; ctx.strokeRect(x, base - h - 6, 7, 6); }
  // Kuleler.
  const n = Math.max(2, Math.round((x1 - x0) / 110));
  for (let i = 0; i <= n; i++) {
    const tx = x0 + (i * (x1 - x0)) / n;
    ctx.fillStyle = shade(stone, -0.06);
    ctx.fillRect(tx - 13, base - h - 16, 26, h + 16);
    ctx.strokeStyle = "rgba(60,46,30,0.75)";
    ctx.strokeRect(tx - 13, base - h - 16, 26, h + 16);
    for (let j = 0; j < 3; j++) { ctx.fillRect(tx - 13 + j * 10, base - h - 22, 6, 6); ctx.strokeRect(tx - 13 + j * 10, base - h - 22, 6, 6); }
    ctx.fillStyle = DARK;
    ctx.fillRect(tx - 2, base - h - 6, 4, 8);
  }
}

function gate(ctx, x, base, h, castle) {
  const stone = castle ? "#9c8e76" : "#bfae88";
  for (const dx of [-34, 34]) {
    ctx.fillStyle = stone;
    ctx.fillRect(x + dx - 15, base - h - 24, 30, h + 24);
    ctx.strokeStyle = "rgba(60,46,30,0.8)";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + dx - 15, base - h - 24, 30, h + 24);
    for (let j = 0; j < 3; j++) { ctx.fillRect(x + dx - 15 + j * 11, base - h - 30, 7, 6); ctx.strokeRect(x + dx - 15 + j * 11, base - h - 30, 7, 6); }
  }
  // Kemer ve ahşap kapı.
  ctx.fillStyle = "#4a3420";
  ctx.beginPath();
  ctx.moveTo(x - 16, base);
  ctx.lineTo(x - 16, base - h * 0.55);
  ctx.arc(x, base - h * 0.55, 16, Math.PI, TAU);
  ctx.lineTo(x + 16, base);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(20,14,8,0.6)";
  for (let i = -10; i <= 10; i += 5) { ctx.beginPath(); ctx.moveTo(x + i, base); ctx.lineTo(x + i, base - h * 0.6); ctx.stroke(); }
}

/** Şehrin yolunun sancağı: kapının üstünden sarkan uzun bayrak, ortasında yolun simgesi; yapılıyorsa soluk. */
function pennant(ctx, x, y, color, spec, pending) {
  ctx.save();
  ctx.globalAlpha = pending ? 0.5 : 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 14, y);
  ctx.lineTo(x + 14, y);
  ctx.lineTo(x + 14, y + 48);
  ctx.lineTo(x, y + 40);
  ctx.lineTo(x - 14, y + 48);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = GOLD_LIGHT;
  ctx.strokeStyle = GOLD_LIGHT;
  ctx.lineWidth = 1.6;
  const cy = y + 18;
  ctx.beginPath();
  if (spec === "trade") { ctx.arc(x, cy, 6, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(x, cy, 2, 0, TAU); ctx.fill(); }
  else if (spec === "farm") { ctx.moveTo(x, cy + 8); ctx.lineTo(x, cy - 8); ctx.stroke(); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(x - 3, cy - 5 + i * 4, 3, 1.5, -0.6, 0, TAU); ctx.ellipse(x + 3, cy - 5 + i * 4, 3, 1.5, 0.6, 0, TAU); ctx.fill(); } }
  else if (spec === "forge") { ctx.fillRect(x - 7, cy - 6, 14, 5); ctx.fillRect(x - 1.5, cy - 1, 3, 9); }
  else { ctx.moveTo(x - 6, cy - 7); ctx.lineTo(x + 6, cy - 7); ctx.lineTo(x + 6, cy); ctx.quadraticCurveTo(x + 6, cy + 6, x, cy + 9); ctx.quadraticCurveTo(x - 6, cy + 6, x - 6, cy); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

/** Harika: basamaklı kaide, sütunlu yüksek yapı, altın çatı, parıltı. */
function monument(ctx, x, base, color, t) {
  ctx.fillStyle = "#e8dcc0";
  ctx.fillRect(x - 34, base - 6, 68, 6);
  ctx.fillRect(x - 28, base - 12, 56, 6);
  for (let i = 0; i < 6; i++) ctx.fillRect(x - 25 + i * 10, base - 52, 4, 40);
  ctx.fillRect(x - 30, base - 58, 60, 6);
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(x - 32, base - 58);
  ctx.lineTo(x, base - 80);
  ctx.lineTo(x + 32, base - 58);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(60,46,30,0.7)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(x - 30, base - 58, 60, 2.5);
  const a = 0.4 + 0.4 * Math.sin(t * 2);
  ctx.fillStyle = `rgba(255,240,180,${a})`;
  ctx.beginPath();
  ctx.arc(x, base - 82, 4, 0, TAU);
  ctx.fill();
}

/** Ambar (tarım şehri): yuvarlak taban, konik çatı. */
function granary(ctx, x, y) {
  ctx.fillStyle = "#d8c49a";
  ctx.fillRect(x - 8, y - 16, 16, 16);
  ctx.fillStyle = "#9a6a3a";
  ctx.beginPath();
  ctx.moveTo(x - 11, y - 16);
  ctx.lineTo(x, y - 28);
  ctx.lineTo(x + 11, y - 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(60,40,20,0.7)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 8, y - 16, 16, 16);
}

/** Kervan (ticaret şehri): kapıya giden yolda katırlı arabalar. */
function caravan(ctx, x, y, t) {
  for (let i = 0; i < 3; i++) {
    const cx = x + i * 26 - ((t * 6) % 26), cy = y + i * 9;
    ctx.fillStyle = "#7a5634";
    ctx.fillRect(cx - 9, cy - 9, 18, 7);
    ctx.fillStyle = "#e9dcbc";
    ctx.beginPath();
    ctx.ellipse(cx, cy - 10, 8, 5, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = "#3b3024";
    for (const dx of [-6, 6]) { ctx.beginPath(); ctx.arc(cx + dx, cy - 1, 2.6, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "#6e4e33";
    ctx.beginPath();
    ctx.ellipse(cx - 16, cy - 6, 6, 3.4, 0, 0, TAU);
    ctx.fill();
  }
}

/** Bacadan yükselen duman: yükseldikçe büyüyen, solan halkalar. */
function smoke(ctx, x, y, t, s = 1) {
  for (let i = 0; i < 5; i++) {
    const k = ((t * 0.35 + i / 5) % 1);
    ctx.fillStyle = `rgba(200,196,190,${0.5 * (1 - k)})`;
    ctx.beginPath();
    ctx.arc(x + Math.sin(k * 3 + i) * 6 * s + k * 14 * s, y - k * 60 * s, (4 + k * 10) * s, 0, TAU);
    ctx.fill();
  }
}

function steam(ctx, x, y, t) {
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.5 + i / 3) % 1;
    ctx.beginPath();
    ctx.moveTo(x + i * 8, y - k * 20);
    ctx.quadraticCurveTo(x + i * 8 - 4, y - 8 - k * 20, x + i * 8, y - 16 - k * 20);
    ctx.stroke();
  }
}

/** Ocak ve fener ateşi: titreyen turuncu ışık. */
function glow(ctx, x, y, t) {
  const r = 14 + Math.sin(t * 6) * 2;
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, "rgba(255,200,90,0.85)");
  g.addColorStop(1, "rgba(255,140,40,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** İnşaat iskelesi: ahşap direkler ve çaprazlar, tepede küçük vinç. */
function scaffold(ctx, x, base, w, h) {
  ctx.save();
  ctx.strokeStyle = "#7a5634";
  ctx.lineWidth = 1.6;
  const x0 = x - w / 2;
  ctx.beginPath();
  for (let i = 0; i <= 3; i++) { ctx.moveTo(x0 + (i * w) / 3, base); ctx.lineTo(x0 + (i * w) / 3, base - h); }
  for (let j = 1; j <= 2; j++) { ctx.moveTo(x0, base - (j * h) / 3); ctx.lineTo(x0 + w, base - (j * h) / 3); }
  ctx.moveTo(x0, base); ctx.lineTo(x0 + w, base - h);
  ctx.moveTo(x0 + w, base); ctx.lineTo(x0, base - h);
  ctx.stroke();
  crane(ctx, x0 + w - 4, base - h + 2, 0.8);
  ctx.restore();
}

