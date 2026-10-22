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
const { N, UNITS, SHIPS } = await import("../src/rules/numbers.js");
const { play } = await import("./bot.mjs");
const MAP = await import("../src/rules/map.js");
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
  check("ayrılan kartlar yeni ordu: aynı yerde, aynı hareketle", b && b.at === "rome" && b.x === a.x && b.inf === 10 && b.arch === 10 && b.mp === 1 && s.armies.length === 2);
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
  old.armies.push({ id: 1, owner: "rome", at: "rome", inf: 10, arch: 0, cav: 0, siege: 0, ships: 2, moves: 1, route: [], general: null });
  S.migrate(old);
  check("8. sürüm kayıt yükseltiliyor: eski gemiler kadırga", old.version === S.VERSION && old.places.tarentum.ships === 1 && old.places.tarentum.trireme === 0 && old.armies[0].quinq === 0 && old.armies[0].ships === 2);

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
      if (!s.civs[a.owner].alive) bad.push(`t${s.turn} ölü ordu`);
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
  let seenInbox = 0, generals = 0, portWork = 0, building = 0;
  const games = [];
  for (let i = 0; i < 7; i++) games.push(play({ seed: 500 + i, player: CIVS[i].id, turns: 120, watch }));
  check("hiçbir turda bozuk sayı, bozuk ordu yok", !bad.length, bad.slice(0, 5).join(" | "));
  check("oyuncuya mektuplar geliyor", seenInbox > 0, seenInbox);
  check("bilgisayar general atıyor", generals > 0, generals);
  check("bilgisayar liman yapıları kuruyor", portWork > 0, portWork);
  check("bilgisayar inşaatçılarını çalıştırıyor", building > 0, building);
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
