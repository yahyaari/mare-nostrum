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
