// Heads-up display: radar, money, wanted level, health, banners, speedometer, messages.
import type { City } from '../world/city';
import { MAP_W, MAP_H, TILE, G, WORLD_W, WORLD_H } from '../world/types';
import { formatEuro } from '../core/math';

export interface Blip {
  x: number;
  y: number;
  color: string;
  size?: number;
  shape?: 'dot' | 'square' | 'tri';
  angle?: number;
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
  private rctx: CanvasRenderingContext2D;
  private minimap: HTMLCanvasElement;
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
      <div class="speedo" style="display:none"></div>
      <div class="center-msg"></div>
      <div class="hint"></div>
      <div class="fps"></div>`;
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
      if (b.shape === 'square') ctx.rect(R + dx - sz, R + dy - sz, sz * 2, sz * 2);
      else ctx.arc(R + dx, R + dy, sz, 0, Math.PI * 2);
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
