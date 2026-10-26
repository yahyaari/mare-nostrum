# Mare Nostrum — Kurallar (taslak)

> Çalışma adı. Keyif için yapılan, sıra tabanlı bir strateji oyunu: Rome Total War'ın kampanya
> haritası, sadeleştirilmiş, Shadow Tower gibi düz çizgilerle çizilmiş.
>
> **Buradaki bütün sayılar başlangıç değeridir.** Bot oynatılarak ayarlanacak.

---

## 1. Özet

- **Dönem:** MÖ 270, Akdeniz.
- **Oyun:** Yedi medeniyetten birini seçersin, diğerlerini bilgisayar oynar.
- **Kazanma:** üç yol (bölüm 12c): Fetih, Harikalar, Skor (200. tur).
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
  bunun iki katıdır.
- **İnşaatçılar (22.10):** şehirde 2, kalede 1. Her yükseltme bir inşaatçıyı birkaç tur çalıştırır:
  **gidilen seviye kadar tur**, şehir seviyesi, kışla ve tersane **bir tur fazla** (tarla 1→2: 2 tur,
  tarla 3→4: 4 tur, şehir 2→3: 4 tur, kışla 1→2: 3 tur, liman kalesi 0→1: 1 tur). Parası başta
  ödenir; iş bitince (tur sonunda, üretimden önce) yapı yükselir ve inşaatçı boşalır. Aynı yapı
  aynı anda iki kez yapılmaz. İş iptal edilirse parası geri gelir. Kuşatılan yerde inşaat durur;
  yer el değiştirirse yarım iş yıkılır (parası gider). Süreler farklı olduğu için oyuncu ne zaman
  neyin biteceğini planlar (kullanıcı: "mekanik olsun, işçiler düzgün kullanılmalı").
- **Nüfus** her tur tavanın %5'i kadar artar. Bunun için yiyecek ambarının boş olmaması gerekir.
- **Kale:** Nüfusu ve silah/buğday üretimi şehrin yarısı kadardır. Karşılığında surları güçlüdür
  (Bölüm 7).
- **Başlangıç değerleri:** Başkent seviye 2, diğer yerleşimler seviye 1. Sanayi, gıda ve kışla
  her yerde 1. Nüfus tavanın %75'i kadar. Garnizon başkentte 3, şehirde 2, kalede 1 piyade bölüğü.
- **Küçük medeniyetlerin fazladan askeri (22.10):** inşaat süreli olunca erken yayılma yarışını
  kaybediyorlardı. Başkentlerinde: Galya 40 piyade + 20 okçu, Partlar 55 + 30, Sakalar 50 + 25,
  Makedonya 20 + 10; ambarlarına da bu askeri besleyecek yiyecek (40 / 55 / 45 / 20). Başta yiyecek
  dengeleri eksi ama ambar en az 10 tur yeter. (Serbest yürüyüşte Sakalar ile Makedonya birbirine
  bağlandı: biri güçlenince öteki erken düşüyordu; ikisine de destek.)

---

### 4b. Şehir binaları

Kullanıcı 23.10, önerilen küçük işlerin ilki. Şehir kartında **Yapılar** sekmesi; her bina diğer
yükseltmeler gibi seviye seviye (şehir seviyesine kadar), para başta, birkaç tur inşaatçıyla
(`state.js` BUILDINGS, `N.buildings`).

| Bina | Her seviye | Gerekli araştırma |
|---|---|---|
| Tapınak | Bu şehirde sadakat turda +2 | - |
| Pazar | Bu şehrin parası +%10 | Sikke |
| Okul | Turda +1 bilim | Yazı |
| Hamam | Bu şehirde nüfus artışı +%10 | Mühendislik |

Bilgisayar huzursuz şehre tapınak, sonra şehir seviyesinden sonra pazar ve okul, kışladan sonra
hamam yapar. Kayıt 17. Denge (70 oyun, zaferler kapalı): ayakta kalan 298 -> 303, Partlar en büyük
38 -> 31, ilk düşüş aynı.

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

### 5b. Medeniyete özel birlikler

Kullanıcı 26.10 strateji oyunlarının olmazsa olmazlarını sordu; Civilization'daki ve Total War'daki
gibi her medeniyetin kendi birliği listede birinciydi, "hepsini sırayla yapalım" dedi. Kurallarda tek
yuva (`elite`), davranışı sahibinin medeniyetinden (`numbers.js N.unique`). Hepsi **kışla 2** ister,
bölüğü 10 asker; Asker bas sekmesinde yıldızlı beşinci kart, medeniyet seçiminde de yazılı.

| Medeniyet | Birlik | Bir bölük | Savaşta |
|---|---|---|---|
| Roma | **Lejyoner** | 3 para (x1.5) + 2 silah + 1 yiyecek | Piyade gibi önde; göğüs göğüse x1.7 |
| Kartaca | **Savaş fili** | 4 para + 3 silah + 2 yiyecek | Süvari gibi: okçulara 1.6 bölük hücumu, göğüs göğüse x2.2, sura karşı yarı |
| Mısır | **Savaş arabası** | 3 para + 2 silah + 1 yiyecek | Süvari gibi: hücum 1.4, ok yağmuru 0.6 okçu bölüğü, göğüs göğüse x1.5 |
| Makedonya | **Falanks** | 2 para + 2 silah + 1 yiyecek | Piyade gibi; x1.3, savunurken x1.5; her bölük bir süvari bölüğünün hücumunu durdurur |
| Partlar | **Katafrakt** | 4 para + 3 silah + 1 yiyecek | Süvari gibi: göğüs göğüse x1.9, hücum 0.8, sura karşı yarı |
| Galya | **Savaşçı** | 2 para (Galya'ya bedava) + 1 silah + 1 yiyecek | Piyade gibi; x1.2, saldırırken x1.5 |
| Sakalar | **Atlı okçu** | 3 para + 2 silah + 1 yiyecek | Okçu gibi ok yağdırır (1 okçu bölüğü), korunmaya ihtiyacı yok (x0.8), hücum 0.6 |

- Pahalılar ama yiyecek (ordunun tavanı) ve turluk asker basma hakkı aynı: kalite mi nicelik mi kararı.
- Araştırma, dövüştükleri türün çarpanını verir (lejyonere piyadeninki); medeniyetin genel gücü (Kartaca
  x0.85) de geçerli, ama türlerin özellikleri (Roma piyadesi x1.25 gibi) geçmez - birliğin kendi sayıları var.
- Savaş penceresinin dökümünde adıyla bir satır ("Lejyoner +%70"; piyadeden güçlüyse).
- Bağımsızın eline geçen seçkin asker (isyan) sıradan piyade gibi dövüşür.
- Bilgisayar ordusunun beşte birini özel birliğinden ister (`N.aiElite`), ama ancak 15. turdan sonra ve
  kasası ile cephaneliği bolken (fiyatının üç katı): erken basınca silahı tükeniyor, bağımsızları çok geç
  alıyordu (25. turda 1-4 yerine 4-9 bağımsız).
- Eski kayıtlara yuva eklenir (kayıt 19).
- Denge (70 oyun, zaferler kapalı): ilk düşüş 42 -> 49, 150. turda ayakta kalan toplam 291 -> 327; ilk
  denemede savaş arabası zayıftı (Mısır ayakta 24), katafrakt güçlüydü: araba x1.2 -> x1.5, hücum 1.2 -> 1.4;
  katafrakt x2.1 -> x1.9. Son hâli Mısır 37, Makedonya 33, Partlar en büyük 26 oyunda (önce 29).
- Çizimler `view/battle.js`: lejyoner (büyük kalkan, sorguç), fil (sırtında kule), savaş arabası, falanks
  (uzun sarisa), katafrakt (pullu zırhlı at), Galya savaşçısı (çıplak gövde, kalkık kılıç), atlı okçu (sivri börk).

---

## 6. Ordular ve hareket

- **Ordu çıkarmak:** Garnizondan bölükler seçilip ordu kurulur. Şehri tamamen boşaltmak da
  mümkündür, ama riskli.
- **Birlik kartları** (kullanıcı 22.10, Total War gibi): her bölük bir kart (10 asker; savaşta
  eriyen bölük küçülür, 7 kişilik kart yarım çubuklu). Şehrin **Garnizon** sekmesinde kartlar
  seçilir, *Dışarı çık* (ya da *Komutanla*: başına bir general, 30 para) ile ordu olur. Ordunun
  kartında kartlar seçilip *Ayır* ile ayrı ordu, *Garnizona kat* ile şehre bırakılır; *Birleştir*
  aynı yerdeki öteki orduları katar. Her gemi de bir kart. Kurallar türlerin adam sayısını
  tutuyor; kartlar bu sayılardan çıkıyor (state.js `cardsOf`, `chosen`, `detach`).
- **Serbest yürüyüş** (kullanıcı 22.10: "haritadan tıkladığımız yere kaç tur sürecekse yürüsün,
  sadece şehirlere kalelere değil, ordular etrafta gezebilsin"). Harita 0.25 birimlik (~28 km)
  karelere bölünmüş (`src/data/grid.js`, `Tools/grid.mjs` üretir; kıyılar ekrandakinin aynısı).
  Ordu haritanın her yerinde durabilir; bir yerleşimin içindeyse onun savunmasına katılır.
- **Hareket puanı:** ordu her tur `N.march.mp` (4) puan harcar. Harita biriminin bedeli yolda 1,
  yol dışında 2.5, denizde 1; karadan gemiye binmek ya da gemiden karaya çıkmak +0.5. Yani yolda
  turda ~4, yol dışında ~1.6 birim (eskiden her yol bir turdu; yolların ortancası 3.6 birim).
  Sakalar (bölüm 9) iki kat, hızlı general bir buçuk kat yürür.
- **Yabancı şehrin çevresi** (0.6 birim): düşman, bağımsız ve tarafsız yerleşimlerin dibinden
  geçilmez - ya alınır ya dolaşılır (Total War'ın kontrol alanı gibi). Bağımsız şehirler tampon,
  boğazdaki Bizans kapı. O şehre saldırmaya ya da çevresindeki bir noktaya gidilebilir.
- **Yürü:** orduyu seç, haritada istediğin yere sağ tıkla (ya da *Yürü*'ye basıp sol tıkla).
  Fareyi gezdirirken yol ve her turun bittiği yer (numaralı halkalar) görünür. Uzak hedefe giden
  ordu yolunu saklar, her tur kendiliğinden ilerler.
- **Önünü kesmek:** savaştığın birinin ordusunun menziline (0.8 birim) giren ordu durur. Düşman
  yolunu kesebilir; surlarına varmadan meydanda karşılanır.
- **Menzil:** bir yerleşime ya da yerleşimin dışındaki bir orduya ancak 0.8 birim yakından ve bu
  turdan hareketi kalmışsa saldırılır. Uzaktaki hedefe sağ tıklayınca ordu önüne kadar yürür.
- **Birleşme ve bölünme:** yan yana duran (yarım birim) ya da aynı yerleşimin içindeki ordular
  birleşebilir; bir ordudan seçilen kartlar ayrılabilir.
- **Girebileceğin yerleşimler:** kendininkiler ve müttefiklerinki (içine girilir), savaştığın
  medeniyetinkiler ve bağımsızlar (saldırılır). Tarafsız birinin yerleşimine saldırmak için önce
  savaş ilan edilir.
- **Tarafsızın toprağı** (kullanıcı 22.10: "girilsin ama ilişki bozulsun"): toprak, haritada
  çizildiği gibi en yakın yerleşimin (3.2 birime kadar). Tarafsız birinin toprağında (yerleşimin
  dışında) duran her ordu için o medeniyet turda bir öfkelenir; kimse girmeyince yarım söner. Öfke
  3 olunca bilgisayar savaş açar - barış süresini beklemeden (gücü oyuncunun en az 0.7 katıysa).
  Öfkeli medeniyet ittifak istemez. Oyuncu yolu bir tarafsızın toprağından geçerse önce sorulur.
  Bilgisayar tarafsızların toprağından kaçınır.
- **Gemiler:** gemileri bütün askerini taşıyabilen ordu kıyıdan denize açılır, istediği kıyıya
  çıkar; askersiz filo sadece denizde gezer ve limanlara girer. Çanakkale ve İstanbul boğazları
  açık (Bizans'ın yolu orada feribot).

### 6c. Dinlenme

Kullanıcının istediği "olmazsa olmazlar"ın ikincisi (26.10; Total War'daki gibi). `src/rules/refill.js`.

- Savaşta eriyen bölük (kartı 10'dan az; kayıplar türlere dağıldığı için her türde en çok bir yarım
  bölük olur) **evde dinlenince toparlanır**: kendi yerleşiminin garnizonu, ya da kendi yerleşiminde,
  kapısında veya kendi toprağında bu tur hiç yürümemiş, savaşmamış ordu (hareket puanı dolu, kuşatmıyor).
- Her türün yarım bölüğü turda **3 asker** kazanır, bölüğü tamamlayana kadar. Askerler o yerin
  nüfusundan gelir; yerde en az 20 kişi kalır.
- Kuşatılan yerde ve ambar boşken (yiyecek 1'den az) toparlanma yok. Barbarlar toparlanmaz.
- Yok olan bölük geri gelmez - yenisi basılır.
- Tur sonu hesabında, üretimden sonra. Oyuncuya haber: "Dinlenen bölükler toparlandı: +12 asker".
- Kartta: dinlenen yarım bölüğün sayısının yanında yeşil ▲, ipucunda "Dinleniyor: turda +3 asker".
  Ordu bu tur yürürse ok kaybolur.
- Denge (70 oyun, zaferler kapalı): ilk düşüş 49 -> 48, ayakta kalan toplam 327 -> 332 (gürültü payında).

---

## 7. Savaş (otomatik)

Bir ordu menzilindeki (0.8 birim) bir düşman ya da bağımsız yerleşime saldırınca savaş çıkar.
**Meydan muharebesi** (kullanıcı 22.10: "düşman gelirse kuşatmadan önce meydan muharebesi
yapabilsin"): yerleşimin dışındaki bir düşman ordusuna saldırmak; aynı hesap, sursuz ve arazisiz.
İki ordu da denizdeyse deniz savaşı olur, yenilen filo askerleriyle batar. Karadaki ordu denizdeki
filoya saldıramaz. Kaybeden ordu her zaman yok olur, generali ölür.

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

**Geri çekilme** (kullanıcı 23.10 önerilerden; eskiden kaybeden ordu her zaman yok oluyordu):
meydan muharebesini kaybeden ordu, savaştan önceki askerlerinin yarısı x (yenilenin gücü / kazananın
gücü) kadarıyla, kazanandan uzak bir kara karesine (en çok 1.6 birim) çekilir; hareketi biter,
generali yaşar. Bir yerleşime saldırıp püskürtülen saldıran da aynı hesapla kapının önünde kalır.
10 askerden azı kalırsa ya da gidecek yer yoksa (denizde batan filo dahil) ordu yine dağılır.
Animasyonda püskürtülen ordu kapıdan geri yürür; sonuç şeridi kaç askerin kurtulduğunu yazar.

**Tecrübe ve rütbe** (kullanıcı 23.10: "savaşlar cansız"). Ordular savaştıkça usta olur:

- Savaş kazanan ordu **+2** tecrübe (yerleşim alarak da meydanda da). Yerleşimini tutan, içerideki
  ordular **+1**.
- Rütbe: 2'de **Kıdemli**, 5'te **Usta**, 9'da **Seçkin**. Her rütbe savaşta **+%5** güç (en çok +%15).
- Savunmada içerideki orduların tecrübesi kişi sayısıyla tartılır; garnizon acemi sayılır.
- Birleşen orduların tecrübesi kişi sayısıyla tartılır; ayrılan bölük tecrübesini götürür.
- Rütbe haritada ordunun etiketinde altın V'ler, ordu kartında adıyla ve artısıyla görünür.

**Savaş penceresi** (Civilization'ın savaş önizlemesi gibi): iki taraf yan yana (askerleri figür
figür, sayıları, generali, rütbesi, gücü), ortada iki gücü karşılaştıran çubuk ve tahmin, altında
savaşı çeviren her şey tarafına göre yeşil artı / kırmızı eksi: komutan, tecrübe, nehir geçişi,
dağ geçidi, milletin askerlik ustalığı, sur, makinelerin söktüğü sur, kuşatma ustası
(`combat.js explain`). Pencere de savaş da aynı sayıları kullanır (`moves.js sides`).

**Savaş haritada oynar:** sonuç penceresi yok. Saldırı onaylanınca ordu kapıya yürür, savaş
sahnesi savaşın yerinin üstünde bir panoda oynar, bitince üstte bir sonuç şeridi belirir
("Zafer! Massalia artık senin", kayıplar, rütbe atladıysa, general seviye atladıysa ya da düştüyse)
ve birkaç saniyede kendiliğinden kaybolur (basınca hemen).

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
- Bilgisayar 12. turdan önce kimseye savaş açmaz. Bilgisayarlar birbirine 1.5 kat güçlüyken
  açar; bu eşik zamanla 1.1'e kadar iner (bölüm 16'daki not). Sana karşı eşik zorluğa bağlı,
  sabit (bölüm 9b).
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
| **Sakalar** | Ordular iki kat yürür, süvari × 1.3 (bozkır atlıları) | Surlu yere saldırı × 0.6 |

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

- **Gemi türleri** (kullanıcı 22.10: "kadırgalar, savaş gemileri vs olsun"), tersane seviyesiyle
  açılır - kışlanın askerleri açması gibi:

  | Tür | Fiyat | Tayfa | Taşır | Savaş gücü | Bakım | Tersane |
  |---|---|---|---|---|---|---|
  | Kadırga (taşıma) | 4 para, 2 silah | 5 | 25 asker | 1 | 0.5 yiyecek | 1 |
  | Trireme (savaş gemisi) | 7 para, 3 silah | 8 | 10 asker | 2.5 | 0.75 | 2 |
  | Kinkerem (ağır savaş gemisi) | 12 para, 5 silah | 12 | 20 asker | 4 | 1 | 3 |

  Tersanenin her seviyesi (1'den sonra) her gemiyi 1 para ucuzlatır; tersane seviyesi kadar gemi
  turda (asker basma hakkından ayrı). Eski tek tür gemi kadırga oldu (kayıttaki alanı `ships`).
  Gemiler de kart: filo kartları seçilerek birleştirilir, ayrılır.
- **Deniz yolları (kesik çizgiler) gemi ister:** filo, gemilerinin taşıdığı kadar asker taşır. Ordu, gemileri bütün
  askerlerini taşıyabiliyorsa deniz yolunu kullanabilir; yoksa o yollar onun için yok.
  Gemiler ordunun içinde durur; ordu çıkarırken limandaki gemileri de alırsın. Sadece gemiden
  oluşan bir filo da ordu sayılır: **denizden gider, karadan yürümez, karaya saldıramaz.**
  (21.10'a kadar askersiz filo deniz yolunu hiç kullanamıyordu, sadece karadan yürüyordu - bir
  hataydı. Eski kayıtta karada kalmış bir filo bir limana dönebilsin diye kara yolu açık.)
- **Haritada:** gemili ordu limandayken denizde bir filo olarak durur (gemi sayısı kadar, en
  fazla üç kadırga; askerliyse küpeştede kalkanlar), deniz yolunda kadırga olarak yüzer, karada
  asker figürüdür. Limanda bekleyen gemiler denizde yelkeni sarılı demirli durur.
- **Başlangıç gemileri:** liman olan başkentte 2, öteki limanlarda 1, büyük bağımsız
  limanlarda 2, öteki bağımsız limanlarda 1.
- **Deniz savaşı:** denizden bir limana saldırınca önce limandaki (ve sahibinin oradaki
  ordularının) gemileriyle çarpışılır. Güç = her gemi türünün sayısı × gücü × denizcilik
  (Kartaca × 1.5) × şans. Kaybeden filonun hepsi batar; kazanan, güçler yakınsa çok gemi kaybeder
  (her türden aynı oranda). **Filo yenilirse
  ordu denizde kaybolur;** kazanırsa karaya çıkar ve kara savaşı başlar. Saldırı tahmini deniz
  savaşını da sayar.
- **Alınan limanın gemileri yanar.**
- **Abluka:** sahibiyle savaşta olan birinin, limanın önünde denizde (1.2 birim) limandakinden
  güçlü filosu duruyorsa liman ablukadadır: balık gelmez, vergi yarıya iner. Haritada çapası kırmızı.

> Denge: donanma gelince denizler gerçek bir engel oldu. İlk denemede bilgisayar neredeyse hiç
> denize açılamadı (gemi için sanayi 2 isteniyordu ve limana bir savunma gemisi bırakıyordu) ve
> ilk düşüş 143. tura fırladı. Tersane şartı kalktı, bir gemi 25 asker taşıyor, bilgisayar
> limandaki gemilere biniyor: ilk düşüş 70 oyunda 61. tur (donanmadan önce 41). Dünya biraz
> daha yavaş - oyuncunun nefes alacak zamanı daha çok.

## 16. Liman yapıları

Liman şehirlerinin kartında ikinci bir sekme var: **Liman**. Dört yapı, hepsi şehir seviyesini
geçemez ve diğer yükseltmelerle aynı fiyatta (yeni seviye × 10 para), aynı turluk hakla:

| Yapı | Başlangıç | Her seviye |
|---|---|---|
| **Balıkçılık** | 0 | Turda +2 balık (limanın kendi 1 balığına ek; ablukada hiç) |
| **Tersane** | 1 | Turda bir gemi daha; 1. seviyeden sonra gemi 1 para ucuz (4 → 3 → 2) |
| **Ticaret** | 0 | Turda +2 para (medeniyetin para bonusu da uygulanır; ablukada yarı) |
| **Liman kalesi** | 0 | Savunan gemiler × 1.25 daha; ablukaya almak için o kadar çok gemi gerek |

- **Gemi artık asker basma hakkından yemez**, tersanenin kendi hakkı var.
- Tersanesi olmayan limanda gemi yapılamaz (başlangıçta her limanın tersanesi 1).
- **Roma artık liman** (Ostia, Tiber ağzı) ve Sardinya'ya (Karalis) deniz yolu var.

> Denge: gemi asker hakkından ayrılınca herkes daha çok asker bastı; Roma'nın payı küçüldü ve
> limansız Galya onu 70 oyunun 31'inde ayakta bırakacak kadar yuttu (önce 43). Roma'ya Ostia
> limanı verildi (tarihte de vardı). Güçler dengelenince bilgisayarlar arası savaş 1.8 kat
> eşiğinde dünya dondu (7 oyunun 4'ünde hiç savaş yok); eşik 1.5'e döndü ve zamanla düşüyor
> (12. turdan sonra her tur −0.005, en az 1.1; alınacak bağımsız kalmayınca −0.15 daha).
> 70 oyunda ilk düşüş ortalaması 51. tur, Roma 57 oyunda ayakta.

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

- **Kayıt yuvaları** (kullanıcının "olmazsa olmazlar"ının üçüncüsü, 26.10): otomatik kaydın (her tur) yanında
  üç yuva. Menüde *Kaydet* ve *Yükle*; açılış ekranında *Devam et*in yanında *Yükle*. Her yuva bir satır:
  medeniyetin rengi, adı, turu, kaydedildiği gün ve saat (birkaç oyunculuysa kaç oyuncu). Yeni oyun yalnız
  otomatik kaydı siler, yuvalardakiler kalır; yuvadan yüklenen oyun otomatik kayda da geçer. Yuvanın özeti
  ayrı anahtarda (`mn.slots`), oyun `mn.slot.N`te (main.js).
- **Üst bant:** Tur sayısı, para, silah, yiyecek (her birinin yanında turluk + / −).
- **Bina kartları** (kullanıcı 26.10: "tarla 1->2 yazıyor yanında bir buton, sıkıcı; Total War'da görsel
  vardı, sağ üst köşede seviyesi"): şehir, liman ve yapılar sekmelerinde her yapı bir kart - üstte
  resmi (`src/view/buildings.js`: evler, ekin şeritleri, dumanlı ocak, çitli kışla, tekneler, kızak,
  amforalar, kule, tapınak, pazar tenteleri, okul, hamam; seviye arttıkça sahne zenginleşir), sağ
  üst köşede seviye rozeti, altında adı ve şu an ne getirdiği ("+16 yiyecek"). **Kartın kendisi
  düğme** (kullanıcı 26.10: "kartın altında para ve buton olmasın, görselin kendisi buton olsun"):
  karta basınca yükselir; fiyat resmin alt kenarındaki koyu şeritte; üstüne gelince kart kalkar,
  ortada ▲ belirir; yükseltilebilen kartın çerçevesi altın, olmayan soluk. Sürüyorsa resmin üstünde
  çekiç, şeritte kalan tur ve ilerleme, sol üst köşede ✕ (iptal); kilitliyse asma kilit resmin
  ortasında, nedeni adın altında; bittiyse şeritte EN ÜST. Soldaki şehir resminde yapılar görünür: tarla şeritleri,
  sanayinin bacaları, kışlanın çadırları, tapınak, pazar. Bir yükseltme bitince şehrin üstünden
  kazancıyla yükselir ("Tarla 2 · +4 buğday").
- **Asker ve gemi kartları** (kullanıcı 26.10, bina kartlarından sonra: "asker basma işini de böyle
  yapmamız lazım"): **Asker bas** sekmesinde (kullanıcı aynı gün: "ilk sekme çok kalabalık, liman gibi
  ayrı sekme olsun"; Şehir sekmesinde artık yalnız dört yükseltme kartı, geniş) piyade, okçu, süvari, kuşatma birer kart:
  resmi (`troopArt`, ordu kartındakiyle aynı), sağ üst köşede şehirdeki bölük sayısı, adı, işi
  ("Hattı tutar", "Okçuyu biçer"), fiyatı resmin altındaki şeritte; karta basınca *+10* (üstüne
  gelince ortada +10 belirir). Basılabilen kartın çerçevesi altın; kilitliyse asma kilit ve kısaca nedeni (teknoloji adı, "Kışla 3"). Liman sekmesinde aynısı
  gemiler için: kadırga, trireme, kinkerem, köşede buradaki gemi sayısı, düğme *+1*.
- **Eksik olan kırmızı:** bina kartında para yetmiyorsa fiyat kırmızı; asker ve gemi kartında kasada
  yetmeyen kalem (para, silah, yiyecek) kırmızı.
- **Şehre tıklayınca:** panel **ekranın altında ortada** açılır (Total War gibi; kullanıcı 22.10:
  "solda istemiyorum"): şehir (nüfus, garnizon, üretim, sadakat, Ordu çıkar) | sekmeler: Şehir
  (yükseltmeler), Asker bas (asker kartları), Liman (liman yapıları, gemi yap), Yapılar, Harikalar,
  Garnizon (askerler kart kart). Sekmelerin genişliği yazılarına göre. Panel açıkken alttaki menü gizlenir;
  seçilen yer panelin arkasında kalacaksa harita onu yukarı kaydırır.
- **Şehir kartı, solda** (kullanıcı 22.10 sağda istedi, 23.10 "sola alalım"): her yerleşime
  tıklayınca solda, medeniyetin sancağının altında: şehrin görseli (kendi arazisinde maketi,
  içi biliniyorsa önünde garnizonu kadar asker), adı, sahibi ve ilişkisi, türü ve seviyesi; sur,
  nüfus, sadakat, yapılar, süren inşaat, garnizon, içerideki ve kapıdaki ordular. Kendi şehrinde
  altta yine yükseltme / liman / garnizon paneli. Yabancı yerin içi ancak görülüyorsa (sis) ya da
  casusu oradaysa bilinir; yoksa son casus raporu soluk, kaç tur önceki olduğuyla. Yabancı yerin
  kartında: menzildeki ordun için saldırı, *Casus gönder*, tarafsızsa *Savaş ilan et*.
- **Ordu kartı:** solda ordu (general, askerler, hareket), sağda birlik kartları; altta Yürü, Ayır,
  Birleştir, Garnizona kat. **Yürü**'ye basınca haritada basılan yer ordunun gideceği yer olur.
- **Sol tık seçer, sağ tık yürütür:** orduya tıkla, gideceği yere sağ tıkla; yanındaki düşmana
  sağ tık saldırı penceresini açar. Ordu seçiliyken bir yerin üstüne gelince yol çizilir ve kaç
  tur süreceği yazar; saldırılabilecek yerde tahmin.
- **İpuçları:** her düğmenin, kaynağın, yerin ve ordunun üstüne gelince ne olduğu; kapalı düğme
  neden kapalı olduğunu söyler; yiyecek azalıyorsa kaç turda biteceği.
- **Tur sonu:** olanlar sağ üstte haber olarak belirir (rapor penceresi araya girmez; basınca
  açılır). Kararlar (mektuplar) ve yeni görevler yine pencere olarak sorulur.
- **Klavye:** Enter turu bitirir, Tab sıradaki ordu, Esc kapatır.
- **İpucu balonları:** oyunun başında yazı penceresi yok; o an ne yapılacaksa onu gösteren tek
  bir balon (kapatılabilir, menüden yeniden açılır). Nasıl oynanır menüde, sayfa sayfa.
- **Öğretici haydutlar** (kullanıcı 23.10: "şehir yakınlarında küçük bir düşman olsun, ordu
  oluşturup garnizondan çıkarmayı göstersin, savaştırsın"): ipuçları açıkken yeni oyunda
  başkentin 1.1-1.9 birim yakınında, kendi toprağında (tercihen kuzeyinde ya da yanında, alttaki
  kartların arkasında kalmasın) bir haydut kampı: 10 piyade, 10 okçu (`src/rules/bandits.js`).
  Sahibi yok: herkes saldırabilir, kimseye saldırmaz, kıpırdamaz, kimseyi öfkelendirmez. Başkentin
  garnizonu ve bir bölük piyade aynı tur yanlarına yürüyüp kolayca yener (her medeniyet için
  testte). Dağıtan **40 para** ganimet alır. Balonlar sırayla: haydutlar -> başkente tıkla -> asker
  bas -> Garnizon sekmesi -> kartları seç (Hepsi) -> Dışarı çık -> haydutlara sağ tıkla (yürür) ->
  saldır -> savaş penceresi (balon pencerenin yanında: güç çubuğu, artılar/eksiler) -> sonuç
  şeridi -> ganimet. Haydutlar dururken şehir yükseltme, yiyecek ve tur bitirme balonları bekler.
  Bot ve denge oyunlarında haydut yok.
- **Sağ alt:** *Turu bitir* butonu.
- **Diplomasi paneli:** Her medeniyetin durumu ve butonları.
- **Savaş:** önce savaş penceresi (iki taraf, güç çubuğu, artılar ve eksiler); sonra sahne
  haritada savaşın yerinde, sonucu üstte bir şerit (bölüm 7).

---

## 12b. Casuslar

Kullanıcı 22.10: "casus gönder şeyi yapacağız, şehirler hakkında bilgi toplamak için, mesafeye
göre birkaç turda gidecek" (`src/rules/spies.js`).

- Yabancı bir yerleşimin kartından **Casus gönder**: 15 para. Casus hedefe en yakın kendi
  yerinden yola çıkar; yolculuk uzaklık / 4 birim tur (en az 1).
- Varınca içeride kalır ve **her tur rapor verir**: garnizon, içerideki ve kapıdaki ordular,
  yapılar, nüfus, sadakat, inşaatlar. Orası sisin içinde olsa da görünür (1.4 birim çember).
  Haritada sancağın solunda göz rozeti (yoldaysa soluk).
- Her tur **yakalanma** ihtimali %6, garnizonun her 100 askeri için +%3. Yakalanınca haber
  olur; son raporu kalır, yaşlanır ("3 tur önceki casus raporu").
- Aynı anda en çok 3 casus; bir yere bir casus. Yer kendi ya da müttefik yeri olursa casus döner.
- Bilgisayar casus kullanmaz (zaten her şeyi görüyor, bölüm 19).

## 12c. Zafer yolları ve skor

Kullanıcı 23.10: "şu ana kadar güzel şeyler yaptık ama hâlâ bir oyun gibi hissettirmiyor" - en
çok "ne için oynadığım belli değil" ve "savaşlar cansız"; örnek Civilization. Zafer yolları
Fetih, Harikalar, Skor (`src/rules/victory.js`).

- **Fetih:** bütün rakipler yıkılır.
- **Harikalar:** 12 dünya harikasından (6 antik, 6 inşa edilen; bölüm 18b) **8**'ini **20 tur** üst üste tutan kazanır. Sayaç başlayınca
  herkes duyar (haber, üst bantta kırmızı ünlem, Zafer penceresinde "Mısır: 12 tur sonra
  Harikalar zaferi!"). Bilgisayarlar öndekinin üstüne gider: gücü denkse savaş açar, onun harika
  şehirlerini hedefler.
- **Skor:** **200. turun** sonunda en yüksek skor kazanır. Skor: her yerleşim 10, seviyesinin her
  basamağı 4, başkent 10; her 20 nüfus 1; her harika 30; her 25 asker 1; kazanılan her savaş 3.
- Bilgisayar da Harikalar ya da Skor zaferi kazanabilir: o zaman oyuncu kaybeder.
- **Ekran:** üst bantta defnenin içinde sıra, yanında skor ("7 medeniyette 2."); tarihte "Tur 12 /
  200". Basınca **Zafer yolları** penceresi: fetihte kaç rakip ayakta, harikaların sahipleri ve
  sayaçlar, skor sıralaması (kendi satırının üstüne gelince skorun parçaları). Oyun sonu penceresi
  hangi yoldan kazanıldığını ya da kimin kazandığını söyler.
- Denge (28 bot oyunu): 4 harika / 10 tur iken oyunların yarısı Harikalar zaferiyle, en erken 20.
  turda bitiyordu (Mısır iki harikayla başlıyor). 5 / 20: beşte bir, en erken 55. tur; çoğu oyun
  200. turda skorla, birkaçı fetihle biter.

## 13. İlk sürümde olmayanlar (sonra)

İzlenen savaş, gemiler ve deniz savaşı, ticaret, atlı birlikler, haritada sis, olaylar (salgın,
isyan).

---

## 17. Görevler

Oyuncunun meclisi (Roma'da Senato, Kartaca'da Yüzler Meclisi, Mısır'da Firavunun sarayı,
Makedonya'da Kralın yoldaşları, Partlarda Şahlar Şahı, Galya'da Druidler, Sakalarda Kurultay)
birkaç turda bir görev verir. Bilgisayarlar görev almaz.

- **Ne zaman:** 3. turdan sonra, her tur sonunda yarı yarıya ihtimalle; iki görevin arası en az
  5 tur; aynı anda en fazla 2; aynı türden iki görev olmaz.
- **Kabul ya da ret:** gelen görev bir pencerede sorulur. Ret cezasız.
- **Tamamlanınca** ödül hemen ambara girer (görev yapıldığı anda, tur sonunu beklemez).
  **Süresi geçerse** görev düşer ve başkentin sadakati 5 azalır.
- **Türler:**

| Görev | Ne istenir | Süre | Ödül |
|---|---|---|---|
| Sefer | Komşu bir yeri al (bağımsız ya da savaştığın birinin) | 8 tur | 30 + 10 × seviye para, 5 silah |
| Güçlü bir donanma | Toplam gemi bugünkünden 3 fazla | 7 tur | 25 para, 10 silah |
| Dostluk | Tarafsız bir medeniyetle ittifak | 10 tur | 40 para |
| Bayındırlık | Bir yerleşimin bir yapısını bir seviye yükselt | 6 tur | 30 para 15 yiyecek (şehir seviyesi), 15 para 10 yiyecek (öteki) |
| Büyük ordu | En büyük ordunun 1.5 katı, en az 150 asker tek ordu | 6 tur | 15 silah, 15 yiyecek |
| Komutan | Generalin yoksa ata; varsa birini bir rütbe yükselt | 10 tur | 20 / 50 para |
| Huzur | Sadakati 60'ın altındaki bir yerin sadakati 80 olsun | 6 tur | 25 para |
| Savunma | Kapısında düşman olan yeri 4 tur elde tut (kaybedersen hemen düşer) | 4 tur | 30 para, 10 silah |

- **Ekranda:** alt menüde *Görevler* (açık görev sayısı), haritada hedef yerin sancağının
  yanında altın bir madalyon, tur raporunda yeni / tamamlanan / düşen görevler.
- **Zar:** görevlerin zarı ayrı (`state.mrng`): görev gelse de gelmese de savaşlar, olaylar ve
  bilgisayarın kararları aynı zarla yürür. Kayıt sürümü 6.

---

## 18. Dünya harikaları

Altı şehirde antik dünyanın harikaları var. Harika ayrıca saklanmaz: **şehri kim tutuyorsa
harika onundur** ve armağanı onun bütün ülkesine gelir. Şehir savaşta ya da isyanla el
değiştirince harika da değiştirir. (Antik dünyanın yedi harikasından haritaya düşen beşi ve
Parthenon; Zeus heykeli ve Mozole haritadaki bir yerleşimde değil.)

| Harika | Şehir | Başta kimin | Armağan |
|---|---|---|---|
| İskenderiye Feneri | İskenderiye | Mısır | Bütün limanlarında liman kalesi bir seviye fazla sayılır |
| Piramitler | Memphis | Mısır | Bütün yerlerinde sadakat turda +2 |
| Asma Bahçeler | Babil | bağımsız | Bütün yerlerinde nüfus artışı × 1.25 |
| Artemis Tapınağı | Efes | bağımsız | Bütün yerlerinde para × 1.1 |
| Rodos Heykeli | Rodos | bağımsız | Bütün limanlarında ticaret × 1.5 |
| Parthenon | Atina | bağımsız | Generallerin iki kat tecrübe kazanır |

- **Ekranda:** haritada harika şehrin sancağının sağında altın tapınaklı bir madalyon; şehir
  kartında harikanın adı ve armağanı; Şehirler listesinde madalyon; bir harika el değiştirince
  tur raporunda herkese haber.

> Denge (70 oyun, harikadan önceki sürümle aynı anda ölçüldü): ilk düşüş ortancası 52 → 61, en
> erken 25 → 29. Mısır 150 turda ayakta 52/70 → 56/70, "en büyük" dağılımı hemen hemen aynı.
> Dünya biraz yavaşladı, düzeni bozulmadı.

---

### 18b. Harikaları inşa etme yarışı

Kullanıcı 23.10, önerilerden ikincisi (Civilization gibi): antik altı harikanın yanında araştırmayla
açılan altı harika inşa edilebilir (`src/rules/wonders.js` BUILDABLE, `state.js` wonderInfo /
startWonder).

| Harika | Gerekli araştırma | Bedel | Süre | Armağanı |
|---|---|---|---|---|
| Delfi Kahini | - | 140 | 10 tur | Araştırdığın teknoloji hemen biter (seçili değilse ilk açık olan) |
| Büyük Kütüphane | Yazı | 200 | 12 | Bilim x1.25 |
| Büyük Hazine | Sikke | 220 | 12 | Para x1.15 |
| Büyük Liman | Limancılık | 220 | 12 | Filolar x1.2 güçlü, ticaret x1.2 (liman şehri) |
| Büyük Su Kemeri | Mühendislik | 280 | 14 | Nüfus artışı x1.25 |
| Kolezyum | Matematik | 340 | 16 | Her yerde sadakat turda +3 |

- Şehir (kale değil), seviye 3; bir inşaatçı süre boyunca çalışır, para başta ödenir. Aynı harika
  bir medeniyetin iki şehrinde birden yapılmaz. Vazgeçilirse para geri gelir.
- **Yarış:** herkes aynı anda yapabilir; ilk bitiren alır, ötekilerin inşaatı biter ve paralarının
  yarısı geri döner. Biri bitirince herkes duyar ("Mısır bir harika tamamladı: İskenderiye
  şehrinde Büyük Kütüphane!").
- Harika bittiği şehirde durur: şehri alan harikayı da alır (antikler gibi). Skora 30 sayar ve
  Harikalar zaferine girer.
- **Ekran:** şehir kartında *Harikalar* sekmesi (altı harika: armağanı, fiyatı, süresi, İnşa et;
  yapılıyorsa kalan tur ve Vazgeç; yapıldıysa kimin, nerede; kilitliyse neden). Haritada şehrin
  yanında harika işareti. Kendi harikan bitince kutlama penceresi. Zafer penceresinde on iki harika
  (yapılmamışlar soluk).
- Bilgisayar parası artınca, aynı anda en çok bir tane, ucuzdan pahalıya harika yapar.
- Geniş ülkeye pahalı (araştırma gibi): 6 yerleşimden sonra her yerleşim bedeli %5 artırır.
- **Harikalar zaferi** artık 12 harikadan **8**'ini 20 tur tutmak (önce 6'dan 5). 28 bot oyunuyla: eşik 5
  iken 22 oyun Harikalar zaferiyle bitiyordu, 7 iken 9, 8 iken 6 (eskisi gibi beşte bir). Harikalar ilk
  denemede yarı fiyatına ve aynı anda birkaç tane yapılıyordu: zengin Partlar 4-5'ini birden alıyordu.
  Şimdi Delfi Kahini ortanca 64. turda, Kolezyum 121. turda; oyunların yarısında hepsi yapılmıyor.
- Denge (70 oyun, zaferler kapalı, adil karşılaştırma): harikalar dengeyi neredeyse değiştirmiyor
  (harikasız 291, harikalı 298 ayakta). Bu adımda düzeltilen hareket hatası (boğazdaki feribot
  yolunda duran gemisiz ordu "denizde" sayılıp Ege'yi yürüyerek geçiyordu) dünyayı biraz kanlı
  yaptı: ayakta kalan 306 -> 291, ilk düşüş aynı (44 -> 45).

## 19. Savaş sisi ve haritanın süsleri

- **Ne görünür:** kendi ve müttefiklerinin yerlerinin (3 birim) ve sahadaki ordularının (2.5
  birim) çevresindeki çember (`src/rules/sight.js`). Ordu yürüdükçe sis onunla açılır. Ötesi boyalı bir sisle örtülür: yerleşimler ve sahipleri görünür
  (haritalar herkesin elinde) ama soluk; ordular, filolar, limandaki gemiler ve garnizon
  sayıları görünmez. Yabancı kartta garnizon "bilinmiyor (sis)".
- **Tur gösterisi:** sisin içindeki hamleler gösterilmez, beklemeden geçer; yürüyen ordu sisten
  çıkınca görünür.
- **Sadece ekran:** bilgisayar her şeyi görür (plan.md 2.7). Menüden kapatılabilir (tercih
  tarayıcıda saklanır).
- **Süsler** (`src/view/atlas.js`): denizlerde Latince adlar (Mare Nostrum, Pontus Euxinus,
  Mare Aegaeum…), karalarda bölge adları (Hispania, Gallia, Scythia, Aegyptus…), sol altta
  pusula gülü, haritanın üstünde ağır ağır süzülen bulut gölgeleri (uzaktan bakınca beyaz
  bulutlar da), rüzgârda dalgalanan sancaklar. Harita saniyede 20 kare canlı çizilir, sekme
  arkadayken durur.

---

## 20. Kuşatma

Surlu bir yere (kale, başkent, 3. seviye ve üstü şehir) **hemen saldırmak yerine kuşatılabilir**
(`src/rules/siege.js`). Saldırı penceresinde üç seçenek: Saldır, Kuşat, Vazgeç.

- **Kuşatma başlayınca** ordu o turun hareketini harcar ve hedefin surlarının önüne kamp kurar
  (haritada durduğu yerde çadırlarıyla; hedefin çevresinde kırmızı halka). Ordu hedefin menzilinde
  (0.8 birim) ve karada olmalı: denizden kuşatma yok (deniz ablukası ayrı, bölüm 15).
- **Her tur sonunda:** içerideki bütün askerler (garnizon ve sahibinin oradaki orduları) açlıktan
  **%10** erir, her birimden en az bir adam; her 10 kuşatma makinesi bunu **+%2** hızlandırır, en
  fazla **%25**. Kuşatılan yer **hiçbir şey üretmez** ve sadakati turda **5** düşer. Kamptaki
  ordu da salgın ve kaçaklarla turda **%3** erir: uzun kuşatma bedava değil.
- **Teslim:** içeride kimse kalmayınca yer kuşatana teslim olur, ordu içeri girer.
- **Kuşatma kalkar:** ordu yürüyünce (o an), saldırınca (kazansa da kaybetse de), oyuncu
  "Kuşatmayı kaldır" deyince ya da yer artık düşman değilse (barış, ittifak). Kuşatan ordu
  istediği tur saldırabilir: aç kalmış garnizon zayıftır.
- **Saldırı penceresi** kuşatmanın turluk erimesini ve yaklaşık kaç turda teslim olacağını
  söyler; ordu kartı "Kuşatıyor: X · n. tur · içeride N asker" gösterir.
- **Bilgisayar da kuşatır:** komşusunda kolay hedef yoksa, surlu bir hedefin savunanlarının en
  az yarısı kadar askeri varsa ve hedef "umutsuz" değil "zor"sa kuşatır; hedef kolaylaşınca
  saldırır, yoksa bekler.

> Denge (70 oyun): kuşatma bilgisayarın elinde çok güçlü çıktı. Umutsuz hedefleri de kuşatınca
> ilk düşüş 61 → 40-45 (erimeyi %7'ye, sadakati 3'e indirmek, eşiği dörtte üçe çıkarmak, kamp
> yıpranması - hiçbiri değiştirmedi; bilgisayarın kuşatmasını kapatınca tam 61: sebep davranış,
> kural değil). Sadece "zor" hedefleri kuşatınca 51 (en erken 24), donanma ve harikalardan önceki
> uzun süreli dengeye denk. Partlar 150 turda ayakta 33/70 (önce 37), Sakalar 36/70 (38).

---

## 21. Kronik

Oyunun tarihi (`src/rules/chronicle.js`). Menüden ve oyun sonu penceresinden açılır.

- **Grafik:** her tur sonunda her medeniyetin yer sayısı ve asker sayısı not edilir; pencerede
  "Yerler" ve "Asker" arasında geçilir, oyuncunun çizgisi kalın.
- **Yıllık:** oyuncuyu ilgilendiren her şey (aldığı ve kaybettiği yerler, savaşları, ittifakları,
  kuşatmaları, tamamlanan görevler) ve başkalarının arasındakilerden büyükleri (başkent ya da
  harika şehrin el değiştirmesi, savaş ilanları, ittifaklar, barışlar, çöken medeniyetler). En
  yenisi üstte, oyuncunun lehine olan yeşil, aleyhine olan kırmızı.
- Kayıt küçük: tur başına iki kere yedi sayı; yıllık en fazla 300 satır, taşarsa önce
  oyuncuyu ilgilendirmeyen en eski satır düşer. Kayıt sürümü 7 (eski oyunun kroniği
  yükseltildiği turdan başlar).

---

### 21b. Oyun sonu özeti

Kullanıcı 23.10, önerilen küçük işlerin sonuncusu (Civilization'ın oyun sonu ekranı gibi). Oyun
bitince pencerede **Özet**: solda dünyanın tur tur tekrarı (mini harita, oynat/durdur, zaman çizgisine
basınca o tura atlar), sağda herkesin skoru oyun boyunca (oyuncunun çizgisi kalın, tekrarın turu
dikey çizgiyle) ve son sıralama, altta oyuncunun sayıları: skor ve sırası, yerleşim (en çok),
en büyük ordu, kazanılan savaş, alınan yer, araştırma, harikalar. Kronik bunun için her tur her
medeniyetin skorunu ve her yerleşimin sahibini de kaydeder (`chronicle.score`, `chronicle.owners`:
yerleşim başına bir harf); eski kayıtta tekrar kayıttan sonraki turlardan başlar.

## 22. Arazi ve mevsim

**Arazi** (`src/rules/ground.js`):
- **Nehir geçişi:** kara yolunun çizgisi bir nehri kesiyorsa (Natural Earth nehirleri, yolun iki
  ucuna 0.3 dereceden yakın kesişmeler sayılmaz - kıyıdaki şehirlerin yolları) o yoldan
  saldıranın gücü **× 0.85**. 14 yol: Ebro, Duero, Seine, Rhone, Po, Tuna (Odessos–Olbia),
  Dinyeper, Fırat (Mazaka–Artaşat), Dicle (Babil–Ekbatana)...
- **Dağ geçidi:** o yoldan gelen saldırıya karşı savunanın gücü **× 1.25**. 12 geçit, elle:
  Pireneler, Alpler (iki yol), Apeninler, Pindos, Thermopylai, Kilikya Kapıları, Zagroslar,
  Ermeni yaylası (iki yol), Kafkaslar, Hazar Kapıları.
- Haritada: geçidin ortasında karlı iki tepe, nehir geçişinde küçük bir köprü (yakından
  bakınca). Saldırı penceresi araziyi yazar; tahmin araziyi sayar.

**Mevsim** (`src/rules/season.js`): her tur bir mevsim (ilkbahar, yaz, sonbahar, kış), dört tur
bir yıl; oyun MÖ 270 ilkbaharında başlar. Üst bantta "Kış · MÖ 268".
- **Kışın denizde fırtına:** deniz yolunda yürüyen ya da denizden saldıran ordu %25 ihtimalle
  fırtınaya yakalanır: her birliğinden %10 ve (birden çoksa) bir gemisi gider.
- **Kış yıpratması:** kış turunun sonunda bütün ordular (garnizon değil) %3 erir, aşağı
  yuvarlanarak (küçük birlik erimez).
- Haritada kışın kara soğuk beyaz bir örtüyle kaplanır ve kar yağar.

> Denge (70 oyun, önceki sürümle aynı anda): ilk düşüş 51 → 50, en erken 24 → 23; Partlar
> 150 turda ayakta 33 → 37/70, Sakalar 36 → 27/70 (dışarı açılan yolları Tuna ve Dinyeper'i
> geçiyor; önceki ölçümlerde Sakalar 30-38 arası oynadı - gürültünün alt ucu, izlenecek).

---

### 22b. Dağlar

Kullanıcı 23.10 önerilerden ("Alpler, Toroslar düz kara gibi yürünüyor"). Dağ sıraları elle çizildi
(`src/data/mountains.js`: Alpler, Pireneler, Dinar Alpleri, Pindos, Balkanlar, Karpatlar, Toroslar,
Ermeni yaylası, Kafkaslar, Zagros, Atlaslar); çizgiye yakın kara kareleri dağ (yerleşimin karesi
hariç). Yol dışında dağ adımı iki kat pahalı; yollar geçittir, hızı aynı. Dağda duran orduyu meydan
muharebesinde savunan, dağ geçidi gibi x1.25 güçlü. Yol önizlemesinde hedef dağdaysa "dağlık" notu.

> Denge (70 oyun, zaferler kapalı): geri çekilme ve dağlarla ayakta kalan 303 -> 315, ilk düşüş
> 44 -> 46, Mısır 41 -> 50/70.

## 23. Araştırma ağacı

Kullanıcı 23.10: "hâlâ bir oyun gibi hissettirmiyor", örnek Civilization; araştırma ağacı "evet,
eklensin" (`src/rules/research.js`).

- **Bilim:** her şehrin nüfusu üretir: her **80** nüfus turda 1, başkent +2. Makedonya x1.25
  (Aristoteles'in okulu). Bilgisayarda zorluğun üretim çarpanı bilime de uygulanır.
- **Araştırma:** bir seferde bir teknoloji. Bilim her tur ona akar; bedeline varınca biter, etkisi
  o medeniyetin her yerinde hemen başlar, artan bilim birikir. Hiçbir şey seçilmemişken bilim boşa
  gitmez, birikir ve seçilince akar. Araştırmayı değiştirmek ilerlemeyi silmez.
- **Bedel** çağına göre: I. çağ 40, II. 120, III. 260, IV. 450 bilim (hepsi 3480).
  Civilization V gibi geniş ülke daha pahalı araştırır: 6 yerleşimden sonra her yerleşim bedeli
  %5 artırır (20 yerleşimli bir medeniyet için x1.7).
- **Denge (70 oyun):** ekonomi etkileri ilk denemede iki katıydı (tarla/silah +%25, balık/ticaret
  +%50, para +%15, bilim +%25, nüfus +%30): ilk düşüş 49'dan 43'e indi, Partlar oyunların 36'sında
  en büyüğe çıktı (araştırmasız 23), Mısır 49'dan 37'ye düştü. Deneylerle (`Tools/experiment.mjs`
  artık `"R.tactics.mods": {}` gibi bir teknolojinin etkisini kapatabiliyor): sadece kilitler
  zararsız, kartopunu ekonomi ve savaş etkileri birlikte yuvarlıyor; geniş ülke cezasını iki katına
  çıkarmak fark etmedi. Ekonomi etkileri yarıya indi: ilk düşüş 48, Partlar 30, ayakta kalan toplam
  339 (araştırmasız 328).
- **Ağaç**, dört kol x dört çağ; her teknoloji kendi kolunda bir öncekini ister:

| Kol | I. çağ | II. çağ | III. çağ | IV. çağ |
|---|---|---|---|---|
| Toprak ve at | Sulama: tarla +%15 yiyecek | Atçılık: süvariyi açar | Taktik (+Demir İşleme): okçu ve süvari savaşta +%15 | Strateji: bütün askerler +%10 |
| Maden ve yapı | Bronz İşleme: silah +%15 | Demir İşleme: piyade savaşta +%10 | Mühendislik: kuşatma makinesini açar, yükseltmeler %20 ucuz | Surculuk: surlar %20 güçlü |
| Deniz | Yelkencilik: balık +%30 | Limancılık: ticaret +%30 | Gemi İnşası: kinkeremi açar | Seyir: filolar %25 güçlü |
| Bilgi ve para | Yazı: bilim +%20 | Sikke (+Yelkencilik): para +%10 | Matematik: bilim +%20 | Tıp: nüfus %20 hızlı artar |

- Açılan birimler yine yapısını ister: süvari kışla 3, kuşatma makinesi sanayi 3, kinkerem
  tersane 3. Kilitli düğme neden kilitli olduğunu söyler ("Önce Atçılık araştırılmalı").
- Savaş çarpanları savaş penceresinde ayrı satır: "Araştırma: piyade +%10", "Şehir surları +
  Surculuk".
- **Skor:** her teknoloji 3.
- **Bilgisayar** sırayla araştırır: önce Bronz, Sulama, Yazı, Demir, Atçılık...; filosu güçlü
  medeniyet (Kartaca) deniz kolunu öne alır.
- **Ekran:** alt menüde **Araştırma** (kandil): çevresinde araştırılanın ilerlemesi, hiçbir şey
  seçilmemişse kırmızı ünlem. Pencerede ağaç: bilinen altın, araştırılan parlak çerçeveli ve
  ilerleme çubuklu, açık olan basılabilir, kilitli soluk; çizgiler neyin neyi istediğini gösterir.
  Bir araştırma bitince ağaç kendiliğinden açılır. İpucu balonu ilk araştırmayı seçtirir.
- **Eski kayıt** (sürüm 12): herkes sıfırdan; ama kullandığı birimi açan teknoloji (ve istedikleri)
  verilir - süvarisi ya da kışla 3'ü olana Atçılık, kuşatma makinesi ya da sanayi 3'ü olana
  Mühendislik, kinkeremi ya da tersane 3'ü olana Gemi İnşası.
- Hız (bot oyunları): en büyük medeniyet ağacı 67-70. turda bitirir, ortalar 86-144 arası,
  küçükler bitiremez.

---

## 24. Liderler ve canlı diplomasi

Kullanıcı 23.10 "başka ne yapabiliriz" -> sırayla; ilki liderler (Civilization gibi: rakiplerin
bir yüzü, kişiliği ve sana karşı bir tutumu olsun, konuşsunlar). `src/rules/leaders.js`,
portreler `src/view/leaders.js` (çizim, resim dosyası yok).

| Medeniyet | Lider | Kişilik | Ne demek |
|---|---|---|---|
| Roma | Scipio Africanus | Disiplinli | İttifaka sadık (kabul x1.2) |
| Kartaca | Hannibal Barka | Hırslı | Savaş x1.15, barış x0.9; Roma'ya -15 (Hamilkar'ın yemini) |
| Mısır | Kleopatra | Diplomat | Savaş x0.9, barış x1.15, ittifak x1.3, hediye x1.5, herkese +10 |
| Makedonya | Büyük İskender | Fatih | Savaş x1.15, barış x0.9, ittifak x0.85, herkese -5 |
| Partlar | Büyük Mithridates | Kurnaz | Savaş x1.05, barış x0.95 |
| Galya | Vercingetorix | Gururlu | Toprağında 2 tur kalana savaş açar (ötekiler 3), savaş x1.05, hediye x0.75 |
| Sakalar | Tomris Hatun | Kindar | Savaş ilanını 60 tur hatırlar (ötekiler 25-40), barış x0.85 |

Savaş çarpanı hem savaş açma ihtimalini çarpar hem gereken üstünlüğü böler. **Denge (70 oyun):**
ilk denemede çarpanlar 0.75-1.3 arasıydı; saldırgan liderler kendini yıpratıyordu (Makedonya 150
turda ayakta 44 -> 37/70, Sakalar 48 -> 40), temkinli Mithridates büyüyordu (Partlar en büyük
30 -> 40). Yumuşatılınca: ayakta kalan toplam 344 (önce 339), herkes 41+, Partlar en büyük 31,
ilk düşüş 46. `Tools/experiment.mjs` artık `"P.macedon.war": 1` alıyor.

- **Tutum** (-100..100): bir liderin sana (ve her medeniyetin birbirine) bakışı, gerekçeleriyle:
  kişiliği, savaştayız -40, müttefikiz +25, ortak düşmanımız var +20, bize savaş açtın -25 (zamanla
  unutulur), ittifakı bozdun -30 (unutulur), toprağımızdaki orduların öfke başına -8, hediyelerin,
  haraç ödedin +10, ticaretimiz +15, sınırlarımız bitişik -5, fazla güçlüsün -10, harikalar
  yarışındasın -15. Dostça (25+), nötr, soğuk (-10'dan aşağı), düşmanca (-30'dan aşağı).
- Tutum bilgisayarın kararlarını çevirir: soğuksa ittifak kabul etmez, ittifak ve barış ihtimali
  tutumla artar; düşmancaya savaş açmaya 1.6 kat istekli, dostçaya 0.4 kat. Kişilik savaş, barış ve
  ittifak isteğini çarpar.
- **Hediye** (25 ya da 50 para): her para tutuma 0.5 puan (Kleopatra 0.75, Vercingetorix 0.375), en
  çok 40, turda 1 söner.
- **Ticaret anlaşması:** savaşta değilken; müttefik hep kabul eder, nötr tutumda çoğunlukla. İki
  taraf da 20 tur boyunca turda 3 para kazanır; savaş anlaşmayı bitirir. Dostça bir lider kendisi de
  önerebilir (mektup).
- **Para karşılığı barış** (30 para): kabul ihtimali artar, kabul edilirse para karşıya geçer.
- Her teklif (ittifak, barış, ticaret) bir medeniyete turda bir kere.
- **Ekran:** Diplomasi'de her satırda liderin portresi, adı, ilişki ve tutumu; *Görüş* liderle
  görüşme ekranını açar: büyük portre (yüz ifadesi tutuma göre: gülümser, somurtur, kaşlarını
  çatar), konuşma balonu, kişiliği, tutum ve gerekçeleri, yapılabilecekler. Bir şey önerince lider
  cevap verir. Teklif mektuplarında liderin portresi ve sözü; sana savaş açan lider konuşur
  ("Kan mı istedin? Doyasıya içeceksin!").

---

## 25. Aynı bilgisayarda birkaç oyuncu

Kullanıcı (22.10'dan beri istiyordu; 23.10 "sırayla devam et"): arkadaşlarla aynı bilgisayarda,
sırayla (hotseat).

- Başlangıç ekranında **Oyuncular: 1 2 3 4**. Birden fazlaysa medeniyetler sırayla seçilir
  ("1. oyuncu: Roma · Sıradaki"); seçilen medeniyet listede oyuncunun numarasıyla işaretlenir,
  ikinci kez seçilemez.
- `state.players`: insan oyuncular; `state.player` her zaman sırası gelen. Bilgisayar insanların
  yerine oynamaz; zorluğun üretim çarpanı bilgisayarlara (bütün insanlar oyuncu gibi).
- **Tur:** her oyuncu sırayla kendi turunu oynar. Sıra değişirken ekranın tamamı kapanır: sırası
  gelenin lideri, "Sıra: Kartaca", "Bilgisayarı devret - ötekiler başka yere baksın", **Hazırım**
  (Enter da). Escape kapatmaz. Son oyuncu turunu bitirince dünya döner (bilgisayarlar, üretim,
  araştırma...), sonra ilk oyuncunun sırası. Birkaç oyuncuda tur gösterisi (kamera turu) yok.
- Her oyuncunun kendi sisi, kartları, mektupları (olaylar ve bilgisayarın teklifleri - teklifin
  alıcısı `to`), görevleri (her birine ayrı, ayrı aralıkla), haberleri, araştırma uyarısı, ona savaş
  açan liderin sözü ve tamamlanan harikası; "Hazırım"a basınca gelir.
- Bir oyuncu yıkılırsa oyundan çıkar, ötekiler sürer. Hepsi yıkılırsa oyun biter. Tek kalan
  medeniyet fetihle kazanır; Harikalar ve Skor zaferi herkes için aynı. Oyun sonu penceresi
  kazananın adını yazar.
- Öğretici (ipucu balonları, haydutlar) birkaç oyuncuda yok. Kayıt 16 (eski oyun tek oyuncu).

---

## 26. Barbarlar

Kullanıcı 26.10: "oyun başta beni tutamıyor, ne olduğunu anlayamıyorum; savaşlar başladıktan sonra
iyileşiyor". Sordum: çözümlerden "Barbar kampları"nı seçti (Civilization'daki gibi ilk turlardan
savaşılacak düşman). `src/rules/barbarians.js`.

- **Kamplar:** oyun başında 7 kamp - her başkentin 2.6-4.5 birim yakınında, başkentten karadan
  yürünerek varılan bir yerde bir tane (herkesin ilk hedefi, `home`; Kartaca'nınki önce Sardinya'ya
  düşüyordu), gerisi haritanın boş yerlerinde. Kamplar arası en az 3 birim, hiçbir yerleşimin dibinde
  değil, sahibi olan yerleşimlerden en az 2.6 uzak. 24 piyade ve 8 okçuyla başlar, turda 1 piyade
  büyür (en çok 70). Her 12 turda bir yeni kamp kurulur (en çok 10). Haritada çadırlar ve kamp
  ateşi; yerleşimler gibi sisde de görünür (kıpırdamazlar; akıncıları sis gizler).
- **Akın:** 5. turdan sonra en az 30 askeri olan kamp her tur 1/6 ihtimalle askerinin yarısıyla
  5 birim içindeki, umutsuz olmadığı en yakın yerleşime akıncı yollar ("Barbarlar Ariminum üstüne
  yürüyor"). Akıncılar yürür, menzile girince saldırır. Kazanırlarsa **yağmalar**: garnizon ölür,
  nüfusun dörtte biri ve kasadan 25 para gider, süren inşaat yıkılır, sadakat 15 düşer; yer sahibinde
  kalır, akıncılar dağılır. Kaybederlerse dağılırlar (savunan bir savaş kazanmış sayılır).
  Akıncılar şehrin tehdit uyarısına girer. (İlk denemede yerleşimi alıyorlardı: 14 bot oyununda 33
  şehir, yeni oyuncu 10. turda şehrini kaybedebiliyordu.)
- **Ganimet:** kampı dağıtan 40, akıncıları sahada yenen 15 para alır. Kamp çekilmez, dağılır.
- Barbarlar herkese düşman (savaş ilanı gerekmez), kimseyi öfkelendirmez. Bilgisayar yakınındaki
  kampları ve akıncıları temizler (kampa ek öncelik).
- Bot oyunlarında (14 oyun, 100 tur): ilk akın ortanca 10. turda; oyun başına ~10 akın, ~2.5 yağma;
  kampların çoğu bilgisayarlarca dağıtılır.
- Eski kayıtlara da kamplar kurulur (kayıt 18).
- **İpucu balonları:** öğreticideki haydutlar dağılınca kamera oyuncunun ev kampına kayar, balon onu
  gösterir (sıradaki hedef: "ordunla üstüne sağ tıkla, 40 para ganimet"). Haritanın güney kenarındaki
  yerler alttaki panelin arkasında kalmasın diye kamera oyunda alttan panel kadar taşabilir. Görünen akıncılar oyuncunun bir yerine
  yürürken ayrı bir balon uyarır ("o şehirde asker bas ya da ordunla önlerini kes").
- Denge (70 oyun, zaferler kapalı): ilk düşüş aynı (46); 150. turda ayakta kalan 315 -> 295. Akınlar
  tamamen kapalıyken de 295: düşüş akınlardan değil, kamplar oyunları başka bir gidişata sokuyor
  (ve 70 oyunun gürültüsü +-10). Yağmayı yumuşatmak (nüfusun %15'i, akın 1/8) 291, akını seyrekleştirmek
  302 okudu - gürültü içinde; erken hareket için varsayılanlar kaldı.

---

## 27. Büyük krizler

Kullanıcının istediği "olmazsa olmazlar"ın dördüncüsü (26.10): oyunun sonunu canlı tutmak. Strateji
oyunlarının bilinen sorunu, büyüyenin bir noktadan sonra rahatça kazanması (plan.md "dünyanın donması").
Çaresi büyüklerin başına gelen dertler. `src/rules/crises.js`, hepsi **50. turdan** sonra.

- **İç savaş:** en az 10 yeri olan medeniyete turda %3 ihtimalle (iki iç savaş arası en az 40 tur).
  Başkentten en uzak yerlerin onda üçünün valileri ayaklanır. Oyuncuya mektup: *valilere altın dağıt*
  (şehir başına 20 para, ama en az kasanın yarısı; kalırlar, sadakatleri 35'e düşer) ya da *reddet*
  (eyaletler hemen kopar, bağımsız olur; garnizonları ve içlerindeki ordular valilerin yanına geçer -
  geri almak gerekir). Bilgisayar en büyük imparatorluksa ödemez, değilse parası iki katı yetiyorsa öder
  (bilgisayarın kasası geç oyunda binlerce: ilk sürümde 37 iç savaşın 33'ünde ödedi, hiçbir şey değişmedi).
  Başkalarının iç savaşı ve kopan eyaletleri haberlere düşer.
- **Büyük salgın:** turda %2 ihtimalle (en az 40 tur arayla) dünyanın en kalabalık şehrinde başlar; 6 tur
  boyunca her uğradığı şehirden yollarla komşulara yarı yarıya geçer. Uğradığı yerin nüfusunun dörtte biri,
  garnizonun ve kapıdaki orduların onda biri ölür; her hamam seviyesi kaybı %20 azaltır (en çok %60).
  Haritada uğradığı yerlerin sancağının solunda yeşilimsi bir hastalık bulutu; haberde başladığı yer ve
  oyuncunun her şehrindeki kayıp.
- **Büyük göç (Kimberler):** 70. turdan sonra turda %3 ihtimalle (en az 40 tur arayla, aynı anda bir tane)
  en çok yeri olan medeniyetin başkentinden en uzak yerinin 2.6-5 birim yakınında 150 + tur sayısı kadar
  barbar belirir (yarısı piyade, okçu ve süvari). Akıncılar gibi yürür ve yağmalar, ama yağmadan sonra
  dağılmaz: sağ kalanlarıyla 8 birim içindeki bir sonraki yere (önce kurbanın) yürür. Yenilince yok olur,
  25 turda dağılır. Sisde de görünür, tehdit uyarısına ve ipucu balonuna girer.
- Ölçüm (21 bot oyunu, 150. tur): en büyüğün yeri ortalama 22.5 -> 20.9, en çok 38 -> 30 (iç savaşların
  yarısından çoğu kopmayla bitiyor); 70 oyunda ilk düşüş 48 (aynı), ayakta kalan toplam 332 -> 335.
  14 bot oyununda: oyun başına ~2.7 iç savaş, ~1.2 büyük salgın (her biri ~6 yere uğrar),
  ~1 büyük göç (her biri ~3 şehri yağmalar, 44 akından 37'si yağma).

---

## 28. Ticaret yolları

Kullanıcının istediği "olmazsa olmazlar"ın beşincisi (26.10). `src/rules/trade.js`.

- **Yuva:** pazarı olan şehir bir yol, limanında ticaret (Liman sekmesi) olan bir yol daha, 5. seviye pazar
  bir üçüncüsünü kurar (en çok üç). İlk denemede her seviye bir yoldu: bilgisayar pazarı ve ticareti 5'e
  çıkarınca şehir başına 10 yol, medeniyet başına turda 360 para ticaret çıktı.
- **Nereye:** karadan 9 birim, iki liman arasında denizden 18 birim içindeki her yerleşime (kendi şehrin,
  başka medeniyet, bağımsız); savaştaki medeniyetin yerine kurulmaz.
- **Kazanç:** turda 1 + uzaklık x 0.2 para (yabancıyla x1.4, en çok 5) yolu kurana; yabancı ortak bunun
  yarısını alır (Civilization gibi). Ekonominin ~%20'si (bot oyunlarında 40., 80., 120. turlarda ortanca);
  ortak tam alırken %28'di.
- **Kopma:** savaş çıkınca, kuranın şehri el değiştirince ya da yuvası artık yetmeyince yol düşer (oyuncuya
  haber). Uçlardan biri kuşatılmışsa ya da deniz yolunda biri ablukadaysa o tur para gelmez ("durdu").
- **Ekran:** şehrin Yapılar sekmesinin sağında *Ticaret yolları* (kaç yol / kaç yuva; her yol bir satır:
  nereye, karadan mı denizden mi, turluk para, ✕ kapat; başkalarının bu şehre kurduğu yollar soluk) ve
  *+ Ticaret yolu kur* - pencerede menzildeki en kazançlı yedi yer, her biri *Kur* ile. Haritada oyuncunun
  yolları kesik altın çizgi, üstünde gidip gelen kervan ya da yelkenli; deniz yolu denizden (karaya da
  girebilen ama karayı pahalı sayan bir arama: ızgarada boğazlar kapalı), kara yolu karadan.
- Bilgisayar boş yuvası olan her şehrinde en kazançlı yolu kurar.
- Denge (70 oyun, zaferler kapalı): ilk düşüş 48 -> 58, ayakta kalan toplam 335 -> 347 (ek para savunmayı
  güçlendiriyor; her oyunda savaş çıkıyor, 25. turda bağımsızların çoğu alınıyor - test.mjs bakıyor).
