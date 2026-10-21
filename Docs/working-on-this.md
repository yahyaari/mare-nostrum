# Mare Nostrum — çalışma notları

## NEREDE KALDIK

**20.10.2026 — oyun oynanabilir.** Yayında: https://yahyaari.github.io/mare-nostrum/ (master'a
push bir dakikada yayınlanır). Medeniyet seçimi, şehir yükseltme, asker basma, ordu çıkarma,
yürüme, otomatik savaş, diplomasi (savaş, ittifak, bozma, barış), bilgisayar rakipler, tur
raporu, kazanma/kaybetme ve tarayıcıya otomatik kayıt çalışıyor. EN/TR.

Zorluk (Kolay/Normal/Zor), tehdit uyarısı (yanında düşman ordusu olan şehrin kırmızı halkası ve
raporda satırı), Sıradaki ordu düğmesi de var.

**21.10.2026 — animasyon.** Ordular yol boyunca yürüyor; tur değişince şerit geçiyor, rakiplerin
hamleleri sırayla oynanıyor (yürüyüş, kılıç çarpışması, el değiştiren yerin yeni renginde halka),
kaynak artışları üst banttan yükseliyor, rapor animasyon bitince açılıyor; dokununca atlanıyor.
Kamera zıplamıyor, kayıyor; telefonda seçilen yer kartın üstüne kayıyor, kartlarda × var.

**21.10.2026 — derinlik 1: sadakat/isyan, olaylar, bilgisayarın teklifleri** (kurallar.md 8, 12,
13). Oyuncunun kararları `state.inbox`ta "mektup" olarak bekler (`src/rules/events.js`), tur
raporundan sonra kapatılamayan karar penceresi olarak sorulur. Kayıt sürümü 2 (`migrate`).

Sıradakiler (kullanıcının onayladığı derinlik listesi): generaller, süvari ve kuşatma makinesi,
donanma. Sonra: oyuncu oynadıkça denge; bilgisayarın oyuncuya ittifak/barış teklif etmesi;
düşman ordularının nereye yürüdüğünü göstermek.

## Komutlar

```
node Tools/serve.mjs . 8060                         oyunu sun  ->  http://localhost:8060
node Tools/serve.mjs . 8060 0.0.0.0                 aynı ağdaki telefon da girsin
node Tools/test.mjs                                 bütün kontroller (tarayıcısız, birkaç sn)
node Tools/bot.mjs 7 200                            7 oyunu bilgisayara oynat, özetini yaz
node Tools/peek.mjs http://localhost:8060/ Logs/peek 1280 720          ekran fotoğrafları
node Tools/peek.mjs http://localhost:8060/ Logs/peek-phone 390 844     telefon, dikey
node Tools/playtest.mjs http://localhost:8060/ saka 60 easy             tarayıcıda, düğmelere basarak 60 tur oyna
node Tools/geo.mjs                                  kıyıları Natural Earth'ten yeniden üret
node Tools/route.mjs                                denize giren yol için ara nokta öner
```

## Düzen

| Yer | Ne |
|---|---|
| `src/data/` | Değişmeyen veri: `world.js` (medeniyetler, yerleşimler, yollar), `geo.js` (üretilmiş kıyılar), `bounds.js` |
| `src/geo.js` | İzdüşüm ve karada mı / kıyıya ne kadar uzak. Ekran ve test aynısını kullanıyor. |
| `src/rules/` | Saf kurallar, DOM yok: `numbers.js` (bütün sayılar), `state.js` (yeni oyun, üretim, yükseltme, asker, ordu), `combat.js`, `moves.js` (hareket, saldırı, ele geçirme), `diplomacy.js`, `ai.js`, `turn.js`, `graph.js`, `rng.js` (tohumlu: kayıtla birlikte saklanıyor) |
| `Tools/bot.mjs` | TEK bot: oyuncunun yerine `ai.js`'i oynatır. test.mjs de bunu kullanır. |
| `src/view/` | `camera.js`, `draw.js` (harita, ordular, seçim işaretleri), `ui.js` (bant, kartlar, pencereler), `kit.js` (panel, düğme, simgeler), `regions.js`. Hiçbir kuralı değiştirmez: her düğme bir `act` bırakır, `main.js` çalıştırır. |
| `src/main.js` | Açılış, girdi, çizim döngüsü, kamera kayması. `window.MareNostrum` araçların kapısı. |
| `src/view/anim.js` | Animasyon. Kurallar hamleleri `state.trace`e yazar (sadece ekran isterse; `traced()` iz bitince siler, kayda girmez), burası o izden zaman çizelgesi kurar ve haritayı çizelgenin o anına göre gösterir (alınan yer sırası gelene kadar eski renginde). `freeze(t)` araçlar için zamanı dondurur. |
| `Tools/ne/` | Natural Earth 1:50m kaynak verisi (kamu malı). |

**Kural:** `src/rules/` DOM'a dokunmaz. Bilgisayar rakipler ve test botu aynı kodla, tarayıcısız
oynayacak (HOTICE-Notes/tuzaklar.md, bölüm 6).

## Denge: sadakat gelince (21.10)

Sadakat ilk medeniyetin düşüşünü 47. turdan 34'e çekti - isyan yüzünden değil (bot oyunlarında
neredeyse hiç isyan yok, bilgisayar garnizon bırakıyor), bilgisayarların fethettiği yerlerde asker
tutması yüzünden. Bilgisayarlar arası savaş eşiği 1.5 -> 1.8 ve Makedonya'nın nüfus cezası 0.8 ->
0.9 ile ilk düşüş ortalaması 56. tura çıktı, en erken 25. Ölçüm: `node Logs/sum.mjs 28` gibi bir
özet (28 oyun, 7 medeniyet sırayla oyuncu).

## Animasyon tuzakları

- **Tur gösterisi sürerken dokunmak gösteriyi atlar** (tasarım gereği). Bir araç bu sırada basarsa
  basışı gösteri yer: peek.mjs saldırı penceresini açamadı, `ui.modal` boş kaldı ve `attack`
  patladı. Araçlar `M.anim.freeze/finish` kullanıyor; oyuncu testi `M.blocking` ise dokunuyor,
  değilse (kısa ordu yürüyüşü) bekliyor - yoksa dokunuş haritaya gidip seçimi kaldırıyordu.
- Rapor ve savaş sonucu animasyon bitince açılır (`pending`): animasyon sürerken `ui.modal` boş.
- Haritanın durağan katmanı önbellekte; anahtarı kamera + sahiplik. Sahiplik çizelgede
  değişince bir kere yeniden çizilir.

## Harita verisi yazarken

- Bir yerleşimin koordinatı gerçek; ama 1:50m kıyı kaba olduğu için bazı limanlar suya
  düşüyordu (Gades, Bizans, Rodos...). `route.mjs` en yakın kara noktasını öneriyor, birkaç
  yüzde derece kaydırıldılar.
- Kara yolu düz çizgiyse denize girebilir (Kuzey Afrika kıyısı, Galya'ya inen yol). `route.mjs`
  kıyıyı izleyen ara noktaları buluyor; çıktısı `world.js`'e `via` olarak yapıştırılıyor.
  Deniz geçişleri karaya hiç değmemeli, kara yolları en fazla bir boğaz kadar suya girebilir.
- Test bunu ekranda çizilen kıyıların AYNISIYLA ölçüyor; "karada mı" aleti önce bilinen
  denizlere "hayır" diyerek kendini kanıtlıyor.

## Çizim kararları

- Kağıt zemin, mürekkep kıyı, kıyıya paralel iki ince dalga çizgisi. Her medeniyetin bir rengi;
  topraklar o renkte hafif boyalı, bağımsızlar gri.
- Şehir: daire. Başkent: halkalı daire. Kale: mazgallı kule. Liman: küçük çapa.
- Adlar çakışırsa önemsiz olan yazılmaz (önce başkent, sonra şehir, sonra kale); yakınlaşınca
  görünür.
- En yakın zoom 120 px/birim: 1:50m kıyı bunun ötesinde köşeli görünüyor.
- Kamera, kıyı verisinin bittiği yeri hiçbir ekranda göstermez (test ediliyor). Dik telefonda bu,
  en uzak hâlde bile haritanın yana kaydırılması demek.

## Denge kayıtları

- **NaN tuzağı (20.10):** başlangıç nüfusu `N.start.startPop` diye okunuyordu, sayı `N.startPop`
  adındaydı. Bütün nüfus ve para NaN oldu; `NaN < 1` her zaman false olduğundan para kontrolü
  hiç düşmedi ve oyun "çalışıyor" göründü. Bot özetinde herkes 60 tur 3 yerleşimde kalınca
  görüldü. Şimdi test her tur her sayının gerçek sayı olduğunu kontrol ediyor (hata geri
  konunca sekiz kontrol düşüyor).
- **Yiyecek ordunun tavanı.** Buğday 2 + balık 2 iken üç limanlı Kartaca her oyunu kazanıyordu;
  buğday 4 + balık 1 yapıldı, Kartaca balık yerine para aldı.
- **Erken oyun.** Bilgisayar 6. turda savaş açabilirken biri 15-25. turda yok oluyordu; şimdi
  12. tur ve 1.5 kat güç şartı, başkentin suru var, ve bilgisayar komşu düşman garnizonlarını
  tehdit sayıyor. Test: ilk medeniyet 20. turdan önce düşmüyor (7 oyunda).
