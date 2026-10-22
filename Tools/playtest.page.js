// playtest.mjs bunu oyunun sayfasına yükler. Oyuncu gibi oynar: her şeyi ekrandaki düğmelere
// ve haritaya gerçek basışlarla yapar (MareNostrum.tap / rightTap -> kutular -> dispatch).
// Kuralları sadece KARAR vermek için okur; hiçbir kuralı doğrudan çağırmaz.
//
// Kontroller (sade sürüm): sol tık seçer, sağ tık seçili orduyu yürütür ya da saldırtır.

window.PT = (() => {
  const M = window.MareNostrum;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const stats = { ships: 0, pressed: 0, missed: [], attacks: 0, won: 0, recruits: 0, upgrades: 0, armies: 0, marches: 0, wars: 0, allies: 0, tips: 0, previews: 0, popups: 0 };
  let R = null;

  async function load() {
    if (R) return R;
    R = {
      moves: await import("./src/rules/moves.js"),
      state: await import("./src/rules/state.js"),
      graph: await import("./src/rules/graph.js"),
    };
    return R;
  }

  /** Ekranda `pred`e uyan düğmeye bas. Basılamadıysa false. */
  async function press(pred, why = "") {
    await frame();
    const b = M.boxes().slice().reverse().find((x) => x.act && pred(x.act));
    if (!b) { if (why) stats.missed.push(why); return false; }
    M.tap(b.x + b.w / 2, b.y + b.h / 2);
    stats.pressed++;
    await frame();
    return true;
  }

  async function deselect() {
    M.ui.sel = null;
    M.redraw();
    await frame();
  }

  /** Kamerayı yere getir, ekrandaki yerini döndür. */
  async function lookAt(id) {
    await skip();
    M.look(id, 2.4);
    await frame();
    for (let i = 0; i < 120 && M.gliding; i++) await frame();
    return M.where(id);
  }

  /** Sol tık: yeri seç. */
  async function tapPlace(id) {
    const p = await lookAt(id);
    M.tap(p.x, p.y);
    await frame();
  }

  /** Sağ tık: seçili orduyu oraya yürüt ya da saldırt. Önce fareyle üstüne gel: ipucu ve yol. */
  async function rightPlace(id) {
    const p = await lookAt(id);
    M.hover(p.x, p.y);
    await frame();
    if (M.ui.tip?.lines?.length) stats.tips++;
    if (M.ui.preview?.length > 1) stats.previews++;
    M.rightTap(p.x, p.y);
    await frame();
  }

  async function tapArmy(armyId) {
    const a = M.game.armies.find((x) => x.id === armyId);
    if (!a) return false;
    // Açık bir kart sancağın üstünü örtebilir: önce kapat.
    if (M.ui.sel) await press((x) => x.do === "deselect");
    M.look(a.at, 2.4);
    await frame();
    const t = M.tokens().find((x) => x.army === armyId);
    if (!t) return false;
    M.tap(t.x + t.w / 2, t.y + t.h / 2);
    await frame();
    return M.ui.sel?.kind === "army" && M.ui.sel.id === armyId;
  }

  /**
   * Animasyon sürüyorsa bir oyuncunun yapacağı gibi ekrana dokunup atla. (Tur arası gösterisi
   * dokununca biter; ordu yürüyüşü kısa, onu bekle.) Sonra bekleyen pencere açılır.
   */
  async function skip() {
    for (let i = 0; i < 400 && M.anim.busy() && (M.blocking || M.waiting); i++) {
      if (M.blocking) M.tap(6, M.cam.h / 2);
      await frame();
    }
    await frame();
  }

  async function closeAll() {
    await skip();
    for (let i = 0; i < 12 && M.ui.modal && M.ui.modal.kind !== "over"; i++) {
      if (!(await press((a) => a.do === "close"))) break;
    }
  }

  async function turn() {
    const { moves, state, graph } = await load();
    await closeAll();
    const g = M.game, me = g.player;
    if (g.over) return "over";

    // Şehirler: geliştir, asker bas (sırayla üç tür), limanda arada bir gemi, büyük garnizondan ordu çıkar.
    for (const id of state.placesOf(g, me)) {
      await deselect();
      await tapPlace(id);
      if (M.ui.sel?.kind !== "place" || M.ui.sel.id !== id) { stats.missed.push("şehir seçilemedi " + id); continue; }
      if (await press((a) => a.do === "upgrade" && a.id === id)) stats.upgrades++;
      if (g.turn % 3 === 0 && (await press((a) => a.do === "buildShip" && a.id === id))) stats.ships++;
      for (let k = 0; k < 3; k++) {
        if (state.budget(g, me).food < 1.5) break;
        const type = ["inf", "arch", "cav"][(k + g.turn) % 3];
        if (!(await press((a) => a.do === "recruit" && a.id === id && a.type === type))) break;
        stats.recruits++;
      }
      const pl = g.places[id];
      if (pl.inf + pl.arch + pl.cav >= 60) {
        await press((a) => a.do === "formOpen" && a.id === id, "ordu çıkar düğmesi");
        // Garnizonda 20 piyade kalsın.
        await press((a) => a.do === "formStep" && a.type === "inf" && a.by < 0);
        await press((a) => a.do === "formStep" && a.type === "inf" && a.by < 0);
        if (await press((a) => a.do === "formOk", "yola çık düğmesi")) stats.armies++;
      }
    }

    // Ordular: yanında kolay hedef varsa sağ tıkla saldır, yoksa en yakın alınabilir hedefe yürü.
    for (const a of [...g.armies.filter((x) => x.owner === me)]) {
      if (!g.armies.includes(a) || a.moves <= 0) continue;
      if (!(await tapArmy(a.id))) { stats.missed.push("ordu seçilemedi " + a.id); continue; }
      const odds = (id) => moves.forecast(g, a, me, id).odds;
      const near = graph.neighbours(a.at).filter((n) => moves.canAttack(g, a, n) && odds(n) === "easy");
      if (near.length) {
        await rightPlace(near[0]);
        if (await press((x) => x.do === "attack", "saldır düğmesi")) {
          stats.attacks++;
          await skip();
          if (M.ui.modal?.kind === "battle" && M.ui.modal.ev.won) stats.won++;
          await closeAll();
        }
        continue;
      }
      if (a.route.length) continue;
      const targets = Object.keys(g.places).filter((id) => moves.hostile(moves.access(g, me, id)) && odds(id) !== "hopeless");
      const reach = targets.map((id) => [id, moves.routeTo(g, a, id)]).filter(([, r]) => r && r.length).sort((x, y) => x[1].length - y[1].length);
      if (reach.length) {
        await rightPlace(reach[0][0]);
        if (a.route.length || a.moves === 0) stats.marches++;
      } else if (g.places[a.at].owner === me) {
        await press((x) => x.do === "station");
      }
    }

    // Diplomasi: arada bir ittifak teklif et; güçlüyken zayıf bir komşuya savaş aç.
    if (g.turn % 7 === 3 || g.turn % 11 === 0) {
      await deselect();
      await press((x) => x.do === "open" && x.modal === "diplo", "diplomasi düğmesi");
      const civs = Object.keys(g.civs).filter((c) => c !== me && g.civs[c].alive);
      if (g.turn % 7 === 3) {
        const c = civs[g.turn % civs.length];
        if (await press((x) => x.do === "ally" && x.civ === c)) stats.allies++;
      } else if (g.turn > 14) {
        const mine = state.strength(g, me);
        const prey = civs.filter((c) => state.relation(g, me, c) === "neutral" && state.strength(g, c) * 1.3 < mine);
        if (prey.length && (await press((x) => x.do === "askWar" && x.civ === prey[0]))) {
          if (await press((x) => x.do === "war")) stats.wars++;
        }
      }
      await closeAll();
    }

    await skip();
    await deselect();
    const t0 = performance.now();
    await press((a) => a.do === "endTurn", "turu bitir düğmesi");
    const ms = performance.now() - t0;
    await skip();
    // Tur sonunda pencere açılmamalı (oyun bitmediyse): haberler sağ üstte.
    const popup = M.ui.modal?.kind ?? null;
    if (popup) stats.popups++;
    const lines = (M.ui.news?.lines ?? []).map(([s]) => s);
    return { lines, turn: M.game.turn, ms: Math.round(ms), report: popup, places: state.placesOf(M.game, me).length, men: state.strength(M.game, me) };
  }

  return { turn, stats, press, closeAll };
})();
true;
