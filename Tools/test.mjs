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
section("Yeni oyun (sade kurallar)");

const S = await import("../src/rules/state.js");
const C = await import("../src/rules/combat.js");
const M = await import("../src/rules/moves.js");
const D = await import("../src/rules/diplomacy.js");
const T = await import("../src/rules/turn.js");
const { N, UNITS, trait } = await import("../src/rules/numbers.js");
const { play } = await import("./bot.mjs");
const { roadBetween } = await import("../src/rules/graph.js");

{
  const s = S.newGame("rome", 7);
  check("herkes 40 altın, 20 yemekle başlar", CIVS.every((c) => s.civs[c.id].money === 40 && s.civs[c.id].food === 20));
  check("başkent 2. seviye, öteki yerler 1.", s.places.rome.level === 2 && s.places.tarentum.level === 1 && s.places.ariminum.level === 1);
  check("başkentte 40, şehirde ve kalede 20 piyade", s.places.rome.inf === 40 && s.places.tarentum.inf === 20 && s.places.ariminum.inf === 20);
  check("büyük bağımsız şehir 3. seviye, 60 piyade 20 okçu", s.places.syracuse.level === 3 && s.places.syracuse.inf === 60 && s.places.syracuse.arch === 20);
  check("liman başkentinde 2 gemi, öteki limanda 1, karada yok", s.places.rome.ships === 2 && s.places.tarentum.ships === 1 && s.places.ariminum.ships === 0);
  check("silah, nüfus, sadakat yok", !("weapons" in s.civs.rome) && !("pop" in s.places.rome) && !("loyalty" in s.places.rome));
  check("kayıt sürümü 8", s.version === 8 && S.VERSION === 8);
}

// ---------------------------------------------------------------------------------------------
section("Gelir ve gider");

{
  const s = S.newGame("rome", 7);
  const o = S.output(s, "rome");
  check("2. seviye liman başkenti: 6 altın, 8 yemek", o.money === 6 && o.food === 8);
  const c = S.output(s, "ariminum");
  check("kale yarısını üretir: 1.25 altın, 1.5 yemek", c.money === 1.25 && c.food === 1.5);
  check("Mısır yemeği x1.3", Math.abs(S.output(s, "alexandria").food - 8 * 1.3) < 1e-9);
  check("Kartaca altını x1.25", Math.abs(S.output(s, "carthage").money - 6 * 1.25) < 1e-9);
  const b = S.budget(s, "rome");
  check("bakım: bölük başına 1 yemek (80 asker = 8)", b.upkeep === 8 && Math.abs(b.food - (8 + 5 + 1.5 - 8)) < 1e-9);
  check("süvari bölüğü 2 yemek, piyade ve okçu 1", S.upkeepOf({ cav: 10 }) === 2 && S.upkeepOf({ inf: 10, arch: 10 }) === 2);
  s.civs.rome.food = 0;
  s.places.rome.inf = 1000;
  const ev = [];
  T.economy(s, ev);
  check("yemek biterse her birlikten onda biri ölür", s.places.rome.inf === 900 && ev.some((e) => e.type === "famine" && e.civ === "rome") && s.civs.rome.food === 0);
}

// ---------------------------------------------------------------------------------------------
section("Geliştirme, asker, gemi");

{
  const s = S.newGame("rome", 7);
  s.civs.rome.money = 1000;
  check("geliştirme: yeni seviye x 20 altın", S.upgradeInfo(s, "rome").cost === 60);
  const before = S.output(s, "rome").money;
  check("geliştir: seviye +1, turda bir kere", S.upgrade(s, "rome") && s.places.rome.level === 3 && S.upgradeInfo(s, "rome").why === "done" && !S.upgrade(s, "rome"));
  check("geliştirince gelir artar", S.output(s, "rome").money > before && s.civs.rome.money === 940);
  s.places.tarentum.level = 5;
  s.places.ariminum.level = 3;
  check("şehir en çok 5, kale en çok 3", S.upgradeInfo(s, "tarentum").why === "max" && S.upgradeInfo(s, "ariminum").why === "max");
  const p = S.newGame("rome", 7);
  p.civs.rome.money = 10;
  check("parası yetmiyorsa geliştirilmez", S.upgradeInfo(p, "rome").why === "money" && !S.upgrade(p, "rome"));

  const t = S.newGame("rome", 7);
  check("asker: turda seviye kadar bölük (başkent 2)", S.recruit(t, "rome", "inf") && S.recruit(t, "rome", "arch") && !S.recruit(t, "rome", "cav") && S.recruitInfo(t, "rome", "inf").why === "done");
  check("piyade 6, okçu 8 altın", t.civs.rome.money === 40 - 6 - 8);
  check("basılan bölük garnizona girer", t.places.rome.inf === 50 && t.places.rome.arch === 10);
  check("süvari 12 altın", S.recruitCost("rome", "cav") === 12);
  t.civs.rome.money = 5;
  check("parası yetmiyorsa basılmaz", S.recruitInfo(t, "tarentum", "inf").why === "money" && !S.recruit(t, "tarentum", "inf"));
  check("Galyalıların askeri ucuz", S.recruitCost("gaul", "inf") === 4.5);
  T.endTurn(t);
  check("tur sonunda haklar yenilenir", t.places.rome.recruited === 0 && !t.places.rome.upgraded);

  const g = S.newGame("rome", 7);
  g.civs.rome.money = 100;
  check("gemi: limanda, 15 altın, turda bir", S.buildShip(g, "tarentum") && g.places.tarentum.ships === 2 && g.civs.rome.money === 85 && !S.buildShip(g, "tarentum"));
  check("karada gemi yapılmaz", S.shipInfo(g, "ariminum").why === "notPort");
  check("Kartaca gemisi yarı fiyat", S.shipInfo(S.newGame("carthage", 1), "carthage").cost === 7.5);
}

// ---------------------------------------------------------------------------------------------
section("Savaş: sayılar, üçgen, sur");

{
  const side = (civ, inf, arch, cav) => ({ civ, inf, arch, cav });
  check("çok olan kazanır", C.fight(side(null, 100, 0, 0), side(null, 50, 0, 0), false).attWins);
  check("eşitlikte savunan kazanır", !C.fight(side(null, 100, 0, 0), side(null, 100, 0, 0), false).attWins);
  check("piyade süvariyi yener (saldırırken de savunurken de)", C.fight(side(null, 100, 0, 0), side(null, 0, 0, 100), false).attWins && !C.fight(side(null, 0, 0, 100), side(null, 100, 0, 0), false).attWins);
  check("süvari okçuyu yener", C.fight(side(null, 0, 0, 100), side(null, 0, 100, 0), false).attWins);
  check("okçu piyadeyi yener", C.fight(side(null, 0, 100, 0), side(null, 100, 0, 0), false).attWins);
  check("üçgen: yendiği türe karşı x1.5", C.power(side(null, 100, 0, 0), side(null, 0, 0, 100)) === 150 && C.power(side(null, 100, 0, 0), side(null, 100, 0, 0)) === 100);
  const plain = C.power(side(null, 100, 0, 0), side(null, 100, 0, 0), { defending: true });
  check("sur savunanı x1.5 güçlendirir", C.power(side(null, 100, 0, 0), side(null, 100, 0, 0), { defending: true, walls: true }) === plain * 1.5);
  check("surlara saldıran süvari yarı güç", C.power(side(null, 0, 0, 100), side(null, 100, 0, 0), { walls: true }) === 0.5 * C.power(side(null, 0, 0, 100), side(null, 100, 0, 0)));
  check("Roma piyadesi x1.25", C.power(side("rome", 100, 0, 0), side(null, 100, 0, 0)) === 125);
  check("Makedonya savunmada x1.25", C.power(side("macedon", 100, 0, 0), side(null, 100, 0, 0), { defending: true }) === 125 && C.power(side("macedon", 100, 0, 0), side(null, 100, 0, 0)) === 100);
  const r = C.fight(side(null, 200, 0, 0), side(null, 100, 0, 0), false);
  check("kaybedenin hepsi düşer, kazanan güç oranının karesi kadar kayıp verir", r.attWins && r.def.inf === 0 && r.att.inf === 200 - Math.round(200 * 0.25 * N.winnerLoss));
  check("tahmin: 200'e 100 kolay, 105'e 100 riskli, 50'ye 100 umutsuz",
    C.estimate(side(null, 200, 0, 0), side(null, 100, 0, 0), false).odds === "easy"
    && C.estimate(side(null, 105, 0, 0), side(null, 100, 0, 0), false).odds === "risky"
    && C.estimate(side(null, 50, 0, 0), side(null, 100, 0, 0), false).odds === "hopeless");
}

// ---------------------------------------------------------------------------------------------
section("Hareket, saldırı, diplomasi");

{
  const s = S.newGame("rome", 7);
  check("sur: başkent, kale ve 3. seviye şehir", S.walled(s, "rome") && S.walled(s, "ariminum") && !S.walled(s, "tarentum") && (s.places.tarentum.level = 3, S.walled(s, "tarentum")));
  s.places.tarentum.level = 1;
  const a = S.formArmy(s, "rome", 20, 0);
  check("ordu çıkar: garnizondan düşer", a && s.places.rome.inf === 20 && a.moves === 1);
  check("turda bir yol yürür", M.order(s, a.id, "ariminum") === 1 && a.at === "ariminum" && a.moves === 0);
  check("tarafsız medeniyetin yerine yol yok", M.routeTo(s, a, "bibracte") === null);
  const k = S.newGame("saka", 7);
  const sa = S.formArmy(k, "olbia", 10, 0);
  check("Sakalar turda iki yol yürür", sa.moves === 2 && M.order(k, sa.id, "tanais") === 2 && sa.at === "tanais");

  // Deniz yolu gemi ister: bir gemi 50 asker.
  const m = S.newGame("rome", 7);
  m.places.epidamnos.owner = "rome";
  const f = S.formArmy(m, "tarentum", 20, 0);
  check("gemisiz ordu denizi geçemez", roadBetween("tarentum", "epidamnos").sea && M.routeTo(m, f, "epidamnos") === null && M.needsShips(m, f, "epidamnos"));
  f.ships = 1;
  check("bir gemi 50 askeri taşır: deniz yolu açılır", S.canSail(f) && M.order(m, f.id, "epidamnos") === 1);
  f.inf = 60;
  check("60 askere bir gemi yetmez", !S.canSail(f));
  const st = S.newGame("rome", 7);
  const boat = S.formArmy(st, "tarentum", 10, 0, 0, 1);
  boat.at = "ariminum";
  check("gemisi olan ordu karada garnizona katılamaz (gemi karada durmaz)", !S.station(st, boat.id) && st.places.ariminum.ships === 0);
  boat.at = "rome";
  check("limanda katılır, gemisi limana", S.station(st, boat.id) && st.places.rome.ships === 3 && st.places.rome.inf === 50);

  // Saldırı: kazanırsa yer onun, ordu içeri; kaybederse ordu yok.
  const w = S.newGame("rome", 7);
  const big = S.formArmy(w, "ariminum", 10, 0);
  big.inf = 300;
  check("Mediolanum (bağımsız) saldırılabilir", M.canAttack(w, big, "mediolanum"));
  const ev = M.attack(w, big.id, "mediolanum", [1, 1]);
  check("kazanan yeri alır, ordu içeri girer", ev.won && w.places.mediolanum.owner === "rome" && big.at === "mediolanum" && w.places.mediolanum.inf === 0);
  check("alınan yer o tur geliştirilmez, asker basılmaz", w.places.mediolanum.upgraded && S.recruitInfo(w, "mediolanum", "inf").why === "done");
  const l = S.newGame("rome", 7);
  l.places.mediolanum.inf = 100;
  const small = S.formArmy(l, "ariminum", 10, 0);
  small.inf = 80;
  const lost = M.attack(l, small.id, "mediolanum", [1, 1]);
  check("kaybeden saldıran yok olur, savunan kayıp verir", !lost.won && !S.armyById(l, small.id) && l.places.mediolanum.inf < 100 && l.places.mediolanum.inf > 50);
  check("hareketi bitmiş ordu saldıramaz", (big.moves = 0, !M.canAttack(w, big, "massalia")));

  // Denizden alınan limanın gemileri yanar.
  const n = S.newGame("rome", 7);
  const fleet = S.formArmy(n, "tarentum", 10, 0);
  fleet.inf = 500; fleet.ships = 10;
  const sv = M.attack(n, fleet.id, "syracuse", [1, 1]);
  check("limanı alınca gemileri yanar", sv.won && n.places.syracuse.owner === "rome" && n.places.syracuse.ships === 0);

  // Son yerini kaybeden medeniyet çıkar.
  const e = S.newGame("rome", 7);
  for (const id of S.placesOf(e, "gaul")) if (id !== "gergovia") e.places[id].owner = null;
  e.relations[S.key("rome", "gaul")] = "war";
  M.capture(e, "gergovia", "rome");
  check("son yerini kaybeden medeniyet oyundan çıkar", !e.civs.gaul.alive && S.relation(e, "rome", "gaul") === "neutral");

  // Diplomasi
  const d = S.newGame("rome", 7);
  check("savaş ilanı", D.declareWar(d, "rome", "gaul")?.type === "war" && S.relation(d, "rome", "gaul") === "war");
  check("aynı tur ikinci kez ilan edilmez", D.declareWar(d, "rome", "gaul") === null);
  const g = S.formArmy(d, "bibracte", 10, 0);
  g.at = "mediolanum";
  d.places.mediolanum.owner = "gaul";
  check("tehdit: yanında düşman ordusu", M.menace(d, "ariminum") === 10);
  const x = S.newGame("rome", 7);
  x.relations[S.key("rome", "gaul")] = "ally";
  const visitor = S.formArmy(x, "rome", 10, 0);
  visitor.at = "bibracte";
  D.breakAlliance(x, "rome", "gaul");
  check("ittifak bozulunca ordu evine döner", visitor.at !== "bibracte" && S.placesOf(x, "rome").includes(visitor.at));
}

// ---------------------------------------------------------------------------------------------
section("Eski (detaylı) kayıt sade kurallara döner");

{
  const old = JSON.parse(JSON.stringify(S.newGame("rome", 7)));
  old.version = 7;
  for (const c of Object.values(old.civs)) c.weapons = 12;
  for (const p of Object.values(old.places)) Object.assign(p, { pop: 75, loyalty: 80, farms: 2, industry: 1, barracks: 1, siege: 10, fishery: 1, trade: 0, fort: 0, shipyard: 1, games: false });
  old.places.ariminum.level = 5;
  old.armies = [{ id: 1, owner: "rome", at: "rome", inf: 30, arch: 0, cav: 10, siege: 20, ships: 0, moves: 1, route: [], general: { name: "x", level: 2 }, besieging: "mediolanum" }];
  old.inbox = [{ id: 1 }]; old.missions = [{ id: 2 }]; old.mrng = 5;
  S.migrate(old);
  check("sürüm 8'e çıkar", old.version === 8);
  check("silah, nüfus, sadakat, liman yapıları gider", !("weapons" in old.civs.rome) && !("pop" in old.places.rome) && !("loyalty" in old.places.rome) && !("fishery" in old.places.rome));
  check("kuşatma makineleri piyadeye döner", old.places.rome.inf === 40 + 10 && old.armies[0].inf === 50 && !("siege" in old.armies[0]));
  check("ordunun generali ve kuşatması gider", !("general" in old.armies[0]) && !("besieging" in old.armies[0]));
  check("kalenin seviyesi sınıra çekilir", old.places.ariminum.level === 3);
  check("mektuplar ve görevler gider", !("inbox" in old) && !("missions" in old));
  T.endTurn(old);
  check("dönen eski oyun sade kurallarla oynar", old.turn === 2 && Number.isFinite(old.civs.rome.money));
}

// ---------------------------------------------------------------------------------------------
section("Yürüyüş animasyonu: ordu yolda yürür, ışınlanmaz");

{
  const A = await import("../src/view/anim.js");
  const { roadLength, placeAt } = await import("../src/view/draw.js");
  const step = (army, owner, from, to) => ({ type: "move", army, owner, men: 30, from, to });
  const short = A.legTime("olbia", "neapolis"), long = A.legTime("antioch", "babylon");
  check("uzun yol kısa yoldan uzun sürer", long > short, `${short} ${long}`);
  check("en kısa yol bile yarım saniyeden uzun", short >= 500, short);
  check("süre yolun uzunluğuyla orantılı (sınırlar içinde)", Math.abs(A.legTime("rome", "ariminum") - Math.max(520, Math.min(1500, roadLength("rome", "ariminum") * 230))) < 1e-9);

  // Kalabalık bir tur: rakiplerin 40 hamlesi ve oyuncunun 2 yollu yürüyüşü.
  A.finish();
  const t0 = 1e6;
  A.freeze(t0);
  const trace = [];
  // Dört medeniyet sırayla: her biri ayrı bölüm, toplam süreyi aşarlar ve sıkıştırılırlar.
  for (let i = 0; i < 40; i++) trace.push(step(100 + i, ["egypt", "macedon", "parthia", "gaul"][i % 4], "alexandria", "memphis"));
  trace.push(step(7, "saka", "olbia", "neapolis"), step(7, "saka", "neapolis", "tanais"));
  A.timeline(trace, t0, () => true, "saka");
  const mine = (t) => { A.freeze(t); return A.shape({ owners: {}, armies: [{ id: 7, owner: "saka", at: "tanais", men: 30 }] }).armies.find((a) => a.id === 7); };
  // Oyuncunun yürüyüşü ne zaman başlıyor: rakiplerinkinden sonra. İlk görüldüğü andan bitişine.
  let start = null, end = null;
  for (let t = t0; t < t0 + 60000; t += 20) {
    const a = mine(t);
    const moving = a && a.float && Math.hypot(a.float.x - placeAt("olbia").x, a.float.y - placeAt("olbia").y) > 1e-6;
    if (moving && start === null) start = t;
    if (a && !a.float && start !== null) { end = t; break; }
  }
  const want = A.legTime("olbia", "neapolis") + A.legTime("neapolis", "tanais");
  check("kalabalık turda oyuncunun yürüyüşü kısalmaz", start !== null && end !== null && end - start >= want - 60, `${end - start} / ${want}`);
  const mid = mine(start + want / 2);
  check("yürüyüş sürerken ordu yolda, varış yerinde değil", mid?.float && Math.hypot(mid.float.x - placeAt("tanais").x, mid.float.y - placeAt("tanais").y) > 0.3);
  // Hızlandırma: aynı anda konum aynı kalmalı (zıplama yok), sonra daha erken bitmeli.
  A.freeze(start + want / 3);
  const before = A.shape({ owners: {}, armies: [] }).armies.find((a) => a.id === 7).float;
  A.hurry(4);
  const after = A.shape({ owners: {}, armies: [] }).armies.find((a) => a.id === 7).float;
  check("hızlandırınca ordu bulunduğu yerden zıplamaz", Math.hypot(before.x - after.x, before.y - after.y) < 1e-6);
  A.freeze(start + want / 3 + (want * 2) / 3 / 4 + 50);
  check("hızlanan yürüyüş dört kat erken biter", !A.shape({ owners: {}, armies: [] }).armies.some((a) => a.id === 7));
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
      for (const k of ["money", "food"]) if (!isNum(civ[k]) || civ[k] < -1e-9) bad.push(`t${s.turn} ${c}.${k}=${civ[k]}`);
      if (!civ.alive && (S.placesOf(s, c).length || S.armiesOf(s, c).length)) bad.push(`t${s.turn} ölü ${c}'nin malı var`);
    }
    for (const [id, p] of Object.entries(s.places)) {
      for (const k of [...UNITS, "ships", "level", "recruited", "built"]) if (!Number.isInteger(p[k]) || p[k] < 0) bad.push(`t${s.turn} ${id}.${k}=${p[k]}`);
      const max = byId[id].kind === "castle" ? N.maxCastle : N.maxCity;
      if (p.level < 1 || p.level > max) bad.push(`t${s.turn} ${id} seviye ${p.level}`);
      if (p.recruited > p.level) bad.push(`t${s.turn} ${id} hakkından çok asker`);
      if (!byId[id].port && p.ships > 0) bad.push(`t${s.turn} karada gemi ${id}`);
    }
    for (const a of s.armies) {
      if (S.empty(a) || !Number.isInteger(a.ships) || a.ships < 0 || !UNITS.every((k) => Number.isInteger(a[k]) && a[k] >= 0)) bad.push(`t${s.turn} ordu ${a.id} ${UNITS.map((k) => a[k]).join("/")}`);
      const k = M.access(s, a.owner, a.at);
      if (k !== "own" && k !== "ally") bad.push(`t${s.turn} ordu ${a.id} (${a.owner}) yabancı yerde: ${a.at} ${k}`);
      if (!s.civs[a.owner].alive) bad.push(`t${s.turn} ölü ordu`);
    }
    for (const e of events) if (!e || !e.type) bad.push(`t${s.turn} boş olay`);
  };
  const games = [];
  for (let i = 0; i < 7; i++) games.push(play({ seed: 500 + i, player: CIVS[i].id, turns: 120, watch }));
  check("hiçbir turda bozuk sayı, bozuk ordu yok", !bad.length, bad.slice(0, 5).join(" | "));
  const free25 = games.map((g) => g.freeLeft[24] ?? 0);
  check("25. tura kadar bağımsızların çoğu alınıyor", free25.every((n) => n <= 10), free25.join(" "));
  check("her oyunda savaş çıkıyor", games.every((g) => g.firstWar !== null && g.firstWar <= 80), games.map((g) => g.firstWar).join(" "));
  check("barış döneminde kimse savaş açmıyor", games.every((g) => g.firstWar >= N.aiPeace));
  check("bilgisayar gemi yapıp denizi geçiyor", games.some((g) => g.state.armies.some((a) => a.ships > 0) || Object.values(g.state.places).some((p) => p.ships > 2)));

  // Zorluk: kolayda bilgisayar oyuncuya 20. turdan önce savaş açmaz. Fırsat bilerek kuruluyor:
  // Kartaca Siraküza'yı almış, Roma'nın yanında, 400 piyadeyle; Roma bomboş.
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
  check("zorluk oyuncunun gelirini değiştirmez", S.budget(ez, "rome").money === S.budget(hd, "rome").money);
  check("kolayda bilgisayar az, zorda çok üretir", S.budget(ez, "egypt").money < S.budget(nm, "egypt").money && S.budget(nm, "egypt").money < S.budget(hd, "egypt").money);
  const first = games.map((g) => g.fallen[0]?.[1] ?? 999);
  check("ilk medeniyet 20. turdan önce düşmüyor", first.every((t) => t >= 20), first.join(" "));

  // Aynı tohum aynı oyun; ve kayıttan dönen oyun aynı devam eder.
  const x = play({ seed: 77, player: "egypt", turns: 40 }), y = play({ seed: 77, player: "egypt", turns: 40 });
  check("aynı tohum aynı oyun", JSON.stringify(x.state) === JSON.stringify(y.state));
  const s1 = S.newGame("macedon", 9);
  for (let t = 0; t < 15; t++) { ai(s1, "macedon", []); T.endTurn(s1); }
  const s2 = JSON.parse(JSON.stringify(s1));
  for (let t = 0; t < 15; t++) { ai(s1, "macedon", []); T.endTurn(s1); ai(s2, "macedon", []); T.endTurn(s2); }
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
