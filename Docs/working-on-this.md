# Mare Nostrum — çalışma notları

## NEREDE KALDIK

**20.10.2026 — 1. adım bitti: harita.** Oyun henüz oynanmıyor. Gerçek kıyılar, 45 yerleşim,
yollar ve deniz geçişleri çiziliyor. Kaydırma, yakınlaştırma (tekerlek, kıstırma, + / −, oklar),
yerleşime basınca bilgi kartı, EN/TR geçişi çalışıyor.

**Sıradaki adım: şehirler ve ekonomi** (kurallar.md bölüm 3–5). Oyun durumu (`src/rules/state.js`),
tur sonu hesabı, şehir paneli: dört yükseltme ve asker basma. Sonra ordular, savaş, diplomasi ve
bilgisayar rakipler.

## Komutlar

```
node Tools/serve.mjs . 8060                         oyunu sun  ->  http://localhost:8060
node Tools/serve.mjs . 8060 0.0.0.0                 aynı ağdaki telefon da girsin
node Tools/test.mjs                                 bütün kontroller (tarayıcısız, ~1 sn)
node Tools/peek.mjs http://localhost:8060/ Logs/peek 1280 720          ekran fotoğrafları
node Tools/peek.mjs http://localhost:8060/ Logs/peek-phone 390 844     telefon, dikey
node Tools/geo.mjs                                  kıyıları Natural Earth'ten yeniden üret
node Tools/route.mjs                                denize giren yol için ara nokta öner
```

## Düzen

| Yer | Ne |
|---|---|
| `src/data/` | Değişmeyen veri: `world.js` (medeniyetler, yerleşimler, yollar), `geo.js` (üretilmiş kıyılar), `bounds.js` |
| `src/geo.js` | İzdüşüm ve karada mı / kıyıya ne kadar uzak. Ekran ve test aynısını kullanıyor. |
| `src/rules/` | Saf kurallar, DOM yok. Şimdilik `graph.js`: komşular, en kısa yol. |
| `src/view/` | Kamera, çizim, toprak hücreleri. Hiçbir kuralı değiştirmez. |
| `src/main.js` | Açılış, girdi, çizim döngüsü. `window.MareNostrum` araçların kapısı. |
| `Tools/ne/` | Natural Earth 1:50m kaynak verisi (kamu malı). |

**Kural:** `src/rules/` DOM'a dokunmaz. Bilgisayar rakipler ve test botu aynı kodla, tarayıcısız
oynayacak (HOTICE-Notes/tuzaklar.md, bölüm 6).

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
