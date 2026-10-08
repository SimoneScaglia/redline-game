/* REDLINE — game model: hidden power, tells, economy, difficulty.
 *
 * Power is shown in CV (360..460). The rival power P is hidden; the player
 * builds an engine of b CV and wins the race if b >= P.
 *
 * Economy (outcome always in -100..+100 gettoni):
 *   stake = b - 350      (10..100 for a buildable engine 360..450)
 *   win  -> +(460 - b)   (100 down to 10)   : build less, win more
 *   lose -> -(b - 350)   (-10 down to -100)
 *   fold ->  0
 * No-information expected value is < 0 for every committed bet (the best a
 * blind player can do is fold at 0), while reading the rival accurately yields
 * clearly positive EV. That gap is the skill. Rival can reach 460 but the
 * player only 450, so the strongest rivals are unwinnable -> you must fold them.
 *
 * Tells (all VISUAL — nothing depends on sound):
 *   HONEST (mean = P, constant across rounds, noisy values):
 *     tach  (noise 6)  — clean anchor, read on the blip peak
 *     boost (noise 14) — medium
 *     vibe  (noise 26) — very noisy engine shake
 *   BLUFF (independent of P, theatrical, look just like real data):
 *     smoke — always present (facile)
 *     oil   — added at medio
 *     temp  — added at difficile
 */
(function () {
  const RL = window.RL;
  const { randInt, rand, gauss, clamp } = RL.util;

  const CONFIG = {
    P_MIN: 360, P_MAX: 460,        // rival power (CV), uniform
    BET_MIN: 360, BET_MAX: 450,    // player engine (CV)
    STAKE_FLOOR: 350,              // stake = b - STAKE_FLOOR
    WIN_CAP: 460,                  // win payout = WIN_CAP - b
    START_BANKROLL: 200,
    MIN_PLAYABLE: 10,              // need >=10 gettoni to afford the minimum stake
    STAGING_MS: 45000,
    BLIP_MS: 3500,
    GAUGE_MIN: 300, GAUGE_MAX: 500, // CV -> needle fraction window
    NOISE: { tach: 6, boost: 14, vibe: 26 },
    DIFFICULTY: {
      facile:    { bluffs: ['smoke'] },
      medio:     { bluffs: ['smoke', 'oil'] },
      difficile: { bluffs: ['smoke', 'oil', 'temp'] },
    },
  };

  // Fresh noisy readings for every tell. Called on each blip.
  function sampleReadings(P, seeds) {
    return {
      // honest — centered on P (CV)
      tach:  clamp(P + gauss(0, CONFIG.NOISE.tach),  280, 520),
      boost: clamp(P + gauss(0, CONFIG.NOISE.boost), 280, 520),
      vibe:  clamp(P + gauss(0, CONFIG.NOISE.vibe),  280, 520),
      // bluff — independent of P (smoke as 0..1 intensity, oil/temp as 0..1 gauge fraction)
      smoke: clamp(seeds.smoke + gauss(0, 0.08), 0, 1),
      oil:   clamp(seeds.oil  + gauss(0, 0.07), 0, 1),
      temp:  clamp(seeds.temp + gauss(0, 0.07), 0, 1),
    };
  }

  function newRound(difficulty) {
    const P = randInt(CONFIG.P_MIN, CONFIG.P_MAX);
    // bluff "personalities" — re-rolled each mano, uncorrelated with P.
    // oil/temp seeds sit in the same visual band as honest gauges so they are
    // indistinguishable at a glance.
    const seeds = { smoke: rand(0.3, 1.0), oil: rand(0.3, 0.85), temp: rand(0.3, 0.85) };
    const cfg = CONFIG.DIFFICULTY[difficulty] || CONFIG.DIFFICULTY.facile;
    return { P, seeds, bluffs: cfg.bluffs.slice(), readings: sampleReadings(P, seeds) };
  }

  // Resolve a race. Win if the player's engine b >= rival power P.
  function resolve(P, b) {
    const win = b >= P;
    const net = win ? (CONFIG.WIN_CAP - b) : (CONFIG.STAKE_FLOOR - b);
    return { win, net, margin: b - P };
  }

  RL.CONFIG = CONFIG;
  RL.model = { newRound, sampleReadings, resolve };
})();
