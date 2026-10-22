// Ses ve müzik: dosyadan değil, kodla üretilir (Shadow Tower'daki gibi). İndirilecek bir şey
// yok, oyun yine düz dosyalardan oluşan tek bir sayfa.
//
// Tarayıcı, sayfaya dokunulmadan ses bağlamı açtırmaz; açılmaya çalışılıp reddedilen ve bir daha
// denenmeyen bağlam herkes için sessiz bir oyun demek. Bağlam ilk basışta açılır (main.js).
//
// İki kanal: efektler ve müzik, ikisi ayrı ayrı kapatılabilir (menüden; tercih tarayıcıda
// saklanır). Müzik sade: alçak bir dem sesi ve seyrek lir notaları; oyuncu savaştayken altta
// yavaş bir davul.

let ctx = null, fx = null, bus = null, echo = null;
let soundOn = read("mn.sound", true), musicOn = read("mn.music", true);
let mood = "peace";

function read(k, d) {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : v === "1";
  } catch { return d; }
}
function write(k, v) {
  try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* tercih saklanamadı: sorun değil */ }
}

/** Ses bağlamı; ilk basışta kurulur. Yoksa ya da açılamıyorsa null. */
export function wake() {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      fx = ctx.createGain();
      fx.gain.value = soundOn ? 0.55 : 0;
      fx.connect(ctx.destination);
      bus = ctx.createGain();
      bus.gain.value = musicOn ? 0.32 : 0;
      bus.connect(ctx.destination);
      // Müziğin yankısı: lir notaları taş bir salonda çalıyor gibi.
      echo = ctx.createDelay(1.5);
      echo.delayTime.value = 0.42;
      const back = ctx.createGain();
      back.gain.value = 0.35;
      const tone = ctx.createBiquadFilter();
      tone.type = "lowpass";
      tone.frequency.value = 1800;
      echo.connect(tone).connect(back).connect(echo);
      back.connect(bus);
      if (musicOn) startMusic();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export const soundEnabled = () => soundOn;
export const musicEnabled = () => musicOn;

export function setSound(on) {
  soundOn = on;
  write("mn.sound", on);
  if (fx) fx.gain.value = on ? 0.55 : 0;
}

export function setMusic(on) {
  musicOn = on;
  write("mn.music", on);
  if (!ctx) return;
  bus.gain.setTargetAtTime(on ? 0.32 : 0, ctx.currentTime, 0.3);
  if (on) startMusic();
}

/** Oyuncu biriyle savaşta mı: müzik ona göre. */
export function setMood(m) { mood = m; }

// ---- yapı taşları ----

/** Tek bir nota: iki ucu yumuşak (yoksa tıklar). */
function tone({ from, to = from, seconds = 0.1, kind = "sine", loud = 0.15, delay = 0, out = fx, attack = 0.006, cut = 0 }) {
  if (!ctx || !out) return;
  const at = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = kind;
  osc.frequency.setValueAtTime(from, at);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + seconds);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(loud, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  let node = osc;
  if (cut) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cut;
    node = osc.connect(f);
  }
  node.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + seconds + 0.05);
}

let noiseBuf = null;
/** Gürültü patlaması: perdesi olmayan sesler için (davul derisi, köpük, kılıç vızıltısı). */
function noise({ seconds = 0.12, loud = 0.1, type = "lowpass", from = 1600, to = 200, q = 0.8, delay = 0, out = fx, attack = 0.004 }) {
  if (!ctx || !out) return;
  if (!noiseBuf) {
    const n = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  }
  const at = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(Math.max(30, to), at + seconds);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(loud, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  src.connect(f).connect(g).connect(out);
  src.start(at, Math.random() * 1.5);
  src.stop(at + seconds + 0.05);
}

/** Davul vuruşu: alçak bir "dum" ve deri sesi. */
function drum(delay = 0, loud = 0.16, low = 95) {
  tone({ from: low * 1.5, to: low * 0.7, seconds: 0.28, kind: "sine", loud, delay });
  noise({ seconds: 0.08, loud: loud * 0.5, from: 900, to: 300, delay });
}

// ---- oyunun sesleri ----

/** Düğme: tahta bir tık. */
export function click() {
  noise({ seconds: 0.035, loud: 0.06, type: "bandpass", from: 2400, to: 1600, q: 2 });
  tone({ from: 320, to: 240, seconds: 0.05, kind: "triangle", loud: 0.04 });
}

/** Yükseltme: iki çekiç vuruşu ve parlak bir çan. */
export function build() {
  [0, 0.13].forEach((d) => noise({ seconds: 0.06, loud: 0.12, type: "bandpass", from: 1300, to: 800, q: 3, delay: d }));
  tone({ from: 880, seconds: 0.5, kind: "sine", loud: 0.07, delay: 0.28 });
  tone({ from: 1320, seconds: 0.4, kind: "sine", loud: 0.04, delay: 0.3 });
}

/** Asker basma: ayak sesleri. */
export function recruit() {
  [0, 0.11, 0.22].forEach((d) => drum(d, 0.07, 140));
}

/** Ordu çıktı: kısa bir davul dizisi. */
export function muster() {
  [0, 0.16, 0.32, 0.56].forEach((d, i) => drum(d, i === 3 ? 0.16 : 0.1));
}

/** Gemi yapıldı: tahta gıcırtısı ve suya iniş. */
export function launch() {
  tone({ from: 180, to: 130, seconds: 0.35, kind: "sawtooth", loud: 0.04, cut: 600 });
  noise({ seconds: 0.6, loud: 0.1, from: 1200, to: 300, delay: 0.25 });
}

/** Yürüyüş: `seconds` boyunca davul (ordu karada). */
export function march(seconds) {
  const n = Math.max(2, Math.min(8, Math.round(seconds / 0.34)));
  for (let i = 0; i < n; i++) drum(i * 0.34, i % 2 ? 0.07 : 0.1, i % 2 ? 120 : 95);
}

/** Denizde: kürek şıpırtısı ve dalga. */
export function row(seconds) {
  const n = Math.max(2, Math.min(6, Math.round(seconds / 0.55)));
  for (let i = 0; i < n; i++) noise({ seconds: 0.4, loud: 0.07, from: 900, to: 250, delay: i * 0.55, attack: 0.12 });
}

/** Ok yağmuru: havada vızıldayan oklar. */
export function volley() {
  for (let i = 0; i < 5; i++) noise({ seconds: 0.25, loud: 0.04, type: "bandpass", from: 3200, to: 1400, q: 4, delay: i * 0.06 });
}

/** Çarpışma: kılıçlar, kalkanlar. */
export function clash() {
  for (let i = 0; i < 3; i++) {
    const d = i * 0.12 + Math.random() * 0.04;
    tone({ from: 2200 + Math.random() * 600, to: 1500, seconds: 0.14, kind: "square", loud: 0.025, delay: d, cut: 4000 });
    noise({ seconds: 0.09, loud: 0.08, type: "highpass", from: 3000, to: 1800, delay: d });
  }
  drum(0.05, 0.12, 80);
}

/** Bir yer el değiştirdi: kısa bir boru. */
export function horn(good = true) {
  const notes = good ? [196, 294] : [220, 165];
  notes.forEach((f, i) => tone({ from: f, seconds: 0.45, kind: "sawtooth", loud: 0.06, delay: i * 0.22, attack: 0.05, cut: 900 }));
}

/** Tur geçişi: alçak bir boru çağrısı. */
export function turnCall() {
  [[147, 0], [196, 0.3], [220, 0.55]].forEach(([f, d], i) => tone({ from: f, seconds: i === 2 ? 0.9 : 0.4, kind: "sawtooth", loud: 0.05, delay: d, attack: 0.06, cut: 800 }));
}

/** Zafer: yükselen üç nota. Yenilgi: inen. */
export function victory() {
  [392, 494, 587, 784].forEach((f, i) => tone({ from: f, seconds: 0.5, kind: "triangle", loud: 0.08, delay: i * 0.13 }));
}
export function defeat() {
  [294, 262, 220, 147].forEach((f, i) => tone({ from: f, seconds: 0.6, kind: "triangle", loud: 0.08, delay: i * 0.16 }));
}

/** Görev tamamlandı / mektup geldi: zil ve kâğıt. */
export function chime() {
  [988, 1319, 1568].forEach((f, i) => tone({ from: f, seconds: 0.6, kind: "sine", loud: 0.06, delay: i * 0.09 }));
}
export function scroll() {
  noise({ seconds: 0.3, loud: 0.06, type: "bandpass", from: 1800, to: 3200, q: 1.2 });
  tone({ from: 659, seconds: 0.5, kind: "sine", loud: 0.05, delay: 0.18 });
}

/** Savaş ilanı: iki ağır davul ve boru. */
export function war() {
  drum(0, 0.2, 70);
  drum(0.35, 0.2, 70);
  horn(false);
}

/** Kalabalık: oyunlar düzenlendi. */
export function cheer() {
  for (let i = 0; i < 4; i++) noise({ seconds: 0.5, loud: 0.05, type: "bandpass", from: 900 + i * 200, to: 1400, q: 0.6, delay: i * 0.08, attack: 0.1 });
}

// ---- müzik ----
//
// D Dor dizisinde seyrek lir notaları ve altta D-A dem sesi. Notalar bir sonraki birkaç
// saniyeye önceden yerleştirilir (setTimeout geç kalabilir, ses saatini kaçırmaz).

const SCALE = [146.8, 164.8, 174.6, 196, 220, 246.9, 261.6, 293.7, 329.6, 349.2, 392];
let drone = null, timer = null, nextAt = 0;

function startMusic() {
  if (!ctx || timer) return;
  if (!drone) {
    drone = [];
    for (const [f, det] of [[73.4, -4], [110, 3], [146.8, 0]]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = det;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 320;
      const g = ctx.createGain();
      g.gain.value = 0.035;
      o.connect(lp).connect(g).connect(bus);
      o.start();
      drone.push(o);
    }
  }
  nextAt = ctx.currentTime + 1;
  timer = setInterval(schedule, 400);
  schedule();
}

function pluck(f, at, loud) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "triangle";
  o.frequency.value = f;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(loud, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 2.2);
  o.connect(g);
  g.connect(bus);
  g.connect(echo);
  o.start(at);
  o.stop(at + 2.3);
}

function schedule() {
  if (!ctx || !musicOn) { clearInterval(timer); timer = null; return; }
  // Sekme arkadayken zamanlayıcı yavaşlar: geride kaldıysak şimdiden başla, geçmişe nota yazma.
  if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.2;
  while (nextAt < ctx.currentTime + 2) {
    const war = mood === "war";
    // Kısa bir ezgi parçası: iki-dört nota, aralarında sessizlik.
    const n = 2 + Math.floor(Math.random() * 3);
    let i = Math.floor(Math.random() * 6) + (war ? 0 : 3);
    for (let k = 0; k < n; k++) {
      i = Math.max(0, Math.min(SCALE.length - 1, i + Math.floor(Math.random() * 5) - 2));
      pluck(SCALE[i], nextAt + k * 0.45, 0.07);
    }
    if (war) {
      // Savaşta: altta yavaş, alçak bir davul.
      for (let k = 0; k < 4; k++) {
        const at = nextAt + k * 0.9;
        tone({ from: 70, to: 48, seconds: 0.4, kind: "sine", loud: 0.08, delay: at - ctx.currentTime, out: bus });
      }
    }
    nextAt += n * 0.45 + (war ? 2 : 3) + Math.random() * 3;
  }
}
