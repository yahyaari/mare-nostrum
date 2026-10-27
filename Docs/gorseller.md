# Görseller: hangi dosya nereye

Kullanıcı 27.10: "bildirimlerin hepsinde görsellik yaratalım; ben daha sonra hepsine kendim çok güzel görseller
ayarlayacağım, şimdilik temsili yapabiliriz". Oyun her görseli bir **anahtarla** arar; `art/<anahtar>.jpg` (yoksa
`.png`, yoksa `.webp`) varsa onu gösterir, yoksa kodla çizilmiş temsili bir sahne (`src/view/art.js`). Dosyayı koymak
yeter: kod değişmez, oyun açılınca (ya da pencere ilk açılınca) resmi yükler.

Bütün pencereleri resimleriyle görmek için: `node Tools/noticefilm.mjs tr` (fotoğraflar `Logs/notices` klasörüne).

## Bildirim pencereleri: `art/notice/<ad>.jpg`

Resim bütün pencereyi kaplar (ortalanıp taşanı kırpılır). Pencere 560 piksel geniş, yazının uzunluğuna göre 420-560
yüksek. **Önerilen boyut: 1120 x 1000 piksel** (iki kat, keskin dursun). Yazılar ve düğmeler resmin **alt yarısının
üstünde** durur, alt kısım kendiliğinden kararır: resmin asıl konusu (atlılar, gemi, şehir) **üst yarıda** olsun.

| Dosya | Ne zaman | Temsili sahne |
|---|---|---|
| `notice/raid.jpg` | Akıncılar geldi (öde ya da savaş); akıncıların saldırı bildirimi | Alacakaranlıkta atlılar |
| `notice/mercs.jpg` | Paralı askerler hizmet teklif ediyor | Kamp, askerler, para |
| `notice/plague.jpg` | Veba | Dumanlı şehir, kuzgunlar |
| `notice/harvest.jpg` | Bereketli hasat | Altın tarlalar |
| `notice/fire.jpg` | Yangın | Gece, yanan şehir |
| `notice/unrest.jpg` | Huzursuzluk | Meşaleli kalabalık, tapınak |
| `notice/caravan.jpg` | Kervan geldi | Çölde develer |
| `notice/civilWar.jpg` | İç savaş (büyük kriz) | Karşı karşıya iki ordu |
| `notice/ally.jpg` | İttifak teklifi | Saray, iki sancak, defne |
| `notice/peace.jpg` | Barış teklifi | Saray, zeytin dalı |
| `notice/trade.jpg` | Ticaret anlaşması teklifi | Saray, amforalar |
| `notice/tribute.jpg` | Haraç isteği | Saray, para yığını |
| `notice/incoming.jpg` | Bir ordu sana saldırıyor (Sonucu gör / Savaş) | Şehrine yürüyen ordu |
| `notice/naval.jpg` | Denizden saldırı | Kadırgalar |
| `notice/battle.jpg` | Tur raporu: savaştın | Çarpışan iki ordu |
| `notice/famine.jpg` | Tur raporu: kıtlık | Kurumuş tarla |
| `notice/build.jpg` | Tur raporu: bir yapı bitti | Demirhane, evler |
| `notice/turn.jpg` | Tur raporu: sakin bir tur | Sabah, şehir ve tarlalar |
| `notice/mission.jpg` | Yeni görev | Mühürlü tomar |
| `notice/victory.jpg` | Oyunu kazandın | Defne, güneş |
| `notice/defeat.jpg` | Oyunu kaybettin | Yıkık şehir, duman |

Teklif pencerelerinde liderin portresi resmin sol üst köşesine konur.

## Araştırma kartları: `art/tech/<ad>.jpg`

Kart 196 x 84 piksel; resim kartı kaplar, yazılar solda üstünde (sol taraf kararır). **Önerilen boyut: 400 x 170
piksel**, konusu **sağda**. Tur raporunda o tur biten araştırmanın resmi de büyük görünür (540 x 200): orada da
işe yarasın diye konuyu çok kenara koymamak iyi.

| Dosya | Araştırma |
|---|---|
| `tech/irrigation.jpg` | Sulama |
| `tech/bronze.jpg` | Bronz işleme |
| `tech/sailing.jpg` | Yelkencilik |
| `tech/writing.jpg` | Yazı |
| `tech/horseback.jpg` | Atçılık |
| `tech/ironWorking.jpg` | Demir işleme |
| `tech/harbours.jpg` | Limancılık |
| `tech/currency.jpg` | Sikke |
| `tech/tactics.jpg` | Taktik |
| `tech/engineering.jpg` | Mühendislik |
| `tech/shipbuilding.jpg` | Gemi inşası |
| `tech/mathematics.jpg` | Matematik |
| `tech/strategy.jpg` | Strateji |
| `tech/fortification.jpg` | Surculuk |
| `tech/navigation.jpg` | Seyir |
| `tech/medicine.jpg` | Tıp |
