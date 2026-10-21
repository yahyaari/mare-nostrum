# Boyalı arazi resmi: Natural Earth II (kamu malı) rasterını oyunun sınırlarına (her yönde
# PAY derece fazlasıyla) keser, boylamı LON_SCALE ile daraltır (src/data/bounds.js ile aynı
# izdüşüm), tonunu oyuna göre ayarlar ve assets/terrain.jpg olarak yazar.
#
#   python Tools/terrain.py <NE2_HR_LC_SR_W_DR.zip>
#
# Zip (325 MB) depoda yok: https://naciscdn.org/naturalearth/10m/raster/NE2_HR_LC_SR_W_DR.zip
# 1:10m, derece başına 60 piksel; kamera en yakında derece başına 120 piksel gösteriyor, yani
# en yakında iki kat büyütülmüş - boyalı görünüşte göze batmıyor.
#
# Pay: kamera görünen sınırın 3 birim ötesine kadar gösterebiliyor (camera.js SPARE); 4 derece
# boylam 3.06 birim. Pay olmadan geniş ekranda haritanın üstünde ve altında boş bant kalıyordu.
import io, math, os, sys, zipfile
from PIL import Image
import numpy as np

Image.MAX_IMAGE_PIXELS = None
PAY = 4
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
z = zipfile.ZipFile(sys.argv[1])
name = [n for n in z.namelist() if n.lower().endswith(".tif")][0]
img = Image.open(io.BytesIO(z.read(name))).convert("RGB")
ppd = img.size[0] / 360

w, e, s, n = -11 - PAY, 62 + PAY, 26 - PAY, 52 + PAY  # src/data/bounds.js + pay
crop = img.crop((round((w + 180) * ppd), round((90 - n) * ppd), round((e + 180) * ppd), round((90 - s) * ppd)))
crop = crop.resize((round(crop.size[0] * math.cos(math.radians(40))), crop.size[1]), Image.LANCZOS)

# Ton: kara biraz sönük, koyu ve sıcak (toprak); deniz sönük, koyu camgöbeği. Ham hâli
# kartpostal mavisi ve fıstık yeşili - kullanıcının gönderdiği boyalı haritadan çok uzak.
a = np.asarray(crop).astype(np.float32) / 255
def sat(x, k):
    g = x.mean(axis=2, keepdims=True)
    return g + (x - g) * k
land = (a[..., 2] < a[..., 0] + 0.04)[..., None]
L = sat(a, 0.85) ** 1.12 * np.array([1.02, 0.98, 0.9], dtype=np.float32)
S = sat(a, 0.55) ** 1.25 * np.array([0.8, 0.92, 0.9], dtype=np.float32)
out = np.clip(np.where(land, L, S), 0, 1)
os.makedirs(os.path.join(root, "assets"), exist_ok=True)
Image.fromarray((out * 255).astype(np.uint8)).save(os.path.join(root, "assets", "terrain.jpg"), quality=84)
print("assets/terrain.jpg", crop.size, "pay", PAY)

# Ağaçlar: ham rengi orman olan yerlere (yeşil baskın ve koyu) serpiştirilmiş noktalar,
# src/data/trees.js. Ham renkler (derece başına 8 piksel, tonlanmamış) yerinde ölçüldü:
# Kara Orman (162,187,161), Karpatlar (154,182,154), Balkanlar (171,194,160); Fransa'nın
# açık tarlaları (183,207,166) ve Anadolu bozkırı (228,216,188) orman sayılmıyor.
G = 8
raw = img.crop((round((w + 180) * ppd), round((90 - n) * ppd), round((e + 180) * ppd), round((90 - s) * ppd)))
raw = np.asarray(raw.resize(((e - w) * G, (n - s) * G), Image.BOX)).astype(int)
r_, g_, b_ = raw[..., 0], raw[..., 1], raw[..., 2]
forest = (g_ > r_ + 12) & (g_ > b_ + 12) & ((r_ + g_ + b_) / 3 < 182)
rng = np.random.default_rng(270)
pts = []
for y, x in zip(*np.nonzero(forest)):
    if rng.random() > 0.3:
        continue
    lon = w + (x + rng.random()) / G
    lat = n - (y + rng.random()) / G
    pts += [round(lon * 100), round(lat * 100)]
with open(os.path.join(root, "src", "data", "trees.js"), "w", encoding="utf8") as f:
    f.write("// Tools/terrain.py yazar, elle değiştirme. Ormanlık yerlerdeki ağaçlar: boylam*100, enlem*100.\n")
    f.write("export const TREES = [" + ",".join(map(str, pts)) + "];\n")
print("src/data/trees.js", len(pts) // 2, "ağaç")
