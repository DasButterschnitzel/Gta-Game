// Pause menu with settings; opens the full-screen map.
import type { Settings } from '../core/settings';

export interface StatusInfo {
  gangs: { name: string; color: string; value: number; known: boolean }[];
  lines: [string, string][];
}

export interface MenuHost {
  settings: Settings;
  status(): StatusInfo;
  resume(): void;
  openMap(): void;
  applySettings(): void;
  quit: (() => void) | null;
  version: string;
}

type Panel = 'main' | 'settings' | 'help' | 'status';

export class PauseMenu {
  readonly root: HTMLElement;
  private panel: Panel = 'main';
  private open = false;

  constructor(
    parent: HTMLElement,
    private host: MenuHost,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'pausemenu';
    this.root.style.display = 'none';
    parent.appendChild(this.root);
    // stop touches from reaching the game controls underneath
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'touchstart']) this.root.addEventListener(ev, (e) => e.stopPropagation());
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(on: boolean): void {
    this.open = on;
    this.root.style.display = on ? 'flex' : 'none';
    if (on) this.render('main');
  }

  /** Android back button: go up one level; returns false when the menu should close */
  back(): boolean {
    if (!this.open) return false;
    if (this.panel !== 'main') {
      this.render('main');
      return true;
    }
    return false;
  }

  private render(panel: Panel): void {
    this.panel = panel;
    const s = this.host.settings;
    if (panel === 'main') {
      this.root.innerHTML = `
        <div class="pm-box">
          <div class="pm-title">PAUSE</div>
          <button class="pm-btn primary" data-a="resume">WEITER</button>
          <button class="pm-btn" data-a="map">KARTE</button>
          <button class="pm-btn" data-a="status">STATUS &amp; GANGS</button>
          <button class="pm-btn" data-a="settings">EINSTELLUNGEN</button>
          <button class="pm-btn" data-a="help">STEUERUNG</button>
          ${this.host.quit ? '<button class="pm-btn danger" data-a="quit">SPIEL BEENDEN</button>' : ''}
          <div class="pm-foot">HAFENGOLD ${this.host.version} · offline</div>
        </div>`;
    } else if (panel === 'status') {
      const st = this.host.status();
      const bar = (v: number): string => {
        const w = Math.abs(v) / 2;
        return `<div class="rs-bar"><i style="${v >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`};background:${v >= 0 ? '#5aff6a' : '#ff5a4a'}"></i><b></b></div>`;
      };
      const mood = (v: number): string => (v > 25 ? 'freundlich' : v < -25 ? 'feindlich' : 'neutral');
      this.root.innerHTML = `
        <div class="pm-box wide">
          <div class="pm-title">STATUS</div>
          <div class="rs-list">${st.gangs
            .map((gg) => (gg.known ? `<div class="rs-row"><span class="rs-name" style="color:${gg.color}">${gg.name}</span>${bar(gg.value)}<span class="rs-mood ${mood(gg.value)}">${mood(gg.value)}</span></div>` : `<div class="rs-row unknown"><span class="rs-name">???</span><div class="rs-bar"><b></b></div><span class="rs-mood">unbekannt</span></div>`))
            .join('')}</div>
          <div class="rs-lines">${st.lines.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
          <button class="pm-btn" data-a="main">ZURÜCK</button>
        </div>`;
    } else if (panel === 'settings') {
      const seg = (key: string, opts: [string, string][], val: string): string =>
        `<div class="pm-seg" data-k="${key}">${opts.map(([v, l]) => `<button class="${v === val ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
      this.root.innerHTML = `
        <div class="pm-box wide">
          <div class="pm-title">EINSTELLUNGEN</div>
          <label class="pm-row"><span>Effekte</span><input type="range" min="0" max="100" value="${Math.round(s.sfx * 100)}" data-k="sfx"></label>
          <label class="pm-row"><span>Radio / Musik</span><input type="range" min="0" max="100" value="${Math.round(s.music * 100)}" data-k="music"></label>
          <div class="pm-row"><span>Lenkung (Touch)</span>${seg('steer', [['dir', 'Richtung'], ['stick', 'Stick'], ['buttons', '◀ ▶']], s.steer)}</div>
          <div class="pm-row"><span>Vibration</span>${seg('vibrate', [['1', 'An'], ['0', 'Aus']], s.vibrate ? '1' : '0')}</div>
          <div class="pm-row"><span>Grafik</span>${seg('quality', [['low', 'Niedrig'], ['mid', 'Mittel'], ['high', 'Hoch']], s.quality)}</div>
          <div class="pm-row"><span>FPS anzeigen</span>${seg('fps', [['1', 'An'], ['0', 'Aus']], s.fps ? '1' : '0')}</div>
          <button class="pm-btn" data-a="main">ZURÜCK</button>
        </div>`;
    } else {
      this.root.innerHTML = `
        <div class="pm-box wide">
          <div class="pm-title">STEUERUNG</div>
          <div class="pm-help">
            <p><b>Zu Fuß:</b> Linker Daumen bewegt Kai. <b>ANGRIFF</b> schlägt, schießt oder wirft (Ziel wird automatisch erfasst). <b>EINSTEIGEN</b> knackt das nächste Auto – sitzt jemand drin, fliegt er raus. Auf den Waffennamen tippen wechselt die Waffe.</p>
            <p><b>Im Auto:</b> Lenkung <b>Richtung</b>: Daumen links zeigt einfach dorthin, wo das Auto hinfahren soll (Bildschirm-Richtung). <b>Stick</b>: links/rechts lenkt wie ein Lenkrad. <b>GAS</b> / <b>BREMSE</b> (hält das Auto, fährt rückwärts), <b>HANDBREMSE</b> für Drifts. <b>FEUER</b> schießt mit Pistole oder MP aus dem Fenster. ♫ wechselt den Radiosender.</p>
            <p><b>Fahndung:</b> Blaue Lichter = Fahndungsstufe. Raus aus dem Blickfeld der Polizei, Streifenwagen rammen bis sie liegen bleiben (<b>Takedown</b>) oder ab in die <b>Lackiererei</b> (grünes Feld auf dem Radar).</p>
            <p><b>Ticken:</b> Dealer sind grüne € auf dem Radar – zu Fuß in den Kreis gehen. Billig kaufen, woanders teuer verkaufen, Tipps kommen aufs Handy. Vorsicht: manche Dealer sind Zivilfahnder, und wer festgenommen wird oder stirbt, ist die Ware los.</p>
            <p><b>Gangs:</b> Wer für eine Gang arbeitet, macht sich bei ihrer Rivalin unbeliebt. Feindliche Gangs greifen dich in ihrem Revier an. Der Stand steht unter Pause → Status.</p>
            <p><b>Tastatur:</b> WASD/Pfeile, Leertaste Handbremse, F Ein-/Aussteigen, J/Strg Angriff, Q/E Waffe, R Radio, H Hupe, M Karte, Esc Pause.</p>
          </div>
          <button class="pm-btn" data-a="main">ZURÜCK</button>
        </div>`;
    }
    this.bind();
  }

  private bind(): void {
    const s = this.host.settings;
    this.root.querySelectorAll<HTMLButtonElement>('button[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'resume') this.host.resume();
        else if (a === 'map') this.host.openMap();
        else if (a === 'settings') this.render('settings');
        else if (a === 'status') this.render('status');
        else if (a === 'help') this.render('help');
        else if (a === 'main') this.render('main');
        else if (a === 'quit') this.host.quit?.();
      }),
    );
    this.root.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const v = Number(inp.value) / 100;
        if (inp.dataset.k === 'sfx') s.sfx = v;
        else s.music = v;
        this.host.applySettings();
      }),
    );
    this.root.querySelectorAll<HTMLElement>('.pm-seg').forEach((seg) =>
      seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
        b.addEventListener('click', () => {
          const k = seg.dataset.k;
          const v = b.dataset.v!;
          if (k === 'steer') s.steer = v as Settings['steer'];
          else if (k === 'vibrate') s.vibrate = v === '1';
          else if (k === 'quality') s.quality = v as Settings['quality'];
          else if (k === 'fps') s.fps = v === '1';
          seg.querySelectorAll('button').forEach((o) => o.classList.toggle('on', o === b));
          this.host.applySettings();
        }),
      ),
    );
  }
}
