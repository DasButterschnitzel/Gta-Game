// Entry point. Boots the renderer, generates the city and starts the game loop.
import { Game } from './game/game';
import { hasSave } from './game/save';

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
  w.__hgBack = (): void => game.back();
  w.__hgPause = (): void => {
    game.setPaused(true);
    game.audio.suspend();
  };
  w.__hgResume = (): void => game.audio.resume();
  const loading = document.getElementById('loading')!;
  const params = new URLSearchParams(location.search);
  const go = (mode: 'new' | 'continue' | 'free'): void => {
    game.audio.resume();
    loading.classList.add('hidden');
    game.start(mode === 'free');
    if (mode === 'new') game.newGame();
    else if (mode === 'continue' && !game.continueGame()) game.newGame();
  };
  if (params.has('autostart')) {
    go(params.has('story') ? 'new' : 'free');
    return;
  }
  const bar = loading.querySelector('.bar') as HTMLElement;
  const txt = document.getElementById('loadtext')!;
  bar.style.display = 'none';
  txt.style.display = 'none';
  const box = document.createElement('div');
  box.className = 'startbox';
  const saved = hasSave();
  box.innerHTML = saved
    ? '<button class="startbtn" data-m="continue">WEITERSPIELEN</button><button class="startbtn alt" data-m="new">NEUES SPIEL</button>'
    : '<button class="startbtn" data-m="new">NEUES SPIEL</button>';
  loading.appendChild(box);
  const hint = document.createElement('div');
  hint.className = 'starthint';
  hint.textContent = 'Kopfhörer empfohlen · Querformat · komplett offline';
  loading.appendChild(hint);
  box.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
    b.addEventListener(
      'click',
      () => {
        const m = b.dataset.m as 'new' | 'continue';
        if (params.has('free')) {
          go('free');
          return;
        }
        if (m === 'new' && saved && !confirm('Neues Spiel starten? Der alte Spielstand wird beim nächsten Speichern überschrieben.')) return;
        go(m);
      },
      { once: false },
    ),
  );
}

boot();
