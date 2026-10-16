// Custom shader materials for the 2.5D city.
import * as THREE from 'three';
import { GU, SHADER_COMMON } from './globals';

function sharedUniforms(): Record<string, THREE.IUniform> {
  return {
    uTime: GU.uTime,
    uDay: GU.uDay,
    uAmbientNight: GU.uAmbientNight,
    uDayTint: GU.uDayTint,
    uLampColor: GU.uLampColor,
    uNeonColor: GU.uNeonColor,
    uLightmap: GU.uLightmap,
    uWorldSize: GU.uWorldSize,
    uRain: GU.uRain,
    uFlash: GU.uFlash,
  };
}

export function groundMaterial(tex: THREE.DataArrayTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...sharedUniforms(), uTex: { value: tex } },
    vertexShader: /* glsl */ `
      in float aLayer;
      in float aShade;
      in float aWater;
      out vec3 vPos;
      out vec2 vUv;
      flat out float vLayer;
      out float vShade;
      out float vWater;
      void main() {
        vPos = position;
        vUv = uv;
        vLayer = aLayer;
        vShade = aShade;
        vWater = aWater;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      precision highp sampler2DArray;
      uniform sampler2DArray uTex;
      ${SHADER_COMMON}
      in vec3 vPos;
      in vec2 vUv;
      flat in float vLayer;
      in float vShade;
      in float vWater;
      out vec4 fragColor;
      void main() {
        vec2 uv = vUv;
        if (vWater > 0.5) {
          uv += vec2(sin(uTime * 0.5 + vPos.y * 0.11), cos(uTime * 0.45 + vPos.x * 0.09)) * 0.04;
        }
        vec4 t = texture(uTex, vec3(uv, vLayer));
        vec3 col = t.rgb * vShade;
        if (vWater > 0.5) {
          float w = sin(vPos.x * 0.9 + uTime * 1.9) * sin(vPos.y * 0.75 - uTime * 1.4) + sin((vPos.x + vPos.y) * 0.31 + uTime);
          col += vec3(0.07, 0.09, 0.11) * smoothstep(1.0, 1.8, w);
          col = mix(col, col * vec3(0.8, 0.9, 1.0), 0.3);
        }
        // wet roads in rain
        col = mix(col, col * 0.78 + vec3(0.02, 0.025, 0.035), uRain * (1.0 - vWater));
        vec3 lm = texture(uLightmap, vPos.xy / uWorldSize).rgb;
        fragColor = vec4(applyLight(col, lm, 0.48), 1.0);
      }`,
  });
}

export function buildingMaterial(tex: THREE.DataArrayTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...sharedUniforms(), uTex: { value: tex } },
    vertexShader: /* glsl */ `
      in vec4 aInfo;   // layerGround, layerUpper, shade, buildingId
      in vec3 aTint;
      out vec3 vPos;
      out vec2 vUv;
      flat out vec4 vInfo;
      out vec3 vTint;
      void main() {
        vPos = position;
        vUv = uv;
        vInfo = aInfo;
        vTint = aTint;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      precision highp sampler2DArray;
      uniform sampler2DArray uTex;
      ${SHADER_COMMON}
      in vec3 vPos;
      in vec2 vUv;
      flat in vec4 vInfo;
      in vec3 vTint;
      out vec4 fragColor;
      void main() {
        float layer = vUv.y < 1.0 ? vInfo.x : vInfo.y;
        vec4 t = texture(uTex, vec3(vUv, layer));
        float shade = vInfo.z;
        // ambient occlusion towards the ground on walls
        float ao = shade < 0.99 ? mix(0.62, 1.0, smoothstep(0.0, 3.5, vPos.z)) : 1.0;
        vec3 col = t.rgb * vTint * shade * ao;
        vec3 lm = texture(uLightmap, vPos.xy / uWorldSize).rgb;
        vec3 c = applyLight(col, vec3(0.0, lm.g * 0.35, lm.b * 0.5), 0.0);
        // windows: alpha < 1 marks glass
        if (t.a < 0.97) {
          float shop = t.a < 0.6 ? 1.0 : 0.0;
          vec2 cell = floor(vUv * vec2(2.0, 1.0));
          float h = hash12(cell + vec2(vInfo.w * 13.7, vInfo.w * 3.1));
          float on = shop > 0.5 ? 1.0 : step(0.58, h);
          vec3 warm = mix(vec3(1.0, 0.78, 0.45), vec3(0.75, 0.85, 1.0), step(0.85, h));
          float night = 1.0 - uDay;
          c += warm * on * night * (0.65 + 0.35 * t.r) * (shop > 0.5 ? 1.15 : 0.9);
          // daytime sky reflection
          c += vec3(0.05, 0.07, 0.09) * uDay * (1.0 - shop);
        }
        fragColor = vec4(c, 1.0);
      }`,
  });
}

export function markingsMaterial(tex: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...sharedUniforms(), uTex: { value: tex } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      in float aAlpha;
      out vec3 vPos;
      out vec2 vUv;
      out float vAlpha;
      void main() {
        vPos = position;
        vUv = uv;
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uTex;
      ${SHADER_COMMON}
      in vec3 vPos;
      in vec2 vUv;
      in float vAlpha;
      out vec4 fragColor;
      void main() {
        vec4 t = texture(uTex, vUv);
        float wear = 0.75 + 0.25 * hash12(floor(vPos.xy * 3.0));
        vec3 lm = texture(uLightmap, vPos.xy / uWorldSize).rgb;
        vec3 c = applyLight(t.rgb * 0.92, lm, 0.48);
        fragColor = vec4(c, t.a * vAlpha * wear);
      }`,
  });
}

/** Props: vertex-coloured, simple lighting from normals, emissive slots. */
export function propMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...sharedUniforms() },
    vertexShader: /* glsl */ `
      in vec3 color;
      in vec4 aEmit; // type, phase, group, unused
      out vec3 vPos;
      out vec3 vColor;
      out vec3 vNormal;
      flat out vec4 vEmit;
      void main() {
        vPos = position;
        vColor = color;
        vNormal = normal;
        vEmit = aEmit;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      ${SHADER_COMMON}
      in vec3 vPos;
      in vec3 vColor;
      in vec3 vNormal;
      flat in vec4 vEmit;
      out vec4 fragColor;

      // German signal cycle: green, yellow, red, red+yellow. Returns 0=red 1=redyellow 2=green 3=yellow
      float signalState(float phase, float group) {
        float t = mod(uTime + phase + group * 16.0, 32.0);
        if (t < 13.0) return 2.0;
        if (t < 16.0) return 3.0;
        if (t < 31.0) return 0.0;
        return 1.0;
      }

      void main() {
        vec3 n = normalize(vNormal);
        float l = 0.62 + 0.38 * max(0.0, dot(n, normalize(vec3(0.45, -0.62, 0.9))));
        if (n.z > 0.7) l = 1.0;
        vec3 col = vColor * l;
        vec3 lm = texture(uLightmap, vPos.xy / uWorldSize).rgb;
        vec3 c = applyLight(col, vec3(lm.r * 0.0, lm.g * 0.6, lm.b * 0.6), 0.0);
        float night = 1.0 - uDay;
        if (vEmit.x > 0.5 && vEmit.x < 1.5) {
          // street lamp head
          c = mix(c, vec3(1.0, 0.86, 0.6) * 1.4, night);
        } else if (vEmit.x > 1.5 && vEmit.x < 2.5) {
          // traffic signal lens: y = phase, z = group, w = lens colour (0 red 1 yellow 2 green)
          float st = signalState(vEmit.y, vEmit.z);
          float lens = vEmit.w;
          float on = 0.0;
          if (lens < 0.5) on = (st < 0.5 || (st > 0.5 && st < 1.5)) ? 1.0 : 0.0;
          else if (lens < 1.5) on = (st > 0.5 && st < 1.5) || st > 2.5 ? 1.0 : 0.0;
          else on = (st > 1.5 && st < 2.5) ? 1.0 : 0.0;
          vec3 lc = lens < 0.5 ? vec3(1.0, 0.12, 0.08) : lens < 1.5 ? vec3(1.0, 0.75, 0.1) : vec3(0.15, 1.0, 0.35);
          c = mix(lc * 0.18, lc * 1.5, on);
        } else if (vEmit.x > 2.5 && vEmit.x < 3.5) {
          // neon / signage
          c = mix(c, vColor * 1.6, night * 0.8 + 0.2);
        }
        fragColor = vec4(c, 1.0);
      }`,
  });
}

export function treeMaterial(tex: THREE.DataArrayTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...sharedUniforms(), uTex: { value: tex } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      in float aLayer;
      in vec3 aTint;
      out vec3 vPos;
      out vec2 vUv;
      flat out float vLayer;
      out vec3 vTint;
      void main() {
        vec3 p = position;
        // gentle sway
        p.xy += vec2(sin(uTime * 1.3 + position.x * 0.3), cos(uTime * 1.1 + position.y * 0.3)) * 0.08 * (position.z - 4.0);
        vPos = p;
        vUv = uv;
        vLayer = aLayer;
        vTint = aTint;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      precision highp sampler2DArray;
      uniform sampler2DArray uTex;
      ${SHADER_COMMON}
      in vec3 vPos;
      in vec2 vUv;
      flat in float vLayer;
      in vec3 vTint;
      out vec4 fragColor;
      void main() {
        vec4 t = texture(uTex, vec3(vUv, vLayer));
        if (t.a < 0.5) discard;
        vec3 lm = texture(uLightmap, vPos.xy / uWorldSize).rgb;
        vec3 c = applyLight(t.rgb * vTint, vec3(0.0, lm.g * 0.5, lm.b * 0.4), 0.0);
        fragColor = vec4(c, 1.0);
      }`,
  });
}

/** Additive glow sprites (signal light pools, lamps, headlights...) */
export function glowMaterial(tex: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...sharedUniforms(), uTex: { value: tex } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      in vec4 aEmit; // type, phase, group, lens
      in vec3 color;
      out vec2 vUv;
      flat out vec4 vEmit;
      out vec3 vColor;
      void main() {
        vUv = uv;
        vEmit = aEmit;
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uTex;
      ${SHADER_COMMON}
      in vec2 vUv;
      flat in vec4 vEmit;
      in vec3 vColor;
      out vec4 fragColor;
      float signalState(float phase, float group) {
        float t = mod(uTime + phase + group * 16.0, 32.0);
        if (t < 13.0) return 2.0;
        if (t < 16.0) return 3.0;
        if (t < 31.0) return 0.0;
        return 1.0;
      }
      void main() {
        float g = texture(uTex, vUv).r;
        vec3 c = vColor;
        float k = 0.0;
        if (vEmit.x > 1.5 && vEmit.x < 2.5) {
          float st = signalState(vEmit.y, vEmit.z);
          c = st > 1.5 && st < 2.5 ? vec3(0.1, 1.0, 0.3) : st > 2.5 || (st > 0.5 && st < 1.5) ? vec3(1.0, 0.65, 0.05) : vec3(1.0, 0.08, 0.05);
          k = 0.25 + 0.55 * (1.0 - uDay);
        } else {
          k = 1.0 - uDay;
        }
        fragColor = vec4(c * g * k, 1.0);
      }`,
  });
}
