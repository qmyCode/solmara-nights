// A small deterministic random generator (mulberry32). The whole city, the traffic and the
// staged screenshot scenes are built from one seed, so a given seed always produces the
// same Solmara — that is what makes the ?shot= scenes reproducible frame for frame.

/** Create a seeded generator: next() in [0,1), range(a,b), int(a,b), pick(list), chance(p). */
export function createRng(seed) {
  let state = (seed >>> 0) || 0x9e3779b9;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range(a, b) {
      return a + next() * (b - a);
    },
    int(a, b) {
      return a + Math.floor(next() * (b - a + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    chance(p) {
      return next() < p;
    },
  };
}
