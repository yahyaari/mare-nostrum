// Dünya harikaları (kurallar.md bölüm 18): bazı şehirlerde antik dünyanın harikaları var. O
// şehri kim tutuyorsa harikanın armağanı onun bütün ülkesine. Harika ayrıca saklanmaz:
// sahibi, şehrin sahibidir - şehir el değiştirince harika da değiştirir.
//
// Antik dünyanın yedi harikasından haritaya düşen beşi ve Parthenon. (Zeus heykeli Olympia'da,
// Mozole Halikarnas'ta - ikisi de haritada yerleşim değil.)
//
// İnşa edilen harikalar (kullanıcı 23.10, "harikaları inşa etme yarışı"; Civilization gibi):
// araştırmayla açılır, seviyesi 3'ü bulmuş bir şehirde bir inşaatçıyla `turns` tur sürer, parası
// başta ödenir (state.js wonderInfo / startWonder). Herkes aynı anda yapabilir; ilk bitiren alır,
// yarışı kaybedenlerin parasının yarısı geri döner. Bittiği şehirde durur (`state.built`): şehir
// el değiştirince harika da değiştirir, antik harikalar gibi.
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

// İnşa edilebilenler, ucuzdan pahalıya: istediği teknoloji, bedeli (para), süresi (tur).
export const BUILDABLE = [
  { id: "oracle", needs: null, cost: 140, turns: 10 }, // Delfi Kahini: araştırdığın teknoloji hemen biter
  { id: "library", needs: "writing", cost: 200, turns: 12 }, // Büyük Kütüphane: bilim x1.25
  { id: "treasury", needs: "currency", cost: 220, turns: 12 }, // Büyük Hazine: para x1.15
  { id: "harbour", needs: "harbours", cost: 220, turns: 12, port: true }, // Büyük Liman: filo x1.2, ticaret x1.2
  { id: "aqueduct", needs: "engineering", cost: 280, turns: 14 }, // Büyük Su Kemeri: nüfus artışı x1.25
  { id: "colosseum", needs: "mathematics", cost: 340, turns: 16 }, // Kolezyum: her yerde sadakat turda +3
];

/** Bütün harikalar: antikler ve inşa edilebilenler. */
export const ALL_WONDERS = [...WONDERS.map((w) => w.id), ...BUILDABLE.map((w) => w.id)];

const byWonder = Object.fromEntries(WONDERS.map((w) => [w.id, w]));
export const buildableById = Object.fromEntries(BUILDABLE.map((w) => [w.id, w]));

/** Bu yerleşimde antik bir harika var mı: varsa o. (İnşa edilenler için wondersAt.) */
export const wonderAt = (id) => WONDERS.find((w) => w.place === id) ?? null;

/** Harikanın durduğu yer: antikler sabit, inşa edilenler `state.built`te (yapılmadıysa null). */
export const placeOfWonder = (state, wonder) => byWonder[wonder]?.place ?? state.built?.[wonder] ?? null;

/** Bu medeniyet bu harikayı tutuyor mu. */
export const holds = (state, civ, wonder) => {
  const p = placeOfWonder(state, wonder);
  return !!civ && !!p && state.places[p]?.owner === civ;
};

/** Bir medeniyetin tuttuğu harikalar: [{ id, place }]. */
export const wondersOf = (state, civ) => ALL_WONDERS.filter((w) => holds(state, civ, w)).map((id) => ({ id, place: placeOfWonder(state, id) }));

/** Bir yerleşimdeki bütün harikalar (antik ve inşa edilen): [{ id, place }]. */
export const wondersAt = (state, id) => ALL_WONDERS.filter((w) => placeOfWonder(state, w) === id).map((w) => ({ id: w, place: id }));
