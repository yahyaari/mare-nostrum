# Mare Nostrum — Plan

> **Yeni bir oturumda buradan başla.** Sonra `working-on-this.md` (komutlar, düzen, tuzaklar)
> ve gerekirse `kurallar.md` (kuralların asıl kaynağı).
>
> Son güncelleme: **22.10.2026 gece** (auto-compact öncesi notlar).

## NEREDE KALDIK (22.10 gece) - önce bunu oku

**Durum:** detaylı oyun (tarla/sanayi/kışla/liman yapıları, sadakat, olaylar, görevler,
generaller, kuşatma, harikalar, mevsim, sis) + bugün eklenenler. Son commit `fe28dda`, push'landı.
1924 kontrol geçiyor. Kayıt sürümü 8. Kullanıcı son durumdan memnun ("tamam güzel olmuş").

**22.10'da yapılanlar (sırayla, hepsi push'lı):**
1. Sadeleşme denendi (8728c03) ve kullanıcı istemedi -> detaylı kurallar geri (3782d63). DERS:
   anlaşılmazlığın çaresi sistem kesmek değil, anlatmak / kontrol / tepki.
2. Seçim kartı ALTTA ORTADA (Total War gibi), yatay sütunlu: şehir | yükseltmeler (Şehir/Liman
   sekmeli) | asker ya da gemi. Kart açıkken alt menü gizli; seçilen yer kartın üstüne kayar.
3. Kontrol: sol tık seçer, SAĞ TIK yürütür/saldırtır; üstüne gelince yol + kaç tur; ipuçları
   (her düğme/kaynak/yer/ordu); tur sonu haberleri sağ üstte (rapor penceresi yok); pencere
   açılış geçişi; basılı düğme çöker; Enter turu bitirir, Tab sıradaki ordu.
4. Medeniyet seçimi Bannerlord gibi (5e33c61): solda sancaklar, sağda tek medeniyet paneli
   (başkenti + askerleri görseli, tarihçe, ▲▼, başlangıç toprakları ve ordusu), ‹ › / ← →,
   harita arkada o medeniyete süzülür (`camera.pad` ile kenardakiler de ortaya gelir).
5. Kamera akıcı (d934802): kıpırdarken durağan katman ölçeklenir, gerekirse yarım çözünürlükte,
   durunca keskin. `node Tools/fps.mjs` ölçer.
6. Yardım duvarı yerine ipucu balonları (eb0e7e9): tek balon, atan altın çerçeve, oyuncu yapınca
   geçer; menüde İpuçları aç/kapa; Nasıl oynanır 8 sayfa.
7. Tur gösterisi (18a0d9c): Turu bitir -> kamera bütün dünyaya uzaklaşır, rakipler oynar (şerit,
   sisteki savaşa kızıl parıltı), kamera oyuncunun yerine döner. (Önce durak durak gezen hâli
   yapıldı, kullanıcı "uzaktan tüm dünya" istedi.)
8. İnşaatçılar (a30c6b6): şehirde 2, kalede 1; süre gidilen seviye kadar tur (seviye/kışla/
   tersane +1); para başta, iptalde geri; kuşatmada durur; el değişince yıkılır.
9. Denge (fe28dda): inşaatçılarla ilk düşüş 50 -> 29 oldu (sebep: yükseltme aynı tur işe
   yaramıyor). Kullanıcının önerisiyle küçüklere başta fazladan asker + yiyecek: Galya 40+20,
   Partlar 55+30, Sakalar 35+20. Şimdi ilk düşüş 44, hayatta kalma eskisine yakın.

**Sırada:** kullanıcı oynayıp söyleyecek. Önerilenler: arkadaşlarla oynama (aynı bilgisayarda
sıra ile - hotseat; kural katmanı tek oyuncu varsayıyor: `state.player`), şehir panelinin
zenginleşmesi; öğretici EN SONDA (ipucu balonları şimdilik onun hafif hâli).

**Bu makinede tuzaklar (bugün yaşandı):** `git checkout <commit> -- dosyalar` dosyaları CRLF
getiriyor (autocrlf) -> metin eşleyen yama betikleri tutmuyor; önce `node Logs/lf.cjs` ile LF.
Yama betikleri Write ile `Logs/*.cjs`e (kesme işareti heredoc'u bozuyor); Write içeriğinde
\` yazma, düz ` yaz. `grep '\\`'` her satırı eşler (GNU grep'te başlangıç çapası), `grep -F` kullan.
Ekran görüntüsü betikleri `Logs/*shots*.mjs` (gitignore'da) - sunucu `node Tools/serve.mjs`.


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
- **Push'tan önce:** `node Tools/test.mjs` (1924 kontrol, hepsi geçmeli). Kurala dokunduysan
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

**Şu anki durum (21.10 akşam):** kayıt sürümü 7 (eskiler kendiliğinden yükseltiliyor), 1897 kontrol geçiyor,
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

**Dünya harikaları YAPILDI (21.10):** `src/rules/wonders.js`, kurallar.md 18. Altı harika (Fener ve Piramitler Mısır'ın, Asma Bahçeler/Babil, Artemis/Efes, Rodos Heykeli, Parthenon/Atina bağımsız); şehri tutanın bütün ülkesine armağan. Haritada altın tapınak madalyonu, kartta satır, raporda haber. 15 yeni kontrol (1836). Denge: ilk düşüş 52 → 61.

**Ses ve müzik YAPILDI (21.10):** `src/view/sound.js`, dosyasız (WebAudio, kodla). Efektler: düğme tıkı, yükseltmede çekiç+çan, asker basmada ayak, ordu çıkınca davul, gemi suya iner, yürüyüşte davul / denizde kürek, çarpışmada kılıç, yer el değiştirince boru, tur geçişinde boru çağrısı, zafer/yenilgi ezgisi, görevde zil, mektupta kâğıt, savaş ilanında ağır davul, oyunlarda kalabalık. Animasyon sesleri `anim.cues()` ile animasyonun kendi saatinden (hızlanınca erken, atlanınca sessiz). Müzik: D-A dem sesi + D Dor dizisinde seyrek lir notaları, yankılı; oyuncu savaştaysa altta yavaş davul. Menüde Ses / Müzik aç-kapa (tarayıcıda saklanır). Ölçüm: `node Tools/soundcheck.mjs` çevrimdışı ses bağlamına çaldırıp dalga ölçüldü (sessiz/kapalı 0, efektler tepe 0.19 patlamasız, müzik notalı, savaşta davul).

**Savaş sisi ve süsler YAPILDI (21.10, kullanıcı "fog ve görsel güzellikler"):** kurallar.md 19. `rules/sight.js` (kendi+müttefik yer ve orduların bir yol ötesi), `view/atlas.js` (sis dokusu haritaya bağlı, dost toprak yumuşak kenarla açık; Latince deniz/bölge adları; pusula gülü; bulut gölgeleri sprite ile). Sancaklar dalgalanır; harita 20 kare/sn canlı. Menüde Savaş sisi aç-kapa. 8 yeni kontrol (1844). Tarayıcıda: sis uzak orduyu saklıyor, görülen ordu görünüyor, sis kapalıyken hepsi görünüyor (`Tools/fogcheck.mjs` - ilk denemede kamera kaymasını beklemediğim için yanlış ölçtü).

**Kuşatma YAPILDI (21.10, kullanıcı "devam et"):** `rules/siege.js`, kurallar.md 20. Surlu yere Saldır / Kuşat / Vazgeç; kamp hedefin yolunda çadırlarla, hedefte kırmızı halka; turda %10 erime (makineyle +%2/10, en çok %25), üretim yok, sadakat −5, kamp −%3; teslim; yürüyünce/saldırınca/barışta kalkar. Bilgisayar sadece "zor" hedefi kuşatır (dengeyi bu tuttu: ilk düşüş 51). 21 yeni kontrol (1865). Ordu alanı `besieging` (`siege` kuşatma makinesi sayısı - isim çakışmasına dikkat).

**Büyüyen şehirler YAPILDI (21.10):** maket seviyeyle büyür (`pieces.cityModel(…, level)`): 1 ahşap çit + iki ev, 2 taş sur + iki kule, 3 arka sıra evler + ortada yüksek kule, 4+ geniş sur + dört kule ve bir boy büyük; kale 2. seviyede ikinci kule. Kartın manzarası da seviyeyi gösterir.

**Kronik YAPILDI (22.10):** `rules/chronicle.js`, kurallar.md 21. Tur tur yer/asker grafiği + yıllık (menüden ve oyun sonundan). Kayıt sürümü 7. 15 yeni kontrol (1880).

**Savaş sahnesi YAPILDI (22.10):** `view/battle.js`. Savaş sonucu penceresinin üstünde 2.9 sn: okçular ok yağdırır, süvari hücum eder, saflar çarpışır, kayıp oranında figür düşer, kaybeden çekilir, kazananın sancağı yükselir; surlu yerde savunanlar mazgallı burcun ardında; ordu battıysa denizde kadırgalar batar. Sesler sahneyle senkron (ok vızıltısı, kılıç, sonuç). Rastgele değil: aynı savaş hep aynı oynar.

**Arazi ve mevsim YAPILDI (22.10):** `rules/ground.js` (nehir geçişleri harita verisinden hesaplanır, 14 yol; 12 dağ geçidi elle), `rules/season.js` (tur = mevsim, 4 tur = yıl; kışın denizde %25 fırtına, ordular %3 yıpranır), kurallar.md 22. Haritada geçit tepeleri, köprüler, kışın beyaz örtü ve kar; üst bantta mevsim. 17 yeni kontrol (1897). Denge: ilk düşüş 50; Sakalar 27/70 ayakta (izlenecek).

**Sadeleşme denendi, geri alındı (22.10):** kullanıcı oyunu "ham" buldu (ne olduğunu anlamıyorum,
kontrol hantal, tepki az) ve "basit olsun" dedi; oyun altın + yemek, tek Geliştir, üç birlik
olarak sadeleştirildi (commit 8728c03). Kullanıcı oynayınca: **"eski şeyimiz daha güzeldi:
kışla yükselt, tarla yükselt, balıkçı yap, tersane yap, kaleyi güçlendir, askerler kışla
seviyesine göre gelişiyordu"** - detaylı kurallar geri geldi (`detayli-surum` etiketi). Ders:
anlaşılmazlığın çaresi sistem kesmek değil, anlatmak. Sade sürümden kalanlar (detaylı oyunun
üstünde):
- **Panel altta ortada** (kullanıcı: "panel yine aşağıda ortada kalsın"): şehir | yükseltmeler
  (Şehir/Liman sekmeli) | asker ya da gemi. Yabancı yer ve ordu kartları da öyle.
- **Sol tık seçer, sağ tık yürütür/saldırtır;** üstüne gelince yol önizlemesi ve tur sayısı.
- **İpuçları** (kaynaklar, düğmeler, yükseltmeler, yerler, ordular; kapalı düğmenin nedeni).
- **Tur sonu haberleri** sağ üstte, rapor penceresi araya girmiyor; pencereler süzülerek açılıyor;
  düğmeler basılınca çöküyor; Enter / Tab.

**Medeniyet seçim ekranı (22.10, kullanıcı: "Bannerlord'un açılış ekranı gibi, slayt, panelde
tek medeniyet, görsel, bonus ve kötü özellik, harita arkada o bölgeye gitsin"):** solda yedi
asılı sancak, sağda tek medeniyetin paneli: görsel (başkenti kendi arazisinde, iki yanında
kendi askerleri - Roma lejyonu, Partların atlı okçuları, Sakaların atlıları), ad, Latince/
lakap alt başlık, kısa tarihçe, ▲ güçlü ▼ zayıf yan, başlangıç toprakları; ‹ › ve noktalar,
klavyede ← → ve Enter. Harita arkada o medeniyetin topraklarına süzülür, yerleri altın halkalı;
kenardaki medeniyet (Partlar) için kamera panelin arkasına taşabilir (`camera.pad`), verinin
bittiği yer koyu örtülür. Panel içeriği kadar uzun, büyük ekranda görsel büyür.

**Kamera hareketinde kare kaybı düzeldi (22.10, kullanıcı: "kamera hızlı hareket ederken fps
düşüyor, medeniyet değişince ve yakınlaştırırken"):** durağan katman (arazi, ağaçlar, topraklar,
adlar; ekranın 2.5 katı tuval) yakınlık her değiştiğinde baştan boyanıyordu. Şimdi kamera
kıpırdarken eski katman ölçeklenip kaydırılıyor; ekranı örtmez olursa yarım çözünürlükte
çiziliyor; kamera durunca (160 ms) bir kez keskin. Ekran dışındaki deniz/bölge adları yazılmıyor
(yeniden çizimin en pahalı parçasıydı). Başsız Edge, 1920x1080: medeniyet geçişi kare başına
60-95 ms -> ~21 ms, tekerlekle yakınlaşma 60-80 -> ~17-22 ms. Ölçüm: `node Tools/fps.mjs`.

**Yardım duvarı yerine ipucu balonları (22.10, kullanıcı: "nasıl oynanır diyor ama okumuyorum,
çok sıkıcı, bütün yazılar aynı anda geliyor, beni boğuyor"):** oyunun başında pencere yok. O an
ne yapılacaksa onu gösteren TEK balon, gösterdiği yer atan altın çerçeveli: başkentine tıkla →
yükselt → asker bas → ordu çıkar → (yanında bağımsız varsa) saldır / sağ tıkla yürü → turu bitir
→ haberler → (yiyecek eksideyse) yiyecek → (4. turdan) diplomasi. Oyuncu o şeyi yapınca ya da
Tamam deyince geçer; görülenler tarayıcıda (`mn.coach`), "İpuçlarını kapat" ve menüde İpuçları
aç/kapa (açınca baştan). Menüdeki Nasıl oynanır sekiz sayfa: madalyon, başlık, iki cümle, ‹ ›.
Adımlar `ui.js COACH`. Bu, öğreticinin hafif bir hâli; asıl öğretici yine en sonda.

**Tur gösterisi: kamera bütün dünyaya uzaklaşır (22.10).** İlk hâlinde kamera rakiplerin önemli
hamlelerine tek tek gidiyordu; kullanıcı: "tura basınca kamera uzaktan tüm dünyayı görsün, bir
şeyler olsun bitsin, sonra ana yerimize geri dönsün". Şimdi (`anim.js directed`): kamera bütün
haritaya uzaklaşır (0.8 sn), rakipler sırayla oynar - görülen orduları yürür ve savaşır, sisin
içindeki savaşın yerinde kızıl parıltı/duman/çapraz kılıç/soru işareti, bir şey yapan
medeniyetin şeridi üstte ("Galyalılar: Ariminum şehrini aldı!"); görünür bir şey yapmayan
beklemeden geçer; rakiplerin kısmı en çok ~8 sn (aşarsa hızlanır). Sonra kamera oyuncunun
bıraktığı yere döner ve oyuncunun kendi yürüyüşü oynar. Dokunuş hızlandırır, ikinci dokunuş
bitirir ve kamerayı geri getirir. 8 kontrol.

**İnşaatçılar (22.10, kullanıcı: "inşaatçı olsun, 2 tane; yükseltmelerin süresi olsun, sonra işçi
boşa çıksın; seviye arttıkça uzasın, mekanik olsun"):** şehirde 2, kalede 1 inşaatçı; süre gidilen
seviye kadar tur, şehir seviyesi/kışla/tersane +1; para başta, iptalde geri; kuşatmada durur, el
değişince yıkılır. Şehir kartında inşaatçılar (dolu/boş yuvarlak), süren işte kalan tur + tur tur
dolan çubuk + İptal, başlanabilecek işte süresi; haritada çekiç rozeti; bitince haber ve yükselen
yazı. Kayıt sürümü 8. 17 yeni kontrol (1922).
**Denge değişti:** 70 oyunda ilk düşüş 50 → 29 (en erken 23 → 19); küçük medeniyetler daha çabuk
düşüyor (150 turda ayakta: Partlar 37 → 21, Galya 54 → 19, Sakalar 27 → 15), büyükler (Roma,
Mısır, Makedonya) güçlendi. Sebep ölçüldü: inşaatçı sayısı ya da süre değil, yükseltmenin AYNI tur
değil tur sonunda bitmesi (1 inşaatçı + 1 tur bile 30 veriyor; "anında" 50). Eskiden bilgisayar
1. turda kışlayı yükseltip aynı tur okçu basıyor, 4. turda ilk bağımsızı alıyordu; şimdi okçu 4.
turda, erken yayılma yarışını kaybedenler (Galya, Partlar, Sakalar) toparlanamıyor. Denenip işe
yaramayanlar: liman yapılarına +1 tur, bilgisayar turda bir iş, öngörülü bilgisayar, uzun barış
(18/22). Kışla 2 ile başlamak Galya'yı kurtarıyor ama Partları çökertiyor. Kalan: bilgisayarın
"tarla tıkalıysa şehir seviyesi" kuralı.
**Çözüm (kullanıcı: "küçük medeniyetlere önden asker verelim, dengeyi koruyalım"):** başkentlerinde
fazladan asker ve onları besleyecek yiyecek - Galya 40 piyade + 20 okçu (+40 yiyecek), Partlar
55 + 30 (+55), Sakalar 35 + 20 (+35). 70 oyunla ayarlandı: Partlar ile Sakalar komşu, biri fazla
güçlenince ötekini yutuyor (P60/S15 -> Sakalar 3/70; P45/S35 -> Partlar 16/70). Bu hâliyle ilk
düşüş 44 (eskisi 50), 150 turda ayakta Roma 57, Kartaca 60, Mısır 60, Makedonya 45, Partlar 41,
Galya 55, Sakalar 31 (eskisi 61/56/53/47/37/54/27); en büyük çıkan oyundan oyuna değişiyor
(Makedonya, Partlar, Mısır, Sakalar). Küçüklerin başta yiyecek dengesi eksi (Partlar -5) ama
verilen yiyecek en az 10 tur yetiyor: başta tarla yapmaya ya da yayılmaya itiyor (ipucu balonu da
uyarır). Seçim ekranında "Başlangıç ordusu" satırı (`state.startTroops`).

**Sırada (plan sırası): kullanıcı oynasın; iki kişi (hotseat); en son öğretici.**

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
| `node Tools/fps.mjs 1920 1080` | Kamera kıpırdarken kare süreleri ve katmanın yeniden çizim sayısı |

Sunucu: `node Tools/serve.mjs . 8060`. Oyunda `?seed=123` aynı oyunu kurar.
