// "Richtung" steering for touch: the stick points where the car should go (in screen / world
// space, the camera is north-up) and this controller turns the wheel to get there. Feed-forward
// from the kinematic yaw rate plus yaw-rate feedback, so it settles without weaving.
import type { Vehicle } from './vehicle';
import { clamp, wrapAngle } from '../core/math';

export const AUTOSTEER = {
  /** desired yaw rate per radian of heading error (1/s) */
  gain: 3.4,
  /** yaw-rate feedback (steer per rad/s of error) */
  rateFb: 0.32,
  /** yaw-rate cap (rad/s) */
  maxRate: 2.4,
};

/**
 * Steering input (-1..1, + = left / counter-clockwise) that turns the car's direction of travel
 * towards `want` (world heading). `reverse` = the car is (or is about to be) backing up.
 */
export function headingSteer(v: Vehicle, want: number, reverse: boolean): number {
  const r = v.body.getAngularVelocity();
  const travel = reverse ? v.angle + Math.PI : v.angle;
  const err = wrapAngle(want - travel);
  const fwd = v.forwardSpeed;
  const u = reverse ? Math.min(-0.8, fwd) : Math.max(0.8, fwd);
  const sp = Math.max(Math.abs(fwd), v.speed * 0.9, 0.8);
  // what the tyres can sustain: a_lat = speed * yawRate
  const muG = 9.81 * v.def.grip * 1.5;
  const rCap = Math.min(AUTOSTEER.maxRate, muG / sp);
  const rDes = clamp(err * AUTOSTEER.gain, -rCap, rCap);
  // kinematic steering angle for that yaw rate (sign flips when reversing via u)
  const delta = Math.atan((rDes * v.def.wheelbase) / u);
  const lock = Math.max(0.05, v.maxSteerAt(sp));
  const fb = (rDes - r) * AUTOSTEER.rateFb * (reverse ? -1 : 1);
  return clamp(delta / lock + fb, -1, 1);
}

/**
 * "Smart" handbrake for direction steering: holding HANDBREMSE swings the car around, and the
 * brake lets go by itself once the nose points where the stick points (until pressed again).
 */
export class SmartHandbrake {
  private latched = false;

  apply(v: Vehicle, want: number | null, held: boolean): boolean {
    if (!held) {
      this.latched = false;
      return false;
    }
    if (want === null) return true;
    if (this.latched) return false;
    // let go a little early: the car keeps rotating for a moment after the rear grips again
    const err = wrapAngle(want - v.angle);
    const pred = err - v.body.getAngularVelocity() * 0.28;
    if ((Math.abs(pred) < 0.3 || Math.sign(pred) !== Math.sign(err)) && v.speed > 3) {
      this.latched = true;
      return false;
    }
    return true;
  }
}
