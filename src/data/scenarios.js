// Senaryolar (kullanıcı 28.10: "bir ana menü; ayarlar, new game, campaign, scenario; daha sonra mesela MS 1400'lerde geçen
// bir oyun gibi, tarih değişikliğiyle çeşitliliği artıracak şeyler ekleyebilmek için"). Her senaryo bir çağ: yılı, adı,
// açıklaması. Şimdilik bir tane - MÖ 270, Akdeniz'in yedi gücü; oyunun bugünkü haritası, medeniyetleri ve kuralları.
//
// Yeni bir çağ eklemek: buraya bir kayıt (ready: true), kendi yerleşimleri ve medeniyetleri (data/world.js gibi) ve
// newGame'in o senaryoyu kurması. Oyun (state.scenario) hangi senaryoda başladığını kaydeder.

export const SCENARIOS = [
  {
    id: "bc270",
    ready: true,
    name: { en: "Mare Nostrum", tr: "Mare Nostrum" },
    year: { en: "270 BC", tr: "MÖ 270" },
    blurb: {
      en: "Seven powers around the Middle Sea, from Gaul to the steppe: Rome, Carthage, Egypt, Macedon, Parthia, the Gauls and the Saka. Whoever rules the sea rules the world.",
      tr: "Galya'dan bozkıra, Akdeniz'in çevresinde yedi güç: Roma, Kartaca, Mısır, Makedonya, Partlar, Galyalılar ve Sakalar. Denize hâkim olan dünyaya hâkim olur.",
    },
  },
];

/** Yeni oyunun senaryosu (seçilmezse). */
export const DEFAULT_SCENARIO = SCENARIOS[0].id;

/** Bir senaryo (bilinmeyen kimlik: varsayılan). */
export const scenarioOf = (id) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
