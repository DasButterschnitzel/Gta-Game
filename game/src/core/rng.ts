// Deterministic seeded random number generator (mulberry32).

export class RNG {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Integer in [a, b] inclusive. */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Weighted pick: weights array parallel to items. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  fork(salt: number): RNG {
    return new RNG((Math.floor(this.next() * 4294967296) ^ Math.imul(salt, 2654435761)) >>> 0);
  }
}

/** Global non-deterministic RNG for gameplay effects. */
export const fxRng = new RNG((Date.now() & 0xffffffff) >>> 0);
