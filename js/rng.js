/* REDLINE — utility math & RNG */
(function () {
  const RL = (window.RL = window.RL || {});

  const rand = (min, max) => min + Math.random() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));

  // Gaussian noise (Box–Muller) with a cached spare value.
  let spare = null;
  function gauss(mean = 0, sd = 1) {
    if (spare !== null) { const v = spare; spare = null; return mean + sd * v; }
    let u = Math.random() || 1e-9;
    let v = Math.random() || 1e-9;
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mean + sd * mag * Math.cos(2 * Math.PI * v);
  }

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInCubic = (t) => t * t * t;
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutBack = (t) => { const c = 1.70158, s = c + 1; return 1 + s * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  RL.util = { rand, randInt, gauss, clamp, lerp, easeOutCubic, easeInCubic, easeInOutCubic, easeOutBack };
})();
