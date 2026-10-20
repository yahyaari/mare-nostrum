// Harita: medeniyetler, yerleşimler, yollar. Hiç değişmez (Docs/kurallar.md, bölüm 2).
//
// Koordinatlar gerçek: enlem, boylam. Bir yerleşimin karada, bir limanın kıyıda, bir kara
// yolunun denizden geçmediğini Tools/test.mjs, ekranda çizilen kıyıların aynısıyla ölçüyor.

export const CIVS = [
  { id: "rome", name: { en: "Rome", tr: "Roma" }, color: "#b0302a" },
  { id: "carthage", name: { en: "Carthage", tr: "Kartaca" }, color: "#6b3b8e" },
  { id: "egypt", name: { en: "Egypt", tr: "Mısır" }, color: "#c08a1e" },
  { id: "macedon", name: { en: "Macedon", tr: "Makedonya" }, color: "#2f5f9e" },
  { id: "parthia", name: { en: "Parthia", tr: "Partlar" }, color: "#a2531f" },
  { id: "gaul", name: { en: "Gaul", tr: "Galyalılar" }, color: "#4f7f2a" },
  { id: "saka", name: { en: "Saka", tr: "Sakalar" }, color: "#1f8a9a" },
];

// Bağımsız yerleşimlerin rengi. Bir medeniyet değil, `owner: null`.
export const FREE_COLOR = "#8c8780";

const P = (id, en, tr, lat, lon, kind, extra = {}) => ({
  id, name: { en, tr }, lat, lon, kind, port: false, owner: null, capital: false, ...extra,
});
const port = { port: true };
const own = (owner, more = {}) => ({ owner, ...more });
const cap = (owner, more = {}) => ({ owner, capital: true, ...more });

export const PLACES = [
  // Roma
  P("rome", "Rome", "Roma", 41.89, 12.49, "city", cap("rome")),
  P("tarentum", "Tarentum", "Tarentum", 40.47, 17.24, "city", own("rome", port)),
  P("ariminum", "Ariminum", "Ariminum", 44.06, 12.57, "castle", own("rome")),
  // Kartaca
  P("carthage", "Carthage", "Kartaca", 36.85, 10.32, "city", cap("carthage", port)),
  P("gades", "Gades", "Gades", 36.53, -6.21, "city", own("carthage", port)),
  P("lilybaeum", "Lilybaeum", "Lilybaion", 37.82, 12.48, "castle", own("carthage", port)),
  // Mısır
  P("alexandria", "Alexandria", "İskenderiye", 31.20, 29.92, "city", cap("egypt", port)),
  P("memphis", "Memphis", "Memphis", 29.85, 31.25, "city", own("egypt")),
  P("jerusalem", "Jerusalem", "Kudüs", 31.78, 35.23, "castle", own("egypt")),
  // Makedonya
  P("pella", "Pella", "Pella", 40.76, 22.52, "city", cap("macedon")),
  P("demetrias", "Demetrias", "Demetrias", 39.36, 22.93, "city", own("macedon", port)),
  P("corinth", "Corinth", "Korint", 37.91, 22.88, "castle", own("macedon")),
  // Partlar
  P("hecatompylos", "Hecatompylos", "Hekatompylos", 36.20, 54.40, "city", cap("parthia")),
  P("rhagae", "Rhagae", "Rhagae", 35.59, 51.44, "city", own("parthia")),
  P("nisa", "Nisa", "Nisa", 37.95, 58.21, "castle", own("parthia")),
  // Galyalılar
  P("bibracte", "Bibracte", "Bibracte", 46.92, 4.04, "city", cap("gaul")),
  P("lutetia", "Lutetia", "Lutetia", 48.85, 2.35, "city", own("gaul")),
  P("gergovia", "Gergovia", "Gergovia", 45.71, 3.12, "castle", own("gaul")),
  // Sakalar
  P("neapolis", "Neapolis", "Neapolis", 44.95, 34.10, "city", cap("saka")),
  P("olbia", "Olbia", "Olbia", 46.69, 31.83, "city", own("saka", port)),
  P("tanais", "Tanais", "Tanais", 47.27, 39.33, "castle", own("saka")),

  // Bağımsızlar: Yunan şehir devletleri, Seleukos toprakları, kıyıdaki ticaret şehirleri.
  P("syracuse", "Syracuse", "Siraküza", 37.07, 15.29, "city", port),
  P("caralis", "Caralis", "Karalis", 39.22, 9.11, "city", port),
  P("massalia", "Massalia", "Massalia", 43.30, 5.37, "city", port),
  P("mediolanum", "Mediolanum", "Mediolanum", 45.46, 9.19, "city"),
  P("numantia", "Numantia", "Numantia", 41.81, -2.44, "castle"),
  P("saguntum", "Saguntum", "Saguntum", 39.68, -0.27, "city", port),
  P("tingis", "Tingis", "Tingis", 35.77, -5.80, "city", port),
  P("cirta", "Cirta", "Cirta", 36.37, 6.61, "castle"),
  P("leptis", "Leptis Magna", "Leptis Magna", 32.61, 14.26, "city", port),
  P("cyrene", "Cyrene", "Kirene", 32.82, 21.86, "city", port),
  P("epidamnos", "Epidamnos", "Epidamnos", 41.33, 19.50, "city", port),
  P("athens", "Athens", "Atina", 37.98, 23.73, "city", port),
  P("sparta", "Sparta", "Sparta", 37.08, 22.43, "castle"),
  P("byzantium", "Byzantium", "Bizans", 41.05, 28.93, "city", port),
  P("odessos", "Odessos", "Odessos", 43.21, 27.91, "city", port),
  P("ephesus", "Ephesus", "Efes", 37.94, 27.34, "city", port),
  P("rhodes", "Rhodes", "Rodos", 36.37, 28.19, "city", port),
  P("ancyra", "Ancyra", "Ankyra", 39.93, 32.86, "castle"),
  P("sinope", "Sinope", "Sinop", 42.00, 35.09, "city", port),
  P("mazaka", "Mazaka", "Mazaka", 38.72, 35.49, "castle"),
  P("antioch", "Antioch", "Antakya", 36.20, 36.16, "city", port),
  P("babylon", "Babylon", "Babil", 32.54, 44.42, "city"),
  P("ecbatana", "Ecbatana", "Ekbatana", 34.80, 48.52, "city"),
  P("artaxata", "Artaxata", "Artaşat", 39.95, 44.55, "castle"),
];

// Yollar. `sea` deniz geçişi (iki liman arası, kesik çizgi). `via` yolun kıvrıldığı
// ara noktalar [enlem, boylam]: düz çizgi denizden geçecekse kıyıyı izlesin diye.
const R = (a, b, via = []) => ({ a, b, sea: false, via });
const S = (a, b, via = []) => ({ a, b, sea: true, via });

export const ROADS = [
  // İberya ve Galya
  R("gades", "numantia"),
  R("gades", "saguntum"),
  R("numantia", "saguntum"),
  R("saguntum", "massalia", [[41.58, 1.33], [43.68, 3.83], [43.38, 5.43]]),
  R("numantia", "gergovia"),
  R("lutetia", "bibracte"),
  R("bibracte", "gergovia"),
  R("bibracte", "massalia"),
  R("bibracte", "mediolanum"),
  R("massalia", "mediolanum"),
  // İtalya ve Sicilya
  R("mediolanum", "ariminum"),
  R("ariminum", "rome"),
  R("rome", "tarentum"),
  R("syracuse", "lilybaeum"),
  // Afrika
  R("tingis", "cirta", [[34.97, -4.3], [35.17, 0.4]]),
  R("cirta", "carthage"),
  R("carthage", "leptis", [[33.81, 10.02], [32.71, 12.32]]),
  R("leptis", "cyrene", [[31.11, 16.06], [30.11, 19.26], [31.11, 20.46]]),
  R("cyrene", "alexandria", [[31.9, 23.96], [31.4, 25.66], [30.7, 29.26]]),
  R("alexandria", "memphis"),
  R("memphis", "jerusalem"),
  R("jerusalem", "antioch", [[35.08, 36.13]]),
  // Yunanistan ve Trakya
  R("epidamnos", "pella"),
  R("pella", "demetrias", [[39.96, 22.52]]),
  R("demetrias", "athens", [[38.88, 22.53]]),
  R("athens", "corinth", [[38.11, 23.18]]),
  R("corinth", "sparta"),
  R("pella", "byzantium", [[41.16, 26.72]]),
  R("byzantium", "odessos", [[41.65, 28.01], [42.55, 27.41]]),
  // Karadeniz'in kuzeyi
  R("odessos", "olbia", [[45.31, 29.11], [46.71, 30.81], [46.81, 31.71]]),
  R("olbia", "neapolis", [[46.65, 32.53], [46.05, 33.73]]),
  R("neapolis", "tanais", [[46.35, 34.9], [47.25, 38], [47.35, 39.3]]),
  // Anadolu
  R("byzantium", "ephesus", [[41.14, 27.54], [40.44, 26.64], [40.34, 26.74]]),
  R("byzantium", "ancyra"),
  R("ephesus", "ancyra"),
  R("ancyra", "sinope"),
  R("ancyra", "mazaka"),
  R("mazaka", "sinope"),
  R("mazaka", "antioch", [[36.6, 36.29]]),
  R("mazaka", "artaxata"),
  // Doğu
  R("antioch", "babylon"),
  R("babylon", "ecbatana"),
  R("ecbatana", "rhagae"),
  R("rhagae", "hecatompylos"),
  R("hecatompylos", "nisa"),
  R("ecbatana", "artaxata"),
  R("artaxata", "tanais"),
  // Deniz geçişleri
  S("gades", "tingis", [[36.27, -6.21]]),
  S("massalia", "caralis", [[38.72, 8.77], [39.12, 9.17]]),
  S("caralis", "carthage", [[36.85, 10.41]]),
  S("tarentum", "syracuse", [[38.87, 17.19]]),
  S("lilybaeum", "carthage"),
  S("tarentum", "epidamnos", [[40.07, 17.64], [39.67, 18.34]]),
  S("athens", "ephesus", [[37.64, 23.83], [37.64, 24.13], [38.14, 24.93]]),
  S("ephesus", "rhodes", [[37.37, 26.74], [36.57, 26.94]]),
  S("rhodes", "alexandria"),
];
