// Dealers and Kalle's arms shop in the world: characters at their spots, rings and radar blips,
// tips on the phone, the trade panels and police stings.
import type { Game } from './game';
import type { Character } from './character';
import type { Marker } from '../render/markers';
import type { Blip } from '../ui/hud';
import type { ShopModel, ShopRow } from '../ui/shop';
import { Dealing, DEALERS, GOODS, GOOD_IDS, type DealerDef, type GoodId } from './dealing';
import { WEAPONS, type WeaponId } from './weapons';
import { RNG } from '../core/rng';
import { D, Zone } from '../world/types';
import { sidewalkNear } from '../missions/places';

const KALLE_LOOK = { skin: 0xe8b896, hair: 0x8a8a8a, top: 0x5a6a3a, bottom: 0x3a3a2a, shoes: 0x3a2a1e, accent: 0xd8d0c0 };

interface ShopItem {
  id: string;
  name: string;
  note: string;
  price: number;
  color: string;
  /** shown at all */
  avail(): boolean;
  /** can buy right now (besides money) */
  can(): string | null;
  give(): void;
}

export class TradeManager {
  readonly dealing: Dealing;
  readonly kalleSpot: { x: number; y: number } | null;
  /** missions can open the dealers before dealing is unlocked (the tutorial) */
  allowInMission = false;
  private chars = new Map<string, Character>();
  private inside: string | null = null;
  private stingRolled = false;
  private sting: DealerDef | null = null;
  private rng = new RNG(1234);
  private busy = false;
  /** dealers that were killed / turned out to be cops stay away for a while (game time) */
  private closed = new Map<string, number>();

  constructor(private g: Game) {
    this.dealing = new Dealing(g.city);
    const safe = g.city.pois.get('safehouse');
    this.kalleSpot = safe ? sidewalkNear(g.city, safe.x, safe.y, 110, 170, new RNG(777), D.Platte) : null;
  }

  private zoneOpen(z: Zone): boolean {
    return z === Zone.Sued || !this.g.physics.isZoneLocked(z);
  }

  dealerOpen(d: DealerDef): boolean {
    return (this.dealing.unlocked || this.allowInMission) && this.zoneOpen(d.zone);
  }

  get kalleOpen(): boolean {
    return this.g.done.has('herbie') && this.kalleSpot !== null;
  }

  dealerSpot(id: string): { x: number; y: number } | null {
    return this.dealing.spots.get(id) ?? null;
  }

  /** once per frame */
  frame(dt: number): void {
    const g = this.g;
    const now = g.time;
    this.dealing.step(dt, now);
    const pl = g.player;
    // characters near the player
    const want = new Map<string, { x: number; y: number; look: typeof KALLE_LOOK }>();
    for (const d of DEALERS) {
      const s = this.dealing.spots.get(d.id);
      if (s && this.isOpen(d.id) && this.dealerOpen(d)) want.set(d.id, { ...s, look: d.look });
    }
    if (this.kalleOpen && this.kalleSpot && this.isOpen('kalle')) want.set('kalle', { ...this.kalleSpot, look: KALLE_LOOK });
    for (const [id, c] of this.chars) {
      if (c.dead || !g.chars.includes(c)) {
        // killed: the spot stays empty for a few minutes (the body is left to the clean-up)
        this.closed.set(id, now + 240);
        this.chars.delete(id);
        continue;
      }
      const far = Math.hypot(c.x - pl.x, c.y - pl.y) > 170;
      if ((!want.has(id) || far) && !g.isVisible(c.x, c.y, 4)) {
        g.removeChar(c);
        this.chars.delete(id);
      }
    }
    for (const [id, w] of want) {
      if (this.chars.has(id)) continue;
      if (Math.hypot(w.x - pl.x, w.y - pl.y) > 120) continue;
      const c = g.spawnChar(w.x, w.y, w.look, 'story');
      c.heading = -Math.PI / 2;
      this.chars.set(id, c);
    }
    // stepping into a ring opens the trade panel
    let here: string | null = null;
    if (!pl.vehicle && !pl.char.dead && !g.isBusted) {
      for (const [id, w] of want) {
        if (Math.hypot(w.x - pl.x, w.y - pl.y) < 1.7) {
          here = id;
          break;
        }
      }
    }
    if (here && here !== this.inside && !this.busy) {
      const c = this.chars.get(here);
      if (c && (c.dead || c.isDown || (c.ai as { mode?: string } | null)?.mode === 'flee')) {
        g.hud.hint('Mit dir macht hier heute keiner mehr Geschäfte.', 2.5);
      } else if (g.wanted.level > 0) {
        g.hud.hint('Nicht mit den Bullen im Nacken!', 2);
      } else if (g.missions.running && !this.allowInMission) {
        g.hud.hint('Erst den Auftrag erledigen.', 2);
      } else if (here === 'kalle') void this.openKalle();
      else {
        const d = DEALERS.find((o) => o.id === here);
        if (d) void this.openDealer(d);
      }
    }
    this.inside = here;
    // tips on the phone
    if (this.dealing.unlocked && !g.missions.running) {
      this.dealing.tipT -= dt;
      if (this.dealing.tipT <= 0) {
        this.dealing.tipT = this.rng.range(95, 150);
        const t = this.dealing.makeTip(now, (d) => this.dealerOpen(d));
        if (t) {
          const d = DEALERS.find((o) => o.id === t.dealer)!;
          g.hud.phone(`${d.name} (${d.place})`, t.text.replace(`${d.name}: `, ''), 8);
          g.sound.play('sms', undefined, undefined, 0.7);
        }
      }
    }
    // carried goods
    const used = this.dealing.used;
    g.hud.bag(used > 0 ? `🎒 ${used}/${this.dealing.capacity}` : '');
  }

  private isOpen(id: string): boolean {
    const until = this.closed.get(id);
    if (until === undefined) return true;
    if (this.g.time >= until) {
      this.closed.delete(id);
      return true;
    }
    return false;
  }

  markers(out: Marker[]): void {
    for (const d of DEALERS) {
      if (!this.dealerOpen(d) || !this.isOpen(d.id)) continue;
      const s = this.dealing.spots.get(d.id);
      if (s) out.push({ x: s.x, y: s.y, r: 1.3, color: 'green', kind: 'ring' });
    }
    if (this.kalleOpen && this.kalleSpot && this.isOpen('kalle')) out.push({ x: this.kalleSpot.x, y: this.kalleSpot.y, r: 1.3, color: 'purple', kind: 'ring' });
  }

  blips(out: Blip[]): void {
    for (const d of DEALERS) {
      if (!this.dealerOpen(d) || !this.isOpen(d.id)) continue;
      const s = this.dealing.spots.get(d.id);
      const hot = this.dealing.tips.some((t) => t.dealer === d.id);
      if (s) out.push({ x: s.x, y: s.y, color: hot ? '#f6e27a' : '#5aff6a', size: 4.5, shape: 'letter', label: '€', near: !hot });
    }
    if (this.kalleOpen && this.kalleSpot) out.push({ x: this.kalleSpot.x, y: this.kalleSpot.y, color: '#d87aff', size: 4.5, shape: 'letter', label: 'K', near: true });
  }

  // ------------------------------------------------------------------------------------
  // dealer panel
  async openDealer(d: DealerDef): Promise<void> {
    const g = this.g;
    const dl = this.dealing;
    this.busy = true;
    this.stingRolled = false;
    this.sting = null;
    const day = (): number => Math.floor(g.dayCount);
    const fmt = (n: number): string => `${n.toLocaleString('de-DE')} €`;
    const model: ShopModel = {
      title: d.name,
      subtitle: `${d.place} · Kaufen links, Verkaufen rechts`,
      face: null,
      hint: dl.used === 0 ? 'Billig kaufen, woanders teuer verkaufen. Tipps kommen aufs Handy.' : '',
      status: () => `${fmt(Math.round(g.money))}\nTasche ${dl.used}/${dl.capacity}`,
      rows: () =>
        GOOD_IDS.map((gid): ShopRow => {
          const tip = dl.tips.find((t) => t.dealer === d.id && t.good === gid && t.until > g.time);
          const trades = dl.trades(d, gid);
          const bp = trades ? dl.buyPrice(d, gid, day(), g.time) : 0;
          const sp = trades ? dl.sellPrice(d, gid, day(), g.time) : 0;
          return {
            id: gid,
            name: GOODS[gid].name,
            color: GOODS[gid].color,
            note: tip ? (tip.factor > 1 ? 'TIPP: zahlt gerade sehr gut' : 'TIPP: gerade spottbillig') : trades ? '' : 'führt er nicht',
            hot: !!tip,
            buy: trades ? { price: bp, ok: dl.free > 0 && g.money >= bp } : undefined,
            sell: trades ? { price: sp, ok: dl.carry[gid] > 0 } : undefined,
            have: String(dl.carry[gid]),
          };
        }),
      act: (id, act, n) => {
        const gid = id as GoodId;
        const amount = n < 0 ? 999 : n;
        if (act === 'buy') {
          if (dl.free <= 0) return '!Deine Tasche ist voll.';
          const r = dl.buy(d, gid, amount, Math.floor(g.money), day(), g.time);
          if (!r.n) return '!Zu wenig Geld.';
          g.money -= r.cost;
          g.sound.play('click', undefined, undefined, 0.6);
          this.rollSting(d);
          return `${r.n}× ${GOODS[gid].name} für ${fmt(r.cost)} gekauft.`;
        }
        const r = dl.sell(d, gid, amount, day(), g.time);
        if (!r.n) return '!Davon hast du nichts.';
        g.money += r.cash;
        g.sound.play('money', undefined, undefined, 0.6);
        this.rollSting(d);
        return `${r.n}× ${GOODS[gid].name} für ${fmt(r.cash)} verkauft.`;
      },
    };
    await g.openShop(model);
    this.busy = false;
    if (this.sting) this.springSting(this.sting);
  }

  private rollSting(d: DealerDef): void {
    if (this.stingRolled) return;
    this.stingRolled = true;
    // the tutorial is safe
    if (!this.dealing.unlocked) return;
    if (this.rng.chance(d.sting)) this.sting = d;
  }

  /** the dealer was a plain-clothes cop */
  private springSting(d: DealerDef): void {
    const g = this.g;
    const c = this.chars.get(d.id);
    g.hud.center('ZIVILFAHNDER!', 2.2, '#6aa0ff');
    g.hud.hint(`${d.name} war ein Bulle. Weg hier – oder die Ware ist futsch!`, 3.5);
    g.sound.play('static', undefined, undefined, 0.6);
    const x = c?.x ?? g.player.x;
    const y = c?.y ?? g.player.y;
    g.wanted.atLeast(2, x, y);
    if (c) {
      // the "dealer" calls it in and backs off
      g.npcs.add(c, { mode: 'flee', target: g.player.char });
      this.chars.delete(d.id);
    }
    this.closed.set(d.id, g.time + 300);
  }

  // ------------------------------------------------------------------------------------
  // Kalle's Kleinkaliber
  private items(): ShopItem[] {
    const g = this.g;
    const ars = (): import('./weapons').Arsenal => g.player.char.arsenal!;
    const done = (id: string): boolean => g.done.has(id);
    const gun = (id: WeaponId, ammo: number, note: string, price: number, unlock: () => boolean, color: string): ShopItem => ({
      id,
      name: WEAPONS[id].name,
      note,
      price,
      color,
      avail: unlock,
      can: () => (ars().has(id) && WEAPONS[id].kind === 'melee' ? 'Hast du schon.' : ars().ammoOf(id) >= WEAPONS[id].maxAmmo ? 'Mehr passt nicht.' : null),
      give: () => {
        ars().give(id, ammo, true);
      },
    });
    const ammo = (id: WeaponId, n: number, price: number, color: string): ShopItem => ({
      id: `ammo_${id}`,
      name: `Munition ${WEAPONS[id].name}`,
      note: `+${n}`,
      price,
      color,
      avail: () => ars().has(id),
      can: () => (ars().ammoOf(id) >= WEAPONS[id].maxAmmo ? 'Mehr passt nicht.' : null),
      give: () => {
        ars().give(id, n, false);
      },
    });
    return [
      gun('bat', 1, 'Für Gespräche unter vier Augen', 150, () => true, '#c8a070'),
      gun('pistol', 36, '+36 Schuss', 600, () => !ars().has('pistol'), '#b8bcc2'),
      ammo('pistol', 36, 90, '#b8bcc2'),
      gun('smg', 90, '+90 Schuss · Drive-by-tauglich', 1800, () => done('turbine') && !ars().has('smg'), '#8a9ab8'),
      ammo('smg', 90, 180, '#8a9ab8'),
      gun('shotgun', 12, '+12 Patronen', 1400, () => done('rotlicht') && !ars().has('shotgun'), '#a87a4a'),
      ammo('shotgun', 12, 120, '#a87a4a'),
      gun('molotov', 3, '3 Flaschen', 250, () => true, '#ff8a3a'),
      gun('grenade', 3, '3 Stück', 600, () => done('kiezkrieg'), '#6a8a4a'),
      {
        id: 'vest',
        name: 'Schutzweste',
        note: 'Panzerung 100',
        price: 350,
        color: '#5a6a8a',
        avail: () => true,
        can: () => (g.player.char.armor >= 100 ? 'Sitzt schon.' : null),
        give: () => {
          g.player.char.armor = 100;
        },
      },
      {
        id: 'bag40',
        name: 'Sporttasche',
        note: '40 Plätze für Ware',
        price: 1200,
        color: '#3a6ab8',
        avail: () => this.dealing.unlocked && this.dealing.capacity < 40,
        can: () => null,
        give: () => {
          this.dealing.capacity = 40;
        },
      },
      {
        id: 'bag60',
        name: 'Seesack',
        note: '60 Plätze für Ware',
        price: 3500,
        color: '#3a4a6a',
        avail: () => this.dealing.unlocked && this.dealing.capacity >= 40 && this.dealing.capacity < 60 && done('schwester'),
        can: () => null,
        give: () => {
          this.dealing.capacity = 60;
        },
      },
    ];
  }

  async openKalle(): Promise<void> {
    const g = this.g;
    this.busy = true;
    const fmt = (n: number): string => `${n.toLocaleString('de-DE')} €`;
    const first = !g.flags.has('kalle_met');
    g.flags.add('kalle_met');
    const model: ShopModel = {
      title: "Kalle's Kleinkaliber",
      subtitle: 'Gartenlaube 17 · Barzahlung, keine Fragen',
      face: 'kalle',
      hint: first ? 'Kalle: „Herbie hat dich angekündigt. Hier gibt\'s alles, was nicht im Baumarkt liegt."' : '',
      status: () => fmt(Math.round(g.money)),
      rows: () =>
        this.items()
          .filter((i) => i.avail())
          .map((i): ShopRow => ({ id: i.id, name: i.name, note: i.note, color: i.color, buy: { price: i.price, ok: g.money >= i.price && i.can() === null, amounts: [1] } })),
      act: (id) => {
        const it = this.items().find((i) => i.id === id);
        if (!it || !it.avail()) return null;
        const why = it.can();
        if (why) return `!${why}`;
        if (g.money < it.price) return '!Zu wenig Geld.';
        g.money -= it.price;
        it.give();
        g.sound.play('pickup', undefined, undefined, 0.7);
        return `${it.name} gekauft.`;
      },
    };
    await g.openShop(model);
    this.busy = false;
  }

  /** busted / wasted */
  lose(reason: 'busted' | 'wasted'): void {
    const n = this.dealing.confiscate();
    if (n > 0) this.g.hud.hint(reason === 'busted' ? `Die Polizei hat deine Ware kassiert (${n}).` : `Deine Ware ist weg (${n}).`, 3.5);
  }

  /** forget the characters (new game / respawn) */
  reset(): void {
    for (const c of this.chars.values()) this.g.removeChar(c);
    this.chars.clear();
    this.inside = null;
  }
}
