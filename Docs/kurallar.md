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
- Bilgisayar 12. turdan önce kimseye savaş açmaz. Ancak 1.5 kat güçlüyken açar.

---

## 9. Medeniyetler

| Medeniyet | Güçlü yanı | Zayıf yanı |
|---|---|---|
| **Roma** | Piyade × 1.25 | Bir bölük 1.5 para tutar |
| **Kartaca** | Ticaret: para × 1.5 | Bütün askerler × 0.85 |
| **Mısır** | Buğday × 1.15 (Nil) | Silah × 0.75 |
| **Makedonya** | Savunan piyade × 1.5 (falanks) | Nüfus tavanı × 0.8 |
| **Partlar** | Okçu × 1.5 | Piyade × 0.75 |
| **Galyalılar** | Bölük para istemez, nüfus artışı × 1.5 | Okçu × 0.7 |
| **Sakalar** | Ordular turda iki yol yürür (bozkır atlıları) | Surlu yere saldırı × 0.6 |

Bu sayılar 28 bot oyunuyla ayarlandı. Mısır ve Kartaca hâlâ en sık büyüyenler, Roma ortada
sıkıştığı için en sık düşen. Tarihe de uyuyor; oyuncu oynadıkça bakılacak.

---

## 10. Tur sırası

1. **Sen oynarsın:** yükseltme, asker basma, ordu yürütme, diplomasi.
2. **Turu bitir.**
3. Bilgisayar medeniyetleri sırayla oynar.
4. **Tur sonu hesabı:** Üretim ambara girer, askerler yer, nüfus artar.
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
