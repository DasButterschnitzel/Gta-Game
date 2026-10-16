// The four gangs of Neuhafen (two rival pairs) and the player's respect with each.
import type { CharLook } from '../render/charSprites';
import { RNG } from '../core/rng';
import { D } from '../world/types';
import type { WeaponId } from './weapons';

export type GangId = 'lotsen' | 'wolfe' | 'kiez' | 'neon';

export interface GangDef {
  id: GangId;
  index: number;
  name: string;
  rival: GangId;
  districts: D[];
  color: string;
  weapons: WeaponId[];
  look(rng: RNG): CharLook;
}

const SKINS = [0xf2d0b6, 0xe8b896, 0xd8a07a, 0xc08060, 0x9a6444, 0x6e4430];

export const GANGS: Record<GangId, GangDef> = {
  lotsen: {
    id: 'lotsen',
    index: 0,
    name: 'Die Lotsen',
    rival: 'wolfe',
    districts: [D.Hafen],
    color: '#3a6aa8',
    weapons: ['pistol', 'shotgun', 'bat'],
    look: (r) => ({ skin: r.pick(SKINS), hair: 0x1e2a44, top: r.pick([0x1e2a44, 0x2a3a5a]), bottom: 0x2a2a2e, shoes: 0x1a1a1a, accent: 0xe8e8e8 }),
  },
  wolfe: {
    id: 'wolfe',
    index: 1,
    name: 'Eisenwölfe MC',
    rival: 'lotsen',
    districts: [D.Industrie],
    color: '#c8602a',
    weapons: ['bat', 'pistol', 'smg'],
    look: (r) => ({ skin: r.pick(SKINS), hair: r.pick([0x1a1a1a, 0x5a3a24, 0x3a3a3a]), top: 0x1a1a1a, bottom: 0x2a2e3a, shoes: 0x1a1a1a, accent: 0xc8602a }),
  },
  kiez: {
    id: 'kiez',
    index: 2,
    name: 'Kiez-Kompanie',
    rival: 'neon',
    districts: [D.Kiez],
    color: '#d8a820',
    weapons: ['bat', 'pistol'],
    look: (r) => ({ skin: r.pick(SKINS), hair: r.pick([0x1a1a1a, 0xe8d090, 0x3a2a1e]), top: r.pick([0xd8a820, 0xc82a2a]), bottom: 0x1a1a1a, shoes: 0xe8e8e8, accent: 0xc82a2a }),
  },
  neon: {
    id: 'neon',
    index: 3,
    name: 'NEON',
    rival: 'kiez',
    districts: [D.Platte],
    color: '#2ad85a',
    weapons: ['bat', 'smg', 'pistol'],
    look: (r) => ({ skin: r.pick(SKINS), hair: r.pick([0x2ad85a, 0x101010, 0xe8e8e8]), top: 0x101010, bottom: 0x1a1a1a, shoes: 0xe8e8e8, accent: 0x2ad85a }),
  },
};

export const GANG_LIST: GangDef[] = [GANGS.lotsen, GANGS.wolfe, GANGS.kiez, GANGS.neon];

/** respect −100 … +100 per gang; working for one costs respect with its rival */
export class Respect {
  readonly values: Record<GangId, number> = { lotsen: 0, wolfe: 0, kiez: 0, neon: 0 };

  add(id: GangId, n: number, rivalToo = true): void {
    this.values[id] = Math.max(-100, Math.min(100, this.values[id] + n));
    if (rivalToo && n > 0) {
      const r = GANGS[id].rival;
      this.values[r] = Math.max(-100, Math.min(100, this.values[r] - Math.round(n * 0.6)));
    }
  }

  get(id: GangId): number {
    return this.values[id];
  }

  hostile(id: GangId): boolean {
    return this.values[id] < -25;
  }

  friendly(id: GangId): boolean {
    return this.values[id] > 25;
  }
}
