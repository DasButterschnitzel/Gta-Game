// Game orchestrator: owns the world, runs the fixed-step simulation and renders.
import * as THREE from 'three';
import { Renderer } from '../render/renderer';
import { CityRenderer } from '../render/cityRenderer';
import { CharacterRenderer, type CharDraw } from '../render/charSprites';
import { BlobShadows } from '../render/shadows';
import { VehicleView } from '../render/vehicleView';
import { GU, SHADOW_DIR } from '../render/globals';
import { generateCity } from '../world/citygen';
import type { City } from '../world/city';
import { DISTRICT_NAMES, TILE, Zone } from '../world/types';
import { Physics, type Impact } from '../physics/physics';
import { Vehicle } from './vehicle';
import { VEHICLES } from './vehicleDefs';
import { Character, LOOKS, randomLook, type Role } from './character';
import type { CharLook } from '../render/charSprites';
import { PlayerController, type PlayerHost } from './player';
import { Input, emptyInput, type InputState } from './input';
import { CameraRig } from './camera';
import { TrafficSystem } from './traffic';
import { PedSystem } from './peds';
import { signalStateAt, type WorldAPI } from './world';
import { TouchControls } from '../ui/touch';
import { HUD, type Blip } from '../ui/hud';
import { clamp, clamp01, lerp, smoothstep } from '../core/math';
import { AudioEngine } from '../audio/audio';
import { GameAudio } from '../audio/gameAudio';
import { Effects } from '../render/effects';
import { RNG } from '../core/rng';
import { CombatSystem } from './combat';
import { Arsenal, WEAPONS, type WeaponId } from './weapons';
import { PickupSystem, type Pickup } from './pickups';
import { PickupRenderer } from '../render/pickupRenderer';
import { PoliceSystem } from './police';
import { WantedSystem, type Crime } from './wanted';
import { PoliceView } from '../render/policeView';

const nextFrame = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const STEP = 1 / 60;

export class Game implements WorldAPI, PlayerHost {
  renderer!: Renderer;
  city!: City;
  cityRenderer!: CityRenderer;
  physics!: Physics;
  input!: Input;
  touch!: TouchControls;
  hud!: HUD;
  camera = new CameraRig();
  chars: Character[] = [];
  vehicles: Vehicle[] = [];
  player!: PlayerController;
  traffic!: TrafficSystem;
  peds!: PedSystem;
  private views = new Map<Vehicle, VehicleView>();
  private charRenderer!: CharacterRenderer;
  private vehShadows!: BlobShadows;
  private charShadows!: BlobShadows;
  private running = false;
  private last = 0;
  private acc = 0;
  private pending: InputState = emptyInput();
  private fps = 60;
  private rng = new RNG(99);
  time = 0;
  /** in-game clock in hours (0..24) */
  clock = 7.5;
  clockSpeed = 1 / 60; // game hours per real second (1 min per second)
  money = 250;
  wanted = new WantedSystem();
  police!: PoliceSystem;
  private policeView!: PoliceView;
  /** simulation speed (slow motion on takedowns) */
  private timeScale = 1;
  private slowT = 0;
  private bustedT = 0;
  private bustFine = 0;
  private sprayT = 0;
  private paintHintT = 0;
  paused = false;
  private deadT = 0;
  private flashT = 0;
  private gisela: Vehicle | null = null;
  private drawList: CharDraw[] = [];
  audio = new AudioEngine();
  sound!: GameAudio;
  fx!: Effects;
  combat!: CombatSystem;
  pickups!: PickupSystem;
  private pickupRenderer!: PickupRenderer;
  private audioUnlocked = false;

  constructor(
    private app: HTMLElement,
    private ui: HTMLElement,
    readonly version: string,
  ) {}

  // ------------------------------------------------------------------------------------
  async init(progress: (p: number, t: string) => void): Promise<void> {
    progress(0.05, 'Starte Grafik …');
    await nextFrame();
    const lowEnd = (navigator.hardwareConcurrency || 4) <= 4 && Math.min(screen.width, screen.height) * (window.devicePixelRatio || 1) < 800;
    this.renderer = new Renderer(this.app, { antialias: !lowEnd, maxPixelRatio: lowEnd ? 1.25 : 1.75 });
    progress(0.12, 'Baue Neuhafen …');
    await nextFrame();
    let t0 = performance.now();
    this.city = generateCity();
    console.log(`city generated in ${(performance.now() - t0).toFixed(0)} ms`);
    progress(0.4, 'Male Fassaden …');
    await nextFrame();
    t0 = performance.now();
    this.cityRenderer = new CityRenderer(this.city);
    this.renderer.scene.add(this.cityRenderer.root);
    console.log(`city renderer ready in ${(performance.now() - t0).toFixed(0)} ms`);
    progress(0.7, 'Physik …');
    await nextFrame();
    this.physics = new Physics(this.city);
    this.charRenderer = new CharacterRenderer();
    this.vehShadows = new BlobShadows(true, 120);
    this.charShadows = new BlobShadows(false, 240);
    this.renderer.scene.add(this.vehShadows.mesh, this.charShadows.mesh, this.charRenderer.mesh);
    this.input = new Input();
    this.touch = new TouchControls(this.ui, this.input);
    this.hud = new HUD(this.ui, this.city);
    this.hud.btnPause.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.input.press('pausePressed');
    });
    this.hud.btnRadio.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.input.press('radioNext');
    });
    this.traffic = new TrafficSystem(this);
    this.peds = new PedSystem(this);
    this.police = new PoliceSystem(this);
    this.policeView = new PoliceView();
    this.renderer.scene.add(this.policeView.root);
    this.wanted.onLevel = (lvl, prev) => {
      if (lvl > prev) this.sound?.play('static', undefined, undefined, 0.35);
    };
    this.fx = new Effects();
    this.renderer.scene.add(this.fx.root);
    this.combat = new CombatSystem(this);
    this.pickups = new PickupSystem(this.city);
    this.pickupRenderer = new PickupRenderer();
    this.renderer.scene.add(this.pickupRenderer.root);
    this.hud.btnWeapon.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.input.press('weaponNext');
    });
    progress(0.78, 'Lade Sounds …');
    await nextFrame();
    try {
      await this.audio.init('audio/');
    } catch (e) {
      console.warn('audio init failed', e);
    }
    this.sound = new GameAudio(this.audio);
    const unlock = (): void => {
      this.audio.resume();
      if (!this.audioUnlocked && this.audio.ctx && this.audio.ctx.state === 'running') {
        this.audioUnlocked = true;
        this.audio.startAmbient();
      }
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });
    progress(0.88, 'Kai wird entlassen …');
    await nextFrame();
    this.spawnPlayer();
    this.renderFrame(0, true);
    progress(1, 'Bereit');
  }

  private spawnPlayer(): void {
    const start = this.city.pois.get('start')!;
    const c = this.spawnChar(start.x, start.y, LOOKS.kai, 'player');
    c.heading = Math.PI;
    c.arsenal = new Arsenal();
    this.player = new PlayerController(c, this);
    // Dende's Golfo "Gisela" waits in front of the prison
    this.gisela = this.spawnVehicle('gisela', start.x - 5.5, start.y - 2.5, Math.PI / 2, VEHICLES.gisela.colors[0]);
    this.gisela.missionTag = 'gisela';
    this.camera.snap(start.x, start.y, 42);
  }

  start(): void {
    this.running = true;
    this.last = performance.now();
    const loop = (t: number): void => {
      if (!this.running) return;
      const dtReal = Math.min(0.1, (t - this.last) / 1000);
      this.last = t;
      if (dtReal > 0) this.fps = lerp(this.fps, 1 / dtReal, 0.05);
      this.frame(dtReal);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    this.hud.district('JVA Neuhafen');
    this.hud.hint(this.touch && matchMedia('(pointer: coarse)').matches ? 'Steig in Giselas Golfo: EINSTEIGEN' : 'F = Einsteigen · WASD/Pfeile = Fahren · Leertaste = Handbremse', 6);
  }

  // ------------------------------------------------------------------------------------
  cpuMs = 0;
  private frame(dt: number): void {
    const tStart = performance.now();
    const inp = this.input.poll(dt, this.player.inVehicle);
    // accumulate edges so fixed steps never miss a press
    const p = this.pending;
    for (const k of ['enterPressed', 'firePressed', 'weaponNext', 'weaponPrev', 'radioNext', 'pausePressed', 'mapPressed', 'actionPressed'] as const) {
      p[k] = p[k] || inp[k];
    }
    if (p.pausePressed) {
      p.pausePressed = false;
      this.togglePause();
    }
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) this.timeScale = 1;
    }
    if (!this.paused) {
      dt *= this.timeScale;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        const stepInput: InputState = { ...inp };
        for (const k of ['enterPressed', 'firePressed', 'weaponNext', 'weaponPrev', 'radioNext', 'mapPressed', 'actionPressed'] as const) {
          stepInput[k] = p[k];
          p[k] = false;
        }
        this.fixedStep(STEP, stepInput);
        this.acc -= STEP;
        steps++;
      }
      if (steps === 5) this.acc = 0;
      this.frameUpdate(dt);
    }
    this.renderFrame(this.paused ? 1 : this.acc / STEP);
    this.cpuMs = lerp(this.cpuMs, performance.now() - tStart, 0.05);
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  setPaused(v: boolean): void {
    if (!this.running) return;
    this.paused = v;
    this.hud.center(this.paused ? 'PAUSE' : '', this.paused ? 9999 : 0.01);
    if (v) this.sound.stopAll();
  }

  private fixedStep(dt: number, inp: InputState): void {
    this.time += dt;
    this.player.update(dt, this.bustedT > 0 ? emptyInput() : inp);
    this.traffic.step(dt);
    this.police.step(dt);
    this.peds.step(dt);
    for (const v of this.vehicles) {
      v.savePrev();
      v.setSurface(this.city.surfaceAt(v.x, v.y));
      v.step(dt);
    }
    for (const c of this.chars) c.step(dt);
    this.combat.step(dt);
    this.pickups.step(dt);
    this.checkPickups();
    this.physics.step(dt);
    this.handleImpacts(this.physics.impacts);
    this.updateHazards(dt);
  }

  private frameUpdate(dt: number): void {
    this.clock = (this.clock + dt * this.clockSpeed) % 24;
    this.updateLighting();
    const pl = this.player;
    const px = pl.x;
    const py = pl.y;
    this.traffic.manage(dt, px, py);
    this.peds.manage(dt, px, py);
    this.police.manage(dt);
    this.wanted.step(dt, this.police.seen, px, py);
    this.checkPaintShops(dt);
    if (this.bustedT > 0) {
      this.bustedT += dt;
      if (this.bustedT > 3.4) this.afterBust();
    }
    // camera follow
    let vx = 0;
    let vy = 0;
    if (pl.vehicle) {
      const vel = pl.vehicle.body.getLinearVelocity();
      vx = vel.x;
      vy = vel.y;
    }
    const { hw, hh } = this.renderer.halfExtents(this.camera.h);
    this.camera.update(dt, px, py, vx, vy, pl.inVehicle, hw, hh);
    this.vehicleEffects(dt);
    this.combat.frame(dt);
    this.fx.update(dt);
    if (this.flashT > 0) this.flashT -= dt;
    GU.uFlash.value = Math.max(0, this.flashT / 0.35) * 0.9;
    this.sound.update(this.vehicles, pl.vehicle, this.camera.x, this.camera.y);
    if (!pl.inVehicle && !pl.char.isDown) {
      const cv = pl.char.body.getLinearVelocity();
      this.sound.footstep(dt, pl.char.x, pl.char.y, Math.hypot(cv.x, cv.y));
    }
    // district banner
    const d = this.city.districtAt(px, py);
    this.hud.district(DISTRICT_NAMES[d]);
    // death & respawn
    if (pl.char.dead) {
      if (this.deadT === 0) {
        this.sound.play('wasted', undefined, undefined, 0.8);
        if (!this.player.inVehicle) this.hud.center('ABGEKRATZT', 3, '#ff5a4a');
      }
      this.deadT += dt;
      if (this.deadT > 3.5) this.respawn();
    }
    for (const c of this.chars) if (c.arsenal) c.weaponPose = c.arsenal.def.pose;
    this.touch.setModeIfChanged(pl.inVehicle ? 'car' : 'foot');
    const blips: Blip[] = [];
    this.police.blips(blips, this.time);
    if (this.wanted.level > 0) {
      for (const id of ['paint1', 'paint2']) {
        const p = this.city.pois.get(id);
        if (p) blips.push({ x: p.x, y: p.y, color: '#7ce07c', size: 5, shape: 'square' });
      }
    }
    if (this.gisela && !this.gisela.dead && pl.vehicle !== this.gisela) blips.push({ x: this.gisela.x, y: this.gisela.y, color: '#ff4040', size: 5, shape: 'square' });
    const veh = pl.vehicle;
    this.hud.update(dt, {
      money: this.money,
      wanted: this.wanted.level,
      wantedFlash: this.wanted.searching && this.wanted.level > 0,
      hp: pl.char.health,
      armor: pl.char.armor,
      weapon: pl.char.arsenal?.label() ?? 'Fäuste',
      speedKmh: veh ? Math.abs(veh.forwardSpeed) * 3.6 : null,
      px,
      py,
      heading: veh ? veh.angle : pl.char.heading,
      blips,
      fps: this.fps,
      inVehicle: !!veh,
    });
  }

  private vehicleEffects(dt: number): void {
    const view = this.renderer.viewRect(12);
    for (const v of this.vehicles) {
      if (v.x < view.x0 || v.x > view.x1 || v.y < view.y0 || v.y > view.y1) continue;
      if (v.exploded) {
        if (Math.random() < dt * 3) this.fx.engineSmoke(v.x, v.y, 1);
        continue;
      }
      const L = v.def.length;
      const W = v.def.width;
      const rearX = -v.def.wheelbase / 2;
      const frontX = v.def.wheelbase / 2;
      const wy = W / 2 - 0.18;
      if (v.skid > 0.22 && v.speed > 2.5 && !v.surface.water) {
        const onRoad = v.surface.grip > 0.9;
        for (const side of [-1, 1]) {
          const p = v.localToWorld(rearX, side * wy);
          if (onRoad) this.fx.skid(`${v.id}r${side}`, p.x, p.y, 0.24, v.skid);
          if (onRoad) this.fx.tireSmoke(p.x, p.y, (v.skid - 0.2) * 0.9);
          else this.fx.dust(p.x, p.y, v.skid);
          if (v.braking && v.skid > 0.5) {
            const f = v.localToWorld(frontX, side * wy);
            if (onRoad) this.fx.skid(`${v.id}f${side}`, f.x, f.y, 0.22, v.skid * 0.8);
          }
        }
      } else if (v.surface.grip < 0.9 && v.speed > 8 && !v.surface.water) {
        const p = v.localToWorld(rearX, 0);
        this.fx.dust(p.x, p.y, Math.min(1, v.speed / 25) * 0.6);
      }
      // engine smoke / fire
      const hp = v.health / v.maxHealth;
      if (v.burning > 0) {
        const h = v.localToWorld(L * 0.32, 0);
        this.fx.fire(h.x, h.y, 1);
      } else if (hp < 0.4 && Math.random() < dt * (hp < 0.2 ? 14 : 6)) {
        const h = v.localToWorld(L * 0.32, 0);
        this.fx.engineSmoke(h.x, h.y, hp < 0.2 ? 1 : 0);
      }
      if (v.sinking > 0 && v.sinking < dt * 1.5) {
        this.fx.splash(v.x, v.y);
        this.sound.play('splash', v.x, v.y, 0.9);
      }
    }
  }

  private updateLighting(): void {
    const h = this.clock;
    // daylight 1 between 7 and 19, ramps at dawn/dusk
    let day = 0;
    if (h >= 5 && h < 7.2) day = smoothstep(5, 7.2, h);
    else if (h >= 7.2 && h < 19) day = 1;
    else if (h >= 19 && h < 21.2) day = 1 - smoothstep(19, 21.2, h);
    GU.uDay.value = day;
    // warm low sun in the morning/evening
    const warm = day * (1 - Math.min(1, Math.abs(h - 13) / 6.5) ** 0.5) * 0 + (h < 10 ? clamp01((10 - h) / 3) : h > 16 ? clamp01((h - 16) / 3) : 0) * day;
    (GU.uDayTint.value as THREE.Color).setRGB(1 + warm * 0.08, 1 - warm * 0.02, 1 - warm * 0.14);
    GU.uTime.value = this.time;
  }

  // ------------------------------------------------------------------------------------
  private handleImpacts(list: Impact[]): void {
    for (const it of list) {
      const a = it.a;
      const b = it.b;
      const va = a.kind === 'vehicle' ? (a.ref as Vehicle) : null;
      const vb = b.kind === 'vehicle' ? (b.ref as Vehicle) : null;
      const ca = a.kind === 'char' ? (a.ref as Character) : null;
      const cb = b.kind === 'char' ? (b.ref as Character) : null;
      // vehicle crashes
      for (const [v, other] of [
        [va, vb],
        [vb, va],
      ] as const) {
        if (!v) continue;
        const dv = it.impulse / v.def.mass;
        if (dv > 2.2) {
          let dmg = (dv - 2.2) * 5.5;
          if (other && other.def.heavy && !v.def.heavy) dmg *= 1.3;
          // police drivers survive their own scrapes with walls better (takedowns need ramming)
          if (other !== this.player.vehicle && v.ai && v !== this.player.vehicle && this.police.isPoliceVehicle(v)) dmg *= 0.45;
          v.damage(dmg, other?.driver ?? null);
          if (v.sinceCrash > 0.25) {
            this.sound.crash(it.x, it.y, dv, v.def.heavy === true || (other?.def.heavy ?? false));
            if (dv > 3.2) this.fx.sparks(it.x, it.y, -it.nx, -it.ny, Math.min(24, Math.round(dv * 2)));
            if (dv > 8) this.fx.glass(it.x, it.y);
          }
          v.sinceCrash = 0;
          if (v === this.player.vehicle) {
            this.camera.addShake(Math.min(1.2, dv * 0.09));
            this.vibrate(Math.min(80, 10 + dv * 6));
          }
          if (dv > 5) this.alarm(it.x, it.y, 16, 0.5);
          // ramming a police car that isn't chasing you is a crime
          if (other && other === this.player.vehicle) {
            const u = this.police.isPoliceVehicle(v);
            if (u && (this.wanted.level === 0 || u.mode === 'patrol')) this.crime('ram_cop', it.x, it.y);
          }
        }
      }
      // vehicle vs pedestrian
      const pairs: [Vehicle | null, Character | null][] = [
        [va, cb],
        [vb, ca],
      ];
      for (const [v, c] of pairs) {
        if (!v || !c || c.dead) continue;
        const vel = v.body.getLinearVelocity();
        // only count it as a hit when the car itself moves towards the person
        const tx = c.x - v.x;
        const ty = c.y - v.y;
        const tl = Math.hypot(tx, ty) || 1;
        const closing = (vel.x * tx + vel.y * ty) / tl;
        if (v.speed < 3 || closing < 2.5) continue;
        const dvc = Math.min(it.impulse / 75, closing * 1.2);
        if (dvc < 2.2) continue;
        const dmg = (dvc - 2) * 9;
        const killed = c.damage(dmg, (v.driver as Character) ?? null, vel.x * 0.6, vel.y * 0.6);
        if (!killed) c.knockDown(vel.x * 0.55, vel.y * 0.55, 1.2 + dvc * 0.1);
        this.sound.play('thud', c.x, c.y, Math.min(1, 0.4 + dvc * 0.08));
        if (killed || dvc > 6) this.fx.blood(c.x + vel.x * 0.15, c.y + vel.y * 0.15, killed ? 1.6 : 1.0);
        this.alarm(c.x, c.y, 18, 1);
        if (v === this.player.vehicle) {
          this.camera.addShake(0.15);
          const cop = c.role === 'cop';
          this.crime(killed ? (cop ? 'kill_cop' : 'kill') : cop ? 'assault_cop' : 'hit_ped', c.x, c.y);
          if (killed && this.rng.chance(0.6)) this.pickups.drop(c.x, c.y, 'money', null, this.rng.int(5, 40));
        }
      }
    }
  }

  private updateHazards(dt: number): void {
    for (const v of this.vehicles) {
      if (v.exploded) continue;
      if (v.burning > 0 && v.burning > 4.2) this.explode(v);
      if (v.sunk) {
        if (v === this.player.vehicle) {
          this.player.char.kill();
          this.hud.center('ERTRUNKEN', 3, '#7fb8ff');
        }
      }
    }
    // remove sunk vehicles
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (v.sunk && v !== this.player.vehicle) this.removeVehicle(v);
    }
    // player drowning on foot
    const c = this.player.char;
    if (!c.hidden && !c.dead && this.city.isWaterAt(c.x, c.y)) {
      c.damage(dt * 40);
      if (c.dead) this.hud.center('ERTRUNKEN', 3, '#7fb8ff');
    }
  }

  explode(v: Vehicle): void {
    if (v.exploded) return;
    v.exploded = true;
    v.burning = 0;
    v.health = 0;
    if (v.driver) {
      const dr = v.driver as Character;
      if (dr === this.player.char) {
        this.player.exit(v, true);
        dr.kill();
      } else {
        dr.vehicle = null;
        dr.removeMe = true;
      }
      v.driver = null;
    }
    v.body.applyAngularImpulse((Math.random() - 0.5) * v.body.getInertia() * 2.5, true);
    this.explosionAt(v.x, v.y, 9, 1, (v.lastHitBy as Character | null) ?? null, v);
  }

  /** Blast damage + impulses + effects. `source` is the exploding vehicle (not damaged again). */
  explosionAt(x: number, y: number, R: number, power: number, by: Character | null, source: Vehicle | null): void {
    for (const o of this.vehicles) {
      if (o === source || o.dead) continue;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d > R) continue;
      const k = 1 - d / R;
      o.damage((60 * k + (k > 0.55 ? 45 : 0)) * power, by);
      const dir = Math.atan2(o.y - y, o.x - x);
      o.body.applyLinearImpulse({ x: Math.cos(dir) * o.def.mass * 6 * k * power, y: Math.sin(dir) * o.def.mass * 6 * k * power }, o.body.getWorldCenter(), true);
      o.body.applyAngularImpulse((Math.random() - 0.5) * o.body.getInertia() * 3 * k * power, true);
    }
    for (const c of this.chars) {
      if (c.dead || c.hidden) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d > R) continue;
      const dir = Math.atan2(c.y - y, c.x - x);
      const k = 1 - d / R;
      const killed = c.damage(120 * k * power, by, Math.cos(dir) * 10 * k, Math.sin(dir) * 10 * k);
      if (!killed) c.knockDown(Math.cos(dir) * 9 * k, Math.sin(dir) * 9 * k, 2);
      if (k > 0.5) c.ignite(by);
      this.onCharHit(c, by, 120 * k * power, killed, 'grenade');
    }
    this.camera.addShake(Math.max(0.2, 1.4 - Math.hypot(x - this.player.x, y - this.player.y) / 40) * Math.min(1, power + 0.2));
    this.alarm(x, y, 40, 2);
    this.fx.explosion(x, y);
    this.sound.play('explosion', x, y, Math.min(1, 0.6 + power * 0.4));
    this.flashT = 0.35 * Math.min(1, power + 0.15);
    this.vibrate(120);
    if (by) this.onShot(by, x, y, 'grenade');
  }

  private checkPickups(): void {
    const pl = this.player;
    if (pl.char.dead) return;
    const v = pl.vehicle;
    const px = pl.x;
    const py = pl.y;
    const r = v ? v.def.length / 2 + 0.6 : 1.3;
    for (const p of this.pickups.list) {
      if (!p.active) continue;
      if (Math.abs(p.x - px) > r + 1 || Math.abs(p.y - py) > r + 1) continue;
      if (Math.hypot(p.x - px, p.y - py) > r) continue;
      if (this.applyPickup(p)) this.pickups.collect(p);
    }
  }

  /** returns false if the pickup can't be used right now (full health etc.) */
  private applyPickup(p: Pickup): boolean {
    const c = this.player.char;
    switch (p.kind) {
      case 'weapon': {
        const ars = c.arsenal;
        if (!ars || !p.weapon) return false;
        const def = WEAPONS[p.weapon];
        const added = ars.give(p.weapon, p.amount, !this.player.inVehicle && ars.current === 'fists');
        if (added <= 0 && def.kind !== 'melee') return false;
        this.hud.pickupText(def.kind === 'melee' ? def.name.toUpperCase() : `${def.name.toUpperCase()} +${added}`);
        this.sound.play('pickup', p.x, p.y, 0.8);
        return true;
      }
      case 'health':
        if (c.health >= c.maxHealth - 0.5) return false;
        c.health = Math.min(c.maxHealth, c.health + p.amount);
        this.hud.pickupText('GESUNDHEIT');
        this.sound.play('pickup', p.x, p.y, 0.8);
        return true;
      case 'armor':
        if (c.armor >= 99) return false;
        c.armor = Math.min(100, c.armor + p.amount);
        this.hud.pickupText('SCHUTZWESTE');
        this.sound.play('pickup', p.x, p.y, 0.8);
        return true;
      case 'money':
        this.money += p.amount;
        this.hud.pickupText(`+${p.amount} €`, '#7ce07c');
        this.sound.play('money', p.x, p.y, 0.8);
        return true;
      case 'bribe':
        if (this.wanted.level <= 0) return false;
        this.wanted.lower(1);
        this.hud.pickupText('BESTECHUNG', '#6aa0ff');
        this.sound.play('money', p.x, p.y, 0.8);
        return true;
    }
  }

  private respawn(): void {
    this.deadT = 0;
    const h = this.city.pois.get('hospital')!;
    const c = this.player.char;
    if (this.player.vehicle) this.player.exit(this.player.vehicle, true);
    // revive
    c.destroy();
    this.chars.splice(this.chars.indexOf(c), 1);
    const nc = this.spawnChar(h.x, h.y - 2, LOOKS.kai, 'player');
    nc.arsenal = new Arsenal();
    this.player = new PlayerController(nc, this);
    this.combat.clear();
    this.wanted.clear();
    this.police.clearAll();
    this.money = Math.max(0, this.money - 100);
    this.camera.snap(h.x, h.y, 42);
    this.hud.center('KRANKENHAUS', 2.5, '#ff6a5a');
    this.hud.hint('Behandlungskosten: 100 €', 3);
  }

  // ------------------------------------------------------------------------------------
  private renderFrame(alpha: number, force = false): void {
    const r = this.renderer;
    const cam = this.camera;
    r.camX = cam.x;
    r.camY = cam.y;
    r.camH = cam.h;
    r.shakeX = cam.shakeX;
    r.shakeY = cam.shakeY;
    r.updateCamera();
    const night = 1 - GU.uDay.value;
    // vehicles
    this.vehShadows.begin();
    const view = r.viewRect(30);
    for (const v of this.vehicles) {
      const x = lerp(v.prevX, v.x, alpha);
      const y = lerp(v.prevY, v.y, alpha);
      let da = v.angle - v.prevA;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      const a = v.prevA + da * alpha;
      const inView = x > view.x0 && x < view.x1 && y > view.y0 && y < view.y1;
      const vw = this.views.get(v);
      if (vw) {
        vw.mesh.visible = inView;
        if (inView) {
          vw.update(x, y, a, 1 / 60, night);
          if (v.sinking <= 0) this.vehShadows.add(x, y, a, v.def.length + 0.5, v.def.width + 0.5, v.def.model.roofZ);
        }
      }
    }
    const heli = this.police.heli;
    if (heli) this.vehShadows.add(heli.x + SHADOW_DIR.x * heli.z * 0.5, heli.y + SHADOW_DIR.y * heli.z * 0.5, heli.angle, 11, 4.2, 1.5);
    this.vehShadows.end();
    // characters
    this.charShadows.begin();
    const list = this.drawList;
    list.length = 0;
    for (const c of this.chars) {
      if (c.hidden) continue;
      const x = lerp(c.prevX, c.x, alpha);
      const y = lerp(c.prevY, c.y, alpha);
      if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
      const down = c.isDown;
      list.push({ x, y, z: down ? 0.08 : 0.9, rot: c.heading, frame: c.frame(), look: c.look, flash: c.flash });
      if (!down) this.charShadows.add(x, y, 0, 1.15, 1.15, 1.6);
    }
    this.charShadows.end();
    this.charRenderer.update(list);
    this.pickupRenderer.update(this.pickups.list, this.time, view);
    this.policeView.update(this.police.heli, this.police.spikes, alpha);
    const vr = r.viewRect(10);
    this.cityRenderer.update(vr.x0, vr.y0, vr.x1, vr.y1, force);
    r.render();
  }

  // ------------------------------------------------------------------------------------
  // WorldAPI / PlayerHost
  spawnVehicle(id: string, x: number, y: number, angle: number, paint?: number): Vehicle {
    const def = VEHICLES[id] ?? VEHICLES.golfo;
    const v = new Vehicle(def, this.physics, x, y, angle, paint ?? this.rng.pick(def.colors));
    const view = new VehicleView(v, this.renderer.scene);
    v.view = view;
    this.views.set(v, view);
    this.vehicles.push(v);
    return v;
  }

  removeVehicle(v: Vehicle): void {
    const i = this.vehicles.indexOf(v);
    if (i < 0) return;
    if (v === this.player.vehicle) return;
    this.vehicles.splice(i, 1);
    const view = this.views.get(v);
    if (view) {
      view.dispose();
      this.views.delete(v);
    }
    if (v.driver && v.driver !== this.player.char) {
      const d = v.driver as Character;
      d.removeMe = true;
      this.removeChar(d);
    }
    this.traffic?.forgetParked(v);
    this.physics.world.destroyBody(v.body);
  }

  spawnChar(x: number, y: number, look: CharLook, role: Role): Character {
    const c = new Character(this.physics, x, y, look, role);
    this.chars.push(c);
    return c;
  }

  removeChar(c: Character): void {
    const i = this.chars.indexOf(c);
    if (i < 0) return;
    if (c === this.player?.char) return;
    this.chars.splice(i, 1);
    c.destroy();
  }

  isVisible(x: number, y: number, margin: number): boolean {
    const v = this.renderer.viewRect(margin);
    return x > v.x0 && x < v.x1 && y > v.y0 && y < v.y1;
  }

  signalState(junction: number, group: number): number {
    const j = this.city.junctions[junction];
    return signalStateAt(this.time, j ? j.phase : 0, group);
  }

  alarm(x: number, y: number, radius: number, severity: number): void {
    this.peds?.alarm(x, y, radius, severity);
  }

  findCharacterNear(x: number, y: number, r: number, exclude: Character): Character | null {
    let best: Character | null = null;
    let bd = r;
    for (const c of this.chars) {
      if (c === exclude || c.hidden || c.dead) continue;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  isFreeSpot(x: number, y: number, r: number): boolean {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (!this.city.isWalkableTile(tx, ty)) return false;
    let free = true;
    this.physics.world.queryAABB({ lowerBound: { x: x - r, y: y - r }, upperBound: { x: x + r, y: y + r } }, (f) => {
      const tag = f.getUserData() as { kind?: string } | undefined;
      if (tag && (tag.kind === 'static' || tag.kind === 'vehicle' || tag.kind === 'barrier')) {
        free = false;
        return false;
      }
      return true;
    });
    return free;
  }

  private drivenOnce = false;
  onEnterVehicle(v: Vehicle, jacked: Character | null): void {
    this.hud.vehicleName(v.def.name);
    this.hud.clearHint();
    if (!this.drivenOnce) {
      this.drivenOnce = true;
      const touch = this.touch && matchMedia('(pointer: coarse)').matches;
      this.hud.hint(touch ? 'Links lenken · GAS / BREMSE · HANDBREMSE = Drift' : 'W/S = Gas/Bremse · A/D = Lenken · Leertaste = Handbremse · F = Aussteigen', 6);
    }
    this.sound.play('door', v.x, v.y, 0.7);
    this.camera.addShake(0.05);
    if (jacked) {
      this.alarm(v.x, v.y, 14, 0.6);
      const ai = jacked.ai as { mode?: string } | null;
      if (!ai) {
        // become a fleeing pedestrian
        this.peds.peds.push(jacked);
        jacked.ai = { kind: 'ped', block: Math.max(0, this.city.blockAtWorld(jacked.x, jacked.y)), s: 0, dir: 1, offset: 0, speed: 1.4, mode: 'flee', t: 5, fx: v.x, fy: v.y };
        jacked.role = 'ped';
      }
    }
    const cop = this.police.isPoliceVehicle(v);
    if (cop) {
      this.police.onVehicleStolen(v);
      this.crime('carjack', v.x, v.y);
      this.wanted.atLeast(1, v.x, v.y);
    } else if (jacked) this.crime('carjack', v.x, v.y);
    else if (!v.stolen && !v.missionTag) this.crime('theft', v.x, v.y);
    this.traffic.forgetParked(v);
    v.stolen = true;
  }

  onExitVehicle(v: Vehicle, bailed: boolean): void {
    if (bailed) this.camera.addShake(0.3);
    else this.sound.play('door', v.x, v.y, 0.6);
  }

  attack(c: Character, pressed: boolean, aimDir: number): void {
    const ars = c.arsenal;
    if (!ars) return;
    const def = ars.def;
    const range = def.kind === 'melee' ? 2.2 : def.kind === 'throw' ? def.range : def.range * 0.9;
    const target = def.kind === 'melee' ? null : this.combat.autoAim(c, aimDir, range, def.kind === 'throw' ? 0.6 : 0.95);
    this.combat.attackOnFoot(c, pressed, aimDir, target);
  }

  driveBy(c: Character, v: Vehicle): void {
    if (!this.combat.driveBy(c, v) && c.arsenal && c.arsenal.cooldown <= 0 && !c.arsenal.driveByWeapon()) {
      c.arsenal.cooldown = 2.5;
      this.hud.hint('Keine Waffe für Drive-bys (Pistole / MP)', 1.6);
    }
  }

  /** A character got hurt (by a weapon, explosion or fire). */
  onCharHit(target: Character, by: Character | null, dmg: number, killed: boolean, weapon: WeaponId): void {
    if (target === this.player.char) {
      this.camera.addShake(Math.min(0.5, dmg * 0.02));
      this.vibrate(Math.min(60, 10 + dmg));
      this.hud.hurt(Math.min(1, dmg / 30));
    }
    if (by === this.player.char && target !== this.player.char) {
      const cop = target.role === 'cop';
      this.crime(killed ? (cop ? 'kill_cop' : 'kill') : cop ? 'assault_cop' : 'assault', target.x, target.y);
    }
    if (killed && by === this.player.char && target !== this.player.char) {
      if (target.role === 'cop') this.pickups.drop(target.x, target.y, 'weapon', 'pistol', 12);
      else if (this.rng.chance(0.7)) this.pickups.drop(target.x + 0.3, target.y, 'money', null, this.rng.int(5, 45));
    }
    void weapon;
  }

  /** A vehicle was shot / hit by a melee weapon. */
  onVehicleShot(v: Vehicle, by: Character | null, dmg: number): void {
    if (by && by === this.player.char) this.traffic.panic(v);
    void dmg;
  }

  /** Somebody fired a weapon / caused an explosion at (x, y). */
  onShot(shooter: Character, x: number, y: number, weapon: WeaponId): void {
    if (shooter !== this.player.char) return;
    this.crime(weapon === 'grenade' || weapon === 'molotov' ? 'explosion' : 'shooting', x, y);
  }

  /** report a crime by the player at (x, y) */
  crime(type: Crime, x: number, y: number): void {
    const seen = this.police.isWitnessed(x, y);
    this.wanted.crime(type, x, y, seen);
    if (seen) this.police.alert(x, y);
  }

  slowMo(scale: number, secs: number): void {
    this.timeScale = scale;
    this.slowT = secs;
  }

  /** a pursuing police car was wrecked */
  onTakedown(v: Vehicle): void {
    const lvl = this.wanted.takedown();
    this.hud.center('TAKEDOWN!', 1.4, '#ffd23a');
    this.hud.hint(lvl > 0 ? `Fahndungsstufe ${lvl}` : 'Fahndung eingestellt', 1.8);
    this.sound.play('takedown', undefined, undefined, 0.9);
    this.slowMo(0.35, 0.45);
    this.camera.addShake(0.35);
    this.vibrate(90);
    void v;
  }

  onTiresPopped(v: Vehicle): void {
    this.sound.play('hit_metal', v.x, v.y, 0.8, 0.7);
    this.fx.sparks(v.x, v.y, 0, 0, 10);
    if (v === this.player.vehicle) {
      this.hud.hint('Reifen zerstochen!', 1.8);
      this.vibrate(60);
      this.camera.addShake(0.2);
    }
  }

  /** the police got you */
  bust(): void {
    if (this.bustedT > 0 || this.player.char.dead) return;
    this.bustedT = 0.001;
    this.bustFine = Math.min(this.money, 100 + this.wanted.level * 150);
    this.hud.center('FESTGENOMMEN', 3.2, '#6aa0ff');
    this.sound.play('busted', undefined, undefined, 0.9);
    this.vibrate(150);
  }

  private afterBust(): void {
    this.bustedT = 0;
    const pl = this.player;
    if (pl.vehicle) pl.exit(pl.vehicle, true);
    const c = pl.char;
    c.arsenal?.clear();
    c.burnT = 0;
    this.money -= this.bustFine;
    this.wanted.clear();
    this.police.clearAll();
    this.combat.clear();
    const p = this.city.pois.get('police')!;
    c.showAt(p.x, p.y + 1.5, Math.PI / 2);
    this.camera.snap(p.x, p.y, 42);
    this.hud.center('', 0.01);
    this.hud.hint(`Geldstrafe ${this.bustFine} € · Waffen beschlagnahmt`, 3.5);
  }

  /** Lackiererei: respray clears the wanted level (and repairs the car) */
  private checkPaintShops(dt: number): void {
    const v = this.player.vehicle;
    if (this.paintHintT > 0) this.paintHintT -= dt;
    if (this.sprayT > 0) {
      this.sprayT -= dt;
      return;
    }
    if (!v || v.dead) return;
    const hint = (t: string): void => {
      if (this.paintHintT > 0) return;
      this.paintHintT = 5;
      this.hud.hint(t, 2.4);
    };
    for (const id of ['paint1', 'paint2']) {
      const p = this.city.pois.get(id);
      if (!p || Math.hypot(v.x - p.x, v.y - p.y) > 8 || v.speed > 3) continue;
      const wanted = this.wanted.level > 0;
      const damaged = v.health < v.maxHealth * 0.98 || v.flatTires;
      if (!wanted && !damaged) {
        hint('Lackiererei: Umlackieren 300 € – die Bullen erkennen dich nicht mehr.');
        return;
      }
      if (wanted && this.police.seen) {
        hint('Nicht, solange die Bullen zusehen!');
        return;
      }
      const cost = wanted ? 300 : 120;
      if (this.money < cost) {
        hint(`Lackieren kostet ${cost} €`);
        return;
      }
      this.money -= cost;
      if (wanted) this.wanted.clear();
      v.health = v.maxHealth;
      v.burning = 0;
      v.flatTires = false;
      const choices = v.def.colors.filter((c) => c !== v.paint);
      if (choices.length && !v.def.emergency) {
        v.paint = this.rng.pick(choices);
        this.views.get(v)?.setPaint(v.paint);
      }
      this.sound.play('spray', v.x, v.y, 0.9);
      this.hud.center('FRISCH LACKIERT', 2, '#7ce07c');
      this.hud.hint(`-${cost} €`, 2);
      this.sprayT = 5;
      return;
    }
  }

  hint(text: string, secs = 2): void {
    this.hud.hint(text, secs);
  }

  private vibrate(ms: number): void {
    try {
      const bridge = (window as unknown as { HGNative?: { vibrate(ms: number): void } }).HGNative;
      if (bridge) bridge.vibrate(Math.round(ms));
      else if (navigator.vibrate) navigator.vibrate(Math.round(ms));
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------------------------
  // Debug / test API
  debugView(x: number, y: number, h: number, day = 1): void {
    this.camera.snap(x, y, h);
    this.clock = day > 0.5 ? 12 : 23;
    this.updateLighting();
    this.renderFrame(1, true);
  }

  poi(id: string): { x: number; y: number } | undefined {
    return this.city.pois.get(id);
  }

  teleport(x: number, y: number): void {
    const p = this.player;
    if (p.vehicle) p.vehicle.body.setTransform({ x, y }, p.vehicle.angle);
    else p.char.showAt(x, y, p.char.heading);
    this.camera.snap(x, y);
  }

  /** debug: give the player a weapon and select it */
  give(id: WeaponId, ammo?: number): void {
    this.player.char.arsenal?.give(id, ammo, true);
  }

  /** debug: spawn a pedestrian relative to the player */
  spawnPed(dx: number, dy: number, role: Role = 'ped'): Character {
    const c = this.spawnChar(this.player.x + dx, this.player.y + dy, role === 'cop' ? LOOKS.cop : randomLook(this.rng), role);
    return c;
  }

  setClock(h: number): void {
    this.clock = h;
    this.updateLighting();
  }

  stats(): Record<string, unknown> {
    const p = this.player;
    return {
      x: p.x,
      y: p.y,
      inVehicle: p.inVehicle,
      vehicle: p.vehicle?.def.id ?? null,
      speedKmh: p.vehicle ? p.vehicle.forwardSpeed * 3.6 : 0,
      health: p.char.health,
      vehicles: this.vehicles.length,
      chars: this.chars.length,
      traffic: this.traffic.drivers.length,
      peds: this.peds.peds.length,
      fps: this.fps,
      cpuMs: this.cpuMs,
      zone: Zone[this.city.zoneAt(p.x, p.y)],
      draws: this.renderer.three.info.render.calls,
      tris: this.renderer.three.info.render.triangles,
    };
  }

  /** Simulate n fixed steps with scripted input (automated tests). */
  simulate(seconds: number, inp: Partial<InputState>): void {
    const base = emptyInput();
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) {
      const s: InputState = { ...base, ...inp };
      if (i > 0) {
        s.enterPressed = false;
        s.firePressed = false;
      }
      this.fixedStep(STEP, s);
      if (i % 6 === 0) this.frameUpdate(STEP * 6);
    }
    this.renderFrame(1, true);
  }

  get ui_(): HTMLElement {
    return this.ui;
  }
}

void clamp;
