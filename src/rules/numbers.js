// Bütün sayılar tek yerde. Docs/kurallar.md'deki başlangıç değerleri; bot oynatılarak
// ayarlanacak. Bir sayıyı burada değiştiren, kurallar.md'yi de değiştirsin.

// Asker türleri, her yerde bu sırayla. Kuşatma makinesi dövüşmez ama sayılır (mürettebat).
export const UNITS = ["inf", "arch", "cav", "siege"];

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
  startPop: 0.75,

  // Askerler (bölüm 5)
  company: 10,
  cost: {
    inf: { money: 1, weapons: 1, food: 1 },
    arch: { money: 1, weapons: 2, food: 1 },
    cav: { money: 2, weapons: 2, food: 1 },
    siege: { money: 3, weapons: 3, food: 1 },
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
  },
  moves: 1,

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
    cost: { money: 4, weapons: 2 },
    pop: 5, // tayfa
    carry: 25, // bir geminin taşıdığı asker
    upkeep: 0.5, // gemi başına turda yiyecek
    start: { capital: 2, port: 1, freeBig: 2, free: 1 },
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

  // Bilgisayarın oyuncuya teklifleri (bölüm 8)
  offers: { spacing: 6, truce: 8, tributeRatio: 1.8 },
  // Görevler (bölüm 17): 3. turdan sonra, aynı anda en fazla 2, arası en az 5 tur, gelme
  // ihtimali o tur için yarı yarıya. Süresi geçen görev başkentin sadakatini 5 düşürür.
  missions: { from: 3, spacing: 5, chance: 0.5, max: 2, failLoyalty: 5 },
  // Kuşatma (bölüm 20): garnizon turda %10 erir, her 10 kuşatma makinesi +%2, en fazla %25;
  // kuşatılan yerin sadakati turda 5 düşer; kamptaki ordu da salgından turda %3 erir.
  siege: { starve: 0.1, perEngines: 0.02, max: 0.25, loyalty: 5, camp: 0.03 },
  // Arazi ve mevsim (bölüm 22): nehir geçen yoldan saldıran x0.85, dağ geçidini savunan x1.25.
  // Kışın deniz yolunda yürüyen ya da denizden saldıran ordu %25 ihtimalle fırtınaya yakalanır
  // (askerinin %10'u ve bir gemisi gider); kışın bütün ordular %3 yıpranır.
  ground: { river: 0.85, pass: 1.25 },
  season: { storm: 0.25, stormLoss: 0.1, winterArmy: 0.03 },
  // Dünya harikaları (bölüm 18): şehri tutanın bütün ülkesine.
  wonders: { pharosFort: 1, pyramidsLoyalty: 2, gardensGrowth: 1.25, artemisMoney: 1.1, colossusTrade: 1.5, parthenonXp: 2 },
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
  macedon: { defInf: 1.5, popCap: 0.9 },
  parthia: { arch: 1.5, inf: 0.75 },
  gaul: { recruitMoney: 0, growth: 1.5, arch: 0.7 },
  saka: { moves: 2, siege: 0.6, cav: 1.3 },
};

/** Bir medeniyetin bir özelliği; bağımsızlar (null) ve yazılmayanlar için varsayılan. */
export const trait = (civ, key, otherwise = 1) => {
  const v = civ ? TRAITS[civ]?.[key] : undefined;
  return v === undefined ? otherwise : v;
};
