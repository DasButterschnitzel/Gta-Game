// Unified input: keyboard, gamepad and touch controls are merged into one InputState per frame.

export interface InputState {
  /** on-foot movement in screen space (x right, y up), magnitude 0..1 */
  moveX: number;
  moveY: number;
  /** vehicle controls */
  steer: number; // -1 left .. 1 right
  throttle: number; // 0..1
  brake: number; // 0..1
  handbrake: boolean;
  fire: boolean;
  sprint: boolean;
  horn: boolean;
  /** one-frame edges */
  enterPressed: boolean;
  firePressed: boolean;
  weaponNext: boolean;
  weaponPrev: boolean;
  radioNext: boolean;
  pausePressed: boolean;
  mapPressed: boolean;
  actionPressed: boolean;
  /** true if the last input came from touch */
  touch: boolean;
}

export function emptyInput(): InputState {
  return {
    moveX: 0,
    moveY: 0,
    steer: 0,
    throttle: 0,
    brake: 0,
    handbrake: false,
    fire: false,
    sprint: false,
    horn: false,
    enterPressed: false,
    firePressed: false,
    weaponNext: false,
    weaponPrev: false,
    radioNext: false,
    pausePressed: false,
    mapPressed: false,
    actionPressed: false,
    touch: false,
  };
}

/** Touch state written by the on-screen controls. */
export interface TouchState {
  stickX: number;
  stickY: number;
  stickActive: boolean;
  gas: boolean;
  brake: boolean;
  handbrake: boolean;
  fire: boolean;
  sprint: boolean;
  horn: boolean;
  enter: boolean;
  action: boolean;
  steerLeft: boolean;
  steerRight: boolean;
}

export function emptyTouch(): TouchState {
  return {
    stickX: 0,
    stickY: 0,
    stickActive: false,
    gas: false,
    brake: false,
    handbrake: false,
    fire: false,
    sprint: false,
    horn: false,
    enter: false,
    action: false,
    steerLeft: false,
    steerRight: false,
  };
}

export class Input {
  private keys = new Set<string>();
  private pressedKeys = new Set<string>();
  readonly touch: TouchState = emptyTouch();
  private prevPad = new Map<number, boolean>();
  private lastWasTouch = false;
  /** scripted input for automated tests (overrides when set) */
  scripted: Partial<InputState> | null = null;
  private steerSmooth = 0;
  private touchSteer = 0;
  private extPressed: Partial<InputState> = {};

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedKeys.add(e.code);
      this.lastWasTouch = false;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
  }

  markTouch(): void {
    this.lastWasTouch = true;
  }

  get lastTouch(): boolean {
    return this.lastWasTouch;
  }

  /** Queue a one-frame press from UI buttons (pause, weapon, radio...). */
  press(k: keyof InputState): void {
    (this.extPressed as Record<string, boolean>)[k] = true;
  }

  private k(...codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  private kp(...codes: string[]): boolean {
    for (const c of codes) if (this.pressedKeys.has(c)) return true;
    return false;
  }

  poll(dt: number, inVehicle: boolean, speed = 0): InputState {
    const s = emptyInput();
    // ---- keyboard ----
    const up = this.k('KeyW', 'ArrowUp');
    const down = this.k('KeyS', 'ArrowDown');
    const left = this.k('KeyA', 'ArrowLeft');
    const right = this.k('KeyD', 'ArrowRight');
    s.moveX = (right ? 1 : 0) - (left ? 1 : 0);
    s.moveY = (up ? 1 : 0) - (down ? 1 : 0);
    const kSteer = (right ? 1 : 0) - (left ? 1 : 0);
    s.throttle = up ? 1 : 0;
    s.brake = down ? 1 : 0;
    s.handbrake = this.k('Space');
    s.sprint = this.k('ShiftLeft', 'ShiftRight');
    s.fire = this.k('ControlLeft', 'ControlRight', 'KeyJ');
    s.horn = this.k('KeyH');
    s.enterPressed = this.kp('KeyF', 'Enter');
    s.firePressed = this.kp('ControlLeft', 'ControlRight', 'KeyJ');
    s.weaponNext = this.kp('KeyE');
    s.weaponPrev = this.kp('KeyQ');
    s.radioNext = this.kp('KeyR');
    s.pausePressed = this.kp('Escape', 'KeyP');
    s.mapPressed = this.kp('KeyM');
    s.actionPressed = this.kp('KeyG');
    this.pressedKeys.clear();

    // keyboard steering is smoothed so tapping gives fine control
    let steer = 0;
    if (kSteer !== 0) {
      this.steerSmooth += (kSteer - this.steerSmooth) * Math.min(1, dt * 9);
      steer = this.steerSmooth;
    } else {
      this.steerSmooth += (0 - this.steerSmooth) * Math.min(1, dt * 14);
      steer = this.steerSmooth;
    }
    s.steer = steer;

    // ---- gamepad ----
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      const dz = (v: number): number => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      if (Math.abs(ax) > 0.15 || Math.abs(ay) > 0.15) {
        s.moveX = dz(ax);
        s.moveY = -dz(ay);
        s.steer = dz(ax);
        this.lastWasTouch = false;
      }
      const btn = (i: number): boolean => !!p.buttons[i]?.pressed;
      const val = (i: number): number => p.buttons[i]?.value ?? 0;
      const edge = (i: number): boolean => {
        const now = btn(i);
        const key = p.index * 100 + i;
        const was = this.prevPad.get(key) ?? false;
        this.prevPad.set(key, now);
        return now && !was;
      };
      s.throttle = Math.max(s.throttle, val(7));
      s.brake = Math.max(s.brake, val(6));
      s.handbrake = s.handbrake || btn(5) || btn(2);
      s.fire = s.fire || btn(0) && !inVehicle || btn(4);
      s.sprint = s.sprint || (btn(0) && !inVehicle) || btn(10);
      s.enterPressed = s.enterPressed || edge(3);
      s.firePressed = s.firePressed || edge(1);
      s.weaponNext = s.weaponNext || edge(15);
      s.weaponPrev = s.weaponPrev || edge(14);
      s.radioNext = s.radioNext || edge(12);
      s.pausePressed = s.pausePressed || edge(9);
      s.mapPressed = s.mapPressed || edge(8);
      s.horn = s.horn || btn(11);
    }

    // ---- touch ----
    const t = this.touch;
    if (t.stickActive) {
      s.moveX = t.stickX;
      s.moveY = t.stickY;
      // steering: small dead zone, finer near the centre (more so at speed), lightly smoothed
      const sx = t.stickX;
      const ax = Math.max(0, (Math.abs(sx) - 0.07) / 0.93);
      const expo = 1.3 + Math.min(0.6, speed / 45);
      const target = Math.sign(sx) * Math.pow(ax, expo);
      this.touchSteer += (target - this.touchSteer) * Math.min(1, dt * 16);
      s.steer = this.touchSteer;
    } else this.touchSteer += (0 - this.touchSteer) * Math.min(1, dt * 20);
    if (t.steerLeft || t.steerRight) s.steer = (t.steerRight ? 1 : 0) - (t.steerLeft ? 1 : 0);
    if (t.gas) s.throttle = 1;
    if (t.brake) s.brake = 1;
    if (t.handbrake) s.handbrake = true;
    if (t.fire) s.fire = true;
    if (t.sprint) s.sprint = true;
    if (t.horn) s.horn = true;
    // touch edges (enter/fire/action) are latched by TouchControls via press()

    // ---- external one-frame presses (UI buttons) ----
    for (const [k, v] of Object.entries(this.extPressed)) if (v) (s as unknown as Record<string, unknown>)[k] = true;
    this.extPressed = {};

    s.touch = this.lastWasTouch;
    if (this.scripted) Object.assign(s, this.scripted);
    return s;
  }
}
