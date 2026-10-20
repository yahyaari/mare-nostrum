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
section("Yeni oyun (kurallar.md bölüm 4)");

const S = await import("../src/rules/state.js");
const C = await import("../src/rules/combat.js");
const M = await import("../src/rules/moves.js");
const D = await import("../src/rules/diplomacy.js");
const T = await import("../src/rules/turn.js");
const { N } = await import("../src/rules/numbers.js");
const { play } = await import("./bot.mjs");

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
  check("Makedonya nüfusu x0.8", s.places.pella.pop === 120, s.places.pella.pop);
  check("bütün yapılar 1", Object.values(s.places).every((p) => p.industry === 1 && p.farms === 1 && p.barracks === 1));
  // Elle hesaplandı: para (150+75+38)/20 = 13.15; silah 1+1+0.5; yiyecek Roma 4 + Tarentum 4+1
  // balık + Ariminum 2 = 11, eksi 6 bölük = 5.
  const b = S.budget(s, "rome");
  check("Roma'nın turluk parası 13.15", Math.abs(b.money - 13.15) < 1e-9, b.money);
  check("Roma'nın turluk silahı 2.5", b.weapons === 2.5, b.weapons);
  check("Roma'nın turluk yiyeceği +5", b.food === 5, `${b.food} (bakım ${b.upkeep})`);
  for (const c of CIVS) check(`${c.id}: başlangıçta yiyecek artıda`, S.budget(s, c.id).food > 0, S.budget(s, c.id).food);
}

// ---------------------------------------------------------------------------------------------
section("Yükseltme ve asker");

{
  const s = S.newGame("rome", 7);
  s.civs.rome.money = 100;
  check("tarla 1->2: 20 para", S.upgradeInfo(s, "rome", "farms").cost === 20);
  check("şehir seviyesi 2->3: 60 para", S.upgradeInfo(s, "rome", "level").cost === 60);
  check("yapı şehir seviyesini geçemez", S.upgradeInfo(s, "tarentum", "farms").why === "needLevel");
  check("yükseltme yapılıyor", S.upgrade(s, "rome", "farms") && s.places.rome.farms === 2 && s.civs.rome.money === 80);
  check("turda bir yükseltme", S.upgradeInfo(s, "rome", "industry").why === "done");
  s.civs.rome.money = 5;
  check("parası yetmeyen yükseltemez", S.upgradeInfo(s, "tarentum", "level").why === "money");
  check("kale en fazla seviye 3", (s.places.ariminum.level = 3, S.upgradeInfo(s, "ariminum", "level").why === "max"));

  const t = S.newGame("gaul", 7);
  const before = { ...t.civs.gaul }, pop = t.places.bibracte.pop;
  check("okçu için kışla 2 gerek", S.recruitInfo(t, "bibracte", "arch").why === "needBarracks");
  check("piyade basılıyor", S.recruit(t, "bibracte", "inf"));
  check("Galyalılar bölük için para vermez", t.civs.gaul.money === before.money);
  check("bölük 1 silah 1 yiyecek", t.civs.gaul.weapons === before.weapons - 1 && t.civs.gaul.food === before.food - 1);
  check("nüfustan 10 kişi", t.places.bibracte.pop === pop - 10 && t.places.bibracte.inf === 40);
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
section("Hareket ve diplomasi (bölüm 6, 8)");

{
  const s = S.newGame("rome", 7);
  const a = S.formArmy(s, "rome", 30, 0);
  check("ordu kuruluyor, garnizon boşalıyor", a && s.places.rome.inf === 0);
  check("tarafsız toprağa girilemez", M.access(s, "rome", "carthage") === null && M.routeTo(s, a, "carthage") === null);
  check("bağımsıza saldırılır", M.access(s, "rome", "mediolanum") === "free");
  check("bir turda bir yol", M.order(s, a.id, "mediolanum") === 1 && a.at === "ariminum" && a.moves === 0);
  check("hareketi bitmiş ordu saldıramaz", !M.canAttack(s, a, "mediolanum"));
  M.refresh(s, "rome");
  const big = S.formArmy(s, "tarentum", 20, 0);
  a.inf = 200;
  const ev = M.attack(s, a.id, "mediolanum", [1, 1]);
  check("saldırı kazanılıyor, yer el değiştiriyor", ev?.won && s.places.mediolanum.owner === "rome" && a.at === "mediolanum");
  check("alınan yerin nüfusunun dörtte biri kaçar", s.places.mediolanum.pop === Math.round(150 * 0.75), s.places.mediolanum.pop);
  check("kaybeden ordu yok olur", (() => {
    big.inf = 5;
    M.attack(s, big.id, "syracuse", [1, 1]);
    return !S.armyById(s, big.id);
  })());

  // Sakalar: iki yol.
  const k = S.newGame("saka", 7);
  const sa = S.formArmy(k, "olbia", 10, 0);
  check("Saka ordusu turda iki yol yürür", M.order(k, sa.id, "tanais") === 2 && sa.at === "tanais");

  // Diplomasi: tarafsız -> müttefik -> bozuluyor -> o tur savaş yok -> ertesi tur var.
  const d = S.newGame("rome", 7);
  d.relations[S.key("rome", "gaul")] = "ally";
  const g = S.formArmy(d, "rome", 20, 0);
  check("müttefik toprağından geçilir", M.access(d, "rome", "bibracte") === "ally");
  g.at = "gergovia";
  check("ittifak bozuluyor", D.breakAlliance(d, "rome", "gaul")?.type === "broke" && S.relation(d, "rome", "gaul") === "neutral");
  check("bozulunca ordu evine döner", S.placesOf(d, "rome").includes(g.at), g.at);
  check("ittifakın bozulduğu tur savaş ilan edilemez", D.declareWar(d, "rome", "gaul") === null);
  d.turn++;
  check("ertesi tur edilir", D.declareWar(d, "rome", "gaul")?.type === "war");
  check("savaşla barış teklifi turda bir", D.proposePeace(d, "rome", "gaul") && D.proposePeace(d, "rome", "gaul") === null);
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
      for (const k of ["pop", "inf", "arch", "level", "farms", "industry", "barracks"]) {
        if (!Number.isInteger(p[k]) || p[k] < 0) bad.push(`t${s.turn} ${id}.${k}=${p[k]}`);
      }
      for (const k of ["farms", "industry", "barracks"]) if (p[k] > p.level) bad.push(`t${s.turn} ${id}.${k} > seviye`);
      if (p.pop > S.popCap(p, byId[id].kind) + 1e-9) bad.push(`t${s.turn} ${id} nüfusu tavanı aşıyor`);
    }
    for (const a of s.armies) {
      if (!(a.inf + a.arch > 0) || !Number.isInteger(a.inf) || !Number.isInteger(a.arch)) bad.push(`t${s.turn} ordu ${a.id} ${a.inf}/${a.arch}`);
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
  check("25. tura kadar bağımsızların çoğu alınıyor", free25.every((n) => n <= 8), free25.join(" "));
  check("her oyunda savaş çıkıyor", games.every((g) => g.firstWar !== null && g.firstWar <= 40), games.map((g) => g.firstWar).join(" "));
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
