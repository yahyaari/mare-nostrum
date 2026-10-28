# Mare Nostrum — çalışma notları

## NEREDE KALDIK

> **Önce `Docs/plan.md`'yi oku:** yapılanların özeti, sıradaki işler (tasarım taslaklarıyla),
> açık riskler, çalışma düzeni. Aşağısı ayrıntılı geçmiş.

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

**Generaller** (kurallar.md 14): `src/rules/generals.js`. Savaş tahmini tek yerden:
`moves.forecast` (generaller dahil) - arayüz, bilgisayar ve oyuncu testi bunu kullanıyor; eskiden
üçü ayrı ayrı `estimate` çağırıyordu ve general gelince üçü de yanlış olurdu.

**Süvari ve kuşatma makinesi** (kurallar.md 5, 7). Asker türleri artık `UNITS` listesinde
(numbers.js): her yer ve her ordu `inf, arch, cav, siege` taşıyor, kayıt sürümü 3.

**Donanma** (kurallar.md 15): gemiler yerleşimlerde ve ordularda `ships` alanı (asker
türlerinden ayrı, `UNITS`e girmiyor). Deniz yolu kullanımı tek yerden: `canSail` (state.js)
ve `path`'in yol süzgeci (`canUse`). Kayıt sürümü 4. **Boş ordu** artık `empty()`: askeri ve
gemisi olmayan; "askeri 0 olan ordu silinir" varsayımı dört yerdeydi ve gemi filolarını
silerdi (kıtlıktaki eski hâli süvari/kuşatma ordularını da siliyordu).

Kullanıcının onayladığı derinlik listesi bitti.

**Liman yapıları** (kurallar.md 16, kullanıcı istedi): balıkçılık, tersane, ticaret, liman
kalesi; liman şehrinin kartı iki sekmeli (`ui.cardTab`). Kayıt sürümü 5. Roma liman oldu
(Ostia).

**Yürüyüş** (21.10, kullanıcı "ordular ışınlanıyor" dedi): yol uzunluğuna göre süre, iz,
sallanma; dokunuş önce hızlandırır. Aşağıda "Animasyon tuzakları".

**Sıradakiler:** `plan.md` bölüm 2. Denge araçları artık `Tools/` altında: `balance.mjs`,
`who.mjs`, `strength.mjs`, `diverge.mjs`, `film.mjs`.

## Komutlar

```
node Tools/serve.mjs . 8060                         oyunu sun  ->  http://localhost:8060
node Tools/serve.mjs . 8060 0.0.0.0                 aynı ağdaki telefon da girsin
node Tools/test.mjs                                 bütün kontroller (tarayıcısız, ~6 dk; Logs/test-last.txt'e yaz)
node Tools/bot.mjs 7 200                            7 oyunu bilgisayara oynat, özetini yaz
node Tools/balance.mjs 70                           denge: 70 oyun (ilk düşüş, ayakta kalma)
node Tools/who.mjs rome 35                          bir medeniyetin yerlerini kim alıyor
node Tools/peek.mjs http://localhost:8060/ Logs/peek 1280 720          ekran fotoğrafları
node Tools/peek.mjs http://localhost:8060/ Logs/peek-phone 390 844     telefon, dikey
node Tools/battlefilm.mjs                           taktik savaşın girişi ve bitişi, kare kare (Logs/battlefilm)
node Tools/noticefilm.mjs tr                        görselli bildirimlerin hepsi, tek tek fotoğraf (Logs/notices; Docs/gorseller.md)
node Tools/buildfilm.mjs tr                         şehrin yolu kartı ve penceresi, kuşatmanın koçbaşıları (harita, kart, saha) (Logs/buildfilm)
node Tools/cityfilm.mjs tr                          şehir manzarası: başta, gelişmiş liman, kış, kuşatma, ipucu (Logs/cityfilm)
node Tools/mapfilm.mjs                              haritada yaşayan şehirler: dört yol, kuşatma dumanı, mevsimler (Logs/mapfilm)
node Tools/fxfilm.mjs                               savaş sahasının efektleri: gedik, yangın, kalkanlar, toz (Logs/fxfilm)
node Tools/soundcheck.mjs                           seslerin gerçekten ses ürettiğini ölç (çevrimdışı)
node Tools/playtest.mjs http://localhost:8060/ saka 60 easy             tarayıcıda, düğmelere basarak 60 tur oyna
node Tools/tutorial.mjs tr rome                     öğreticiyi tarayıcıda gerçek basışlarla baştan sona oyna
node Tools/experiment.mjs '{"victory.wonders":99}' 70   denge deneyi (sayıları değiştirerek 70 oyun)
node Tools/tactics-cal.mjs                          taktik savaş otomatik savaşla tutarlı mı (açık / surlu)
node Tools/tactics-stuck.mjs                        taktik savaşta takılan birlik var mı (engelli sahalar)
node Tools/naval-cal.mjs                            deniz savaşı sahada otomatik deniz savaşıyla tutarlı mı
node Tools/late.mjs '{}' 8                          geç oyun: 160-200. turlarda savaş, sahadaki asker, garnizon, kuşatma (bölüm 11)
node Tools/geo.mjs                                  kıyıları Natural Earth'ten yeniden üret
node Tools/route.mjs                                denize giren yol için ara nokta öner
```

## Düzen

| Yer | Ne |
|---|---|
| `src/data/` | Değişmeyen veri: `world.js` (medeniyetler, yerleşimler, yollar), `geo.js` (üretilmiş kıyılar), `bounds.js` |
| `src/geo.js` | İzdüşüm ve karada mı / kıyıya ne kadar uzak. Ekran ve test aynısını kullanıyor. |
| `src/rules/` | Saf kurallar, DOM yok. Taktik savaş: `tactics.js` (savaş), `field.js` (saha, surlu şehir, yol bulma), `incoming.js` (sana saldırılar); ayrıca `barbarians.js`, `crises.js`, `trade.js`, `refill.js`, `research.js`, `leaders.js`, `wonders.js`... Çekirdek: `numbers.js` (bütün sayılar), `state.js` (yeni oyun, üretim, yükseltme, asker, ordu), `combat.js`, `moves.js` (hareket, saldırı, ele geçirme), `diplomacy.js`, `ai.js`, `turn.js`, `graph.js`, `rng.js` (tohumlu: kayıtla birlikte saklanıyor) |
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

## Denge: süvari gelince (21.10) - yanlış teşhis dersi

İlk ölçümde ilk düşüş 28. tura indi; süvariyi üç kez zayıflattım (yiyecek, güç, hücum) ve hiçbiri
sayıyı kıpırdatmadı. Asıl sebep süvari değildi: yeni bileşimde **okçu payları da düşürülmüştü**
(0.35 -> 0.3). Okçu sur arkasında iki kat attığı için savunmanın bel kemiği. Okçu payları eski
değerine dönünce 41'e geri geldi ve süvari tasarlandığı gibi (× 1.2, hücum 5) bırakıldı.

İki ders: (1) **Değişkenleri tek tek ayır** - "süvari var, kuşatma yok" denemesi okçu payını
da değiştiriyordu, o yüzden süvariyi suçladı. (2) **28 oyun az:** yüklenen sürüm 28 oyunda 56,
70 oyunda 41 çıktı. Kayıpları türlere dağıtan yuvarlamadaki tek bir farkın bile oyunu bambaşka
bir yöne götürdüğü görüldü (`Logs/diverge.mjs` iki sürümü aynı tohumla oynatıp ilk ayrıldıkları
anı buluyor). Denge kararları için 70 oyun.

## Animasyon tuzakları

- **"Ordu ışınlanıyor" (21.10, kullanıcı):** her yol 0.42 sn sürüyordu, tur arasında oyuncunun
  adımları da sıkışıyordu, tek dokunuş gösteriyi bitirip orduları yerlerine sıçratıyordu. Şimdi
  yol süresi uzunluğa bağlı (0.52-1.5 sn), ordu arkasında kendi renginde iz bırakır, sancak
  yürürken sallanır; oyuncunun yürüyüşü hiç kısalmaz; ilk dokunuş hızlandırır (zıplamadan),
  ikincisi bitirir. Test.mjs bunu ölçüyor (anim.js tarayıcısız çalışıyor: yer konumları
  `POS`, Path2D istemiyor). Film şeridi: `node Logs/film.mjs`.

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
