// Natural Earth verisinden oyunun haritasını üretir: kıyılar, göller, nehirler.
//
//   node Tools/geo.mjs            ->  src/data/geo.js
//
// Kaynak 1:50m ölçekli Natural Earth (kamu malı), Tools/ne/ altında. Depoda yok, indirmek için:
//   for f in ne_50m_land ne_50m_lakes ne_50m_rivers_lake_centerlines; do curl -sSfo Tools/ne/$f.geojson \
//     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/$f.geojson; done
//
// Çıktı oyunun kendi dosyası: dereceler 0.01'lik tamsayılara çevrilmiş, Douglas-Peucker ile
// sadeleştirilmiş.
// Harita hiç değişmediği için bu araç bir kere koşar; kaynak veri değişirse tekrar koşar.
//
// Kırpma kutusu görünen haritadan GENİŞ: kırpmanın kutu kenarında bıraktığı düz çizgiler
// kameranın asla göremeyeceği yerde kalsın diye.

import { readFileSync, writeFileSync } from "node:fs";
import { BOUNDS } from "../src/data/bounds.js";

const M = 4; // görünen sınırın dışında bırakılan pay, derece
const CLIP = { w: BOUNDS.w - M, e: BOUNDS.e + M, s: BOUNDS.s - M, n: BOUNDS.n + M };
const TOL = 0.02; // sadeleştirme toleransı, derece (~2 km)
const MIN_AREA = 0.004; // bundan küçük adalar çizilmez, derece²

const read = (f) => JSON.parse(readFileSync(new URL(`./ne/${f}.geojson`, import.meta.url), "utf8"));

// Antik dünyada olmayan sular: barajlar, kanallar, kurumuş Aral'ın bugünkü hâli.
const LAKES = new Set([
  "Dead Sea", "Sea of Galilee", "Lake Van", "Lake Urmia", "Lake Sevan", "Lake Tuz",
  "Lake Geneva", "Bodensee", "Lake Balaton", "Lake Skadar",
]);
const RIVERS = new Set([
  "Nile", "Rosetta Branch", "Damietta Branch", "Danube", "Donau", "Bratul Chillia",
  "Bratul Sfintu Gheorghe", "Bratul Sulina", "Rhine", "Rhein", "Rhin", "Rhône", "Po",
  "Euphrates", "Al Furat", "Firat", "Tigris", "Dicle", "Shatt al Arab", "Dnipro", "Dniester",
  "Don", "Volga", "Ebro", "Tajo", "Tejo", "Duero", "Garonne", "Loire", "Seine", "Jordan",
  "Amu  Darya",
]);

// ---- geometri ----

function clipPolygon(ring) {
  const edges = [
    [(p) => p[0] >= CLIP.w, (a, b) => cutX(a, b, CLIP.w)],
    [(p) => p[0] <= CLIP.e, (a, b) => cutX(a, b, CLIP.e)],
    [(p) => p[1] >= CLIP.s, (a, b) => cutY(a, b, CLIP.s)],
    [(p) => p[1] <= CLIP.n, (a, b) => cutY(a, b, CLIP.n)],
  ];
  let out = ring;
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[(i + src.length - 1) % src.length], b = src[i];
      if (inside(b)) {
        if (!inside(a)) out.push(cut(a, b));
        out.push(b);
      } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) return out;
  }
  return out;
}
const cutX = (a, b, x) => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
const cutY = (a, b, y) => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];

const inClip = (p) => p[0] >= CLIP.w && p[0] <= CLIP.e && p[1] >= CLIP.s && p[1] <= CLIP.n;

/** Bir çizgiyi kutunun içinde kalan parçalarına böler. */
function clipLine(line) {
  const parts = [];
  let cur = [];
  for (const p of line) {
    if (inClip(p)) cur.push(p);
    else if (cur.length) { parts.push(cur); cur = []; }
  }
  if (cur.length) parts.push(cur);
  return parts.filter((l) => l.length > 1);
}

function area(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return Math.abs(s / 2);
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = 0, at = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > best) { best = d; at = i; }
    }
    if (best > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Kapalı bir halka: ilk noktayı iki yarıya bölünmüş bir çizgi gibi sadeleştir. */
function simplifyRing(ring) {
  const mid = Math.floor(ring.length / 2);
  const a = simplify(ring.slice(0, mid + 1), TOL);
  const b = simplify(ring.slice(mid), TOL);
  return a.concat(b.slice(1));
}

const pack = (pts) => pts.flatMap(([x, y]) => [Math.round(x * 100), Math.round(y * 100)]);

// ---- kara ----

const land = [];
for (const f of read("ne_50m_land").features) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    // Delikleri de ayrı halka olarak alıyoruz; çizerken "evenodd" ile boşluk olarak kalıyorlar.
    for (const ring of poly) {
      const c = clipPolygon(ring);
      if (c.length < 3 || area(c) < MIN_AREA) continue;
      const s = simplifyRing(c);
      if (s.length >= 3) land.push(pack(s));
    }
  }
}

// ---- göller ----

const lakes = [];
for (const f of read("ne_50m_lakes").features) {
  if (!LAKES.has(f.properties.name)) continue;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const c = clipPolygon(poly[0]);
    if (c.length >= 3) lakes.push(pack(simplifyRing(c)));
  }
}

// ---- nehirler ----

const rivers = [];
const seen = new Set();
for (const f of read("ne_50m_rivers_lake_centerlines").features) {
  const name = f.properties.name;
  if (!RIVERS.has(name)) continue;
  seen.add(name);
  const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const line of lines) {
    for (const part of clipLine(line)) {
      const s = simplify(part, TOL);
      if (s.length > 1) rivers.push(pack(s));
    }
  }
}
const missing = [...RIVERS].filter((r) => !seen.has(r));
if (missing.length) throw new Error("kaynakta bulunamayan nehir: " + missing.join(", "));

const points = (a) => a.reduce((n, r) => n + r.length / 2, 0);
const body =
  "// Tools/geo.mjs tarafından üretildi - elle düzenleme. Kaynak: Natural Earth 1:50m (kamu malı).\n" +
  "// Her halka/çizgi [boylam, enlem, boylam, enlem, ...], derecenin 100 katı tamsayı olarak.\n\n" +
  `export const LAND = ${JSON.stringify(land)};\n\n` +
  `export const LAKES = ${JSON.stringify(lakes)};\n\n` +
  `export const RIVERS = ${JSON.stringify(rivers)};\n`;
writeFileSync(new URL("../src/data/geo.js", import.meta.url), body);
console.log(
  `kara ${land.length} halka / ${points(land)} nokta, göl ${lakes.length}, ` +
  `nehir ${rivers.length} çizgi / ${points(rivers)} nokta, ${(body.length / 1024).toFixed(0)} KB`,
);
