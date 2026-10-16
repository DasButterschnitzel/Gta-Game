// Helpers shared by the mission scripts: cast looks, places, cars, enemies.
import type { MissionCtx } from './runner';
import type { CharLook } from '../render/charSprites';
import type { Character } from '../game/character';
import type { Vehicle } from '../game/vehicle';
import type { City } from '../world/city';
import type { Chaser, ChaserOptions } from '../game/chasers';
import type { MarkerColor } from '../render/markers';
import { RNG } from '../core/rng';
import { findRoute } from '../world/route';
import { D, TILE } from '../world/types';
import { RESERVED } from '../world/layout';
import { sidewalkNear, shopFronts, laneSpotAround, facing, walkableNear, type Spot } from './places';

/** sprite palettes for the story cast (match the comic portraits) */
export const CAST: Record<string, CharLook> = {
  dende: { skin: 0xeac2a0, hair: 0xc8302a, top: 0x3a7a3a, bottom: 0x2e3a5a, shoes: 0xe8e8e8, accent: 0xe8c040 },
  gul: { skin: 0xc89070, hair: 0x2a1a14, top: 0xf2f2ea, bottom: 0x6a2a3a, shoes: 0x1a1a1a, accent: 0xc83a2a },
  herbie: { skin: 0xe8bca0, hair: 0x5a4a3a, top: 0x7a5a3a, bottom: 0x4a4a52, shoes: 0x3a2a1e, accent: 0xd8d0c0 },
  uschi: { skin: 0xe8b898, hair: 0xe8d090, top: 0xd8a820, bottom: 0xd8a820, shoes: 0xe8e8e8, accent: 0xc82a2a },
  wirt: { skin: 0xeab898, hair: 0x8a6a4a, top: 0xe8e8e8, bottom: 0x3a3a3a, shoes: 0x3a2a1e, accent: 0x8a6a4a },
  tuersteher: { skin: 0x9a6444, hair: 0x1a1a1a, top: 0x151515, bottom: 0x151515, shoes: 0x0e0e0e, accent: 0xe8c040 },
  mehlhorn: { skin: 0xf0c0a0, hair: 0xd8c8a0, top: 0x8a2a2a, bottom: 0x2a2a2e, shoes: 0x3a2a1e, accent: 0xe8c040 },
  thug: { skin: 0xd8a07a, hair: 0x2a2a2a, top: 0x3a3a3e, bottom: 0x2a2a2e, shoes: 0x1a1a1a, accent: 0x8a8a8a },
  mikki: { skin: 0xf2cdb0, hair: 0x6a4a2a, top: 0x3a3a5a, bottom: 0x2a2a2e, shoes: 0xe8e8e8, accent: 0x5a5a8a },
  lenny: { skin: 0xf2d0b6, hair: 0xe8d8a0, top: 0x151515, bottom: 0x1a1a1a, shoes: 0xe8e8e8, accent: 0x2ad85a },
  ruhland: { skin: 0xe0b08a, hair: 0x3a2a1e, top: 0x6a4024, bottom: 0x2a2e3a, shoes: 0x2a1e14, accent: 0x3a2414 },
  lena: { skin: 0xe8bc9a, hair: 0x4a2a1a, top: 0x3a5a8a, bottom: 0x2a2a3a, shoes: 0x8a3a2a, accent: 0x2a4064 },
  kronwache: { skin: 0xe0b090, hair: 0x1a1a1a, top: 0x121316, bottom: 0x121316, shoes: 0x0a0a0a, accent: 0xd8d8d8 },
  cop: { skin: 0xe8b896, hair: 0x1e2a44, top: 0x2a3e72, bottom: 0x1e2436, shoes: 0x111111, accent: 0xd8e01a },
};

export function poi(m: MissionCtx, id: string): Spot {
  const p = m.g.city.pois.get(id);
  if (!p) throw new Error(`missing POI ${id}`);
  return { x: p.x, y: p.y };
}

export function near(m: MissionCtx, r: number, x: number, y: number): boolean {
  return Math.hypot(m.g.player.x - x, m.g.player.y - y) < r;
}

/** make sure the player sits in a car; returns it */
export async function needCar(m: MissionCtx, text = 'Besorg dir ein Auto'): Promise<Vehicle> {
  if (m.g.player.vehicle) return m.g.player.vehicle;
  m.objective(text);
  await m.until(() => !!m.g.player.vehicle);
  return m.g.player.vehicle!;
}

export function thugs(m: MissionCtx, look: () => CharLook, at: Spot, n: number, weapons: (string | null)[], opts: { health?: number; accuracy?: number; fleeAt?: number; gang?: number } = {}): Character[] {
  const list: Character[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = at.x + Math.cos(a) * 2.2;
    const y = at.y + Math.sin(a) * 2.2;
    const c = m.char(look(), x, y, 'gang');
    m.g.npcs.add(c, {
      mode: 'attack',
      target: m.g.player.char,
      weapon: (weapons[i % weapons.length] as never) ?? null,
      health: opts.health,
      accuracy: opts.accuracy ?? 0.45,
      fleeAt: opts.fleeAt ?? 0.25,
      gang: opts.gang ?? -1,
    });
    list.push(c);
  }
  return list;
}

/** targets: red arrows over each enemy that is still in the fight */
export async function defeat(m: MissionCtx, list: Character[], text: string): Promise<void> {
  m.objective(text);
  const targets = list.map((c) =>
    m.target({ x: () => c.x, y: () => c.y, kind: 'arrow', color: 'red', z: 1.6, gps: false }),
  );
  const out = (c: Character): boolean => c.dead || !m.g.chars.includes(c) || (c.ai as { mode?: string } | null)?.mode === 'flee';
  try {
    while (!list.every(out)) {
      await m.until(() => list.some((c, i) => out(c) && targets[i].blip) || list.every(out));
      list.forEach((c, i) => {
        if (out(c) && targets[i].blip) {
          targets[i].blip = false;
          m.untarget(targets[i]);
        }
      });
    }
  } finally {
    for (const t of targets) m.untarget(t);
  }
}


/** story places that aren't generator landmarks (deterministic, computed once per city) */
export function addStoryPOIs(city: City): void {
  const set = (id: string, label: string, p: Spot | null | undefined): void => {
    if (p && !city.pois.has(id)) city.pois.set(id, { id, x: p.x, y: p.y, label });
  };
  const hbf = city.pois.get('hbf');
  if (hbf) {
    set('ruhland', 'Parkdeck am Hauptbahnhof', sidewalkNear(city, hbf.x - 30, hbf.y - 40, 40, 110, new RNG(4101), D.Bahnhof) ?? sidewalkNear(city, hbf.x, hbf.y, 40, 140, new RNG(4102)));
    set('lauterblick', 'Lauterblick-Redaktion', shopFronts(city, D.Bahnhof, { x: hbf.x - 120, y: hbf.y + 10 }, 260, 1, 0, new RNG(4103))[0] ?? sidewalkNear(city, hbf.x - 120, hbf.y, 30, 200, new RNG(4104)));
  }
  // back door of Club Knockout (the entrance faces south)
  const k = RESERVED.knockout;
  set('knockout_back', 'Club Knockout (hinten)', walkableNear(city, ((k.x0 + k.x1) / 2) * TILE, (k.y1 + 0.8) * TILE, 24));
}

/**
 * Bring vehicle v to (x, y) and stop there. If the player leaves the vehicle the objective
 * changes to getting back in.
 */
export async function deliver(m: MissionCtx, v: Vehicle, x: number, y: number, text: string, opts: { r?: number; stop?: boolean; back?: string; color?: MarkerColor } = {}): Promise<void> {
  const g = m.g;
  const r = opts.r ?? 6;
  const t = m.target({ x: () => x, y: () => y, r, color: opts.color ?? 'yellow', kind: 'ring', gps: true });
  try {
    for (;;) {
      if (g.player.vehicle !== v) {
        m.objective(opts.back ?? 'Steig wieder ein!');
        const a = m.target({ x: () => v.x, y: () => v.y, kind: 'arrow', color: 'blue', r: 3, gps: false, primary: true });
        try {
          await m.until(() => g.player.vehicle === v);
        } finally {
          m.untarget(a);
        }
      }
      m.objective(text);
      await m.until(() => g.player.vehicle !== v || (Math.hypot(v.x - x, v.y - y) < r && (!opts.stop || v.speed < 3)));
      if (g.player.vehicle === v) return;
    }
  } finally {
    m.untarget(t);
  }
}

/** chaser cars appearing out of sight around the player, heading towards them */
export function spawnChasers(m: MissionCtx, n: number, defIds: string[], opts: ChaserOptions, rng: RNG, rMin = 70, rMax = 130): Chaser[] {
  const g = m.g;
  const out: Chaser[] = [];
  const pv = g.player.vehicle;
  const back = pv ? pv.angle + Math.PI : undefined;
  for (let i = 0; i < n; i++) {
    const px = g.player.x;
    const py = g.player.y;
    const sp =
      laneSpotAround(g.city, px, py, rMin, rMax, rng, (s) => !g.isVisible(s.x, s.y, 6) && facing(s, px, py) && !g.vehicles.some((o) => Math.hypot(o.x - s.x, o.y - s.y) < 7), back) ??
      laneSpotAround(g.city, px, py, rMin, rMax * 1.4, rng, (s) => !g.isVisible(s.x, s.y, 4));
    if (!sp) continue;
    const ch = m.chaser(defIds[i % defIds.length], sp.x, sp.y, sp.h, opts);
    ch.v.body.setLinearVelocity({ x: Math.cos(sp.h) * 8, y: Math.sin(sp.h) * 8 });
    out.push(ch);
  }
  return out;
}

/** red arrows over chaser cars and, once they are out, over their crews; resolves when all are beaten */
export async function defeatChasers(m: MissionCtx, list: Chaser[], extra: Character[], text: string): Promise<void> {
  const g = m.g;
  m.objective(text);
  const down = (c: Character): boolean => c.dead || !g.chars.includes(c) || (c.ai as { mode?: string } | null)?.mode === 'flee';
  const crews = (): Character[] => [...extra, ...list.flatMap((ch) => ch.crew)];
  const arrows = new Map<object, ReturnType<MissionCtx['target']>>();
  const sync = (): void => {
    const want = new Set<object>();
    for (const ch of list) {
      const inCar = ch.inCar.filter((c) => !c.dead);
      if (ch.mode !== 'out' && inCar.length && !ch.v.dead) want.add(ch);
    }
    for (const c of crews()) if (!c.hidden && !down(c)) want.add(c);
    for (const [k, t] of arrows) {
      if (!want.has(k)) {
        m.untarget(t);
        arrows.delete(k);
      }
    }
    for (const k of want) {
      if (arrows.has(k)) continue;
      const ch = list.find((o) => o === k);
      const t = ch
        ? m.target({ x: () => ch.v.x, y: () => ch.v.y, kind: 'arrow', color: 'red', z: 2.4, gps: false })
        : m.target({ x: () => (k as Character).x, y: () => (k as Character).y, kind: 'arrow', color: 'red', z: 1.6, gps: false });
      arrows.set(k, t);
    }
  };
  const done = (): boolean => crews().every((c) => down(c) || (c.hidden && c.vehicle !== null && c.vehicle.dead));
  try {
    while (!done()) {
      sync();
      await m.wait(0.25);
    }
  } finally {
    for (const t of arrows.values()) m.untarget(t);
  }
}

/** wait until the player has stood on (x, y) on foot for `secs` seconds */
export async function holdAt(m: MissionCtx, x: number, y: number, r: number, secs: number, text: string, busy: string): Promise<void> {
  const g = m.g;
  const t = m.target({ x: () => x, y: () => y, r, color: 'green', kind: 'ring', gps: false });
  let since = -1;
  try {
    m.objective(text);
    await m.until(() => {
      const inside = !g.player.vehicle && Math.hypot(g.player.x - x, g.player.y - y) < r;
      if (!inside) {
        if (since >= 0) m.objective(text);
        since = -1;
        return false;
      }
      if (since < 0) {
        since = m.time;
        m.objective(busy);
      }
      return m.time - since >= secs;
    });
  } finally {
    m.untarget(t);
  }
}

/** driving distance along the lane graph between two points (straight-line × 1.5 if no route) */
export function routeLength(m: MissionCtx, x0: number, y0: number, x1: number, y1: number): number {
  const g = m.g;
  const city = g.city;
  const straight = Math.hypot(x1 - x0, y1 - y0);
  const from = city.nearestLane(x0, y0, 30, undefined, Math.PI, true);
  if (!from) return straight * 1.5;
  const r = findRoute(city, from.edge, x1, y1, 26, 6000, (id) => g.laneBlocked(id));
  if (!r) return straight * 1.5;
  let d = city.lanes[from.edge].len - from.s;
  for (const id of r) d += city.lanes[id].len;
  return Math.max(straight, d);
}
