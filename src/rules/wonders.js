// Dünya harikaları (kurallar.md bölüm 18): bazı şehirlerde antik dünyanın harikaları var. O
// şehri kim tutuyorsa harikanın armağanı onun bütün ülkesine. Harika ayrıca saklanmaz:
// sahibi, şehrin sahibidir - şehir el değiştirince harika da değiştirir.
//
// Antik dünyanın yedi harikasından haritaya düşen beşi ve Parthenon. (Zeus heykeli Olympia'da,
// Mozole Halikarnas'ta - ikisi de haritada yerleşim değil.)
//
// Bu dosya hiçbir kural dosyasını içe aktarmaz: state.js, loyalty.js, generals.js ve moves.js
// bunu kullanıyor, döngü olmasın.

export const WONDERS = [
  { id: "pharos", place: "alexandria" }, // İskenderiye Feneri: bütün limanlarda liman kalesi +1
  { id: "pyramids", place: "memphis" }, // Piramitler: bütün yerlerde sadakat turda +2
  { id: "gardens", place: "babylon" }, // Asma Bahçeler: nüfus artışı x1.25
  { id: "artemis", place: "ephesus" }, // Artemis Tapınağı: para x1.1
  { id: "colossus", place: "rhodes" }, // Rodos Heykeli: ticaret x1.5
  { id: "parthenon", place: "athens" }, // Parthenon: generaller iki kat hızlı öğrenir
];

const byWonder = Object.fromEntries(WONDERS.map((w) => [w.id, w]));

/** Bu yerleşimde bir harika var mı: varsa o. */
export const wonderAt = (id) => WONDERS.find((w) => w.place === id) ?? null;

/** Bu medeniyet bu harikayı tutuyor mu. */
export const holds = (state, civ, wonder) => !!civ && state.places[byWonder[wonder].place]?.owner === civ;

/** Bir medeniyetin tuttuğu harikalar. */
export const wondersOf = (state, civ) => WONDERS.filter((w) => holds(state, civ, w.id));
