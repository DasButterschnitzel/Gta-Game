// "Ticken": a light Chinatown-Wars-style trade. Five goods, dealers with their own prices,
// supply and demand that react to the player's deals, daily drift, tips on the phone and
// police stings. Goods are lost when Kai gets busted or dies.
import { RNG } from '../core/rng';
import { D, F_ROAD, MAP_W, TILE, Zone } from '../world/types';
import type { City } from '../world/city';
import type { CharLook } from '../render/charSprites';

export type GoodId = 'gras' | 'pillen' | 'ket' | 'crystal' | 'koks';

export interface GoodDef {
  id: GoodId;
  name: string;
  base: number;
  color: string;
}

export const GOODS: Record<GoodId, GoodDef> = {
  gras: { id: 'gras', name: 'Gras', base: 14, color: '#7ad85a' },
  pillen: { id: 'pillen', name: 'Pillen', base: 26, color: '#f07ad8' },
  ket: { id: 'ket', name: 'Ket', base: 42, color: '#8ad8f0' },
  crystal: { id: 'crystal', name: 'Crystal', base: 68, color: '#c8f4ff' },
  koks: { id: 'koks', name: 'Koks', base: 115, color: '#f4f4f4' },
};

export const GOOD_IDS: GoodId[] = ['gras', 'pillen', 'ket', 'crystal', 'koks'];

export interface DealerDef {
  id: string;
  name: string;
  place: string;
  district: D;
  zone: Zone;
  /** price multipliers (missing = doesn't trade it) */
  mods: Partial<Record<GoodId, number>>;
  /** chance per trade that the "dealer" was a plain-clothes cop */
  sting: number;
  look: CharLook;
}

export const DEALERS: DealerDef[] = [
  { id: 'wall', name: 'Bodo', place: 'Wallanlagen', district: D.Kiez, zone: Zone.Sued, mods: { gras: 0.6, pillen: 1.05, ket: 1.0 }, sting: 0.03, look: { skin: 0xe8b896, hair: 0x6a4a2a, top: 0x4a6a3a, bottom: 0x3a3a3a, shoes: 0x2a2a2a, accent: 0xc8a040 } },
  { id: 'hbf', name: 'Jojo', place: 'Hbf-Ost', district: D.Bahnhof, zone: Zone.Sued, mods: { gras: 0.95, pillen: 0.9, ket: 0.78, crystal: 0.8, koks: 0.86 }, sting: 0.06, look: { skin: 0xc08060, hair: 0x1a1a1a, top: 0x2a2a3a, bottom: 0x1a1a22, shoes: 0xe8e8e8, accent: 0xd83a3a } },
  { id: 'kiez', name: 'Schnecke', place: 'Kiez', district: D.Kiez, zone: Zone.Sued, mods: { gras: 1.3, pillen: 1.5, ket: 1.3, crystal: 1.05, koks: 1.42 }, sting: 0.05, look: { skin: 0xf2d0b6, hair: 0xe8d090, top: 0x8a2a5a, bottom: 0x1a1a1a, shoes: 0xe8e8e8, accent: 0xe8c040 } },
  { id: 'platte', name: 'Ronny', place: 'Betonhausen', district: D.Platte, zone: Zone.Sued, mods: { gras: 1.45, pillen: 1.2, ket: 1.1, crystal: 1.35 }, sting: 0.03, look: { skin: 0xf2d0b6, hair: 0x8a8a8a, top: 0x3a4a8a, bottom: 0x2a2a3a, shoes: 0xe8e8e8, accent: 0xe8e8e8 } },
  { id: 'hafen', name: 'Fiete', place: 'Freihafen', district: D.Hafen, zone: Zone.Hafen, mods: { koks: 0.55, gras: 1.1, crystal: 1.25 }, sting: 0.04, look: { skin: 0xe8b896, hair: 0x3a2a1e, top: 0x1e2a44, bottom: 0x2a2a2e, shoes: 0x1a1a1a, accent: 0xe8e8e8 } },
  { id: 'rost', name: 'Mandy', place: 'Rostwerk', district: D.Industrie, zone: Zone.Hafen, mods: { crystal: 0.55, pillen: 1.1, koks: 1.15 }, sting: 0.04, look: { skin: 0xf2d0b6, hair: 0xd85a2a, top: 0x1a1a1a, bottom: 0x2a2e3a, shoes: 0x1a1a1a, accent: 0xc8602a } },
  { id: 'uni', name: 'Jasper', place: 'Universität', district: D.Uni, zone: Zone.Nord, mods: { gras: 1.6, pillen: 1.7, ket: 1.6 }, sting: 0.05, look: { skin: 0xf2d0b6, hair: 0xc8a060, top: 0xe8e8e8, bottom: 0x4a5a7a, shoes: 0x8a6a4a, accent: 0x5a8ac8 } },
  { id: 'turm', name: 'Herr Kessler', place: 'Turmviertel', district: D.Turm, zone: Zone.Nord, mods: { koks: 1.9, ket: 1.4, pillen: 1.3 }, sting: 0.07, look: { skin: 0xe8b896, hair: 0x2a2a2a, top: 0x22262e, bottom: 0x22262e, shoes: 0x1a1a1a, accent: 0xe8e8e8 } },
];

export interface Tip {
  dealer: string;
  good: GoodId;
  /** price factor: > 1 = they pay a lot (sell there), < 1 = cheap (buy there) */
  factor: number;
  until: number;
  text: string;
}

const SPREAD = 0.82;

/** walkable, non-road tile near a point (searching outwards) */
function walkSpot(city: City, x: number, y: number, maxR: number): { x: number; y: number } | null {
  const tx0 = Math.floor(x / TILE);
  const ty0 = Math.floor(y / TILE);
  const R = Math.ceil(maxR / TILE);
  for (let r = 0; r <= R; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = tx0 + dx;
        const ty = ty0 + dy;
        if (!city.inBounds(tx, ty) || !city.isWalkableTile(tx, ty)) continue;
        if (city.flags[ty * MAP_W + tx] & F_ROAD) continue;
        return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
      }
    }
  }
  return null;
}

export class Dealing {
  /** what Kai carries */
  readonly carry: Record<GoodId, number> = { gras: 0, pillen: 0, ket: 0, crystal: 0, koks: 0 };
  capacity = 20;
  unlocked = false;
  tips: Tip[] = [];
  /** dealer positions (computed once from the city) */
  readonly spots = new Map<string, { x: number; y: number }>();
  /** supply/demand pressure per dealer+good (0 = normal) */
  private pressure = new Map<string, number>();
  private rng = new RNG(9191);
  tipT = 40;
  /** lifetime stats */
  profit = 0;
  deals = 0;

  constructor(city: City) {
    this.placeDealers(city);
  }

  private placeDealers(city: City): void {
    const rng = new RNG(5151);
    const poi = (id: string): { x: number; y: number } | null => {
      const p = city.pois.get(id);
      return p ? { x: p.x, y: p.y } : null;
    };
    const anchors: Record<string, { x: number; y: number } | null> = {
      wall: poi('wallpark'),
      hbf: (() => {
        const h = poi('hbf');
        return h ? { x: h.x + 70, y: h.y - 14 } : null;
      })(),
      kiez: (() => {
        const k = poi('knockout');
        return k ? { x: k.x + 64, y: k.y - 26 } : null;
      })(),
      platte: (() => {
        const s = poi('safehouse');
        return s ? { x: s.x - 70, y: s.y + 40 } : null;
      })(),
    };
    for (const d of DEALERS) {
      let a = anchors[d.id] ?? null;
      if (!a) {
        // other zones: a random spot of the district
        for (let i = 0; i < 4000 && !a; i++) {
          const tx = rng.int(4, MAP_W - 5);
          const ty = rng.int(4, MAP_W - 5);
          if (city.district[ty * MAP_W + tx] !== d.district) continue;
          if (!city.isWalkableTile(tx, ty)) continue;
          a = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
        }
      }
      if (!a) continue;
      const s = walkSpot(city, a.x, a.y, 40) ?? a;
      this.spots.set(d.id, s);
    }
  }

  get used(): number {
    let n = 0;
    for (const g of GOOD_IDS) n += this.carry[g];
    return n;
  }

  get free(): number {
    return Math.max(0, this.capacity - this.used);
  }

  private key(d: DealerDef, g: GoodId): string {
    return `${d.id}:${g}`;
  }

  /** deterministic daily drift per dealer+good */
  private drift(d: DealerDef, g: GoodId, day: number): number {
    let h = (day * 73856093) ^ (DEALERS.indexOf(d) * 19349663) ^ (GOOD_IDS.indexOf(g) * 83492791);
    h = (h ^ (h >>> 13)) * 1274126177;
    h ^= h >>> 16;
    return 0.86 + ((h >>> 0) % 1000) / 1000 * 0.28;
  }

  trades(d: DealerDef, g: GoodId): boolean {
    return d.mods[g] !== undefined;
  }

  /** the dealer's price for one unit (what Kai pays) */
  buyPrice(d: DealerDef, g: GoodId, day: number, now: number): number {
    const mod = d.mods[g];
    if (mod === undefined) return 0;
    const p = this.pressure.get(this.key(d, g)) ?? 0;
    let f = GOODS[g].base * mod * this.drift(d, g, day) * Math.max(0.55, Math.min(1.7, 1 + p));
    for (const t of this.tips) if (t.dealer === d.id && t.good === g && t.until > now) f *= t.factor;
    return Math.max(1, Math.round(f));
  }

  /** what the dealer pays Kai for one unit */
  sellPrice(d: DealerDef, g: GoodId, day: number, now: number): number {
    return Math.max(1, Math.floor(this.buyPrice(d, g, day, now) * SPREAD));
  }

  /** buy up to n units; returns units bought and money spent */
  buy(d: DealerDef, g: GoodId, n: number, money: number, day: number, now: number): { n: number; cost: number } {
    let bought = 0;
    let cost = 0;
    for (let i = 0; i < n; i++) {
      const p = this.buyPrice(d, g, day, now);
      if (this.free <= 0 || money - cost < p) break;
      cost += p;
      bought++;
      this.carry[g]++;
      this.push(d, g, 0.025);
    }
    if (bought) this.deals++;
    this.profit -= cost;
    return { n: bought, cost };
  }

  sell(d: DealerDef, g: GoodId, n: number, day: number, now: number): { n: number; cash: number } {
    let sold = 0;
    let cash = 0;
    for (let i = 0; i < n && this.carry[g] > 0; i++) {
      cash += this.sellPrice(d, g, day, now);
      sold++;
      this.carry[g]--;
      this.push(d, g, -0.03);
    }
    if (sold) this.deals++;
    this.profit += cash;
    return { n: sold, cash };
  }

  private push(d: DealerDef, g: GoodId, amount: number): void {
    const k = this.key(d, g);
    this.pressure.set(k, Math.max(-0.45, Math.min(0.7, (this.pressure.get(k) ?? 0) + amount)));
  }

  /** time passes: prices recover, tips run out */
  step(dt: number, now: number): void {
    const k = Math.exp(-dt / 300);
    for (const [key, p] of this.pressure) {
      const np = p * k;
      if (Math.abs(np) < 0.002) this.pressure.delete(key);
      else this.pressure.set(key, np);
    }
    this.tips = this.tips.filter((t) => t.until > now);
  }

  /** a new tip from one of the available dealers (null if none fits) */
  makeTip(now: number, open: (d: DealerDef) => boolean): Tip | null {
    const ds = DEALERS.filter(open);
    if (!ds.length) return null;
    const rng = this.rng;
    for (let i = 0; i < 10; i++) {
      const d = rng.pick(ds);
      const goods = GOOD_IDS.filter((g) => d.mods[g] !== undefined && !this.tips.some((t) => t.dealer === d.id && t.good === g));
      if (!goods.length) continue;
      const g = rng.pick(goods);
      const demand = rng.chance(0.55);
      const name = GOODS[g].name;
      const lines = demand
        ? [`${d.place}: Die Kundschaft reißt mir ${name} aus der Hand. Ich zahl das Doppelte!`, `${d.place}: ${name} ist alle. Bring mir was, ich zahl gut.`, `Großes Fest bei ${d.place}. ${name} gesucht, Preis egal.`]
        : [`${d.place}: Hab zu viel ${name}. Fast geschenkt, solang's reicht.`, `${d.place}: ${name} muss weg. Halber Preis!`, `${d.place}: Lieferung zu groß. ${name} spottbillig.`];
      const t: Tip = { dealer: d.id, good: g, factor: demand ? rng.range(1.7, 2.1) : rng.range(0.45, 0.6), until: now + rng.range(160, 260), text: `${d.name}: ${rng.pick(lines)}` };
      this.tips.push(t);
      return t;
    }
    return null;
  }

  /** busted / wasted: the goods are gone */
  confiscate(): number {
    const n = this.used;
    for (const g of GOOD_IDS) this.carry[g] = 0;
    return n;
  }

  toJSON(): { carry: Record<GoodId, number>; capacity: number; unlocked: boolean; profit: number; deals: number } {
    return { carry: { ...this.carry }, capacity: this.capacity, unlocked: this.unlocked, profit: Math.round(this.profit), deals: this.deals };
  }

  load(o: Partial<ReturnType<Dealing['toJSON']>> | undefined): void {
    if (!o) return;
    for (const g of GOOD_IDS) this.carry[g] = Math.max(0, Math.floor(o.carry?.[g] ?? 0));
    this.capacity = o.capacity ?? 20;
    this.unlocked = !!o.unlocked;
    this.profit = o.profit ?? 0;
    this.deals = o.deals ?? 0;
  }
}

export function dealerById(id: string): DealerDef | undefined {
  return DEALERS.find((d) => d.id === id);
}
