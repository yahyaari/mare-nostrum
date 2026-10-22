# Mare Nostrum — Plan

> **Yeni bir oturumda buradan başla.** Sonra `working-on-this.md` (komutlar, düzen, tuzaklar)
> ve gerekirse `kurallar.md` (kuralların asıl kaynağı).
>
> Son güncelleme: **22.10.2026** (sadeleşme).

---

## 0. Nasıl çalışıyoruz

- **Kullanıcı:** Unity geliştiricisi, Türkçe konuşuyor. Oyunu keyfi için yapıyor, satış ya da
  portal derdi yok. Tasarımın sahibi o. **22.10'da yönü netleştirdi:** "basit olsun, kaynak ve
  yemek yap, ordu oluştur ve savaş, çok detaylandırmadan. Oynaması kolay ve anlaşılır olsun."
  İleride **arkadaşlarla** oynanabilsin; önce sade tek kişilik. Yeni özellik eklemeden önce
  "bu oyunu karıştırır mı" diye sor: bir kere karıştırdık, geri sadeleştirdik.
- **Çalışma düzeni (kullanıcının sözü):** "Bana bir şey sormana gerek yok, devam et; büyük
  değişikliklerde git'ten push'la, ben kontrol ederim." Her büyük adımda commit + push, kullanıcı
  canlı sitede bakar. Tasarım kararı gerektiren (yeni kural) şeylerde seçenek sunulur.
- **Yayın:** https://yahyaari.github.io/mare-nostrum/ — depo `yahyaari/mare-nostrum`, GitHub
  Pages `master`'dan, push'tan ~1 dakika sonra yayında.
- **Dil:** Arayüz İngilizce asıl, Türkçe ikinci (sağ üst / menü). Belgeler ve kod yorumları
  Türkçe.
- **Push'tan önce:** `node Tools/test.mjs` (1683 kontrol, hepsi geçmeli). Kurala dokunduysan
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
| 21-22.10 | Görünüm ve süs | Total War tarzı arayüz, donanma görünüşü, görevler, harikalar, ses ve müzik, sis, kuşatma, büyüyen şehirler, kronik, savaş sahnesi, arazi ve mevsim. Hepsi `detayli-surum` etiketinde. |
| 22.10 | **Sadeleşme** | Kullanıcı: "ham, ne olduğunu anlamıyorum, kontrol hantal, tepki az; çok karıştırdık". Aşağıda. |

### Sadeleşme (22.10)

Kullanıcı oyunu beğendi ama "hamlık var, tam anlayamadım" dedi; üç şikâyet seçti: **ne olduğunu
anlamıyorum, kontrol hantal, tepki az / donuk**. Ve: "yine çok karıştırdık... basit olsun". Sade
ama biraz çeşit seçti. Yapılan (kurallar.md baştan yazıldı):

- **Kurallar:** sadece **altın ve yemek**. Şehirde tek yükseltme: **Geliştir** (seviye; altın,
  yemek ve asker hakkı artar, 3. seviyede sur). **Piyade / okçu / süvari** üçgeni (yendiğine
  ×1.5). Gemi: 50 asker taşır, deniz savaşı yok. Savaş, barış, ittifak. Her medeniyetin tek
  güçlü yanı. Kaldırılanlar: silah, nüfus, sadakat, olaylar, mektuplar, görevler, generaller,
  kuşatma ve makinesi, harikalar, arazi, mevsim, liman yapıları, abluka. Kayıt sürümü 8: eski
  kayıtlar sade kurallara dönüp devam eder (makineler piyadeye).
- **Anlamak:** her düğmenin, kaynağın, yerin ve ordunun **ipucu** (fareyle üstüne gel); kapalı
  düğme neden kapalı olduğunu söyler; yemek azalıyorsa kaç turda biteceği. Şehir kartı tek
  sayfa: seviye + Geliştir (kazancı yazılı), turluk gelir, üç asker düğmesi ve altında üçgen,
  limanda gemi, Ordu çıkar. Yardım 7 satır.
- **Kontrol:** Total War gibi **sol tık seçer, sağ tık yürütür / saldırtır**. Ordu seçiliyken
  bir yerin üstüne gelince **yol çizilir ve kaç tur** süreceği yazar; saldırılabilecek yerde
  tahmin. Tarafsız yerin kartında "Savaş ilan et". Enter turu bitirir, Tab sıradaki ordu.
- **Tepki:** pencereler süzülerek açılır; düğme basılıyken çöker; tur sonu raporu artık
  **pencere açmıyor**, sağ üstte haber olarak belirip soluyor (basınca rapor).
- **Bilgisayar:** en ucuz geliştirmeyi önce yapıyor (başkenti bekleyip hiçbir şey yapmayan Galya
  20. turda yıkılıyordu).

**Şu anki durum (22.10):** 1683 kontrol geçiyor; 21 bot oyununda ilk düşüş en erken 26, ortanca
50. tur; her oyunda savaş çıkıyor. Tarayıcıda oynayan test temiz (konsol hatası yok, kayıttan
dönüş aynı, ipucu ve yol önizlemesi çalışıyor, tur sonunda pencere açılmıyor).

---

## 2. Yapılacaklar

1. **Kullanıcı oynasın:** sade sürüm anlaşılır mı, kontrol rahat mı? Geri bildirime göre.
2. **Arkadaşlarla oynamak** (kullanıcının asıl isteği, sonraya bıraktı): aynı bilgisayarda sıra
   ile (hotseat) en kolayı; internetten oynamak sunucu ister. Kural katmanı tek oyuncu
   varsayıyor (`state.player`): en büyük iş bu.
3. **Öğretici:** en son (kullanıcı 21.10: "öğreticiyi sona bırakalım").

Detaylı sürümden geri getirilebilecekler (kullanıcı isterse, birer birer, "karıştırır mı"
diye sorarak): görevler, harikalar, generaller. Kod `detayli-surum` etiketinde.

---

## 3. Açık riskler ve bilinenler

1. **Sade sürümü henüz insan oynamadı.** Bütün denge bot ölçümü. Detaylı sürümü kullanıcı
   oynadı: "ham, anlaşılmıyor, hantal, donuk" (22.10) - sadeleşmenin sebebi.
2. **Normal zorluk zor olabilir.** Test oyuncusu (zayıf bir oyuncu) normalde 20-35. turda sık sık
   düşüyor. Kolay öneriliyor.
3. **Sakalar** sade sürümde en sık ilk düşen (21 oyunun 10'unda). İzlenmeli.
4. **Yemek dar:** başlangıçta yemek askerine ancak yetiyor; büyümenin yolu Geliştir. Bilerek
   böyle (kaynak - ordu döngüsü), ama oyuncu "asker basamıyorum" derse ilk bakılacak yer.
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
| `node Tools/peek.mjs http://localhost:8060/ Logs/peek 1280 720` | Ekran fotoğrafları |
| `node Tools/playtest.mjs "http://localhost:8060/?seed=31" carthage 40 normal` | Tarayıcıda, düğmelere basarak oynayan test |
| `node Tools/film.mjs` | Bir yürüyüşün film şeridi |

Sunucu: `node Tools/serve.mjs . 8060`. Oyunda `?seed=123` aynı oyunu kurar.
