// Trade / shop panel (dealers, Kalle's arms shop): a modal list of rows with buy / sell buttons.
import { portrait } from '../render/portraits';

export interface ShopRow {
  id: string;
  name: string;
  color?: string;
  /** small line under the name */
  note?: string;
  /** highlighted (a tip / special offer) */
  hot?: boolean;
  /** right column ("Du hast") */
  have?: string;
  buy?: { price: number; ok: boolean; amounts?: number[] };
  sell?: { price: number; ok: boolean; amounts?: number[] };
}

export interface ShopModel {
  title: string;
  subtitle: string;
  /** portrait id or null */
  face: string | null;
  rows(): ShopRow[];
  status(): string;
  /** amount −1 = as many as possible; returns a feedback text (or null) */
  act(rowId: string, action: 'buy' | 'sell', amount: number): string | null;
  hint?: string;
}

export class ShopUI {
  readonly root: HTMLElement;
  private model: ShopModel | null = null;
  private resolve: (() => void) | null = null;
  private msg = '';
  private msgBad = false;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'pausemenu shop';
    this.root.style.display = 'none';
    parent.appendChild(this.root);
    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'touchstart']) this.root.addEventListener(ev, (e) => e.stopPropagation());
    this.root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => {
      if (!this.model) return;
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'KeyF') {
        e.preventDefault();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return this.model !== null;
  }

  open(model: ShopModel): Promise<void> {
    this.model = model;
    this.msg = model.hint ?? '';
    this.msgBad = false;
    this.root.style.display = 'flex';
    this.render();
    return new Promise((r) => {
      this.resolve = r;
    });
  }

  close(): void {
    if (!this.model) return;
    this.model = null;
    this.root.style.display = 'none';
    const r = this.resolve;
    this.resolve = null;
    r?.();
  }

  private onClick(e: Event): void {
    const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!t || !this.model) return;
    if (t.dataset.close) {
      this.close();
      return;
    }
    const row = t.dataset.row;
    const act = t.dataset.act as 'buy' | 'sell' | undefined;
    if (!row || !act) return;
    const res = this.model.act(row, act, Number(t.dataset.n));
    if (res !== null) {
      this.msg = res.replace(/^!/, '');
      this.msgBad = res.startsWith('!');
    }
    this.render();
  }

  private render(): void {
    const m = this.model;
    if (!m) return;
    const scroll = (this.root.querySelector('.shop-rows') as HTMLElement | null)?.scrollTop ?? 0;
    this.draw(m);
    const rowsEl = this.root.querySelector('.shop-rows') as HTMLElement | null;
    if (rowsEl) rowsEl.scrollTop = scroll;
  }

  private draw(m: ShopModel): void {
    const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
    const btns = (r: ShopRow, act: 'buy' | 'sell', ok: boolean, amounts: number[]): string =>
      amounts
        .map((n) => `<button class="shop-btn ${act}" data-row="${r.id}" data-act="${act}" data-n="${n}" ${ok ? '' : 'disabled'}>${n < 0 ? (act === 'buy' ? 'MAX' : 'ALLE') : act === 'buy' ? `+${n}` : `−${n}`}</button>`)
        .join('');
    const rows = m
      .rows()
      .map(
        (r) => `
        <div class="shop-row${r.hot ? ' hot' : ''}">
          <div class="shop-name"><span class="dot" style="background:${r.color ?? '#ccc'}"></span><div><b>${esc(r.name)}</b>${r.note ? `<small>${esc(r.note)}</small>` : ''}</div></div>
          <div class="shop-cell">${r.buy ? `<span class="price">${r.buy.price} €</span>${btns(r, 'buy', r.buy.ok, r.buy.amounts ?? [1, 5, -1])}` : '<span class="na">–</span>'}</div>
          ${r.sell !== undefined || r.have !== undefined ? `<div class="shop-cell">${r.sell ? `<span class="price sellp">${r.sell.price} €</span>${btns(r, 'sell', r.sell.ok, r.sell.amounts ?? [1, -1])}` : '<span class="na">–</span>'}</div>` : ''}
          ${r.have !== undefined ? `<div class="shop-have">${esc(r.have)}</div>` : ''}
        </div>`,
      )
      .join('');
    this.root.innerHTML = `
      <div class="pm-box shop-box">
        <div class="shop-head">
          ${m.face ? `<img class="shop-face" src="${portrait(m.face)}" alt="">` : ''}
          <div class="shop-title"><b>${esc(m.title)}</b><small>${esc(m.subtitle)}</small></div>
          <div class="shop-status">${esc(m.status())}</div>
          <button class="pm-btn primary shop-done" data-close="1">FERTIG</button>
        </div>
        <div class="shop-rows">${rows}</div>
        <div class="shop-msg${this.msgBad ? ' bad' : ''}">${esc(this.msg)}</div>
      </div>`;
  }
}
