# Mare Nostrum — Kurallar (taslak)

> Çalışma adı. Keyif için yapılan, sıra tabanlı bir strateji oyunu: Rome Total War'ın kampanya
> haritası, sadeleştirilmiş, Shadow Tower gibi düz çizgilerle çizilmiş.
>
> **Buradaki bütün sayılar başlangıç değeridir.** Bot oynatılarak ayarlanacak.

---

## 1. Özet

- **Dönem:** MÖ 270, Akdeniz.
- **Oyun:** Yedi medeniyetten birini seçersin, diğerlerini bilgisayar oynar.
- **Kazanma:** Bütün medeniyetleri yenmek.
- **Platform:** Düz HTML canvas, tarayıcıda açılır (telefon ve bilgisayar).
- **Dil:** Arayüz İngilizce, Türkçe seçeneği var.

---

## 2. Harita

- **Gerçek harita, hiç değişmez.** Kıyılar ücretsiz harita verisinden (Natural Earth, kamu malı)
  alınıp sade çizgilere çevrilir. Alan İspanya'dan İran'a, Galya ve Karadeniz'in kuzeyinden
  Mısır'a kadar.
- Harita kaydırılır ve yakınlaştırılır.
- **Yerleşimler:** şehir ve kale. Bazıları liman (⚓).
- **Yollar:** Yerleşimleri birbirine bağlayan çizgiler, elle belirlenir. Bazıları **deniz
  geçişi**dir (kesik çizgi), sadece iki liman arasında olur. Örnek: Sicilya ile Kartaca arası.

### Başlangıç

| Medeniyet | Başkent | Şehir | Kale |
|---|---|---|---|
| Roma | Roma | Tarentum ⚓ | Ariminum |
| Kartaca | Kartaca ⚓ | Gades ⚓ | Lilybaion ⚓ |
| Mısır | İskenderiye ⚓ | Memphis | Kudüs |
| Makedonya | Pella | Demetrias ⚓ | Korint |
| Partlar | Hekatompylos | Rhagae | Nisa |
| Galyalılar | Bibracte | Lutetia | Gergovia |
| Sakalar | Neapolis (Kırım) | Olbia ⚓ | Tanais |

Selanik ve Alesia ilk taslakta vardı. Haritada Pella'ya ve Bibracte'ye çok yakın düştükleri
için (işaretler üst üste biniyordu) yerlerine Demetrias ve Gergovia geldi.

**Bağımsız yerleşimler (gri, 24):**

| Bölge | Yerleşimler |
|---|---|
| Batı | Siraküza ⚓, Karalis ⚓, Massalia ⚓, Mediolanum, Numantia (kale), Saguntum ⚓ |
| Afrika | Tingis ⚓, Cirta (kale), Leptis Magna ⚓, Kirene ⚓ |
| Yunanistan ve Trakya | Epidamnos ⚓, Atina ⚓, Sparta (kale), Bizans ⚓, Odessos ⚓ |
| Anadolu | Efes ⚓, Rodos ⚓, Ankyra (kale), Sinop ⚓, Mazaka (kale) |
| Doğu | Antakya ⚓, Babil, Ekbatana, Artaşat (kale) |

Toplam 45 yerleşim. Harita İspanya'dan İran'a kadar geniş olduğu için ilk taslaktaki 35'ten
fazla: aradaki boşluklar (İspanya, Kuzey Afrika, Doğu Anadolu) çok uzun yollar demekti.
Seleukoslar oyunda medeniyet olarak yok. Toprakları bağımsız şehirlere bölünmüş durumda ve
oyunun başındaki büyüme alanı orası.

Her yerleşimin haritadaki toprağı, ona en yakın yerlerdir (en fazla ~350 km). Bu sadece
çizimdir: kurallar toprağı değil yerleşimleri sayar.

Bağımsız yerleşimler **saldırmaz, büyümez, sadece savunur.** Şehirleri seviye 2, 30 piyade ve 10
okçuyla; kaleleri seviye 1, 30 piyade ve 30 okçuyla başlar. Alınınca normal bir şehir olur.

**Büyük bağımsız şehirler:** Siraküza, Atina, Antakya ve Babil seviye 3 (şehir suru), 40 piyade
ve 20 okçuyla başlar. Siraküza Kartaca'nın İtalya'ya, Antakya ve Babil Mısır'ın doğuya kapısı;
sursuzken bu iki medeniyet çok hızlı büyüyordu ve ilk medeniyet ortalama 29. turda düşüyordu.
Surla bu 47. tura çıktı, Roma 28 oyunun 5'i yerine 14'ünde ayakta kalıyor.

---

## 3. Kaynaklar

Üç ambar bütün ülkenin ortak ambarıdır. Nüfus ise her şehrin kendisine aittir.

| Kaynak | Nereden gelir |
|---|---|
| **Para** | Vergi: her şehirde, her 20 nüfus için turda 1 para |
| **Silah** | Sanayi: turda sanayi seviyesi kadar |
| **Yiyecek** | Tarla: turda tarla seviyesi × 4 buğday. Limanlar buna ek olarak turda +1 balık verir. Buğday ve balık aynı ambara girer. |

Her medeniyet ambarında 30 para, 5 silah ve 10 yiyecekle başlar.

> İlk taslakta buğday 2, balık 2 idi. Bot oynatınca üç limanı olan Kartaca turda +11 yiyecek
> fazlasıyla başlıyordu, Roma +1, Partlar ve Galyalılar eksiyle. Yiyecek ordunun tavanı
> olduğu için Kartaca her oyunu kazanıyordu.

---

## 4. Şehirler ve kaleler

Her yerleşimin dört yükseltmesi var:

| Yükseltme | Ne yapar |
|---|---|
| **Şehir seviyesi** | Nüfus tavanı: seviye × 100 (kalede × 50) |
| **Sanayi** | Turda seviye kadar silah |
| **Tarla** | Turda seviye × 4 buğday |
| **Kışla** | Seviye 1'de piyade, seviye 2'de okçu açılır. Her seviye turda bir bölük daha basmayı sağlar. |

- Şehrin en yüksek seviyesi 5, kalenin 3.
- **Hiçbir yapı şehir seviyesini geçemez.** Önce şehri büyütmek gerekir.
- **Fiyat:** Bir yapıyı bir üst seviyeye çıkarmak (yeni seviye × 10) para tutar. Şehir seviyesi
  bunun iki katıdır. Her yerleşimde turda bir yükseltme yapılır ve anında biter.
- **Nüfus** her tur tavanın %5'i kadar artar. Bunun için yiyecek ambarının boş olmaması gerekir.
- **Kale:** Nüfusu ve silah/buğday üretimi şehrin yarısı kadardır. Karşılığında surları güçlüdür
  (Bölüm 7).
- **Başlangıç değerleri:** Başkent seviye 2, diğer yerleşimler seviye 1. Sanayi, gıda ve kışla
  her yerde 1. Nüfus tavanın %75'i kadar. Garnizon başkentte 3, şehirde 2, kalede 1 piyade bölüğü.

---

## 5. Askerler

Bir **bölük** 10 askerdir. Asker basmak şehrin nüfusundan düşer.

| Tür | Bir bölüğün maliyeti | Savaşta |
|---|---|---|
| **Piyade** | 1 para + 1 silah + 1 yiyecek + 10 nüfus | Yakın dövüşte güçlü |
| **Okçu** | 1 para + 2 silah + 1 yiyecek + 10 nüfus | Önce ok yağdırır, yakın dövüşte zayıf |
| **Süvari** | 2 para + 2 silah + 1 yiyecek + 10 nüfus · kışla 3 | Hücumda okçuları biçer, yakın dövüşte × 1.2, sura karşı yarı güç |
| **Kuşatma makinesi** | 3 para + 3 silah + 1 yiyecek + 10 nüfus · sanayi 3 | Dövüşmez; her bölüğü düşman surunun bonusunun beşte birini söker |

- **Her bölük her tur 1 yiyecek yer.** Bu, ordular ve garnizonlar için aynıdır.
- **Açlık:** Yiyecek ambarı biterse bütün askerler her tur %10 eriyir ve nüfus artmaz.
- Basılan asker şehrin garnizonuna girer.

---

## 6. Ordular ve hareket

- **Ordu çıkarmak:** Garnizondan bölükler seçilip ordu kurulur. Şehri tamamen boşaltmak da
  mümkündür, ama riskli.
- Ordular **sadece yerleşimlerde durur**, yolun ortasında durmaz.
- **Her ordu her tur bir yol yürür** (Sakalar iki). İki ordun varsa o tur iki hamlen olur.
- **Otomatik yürüyüş:** Orduya tıkla, sonra uzaktaki bir şehre tıkla. Ordu en kısa yolu bulur ve
  her tur kendiliğinden bir adım ilerler. Düşmanla karşılaşırsa ya da yol kapanırsa durur ve sana
  sorar.
- **Birleşme ve bölünme:** Aynı yerdeki iki ordu birleşebilir, bir ordu da ikiye bölünebilir.
- Kendi şehrinde duran ordu şehri garnizonla birlikte savunur.
- **Girebileceğin yerler:** kendi yerleşimlerin, müttefiklerinki, savaştığın medeniyetinkiler ve
  bağımsızlar. **Tarafsız birinin toprağına giremezsin.**

---

## 7. Savaş (otomatik)

Bir ordu, içinde düşman askeri olan bir yerleşime girdiğinde savaş çıkar.

**Saldırmadan önce bir tahmin gösterilir:** *Kolay / Zor / Umutsuz.*

1. **Ok yağmuru:** İki tarafın okçuları aynı anda atar. Her okçu bölüğü karşı taraftan 5 asker
   düşürür.
2. **Göğüs göğüse:** Her tarafın gücü = piyade × 1 + okçu × 0.6. Piyadesinden fazla olan okçular
   korumasız yakalanır ve × 0.25 sayılır. Bonuslar bu sayıyı çarpar, üstüne ±%10 şans eklenir.
   Gücü büyük olan kazanır.

   Sonuç: tek başına okçu aynı sayıda piyadeye ezilir. Yarı yarıya karışık bir ordu ise aynı
   sayıda düz piyadeyi yener. (İlk taslaktaki 2 asker ve × 0.5 ile okçu her durumda piyadeden
   kötüydü.)

   **Süvari hücumu** ok yağmuruyla aynı anda olur: her süvari bölüğü 5 düşman okçusunu biçer
   (sura dalarken yarısı). Yakın dövüşte süvari × 1.2, sura karşı × 0.5. Okçular önlerinde
   piyade ya da süvari varsa korunur. (Hücum yağmurdan sonra gelince okçular atlıların yarısını
   hücumdan önce öldürüyordu ve süvari tam da okçu ağırlıklı orduya yeniliyordu.)

   **Kuşatma makinesi** dövüşmez (mürettebatı sayılır ama gücü yok, tek başına bir yeri
   alamaz). Saldıran tarafın her bölüğü surun bütün bonuslarının (kale × 1.5, kale okları × 2,
   şehir × 1.25) beşte birini söker; 5 bölük suru tamamen açar. Kuşatma ustası general ile
   birlikte çarpılır.

   Taş-kâğıt-makas: okçu piyadeyi yıpratır, süvari okçuyu biçer, piyade ve sur süvariyi durdurur,
   kuşatma makinesi suru açar.
3. **Sonuç:**
   - Kaybeden ordu dağılır.
   - Kazananın kaybı, iki gücün birbirine ne kadar yakın olduğuna bağlıdır:
     `kayıp = kazananın askeri × (kaybedenin gücü / kazananın gücü)² × 0.5`
     Denk bir savaşta yarısını, iki kat güçlüyken sekizde birini kaybeder.
   - Savunan taraf kaybederse yerleşim saldırana geçer, nüfusun %25'i kaçar ve yapılar kalır.

**Surlar:**

| Yer | Savunanlara bonus |
|---|---|
| Kale | Herkes × 1.5, okçuların ok yağmuru × 2 |
| Başkent, ve seviye 3 ve üstü şehir | Herkes × 1.25 |
| Diğerleri | Yok |

---

## 8. Diplomasi

**Durumlar:** Tarafsız (herkes buradan başlar), Müttefik, Savaş.

- **Savaş ilanı** tek taraflıdır ve anında olur.
- **İttifak** teklif edilir. Bilgisayar kabul eder ya da reddeder.
- **İttifak bozulursa** önce tarafsız olunur. Savaş ancak bir sonraki tur ilan edilebilir, yani
  sürpriz ihanet yok.
- Müttefikler birbirinin topraklarından geçebilir ama birbirine saldıramaz.
- **Barış:** Savaştaki biriyle barış teklif edilebilir. Kaybeden taraf kabul etmeye yatkındır.
- **Bağımsız yerleşimlere** herkes her zaman saldırabilir.
- Bilgisayar 12. turdan önce kimseye savaş açmaz. Bilgisayarlar birbirine ancak 1.8 kat güçlüyken
  açar (sana karşı eşik zorluğa bağlı, bölüm 9b).
- **Bilgisayarın sana teklifleri** (birkaç turda bir, karar penceresi olarak gelir):
  - *Barış:* seninle savaşta ve senden açıkça zayıfsa.
  - *İttifak:* tarafsızsınız ve ortak bir düşmanınız var.
  - *Haraç:* komşun, tarafsız ve senden 1.8 kat güçlü. Ödersen 8 tur sana savaş açmaz;
    reddedersen hemen savaş açar.

---

## 9. Medeniyetler

| Medeniyet | Güçlü yanı | Zayıf yanı |
|---|---|---|
| **Roma** | Piyade × 1.25 | Bir bölük 1.5 para tutar |
| **Kartaca** | Ticaret: para × 1.5, gemiler × 1.5 | Bütün askerler × 0.85 |
| **Mısır** | Buğday × 1.15 (Nil) | Silah × 0.75 |
| **Makedonya** | Savunan piyade × 1.5 (falanks) | Nüfus tavanı × 0.9 |
| **Partlar** | Okçu × 1.5 | Piyade × 0.75 |
| **Galyalılar** | Bölük para istemez, nüfus artışı × 1.5 | Okçu × 0.7 |
| **Sakalar** | Ordular turda iki yol yürür, süvari × 1.3 (bozkır atlıları) | Surlu yere saldırı × 0.6 |

Bu sayılar 28 bot oyunuyla ayarlandı. Mısır ve Kartaca hâlâ en sık büyüyenler, Roma ortada
sıkıştığı için en sık düşen. Tarihe de uyuyor; oyuncu oynadıkça bakılacak.

---

## 9b. Zorluk

Başlangıç ekranında seçilir. Sadece bilgisayarın OYUNCUYA davranışını ve bilgisayarın üretimini
değiştirir; bilgisayarlar kendi aralarında her zorlukta aynı oynar.

| Zorluk | Sana savaş açabileceği ilk tur | Ne kadar güçlüyken | Bilgisayarın üretimi |
|---|---|---|---|
| Kolay | 20 | 2 kat | × 0.85 |
| Normal | 12 | 1.5 kat | × 1 |
| Zor | 8 | 1.25 kat | × 1.15 |

---

## 12. Sadakat ve isyan

Her yerleşimin 0-100 arası sadakati var. Başlangıçta herkes 100; **alınan yer 20 ile başlar.**

Her tur sadakat şöyle değişir:

| | |
|---|---|
| Kendiliğinden yatışma | +4 |
| Garnizon (ve orada duran kendi orduların) | her 10 asker +1, en fazla +8 |
| Başkentten uzaklık | 2 yoldan sonraki her yol −1.5, en fazla −8 |
| Kıtlık | −10 |

- **Oyunlar düzenle:** 15 para, +20 sadakat, yerleşim başına turda bir kere.
- **40'ın altı huzursuz:** haritada şehrin yanında ünlem rozeti.
- **25'in altında isyan ihtimali:** her eksik puan için %4. İsyancılar nüfusun dörtte biridir.
  Savunanlar onlardan güçlüyse ayaklanma bastırılır (isyancıların yarısı kadar asker kaybı,
  +10 sadakat); değilse yer **bağımsızlığına döner** ve isyancılar garnizonu olur.

Fethetmek böylece sadece "saldır" değil: aldığın yeri tutmak için asker bırakmak, uzağa
yayılırken bedel ödemek gerekiyor. Bilgisayar huzursuz yerlerine isyancılardan güçlü garnizon
bırakıyor ve parası varsa oyun düzenliyor.

## 13. Olaylar

4. turdan sonra her medeniyete her tur %16 ihtimalle bir olay düşer. Seninkiler tur raporundan
sonra karar penceresi olarak gelir; karar vermeden turu bitirirsen bedava seçenek seçilir.
Bilgisayarlar aynı olayları yaşar ve kendi kararını verir.

| Olay | Seçenekler |
|---|---|
| Veba (nüfusu 100+ bir şehirde) | Karantina, 12 para: halkın %10'u ölür · Bırak: %30'u ölür |
| Bereketli hasat | Ambara koy: +15 yiyecek · Sat: +12 para |
| Akıncılar (başkent dışında) | Öde (10 + tur/2, en fazla 40) · Savaş: 25 + tur (en fazla 90) piyadeye karşı; kaybedersen garnizon ölür, nüfusun dörtte biri ve bir tarla gider |
| Paralı askerler | 25 paraya 30 piyade · Gönder |
| Yangın (sanayi ya da tarlası 2+) | Onar, 15 para · Bırak: sanayi ya da tarla bir seviye düşer |
| Huzursuzluk (sadakati 60'ın altında) | Oyunlar, 15 para: +20 · Görmezden gel: −15 |
| Kervan (limanda) | +20 para |

## 14. Generaller

- Bir orduya **30 paraya** general atanır (ordu kartında "General ata"). Adlar tarihî ve
  medeniyete göre: Roma'da Scipio, Fabius; Kartaca'da Hamilkar, Hasdrubal; Sakalarda Tomris,
  Alp Er Tunga...
- Savaş kazanınca +3, kaybettiği ama hayatta kaldığı savunmada +1 tecrübe. Seviye 1-5
  (3, 7, 12, 18 tecrübede). **Her seviye ordunun gücüne +%6.**
- **2. ve 4. seviyede bir yetenek:**

| Yetenek | Etkisi |
|---|---|
| Kuşatma ustası | Düşman surunun bütün bonusları yarıya iner |
| Hızlı | Ordu turda bir yol fazla yürür |
| Taktisyen | Güç × 1.1 |
| Okçu ustası | Ordunun ok yağmuru × 1.5 |
| İaşeci | Ordu yarı yiyecek yer |
| Sert | Durduğu yerin sadakatine her tur +4 |

- Savunmada, o yerdeki en iyi general savunanlara katılır.
- **Ordusu yenilen general ölür**; adı o medeniyette bir daha verilmez.
- İki ordu birleşirse tecrübeli general komutayı alır; bölünen ordunun yeni yarısı generalsiz.
- Bilgisayar 80+ askerlik ordularına parası varsa general atar.
- Saldırı tahmini generalleri hesaba katar (iki taraf için de).

## 15. Donanma

- **Gemi** limanlarda yapılır: 4 para, 2 silah, 5 nüfus (tayfa). Asker basma hakkından yer.
  Gemi başına turda yarım yiyecek bakım.
- **Deniz yolları (kesik çizgiler) gemi ister:** bir gemi 25 asker taşır. Ordu, gemileri bütün
  askerlerini taşıyabiliyorsa deniz yolunu kullanabilir; yoksa o yollar onun için yok.
  Gemiler ordunun içinde durur; ordu çıkarırken limandaki gemileri de alırsın. Sadece gemiden
  oluşan bir filo da ordu sayılır (karaya saldıramaz).
- **Başlangıç gemileri:** liman olan başkentte 2, öteki limanlarda 1, büyük bağımsız
  limanlarda 2, öteki bağımsız limanlarda 1.
- **Deniz savaşı:** denizden bir limana saldırınca önce limandaki (ve sahibinin oradaki
  ordularının) gemileriyle çarpışılır. Güç = gemi sayısı × denizcilik (Kartaca × 1.5) × şans.
  Kaybeden filonun hepsi batar; kazanan, güçler yakınsa çok gemi kaybeder. **Filo yenilirse
  ordu denizde kaybolur;** kazanırsa karaya çıkar ve kara savaşı başlar. Saldırı tahmini deniz
  savaşını da sayar.
- **Alınan limanın gemileri yanar.**
- **Abluka:** sahibiyle savaşta olan birinin, deniz yolunun öbür ucunda limandakinden çok gemisi
  duruyorsa liman ablukadadır: balık gelmez, vergi yarıya iner. Haritada çapası kırmızı.

> Denge: donanma gelince denizler gerçek bir engel oldu. İlk denemede bilgisayar neredeyse hiç
> denize açılamadı (gemi için sanayi 2 isteniyordu ve limana bir savunma gemisi bırakıyordu) ve
> ilk düşüş 143. tura fırladı. Tersane şartı kalktı, bir gemi 25 asker taşıyor, bilgisayar
> limandaki gemilere biniyor: ilk düşüş 70 oyunda 61. tur (donanmadan önce 41). Dünya biraz
> daha yavaş - oyuncunun nefes alacak zamanı daha çok.

---

## 10. Tur sırası

1. **Sen oynarsın:** yükseltme, asker basma, ordu yürütme, diplomasi.
2. **Turu bitir.**
3. Bilgisayar medeniyetleri sırayla oynar.
4. **Tur sonu hesabı:** Üretim ambara girer, askerler yer, nüfus artar, sadakat değişir (isyan
   olabilir), olaylar düşer.
5. Otomatik kayıt yapılır.

**Kaybetme:** Son yerleşimin düşerse oyun biter. Bir medeniyet son yerleşimini kaybedince
oyundan çıkar.

---

## 11. Bilgisayar rakipler

- **Kurallar çizimden tamamen ayrı yazılır.** Bilgisayar rakipler de test botu da aynı kodla
  oynar, tarayıcı açmadan.
- **İlk sürümün basit öncelikleri:**
  - Açlık varsa asker basmayı durdur.
  - Para varsa yükseltme yap.
  - Savunmasız bir şehir varsa saldır.
  - Zayıf komşuya savaş ilan et.
  - Güçlü komşuyla ittifak kur.

---

## 12. Ekran

- **Üst bant:** Tur sayısı, para, silah, yiyecek (her birinin yanında turluk + / −).
- **Şehre tıklayınca:** Dört yükseltme, asker basma ve garnizon paneli açılır.
- **Orduya tıkla, sonra hedefe tıkla.**
- **Sağ alt:** *Turu bitir* butonu.
- **Diplomasi paneli:** Her medeniyetin durumu ve butonları.
- **Savaş sonucu kartı:** Kim kazandı, kim kaç asker kaybetti.

---

## 13. İlk sürümde olmayanlar (sonra)

İzlenen savaş, gemiler ve deniz savaşı, ticaret, atlı birlikler, haritada sis, olaylar (salgın,
isyan).
