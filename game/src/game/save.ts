// Save game: story progress, money, weapons, respect, unlocked zones and a few statistics.
import { storeGet, storeSet } from '../core/settings';

export const SAVE_VERSION = 1;

export interface SaveData {
  v: number;
  done: string[];
  money: number;
  arsenal: Record<string, number>;
  health: number;
  armor: number;
  respect: Record<string, number>;
  clock: number;
  zones: number[];
  stats: Record<string, number>;
  savedAt: number;
  /** v0.4 */
  dealing?: { carry: Record<string, number>; capacity: number; unlocked: boolean; profit: number; deals: number };
  flags?: string[];
}

const KEY = 'save1';

export function loadSave(): SaveData | null {
  const raw = storeGet(KEY);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as SaveData;
    if (!d || typeof d !== 'object' || !Array.isArray(d.done)) return null;
    return d;
  } catch {
    return null;
  }
}

export function writeSave(d: SaveData): void {
  storeSet(KEY, JSON.stringify(d));
}

export function hasSave(): boolean {
  return loadSave() !== null;
}
