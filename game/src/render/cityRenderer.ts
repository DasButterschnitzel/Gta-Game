// Chunked renderer for the static city: ground, markings, buildings, props, trees, signal glows.
import * as THREE from 'three';
import type { City } from '../world/city';
import {
  MAP_W,
  MAP_H,
  TILE,
  G,
  D,
  P,
  Roof,
  BKind,
  FAC,
  RS,
  FAC_COUNT,
  RS_COUNT,
  RoadKind,
  F_ROAD,
  F_CROSSWALK,
  Turn,
  type Building,
  type Prop,
} from '../world/types';
import {
  GROUND_LAYER,
  GROUND_VARIANTS,
  GROUND_LAYER_COUNT,
  generateGroundLayers,
  generateFacadeLayers,
  generateRoofLayers,
  generateShopLayers,
  generateTreeLayers,
  SHOP_VARIANTS,
  TREE_VARIANTS,
  makeMarkingsCanvas,
  makeGlowCanvas,
  MARK_UV,
} from './texgen';
import { GeoBuilder, addBox, addCyl, makeArrayTexture } from './geom';
import { groundMaterial, buildingMaterial, markingsMaterial, propMaterial, treeMaterial, glowMaterial } from './materials';
import { buildLightmap } from './lightmap';
import { GU } from './globals';
import { RNG } from '../core/rng';

export const CHUNK = 16; // tiles per chunk side
export const CHUNK_M = CHUNK * TILE;
const NCX = Math.ceil(MAP_W / CHUNK);
const NCY = Math.ceil(MAP_H / CHUNK);

const SHOP_BASE = FAC_COUNT * 2;
const ROOF_BASE = SHOP_BASE + SHOP_VARIANTS;
const BUILD_LAYERS = ROOF_BASE + RS_COUNT;
export const MAX_VIS_H = 28;

const Z_ROAD = 0;
const Z_LOT = 0.12;
const Z_WATER = -0.9;

interface Mark {
  x: number;
  y: number;
  len: number; // along rot
  wid: number;
  rot: number;
  uv: [number, number, number, number];
  alpha: number;
}

interface Chunk {
  key: number;
  group: THREE.Group;
  lastUsed: number;
}

export class CityRenderer {
  readonly root = new THREE.Group();
  private chunks = new Map<number, Chunk>();
  private bBuckets: number[][] = [];
  private pBuckets: number[][] = [];
  private mBuckets: Mark[][] = [];
  private matGround: THREE.ShaderMaterial;
  private matBuild: THREE.ShaderMaterial;
  private matMarks: THREE.ShaderMaterial;
  private matProps: THREE.ShaderMaterial;
  private matTrees: THREE.ShaderMaterial;
  private matGlow: THREE.ShaderMaterial;
  private frame = 0;
  private queue: number[] = [];
  /** chunks generated per frame budget */
  buildBudget = 2;

  constructor(private city: City) {
    const groundTex = makeArrayTexture(generateGroundLayers(), 128, 128, GROUND_LAYER_COUNT);
    const fac = generateFacadeLayers();
    const shops = generateShopLayers();
    const roofs = generateRoofLayers();
    const all = new Uint8Array(128 * 128 * 4 * BUILD_LAYERS);
    all.set(fac, 0);
    all.set(shops, SHOP_BASE * 128 * 128 * 4);
    all.set(roofs, ROOF_BASE * 128 * 128 * 4);
    const buildTex = makeArrayTexture(all, 128, 128, BUILD_LAYERS);
    const treeTex = makeArrayTexture(generateTreeLayers(), 128, 128, TREE_VARIANTS, { repeat: false });
    const markTex = new THREE.CanvasTexture(makeMarkingsCanvas() as HTMLCanvasElement);
    markTex.colorSpace = THREE.NoColorSpace;
    markTex.anisotropy = 4;
    const glowTex = new THREE.CanvasTexture(makeGlowCanvas() as HTMLCanvasElement);
    glowTex.colorSpace = THREE.NoColorSpace;

    GU.uLightmap.value = buildLightmap(city);

    this.matGround = groundMaterial(groundTex);
    this.matBuild = buildingMaterial(buildTex);
    this.matMarks = markingsMaterial(markTex);
    this.matProps = propMaterial();
    this.matTrees = treeMaterial(treeTex);
    this.matGlow = glowMaterial(glowTex);

    const n = NCX * NCY;
    for (let i = 0; i < n; i++) {
      this.bBuckets.push([]);
      this.pBuckets.push([]);
      this.mBuckets.push([]);
    }
    city.buildings.forEach((b, i) => {
      this.bBuckets[this.chunkKeyAt(b.x + b.w / 2, b.y + b.h / 2)].push(i);
    });
    city.props.forEach((p, i) => {
      this.pBuckets[this.chunkKeyAt(p.x, p.y)].push(i);
    });
    for (const m of buildMarkings(city)) this.mBuckets[this.chunkKeyAt(m.x, m.y)].push(m);
  }

  private chunkKeyAt(x: number, y: number): number {
    const cx = Math.min(NCX - 1, Math.max(0, Math.floor(x / CHUNK_M)));
    const cy = Math.min(NCY - 1, Math.max(0, Math.floor(y / CHUNK_M)));
    return cy * NCX + cx;
  }

  /** Ensure chunks covering the rectangle (metres) are built; free far ones. */
  update(x0: number, y0: number, x1: number, y1: number, force = false): void {
    this.frame++;
    const margin = CHUNK_M * 0.6;
    const cx0 = Math.max(0, Math.floor((x0 - margin) / CHUNK_M));
    const cy0 = Math.max(0, Math.floor((y0 - margin) / CHUNK_M));
    const cx1 = Math.min(NCX - 1, Math.floor((x1 + margin) / CHUNK_M));
    const cy1 = Math.min(NCY - 1, Math.floor((y1 + margin) / CHUNK_M));
    const midX = (x0 + x1) / 2;
    const midY = (y0 + y1) / 2;
    const want: { key: number; d: number }[] = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = cy * NCX + cx;
        const ch = this.chunks.get(key);
        if (ch) ch.lastUsed = this.frame;
        else want.push({ key, d: Math.hypot((cx + 0.5) * CHUNK_M - midX, (cy + 0.5) * CHUNK_M - midY) });
      }
    }
    want.sort((a, b) => a.d - b.d);
    let budget = force ? 1000 : this.buildBudget;
    for (const w of want) {
      if (budget-- <= 0) break;
      const ch = this.buildChunk(w.key);
      ch.lastUsed = this.frame;
      this.chunks.set(w.key, ch);
      this.root.add(ch.group);
    }
    // evict old chunks
    if (this.chunks.size > 90) {
      const arr = [...this.chunks.values()].sort((a, b) => a.lastUsed - b.lastUsed);
      for (let i = 0; i < arr.length - 70; i++) {
        const ch = arr[i];
        if (this.frame - ch.lastUsed < 30) break;
        this.root.remove(ch.group);
        ch.group.traverse((o) => {
          if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
        });
        this.chunks.delete(ch.key);
      }
    }
    void this.queue;
  }

  private buildChunk(key: number): Chunk {
    const cx = key % NCX;
    const cy = Math.floor(key / NCX);
    const group = new THREE.Group();
    group.name = `chunk_${cx}_${cy}`;
    const ground = this.buildGround(cx, cy);
    if (ground) group.add(new THREE.Mesh(ground, this.matGround));
    const marks = this.buildMarks(key);
    if (marks) {
      const m = new THREE.Mesh(marks, this.matMarks);
      m.renderOrder = 1;
      group.add(m);
    }
    const bld = this.buildBuildings(key);
    if (bld) group.add(new THREE.Mesh(bld, this.matBuild));
    const { props, trees, glows } = this.buildProps(key);
    if (props) group.add(new THREE.Mesh(props, this.matProps));
    if (trees) {
      const t = new THREE.Mesh(trees, this.matTrees);
      t.renderOrder = 2;
      group.add(t);
    }
    if (glows) {
      const g = new THREE.Mesh(glows, this.matGlow);
      g.renderOrder = 3;
      group.add(g);
    }
    group.matrixAutoUpdate = false;
    group.updateMatrix();
    for (const c of group.children) {
      c.matrixAutoUpdate = false;
      c.updateMatrix();
    }
    return { key, group, lastUsed: this.frame };
  }

  // ------------------------------------------------------------------------------------
  private tileZ(tx: number, ty: number): number {
    const city = this.city;
    if (!city.inBounds(tx, ty)) return Z_LOT;
    const i = ty * MAP_W + tx;
    const g = city.ground[i];
    if (g === G.Water) return Z_WATER;
    if (city.flags[i] & F_ROAD) return Z_ROAD;
    return Z_LOT;
  }

  private tileLayer(tx: number, ty: number): number {
    const city = this.city;
    const i = ty * MAP_W + tx;
    const g = city.ground[i];
    const vars = GROUND_VARIANTS[g] ?? 1;
    const gv = city.gvar[i];
    let v = 0;
    if (g === G.Grass || g === G.Forest || g === G.Concrete || g === G.Dirt || g === G.Gravel || g === G.Courtyard) {
      // clustered variants via low-frequency value noise
      v = Math.min(vars - 1, Math.floor(valueNoise(tx * 0.13, ty * 0.13) * vars * 1.15));
    } else if (g === G.Asphalt) {
      v = (gv & 0x3f) < 3 ? 1 + ((gv >> 6) % 3) : 0;
    } else if (g === G.Sidewalk) {
      const d = city.district[i];
      v = d === D.Kiez || d === D.Bahnhof ? 2 : valueNoise(tx * 0.2 + 7.3, ty * 0.2) > 0.6 ? 1 : 0;
    } else v = (gv >> 2) % vars;
    return GROUND_LAYER[g] + v;
  }

  private buildGround(cx: number, cy: number): THREE.BufferGeometry | null {
    const city = this.city;
    const gb = new GeoBuilder({ aLayer: 1, aShade: 1, aWater: 1 });
    const T = TILE;
    const tx0 = cx * CHUNK;
    const ty0 = cy * CHUNK;
    for (let ty = ty0; ty < Math.min(MAP_H, ty0 + CHUNK); ty++) {
      for (let tx = tx0; tx < Math.min(MAP_W, tx0 + CHUNK); tx++) {
        const i = ty * MAP_W + tx;
        const g = city.ground[i];
        const z = this.tileZ(tx, ty);
        const layer = this.tileLayer(tx, ty);
        const water = g === G.Water ? 1 : 0;
        const x0 = tx * T;
        const y0 = ty * T;
        const x1 = x0 + T;
        const y1 = y0 + T;
        let uvs: number[];
        if (water) uvs = [tx, ty, tx + 1, ty, tx + 1, ty + 1, tx, ty + 1];
        else {
          const r = g === G.Rail ? 0 : city.gvar[i] & 3;
          const base = [0, 0, 1, 0, 1, 1, 0, 1];
          uvs = [];
          for (let k = 0; k < 4; k++) {
            const kk = (k + r) % 4;
            uvs.push(base[kk * 2], base[kk * 2 + 1]);
          }
        }
        const a = gb.v(x0, y0, z, 0, 0, 1, uvs[0], uvs[1]);
        const b = gb.v(x1, y0, z, 0, 0, 1, uvs[2], uvs[3]);
        const c = gb.v(x1, y1, z, 0, 0, 1, uvs[4], uvs[5]);
        const d = gb.v(x0, y1, z, 0, 0, 1, uvs[6], uvs[7]);
        for (let k = 0; k < 4; k++) {
          gb.ex('aLayer', layer);
          gb.ex('aShade', 1);
          gb.ex('aWater', water);
        }
        gb.quad(a, b, c, d);
        // vertical faces to east and north neighbours
        for (const [nx, ny] of [
          [1, 0],
          [0, 1],
          [-1, 0],
          [0, -1],
        ]) {
          const ntx = tx + nx;
          const nty = ty + ny;
          // only handle west/south neighbours if they are outside this chunk (avoid duplicates)
          if (nx === -1 && ntx >= tx0) continue;
          if (ny === -1 && nty >= ty0) continue;
          if (nx === 1 && ntx >= tx0 + CHUNK) {
            /* handled here */
          }
          const nz = this.tileZ(ntx, nty);
          if (nz >= z) continue; // this tile must be the higher one
          // face on the shared edge, facing the lower neighbour
          const lowerWater = city.inBounds(ntx, nty) && city.ground[nty * MAP_W + ntx] === G.Water;
          const fLayer = lowerWater ? GROUND_LAYER[G.Quay] : layer;
          const shade = nx === 1 ? 0.8 : nx === -1 ? 0.68 : ny === -1 ? 0.9 : 0.6;
          let px0: number, py0: number, px1: number, py1: number;
          if (nx === 1) {
            px0 = x1;
            py0 = y0;
            px1 = x1;
            py1 = y1;
          } else if (nx === -1) {
            px0 = x0;
            py0 = y1;
            px1 = x0;
            py1 = y0;
          } else if (ny === 1) {
            px0 = x1;
            py0 = y1;
            px1 = x0;
            py1 = y1;
          } else {
            px0 = x0;
            py0 = y0;
            px1 = x1;
            py1 = y0;
          }
          const hgt = z - nz;
          const fa = gb.v(px0, py0, nz, nx, ny, 0, 0, 0);
          const fb = gb.v(px1, py1, nz, nx, ny, 0, 1, 0);
          const fc = gb.v(px1, py1, z, nx, ny, 0, 1, hgt / 4);
          const fd = gb.v(px0, py0, z, nx, ny, 0, 0, hgt / 4);
          for (let k = 0; k < 4; k++) {
            gb.ex('aLayer', fLayer);
            gb.ex('aShade', shade * (lowerWater ? 0.85 : 1.1));
            gb.ex('aWater', 0);
          }
          gb.quad(fa, fb, fc, fd);
        }
      }
    }
    if (gb.empty) return null;
    return gb.build();
  }

  // ------------------------------------------------------------------------------------
  private buildMarks(key: number): THREE.BufferGeometry | null {
    const marks = this.mBuckets[key];
    if (!marks.length) return null;
    const gb = new GeoBuilder({ aAlpha: 1 });
    for (const m of marks) {
      const c = Math.cos(m.rot);
      const s = Math.sin(m.rot);
      const hl = m.len / 2;
      const hw = m.wid / 2;
      const z = 0.025;
      const pts = [
        [-hl, -hw],
        [hl, -hw],
        [hl, hw],
        [-hl, hw],
      ];
      const [u0, v0, u1, v1] = m.uv;
      // arrow textures point along +v (canvas up = texture v down) -> map local +x (forward) to v
      const uvs = [
        [u0, v1],
        [u0, v0],
        [u1, v0],
        [u1, v1],
      ];
      const ids: number[] = [];
      for (let k = 0; k < 4; k++) {
        const [lx, ly] = pts[k];
        ids.push(gb.v(m.x + lx * c - ly * s, m.y + lx * s + ly * c, z, 0, 0, 1, uvs[k][0], 1 - uvs[k][1]));
        gb.ex('aAlpha', m.alpha);
      }
      gb.quad(ids[0], ids[1], ids[2], ids[3]);
    }
    return gb.build({ normals: false });
  }

  // ------------------------------------------------------------------------------------
  private buildBuildings(key: number): THREE.BufferGeometry | null {
    const ids = this.bBuckets[key];
    if (!ids.length) return null;
    const gb = new GeoBuilder({ aInfo: 4, aTint: 3 });
    for (const id of ids) emitBuilding(gb, this.city.buildings[id], id);
    if (gb.empty) return null;
    return gb.build({ normals: false });
  }

  // ------------------------------------------------------------------------------------
  private buildProps(key: number): { props: THREE.BufferGeometry | null; trees: THREE.BufferGeometry | null; glows: THREE.BufferGeometry | null } {
    const ids = this.pBuckets[key];
    if (!ids.length) return { props: null, trees: null, glows: null };
    const gb = new GeoBuilder({ aEmit: 4 });
    const tb = new GeoBuilder({ aLayer: 1, aTint: 3 });
    const glow = new GeoBuilder({ aEmit: 4 });
    for (const id of ids) {
      const p = this.city.props[id];
      emitProp(gb, tb, glow, p, id, this.city);
    }
    return {
      props: gb.empty ? null : gb.build({ colors: true }),
      trees: tb.empty ? null : tb.build({ normals: false }),
      glows: glow.empty ? null : glow.build({ normals: false, colors: true }),
    };
  }
}

// ==========================================================================================
// Buildings
// ==========================================================================================

function floorHeightFor(b: Building): number {
  if (b.kind === BKind.Container) return 2.59;
  if (b.facade === FAC.PlatteGray || b.facade === FAC.PlatteBeige || b.facade === FAC.PlattePastel) return 2.9;
  if (b.kind === BKind.Warehouse || b.facade === FAC.Station) return 3.4;
  if (b.kind === BKind.Tank || b.kind === BKind.Chimney) return 4;
  return 3.1;
}

const SH_S = 0.9;
const SH_E = 0.78;
const SH_W = 0.66;
const SH_N = 0.56;

function tintRGB(t: number): [number, number, number] {
  return [((t >> 16) & 255) / 255, ((t >> 8) & 255) / 255, (t & 255) / 255];
}

function vtx(gb: GeoBuilder, x: number, y: number, z: number, u: number, v: number, lg: number, lu: number, shade: number, bid: number, tint: [number, number, number]): number {
  const i = gb.v(x, y, z, 0, 0, 0, u, v);
  gb.ex('aInfo', lg, lu, shade, bid);
  gb.ex('aTint', tint[0], tint[1], tint[2]);
  return i;
}

function wall(
  gb: GeoBuilder,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  shade: number,
  lg: number,
  lu: number,
  bid: number,
  tint: [number, number, number],
  bayW: number,
  floorH: number,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const u1 = Math.max(0.5, Math.round((len / bayW) * 2) / 2);
  const v1 = (z1 - z0) / floorH;
  const a = vtx(gb, x0, y0, z0, 0, 0, lg, lu, shade, bid, tint);
  const b = vtx(gb, x1, y1, z0, u1, 0, lg, lu, shade, bid, tint);
  const c = vtx(gb, x1, y1, z1, u1, v1, lg, lu, shade, bid, tint);
  const d = vtx(gb, x0, y0, z1, 0, v1, lg, lu, shade, bid, tint);
  gb.quad(a, b, c, d);
}

function emitBuilding(gb: GeoBuilder, b: Building, id: number): void {
  const bid = id % 997;
  const tint = tintRGB(b.tint);
  const white: [number, number, number] = [1, 1, 1];
  const z0 = Z_LOT;
  const H = Math.min(b.height, MAX_VIS_H);
  const x0 = b.x;
  const y0 = b.y;
  const x1 = b.x + b.w;
  const y1 = b.y + b.h;
  const fh = floorHeightFor(b);
  const bayW = b.kind === BKind.Container ? 2.44 : 4;
  const upper = b.facade * 2 + 1;
  const groundL = (dirBit: number): number => (b.shops & dirBit ? SHOP_BASE + ((id + dirBit) % SHOP_VARIANTS) : b.facade * 2);
  const roofL = ROOF_BASE + b.roofStyle;

  if (b.roof === Roof.Round) {
    emitRound(gb, b, bid, tint, H, fh);
    return;
  }

  const flat = b.roof === Roof.Flat;
  const parapet = flat && b.kind !== BKind.Container && b.kind !== BKind.Wall && b.kind !== BKind.Shed ? 0.6 : 0;
  const wallTop = H + parapet;
  // walls (counter-clockwise from above: S, E, N, W)
  wall(gb, x0, y0, x1, y0, z0, wallTop, SH_S, groundL(8), upper, bid, tint, bayW, fh);
  wall(gb, x1, y0, x1, y1, z0, wallTop, SH_E, groundL(1), upper, bid, tint, bayW, fh);
  wall(gb, x1, y1, x0, y1, z0, wallTop, SH_N, groundL(2), upper, bid, tint, bayW, fh);
  wall(gb, x0, y1, x0, y0, z0, wallTop, SH_W, groundL(4), upper, bid, tint, bayW, fh);

  if (flat || b.roof === Roof.Container) {
    // roof surface
    let uvs: number[];
    if (b.roofStyle === RS.Helipad) uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    else if (b.roof === Roof.Container) uvs = [0, 0, b.w / 2.44, 0, b.w / 2.44, b.h / 2.44, 0, b.h / 2.44];
    else uvs = [x0 / 4, y0 / 4, x1 / 4, y0 / 4, x1 / 4, y1 / 4, x0 / 4, y1 / 4];
    const rt = b.roof === Roof.Container ? tint : white;
    const a = vtx(gb, x0, y0, H, uvs[0], uvs[1], roofL, roofL, 1, bid, rt);
    const bb = vtx(gb, x1, y0, H, uvs[2], uvs[3], roofL, roofL, 1, bid, rt);
    const c = vtx(gb, x1, y1, H, uvs[4], uvs[5], roofL, roofL, 1, bid, rt);
    const d = vtx(gb, x0, y1, H, uvs[6], uvs[7], roofL, roofL, 1, bid, rt);
    gb.quad(a, bb, c, d);
    if (parapet > 0) {
      // inner parapet faces (facing inwards)
      const pl = ROOF_BASE + RS.Concrete;
      const inner = (ax: number, ay: number, bx: number, by: number, sh: number): void => {
        const len = Math.hypot(bx - ax, by - ay);
        const i0 = vtx(gb, ax, ay, H, 0, 0, pl, pl, sh, bid, white);
        const i1 = vtx(gb, bx, by, H, len / 4, 0, pl, pl, sh, bid, white);
        const i2 = vtx(gb, bx, by, wallTop, len / 4, 0.15, pl, pl, sh, bid, white);
        const i3 = vtx(gb, ax, ay, wallTop, 0, 0.15, pl, pl, sh, bid, white);
        gb.quad(i0, i1, i2, i3);
      };
      // clockwise traversal from above => normals point inwards
      inner(x0, y0, x0, y1, SH_E * 0.8);
      inner(x0, y1, x1, y1, SH_S * 0.8);
      inner(x1, y1, x1, y0, SH_W * 0.8);
      inner(x1, y0, x0, y0, SH_N * 0.8);
      if (b.clutter) emitClutter(gb, b, bid, H);
    }
    return;
  }

  if (b.roof === Roof.GableX || b.roof === Roof.GableY) {
    const alongX = b.roof === Roof.GableX;
    const span = alongX ? b.h : b.w;
    const rh = Math.min(5.5, Math.max(1.5, span * 0.42));
    const Hr = H + rh;
    const slope = Math.hypot(span / 2, rh);
    if (alongX) {
      const ym = (y0 + y1) / 2;
      // south slope
      let a = vtx(gb, x0, y0, H, x0 / 4, 0, roofL, roofL, 1.0, bid, white);
      let bb = vtx(gb, x1, y0, H, x1 / 4, 0, roofL, roofL, 1.0, bid, white);
      let c = vtx(gb, x1, ym, Hr, x1 / 4, slope / 4, roofL, roofL, 1.0, bid, white);
      let d = vtx(gb, x0, ym, Hr, x0 / 4, slope / 4, roofL, roofL, 1.0, bid, white);
      gb.quad(a, bb, c, d);
      // north slope
      a = vtx(gb, x1, y1, H, x1 / 4, 0, roofL, roofL, 0.74, bid, white);
      bb = vtx(gb, x0, y1, H, x0 / 4, 0, roofL, roofL, 0.74, bid, white);
      c = vtx(gb, x0, ym, Hr, x0 / 4, slope / 4, roofL, roofL, 0.74, bid, white);
      d = vtx(gb, x1, ym, Hr, x1 / 4, slope / 4, roofL, roofL, 0.74, bid, white);
      gb.quad(a, bb, c, d);
      // gable triangles (west and east)
      const vH = (H - z0) / fh;
      const vR = (Hr - z0) / fh;
      let t0 = vtx(gb, x0, y1, H, 0, vH, upper, upper, SH_W, bid, tint);
      let t1 = vtx(gb, x0, y0, H, b.h / bayW, vH, upper, upper, SH_W, bid, tint);
      let t2 = vtx(gb, x0, ym, Hr, b.h / bayW / 2, vR, upper, upper, SH_W, bid, tint);
      gb.tri(t0, t1, t2);
      t0 = vtx(gb, x1, y0, H, 0, vH, upper, upper, SH_E, bid, tint);
      t1 = vtx(gb, x1, y1, H, b.h / bayW, vH, upper, upper, SH_E, bid, tint);
      t2 = vtx(gb, x1, ym, Hr, b.h / bayW / 2, vR, upper, upper, SH_E, bid, tint);
      gb.tri(t0, t1, t2);
    } else {
      const xm = (x0 + x1) / 2;
      // east slope
      let a = vtx(gb, x1, y0, H, y0 / 4, 0, roofL, roofL, 0.9, bid, white);
      let bb = vtx(gb, x1, y1, H, y1 / 4, 0, roofL, roofL, 0.9, bid, white);
      let c = vtx(gb, xm, y1, Hr, y1 / 4, slope / 4, roofL, roofL, 0.9, bid, white);
      let d = vtx(gb, xm, y0, Hr, y0 / 4, slope / 4, roofL, roofL, 0.9, bid, white);
      gb.quad(a, bb, c, d);
      // west slope
      a = vtx(gb, x0, y1, H, y1 / 4, 0, roofL, roofL, 0.8, bid, white);
      bb = vtx(gb, x0, y0, H, y0 / 4, 0, roofL, roofL, 0.8, bid, white);
      c = vtx(gb, xm, y0, Hr, y0 / 4, slope / 4, roofL, roofL, 0.8, bid, white);
      d = vtx(gb, xm, y1, Hr, y1 / 4, slope / 4, roofL, roofL, 0.8, bid, white);
      gb.quad(a, bb, c, d);
      const vH = (H - z0) / fh;
      const vR = (Hr - z0) / fh;
      let t0 = vtx(gb, x0, y0, H, 0, vH, upper, upper, SH_S, bid, tint);
      let t1 = vtx(gb, x1, y0, H, b.w / bayW, vH, upper, upper, SH_S, bid, tint);
      let t2 = vtx(gb, xm, y0, Hr, b.w / bayW / 2, vR, upper, upper, SH_S, bid, tint);
      gb.tri(t0, t1, t2);
      t0 = vtx(gb, x1, y1, H, 0, vH, upper, upper, SH_N, bid, tint);
      t1 = vtx(gb, x0, y1, H, b.w / bayW, vH, upper, upper, SH_N, bid, tint);
      t2 = vtx(gb, xm, y1, Hr, b.w / bayW / 2, vR, upper, upper, SH_N, bid, tint);
      gb.tri(t0, t1, t2);
    }
    return;
  }

  if (b.roof === Roof.Saw) {
    const n = Math.max(2, Math.round(b.w / 4));
    const tw = b.w / n;
    const ht = 2.2;
    const glass = ROOF_BASE + RS.SawGlass;
    const metal = ROOF_BASE + RS.Metal;
    for (let i = 0; i < n; i++) {
      const xa = x0 + i * tw;
      const xb = xa + tw;
      const sl = Math.hypot(tw, ht);
      let a = vtx(gb, xa, y0, H, 0, y0 / 4, metal, metal, 0.95, bid, white);
      let bb = vtx(gb, xb, y0, H + ht, sl / 4, y0 / 4, metal, metal, 0.95, bid, white);
      let c = vtx(gb, xb, y1, H + ht, sl / 4, y1 / 4, metal, metal, 0.95, bid, white);
      let d = vtx(gb, xa, y1, H, 0, y1 / 4, metal, metal, 0.95, bid, white);
      gb.quad(a, bb, c, d);
      a = vtx(gb, xb, y0, H, y0 / 4, 0, glass, glass, 0.75, bid, white);
      bb = vtx(gb, xb, y1, H, y1 / 4, 0, glass, glass, 0.75, bid, white);
      c = vtx(gb, xb, y1, H + ht, y1 / 4, 0.5, glass, glass, 0.75, bid, white);
      d = vtx(gb, xb, y0, H + ht, y0 / 4, 0.5, glass, glass, 0.75, bid, white);
      gb.quad(a, bb, c, d);
      // end triangles
      const vH = (H - z0) / fh;
      let t0 = vtx(gb, xa, y0, H, 0, vH, upper, upper, SH_S, bid, tint);
      let t1 = vtx(gb, xb, y0, H, tw / bayW, vH, upper, upper, SH_S, bid, tint);
      let t2 = vtx(gb, xb, y0, H + ht, tw / bayW, vH + ht / fh, upper, upper, SH_S, bid, tint);
      gb.tri(t0, t1, t2);
      t0 = vtx(gb, xb, y1, H, 0, vH, upper, upper, SH_N, bid, tint);
      t1 = vtx(gb, xa, y1, H, tw / bayW, vH, upper, upper, SH_N, bid, tint);
      t2 = vtx(gb, xb, y1, H + ht, 0, vH + ht / fh, upper, upper, SH_N, bid, tint);
      gb.tri(t0, t1, t2);
    }
  }
}

function emitRound(gb: GeoBuilder, b: Building, bid: number, tint: [number, number, number], H: number, fh: number): void {
  const n = 10;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const r = Math.min(b.w, b.h) / 2;
  const L = b.facade * 2 + 1;
  const Lg = b.facade * 2;
  const roofL = ROOF_BASE + b.roofStyle;
  const circ = 2 * Math.PI * r;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const nx = Math.cos(am);
    const ny = Math.sin(am);
    const shade = 0.56 + 0.34 * Math.max(0, nx * 0.6 - ny * 0.8);
    const u0 = (i / n) * (circ / 4);
    const u1 = ((i + 1) / n) * (circ / 4);
    const v1 = (H - Z_LOT) / fh;
    const p0x = cx + Math.cos(a0) * r;
    const p0y = cy + Math.sin(a0) * r;
    const p1x = cx + Math.cos(a1) * r;
    const p1y = cy + Math.sin(a1) * r;
    const ia = vtx(gb, p0x, p0y, Z_LOT, u0, 0, Lg, L, shade, bid, tint);
    const ib = vtx(gb, p1x, p1y, Z_LOT, u1, 0, Lg, L, shade, bid, tint);
    const ic = vtx(gb, p1x, p1y, H, u1, v1, Lg, L, shade, bid, tint);
    const id = vtx(gb, p0x, p0y, H, u0, v1, Lg, L, shade, bid, tint);
    gb.quad(ia, ib, ic, id);
  }
  const top = vtx(gb, cx, cy, H, 0.5, 0.5, roofL, roofL, 1, bid, tint);
  const ring: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push(vtx(gb, cx + Math.cos(a) * r, cy + Math.sin(a) * r, H, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, roofL, roofL, 1, bid, tint));
  }
  for (let i = 0; i < n; i++) gb.tri(top, ring[i], ring[(i + 1) % n]);
  if (b.kind === BKind.Chimney) {
    // dark opening
    const dark = ROOF_BASE + RS.Tar;
    const t2 = vtx(gb, cx, cy, H + 0.02, 0.5, 0.5, dark, dark, 0.25, bid, [0.2, 0.2, 0.2]);
    const ring2: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ring2.push(vtx(gb, cx + Math.cos(a) * r * 0.65, cy + Math.sin(a) * r * 0.65, H + 0.02, 0, 0, dark, dark, 0.25, bid, [0.2, 0.2, 0.2]));
    }
    for (let i = 0; i < n; i++) gb.tri(t2, ring2[i], ring2[(i + 1) % n]);
  }
}

function emitClutter(gb: GeoBuilder, b: Building, bid: number, H: number): void {
  const rng = new RNG(bid * 7919 + 13);
  const area = b.w * b.h;
  const count = Math.min(6, 1 + Math.floor(area / 90));
  const metal = ROOF_BASE + RS.Metal;
  const conc = ROOF_BASE + RS.Concrete;
  const white: [number, number, number] = [1, 1, 1];
  for (let k = 0; k < count; k++) {
    const kind = rng.next();
    let w: number, d: number, h: number, layer: number;
    if (kind < 0.15 && area > 120) {
      w = 2.6;
      d = 2.8;
      h = 2.6;
      layer = conc;
    } else if (kind < 0.6) {
      w = 1.3;
      d = 1.0;
      h = 0.9;
      layer = metal;
    } else {
      w = 0.7;
      d = 0.7;
      h = 1.1;
      layer = metal;
    }
    if (b.w < w + 2.4 || b.h < d + 2.4) continue;
    const cx = rng.range(b.x + 1.2 + w / 2, b.x + b.w - 1.2 - w / 2);
    const cy = rng.range(b.y + 1.2 + d / 2, b.y + b.h - 1.2 - d / 2);
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const y0 = cy - d / 2;
    const y1 = cy + d / 2;
    const z0 = H;
    const z1 = H + h;
    const face = (ax: number, ay: number, bx: number, by: number, sh: number): void => {
      const len = Math.hypot(bx - ax, by - ay);
      const i0 = vtx(gb, ax, ay, z0, 0, 0, layer, layer, sh, bid, white);
      const i1 = vtx(gb, bx, by, z0, len / 4, 0, layer, layer, sh, bid, white);
      const i2 = vtx(gb, bx, by, z1, len / 4, h / 4, layer, layer, sh, bid, white);
      const i3 = vtx(gb, ax, ay, z1, 0, h / 4, layer, layer, sh, bid, white);
      gb.quad(i0, i1, i2, i3);
    };
    face(x0, y0, x1, y0, SH_S);
    face(x1, y0, x1, y1, SH_E);
    face(x1, y1, x0, y1, SH_N);
    face(x0, y1, x0, y0, SH_W);
    const a = vtx(gb, x0, y0, z1, 0, 0, layer, layer, 1.05, bid, white);
    const bb = vtx(gb, x1, y0, z1, w / 4, 0, layer, layer, 1.05, bid, white);
    const c = vtx(gb, x1, y1, z1, w / 4, d / 4, layer, layer, 1.05, bid, white);
    const dd = vtx(gb, x0, y1, z1, 0, d / 4, layer, layer, 1.05, bid, white);
    gb.quad(a, bb, c, dd);
  }
}

// ==========================================================================================
// Props
// ==========================================================================================

const BIN_COLORS = [0xe07020, 0x3a7a3a, 0x5a5e64, 0xe0c020];
const CRANE_COLORS = [0x2a5aa8, 0xc8402a];
const UMB_COLORS = [0xd03a2a, 0x2a7ad0, 0xe0c020];

function emitProp(gb: GeoBuilder, tb: GeoBuilder, glow: GeoBuilder, p: Prop, id: number, city: City): void {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  switch (p.t) {
    case P.Tree:
    case P.TreeSmall: {
      const big = p.t === P.Tree;
      const r = (big ? 2.7 : 1.8) * (0.85 + ((id * 37) % 30) / 100);
      const z = big ? 6.5 + ((id * 13) % 15) / 10 : 4.4;
      const layer = (p.v ?? 0) % 3 === 0 && (id % 11 === 0) ? 3 : (p.v ?? 0) % 3;
      const tint: [number, number, number] = [0.9 + ((id * 7) % 20) / 100, 0.92 + ((id * 11) % 16) / 100, 0.9];
      const rot = p.rot;
      const cr = Math.cos(rot) * r;
      const sr = Math.sin(rot) * r;
      const corners = [
        [-cr + sr, -sr - cr],
        [cr + sr, sr - cr],
        [cr - sr, sr + cr],
        [-cr - sr, -sr + cr],
      ];
      const uv = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ];
      const ids: number[] = [];
      for (let k = 0; k < 4; k++) {
        ids.push(tb.v(p.x + corners[k][0], p.y + corners[k][1], z, 0, 0, 1, uv[k][0], uv[k][1]));
        tb.ex('aLayer', layer);
        tb.ex('aTint', ...tint);
      }
      tb.quad(ids[0], ids[1], ids[2], ids[3]);
      break;
    }
    case P.Lamp: {
      addBox(gb, p.x, p.y, 0, 0.16, 0.16, 6.6, p.rot, 0x4a4e54);
      addBox(gb, p.x + c * 0.8, p.y + s * 0.8, 6.4, 1.7, 0.12, 0.12, p.rot, 0x4a4e54);
      addBox(gb, p.x + c * 1.6, p.y + s * 1.6, 6.2, 0.6, 0.3, 0.18, p.rot, 0x2a2c30, [1, 0, 0, 0]);
      break;
    }
    case P.TrafficLight: {
      const j = city.junctions[p.ref ?? 0];
      const phase = j ? j.phase : 0;
      const group = p.v ?? 0;
      const arm = Math.max(3, (p.w ?? 6) - 1);
      addBox(gb, p.x, p.y, 0, 0.22, 0.22, 5.6, p.rot, 0x3a3d42);
      addBox(gb, p.x + c * (arm / 2), p.y + s * (arm / 2), 5.3, arm, 0.3, 0.25, p.rot, 0x55595f);
      const hx = p.x + c * arm;
      const hy = p.y + s * arm;
      addBox(gb, hx, hy, 4.6, 0.6, 1.6, 0.95, p.rot, 0x1e2024);
      // lenses arranged across the head (red, yellow, green)
      for (let lens = 0; lens < 3; lens++) {
        const off = (lens - 1) * 0.5;
        addBox(gb, hx - s * off, hy + c * off, 5.55, 0.42, 0.42, 0.06, p.rot, 0x222222, [2, phase, group, lens]);
      }
      // ground glow pool
      const gx = hx + c * 1.5;
      const gy = hy + s * 1.5;
      const R = 3.2;
      const ids: number[] = [];
      for (const [dx, dy, u, v] of [
        [-R, -R, 0, 0],
        [R, -R, 1, 0],
        [R, R, 1, 1],
        [-R, R, 0, 1],
      ]) {
        ids.push(glow.v(gx + dx, gy + dy, 0.06, 0, 0, 1, u, v, 1, 1, 1));
        glow.ex('aEmit', 2, phase, group, 0);
      }
      glow.quad(ids[0], ids[1], ids[2], ids[3]);
      break;
    }
    case P.Bench:
      addBox(gb, p.x, p.y, 0.12, 1.7, 0.5, 0.45, p.rot, 0x7a5a3a, [0, 0, 0, 0], 0x8a6a46);
      break;
    case P.Bin:
      addCyl(gb, p.x, p.y, 0.12, 0.3, 0.95, BIN_COLORS[(p.v ?? 0) % 4], 0x2a2a2a, 8);
      break;
    case P.Phone:
      addBox(gb, p.x, p.y, 0.12, 1.1, 1.1, 2.4, 0, 0xf2c41a, [0, 0, 0, 0], 0x7a7a7a);
      addBox(gb, p.x, p.y, 2.52, 0.5, 1.12, 0.12, 0, 0xffffff, [3, 0, 0, 0], 0xf2c41a);
      break;
    case P.BusStop: {
      addBox(gb, p.x, p.y, 2.4, 3.4, 1.5, 0.15, p.rot + Math.PI / 2, 0x4a5a6a, [0, 0, 0, 0], 0x6a8090);
      addBox(gb, p.x - c * 0.6, p.y - s * 0.6, 0.12, 3.2, 0.08, 2.3, p.rot + Math.PI / 2, 0x9ab8c8);
      addBox(gb, p.x + s * 2.0, p.y - c * 2.0, 0, 0.12, 0.12, 2.6, 0, 0x5a5a5a);
      addCyl(gb, p.x + s * 2.0, p.y - c * 2.0, 2.6, 0.38, 0.06, 0xf2c41a, 0x2a8a3a, 10);
      break;
    }
    case P.Litfass:
      addCyl(gb, p.x, p.y, 0.12, 0.65, 2.9, 0xd8c8a0, 0x2f5a3a, 10);
      addCyl(gb, p.x, p.y, 1.2, 0.67, 0.9, 0xc0392b, 0x2f5a3a, 10);
      break;
    case P.Bollard:
      addCyl(gb, p.x, p.y, 0.12, 0.22, 0.8, 0x3a3a3a, 0xd8b020, 6);
      break;
    case P.Hedge:
      addBox(gb, p.x, p.y, 0.12, p.w ?? 1, p.h ?? 1, 1.3, 0, 0x3e6a2e, [0, 0, 0, 0], 0x4a7e36);
      break;
    case P.Fence:
      addBox(gb, p.x, p.y, 0.12, p.w ?? 4, p.h ?? 0.2, 1.9, 0, 0x6a6e72, [0, 0, 0, 0], 0x8a8e92);
      break;
    case P.Fountain:
      addCyl(gb, p.x, p.y, 0.12, 2.6, 0.55, 0xa8a49a, 0xa8a49a, 12);
      addCyl(gb, p.x, p.y, 0.12, 2.25, 0.6, 0x4a8ab0, 0x5aa0c8, 12);
      addCyl(gb, p.x, p.y, 0.6, 0.4, 1.6, 0xa8a49a, 0xc0bcb2, 8);
      break;
    case P.Crane: {
      const col = CRANE_COLORS[(p.v ?? 0) % 2];
      // legs straddling the quay
      for (const [ax, ay] of [
        [-5, -6],
        [5, -6],
        [-5, 6],
        [5, 6],
      ]) {
        addBox(gb, p.x + ax * c - ay * s, p.y + ax * s + ay * c, 0, 1.1, 1.1, 18, p.rot, col);
      }
      // main girder and boom extending over the water (along +x local)
      addBox(gb, p.x + c * 8, p.y + s * 8, 18, 40, 2.4, 1.6, p.rot, col, [0, 0, 0, 0], 0xd8c040);
      addBox(gb, p.x - c * 3, p.y - s * 3, 19.6, 7, 4, 2.6, p.rot, 0xe8e4dc);
      break;
    }
    case P.Kiosk:
      addBox(gb, p.x, p.y, 0.12, 3.2, 2.6, 2.8, p.rot, 0xe8e0d0, [0, 0, 0, 0], 0xc0392b);
      addBox(gb, p.x, p.y - 1.5, 2.2, 3.4, 0.7, 0.12, p.rot, 0x2e8a4a);
      break;
    case P.Playground:
      addBox(gb, p.x - 1.2, p.y, 0.12, 0.6, 2.6, 1.6, 0, 0xd03a2a);
      addBox(gb, p.x + 1.0, p.y + 0.6, 0.12, 1.6, 1.6, 2.0, 0, 0x3a7ad0, [0, 0, 0, 0], 0xe0c020);
      break;
    case P.Umbrella:
      addCyl(gb, p.x, p.y, 0, 0.05, 2.2, 0xdddddd);
      addCyl(gb, p.x, p.y, 2.2, 1.4, 0.12, UMB_COLORS[(p.v ?? 0) % 3], 0xf2eee6, 8);
      break;
    default:
      break;
  }
}

// ==========================================================================================
// Road markings
// ==========================================================================================

function buildMarkings(city: City): Mark[] {
  const out: Mark[] = [];
  const W = MARK_UV.white;
  const line = (x0: number, y0: number, x1: number, y1: number, wid: number, alpha = 0.92): void => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 0.05) return;
    const rot = Math.atan2(y1 - y0, x1 - x0);
    // split long lines so chunks stay local
    const pieces = Math.max(1, Math.ceil(len / 12));
    for (let i = 0; i < pieces; i++) {
      const t0 = i / pieces;
      const t1 = (i + 1) / pieces;
      const cx = x0 + (x1 - x0) * (t0 + t1) * 0.5;
      const cy = y0 + (y1 - y0) * (t0 + t1) * 0.5;
      out.push({ x: cx, y: cy, len: len / pieces, wid, rot, uv: W, alpha });
    }
  };
  const dashed = (x0: number, y0: number, x1: number, y1: number, wid: number, dash: number, gap: number): void => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const dx = (x1 - x0) / len;
    const dy = (y1 - y0) / len;
    for (let s = gap * 0.5; s + dash <= len; s += dash + gap) {
      line(x0 + dx * s, y0 + dy * s, x0 + dx * (s + dash), y0 + dy * (s + dash), wid);
    }
  };

  for (const e of city.lanes) {
    if (e.road < 0) continue;
    const r = city.roads[e.road];
    const n = e.xs.length;
    const sx = e.xs[0];
    const sy = e.ys[0];
    const ex = e.xs[n - 1];
    const ey = e.ys[n - 1];
    const len = e.len;
    if (len < 1) continue;
    const dx = (ex - sx) / len;
    const dy = (ey - sy) / len;
    // left normal (towards the road centre for lane 0)
    const lx = -dy;
    const ly = dx;
    const T = TILE;
    // trim: leave out crosswalk tiles at both ends
    const trimStart = e.prev.length ? T + 0.5 : 0;
    const trimEnd = e.junction >= 0 ? e.stopOffset + 0.3 : 0;
    const a0 = trimStart;
    const a1 = len - trimEnd;
    if (a1 - a0 < 1) continue;
    const P0x = sx + dx * a0;
    const P0y = sy + dy * a0;
    const P1x = sx + dx * a1;
    const P1y = sy + dy * a1;
    // centre line: drawn once per road segment (for the positive direction lane 0)
    if (e.laneIdx === 0 && (e.dir === 0 || e.dir === 1)) {
      const off = T * 0.5;
      const cx0 = P0x + lx * off;
      const cy0 = P0y + ly * off;
      const cx1 = P1x + lx * off;
      const cy1 = P1y + ly * off;
      if (r.kind === RoadKind.Arterial) {
        line(cx0 + lx * 0.12, cy0 + ly * 0.12, cx1 + lx * 0.12, cy1 + ly * 0.12, 0.13);
        line(cx0 - lx * 0.12, cy0 - ly * 0.12, cx1 - lx * 0.12, cy1 - ly * 0.12, 0.13);
      } else if (r.kind === RoadKind.Edge) line(cx0, cy0, cx1, cy1, 0.14);
      else if (!r.cobble) dashed(cx0, cy0, cx1, cy1, 0.13, 3, 6);
    }
    // lane divider between this lane and the next outer lane
    if (e.laneIdx < e.lanesInDir - 1) {
      const off = -T * 0.5;
      dashed(P0x + lx * off, P0y + ly * off, P1x + lx * off, P1y + ly * off, 0.13, 3, 6);
    }
    // stop / yield line + arrows
    if (e.junction >= 0 && (e.signal >= 0 || e.yieldAtEnd)) {
      const sxp = sx + dx * (len - e.stopOffset + 0.25);
      const syp = sy + dy * (len - e.stopOffset + 0.25);
      if (e.signal >= 0) {
        line(sxp + lx * (T / 2 - 0.15), syp + ly * (T / 2 - 0.15), sxp - lx * (T / 2 - 0.15), syp - ly * (T / 2 - 0.15), 0.5);
      } else {
        // dashed yield line (Wartelinie)
        for (let k = -3; k <= 2; k++) {
          const o0 = k * 0.65 + 0.1;
          line(sxp + lx * o0, syp + ly * o0, sxp + lx * (o0 + 0.4), syp + ly * (o0 + 0.4), 0.35);
        }
      }
      if (e.lanesInDir >= 2 && e.signal >= 0 && len > 22) {
        const ax = sx + dx * (len - e.stopOffset - 9);
        const ay = sy + dy * (len - e.stopOffset - 9);
        const uv = e.laneIdx === 0 ? MARK_UV.arrowStraightLeft : MARK_UV.arrowStraightRight;
        out.push({ x: ax, y: ay, len: 5, wid: 1.6, rot: Math.atan2(dy, dx), uv, alpha: 0.9 });
      }
    }
  }
  // zebra crossings
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const i = ty * MAP_W + tx;
      if (!(city.flags[i] & F_CROSSWALK)) continue;
      const rid = city.roadAt[i];
      if (rid < 0) continue;
      const r = city.roads[rid];
      const T = TILE;
      const cx = (tx + 0.5) * T;
      const cy = (ty + 0.5) * T;
      // stripes parallel to traffic, arrayed across the road
      for (let k = 0; k < 4; k++) {
        const o = -T / 2 + 0.5 + k;
        if (r.horiz) out.push({ x: cx, y: cy + o, len: 3, wid: 0.5, rot: 0, uv: MARK_UV.white, alpha: 0.95 });
        else out.push({ x: cx + o, y: cy, len: 3, wid: 0.5, rot: Math.PI / 2, uv: MARK_UV.white, alpha: 0.95 });
      }
    }
  }
  void Turn;
  return out;
}

// smooth value noise in [0,1)
function hashf(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hashf(x0, y0);
  const b = hashf(x0 + 1, y0);
  const c = hashf(x0, y0 + 1);
  const d = hashf(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
