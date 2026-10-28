// Bütün sayılar tek yerde. Docs/kurallar.md'deki başlangıç değerleri; bot oynatılarak
// ayarlanacak. Bir sayıyı burada değiştiren, kurallar.md'yi de değiştirsin.

// Asker türleri, her yerde bu sırayla. Kuşatma makinesi dövüşmez ama sayılır (mürettebat).
// `elite`: medeniyete özel birlik (N.unique) - her medeniyetin bu yuvası kendi birliği.
export const UNITS = ["inf", "arch", "cav", "siege", "elite"];

// Gemi türleri (kullanıcı 22.10: "kadırgalar, savaş gemileri vs olsun, birleştirip büyük bir
// filo kuralım"), tersane seviyesiyle açılır - kışlanın askerleri açması gibi. Kadırga asker
// taşır; trireme ve kinkerem savaşır. Kadırga eskiden tek tür olan gemi: alanının adı da eskisi
// gibi `ships` (eski kayıtlar ve sayılar olduğu gibi kadırga olur).
export const SHIPS = ["ships", "trireme", "quinq"];

export const N = {
  // Kaynaklar (bölüm 3)
  taxPer: 20, // her 20 nüfus turda 1 para
  // Buğday 4, balık 1: ilk denemede 2 ve 2 idi ve üç limanı olan Kartaca turda +11 yiyecek
  // fazlasıyla başlarken Roma +1, Partlar -1 ile başlıyordu. Yiyecek ordunun tavanı.
  wheatPerFarm: 4,
  fish: 1, // limanın turluk ek balığı
  castleOutput: 0.5, // kalenin silah ve buğday üretimi şehrin yarısı

  // Yerleşimler (bölüm 4)
  popPerLevel: 100,
  castlePopPerLevel: 50,
  maxCity: 5,
  maxCastle: 3,
  growth: 0.05, // tavanın %5'i
  upgradeCost: 10, // yeni seviye x 10 para
  levelCostMul: 2, // şehir seviyesi iki katı
  // İnşaat (kullanıcı 22.10: "inşaatçı olsun, yükseltmelerin süresi olsun, işçi boşa çıksın;
  // mekanik olsun, düzgün kullanılmalı"): şehirde 2, kalede 1 inşaatçı. Para başta ödenir; iş
  // gidilen seviye kadar tur sürer, şehir seviyesi, kışla ve tersane bir tur fazla. Bitince
  // inşaatçı boşalır. Süreler farklı olduğu için oyuncu ne zaman neyin biteceğini planlar.
  builders: { city: 2, castle: 1 },
  buildExtra: { level: 1, barracks: 1, shipyard: 1 },
  startPop: 0.75,

  // Askerler (bölüm 5)
  company: 10,
  cost: {
    inf: { money: 1, weapons: 1, food: 1 },
    arch: { money: 1, weapons: 2, food: 1 },
    cav: { money: 2, weapons: 2, food: 1 },
    siege: { money: 3, weapons: 3, food: 1 },
  },
  // Medeniyete özel birlikler (bölüm 5b; kullanıcı 26.10 strateji oyunlarının olmazsa olmazlarından:
  // Civilization ve Total War'daki gibi her medeniyetin kendi birliği). Kurallarda tek yuva (`elite`),
  // davranışı sahibinin medeniyetinden: `as` hangi tür gibi dövüşür (inf ve cav önde durup okçuyu
  // korur, arch arkada; araştırmanın o türe çarpanını alır), `melee` göğüs göğüse adam başı güç
  // (piyade 1), `volley` ok yağmuru (okçu bölüğü 1), `charge` okçuya hücum (süvari bölüğü 1),
  // `attack` / `defend` saldırırken / savunurken çarpan, `stop` düşmanın hücumunu durdurma (bölük
  // başına, bir süvari bölüğünün hücumu cinsinden). Kışla `eliteBarracks` ister. Fiyata Roma'nın
  // x1.5 parası, Galya'nın bedava parası da uyar.
  unique: {
    rome: { as: "inf", melee: 1.7, cost: { money: 3, weapons: 2, food: 1 } }, // lejyoner
    carthage: { as: "cav", melee: 2.2, charge: 1.6, cost: { money: 4, weapons: 3, food: 2 } }, // savaş fili
    egypt: { as: "cav", melee: 1.5, charge: 1.4, volley: 0.6, cost: { money: 3, weapons: 2, food: 1 } }, // savaş arabası
    macedon: { as: "inf", melee: 1.3, defend: 1.5, stop: 1, cost: { money: 2, weapons: 2, food: 1 } }, // falanks
    parthia: { as: "cav", melee: 1.9, charge: 0.8, cost: { money: 4, weapons: 3, food: 1 } }, // katafrakt
    gaul: { as: "inf", melee: 1.2, attack: 1.5, cost: { money: 2, weapons: 1, food: 1 } }, // savaşçı
    saka: { as: "arch", melee: 0.8, volley: 1, charge: 0.6, cost: { money: 3, weapons: 2, food: 1 } }, // atlı okçu
  },
  eliteBarracks: 2,
  // Dinlenme (bölüm 6c, refill.js): kendi toprağında yürümeyen ordunun ve garnizonun her yarım bölüğü
  // turda `men` asker kazanır, yerin nüfusundan (en az `keep` kişi kalır).
  refill: { men: 3, keep: 20 },
  // Taktik savaş (bölüm 29, tactics.js). Saha `w` x `h` birim; birlik büyüklükleri (`per`); hızlar (birim/sn);
  // değme payı (`reach`); göğüs göğüse: adam başı güç x `melee` asker/sn; hücum: bölük başı N.charge x
  // `charge` (okçu dışına x`chargeOther`); ok: `range` menzil, `every` sn'de bir, bölük başı N.volley x
  // `kill`, `flight` sn uçar; surun ardındaki savunan düşman `hold` birime gelene kadar bekler;
  // `time` sn sonunda savunan kazanır (surlu şehirde `timeWalls`); surlu şehir field.js addCity. Göğüs göğüse yalnız ön `ranks` sıra dövüşür. Moral 100 (general +10): kaybedilen her %1 x `loss`, kuşatılınca
  // sn'de `flank`, hücum yiyince `charge`, ok yiyince `arrow`, dövüşmeyen sn'de `recover` toparlanır;
  // `rout`un altında ya da askerin `floor` payı kalınca bozulur; bozulan yakındaki dostlardan `nearby` götürür.
  tactics: {
    w: 100, h: 60, wallX: 76, per: { inf: 40, arch: 30, cav: 30, siege: 20, elite: 30 }, speed: { inf: 3.5, cav: 8, siege: 2 },
    reach: 1.2, melee: 0.026, ranks: 3, charge: 0.6, chargeOther: 0.35, volley: { range: 26, every: 2.5, kill: 0.15, flight: 0.8 },
    hold: 14, time: 180, morale: { loss: 1.15, flank: 3, rout: 15, charge: 12, arrow: 1, recover: 1, nearby: 6, nearbyMen: 30, floor: 0.15, flanked: 3, rear: 7, deep: 0.85, thin: 1.25 },
    // Kuşatma (kullanıcı 26.10: "düşmanın etrafını sarsalar"): yandan vuran x`side`, arkadan x`rear` öldürür;
    // düşmandan geniş cephenin taşan payı `wrap` kadar yandan vurmuş sayılır;
    // dönüş hızı (radyan/sn): yürürken, dövüşürken (yavaş: sarılan arkasını hemen toplayamaz), dururken
    // `near` birimdeki düşmana. Bölünen birliğin her yarısı en az `minSplit` asker; birleşecekler `mergeReach` içinde.
    // Arazi (field.js): nehrin genişliği; ormanda hız (atlı daha yavaş), atlının göğüs göğüse ve hücum gücü,
    // ormana giren okların payı; yokuşta yavaşlama (yükseklik x); tepeden vuruş (yükseklik farkı x); tepedeki
    // okçunun menzili (yükseklik x).
    terrain: { riverWidth: 4, forest: 0.6, forestMounted: 0.45, forestCav: 0.7, forestCharge: 0.5, forestArrow: 0.55, hillSlow: 0.25, height: 0.35, hillRange: 0.3 },
    flank: { side: 1.5, rear: 2, wrap: 0.8 },
    // Dar yerde daralan birliğin en çok kaç sıra derinliğe indiği (uzun kol olmasın, toplu kalsın).
    squeezeRows: 6,
    // Yol (field.js pathOn; kullanıcı 27.10: "dar geçitte tam ortadan, en geniş şekilde gitsin"): birlik engelden
    // `want` birim uzak durmak ister (bundan dar geçidin tam ortasından gider); daha yakın her hücre en çok `pinch`
    // kat pahalı; kestirme bu uzaklıktan en çok `slack` birim yakına iner.
    path: { want: 6, pinch: 3, slack: 0.5 },
    // Bilgisayarın tavrı: savunan, gücü saldıranınkinin `ratio` katına yetiyorsa saldırır, yoksa savunur - kendi
    // yarısında yüksekliği `hill`i geçen bir tepe varsa oraya çıkar; `engage` (atlı `cavEngage`) birime gelen düşmanla dövüşür.
    defend: { ratio: 1, hill: 0.3, engage: 10, cavEngage: 16 },
    // Sahada komutan (bölüm 29e; kullanıcı 27.10): generalin `guard` atlık muhafızı (atlının göğüs göğüse gücünün
    // `melee` katı, hücumu `charge` katı, morali +`morale`); `aura` birim içindeki dostların morali +`bonus`, toparlanması
    // x`recover`. General ölürse tarafının bütün birlikleri `shock` moral yitirir (kaçarsa yarısı). Bilgisayarın
    // generali ordusunun ortasının `back` birim gerisinde durur, `engage` birime gelen düşmanla dövüşür.
    general: { guard: 12, melee: 1.8, charge: 1.2, morale: 20, aura: 14, bonus: 12, recover: 2, shock: 25, back: 9, engage: 7 },
    // Dizilişler ve yetenekler (bölüm 29f; kullanıcı 27.10: "Roma'ya kaplumbağa, Makedonya'ya falanks, atlılara kama"):
    // `civ` o medeniyetin (null: herkesin atlısı), `who` kimin (tür; "horse": atlı), `toggle` açılıp kapanan diziliş, yoksa
    // `time` sn süren, `cooldown` sn'de bir kullanılan yetenek. Çarpanlar: `speed` hız, `turn` dönüş, `melee` vuruş,
    // `charge` hücum, `volley` ok, `arrows` yediği ok, `front` / `flank` önden / yandan yediği darbe, `taken` bütün
    // yediği darbe, `stop` hücum durdurma (eklenir), `arrowMorale` okunun moral etkisi; `radius` içindeki düşmana `shock` moral.
    // Deniz savaşı sahada (bölüm 29h, naval.js): her geminin boyu (`len`), eni (`beam`), gövdesi, hızı, dönüşü (radyan/sn),
    // tayfası, mahmuzu (`bow`), gemiye çıkma gücü (`board`), güvertedeki okçusu. Mahmuz: `bow` x hız x `ram` x (yandan
    // `ramSide`, burundan `ramHead`); çarpan da `recoil` kadarını yer. Gemiye çıkma: tayfa x `board` x `melee`/sn. Taşınan
    // okçuların `marineArchers` payı atar. Moral: kayıp tayfa x `lossMorale`, delik gövde x `hullMorale`; `rout`un altında
    // kaçar, kancalıyken `surrender`ın altında ele geçer. `time` sn sonunda savunan kazanır.
    naval: {
      types: {
        ships: { len: 6, beam: 1.6, hull: 40, speed: 5.5, turn: 0.9, crew: 20, bow: 0.6, board: 1, archers: 0.3 },
        trireme: { len: 7, beam: 1.6, hull: 55, speed: 7.5, turn: 1.25, crew: 30, bow: 1.8, board: 1, archers: 0.4 },
        quinq: { len: 8.5, beam: 2.4, hull: 110, speed: 5, turn: 0.65, crew: 45, bow: 1.1, board: 1.3, archers: 1 },
      },
      accel: 2, brake: 3, ram: 3, ramSide: 1.6, ramHead: 0.5, recoil: 0.15, ramMorale: 0.4, melee: 0.02, boardMorale: 0.6,
      volley: { range: 22, every: 3, kill: 2.2 }, marineArchers: 0.05, arrowMorale: 1.5, sinkMorale: 10, lossMorale: 1,
      hullMorale: 0.5, surrender: 10, rout: 5, recover: 1, time: 240,
    },
    abilities: {
      testudo: { civ: "rome", who: ["inf", "elite"], toggle: true, arrows: 0.25, speed: 0.5, melee: 0.85 },
      phalanx: { civ: "macedon", who: ["inf", "elite"], toggle: true, front: 0.6, flank: 1.25, speed: 0.6, turn: 0.4, stop: 1 },
      warcry: { civ: "gaul", who: ["inf", "elite", "cav"], time: 12, cooldown: 60, melee: 1.3, radius: 16, shock: 12 },
      stampede: { civ: "carthage", who: ["elite", "cav"], time: 12, cooldown: 45, charge: 1.8, speed: 1.2, shock: 15 },
      fire: { civ: "egypt", who: ["arch", "elite"], time: 20, cooldown: 60, volley: 1.3, arrowMorale: 3 },
      circle: { civ: "saka", who: ["elite"], toggle: true, arrows: 0.5, volley: 1.2 },
      heavyWedge: { civ: "parthia", who: ["horse"], toggle: true, charge: 1.8, melee: 1.15, taken: 1.1, turn: 0.6 },
      wedge: { civ: null, who: ["horse"], toggle: true, charge: 1.5, melee: 1.1, taken: 1.15, turn: 0.6 },
    },
    // Sur (kullanıcı 27.10: "surlara tırmanıyormuş gibi, tek sıra"): her birlik merdivenden saniyede `rate`
    // asker tırmanır; merdivenin `guard` birim yakınındaki savunan tırmananları göğüs göğüse gücünün `repel`
    // katı düşürür; sura dayanan makine (her 10 asker 1/sn) `breach` puanda `gapHalf` x 2 genişliğinde gedik
    // açar; surun `wallZone` birim gerisindeki savunan sur bonusuyla dövüşür; surun ardındaki her savunan
    // okları `cover` kadar yer. Gedik yokken saldıranın yalnız okçusu ve makinesi kaldıysa hücum başarısız.
    // Bilgisayar sura saldırırken önce surun `stage` birim önünde toplanır (en çok `wait` sn bekler).
    // Tırmananlar içeride `join` birim yakınındaki aynı türden köprübaşına katılır; köprübaşının kayıptan moral
    // kaybı x`steady`.
    // Mancınık (yerinde yapılan): `every` saniyede bir, `range` birim uzağa taş; bölüğü başına `kills` asker düşürür.
    catapult: { every: 4.5, range: 46, kills: 3, flight: 1.8, stand: 20 },
    // Pusu (bölüm 29i): ormanda `hide` sn kıpırdamadan duran birlik gizlenir; düşman `reveal` birime girince açığa çıkar
    // ve `time` sn pusu kurmuş sayılır: dövüşte ve hücumda x`bonus`, ilk değdiği düşmanın morali -`shock`.
    ambush: { hide: 1.5, reveal: 7, time: 5, bonus: 1.5, shock: 25 },
    climb: { stage: 10, wait: 15, rate: 3, guard: 4, repel: 0.6, join: 8, steady: 0.5, breach: 30, ram: 2, tower: 3, towerRepel: 0.5, bridge: 6, gapHalf: 4, wallZone: 8, cover: 0.75 },
    timeWalls: 300, turn: { march: 3, fight: 0.5, idle: 1.2, near: 14 }, minSplit: 5, mergeReach: 20,
  },
  // Ticaret yolları (bölüm 28, trade.js): karadan `reach`, iki liman arasında `seaReach` birime kadar;
  // turluk para (iki uca da) `base` + uzaklık x `perDist`, yabancı yerle x`foreign`, en çok `max`. Şehir
  // başına yol: pazar 1, liman ticareti 1, pazar `marketMore`. seviyede bir daha.
  trade: { reach: 9, seaReach: 18, base: 1, perDist: 0.2, foreign: 1.4, max: 5, marketMore: 5 },
  // Büyük krizler (bölüm 27, crises.js), `from`. turdan sonra.
  // İç savaş: en az `places` yeri olan medeniyete turda `chance` ihtimalle (aralarında en az `gap` tur);
  // başkentten en uzak yerlerin `share` kadarı garnizonlarıyla kopar, bağımsız olur - valilere şehir başına
  // `pay` para, ama en az kasanın `treasury` payı verilirse kalırlar, sadakatleri `calm`a düşer.
  // Büyük salgın: turda `chance` (`gap` tur arayla); en kalabalık şehirde başlar, `turns` tur boyunca
  // her şehirden yollarla komşulara `spread` ihtimalle geçer; vardığı yerin nüfusunun `pop` payı ve
  // askerin `army` payı ölür; her hamam seviyesi `baths` hafifletir (en çok `bathsMax`).
  // Büyük göç: `from`. turdan sonra turda `chance` (`gap` tur arayla), `base` + tur x `perTurn` barbar
  // (okçu `arch`, süvari `cav` payı), en çok yeri olanın sınırının `near` yakınında; her yağmadan sonra
  // `next` birim içindeki yeni hedefe yürür; `life` turda dağılır.
  crises: {
    from: 50,
    civilWar: { places: 10, chance: 0.03, gap: 40, share: 0.3, calm: 35, pay: 20, treasury: 0.5 },
    plague: { chance: 0.02, gap: 40, turns: 6, spread: 0.5, pop: 0.25, army: 0.1, baths: 0.2, bathsMax: 0.6 },
    horde: { from: 70, chance: 0.03, gap: 40, base: 150, perTurn: 1, arch: 0.3, cav: 0.2, near: [2.6, 5], next: 8, life: 25 },
  },
  cavUpkeep: 1, // süvari bölüğü turda kaç bölük gibi yer (2 iken süvari yiyeceğe göre piyadeden zayıftı: tuzak birlik)
  upkeep: 1, // bölük başına turda yiyecek
  starve: 0.1, // açlıkta turda kayıp

  // Savaş (bölüm 7)
  volley: 5, // bir okçu bölüğünün ok yağmurunda düşürdüğü asker
  archMelee: 0.6, // okçu yakın dövüşte, piyadenin arkasındayken
  archBare: 0.25, // piyadesinden fazla olan okçular: korumasız yakalananlar
  cavMelee: 1.2, // süvari yakın dövüşte
  cavWall: 0.5, // süvari sura karşı (hücumda ve göğüs göğüse)
  charge: 5, // bir süvari bölüğünün hücumda biçtiği okçu
  siegeBreach: 0.2, // bir kuşatma makinesi bölüğünün söktüğü sur bonusu payı (5 bölük suru tamamen açar)
  luck: 0.1, // ±%10
  winnerLoss: 0.5,
  castleWall: 1.5,
  castleVolley: 2,
  cityWall: 1.25,
  cityWallLevel: 3,
  captureLoss: 0.25,

  // Başlangıç (bölüm 4)
  start: {
    stock: { money: 30, weapons: 5, food: 10 },
    garrison: { capital: 30, city: 20, castle: 10 },
    free: {
      city: { level: 2, inf: 30, arch: 10 },
      castle: { level: 1, inf: 30, arch: 30 },
      // Siraküza, Atina, Antakya, Babil: seviye 3 (şehir suru). Siraküza Kartaca'nın İtalya'ya,
      // Antakya ve Babil Mısır'ın doğuya kapısı; ikisi de sursuz kapılardan çok hızlı büyüyordu.
      big: { level: 3, inf: 40, arch: 20 },
    },
    // Küçük medeniyetlere başkentlerinde fazladan asker, ve onları birkaç tur besleyecek yiyecek
    // (kullanıcı 22.10: "küçük medeniyetlere önden asker verelim, dengeyi koruyalım"). İnşaatçılar
    // gelince yükseltmeler aynı tur işe yaramaz oldu; erken yayılma yarışını kaybeden Galya,
    // Partlar ve Sakalar toparlanamıyordu (70 oyunda ilk düşüş 50 -> 29).
    // 70 oyunla ayarlandı: Partlar ile Sakalar komşu - biri fazla güçlenince ötekini yutuyor.
    // Bu hâliyle ilk düşüş 44 (eskisi 50), 150 turda ayakta Partlar 41, Galya 55, Sakalar 31.
    // Serbest yürüyüşle (22.10 akşam) Sakalar ile Makedonya birbirine bağlandı: Sakalar güçlüyse
    // Pella'yı erken alıyor, zayıfsa kendileri düşüyor. İkisine birden destek: 70 oyunda ilk
    // düşüş 55 (en erken 25), ayakta Makedonya 35, Sakalar 32, Partlar 48.
    extra: {
      gaul: { inf: 40, arch: 20, food: 40 },
      parthia: { inf: 55, arch: 30, food: 55 },
      saka: { inf: 50, arch: 25, food: 45 },
      macedon: { inf: 20, arch: 10, food: 20 },
    },
  },
  // Serbest yürüyüş (bölüm 6; kullanıcı 22.10): ordunun turluk hareket puanı ve bir harita
  // biriminin bedeli - yolda 1, yol dışında 2.5, denizde 1; gemiye binmek ya da karaya çıkmak ayrıca.
  // Eskiden her yol bir turdu: yolların ortancası 3.6 birim, dörtte üçü 5.5'ten kısa, yani yolda
  // turda 5 birim eski hıza yakın.
  // 70 oyunla ayarlandı: 5 ve 2 iken (yolda turda 5 birim) dünya çok hızlı yanıyordu, ilk düşüş 36.
  march: { mp: 4, road: 1, land: 2.5, sea: 1, embark: 0.5, mountain: 2 },
  // Geri çekilme (bölüm 7; kullanıcı 23.10 önerilerden): yenilen ordu yok olmaz, savaş ne kadar
  // yakınsa o kadar askerle (en çok `keep` payı) `dist` birim uzağa çekilir; `min` askerden azı
  // kalırsa dağılır.
  retreat: { keep: 0.5, min: 10, dist: 1.6 },
  // Uzaklıklar, harita birimi: saldırı menzili (bir yerleşime ya da orduya bu kadar yakından
  // saldırılır), önünü kesme (yürüyen ordu savaştığı birinin ordusuna bu kadar yaklaşınca durur),
  // tehdit (bir yerin bu kadar yakınındaki düşman ordusu uyarı), görüş (yerleşim ve ordu), abluka.
  // hold: yabancı yerleşimin çevresi - içinden geçilmez (yalnızca ona saldırmaya ya da orada
  // durmaya gidilir). Bunsuz bağımsız şehirler tampon olmaktan çıktı, Sakalar Odessos ile Bizans'ın
  // yanından geçip 12. turda Pella'yı alıyordu.
  reach: { strike: 0.8, zoc: 0.8, hold: 0.6, threat: 4.5, sightPlace: 3, sightArmy: 2.5, blockade: 1.2 },
  // Takviye (bölüm 7b; kullanıcı 27.10): savaşın yerine `reach` birimden yakın, karada duran dost ordulardan en yakın
  // `max` tanesinin `part` kadarı savaşa yetişir (kalanı yerinde kalır). Taktik savaşta sahaya `delay` + uzaklığı
  // oranında en çok `late` saniye sonra girer.
  reinforce: { reach: 1.2, max: 3, part: 0.5, delay: 12, late: 30 },
  // Tahıl alımı (bölüm 3b; kullanıcı 27.10, önerilerden: "bilgisayarın biriken parası"): her tur tüccarlardan buğday
  // başına `price` paraya; turda en çok `base` + pazar seviyesi başına `market` + ticareti olan liman başına `port`.
  // Oyuncu `step` `step` artırır. Bilgisayar kasası `aiReserve` + yer başına `aiPerPlace`ın iki katını geçince tavana kadar,
  // bir katını geçince yarısına kadar alır.
  grain: { price: 3, base: 4, market: 2, port: 4, step: 2, aiReserve: 150, aiPerPlace: 25 },
  // Hızlandırma (bölüm 4): süren inşaatın kalan turları, turluk payının `rush` katı parayla; iş o tur sonunda biter.
  rush: 2,
  // Şehir uzmanlığı (bölüm 4c; kullanıcı 28.10): `level`. seviyedeki şehir `cost` paraya, `turns` turda bir yol seçer.
  // Ticaret: bu şehrin parası +`money`, tahıl tavanı +`grain`; tarım: buğdayı +`food`; demirhane: silahı +`weapons`;
  // kışla: turda +`recruit` bölük, buradan çıkan ordu Kıdemli. Yolun yapısı şehir seviyesini `extra` geçebilir.
  spec: { level: 3, cost: 60, turns: 3, extra: 1, trade: { money: 0.25, grain: 4 }, farm: { food: 0.5 }, forge: { weapons: 0.5 }, camp: { recruit: 1 } },
  // Hava ve gün saati (bölüm 29g, weather.js): mevsime göre yağmur, sis, kar ihtimali; `north` enleminin kuzeyinde
  // yağmur ve sis sık, `south`un güneyinde az. Gün saati: gece, şafak, akşam. Etkiler: ok, ok menzili, hücum, hız.
  weather: {
    chance: { rest: { rain: 0.18, fog: 0.12, snow: 0 }, winter: { rain: 0.22, fog: 0.12, snow: 0.22 } },
    time: { night: 0.07, dawn: 0.1, dusk: 0.13 }, north: 44, south: 33,
    effects: {
      rain: { volley: 0.7, range: 0.8, charge: 0.85, speed: 0.9 }, fog: { volley: 0.85, range: 0.55 }, snow: { volley: 0.85, charge: 0.8, speed: 0.8 },
      dawn: { range: 0.85 }, dusk: { range: 0.85 }, night: { volley: 0.8, range: 0.6 },
    },
  },
  // Tarafsızın toprağında durmak (kullanıcı 22.10: "girilsin ama ilişki bozulsun"): her tur öfke
  // +1, girmeyince -0.5. Öfke `war` olunca o medeniyet savaş açar - barış süresini beklemeden,
  // ancak karşısındakinin gücünün en az `ratio` katıysa.
  anger: { war: 3, ratio: 0.7 },
  // Casus (kullanıcı 22.10): fiyatı, turda kaç harita birimi yol alır (en az bir tur), aynı anda en
  // çok kaç casus, yerinde her tur yakalanma ihtimali (+ garnizonun her 100 askeri için), ve
  // vardığı yerde açtığı görüş (kapıdaki ordular da görünsün).
  spy: { cost: 15, speed: 4, max: 3, caught: 0.06, perHundred: 0.03, eye: 1.4 },
  // Zafer yolları (kullanıcı 23.10: Fetih, Harikalar, Skor; victory.js). Harikalar: 6 harikadan
  // `wonders` tanesini `hold` tur üst üste tutan; Skor: `turns`. turun sonunda en yüksek.
  // 28 bot oyunuyla: 4 harika / 10 tur iken oyunların yarısı Harikalar zaferiyle, en erken 20. turda
  // bitiyordu (Mısır iki harikayla başlıyor, yanındaki Rodos ve Efes bağımsız). 5 / 20: beşte bir,
  // en erken 55. tur; çoğu oyun 200. turda skorla biter.
  victory: { wonders: 8, hold: 20, turns: 200 },
  // Tecrübe (kullanıcı 23.10: "savaşlar cansız"; Civilization'ın terfileri gibi): ordu savaş
  // kazandıkça tecrübe toplar (`win`; yerleşimini savunan içerideki ordu `held`). Rütbeler:
  // Acemi, Kıdemli (`xp[0]`), Usta (`xp[1]`), Seçkin (`xp[2]`); her rütbe güce +`per`.
  veteran: { xp: [2, 5, 9], per: 0.05, win: 2, held: 1 },
  // Araştırma (bölüm 23, research.js): her `popPer` nüfus turda 1 bilim, başkent +`capital`;
  // teknolojinin bedeli çağına göre. 16 teknolojinin hepsi 1920 bilim: orta bir medeniyet
  // (turda ~20) 100. tur civarında bitirir, büyükler daha erken.
  // Civilization V gibi: `free` yerleşimden sonra her yerleşim bedeli `perPlace` artırır (70 oyunda
  // bunsuz Partlar oyunların 40ında en büyüğe çıkıyordu: geniş toprak -> çok bilim -> güçlü ordu).
  research: { popPer: 80, capital: 2, cost: [40, 120, 260, 450], free: 6, perPlace: 0.05 },
  // Diplomasi (bölüm 24, leaders.js): hediyenin her parası tutuma `giftPoints` puan (en çok
  // `giftMax`, turda `giftFade` söner); ticaret anlaşması iki tarafa turda `tradeMoney` para,
  // `tradeTurns` tur; sınır komşusu `border` harita biriminden yakın yerleşimler. Hediye düğmeleri.
  diplo: { giftPoints: 0.5, giftMax: 40, giftFade: 1, tradeMoney: 3, tradeTurns: 20, border: 4, giftSizes: [25, 50], peaceGold: 30 },
  // Şehir binaları (bölüm 4b; Yapılar sekmesi): her seviye tapınak sadakat turda +temple, pazar
  // şehrin parası +market, okul +school bilim, hamam nüfus artışı +baths. Seviye şehir seviyesine
  // kadar; pazar Sikke, okul Yazı, hamam Mühendislik ister.
  buildings: { temple: 2, market: 0.1, school: 1, baths: 0.1, needs: { market: "currency", school: "writing", baths: "engineering", academy: "ironWorking" } },
  // Barbarlar (bölüm 26, barbarians.js): oyun başında `camps` kamp (her başkentin `minDist`-`nearMax`
  // yakınında bir tane), kamplar arası en az `spacing`; kamp `start` piyadeyle başlar, turda `grow`
  // büyür (en çok `cap`); `from`. turdan sonra `raidMin` askeri olan kamp her tur 1/`raidEvery`
  // ihtimalle `reach` içindeki bir yerleşime akıncı yollar. Kampı dağıtan `loot`, akıncıyı
  // `raiderLoot` para alır. `spawnEvery` turda bir yeni kamp, en çok `max`.
  barbarians: { camps: 7, max: 10, start: 24, grow: 1, cap: 70, from: 5, raidEvery: 6, raidMin: 30, reach: 5, loot: 40, raiderLoot: 15, spawnEvery: 12, minDist: 2.6, nearMax: 4.5, spacing: 3,
    // Yağma: nüfusun payı, kasadan para, sadakat.
    sackPop: 0.25, sackMoney: 25, sackLoyalty: 15 },
  // Öğretici haydutlar (bandits.js): başkentten near-far uzakta (dist'e en yakın), dağıtana ganimet.
  bandits: { inf: 10, arch: 10, loot: 40, dist: 1.4, near: 1.1, far: 1.9 },
  // Skor: her yerleşim, seviyesinin her basamağı, başkent; her `popPer` nüfus; her harika; her
  // `armyPer` asker; kazanılan her savaş.
  score: { place: 10, level: 4, capital: 10, popPer: 20, wonder: 30, armyPer: 25, win: 3, tech: 3 },

  // Bilgisayar
  // Bilgisayarlar arası: bu turdan önce kimse kimseye savaş açmaz (önce bağımsızlar), ve ancak
  // bu kadar güçlüyken açar. 6. tur iken biri 15-25. turda yok oluyordu.
  aiPeace: 12,
  // 1.5 iken sadakat gelince erken düşüşler oldu, 1.8'e çıktı; donanma ve liman yapıları
  // fetihleri yavaşlatınca 1.8'de dünya donmaya başladı (7 oyunun 4'ünde hiç savaş yok): 1.5.
  aiWarRatio: 1.5,
  aiGreed: 0.005, // eşik her tur bu kadar düşer ...
  aiWarRatioMin: 1.1, // ... ama bundan aşağı değil
  aiWarChance: 0.15,
  // Bilgisayarın bir yerde tuttuğu asker: yakındaki düşman ordularının hepsi + düşman garnizonlarının bir payı (x1.1) -
  // `aiGarrisonThreat`[0] `aiLate`[0]. tura kadar, sonra `aiLate`[1]. tura doğru [1]e iner. Pay hep 0.5 iken geç oyunda herkesin
  // garnizonu birbirini büyütüyor, ordular sefere çıkmıyordu; hep 0.2 olunca da erken oyun fazla kanlıydı.
  aiGarrisonThreat: [0.5, 0.2], aiLate: [60, 100],
  // Geç oyunda (`aiLate`[1]. turdan sonra) bilgisayar saldırısı umutsuz surlu yeri de kuşatır - ordusu savunanların
  // `aiSiegeLate` katıysa (açlık ve koçbaşılar işi bitirir); hedefsiz orduları eve değil cepheye (düşmana en yakın kendi
  // yerine) gider, orada birleşip büyük ordu olur.
  aiSiegeLate: 0.8,
  // Geç oyunda ortak düşmanı kalmamış iki bilgisayarın ittifakı her tur `aiAllyCrack` ihtimalle bozulur (oyuncunun
  // ittifakları değil): herkes herkesle müttefik olup savaş bitmesin. Denizaşırı hedefi olan liman `aiFleetLate` gemiye
  // kadar yapar (erken oyunda 6).
  aiAllyCrack: 0.03, aiFleetLate: 16,
  aiElite: 0.2, // ordunun özel birlik payı ...
  aiEliteFrom: 15, // ... bu turdan sonra (erken basınca yayılma yavaşlıyordu)

  // Sadakat (bölüm 12). 0-100. Başlangıçta herkes 100; alınan yer düşük başlar.
  loyalty: {
    captured: 20,
    settle: 4, // her tur kendiliğinden
    perGarrison: 10, // garnizonun her 10 askeri +1 ...
    garrisonCap: 8, // ... en fazla +8
    far: 1.5, // başkentten 2 yoldan uzaktaki her yol -1.5 ...
    farCap: 8, // ... en fazla -8
    famine: 10,
    unrest: 40, // bunun altı haritada işaretli
    revolt: 25, // bunun altında her puan %4 isyan ihtimali
    revoltChance: 0.04,
    rebels: 0.25, // isyancılar nüfusun dörtte biri kadar
    gamesCost: 15,
    gamesGain: 20,
  },

  // Olaylar (bölüm 13): her medeniyete her tur bu ihtimalle bir olay; ilk birkaç tur yok.
  events: { chance: 0.16, from: 4 },

  // Donanma (bölüm 15). Gemi tek tek sayılır (bölük değil).
  navy: {
    // Her tür: fiyatı, tayfası (nüfustan), taşıdığı asker, deniz savaşındaki gücü, bakımı (turda
    // yiyecek), açıldığı tersane seviyesi. Para başına güç savaş gemilerinde, taşıma kadırgada.
    types: {
      ships: { money: 4, weapons: 2, pop: 5, carry: 25, might: 1, upkeep: 0.5, yard: 1 },
      trireme: { money: 7, weapons: 3, pop: 8, carry: 10, might: 2.5, upkeep: 0.75, yard: 2 },
      quinq: { money: 12, weapons: 5, pop: 12, carry: 20, might: 4, upkeep: 1, yard: 3 },
    },
    start: { capital: 2, port: 1, freeBig: 2, free: 1 }, // başlangıç kadırgaları
    blockadeMoney: 0.5, // ablukadaki limanın vergisi
  },

  // Liman yapıları (bölüm 16). Hepsi 0'dan başlar (tersane 1), şehir seviyesini geçemez.
  port: {
    fishPerLevel: 2, // balıkçılık: her seviye turda +2 balık (limanın kendi 1 balığına ek)
    tradePerLevel: 2, // ticaret: her seviye turda +2 para
    fortPerLevel: 0.25, // liman kalesi: savunan gemiler ve abluka eşiği her seviye +%25
    shipDiscount: 1, // tersane: 1. seviyeden sonraki her seviye gemiyi 1 para ucuzlatır
  },

  // Generaller (bölüm 14)
  generals: { cost: 30, perLevel: 0.06, xpWin: 3, xpLoss: 1 },
  // Şehirde yetişen komutanlar (bölüm 14b; kullanıcı 27.10: "komutanları şehirlerde eğitelim, şehrin özelliklerine
  // göre rastgele oluşsunlar; okçulara, süvarilere artı gibi özellikler"). `from`. turdan sonra her şehirde turda
  // `chance` + şehir seviyesi başına `perLevel` + okul başına `school` + akademi başına `academy` ihtimalle (kalede
  // x`castle`) bir komutan yetişir; medeniyetin komutanı (ordudakiler ve bekleyenler) `cap.base` + her `cap.perPlaces`
  // yer için 1 (+1 `cap.academy`. seviye bir akademi varsa) ama en çok `cap.max`. Akademi 3'te 2., 5'te 3. seviyeden başlar; `second`. seviyede iki
  // yetenekle. Yetenekler: süvari ustası atlılar x`cavalry`, piyade ustası piyade x`infantry`, ilham veren kazanınca
  // kayıp x`inspiring` (taktik savaşta moral +`inspiringMorale`), amiral filo x`admiral`.
  officers: { from: 3, chance: 0.004, perLevel: 0.003, school: 0.004, academy: 0.025, castle: 0.6, cap: { base: 1, perPlaces: 3, academy: 3, max: 7 }, second: 4,
    cavalry: 1.2, infantry: 1.12, inspiring: 0.75, inspiringMorale: 15, admiral: 1.25 },

  // Bilgisayarın oyuncuya teklifleri (bölüm 8)
  offers: { spacing: 6, truce: 8, tributeRatio: 1.8 },
  // Görevler (bölüm 17): 3. turdan sonra, aynı anda en fazla 2, arası en az 5 tur, gelme
  // ihtimali o tur için yarı yarıya. Süresi geçen görev başkentin sadakatini 5 düşürür.
  missions: { from: 3, spacing: 5, chance: 0.5, max: 2, failLoyalty: 5 },
  // Kuşatma (bölüm 20): garnizon turda %10 erir, her 10 kuşatma makinesi +%2, en fazla %25;
  // kuşatılan yerin sadakati turda 5 düşer; kamptaki ordu da salgından turda %3 erir.
  // Aletler (kullanıcı 28.10): kuşatan ordu, en az `crew` dövüşen askeri varsa her tur bir koçbaşı / merdiven yapar,
  // en çok `max`; her biri bir makine bölüğü kadar sur söker (siegeBreach). Kuşatma kalkınca ya da saldırınca biter.
  // Alet türleri (kullanıcı 28.10, önerilerden 5.): koçbaşı `breach` kadar makine bölüğü sur söker; kule yarısını söker,
  // saldıranın gücü her biriyle +`power` (sahada sura köprü kurar); mancınık yarısını söker, kuşatmada garnizonu her tur
  // +`starve` eritir (sahada uzaktan taş atar).
  siege: {
    starve: 0.1, perEngines: 0.02, max: 0.25, loyalty: 5, camp: 0.03,
    works: { crew: 20, max: 3, kinds: { ram: { breach: 1 }, tower: { breach: 0.5, power: 0.08 }, catapult: { breach: 0.5, starve: 0.02 } } },
  },
  // Arazi ve mevsim (bölüm 22): nehir geçen yoldan saldıran x0.85, dağ geçidini savunan x1.25.
  // Kışın deniz yolunda yürüyen ya da denizden saldıran ordu %25 ihtimalle fırtınaya yakalanır
  // (askerinin %10'u ve bir gemisi gider); kışın bütün ordular %3 yıpranır.
  ground: { river: 0.85, pass: 1.25 },
  season: { storm: 0.25, stormLoss: 0.1, winterArmy: 0.03 },
  // Dünya harikaları (bölüm 18): şehri tutanın bütün ülkesine.
  wonders: { pharosFort: 1, pyramidsLoyalty: 2, gardensGrowth: 1.25, artemisMoney: 1.1, colossusTrade: 1.5, parthenonXp: 2,
    // İnşa edilenler (wonders.js BUILDABLE): şehir seviyesi, yarışı kaybedene dönen pay, etkileri.
    level: 3, refund: 0.5, perPlace: 0.05, libraryScience: 1.25, treasuryMoney: 1.15, harbourNavy: 1.2, harbourTrade: 1.2, aqueductGrowth: 1.25, colosseumLoyalty: 3 },
};

// Zorluk: bilgisayarın OYUNCUYA ne zaman savaş açtığı ve bilgisayarın üretimi. Bilgisayarlar
// kendi aralarında her zorlukta aynı (N.aiPeace, N.aiWarRatio) oynar.
export const LEVELS = {
  easy: { peace: 20, warRatio: 2, aiOutput: 0.85 },
  normal: { peace: 12, warRatio: 1.5, aiOutput: 1 },
  hard: { peace: 8, warRatio: 1.25, aiOutput: 1.15 },
};

// Medeniyetlerin güçlü ve zayıf yanları (bölüm 9). Yazılmayan her şey 1.
export const TRAITS = {
  rome: { inf: 1.25, recruitMoney: 1.5 },
  carthage: { money: 1.5, all: 0.85, navy: 1.5 },
  egypt: { wheat: 1.15, weapons: 0.75 },
  macedon: { defInf: 1.5, popCap: 0.9, science: 1.25 },
  parthia: { arch: 1.5, inf: 0.75 },
  gaul: { recruitMoney: 0, growth: 1.5, arch: 0.7 },
  saka: { moves: 2, siege: 0.6, cav: 1.3 },
};

/** Bir medeniyetin özel birliği (bağımsızın eline geçen seçkin asker sıradan piyade gibi dövüşür). */
export const uniqueOf = (civ) => (civ && N.unique[civ]) || { as: "inf", melee: 1, cost: N.cost.inf };

/** Bir medeniyetin bir özelliği; bağımsızlar (null) ve yazılmayanlar için varsayılan. */
export const trait = (civ, key, otherwise = 1) => {
  const v = civ ? TRAITS[civ]?.[key] : undefined;
  return v === undefined ? otherwise : v;
};
