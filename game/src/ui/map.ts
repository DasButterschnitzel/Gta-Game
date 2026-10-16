// Full-screen city map: pan by dragging, zoom with buttons / wheel / pinch; districts and places.
import type { City } from '../world/city';
import { DISTRICT_NAMES, MAP_W, MAP_H, TILE, WORLD_H, WORLD_W } from '../world/types';
import type { Blip } from './hud';

interface Place {
  x: number;
  y: number;
  icon: string;
  label: string;
  color: string;
}

const PLACE_STYLE: Record<string, { icon: string; color: string; label?: string }> = {
  safehouse: { icon: '⌂', color: '#ffd84a', label: "Gül's Grill (Unterschlupf)" },
  paint1: { icon: '✎', color: '#7ce07c' },
  paint2: { icon: '✎', color: '#7ce07c' },
  hospital: { icon: '✚', color: '#ff6a6a' },
  police: { icon: '★', color: '#6aa0ff' },
  hbf: { icon: '▣', color: '#e8e8e8' },
  knockout: { icon: '♣', color: '#ff7ad8' },
  turbine: { icon: '♦', color: '#7af0ff' },
  herbie: { icon: '€', color: '#e8c070' },
  start: { icon: '▲', color: '#a0a0a0' },
};

export class MapView {
  readonly root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private places: Place[] = [];
  private labels: { x: number; y: number; name: string }[] = [];
  /** view centre (world metres) and scale (screen px per metre) */
  private cx = 800;
  private cy = 800;
  private scale = 0.5;
  private drag: { id: number; x: number; y: number }[] = [];
  private pinchD = 0;
  private open = false;
  private player = { x: 0, y: 0, heading: 0 };
  private blips: Blip[] = [];
  onClose: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    city: City,
    private minimap: HTMLCanvasElement,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'mapview';
    this.root.style.display = 'none';
    this.root.innerHTML = `<canvas></canvas>
      <div class="mapbar"><button class="mbtn zin">+</button><button class="mbtn zout">−</button><button class="mbtn me">◎</button><button class="mbtn close">✕ ZURÜCK</button></div>
      <div class="maptitle">NEUHAFEN</div>`;
    parent.appendChild(this.root);
    this.canvas = this.root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    const q = (s: string): HTMLElement => this.root.querySelector(s) as HTMLElement;
    q('.zin').addEventListener('click', () => this.zoom(1.5));
    q('.zout').addEventListener('click', () => this.zoom(1 / 1.5));
    q('.me').addEventListener('click', () => {
      this.cx = this.player.x;
      this.cy = this.player.y;
      this.draw();
    });
    q('.close').addEventListener('click', () => this.onClose?.());
    // district label positions = centroid of their tiles
    const sum = new Map<number, { x: number; y: number; n: number }>();
    for (let ty = 0; ty < MAP_H; ty += 2) {
      for (let tx = 0; tx < MAP_W; tx += 2) {
        const d = city.district[ty * MAP_W + tx];
        if (!d) continue;
        const e = sum.get(d) ?? { x: 0, y: 0, n: 0 };
        e.x += tx;
        e.y += ty;
        e.n++;
        sum.set(d, e);
      }
    }
    for (const [d, e] of sum) {
      if (e.n < 40) continue;
      this.labels.push({ x: (e.x / e.n + 0.5) * TILE, y: (e.y / e.n + 0.5) * TILE, name: DISTRICT_NAMES[d] });
    }
    for (const [id, p] of city.pois) {
      const st = PLACE_STYLE[id];
      if (!st) continue;
      this.places.push({ x: p.x, y: p.y, icon: st.icon, color: st.color, label: st.label ?? p.label ?? id });
    }
    // input
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.drag.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
      if (this.drag.length === 2) this.pinchD = Math.hypot(this.drag[0].x - this.drag[1].x, this.drag[0].y - this.drag[1].y);
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.drag.find((d) => d.id === e.pointerId);
      if (!p) return;
      if (this.drag.length === 1) {
        this.cx -= (e.clientX - p.x) / this.scale;
        this.cy += (e.clientY - p.y) / this.scale;
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.drag.length === 2) {
        const d = Math.hypot(this.drag[0].x - this.drag[1].x, this.drag[0].y - this.drag[1].y);
        if (this.pinchD > 0) this.zoom(d / this.pinchD, false);
        this.pinchD = d;
      }
      this.draw();
    });
    const up = (e: PointerEvent): void => {
      this.drag = this.drag.filter((d) => d.id !== e.pointerId);
      this.pinchD = 0;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2);
    }, { passive: false });
  }

  get isOpen(): boolean {
    return this.open;
  }

  private zoom(k: number, redraw = true): void {
    this.scale = Math.min(4, Math.max(0.18, this.scale * k));
    if (redraw) this.draw();
  }

  show(on: boolean, px = 0, py = 0, heading = 0, blips: Blip[] = []): void {
    this.open = on;
    this.root.style.display = on ? 'block' : 'none';
    if (!on) return;
    this.player = { x: px, y: py, heading };
    this.blips = blips;
    this.cx = px;
    this.cy = py;
    const minDim = Math.min(window.innerWidth, window.innerHeight);
    this.scale = Math.max(0.3, minDim / 900);
    this.draw();
  }

  draw(): void {
    if (!this.open) return;
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.width = `${W}px`;
      c.style.height = `${H}px`;
    }
    // keep the view inside the city
    const hw = W / 2 / this.scale;
    const hh = H / 2 / this.scale;
    this.cx = hw * 2 >= WORLD_W ? WORLD_W / 2 : Math.min(WORLD_W - hw, Math.max(hw, this.cx));
    this.cy = hh * 2 >= WORLD_H ? WORLD_H / 2 : Math.min(WORLD_H - hh, Math.max(hh, this.cy));
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0e1116';
    ctx.fillRect(0, 0, W, H);
    const sx = (x: number): number => W / 2 + (x - this.cx) * this.scale;
    const sy = (y: number): number => H / 2 - (y - this.cy) * this.scale;
    // minimap image: 2 px per tile, north up (row 0 = north edge)
    const mmPerM = 2 / TILE;
    ctx.imageSmoothingEnabled = this.scale < 1.2;
    ctx.drawImage(this.minimap, sx(0), sy(WORLD_H), (this.minimap.width / mmPerM) * this.scale, (this.minimap.height / mmPerM) * this.scale);
    // district names
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(Math.max(12, Math.min(26, 16 * this.scale * 2)))}px system-ui, sans-serif`;
    (ctx as unknown as { letterSpacing: string }).letterSpacing = '3px';
    for (const l of this.labels) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillText(l.name.toUpperCase(), sx(l.x) + 2, sy(l.y) + 2);
      ctx.fillStyle = 'rgba(255,236,170,0.5)';
      ctx.fillText(l.name.toUpperCase(), sx(l.x), sy(l.y));
    }
    (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
    // places
    ctx.font = '700 12px system-ui, sans-serif';
    for (const p of this.places) {
      const x = sx(p.x);
      const y = sy(p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.fillText(p.icon, x, y + 1);
      if (this.scale > 0.45) {
        ctx.font = '700 11px system-ui, sans-serif';
        const tw = ctx.measureText(p.label).width + 10;
        ctx.fillStyle = 'rgba(10,12,16,0.78)';
        ctx.beginPath();
        ctx.roundRect(x - tw / 2, y + 13, tw, 16, 5);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(p.label, x, y + 21.5);
      }
    }
    // blips (police, mission targets...)
    for (const b of this.blips) {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(sx(b.x), sy(b.y), (b.size ?? 4) * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // player arrow
    const px = sx(this.player.x);
    const py = sy(this.player.y);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-this.player.heading + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
