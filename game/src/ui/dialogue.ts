// Comic-panel dialogue scenes (Chinatown Wars style): portrait + speech bubble, tap to continue.
import { portrait } from '../render/portraits';

export interface Line {
  /** face id (see portraits.ts) or 'caption' for a narration box */
  who: string;
  text: string;
  /** override the displayed name */
  name?: string;
}

export const NAMES: Record<string, string> = {
  kai: 'Kai',
  dende: 'Dende',
  gul: 'Gül',
  herbie: 'Onkel Herbie',
  uschi: 'Uschi Brandt',
  lenny: 'Lenny',
  ruhland: 'KHK Ruhland',
  lena: 'Lena',
  achterberg: 'Dr. Achterberg',
  tamsen: 'Kapitän Tamsen',
  bulle: 'Bulle Brückner',
  kalle: 'Kalle',
  mikki: 'Mikki',
  jansen: 'Jansen',
  cop: 'Polizei',
  wirt: 'Wirt',
  neon: 'NEON-Typ',
  tuersteher: 'Türsteher',
  mehlhorn: 'Mehlhorn',
};

export class DialogueUI {
  readonly root: HTMLElement;
  private panel: HTMLElement;
  private img: HTMLImageElement;
  private nameEl: HTMLElement;
  private textEl: HTMLElement;
  private caption: HTMLElement;
  private lines: Line[] = [];
  private idx = 0;
  private shown = 0;
  private full = '';
  private typing = false;
  private resolve: (() => void) | null = null;
  private t = 0;
  active = false;
  /** called for every new line (sound hook) */
  onLine: ((l: Line) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'dialog';
    this.root.style.display = 'none';
    this.root.innerHTML = `
      <div class="dlg-caption"></div>
      <div class="dlg-panel">
        <div class="dlg-face"><img alt=""><div class="dlg-name"></div></div>
        <div class="dlg-bubble"><div class="dlg-text"></div><div class="dlg-more">▼</div></div>
      </div>
      <button class="dlg-skip">ÜBERSPRINGEN ⏭</button>`;
    parent.appendChild(this.root);
    this.panel = this.root.querySelector('.dlg-panel') as HTMLElement;
    this.img = this.root.querySelector('.dlg-face img') as HTMLImageElement;
    this.nameEl = this.root.querySelector('.dlg-name') as HTMLElement;
    this.textEl = this.root.querySelector('.dlg-text') as HTMLElement;
    this.caption = this.root.querySelector('.dlg-caption') as HTMLElement;
    const skip = this.root.querySelector('.dlg-skip') as HTMLElement;
    skip.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.finish();
    });
    this.root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.advance();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyF') {
        e.preventDefault();
        this.advance();
      } else if (e.code === 'Escape') this.finish();
    });
  }

  play(lines: Line[]): Promise<void> {
    this.lines = lines;
    this.idx = 0;
    this.active = true;
    this.root.style.display = 'block';
    this.show();
    return new Promise((r) => {
      this.resolve = r;
    });
  }

  private show(): void {
    const l = this.lines[this.idx];
    if (!l) {
      this.finish();
      return;
    }
    this.onLine?.(l);
    if (l.who === 'caption') {
      this.panel.style.display = 'none';
      this.caption.style.display = 'block';
      this.caption.textContent = l.text;
      this.typing = false;
      return;
    }
    this.caption.style.display = 'none';
    this.panel.style.display = 'flex';
    const right = l.who !== 'kai';
    this.panel.classList.toggle('right', right);
    this.img.src = portrait(l.who);
    this.nameEl.textContent = l.name ?? NAMES[l.who] ?? l.who;
    this.full = l.text;
    this.shown = 0;
    this.typing = true;
    this.textEl.textContent = '';
    this.panel.classList.remove('pop');
    void this.panel.offsetWidth;
    this.panel.classList.add('pop');
  }

  /** typewriter; call every frame */
  update(dt: number): void {
    if (!this.active || !this.typing) return;
    this.t += dt;
    const n = Math.min(this.full.length, this.shown + Math.max(1, Math.floor(dt * 55)));
    if (n !== this.shown) {
      this.shown = n;
      this.textEl.textContent = this.full.slice(0, n);
    }
    if (this.shown >= this.full.length) this.typing = false;
  }

  private advance(): void {
    if (!this.active) return;
    if (this.typing) {
      this.shown = this.full.length;
      this.textEl.textContent = this.full;
      this.typing = false;
      return;
    }
    this.idx++;
    if (this.idx >= this.lines.length) this.finish();
    else this.show();
  }

  finish(): void {
    if (!this.active) return;
    this.active = false;
    this.root.style.display = 'none';
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }
}
