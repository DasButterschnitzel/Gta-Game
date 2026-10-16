// Gang members hanging around in their turf. They go for Kai when his respect with the gang is
// low (or when he hurts one of them), leave him alone when it is high, and – once the Kiez war
// has started – attack the rival gang on sight. Raiding parties of the rival show up in the turf.
import type { Game } from './game';
import type { Character } from './character';
import type { NpcAI } from './npc';
import { GANGS, GANG_LIST, type GangDef } from './gangs';
import { RNG } from '../core/rng';
import { MAP_W, TILE, Zone, F_ROAD } from '../world/types';

interface Member {
  c: Character;
  gang: GangDef;
  group: number;
}

export class GangStreet {
  readonly members: Member[] = [];
  private rng = new RNG(31337);
  private spawnT = 5;
  private thinkT = 0;
  private groupId = 1;
  enabled = true;

  constructor(private g: Game) {}

  /** the gang that owns the district at (x, y) */
  turf(x: number, y: number): GangDef | null {
    const d = this.g.city.districtAt(x, y);
    return GANG_LIST.find((gd) => gd.districts.includes(d)) ?? null;
  }

  private get war(): boolean {
    return this.g.flags.has('gangwar');
  }

  private atWar(a: GangDef, b: GangDef): boolean {
    return this.war && a.rival === b.id && (a.id === 'kiez' || a.id === 'neon');
  }

  manage(dt: number): void {
    const g = this.g;
    const px = g.player.x;
    const py = g.player.y;
    for (let i = this.members.length - 1; i >= 0; i--) {
      const m = this.members[i];
      const gone = !g.chars.includes(m.c);
      const far = Math.hypot(m.c.x - px, m.c.y - py) > 160 && !g.isVisible(m.c.x, m.c.y, 6);
      if (gone || far) {
        if (!gone) g.removeChar(m.c);
        this.members.splice(i, 1);
      }
    }
    if (!this.enabled || !g.done.has('freigang')) return;
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 3.5;
      const groups = new Set(this.members.filter((m) => !m.c.dead).map((m) => m.group));
      if (groups.size < (this.war ? 3 : 2) && !g.missions.running) this.spawnGroup(px, py);
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.4;
      this.think();
    }
  }

  private spawnGroup(px: number, py: number): void {
    const g = this.g;
    const city = g.city;
    const rng = this.rng;
    // during the war, raiders go after a home crew that is already standing around
    let raid: Member | null = null;
    if (this.war && rng.chance(0.6)) {
      const homes = this.members.filter((m) => !m.c.dead && (m.gang.id === 'kiez' || m.gang.id === 'neon') && this.turf(m.c.x, m.c.y) === m.gang);
      if (homes.length) raid = rng.pick(homes);
    }
    for (let attempt = 0; attempt < 40; attempt++) {
      const a = rng.range(0, Math.PI * 2);
      const r = raid ? rng.range(26, 42) : rng.range(55, 125);
      const ox = raid ? raid.c.x : px;
      const oy = raid ? raid.c.y : py;
      const x = ox + Math.cos(a) * r;
      const y = oy + Math.sin(a) * r;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (!city.inBounds(tx, ty) || !city.isWalkableTile(tx, ty)) continue;
      if (city.flags[ty * MAP_W + tx] & F_ROAD) continue;
      const zone = city.zoneAt(x, y);
      if (zone !== Zone.Sued && g.physics.isZoneLocked(zone)) continue;
      if (g.isVisible(x, y, 6)) continue;
      // nobody hangs around right in front of Kai's place
      const safe = g.safehousePoint();
      if (safe && Math.hypot(x - safe.x, y - safe.y) < 70) continue;
      const home = this.turf(x, y);
      if (!home) continue;
      // during the war the rival sends raiding parties
      const gang = raid ? GANGS[raid.gang.rival] : this.atWar(home, GANGS[home.rival]) && rng.chance(0.3) ? GANGS[home.rival] : home;
      const n = rng.int(2, 3);
      const group = this.groupId++;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
        const cx = x + Math.cos(ang) * 1.3;
        const cy = y + Math.sin(ang) * 1.3;
        const c = g.spawnChar(cx, cy, gang.look(rng), 'gang');
        c.heading = ang + Math.PI;
        const weapon = rng.chance(0.3) ? null : rng.pick(gang.weapons);
        // raiders walk over to the crew they are after
        const gx = raid ? raid.c.x + rng.range(-3, 3) : cx;
        const gy = raid ? raid.c.y + rng.range(-3, 3) : cy;
        g.npcs.add(c, { mode: 'guard', target: null, weapon, accuracy: 0.32, aggro: 0, fleeAt: 0.22, gang: gang.index, health: 80, gx, gy });
        this.members.push({ c, gang, group });
      }
      return;
    }
  }

  private think(): void {
    const g = this.g;
    const pl = g.player.char;
    const plx = g.player.x;
    const ply = g.player.y;
    for (const m of this.members) {
      const c = m.c;
      if (c.dead || c.isDown || c.hidden) continue;
      const ai = c.ai as NpcAI | null;
      if (!ai || ai.kind !== 'npc' || ai.mode === 'flee') continue;
      // the current fight is over
      if (ai.mode === 'attack' && (!ai.target || ai.target.dead || !g.chars.includes(ai.target))) {
        ai.mode = 'guard';
        ai.target = null;
        c.hostile = false;
      }
      const dPl = Math.hypot(plx - c.x, ply - c.y);
      const respect = g.respect.get(m.gang.id);
      const hurt = c.lastAttacker === pl;
      const hates = g.respect.hostile(m.gang.id) && dPl < 14 && !pl.dead && g.combat.los(c.x, c.y, plx, ply);
      if ((hurt || hates) && !(ai.mode === 'attack' && ai.target === pl)) {
        // the whole group joins in
        for (const o of this.members) {
          if (o.group !== m.group || o.c.dead) continue;
          const oai = o.c.ai as NpcAI | null;
          if (!oai || oai.mode === 'flee') continue;
          oai.mode = 'attack';
          oai.target = pl;
          o.c.hostile = true;
        }
        if (hates && !hurt && respect < -25 && this.rng.chance(0.4)) g.hud.hint(`${m.gang.name}: „Du hast hier nichts verloren, Falke!"`, 2);
        continue;
      }
      if (ai.mode === 'attack') continue;
      // gang war: go for rivals in sight
      if (this.war) {
        let best: Character | null = null;
        let bd = 24;
        for (const o of this.members) {
          if (o.c.dead || o.c.isDown || !this.atWar(m.gang, o.gang)) continue;
          const d = Math.hypot(o.c.x - c.x, o.c.y - c.y);
          if (d < bd && g.combat.los(c.x, c.y, o.c.x, o.c.y)) {
            bd = d;
            best = o.c;
          }
        }
        if (best) {
          ai.mode = 'attack';
          ai.target = best;
          c.hostile = true;
        }
      }
    }
  }

  /** Kai killed a gang member: that gang likes him less, its rival a little more */
  onKilled(c: Character): void {
    // only street members count; missions settle respect themselves
    const m = this.members.find((o) => o.c === c);
    if (!m) return;
    this.g.respect.add(m.gang.id, -3, false);
    this.g.respect.add(m.gang.rival, 1, false);
  }

  clear(): void {
    for (const m of this.members) this.g.removeChar(m.c);
    this.members.length = 0;
  }
}
