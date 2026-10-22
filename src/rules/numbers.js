// Oyunun bütün sayıları, tek yerde (Docs/kurallar.md). SADE SÜRÜM (22.10): kullanıcı "çok
// karıştırdık, basit olsun: kaynak ve yemek yap, ordu kur, savaş" dedi ve "sade ama biraz
// çeşit"i seçti: altın + yemek, şehirde tek "Geliştir", piyade / okçu / süvari üçgeni, denizi
// geçmek için gemi, savaş / barış / ittifak. Detaylı sürüm git'te `detayli-surum` etiketinde.

/** Birlik türleri. Bir bölük 10 asker. */
export const UNITS = ["inf", "arch", "cav"];

export const N = {
  company: 10,

  // Başlangıç ambarı.
  start: { money: 40, food: 20 },
  // Başlangıç garnizonu (asker): başkent, şehir, kale; bağımsızlar ayrıca.
  garrison: { capital: 40, city: 20, castle: 20 },
  free: { big: { level: 3, inf: 60, arch: 20 }, city: { level: 2, inf: 30, arch: 10 }, castle: { level: 1, inf: 20, arch: 10 } },

  // Şehir: seviye 1-5 (kale 1-3). Turluk gelir seviyeyle büyür; kale yarısını verir.
  maxCity: 5,
  maxCastle: 3,
  income: {
    money: (lv) => 1 + 1.5 * lv, // altın
    food: (lv) => 3 * lv, // yemek
    capital: 2, // başkente ek altın
    port: 2, // limana ek yemek (balık)
    castle: 0.5, // kale bunların yarısını üretir
  },
  // Geliştir: yeni seviye x 20 altın, şehir başına turda bir kere.
  upgradeCost: 20,

  // Asker: bölük başına altın; turda şehrin seviyesi kadar bölük basılabilir.
  cost: { inf: 6, arch: 8, cav: 12 },
  // Bakım: bölük başına turda yemek (atın da karnı var).
  upkeep: { inf: 1, arch: 1, cav: 2 },
  // Yemek biterse her birlikten bu kadarı ölür.
  starve: 0.1,

  // Savaş: herkes 1, süvari 1.2. Üçgen: piyade süvariyi, süvari okçuyu, okçu piyadeyi yener -
  // yendiği türe karşı x1.5 (karşı ordudaki o türün payı kadar).
  power: { inf: 1, arch: 1, cav: 1.2 },
  edge: 0.5,
  // Sur (başkent, kale, 3. seviye ve üstü şehir): savunan x1.5; sura saldıran süvari yarı güç.
  walls: 1.5,
  wallLevel: 3,
  cavWall: 0.5,
  // Şans: iki taraf da 0.9-1.1 arası bir çarpan.
  luck: 0.1,
  // Kazanan, güçler ne kadar yakınsa o kadar kayıp verir: asker x (kaybeden/kazanan)^2 x bu.
  winnerLoss: 0.5,
  // Alınan şehir seviye kaybetmez ama bir tur geliştirilemez.

  // Gemi: limanda 15 altın, turda bir; bir gemi 50 asker taşır. Deniz yolu gemi ister.
  ship: { cost: 15, carry: 50 },
  // Başlangıç gemileri: liman başkenti 2, öteki limanlar 1.
  startShips: { capital: 2, port: 1, free: 1 },

  // Bilgisayar: oyuncuya bu turdan önce savaş açmaz; açıkça güçlüyse açar.
  aiPeace: 12,
  aiWarRatio: 1.5,
  aiWarRatioMin: 1.1,
  aiGreed: 0.005,
  aiWarChance: 0.15,
};

// Zorluk: bilgisayarın oyuncuya ne zaman ve ne kadar güçlüyken savaş açtığı, ve geliri.
export const LEVELS = {
  easy: { peace: 20, warRatio: 2, aiOutput: 0.85 },
  normal: { peace: 12, warRatio: 1.5, aiOutput: 1 },
  hard: { peace: 8, warRatio: 1.25, aiOutput: 1.15 },
};

// Medeniyetlerin farkı: her birinin tek bir güçlü yanı (bir satırda anlatılabilsin).
const TRAITS = {
  rome: { inf: 1.25 }, // lejyon: piyade güçlü
  carthage: { money: 1.25, ship: 0.5 }, // tüccar: altın fazla, gemi yarı fiyat
  egypt: { food: 1.3 }, // Nil: yemek fazla
  macedon: { defend: 1.25 }, // falanks: savunmada güçlü
  parthia: { arch: 1.3 }, // atlı okçu: okçu güçlü
  gaul: { price: 0.75 }, // kabileler: asker ucuz
  saka: { cav: 1.3, moves: 2 }, // bozkır atlıları: süvari güçlü, turda iki yol
};

/** Bir medeniyetin bir çarpanı (yoksa `d`). */
export const trait = (civ, k, d = 1) => (civ && TRAITS[civ]?.[k]) ?? (k === "moves" ? 1 : d);
