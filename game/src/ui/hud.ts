// Heads-up display: radar, money, wanted level, health, banners, speedometer, messages.
import type { City } from '../world/city';
import { MAP_W, MAP_H, TILE, G, WORLD_W, WORLD_H } from '../world/types';
import { formatEuro } from '../core/math';

export interface Blip {
  x: number;
  y: number;
  color: string;
  size?: number;
  shape?: 'dot' | 'square' | 'tri' | 'letter';
  angle?: number;
  /** letter for contact blips */
  label?: string;
}

function buildMinimap(city: City): HTMLCanvasElement {
  const S = 2; // px per tile
  const c = document.createElement('canvas');
  c.width = MAP_W * S;
  c.height = MAP_H * S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(c.width, c.height);
  const col = (g: number, flags: number): [number, number, number] => {
    if (flags & 1) return [78, 82, 92];
    switch (g) {
      case G.Water:
        return [38, 70, 110];
      case G.Grass:
      case G.Forest:
        return [52, 78, 46];
      case G.Sidewalk:
      case G.Pavers:
      case G.Quay:
      case G.BridgeWalk:
        return [118, 118, 116];
      case G.Wall:
        return [20, 22, 24];
      default:
        return [96, 96, 92];
    }
  };
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const i = ty * MAP_W + tx;
      let [r, g, b] = col(city.ground[i], city.flags[i]);
      if (city.solid[i] === 1) [r, g, b] = [150, 142, 128];
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = tx * S + sx;
          const py = (MAP_H - 1 - ty) * S + sy; // north up
          const o = (py * c.width + px) * 4;
          img.data[o] = r;
          img.data[o + 1] = g;
          img.data[o + 2] = b;
          img.data[o + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export class HUD {
  readonly root: HTMLElement;
  private radar: HTMLCanvasElement;
  get radarEl(): HTMLCanvasElement {
    return this.radar;
  }
  private rctx: CanvasRenderingContext2D;
  readonly minimap: HTMLCanvasElement;
  private elMoney: HTMLElement;
  private elWanted: HTMLElement;
  private elHp: HTMLElement;
  private elArmor: HTMLElement;
  private elWeapon: HTMLElement;
  private elBanner: HTMLElement;
  private elVBanner: HTMLElement;
  private elSpeed: HTMLElement;
  private elCenter: HTMLElement;
  private elHint: HTMLElement;
  private elFps: HTMLElement;
  readonly btnPause: HTMLElement;
  readonly btnRadio: HTMLElement;
  readonly btnWeapon: HTMLElement;
  private elHurt: HTMLElement;
  private hurtA = 0;
  private elPText: HTMLElement;
  private ptextT = 0;
  private elRadio: HTMLElement;
  private radioT = 0;
  private elObj: HTMLElement;
  private elTimer: HTMLElement;
  private elArrow: HTMLElement;
  private elTitle: HTMLElement;
  private titleT = 0;
  private elFade: HTMLElement;
  private lastObj = '';
  private lastTimer = '';
  /** GPS route for the radar (world points) */
  gps: { x: number; y: number }[] = [];
  private last = { money: -1, wanted: -1, hp: -1, armor: -1, speed: -1, weapon: '' };
  private bannerT = 0;
  private vbannerT = 0;
  private centerT = 0;
  private hintT = 0;
  private lastDistrict = '';
  radarRange = 140; // metres across the radar radius*2

  constructor(parent: HTMLElement, city: City) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    parent.appendChild(this.root);
    this.root.innerHTML = `
      <canvas class="radar" width="160" height="160"></canvas>
      <div class="bars">
        <div class="bar hp"><div></div></div>
        <div class="bar armor"><div></div></div>
        <div class="weapon">Fäuste</div>
      </div>
      <div class="stats"><div class="money">0 €</div><div class="wanted">${'<i></i>'.repeat(6)}</div></div>
      <div class="topbtns"><div class="ubtn radio" style="display:none">♫</div><div class="ubtn pause">II</div></div>
      <div class="banner"></div>
      <div class="vbanner"></div>
      <div class="ptext"></div>
      <div class="rbanner"></div>
      <div class="objective"></div>
      <div class="mtimer"></div>
      <div class="tarrow">➤</div>
      <div class="titlecard"><b></b><small></small></div>
      <div class="fadeov"></div>
      <div class="speedo" style="display:none"></div>
      <div class="center-msg"></div>
      <div class="hint"></div>
      <div class="fps"></div>
      <div class="hurt"></div>`;
    this.radar = this.root.querySelector('canvas.radar') as HTMLCanvasElement;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.radar.width = this.radar.height = Math.round(160 * dpr);
    this.rctx = this.radar.getContext('2d')!;
    this.minimap = buildMinimap(city);
    this.elMoney = this.root.querySelector('.money') as HTMLElement;
    this.elWanted = this.root.querySelector('.wanted') as HTMLElement;
    this.elHp = this.root.querySelector('.bar.hp > div') as HTMLElement;
    this.elArmor = this.root.querySelector('.bar.armor > div') as HTMLElement;
    this.elWeapon = this.root.querySelector('.weapon') as HTMLElement;
    this.elBanner = this.root.querySelector('.banner') as HTMLElement;
    this.elVBanner = this.root.querySelector('.vbanner') as HTMLElement;
    this.elSpeed = this.root.querySelector('.speedo') as HTMLElement;
    this.elCenter = this.root.querySelector('.center-msg') as HTMLElement;
    this.elHint = this.root.querySelector('.hint') as HTMLElement;
    this.elFps = this.root.querySelector('.fps') as HTMLElement;
    this.btnPause = this.root.querySelector('.pause') as HTMLElement;
    this.btnRadio = this.root.querySelector('.radio') as HTMLElement;
    this.btnWeapon = this.elWeapon;
    this.elHurt = this.root.querySelector('.hurt') as HTMLElement;
    this.elPText = this.root.querySelector('.ptext') as HTMLElement;
    this.elRadio = this.root.querySelector('.rbanner') as HTMLElement;
    this.elObj = this.root.querySelector('.objective') as HTMLElement;
    this.elTimer = this.root.querySelector('.mtimer') as HTMLElement;
    this.elArrow = this.root.querySelector('.tarrow') as HTMLElement;
    this.elTitle = this.root.querySelector('.titlecard') as HTMLElement;
    this.elFade = this.root.querySelector('.fadeov') as HTMLElement;
  }

  /** mission objective line (empty hides it) and timer (seconds or null) */
  mission(objective: string, timer: number | null): void {
    if (objective !== this.lastObj) {
      this.lastObj = objective;
      this.elObj.textContent = objective;
      this.elObj.style.display = objective ? 'block' : 'none';
    }
    const t = timer === null ? '' : `${Math.floor(Math.max(0, timer) / 60)}:${String(Math.floor(Math.max(0, timer) % 60)).padStart(2, '0')}`;
    if (t !== this.lastTimer) {
      this.lastTimer = t;
      this.elTimer.textContent = t;
      this.elTimer.style.display = t ? 'block' : 'none';
      this.elTimer.classList.toggle('low', timer !== null && timer < 10);
    }
  }

  objectiveFlash(): void {
    this.elObj.classList.remove('flash');
    void this.elObj.offsetWidth;
    this.elObj.classList.add('flash');
  }

  /** screen-edge arrow towards an off-screen target (sx, sy in CSS px) */
  targetArrow(show: boolean, sx = 0, sy = 0, color = '#ffd84a'): void {
    if (!show) {
      this.elArrow.style.display = 'none';
      return;
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cx = W / 2;
    const cy = H / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const m = 34;
    const k = Math.min((W / 2 - m) / Math.max(1e-3, Math.abs(dx)), (H / 2 - m) / Math.max(1e-3, Math.abs(dy)));
    const x = cx + dx * k;
    const y = cy + dy * k;
    this.elArrow.style.display = 'block';
    this.elArrow.style.left = `${x}px`;
    this.elArrow.style.top = `${y}px`;
    this.elArrow.style.color = color;
    this.elArrow.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(dy, dx)}rad)`;
  }

  titleCard(text: string, sub: string, secs: number): void {
    (this.elTitle.querySelector('b') as HTMLElement).textContent = text;
    (this.elTitle.querySelector('small') as HTMLElement).textContent = sub;
    this.elTitle.classList.add('show');
    this.titleT = secs;
  }

  /** fade the screen to black (1) or back (0) */
  fade(to: number, secs: number): void {
    this.elFade.style.transition = `opacity ${secs}s linear`;
    this.elFade.style.opacity = String(to);
  }

  /** radio station banner; `delay` lets the vehicle name show first */
  radioName(name: string, tagline: string, delay = 0): void {
    const show = (): void => {
      this.elRadio.innerHTML = `<b>♫ ${name}</b>${tagline ? `<small>${tagline}</small>` : ''}`;
      this.elRadio.classList.add('show');
      this.radioT = 2.6;
    };
    if (delay > 0) setTimeout(show, delay * 1000);
    else show();
  }

  /** GTA 2 style red pickup text */
  pickupText(text: string, color = '#ff4a3a'): void {
    this.elPText.textContent = text;
    this.elPText.style.color = color;
    this.elPText.classList.remove('show');
    void this.elPText.offsetWidth;
    this.elPText.classList.add('show');
    this.ptextT = 1.6;
  }

  showFps(on: boolean): void {
    this.elFps.style.display = on ? 'block' : 'none';
  }

  /** red screen-edge flash when the player takes damage (0..1) */
  hurt(a: number): void {
    this.hurtA = Math.min(1, Math.max(this.hurtA, a * 0.8 + 0.2));
  }

  district(name: string): void {
    if (!name || name === this.lastDistrict) return;
    this.lastDistrict = name;
    this.elBanner.textContent = name;
    this.elBanner.classList.add('show');
    this.bannerT = 3.2;
  }

  vehicleName(name: string): void {
    this.elVBanner.textContent = name;
    this.elVBanner.classList.add('show');
    this.vbannerT = 2.6;
  }

  center(text: string, secs = 2.5, color = '#ffffff'): void {
    this.elCenter.textContent = text;
    this.elCenter.style.color = color;
    this.elCenter.classList.add('show');
    this.centerT = secs;
  }

  clearHint(): void {
    this.hintT = 0;
    this.elHint.classList.remove('show');
  }

  hint(text: string, secs = 2.5): void {
    this.elHint.textContent = text;
    this.elHint.classList.add('show');
    this.hintT = secs;
  }

  update(
    dt: number,
    s: {
      money: number;
      wanted: number;
      wantedFlash: boolean;
      hp: number;
      armor: number;
      weapon: string;
      speedKmh: number | null;
      px: number;
      py: number;
      heading: number;
      blips: Blip[];
      fps: number;
      inVehicle: boolean;
    },
  ): void {
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) this.elBanner.classList.remove('show');
    if (this.vbannerT > 0 && (this.vbannerT -= dt) <= 0) this.elVBanner.classList.remove('show');
    if (this.centerT > 0 && (this.centerT -= dt) <= 0) this.elCenter.classList.remove('show');
    if (this.hintT > 0 && (this.hintT -= dt) <= 0) this.elHint.classList.remove('show');
    if (this.ptextT > 0 && (this.ptextT -= dt) <= 0) this.elPText.classList.remove('show');
    if (this.radioT > 0 && (this.radioT -= dt) <= 0) this.elRadio.classList.remove('show');
    if (this.titleT > 0 && (this.titleT -= dt) <= 0) this.elTitle.classList.remove('show');
    if (this.hurtA > 0) {
      this.hurtA = Math.max(0, this.hurtA - dt * 1.6);
      this.elHurt.style.opacity = this.hurtA.toFixed(3);
    }
    const L = this.last;
    const money = Math.round(s.money);
    if (money !== L.money) {
      L.money = money;
      this.elMoney.textContent = formatEuro(money);
    }
    if (s.wanted !== L.wanted) {
      L.wanted = s.wanted;
      const lights = this.elWanted.children;
      for (let i = 0; i < lights.length; i++) (lights[i] as HTMLElement).classList.toggle('on', i < s.wanted);
    }
    this.elWanted.classList.toggle('flash', s.wantedFlash);
    const hp = Math.round(s.hp);
    if (hp !== L.hp) {
      L.hp = hp;
      this.elHp.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    }
    const ar = Math.round(s.armor);
    if (ar !== L.armor) {
      L.armor = ar;
      this.elArmor.style.width = `${Math.max(0, Math.min(100, ar))}%`;
      (this.elArmor.parentElement as HTMLElement).style.visibility = ar > 0 ? 'visible' : 'hidden';
    }
    if (s.weapon !== L.weapon) {
      L.weapon = s.weapon;
      this.elWeapon.textContent = s.weapon;
    }
    if (s.speedKmh === null) {
      if (L.speed !== -1) {
        this.elSpeed.style.display = 'none';
        L.speed = -1;
      }
    } else {
      const sp = Math.round(s.speedKmh);
      if (sp !== L.speed) {
        if (L.speed === -1) this.elSpeed.style.display = 'block';
        L.speed = sp;
        this.elSpeed.innerHTML = `${sp}<small>km/h</small>`;
      }
    }
    this.btnRadio.style.display = s.inVehicle ? 'flex' : 'none';
    this.elFps.textContent = `${s.fps.toFixed(0)} fps`;
    this.drawRadar(s.px, s.py, s.heading, s.blips);
  }

  private drawRadar(px: number, py: number, heading: number, blips: Blip[]): void {
    const ctx = this.rctx;
    const Wpx = this.radar.width;
    const R = Wpx / 2;
    const range = this.radarRange; // metres from centre to edge
    const scale = R / range; // px per metre
    ctx.save();
    ctx.clearRect(0, 0, Wpx, Wpx);
    ctx.beginPath();
    ctx.arc(R, R, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#16191e';
    ctx.fillRect(0, 0, Wpx, Wpx);
    // minimap: 2 px per tile = 0.5 px per metre, north up
    const mm = this.minimap;
    const mmScale = 2 / TILE; // minimap px per metre
    const srcX = px * mmScale - (range * mmScale);
    const srcY = (WORLD_H - py) * mmScale - (range * mmScale);
    const srcW = range * 2 * mmScale;
    ctx.globalAlpha = 0.95;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mm, srcX, srcY, srcW, srcW, 0, 0, Wpx, Wpx);
    ctx.globalAlpha = 1;
    // GPS route
    if (this.gps.length > 1) {
      ctx.strokeStyle = 'rgba(255,216,74,0.9)';
      ctx.lineWidth = 4 * (Wpx / 160);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < this.gps.length; i++) {
        const gx = R + (this.gps[i].x - px) * scale;
        const gy = R - (this.gps[i].y - py) * scale;
        if (i === 0) ctx.moveTo(gx, gy);
        else ctx.lineTo(gx, gy);
      }
      ctx.stroke();
    }
    // blips
    for (const b of blips) {
      let dx = (b.x - px) * scale;
      let dy = -(b.y - py) * scale;
      const d = Math.hypot(dx, dy);
      const edge = R - 7;
      const clampEdge = d > edge;
      if (clampEdge) {
        dx = (dx / d) * edge;
        dy = (dy / d) * edge;
      }
      ctx.fillStyle = b.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 2;
      const sz = (b.size ?? 5) * (Wpx / 160);
      ctx.beginPath();
      if (b.shape === 'letter') {
        const lr = sz * 1.5;
        ctx.arc(R + dx, R + dy, lr, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10,12,16,0.9)';
        ctx.fill();
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = b.color;
        ctx.font = `900 ${Math.round(lr * 1.3)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.label ?? '?', R + dx, R + dy + 1);
        continue;
      }
      if (b.shape === 'square') ctx.rect(R + dx - sz, R + dy - sz, sz * 2, sz * 2);
      else if (b.shape === 'tri') {
        ctx.moveTo(R + dx, R + dy - sz * 1.3);
        ctx.lineTo(R + dx + sz * 1.1, R + dy + sz * 0.9);
        ctx.lineTo(R + dx - sz * 1.1, R + dy + sz * 0.9);
        ctx.closePath();
      } else ctx.arc(R + dx, R + dy, sz, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // player arrow
    ctx.translate(R, R);
    ctx.rotate(-heading + Math.PI / 2);
    const a = 8 * (Wpx / 160);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -a * 1.3);
    ctx.lineTo(a * 0.85, a);
    ctx.lineTo(0, a * 0.45);
    ctx.lineTo(-a * 0.85, a);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // north marker
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `bold ${Math.round(12 * (Wpx / 160))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('N', R, 14 * (Wpx / 160));
    void WORLD_W;
  }
}
