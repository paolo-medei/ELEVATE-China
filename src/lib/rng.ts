/** Deterministic PRNG so every reload of the demo shows the same "season". */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    /** uniform [0,1) */
    next,
    /** uniform [min,max) */
    range: (min: number, max: number) => min + next() * (max - min),
    /** integer in [min,max] */
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    /** approx. standard normal (Irwin–Hall) */
    gauss: (mean = 0, sd = 1) => {
      let s = 0;
      for (let i = 0; i < 6; i++) s += next();
      return mean + (s - 3) * 0.7071 * sd;
    },
    bool: (pTrue: number) => next() < pTrue,
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)],
  };
}

export type Rng = ReturnType<typeof makeRng>;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
