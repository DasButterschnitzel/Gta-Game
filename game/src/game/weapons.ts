// Weapon catalogue and per-character arsenal.

export type WeaponId = 'fists' | 'bat' | 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'molotov' | 'grenade';

export interface WeaponDef {
  id: WeaponId;
  /** HUD name (German) */
  name: string;
  kind: 'melee' | 'gun' | 'throw';
  /** damage per hit / pellet */
  damage: number;
  /** minimum seconds between shots */
  interval: number;
  pellets: number;
  /** cone half-angle (rad) of the random spread */
  spread: number;
  range: number;
  /** ammo per pickup / max carried */
  pickupAmmo: number;
  maxAmmo: number;
  sound: string;
  pose: 'none' | 'pistol' | 'rifle' | 'bat';
  /** can be fired from a car window */
  driveBy: boolean;
  /** multiplier for damage dealt to vehicles */
  vsVehicle: number;
  /** impulse applied to people that get hit */
  knock: number;
  /** price at the arms dealer (0 = not sold) */
  price: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  fists: { id: 'fists', name: 'Fäuste', kind: 'melee', damage: 12, interval: 0.34, pellets: 1, spread: 0, range: 1.25, pickupAmmo: 0, maxAmmo: 0, sound: 'punch', pose: 'none', driveBy: false, vsVehicle: 0, knock: 3, price: 0 },
  bat: { id: 'bat', name: 'Baseballschläger', kind: 'melee', damage: 30, interval: 0.55, pellets: 1, spread: 0, range: 1.6, pickupAmmo: 1, maxAmmo: 1, sound: 'bat_hit', pose: 'bat', driveBy: false, vsVehicle: 0.25, knock: 6, price: 150 },
  pistol: { id: 'pistol', name: 'Pistole', kind: 'gun', damage: 24, interval: 0.3, pellets: 1, spread: 0.035, range: 34, pickupAmmo: 36, maxAmmo: 240, sound: 'pistol', pose: 'pistol', driveBy: true, vsVehicle: 0.45, knock: 1.5, price: 600 },
  smg: { id: 'smg', name: 'Maschinenpistole', kind: 'gun', damage: 15, interval: 0.085, pellets: 1, spread: 0.085, range: 30, pickupAmmo: 90, maxAmmo: 600, sound: 'smg', pose: 'pistol', driveBy: true, vsVehicle: 0.4, knock: 1.2, price: 1800 },
  shotgun: { id: 'shotgun', name: 'Schrotflinte', kind: 'gun', damage: 13, interval: 0.85, pellets: 7, spread: 0.2, range: 19, pickupAmmo: 12, maxAmmo: 60, sound: 'shotgun', pose: 'rifle', driveBy: false, vsVehicle: 0.5, knock: 4.5, price: 1400 },
  rifle: { id: 'rifle', name: 'Sturmgewehr', kind: 'gun', damage: 27, interval: 0.11, pellets: 1, spread: 0.045, range: 42, pickupAmmo: 60, maxAmmo: 360, sound: 'rifle', pose: 'rifle', driveBy: false, vsVehicle: 0.6, knock: 2.2, price: 4500 },
  molotov: { id: 'molotov', name: 'Molotowcocktail', kind: 'throw', damage: 0, interval: 0.8, pellets: 1, spread: 0, range: 18, pickupAmmo: 4, maxAmmo: 10, sound: 'throw', pose: 'none', driveBy: false, vsVehicle: 1, knock: 0, price: 250 },
  grenade: { id: 'grenade', name: 'Granate', kind: 'throw', damage: 0, interval: 0.8, pellets: 1, spread: 0, range: 20, pickupAmmo: 4, maxAmmo: 10, sound: 'throw', pose: 'none', driveBy: false, vsVehicle: 1, knock: 0, price: 600 },
};

export const WEAPON_ORDER: WeaponId[] = ['fists', 'bat', 'pistol', 'smg', 'shotgun', 'rifle', 'molotov', 'grenade'];

/** The weapons a character carries. Fists are always available. */
export class Arsenal {
  private ammo = new Map<WeaponId, number>([['fists', 1]]);
  current: WeaponId = 'fists';
  cooldown = 0;

  get def(): WeaponDef {
    return WEAPONS[this.current];
  }

  has(id: WeaponId): boolean {
    return (this.ammo.get(id) ?? 0) > 0;
  }

  ammoOf(id: WeaponId): number {
    return this.ammo.get(id) ?? 0;
  }

  /** Add a weapon / ammo. Returns the amount actually added. */
  give(id: WeaponId, amount = WEAPONS[id].pickupAmmo, select = false): number {
    const def = WEAPONS[id];
    const had = this.ammo.get(id) ?? 0;
    const max = Math.max(1, def.maxAmmo);
    const now = Math.min(max, had + Math.max(1, amount));
    this.ammo.set(id, now);
    if (select || (had === 0 && this.current === 'fists')) this.current = id;
    return now - had;
  }

  /** Consume one round of the current weapon; switches back when empty. */
  consume(): void {
    const def = this.def;
    if (def.kind === 'melee') return;
    const left = (this.ammo.get(def.id) ?? 0) - 1;
    if (left <= 0) {
      this.ammo.delete(def.id);
      this.cycle(1);
    } else this.ammo.set(def.id, left);
  }

  cycle(dir: number): void {
    const owned = WEAPON_ORDER.filter((w) => this.has(w));
    if (!owned.length) {
      this.current = 'fists';
      return;
    }
    let i = owned.indexOf(this.current);
    if (i < 0) i = 0;
    else i = (i + dir + owned.length) % owned.length;
    this.current = owned[i];
  }

  /** Best weapon for shooting out of a car window, or null. */
  driveByWeapon(): WeaponId | null {
    if (WEAPONS[this.current].driveBy && this.has(this.current)) return this.current;
    for (const id of ['smg', 'pistol'] as WeaponId[]) if (this.has(id)) return id;
    return null;
  }

  useAmmo(id: WeaponId): void {
    if (WEAPONS[id].kind === 'melee') return;
    const left = (this.ammo.get(id) ?? 0) - 1;
    if (left <= 0) {
      this.ammo.delete(id);
      if (this.current === id) this.cycle(1);
    } else this.ammo.set(id, left);
  }

  clear(): void {
    this.ammo.clear();
    this.ammo.set('fists', 1);
    this.current = 'fists';
  }

  /** for saves */
  toJSON(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const [k, v] of this.ammo) if (k !== 'fists') o[k] = v;
    return o;
  }

  load(o: Record<string, number>): void {
    this.clear();
    for (const [k, v] of Object.entries(o)) if (k in WEAPONS && v > 0) this.ammo.set(k as WeaponId, v);
  }

  label(): string {
    const def = this.def;
    if (def.kind === 'melee') return def.name;
    return `${def.name} ${this.ammoOf(def.id)}`;
  }
}
