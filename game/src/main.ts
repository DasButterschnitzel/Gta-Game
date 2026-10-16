// Entry point. Boots the renderer, generates the city and starts the game loop.
import { Game } from './game/game';

declare const __VERSION__: string;

function setProgress(p: number, text: string): void {
  const bar = document.getElementById('loadbar');
  const t = document.getElementById('loadtext');
  if (bar) bar.style.width = `${Math.round(p * 100)}%`;
  if (t) t.textContent = text;
}

async function boot(): Promise<void> {
  const app = document.getElementById('app')!;
  const ui = document.getElementById('ui')!;
  const game = new Game(app, ui, __VERSION__);
  (window as unknown as { __game: Game }).__game = game;
  try {
    await game.init(setProgress);
  } catch (err) {
    console.error(err);
    setProgress(1, 'Fehler beim Laden: ' + (err as Error).message);
    return;
  }
  // Android shell hooks
  const w = window as unknown as Record<string, unknown>;
  w.__hgBack = (): void => game.togglePause();
  w.__hgPause = (): void => {
    game.setPaused(true);
    game.audio.suspend();
  };
  w.__hgResume = (): void => game.audio.resume();
  const loading = document.getElementById('loading')!;
  const go = (): void => {
    game.audio.resume();
    loading.classList.add('hidden');
    game.start();
  };
  if (new URLSearchParams(location.search).has('autostart')) {
    go();
    return;
  }
  const bar = loading.querySelector('.bar') as HTMLElement;
  const txt = document.getElementById('loadtext')!;
  bar.style.display = 'none';
  txt.style.display = 'none';
  const btn = document.createElement('button');
  btn.className = 'startbtn';
  btn.textContent = 'SPIELEN';
  loading.appendChild(btn);
  const hint = document.createElement('div');
  hint.className = 'starthint';
  hint.textContent = 'Kopfhörer empfohlen · Querformat';
  loading.appendChild(hint);
  btn.addEventListener('click', go, { once: true });
}

boot();
