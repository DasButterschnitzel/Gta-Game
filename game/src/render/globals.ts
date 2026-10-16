// Shared render uniforms (day/night, time, lightmap) used by all custom materials.
import * as THREE from 'three';
import { WORLD_W, WORLD_H } from '../world/types';

export const GU = {
  uTime: { value: 0 },
  /** 1 = full day, 0 = full night */
  uDay: { value: 1 },
  uAmbientNight: { value: new THREE.Color(0.2, 0.23, 0.36) },
  uDayTint: { value: new THREE.Color(1, 1, 1) },
  uLampColor: { value: new THREE.Color(1.0, 0.72, 0.38) },
  uNeonColor: { value: new THREE.Color(1.0, 0.25, 0.65) },
  uLightmap: { value: null as THREE.Texture | null },
  uWorldSize: { value: new THREE.Vector2(WORLD_W, WORLD_H) },
  uSunDir: { value: new THREE.Vector3(0.45, -0.62, 0.65).normalize() },
  uRain: { value: 0 },
  uFlash: { value: 0 },
};

/** Direction shadows are cast on the ground (metres of offset per metre of height). */
export const SHADOW_DIR = { x: -0.42, y: 0.55 };

export const SHADER_COMMON = /* glsl */ `
uniform float uTime;
uniform float uDay;
uniform vec3 uAmbientNight;
uniform vec3 uDayTint;
uniform vec3 uLampColor;
uniform vec3 uNeonColor;
uniform sampler2D uLightmap;
uniform vec2 uWorldSize;
uniform float uRain;
uniform float uFlash;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 applyLight(vec3 col, vec3 lm, float shadowAmt) {
  vec3 day = col * uDayTint * (1.0 - lm.r * shadowAmt);
  vec3 night = col * (uAmbientNight + uLampColor * lm.g * 1.5 + uNeonColor * lm.b * 1.2);
  vec3 c = mix(night, day, uDay);
  c *= 1.0 - uRain * 0.18;
  c += uFlash * vec3(0.9, 0.7, 0.45) * 0.35;
  return c;
}
`;
