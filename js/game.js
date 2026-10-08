/* REDLINE — controller: phases, timing, UI, main loop. */
(function () {
  const RL = window.RL;
  const C = RL.CONFIG;
  const { clamp } = RL.util;

  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const el = (id) => document.getElementById(id);
  const dom = {
    hud: el('hud'), round: el('hud-round'), bank: el('hud-bank'),
    timerCell: el('hud-timer-cell'), timerFill: el('timer-fill'), timer: el('hud-timer'),
    stagingBar: el('staging-bar'), readyBtn: el('ready-btn'),
    betting: el('betting'), slider: el('bet-slider'), betVal: el('bet-val'),
    payWin: el('pay-win'), payLose: el('pay-lose'), scaleMin: el('scale-min'), scaleMax: el('scale-max'),
    foldBtn: el('fold-btn'), launchBtn: el('launch-btn'),
    result: el('result'), resultTitle: el('result-title'),
    resultP: el('result-p'), resultB: el('result-b'),
    resultNet: el('result-net'), nextBtn: el('next-btn'),
    start: el('start'), startBtn: el('start-btn'), diff: el('difficulty'),
    gameover: el('gameover'), restartBtn: el('restart-btn'), goStats: el('go-stats'),
  };

  const S = {
    phase: 'START',
    difficulty: 'facile',
    bankroll: C.START_BANKROLL,
    best: C.START_BANKROLL,
    rounds: 0, wins: 0,
    round: null,
    bet: 400,
    phaseStart: 0, lastBlip: 0,
    outcome: null,
  };

  try {
    const b = parseInt(localStorage.getItem('redline.best') || '', 10);
    if (!isNaN(b)) S.best = Math.max(S.best, b);
  } catch (e) {}

  /* ---------- canvas sizing ---------- */
  const VP = { w: 0, h: 0 };
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    VP.w = rect.width; VP.h = rect.height;
  }
  window.addEventListener('resize', resize);

  let clock = 0, lastTs = 0;

  /* ---------- phase / overlays ---------- */
  function setPhase(p) { S.phase = p; S.phaseStart = clock; updateOverlays(); }
  function updateOverlays() {
    const p = S.phase;
    dom.hud.classList.toggle('hidden', p === 'START');
    dom.stagingBar.classList.toggle('hidden', p !== 'STAGING');
    dom.betting.classList.toggle('hidden', p !== 'BETTING');
    dom.result.classList.toggle('hidden', p !== 'RESULT');
    dom.start.classList.toggle('hidden', p !== 'START');
    dom.gameover.classList.toggle('hidden', p !== 'GAMEOVER');
    // the countdown only means something while reading the rival
    dom.timerCell.style.visibility = (p === 'STAGING') ? 'visible' : 'hidden';
  }

  /* ---------- flow ---------- */
  function startGame() {
    S.bankroll = C.START_BANKROLL; S.rounds = 0; S.wins = 0;
    enterStaging();
  }

  function enterStaging() {
    S.round = RL.model.newRound(S.difficulty);
    S.outcome = null; S.rounds++;
    RL.render.reset();
    RL.render.setConfig(S.round.bluffs);
    setPhase('STAGING');
    dom.round.textContent = S.rounds;
    dom.bank.textContent = S.bankroll;
    doBlip(); S.lastBlip = clock;
  }

  function doBlip() {
    S.round.readings = RL.model.sampleReadings(S.round.P, S.round.seeds);
    RL.render.triggerBlip(S.round.readings);
  }

  function enterBetting() {
    setPhase('BETTING');
    // you can risk at most your bankroll: stake = b - STAKE_FLOOR <= bankroll
    const maxBet = Math.min(C.BET_MAX, C.STAKE_FLOOR + S.bankroll);
    dom.slider.min = C.BET_MIN;
    dom.slider.max = Math.max(C.BET_MIN, maxBet);
    dom.scaleMin.textContent = C.BET_MIN;
    dom.scaleMax.textContent = dom.slider.max;
    S.bet = clamp(S.bet, C.BET_MIN, parseInt(dom.slider.max, 10));
    dom.slider.value = S.bet;
    syncBet();
  }

  function syncBet() {
    S.bet = parseInt(dom.slider.value, 10) || C.BET_MIN;
    dom.betVal.textContent = S.bet;
    dom.payWin.textContent = '+' + (C.WIN_CAP - S.bet);     // always >= 10
    dom.payLose.textContent = '−' + (S.bet - C.STAKE_FLOOR); // always >= 10
  }

  function launchRace() {
    S.outcome = Object.assign(RL.model.resolve(S.round.P, S.bet), { raced: true, folded: false, b: S.bet, P: S.round.P });
    setPhase('TREE');
  }

  function fold() {
    S.outcome = { win: false, net: 0, margin: -1, raced: false, folded: true, b: 0, P: S.round.P };
    enterResult();
  }

  function enterResult() {
    S.bankroll += S.outcome.net;
    if (S.outcome.win) S.wins++;
    S.best = Math.max(S.best, S.bankroll);
    try { localStorage.setItem('redline.best', String(S.best)); } catch (e) {}

    const o = S.outcome;
    dom.resultTitle.className = 'result-title ' + (o.folded ? 'fold' : o.win ? '' : 'lose');
    dom.resultTitle.textContent = o.folded ? 'PASSATO' : o.win ? 'VITTORIA' : 'SCONFITTA';
    dom.resultP.textContent = o.P;
    dom.resultB.textContent = o.folded ? '—' : o.b;
    dom.resultNet.textContent = (o.net > 0 ? '+' : o.net < 0 ? '−' : '') + Math.abs(o.net) + ' gettoni';
    dom.resultNet.style.color = o.net > 0 ? 'var(--good)' : o.net < 0 ? 'var(--bad)' : 'var(--amber)';
    dom.bank.textContent = S.bankroll;
    setPhase('RESULT');
  }

  function nextMano() {
    if (S.bankroll < C.MIN_PLAYABLE) {
      dom.goStats.innerHTML =
        `Mani giocate: <b>${S.rounds}</b> · Vittorie: <b>${S.wins}</b><br>Record gettoni: <b>${S.best}</b>`;
      setPhase('GAMEOVER');
      return;
    }
    enterStaging();
  }

  /* ---------- update ---------- */
  function update() {
    if (S.phase === 'STAGING') {
      const elapsed = clock - S.phaseStart;
      dom.timerFill.style.width = (clamp(1 - elapsed / C.STAGING_MS, 0, 1) * 100) + '%';
      dom.timer.textContent = Math.ceil(Math.max(0, C.STAGING_MS - elapsed) / 1000) + 's';
      if (clock - S.lastBlip >= C.BLIP_MS) { doBlip(); S.lastBlip = clock; }
      if (elapsed >= C.STAGING_MS) enterBetting();
    } else if (S.phase === 'TREE') {
      if (clock - S.phaseStart >= 2200) { RL.render.startRace(S.outcome); setPhase('RACE'); }
    }
  }

  /* ---------- render ---------- */
  function render(dt) {
    const { w, h } = VP;
    switch (S.phase) {
      case 'START': RL.render.stageFrame(ctx, w, h, dt, true); break;
      case 'STAGING': RL.render.stageFrame(ctx, w, h, dt, false); break;
      case 'BETTING': RL.render.stageFrame(ctx, w, h, dt, true); break;
      case 'TREE': RL.render.treeFrame(ctx, w, h, dt, clamp((clock - S.phaseStart) / 2200, 0, 1)); break;
      case 'RACE': if (RL.render.raceFrame(ctx, w, h, dt)) enterResult(); break;
      case 'RESULT':
        if (S.outcome && S.outcome.raced) RL.render.raceFrame(ctx, w, h, dt);
        else RL.render.stageFrame(ctx, w, h, dt, true);
        break;
      case 'GAMEOVER': RL.render.stageFrame(ctx, w, h, dt, true); break;
    }
  }

  /* ---------- loop ---------- */
  function frame(ts) {
    if (!lastTs) lastTs = ts;
    let dt = ts - lastTs; lastTs = ts;
    if (dt > 50) dt = 50;
    clock += dt;
    RL.render.setTime(clock);
    update();
    render(dt);
    requestAnimationFrame(frame);
  }

  /* ---------- difficulty selector ---------- */
  function selectDifficulty(d) {
    S.difficulty = d;
    [...dom.diff.querySelectorAll('button')].forEach((b) =>
      b.classList.toggle('active', b.dataset.diff === d));
  }

  /* ---------- wiring ---------- */
  dom.diff.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-diff]');
    if (b) selectDifficulty(b.dataset.diff);
  });
  dom.startBtn.addEventListener('click', startGame);
  dom.readyBtn.addEventListener('click', () => { if (S.phase === 'STAGING') enterBetting(); });
  dom.slider.addEventListener('input', syncBet);
  dom.launchBtn.addEventListener('click', launchRace);
  dom.foldBtn.addEventListener('click', fold);
  dom.nextBtn.addEventListener('click', nextMano);
  dom.restartBtn.addEventListener('click', startGame);
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    // let a focused button/slider handle Space natively (e.g. PASSA)
    const t = e.target;
    if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT')) return;
    e.preventDefault();
    if (S.phase === 'START') startGame();
    else if (S.phase === 'STAGING') enterBetting();
    else if (S.phase === 'BETTING') launchRace();
    else if (S.phase === 'RESULT') nextMano();
    else if (S.phase === 'GAMEOVER') startGame();
  });

  resize();
  selectDifficulty('facile');
  updateOverlays();
  requestAnimationFrame(frame);
})();
