// Pickups: weapon crates, health, armour, money and police bribes lying around the city (GTA 2 style).
import type { City } from '../world/city';
import { D, F_ROAD, G, MAP_W, MAP_H, TILE } from '../world/types';
import { WEAPONS, type WeaponId } from './weapons';
import { RNG } from '../core/rng';

export type PickupKind = 'weapon' | 'health' | 'armor' | 'money' | 'bribe';

export interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: PickupKind;
  weapon: WeaponId | null;
  amount: number;
  /** seconds until it comes back after collection (0 = gone for good) */
  respawn: number;
  /** >0: waiting to respawn */
  wait: number;
  /** seconds until a dropped pickup vanishes (Infinity for placed ones) */
  life: number;
  active: boolean;
}

/** Icon index in the pickup atlas. */
export function pickupIcon(p: Pickup): number {
  switch (p.kind) {
    case 'weapon':
      return { fists: 0, bat: 4, pistol: 0, smg: 1, shotgun: 2, rifle: 3, molotov: 5, grenade: 6 }[p.weapon ?? 'pistol'];
    case 'health':
      return 7;
    case 'armor':
      return 8;
    case 'money':
      return 9;
    case 'bribe':
      return 10;
  }
}

/** weapons found lying around per district */
const DISTRICT_WEAPONS: Partial<Record<D, WeaponId[]>> = {
  [D.Platte]: ['bat', 'pistol', 'bat', 'molotov'],
  [D.Kiez]: ['pistol', 'smg', 'molotov', 'bat'],
  [D.Bahnhof]: ['pistol', 'smg', 'bat'],
  [D.Hafen]: ['shotgun', 'grenade', 'rifle', 'pistol'],
  [D.Industrie]: ['molotov', 'shotgun', 'grenade', 'bat'],
  [D.Altstadt]: ['bat', 'pistol', 'molotov'],
  [D.Turm]: ['smg', 'rifle', 'pistol'],
  [D.Villen]: ['shotgun', 'rifle', 'smg'],
  [D.Uni]: ['bat', 'molotov', 'pistol'],
  [D.Park]: ['bat', 'molotov'],
  [D.Nordend]: ['pistol', 'molotov', 'smg'],
  [D.Flughafen]: ['rifle', 'grenade'],
};

const GOOD_GROUND = new Set<number>([G.Courtyard, G.Plaza, G.Parking, G.Grass, G.Pavers, G.Concrete, G.Dirt, G.Gravel, G.Sidewalk, G.Quay, G.Path]);

export class PickupSystem {
  readonly list: Pickup[] = [];
  private nextId = 1;

  constructor(city: City) {
    this.placeStatic(city);
  }

  private add(x: number, y: number, kind: PickupKind, weapon: WeaponId | null, amount: number, respawn: number, life = Infinity): Pickup {
    const p: Pickup = { id: this.nextId++, x, y, kind, weapon, amount, respawn, wait: 0, life, active: true };
    this.list.push(p);
    return p;
  }

  /** Deterministic placement of the permanent pickups. */
  private placeStatic(city: City): void {
    const rng = new RNG(4711);
    const placed: { x: number; y: number }[] = [];
    const farEnough = (x: number, y: number, d: number): boolean => placed.every((p) => Math.hypot(p.x - x, p.y - y) > d);
    const spot = (district: D | null, near: { x: number; y: number } | null, radius: number, preferCourtyard: boolean): { x: number; y: number } | null => {
      for (let attempt = 0; attempt < 400; attempt++) {
        let tx: number;
        let ty: number;
        if (near) {
          tx = Math.floor((near.x + rng.range(-radius, radius)) / TILE);
          ty = Math.floor((near.y + rng.range(-radius, radius)) / TILE);
        } else {
          tx = rng.int(2, MAP_W - 3);
          ty = rng.int(2, MAP_H - 3);
        }
        if (!city.inBounds(tx, ty)) continue;
        const i = ty * MAP_W + tx;
        if (district !== null && city.district[i] !== district) continue;
        if (city.solid[i] !== 0 || city.flags[i] & F_ROAD) continue;
        const g = city.ground[i];
        if (!GOOD_GROUND.has(g)) continue;
        if (preferCourtyard && g !== G.Courtyard && g !== G.Parking && g !== G.Grass && rng.chance(0.75)) continue;
        // all 4 neighbours walkable so the crate is reachable
        if (!city.isWalkableTile(tx + 1, ty) || !city.isWalkableTile(tx - 1, ty) || !city.isWalkableTile(tx, ty + 1) || !city.isWalkableTile(tx, ty - 1)) continue;
        const x = (tx + 0.5) * TILE;
        const y = (ty + 0.5) * TILE;
        if (!farEnough(x, y, near ? 8 : 55)) continue;
        placed.push({ x, y });
        return { x, y };
      }
      return null;
    };
    // weapons: 3-5 per district
    for (const [dk, weapons] of Object.entries(DISTRICT_WEAPONS)) {
      const district = Number(dk) as D;
      const n = weapons.length + 1;
      for (let k = 0; k < n; k++) {
        const s = spot(district, null, 0, true);
        if (!s) continue;
        const w = weapons[k % weapons.length];
        this.add(s.x, s.y, 'weapon', w, WEAPONS[w].pickupAmmo, 90);
      }
    }
    // health near the hospital and Gül's Grill, plus scattered
    for (const [poi, n] of [['hospital', 2], ['safehouse', 1]] as const) {
      const p = city.pois.get(poi);
      if (!p) continue;
      for (let k = 0; k < n; k++) {
        const s = spot(null, p, 14, false);
        if (s) this.add(s.x, s.y, 'health', null, 50, 60);
      }
    }
    for (let k = 0; k < 10; k++) {
      const s = spot(null, null, 0, true);
      if (s) this.add(s.x, s.y, 'health', null, 50, 120);
    }
    // armour: near the police station (cheeky) and hidden in industrial yards
    const police = city.pois.get('police');
    if (police) {
      const s = spot(null, police, 18, false);
      if (s) this.add(s.x, s.y, 'armor', null, 100, 120);
    }
    for (const d of [D.Industrie, D.Hafen, D.Platte, D.Turm, D.Kiez]) {
      const s = spot(d, null, 0, true);
      if (s) this.add(s.x, s.y, 'armor', null, 100, 150);
    }
    // police bribes: a handful of well hidden envelopes
    for (const d of [D.Platte, D.Kiez, D.Hafen, D.Altstadt, D.Villen, D.Uni]) {
      const s = spot(d, null, 0, true);
      if (s) this.add(s.x, s.y, 'bribe', null, 1, 180);
    }
  }

  /** A dropped pickup (money from a victim, a cop's pistol...). */
  drop(x: number, y: number, kind: PickupKind, weapon: WeaponId | null, amount: number): void {
    // cap the number of drops
    let drops = 0;
    for (const p of this.list) if (p.life !== Infinity) drops++;
    if (drops > 40) {
      const i = this.list.findIndex((p) => p.life !== Infinity);
      if (i >= 0) this.list.splice(i, 1);
    }
    this.add(x, y, kind, weapon, amount, 0, 30);
  }

  /** advance timers; returns nothing (collection is done by the game) */
  step(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.life !== Infinity) {
        p.life -= dt;
        if (p.life <= 0) {
          this.list.splice(i, 1);
          continue;
        }
      }
      if (!p.active) {
        p.wait -= dt;
        if (p.wait <= 0) p.active = true;
      }
    }
  }

  collect(p: Pickup): void {
    if (p.respawn > 0) {
      p.active = false;
      p.wait = p.respawn;
    } else {
      const i = this.list.indexOf(p);
      if (i >= 0) this.list.splice(i, 1);
    }
  }
}
