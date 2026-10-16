// Player controller: walking, sprinting, punching, entering / leaving / jacking vehicles.
import { Character, WALK_SPEED, RUN_SPEED, SPRINT_SPEED } from './character';
import type { Vehicle } from './vehicle';
import type { InputState } from './input';
import { clamp } from '../core/math';
import { headingSteer, SmartHandbrake } from './autosteer';

export interface PlayerHost {
  vehicles: Vehicle[];
  findCharacterNear(x: number, y: number, r: number, exclude: Character): Character | null;
  isFreeSpot(x: number, y: number, r: number, ignore?: Vehicle | null): boolean;
  onEnterVehicle(v: Vehicle, jacked: Character | null): void;
  onExitVehicle(v: Vehicle, bailed: boolean): void;
  /** attack with the current weapon on foot; aimDir = intended direction (rad) */
  attack(c: Character, pressed: boolean, aimDir: number): void;
  /** shoot out of the car window */
  driveBy(c: Character, v: Vehicle): void;
  hint(text: string, secs?: number): void;
}

export class PlayerController {
  vehicle: Vehicle | null = null;
  private enterTarget: Vehicle | null = null;
  private enterSide = 1;
  private enterT = 0;
  private exitCooldown = 0;
  private smartHb = new SmartHandbrake();

  constructor(
    readonly char: Character,
    private host: PlayerHost,
  ) {
    char.role = 'player';
  }

  get inVehicle(): boolean {
    return this.vehicle !== null;
  }

  get x(): number {
    return this.vehicle ? this.vehicle.x : this.char.x;
  }
  get y(): number {
    return this.vehicle ? this.vehicle.y : this.char.y;
  }

  update(dt: number, inp: InputState): void {
    if (this.exitCooldown > 0) this.exitCooldown -= dt;
    const c = this.char;
    if (c.dead) {
      if (this.vehicle) this.clearVehicleControls(this.vehicle);
      return;
    }
    if (this.vehicle) {
      this.drive(dt, inp, this.vehicle);
      return;
    }
    if (c.isDown) return;

    // ---- entering a vehicle ----
    if (this.enterTarget) {
      const v = this.enterTarget;
      const door = this.doorPoint(v, this.enterSide);
      const dx = door.x - c.x;
      const dy = door.y - c.y;
      const d = Math.hypot(dx, dy);
      this.enterT += dt;
      const moved = Math.hypot(inp.moveX, inp.moveY) > 0.5;
      if (v.dead || this.enterT > 2.5 || moved || Math.hypot(v.x - c.x, v.y - c.y) > 9) {
        this.enterTarget = null;
        c.state = 'idle';
      } else if (d < 1.1 || (this.enterT > 0.5 && this.distToBox(v) < 0.9)) {
        this.getIn(v);
        return;
      } else {
        const sp = Math.min(RUN_SPEED, d * 4);
        c.setMove((dx / d) * sp, (dy / d) * sp);
        c.state = 'entering';
        return;
      }
    }

    // ---- walking ----
    const mag = Math.min(1, Math.hypot(inp.moveX, inp.moveY));
    let speed = 0;
    if (mag > 0.05) {
      if (inp.sprint) speed = SPRINT_SPEED;
      else if (inp.touch) speed = mag < 0.55 ? WALK_SPEED : RUN_SPEED;
      else speed = RUN_SPEED;
    }
    if (mag > 0.05) c.setMove((inp.moveX / mag) * speed, (inp.moveY / mag) * speed);
    else c.setMove(0, 0);

    if (inp.weaponNext) c.arsenal?.cycle(1);
    if (inp.weaponPrev) c.arsenal?.cycle(-1);
    if (inp.fire || inp.firePressed) {
      const aimDir = mag > 0.3 ? Math.atan2(inp.moveY, inp.moveX) : c.heading;
      this.host.attack(c, inp.firePressed, aimDir);
    }

    if (inp.enterPressed && this.exitCooldown <= 0) {
      const v = this.nearestVehicle(7);
      if (v) {
        this.enterTarget = v;
        this.enterT = 0;
        const dl = this.doorPoint(v, 1);
        const dr = this.doorPoint(v, -1);
        this.enterSide = Math.hypot(dl.x - c.x, dl.y - c.y) <= Math.hypot(dr.x - c.x, dr.y - c.y) + 0.8 ? 1 : -1;
      } else this.host.hint('Kein Fahrzeug in der Nähe', 1.2);
    }
  }

  private nearestVehicle(r: number): Vehicle | null {
    let best: Vehicle | null = null;
    let bd = r;
    for (const v of this.host.vehicles) {
      if (v.dead || v.burning > 0) continue;
      const door = this.doorPoint(v, 1);
      const d = Math.min(Math.hypot(v.x - this.char.x, v.y - this.char.y) - v.def.width * 0.5, Math.hypot(door.x - this.char.x, door.y - this.char.y));
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  /** distance from the player to the vehicle's footprint rectangle */
  private distToBox(v: Vehicle): number {
    const dx = this.char.x - v.x;
    const dy = this.char.y - v.y;
    const c = Math.cos(v.angle);
    const s = Math.sin(v.angle);
    const lx = Math.abs(dx * c + dy * s) - v.def.length / 2;
    const ly = Math.abs(-dx * s + dy * c) - v.def.width / 2;
    return Math.hypot(Math.max(0, lx), Math.max(0, ly));
  }

  /** door point: side 1 = driver side (left, +y local), -1 = passenger side */
  doorPoint(v: Vehicle, side: number): { x: number; y: number } {
    const lx = v.def.model.body === 'bus' ? v.def.length * 0.42 : v.def.length * 0.08;
    return v.localToWorld(lx, side * (v.def.width / 2 + 0.55));
  }

  /** sit down in a vehicle immediately (cutscenes / mission starts) */
  seat(v: Vehicle): void {
    this.enterTarget = null;
    this.getIn(v);
  }

  private getIn(v: Vehicle): void {
    const c = this.char;
    this.enterTarget = null;
    let jacked: Character | null = null;
    if (v.driver && v.driver !== c) {
      jacked = v.driver as Character;
      const door = this.doorPoint(v, 1);
      jacked.showAt(door.x, door.y, v.angle + Math.PI / 2);
      jacked.vehicle = null;
      jacked.knockDown(Math.cos(v.angle + Math.PI / 2) * 3, Math.sin(v.angle + Math.PI / 2) * 3, 1.1);
    }
    v.driver = c;
    v.ai = null;
    v.assisted = true;
    v.parked = false;
    c.vehicle = v;
    c.hide();
    c.state = 'driving';
    this.vehicle = v;
    this.host.onEnterVehicle(v, jacked);
  }

  private clearVehicleControls(v: Vehicle): void {
    v.throttle = 0;
    v.brake = 0;
    v.steerIn = 0;
    v.handbrake = false;
    v.horn = false;
  }

  private drive(dt: number, inp: InputState, v: Vehicle): void {
    if (inp.steerHeading !== null) {
      // "Richtung": steer towards where the stick points; with BREMSE held near standstill the
      // stick means "back up in this direction"
      const reverse = v.forwardSpeed < -0.8 || (inp.brake > 0.5 && inp.throttle < 0.1 && v.forwardSpeed < 0.6);
      v.steerIn = headingSteer(v, inp.steerHeading, reverse);
    } else v.steerIn = clamp(-inp.steer, -1, 1); // input right = negative yaw (clockwise)
    v.throttle = inp.throttle;
    v.brake = inp.brake;
    v.handbrake = inp.steerHeading !== null ? this.smartHb.apply(v, inp.steerHeading, inp.handbrake) : inp.handbrake;
    v.horn = inp.horn;
    if (inp.weaponNext) this.char.arsenal?.cycle(1);
    if (inp.weaponPrev) this.char.arsenal?.cycle(-1);
    if (inp.fire) this.host.driveBy(this.char, v);
    if (inp.enterPressed) this.exit(v);
    void dt;
  }

  exit(v: Vehicle, force = false): void {
    const c = this.char;
    const speed = v.speed;
    let pos: { x: number; y: number } | null = null;
    const hw = v.def.width / 2;
    const hl = v.def.length / 2;
    const cands = [this.doorPoint(v, 1), this.doorPoint(v, -1), v.localToWorld(0, hw + 1.3), v.localToWorld(0, -hw - 1.3), v.localToWorld(-hl - 0.9, 0), v.localToWorld(hl + 0.9, 0), v.localToWorld(-hl * 0.6, hw + 0.8), v.localToWorld(-hl * 0.6, -hw - 0.8)];
    for (const p of cands) {
      if (this.host.isFreeSpot(p.x, p.y, 0.3, v)) {
        pos = p;
        break;
      }
    }
    if (!pos) {
      // squeeze out anyway: the physics engine pushes Kai clear of whatever is in the way
      pos = cands[0];
      void force;
    }
    this.clearVehicleControls(v);
    v.driver = null;
    v.assisted = false;
    this.vehicle = null;
    c.vehicle = null;
    c.showAt(pos.x, pos.y, v.angle);
    const bailed = speed > 9;
    if (bailed) {
      const vel = v.body.getLinearVelocity();
      c.knockDown(vel.x * 0.7, vel.y * 0.7, 1.0);
      c.damage(Math.min(35, (speed - 9) * 2.2));
    }
    this.exitCooldown = 0.4;
    this.host.onExitVehicle(v, bailed);
  }
}
