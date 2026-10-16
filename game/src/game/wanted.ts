// Fahndungsstufe (wanted level): heat from crimes, decay when the police lose you, takedowns.

export type Crime =
  | 'assault'
  | 'assault_cop'
  | 'carjack'
  | 'theft'
  | 'hit_ped'
  | 'kill'
  | 'kill_cop'
  | 'shooting'
  | 'explosion'
  | 'ram_cop'
  | 'destroy_cop';

/** heat added when a cop sees it / when a witness calls it in (0 = ignored) */
const CRIME_HEAT: Record<Crime, [number, number]> = {
  assault: [0.4, 0],
  assault_cop: [1.0, 1.0],
  carjack: [0.7, 0.3],
  theft: [0.5, 0],
  hit_ped: [0.5, 0.25],
  kill: [1.0, 0.5],
  kill_cop: [1.6, 1.2],
  shooting: [0.6, 0.3],
  explosion: [1.0, 0.6],
  ram_cop: [0.4, 0.4],
  destroy_cop: [1.0, 1.0],
};

interface Call {
  t: number;
  heat: number;
  x: number;
  y: number;
}

export class WantedSystem {
  heat = 0;
  /** seconds since the police last saw the player */
  unseenT = 99;
  /** police are searching (lost sight) */
  searching = false;
  lastKnownX = 0;
  lastKnownY = 0;
  takedowns = 0;
  private calls: Call[] = [];
  private shotCooldown = 0;
  /** per-crime cooldowns so a burst of hits counts once */
  private cool = new Map<Crime, number>();
  /** internal clock (game seconds) */
  private t = 0;
  /** level changes are reported here for the HUD / sounds */
  onLevel: ((level: number, prev: number) => void) | null = null;
  private lastLevel = 0;

  get level(): number {
    return this.heat <= 0.001 ? 0 : Math.min(6, Math.ceil(this.heat - 1e-6));
  }

  /** A crime happened. `seen` = witnessed by police. */
  crime(type: Crime, x: number, y: number, seen: boolean): void {
    if (type === 'shooting') {
      if (this.shotCooldown > 0) return;
      this.shotCooldown = 3;
    } else {
      const now = this.t;
      const until = this.cool.get(type) ?? 0;
      if (now < until) return;
      this.cool.set(type, now + (type === 'kill' || type === 'kill_cop' ? 0.3 : 1.2));
    }
    const [hs, hc] = CRIME_HEAT[type];
    if (seen) {
      this.add(hs);
      this.seenAt(x, y);
    } else if (hc > 0) {
      this.calls.push({ t: 4 + Math.random() * 3, heat: hc, x, y });
    }
  }

  private add(h: number): void {
    const before = this.level;
    this.heat = Math.min(6, this.heat + h);
    // every crime lifts you at least to the next full star
    if (this.level === before && h >= 0.95) this.heat = Math.min(6, Math.max(this.heat, before + 0.6));
    this.report();
  }

  /** set a minimum wanted level (missions); the police know where you are */
  atLeast(level: number, x?: number, y?: number): void {
    if (this.level < level) {
      this.heat = Math.min(6, level - 0.4);
      this.report();
    }
    if (x !== undefined && y !== undefined) this.seenAt(x, y);
  }

  seenAt(x: number, y: number): void {
    this.unseenT = 0;
    this.searching = false;
    this.lastKnownX = x;
    this.lastKnownY = y;
  }

  /** a pursuing police car was wrecked */
  takedown(): number {
    this.takedowns++;
    const lvl = this.level;
    this.heat = Math.max(0, this.heat - (lvl <= 3 ? 0.5 : 0.34));
    this.report();
    return this.level;
  }

  clear(): void {
    this.heat = 0;
    this.calls.length = 0;
    this.searching = false;
    this.unseenT = 99;
    this.report();
  }

  /** -1 star (bribe pickup) */
  lower(stars: number): void {
    this.heat = Math.max(0, Math.ceil(this.heat - 1e-6) - stars - 0.001);
    if (this.heat < 0.01) this.heat = 0;
    this.report();
  }

  step(dt: number, seen: boolean, px: number, py: number): void {
    this.t += dt;
    if (this.shotCooldown > 0) this.shotCooldown -= dt;
    for (let i = this.calls.length - 1; i >= 0; i--) {
      const c = this.calls[i];
      c.t -= dt;
      if (c.t <= 0) {
        this.calls.splice(i, 1);
        this.add(c.heat);
        if (this.unseenT > 2) {
          this.lastKnownX = c.x;
          this.lastKnownY = c.y;
        }
      }
    }
    if (this.heat <= 0) {
      this.searching = false;
      return;
    }
    if (seen) this.seenAt(px, py);
    else this.unseenT += dt;
    const lvl = this.level;
    const grace = 5 + lvl * 1.5;
    this.searching = this.unseenT > 2.5;
    if (this.unseenT > grace) {
      const rate = lvl <= 2 ? 0.16 : lvl <= 4 ? 0.11 : 0.08;
      this.heat = Math.max(0, this.heat - rate * dt);
      this.report();
    }
  }

  private report(): void {
    const l = this.level;
    if (l !== this.lastLevel) {
      const prev = this.lastLevel;
      this.lastLevel = l;
      this.onLevel?.(l, prev);
    }
  }
}
