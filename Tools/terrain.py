# Boyalı arazi resmi: Natural Earth II (kamu malı) rasterını oyunun sınırlarına keser, boylamı
# LON_SCALE ile daraltır (src/data/bounds.js ile aynı izdüşüm), iki ton yazar:
#   assets/terrain.jpg          parşömen tonu (söndürülmüş, sıcak)
#   assets/terrain-natural.jpg  olduğu gibi
#
#   python Tools/terrain.py <NE2_HR_LC_SR_W_DR.zip>
#
# Zip (325 MB) depoda yok: https://naciscdn.org/naturalearth/10m/raster/NE2_HR_LC_SR_W_DR.zip
# 1:10m, derece başına 60 piksel; kamera en yakında derece başına 120 piksel gösteriyor, yani
# en yakında iki kat büyütülmüş - boyalı görünüşte göze batmıyor.
import io, math, os, sys, zipfile
from PIL import Image
import numpy as np

Image.MAX_IMAGE_PIXELS = None
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
z = zipfile.ZipFile(sys.argv[1])
name = [n for n in z.namelist() if n.lower().endswith(".tif")][0]
img = Image.open(io.BytesIO(z.read(name))).convert("RGB")
ppd = img.size[0] / 360

w, e, s, n = -11, 62, 26, 52  # src/data/bounds.js
crop = img.crop((round((w + 180) * ppd), round((90 - n) * ppd), round((e + 180) * ppd), round((90 - s) * ppd)))
crop = crop.resize((round(crop.size[0] * math.cos(math.radians(40))), crop.size[1]), Image.LANCZOS)
os.makedirs(os.path.join(root, "assets"), exist_ok=True)
crop.save(os.path.join(root, "assets", "terrain-natural.jpg"), quality=85)

a = np.asarray(crop).astype(np.float32) / 255
gray = a.mean(axis=2, keepdims=True)
a = gray + (a - gray) * 0.75  # doygunluk azalır
a = a * 0.8 + np.array([0.94, 0.89, 0.78], dtype=np.float32) * 0.2  # kâğıda doğru
a = np.clip(a * np.array([1.03, 1.0, 0.9], dtype=np.float32), 0, 1)  # sıcak
Image.fromarray((a * 255).astype(np.uint8)).save(os.path.join(root, "assets", "terrain.jpg"), quality=85)
print("assets/terrain.jpg", crop.size)
