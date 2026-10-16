// Interface shared by gameplay systems (traffic, pedestrians, police...) to talk to the game.
import type { City } from '../world/city';
import type { Physics } from '../physics/physics';
import type { Vehicle } from './vehicle';
import type { Character, Role } from './character';
import type { CharLook } from '../render/charSprites';
import type { PlayerController } from './player';

export interface WorldAPI {
  city: City;
  physics: Physics;
  time: number;
  vehicles: Vehicle[];
  chars: Character[];
  player: PlayerController;
  spawnVehicle(id: string, x: number, y: number, angle: number, paint?: number): Vehicle;
  removeVehicle(v: Vehicle): void;
  spawnChar(x: number, y: number, look: CharLook, role: Role): Character;
  removeChar(c: Character): void;
  /** is the point inside the camera view (+margin metres)? */
  isVisible(x: number, y: number, margin: number): boolean;
  /** traffic-light state for a junction group: 0 red, 1 red+yellow, 2 green, 3 yellow */
  signalState(junction: number, group: number): number;
  /** pedestrian panic event (gunshot, crash, explosion) */
  alarm(x: number, y: number, radius: number, severity: number): void;
  /** lane runs into a closed bridge (locked zone) */
  laneBlocked(id: number): boolean;
}

/** German signal cycle shared with the shader (32 s). */
export function signalStateAt(time: number, phase: number, group: number): number {
  const t = (((time + phase + group * 16) % 32) + 32) % 32;
  if (t < 13) return 2;
  if (t < 16) return 3;
  if (t < 31) return 0;
  return 1;
}
