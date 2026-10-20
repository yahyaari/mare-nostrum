// Oyunu yerelde sunar.
//
// Kullanım: node Tools/serve.mjs [klasör] [port] [adres]
//   node Tools/serve.mjs . 8060              (sadece bu bilgisayar)
//   node Tools/serve.mjs . 8060 0.0.0.0      (aynı ağdaki telefon da girebilir)

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

const [dir = ".", port = "8060", host = "127.0.0.1"] = process.argv.slice(2);
const root = resolve(dir);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".css": "text/css",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) throw new Error("forbidden");
    const info = await stat(file);

    let ext = extname(file);
    // no-store, not no-cache: a plain reload must never hand back the previous build
    // Last-Modified ve ETag olmadan Unity'nin IndexedDB önbelleği dosyanın değiştiğini
    // anlayamıyor; "no-store" yazsak bile eski veriyi kullanmaya devam edebiliyor.
    const headers = {
      "Cache-Control": "no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Last-Modified": info.mtime.toUTCString(),
      ETag: `"${info.size}-${info.mtimeMs}"`,
    };
    // Brotli'yi sadece gerçekten isteyene gönder.
    //
    // Tarayıcılar `br` sıkıştırmasını genelde yalnızca güvenli bağlamda (HTTPS ya da localhost)
    // kabul ediyor. Telefondan düz HTTP ile LAN adresine girince istemci `br` istemiyor; bu sunucu
    // yine de gönderiyordu ve oyun yükleme çubuğunda **takılı kalıyordu** — hata da vermeden.
    // İstemci istemiyorsa dosyayı burada açıp düz gönderiyoruz.
    let body = await readFile(file);
    const wants = String(req.headers["accept-encoding"] ?? "");
    if (ext === ".br" || ext === ".gz") {
      const encoding = ext === ".br" ? "br" : "gzip";
      ext = extname(file.slice(0, -ext.length));
      if (wants.includes(encoding)) headers["Content-Encoding"] = encoding;
      else body = encoding === "br" ? brotliDecompressSync(body) : gunzipSync(body);
    }
    headers["Content-Type"] = types[ext] ?? "application/octet-stream";

    res.writeHead(200, headers);
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(Number(port), host, () => console.log(`http://${host}:${port}/  →  ${root}`));
