// Bütün sayılar tek yerde. Docs/kurallar.md'deki başlangıç değerleri; bot oynatılarak
// ayarlanacak. Bir sayıyı burada değiştiren, kurallar.md'yi de değiştirsin.

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
  },
  upkeep: 1, // bölük başına turda yiyecek
  starve: 0.1, // açlıkta turda kayıp

  // Savaş (bölüm 7)
  volley: 5, // bir okçu bölüğünün ok yağmurunda düşürdüğü asker
  archMelee: 0.6, // okçu yakın dövüşte, piyadenin arkasındayken
  archBare: 0.25, // piyadesinden fazla olan okçular: korumasız yakalananlar
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
  aiWarRatio: 1.5,
  aiWarChance: 0.15,
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
  carthage: { money: 1.5, all: 0.85 },
  egypt: { wheat: 1.15, weapons: 0.75 },
  macedon: { defInf: 1.5, popCap: 0.8 },
  parthia: { arch: 1.5, inf: 0.75 },
  gaul: { recruitMoney: 0, growth: 1.5, arch: 0.7 },
  saka: { moves: 2, siege: 0.6 },
};

/** Bir medeniyetin bir özelliği; bağımsızlar (null) ve yazılmayanlar için varsayılan. */
export const trait = (civ, key, otherwise = 1) => {
  const v = civ ? TRAITS[civ]?.[key] : undefined;
  return v === undefined ? otherwise : v;
};
