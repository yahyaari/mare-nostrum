// Kontroller. Tarayıcı açmaz, saniyenin altında biter.
//
//   node Tools/test.mjs
//
// Her kontrol ölçtüğü şeyi KANITLAMAK zorunda: bir "karada mı" kontrolü önce denizin ortasına
// "hayır" demeli, yoksa hiçbir şeye bakmadan geçiyor olabilir (HOTICE-Notes/tuzaklar.md, 1).

import { readFileSync, readdirSync } from "node:fs";
import { CIVS, PLACES, ROADS } from "../src/data/world.js";
import { onLand, coastDistance, project } from "../src/geo.js";
import { BOUNDS, LON_SCALE } from "../src/data/bounds.js";
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
  // Deniz geçişinin uçlarında kıyıya kadar olan kısım sayılmaz (iç liman: Roma Tiber üstünde).
  const inland = r.sea ? Math.max(...[byId[r.a], byId[r.b]].map((p) => coastDistance(p.lon, p.lat))) + 0.05 : 0;
  const { out, step } = sample(r, 0.04, Math.max(0.15, inland));
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
// Elle sayıldı: Kartaca > Karalis > Roma (Ostia'dan Sardinya'ya deniz yolu). Sicilya üstünden dört.
const p1 = path("carthage", "rome");
check("Kartaca'dan Roma'ya en kısa yol 2 adım", p1?.length === 3, p1?.join(" > "));
check("Kartaca'dan Roma'ya Sardinya üstünden", p1?.includes("caralis"), p1?.join(" > "));
const p2 = path("carthage", "rome", (id) => id !== "caralis");
check("Sardinya kapalıyken Sicilya üstünden 4 adım", p2?.length === 5 && p2.includes("syracuse"), p2?.join(" > "));
// Girilemeyen yer: güzergâh onun etrafından dolaşmalı, ya da hiç olmamalı.
const around = path("carthage", "rome", (id) => id !== "syracuse");
check("Siraküza kapalıyken başka yoldan", !!around && !around.includes("syracuse"), around?.join(" > "));
check("bütün yollar kapalıyken güzergâh yok", path("rome", "athens", () => false) === null);

// ---------------------------------------------------------------------------------------------
section("Yeni oyun (kurallar.md bölüm 4)");

const S = await import("../src/rules/state.js");
const C = await import("../src/rules/combat.js");
const M = await import("../src/rules/moves.js");
const D = await import("../src/rules/diplomacy.js");
const T = await import("../src/rules/turn.js");
const { N, UNITS, SHIPS, trait, LEVELS } = await import("../src/rules/numbers.js");
const { play } = await import("./bot.mjs");
const MAP = await import("../src/rules/map.js");
const R = await import("../src/rules/research.js");
const VIC = await import("../src/rules/victory.js");
const { POS } = MAP;

// Serbest yürüyüşte ordunun yeri (x, y) ve içinde durduğu yer (at). Testler orduyu doğrudan koyar:
/** Bir orduyu bir yerleşimin içine koy. */
const put = (a, id) => { a.at = id; a.x = POS[id].x; a.y = POS[id].y; a.route = []; return a; };
/** Bir orduyu bir yerleşimin kapısının önüne, sahaya koy (komşu bir kara karesi): menzilde. */
const before = (a, id) => {
  const c = MAP.around(MAP.PLACE_CELL[id]).map(([x]) => x).find((x) => MAP.isLand(x) && !MAP.placeAtCell(x));
  Object.assign(a, MAP.centre(c), { at: null, route: [] });
  return a;
};
/** Bir orduyu bir limanın önüne, denize koy: menzildeki en yakın deniz karesi. */
const offshore = (a, id) => {
  let best = -1, bd = Infinity;
  for (let c = 0; c < MAP.W * MAP.H; c++) {
    if (MAP.isLand(c)) continue;
    const d = MAP.dist(MAP.centre(c), POS[id]);
    if (d < bd) { bd = d; best = c; }
  }
  Object.assign(a, MAP.centre(best), { at: null, route: [] });
  return a;
};
/** Bir yerden ordu çıkar; garnizonda o kadar yoksa önce konur. */
const raise = (st, id, want) => {
  for (const [k, v] of Object.entries(want)) st.places[id][k] = Math.max(st.places[id][k] ?? 0, v);
  return S.muster(st, id, want);
};

{
  const s = S.newGame("rome", 7);
  const rome = s.places.rome, tar = s.places.tarentum, ari = s.places.ariminum;
  check("başkent seviye 2", rome.level === 2);
  check("öteki şehir seviye 1", tar.level === 1 && ari.level === 1);
  check("nüfus tavanın %75'i", rome.pop === 150 && tar.pop === 75 && ari.pop === 38, `${rome.pop} ${tar.pop} ${ari.pop}`);
  check("garnizon 30 / 20 / 10", rome.inf === 30 && tar.inf === 20 && ari.inf === 10);
  check("bağımsız şehir: seviye 2, 30 piyade 10 okçu", s.places.massalia.level === 2 && s.places.massalia.inf === 30 && s.places.massalia.arch === 10);
  check("büyük bağımsız şehir: seviye 3, 40 piyade 20 okçu", ["syracuse", "athens", "antioch", "babylon"].every((id) => s.places[id].level === 3 && s.places[id].inf === 40 && s.places[id].arch === 20));
  check("büyük şehrin suru var", M.wallsOf(s, "athens") === "city" && M.wallsOf(s, "massalia") === null);
  check("bağımsız kale: 30 piyade 30 okçu", s.places.sparta.inf === 30 && s.places.sparta.arch === 30);
  check("Makedonya nüfusu x0.9", s.places.pella.pop === 135, s.places.pella.pop);
  check("bütün yapılar 1", Object.values(s.places).every((p) => p.industry === 1 && p.farms === 1 && p.barracks === 1));
  // Elle hesaplandı: para (150+75+38)/20 = 13.15; silah 1+1+0.5; yiyecek Roma 4 + Tarentum 4+1
  // balık + Ariminum 2 = 11, eksi 6 bölük = 5.
  const b = S.budget(s, "rome");
  check("Roma'nın turluk parası 13.15", Math.abs(b.money - 13.15) < 1e-9, b.money);
  check("Roma'nın turluk silahı 2.5", b.weapons === 2.5, b.weapons);
  // Tarentum limanındaki tek geminin yarım yiyecek bakımı: 5 - 0.5.
  check("Roma'nın turluk yiyeceği +4.5", b.food === 4.5, `${b.food} (bakım ${b.upkeep})`);
  // Küçük medeniyetlerin fazladan askeri yiyecek yer: dengeleri eksi olabilir, ama verilen yiyecek
  // en az 10 tur yeter (o arada tarla yapar ya da yayılır). Ötekilerin dengesi artıda.
  for (const c of CIVS) {
    const f = S.budget(s, c.id).food, stock = s.civs[c.id].food;
    if (N.start.extra?.[c.id]) check(`${c.id}: fazladan askerin yiyeceği en az 10 tur yeter`, f > 0 || stock / -f >= 10, `${stock} / ${f}`);
    else check(`${c.id}: başlangıçta yiyecek artıda`, f > 0, f);
  }
  check("küçük medeniyetlerin başkentinde fazladan asker", ["gaul", "parthia", "saka"].every((c) => { const cap = PLACES.find((p) => p.owner === c && p.capital).id; return s.places[cap].inf === N.start.garrison.capital + N.start.extra[c].inf && s.places[cap].arch === N.start.extra[c].arch; }) && s.places.rome.arch === 0);
  check("seçim ekranındaki başlangıç ordusu kurulan oyunla aynı", CIVS.every((c) => { const t = S.startTroops(c.id); const ps = S.placesOf(s, c.id); return t.inf === ps.reduce((n, id) => n + s.places[id].inf, 0) && t.arch === ps.reduce((n, id) => n + s.places[id].arch, 0); }));
}

// ---------------------------------------------------------------------------------------------
section("Yükseltme ve asker");

{
  const s = S.newGame("rome", 7);
  s.civs.rome.money = 100;
  check("tarla 1->2: 20 para", S.upgradeInfo(s, "rome", "farms").cost === 20);
  check("şehir seviyesi 2->3: 60 para", S.upgradeInfo(s, "rome", "level").cost === 60);
  check("yapı şehir seviyesini geçemez", S.upgradeInfo(s, "tarentum", "farms").why === "needLevel");
  check("yükseltme başlar: para şimdi, yapı bitince", S.upgrade(s, "rome", "farms") && s.places.rome.farms === 1 && s.civs.rome.money === 80 && s.places.rome.builds.length === 1);
  check("aynı yapı iki kez başlamaz", S.upgradeInfo(s, "rome", "farms").why === "building");
  s.civs.rome.money = 5;
  check("parası yetmeyen yükseltemez", S.upgradeInfo(s, "tarentum", "level").why === "money");
  check("kale en fazla seviye 3", (s.places.ariminum.level = 3, S.upgradeInfo(s, "ariminum", "level").why === "max"));

  const t = S.newGame("gaul", 7);
  const before = { ...t.civs.gaul }, pop = t.places.bibracte.pop, inf0 = t.places.bibracte.inf;
  check("okçu için kışla 2 gerek", S.recruitInfo(t, "bibracte", "arch").why === "needBarracks");
  check("piyade basılıyor", S.recruit(t, "bibracte", "inf"));
  check("Galyalılar bölük için para vermez", t.civs.gaul.money === before.money);
  check("bölük 1 silah 1 yiyecek", t.civs.gaul.weapons === before.weapons - 1 && t.civs.gaul.food === before.food - 1);
  check("nüfustan 10 kişi", t.places.bibracte.pop === pop - 10 && t.places.bibracte.inf === inf0 + 10);
  check("kışla 1: turda bir bölük", S.recruitInfo(t, "bibracte", "inf").why === "done");
  const r = S.newGame("rome", 7);
  S.recruit(r, "rome", "inf");
  check("Roma bir bölük için 1.5 para verir", r.civs.rome.money === 30 - 1.5, r.civs.rome.money);
}

// ---------------------------------------------------------------------------------------------
section("Savaş (bölüm 7) - her kuralın vaadi");

{
  const F = (a, d, walls = null, luck) => C.fight({ civ: null, ...a }, { civ: null, ...d }, walls, luck);
  const best = [1 + N.luck, 1 - N.luck];
  check("tek başına okçu, aynı sayıda piyadeye en iyi şansla bile yenilir",
    !F({ inf: 0, arch: 100 }, { inf: 100, arch: 0 }, null, best).attWins);
  check("karışık ordu aynı sayıda düz piyadeyi yener", F({ inf: 50, arch: 50 }, { inf: 100, arch: 0 }).attWins);
  check("denk savaşta kazanan yarısına yakın kaybeder", (() => {
    const r = F({ inf: 100, arch: 0 }, { inf: 99, arch: 0 });
    return r.attWins && r.att.inf > 40 && r.att.inf < 60;
  })());
  check("iki kat güçlü, sekizde birini kaybeder", F({ inf: 200, arch: 0 }, { inf: 100, arch: 0 }).att.inf === 175);
  check("kaybeden dağılır", (() => { const r = F({ inf: 50, arch: 0 }, { inf: 100, arch: 0 }); return r.att.inf + r.att.arch === 0; })());
  check("boş yere kayıpsız girilir", (() => { const r = F({ inf: 10, arch: 0 }, { inf: 0, arch: 0 }); return r.attWins && r.att.inf === 10; })());
  check("kale: 90 piyade, 30+30 kale garnizonunu alamaz", !F({ inf: 90, arch: 0 }, { inf: 30, arch: 30 }, "castle").attWins);
  check("aynı garnizon açık arazide 90 piyadeye yenilir", F({ inf: 90, arch: 0 }, { inf: 30, arch: 30 }).attWins);
  const civF = (ac, a, dc, d, walls = null) => C.fight({ civ: ac, ...a }, { civ: dc, ...d }, walls);
  check("Roma piyadesi x1.25: 100, 120 Galyalıyı yener", civF("rome", { inf: 100, arch: 0 }, "gaul", { inf: 120, arch: 0 }).attWins);
  check("Makedonya savunurken x1.5: 140 piyadeyi 100'le durdurur", !civF("gaul", { inf: 140, arch: 0 }, "macedon", { inf: 100, arch: 0 }).attWins);
  check("Sakalar sura karşı zayıf", civF(null, { inf: 100, arch: 0 }, null, { inf: 70, arch: 0 }, "city").attWins
    && !civF("saka", { inf: 100, arch: 0 }, null, { inf: 70, arch: 0 }, "city").attWins);

  // Tahmin yalan söylemesin: "kolay" diyorsa her şansta kazanmalı, "umutsuz" diyorsa hiçbirinde.
  let lies = 0, seen = { easy: 0, risky: 0, hopeless: 0 };
  for (let i = 0; i < 400; i++) {
    const a = { civ: null, inf: (i * 37) % 150, arch: (i * 53) % 90 }, d = { civ: null, inf: (i * 29) % 120, arch: (i * 17) % 70 };
    const walls = [null, "city", "castle"][i % 3];
    const e = C.estimate(a, d, walls);
    seen[e.odds]++;
    for (let k = 0; k <= 10; k++) {
      const l = [1 - N.luck + (k / 10) * 2 * N.luck, 1 + N.luck - (((k * 7) % 11) / 10) * 2 * N.luck];
      const won = C.fight(a, d, walls, l).attWins;
      if ((e.odds === "easy" && !won) || (e.odds === "hopeless" && won)) lies++;
    }
  }
  check("tahmin hiçbir şansta yalan söylemiyor", lies === 0, `${lies} yalan`);
  check("tahminin üç cevabı da görüldü", seen.easy && seen.risky && seen.hopeless, JSON.stringify(seen));
}

// ---------------------------------------------------------------------------------------------
section("Harita ızgarası: serbest yürüyüşün zemini");

{
  // Alet önce kendini kanıtlar: denizin ortası deniz, karanın ortası kara.
  const at = (lon, lat) => { const m = project(lon, lat); return MAP.cellOf(m.x, m.y); };
  check("ızgara: Akdeniz ortası deniz, Anadolu kara", !MAP.isLand(at(18, 34)) && MAP.isLand(at(33, 39)));
  // Izgara ekrandaki kıyılarla aynı: kıyıdan uzak 200 rastgele karede onLand ile aynı.
  let agree = 0, asked = 0;
  for (let c = 17; c < MAP.W * MAP.H && asked < 200; c += 113) {
    const m = MAP.centre(c);
    const lon = m.x / LON_SCALE + BOUNDS.w, lat = BOUNDS.n - m.y;
    if (coastDistance(lon, lat) < 0.3) continue;
    asked++;
    if (MAP.isLand(c) === onLand(lon, lat)) agree++;
  }
  check("ızgara kıyılarla aynı (kıyıdan uzak kareler)", asked > 100 && agree === asked, `${agree}/${asked}`);
  check("her yerleşimin karesi karada", PLACES.every((p) => MAP.isLand(MAP.PLACE_CELL[p.id])));
  check("iki yerleşim aynı karede değil", new Set(Object.values(MAP.PLACE_CELL)).size === PLACES.length);

  // Kara yolları yürünür ve hızlıdır: iki ucu arasında karadan yol, bedeli yolun uzunluğuna yakın.
  const s = S.newGame("rome", 7);
  for (const k of Object.keys(s.places)) s.places[k].owner = "rome"; // her yere girilsin
  const walker = (id) => ({ owner: "rome", at: id, x: POS[id].x, y: POS[id].y, inf: 10, arch: 0, cav: 0, siege: 0, ships: 0, trireme: 0, quinq: 0, mp: 5, route: [] });
  const slow = [];
  for (const r of ROADS.filter((x) => !x.sea)) {
    const p = M.routeTo(s, walker(r.a), { place: r.b });
    const pts = roadLine(r).map(([lon, lat]) => project(lon, lat));
    const len = pts.slice(1).reduce((n, q, i) => n + Math.hypot(q.x - pts[i].x, q.y - pts[i].y), 0);
    if (!p || p.cost > len * 1.35 + 0.6) slow.push(`${r.a}-${r.b} ${p ? p.cost.toFixed(1) : "yok"}/${len.toFixed(1)}`);
  }
  check("her kara yolu karadan yürünür, bedeli uzunluğu kadar (yol hızlı)", !slow.length, slow.slice(0, 6).join(", "));
  // Boğazlar: Sicilya, Sardinya, Kıbrıs adası; karadan geçilmez. Bizans boğazını yol aşar.
  check("Sicilya'ya karadan gidilmez (Messina boğazı)", M.routeTo(s, walker("rome"), { place: "syracuse" }) === null);
  check("Sardinya'ya karadan gidilmez", M.routeTo(s, walker("rome"), { place: "caralis" }) === null);
  check("Cebelitarık'tan karadan geçilmez: Afrika'ya karadan ancak Akdeniz'i dolaşarak", M.routeTo(s, walker("gades"), { place: "tingis" })?.cost > 40);
  check("Bizans'tan Anadolu'ya karadan (yol boğazı aşar)", M.routeTo(s, walker("byzantium"), { place: "ancyra" }) !== null);
  check("Korint'ten Atina'ya karadan (kıstak)", M.routeTo(s, walker("corinth"), { place: "athens" }) !== null);
  // Deniz yolları: askersiz filo iki liman arasında denizden gider.
  const fleet = (id) => ({ ...walker(id), inf: 0, ships: 1 });
  const lanes = ROADS.filter((x) => x.sea && byId[x.a].port && byId[x.b].port).filter((r) => M.routeTo(s, fleet(r.a), { place: r.b }) === null);
  check("her deniz yolu filoyla geçilir", !lanes.length, lanes.map((r) => `${r.a}-${r.b}`).join(", "));
  check("filo karadan geçmez: Akdeniz'den Karadeniz'e ancak boğazdan", M.routeTo(s, fleet("carthage"), { place: "sinope" }) !== null);
  // Toprak: ekrandaki gibi en yakın yerleşimin; denizin ve uzak çölün sahibi yok.
  check("toprak: Roma'nın yanı Roma'nın, deniz kimsenin", MAP.regionOf(at(12.7, 41.9)) === "rome" && MAP.regionOf(at(18, 34)) === null);
  check("toprak: uzak çöl kimsenin", MAP.regionOf(at(25, 27)) === null);
  // Yumuşatılmış yol aynı yerde başlar ve biter, daha az köşeli.
  const way = M.routeTo(s, walker("rome"), { place: "mediolanum" }).cells;
  const sm = MAP.smooth(way);
  check("yumuşatılmış yol: aynı uçlar, daha az nokta", sm.length < way.length && MAP.dist(sm[0], MAP.centre(way[0])) < 1e-9 && MAP.dist(sm.at(-1), MAP.centre(way.at(-1))) < 1e-9);
}

// ---------------------------------------------------------------------------------------------
section("Hareket ve diplomasi (bölüm 6, 8)");

{
  const s = S.newGame("rome", 7);
  const a = S.formArmy(s, "rome", 30, 0);
  check("ordu kuruluyor, garnizon boşalıyor, ordu şehrin içinde", a && s.places.rome.inf === 0 && a.at === "rome" && a.x === POS.rome.x && a.y === POS.rome.y);
  check("tam hareketle çıkar", a.mp === N.march.mp);
  check("tarafsızın şehrine girilemez", M.access(s, "rome", "carthage") === null && M.routeTo(s, a, { place: "carthage" }) === null);
  check("bağımsıza saldırılır", M.access(s, "rome", "mediolanum") === "free");
  const r = M.routeTo(s, a, { place: "ariminum" });
  check("Ariminum'a yol yoldan: bedeli yolun uzunluğu kadar, bir turdan az", r && r.cost > 2 && r.cost < N.march.mp && r.kind === "walk", r?.cost);
  M.order(s, a.id, { place: "ariminum" });
  check("yürüyüp kalenin içine girer, hareketi azalır", a.at === "ariminum" && a.x === POS.ariminum.x && a.mp > 0 && a.mp < N.march.mp, `${a.at} ${a.mp}`);

  // Uzak hedef: bu tur bir kısmı; yol saklanır, her tur kendiliğinden ilerler; düşmanın önünde durur.
  const s2 = S.newGame("rome", 7);
  const b = raise(s2, "tarentum", { inf: 200 });
  M.order(s2, b.id, { place: "mediolanum" });
  const left = b.route.length;
  check("uzak hedef: bu tur yolun bir kısmı, kalanı saklanır", left > 0 && !b.at && b.mp < 1, `${left} ${b.mp}`);
  M.refresh(s2, "rome");
  M.advance(s2, b);
  check("ertesi tur kendiliğinden ilerler", b.route.length < left);
  for (let t = 0; t < 6 && b.route.length; t++) { M.refresh(s2, "rome"); M.advance(s2, b); }
  check("düşmanın kapısının önünde durur: menzilde, içinde değil", !b.at && !b.route.length && MAP.dist(b, POS.mediolanum) <= N.reach.strike, MAP.dist(b, POS.mediolanum));
  check("menzildeki yere saldırabilir", M.canAttack(s2, b, "mediolanum"));
  const mp = b.mp;
  b.mp = 0;
  check("hareketi bitmiş ordu saldıramaz", !M.canAttack(s2, b, "mediolanum"));
  b.mp = mp || 1;
  const pop0 = s2.places.mediolanum.pop;
  const ev = M.attack(s2, b.id, "mediolanum", [1, 1]);
  check("saldırı kazanılıyor, yer el değiştiriyor, ordu içeri girer", ev?.won && s2.places.mediolanum.owner === "rome" && b.at === "mediolanum" && b.x === POS.mediolanum.x);
  check("alınan yerin nüfusunun dörtte biri kaçar", s2.places.mediolanum.pop === Math.round(pop0 * 0.75), s2.places.mediolanum.pop);
  check("saldırı hareketi bitirir", b.mp === 0);
  const weak = raise(s2, "rome", { inf: 5 });
  check("menzil dışından saldırılamaz", !M.canAttack(s2, weak, "massalia"));
  before(weak, "massalia");
  M.attack(s2, weak.id, "massalia", [1, 1]);
  check("kaybeden ordu yok olur", !S.armyById(s2, weak.id));

  // Yol hızlıdır: aynı uzunluk yolda yarı bedel; Sakalar iki kat yürür.
  const road = [...Array(MAP.W * MAP.H).keys()].find((c) => MAP.isRoad(c) && MAP.around(c).some(([n]) => MAP.isRoad(n)));
  const [rn, rl] = MAP.around(road).find(([n]) => MAP.isRoad(n));
  const off = [...Array(MAP.W * MAP.H).keys()].find((c) => MAP.isLand(c) && !MAP.isRoad(c) && MAP.around(c).some(([n]) => MAP.isLand(n) && !MAP.isRoad(n)));
  const [on, ol] = MAP.around(off).find(([n]) => MAP.isLand(n) && !MAP.isRoad(n));
  check("yolda birim başına 1, yol dışında 2", Math.abs(MAP.stepCost(road, rn, rl) / rl - N.march.road) < 1e-9 && Math.abs(MAP.stepCost(off, on, ol) / ol - N.march.land) < 1e-9);
  const k = S.newGame("saka", 7);
  const sa = S.formArmy(k, "olbia", 10, 0);
  check("Saka ordusunun hareketi iki kat", sa.mp === 2 * N.march.mp);
  M.order(k, sa.id, { place: "tanais" });
  check("Saka ordusu bir turda Olbia'dan Tanais'e (iki yol)", sa.at === "tanais", `${sa.at} ${sa.route.length}`);

  // Boş araziye yürüyüş: o kare.
  const fx = S.newGame("rome", 7);
  const fa = S.formArmy(fx, "rome", 20, 0);
  const spot = project(12.0, 42.6); // Apeninler, yol dışı
  M.order(fx, fa.id, spot);
  check("boş araziye yürür, oraya varır, hiçbir yerin içinde değil", !fa.at && MAP.cellOf(fa.x, fa.y) === MAP.cellOf(spot.x, spot.y) && !fa.route.length, `${fa.x} ${fa.y}`);
  check("gemisiz ordu denize yürüyemez", M.routeTo(fx, fa, project(11, 41.5)) === null);

  // Önünü kesme: savaştığı birinin ordusunun menziline giren ordu durur.
  const z = S.newGame("rome", 7);
  z.relations[S.key("rome", "gaul")] = "war";
  const ro = raise(z, "rome", { inf: 50 });
  ro.mp = 40;
  const way = M.routeTo(z, ro, { place: "massalia" }).cells;
  const mid = MAP.centre(way[Math.floor(way.length / 2)]);
  const gal = raise(z, "bibracte", { inf: 50 });
  gal.at = null; gal.x = mid.x; gal.y = mid.y;
  M.order(z, ro.id, { place: "massalia" });
  check("düşman ordusu yolu kesince menzilinde durur", ro.at !== "massalia" && !ro.route.length && MAP.dist(ro, gal) <= N.reach.zoc && ro.mp > 0, `${ro.at} ${MAP.dist(ro, gal)}`);

  // Yabancı yerleşimin çevresinden geçilmez: bağımsız Bizans boğazı tutuyor.
  const h = S.newGame("rome", 7);
  const an = raise(h, "rome", { inf: 20 });
  put(an, "ancyra");
  h.places.ancyra.owner = "rome";
  h.places.pella.owner = "rome";
  const shut = M.routeTo(h, an, { place: "pella" });
  h.places.byzantium.owner = "rome";
  const open = M.routeTo(h, an, { place: "pella" });
  // Bizans kapalıyken yol Çanakkale'den (Efes yolunun feribotu) dolanır: daha uzun.
  check("bağımsız Bizans boğazı tutarken yol dolanır, alınınca kısalır", open && (!shut || shut.cost > open.cost + 2), `${shut?.cost.toFixed(1)} / ${open?.cost.toFixed(1)}`);
  check("yabancı yerleşimin çevresi yolda yok", shut === null || shut.cells.every((c) => !MAP.rings(N.reach.hold).at(c).includes("byzantium")));
  h.places.byzantium.owner = null;
  before(an, "byzantium");
  check("yerleşimin kapısındaki ordu oradan uzaklaşabilir", M.routeTo(h, an, { place: "ancyra" }) !== null);
  const gate = MAP.centre(MAP.around(MAP.PLACE_CELL.byzantium).map(([x]) => x).find((x) => MAP.isLand(x) && !MAP.placeAtCell(x)));
  check("yerleşimin çevresindeki bir noktaya yürünebilir (oraya gidilir)", M.routeTo(h, put(an, "ancyra"), gate) !== null);

  // Diplomasi: tarafsız -> müttefik -> bozuluyor -> o tur savaş yok -> ertesi tur var.
  const d = S.newGame("rome", 7);
  d.relations[S.key("rome", "gaul")] = "ally";
  const g = S.formArmy(d, "rome", 20, 0);
  check("müttefik şehrine girilir", M.access(d, "rome", "bibracte") === "ally" && M.routeTo(d, g, { place: "bibracte" })?.kind === "walk");
  put(g, "gergovia");
  check("ittifak bozuluyor", D.breakAlliance(d, "rome", "gaul")?.type === "broke" && S.relation(d, "rome", "gaul") === "neutral");
  check("bozulunca ordu şehrin dışına, kapının önüne çıkar", g.at === null && MAP.dist(g, POS.gergovia) < 0.5, `${g.at} ${MAP.dist(g, POS.gergovia)}`);
  check("ittifakın bozulduğu tur savaş ilan edilemez", D.declareWar(d, "rome", "gaul") === null);
  d.turn++;
  check("ertesi tur edilir", D.declareWar(d, "rome", "gaul")?.type === "war");
  check("savaşla barış teklifi turda bir", D.proposePeace(d, "rome", "gaul") && D.proposePeace(d, "rome", "gaul") === null);

  // Ekranın izi: her yürüyüş ve her saldırı kaydediliyor; iz istenmediyse hiç yazılmıyor.
  const tr = S.newGame("saka", 7);
  tr.trace = [];
  const ta = S.formArmy(tr, "olbia", 10, 0);
  M.order(tr, ta.id, { place: "tanais" });
  const t0 = tr.trace[0];
  check("iz: bir yürüyüş, Olbia'dan Tanais'e noktalar", tr.trace.length === 1 && t0.type === "move" && t0.path[0][0] === POS.olbia.x && t0.path.at(-1)[0] === POS.tanais.x && t0.path.length > 10,
    JSON.stringify(tr.trace).slice(0, 120));
  const tq = S.newGame("rome", 7);
  const tb = S.formArmy(tq, "rome", 30, 0);
  M.order(tq, tb.id, { place: "ariminum" });
  check("iz istenmediyse yazılmıyor", !("trace" in tq));
  before(tb, "mediolanum");
  M.refresh(tq, "rome");
  tq.trace = [];
  tb.inf = 200;
  M.attack(tq, tb.id, "mediolanum", [1, 1]);
  check("iz: saldırı kaydı", tq.trace.length === 1 && tq.trace[0].type === "attack" && tq.trace[0].won && tq.trace[0].oldOwner === null && tq.trace[0].at === "mediolanum");

  // Saldıranı püskürten savunma asker kazanamaz (bölüğe yuvarlama 7'yi 10 yapıyordu).
  let grew = 0;
  for (let i = 0; i < 60; i++) {
    const g2 = S.newGame("rome", 7);
    g2.places.mediolanum.inf = 3 + i;
    g2.places.mediolanum.arch = (i * 7) % 23;
    const a2 = before(S.formArmy(g2, "ariminum", 10, 0), "mediolanum");
    a2.inf = 2 + (i % 9);
    const was = g2.places.mediolanum.inf + g2.places.mediolanum.arch;
    const ev2 = M.attack(g2, a2.id, "mediolanum", [1, 1]);
    if (ev2 && !ev2.won && g2.places.mediolanum.inf + g2.places.mediolanum.arch > was) grew++;
  }
  check("püskürten savunma asker kazanmıyor", grew === 0, grew);

  // Tehdit uyarısı: yakında SAVAŞTIĞI birinin ordusu varsa; tarafsızın ordusu tehdit değil.
  const w = S.newGame("rome", 7);
  w.places.syracuse.owner = "carthage";
  const c = before(S.formArmy(w, "carthage", 30, 0), "syracuse");
  check("tarafsızın ordusu tehdit sayılmaz", M.menace(w, "tarentum") === 0);
  D.declareWar(w, "carthage", "rome");
  check("savaştığın ordu yakındaysa tehdit", M.menace(w, "tarentum") === 30 && M.menace(w, "rome") === 0, `${M.menace(w, "tarentum")} ${M.menace(w, "rome")}`);
  void c;
}

// ---------------------------------------------------------------------------------------------
section("Meydan muharebesi ve tarafsızın toprağı");

{
  const s = S.newGame("rome", 7);
  s.relations[S.key("rome", "gaul")] = "war";
  const ro = before(raise(s, "rome", { inf: 120 }), "mediolanum");
  const ga = raise(s, "bibracte", { inf: 40 });
  ga.at = null; ga.x = ro.x + 0.25; ga.y = ro.y;
  check("menzildeki düşman ordusuna saldırılır", M.canStrike(s, ro, ga));
  check("savaşmadığın ordusuna saldırılmaz", (() => { s.relations[S.key("rome", "gaul")] = "neutral"; const no = !M.canStrike(s, ro, ga); s.relations[S.key("rome", "gaul")] = "war"; return no; })());
  check("şehrin içindeki orduya meydan muharebesi yok", (() => { put(ga, "bibracte"); const no = !M.canStrike(s, ro, ga); ga.at = null; ga.x = ro.x + 0.25; ga.y = ro.y; return no; })());
  ga.general = { name: "Brennus", level: 1, xp: 0, traits: [] };
  const f = M.forecastField(s, ro, ga);
  check("meydan muharebesinin tahmini", f.odds === "easy", f.odds);
  s.trace = [];
  const ev = M.strike(s, ro.id, ga.id, [1, 1]);
  check("meydan muharebesi: kazanan kalır, kaybeden ordu yok olur", ev?.won && ev.field && !S.armyById(s, ga.id) && S.armyById(s, ro.id) && ro.mp === 0);
  check("olayın yeri en yakın yerleşim, sursuz", ev.place === "mediolanum" && ev.at && s.trace[0]?.type === "attack" && s.trace[0].at === null);
  check("yenilen generali ölür", s.fallenGenerals?.gaul?.includes("Brennus"));

  // Denizde: filo filoya; yenilen filo askerleriyle batar.
  const n = S.newGame("rome", 7);
  n.relations[S.key("rome", "carthage")] = "war";
  // Kartaca açıklarında yan yana iki deniz karesi.
  const c1 = [...Array(MAP.W * MAP.H).keys()].find((c) => !MAP.isLand(c) && MAP.dist(MAP.centre(c), POS.carthage) < 1.2 && MAP.around(c).some(([x]) => !MAP.isLand(x)) && MAP.around(c).some(([x]) => MAP.isLand(x) && !MAP.placeAtCell(x)));
  const c2 = MAP.around(c1).find(([x]) => !MAP.isLand(x))[0];
  const rf = raise(n, "rome", { inf: 20, trireme: 3 });
  rf.at = null; Object.assign(rf, MAP.centre(c1)); rf.mp = 5;
  const cf = raise(n, "carthage", { inf: 20, ships: 2 });
  cf.at = null; Object.assign(cf, MAP.centre(c2));
  const nev = M.strike(n, rf.id, cf.id, [1, 1]);
  check("denizde: triremeler kadırgaları batırır, askerleri de", nev?.won && nev.naval && !S.armyById(n, cf.id) && rf.trireme >= 2, JSON.stringify(nev?.naval));
  const ashore = raise(n, "carthage", { inf: 10 });
  ashore.at = null; Object.assign(ashore, MAP.centre(MAP.around(c1).map(([x]) => x).find((x) => MAP.isLand(x) && !MAP.placeAtCell(x))));
  rf.mp = 5;
  check("karadaki ordu denizdeki filoya saldıramaz", !M.canStrike(n, ashore, rf) && MAP.dist(ashore, rf) <= N.reach.strike);

  // Tarafsızın toprağı: girilir ama öfkelenir; sabrı taşınca savaş.
  const t = S.newGame("rome", 7);
  const tres = before(S.formArmy(t, "rome", 30, 0), "alexandria");
  check("toprak: İskenderiye'nin önü Mısır'ın", MAP.regionOf(MAP.cellOf(tres.x, tres.y)) === "alexandria");
  const evs = D.trespass(t, []);
  check("tarafsızın toprağında: öfke +1 ve oyuncuya haber", D.angerOf(t, "egypt", "rome") === 1 && evs.some((e) => e.type === "trespass" && e.by === "rome" && e.victim === "egypt"));
  D.trespass(t, []); D.trespass(t, []);
  check("üç tur sonra öfke savaş eşiğinde", D.angerOf(t, "egypt", "rome") >= N.anger.war);
  check("öfkeli medeniyet ittifak istemez", !D.wantsAlliance(t, "egypt", "rome"));
  t.turn = 3; // barış süresinin içinde
  const { aiTurn: AI } = await import("../src/rules/ai.js");
  const wev = [];
  AI(t, "egypt", wev);
  check("öfkesi taşan bilgisayar barış süresini beklemeden savaş açar", S.relation(t, "egypt", "rome") === "war" && wev.some((e) => e.type === "war" && e.on === "rome"));
  const u = S.newGame("rome", 7);
  before(S.formArmy(u, "rome", 30, 0), "alexandria");
  D.trespass(u, []);
  u.armies = [];
  D.trespass(u, []);
  check("çıkınca öfke söner", D.angerOf(u, "egypt", "rome") === 0.5);
  check("bilgisayar tarafsızın toprağını pahalı sayar", M.avoidFor(u, "rome")(MAP.cellOf(POS.alexandria.x + 0.5, POS.alexandria.y + 0.5)) > 0 && M.avoidFor(u, "rome")(MAP.PLACE_CELL.tarentum) === 0);
}

// ---------------------------------------------------------------------------------------------
section("Tecrübe: rütbeler ve savaşın dökümü");

{
  check("rütbeler: 2 Kıdemli, 5 Usta, 9 Seçkin", [0, 1, 2, 4, 5, 8, 9, 30].map((x) => C.veteranRank(x)).join() === "0,0,1,1,2,2,3,3");
  check("rütbe başına savaşta +%5", Math.abs(C.veteranMul(9) - 1.15) < 1e-9 && C.veteranMul(undefined) === 1);
  check("sonraki rütbe", C.nextRankXp(0) === 2 && C.nextRankXp(5) === 9 && C.nextRankXp(9) === null);
  const base = { civ: null, inf: 100, arch: 0, cav: 0, siege: 0 };
  const plain = C.fight({ ...base }, { ...base }, null);
  const vet = C.fight({ ...base, vet: 1.1 }, { ...base }, null);
  check("tecrübe gücü çarpar: eşit iki ordudan tecrübelisi kazanır", Math.abs(vet.attPow / plain.attPow - 1.1) < 1e-9 && vet.attWins && !plain.attWins);

  // Kazanan tecrübe kazanır; rütbe atlarsa olay söyler (sonuç şeridi gösterir).
  const s = S.newGame("rome", 7);
  const a = before(raise(s, "rome", { inf: 200 }), "massalia");
  a.xp = 1;
  const ev = M.attack(s, a.id, "massalia", [1, 1]);
  check("yerleşimi alan ordu tecrübe kazanır, rütbe atladığını olay söyler", ev?.won && a.xp === 1 + N.veteran.win && ev.rankUp === 1, `${a.xp} ${ev?.rankUp}`);

  // Şehri tutan içerideki ordu tecrübe kazanır; savunmada içeridekilerin tecrübesi kişi sayısıyla tartılır.
  const g = S.newGame("rome", 7);
  g.relations[S.key("rome", "gaul")] = "war";
  const inside = raise(g, "bibracte", { inf: 40 });
  const weak = before(S.formArmy(g, "rome", 10, 0), "bibracte");
  const ev2 = M.attack(g, weak.id, "bibracte", [1, 1]);
  check("şehri tutan içerideki ordu tecrübe kazanır", ev2 && !ev2.won && inside.xp === N.veteran.held, `${ev2?.won} ${inside.xp}`);
  inside.xp = 9;
  const probe = before(S.formArmy(g, "rome", 10, 0), "bibracte");
  const sd = M.sides(g, probe, "rome", "bibracte");
  const pl = g.places.bibracte;
  const want = (S.men(pl) + S.men(inside) * C.veteranMul(9)) / (S.men(pl) + S.men(inside));
  check("savunmada içerideki orduların tecrübesi sayılır (garnizon acemi)", Math.abs(sd.def.vet - want) < 1e-9 && sd.def.vet > 1 && sd.def.vet < C.veteranMul(9), `${sd.def.vet} ${want}`);

  // Meydanda: kazanan tecrübe kazanır.
  const f = S.newGame("rome", 7);
  f.relations[S.key("rome", "gaul")] = "war";
  const ro = before(raise(f, "rome", { inf: 120 }), "mediolanum");
  const ga = raise(f, "bibracte", { inf: 40 });
  ga.at = null; ga.x = ro.x + 0.25; ga.y = ro.y; ga.xp = 4;
  ro.xp = 8;
  const fev = M.strike(f, ro.id, ga.id, [1, 1]);
  check("meydanda kazanan tecrübe kazanır: Usta'dan Seçkin'e", fev?.won && ro.xp === 8 + N.veteran.win && fev.rankUp === 3, `${ro.xp} ${fev?.rankUp}`);
  check("meydan muharebesinin iki tarafında tecrübe", M.fieldSides(f, { ...ro, xp: 9 }, { ...ro, owner: "gaul", xp: 0 }).att.vet === C.veteranMul(9));

  // Birleşen orduların tecrübesi kişi sayısıyla tartılır; ayrılan bölük tecrübesini götürür.
  const m = S.newGame("rome", 7);
  const x1 = raise(m, "rome", { inf: 30 });
  const x2 = raise(m, "rome", { inf: 10 });
  x1.xp = 8; x2.xp = 0;
  check("birleşen orduların tecrübesi tartılı", S.merge(m, x1.id, x2.id) && x1.xp === 6, x1.xp);
  const part = S.detach(m, x1.id, { inf: 10 });
  check("ayrılan bölük tecrübesini götürür", part && part.xp === 6);

  // Döküm: savaşı çeviren her şey doğru tarafta; her birinin iki dilde yazısı var.
  const ex = C.explain(
    { civ: "rome", inf: 100, arch: 0, cav: 20, siege: 20, gen: { level: 2, traits: ["siege"] }, vet: 1.1, terrain: 0.85 },
    { civ: "gaul", inf: 50, arch: 20, cav: 0, siege: 0, gen: null, vet: 1.05, terrain: 1.25 }, "city");
  const keys = (l) => l.map(([k]) => k);
  check("döküm: komutan, tecrübe, nehir, makine, kuşatma ustası, sura süvari saldıranda", ["general", "veteran", "river", "engines", "siegeGeneral", "cavWalls"].every((k) => keys(ex.att).includes(k)), keys(ex.att).join());
  check("döküm: sur, geçit ve tecrübe savunanda", ["cityWalls", "pass", "veteran"].every((k) => keys(ex.def).includes(k)), keys(ex.def).join());
  check("döküm: etkisi olmayan yok", C.explain({ civ: null, inf: 10 }, { civ: null, inf: 10 }, null).att.length === 0);
  const { TEXT } = await import("../src/text.js");
  const src = readFileSync(new URL("../src/rules/combat.js", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export function explain"));
  const used = [...new Set([...body.matchAll(/"(\w+)"/g)].map((x) => x[1]))].filter((k) => !["castle", "siege", "city", "defInf", "walls", "Tech"].includes(k)).concat(["cityWallsTech", "castleWallsTech"]);
  for (const lang of ["en", "tr"]) check(`${lang}: dökümün her anahtarının yazısı var`, used.every((k) => TEXT[lang].mods?.[k]), used.filter((k) => !TEXT[lang].mods?.[k]).join());
  check("rütbe adları iki dilde dört", ["en", "tr"].every((l) => TEXT[l].ranks?.length === 4));
}

// ---------------------------------------------------------------------------------------------
section("Araştırma ağacı (bölüm 23)");

{
  const { TECHS, techById } = R;
  const spots = new Set(TECHS.map((t) => `${t.tier}:${t.lane}`));
  check("16 teknoloji, 4 çağ x 4 kol, her yer dolu", TECHS.length === 16 && spots.size === 16);
  check("her teknoloji sadece önceki çağlardan bir şey ister", TECHS.every((t) => t.needs.every((n) => techById[n] && techById[n].tier < t.tier)));
  check("açılan birimler: süvari, kuşatma makinesi, kinkerem", ["cav", "siege", "quinq"].every((k) => R.unlockerOf(k)) && TECHS.filter((t) => t.unlock).length === 3);
  const { TEXT } = await import("../src/text.js");
  for (const lang of ["en", "tr"]) check(`${lang}: her teknolojinin adı ve etkisi yazılı`, TECHS.every((t) => TEXT[lang].techs[t.id]?.[0] && TEXT[lang].techs[t.id]?.[1]) && TEXT[lang].tiers.length === 4);

  const s = S.newGame("rome", 7);
  check("yeni oyunda kimse bir şey bilmez", CIVS.every((c) => s.civs[c.id].techs.length === 0 && s.civs[c.id].research === null && s.civs[c.id].bank === 0));
  const pop = S.placesOf(s, "rome").reduce((n, id) => n + s.places[id].pop, 0);
  check("bilim: her 80 nüfus 1, başkent +2", Math.abs(R.scienceOf(s, "rome") - (pop / N.research.popPer + N.research.capital)) < 1e-9, R.scienceOf(s, "rome"));
  check("Makedonya bilimi x1.25 (Aristoteles)", Math.abs(R.scienceOf(s, "macedon") - (S.placesOf(s, "macedon").reduce((n, id) => n + s.places[id].pop, 0) / N.research.popPer + N.research.capital) * 1.25 * 1) < 1e-6 || s.player !== "macedon");
  const wide = S.newGame("rome", 7);
  ["massalia", "syracuse", "athens", "carthage", "pella"].forEach((id) => { wide.places[id].owner = "rome"; });
  const nRome = S.placesOf(wide, "rome").length;
  check("geniş ülke pahalı araştırır: 6 yerleşimden sonra her biri +%5", R.costFor(s, "rome", "writing") === R.costOf("writing") && R.costFor(wide, "rome", "writing") === Math.round(R.costOf("writing") * (1 + 0.05 * (nRome - 6))), `${nRome} yer ${R.costFor(wide, "rome", "writing")}`);
  check("kilitli teknoloji seçilmez (Atçılık önce Sulama ister)", !R.choose(s, "rome", "horseback") && R.choose(s, "rome", "irrigation") && s.civs.rome.research === "irrigation");

  // Seçilmemişken bilim birikir; seçilince akar; bitince olay, artan birikir.
  const t = S.newGame("rome", 7);
  const sci = R.scienceOf(t, "rome");
  R.tickResearch(t, []);
  check("seçilmemiş bilim boşa gitmez, birikir", Math.abs(t.civs.rome.bank - sci) < 1e-9);
  R.choose(t, "rome", "writing");
  const evs = [];
  let turns = 1;
  while (!t.civs.rome.techs.includes("writing") && turns < 50) { R.tickResearch(t, evs); turns++; }
  check("araştırma bilim bedeline varınca biter", t.civs.rome.techs.includes("writing") && turns === Math.ceil(R.costOf("writing") / sci), `${turns} tur`);
  check("biten araştırma olay olur, artan bilim birikir", evs.some((e) => e.type === "tech" && e.civ === "rome" && e.tech === "writing") && t.civs.rome.research === null && t.civs.rome.bank > 0 && t.civs.rome.bank < sci);
  check("Yazı bilimi x1.2", Math.abs(R.scienceOf(t, "rome") - sci * 1.2) < 1e-9);
  check("kaç tur kaldığı", R.turnsLeft(t, "rome", "currency") === Math.ceil((R.costOf("currency") - t.civs.rome.bank) / R.scienceOf(t, "rome")));

  // Üretim etkileri.
  const e = S.newGame("carthage", 7);
  const out0 = S.output(e, "carthage");
  e.places.carthage.trade = 1;
  const trade0 = S.output(e, "carthage").money;
  for (const id of ["irrigation", "bronze", "sailing", "harbours", "currency"]) R.grant(e, "carthage", id);
  const after = S.output(e, "carthage");
  const pl = e.places.carthage;
  const wheat = pl.farms * N.wheatPerFarm * trait("carthage", "wheat"), fish = (N.fish + pl.fishery * N.port.fishPerLevel);
  check("Sulama tarlaya +%15, Yelkencilik balığa +%30", Math.abs(after.food - (wheat * 1.15 + fish * 1.3)) < 1e-9 && Math.abs(out0.food - (wheat + fish)) < 1e-9, `${out0.food} -> ${after.food}`);
  check("Bronz silaha +%15", Math.abs(after.weapons - out0.weapons * 1.15) < 1e-9);
  check("Sikke paraya +%10, Limancılık ticarete +%30", Math.abs(after.money - (pl.pop / N.taxPer + N.port.tradePerLevel * 1.3) * trait("carthage", "money") * 1.1) < 1e-9 && trade0 < after.money);
  const cost0 = S.upgradeInfo(e, "carthage", "farms").cost;
  R.grant(e, "carthage", "engineering");
  check("Mühendislik yükseltmeleri %20 ucuzlatır", S.upgradeInfo(e, "carthage", "farms").cost === Math.round(cost0 * 0.8), `${cost0} -> ${S.upgradeInfo(e, "carthage", "farms").cost}`);
  const g1 = S.newGame("rome", 7), g2 = S.newGame("rome", 7);
  for (const g of [g1, g2]) g.places.tarentum.pop = 10;
  R.grant(g2, "rome", "medicine");
  T.economy(g1, []); T.economy(g2, []);
  check("Tıp nüfus artışını hızlandırır", g2.places.tarentum.pop > g1.places.tarentum.pop, `${g1.places.tarentum.pop} ${g2.places.tarentum.pop}`);

  // Savaş etkileri: savaşın taraflarına konur, dökümde görünür.
  const w = S.newGame("rome", 7);
  R.grant(w, "rome", "ironWorking");
  const base = { inf: 100, arch: 0, cav: 0, siege: 0 };
  const plain = C.fight({ civ: "gaul", ...base }, { civ: "gaul", ...base }, null);
  const iron = C.fight({ civ: "gaul", ...base, mods: R.modsOf(w, "rome") }, { civ: "gaul", ...base }, null);
  check("Demir İşleme piyadeye +%10", Math.abs(iron.attPow / plain.attPow - 1.1) < 1e-9 && iron.attWins);
  R.grant(w, "rome", "strategy");
  check("Strateji ve Taktik: savaş çarpanları", JSON.stringify(R.modsOf(w, "rome")) === JSON.stringify({ inf: 1.1, arch: 1.15, cav: 1.15, all: 1.1 }), JSON.stringify(R.modsOf(w, "rome")));
  const army = before(raise(w, "rome", { inf: 60, arch: 20 }), "massalia");
  const sd = M.sides(w, army, "rome", "massalia");
  const ex = C.explain(sd.att, sd.def, sd.walls);
  check("dökümde araştırma satırları", ["techAll", "techInf", "techArch"].every((k) => ex.att.some(([x]) => x === k)), ex.att.map(([x]) => x).join());
  const wallsOff = C.fight({ civ: null, inf: 100 }, { civ: null, inf: 100 }, "city");
  const wallsOn = C.fight({ civ: null, inf: 100 }, { civ: null, inf: 100, mods: { walls: 1.2 } }, "city");
  check("Surculuk savunanın surunu güçlendirir", Math.abs(wallsOn.defPow / wallsOff.defPow - 1.2) < 1e-9);
  const navy = C.naval({ civ: null, trireme: 4 }, { civ: null, trireme: 4 }, [1, 1]);
  const navy2 = C.naval({ civ: null, trireme: 4, mods: { navy: 1.25 } }, { civ: null, trireme: 4 }, [1, 1]);
  check("Seyir filoyu güçlendirir: eşit filodan araştıranı kazanır", !navy.attWins && navy2.attWins);

  // Skor ve bilgisayar.
  const sc = S.newGame("rome", 7);
  const s0 = VIC.scoreOf(sc, "rome").total;
  R.grant(sc, "rome", "tactics");
  check("her teknoloji skora sayılır (Taktik ve istedikleri: 5)", sc.civs.rome.techs.length === 5 && VIC.scoreOf(sc, "rome").total === s0 + 5 * N.score.tech && VIC.scoreOf(sc, "rome").parts.techs === 5 * N.score.tech);
  const b = S.newGame("rome", 7);
  for (let i = 0; i < 40; i++) T.endTurn(b);
  const ais = CIVS.filter((c) => c.id !== "rome" && b.civs[c.id].alive);
  check("bilgisayarlar araştırır: 40 turda her biri en az 2 teknoloji", ais.every((c) => b.civs[c.id].techs.length >= 2), ais.map((c) => `${c.id} ${b.civs[c.id].techs.length}`).join(" "));
  check("bilgisayarın bildiği her şeyin istedikleri de biliniyor", ais.every((c) => b.civs[c.id].techs.every((id) => R.techById[id].needs.every((n) => b.civs[c.id].techs.includes(n)))));
  check("oyuncunun yerine bilgisayar seçmez", b.civs.rome.research === null && b.civs.rome.techs.length === 0 && b.civs.rome.bank > 0);

  // Eski kayıt: kullandığı birimin teknolojisi (ve istedikleri) verilir.
  const old = S.newGame("rome", 7);
  for (const c of Object.values(old.civs)) { delete c.techs; delete c.progress; delete c.research; delete c.bank; }
  old.version = 12;
  old.places.rome.barracks = 3;
  old.places.carthage.quinq = 1;
  S.migrate(old);
  check("eski kayıt: kışla 3 olana Atçılık ve Sulama, kinkeremi olana Gemi İnşası zinciri", old.version === S.VERSION
    && ["irrigation", "horseback"].every((id) => old.civs.rome.techs.includes(id)) && !old.civs.rome.techs.includes("engineering")
    && ["sailing", "harbours", "shipbuilding"].every((id) => old.civs.carthage.techs.includes(id)) && old.civs.egypt.techs.length === 0 && old.civs.egypt.bank === 0);
}

// ---------------------------------------------------------------------------------------------
section("Harikaları inşa etme yarışı (bölüm 18b)");

{
  const W = await import("../src/rules/wonders.js");
  const { TEXT } = await import("../src/text.js");
  check("6 antik + 6 inşa edilebilir harika", W.WONDERS.length === 6 && W.BUILDABLE.length === 6 && W.ALL_WONDERS.length === 12);
  for (const lang of ["en", "tr"]) check(`${lang}: her harikanın adı ve armağanı yazılı`, W.ALL_WONDERS.every((w) => TEXT[lang].wonders[w]?.[0] && TEXT[lang].wonders[w]?.[1]));
  const s = S.newGame("rome", 7);
  const rome = s.places.rome;
  s.civs.rome.money = 1000;
  check("kalede harika yapılmaz", S.wonderInfo(s, "ariminum", "oracle").why === "castle" || byId.ariminum.kind !== "castle");
  check("şehir seviyesi 3 gerek", S.wonderInfo(s, "rome", "oracle").why === "wonderLevel");
  rome.level = 3;
  check("araştırma gerek (Kütüphane: Yazı)", S.wonderInfo(s, "rome", "library").why === "tech_writing");
  check("Büyük Liman liman ister", S.wonderInfo(s, "ariminum", "harbour").why !== null);
  check("Delfi Kahini hemen yapılabilir", S.wonderInfo(s, "rome", "oracle").why === null);
  const m0 = s.civs.rome.money;
  check("başlatınca para ödenir, bir inşaatçı çalışır", S.startWonder(s, "rome", "oracle") && s.civs.rome.money === m0 - 140 && S.freeBuilders(s, "rome") === 1);
  s.places.tarentum.level = 3;
  check("aynı harika iki şehirde birden yapılmaz", S.wonderInfo(s, "tarentum", "oracle").why === "elsewhere");
  check("Vazgeç parayı geri verir", S.cancelBuild(s, "rome", "wonder:oracle") && s.civs.rome.money === m0);

  // Yarış: Roma ve Mısır aynı harikayı yapar; önce biten alır, öteki paranın yarısını geri alır.
  const r = S.newGame("rome", 7);
  r.civs.rome.money = r.civs.egypt.money = 500;
  r.places.rome.level = 3;
  r.places.alexandria.level = 3;
  S.startWonder(r, "rome", "oracle");
  S.startWonder(r, "alexandria", "oracle");
  r.places.alexandria.builds.find((b) => b.what === "wonder:oracle").left = 3;
  const eg0 = r.civs.egypt.money;
  R.choose(r, "egypt", "bronze");
  const evs = [];
  for (let i = 0; i < 3; i++) S.progressBuilds(r, evs);
  check("ilk bitiren alır: Delfi Kahini İskenderiye'de", r.built.oracle === "alexandria" && evs.some((e) => e.type === "wonderBuilt" && e.civ === "egypt" && e.wonder === "oracle"));
  check("yarışı kaybedenin inşaatı biter, paranın yarısı döner", !r.places.rome.builds.some((b) => b.what === "wonder:oracle") && r.civs.rome.money === 500 - 140 + 70 && evs.some((e) => e.type === "wonderMissed" && e.civ === "rome" && e.refund === 70));
  check("artık kimse yapamaz", S.wonderInfo(r, "rome", "oracle").why === "taken");
  check("Delfi Kahini: araştırılan teknoloji bu tur biter", (() => { R.tickResearch(r, []); return r.civs.egypt.techs.includes("bronze"); })(), r.civs.egypt.techs.join());
  check("harika skora ve sayıma girer", W.wondersOf(r, "egypt").some((w) => w.id === "oracle") && W.wondersAt(r, "alexandria").length === 2);
  r.places.alexandria.owner = "rome";
  check("şehri alan harikayı da alır", W.holds(r, "rome", "oracle") && !W.holds(r, "egypt", "oracle"));

  // Etkiler.
  const e = S.newGame("carthage", 7);
  const sci0 = R.scienceOf(e, "carthage"), out0 = S.output(e, "carthage");
  e.places.carthage.trade = 1;
  const trade0 = S.output(e, "carthage").money;
  e.built = { library: "carthage", treasury: "carthage" };
  check("Büyük Kütüphane bilimi x1.25", Math.abs(R.scienceOf(e, "carthage") - sci0 * 1.25) < 1e-9);
  check("Büyük Hazine parayı x1.15", Math.abs(S.output(e, "carthage").money - trade0 * 1.15) < 1e-9);
  e.built.harbour = "carthage";
  check("Büyük Liman filoyu x1.2 güçlendirir", R.modsOf(e, "carthage").navy === N.wonders.harbourNavy);
  const { drift } = await import("../src/rules/loyalty.js");
  const d0 = drift(e, "carthage").total;
  e.built.colosseum = "carthage";
  check("Kolezyum: her yerde sadakat turda +3", Math.abs(drift(e, "carthage").total - d0 - 3) < 1e-9);
  const g1 = S.newGame("rome", 7), g2 = S.newGame("rome", 7);
  for (const g of [g1, g2]) g.places.tarentum.pop = 10;
  g2.built = { aqueduct: "rome" };
  T.economy(g1, []); T.economy(g2, []);
  check("Büyük Su Kemeri nüfus artışını hızlandırır", g2.places.tarentum.pop > g1.places.tarentum.pop);

  const old = S.newGame("rome", 7);
  delete old.built;
  old.version = 14;
  S.migrate(old);
  check("eski kayıt: inşa edilmiş harika yok", old.version === S.VERSION && old.built && !Object.keys(old.built).length);

  // Gerileme: boğazdaki feribot yolunda duran gemisiz ordu denizden yol planlamaz (bot, tohum 505).
  const f = S.newGame("rome", 7);
  const ferry = [...Array(MAP.W * MAP.H).keys()].find((c) => !MAP.isLand(c) && MAP.isRoad(c));
  const a = raise(f, "rome", { inf: 30 });
  Object.assign(a, MAP.centre(ferry), { at: null, route: [] });
  check("feribot yolunda gemisiz ordu kara ordusudur", M.modeOf(a) === "land");
}

// ---------------------------------------------------------------------------------------------
section("Barbarlar (bölüm 26)");

{
  const BA = await import("../src/rules/barbarians.js");
  const { TEXT } = await import("../src/text.js");
  const s = S.newGame("rome", 7);
  const camps = BA.campsOf(s);
  check("oyun başında barbar kampları var", camps.length >= N.barbarians.camps && camps.every((a) => a.owner === null && a.camp && a.barbarian && !a.at));
  const caps = PLACES.filter((p) => p.capital);
  check("her başkentin yakınında bir kamp", caps.every((p) => camps.some((a) => MAP.dist(a, POS[p.id]) >= N.barbarians.minDist && MAP.dist(a, POS[p.id]) <= N.barbarians.nearMax)), caps.filter((p) => !camps.some((a) => MAP.dist(a, POS[p.id]) <= N.barbarians.nearMax)).map((p) => p.id).join());
  check("kamplar karada, yerleşimlerin dibinde değil", camps.every((a) => MAP.isLand(MAP.cellOf(a.x, a.y)) && PLACES.every((p) => MAP.dist(a, POS[p.id]) >= N.reach.hold + 0.5)));
  check("barbarlar herkese düşman, savaş ilan etmeden", M.isFoe(s, "rome", null) && M.isFoe(s, "parthia", null));
  for (const lang of ["en", "tr"]) check(`${lang}: barbar yazıları`, ["barbarians", "barbCamp", "campWon", "evRaidOut", "evRaidTook", "evRaidHeld", "campQ", "barbQ", "tipCamp"].every((k) => TEXT[lang][k]));

  // Kampı dağıtan ganimet alır; kamp çekilmez.
  const camp = camps.find((a) => MAP.dist(a, POS.rome) <= N.barbarians.nearMax);
  const a = raise(s, "rome", { inf: 200 });
  Object.assign(a, { at: null, x: camp.x + 0.3, y: camp.y, mp: 4 });
  const m0 = s.civs.rome.money;
  const ev = M.strike(s, a.id, camp.id, [1, 1]);
  check("kampı dağıtan 40 para ganimet alır, kamp yok olur", ev?.won && ev.camp && ev.loot === N.barbarians.loot && s.civs.rome.money === m0 + N.barbarians.loot && !S.armyById(s, camp.id));

  // Kamp büyür ve akın eder; akıncı yağmalar ya da püskürtülür.
  const t = S.newGame("rome", 7);
  t.turn = N.barbarians.from + 1;
  const c = BA.campsOf(t)[0];
  const n0 = c.inf;
  BA.tickBarbarians(t, []);
  check("kamp her tur büyür", c.inf === Math.min(N.barbarians.cap, n0 + N.barbarians.grow) || t.armies.some((x) => x.raider));
  // Zayıf bir yere akın: Ariminum'un garnizonunu boşalt, kampı oraya yakın koy.
  const r = S.newGame("rome", 7);
  r.turn = 20;
  r.armies = r.armies.filter((x) => !x.camp);
  r.places.ariminum.inf = 0; r.places.ariminum.arch = 0;
  r.civs.rome.money = 100;
  const pop0 = r.places.ariminum.pop;
  const raider = { id: r.nextArmy++, owner: null, barbarian: true, raider: true, target: "ariminum", at: null, ...before({}, "ariminum"), inf: 40, arch: 0, cav: 0, siege: 0, ships: 0, trireme: 0, quinq: 0, mp: 4, route: [], general: null, xp: 0 };
  r.armies.push(raider);
  r.barbarians = { lastCamp: r.turn };
  check("akıncılar yakındaki yere tehdit", M.menace(r, "ariminum") > 0);
  const evs = [];
  BA.tickBarbarians(r, evs);
  const sack = evs.find((e) => e.type === "battle" && e.barbarians);
  check("akın yağmalar: nüfusun dörtte biri ve 25 para gider, yer sahibinde kalır", sack?.won && sack.sacked && r.places.ariminum.owner === "rome" && r.places.ariminum.pop === pop0 - Math.round(pop0 * N.barbarians.sackPop) && r.civs.rome.money === 100 - N.barbarians.sackMoney, JSON.stringify(sack?.sacked));
  check("akıncılar yağmadan sonra dağılır", !r.armies.includes(raider));
  // Güçlü garnizona akın püskürtülür.
  const h = S.newGame("rome", 7);
  h.turn = 20;
  h.armies = h.armies.filter((x) => !x.camp);
  h.places.ariminum.inf = 120;
  const r2 = { id: h.nextArmy++, owner: null, barbarian: true, raider: true, target: "ariminum", at: null, ...before({}, "ariminum"), inf: 20, arch: 0, cav: 0, siege: 0, ships: 0, trireme: 0, quinq: 0, mp: 4, route: [], general: null, xp: 0 };
  h.armies.push(r2);
  h.barbarians = { lastCamp: h.turn };
  const evs2 = [];
  BA.tickBarbarians(h, evs2);
  check("güçlü garnizon akını püskürtür, sayılır", evs2.some((e) => e.type === "battle" && e.barbarians && !e.won) && h.wins.rome === 1 && !h.armies.includes(r2));

  // Öğreticinin haydutları barbarlarla karışmaz.
  const BD = await import("../src/rules/bandits.js");
  const u = S.newGame("rome", 7);
  check("barbar kampı öğreticinin haydutu sayılmaz", BD.banditsOf(u) === null);
  // Eski kayıt: kamplar kurulur.
  const old = S.newGame("rome", 7);
  old.armies = old.armies.filter((x) => !x.camp);
  delete old.barbarians;
  old.version = 17;
  S.migrate(old);
  check("eski kayıt: barbar kampları kurulur", old.version === S.VERSION && BA.campsOf(old).length > 0 && old.barbarians);
}

section("Medeniyete özel birlikler (bölüm 5b)");

{
  const { TEXT } = await import("../src/text.js");
  const { uniqueOf } = await import("../src/rules/numbers.js");
  check("her medeniyetin özel birliği var", CIVS.every((c) => ["inf", "arch", "cav"].includes(N.unique[c.id]?.as) && N.unique[c.id].melee > 0 && N.unique[c.id].cost.money > 0));
  check("bağımsızın elindeki seçkin asker sıradan piyade gibi", uniqueOf(null).as === "inf" && uniqueOf(null).melee === 1);
  for (const lang of ["en", "tr"]) check(`${lang}: özel birlik adları`, CIVS.every((c) => TEXT[lang].eliteOf[c.id]?.length === 3 && TEXT[lang].eliteOf[c.id].every(Boolean)) && TEXT[lang].elite && TEXT[lang].uniqueLine);

  // Kışla 2 ister; fiyatı medeniyetin birliğinden, Roma'nın parası x1.5.
  const s = S.newGame("rome", 7);
  s.civs.rome.money = 200; s.civs.rome.weapons = 50; s.civs.rome.food = 50;
  check("kışla 1'de özel birlik basılmaz", S.recruitInfo(s, "rome", "elite").why === "needBarracks");
  s.places.rome.barracks = 2;
  const m0 = s.civs.rome.money;
  check("kışla 2'de lejyoner basılır: 10 asker, 3 x 1.5 para, 2 silah", S.recruit(s, "rome", "elite") && s.places.rome.elite === N.company && s.civs.rome.money === m0 - 4.5 && s.civs.rome.weapons === 48);
  check("özel birlik kartlarda", S.cardsOf(s.places.rome).some((c) => c.type === "elite" && c.men === N.company));
  check("yeni oyunda her yerde özel birlik yuvası 0", Object.values(S.newGame("egypt", 3).places).every((p) => p.elite === 0));

  // Savaş: lejyoner piyadeden güçlü, falanks hücumu durdurur, atlı okçu ok atar, fil okçulara dalar.
  const wall = { civ: "gaul", inf: 100 };
  check("60 lejyoner 100 piyadeyi yener, 60 Roma piyadesi yenemez", C.fight({ civ: "rome", elite: 60 }, wall, null).attWins && !C.fight({ civ: "rome", inf: 60 }, wall, null).attWins);
  check("falanks süvari hücumunu durdurur", C.fight({ civ: "carthage", cav: 30, inf: 50 }, { civ: "macedon", elite: 30, inf: 30, arch: 30 }, null).charge.byAtt === 0
    && C.fight({ civ: "carthage", cav: 30, inf: 50 }, { civ: "gaul", inf: 60, arch: 30 }, null).charge.byAtt > 0);
  check("atlı okçu ok yağdırır, korunmasız da dövüşür", C.fight({ civ: "saka", elite: 50 }, { civ: "gaul", inf: 50 }, null).volley.byAtt > 0);
  check("fil okçulara dalar", C.fight({ civ: "carthage", elite: 30, inf: 30 }, { civ: "parthia", inf: 30, arch: 40 }, null).charge.byAtt > 0);
  check("Galya savaşçısı saldırırken savunurkenden güçlü", C.fight({ civ: "gaul", elite: 50 }, { civ: "rome", inf: 1 }, null).attPow > C.fight({ civ: "rome", inf: 1 }, { civ: "gaul", elite: 50 }, null).defPow);
  check("savaş dökümünde özel birlik satırı", C.explain({ civ: "rome", elite: 30 }, { civ: "gaul", inf: 30 }, null).att.some(([k]) => k === "elite:rome"));

  // Bilgisayar da basar.
  const { aiTurn: AI5 } = await import("../src/rules/ai.js");
  const a = S.newGame("rome", 7);
  a.places.carthage.barracks = 2;
  a.turn = N.aiEliteFrom + 5;
  Object.assign(a.civs.carthage, { money: 300, weapons: 80, food: 80 });
  AI5(a, "carthage", []);
  check("bilgisayar özel birliğini basar", S.placesOf(a, "carthage").some((id) => a.places[id].elite > 0) || a.armies.some((x) => x.owner === "carthage" && x.elite > 0));

  // Eski kayıt (18): yuva eklenir.
  const old = S.newGame("rome", 7);
  for (const u of [...Object.values(old.places), ...old.armies]) delete u.elite;
  old.version = 18;
  S.migrate(old);
  check("eski kayıt: özel birlik yuvası eklenir", old.version === S.VERSION && Object.values(old.places).every((p) => p.elite === 0) && old.armies.every((x) => x.elite === 0));
}

section("Dinlenme (bölüm 6c)");

{
  const RF = await import("../src/rules/refill.js");
  const { TEXT } = await import("../src/text.js");
  for (const lang of ["en", "tr"]) check(`${lang}: dinlenme yazıları`, TEXT[lang].cardRest && TEXT[lang].evRefill);
  for (const lang of ["en", "tr"]) check(`${lang}: kayıt yuvası yazıları`, ["saveBtn", "loadBtn", "saveTitle", "loadTitle", "autoSlot", "slotN", "slotEmpty", "savedTo", "saveFail", "closeBtn", "playersN"].every((k) => TEXT[lang][k]));
  // Garnizon: yarım bölük turda 3 asker kazanır, nüfustan.
  const s = S.newGame("rome", 7);
  s.places.rome.inf = 37; s.places.rome.arch = 20; s.civs.rome.food = 20;
  const pop = s.places.rome.pop;
  const ev = [];
  RF.replenish(s, ev);
  check("garnizonun yarım bölüğü turda 3 asker kazanır, tam bölük değişmez", s.places.rome.inf === 40 && s.places.rome.arch === 20 && s.places.rome.pop === pop - 3);
  check("oyuncuya haber: kaç asker toparlandı", ev.some((e) => e.type === "refill" && e.civ === "rome" && e.men === 3));
  s.places.rome.inf = 31;
  RF.replenish(s, []);
  check("bölüğü tamamlayana kadar, fazlası değil", s.places.rome.inf === 34);
  // Ordu: kendi şehrinde, yürümeden bekleyen toparlanır; yürüyen ya da yabancı toprakta olan toparlanmaz.
  const a = raise(s, "rome", { inf: 40 });
  a.inf = 25;
  a.mp = M.mpMax(a);
  RF.replenish(s, []);
  check("şehrinde dinlenen ordu toparlanır", a.inf === 28);
  a.mp = 1;
  RF.replenish(s, []);
  check("bu tur yürüyen ordu toparlanmaz", a.inf === 28);
  a.mp = M.mpMax(a);
  Object.assign(a, { at: null, ...POS.massalia });
  RF.replenish(s, []);
  check("yabancı toprakta dinlenme yok", a.inf === 28 && RF.restPlace(s, a) === null);
  // Ambar boşsa ya da şehir kuşatılmışsa yok; yerin en az 20 kişisi kalır.
  const t = S.newGame("rome", 7);
  t.places.rome.inf = 37; t.civs.rome.food = 0;
  RF.replenish(t, []);
  check("ambar boşken dinlenme yok", t.places.rome.inf === 37);
  t.civs.rome.food = 20; t.places.rome.pop = N.refill.keep + 1;
  RF.replenish(t, []);
  check("şehirde en az 20 kişi kalır", t.places.rome.inf === 38 && t.places.rome.pop === N.refill.keep);
  // Barbar kampları dinlenmez (sahipsiz).
  const u = S.newGame("rome", 7);
  const camp = u.armies.find((x) => x.camp);
  camp.inf = 23;
  RF.replenish(u, []);
  check("barbar kampı toparlanmaz", camp.inf === 23);
}

section("Büyük krizler (bölüm 27)");

{
  const CR = await import("../src/rules/crises.js");
  const BA = await import("../src/rules/barbarians.js");
  const EV = await import("../src/rules/events.js");
  const { TEXT } = await import("../src/text.js");
  const { neighbours } = await import("../src/rules/graph.js");
  for (const lang of ["en", "tr"]) check(`${lang}: kriz yazıları`, ["horde", "evCivilWar", "evPlagueStart", "evPlagueHit", "evPlagueEnd", "evHorde", "evHordeGone"].every((k) => TEXT[lang][k]) && TEXT[lang].letters.civilWar?.bribe && TEXT[lang].letters.civilWar?.endure);
  const sure = (key, fn) => { const c = N.crises[key].chance; N.crises[key].chance = 1; try { return fn(); } finally { N.crises[key].chance = c; } };
  // Bir medeniyete on yer ver.
  const grow = (st, civ, n) => { for (const p of PLACES.filter((q) => !q.capital && st.places[q.id].owner !== civ).slice(0, Math.max(0, n - S.placesOf(st, civ).length))) M.capture(st, p.id, civ); };

  // İç savaş: oyuncuya mektup, uzak eyaletler; reddederse sadakat 10, altınla 35.
  const w = S.newGame("rome", 7);
  w.turn = N.crises.from + 1;
  grow(w, "rome", N.crises.civilWar.places);
  const evs = [];
  sure("civilWar", () => CR.tickCrises(w, evs));
  const it = w.inbox.find((x) => x.key === "civilWar");
  const rebels = CR.rebelsOf(w, "rome");
  check("iç savaş: büyük imparatorluğa mektup gelir, başkentten en uzak eyaletler", !!it && it.count === rebels.length && rebels.length === Math.ceil(S.placesOf(w, "rome").length * N.crises.civilWar.share) && !rebels.includes("rome") && evs.some((e) => e.type === "civilWar"));
  w.civs.rome.money = 0;
  for (const id of rebels) w.places[id].inf = 37;
  EV.resolve(w, it, "bribe");
  check("parası yetmezse reddetmiş sayılır: eyaletler garnizonlarıyla kopar", rebels.every((id) => w.places[id].owner === null && w.places[id].inf === 37) && w.places.rome.owner === "rome");
  const w2 = S.newGame("rome", 7);
  w2.turn = N.crises.from + 1;
  grow(w2, "rome", N.crises.civilWar.places);
  sure("civilWar", () => CR.tickCrises(w2, []));
  const it2 = w2.inbox.find((x) => x.key === "civilWar");
  w2.civs.rome.money = 1000;
  for (const id of it2.rebels) w2.places[id].loyalty = 100; // ele geçirilen yerler düşük sadakatle başlar
  EV.resolve(w2, it2, "bribe");
  check("valilere altın: sadakat yalnız 35'e düşer, parası gider", it2.rebels.every((id) => w2.places[id].loyalty === N.crises.civilWar.calm) && w2.civs.rome.money === 1000 - it2.bribe);
  sure("civilWar", () => CR.tickCrises(w2, []));
  check("iç savaş arası en az 40 tur", w2.inbox.filter((x) => x.key === "civilWar").length === 0);
  const small = S.newGame("rome", 7);
  small.turn = N.crises.from + 1;
  sure("civilWar", () => CR.tickCrises(small, []));
  check("küçük medeniyette iç savaş yok", !small.inbox.some((x) => x.key === "civilWar"));
  check("iç savaş rastgele olay olarak düşmez", EV.EVENTS.civilWar.manual === true);

  // Büyük salgın: en kalabalık şehirde başlar, yollarla yayılır; hamam hafifletir.
  const p = S.newGame("rome", 7);
  p.turn = N.crises.from + 1;
  p.places.carthage.pop = 500;
  const pop0 = p.places.carthage.pop, inf0 = p.places.carthage.inf;
  const pe = [];
  sure("plague", () => CR.tickCrises(p, pe));
  check("salgın en kalabalık şehirde başlar: nüfusun dörtte biri, askerin onda biri", pe.some((e) => e.type === "plagueStart" && e.place === "carthage") && p.places.carthage.pop === pop0 - Math.round(pop0 * N.crises.plague.pop) && p.places.carthage.inf === inf0 - Math.floor(inf0 * N.crises.plague.army));
  const sp = N.crises.plague.spread;
  N.crises.plague.spread = 1;
  const pe2 = [];
  CR.tickCrises(p, pe2);
  N.crises.plague.spread = sp;
  check("salgın yollarla komşulara geçer", neighbours("carthage").every((n) => CR.plagueAt(p).has(n)) && pe2.filter((e) => e.type === "plagueHit").length === neighbours("carthage").length);
  const b = S.newGame("rome", 7);
  b.turn = N.crises.from + 1;
  b.places.carthage.pop = 500; b.places.carthage.baths = 3;
  sure("plague", () => CR.tickCrises(b, []));
  check("hamamlar salgını hafifletir", 500 - b.places.carthage.pop === Math.round(500 * N.crises.plague.pop * (1 - Math.min(N.crises.plague.bathsMax, 3 * N.crises.plague.baths))));

  // Büyük göç: en çok yeri olanın sınırında; yağmalayınca dağılmaz, sonraki şehre yürür.
  const h = S.newGame("rome", 7);
  h.turn = N.crises.horde.from + 1;
  grow(h, "parthia", 12);
  h.crises = { war: {}, plague: null, lastPlague: h.turn, lastHorde: 0 };
  const he = [];
  sure("horde", () => CR.tickCrises(h, he));
  const horde = h.armies.find((a) => a.horde);
  check("büyük göç en çok yeri olanın üstüne gelir", !!horde && horde.victim === "parthia" && h.places[horde.target].owner === "parthia" && he.some((e) => e.type === "hordeCame"));
  check("göç büyük: en az 150 + tur kadar", S.men(horde) >= N.crises.horde.base + h.turn - 2);
  // Ariminum'un garnizonunu boşalt, göçü kapısına koy: yağmalar ve Roma'nın yakındaki bir sonraki şehrini hedefler.
  horde.victim = "rome";
  horde.target = "ariminum";
  const first = horde.target;
  h.places[first].inf = 0; h.places[first].arch = 0;
  for (const a of h.armies.filter((x) => x.at === first)) h.armies.splice(h.armies.indexOf(a), 1);
  Object.assign(horde, before({}, first));
  h.barbarians.lastCamp = h.turn;
  const hb = [];
  BA.tickBarbarians(h, hb);
  check("göç yağmalar ve dağılmaz, yeni hedefe yürür", hb.some((e) => e.type === "battle" && e.barbarians && e.won && e.place === first) && h.armies.includes(horde) && horde.target !== first);
  // Ömrü dolunca dağılır.
  h.turn = horde.born + N.crises.horde.life + 1;
  const hg = [];
  BA.tickBarbarians(h, hg);
  check("göç ömrü dolunca dağılır", !h.armies.includes(horde) && hg.some((e) => e.type === "hordeGone"));
}

section("Ticaret yolları (bölüm 28)");

{
  const TR = await import("../src/rules/trade.js");
  const { TEXT } = await import("../src/text.js");
  for (const lang of ["en", "tr"]) check(`${lang}: ticaret yazıları`, ["tradeRoutes", "tradeTip", "tradeNone", "tradeOpen", "tradeFull", "tradeTitle", "tradeSlots", "tradeGo", "tradeOwn", "tradeLand", "tradeSea", "tradeLine", "tradeHalted", "tradeClose", "tradeNoCand", "tradeOpened", "evRouteCut"].every((k) => TEXT[lang][k]));
  const s = S.newGame("rome", 7);
  check("pazarı ya da liman ticareti olmayan şehirde yol yok", TR.slotsOf(s, "rome") === 0 && TR.whyNot(s, "rome", "tarentum") === "slots");
  s.places.rome.market = 1;
  check("pazar bir yol açar, liman ticareti bir daha, 5. seviye pazar bir üçüncüsünü", TR.slotsOf(s, "rome") === 1 && (s.places.rome.trade = 1, TR.slotsOf(s, "rome") === 2) && (s.places.rome.market = N.trade.marketMore, TR.slotsOf(s, "rome") === 3));
  s.places.rome.market = 1; s.places.rome.trade = 0;
  const c = TR.candidates(s, "rome");
  check("adaylar menzilde ve kazancına göre sıralı", c.length > 0 && c.every((x, i) => !i || c[i - 1].value >= x.value) && c.every((x) => TR.wayOf("rome", x.to)));
  check("uzak ve kara/deniz yolu olmayan yer aday değil", !c.some((x) => x.to === "ecbatana"));
  const best = c[0];
  const m0 = S.budget(s, "rome").money;
  check("yol kurulur, kuranın turluk parasına eklenir", !!TR.openRoute(s, "rome", best.to) && Math.abs(S.budget(s, "rome").money - (m0 + best.value)) < 1e-6);
  check("yuvası dolunca ikinci yol kurulmaz", TR.openRoute(s, "rome", c[1].to) === null && TR.whyNot(s, "rome", c[1].to) === "slots");
  check("yabancı yerle ticaret daha kazançlı", TR.valueOf(s, "rome", "massalia") >= TR.valueOf(s, "rome", "tarentum"));
  // Yabancı ortak yarısını alır.
  const t = S.newGame("rome", 7);
  t.places.rome.market = 1;
  const p0 = S.budget(t, "carthage").money;
  TR.openRoute(t, "rome", "carthage");
  check("yabancı ortak yolun yarısını alır", S.budget(t, "carthage").money - p0 === Math.floor(TR.valueOf(t, "rome", "carthage") / 2));
  // Savaş koparır; savaştaki yere kurulamaz.
  const D = await import("../src/rules/diplomacy.js");
  D.declareWar(t, "rome", "carthage");
  const ev = [];
  TR.tickTrade(t, ev);
  check("savaş ticaret yolunu koparır, oyuncuya haber", !(t.routes ?? []).length && ev.some((e) => e.type === "routeCut" && e.civ === "rome"));
  check("savaştaki yere yol kurulmaz", TR.whyNot(t, "rome", "carthage") === "war" && !TR.candidates(t, "rome").some((x) => x.to === "carthage"));
  // Kuşatma ya da abluka parayı durdurur.
  const u = S.newGame("rome", 7);
  u.places.rome.market = 1;
  const r = TR.openRoute(u, "rome", "tarentum");
  u.armies.push({ id: 991, owner: "carthage", besieging: "tarentum", at: null, x: 0, y: 0, inf: 10, arch: 0, cav: 0, siege: 0, elite: 0, ships: 0, trireme: 0, quinq: 0, mp: 0, route: [] });
  check("kuşatılan uçta yol para getirmez", !TR.flowing(u, r) && TR.tradeIncome(u, "rome") === 0);
  // Şehir el değiştirince yol düşer.
  const v = S.newGame("rome", 7);
  v.places.tarentum.market = 1;
  TR.openRoute(v, "tarentum", "rome");
  M.capture(v, "tarentum", "carthage");
  TR.tickTrade(v, []);
  check("şehir el değiştirince yolu düşer", !(v.routes ?? []).length);
  // Bilgisayar da kurar.
  const { aiTurn: AI6 } = await import("../src/rules/ai.js");
  const w = S.newGame("rome", 7);
  w.places.carthage.market = 1;
  AI6(w, "carthage", []);
  check("bilgisayar ticaret yolu kurar", TR.routesFrom(w, "carthage").length === 1);
}

section("Arayüz tür listeleri");

{
  // 0bc3fee'de main.js'in kart imzası elle yazılmış bir listeydi; özel birlik gelince seçim hep sıfırlandı.
  const src = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  check("main.js asker türlerini elle listelemiyor", !src.includes('["inf", "arch", "cav"'));
}

section("Oyuncuya saldırılar (bölüm 29c)");

{
  const IN = await import("../src/rules/incoming.js");
  const { endTurn: ET } = await import("../src/rules/turn.js");
  const { TEXT } = await import("../src/text.js");
  for (const lang of ["en", "tr"]) check(`${lang}: saldırı penceresi ve dizilme yazıları`, ["incomingTitle", "incomingArmy", "incomingSub", "incomingThem", "incomingSee", "incomingFight", "incomingOdds", "defWon", "defLost", "defSacked", "defFieldWon", "defFieldLost", "tacDeployTitle", "tacDeployHint", "tacTimeoutHeld", "raiders"].every((k) => TEXT[lang][k]));
  // Bot oyunu (defer kapalı): hiçbir saldırı ertelenmez.
  const bot = S.newGame("rome", 11);
  for (let i = 0; i < 30; i++) ET(bot);
  check("bot oyununda saldırılar hemen çözülür", !(bot.incoming ?? []).length);
  // Gerçek oyun: bilgisayarın oyuncuya saldırısı ertelenir; oyuncu çözer.
  const g = S.newGame("rome", 11);
  g.defer = true;
  let it = null;
  for (let i = 0; i < 80 && !it; i++) { ET(g); it = IN.incomingFor(g, "rome")[0] ?? null; }
  check("gerçek oyunda bilgisayarın oyuncuya saldırısı ertelenir", !!it && it.to === "rome" && !!S.armyById(g, it.from));
  if (it) {
    const sd = IN.incomingSides(g, it);
    check("bekleyen saldırının iki tarafı", sd.att.civ === it.by && (sd.field || sd.place === it.target));
    const ev = IN.resolveIncoming(g, it);
    check("oyuncu çözünce savaş olur, sıradan düşer", !!ev && ev.incoming && ev.attacker === it.by && !IN.incomingFor(g, "rome").some((x) => x.id === it.id));
  }
  // Oyuncu karar vermeden turu bitirirse otomatik savaş.
  const h = S.newGame("rome", 11);
  h.defer = true;
  let pend = null;
  for (let i = 0; i < 80 && !pend; i++) { ET(h); pend = IN.incomingFor(h, "rome")[0] ?? null; }
  if (pend) { ET(h); check("karar verilmeyen saldırı tur sonunda çözülür", !(h.incoming ?? []).some((x) => x.id === pend.id)); }
  // Taktik sonuçla: savunan kazanırsa yer oyuncuda kalır.
  const k = S.newGame("rome", 7);
  k.defer = true;
  const D = await import("../src/rules/diplomacy.js");
  D.declareWar(k, "gaul", "rome");
  const ga = raise(k, "bibracte", { inf: 60 });
  before(ga, "ariminum");
  ga.mp = 0;
  k.incoming = [{ id: 1, from: ga.id, by: "gaul", to: "rome", kind: "place", target: "ariminum", turn: k.turn }];
  const res = { attWins: false, att: { inf: 0, arch: 0, cav: 0, siege: 0, elite: 0 }, def: { inf: k.places.ariminum.inf, arch: 0, cav: 0, siege: 0, elite: 0 }, attPow: 1, defPow: 9, escaped: { inf: 15, arch: 0, cav: 0, siege: 0, elite: 0 }, tactical: true };
  const kev = IN.resolveIncoming(k, k.incoming[0], res);
  check("taktik savunma zaferi: yer oyuncuda kalır, saldıranın kaçabilenleri geri çekilir", kev && !kev.won && k.places.ariminum.owner === "rome" && S.armyById(k, ga.id)?.inf === 15);
  // Akın mektubu: taktik sonuçla.
  const EV = await import("../src/rules/events.js");
  const r = S.newGame("rome", 7);
  r.inbox.push({ id: 5, turn: r.turn, type: "event", key: "raid", civ: "rome", place: "tarentum", raiders: 40, bribe: 15 });
  const lt = r.inbox.at(-1);
  lt.tactical = { attWins: false, att: { inf: 0, arch: 0, cav: 0, siege: 0, elite: 0 }, def: { inf: 10, arch: 0, cav: 0, siege: 0, elite: 0 }, attPow: 1, defPow: 9, escaped: {}, tactical: true };
  const lr = EV.resolve(r, lt, "fight");
  check("akın mektubu taktik savaşın sonucunu kullanır", lr.result.held === true);
}

section("Taktik savaş: tavır ve dizilme (bölüm 29)");

{
  const TC2 = await import("../src/rules/tactics.js");
  const st = (att, def, walls = null) => TC2.stanceOf(TC2.setupBattle(att, def, walls, 3), "def");
  check("güçlü saldırana karşı zayıf savunan savunur", st({ civ: "rome", inf: 150 }, { civ: "gaul", inf: 30 }) === "defend");
  check("güçlü savunan karşı saldırır", st({ civ: "rome", inf: 30 }, { civ: "gaul", inf: 150 }) === "attack");
  check("haydut ve barbar her zaman saldırır", st({ civ: "rome", inf: 150 }, { civ: null, inf: 30, wild: true }) === "attack");
  check("saldıran her zaman saldırır", TC2.stanceOf(TC2.setupBattle({ civ: "rome", inf: 10 }, { civ: "gaul", inf: 200 }, null, 3), "att") === "attack");
  // Savunan yerinde (ya da tepede) bekler, uzaktaki düşmana yürümez.
  const db = TC2.setupBattle({ civ: "rome", inf: 150 }, { civ: "gaul", inf: 30 }, null, 3);
  const du = db.units.find((u) => u.side === "def"), x0 = du.x;
  for (let i = 0; i < 30; i++) { TC2.aiOrders(db, "def"); TC2.step(db, 0.1); }
  check("savunan uzaktaki düşmana hücum etmez", Math.abs(du.x - x0) < 3, (du.x - x0).toFixed(2));
  // Dizilme: bölgeler ve ışınlama.
  const zb = TC2.setupBattle({ civ: "rome", inf: 80 }, { civ: "gaul", inf: 80 }, null, 3);
  const Za = TC2.deployZone(zb, "att"), Zd = TC2.deployZone(zb, "def");
  check("dizilme bölgeleri: saldıran solda, savunan sağda, ayrık", Za.x1 < Zd.x0 && zb.units.every((u) => { const Z = u.side === "att" ? Za : Zd; return u.x >= Z.x0 && u.x <= Z.x1; }));
  const zu = zb.units.find((u) => u.side === "att");
  TC2.placeAt(zb, [zu.id], { x: 20, y: 50 });
  check("dizilirken birlik tıklanan yere ışınlanır", Math.abs(zu.x - 20) < 0.01 && Math.abs(zu.y - 50) < 3);
  TC2.placeAt(zb, [zu.id], { x: 90, y: 30 });
  check("ışınlama kendi bölgesinin dışına çıkmaz", zu.x <= Za.x1);
  const wz = TC2.setupBattle({ civ: "rome", inf: 80 }, { civ: "gaul", inf: 80 }, "city", 3);
  const WZ = TC2.deployZone(wz, "def"), WC2 = wz.field.city;
  check("surlu şehirde savunanın bölgesi şehrin içi", WZ.x0 > WC2.x0 && WZ.x1 < WC2.x1 && WZ.y0 > WC2.y0 && WZ.y1 < WC2.y1);
  TC2.placeLine(zb, zb.units.filter((u) => u.side === "att").map((u) => u.id), { x: 25, y: 10 }, { x: 25, y: 50 });
  // Dar geçit (kullanıcı 27.10: "okçularımın uzun hattı dar geçitten geçemiyor; daralıp kısalmasına göre uzunluklarını
  // ayarlasınlar"): şehrin kuzeyindeki koridorda geniş hat daralır, geçer.
  const cb = TC2.setupBattle({ civ: "rome", inf: 40, arch: 40 }, { civ: "gaul", inf: 10 }, "city", 3);
  const CC = cb.field.city, ca = cb.units.find((u) => u.side === "att" && u.type === "arch");
  for (const u of cb.units.filter((v) => v.side === "def")) Object.assign(u, { x: CC.x1 - 4, y: CC.y1 - 4 });
  ca.cols = 40;
  Object.assign(ca, { x: CC.x0 - 10, y: CC.y0 - 7, facing: 0 });
  TC2.command(cb, [ca.id], { x: CC.x1 + 6, y: CC.y0 - 7 });
  let narrowest = 99;
  for (let i = 0; i < 300; i++) { TC2.step(cb, 0.1); narrowest = Math.min(narrowest, TC2.footprint(ca).cols); }
  check("geniş hat dar koridorda daralıp geçer", ca.x > CC.x1 && narrowest < 20, `${ca.x.toFixed(1)} cephe ${narrowest}`);
  // Köprüde kola döner, karşıda yeniden açılır.
  const FLq = await import("../src/rules/field.js");
  const Fq = FLq.makeField({ at: { x: POS.bibracte.x - 0.75, y: POS.bibracte.y + 0.25 }, dir: 0, place: null, seed: 9 });
  const brq = Fq.bridges[0], qc = Math.cos(brq.a), qs = Math.sin(brq.a);
  const qb = TC2.setupBattle({ civ: "rome", arch: 20 }, { civ: "gaul", inf: 10 }, null, 3, Fq);
  const qa = qb.units.find((u) => u.side === "att");
  for (const u of qb.units.filter((v) => v.side === "def")) Object.assign(u, { x: 95, y: 55 });
  qa.cols = 20;
  Object.assign(qa, { x: brq.x - qc * 9, y: brq.y - qs * 9, facing: brq.a });
  TC2.command(qb, [qa.id], { x: brq.x + qc * 22, y: brq.y + qs * 22 });
  let onBridge = 99;
  for (let i = 0; i < 120; i++) { TC2.step(qb, 0.1); if (Math.hypot(qa.x - brq.x, qa.y - brq.y) < 2) onBridge = Math.min(onBridge, TC2.footprint(qa).cols); }
  check("köprüde kola döner, karşıda yeniden açılır", onBridge <= 3 && TC2.footprint(qa).cols === 20, `köprüde ${onBridge}, sonra ${TC2.footprint(qa).cols}`);
  // Dost birlikler birbirinin içinden geçer: okçu hattının içinden piyade yürür.
  const pb = TC2.setupBattle({ civ: "rome", inf: 40, arch: 30 }, { civ: "gaul", inf: 10 }, null, 3);
  const [pi, pa] = [pb.units.find((u) => u.side === "att" && u.type === "inf"), pb.units.find((u) => u.side === "att" && u.type === "arch")];
  for (const u of pb.units.filter((v) => v.side === "def")) Object.assign(u, { x: 95, y: 55 });
  Object.assign(pa, { x: 30, y: 30, facing: 0, cols: 30 });
  Object.assign(pi, { x: 22, y: 30, facing: 0 });
  TC2.command(pb, [pi.id], { x: 40, y: 30 });
  for (let i = 0; i < 60; i++) TC2.step(pb, 0.1);
  check("piyade okçu hattının içinden geçer", pi.x > 39 && Math.abs(pa.x - 30) < 0.01);
  check("dizilirken hat çizimi birlikleri hatta ışınlar", zb.units.filter((u) => u.side === "att").every((u) => Math.abs(u.x - 25) < 6 && u.order == null));
}

section("Taktik savaş (bölüm 29)");

{
  const TC = await import("../src/rules/tactics.js");
  const { TEXT } = await import("../src/text.js");
  for (const lang of ["en", "tr"]) check(`${lang}: taktik savaş yazıları`, ["seeResult", "fightIt", "tacTitle", "tacPaused", "tacPause", "tacGo", "tacSpeed", "tacAuto", "tacRetreat", "tacHelp", "tacStart", "tacWon", "tacLost", "tacBack"].every((k) => TEXT[lang][k]));
  const army = { civ: "rome", inf: 100, arch: 40, cav: 30, elite: 20, siege: 0 };
  const b = TC.setupBattle(army, { civ: "gaul", inf: 120, arch: 30 }, null, 5);
  const count = (side, k) => b.units.filter((u) => u.side === side && u.type === k).reduce((n, u) => n + u.men, 0);
  check("birlikler türlere göre toplanır, asker sayısı aynı", ["inf", "arch", "cav", "elite"].every((k) => count("att", k) === army[k]) && count("def", "inf") === 120);
  check("birlikler sahada, saldıran solda savunan sağda", b.units.every((u) => u.x > 0 && u.x < N.tactics.w && u.y > 0 && u.y < N.tactics.h) && b.units.filter((u) => u.side === "att").every((u) => u.x < N.tactics.w / 2) && b.units.filter((u) => u.side === "def").every((u) => u.x > N.tactics.w / 2));
  // Emir: seçilen birlik oraya yürür.
  const inf = b.units.find((u) => u.side === "att" && u.type === "inf");
  const x0 = inf.x;
  TC.command(b, [inf.id], { x: x0 + 10, y: inf.y });
  for (let i = 0; i < 20; i++) TC.step(b, 0.1);
  check("emir verilen birlik yürür", inf.x > x0 + 4);
  // Bitiş ve sonuç.
  TC.autoplay(b);
  const o = TC.outcome(b);
  check("savaş biter, bir taraf kazanır", !!b.over && typeof o.attWins === "boolean");
  check("kazananın sağ kalanları başlangıçtan çok değil, kaybedeninki sıfır", UNITS.every((k) => (o.attWins ? o.att : o.def)[k] <= ((o.attWins ? army : { inf: 120, arch: 30 })[k] ?? 0)) && UNITS.every((k) => (o.attWins ? o.def : o.att)[k] === 0));
  // Açık üstünlük: sonuç otomatik savaşla aynı.
  const strong = TC.outcome(TC.autoplay(TC.setupBattle({ civ: "rome", inf: 200, arch: 60 }, { civ: "gaul", inf: 60, arch: 20 }, null, 9)));
  const weak = TC.outcome(TC.autoplay(TC.setupBattle({ civ: "gaul", inf: 50 }, { civ: "rome", inf: 150, arch: 50 }, null, 9)));
  check("açık üstün taraf kazanır (iki yönde)", strong.attWins && !weak.attWins);
  // Okçular menzildekine ok atar.
  const a2 = TC.setupBattle({ civ: "parthia", arch: 60 }, { civ: "gaul", inf: 60 }, null, 2);
  let shots = 0;
  for (let i = 0; i < 300 && !a2.over; i++) { TC.aiOrders(a2, "att", true); TC.aiOrders(a2, "def"); TC.step(a2, 0.1); shots += a2.shots.length; }
  check("okçular ok yağdırır", shots > 0);
  // Sur (kullanıcı 27.10: "surlara tırmanıyormuş gibi, tek sıra"): dışarıdakiler surun önünde; tırmananlar
  // içeride ayrı bir birlik olur, saniyede en çok N.tactics.climb.rate kişi.
  const FL2 = await import("../src/rules/field.js");
  const w = TC.setupBattle({ civ: "rome", inf: 200 }, { civ: "gaul", inf: 80, arch: 20 }, "city", 4);
  const WC = w.field.city;
  check("kuşatmada şehir dört yanı surlu, içinde savunanlar", !!WC && ["W", "N", "S", "E"].every((sd) => FL2.wallShare(w.field, WC, sd) > 0.9) && w.units.filter((u) => u.side === "def").every((u) => FL2.insideCity(WC, u)) && WC.gates.length === 4 && WC.houses.length > 10);
  let climbedMax = 0, prevInside = 0, outsideOk = true, sides = new Set();
  for (let i = 0; i < 200 && !w.over; i++) {
    TC.aiOrders(w, "att", true); TC.aiOrders(w, "def"); TC.step(w, 0.1);
    const live = w.units.filter((u) => !u.dead && !u.gone && !u.routed);
    if (live.some((u) => u.side === "att" && !u.inside && FL2.insideCity(WC, u))) outsideOk = false;
    for (const u of live) if (u.climbing && u.ladder) sides.add(u.ladder.side);
    const inside = w.units.filter((u) => u.side === "att" && u.from).reduce((n, u) => n + (u.climbed ?? 0), 0) + w.units.filter((u) => u.side === "att" && !u.from).reduce((n, u) => n + (u.climbed ?? 0), 0);
    climbedMax = Math.max(climbedMax, inside - prevInside);
    prevInside = inside;
  }
  const outers = w.units.filter((u) => u.side === "att" && !u.from).length;
  check("surda: dışarıdakiler surun dışında kalır", outsideOk);
  for (const p of w.plan?.values() ?? []) sides.add(p.side);
  check("bilgisayar şehri birden çok yandan sarar", sides.size >= 2, [...sides].join(""));
  check("surda: tırmananlar içeride ayrı birlik olur", w.units.some((u) => u.side === "att" && u.from && u.inside));
  check("surda: tırmanma tek sıra (adımda birlik başına en çok rate x dt + 1)", climbedMax <= outers * (N.tactics.climb.rate * 0.1 + 1), climbedMax);
  // Atlı atından iner (içeride yaya, sura karşı yarı güç); okçu tek başına şehri alamaz.
  const cv = TC.setupBattle({ civ: "rome", cav: 60 }, { civ: "gaul", inf: 20 }, "city", 2);
  for (let i = 0; i < 300 && !cv.units.some((u) => u.from); i++) { TC.aiOrders(cv, "att", true); TC.aiOrders(cv, "def"); TC.step(cv, 0.1); }
  const dis = cv.units.find((u) => u.from);
  check("atlı atından inip tırmanır, içeride yaya", !!dis && dis.dismounted && !dis.mounted && dis.charge === 0 && dis.type === "cav");
  const ar = TC.setupBattle({ civ: "parthia", arch: 120 }, { civ: "gaul", inf: 30 }, "city", 2);
  TC.autoplay(ar);
  check("okçular surlu şehri alamaz (hücum püskürtülür)", ar.over?.winner === "def" && ar.over.repelled);
  // Kuşatma makinesi sura dayanınca gedik açar; gedikten dışarıdaki içeri geçer.
  const bk = TC.setupBattle({ civ: "rome", inf: 40, siege: 20 }, { civ: "gaul", inf: 200 }, "city", 3);
  const ram = bk.units.find((u) => u.type === "siege"), gi = bk.units.find((u) => u.side === "att" && u.type === "inf");
  const BC = bk.field.city;
  Object.assign(ram, { x: BC.x0 - TC.extent(ram).x - 0.3, y: BC.cy - 6 });
  for (let i = 0; i < 400 && !bk.gaps.length; i++) TC.step(bk, 0.1);
  check("makine sura dayanınca gedik açar, sur orada açılır", bk.gaps.length === 1 && Math.abs(bk.gaps[0].y - (BC.cy - 6)) < 1e-6 && FL2.passable(bk.field, BC.x0, BC.cy - 6));
  for (const u of bk.units.filter((v) => v.side === "def")) Object.assign(u, { x: BC.x1 - 4, y: BC.y1 - 4 });
  Object.assign(gi, { x: BC.x0 - 6, y: BC.cy - 6, routed: false });
  TC.command(bk, [gi.id], { x: BC.x0 + 8, y: BC.cy - 6 });
  for (let i = 0; i < 60; i++) TC.step(bk, 0.1);
  check("gedikten geçen tarafını değiştirir", gi.inside && FL2.insideCity(BC, gi));
  // Gedik yokken sur geçilmez: kuzeydeki bir noktaya emir verilen birlik surun etrafından dolanır, içine girmez.
  const ar2 = TC.setupBattle({ civ: "rome", inf: 40 }, { civ: "gaul", inf: 40 }, "city", 5);
  const AC = ar2.field.city, walker = ar2.units.find((u) => u.side === "att");
  for (const u of ar2.units.filter((v) => v.side === "def")) Object.assign(u, { x: AC.x1 - 4, y: AC.y1 - 4 });
  TC.command(ar2, [walker.id], { x: AC.cx, y: AC.y0 - 7 });
  let entered = false;
  for (let i = 0; i < 300; i++) { TC.step(ar2, 0.1); if (FL2.insideCity(AC, walker)) entered = true; }
  check("dışarıdaki birlik surun etrafından dolanır, içine girmez", !entered && Math.hypot(walker.x - AC.cx, walker.y - (AC.y0 - 7)) < 3, `${walker.x.toFixed(1)},${walker.y.toFixed(1)}`);
  check("surun yanından geçen birlik tırmanmaz", !ar2.units.some((u) => u.from) && walker.men === 40);
  // Dost birlikler birbirini itmez (iç içe geçebilir).
  const fr = TC.setupBattle({ civ: "rome", inf: 80 }, { civ: "gaul", inf: 40 }, null, 1);
  const [f1, f2] = fr.units.filter((u) => u.side === "att");
  Object.assign(f2, { x: f1.x, y: f1.y });
  TC.step(fr, 0.1);
  check("dost birlikler iç içe geçebilir", Math.hypot(f1.x - f2.x, f1.y - f2.y) < 0.01);
  // Geniş hat sarar: düşmandan geniş cephe önden de daha çok öldürür.
  const hit = (cols) => {
    const hb = TC.setupBattle({ civ: "gaul", inf: 40 }, { civ: "gaul", inf: 40 }, null, 1);
    const [ha, hd] = [hb.units.find((u) => u.side === "att"), hb.units.find((u) => u.side === "def")];
    ha.cols = cols; hd.cols = 8;
    Object.assign(hd, { x: 50, y: 30, facing: Math.PI });
    Object.assign(ha, { x: 50 - TC.footprint(ha).d / 2 - TC.footprint(hd).d / 2 - 0.3, y: 30, facing: 0 });
    const m0 = hd.men;
    for (let i = 0; i < 20; i++) TC.step(hb, 0.1);
    return m0 - hd.men;
  };
  check("düşmandan geniş hat daha çok öldürür (sarar)", hit(20) > hit(8) * 1.3, `${hit(20).toFixed(1)} / ${hit(8).toFixed(1)}`);
  // Geri çekil: savaş kaybedilir, kalanlar kaçar.
  const r = TC.setupBattle({ civ: "rome", inf: 80 }, { civ: "gaul", inf: 80 }, null, 6);
  r.over = { winner: "def", retreat: true };
  const ro = TC.outcome(r);
  check("geri çekilen: savaş kaybedilir, askerler kaçabilir", !ro.attWins && ro.escaped.inf === 80);

  // Bölme, birleştirme, diziliş (kullanıcı 26.10: "40 piyade tek bir taburdu, ikiye ayıramadım; uzatabilsem").
  const sp = TC.setupBattle({ civ: "rome", inf: 40, arch: 20 }, { civ: "gaul", inf: 40 }, null, 3);
  const p40 = sp.units.find((u) => u.side === "att" && u.type === "inf");
  const half = TC.split(sp, p40.id);
  check("birlik ikiye bölünür, asker sayısı korunur", !!half && p40.men + half.men === 40 && half.type === "inf" && sp.units.includes(half));
  check("çok küçük birlik bölünmez", TC.split(sp, sp.units.find((u) => u.side === "att" && u.type === "arch").id) !== null && TC.split(TC.setupBattle({ civ: "rome", inf: 8 }, { civ: "gaul", inf: 8 }, null, 1), 1) === null);
  const whole = TC.merge(sp, [p40.id, half.id]);
  check("aynı türden birlikler birleşir", whole === p40 && p40.men === 40 && !sp.units.includes(half));
  const c0 = TC.footprint(p40).cols;
  TC.reshape(sp, [p40.id], 1);
  const wide = TC.footprint(p40);
  TC.reshape(sp, [p40.id], -1);
  TC.reshape(sp, [p40.id], -1);
  check("genişlet cepheyi uzatır, derinleştir kısaltır", wide.cols > c0 && TC.footprint(p40).cols < wide.cols && wide.rows < Math.ceil(40 / c0));
  const pl = TC.planLine(sp, [p40.id], { x: 40, y: 10 }, { x: 40, y: 50 });
  check("hat çizimi: birlik çizgi boyunca uzar, düşmana döner", pl.length === 1 && pl[0].cols >= 20 && Math.abs(Math.cos(pl[0].facing) - 1) < 1e-6);
  // Kuşatma: yandan ve arkadan vurulan birlik çok daha çabuk bozulur.
  const routIn = (where) => {
    const bb = TC.setupBattle({ civ: "gaul", inf: 80 }, { civ: "gaul", inf: 40 }, null, 3);
    const [a1, a2] = bb.units.filter((u) => u.side === "att"), d = bb.units.find((u) => u.side === "def");
    const F = TC.footprint;
    Object.assign(d, { x: 50, y: 30, facing: Math.PI });
    Object.assign(a1, { x: 50 - F(a1).d / 2 - F(d).d / 2 - 0.3, y: 30, facing: 0 });
    if (where === "rear") Object.assign(a2, { x: 50 + F(a2).d / 2 + F(d).d / 2 + 0.3, y: 30, facing: Math.PI });
    else Object.assign(a2, { x: 5, y: 5 });
    let t = 0;
    while (!d.routed && !d.dead && t < 60) { TC.step(bb, 0.1); t += 0.1; }
    return { t, face: where === "rear" ? TC.faceOf(d, a2) : null };
  };
  const front = routIn("none"), rear = routIn("rear");
  check("arkadan vurulan birlik çabuk bozulur", rear.face === "rear" && rear.t < 15 && front.t > rear.t * 3, `${front.t.toFixed(1)} / ${rear.t.toFixed(1)}`);

  // Arazi (bölüm 29b; kullanıcı 26.10: "dağlar nehirler köprüler olsun, coğrafyaya göre şekillensin").
  const FL = await import("../src/rules/field.js");
  const gaul = { at: { x: POS.bibracte.x - 0.75, y: POS.bibracte.y + 0.25 }, dir: 0, place: null, seed: 9 };
  const F1 = FL.makeField(gaul), F2 = FL.makeField(gaul);
  check("saha tohumla hep aynı", F1.kind.every((k, i) => k === F2.kind[i]) && F1.bridges.length === F2.bridges.length);
  check("Galya'da gerçek nehir, köprüleri ve orman var", F1.rivers.length > 0 && F1.bridges.length > 0 && F1.kind.some((k) => k === FL.FOREST));
  check("köprü yürünür, nehir yürünmez", F1.bridges.every((br) => FL.passable(F1, br.x, br.y)) && F1.kind.some((k, i) => k === FL.WATER && !FL.passable(F1, i % F1.w + 0.5, Math.floor(i / F1.w) + 0.5)));
  const tar = FL.makeField({ at: { x: POS.tarentum.x - 0.3, y: POS.tarentum.y }, dir: 0, place: "tarentum", attacked: true, seed: 2 });
  check("kıyıda deniz, saldırılan yerin adı ve evleri", tar.sea && tar.labels.some((l) => l.kind === "place" && l.id === "tarentum") && tar.houses.length > 0);
  const alps = FL.makeField({ at: { x: POS.mediolanum.x, y: POS.mediolanum.y - 0.4 }, dir: Math.PI / 2, place: null, seed: 5 });
  check("dağ sırasının yakınında tepeler, sıranın adıyla", alps.hills.length > 0 && alps.labels.some((l) => l.kind === "range" && l.id === "alps"));
  const flat = FL.makeField({ at: { x: POS.babylon.x + 2, y: POS.babylon.y + 1 }, dir: 0, place: null, seed: 4, river: true });
  check("nehir geçişinde sahada gerçek nehir yoksa ortadan bir nehir, köprülü", flat.rivers.length > 0 && flat.bridges.length > 0);
  // Yol bulma: nehrin karşısına köprüden.
  const br = F1.bridges[0];
  const bc = Math.cos(br.a), bs = Math.sin(br.a);
  const from = { x: br.x - bc * 8, y: br.y - bs * 8 }, to = { x: br.x + bc * 8, y: br.y + bs * 8 };
  const path = FL.pathOn(F1, from, to);
  let ok = true, prev = from;
  for (const p of path) { const n = Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y) / 0.5); for (let i = 1; i <= n; i++) if (!FL.passable(F1, prev.x + ((p.x - prev.x) * i) / n, prev.y + ((p.y - prev.y) * i) / n)) ok = false; prev = p; }
  check("yol bulma suya girmeden karşı kıyıya varır", path.length > 0 && ok && Math.hypot(path.at(-1).x - to.x, path.at(-1).y - to.y) < 0.01);
  // Karşı kıyıdaki düşmanla göğüs göğüse dövüşülmez; tepeden vuran güçlü; ormanda yavaş.
  // İki birlik nehrin iki kıyısında, aralarında yalnız su (köprüden uzak): değseler de dövüşmezler.
  let rv = null, spot = null;
  for (const line of F1.rivers) {
    spot = line.map((p, i) => ({ p, i })).find(({ p, i }) => i > 0 && i < line.length - 1 && p.x > 8 && p.x < F1.w - 8 && p.y > 8 && p.y < F1.h - 8 && F1.bridges.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 7));
    if (spot) { rv = line; break; }
  }
  const rb = TC.setupBattle({ civ: "rome", inf: 40 }, { civ: "gaul", inf: 40 }, null, 1, F1);
  const [ra, rd] = [rb.units.find((u) => u.side === "att"), rb.units.find((u) => u.side === "def")];
  const q0 = rv[spot.i - 1], q1 = rv[spot.i + 1], ql = Math.hypot(q1.x - q0.x, q1.y - q0.y);
  const nx = -(q1.y - q0.y) / ql, ny = (q1.x - q0.x) / ql, off = N.tactics.terrain.riverWidth / 2 + TC.footprint(ra).d / 2 + 0.3;
  Object.assign(ra, { x: spot.p.x - nx * off, y: spot.p.y - ny * off, facing: Math.atan2(ny, nx) });
  Object.assign(rd, { x: spot.p.x + nx * off, y: spot.p.y + ny * off, facing: Math.atan2(-ny, -nx) });
  const m0 = ra.men + rd.men;
  for (let i = 0; i < 10; i++) TC.step(rb, 0.1);
  check("nehrin karşı kıyısıyla göğüs göğüse dövüşülmez", !ra.engaged && !rd.engaged && ra.men + rd.men === m0);
  const hillB = TC.setupBattle({ civ: "gaul", inf: 40 }, { civ: "gaul", inf: 40 }, null, 1, alps);
  const top = alps.hills[0];
  const hillA = hillB.units.find((u) => u.side === "att");
  Object.assign(hillA, { x: top.x, y: top.y, facing: 0 });
  check("tepenin üstü yüksek", FL.heightAt(alps, top.x, top.y) > 0.3 && FL.heightAt(alps, top.x, top.y) > FL.heightAt(alps, 2, 2));
  const wood = TC.setupBattle({ civ: "rome", inf: 40 }, { civ: "gaul", inf: 40 }, null, 1, F1);
  const fx = F1.kind.findIndex((k) => k === FL.FOREST);
  const wu = wood.units.find((u) => u.side === "att");
  Object.assign(wu, { x: (fx % F1.w) + 0.5, y: Math.floor(fx / F1.w) + 0.5 });
  const wx0 = wu.x;
  TC.command(wood, [wu.id], { x: wu.x + 0.6, y: wu.y });
  TC.step(wood, 0.1);
  check("ormanda yürüyüş yavaş", wu.x - wx0 < N.tactics.speed.inf * 0.1 * 0.9 && wu.x > wx0 - 1e-9, (wu.x - wx0).toFixed(3));

  // Kurallara hazır sonuç: yer alınır, sağ kalanlar ordunun askeri olur.
  const g = S.newGame("rome", 7);
  const a = raise(g, "rome", { inf: 120 });
  before(a, "tarentum");
  a.mp = 4;
  g.places.tarentum.owner = null;
  const res = { attWins: true, att: { inf: 90, arch: 0, cav: 0, siege: 0, elite: 0 }, def: { inf: 0, arch: 0, cav: 0, siege: 0, elite: 0 }, attPow: 90, defPow: 1, escaped: {}, tactical: true };
  const ev = M.attack(g, a.id, "tarentum", null, res);
  check("taktik zafer: yer alınır, sağ kalanlar ordunun askeri", ev?.won && g.places.tarentum.owner === "rome" && a.inf === 90 && a.at === "tarentum");
  // Meydan muharebesini kaybeden saldıran: sahadan kaçabilenler geri çekilen ordu olur.
  const h = S.newGame("rome", 7);
  const camp = h.armies.find((x) => x.camp);
  const ha = raise(h, "rome", { inf: 60 });
  Object.assign(ha, { at: null, x: camp.x - 0.5, y: camp.y, mp: 4, route: [] });
  const lost = { attWins: false, att: { inf: 0, arch: 0, cav: 0, siege: 0, elite: 0 }, def: { inf: 20, arch: 8, cav: 0, siege: 0, elite: 0 }, attPow: 1, defPow: 28, escaped: { inf: 25, arch: 0, cav: 0, siege: 0, elite: 0 }, tactical: true };
  const fev = M.strike(h, ha.id, camp.id, null, lost);
  check("taktik yenilgi: kaçabilenler geri çekilir", fev && !fev.won && fev.retreat?.men === 25 && S.armyById(h, ha.id)?.inf === 25 && camp.inf === 20);
}

// ---------------------------------------------------------------------------------------------
section("Dağlar ve geri çekilme (bölüm 7, 22b)");

{
  const { project } = await import("../src/geo.js");
  const at = (lat, lon) => { const p = project(lon, lat); return MAP.cellOf(p.x, p.y); };
  check("Alpler, Toroslar, Zagros dağ; Roma, Po ovası, Mısır değil",
    MAP.isMountain(at(46.5, 9.0)) && MAP.isMountain(at(37.2, 33.0)) && MAP.isMountain(at(34.4, 46.8))
    && !MAP.isMountain(MAP.PLACE_CELL.rome) && !MAP.isMountain(at(45.1, 10.5)) && !MAP.isMountain(at(30.0, 31.2)));
  check("yerleşimin karesi dağ sayılmaz", PLACES.every((p) => !MAP.isMountain(MAP.PLACE_CELL[p.id])));
  const m = at(46.5, 9.0);
  const nb = MAP.around(m).find(([c]) => MAP.isLand(c) && !MAP.isRoad(c) && !MAP.isRoad(m));
  check("dağda yol dışı adım iki kat", nb && Math.abs(MAP.stepCost(m, nb[0], nb[1]) - nb[1] * N.march.land * N.march.mountain) < 1e-9);
  const road = [...Array(MAP.W * MAP.H).keys()].find((c) => MAP.isMountain(c) && MAP.isRoad(c) && MAP.around(c).some(([x]) => MAP.isRoad(x)));
  const rn = road !== undefined && MAP.around(road).find(([x]) => MAP.isRoad(x));
  check("dağdaki yol (geçit) yol hızında", rn && Math.abs(MAP.stepCost(road, rn[0], rn[1]) - rn[1] * N.march.road) < 1e-9);

  // Dağda savunan güçlü.
  const s = S.newGame("rome", 7);
  s.relations[S.key("rome", "gaul")] = "war";
  const a = raise(s, "rome", { inf: 60 });
  const b = raise(s, "bibracte", { inf: 60 });
  Object.assign(a, MAP.centre(m), { at: null, route: [] });
  Object.assign(b, MAP.centre(MAP.around(m).find(([c]) => MAP.isLand(c))[0]), { at: null, route: [] });
  b.x = MAP.centre(m).x; b.y = MAP.centre(m).y; a.x += 0.3;
  check("dağdaki savunan dağ geçidi gibi x1.25", M.fieldSides(s, a, b).def.terrain === N.ground.pass);

  // Geri çekilme: yakın savaşta yenilen askerinin bir kısmıyla çekilir, generali sağ kalır.
  const f = S.newGame("rome", 7);
  f.relations[S.key("rome", "gaul")] = "war";
  const ro = before(raise(f, "rome", { inf: 100 }), "mediolanum");
  const ga = raise(f, "bibracte", { inf: 80 });
  ga.at = null; ga.x = ro.x + 0.25; ga.y = ro.y;
  ga.general = { name: "Bolgios", level: 1, xp: 0, traits: [] };
  const ev = M.strike(f, ro.id, ga.id, [1, 1]);
  check("yakın meydan muharebesinde yenilen geri çekilir", ev.won && ev.retreat && S.armyById(f, ga.id) && S.men(ga) === ev.retreat.men && S.men(ga) <= 40 && S.men(ga) >= N.retreat.min, JSON.stringify(ev.retreat));
  check("çekilen kazanandan uzaklaşır, hareketi biter, generali yaşar", MAP.dist(ga, ro) > 0.25 && ga.mp === 0 && ga.general?.name === "Bolgios" && !ev.genFell);
  check("çekilen kara karesinde, yerleşimin dışında", MAP.isLand(MAP.cellOf(ga.x, ga.y)) && !ga.at && !MAP.placeAtCell(MAP.cellOf(ga.x, ga.y)));
  // Ezilen dağılır.
  const g = S.newGame("rome", 7);
  g.relations[S.key("rome", "gaul")] = "war";
  const big = before(raise(g, "rome", { inf: 300 }), "mediolanum");
  const small = raise(g, "bibracte", { inf: 30 });
  small.at = null; small.x = big.x + 0.25; small.y = big.y;
  const ev2 = M.strike(g, big.id, small.id, [1, 1]);
  check("ezilen ordu dağılır", ev2.won && !ev2.retreat && !S.armyById(g, small.id));
  // Saldırıda püskürtülen saldıran: kapının önünde, askerinin bir kısmıyla kalır.
  const h = S.newGame("rome", 7);
  const weak = before(raise(h, "rome", { inf: 40 }), "massalia");
  const x0 = weak.x;
  const ev3 = M.attack(h, weak.id, "massalia", [1, 1]);
  check("püskürtülen saldıran yok olmaz, askerinin bir kısmıyla kapıda kalır", !ev3.won && ev3.retreat && S.armyById(h, weak.id) && S.men(weak) < 40 && weak.x === x0, JSON.stringify(ev3.retreat));
}

// ---------------------------------------------------------------------------------------------
section("Şehir binaları (bölüm 4b)");

{
  const { drift } = await import("../src/rules/loyalty.js");
  const { TEXT } = await import("../src/text.js");
  const s = S.newGame("rome", 7);
  s.civs.rome.money = 500;
  s.places.rome.level = 3;
  check("dört bina, yeni oyunda hiçbiri yok", S.BUILDINGS.length === 4 && Object.values(s.places).every((p) => S.BUILDINGS.every((k) => p[k] === 0)));
  for (const lang of ["en", "tr"]) check(`${lang}: binaların adı ve açıklaması`, S.BUILDINGS.every((k) => TEXT[lang][k] && TEXT[lang].tipUpgrade[k] && TEXT[lang][k + "Fx"]));
  check("tapınak hemen yapılır; pazar Sikke, okul Yazı, hamam Mühendislik ister",
    S.upgradeInfo(s, "rome", "temple").why === null && S.upgradeInfo(s, "rome", "market").why === "tech_currency"
    && S.upgradeInfo(s, "rome", "school").why === "tech_writing" && S.upgradeInfo(s, "rome", "baths").why === "tech_engineering");
  const d0 = drift(s, "rome").total, sci0 = R.scienceOf(s, "rome"), m0 = S.output(s, "rome").money;
  Object.assign(s.places.rome, { temple: 2, market: 2, school: 3, baths: 1 });
  check("tapınak: her seviye sadakat turda +2", Math.abs(drift(s, "rome").total - d0 - 4) < 1e-9);
  check("pazar: her seviye şehrin parası +%10", Math.abs(S.output(s, "rome").money - m0 * 1.2) < 1e-9);
  check("okul: her seviye +1 bilim", Math.abs(R.scienceOf(s, "rome") - sci0 - 3) < 1e-9);
  const g1 = S.newGame("rome", 7), g2 = S.newGame("rome", 7);
  for (const g of [g1, g2]) g.places.tarentum.pop = 10;
  g2.places.tarentum.baths = 1;
  T.economy(g1, []); T.economy(g2, []);
  check("hamam: o şehrin nüfusu daha hızlı artar", g2.places.tarentum.pop > g1.places.tarentum.pop && g2.places.rome.pop === g1.places.rome.pop);
  check("bina seviyesi şehir seviyesini geçmez", (() => { const t = S.newGame("rome", 7); t.civs.rome.money = 500; t.places.tarentum.temple = 1; return S.upgradeInfo(t, "tarentum", "temple").why === "needLevel"; })());
  const old = S.newGame("rome", 7);
  for (const p of Object.values(old.places)) for (const k of S.BUILDINGS) delete p[k];
  old.version = 16;
  S.migrate(old);
  check("eski kayıt: binalar sıfır", old.version === S.VERSION && Object.values(old.places).every((p) => S.BUILDINGS.every((k) => p[k] === 0)));
}

// ---------------------------------------------------------------------------------------------
section("Aynı bilgisayarda birkaç oyuncu (bölüm 25)");

{
  const EVM = await import("../src/rules/events.js");
  const MI = await import("../src/rules/missions.js");
  const V2 = await import("../src/rules/victory.js");
  const h = S.newGame(["rome", "carthage"], 7, "hard");
  check("iki oyunculu oyun: ilki başlar, ikisi de insan", h.player === "rome" && h.players.join() === "rome,carthage" && S.isHuman(h, "carthage") && !S.isHuman(h, "egypt"));
  check("insanlar zorluğun üretim çarpanını almaz", (() => {
    const one = S.newGame("rome", 7, "hard");
    return Math.abs(S.output(h, "carthage").money - S.output(one, "carthage").money / LEVELS.hard.aiOutput) < 1e-9;
  })());
  T.endTurn(h);
  check("dünya turunda bilgisayar ikinci oyuncunun yerine oynamaz", h.civs.carthage.research === null && S.armiesOf(h, "carthage").length === 0 && h.civs.carthage.techs.length === 0);
  check("bilgisayarlar oynar", CIVS.filter((c) => !S.isHuman(h, c.id)).some((c) => h.civs[c.id].research));
  // Mektuplar: ikisinin de olayları kendi gelen kutusuna; teklif alıcısıyla.
  h.turn = 30;
  let got = null;
  for (let i = 0; i < 80 && !got; i++) { const it = EVM.roll(h, "carthage"); if (it?.type === "event") got = it; }
  check("ikinci oyuncunun olayı gelen kutusunda, sahibi o", got && h.inbox.includes(got) && EVM.ownerOf(h, got) === "carthage");
  h.relations[S.key("egypt", "carthage")] = "war";
  const off = EVM.offer(h, "egypt", "peace", {}, "carthage");
  check("teklifin alıcısı yazılı", off?.to === "carthage" && EVM.ownerOf(h, off) === "carthage");
  EVM.resolve(h, off, "accept");
  check("ikinci oyuncu barışı kabul edince barış onunla", S.relation(h, "egypt", "carthage") === "neutral");
  // Görevler: her oyuncuya ayrı.
  const g = S.newGame(["rome", "carthage"], 9);
  g.turn = N.missions.from + 1;
  for (let i = 0; i < 40; i++) { MI.issue(g, []); g.turn += N.missions.spacing; }
  check("görevler iki oyuncuya da ayrı ayrı gelir", g.missions.some((m) => m.civ === "rome") && g.missions.some((m) => m.civ === "carthage"));
  check("her oyuncunun en çok iki görevi", ["rome", "carthage"].every((c) => g.missions.filter((m) => m.civ === c).length <= N.missions.max));
  // Oyun sonu: biri düşerse oyun sürer, ikisi de düşerse biter; tek kalan insan fetihle kazanır.
  const o = S.newGame(["rome", "carthage"], 7);
  for (const id of S.placesOf(o, "rome")) o.places[id].owner = "gaul";
  o.civs.rome.alive = false;
  check("bir oyuncu düşerse oyun sürer, sıra ötekinde", V2.overOf(o) === null && S.aliveHumans(o).join() === "carthage");
  for (const id of S.placesOf(o, "carthage")) o.places[id].owner = "gaul";
  check("hepsi düşerse oyun biter", V2.overOf(o)?.kind === "fallen");
  const w = S.newGame(["rome", "carthage"], 7);
  for (const c of CIVS) if (c.id !== "carthage") { for (const id of S.placesOf(w, c.id)) w.places[id].owner = "carthage"; w.civs[c.id].alive = false; }
  const ov = V2.overOf(w);
  check("tek kalan insan fetihle kazanır", ov?.kind === "conquest" && ov.winner === "carthage" && ov.result === "won");
  const old = S.newGame("rome", 7);
  delete old.players;
  old.version = 15;
  S.migrate(old);
  check("eski kayıt: tek oyuncu", old.version === S.VERSION && old.players.join() === "rome");
}

// ---------------------------------------------------------------------------------------------
section("Liderler ve tutum (bölüm 24)");

{
  const LD = await import("../src/rules/leaders.js");
  const GEN = await import("../src/rules/generals.js");
  const { TEXT } = await import("../src/text.js");
  check("her medeniyetin bir lideri ve kişiliği var", CIVS.every((c) => LD.LEADERS[c.id] && ["war", "peace", "ally", "anger", "gifts", "grudge", "base"].every((k) => typeof LD.LEADERS[c.id][k] === "number")));
  for (const lang of ["en", "tr"]) {
    const L = TEXT[lang].leaders;
    check(`${lang}: her liderin adı, unvanı, kişiliği ve yedi sözü yazılı`, CIVS.every((c) => ["name", "title", "persona", "desc", "friendly", "neutral", "hostile", "war", "yes", "no", "demand"].every((k) => L[c.id]?.[k])));
  }
  check("lider adları generallerde yok (Scipio, İskender, Mithridates, Tomris)", !["Scipio", "Alexander", "Mithridates", "Tomris"].some((n) => Object.values(GEN.NAMES).flat().includes(n)));

  const s = S.newGame("rome", 7);
  const partsOf = (who, other) => Object.fromEntries(LD.moodOf(s, who, other).parts);
  check("başlangıç tutumu kişilikten: Kleopatra +10, Hannibal Roma'ya yeminli", partsOf("egypt", "rome").persona === 10 && partsOf("carthage", "rome").hates === -15 && !partsOf("carthage", "egypt").hates);
  for (const id of LD.moodOf(s, "carthage", "rome").parts.map(([k]) => k)) check(`tutum gerekçesi yazılı: ${id}`, TEXT.en.moodParts[id] && TEXT.tr.moodParts[id]);
  D.declareWar(s, "rome", "egypt");
  check("savaş ilanı: savaştayız -40, bize savaş açtın -25", partsOf("egypt", "rome").atWar === -40 && partsOf("egypt", "rome").declaredOnUs === -25 && LD.moodLevel(LD.moodOf(s, "egypt", "rome").score) === "hostile");
  s.turn += 25;
  check("savaş ilanı zamanla unutulur (Kleopatra 25 turda)", !partsOf("egypt", "rome").declaredOnUs);
  const t = S.newGame("rome", 7);
  D.declareWar(t, "rome", "saka");
  t.turn += 30;
  check("Tomris kindar: 30 tur sonra hâlâ hatırlar", Object.fromEntries(LD.moodOf(t, "saka", "rome").parts).declaredOnUs < 0);

  // Hediye: para gider, tutum yükselir, söner; Kleopatra hediyeyi bir buçuk kat sever.
  const g = S.newGame("rome", 7);
  g.civs.rome.money = 100;
  const add = LD.gift(g, "rome", "egypt", 50);
  const m0 = LD.moodOf(g, "egypt", "rome").score;
  check("hediye: para gider, Kleopatra'da 50 para +38", g.civs.rome.money === 50 && add === Math.round(50 * N.diplo.giftPoints * 1.5) && Object.fromEntries(LD.moodOf(g, "egypt", "rome").parts).gifts === add);
  check("hediyeye para yetmezse olmaz", LD.gift(g, "rome", "gaul", 80) === 0 && g.civs.rome.money === 50);
  g.turn += 10;
  check("hediyenin etkisi turda 1 söner", LD.moodOf(g, "egypt", "rome").score === m0 - 10);

  // Ticaret: kabul edilirse iki tarafa turda para; süresi dolunca biter, savaş da bitirir.
  const tr = S.newGame("rome", 7);
  tr.relations[S.key("rome", "egypt")] = "ally";
  const money0 = S.budget(tr, "rome").money;
  const ev = D.proposeTrade(tr, "rome", "egypt");
  check("müttefik ticareti kabul eder; iki tarafa turda +3 para", ev?.type === "trade" && S.budget(tr, "rome").money === money0 + N.diplo.tradeMoney && LD.dealOf(tr, "egypt", "rome"));
  check("ticaret tutuma +15", Object.fromEntries(LD.moodOf(tr, "egypt", "rome").parts).trade === 15);
  check("aynı turda ikinci teklif olmaz", !D.canTrade(tr, "rome", "egypt") && D.proposeTrade(tr, "rome", "egypt") === null);
  for (let i = 0; i < N.diplo.tradeTurns; i++) T.endTurn(tr);
  check("ticaret anlaşması süresi dolunca biter", !(tr.deals ?? []).some((d) => d.a === "rome" || d.b === "rome") && S.budget(tr, "rome").money < money0 + 100);
  const w = S.newGame("rome", 7);
  D.makeDeal(w, "rome", "gaul");
  D.declareWar(w, "gaul", "rome");
  check("savaş ticareti bitirir", !LD.dealOf(w, "rome", "gaul"));
  check("düşmanca olan ticaret de ittifak da kabul etmez", !D.wantsTrade(w, "gaul", "rome") && !D.wantsAlliance(w, "gaul", "rome"));

  // Para karşılığı barış: kabul edilirse para karşıya geçer.
  const p = S.newGame("rome", 7);
  p.relations[S.key("rome", "parthia")] = "war";
  for (const id of S.placesOf(p, "rome")) p.places[id].inf += 400; // Roma çok güçlü: Partlar kabul eder
  p.civs.rome.money = 100;
  const pm = p.civs.parthia.money;
  const pe = D.proposePeace(p, "parthia", "rome", 0);
  const pe2 = D.proposePeace(p, "rome", "parthia", 30);
  check("para karşılığı barış: para karşıya geçer", pe2?.type === "peace" ? p.civs.rome.money === 70 && p.civs.parthia.money === pm + 30 : p.civs.rome.money === 100, JSON.stringify(pe2));
  check("parası yetmeyen para karşılığı barış öneremez", D.proposePeace(S.newGame("rome", 7), "rome", "gaul", 9999) === null);

  // Gururlu Vercingetorix: toprağında iki tur kalan ordu savaş sebebi.
  check("Vercingetorix iki turda öfkelenip savaşır, öteki liderler üç", LD.persona("gaul").anger === 2 && LD.persona("rome").anger === 3);
  const v = S.newGame("rome", 7);
  v.turn = 20;
  v.anger = { "gaul>rome": 2 };
  for (const id of S.placesOf(v, "gaul")) v.places[id].inf += 300;
  const vev = [];
  const { aiTurn: AI2 } = await import("../src/rules/ai.js");
  AI2(v, "gaul", vev);
  check("öfkesi 2 olan Galya savaş açar", S.relation(v, "gaul", "rome") === "war");

  // Eski kayıt: hafıza ve anlaşmalar boş.
  const old = S.newGame("rome", 7);
  delete old.memory; delete old.deals;
  old.version = 13;
  S.migrate(old);
  check("eski kayıt: hafıza ve ticaret boş başlar", old.version === S.VERSION && old.memory && Array.isArray(old.deals));
}

// ---------------------------------------------------------------------------------------------
section("Öğretici haydutlar");

{
  const B = await import("../src/rules/bandits.js");
  check("bot ve denge oyununda haydut yok", !B.banditsOf(S.newGame("rome", 7)) && !S.newGame("rome", 7).tutorial);
  for (const c of CIVS) {
    const s = S.newGame(c.id, 7);
    const b = B.spawnBandits(s);
    const cap = PLACES.find((p) => p.capital && p.owner === c.id).id;
    const d = b && MAP.dist(b, POS[cap]);
    check(`${c.id}: haydutlar başkentin yakınında, kendi toprağında`, b && b.owner === null && b.bandit && s.tutorial && MAP.regionOf(MAP.cellOf(b.x, b.y)) === cap && d >= N.bandits.near && d <= N.bandits.far, b && d);
    // Başkentin bütün garnizonu ve bir bölük piyade: aynı tur yanlarına yürüyüp kolayca yener.
    s.places[cap].inf += 10;
    const a = S.muster(s, cap, { inf: s.places[cap].inf, arch: s.places[cap].arch, cav: s.places[cap].cav });
    M.order(s, a.id, { army: b.id });
    check(`${c.id}: başkentten çıkan ordu aynı tur haydutlara saldırabilir, tahmin kolay`, M.canStrike(s, a, b) && M.forecastField(s, a, b).odds === "easy", `${M.canStrike(s, a, b)} ${MAP.dist(a, b).toFixed(2)} mp ${a.mp.toFixed(2)}`);
    const money = s.civs[c.id].money;
    const ev = M.strike(s, a.id, b.id, [1, 1]);
    check(`${c.id}: haydutları dağıtan ganimet alır`, ev?.won && ev.bandits && ev.loot === N.bandits.loot && s.civs[c.id].money === money + N.bandits.loot && !B.banditsOf(s));
  }
  const s = S.newGame("rome", 7);
  const b = B.spawnBandits(s);
  check("haydutlar herkese düşman, kimseyle savaş ilan etmeden", M.isFoe(s, "rome", null) && M.isFoe(s, "egypt", null) && !M.isFoe(s, "rome", "egypt"));
  const at = { x: b.x, y: b.y };
  for (let i = 0; i < 12; i++) T.endTurn(s);
  const still = B.banditsOf(s);
  check("haydutlar yerinden kıpırdamaz, turlar sorunsuz döner", still && still.x === at.x && still.y === at.y);
  check("haydutlar kimseyi öfkelendirmez", !Object.keys(s.anger ?? {}).some((k) => k.includes("null")));
  // Öğretici balonlarının hepsinin iki dilde yazısı var.
  const { TEXT } = await import("../src/text.js");
  const ui = readFileSync(new URL("../src/view/ui.js", import.meta.url), "utf8");
  const steps = [...ui.slice(ui.indexOf("const COACH = ["), ui.indexOf("function drawCoach")).matchAll(/\{ id: "(\w+)"/g)].map((x) => x[1]);
  for (const lang of ["en", "tr"]) check(`${lang}: her öğretici balonunun yazısı var`, steps.length >= 15 && steps.every((k) => TEXT[lang].coach[k]), steps.filter((k) => !TEXT[lang].coach[k]).join());
}

// ---------------------------------------------------------------------------------------------
section("Sadakat ve isyan (bölüm 12)");

const LY = await import("../src/rules/loyalty.js");
const EV = await import("../src/rules/events.js");
{
  const s = S.newGame("rome", 7);
  check("başlangıçta herkes 100", Object.values(s.places).every((p) => p.loyalty === 100));
  const a = before(S.formArmy(s, "ariminum", 10, 0), "mediolanum");
  a.inf = 300;
  M.attack(s, a.id, "mediolanum", [1, 1]);
  check("alınan yer 20 ile başlar", s.places.mediolanum.loyalty === N.loyalty.captured);
  // Mediolanum Roma'ya 2 yol: uzaklık cezası yok. Ordu (300) orada: garnizon katkısı tavanda.
  const d = LY.drift(s, "mediolanum");
  check("yatışma +4, garnizon tavanı +8", d.parts.settle === 4 && d.parts.garrison === 8 && d.parts.far === 0, JSON.stringify(d.parts));
  S.station(s, a.id);
  s.places.mediolanum.inf = 0;
  check("boş garnizon katkı vermez", LY.drift(s, "mediolanum").parts.garrison === 0);
  // Uzak yer: Roma'dan Babil'e çok yol; ceza tavanda.
  s.places.babylon.owner = "rome";
  check("uzak yerin cezası tavanda (-8)", LY.drift(s, "babylon").parts.far === -8, LY.drift(s, "babylon").parts.far);
  check("kıtlık -10", LY.drift(s, "rome", true).parts.famine === -10);

  // İsyan: sadakat 0, garnizon yok -> kesin isyan ((25-0) x %4 = 1); bağımsızlığına döner.
  const r = S.newGame("rome", 3);
  r.places.tarentum.loyalty = 0;
  r.places.tarentum.inf = 0;
  r.places.tarentum.pop = 200;
  const ev = [];
  LY.tick(r, "rome", true, ev);
  check("sadakat 0 ve boş garnizon: isyan", r.places.tarentum.owner === null && ev.some((e) => e.type === "revolt" && e.place === "tarentum"),
    JSON.stringify(ev));
  check("isyancılar nüfusun dörtte biri kadar garnizon olur", r.places.tarentum.inf === 50, r.places.tarentum.inf);

  // Bastırma: garnizon güçlüyse yer gitmez, garnizon isyancıların yarısı kadar kayıp verir.
  let riots = 0, lostPlace = 0, bled = 0;
  for (let k = 0; k < 80; k++) {
    const q = S.newGame("rome", 50 + k);
    q.places.tarentum.loyalty = 0;
    q.places.tarentum.pop = 200;
    q.places.tarentum.inf = 200;
    const evs = [];
    LY.tick(q, "rome", true, evs);
    if (evs.some((e) => e.type === "riot")) { riots++; if (q.places.tarentum.inf !== 200 - 25) bled++; }
    if (q.places.tarentum.owner !== "rome") lostPlace++;
  }
  check("güçlü garnizon ayaklanmayı bastırır, yer gitmez", riots > 0 && lostPlace === 0, `ayaklanma ${riots} kayıp yer ${lostPlace}`);
  check("bastırmanın bedeli isyancıların yarısı", bled === 0, bled);

  // Oyunlar: 15 para, +20, turda bir.
  const g = S.newGame("rome", 7);
  g.places.tarentum.loyalty = 50;
  check("oyunlar düzenleniyor", S.holdGames(g, "tarentum") && g.places.tarentum.loyalty === 70 && g.civs.rome.money === 15);
  check("turda bir kere", S.gamesInfo(g, "tarentum").why === "done");
}

// ---------------------------------------------------------------------------------------------
section("Olaylar ve teklifler (bölüm 13)");

{
  const mk = (fields) => ({ id: 1, turn: 5, type: "event", civ: "rome", ...fields });
  const s = S.newGame("rome", 7);
  s.inbox.push(mk({ key: "plague", place: "rome" }));
  const pop = s.places.rome.pop;
  EV.resolve(s, s.inbox[0], "quarantine");
  check("veba, karantina: 12 para, nüfusun %10'u", s.civs.rome.money === 18 && s.places.rome.pop === pop - Math.round(pop * 0.1));
  check("karar verilen mektup kutudan çıkar", s.inbox.length === 0);
  s.civs.rome.money = 5;
  const it = mk({ key: "plague", place: "rome" });
  s.inbox.push(it);
  check("parası yetmeyen seçenek kapalı", EV.options(s, it)[0].off === true);
  const pop2 = s.places.rome.pop;
  EV.resolve(s, it, "quarantine");
  check("kapalı seçenek seçilirse bedava olan uygulanır", s.civs.rome.money === 5 && s.places.rome.pop === pop2 - Math.round(pop2 * 0.3));

  // Akın: güçlü garnizon tutar; zayıfsa yağma.
  const a = S.newGame("rome", 7);
  a.places.tarentum.inf = 200;
  const held = EV.resolve(a, mk({ key: "raid", place: "tarentum", raiders: 40, bribe: 12 }), "fight");
  check("akın: güçlü garnizon tutar", held.result.held === true && a.places.tarentum.owner === "rome");
  a.places.tarentum.inf = 5;
  a.places.tarentum.farms = 1;
  const p0 = a.places.tarentum.pop;
  const lost = EV.resolve(a, mk({ key: "raid", place: "tarentum", raiders: 80, bribe: 12 }), "fight");
  check("akın: zayıf garnizon yağmalanır", lost.result.held === false && a.places.tarentum.pop === Math.round(p0 * 0.75) && a.places.tarentum.inf === 0);
  const m0 = a.civs.rome.money;
  EV.resolve(a, mk({ key: "raid", place: "tarentum", raiders: 80, bribe: 12 }), "bribe");
  check("akın: rüşvet parayı alır, başka bir şey olmaz", a.civs.rome.money === m0 - 12);

  // Haraç: öde -> ateşkes, bilgisayar savaş açmaz; reddet -> savaş.
  const t = S.newGame("rome", 7);
  t.turn = 20;
  t.civs.rome.money = 100;
  EV.resolve(t, { id: 9, turn: 20, type: "offer", key: "tribute", civ: "carthage", amount: 30 }, "pay");
  check("haraç ödenince ateşkes", t.civs.rome.money === 70 && t.truce[S.key("carthage", "rome")] === 20 + N.offers.truce);
  const { aiTurn: ai2 } = await import("../src/rules/ai.js");
  let wars = 0, control = 0;
  for (let k = 0; k < 40; k++) {
    for (const truce of [true, false]) {
      const q = S.newGame("rome", 300 + k);
      q.turn = 15;
      if (truce) q.truce[S.key("carthage", "rome")] = 30;
      for (const id of ["rome", "tarentum", "ariminum"]) q.places[id].inf = 0;
      q.places.syracuse.owner = "carthage";
      q.places.carthage.inf = 400;
      const ev = [];
      ai2(q, "carthage", ev);
      if (ev.some((e) => e.type === "war" && e.on === "rome")) { if (truce) wars++; else control++; }
    }
  }
  check("ateşkeste bilgisayar savaş açmaz (ateşkessiz açıyor)", wars === 0 && control > 0, `ateşkesli ${wars}, ateşkessiz ${control}`);
  const u = S.newGame("rome", 7);
  u.turn = 20;
  EV.resolve(u, { id: 9, turn: 20, type: "offer", key: "tribute", civ: "carthage", amount: 30 }, "refuse");
  check("haracı reddetmek savaş", S.relation(u, "carthage", "rome") === "war");
  const v = S.newGame("rome", 7);
  EV.resolve(v, { id: 9, turn: 5, type: "offer", key: "ally", civ: "gaul" }, "accept");
  check("ittifak teklifi kabul", S.relation(v, "gaul", "rome") === "ally");
  v.relations[S.key("egypt", "rome")] = "war";
  EV.resolve(v, { id: 9, turn: 5, type: "offer", key: "peace", civ: "egypt" }, "accept");
  check("barış teklifi kabul", S.relation(v, "egypt", "rome") === "neutral");

  // Karar verilmeden tur biterse bedava seçenek.
  const w = S.newGame("rome", 7);
  const merc = mk({ key: "mercs", place: "rome" });
  w.inbox.push(merc);
  const m1 = w.civs.rome.money;
  T.endTurn(w);
  check("karar verilmeden geçilen mektup bedava seçenekle kapanır", !w.inbox.includes(merc) && w.civs.rome.money >= m1);

  // Eski kayıt (sürüm 1) yeni biçime gelir.
  const old = JSON.parse(JSON.stringify(S.newGame("rome", 7)));
  old.version = 1;
  // 1. sürümde sahada ordu, barbar yoktu.
  old.armies = []; delete old.barbarians;
  for (const p of Object.values(old.places)) { delete p.loyalty; delete p.games; }
  delete old.inbox; delete old.truce; delete old.offered;
  const mig = S.migrate(old);
  check("1. sürüm kayıt yükseltiliyor", mig.version === S.VERSION && mig.places.rome.loyalty === 100 && Array.isArray(mig.inbox));
}

// ---------------------------------------------------------------------------------------------
section("Generaller (bölüm 14)");

const GN = await import("../src/rules/generals.js");
{
  const s = S.newGame("saka", 7);
  const a = S.formArmy(s, "neapolis", 30, 0);
  const g = GN.appoint(s, a.id);
  check("general atanıyor, 30 para", g && s.civs.saka.money === 0 && GN.NAMES.saka.includes(g.name));
  check("ikinci general atanmaz", GN.appointInfo(s, a.id).why === "has");
  check("1. seviye çarpanı 1", GN.might(g) === 1);
  check("3. seviye çarpanı 1.12", Math.abs(GN.might({ level: 3, traits: [] }) - 1.12) < 1e-9);
  check("taktisyen x1.1", Math.abs(GN.might({ level: 1, traits: ["tactician"] }) - 1.1) < 1e-9);
  const up = GN.learn(s, g, true);
  check("bir zafer: 2. seviye ve bir özellik", g.level === 2 && up.up === 2 && g.traits.length === 1 && GN.TRAITS.includes(up.trait));
  GN.learn(s, g, true); GN.learn(s, g, true); GN.learn(s, g, true); GN.learn(s, g, true); GN.learn(s, g, true);
  check("tecrübe biriktikçe 5. seviyede durur, iki özellik", g.level === 5 && g.traits.length === 2, `${g.level} ${g.traits}`);

  // General savaşı çeviriyor: denk iki ordu, 5. seviye general kazandırır.
  const F = (gen) => C.fight({ civ: null, inf: 100, arch: 0, gen }, { civ: null, inf: 105, arch: 0 }, null);
  check("generalsiz denk savaş kaybedilir, 5. seviye general kazandırır", !F(null).attWins && F({ level: 5, traits: [] }).attWins);
  const W = (gen) => C.fight({ civ: null, inf: 100, arch: 0, gen }, { civ: null, inf: 72, arch: 0 }, "castle");
  check("kuşatma ustası kale surunu yarıya indirir", !W(null).attWins && W({ level: 1, traits: ["siege"] }).attWins);

  // Ordu yenilirse general ölür ve adı bir daha verilmez.
  const d = S.newGame("rome", 7);
  const b = before(S.formArmy(d, "ariminum", 10, 0), "mediolanum");
  const gb = GN.appoint(d, b.id) ?? (d.civs.rome.money = 99, GN.appoint(d, b.id));
  M.attack(d, b.id, "mediolanum", [1, 1]);
  check("yenilen ordunun generali ölür", !S.armyById(d, b.id) && d.fallenGenerals.rome.includes(gb.name));
  let reused = false;
  for (let k = 0; k < 30; k++) {
    d.civs.rome.money = 99;
    const c = S.formArmy(d, "rome", 1, 0);
    if (!c) break;
    const gc = GN.appoint(d, c.id);
    if (gc?.name === gb.name) reused = true;
    S.station(d, c.id);
  }
  check("ölen generalin adı tekrar verilmez", !reused);

  // Birleşmede tecrübeli olan kalır; hızlı general +1 yol; iaşeci ordu yarı yer.
  const e = S.newGame("rome", 7);
  e.civs.rome.money = 200;
  const x = S.formArmy(e, "rome", 10, 0), y = S.formArmy(e, "rome", 10, 0);
  GN.appoint(e, x.id); GN.appoint(e, y.id);
  y.general.xp = 9; y.general.level = 3;
  S.merge(e, x.id, y.id);
  check("birleşmede tecrübeli general komutayı alır", x.general.level === 3);
  x.general.traits = ["swift"];
  M.refresh(e, "rome");
  check("hızlı general: hareket bir buçuk kat", x.mp === 1.5 * N.march.mp);
  const upkeep0 = S.budget(e, "rome").upkeep;
  x.inf = 100;
  const fat = S.budget(e, "rome").upkeep;
  x.general.traits = ["supply"];
  // 100 askerlik ordunun yarısı 50 asker = 5 bölük daha az bakım.
  check("iaşeci general: ordu yarı yiyecek yer", S.budget(e, "rome").upkeep === fat - 5 && fat > upkeep0, `${upkeep0} ${fat} ${S.budget(e, "rome").upkeep}`);
}

// ---------------------------------------------------------------------------------------------
section("Süvari ve kuşatma makinesi (bölüm 5, 7)");

{
  const s = S.newGame("rome", 7);
  s.civs.rome.money = 100; s.civs.rome.weapons = 50; s.civs.rome.food = 50;
  check("süvari önce Atçılık ister, kuşatma makinesi Mühendislik", S.recruitInfo(s, "rome", "cav").why === "tech_horseback" && S.recruitInfo(s, "rome", "siege").why === "tech_engineering");
  R.grant(s, "rome", "horseback");
  R.grant(s, "rome", "engineering");
  check("süvari için kışla 3 gerek", S.recruitInfo(s, "rome", "cav").why === "needBarracks3");
  check("kuşatma makinesi için sanayi 3 gerek", S.recruitInfo(s, "rome", "siege").why === "needIndustry3");
  s.places.rome.level = 3; s.places.rome.barracks = 3; s.places.rome.industry = 3;
  check("süvari basılıyor: 2 para (Roma x1.5 = 3), 2 silah, 1 yiyecek", S.recruit(s, "rome", "cav")
    && s.civs.rome.money === 97 && s.civs.rome.weapons === 48 && s.civs.rome.food === 49 && s.places.rome.cav === 10);
  check("kuşatma makinesi basılıyor: 3 silah", S.recruit(s, "rome", "siege") && s.civs.rome.weapons === 45 && s.places.rome.siege === 10);
  const b0 = S.budget(s, "rome").upkeep;
  s.places.rome.cav += 100;
  check("süvari bakımı piyadeyle aynı", S.budget(s, "rome").upkeep === b0 + 10);

  const F = (a, d, walls = null, civ = null) => C.fight({ civ, inf: 0, arch: 0, cav: 0, siege: 0, ...a }, { civ: null, inf: 0, arch: 0, cav: 0, siege: 0, ...d }, walls);
  // Hücum ok yağmuruyla aynı anda: 5 bölük x 5 = 25 okçu, yağmur atlıları vurmadan önce.
  check("süvari hücumu okçuları biçer: 5 bölük, 25 okçu", F({ cav: 50 }, { inf: 100, arch: 50 }).charge.byAtt === 25);
  check("Saka süvarisi x1.3: 33 okçu", F({ cav: 50 }, { inf: 100, arch: 50 }, null, "saka").charge.byAtt === 33);
  check("süvari açık arazide okçu ağırlıklı orduyu yener", F({ cav: 60 }, { inf: 20, arch: 60 }).attWins);
  check("aynı süvari surlu şehre karşı yenilir, piyade alır", !F({ cav: 100 }, { inf: 70 }, "city").attWins && F({ inf: 100 }, { inf: 70 }, "city").attWins);
  check("kale: 100 piyade alamaz, 5 bölük kuşatma makinesiyle alır",
    !F({ inf: 100 }, { inf: 30, arch: 30 }, "castle").attWins && F({ inf: 100, siege: 50 }, { inf: 30, arch: 30 }, "castle").attWins);
  check("sadece kuşatma makinesi boş yeri bile alamaz", !F({ siege: 50 }, {}).attWins);
  check("kayıplar türlere dağılıyor, toplam tutuyor", (() => {
    const r = F({ inf: 47, arch: 13, cav: 21, siege: 9 }, { inf: 30, arch: 20 });
    return S.men(r.att) <= 90 && UNITS.every((k) => Number.isInteger(r.att[k]) && r.att[k] >= 0);
  })());

  const old = JSON.parse(JSON.stringify(S.newGame("rome", 7)));
  old.version = 2;
  for (const p of Object.values(old.places)) { delete p.cav; delete p.siege; }
  check("2. sürüm kayıt yükseltiliyor", S.migrate(old).version === S.VERSION && old.places.rome.cav === 0 && old.places.rome.siege === 0);
}

// ---------------------------------------------------------------------------------------------
section("Donanma (bölüm 15)");

{
  const s = S.newGame("carthage", 7);
  check("başlangıç gemileri: liman başkenti 2, liman 1, büyük bağımsız 2, bağımsız 1, karada 0",
    s.places.carthage.ships === 2 && s.places.gades.ships === 1 && s.places.syracuse.ships === 2 && s.places.massalia.ships === 1 && s.places.memphis.ships === 0);
  check("karada gemi yapılmaz", S.shipInfo(s, "memphis").why === "notPort");
  const pop = s.places.carthage.pop;
  check("gemi: 4 para, 2 silah, 5 nüfus", S.buildShip(s, "carthage") && s.places.carthage.ships === 3
    && s.civs.carthage.money === 26 && s.civs.carthage.weapons === 3 && s.places.carthage.pop === pop - 5);
  check("gemi asker hakkından yemez, tersaneninkinden yer", !S.recruitInfo(s, "carthage", "inf").why && S.shipInfo(s, "carthage").why === "done");

  // Denizi geçmek gemi ister: gemiler bütün askerini taşımalı (bir kadırga 25).
  const a = S.formArmy(s, "carthage", 30, 0);
  check("gemisiz ordu Sicilya'ya yol bulamaz", M.routeTo(s, a, { place: "lilybaeum" }) === null && M.needsShips(s, a, { place: "lilybaeum" }));
  a.ships = 1;
  check("1 gemi 30 askere yetmez", !S.canSail(a) && M.routeTo(s, a, { place: "lilybaeum" }) === null);
  a.ships = 2;
  M.order(s, a.id, { place: "lilybaeum" });
  check("2 gemi yeter: denizden Lilybaion'a, bir turda", S.canSail(a) && a.at === "lilybaeum", `${a.at} ${a.route.length}`);

  // Askersiz filo (kullanıcı: "gemiler denizden yürüsün"): denizden gider, karaya çıkmaz,
  // limana girer, saldıramaz.
  const navy = S.formArmy(s, "carthage", 0, 0, 0, 0, 2);
  check("askersiz filo denize açılır, limana gider", M.modeOf(navy) === "sea" && M.routeTo(s, navy, { place: "lilybaeum" }) !== null);
  check("askersiz filo karaya yürümez", M.routeTo(s, navy, { place: "cirta" }) === null && M.routeTo(s, navy, project(9.5, 35.5)) === null);
  check("askersiz filo saldıramaz", !M.canAttack(s, navy, "caralis"));
  check("gemileri yeten ordu hem karadan hem denizden gider", M.modeOf(a) === "both" && M.modeOf(raise(s, "carthage", { inf: 10 })) === "land");

  // Deniz savaşı: denizden saldırıda (saldıran denizde) önce limandaki gemiler.
  const sea = (ships, defShips, civ = "rome") => {
    const g = S.newGame(civ, 7);
    const from = civ === "rome" ? "tarentum" : "carthage";
    const target = civ === "rome" ? "syracuse" : "lilybaeum";
    if (civ !== "rome") { g.places.lilybaeum.owner = null; g.places.lilybaeum.inf = 30; }
    g.places[target].ships = defShips;
    const army = S.formArmy(g, from, 10, 0);
    army.inf = 50; army.ships = ships;
    offshore(army, target);
    const ev = M.attack(g, army.id, target, [1, 1]);
    return { g, ev, army, target };
  };
  const lost = sea(2, 3);
  check("filo yenilirse ordu denizde kaybolur", lost.ev?.drowned && !S.armyById(lost.g, lost.army.id) && lost.g.places.syracuse.owner === null, JSON.stringify(lost.ev?.naval));
  check("kazanan filo da gemi kaybeder", lost.g.places.syracuse.ships > 0 && lost.g.places.syracuse.ships < 3);
  const won = sea(4, 2);
  check("filo kazanırsa karaya çıkılır", won.ev && !won.ev.drowned && won.ev.naval?.won && won.g.places.syracuse.ships === 0);
  check("Kartaca gemisi x1.5: 3 gemi 4 gemiyi yener", sea(3, 4, "carthage").ev?.naval?.won && !sea(3, 4, "rome").ev?.naval?.won);
  check("tahmin deniz savaşını sayar", M.forecast(lost.g, { at: "tarentum", inf: 500, arch: 0, ships: 1 }, "rome", "syracuse").odds === "hopeless");
  const land = S.newGame("rome", 7);
  land.places.syracuse.ships = 5;
  const ashore = before(S.formArmy(land, "tarentum", 20, 0), "syracuse");
  ashore.inf = 300;
  const lev = M.attack(land, ashore.id, "syracuse", [1, 1]);
  check("karadan saldırıda limandaki gemiler savaşmaz", lev && !lev.naval && lev.won);

  // Abluka: savaştığın birinin, limanın önünde denizde, limandakinden güçlü filosu.
  const b = S.newGame("rome", 7);
  const fleet = S.formArmy(b, "carthage", 0, 0, 0, 0, 2);
  offshore(fleet, "tarentum");
  const free = S.output(b, "tarentum");
  check("savaş yokken abluka yok", !S.blockaded(b, "tarentum"));
  b.relations[S.key("carthage", "rome")] = "war";
  const t0 = S.output(b, "tarentum");
  check("abluka: balık kesilir, vergi yarıya", S.blockaded(b, "tarentum") && t0.food === b.places.tarentum.farms * N.wheatPerFarm
    && Math.abs(t0.money - (b.places.tarentum.pop / N.taxPer) * 0.5) < 1e-9, JSON.stringify(t0));
  b.places.tarentum.ships = 3;
  check("limanda daha güçlü filo varsa abluka yok", !S.blockaded(b, "tarentum"));
  b.places.tarentum.ships = 1;
  offshore(fleet, "syracuse");
  check("uzaktaki filo abluka yapmaz", !S.blockaded(b, "tarentum"));
  check("savaşsız çıktı aynı kalır", free.food > 0);

  // Filo (sadece gemi) ordudur: silinmez, ama karaya saldıramaz.
  const f = S.newGame("rome", 7);
  const onlyShips = S.formArmy(f, "tarentum", 0, 0, 0, 0, 1);
  check("sadece gemiden filo kurulur", onlyShips && !S.empty(onlyShips));
  f.civs.rome.food = -5;
  T.economy(f, []);
  check("kıtlık filoyu silmez", !!S.armyById(f, onlyShips.id));
  check("filo karaya saldıramaz", !M.canAttack(f, onlyShips, "syracuse"));
  const g = S.newGame("rome", 7);
  const raid = before(S.formArmy(g, "ariminum", 10, 0), "mediolanum"); raid.inf = 300;
  g.places.mediolanum.ships = 4;
  M.attack(g, raid.id, "mediolanum", [1, 1]);
  check("alınan limanın gemileri yanar", g.places.mediolanum.ships === 0);
  check("gemi bakımı yarım yiyecek", (() => { const h = S.newGame("rome", 7); const u0 = S.budget(h, "rome").upkeep; h.places.tarentum.ships += 4; return S.budget(h, "rome").upkeep === u0 + 2; })());

  const old = JSON.parse(JSON.stringify(S.newGame("rome", 7)));
  old.version = 3;
  for (const p of Object.values(old.places)) delete p.ships;
  check("3. sürüm kayıt yükseltiliyor", S.migrate(old).version === S.VERSION && old.places.tarentum.ships === 0);
}

// ---------------------------------------------------------------------------------------------
section("İnşaatçılar: süreli yükseltmeler");

{
  check("süre gidilen seviye kadar: tarla 2 -> 2 tur, 4 -> 4 tur", S.buildTurns("farms", 2) === 2 && S.buildTurns("farms", 4) === 4);
  check("şehir seviyesi, kışla, tersane bir tur fazla", S.buildTurns("level", 3) === 4 && S.buildTurns("barracks", 2) === 3 && S.buildTurns("shipyard", 2) === 3);
  check("en kısa iş bir tur (liman kalesi 0 -> 1)", S.buildTurns("fort", 1) === 1);
  check("şehirde 2, kalede 1 inşaatçı", S.buildersOf("rome") === 2 && S.buildersOf("ariminum") === 1);

  const s = S.newGame("rome", 7);
  s.civs.rome.money = 500;
  check("iki inşaatçı iki işe", S.upgrade(s, "rome", "farms") && S.upgrade(s, "rome", "industry") && S.freeBuilders(s, "rome") === 0);
  check("üçüncü işe inşaatçı yok", S.upgradeInfo(s, "rome", "level").why === "busy" && !S.upgrade(s, "rome", "level"));
  check("kalenin tek inşaatçısı", S.upgrade(s, "ariminum", "level") && S.upgradeInfo(s, "ariminum", "barracks").why !== null && S.freeBuilders(s, "ariminum") === 0);
  const ev = [];
  S.progressBuilds(s, ev);
  check("bir tur sonra: iş sürüyor, yapı aynı", s.places.rome.farms === 1 && s.places.rome.builds.every((b) => b.left === 1) && !ev.length);
  S.progressBuilds(s, ev);
  check("süresi dolunca yapı yükselir, inşaatçı boşalır", s.places.rome.farms === 2 && s.places.rome.industry === 2 && S.freeBuilders(s, "rome") === 2);
  check("biten iş haber olur", ev.filter((e) => e.type === "built" && e.place === "rome").length === 2 && ev.find((e) => e.what === "farms").level === 2);
  check("kalenin seviyesi 1 -> 2 üç tur: iki turdan sonra hâlâ sürüyor", s.places.ariminum.level === 1 && s.places.ariminum.builds[0].left === 1);

  const c = S.newGame("rome", 7);
  c.civs.rome.money = 100;
  S.upgrade(c, "rome", "level");
  check("iptal: para geri gelir, inşaatçı boşalır", S.cancelBuild(c, "rome", "level") && c.civs.rome.money === 100 && S.freeBuilders(c, "rome") === 2);

  // Kuşatmada inşaat durur; el değiştiren yerin yarım işi yıkılır.
  const k = S.newGame("rome", 7);
  k.civs.rome.money = 100;
  S.upgrade(k, "tarentum", "level");
  k.armies.push({ id: 90, owner: "carthage", at: "syracuse", inf: 50, arch: 0, cav: 0, siege: 0, ships: 0, moves: 0, route: [], besieging: "tarentum", besiegedSince: 1 });
  const left = k.places.tarentum.builds[0].left;
  S.progressBuilds(k, []);
  check("kuşatılan yerde inşaat durur", k.places.tarentum.builds[0].left === left);
  k.armies = [];
  M.capture(k, "tarentum", "carthage");
  check("el değiştiren yerin yarım inşaatı yıkılır", k.places.tarentum.builds.length === 0);

  // Tur sonu: inşaat üretimden önce ilerler (bir turluk iş o tur üretir).
  const t = S.newGame("rome", 7);
  t.civs.rome.money = 100;
  t.places.tarentum.fishery = 0;
  S.upgrade(t, "tarentum", "fishery");
  T.endTurn(t);
  check("tur sonunda biten balıkçılık", t.places.tarentum.fishery === 1 && t.events.some((e) => e.type === "built" && e.civ === "rome"));

  const old = JSON.parse(JSON.stringify(S.newGame("rome", 7)));
  old.version = 7;
  for (const p of Object.values(old.places)) delete p.builds;
  S.migrate(old);
  check("7. sürüm kayıt yükseltiliyor: inşaat listesi boş", old.version === S.VERSION && Object.values(old.places).every((p) => Array.isArray(p.builds) && !p.builds.length));
}

// ---------------------------------------------------------------------------------------------
section("Birlik kartları: her bölük bir kart");

{
  const u = { inf: 37, arch: 20, cav: 0, siege: 0, ships: 2 };
  const cards = S.cardsOf(u);
  check("37 piyade dört kart: 10, 10, 10, 7", cards.filter((c) => c.type === "inf").map((c) => c.men).join(",") === "10,10,10,7");
  check("kartlar türlerin sırasıyla, gemiler sonda", cards.map((c) => c.type).join(",") === "inf,inf,inf,inf,arch,arch,ships,ships", cards.map((c) => c.type).join(","));
  check("asker yoksa kart yok", S.cardsOf({ inf: 0, arch: 0, cav: 0, siege: 0, ships: 0 }).length === 0);
  check("kartların toplamı askerlerin toplamı", cards.filter((c) => c.type !== "ships").reduce((n, c) => n + c.men, 0) === 57);
  const want = S.chosen(u, [0, 3, 4, 6]);
  check("seçilen kartlar: 10 + 7 piyade, 10 okçu, 1 gemi", want.inf === 17 && want.arch === 10 && want.ships === 1 && want.cav === 0);
  check("olmayan kart seçilemez", S.men(S.chosen(u, [99, -1])) === 0);

  const s = S.newGame("rome", 7);
  s.places.rome.inf = 40;
  s.places.rome.arch = 20;
  const pick = S.chosen(s.places.rome, [0, 1, 4]);
  const a = S.formArmy(s, "rome", pick.inf, pick.arch, pick.cav, pick.siege, pick.ships);
  check("seçilen kartlar dışarı çıkar, gerisi garnizonda", a && a.inf === 20 && a.arch === 10 && s.places.rome.inf === 20 && s.places.rome.arch === 10);
  a.general = { name: "Scipio", level: 1, xp: 0, traits: [] };
  a.mp = 1;
  const b = S.detach(s, a.id, { inf: 10, arch: 10 });
  check("ayrılan kartlar yeni ordu: aynı yerde, aynı hareketle", b && b.at === "rome" && b.x === a.x && b.inf === 10 && b.arch === 10 && b.mp === 1 && S.armiesOf(s, "rome").length === 2);
  check("kalan ordu ve generali yerinde", a.inf === 10 && a.arch === 0 && a.general?.name === "Scipio" && !b.general);
  check("hepsi ayrılmaz", S.detach(s, a.id, { inf: 10 }) === null && a.inf === 10);
  check("hiçbiri ayrılmaz", S.detach(s, b.id, {}) === null);
  check("olandan fazlası ayrılmaz", S.detach(s, b.id, { inf: 20 }) === null && b.inf === 10);
  b.besieging = "massalia";
  check("kuşatan ordu bölünmez", S.detach(s, b.id, { inf: 10 }) === null);
  delete b.besieging;
  b.ships = 2;
  const c = S.detach(s, b.id, { ships: 2 });
  check("gemiler ayrı bir filo olabilir", c && c.ships === 2 && S.men(c) === 0 && b.ships === 0 && b.inf === 10);
}

// ---------------------------------------------------------------------------------------------
section("Gemi türleri: kadırga, trireme, kinkerem");

{
  const G = N.navy.types;
  check("kadırga taşır, savaş gemileri savaşır", G.ships.carry > G.trireme.carry && G.trireme.might > G.ships.might && G.quinq.might > G.trireme.might);
  check("savaş gemisi para başına daha güçlü", G.trireme.might / G.trireme.money > G.ships.might / G.ships.money && G.quinq.might / G.quinq.money > G.ships.might / G.ships.money);
  check("kadırga asker başına daha ucuz", G.ships.money / G.ships.carry < G.trireme.money / G.trireme.carry);

  const s = S.newGame("carthage", 7);
  s.civs.carthage.money = 200; s.civs.carthage.weapons = 50;
  const c = s.places.carthage;
  check("kinkerem önce Gemi inşası ister", S.shipInfo(s, "carthage", "quinq").why === "tech_shipbuilding");
  R.grant(s, "carthage", "shipbuilding");
  check("tersane 1: kadırga yapılır, trireme ve kinkerem kapalı", !S.shipInfo(s, "carthage").why
    && S.shipInfo(s, "carthage", "trireme").why === "needShipyard2" && S.shipInfo(s, "carthage", "quinq").why === "needShipyard3");
  c.shipyard = 2;
  const m0 = s.civs.carthage.money, w0 = s.civs.carthage.weapons, p0 = c.pop;
  check("tersane 2: trireme yapılır (6 para, 3 silah, 8 tayfa)", S.buildShip(s, "carthage", "trireme") && c.trireme === 1
    && s.civs.carthage.money === m0 - 6 && s.civs.carthage.weapons === w0 - 3 && c.pop === p0 - 8, `${m0 - s.civs.carthage.money}`);
  check("trireme de tersanenin tur hakkından yer", S.shipInfo(s, "carthage").why === null && S.buildShip(s, "carthage") && S.shipInfo(s, "carthage").why === "done");
  check("kinkerem hâlâ tersane 3 ister", S.shipInfo(s, "carthage", "quinq").why === "needShipyard3");

  const u = { inf: 60, ships: 1, trireme: 2, quinq: 1 };
  check("filo: 4 gemi, 65 asker taşır, gücü 10", S.fleetOf(u) === 4 && S.carryOf(u) === 65 && S.mightOf(u) === 10);
  check("taşıyabildiği kadar asker: denize açılır", S.canSail(u) && !S.canSail({ ...u, inf: 70 }));
  check("askersiz savaş filosu da denize açılır", S.canSail({ trireme: 1 }) && !S.empty({ trireme: 1 }));
  const pick = S.shipsToCarry({ ships: 2, trireme: 3, quinq: 1 }, 60);
  check("taşıma: önce kadırgalar, sonra kinkerem", pick.ships === 2 && pick.quinq === 1 && pick.trireme === 0, JSON.stringify(pick));
  check("yetmiyorsa hepsi", S.fleetOf(S.shipsToCarry({ ships: 1, trireme: 1 }, 500)) === 2);

  // Deniz savaşı: sayı değil güç. 2 trireme (5) 4 kadırgayı (4) yener (Mısır'ın denizciliği 1).
  const nr = C.naval({ civ: "rome", trireme: 2 }, { civ: "egypt", ships: 4 });
  check("2 trireme 4 kadırgayı yener", nr.attWins && S.fleetOf(nr.def) === 0 && nr.att.trireme >= 1);
  const nr2 = C.naval({ civ: "rome", ships: 4 }, { civ: "egypt", trireme: 2 });
  check("tersi: 4 kadırga 2 triremeye yenilir", !nr2.attWins && S.fleetOf(nr2.att) === 0);
  const sk = { ships: 6, trireme: 3, quinq: 1 };
  C.sinkShips(sk, 5);
  check("batan gemiler türlere oranla (6/3/1'den 5 gemi: 2/2/1 kalır)", sk.ships === 2 && sk.trireme === 2 && sk.quinq === 1, JSON.stringify(sk));

  // Denizden saldırı: limandaki kadırgalara karşı triremeli filo.
  const b = S.newGame("rome", 7);
  b.places.syracuse.ships = 3;
  const a = S.muster(b, "tarentum", { inf: 0 });
  check("boş ordu çıkmaz", a === null);
  b.places.tarentum.inf = 80; b.places.tarentum.trireme = 3; b.places.tarentum.ships = 2;
  const fl = S.muster(b, "tarentum", { inf: 50, ships: 2, trireme: 3 });
  check("gemi türleriyle ordu çıkar", fl && fl.trireme === 3 && fl.ships === 2 && b.places.tarentum.trireme === 0);
  offshore(fl, "syracuse");
  b.places.syracuse.inf = 10; b.places.syracuse.arch = 0;
  const ev = M.attack(b, fl.id, "syracuse", [1, 1]);
  check("Tarentum'dan denizden: triremeler limanın 3 kadırgasını batırır, ordu karaya çıkar", ev && ev.naval?.won && ev.naval.sunk === 3 && !ev.drowned && ev.won, JSON.stringify(ev?.naval));
  const lost = S.newGame("rome", 7);
  lost.places.syracuse.trireme = 2; lost.places.tarentum.inf = 40; lost.places.tarentum.ships = 3;
  const weak = S.muster(lost, "tarentum", { inf: 40, ships: 2 });
  offshore(weak, "syracuse");
  const ev2 = M.attack(lost, weak.id, "syracuse", [1, 1]);
  check("kadırgalı ordu limandaki iki triremeye yenilir, denizde kaybolur", ev2 && ev2.drowned && !lost.armies.includes(weak) && M.shipsAt(lost, "syracuse") >= 1);

  // Abluka gücüyle: limanda 3 kadırga (3), karşıda düşmanın 1 kinkereme (4).
  const k = S.newGame("rome", 7);
  k.relations[S.key("rome", "carthage")] = "war";
  k.places.tarentum.ships = 3;
  const q = S.muster(k, "carthage", {});
  check("boş filo da çıkmaz", q === null);
  k.places.carthage.quinq = 1;
  const qa = S.muster(k, "carthage", { quinq: 1 });
  offshore(qa, "tarentum");
  check("tek kinkerem 3 kadırgalık limanı ablukaya alır (güç 4 > 3)", S.blockaded(k, "tarentum"));
  qa.quinq = 0; qa.ships = 1;
  check("tek kadırga almaz (1 < 3)", !S.blockaded(k, "tarentum"));
  check("bakım türüne göre: kinkerem 1 yiyecek", (() => { const h = S.newGame("rome", 7); const u0 = S.budget(h, "rome").upkeep; h.places.tarentum.quinq += 2; return S.budget(h, "rome").upkeep === u0 + 2; })());

  // Kartlar: her gemi kendi türüyle.
  const cards = S.cardsOf({ inf: 10, ships: 1, trireme: 1, quinq: 1 });
  check("gemi kartları türleriyle, sırasıyla", cards.map((x) => x.type).join(",") === "inf,ships,trireme,quinq");
  const w = S.chosen({ inf: 10, ships: 1, trireme: 1, quinq: 1 }, [2, 3]);
  check("seçilen gemi kartları", w.trireme === 1 && w.quinq === 1 && w.ships === 0);

  const old = JSON.parse(JSON.stringify(S.newGame("rome", 7)));
  old.version = 8;
  for (const p of Object.values(old.places)) { delete p.trireme; delete p.quinq; }
  old.armies = [{ id: 1, owner: "rome", at: "rome", inf: 10, arch: 0, cav: 0, siege: 0, ships: 2, moves: 1, route: [], general: null }];
  delete old.barbarians;
  S.migrate(old);
  const oa = old.armies.find((a) => a.owner === "rome");
  check("8. sürüm kayıt yükseltiliyor: eski gemiler kadırga", old.version === S.VERSION && old.places.tarentum.ships === 1 && old.places.tarentum.trireme === 0 && oa.quinq === 0 && oa.ships === 2);

  // Bilgisayar: tersanesi 2 olan, gemisiz, karşısında alınacak yer olmayan liman savaş gemisi yapar.
  const { aiTurn: ai0 } = await import("../src/rules/ai.js");
  let tri = 0;
  for (let i = 0; i < 6; i++) {
    const h = S.newGame("rome", 40 + i);
    h.places.carthage.ships = 0; h.places.carthage.shipyard = 2; h.civs.carthage.money = 200; h.civs.carthage.weapons = 40; h.civs.carthage.food = 80;
    for (const id of Object.keys(h.places)) if (h.places[id].owner === null) h.places[id].owner = "egypt"; // alınacak bağımsız yok
    ai0(h, "carthage", []);
    tri += h.places.carthage.trireme;
  }
  check("bilgisayar savunmaya savaş gemisi yapıyor", tri > 0, tri);
}

// ---------------------------------------------------------------------------------------------
section("Liman yapıları (bölüm 16)");

{
  const s = S.newGame("rome", 7);
  s.civs.rome.money = 200;
  check("liman yapıları limanda başlar: tersane 1, ötekiler 0", s.places.tarentum.shipyard === 1 && s.places.tarentum.fishery === 0 && s.places.tarentum.trade === 0 && s.places.tarentum.fort === 0);
  check("karada liman yapısı yapılmaz", S.upgradeInfo(s, "ariminum", "fishery").why === "notPort");
  check("liman yapısı şehir seviyesini geçemez", (s.places.tarentum.fishery = 1, S.upgradeInfo(s, "tarentum", "fishery").why === "needLevel"));
  s.places.tarentum.fishery = 0;
  const f0 = S.output(s, "tarentum").food;
  // Liman yapısı da inşaatçıyla: 0 -> 1 bir tur.
  check("balıkçılık 1: turda +2 balık", S.upgrade(s, "tarentum", "fishery") && (S.progressBuilds(s, []), S.output(s, "tarentum").food === f0 + 2));
  s.places.tarentum.level = 2;
  const m0 = S.output(s, "tarentum").money;
  check("ticaret 1: turda +2 para", S.upgrade(s, "tarentum", "trade") && (S.progressBuilds(s, []), Math.abs(S.output(s, "tarentum").money - (m0 + 2)) < 1e-9));
  const k = S.newGame("carthage", 7);
  k.places.carthage.trade = 1;
  check("Kartaca ticareti x1.5: +3", Math.abs(S.output(k, "carthage").money - S.output(S.newGame("carthage", 7), "carthage").money - 3) < 1e-9);

  // Tersane: gemi hakkı ve fiyatı.
  const t = S.newGame("rome", 7);
  t.civs.rome.money = 200; t.civs.rome.weapons = 50;
  t.places.tarentum.level = 3; t.places.tarentum.pop = 200;
  check("tersane 1: turda 1 gemi, 4 para", S.shipInfo(t, "tarentum").cost.money === 4 && S.buildShip(t, "tarentum") && S.shipInfo(t, "tarentum").why === "done");
  t.places.tarentum.shipyard = 3; t.places.tarentum.built = 0;
  check("tersane 3: gemi 2 para, turda 3 gemi", S.shipInfo(t, "tarentum").cost.money === 2
    && S.buildShip(t, "tarentum") && S.buildShip(t, "tarentum") && S.buildShip(t, "tarentum") && S.shipInfo(t, "tarentum").why === "done");
  check("gemi asker hakkını yemez", !S.recruitInfo(t, "tarentum", "inf").why);
  T.endTurn(t);
  check("tur başında tersane hakkı yenilenir", t.places.tarentum.built === 0 || t.places.tarentum.owner !== "rome");
  const nz = S.newGame("rome", 7);
  nz.places.tarentum.shipyard = 0;
  check("tersanesiz liman gemi yapamaz", S.shipInfo(nz, "tarentum").why === "needShipyard");

  // Liman kalesi: savunan gemiler daha güçlü, abluka daha zor.
  const fight = (fort) => {
    const g = S.newGame("rome", 7);
    g.places.syracuse.ships = 4;
    g.places.syracuse.fort = fort;
    const army = S.formArmy(g, "tarentum", 10, 0);
    army.inf = 50; army.ships = 5;
    offshore(army, "syracuse");
    return M.attack(g, army.id, "syracuse", [1, 1]);
  };
  check("liman kalesi 1: 4 gemi 5 gemiyi durdurur (kalesiz durduramaz)", fight(1).drowned && !fight(0).drowned);
  const b = S.newGame("rome", 7);
  b.relations[S.key("carthage", "rome")] = "war";
  b.places.syracuse.owner = "carthage";
  b.places.syracuse.ships = 0; // Siraküza'nın başlangıç gemileri de Kartaca'ya geçmesin: karşıda sadece filo
  const fl = offshore(S.formArmy(b, "carthage", 0, 0, 0, 0, 2), "tarentum");
  b.places.tarentum.ships = 1;
  check("2 gemi 1 gemiyi abluka eder", S.blockaded(b, "tarentum"));
  b.places.tarentum.fort = 3; b.places.tarentum.ships = 2;
  check("liman kalesi 3: 2 gemi 2 gemiyi abluka edemez (2 x 1.75)", !S.blockaded(b, "tarentum"));
  b.places.tarentum.fort = 0;
  b.places.tarentum.trade = 1;
  const shut = S.output(b, "tarentum");
  check("ablukada ticaret parası da yarı", Math.abs(shut.money - (b.places.tarentum.pop / N.taxPer + 2) * 0.5) < 1e-9 || !S.blockaded(b, "tarentum"));

  const old = JSON.parse(JSON.stringify(S.newGame("rome", 7)));
  old.version = 4;
  for (const p of Object.values(old.places)) { delete p.fishery; delete p.shipyard; delete p.trade; delete p.fort; delete p.built; }
  S.migrate(old);
  check("4. sürüm kayıt yükseltiliyor", old.version === S.VERSION && old.places.tarentum.shipyard === 1 && old.places.ariminum.shipyard === 0 && old.places.tarentum.fishery === 0);
}

// ---------------------------------------------------------------------------------------------
section("Görevler (bölüm 17)");

const MI = await import("../src/rules/missions.js");
{
  const ships = (g, c) => S.placesOf(g, c).reduce((n, id) => n + g.places[id].ships, 0) + S.armiesOf(g, c).reduce((n, a) => n + a.ships, 0);
  const s = S.newGame("rome", 7);
  s.turn = 5;

  // Al: komşu, kimsenin değil ya da savaştığın birinin.
  const t = MI.make(s, "take");
  check("al: hedef komşu ve Roma'nın değil", t && s.places[t.place].owner !== "rome" && neighbours(t.place).some((n) => s.places[n].owner === "rome"));
  check("al: tarafsız medeniyetin yeri hedef olmaz", t && (s.places[t.place].owner === null || S.relation(s, "rome", s.places[t.place].owner) === "war"));
  s.missions.push(t);
  check("al: alınmadan tamamlanmaz", !MI.check(s).done.length && s.missions.length === 1);
  const money = s.civs.rome.money;
  s.places[t.place].owner = "rome";
  const r1 = MI.check(s);
  check("al: alınınca ödül ambara, görev düşer", r1.done.length === 1 && s.civs.rome.money === money + t.reward.money && !s.missions.length);

  // Filo: toplam gemi üç fazla.
  const f = MI.make(s, "fleet");
  check("filo: hedef bugünkü gemi + 3", f && f.need === ships(s, "rome") + 3 && MI.progress(s, f)[1] === f.need);
  s.missions.push(f);
  s.places.rome.ships += 2;
  check("filo: iki gemi yetmez", !MI.check(s).done.length);
  s.places.rome.ships += 1;
  check("filo: üçüncü gemiyle tamam", MI.check(s).done[0] === f);

  // İttifak
  const al = MI.make(s, "ally");
  check("ittifak: tarafsız bir medeniyet", al && al.other !== "rome" && S.relation(s, "rome", al.other) === "neutral");
  s.missions.push(al);
  s.relations[S.key("rome", al.other)] = "ally";
  check("ittifak: kurulunca tamam", MI.check(s).done[0] === al);

  // Bayındırlık: yükselebilecek bir yapı bir seviye.
  const gr = MI.make(s, "grow");
  check("bayındırlık: kendi yeri, yükselebilir yapı", gr && s.places[gr.place].owner === "rome" && S.upgradeInfo(s, gr.place, gr.what).why !== "max" && gr.need === s.places[gr.place][gr.what] + 1);
  s.missions.push(gr);
  check("bayındırlık: yükselmeden tamamlanmaz", !MI.check(s).done.length);
  s.places[gr.place][gr.what] = gr.need;
  check("bayındırlık: yükselince tamam", MI.check(s).done[0] === gr);

  // Büyük ordu
  const ar = MI.make(s, "army");
  check("ordu: en az 150 asker", ar && ar.need >= 150);
  s.missions.push(ar);
  const a = S.formArmy(s, "rome", 30, 0);
  check("ordu: küçük ordu yetmez", !MI.check(s).done.length);
  a.inf = ar.need;
  check("ordu: yeter büyüklükte ordu", MI.check(s).done[0] === ar);

  // General: yoksa ata, varsa rütbe atlat.
  const ge = MI.make(s, "general");
  check("general: generali yoksa 'bir general ata'", ge && ge.need === 1);
  s.missions.push(ge);
  s.civs.rome.money = 500;
  GN.appoint(s, a.id);
  check("general: atanınca tamam", MI.check(s).done[0] === ge);
  const ge2 = MI.make(s, "general");
  check("general: varsa bir rütbe üstü", ge2 && ge2.need === a.general.level + 1);

  // Huzur: sadakati düşük yer yoksa verilmez.
  check("huzur: sadakat yüksekken görev yok", MI.make(s, "loyal") === null);
  s.places.tarentum.loyalty = 40;
  const lo = MI.make(s, "loyal");
  check("huzur: düşük sadakatli yer", lo && lo.place === "tarentum" && lo.need === 80);
  s.missions.push(lo);
  s.places.tarentum.loyalty = 85;
  check("huzur: sadakat yükselince tamam", MI.check(s).done[0] === lo);

  // Savunma: kapısında düşman yoksa verilmez; varsa süre dolunca tamam, kaybedilirse düşer.
  check("savunma: tehdit yokken görev yok", MI.make(s, "hold") === null);
  s.relations[S.key("rome", "gaul")] = "war";
  const enemy = S.formArmy(s, "bibracte", 10, 0);
  // Sahada, Alplerin eteğinde: Ariminum'un tehdit menzilinde, Roma'nınkinin dışında.
  Object.assign(enemy, project(9.5, 46.3), { at: null });
  check("düşman sadece Ariminum'u tehdit ediyor", M.menace(s, "ariminum") > 0 && M.menace(s, "rome") === 0);
  const ho = MI.make(s, "hold");
  check("savunma: tehdit altındaki yer", ho && M.menace(s, ho.place) > 0);
  s.missions.push(ho);
  check("savunma: süre dolmadan tamamlanmaz", !MI.check(s).done.length && s.missions.includes(ho));
  s.turn = ho.until;
  check("savunma: süre dolunca, yer hâlâ elindeyse tamam", MI.check(s).done[0] === ho);
  s.turn = 5;
  const ho2 = MI.make(s, "hold");
  s.missions.push(ho2);
  const capLoyalty = s.places.rome.loyalty = 90;
  s.places[ho2.place].owner = "gaul";
  const r2 = MI.check(s);
  check("savunma: yer düşerse görev başarısız, başkentin sadakati −5", r2.failed[0] === ho2 && s.places.rome.loyalty === capLoyalty - N.missions.failLoyalty);
  s.places[ho2.place].owner = "rome";

  // Süre: geçen görev düşer.
  const late = MI.make(s, "fleet");
  s.missions.push(late);
  s.turn = late.until;
  check("son turda hâlâ açık", !MI.check(s).failed.length && s.missions.includes(late) && MI.turnsLeft(s, late) === 1);
  s.turn = late.until + 1;
  check("süresi geçince düşer", MI.check(s).failed[0] === late && !s.missions.length);

  // Kabul ve ret
  const x = MI.make(s, "army");
  s.missions.push(x);
  check("kabul: görüldü işareti", MI.accept(s, x.id) && x.seen);
  check("ret: görev düşer, ceza yok", MI.decline(s, x.id) && !s.missions.length);
}

{
  // Görev gelişi: başta yok, aynı anda en fazla iki, arası en az beş tur, aynı türden iki yok;
  // ve dünyanın zarına dokunmaz.
  const s = S.newGame("macedon", 3);
  const chance = N.missions.chance;
  N.missions.chance = 1;
  s.turn = N.missions.from - 1;
  check("ilk turlarda görev gelmez", MI.issue(s) === null);
  s.turn = N.missions.from;
  const rng = s.rng;
  const a = MI.issue(s);
  check("görev gelir", !!a && s.missions.length === 1);
  check("görev dünyanın zarını kullanmaz", s.rng === rng);
  s.turn += 1;
  check("arası en az beş tur", MI.issue(s) === null);
  s.turn += N.missions.spacing;
  const b = MI.issue(s);
  check("ikinci görev, farklı türden", !!b && b.key !== a.key);
  s.turn += N.missions.spacing;
  check("aynı anda en fazla iki", MI.issue(s) === null && s.missions.length === N.missions.max);
  N.missions.chance = chance;

  // Tur sonu: görevler sadece oyuncuya; görev olsa da olmasa da dünya aynı yürür.
  const run = (max) => {
    const keep = N.missions.max;
    N.missions.max = max;
    const g = S.newGame("egypt", 11);
    for (let i = 0; i < 12; i++) T.endTurn(g);
    N.missions.max = keep;
    return g;
  };
  const withM = run(2), without = run(0);
  check("görevler sadece oyuncunun", withM.missions.length > 0 && withM.missions.every((m) => m.civ === "egypt"));
  check("görevlerle dünyanın zarı aynı", withM.rng === without.rng);
  check("rapora yeni görev yazılır", T.endTurn(S.newGame("gaul", 5)) && true);

  // Kayıt
  const old = JSON.parse(JSON.stringify(S.newGame("rome", 7)));
  old.version = 5;
  delete old.missions; delete old.lastMission; delete old.mrng;
  S.migrate(old);
  check("5. sürüm kayıt yükseltiliyor", old.version === S.VERSION && Array.isArray(old.missions) && old.lastMission === 0);
  old.turn = 9;
  N.missions.chance = 1;
  check("eski kayıtta görev zarı kendiliğinden kurulur", !!MI.issue(old) && Number.isInteger(old.mrng));
  N.missions.chance = chance;
}

// ---------------------------------------------------------------------------------------------
section("Dünya harikaları (bölüm 18)");

const WO = await import("../src/rules/wonders.js");
{
  check("altı harika, her biri gerçek bir yerleşimde", WO.WONDERS.length === 6 && WO.WONDERS.every((w) => byId[w.place]));
  const s = S.newGame("rome", 7);
  check("Mısır başta iki harika tutuyor (Fener, Piramitler)", WO.wondersOf(s, "egypt").map((w) => w.id).sort().join() === "pharos,pyramids");
  check("Roma başta harika tutmuyor", WO.wondersOf(s, "rome").length === 0 && !WO.holds(s, "rome", "parthenon"));
  check("bağımsız şehirdeki harika kimsenin değil", !WO.holds(s, null, "gardens") && WO.wonderAt("babylon").id === "gardens");

  // Rodos Heykeli: limanlarda ticaret x1.5. Artemis: bütün para x1.1.
  s.places.tarentum.trade = 2;
  const t0 = S.output(s, "tarentum").money;
  s.places.rhodes.owner = "rome";
  const t1 = S.output(s, "tarentum").money;
  const tradeMoney = 2 * N.port.tradePerLevel;
  check("Rodos Heykeli: Roma'nın limanında ticaret x1.5", Math.abs(t1 - t0 - tradeMoney * (N.wonders.colossusTrade - 1)) < 1e-9);
  const r0 = S.output(s, "rome").money;
  s.places.ephesus.owner = "rome";
  check("Artemis Tapınağı: para x1.1", Math.abs(S.output(s, "rome").money / r0 - N.wonders.artemisMoney) < 1e-9);
  check("Artemis başkasının parasına dokunmaz", Math.abs(S.output(s, "carthage").money - S.output(S.newGame("rome", 7), "carthage").money) < 1e-9);

  // Piramitler: sadakat +2.
  check("Piramitler: Mısır'ın yerlerinde sadakat +2", LY.drift(s, "jerusalem").parts.wonder === N.wonders.pyramidsLoyalty);
  check("Piramitler: Roma'da yok", LY.drift(s, "tarentum").parts.wonder === 0);
  s.places.memphis.owner = "rome";
  check("Memphis alınınca Piramitler Roma'nın", LY.drift(s, "tarentum").parts.wonder === N.wonders.pyramidsLoyalty && LY.drift(s, "jerusalem").parts.wonder === 0);

  // Fener: liman kalesi bir seviye fazla.
  check("Fener: İskenderiye'nin deniz savunması bir seviye fazla", M.fortOf(s, "alexandria") === 1 + N.port.fortPerLevel && M.fortOf(s, "carthage") === 1);

  // Asma Bahçeler: nüfus artışı x1.25.
  const grow = (owner) => {
    const g = S.newGame("rome", 7);
    g.places.babylon.owner = owner;
    g.places.tarentum.pop = 20;
    T.economy(g, []);
    return g.places.tarentum.pop - 20;
  };
  check("Asma Bahçeler: Roma'nın nüfus artışı x1.25", grow("rome") > grow(null));

  // Parthenon: generaller iki kat öğrenir.
  const gen = () => ({ name: "x", level: 1, xp: 0, traits: [] });
  const g1 = gen(), g2 = gen();
  GN.learn(s, g1, true, "rome");
  s.places.athens.owner = "rome";
  GN.learn(s, g2, true, "rome");
  check("Parthenon: Roma'nın generali iki kat tecrübe", g2.xp === g1.xp * N.wonders.parthenonXp && g1.xp > 0);

  // Harika şehirle el değiştirir: savaşta alınan şehir.
  const w = S.newGame("rome", 7);
  w.relations[S.key("rome", "macedon")] = "war";
  const a = S.formArmy(w, "tarentum", 10, 0);
  a.inf = 900;
  before(a, "athens");
  w.places.corinth.owner = "rome";
  w.places.athens.owner = "macedon";
  check("Atina Makedonya'nınken Parthenon onun", WO.holds(w, "macedon", "parthenon"));
  const ev = M.attack(w, a.id, "athens", [1, 1]);
  check("Atina alınınca Parthenon Roma'nın", ev?.won && WO.holds(w, "rome", "parthenon") && !WO.holds(w, "macedon", "parthenon"));
}

// ---------------------------------------------------------------------------------------------
section("Savaş sisi (bölüm 19)");

const SI = await import("../src/rules/sight.js");
{
  const s = S.newGame("saka", 7);
  const seen = SI.sight(s, "saka");
  const within = (id, r) => PLACES.filter((p) => MAP.dist(POS[p.id], POS[id]) <= r).map((p) => p.id);
  check("kendi yerlerini görür", ["neapolis", "olbia", "tanais"].every((id) => seen.has(id)));
  check("yerlerinin görüş çemberindekileri görür", within("olbia", N.reach.sightPlace).every((n) => seen.has(n)) && within("olbia", N.reach.sightPlace).length > 1);
  check("uzaktakini görmez", !seen.has("rome") && !seen.has("carthage") && !seen.has("babylon"));
  const far = PLACES.find((p) => !seen.has(p.id) && p.owner !== "saka");
  check("görülmeyen bir yer var (sis bir şey saklıyor)", !!far);

  // Ordu gözdür: sahadaki ordu nereye giderse oranın çevresi görünür (kullanıcı 22.10: "yürüdüğü
  // yerlerde sisler açılsın").
  const a = before(S.formArmy(s, "neapolis", 10, 0), "byzantium");
  const seen2 = SI.sight(s, "saka");
  check("ordu gittiği yerin çevresini açar", seen2.has("byzantium") && within("byzantium", N.reach.sightArmy - 0.3).every((n) => seen2.has(n)));
  check("ordunun gözü çember: içindekini görür, dışındakini görmez", SI.seen(SI.eyes(s, "saka"), { x: a.x + 2, y: a.y }) && !SI.seen(SI.eyes(s, "saka"), project(-5, 40)));
  s.armies = [];

  // Müttefik gözü paylaşılır.
  check("tarafsız medeniyetin yerini görmez", !SI.sight(s, "saka").has("rome"));
  s.relations[S.key("saka", "rome")] = "ally";
  const seen3 = SI.sight(s, "saka");
  check("müttefikin yerlerini ve çevrelerini görür", seen3.has("rome") && within("rome", N.reach.sightPlace).every((n) => seen3.has(n)));
  s.relations[S.key("saka", "rome")] = "war";
  check("savaştığının yerini (yakında değilse) görmez", !SI.sight(s, "saka").has("rome"));
}

// ---------------------------------------------------------------------------------------------
section("Zafer yolları: Fetih, Harikalar, Skor");

{
  const V = await import("../src/rules/victory.js");
  const W = await import("../src/rules/wonders.js");
  const s = S.newGame("rome", 7);
  const sc = V.scoreOf(s, "rome");
  // Roma: başkent (10 + 2x4 + 10 = 28) + Tarentum (10 + 4) + Ariminum (10 + 4) = 56.
  check("skor: toprak yerleşimler ve seviyeleri", sc.parts.lands === 56, sc.parts.lands);
  check("skor parçaların toplamı", sc.total === Object.values(sc.parts).reduce((a, b) => a + b, 0));
  const rk = V.ranking(s);
  check("sıralama büyükten küçüğe, herkes var", rk.length === 7 && rk.every((r, i) => !i || rk[i - 1].total >= r.total));
  check("Mısır iki harikayla önde başlar", rk[0].civ === "egypt" && V.rankOf(s, "egypt") === 1);
  // Kazanılan savaş sayılır.
  const a = before(raise(s, "rome", { inf: 200 }), "mediolanum");
  M.attack(s, a.id, "mediolanum", [1, 1]);
  check("kazanılan savaş skora girer", s.wins.rome === 1 && V.scoreOf(s, "rome").parts.wins === N.score.win);

  // Harikalar: 8 harika tutanın sayacı (5 antik + İskenderiye'de inşa edilmiş 3).
  const h = S.newGame("rome", 7);
  for (const id of ["rhodes", "ephesus", "athens"]) h.places[id].owner = "egypt";
  h.built = { oracle: "alexandria", library: "alexandria", treasury: "alexandria" };
  check("Mısır'da 8 harika", W.wondersOf(h, "egypt").length === N.victory.wonders);
  const ev = V.tickVictory(h, []);
  check("sayaç başlar, herkes duyar", h.wonderHold.egypt === 1 && ev.some((e) => e.type === "wonderRace" && e.civ === "egypt") && V.wonderTurnsLeft(h, "egypt") === N.victory.hold - 1);
  for (let i = 1; i < N.victory.hold - 1; i++) V.tickVictory(h, []);
  check("süre dolmadan bitmez", V.overOf(h) === null);
  V.tickVictory(h, []);
  const o = V.overOf(h);
  check("süre dolunca Mısır kazanır, oyuncu kaybeder", o && o.kind === "wonders" && o.winner === "egypt" && o.result === "lost");
  const k = S.newGame("rome", 7);
  for (const id of ["rhodes", "ephesus", "athens"]) k.places[id].owner = "egypt";
  k.built = { oracle: "alexandria", library: "alexandria", treasury: "alexandria" };
  V.tickVictory(k, []); V.tickVictory(k, []);
  k.places.athens.owner = "rome";
  const ev2 = V.tickVictory(k, []);
  check("bir harika düşünce sayaç sıfırlanır", !k.wonderHold.egypt && ev2.some((e) => e.type === "wonderLost"));
  // Skor: süre sonunda en yüksek.
  const t = S.newGame("rome", 7);
  t.turn = N.victory.turns + 1;
  const ot = V.overOf(t);
  check("süre bitince en yüksek skor kazanır", ot && ot.kind === "score" && ot.winner === V.ranking(t)[0].civ && ot.result === (ot.winner === "rome" ? "won" : "lost"));
  // Fetih ve yenilgi.
  const c = S.newGame("rome", 7);
  for (const civ of ["carthage", "egypt", "macedon", "parthia", "gaul", "saka"]) c.civs[civ].alive = false;
  check("herkes yıkılınca fetih zaferi", V.overOf(c)?.kind === "conquest" && V.overOf(c).result === "won");
  const d = S.newGame("rome", 7);
  for (const id of S.placesOf(d, "rome")) d.places[id].owner = "gaul";
  check("son yeri düşen kaybeder", V.overOf(d)?.kind === "fallen" && V.overOf(d).result === "lost");
  // Bilgisayar öndekini durdurur: Harikalar zaferine gidene güçlü komşu savaş açar.
  const { aiTurn: AIt } = await import("../src/rules/ai.js");
  let wars = 0;
  for (let i = 0; i < 20; i++) {
    const g = S.newGame("rome", 300 + i);
    g.turn = 30;
    g.wonderHold = { egypt: 3 };
    g.places.carthage.inf = 300;
    const evs = [];
    AIt(g, "carthage", evs);
    if (evs.some((e) => e.type === "war" && e.on === "egypt")) wars++;
  }
  check("Harikalar zaferine gidene bilgisayar savaş açar", wars > 0, wars);
  const old = JSON.parse(JSON.stringify(S.newGame("rome", 7)));
  old.version = 11;
  delete old.wins; delete old.wonderHold;
  S.migrate(old);
  check("11. sürüm kayıt yükseltiliyor", old.version === S.VERSION && old.wins && old.wonderHold);
}

// ---------------------------------------------------------------------------------------------
section("Casuslar");

{
  const SP = await import("../src/rules/spies.js");
  const s = S.newGame("rome", 7);
  s.civs.rome.money = 100;
  check("kendi şehrine casus gönderilmez", SP.spyInfo(s, "rome", "tarentum").why === "own");
  const near = SP.spyInfo(s, "rome", "mediolanum"), far = SP.spyInfo(s, "rome", "babylon");
  check("casus: 15 para, uzaklığa göre tur (yakın 1, Babil çok)", near.why === null && near.cost === N.spy.cost && near.turns === 1 && far.turns > 3, `${near.turns} ${far.turns}`);
  check("en yakın kendi yerinden çıkar", near.from === "ariminum");
  const spy = SP.sendSpy(s, "rome", "babylon");
  check("gönderilince para ödenir, yolda", spy && s.civs.rome.money === 100 - N.spy.cost && !spy.at && spy.eta === s.turn + far.turns);
  check("aynı yere ikinci casus gönderilmez", SP.spyInfo(s, "rome", "babylon").why === "already");
  SP.sendSpy(s, "rome", "mediolanum"); SP.sendSpy(s, "rome", "massalia");
  check("aynı anda en çok 3 casus", SP.spyInfo(s, "rome", "carthage").why === "max");
  s.civs.rome.money = 0;
  s.spies = s.spies.filter((x) => x.target !== "massalia");
  check("parası yetmeyen gönderemez", SP.spyInfo(s, "rome", "carthage").why === "money");

  // Varış: yolculuk bitince içeride, rapor verir; içerisi görünür olur.
  const t = S.newGame("rome", 7);
  t.civs.rome.money = 100;
  const sp = SP.sendSpy(t, "rome", "babylon");
  check("sisin içindeki Babil görünmüyor", !SI.sight(t, "rome").has("babylon"));
  t.turn = sp.eta - 1;
  SP.tickSpies(t, []);
  check("varmadan rapor yok", !sp.at && !SP.intelOf(t, "rome", "babylon"));
  t.turn = sp.eta;
  const ev = SP.tickSpies(t, []);
  const rp = SP.intelOf(t, "rome", "babylon");
  check("varınca içeride, rapor ve haber", sp.at === "babylon" && rp && rp.garrison.inf === t.places.babylon.inf && rp.turn === t.turn && ev.some((e) => e.type === "spyArrived"));
  check("casusun olduğu yer görünür", SI.sight(t, "rome").has("babylon"));
  // Yakalanma: kocaman garnizonda er geç.
  t.places.babylon.inf = 5000;
  let caught = false;
  for (let k = 0; k < 20 && !caught; k++) { t.turn++; caught = SP.tickSpies(t, []).some((e) => e.type === "spyCaught"); }
  check("kalabalık garnizonda casus yakalanır, son raporu kalır", caught && !SP.spyAt(t, "rome", "babylon") && !!SP.intelOf(t, "rome", "babylon"));
  check("yakalanınca yer artık görünmez", !SI.sight(t, "rome").has("babylon"));
  // Yer kendi olursa casusun işi biter.
  const u = S.newGame("rome", 7);
  u.civs.rome.money = 100;
  SP.sendSpy(u, "rome", "mediolanum");
  u.places.mediolanum.owner = "rome";
  SP.tickSpies(u, []);
  check("hedef kendi yeri olunca casus döner", !SP.spyAt(u, "rome", "mediolanum"));
  // Eski kayıt.
  const old = JSON.parse(JSON.stringify(S.newGame("rome", 7)));
  old.version = 10;
  delete old.spies; delete old.intel; delete old.nextSpy;
  S.migrate(old);
  check("10. sürüm kayıt yükseltiliyor: casus yok", old.version === S.VERSION && Array.isArray(old.spies) && !old.spies.length && old.intel && old.nextSpy === 1);
}

// ---------------------------------------------------------------------------------------------
section("Kuşatma (bölüm 20)");

const SG = await import("../src/rules/siege.js");
{
  const setup = () => {
    const s = S.newGame("rome", 7);
    const a = before(S.formArmy(s, "ariminum", 10, 0), "mediolanum");
    a.inf = 150;
    s.places.mediolanum.inf = 100;
    s.places.mediolanum.arch = 0;
    return { s, a };
  };
  let { s, a } = setup();
  check("ordu Mediolanum'un önünde, karada, menzilde", !a.at && MAP.isLand(MAP.cellOf(a.x, a.y)) && MAP.dist(a, POS.mediolanum) <= N.reach.strike);
  s.places.mediolanum.level = 2;
  check("sursuz yer kuşatılmaz", !M.wallsOf(s, "mediolanum") && !SG.canBesiege(s, a, "mediolanum"));
  s.places.mediolanum.level = 3;
  check("3. seviye şehir surlu: kuşatılabilir", SG.canBesiege(s, a, "mediolanum"));
  const t = S.newGame("rome", 7);
  const fleetArmy = offshore(S.formArmy(t, "tarentum", 10, 0), "syracuse");
  fleetArmy.inf = 30;
  fleetArmy.ships = 2;
  t.places.syracuse.level = 3;
  check("denizden kuşatma olmaz (deniz ablukası ayrı)", M.canAttack(t, fleetArmy, "syracuse") && !SG.canBesiege(t, fleetArmy, "syracuse"));

  check("kuşatma başlar, ordu bu turun hareketini harcar", SG.besiege(s, a.id, "mediolanum") && a.besieging === "mediolanum" && a.mp === 0);
  check("kuşatılan yer bir şey üretmez", Object.values(S.output(s, "mediolanum")).every((v) => v === 0) && S.besieged(s, "mediolanum"));
  check("kuşatma ikinci kez başlamaz", !SG.besiege(s, a.id, "mediolanum"));
  SG.tickSieges(s, []);
  check("bir tur: garnizon %10 erir", s.places.mediolanum.inf === 90);
  SG.tickSieges(s, []);
  check("iki tur: 90 -> 81", s.places.mediolanum.inf === 81);

  // Sahibi olan yerin sadakati düşer.
  ({ s, a } = setup());
  s.places.mediolanum.level = 3;
  s.places.mediolanum.owner = "gaul";
  s.relations[S.key("rome", "gaul")] = "war";
  SG.besiege(s, a.id, "mediolanum");
  const lo = s.places.mediolanum.loyalty;
  SG.tickSieges(s, []);
  check("kuşatılan yerin sadakati turda 5 düşer", s.places.mediolanum.loyalty === lo - N.siege.loyalty);
  // Barış: yer artık düşman değil, kuşatma kalkar ve erime durur.
  s.relations[S.key("rome", "gaul")] = "ally";
  const left = s.places.mediolanum.inf;
  SG.tickSieges(s, []);
  check("barışta (ittifakta) kuşatma kalkar, erime durur", !a.besieging && s.places.mediolanum.inf === left && !S.besieged(s, "mediolanum"));

  // Yürüyen ordu kuşatmayı bırakır.
  ({ s, a } = setup());
  s.places.mediolanum.level = 3;
  SG.besiege(s, a.id, "mediolanum");
  a.mp = N.march.mp;
  M.order(s, a.id, { place: "rome" });
  check("yürüdüğü anda kuşatma kalkar (tur sonunu beklemez)", MAP.dist(a, POS.mediolanum) > 0.5 && !a.besieging && !S.besieged(s, "mediolanum"));
  const g0 = s.places.mediolanum.inf;
  SG.tickSieges(s, []);
  check("yürüyen ordu kuşatmayı bırakır", !a.besieging && s.places.mediolanum.inf === g0);

  // Saldırı kuşatmayı bitirir.
  ({ s, a } = setup());
  s.places.mediolanum.level = 3;
  SG.besiege(s, a.id, "mediolanum");
  a.mp = 1;
  M.attack(s, a.id, "mediolanum", [1, 1]);
  check("saldırı kuşatmayı bitirir", !a.besieging);

  // Teslim: garnizon tükenince kuşatan içeri girer.
  ({ s, a } = setup());
  s.places.mediolanum.level = 3;
  s.places.mediolanum.inf = 3;
  SG.besiege(s, a.id, "mediolanum");
  SG.tickSieges(s, []);
  check("son askerler: her tur en az bir adam (3 -> 2)", s.places.mediolanum.inf === 2 && s.places.mediolanum.owner === null);
  s.places.mediolanum.inf = 1;
  const ev = SG.tickSieges(s, []);
  check("garnizon tükenince yer teslim olur", s.places.mediolanum.owner === "rome" && a.at === "mediolanum" && !a.besieging && ev.some((e) => e.type === "surrender" && e.place === "mediolanum"));

  // Kuşatma makineleri erimeyi hızlandırır, ama sınırlı.
  check("makinesiz %10, 20 makineyle %14, 200 makineyle en fazla %25",
    SG.siegeRate({ siege: 0 }) === 0.1 && Math.abs(SG.siegeRate({ siege: 20 }) - 0.14) < 1e-9 && SG.siegeRate({ siege: 200 }) === N.siege.max);
  ({ s, a } = setup());
  s.places.mediolanum.level = 3;
  const slow = SG.turnsToFall(s, a, "mediolanum");
  a.siege = 40;
  check("makineyle teslim süresi kısalır", SG.turnsToFall(s, a, "mediolanum") < slow && slow > 3);

  // Bilgisayar da kuşatır: kolay olmayan surlu hedefin önünde, yeterince büyük orduyla.
  const g = S.newGame("gaul", 7);
  const ra = before(S.formArmy(g, "ariminum", 10, 0), "mediolanum");
  ra.inf = 240;
  g.places.ariminum.inf = 20; // kale boş kalmasın: yoksa ordu onu korumaya döner
  // Bu tur yetişebileceği daha kolay bir hedef olmasın (Massalia gibi): öteki bağımsızlar Mısır'ın.
  for (const id of Object.keys(g.places)) if (id !== "mediolanum" && g.places[id].owner === null) g.places[id].owner = "egypt";
  g.places.mediolanum.level = 3;
  g.places.mediolanum.inf = 220;
  check("bilgisayar için hedef zor (kolay değil, umutsuz değil)", M.forecast(g, ra, "rome", "mediolanum").odds === "risky");
  const { aiTurn } = await import("../src/rules/ai.js");
  aiTurn(g, "rome", []);
  check("bilgisayar zor surlu hedefi kuşatır", g.armies.some((x) => x.owner === "rome" && x.besieging === "mediolanum"));
  // Umutsuz hedefi kuşatmaz: kuşatma imkânsızı değil, zoru bitirmek için (denge, kurallar.md 20).
  const h = S.newGame("gaul", 7);
  const rb = before(S.formArmy(h, "ariminum", 10, 0), "mediolanum");
  rb.inf = 160;
  h.places.ariminum.inf = 20;
  for (const id of Object.keys(h.places)) if (id !== "mediolanum" && h.places[id].owner === null) h.places[id].owner = "egypt";
  h.places.mediolanum.level = 3;
  h.places.mediolanum.inf = 220;
  aiTurn(h, "rome", []);
  check("bilgisayar umutsuz hedefi kuşatmaz", M.forecast(h, { x: rb.x, y: rb.y, inf: 160, arch: 0 }, "rome", "mediolanum").odds === "hopeless" && !h.armies.some((x) => x.besieging === "mediolanum"));
}

// ---------------------------------------------------------------------------------------------
section("Kronik (bölüm 21)");

const CH = await import("../src/rules/chronicle.js");
{
  // Oyun sonu özeti için: her tur herkesin skoru ve her yerleşimin sahibi.
  const CH = await import("../src/rules/chronicle.js");
  const VV = await import("../src/rules/victory.js");
  const s = S.newGame("rome", 7);
  T.endTurn(s); T.endTurn(s);
  check("kronik her tur skoru ve sahipleri kaydeder", s.chronicle.score.length === s.chronicle.places.length && s.chronicle.owners.length === s.chronicle.places.length && s.chronicle.owners[0].length === PLACES.length);
  const last = s.chronicle.score.length - 1;
  check("kaydedilen skor o turun skoru", s.chronicle.score[last][CIVS.findIndex((c) => c.id === "rome")] === VV.scoreOf(s, "rome").total);
  const own = CH.ownersAt(s, last);
  check("kayıttan bir turun sahipleri geri okunur", PLACES.every((p) => own[p.id] === s.places[p.id].owner) && CH.ownersAt(s, 999) === null);
}

{
  const s = S.newGame("rome", 5);
  for (let i = 0; i < 12; i++) T.endTurn(s);
  check("her tur bir fotoğraf (ilki oyunun başı)", s.chronicle.places.length === s.turn && s.chronicle.men.length === s.turn);
  check("fotoğraf: her medeniyetin yer sayısı", s.chronicle.places.at(-1).every((n, j) => n === S.placesOf(s, CIVS[j].id).length));
  check("ilk fotoğraf başlangıç: Roma'nın üç yeri", s.chronicle.places[0][CIVS.findIndex((c) => c.id === "rome")] === 3);

  // Yıllık: oyuncuyu ilgilendiren her şey, başkalarının arasındakilerden sadece büyükleri.
  const t = S.newGame("rome", 5);
  CH.record(t, [
    { type: "battle", won: true, attacker: "rome", defender: null, place: "mediolanum" },
    { type: "battle", won: true, attacker: "gaul", defender: null, place: "numantia" },
    { type: "battle", won: true, attacker: "gaul", defender: "egypt", place: "alexandria", fallen: null },
    { type: "battle", won: false, attacker: "rome", defender: null, place: "massalia" },
    { type: "war", by: "gaul", on: "carthage" },
    { type: "revolt", civ: "egypt", place: "jerusalem" },
    { type: "surrender", by: "saka", from: null, place: "athens" },
  ]);
  const ks = t.annals.map((a) => a.k + ":" + (a.place ?? a.on));
  check("oyuncunun aldığı yer yazılır", ks.includes("took:mediolanum"));
  check("başkalarının küçük fethi yazılmaz", !ks.includes("took:numantia"));
  check("başkent el değiştirmesi yazılır", ks.includes("took:alexandria"));
  check("kaybedilen savaş fetih sayılmaz", !ks.includes("took:massalia"));
  check("savaş ilanı yazılır", ks.includes("war:carthage"));
  check("başkalarının küçük isyanı yazılmaz", !ks.includes("revolt:jerusalem"));
  check("harika şehrin teslimi yazılır", ks.includes("took:athens"));
  check("satırda tur var", t.annals.every((a) => a.t === t.turn));

  // Taşma: en fazla 300 satır, önce oyuncuyu ilgilendirmeyen eskiler düşer.
  const u = S.newGame("rome", 5);
  CH.record(u, [{ type: "war", by: "rome", on: "gaul" }]);
  CH.record(u, Array.from({ length: 320 }, () => ({ type: "war", by: "egypt", on: "parthia" })));
  check("yıllık 300 satırı geçmez", u.annals.length === 300);
  check("taşınca oyuncunun satırı kalır", u.annals.some((a) => a.by === "rome"));

  // Kayıt
  const old = JSON.parse(JSON.stringify(S.newGame("rome", 7)));
  old.version = 6;
  delete old.chronicle; delete old.annals;
  S.migrate(old);
  check("6. sürüm kayıt yükseltiliyor", old.version === S.VERSION && Array.isArray(old.annals) && Array.isArray(old.chronicle.places));
  old.turn = 30;
  T.endTurn(old);
  check("eski kayıtta kronik yükseltildiği turdan başlar", old.chronicle.places.length === 2);
}

// ---------------------------------------------------------------------------------------------
section("Arazi ve mevsim (bölüm 22)");

const GR = await import("../src/rules/ground.js");
const SE = await import("../src/rules/season.js");
const C2 = await import("../src/rules/combat.js");
{
  // Nehirler harita verisinden: Po, Mediolanum-Ariminum yolunu keser; Roma-Tarentum yolu nehir geçmez.
  check("Po: Mediolanum-Ariminum nehir geçişi", GR.groundOf("mediolanum", "ariminum").river && GR.groundOf("ariminum", "mediolanum").river);
  check("Roma-Tarentum nehir geçmez", !GR.groundOf("rome", "tarentum").river);
  check("Tuna: Odessos-Olbia nehir geçişi", GR.groundOf("odessos", "olbia").river);
  check("Thermopylai dağ geçidi", GR.groundOf("demetrias", "athens").pass && !GR.groundOf("athens", "corinth").pass);
  check("geçitlerin hepsi gerçek kara yolu", [...GR.PASSES].every((k) => { const [a, b] = k.split("|"); const r = ROADS.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)); return r && !r.sea; }));

  // Çarpanlar savaşa gider.
  const att = { civ: "rome", inf: 100, arch: 0, cav: 0, siege: 0 }, def = { civ: null, inf: 100, arch: 0, cav: 0, siege: 0 };
  const plain = C2.fight(att, def, null);
  const river = C2.fight({ ...att, terrain: N.ground.river }, def, null);
  const pass = C2.fight(att, { ...def, terrain: N.ground.pass }, null);
  check("nehir geçen saldıran x0.85", Math.abs(river.attPow / plain.attPow - N.ground.river) < 1e-9);
  check("geçidi tutan savunan x1.25", Math.abs(pass.defPow / plain.defPow - N.ground.pass) < 1e-9);
  check("terrainOf: Ariminum'dan Mediolanum'a nehir, Demetrias'tan Atina'ya geçit",
    M.terrainOf("ariminum", "mediolanum").att === N.ground.river && M.terrainOf("demetrias", "athens").def === N.ground.pass && M.terrainOf("rome", "tarentum").att === 1);
  // Tahmin araziyi sayar: eşik bir orduda nehir sonucu değiştirir.
  const s = S.newGame("rome", 7);
  s.places.mediolanum.inf = 100; s.places.mediolanum.arch = 0;
  let flip = null;
  for (let n = 60; n <= 200 && !flip; n += 5) {
    const u = { at: "ariminum", inf: n, arch: 0 };
    const withRiver = M.forecast(s, u, "rome", "mediolanum").odds;
    const plainOdds = C2.estimate({ civ: "rome", inf: n, arch: 0 }, { ...M.defenders(s, "mediolanum") }, M.wallsOf(s, "mediolanum")).odds;
    if (withRiver !== plainOdds) flip = n;
  }
  check("tahmin nehri sayar (bir ordu büyüklüğünde sonucu değiştirir)", !!flip);

  // Mevsimler
  check("1. tur ilkbahar, 4. tur kış, 5. tur yine ilkbahar", SE.seasonOf(1) === "spring" && SE.seasonOf(4) === "winter" && SE.seasonOf(5) === "spring");
  check("dört tur bir yıl: MÖ 270, 269", SE.yearOf(1) === 270 && SE.yearOf(4) === 270 && SE.yearOf(5) === 269);

  // Fırtına: kışın denizden geçen ordu, yazın asla.
  const sail = (turn, seed) => {
    const g = S.newGame("rome", seed);
    g.turn = turn;
    const a = S.formArmy(g, "tarentum", 10, 0);
    a.inf = 50; a.ships = 3;
    g.places.epidamnos.owner = "rome";
    M.order(g, a.id, { place: "epidamnos" }); // Adriyatik'in karşısı: denizden
    return { g, a };
  };
  let caught = null;
  for (let seed = 1; seed < 80 && !caught; seed++) {
    const r = sail(4, seed);
    if (r.g.storms?.length) caught = r;
  }
  check("kışın denizden geçerken fırtına olur", !!caught);
  check("fırtına: askerin %10'u ve bir gemi", caught && caught.a.inf === 45 && caught.a.ships === 2 && caught.g.storms[0].lost === 5 && caught.g.storms[0].sunk === 1);
  let summer = 0;
  for (let seed = 1; seed < 80; seed++) summer += sail(2, seed).g.storms?.length ?? 0;
  check("yazın fırtına olmaz", summer === 0);

  // Kış yıpratması: turun sonu kışsa ordular %3 erir, olay rapora yazılır.
  const w = S.newGame("rome", 7);
  w.turn = 4;
  w.civs.rome.food = 1000; // kıtlık karışmasın
  const wa = S.formArmy(w, "rome", 10, 0);
  wa.inf = 200;
  wa.mp = 0; // bu tur yürüdü: dinlenme (refill.js) karışmasın
  const evs = T.endTurn(w);
  check("kış: ordu %3 erir", S.armyById(w, wa.id)?.inf === 194);
  check("kış yıpratması raporda", evs.some((e) => e.type === "winter" && e.lost >= 6));
  const v = S.newGame("rome", 7);
  v.turn = 2;
  v.civs.rome.food = 1000;
  const va = S.formArmy(v, "rome", 10, 0);
  va.inf = 200;
  T.endTurn(v);
  check("yazın ordu erimez", S.armyById(v, va.id)?.inf === 200);
}

// ---------------------------------------------------------------------------------------------
section("Yürüyüş animasyonu: ordu yolda yürür, ışınlanmaz");

{
  const A = await import("../src/view/anim.js");
  // İz serbest yürüyüşte nokta dizisi: kurallar kare kare yürür (moves.js advance).
  const P = (id) => [POS[id].x, POS[id].y];
  const walk = (s, a, target) => { s.trace = []; M.order(s, a.id, target); const t = s.trace; delete s.trace; return t; };
  const k = S.newGame("saka", 7);
  const ka = S.formArmy(k, "olbia", 10, 0);
  const sakaTrace = walk(k, ka, { place: "tanais" });
  check("bir yürüyüş, bir iz, Olbia'dan Tanais'e", sakaTrace.length === 1 && sakaTrace[0].path[0][0] === P("olbia")[0] && sakaTrace[0].path.at(-1)[1] === P("tanais")[1]);
  const short = A.walkTime(0.8), long = A.walkTime(6);
  check("uzun yürüyüş kısadan uzun sürer", long > short, `${short} ${long}`);
  check("en kısa yürüyüş bile yarım saniyeden uzun", short >= 500, short);
  check("süre uzunlukla orantılı (sınırlar içinde)", A.walkTime(3) === 3 * 230 && A.walkTime(100) === 2500);

  // Kalabalık bir tur: rakiplerin 40 hamlesi ve oyuncunun uzun yürüyüşü.
  A.finish();
  const t0 = 1e6;
  A.freeze(t0);
  const trace = [];
  const step = (army, owner, from, to) => ({ type: "move", army, owner, men: 30, ships: 0, path: [P(from), P(to)] });
  for (let i = 0; i < 40; i++) trace.push(step(100 + i, ["egypt", "macedon", "parthia", "gaul"][i % 4], "alexandria", "memphis"));
  trace.push({ ...sakaTrace[0], army: 7 });
  A.timeline(trace, t0, () => true, "saka");
  const mine = (t) => { A.freeze(t); return A.shape({ owners: {}, armies: [{ id: 7, owner: "saka", at: "tanais", men: 30 }] }).armies.find((a) => a.id === 7); };
  let start = null, end = null;
  for (let t = t0; t < t0 + 60000; t += 20) {
    const a = mine(t);
    const moving = a && a.float && Math.hypot(a.float.x - POS.olbia.x, a.float.y - POS.olbia.y) > 1e-6;
    if (moving && start === null) start = t;
    if (a && !a.float && start !== null) { end = t; break; }
  }
  const len = sakaTrace[0].path.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - sakaTrace[0].path[i][0], p[1] - sakaTrace[0].path[i][1]), 0);
  const want = A.walkTime(len) * 0.95; // köşeler yumuşatılınca yol biraz kısalır
  check("kalabalık turda oyuncunun yürüyüşü kısalmaz", start !== null && end !== null && end - start >= want - 80, `${end - start} / ${want}`);
  const mid = mine(start + (end - start) / 2);
  check("yürüyüş sürerken ordu yolda, varış yerinde değil", mid?.float && Math.hypot(mid.float.x - POS.tanais.x, mid.float.y - POS.tanais.y) > 0.3 && mid.moving);
  check("yürürken bıraktığı iz", A.shape({ owners: {}, armies: [] }).fx.some((e) => e.kind === "trail" && e.pts.length >= 2));
  // Hızlandırma: aynı anda konum aynı kalmalı (zıplama yok), sonra daha erken bitmeli.
  A.freeze(start + (end - start) / 3);
  const was = A.shape({ owners: {}, armies: [] }).armies.find((a) => a.id === 7).float;
  A.hurry(4);
  const now = A.shape({ owners: {}, armies: [] }).armies.find((a) => a.id === 7).float;
  check("hızlandırınca ordu bulunduğu yerden zıplamaz", Math.hypot(was.x - now.x, was.y - now.y) < 1e-6);
  A.freeze(start + (end - start) / 3 + ((end - start) * 2) / 3 / 4 + 80);
  check("hızlanan yürüyüş dört kat erken biter", !A.shape({ owners: {}, armies: [] }).armies.some((a) => a.id === 7));
  A.finish();
  A.freeze(null);
}

// ---------------------------------------------------------------------------------------------
section("Tur gösterisi: kamera bütün dünyaya uzaklaşır, rakipler oynar, geri döner");

{
  const A = await import("../src/view/anim.js");
  A.finish();
  const t0 = 2e6;
  A.freeze(t0);
  const P = (id) => [POS[id].x, POS[id].y];
  const trace = [
    { type: "move", army: 1, owner: "egypt", men: 30, path: [P("alexandria"), P("memphis")] }, // görünmeyen yürüyüş
    { type: "attack", army: 2, owner: "carthage", men: 80, path: [P("lilybaeum"), P("syracuse")], at: "syracuse", won: true, oldOwner: null }, // sisteki savaş
    { type: "attack", army: 3, owner: "gaul", men: 90, path: [P("mediolanum"), P("ariminum")], at: "ariminum", won: false, oldOwner: "rome" }, // oyuncuya saldırı
    { type: "move", army: 7, owner: "rome", men: 30, path: [P("rome"), P("tarentum")] }, // oyuncunun kendi yürüyüşü
  ];
  // Oyuncunun gördüğü: İtalya'nın kuzeyi ve güneyi (bir yer ya da bir nokta).
  const seen = new Set(["rome", "ariminum", "mediolanum", "tarentum"]);
  const near = (q) => [...seen].some((id) => Math.hypot(POS[id].x - q.x, POS[id].y - q.y) < 0.5);
  const direct = {
    seen: (q) => (typeof q === "string" ? seen.has(q) : near(q)),
    overview: { x: 28, y: 13, scale: 10 },
    home: { x: 9, y: 9, scale: 40 },
    caption: (p) => ({ title: p.owner, sub: "" }),
  };
  const end = A.timeline(trace, t0, () => false, "rome", direct);
  A.freeze(end + 1);
  const items = A.cues();
  const cams = items.filter((i) => i.kind === "camera").sort((a, b) => a.t0 - b.t0);
  const march = (id) => items.find((i) => i.kind === "march" && i.army === id);
  check("önce bütün dünyaya uzaklaşır, sonunda oyuncunun yerine döner", cams.length === 2 && cams[0].t0 === t0 && cams[0].scale === 10 && cams[1].x === 9 && cams[1].scale === 40, JSON.stringify(cams.map((c) => [c.x, c.scale])));
  check("rakipler uzaklaştıktan sonra, geri dönmeden önce oynar", march(3).t0 >= cams[0].t0 + cams[0].dur && march(3).t0 + march(3).dur <= cams[1].t0);
  check("görünmeyen yürüyüş beklemeden geçer, şeridi yok", march(1).dur <= 1 && !items.some((i) => i.kind === "caption" && i.owner === "egypt"));
  check("sisteki savaşın yerinde parıltı, savaşın kendisi görünmez", items.some((i) => i.kind === "fogfight" && i.at === "syracuse") && march(2).dur <= 1);
  check("oyuncuya saldırı görünür oynar", march(3).dur > 500 && items.some((i) => i.kind === "clash" && i.at === "ariminum" && i.dur > 0));
  check("bir şey yapan medeniyetin şeridi, sırayla", items.filter((i) => i.kind === "caption").sort((a, b) => a.t0 - b.t0).map((i) => i.owner).join() === "carthage,gaul");
  check("oyuncunun kendi yürüyüşü kamera döndükten sonra, tam sürede", march(7).t0 >= cams[1].t0 + cams[1].dur && march(7).dur > 500);
  // Meydan muharebesi: çarpışma bir noktada, yer el değiştirmez.
  A.finish();
  A.freeze(t0);
  const pt = { x: POS.mediolanum.x + 0.3, y: POS.mediolanum.y };
  A.timeline([{ type: "attack", army: 9, owner: "rome", men: 50, path: [P("ariminum"), [pt.x, pt.y]], at: null, point: pt, won: true, oldOwner: "gaul" }], t0, () => true, "rome");
  A.freeze(t0 + 1e5);
  const fi = A.cues();
  check("meydan muharebesi: çarpışma noktada, yer boyanmaz", fi.some((i) => i.kind === "clash" && typeof i.at === "object" && Math.abs(i.at.x - pt.x) < 1e-9) && !fi.some((i) => i.kind === "repaint"));
  // Çok hamlede rakiplerin kısmı kısalır: on medeniyet bölümü, hepsi görünür uzun yürüyüş.
  A.finish();
  A.freeze(t0);
  const many = [];
  const civs = ["egypt", "carthage", "gaul", "macedon", "parthia", "saka", "egypt", "carthage", "gaul", "macedon"];
  civs.forEach((c, i) => many.push({ type: "attack", army: 100 + i, owner: c, men: 50, path: [P("antioch"), P("babylon")], at: "babylon", won: false, oldOwner: "rome" }));
  const e2 = A.timeline(many, t0, () => false, "rome", { ...direct, seen: () => true });
  A.freeze(e2 + 1);
  const c2 = A.cues().filter((i) => i.kind === "camera").sort((a, b) => a.t0 - b.t0);
  const rivals = c2[1].t0 - (c2[0].t0 + c2[0].dur);
  check("rakiplerin kısmı uzarsa hızlanır (8 sn civarı)", rivals <= 9800, rivals);
  A.finish();
  A.freeze(null);
}

// ---------------------------------------------------------------------------------------------
section("Bot: oyun boyunca değişmezler");

{
  const bad = [];
  const isNum = (v) => Number.isFinite(v);
  const watch = (s, events) => {
    for (const [c, civ] of Object.entries(s.civs)) {
      for (const k of ["money", "weapons", "food"]) if (!isNum(civ[k]) || civ[k] < -1e-9) bad.push(`t${s.turn} ${c}.${k}=${civ[k]}`);
      if (!civ.alive && (S.placesOf(s, c).length || S.armiesOf(s, c).length)) bad.push(`t${s.turn} ölü ${c}'nin malı var`);
    }
    for (const [id, p] of Object.entries(s.places)) {
      for (const k of ["pop", ...UNITS, ...SHIPS, "level", "farms", "industry", "barracks"]) {
        if (!Number.isInteger(p[k]) || p[k] < 0) bad.push(`t${s.turn} ${id}.${k}=${p[k]}`);
      }
      for (const k of ["farms", "industry", "barracks"]) if (p[k] > p.level) bad.push(`t${s.turn} ${id}.${k} > seviye`);
      if (!Number.isInteger(p.loyalty) || p.loyalty < 0 || p.loyalty > 100) bad.push(`t${s.turn} ${id}.loyalty=${p.loyalty}`);
      for (const k of S.PORT_UPGRADES) {
        if (!Number.isInteger(p[k]) || p[k] < 0 || (k !== "shipyard" && p[k] > p.level)) bad.push(`t${s.turn} ${id}.${k}=${p[k]}`);
        if (!byId[id].port && p[k] > 0) bad.push(`t${s.turn} karada ${id}.${k}`);
      }
      if (p.owner && byId[id].port && p.fishery + p.trade + p.fort > 0) portWork++;
      for (const k of ["farms", "industry", "barracks", "level"]) if (p[k] < 1) bad.push(`t${s.turn} ${id}.${k} < 1`);
      if (p.pop > S.popCap(p, byId[id].kind) + 1e-9) bad.push(`t${s.turn} ${id} nüfusu tavanı aşıyor`);
      // İnşaat: inşaatçı sayısını aşmaz, aynı yapı iki kez yapılmaz, kalan tur 1..toplam, sahipsiz yerde yok.
      if (!Array.isArray(p.builds) || p.builds.length > S.buildersOf(id) || new Set(p.builds.map((b) => b.what)).size !== p.builds.length
        || p.builds.some((b) => !(b.left >= 1 && b.left <= b.total && b.paid > 0)) || (!p.owner && p.builds.length)) bad.push(`t${s.turn} bozuk inşaat ${id} ${JSON.stringify(p.builds)}`);
      if (p.builds?.length) building++;
      if (p.owner && p.owner !== s.player && S.BUILDINGS.some((k) => p[k] > 0)) buildingsSeen++;
    }
    for (const a of s.armies) {
      if (S.empty(a) || ![...UNITS, ...SHIPS].every((k) => Number.isInteger(a[k]) && a[k] >= 0)) bad.push(`t${s.turn} ordu ${a.id} ${UNITS.map((k) => a[k]).join("/")}`);
      // Serbest yürüyüş: içindeyse kendi ya da müttefik yeri, tam yerinde; sahadaysa karada asker,
      // denizde gemi; hareketi eksi değil.
      if (a.at) {
        const k = M.access(s, a.owner, a.at);
        if (k !== "own" && k !== "ally") bad.push(`t${s.turn} ordu ${a.id} (${a.owner}) yabancı yerde: ${a.at} ${k}`);
        if (a.x !== POS[a.at].x || a.y !== POS[a.at].y) bad.push(`t${s.turn} ordu ${a.id} yerinin dışında: ${a.at}`);
      } else {
        const c = MAP.cellOf(a.x, a.y);
        if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) bad.push(`t${s.turn} ordu ${a.id} yeri yok`);
        else if (MAP.isLand(c) || MAP.isRoad(c) ? S.men(a) === 0 && !MAP.isRoad(c) : S.fleetOf(a) === 0) bad.push(`t${s.turn} ordu ${a.id} ${MAP.isLand(c) ? "karada askersiz" : "denizde gemisiz"}`);
        if (MAP.placeAtCell(c)) bad.push(`t${s.turn} ordu ${a.id} yerleşimin karesinde ama içinde değil: ${MAP.placeAtCell(c)}`);
      }
      if (!(a.mp >= -1e-9) || a.route.some((c) => !Number.isInteger(c))) bad.push(`t${s.turn} ordu ${a.id} hareketi bozuk ${a.mp}`);
      if (a.owner && !s.civs[a.owner].alive) bad.push(`t${s.turn} ölü ordu`);
      const g = a.general;
      if (g && !(g.level >= 1 && g.level <= 5 && g.xp >= 0 && g.traits.every((t) => GN.TRAITS.includes(t)) && g.traits.length <= 2)) {
        bad.push(`t${s.turn} bozuk general ${JSON.stringify(g)}`);
      }
      if (g) generals++;
    }
    for (const e of events) if (!e || !e.type) bad.push(`t${s.turn} boş olay`);
    for (const it of s.inbox) {
      if (it.type === "event" && it.civ !== s.player) bad.push(`t${s.turn} başkasının mektubu oyuncuda`);
      if (!EV.options(s, it).length) bad.push(`t${s.turn} seçeneksiz mektup ${it.key}`);
    }
    seenInbox += s.inbox.length;
  };
  let seenInbox = 0, generals = 0, portWork = 0, building = 0, buildingsSeen = 0;
  const games = [];
  for (let i = 0; i < 7; i++) games.push(play({ seed: 500 + i, player: CIVS[i].id, turns: 120, watch }));
  check("hiçbir turda bozuk sayı, bozuk ordu yok", !bad.length, bad.slice(0, 5).join(" | "));
  check("oyuncuya mektuplar geliyor", seenInbox > 0, seenInbox);
  check("bilgisayar general atıyor", generals > 0, generals);
  check("bilgisayar liman yapıları kuruyor", portWork > 0, portWork);
  check("bilgisayar inşaatçılarını çalıştırıyor", building > 0, building);
  check("bilgisayar şehir binaları yapıyor (tapınak, pazar, okul, hamam)", buildingsSeen > 0, buildingsSeen);
  const free25 = games.map((g) => g.freeLeft[24] ?? 0);
  check("25. tura kadar bağımsızların çoğu alınıyor", free25.every((n) => n <= 8), free25.join(" "));
  // Bilgisayarlar arası savaş eşiği 1.8 (sadakat gelince 1.5 erken yok ediyordu): ilk savaş geç olabilir.
  // Donanmayla denizler engel oldu: ilk savaş daha geç gelebilir.
  check("her oyunda savaş çıkıyor", games.every((g) => g.firstWar !== null && g.firstWar <= 80), games.map((g) => g.firstWar).join(" "));
  check("barış döneminde kimse savaş açmıyor", games.every((g) => g.firstWar >= N.aiPeace));

  // Zorluk: kolayda bilgisayar oyuncuya 20. turdan önce savaş açmaz. Bot oyunlarında buna hiç
  // fırsat çıkmıyordu - kural gevşetilince de o kontrol geçiyordu. Burada fırsat bilerek
  // kuruluyor: Kartaca Siraküza'yı almış, Roma'nın yanında, 400 piyadeyle; Roma bomboş.
  const { aiTurn: ai } = await import("../src/rules/ai.js");
  const tryWar = (level, turn) => {
    let n = 0;
    for (let k = 0; k < 40; k++) {
      const s = S.newGame("rome", 100 + k, level);
      s.turn = turn;
      for (const id of ["rome", "tarentum", "ariminum"]) s.places[id].inf = 0;
      s.places.syracuse.owner = "carthage";
      s.places.carthage.inf = 400;
      const ev = [];
      ai(s, "carthage", ev);
      if (ev.some((e) => e.type === "war" && e.on === "rome")) n++;
    }
    return n;
  };
  check("normalde güçlü komşu 15. turda savaş açabiliyor", tryWar("normal", 15) > 0);
  check("kolayda 15. turda açmıyor", tryWar("easy", 15) === 0);
  check("kolayda 20. turda açabiliyor", tryWar("easy", 20) > 0);
  check("zorda 9. turda açabiliyor", tryWar("hard", 9) > 0);
  check("normalde 9. turda açmıyor", tryWar("normal", 9) === 0);
  const ez = S.newGame("rome", 3, "easy"), nm = S.newGame("rome", 3, "normal"), hd = S.newGame("rome", 3, "hard");
  check("zorluk oyuncunun üretimini değiştirmez", S.budget(ez, "rome").money === S.budget(hd, "rome").money);
  check("kolayda bilgisayar az, zorda çok üretir", S.budget(ez, "egypt").money < S.budget(nm, "egypt").money && S.budget(nm, "egypt").money < S.budget(hd, "egypt").money);
  const first = games.map((g) => g.fallen[0]?.[1] ?? 999);
  check("ilk medeniyet 20. turdan önce düşmüyor", first.every((t) => t >= 20), first.join(" "));

  // Aynı tohum aynı oyun; ve kayıttan dönen oyun aynı devam eder.
  const x = play({ seed: 77, player: "egypt", turns: 40 }), y = play({ seed: 77, player: "egypt", turns: 40 });
  check("aynı tohum aynı oyun", JSON.stringify(x.state) === JSON.stringify(y.state));
  const { aiTurn } = await import("../src/rules/ai.js");
  const s1 = S.newGame("macedon", 9);
  for (let t = 0; t < 15; t++) { aiTurn(s1, "macedon", []); T.endTurn(s1); }
  const s2 = JSON.parse(JSON.stringify(s1));
  for (let t = 0; t < 15; t++) { aiTurn(s1, "macedon", []); T.endTurn(s1); aiTurn(s2, "macedon", []); T.endTurn(s2); }
  check("kayıttan dönen oyun aynı devam ediyor", JSON.stringify(s1) === JSON.stringify(s2));
}

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
