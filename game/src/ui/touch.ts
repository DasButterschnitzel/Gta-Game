// On-screen touch controls. One transparent layer tracks all pointers; buttons are hit-tested
// by rectangle so a thumb can slide from GAS to BREMSE without lifting.
import type { Input, TouchState } from '../game/input';

type BtnKey = keyof Pick<TouchState, 'gas' | 'brake' | 'handbrake' | 'fire' | 'sprint' | 'horn' | 'enter' | 'action' | 'steerLeft' | 'steerRight'>;

interface BtnDef {
  key: BtnKey;
  label: string;
  icon: string;
  size: number;
  right: number;
  bottom: number;
  cls?: string;
  modes: ('car' | 'foot')[];
}

const BUTTONS: BtnDef[] = [
  { key: 'gas', label: 'GAS', icon: '▲', size: 104, right: 26, bottom: 30, cls: 'gas', modes: ['car'] },
  { key: 'brake', label: 'BREMSE', icon: '▼', size: 84, right: 146, bottom: 22, cls: 'brake', modes: ['car'] },
  { key: 'handbrake', label: 'HANDBREMSE', icon: 'Ⓗ', size: 76, right: 40, bottom: 150, cls: 'hb', modes: ['car'] },
  { key: 'fire', label: 'FEUER', icon: '✹', size: 58, right: 150, bottom: 132, modes: ['car'] },
  { key: 'enter', label: 'AUSSTEIGEN', icon: '⇱', size: 58, right: 150, bottom: 206, modes: ['car'] },
  { key: 'horn', label: 'HUPE', icon: '♪', size: 50, right: 222, bottom: 120, modes: ['car'] },
  { key: 'fire', label: 'ANGRIFF', icon: '✊', size: 104, right: 26, bottom: 30, cls: 'gas', modes: ['foot'] },
  { key: 'enter', label: 'EINSTEIGEN', icon: '🚗', size: 80, right: 146, bottom: 30, modes: ['foot'] },
  { key: 'sprint', label: 'SPRINT', icon: '»', size: 70, right: 40, bottom: 152, modes: ['foot'] },
  { key: 'action', label: 'AKTION', icon: '✋', size: 56, right: 140, bottom: 132, modes: ['foot'] },
];

interface ActiveBtn {
  def: BtnDef;
  el: HTMLElement;
}

export class TouchControls {
  readonly root: HTMLElement;
  private layer: HTMLElement;
  private stickBase: HTMLElement;
  private stickKnob: HTMLElement;
  private buttons: ActiveBtn[] = [];
  private pointers = new Map<number, { x: number; y: number; stick: boolean; sx: number; sy: number }>();
  private mode: 'car' | 'foot' = 'foot';
  private visible = false;
  private stickRadius = 62;
  private prevActive = new Set<BtnKey>();
  /** steering style in vehicles: analog stick or two buttons */
  steerButtons = false;

  constructor(parent: HTMLElement, private input: Input) {
    this.root = document.createElement('div');
    this.root.className = 'touch-root';
    this.root.style.display = 'none';
    parent.appendChild(this.root);
    this.layer = document.createElement('div');
    this.layer.className = 'touch-layer';
    this.root.appendChild(this.layer);
    this.stickBase = document.createElement('div');
    this.stickBase.className = 'stick-base';
    this.stickKnob = document.createElement('div');
    this.stickKnob.className = 'stick-knob';
    this.stickBase.appendChild(this.stickKnob);
    this.root.appendChild(this.stickBase);
    for (const def of BUTTONS) {
      const el = document.createElement('div');
      el.className = `tbtn ${def.cls ?? ''}`;
      el.style.width = el.style.height = `${def.size}px`;
      el.style.right = `calc(${def.right}px + var(--safe-r))`;
      el.style.bottom = `calc(${def.bottom}px + var(--safe-b))`;
      el.innerHTML = `<span class="ic">${def.icon}</span><span class="lb">${def.label}</span>`;
      this.root.appendChild(el);
      this.buttons.push({ def, el });
    }
    // steering buttons (optional mode)
    for (const [key, icon, left] of [
      ['steerLeft', '◀', 24],
      ['steerRight', '▶', 150],
    ] as const) {
      const el = document.createElement('div');
      el.className = 'tbtn steer';
      el.style.width = el.style.height = '108px';
      el.style.left = `calc(${left}px + var(--safe-l))`;
      el.style.bottom = `calc(28px + var(--safe-b))`;
      el.innerHTML = `<span class="ic">${icon}</span>`;
      this.root.appendChild(el);
      this.buttons.push({ def: { key, label: '', icon, size: 108, right: 0, bottom: 0, modes: ['car'] }, el });
    }
    const opts = { passive: false } as AddEventListenerOptions;
    this.layer.addEventListener('pointerdown', (e) => this.down(e), opts);
    this.layer.addEventListener('pointermove', (e) => this.move(e), opts);
    this.layer.addEventListener('pointerup', (e) => this.up(e), opts);
    this.layer.addEventListener('pointercancel', (e) => this.up(e), opts);
    this.layer.addEventListener('lostpointercapture', (e) => this.up(e), opts);
    window.addEventListener('touchstart', () => this.show(true), { passive: true, once: false });
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.show(coarse);
    this.setMode('foot');
  }

  show(v: boolean): void {
    if (v === this.visible) return;
    this.visible = v;
    this.root.style.display = v ? 'block' : 'none';
  }

  setModeIfChanged(mode: 'car' | 'foot'): void {
    if (mode !== this.mode) this.setMode(mode);
  }

  setMode(mode: 'car' | 'foot'): void {
    this.mode = mode;
    for (const b of this.buttons) {
      let on = b.def.modes.includes(mode);
      if (b.def.key === 'steerLeft' || b.def.key === 'steerRight') on = mode === 'car' && this.steerButtons;
      b.el.style.display = on ? 'flex' : 'none';
    }
    this.releaseAll();
  }

  private releaseAll(): void {
    const t = this.input.touch;
    t.gas = t.brake = t.handbrake = t.fire = t.sprint = t.horn = t.enter = t.action = t.steerLeft = t.steerRight = false;
    t.stickActive = false;
    t.stickX = t.stickY = 0;
    this.pointers.clear();
    this.prevActive.clear();
    this.stickBase.style.display = 'none';
    for (const b of this.buttons) b.el.classList.remove('on');
  }

  private inStickZone(x: number, y: number): boolean {
    if (this.mode === 'car' && this.steerButtons) return false;
    return x < window.innerWidth * 0.46 && y > window.innerHeight * 0.18;
  }

  private down(e: PointerEvent): void {
    e.preventDefault();
    this.show(true);
    this.input.markTouch();
    try {
      this.layer.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const stick = this.inStickZone(e.clientX, e.clientY) && ![...this.pointers.values()].some((p) => p.stick);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, stick, sx: e.clientX, sy: e.clientY });
    if (stick) {
      this.stickBase.style.display = 'block';
      this.stickBase.style.left = `${e.clientX}px`;
      this.stickBase.style.top = `${e.clientY}px`;
      this.stickKnob.style.transform = 'translate(-50%, -50%)';
    }
    this.refresh();
  }

  private move(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    p.x = e.clientX;
    p.y = e.clientY;
    if (p.stick) {
      let dx = p.x - p.sx;
      let dy = p.y - p.sy;
      const d = Math.hypot(dx, dy);
      const R = this.stickRadius;
      if (d > R * 1.6) {
        // drag the base along so the stick never "runs out"
        const k = (d - R * 1.6) / d;
        p.sx += dx * k;
        p.sy += dy * k;
        this.stickBase.style.left = `${p.sx}px`;
        this.stickBase.style.top = `${p.sy}px`;
        dx = p.x - p.sx;
        dy = p.y - p.sy;
      }
      const cl = Math.min(1, Math.hypot(dx, dy) / R);
      const ang = Math.atan2(dy, dx);
      const kx = Math.cos(ang) * cl;
      const ky = Math.sin(ang) * cl;
      this.stickKnob.style.transform = `translate(calc(-50% + ${kx * R}px), calc(-50% + ${ky * R}px))`;
    }
    this.refresh();
  }

  private up(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.stick) this.stickBase.style.display = 'none';
    this.refresh();
  }

  private refresh(): void {
    const t = this.input.touch;
    const active = new Set<BtnKey>();
    let stickX = 0;
    let stickY = 0;
    let stickActive = false;
    for (const p of this.pointers.values()) {
      if (p.stick) {
        const dx = p.x - p.sx;
        const dy = p.y - p.sy;
        const R = this.stickRadius;
        const d = Math.hypot(dx, dy);
        const dead = 6;
        if (d > dead) {
          const cl = Math.min(1, (d - dead) / (R - dead));
          stickX = (dx / d) * cl;
          stickY = (-dy / d) * cl;
        }
        stickActive = true;
        continue;
      }
      for (const b of this.buttons) {
        if (b.el.style.display === 'none') continue;
        const r = b.el.getBoundingClientRect();
        const pad = 10;
        if (p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad) {
          active.add(b.def.key);
          break;
        }
      }
    }
    t.stickActive = stickActive;
    t.stickX = stickX;
    t.stickY = stickY;
    t.gas = active.has('gas');
    t.brake = active.has('brake');
    t.handbrake = active.has('handbrake');
    t.fire = active.has('fire');
    t.sprint = active.has('sprint');
    t.horn = active.has('horn');
    t.enter = active.has('enter');
    t.action = active.has('action');
    t.steerLeft = active.has('steerLeft');
    t.steerRight = active.has('steerRight');
    // Latch presses so a quick tap that starts and ends between two frames still counts.
    for (const k of active) {
      if (this.prevActive.has(k)) continue;
      if (k === 'enter') this.input.press('enterPressed');
      else if (k === 'fire') this.input.press('firePressed');
      else if (k === 'action') this.input.press('actionPressed');
    }
    this.prevActive = active;
    for (const b of this.buttons) b.el.classList.toggle('on', active.has(b.def.key) && b.el.style.display !== 'none');
  }
}
