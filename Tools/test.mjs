// Kontroller. Tarayıcı açmaz, saniyenin altında biter.
//
//   node Tools/test.mjs
//
// Her kontrol ölçtüğü şeyi KANITLAMAK zorunda: bir "karada mı" kontrolü önce denizin ortasına
// "hayır" demeli, yoksa hiçbir şeye bakmadan geçiyor olabilir (HOTICE-Notes/tuzaklar.md, 1).

import { readFileSync, readdirSync } from "node:fs";
import { CIVS, PLACES, ROADS } from "../src/data/world.js";
import { onLand, coastDistance, project } from "../src/geo.js";
import { byId, neighbours, path, roadLine } from "../src/rules/graph.js";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else { fail++; console.log(`  HATA  ${name}${detail ? "  ->  " + detail : ""}`); }
};
const section = (t) => console.log(`\n${t}`);
const nameOf = (r) => `${r.a}-${r.b}`;

// ---------------------------------------------------------------------------------------------
section("Ölçüm aletleri");

// Aletin kendisi: bilinen denizlere "deniz", bilinen karalara "kara" demeli.
for (const [n, lon, lat] of [
  ["Akdeniz ortası", 18, 34], ["Karadeniz ortası", 34, 43], ["Hazar", 50.5, 42],
  ["Ege", 25, 38.5], ["Adriyatik", 16, 42.5], ["Biskay", -5, 45],
]) check(`${n} deniz`, !onLand(lon, lat));
for (const [n, lon, lat] of [
  ["Orta Anadolu", 33, 39], ["Galya", 2, 46], ["Mezopotamya", 44, 33], ["Libya çölü", 22, 28],
]) check(`${n} kara`, onLand(lon, lat));
check("Van Gölü su", !onLand(42.9, 38.6));
check("Ölü Deniz su", !onLand(35.5, 31.5));

// ---------------------------------------------------------------------------------------------
section("Medeniyetler ve yerleşimler");

const ids = PLACES.map((p) => p.id);
check("yerleşim kimlikleri tekil", new Set(ids).size === ids.length);
check("medeniyet kimlikleri tekil", new Set(CIVS.map((c) => c.id)).size === CIVS.length);
for (const c of CIVS) {
  const mine = PLACES.filter((p) => p.owner === c.id);
  check(`${c.id}: 3 yerleşim`, mine.length === 3, `${mine.length}`);
  check(`${c.id}: tek başkent`, mine.filter((p) => p.capital).length === 1);
  check(`${c.id}: başkent bir şehir`, mine.find((p) => p.capital)?.kind === "city");
  check(`${c.id}: bir kalesi var`, mine.some((p) => p.kind === "castle"));
  check(`${c.id}: iki dilde adı var`, !!(c.name.en && c.name.tr));
}
for (const p of PLACES) {
  check(`${p.id}: sahibi geçerli`, p.owner === null || CIVS.some((c) => c.id === p.owner), p.owner);
  check(`${p.id}: türü geçerli`, p.kind === "city" || p.kind === "castle", p.kind);
  check(`${p.id}: bağımsızın başkenti olmaz`, !(p.capital && p.owner === null));
  check(`${p.id}: iki dilde adı var`, !!(p.name.en && p.name.tr));
}

// ---------------------------------------------------------------------------------------------
section("Yerleşimler haritada doğru yerde");

for (const p of PLACES) {
  check(`${p.id} karada`, onLand(p.lon, p.lat), `${p.lat}, ${p.lon}`);
  if (p.port) {
    const d = coastDistance(p.lon, p.lat);
    check(`${p.id} limanı kıyıda`, d < 0.3, `kıyıya ${d.toFixed(2)}`);
  }
}

// Haritada üst üste binmesinler: en yakın iki yerleşim arası.
for (let i = 0; i < PLACES.length; i++) {
  for (let j = i + 1; j < PLACES.length; j++) {
    const a = project(PLACES[i].lon, PLACES[i].lat), b = project(PLACES[j].lon, PLACES[j].lat);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    check(`${PLACES[i].id} ile ${PLACES[j].id} ayrık`, d > 0.6, d.toFixed(2));
  }
}

// ---------------------------------------------------------------------------------------------
section("Yollar");

const seen = new Set();
for (const r of ROADS) {
  check(`${nameOf(r)}: uçları var`, !!byId[r.a] && !!byId[r.b]);
  check(`${nameOf(r)}: kendine değil`, r.a !== r.b);
  const key = [r.a, r.b].sort().join("|");
  check(`${nameOf(r)}: bir kere yazılmış`, !seen.has(key));
  seen.add(key);
  if (r.sea) check(`${nameOf(r)}: deniz geçişi iki liman arasında`, byId[r.a].port && byId[r.b].port);
}
for (const p of PLACES) check(`${p.id}: en az bir yolu var`, neighbours(p.id).length > 0);

// Bütün harita tek parça: her yerden her yere gidilebilmeli.
const reach = new Set([PLACES[0].id]);
for (const q = [PLACES[0].id]; q.length;) {
  for (const n of neighbours(q.shift())) if (!reach.has(n)) { reach.add(n); q.push(n); }
}
check("harita tek parça", reach.size === PLACES.length,
  PLACES.filter((p) => !reach.has(p.id)).map((p) => p.id).join(", "));

/**
 * Bir yolu harita biriminde eşit aralıklarla örnekler. Uçlardaki şehirlerin hemen dibi
 * sayılmaz: bir liman kıyıdadır ve oradan çıkan her yolun ilk adımı denize düşebilir.
 */
function sample(r, step = 0.04, skip = 0.15) {
  const line = roadLine(r).map(([lon, lat]) => ({ lon, lat, ...project(lon, lat) }));
  let total = 0;
  for (let i = 1; i < line.length; i++) total += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y);
  const out = [];
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let t = 0; t < len; t += step) {
      const at = walked + t;
      if (at < skip || at > total - skip) continue;
      const k = t / len;
      out.push([a.lon + (b.lon - a.lon) * k, a.lat + (b.lat - a.lat) * k]);
    }
    walked += len;
  }
  return { out, step };
}

for (const r of ROADS) {
  const { out, step } = sample(r);
  const wet = out.filter(([lon, lat]) => !onLand(lon, lat));
  if (r.sea) {
    // Kesik çizgi bir yarımadanın üstünden geçmesin: uçlar dışında karaya hiç değmemeli.
    const dry = out.filter(([lon, lat]) => onLand(lon, lat));
    const where = dry.length ? ` (ilki ${dry[0][1].toFixed(2)}, ${dry[0][0].toFixed(2)})` : "";
    check(`${nameOf(r)}: deniz geçişi denizden geçiyor`, dry.length * step <= 0.1,
      `${(dry.length * step).toFixed(2)} birim kara${where}`);
  } else {
    // Boğaz gibi dar bir su geçilebilir; bunun ötesi kıyıyı izleyen ara nokta ister.
    const where = wet.length ? ` (ilki ${wet[0][1].toFixed(2)}, ${wet[0][0].toFixed(2)})` : "";
    check(`${nameOf(r)}: kara yolu karadan geçiyor`, wet.length * step <= 0.2,
      `${(wet.length * step).toFixed(2)} birim deniz${where}`);
  }
}

// ---------------------------------------------------------------------------------------------
section("Güzergâh");

check("Gades'ten Nisa'ya yol var", !!path("gades", "nisa"));
check("komşuya tek adım", path("rome", "tarentum")?.length === 2);
check("kendine sıfır adım", path("rome", "rome")?.length === 1);
// Elle sayıldı: Kartaca > Lilybaion > Siraküza > Tarentum > Roma. Sardinya üstünden beş.
const p1 = path("carthage", "rome");
check("Kartaca'dan Roma'ya en kısa yol 4 adım", p1?.length === 5, p1?.join(" > "));
check("Kartaca'dan Roma'ya Sicilya üstünden", p1?.includes("syracuse"), p1?.join(" > "));
// Girilemeyen yer: güzergâh onun etrafından dolaşmalı, ya da hiç olmamalı.
const around = path("carthage", "rome", (id) => id !== "syracuse");
check("Siraküza kapalıyken başka yoldan", !!around && !around.includes("syracuse"), around?.join(" > "));
check("bütün yollar kapalıyken güzergâh yok", path("rome", "athens", () => false) === null);

// ---------------------------------------------------------------------------------------------
section("Kamera");

// Söz: hangi ekranda, hangi köşeye kaydırılmış olursa olsun, kıyı verisinin bittiği yer
// (görünen sınırın 3 birim ötesi) ekrana girmez. Ve geniş ekranda bütün harita sığar.
{
  const { makeCamera, resize, panBy, zoomAt, toMap, toScreen } = await import("../src/view/camera.js");
  const { SIZE } = await import("../src/geo.js");
  for (const [w, h] of [[1280, 720], [1920, 1080], [390, 844], [844, 390], [768, 1024], [2560, 1080]]) {
    const cam = makeCamera();
    resize(cam, w, h);
    let worst = 0;
    for (const [dx, dy] of [[0, 0], [1e5, 1e5], [-1e5, -1e5], [1e5, -1e5], [-1e5, 1e5]]) {
      panBy(cam, dx, dy);
      const a = toMap(cam, 0, 0), b = toMap(cam, w, h);
      worst = Math.max(worst, -a.x, -a.y, b.x - SIZE.x, b.y - SIZE.y);
    }
    check(`${w}x${h}: verinin sonu görünmüyor`, worst <= 3 + 1e-9, `${worst.toFixed(2)} birim taşıyor`);
    if (w > h * 1.4) check(`${w}x${h}: en uzakta bütün harita sığıyor`, cam.scale * SIZE.x <= w + 0.5);
  }
  // Tekerlek/kıstırma: parmağın altındaki yer parmağın altında kalır.
  const cam = makeCamera();
  resize(cam, 1280, 720);
  zoomAt(cam, 3, 400, 300);
  const before = toMap(cam, 900, 200);
  zoomAt(cam, 1.7, 900, 200);
  const after = toScreen(cam, before.x, before.y);
  check("yakınlaşırken imlecin altı kaymıyor", Math.hypot(after.x - 900, after.y - 200) < 0.01,
    `${after.x.toFixed(2)}, ${after.y.toFixed(2)}`);
}

// ---------------------------------------------------------------------------------------------
section("Metin dosyaları");

// Nesne literalinde aynı anahtarı iki kez yazmak sessizce ikinciyi alır (tuzaklar.md, 2).
// Nesneye bakarak anlaşılmaz, dosyanın metnine bakmak gerekir.
for (const f of readdirSync(new URL("../src/", import.meta.url), { recursive: true })) {
  if (!String(f).endsWith("text.js")) continue;
  const src = readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  for (const block of src.split(/^\s*(?:en|tr)\s*:\s*\{/m).slice(1)) {
    const body = block.slice(0, block.indexOf("\n  },"));
    const keys = [...body.matchAll(/^\s{4}(\w+)\s*:/gm)].map((m) => m[1]);
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    check(`${f}: aynı anahtar iki kez yok`, !dup.length, dup.join(", "));
  }
}

console.log(`\n${pass} geçti, ${fail} hata`);
process.exit(fail ? 1 : 0);
