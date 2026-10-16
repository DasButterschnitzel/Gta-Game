// Player settings, persisted through the Android bridge (SharedPreferences) or localStorage.

export interface Settings {
  sfx: number; // 0..1
  music: number; // 0..1
  steer: 'dir' | 'stick' | 'buttons';
  vibrate: boolean;
  quality: 'low' | 'mid' | 'high';
  fps: boolean;
  /** settings format: 2 = "Richtung" steering introduced as the default */
  ver?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  sfx: 0.9,
  music: 0.7,
  steer: 'dir',
  vibrate: true,
  quality: 'high',
  fps: false,
};

interface Bridge {
  save(key: string, value: string): void;
  load(key: string): string | null;
}

function bridge(): Bridge | null {
  const b = (window as unknown as { HGNative?: Bridge }).HGNative;
  return b && typeof b.save === 'function' ? b : null;
}

/** Store a string value (Android SharedPreferences when available, else localStorage). */
export function storeSet(key: string, value: string): void {
  try {
    const b = bridge();
    if (b) b.save(key, value);
    else localStorage.setItem(`hafengold.${key}`, value);
  } catch {
    /* storage unavailable: ignore */
  }
}

export function storeGet(key: string): string | null {
  try {
    const b = bridge();
    if (b) return b.load(key);
    return localStorage.getItem(`hafengold.${key}`);
  } catch {
    return null;
  }
}

export function loadSettings(): Settings {
  const raw = storeGet('settings');
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const s = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    // v0.4: "Richtung" became the default touch steering; move players off the old default once
    if ((s.ver ?? 1) < 2) {
      if (s.steer === 'stick') s.steer = 'dir';
      s.ver = 2;
    }
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  s.ver = 2;
  storeSet('settings', JSON.stringify(s));
}
