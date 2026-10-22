# Mare Nostrum — Kurallar (SADE SÜRÜM)

> Keyif için yapılan, sıra tabanlı bir strateji oyunu: Rome Total War'ın kampanya haritası,
> sadeleştirilmiş.
>
> **22.10.2026'da sadeleşti.** Kullanıcı: "yine çok karıştırdık... basit olsun, kaynak ve yemek
> yap, ordu oluştur ve savaş, çok detaylandırmadan. Oynaması kolay ve anlaşılır olsun." ve
> "sade ama biraz çeşit"i seçti. Silah, nüfus, sadakat, olaylar, görevler, generaller, kuşatma,
> harikalar, arazi, mevsim, liman yapıları ve deniz savaşı kalktı. O sürüm git'te
> **`detayli-surum`** etiketinde duruyor.
>
> Bütün sayılar tek yerde: `src/rules/numbers.js`. Bu belge onların açıklaması.

---

## 1. Özet

- **Dönem:** MÖ 270, Akdeniz. Bir tur bir yıl.
- **Oyun:** Yedi medeniyetten birini seçersin, ötekileri bilgisayar oynar.
- **Döngü:** şehirler altın ve yemek getirir → altınla şehir geliştirir, asker basarsın → yemek
  askerini doyurur → ordu çıkarır, yürür, savaşırsın.
- **Kazanma:** bütün öteki medeniyetleri yenmek. **Kaybetme:** son yerini kaybetmek.
- **Platform:** masaüstü tarayıcı (telefon yok: kullanıcı 21.10 "mobil yok").
- **Dil:** arayüz İngilizce, Türkçe seçeneği var.

---

## 2. Harita

- **Gerçek harita, hiç değişmez.** Kıyılar ve arazi Natural Earth'ten (kamu malı). Alan
  İspanya'dan İran'a, Galya ve Karadeniz'in kuzeyinden Mısır'a kadar.
- **Yerleşimler:** şehir ve kale. Bazıları liman (⚓). 45 yerleşim.
- **Yollar:** yerleşimleri bağlayan çizgiler. Bazıları **deniz yolu**dur (kesik çizgi), sadece
  iki liman arasında.

### Başlangıç

| Medeniyet | Başkent | Şehir | Kale |
|---|---|---|---|
| Roma | Roma ⚓ | Tarentum ⚓ | Ariminum |
| Kartaca | Kartaca ⚓ | Gades ⚓ | Lilybaion ⚓ |
| Mısır | İskenderiye ⚓ | Memphis | Kudüs |
| Makedonya | Pella | Demetrias ⚓ | Korint |
| Partlar | Hekatompylos | Rhagae | Nisa |
| Galyalılar | Bibracte | Lutetia | Gergovia |
| Sakalar | Neapolis (Kırım) | Olbia ⚓ | Tanais |

Başkent 2. seviye ve 40 piyadeyle, öteki yerler 1. seviye ve 20 piyadeyle başlar. Herkesin
ambarında 40 altın, 20 yemek. Liman başkentinde 2, öteki limanlarda 1 gemi.

**Bağımsız yerleşimler (gri, 24):** saldırmaz, büyümez, sadece savunur. Şehir 2. seviye, 30
piyade + 10 okçu; kale 1. seviye, 20 piyade + 10 okçu; **büyük şehirler** (Siraküza, Atina,
Antakya, Babil) 3. seviye (surlu), 60 piyade + 20 okçu. Alınınca normal bir yer olur.

| Bölge | Yerleşimler |
|---|---|
| Batı | Siraküza ⚓, Karalis ⚓, Massalia ⚓, Mediolanum, Numantia (kale), Saguntum ⚓ |
| Afrika | Tingis ⚓, Cirta (kale), Leptis Magna ⚓, Kirene ⚓ |
| Yunanistan ve Trakya | Epidamnos ⚓, Atina ⚓, Sparta (kale), Bizans ⚓, Odessos ⚓ |
| Anadolu | Efes ⚓, Rodos ⚓, Ankyra (kale), Sinop ⚓, Mazaka (kale) |
| Doğu | Antakya ⚓, Babil, Ekbatana, Artaşat (kale) |

---

## 3. Altın ve yemek

İki ambar, bütün ülkenin ortak ambarı.

| Kaynak | Nereden (her tur, yer başına) | Ne için |
|---|---|---|
| **Altın** | 1 + 1.5 × seviye; başkente +2 | Geliştirme, asker, gemi |
| **Yemek** | 3 × seviye; limana +2 (balık) | Askerlerin bakımı |

- **Kale** bunların **yarısını** üretir (ama surludur).
- **Bakım:** her 10 askerlik bölük turda 1 yemek yer; **süvari 2**. Garnizonda da orduda da.
- **Kıtlık:** yemek biterse her birlikten onda biri ölür (her yerde, her orduda).
- Üst bantta ambar ve turluk değişim; üstüne gelince gelir, gider ve yemeğin kaç turda biteceği.

---

## 4. Şehir: Geliştir

- Şehrin tek yükseltmesi **seviye**: şehir 1-5, kale 1-3.
- **Geliştir:** yeni seviye × 20 altın (2. seviye 40, 3. seviye 60...). Şehir başına turda bir.
- Her seviye: +1.5 altın, +3 yemek, ve turda **bir bölük daha** asker hakkı.
- **3. seviyede şehir sur kazanır** (başkent ve kale zaten surlu).
- Alınan yer seviyesini korur ama o tur geliştirilemez, asker basılamaz.

---

## 5. Askerler: üçgen

| Tür | Bölük fiyatı | Bakım | Güç | Neyi yener |
|---|---|---|---|---|
| **Piyade** | 6 altın | 1 yemek | 1 | süvariyi |
| **Okçu** | 8 altın | 1 yemek | 1 | piyadeyi |
| **Süvari** | 12 altın | 2 yemek | 1.2 | okçuyu; ama **sura karşı yarı güç** |

- Bir yerde turda **seviyesi kadar** bölük basılır (türü fark etmez). Bölük 10 asker.
- Basılan bölük garnizona girer.
- **Üçgen:** bir tür, yendiği türe karşı en çok **×1.5** vurur - karşı ordudaki o türün payı
  kadar (karşı ordunun yarısı süvariyse piyade ×1.25).

---

## 6. Ordular ve hareket

- **Ordu çıkar:** garnizondan istediğin kadar asker (ve limandaysa gemi) alıp ordu kur.
- Ordular sadece yerleşimlerde durur. Turda **bir yol** yürür (Sakalar iki).
- Uzak bir yere gönderilen ordu güzergâhını saklar, her tur kendiliğinden ilerler.
- Kendi ve müttefik yerlerinden geçilir; **tarafsız** bir medeniyetin yerine girilmez.
- **Deniz yolu gemi ister:** bir gemi 50 asker taşır; gemileri bütün askerini taşıyamayan ordu
  denize açılamaz. Askersiz filo da denizden yürür.
- **Garnizona kat:** ordu kendi yerinde garnizona karışır. Gemisi varsa bu ancak limanda olur
  (gemi karada durmaz).
- **Böl / Birleştir:** ordu ikiye bölünür (her türün yarısı); aynı yerdeki iki ordu birleşir.
- **Gemi yap:** limanda, turda bir, 15 altın (Kartaca 7.5). Garnizona girer.

---

## 7. Savaş

Saldırı her zaman açık bir emirdir (ordu kendi başına saldırmaz): yanındaki düşman ya da
bağımsız yere.

1. **Güç:** her tür için asker × tür gücü × medeniyet çarpanı × üçgen.
2. **Sur:** savunan ×1.5 (başkent, kale, 3. seviye ve üstü şehir). Sura saldıran süvari ×0.5.
3. **Şans:** iki taraf da 0.9-1.1 arası bir çarpan.
4. **Kazanan:** gücü büyük olan. Eşitlikte savunan.
5. **Kayıplar:** kaybedenin hepsi düşer. Kazanan, `asker × (kaybeden gücü / kazanan gücü)² × 0.5`
   kaybeder - güçler yakınsa çok, ezici üstünlükte az.
6. Saldıran kazanırsa yer onun olur, ordusu içeri girer; limandaki gemiler yanar.
7. Savunanlar: garnizon + sahibinin orada duran orduları.

**Tahmin** (saldırmadan önce, savaşın kendisiyle aynı hesap): şansın en kötüsünde bile
kazanılıyorsa **Kolay**, en iyisinde kazanılıyorsa **Zor**, hiç kazanılmıyorsa **Umutsuz**; ve
yaklaşık kayıplar. Deniz savaşı yok.

Son yerini kaybeden medeniyet oyundan çıkar: orduları dağılır.

---

## 8. Diplomasi

- Durumlar: **tarafsız** (başlangıç), **savaş**, **müttefik**.
- **Savaş ilanı:** tarafsızdan, hemen. (Tarafsız bir yerin kartında da "Savaş ilan et" var.)
- **İttifak teklifi:** turda bir; karşı taraf ortak düşman, güç ve komşulukla karar verir.
  Müttefikler birbirinin topraklarından geçer.
- **İttifakı bozmak:** tarafsız olunur, o tur savaş açılmaz; birbirinin toprağındaki ordular
  evine döner.
- **Barış teklifi:** savaştan tarafsıza; turda bir.

---

## 9. Medeniyetler: her birinin tek güçlü yanı

| Medeniyet | Özellik |
|---|---|
| Roma | Lejyon: piyade ×1.25 |
| Kartaca | Tüccar: altın ×1.25, gemi yarı fiyat |
| Mısır | Nil: yemek ×1.3 |
| Makedonya | Falanks: savunan ×1.25 |
| Partlar | Atlı okçu: okçu ×1.3 |
| Galyalılar | Kabileler: asker dörtte bir ucuz |
| Sakalar | Bozkır atlıları: süvari ×1.3, turda iki yol |

### Zorluk

| | Kolay | Normal | Zor |
|---|---|---|---|
| Bilgisayar oyuncuya en erken savaş açar | 20. tur | 12. tur | 8. tur |
| ...ve ancak oyuncudan şu kadar güçlüyse | ×2 | ×1.5 | ×1.25 |
| Bilgisayarın geliri | ×0.85 | ×1 | ×1.15 |

Oyuncunun kuralları zorlukla değişmez.

---

## 10. Tur sırası

1. Oyuncu oynar (geliştir, asker bas, ordu yürüt, saldır, diplomasi).
2. **Turu bitir** (Enter): bilgisayarlar sırayla oynar.
3. Gelir ve bakım; yemek bittiyse kıtlık.
4. Haklar yenilenir (geliştirme, asker, gemi), ordulara hareket; yoldaki ordular ilerler.
5. Biri bittiyse oyun biter. Olanlar sağ üstte **haber** olarak belirir (pencere açılmaz).

---

## 11. Bilgisayar rakipler

Kural katmanının aynısını kullanır (hile yok, sadece zorluğa göre gelir).

- **Geliştirir:** en ucuz geliştirme önce, kale en son; 15 altın ayırır.
- **Asker basar:** ordu karışımına göre (Partlar çok okçu, Sakalar çok süvari); yemek yettiği
  kadar (ambarda yemek varsa turluk denge biraz eksiye düşebilir).
- **Gemi yapar:** denizin karşısında alınacak bir yer varsa (limanda en çok 4).
- **Savaşır:** tehdit altındaki yere ordu çeker, kolay hedeflere saldırır, uzak hedeflere
  yürür, gerekirse gemiyle.
- **Diplomasi:** oyuncuya barış döneminden önce savaş açmaz; açıkça güçlüyse açar (eşik zamanla
  1.5'ten 1.1'e iner, dünya donmasın). Ortak düşmana karşı birbirleriyle ittifak kurarlar.

---

## 12. Ekran ve kontroller

- **Sol tık:** seç (şehir, ordu, yer). **Sağ tık:** seçili orduyu oraya yürüt; yanındaki
  düşmana sağ tık saldırı penceresini açar.
- **Fareyle üstüne gel:** her düğmenin, kaynağın, yerin ve ordunun açıklaması çıkar. Ordu
  seçiliyken bir yerin üstüne gelince oraya giden yol çizilir ve kaç tur süreceği yazar;
  saldırılabilecek yerde tahmin yazar.
- **Klavye:** Enter turu bitirir, Tab sıradaki orduyu seçer, Esc kapatır, oklar kaydırır, +/-
  yakınlaştırır.
- **Seçim kartı ekranın altında ortada** (Total War gibi; kullanıcı 22.10: "solda istemiyorum"),
  yatay sütunlar: şehir (garnizon, gelir, Ordu çıkar) | Geliştir | Asker bas | limanda gemiler.
  Kart açıkken alttaki menü gizlenir. Seçilen yer kartın arkasında kalacaksa harita onu yukarı
  kaydırır. Ekran genişse kartın solunda yerin resmi.
- **Savaş sisi** (menüden kapatılabilir): kendi ve müttefik yerlerinin ve ordularının bir yol
  ötesi görülür; sisteki ordular gizli, garnizonlar bilinmez.
- **Kronik** (menüden ve oyun sonunda): medeniyetlerin tur tur yer / asker grafiği ve önemli
  olayların yıllığı.

---

## 13. Sonra

- Arkadaşlarla oynamak (kullanıcı 22.10: önce sade tek kişilik, sonra arkadaşlarla).
- Öğretici: en son, her şey bittikten sonra.
