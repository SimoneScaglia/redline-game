/* REDLINE — canvas renderer.
 * Owns all transient visual state (needles, vibration, particles, race).
 * game.js drives phases/timing and pokes it via triggerBlip / startRace /
 * setConfig / reset. A single shared clock (setTime) keeps logic and animation
 * in lock-step.
 */
(function () {
  const RL = window.RL;
  const { clamp, lerp, rand, easeOutCubic, easeInCubic } = RL.util;
  const C = RL.CONFIG;

  // honor reduced-motion: kill gratuitous camera shake (the vibration TELL and
  // gauge needles are gameplay-essential and are kept).
  let REDUCED = false;
  try { REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  const fracFromCV = (cv) => clamp((cv - C.GAUGE_MIN) / (C.GAUGE_MAX - C.GAUGE_MIN), 0, 1);

  const V = {
    time: 0,
    tachIdle: 0.16, tachNeedle: 0.16, blip: { active: false, start: 0, peak: 0.16 },
    need: { boost: 0.4, oil: 0.4, temp: 0.4 },
    tgt: { boost: 0.4, oil: 0.4, temp: 0.4 },
    vibeAmp: 6, vibeTarget: 6,
    smokeRate: 0.4, smokeTarget: 0.4, smoke: [],
    cfg: { oil: false, temp: false },           // which bluff gauges are shown
    warn: [Math.random(), Math.random(), Math.random()],
    race: null, shake: 0,
  };

  function reset() {
    V.tachNeedle = V.tachIdle; V.blip.active = false;
    V.need.boost = V.tgt.boost = 0.4;
    V.need.oil = V.tgt.oil = 0.4;
    V.need.temp = V.tgt.temp = 0.4;
    V.vibeAmp = V.vibeTarget = 6;
    V.smokeRate = V.smokeTarget = 0.4;
    V.smoke.length = 0;
    V.race = null; V.shake = 0;
  }

  // Which bluff gauges are active this round (smoke is always on).
  function setConfig(bluffs) {
    V.cfg.oil = bluffs.indexOf('oil') !== -1;
    V.cfg.temp = bluffs.indexOf('temp') !== -1;
  }

  // A blip: tach kicks to a fresh peak; the other tells re-sample their targets.
  function triggerBlip(r) {
    V.blip = { active: true, start: V.time, peak: clamp(fracFromCV(r.tach), 0.1, 1) };
    V.tgt.boost = clamp(fracFromCV(r.boost), 0.05, 1);
    V.tgt.oil = clamp(r.oil, 0.05, 1);
    V.tgt.temp = clamp(r.temp, 0.05, 1);
    // readable vibration: tens of pixels across the rival range, not sub-pixel.
    V.vibeTarget = clamp((r.vibe - 330) / 140, 0, 1.2) * 18;
    V.smokeTarget = clamp(r.smoke, 0.05, 1);
    V.shake = Math.min(1, V.shake + 0.35);
  }

  /* ---------------- helpers ---------------- */
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------------- backgrounds ---------------- */
  function garageBg(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#11151f'); g.addColorStop(0.55, '#0a0d14'); g.addColorStop(1, '#05060a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    ctx.save();
    const cx = w * 0.32, cy = h * 0.5;
    const cone = ctx.createRadialGradient(cx, cy - h * 0.1, 10, cx, cy, h * 0.7);
    cone.addColorStop(0, 'rgba(255,230,180,.10)'); cone.addColorStop(1, 'rgba(255,230,180,0)');
    ctx.fillStyle = cone; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    vignette(ctx, w, h);
  }
  function vignette(ctx, w, h) {
    const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  }

  /* ---------------- engine block (vibration tell) ---------------- */
  function drawEngine(ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    const bw = s * 2.0, bh = s * 1.35;
    const grad = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    grad.addColorStop(0, '#3a4150'); grad.addColorStop(0.5, '#222835'); grad.addColorStop(1, '#141922');
    ctx.fillStyle = grad; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2;
    rr(ctx, -bw / 2, -bh / 2, bw, bh, 12); ctx.fill(); ctx.stroke();

    for (let i = -1; i <= 1; i += 2) {
      const vcw = bw * 0.42, vch = bh * 0.42;
      const vx = i * bw * 0.24 - vcw / 2, vy = -bh / 2 - vch * 0.55;
      const vg = ctx.createLinearGradient(0, vy, 0, vy + vch);
      vg.addColorStop(0, '#ff5a36'); vg.addColorStop(1, '#b61f16');
      ctx.fillStyle = vg; rr(ctx, vx, vy, vcw, vch, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,220,200,.5)';
      for (let b = 0; b < 4; b++) { ctx.beginPath(); ctx.arc(vx + vcw * (0.18 + 0.21 * b), vy + vch * 0.5, 2.2, 0, 7); ctx.fill(); }
    }
    ctx.strokeStyle = '#555f70'; ctx.lineWidth = s * 0.16; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const x = lerp(-bw * 0.16, bw * 0.16, i / 3);
      ctx.beginPath(); ctx.moveTo(x, -bh * 0.1); ctx.quadraticCurveTo(x * 1.4, -bh * 0.85, 0, -bh * 1.05); ctx.stroke();
    }
    ctx.fillStyle = '#6a7486'; rr(ctx, -s * 0.5, -bh * 1.2, s * 1.0, s * 0.42, 8); ctx.fill();

    ctx.save();
    ctx.translate(-bw * 0.5, bh * 0.1);
    ctx.fillStyle = '#10141c'; ctx.strokeStyle = '#4a93ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, s * 0.3, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a3140'; ctx.beginPath(); ctx.arc(0, 0, s * 0.12, 0, 7); ctx.fill();
    ctx.restore();

    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,90,54,${0.05 + 0.04 * Math.sin(V.time * 0.006)})`;
    rr(ctx, -bw / 2, -bh / 2, bw, bh, 12); ctx.fill();
    ctx.restore();
  }

  function heatHaze(ctx, cx, cy, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const a = 0.03 + 0.02 * Math.sin(V.time * 0.004 + i);
      ctx.fillStyle = `rgba(255,170,120,${a})`;
      const yy = cy - h * 0.6 - Math.sin(V.time * 0.003 + i) * 6;
      rr(ctx, cx - w / 2, yy, w, h * 0.5, 20); ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------- gauges ---------------- */
  function gauge(ctx, cx, cy, r, frac, opts) {
    const o = opts || {};
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7);
    ctx.fillStyle = 'rgba(8,10,16,.9)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.stroke();

    ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, a0, a1);
    ctx.lineWidth = r * 0.1; ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, lerp(a0, a1, 0.77), a1);
    ctx.strokeStyle = 'rgba(255,45,45,.85)'; ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i <= 10; i++) {
      const a = lerp(a0, a1, i / 10), big = i % 2 === 0;
      ctx.lineWidth = big ? 2.2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.66, cy + Math.sin(a) * r * 0.66);
      ctx.lineTo(cx + Math.cos(a) * r * (big ? 0.74 : 0.72), cy + Math.sin(a) * r * (big ? 0.74 : 0.72));
      ctx.stroke();
    }

    const a = lerp(a0, a1, clamp(frac, 0, 1));
    const col = frac > 0.77 ? '#ff2d2d' : (o.color || '#30e3ff');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = col; ctx.lineWidth = r * 0.05; ctx.lineCap = 'round';
    ctx.shadowColor = col; ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * r * 0.12, cy - Math.sin(a) * r * 0.12);
    ctx.lineTo(cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.09, 0, 7); ctx.fillStyle = '#e8eef7'; ctx.fill();

    if (o.label) {
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.font = `600 ${Math.max(9, Math.round(r * 0.2))}px Rajdhani, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(o.label, cx, cy + r * 0.52);
    }
    ctx.restore();
  }

  /* ---------------- smoke (bluff tell) ---------------- */
  function updateSmoke(ctx, px, py, dt) {
    V.smokeRate += (V.smokeTarget - V.smokeRate) * Math.min(1, dt * 0.004);
    const spawn = V.smokeRate * dt * 0.03;
    let n = Math.floor(spawn) + (Math.random() < (spawn % 1) ? 1 : 0);
    for (let i = 0; i < n && V.smoke.length < 160; i++) {
      V.smoke.push({
        x: px + rand(-6, 6), y: py + rand(-4, 4),
        vx: rand(-0.015, 0.03), vy: rand(-0.05, -0.02),
        life: 0, max: rand(900, 1700), size: rand(6, 14), dark: 0.35 + V.smokeRate * 0.45,
      });
    }
    ctx.save();
    for (let i = V.smoke.length - 1; i >= 0; i--) {
      const p = V.smoke[i]; p.life += dt;
      if (p.life > p.max) { V.smoke.splice(i, 1); continue; }
      const t = p.life / p.max;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const sz = p.size * (1 + t * 2.4), a = (1 - t) * 0.5 * p.dark;
      ctx.fillStyle = `rgba(${30 + p.dark * 20},${30 + p.dark * 18},${34 + p.dark * 16},${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function warnLights(ctx, x, y) {
    const cols = ['#ff5a36', '#ffb020', '#39e08a'];
    for (let i = 0; i < 3; i++) {
      V.warn[i] += rand(-0.3, 0.3);
      const on = 0.3 + 0.7 * Math.abs(Math.sin(V.warn[i]));
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = cols[i]; ctx.globalAlpha = on;
      ctx.beginPath(); ctx.arc(x + i * 16, y, 4, 0, 7); ctx.fill(); ctx.restore();
    }
  }

  /* ---------------- STAGING frame ---------------- */
  function stageFrame(ctx, w, h, dt, dim) {
    // tach blip envelope
    if (V.blip.active) {
      const e = V.time - V.blip.start, rise = 220, fall = 950;
      if (e < rise) V.tachNeedle = lerp(V.tachIdle, V.blip.peak, easeOutCubic(e / rise));
      else if (e < rise + fall) V.tachNeedle = lerp(V.blip.peak, V.tachIdle, easeInCubic((e - rise) / fall));
      else { V.tachNeedle = V.tachIdle; V.blip.active = false; }
    } else {
      V.tachNeedle = V.tachIdle + Math.sin(V.time * 0.02) * 0.006;
    }
    const ease = Math.min(1, dt * 0.004);
    V.need.boost += (V.tgt.boost - V.need.boost) * ease + Math.sin(V.time * 0.01) * 0.0012;
    V.need.oil += (V.tgt.oil - V.need.oil) * ease + Math.sin(V.time * 0.013 + 1) * 0.0012;
    V.need.temp += (V.tgt.temp - V.need.temp) * ease + Math.sin(V.time * 0.009 + 2) * 0.0012;
    V.vibeAmp += (V.vibeTarget - V.vibeAmp) * ease;
    V.shake *= Math.pow(0.9, dt / 16);

    garageBg(ctx, w, h);

    // engine with vibration jitter (THE vibration tell — now clearly readable)
    const jx = (Math.random() * 2 - 1) * V.vibeAmp;
    const jy = (Math.random() * 2 - 1) * V.vibeAmp;
    const es = Math.min(w, h) * 0.17;
    ctx.save();
    if (dim) ctx.globalAlpha = 0.5;
    const ecx = w * 0.32, ecy = h * 0.56;
    drawEngine(ctx, ecx + jx, ecy + jy, es);
    heatHaze(ctx, ecx + jx, ecy - es * 0.7, es * 2.2, es * 1.6);
    if (!dim) updateSmoke(ctx, ecx - es * 0.9, ecy + es * 0.9, dt);
    warnLights(ctx, ecx - es * 0.4, ecy + es * 1.15);
    ctx.restore();

    // gauges (instruments do not shake). tach big + up to three small gauges.
    const gr = Math.min(w, h) * 0.17, sr = Math.min(w, h) * 0.095, sy = h * 0.75;
    gauge(ctx, w * 0.72, h * 0.37, gr, V.tachNeedle, { label: 'GIRI', color: '#30e3ff' });
    gauge(ctx, w * 0.87, sy, sr, V.need.boost, { label: 'TURBO', color: '#ffb020' });
    if (V.cfg.oil) gauge(ctx, w * 0.68, sy, sr, V.need.oil, { label: 'OLIO', color: '#8a7dff' });
    if (V.cfg.temp) gauge(ctx, w * 0.49, sy, sr, V.need.temp, { label: 'TEMP', color: '#ff7a7a' });

    ctx.fillStyle = 'rgba(255,45,45,.9)';
    ctx.font = '700 14px Orbitron, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('◣ RIVALE', w * 0.06, h * 0.2);
  }

  /* ---------------- RACE ---------------- */
  function startRace(info) {
    V.race = { win: info.win, margin: info.margin, P: info.P, b: info.b, start: V.time, dur: 2700, done: false, doneAt: 0, tire: [] };
  }

  function drawCar(ctx, x, y, s, color, boost) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, s * 0.55, s * 1.5, s * 0.25, 0, 0, 7); ctx.fill();
    if (boost > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fl = s * (1.2 + boost * 2.2) * (0.8 + Math.random() * 0.4);
      const fg = ctx.createLinearGradient(-s * 1.6 - fl, 0, -s * 1.6, 0);
      fg.addColorStop(0, 'rgba(48,227,255,0)'); fg.addColorStop(0.5, 'rgba(90,180,255,.5)'); fg.addColorStop(1, 'rgba(255,240,200,.9)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.moveTo(-s * 1.6, -s * 0.22); ctx.lineTo(-s * 1.6 - fl, 0); ctx.lineTo(-s * 1.6, s * 0.22); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    const bg = ctx.createLinearGradient(0, -s * 0.5, 0, s * 0.5);
    bg.addColorStop(0, color.hi); bg.addColorStop(1, color.lo);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(-s * 1.6, s * 0.35); ctx.lineTo(-s * 1.3, -s * 0.1);
    ctx.quadraticCurveTo(-s * 0.7, -s * 0.5, s * 0.1, -s * 0.52);
    ctx.quadraticCurveTo(s * 0.9, -s * 0.5, s * 1.25, -s * 0.05);
    ctx.lineTo(s * 1.6, s * 0.1); ctx.lineTo(s * 1.6, s * 0.35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(10,15,22,.85)';
    ctx.beginPath(); ctx.moveTo(-s * 0.35, -s * 0.12); ctx.quadraticCurveTo(0, -s * 0.44, s * 0.5, -s * 0.12);
    ctx.lineTo(s * 0.3, s * 0.05); ctx.lineTo(-s * 0.2, s * 0.05); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color.lo; rr(ctx, -s * 1.7, -s * 0.45, s * 0.22, s * 0.5, 2); ctx.fill();
    ctx.fillStyle = '#0a0d12';
    for (const wx of [-s * 1.05, s * 1.05]) {
      ctx.beginPath(); ctx.arc(wx, s * 0.38, s * 0.33, 0, 7); ctx.fill();
      ctx.fillStyle = '#2a3140'; ctx.beginPath(); ctx.arc(wx, s * 0.38, s * 0.13, 0, 7); ctx.fill();
      ctx.fillStyle = '#0a0d12';
    }
    ctx.restore();
  }

  function raceFrame(ctx, w, h, dt) {
    const R = V.race;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a1020'); g.addColorStop(0.6, '#0a0d14'); g.addColorStop(1, '#05070b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    const elapsed = Math.max(0, V.time - R.start);
    const prog = clamp(elapsed / R.dur, 0, 1), accel = Math.pow(prog, 1.7);

    let shk = 0;
    if (!REDUCED) {
      if (elapsed < 350) shk = (1 - elapsed / 350) * 10;
      if (R.done && V.time - R.doneAt < 300) shk = (1 - (V.time - R.doneAt) / 300) * 8;
    }
    ctx.save();
    ctx.translate((Math.random() * 2 - 1) * shk, (Math.random() * 2 - 1) * shk);

    const roadTop = h * 0.42, roadBot = h * 0.96;
    ctx.fillStyle = '#12151c'; ctx.fillRect(0, roadTop, w, roadBot - roadTop);
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3;
    const laneY = (roadTop + roadBot) / 2, scroll = (V.time * (0.3 + accel * 1.4)) % 120;
    for (let x = -120 + scroll; x < w; x += 120) { ctx.beginPath(); ctx.moveTo(x, laneY); ctx.lineTo(x + 60, laneY); ctx.stroke(); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(120,180,255,${0.05 + accel * 0.2})`; ctx.lineWidth = 2;
    for (let i = 0; i < 18; i++) {
      const yy = roadTop + ((i * 53 + V.time * (0.5 + accel * 3)) % (roadBot - roadTop));
      const len = 30 + accel * 120, xx = (i * 97 + V.time * (0.6 + accel * 4)) % (w + len) - len;
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + len, yy); ctx.stroke();
    }
    ctx.restore();

    const startX = w * 0.1, finishX = w * 0.82;
    const marginAbs = clamp(Math.abs(R.margin), 0, 60) / 60;
    const gap = lerp(6, Math.min(w * 0.14, 90), marginAbs), span = finishX - startX;
    const winnerX = startX + span * accel, loserX = startX + (span - gap) * accel;
    const pX = R.win ? winnerX : loserX, rX = R.win ? loserX : winnerX;
    const pY = roadTop + (roadBot - roadTop) * 0.34, rY = roadTop + (roadBot - roadTop) * 0.7;
    const cs = Math.min(w, h) * 0.05;

    for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#111'; ctx.fillRect(finishX + cs * 1.6, roadTop + i * (roadBot - roadTop) / 10, 10, (roadBot - roadTop) / 10); }

    if (elapsed < 500) for (let k = 0; k < 2; k++) R.tire.push({ x: startX - cs, y: (k ? rY : pY) + cs * 0.4, life: 0, max: 600, size: cs * 0.6 });
    ctx.save();
    for (let i = R.tire.length - 1; i >= 0; i--) {
      const p = R.tire[i]; p.life += dt;
      if (p.life > p.max) { R.tire.splice(i, 1); continue; }
      const t = p.life / p.max;
      ctx.fillStyle = `rgba(200,200,205,${(1 - t) * 0.4})`;
      ctx.beginPath(); ctx.arc(p.x - t * 20, p.y, p.size * (1 + t * 2), 0, 7); ctx.fill();
    }
    ctx.restore();

    const boost = 0.3 + accel * 0.8;
    drawCar(ctx, rX, rY, cs, { hi: '#ff6a4d', lo: '#b01818' }, boost);
    drawCar(ctx, pX, pY, cs, { hi: '#5be6ff', lo: '#0b84b0' }, boost);
    ctx.restore();

    if (prog >= 1 && !R.done) { R.done = true; R.doneAt = V.time; }
    vignette(ctx, w, h);
    return R.done && V.time - R.doneAt > 650;
  }

  /* ---------------- start tree ---------------- */
  function treeFrame(ctx, w, h, dt, t) {
    stageFrame(ctx, w, h, dt, true);
    const cx = w / 2, top = h * 0.3, r = Math.min(w, h) * 0.035, gapY = r * 2.6;
    const stage = Math.floor(t * 4);
    ctx.save(); ctx.textAlign = 'center';
    for (const i of [0, 1, 2]) drawBulb(ctx, cx, top + i * gapY, r, '#ffb020', (stage === i) && stage < 3);
    const gy = top + 3 * gapY;
    drawBulb(ctx, cx, gy, r * 1.15, '#39e08a', stage >= 3);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '700 15px Orbitron, sans-serif';
    ctx.fillText(stage >= 3 ? 'VIA!' : 'PRONTI…', cx, gy + r * 2.6);
    ctx.restore();
  }
  function drawBulb(ctx, x, y, r, col, on) {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
    ctx.fillStyle = on ? col : 'rgba(255,255,255,.07)';
    if (on) { ctx.shadowColor = col; ctx.shadowBlur = 24; }
    ctx.fill(); ctx.restore();
  }

  RL.render = { _V: V, reset, setConfig, triggerBlip, startRace, setTime(t) { V.time = t; }, stageFrame, raceFrame, treeFrame };
})();
