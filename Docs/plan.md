# Mare Nostrum — Plan

> **Yeni bir oturumda buradan başla.** Sonra `working-on-this.md` (komutlar, düzen, tuzaklar)
> ve gerekirse `kurallar.md` (kuralların asıl kaynağı).
>
> Son güncelleme: **21.10.2026**.

---

## 0. Nasıl çalışıyoruz

- **Kullanıcı:** Unity geliştiricisi, Türkçe konuşuyor. Oyunu keyfi için yapıyor, satış ya da
  portal derdi yok. Tasarımın sahibi o; oyunun çekirdeğini (şehirler, nüfus/sanayi/gıda/kışla,
  sıra tabanlı, otomatik savaş, patikada yürüyen ordular, gerçek harita ve medeniyetler) o
  istedi.
- **Çalışma düzeni (kullanıcının sözü):** "Bana bir şey sormana gerek yok, devam et; büyük
  değişikliklerde git'ten push'la, ben kontrol ederim." Her büyük adımda commit + push, kullanıcı
  canlı sitede bakar. Tasarım kararı gerektiren (yeni kural) şeylerde seçenek sunulur.
- **Yayın:** https://yahyaari.github.io/mare-nostrum/ — depo `yahyaari/mare-nostrum`, GitHub
  Pages `master`'dan, push'tan ~1 dakika sonra yayında.
- **Dil:** Arayüz İngilizce asıl, Türkçe ikinci (sağ üst / menü). Belgeler ve kod yorumları
  Türkçe.
- **Push'tan önce:** `node Tools/test.mjs` (1836 kontrol, hepsi geçmeli). Kurala dokunduysan
  `node Tools/balance.mjs 70`. Arayüze dokunduysan `node Tools/peek.mjs ...` ve
  `node Tools/playtest.mjs ...` (komutlar `working-on-this.md`'de).

---

## 1. Yapılanlar

| Tarih | Adım | Özü |
|---|---|---|
| 20.10 | Tasarım | Kurallar belgesi, 7 medeniyet (Sakalar kullanıcının isteğiyle eklendi), MÖ 270. |
| 20.10 | Harita | Natural Earth kıyıları, nehirler, göller; 45 yerleşim gerçek yerlerinde; kıyıyı izleyen yollar, deniz geçişleri; kaydırma/yakınlaşma. |
| 20.10 | Oynanabilir | Ekonomi (para/silah/yiyecek), 4 yükseltme, asker, ordu, otomatik savaş (ok yağmuru + göğüs göğüse), diplomasi (savaş/ittifak/bozma/barış), bilgisayar rakipler, tur raporu, kazanma/kaybetme, tarayıcıya kayıt. |
| 20.10 | Denge 1 | Zorluk (Kolay/Normal/Zor), surlu büyük şehirler (Siraküza, Atina, Antakya, Babil), tehdit uyarısı, "Sıradaki ordu". |
| 21.10 | Animasyon | Tur şeridi, rakiplerin hamleleri izleniyor, çarpışma, el değiştiren yerin halkası, kamera kayması, telefonda kart düzeni. |
| 21.10 | Derinlik | Sadakat ve isyan; olaylar (veba, hasat, akın, paralı asker, yangın, huzursuzluk, kervan); bilgisayarın teklifleri (ittifak, barış, haraç). |
| 21.10 | Generaller | Tarihî adlar, 5 seviye, 6 yetenek, ordusuyla ölür. |
| 21.10 | Birlikler | Süvari (okçuları biçer), kuşatma makinesi (suru söker). |
| 21.10 | Donanma | Gemiler, deniz yolu için gemi şartı (1 gemi = 25 asker), deniz savaşı, abluka; Kartaca gemi × 1.5. |
| 21.10 | Liman | Balıkçılık, tersane, ticaret, liman kalesi; liman kartı iki sekmeli; Roma liman oldu (Ostia). |
| 21.10 | Yürüyüş | Ordular yol uzunluğuna göre yürüyor, iz bırakıyor; dokunuş önce hızlandırır, sonra bitirir. |

**Şu anki durum (21.10 akşam):** kayıt sürümü 6 (eskiler kendiliğinden yükseltiliyor), 1836 kontrol geçiyor,
70 bot oyununda ilk medeniyetin düşüşü ortalama 51. tur (en erken 25), her oyunda savaş çıkıyor,
"en büyük" çıkan medeniyet oyundan oyuna değişiyor.

---

## 2. Yapılacaklar (kullanıcı "hepsi güzel" dedi)

Kullanıcı 21.10'da 12 önerinin hepsini beğendi. **Öğretici EN SONA** (kullanıcı, 21.10:
"öğreticiyi sona bırakalım, her şey bitsin onların üstüne kuralım"): oyun değiştikçe öğretici
de değişeceği için en son yazılır. **Sıra:**

1. **Görevler** — oyuncuya yön verir ("şimdi ne yapsam" sorusu).
2. **Dünya harikaları** — haritada ele geçirilmeye değer yerler.
3. **Ses ve müzik** — ucuz, hissi çok değiştirir.
4. Sonra: kuşatma, büyüyen şehirler, kronik, savaş sahnesi, sis, arazi/mevsim, aynı cihazda
   iki kişi. (Telefona kurma çıktı: kullanıcı "mobil yok" dedi.)
5. **Öğretici** — en son, her şey bittikten sonra.

**Görünüm (21.10, konuşuluyor):** kullanıcı Total War tarzı boyalı bir arayüz görseli gönderdi
(parşömen panel, boyalı arazi, direkli sancaklar, alt menü, mini harita) ve "böyle bir arayüz
yapabilir miyiz" diye sordu. Bkz. bölüm 2.0.

**Ama önce:** kullanıcıdan 15-20 dakika gerçek oyun istendi (aşağıda, açık riskler 1). Geri
bildirim gelirse sıra ona göre değişir.

### 2.0 Görünüm: Total War tarzı arayüz (kullanıcı ONAYLADI, sırada ilk bu)

**Kullanıcı (21.10): "tamam dediğin gibi yapalım, mobil için yapma, mobil yok".** Oyun artık
yalnızca geniş ekran (masaüstü) için; telefon düzeni yapılmıyor, telefonla denenmiyor.
Aşağıdaki dört aşama sırayla, her biri ayrı push.

Kullanıcının görseli (21.10): Sakalar, Neapolis seçili, Karadeniz. Üstte koyu-altın bant
(sancaklı arma, kaynaklar + değişim, "İlkbahar 12, MÖ 247", menü); solda parşömen şehir paneli
(üstünde liman tablosu, sekmeler, sadakat çubuğu, maliyet düğmeleri); boyalı arazi (dağ, orman,
çöl), yarı saydam ülke renkleri; şehirler direkli sancak + küçük şehir maketi + isim levhası;
altta 5 yuvarlak düğmeli menü (Ordu, Şehirler, Diplomasi, Harita, Görevler); sağ altta mini
harita ve "Turu bitir". Görseldeki şehirlerin hepsi bizde de var.

**1. aşama YAPILDI (21.10):** arazi artık varsayılan (`?terrain` bayrağı kalktı); kesim 4 derece
payla (kenar bandı yok), ton "sönük" (toprak kara, koyu camgöbeği deniz). Topraklar kıvrımlı
sınırlı (`regions.js` wobble), göller delik. `src/view/pieces.js`: armalar (Roma kartal, Kartaca
Tanit, Mısır ankh, Makedonya Vergina güneşi, Partlar yay-ok, Galya tekerlek, Saka geyik,
bağımsız kule), direkli sancak, şehir/kale maketi, isim levhası (Cinzel), asker figürü, gemi.
Yazı tipleri Google Fonts'tan (index.html). Basış sancağa da tutar (`reach`).

**2. ve 3. aşama YAPILDI (21.10):** `src/view/hud.js`: üst bant (asılı sancak, para/buğday/silah/nüfus, MÖ yıl + tur, rapor ve menü madalyonları), alt menü (Ordu ve Şehirler listeleri - yeni pencereler `armies`/`cities`, Diplomasi, Harita = uzaklaş/başkente dön), sağ altta sıradaki ordu, mini harita (basınca oraya kayar), Turu bitir. `kit.js`: parşömen panel (dokulu kâğıt, koyu çerçeve, altın iç çizgi, köşe baklavaları), kabarık kâğıt düğmeler, asıl eylem koyu-altın; yazı EB Garamond (boy x1.12), başlıklar Cinzel. Kartın başında şehrin çevresinin arazisi ve büyük maketi (`drawVignette`, ekranda yer varsa). Renkli kareler yerine armalı kalkan (`shield`). Tur şeridi koyu-altın. 1 tur = 1 yıl (MÖ 270'ten geri).

**4. aşama YAPILDI (21.10):** ormanlık yerlere ağaç kümeleri (`Tools/terrain.py` ham renkten
orman bulur, `src/data/trees.js` 5367 ağaç; uzakta seyrekleşir, yerleşim dibinde yok). Fare
üstüne gelince düğme/madalyon/levha parlar, imleç el olur (`kit.pointer`, `main.js hoverAt`).
Durağan katman ekrandan %30 büyük çiziliyor, kaydırırken sadece yeri değişiyor (başsız Edge'de
kaydırma iki karede 58 ms'den 33 ms'ye = 60 kare/sn). Karartma ayrı, ekrana sabit.

**Donanma görünüşü (21.10, kullanıcı: "gemiler denizlerde donanma olarak gözüksün, kara ordusu gibi değil, denizden yürüsün"):** gemili ordu limanda denizde filo (1-3 kadırga, `pieces.galley/fleet`), deniz yolunda kadırga olarak yüzer (yönüne bakar, köpük izi), karada asker; limanda bekleyen gemiler demirli, yelkeni sarılı. Limanın denize bakan yönü kıyı verisinden (`draw.js seaDir`). Kural düzeltmesi: askersiz filo artık denize açılır, karadan yürümez (`canSail`, `moves.canUse`; kurallar.md 15).

**Görünüm bitti.**

**Görevler YAPILDI (21.10, kullanıcı "devam et"):** `src/rules/missions.js`, kurallar.md 17. Sekiz tür (sefer, donanma, dostluk, bayındırlık, büyük ordu, komutan, huzur, savunma), meclis adları medeniyete göre (Sakalarda Kurultay), kabul/ret penceresi, alt menüde Görevler listesi, haritada hedef madalyonu, yapılınca anında ödül. Görev zarı ayrı (`state.mrng`): dünya aynı yürür. 41 yeni kontrol.

**Dünya harikaları YAPILDI (21.10):** `src/rules/wonders.js`, kurallar.md 18. Altı harika (Fener ve Piramitler Mısır'ın, Asma Bahçeler/Babil, Artemis/Efes, Rodos Heykeli, Parthenon/Atina bağımsız); şehri tutanın bütün ülkesine armağan. Haritada altın tapınak madalyonu, kartta satır, raporda haber. 15 yeni kontrol (1836). Denge: ilk düşüş 52 → 61. **Sırada: Ses ve müzik** (2.4).

**İlk deneme:** `?terrain` / `?terrain&natural` — Natural Earth II 1:10m boyalı arazi
(kamu malı), `Tools/terrain.py` ile kesilip parşömen tonuna çekildi, `assets/terrain.jpg`
(3355×1560, ~800 KB). Kıyılarımızla aynı veri olduğu için birebir oturuyor; en yakın zumda bile
yeterince net. Eksik: kamera haritanın dışını gösterince arazi bitiyor (üst/alt bant) → kesimi
birkaç derece payla yap ya da dışını çerçeveyle kapat.

**Değerlendirme:**
- Kodla yapılır: üst bant, alt menü, mini harita, Turu bitir, parşömen dokusu, altın çerçeve,
  direkli sancak, isim levhası, yazı tipi (Cinzel/EB Garamond gibi, Türkçe harfleri olan),
  şehir/kale/liman için çizgi maket, asker figürü, dağ/ağaç simgeleri.
- Ressam işi (kodla aynısı olmaz): elle boyanmış 3B şehir maketleri, paneldeki liman tablosu.
  Yol: ya çizgi/vektör sade hâli, ya kullanıcı yapay zekâ ile resim üretir ben yerleştiririm
  (şeffaf arka plan, aynı açı ve ışık).
- Telefon: sol panel + alt menü + mini harita dikey ekrana sığmaz; telefonda panel alttan
  açılan sayfa olur.
- Önerilen aşamalar: (1) arazi + ülke renkleri + sancaklar, (2) çerçeve: üst bant, alt menü,
  mini harita, yazı tipi, (3) panel: parşömen + sekmeler, (4) süs: ağaçlar, maketler, resimler.

### 2.1 Öğretici (EN SONA alındı)

- İlk oyunda (ya da menüden "Öğretici") ilk ~6 turda adım adım balonlar: şehrine bas → tarla
  yükselt → asker bas → ordu çıkar → orduya bas, yanındaki gri şehre bas → saldır → turu bitir.
  Sonra: deniz yolları ve gemi, diplomasi, sadakat.
- Her adım bir koşulla ilerler (oyunun durumuna bakarak: "Roma'nın tarlası 2 mi?"), bir ok ya da
  halka ilgili düğmeyi gösterir. Geç / kapat düğmesi.
- Kolay zorlukta önerilsin. Kural katmanına dokunmaz; `ui` durumunda bir adım sayacı.

### 2.2 Görevler (Rome TW'deki senato görevleri gibi)

- Birkaç turda bir bir görev gelir (karar penceresi gibi, ama kapatılabilir; aynı anda en fazla
  bir-iki). Süresi ve ödülü var.
- Örnek türler: "X'i N turda al" (komşu bağımsız ya da düşman yer), "N gemilik filo kur",
  "Y ile ittifak kur", "Z şehrini seviye 3'e çıkar", "Haraç ödemeden N tur dayan", "Bir generali
  3. seviyeye çıkar".
- Ödül: para, silah, paralı asker, bedava general; bazen sadakat. Başarısızlıkta ceza yok ya da
  küçük (sadakat −5).
- Kural katmanında (`src/rules/missions.js`), seçim tohumlu rastgele; bilgisayarlar görev almaz.
  Test: her görev türünün tamamlanma koşulu ve ödülü.

### 2.3 Dünya harikaları

- Belirli şehirlere bağlı, o şehri elinde tutanın bonusu:
  - **İskenderiye Kütüphanesi** (İskenderiye): generaller iki kat tecrübe kazanır.
  - **İskenderiye Feneri** (İskenderiye): bütün limanlarına liman kalesi +1 gibi.
  - **Rodos Heykeli** (Rodos): ticaret × 1.5 her limanda.
  - **Parthenon** (Atina): bütün şehirlerinde sadakat +3/tur.
  - **Babil'in Asma Bahçeleri** (Babil): nüfus artışı × 1.25.
  - **Kartaca'nın Kothon limanı** (Kartaca): tersane hakkı +1, gemi ucuz.
  - **Roma Forumu** (Roma): para × 1.1 ya da asker maliyeti azalır.
  - (Belki inşa edilebilir harikalar da: pahalı, birkaç tur sürer.)
- Haritada harika olan şehirde küçük bir simge; şehir kartında satır; tur raporunda "X harikayı
  ele geçirdi".
- Denge: harikalar bilgisayarı da güçlendirir; 70 oyunla ölçülmeli.

### 2.4 Ses ve müzik

- Shadow Tower'daki gibi kodla üretilen (WebAudio) sesler: yürüyüş davulu, kılıç çarpışması,
  dalga, gemi, tur geçişinde kısa fanfar, yükseltme "tık"ı. Müzik: sade bir drone + seyrek
  notalar, savaşta gerilim artar.
- Menüde ses/müzik aç-kapa. İlk dokunuşa kadar ses başlamaz (tarayıcı kuralı).

### 2.5 Kuşatma

- Surlu yere (kale, başkent, seviye 3+ şehir) saldırı ya hemen (bugünkü gibi) ya da "kuşat":
  ordu yerin önünde durur, her tur içerideki asker açlıktan erir (%10) ve sadakat düşer; kuşatma
  makinesi süreyi kısaltır. Kuşatma kalkarsa erime durur.
- Kaleleri gerçekten zor lokma yapar. Bilgisayarın da kuşatmayı kullanması gerekir.

### 2.6 Arazi ve mevsim

- Nehir geçen yollarda saldırana ceza (× 0.85), dağ geçitlerinde savunana bonus. (Yollara
  `river`/`pass` işareti; haritada küçük simge.)
- Mevsim: her 4 turda bir kış; kışın deniz yolları tehlikeli (gemi kaybı ihtimali), kara yolları
  yavaş değil ama ordu yıpranır (%3).

### 2.7 Savaş sisi

- Sadece kendi topraklarının ve ordularının 1-2 yol yakınını görürsün; ötesindeki ordular ve
  garnizonlar görünmez (yerleşimler görünür, sahipleri bilinir).
- Saldırı tahmini görünmeyen yerde "bilinmiyor" olur. Bilgisayar hile yapmaz mı? (Basitlik için
  bilgisayar her şeyi görebilir; sadece oyuncu sisli.)

### 2.8 Görsel: savaş sahnesi, büyüyen şehirler, kronik

- **Savaş sahnesi:** savaş penceresinde 2-3 saniyelik çizgi asker çarpışması (iki sıra, ok
  yağmuru, süvari hücumu), sonuç sayıları.
- **Büyüyen şehirler:** işaret seviyeyle büyür (kule sayısı), limanda gemi silüeti, harika simgesi.
- **Kronik:** oyun sonunda topraklarının tur tur grafiği, önemli olayların zaman çizelgesi
  (`state` her tur küçük bir özet saklar).

### 2.9 Platform

- **Telefona kurma (PWA):** manifest + service worker; ana ekrana eklenir, internetsiz açılır.
- **Aynı cihazda iki kişi (hotseat):** birden çok oyuncu medeniyeti; tur sırası; ekranda "Sıra
  Kartaca'da" geçiş ekranı. Kural katmanı tek oyuncu varsayıyor (`state.player`); en büyük iş bu.

---

## 3. Açık riskler ve bilinenler

1. **Hiçbir insan oynamadı.** Bütün denge bot ölçümü (bilgisayar kendi kendine). Kullanıcıdan
   15-20 dakika oynayıp "sıkıcı / zor / anlaşılmayan" söylemesi istendi (21.10), henüz cevap yok.
2. **Normal zorluk zor olabilir.** Test oyuncusu (zayıf bir oyuncu) normalde 20-35. turda sık sık
   düşüyor. Kolay öneriliyor.
3. **Limansız medeniyetler** (Galya, Partlar) liman yapılarından yararlanamıyor. Ölçümde şimdilik
   sorun değil (Partlar sık sık en büyük), izlenmeli.
4. **Mısır** hâlâ en sık büyüyenlerden.
5. **Dünyanın donması:** güçler dengelenince bilgisayarlar savaşmayı bırakabiliyor; çare
   zamanla düşen savaş eşiği (1.5 → 1.1). Yeni sistemler eklerken `balance.mjs` ile her oyunda
   savaş çıktığına bakılmalı (test.mjs de bakıyor).
6. **Ölçüm gürültüsü:** 28 oyun aynı sürüme bir 56 bir 41 dedi. Denge kararları 70 oyunla;
   değişkenleri tek tek ayır (bir keresinde süvari suçlandı, sebep okçu payıydı).
7. **Bu makinede bash tuzağı:** heredoc ya da `node -e` içinde kesme işareti (Türkçe "Roma'nın")
   komutu bozuyor. Çok satırlı düzenlemeler `Logs/x.cjs` gibi bir dosyaya Write ile yazılıp
   `node` ile çalıştırılır; tek değişiklik için Edit.

---

## 4. Ölçüm araçları (Tools/)

| Komut | Ne |
|---|---|
| `node Tools/test.mjs` | Bütün kontroller (kurallar, harita, denge değişmezleri, animasyon) |
| `node Tools/balance.mjs 70` | 70 bot oyunu: ilk düşüş, her medeniyetin ayakta kalması |
| `node Tools/who.mjs rome 35` | Bir medeniyetin yerlerini kim alıyor |
| `node Tools/strength.mjs .` | 20. turda ortalama güç, yer, gelir, gemi |
| `node Tools/diverge.mjs <kök>` | İki sürümü aynı tohumla oynatıp ilk ayrılığı bulmak için |
| `node Tools/bot.mjs 7 150` | 7 oyunun kısa özeti |
| `node Tools/peek.mjs http://localhost:8060/ Logs/peek 1280 720` | Ekran fotoğrafları (telefon: 390 844) |
| `node Tools/playtest.mjs "http://localhost:8060/?seed=31" carthage 40 normal` | Tarayıcıda, düğmelere basarak oynayan test |
| `node Tools/film.mjs` | Bir yürüyüşün film şeridi |

Sunucu: `node Tools/serve.mjs . 8060`. Oyunda `?seed=123` aynı oyunu kurar.
