// Procedural generator for Neuhafen. Deterministic for a given seed.
// Macro layout (districts, water, arterials) is hand-authored; streets, blocks and buildings are generated.
import { RNG } from '../core/rng';
import { City } from './city';
import {
  MAP_W,
  MAP_H,
  TILE,
  G,
  D,
  Zone,
  RoadKind,
  Turn,
  F_ROAD,
  F_SIDEWALK,
  F_BRIDGE,
  F_JUNCTION,
  F_CROSSWALK,
  F_RESERVED,
  SOLID_WATER,
  SOLID_WALL,
  type Road,
  type Block,
  type LaneEdge,
  zoneOfTileY,
} from './types';
import { fillBlocks, placeLandmarks, placeStreetProps } from './blockfill';
import { CANAL, RIVER, BASINS, RESERVED, type Rect } from './layout';
export { CANAL, RIVER, BASINS, RESERVED, type Rect };


interface Sides {
  n: boolean;
  s: boolean;
  e: boolean;
  w: boolean;
}

// ---------------------------------------------------------------------------------------------
// Macro layout (tiles; y grows north)
// ---------------------------------------------------------------------------------------------

const DISTRICT_RECTS: [D, number, number, number, number][] = [
  [D.Hafen, 0, 0, 256, 96],
  [D.Industrie, 256, 0, 400, 96],
  [D.Kiez, 0, 96, 140, 216],
  [D.Bahnhof, 140, 96, 230, 216],
  [D.Platte, 230, 96, 400, 216],
  [D.Altstadt, 0, 216, 140, 320],
  [D.Villen, 0, 320, 140, 400],
  [D.Turm, 140, 216, 290, 310],
  [D.Uni, 140, 310, 230, 400],
  [D.Park, 230, 310, 300, 400],
  [D.Flughafen, 300, 300, 400, 400],
  [D.Nordend, 290, 216, 400, 300],
];

interface HDef {
  c: number;
  lanes: number;
  name: string;
  kind: RoadKind;
}

const H_DEFS: HDef[] = [
  { c: 30, lanes: 2, name: 'Kaistraße', kind: RoadKind.Arterial },
  { c: 76, lanes: 2, name: 'Hafenstraße', kind: RoadKind.Arterial },
  { c: 95, lanes: 1, name: 'Am Hafenkanal', kind: RoadKind.Edge },
  { c: 105, lanes: 1, name: 'Kanaluferweg', kind: RoadKind.Edge },
  { c: 160, lanes: 2, name: 'Hauptstraße', kind: RoadKind.Arterial },
  { c: 215, lanes: 1, name: 'Lauterkai', kind: RoadKind.Edge },
  { c: 233, lanes: 1, name: 'Nordufer', kind: RoadKind.Edge },
  { c: 280, lanes: 2, name: 'Ringstraße', kind: RoadKind.Arterial },
  { c: 340, lanes: 2, name: 'Lindenallee', kind: RoadKind.Arterial },
  { c: 395, lanes: 1, name: 'Nordrand', kind: RoadKind.Edge },
];

interface VDef {
  c: number;
  lanes: number;
  name: string;
  kind: RoadKind;
}

const V_DEFS: VDef[] = [
  { c: 3, lanes: 1, name: 'Westring', kind: RoadKind.Edge },
  { c: 32, lanes: 2, name: 'Speicherallee', kind: RoadKind.Arterial },
  { c: 104, lanes: 2, name: 'Brückenstraße', kind: RoadKind.Arterial },
  { c: 176, lanes: 2, name: 'Bahnhofstraße', kind: RoadKind.Arterial },
  { c: 248, lanes: 2, name: 'Stahlstraße', kind: RoadKind.Arterial },
  { c: 320, lanes: 2, name: 'Plattenring', kind: RoadKind.Arterial },
  { c: 378, lanes: 2, name: 'Ostring', kind: RoadKind.Arterial },
];

const ROAD_X0 = 4; // horizontal roads span [4, 376)
const ROAD_X1 = 376;
const ROAD_Y0 = 28; // vertical roads span [28, 396)
const ROAD_Y1 = 396;


interface Style {
  min: number;
  max: number;
  sub: boolean;
  cobble: boolean;
}

const STYLES: Record<number, Style> = {
  [D.None]: { min: 14, max: 26, sub: true, cobble: false },
  [D.Kiez]: { min: 10, max: 20, sub: true, cobble: false },
  [D.Bahnhof]: { min: 12, max: 22, sub: true, cobble: false },
  [D.Platte]: { min: 20, max: 38, sub: true, cobble: false },
  [D.Hafen]: { min: 16, max: 30, sub: true, cobble: false },
  [D.Industrie]: { min: 20, max: 36, sub: true, cobble: false },
  [D.Altstadt]: { min: 8, max: 15, sub: true, cobble: true },
  [D.Turm]: { min: 14, max: 22, sub: true, cobble: false },
  [D.Villen]: { min: 12, max: 22, sub: true, cobble: false },
  [D.Uni]: { min: 18, max: 30, sub: true, cobble: false },
  [D.Park]: { min: 99, max: 999, sub: false, cobble: false },
  [D.Flughafen]: { min: 99, max: 999, sub: false, cobble: false },
  [D.Nordend]: { min: 12, max: 20, sub: true, cobble: false },
};

const STREET_NAMES: Record<number, string[]> = {
  [D.Kiez]: ['Neonmeile', 'Budenweg', 'Kiezgasse', 'Seilerweg', 'Matrosengang', 'Hafenblick', 'Talweg', 'Lichtergasse'],
  [D.Bahnhof]: ['Kaiserweg', 'Münzgasse', 'Taunusweg', 'Elbestraße', 'Mosel-Gasse', 'Weserweg', 'Postgasse'],
  [D.Platte]: ['Friedensring', 'Kosmonautenweg', 'Am Plattenwerk', 'Sonnenallee', 'Ernst-Bloch-Weg', 'Fichtenweg', 'Birkenhain', 'Weg der Jugend'],
  [D.Hafen]: ['Zollweg', 'Kranweg', 'Speicherweg', 'Werftstraße', 'Ankerweg', 'Kai 7'],
  [D.Industrie]: ['Hüttenweg', 'Kokereiweg', 'Schlackenweg', 'Walzwerkstraße', 'Gießereiweg'],
  [D.Altstadt]: ['Kirchgasse', 'Am Markt', 'Fischergasse', 'Mühlengasse', 'Krämergasse', 'Domweg', 'Schmiedegasse'],
  [D.Turm]: ['Börsenstraße', 'Bankenweg', 'Platz der Einheit', 'Kontorstraße'],
  [D.Villen]: ['Rosenweg', 'Am Sonnenhang', 'Parkallee', 'Fliederweg', 'Villenweg'],
  [D.Uni]: ['Campusweg', 'Humboldtweg', 'Bibliotheksgasse', 'Mensaweg'],
  [D.Nordend]: ['Lessingstraße', 'Uhlandweg', 'Heinestraße', 'Fontaneweg', 'Kantweg'],
};

// ---------------------------------------------------------------------------------------------

export function generateCity(seed = 20261016): City {
  const city = new City();
  const rng = new RNG(seed);

  paintDistricts(city);
  paintWater(city);
  markReserved(city);

  const roadIds: number[] = [];
  for (const h of H_DEFS) {
    roadIds.push(addRoad(city, { horiz: true, c: h.c, lanes: h.lanes, a0: ROAD_X0, a1: ROAD_X1, kind: h.kind, name: h.name, cobble: false }));
  }
  for (const v of V_DEFS) {
    roadIds.push(addRoad(city, { horiz: false, c: v.c, lanes: v.lanes, a0: ROAD_Y0, a1: ROAD_Y1, kind: v.kind, name: v.name, cobble: false }));
  }

  // Regions between the fixed grid of roads, split by water.
  const hs = [...H_DEFS].sort((a, b) => a.c - b.c);
  const vs = [...V_DEFS].sort((a, b) => a.c - b.c);
  for (let i = 0; i < hs.length - 1; i++) {
    const y0 = hs[i].c + hs[i].lanes;
    const y1 = hs[i + 1].c - hs[i + 1].lanes;
    if (y1 <= y0) continue;
    for (let j = 0; j < vs.length - 1; j++) {
      const x0 = vs[j].c + vs[j].lanes;
      const x1 = vs[j + 1].c - vs[j + 1].lanes;
      if (x1 <= x0) continue;
      for (const part of splitByWaterColumns(city, { x0, y0, x1, y1 })) {
        subdivide(city, rng, part.r, { n: true, s: true, w: part.w, e: part.e }, 0);
      }
    }
  }

  // Edge strips south of the Kaistraße (quays and the tank farm).
  for (const strip of [
    { x0: 2, y0: 24, x1: 256, y1: 28 },
    { x0: 256, y0: 12, x1: 376, y1: 28 },
  ]) {
    for (const part of splitByWaterColumns(city, strip)) {
      addBlock(city, part.r, { n: true, s: false, w: false, e: false });
    }
  }

  rasterRoads(city);
  rasterBlocks(city);
  paintBorders(city);
  buildJunctions(city, rng);
  buildLanes(city);
  city.indexLanes();

  placeLandmarks(city, rng);
  fillBlocks(city, rng);
  placeStreetProps(city, rng);
  buildRailings(city);
  buildZoneBarriers(city);
  markBarrierLanes(city);
  definePOIs(city);
  finalizeVariants(city);
  return city;
}

// ---------------------------------------------------------------------------------------------

function paintDistricts(city: City): void {
  city.district.fill(D.None);
  for (const [d, x0, y0, x1, y1] of DISTRICT_RECTS) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) city.district[y * MAP_W + x] = d;
  }
}

function setWater(city: City, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = Math.max(0, y0); y < Math.min(MAP_H, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(MAP_W, x1); x++) {
      const i = y * MAP_W + x;
      city.ground[i] = G.Water;
      city.solid[i] = SOLID_WATER;
    }
  }
}

function paintWater(city: City): void {
  city.ground.fill(G.Grass);
  // sea
  setWater(city, 0, 0, 256, 24);
  setWater(city, 256, 0, 400, 12);
  setWater(city, 376, 0, 400, 28);
  // harbour basins
  for (const b of BASINS) setWater(city, b.x0, b.y0, b.x1, b.y1);
  // canal and river span the whole width
  setWater(city, 0, CANAL.y0, MAP_W, CANAL.y1);
  setWater(city, 0, RIVER.y0, MAP_W, RIVER.y1);
}

function markReserved(city: City): void {
  for (const r of Object.values(RESERVED)) {
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) city.flags[y * MAP_W + x] |= F_RESERVED;
  }
}

function intersectsReserved(x0: number, y0: number, x1: number, y1: number): boolean {
  for (const r of Object.values(RESERVED)) {
    if (x0 < r.x1 && x1 > r.x0 && y0 < r.y1 && y1 > r.y0) return true;
  }
  return false;
}

function addRoad(
  city: City,
  r: { horiz: boolean; c: number; lanes: number; a0: number; a1: number; kind: RoadKind; name: string; cobble: boolean },
): number {
  const id = city.roads.length;
  const speed = r.kind === RoadKind.Arterial ? 15 : r.kind === RoadKind.Edge ? 13 : 11;
  const road: Road = { id, horiz: r.horiz, c: r.c, a0: r.a0, a1: r.a1, lanes: r.lanes, kind: r.kind, name: r.name, speed, cobble: r.cobble };
  city.roads.push(road);
  return id;
}

/** Split a region into land parts separated by full-height water columns. */
function splitByWaterColumns(city: City, r: Rect): { r: Rect; w: boolean; e: boolean }[] {
  const out: { r: Rect; w: boolean; e: boolean }[] = [];
  let start = -1;
  const colWater = (x: number): boolean => {
    for (let y = r.y0; y < r.y1; y++) if (city.solid[y * MAP_W + x] !== SOLID_WATER) return false;
    return true;
  };
  for (let x = r.x0; x <= r.x1; x++) {
    const water = x === r.x1 ? true : colWater(x);
    if (!water && start < 0) start = x;
    if (water && start >= 0) {
      out.push({ r: { x0: start, y0: r.y0, x1: x, y1: r.y1 }, w: start === r.x0, e: x === r.x1 });
      start = -1;
    }
  }
  // Fully land region adjacent to roads on both ends:
  for (const p of out) {
    p.w = p.r.x0 === r.x0;
    p.e = p.r.x1 === r.x1;
  }
  return out;
}

function styleAt(city: City, r: Rect): Style {
  const cx = Math.floor((r.x0 + r.x1) / 2);
  const cy = Math.floor((r.y0 + r.y1) / 2);
  const d = city.district[cy * MAP_W + cx] as D;
  return STYLES[d] ?? STYLES[D.None];
}

function streetName(city: City, rng: RNG, r: Rect): string {
  const cx = Math.floor((r.x0 + r.x1) / 2);
  const cy = Math.floor((r.y0 + r.y1) / 2);
  const d = city.district[cy * MAP_W + cx] as D;
  const list = STREET_NAMES[d] ?? ['Nebenstraße'];
  return rng.pick(list);
}

function subdivide(city: City, rng: RNG, r: Rect, sides: Sides, depth: number): void {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  if (w <= 0 || h <= 0) return;
  const st = styleAt(city, r);
  const canV = sides.n && sides.s;
  const canH = sides.w && sides.e;
  const needV = st.sub && canV && w > st.max;
  const needH = st.sub && canH && h > st.max;
  if (!needV && !needH) {
    addBlock(city, r, sides);
    return;
  }
  const lanes = 1;
  const rw = lanes * 2;
  const order: boolean[] = [];
  if (needV && needH) {
    const v = w / h > rng.range(0.8, 1.25);
    order.push(v, !v);
  } else order.push(needV);

  for (const vertical of order) {
    for (let attempt = 0; attempt < 14; attempt++) {
      if (vertical) {
        const lo = r.x0 + st.min;
        const hi = r.x1 - st.min - rw;
        if (hi < lo) break;
        // bias toward the middle for nicer blocks
        const mid = (lo + hi) / 2;
        const x = Math.round(attempt < 7 ? mid + (rng.next() - 0.5) * (hi - lo) * 0.7 : rng.int(lo, hi));
        if (x < lo || x > hi) continue;
        if (intersectsReserved(x - 1, r.y0, x + rw + 1, r.y1)) continue;
        addRoad(city, {
          horiz: false,
          c: x + lanes,
          lanes,
          a0: r.y0,
          a1: r.y1,
          kind: RoadKind.Local,
          name: streetName(city, rng, r),
          cobble: st.cobble,
        });
        subdivide(city, rng, { x0: r.x0, y0: r.y0, x1: x, y1: r.y1 }, { ...sides, e: true }, depth + 1);
        subdivide(city, rng, { x0: x + rw, y0: r.y0, x1: r.x1, y1: r.y1 }, { ...sides, w: true }, depth + 1);
        return;
      } else {
        const lo = r.y0 + st.min;
        const hi = r.y1 - st.min - rw;
        if (hi < lo) break;
        const mid = (lo + hi) / 2;
        const y = Math.round(attempt < 7 ? mid + (rng.next() - 0.5) * (hi - lo) * 0.7 : rng.int(lo, hi));
        if (y < lo || y > hi) continue;
        if (intersectsReserved(r.x0, y - 1, r.x1, y + rw + 1)) continue;
        addRoad(city, {
          horiz: true,
          c: y + lanes,
          lanes,
          a0: r.x0,
          a1: r.x1,
          kind: RoadKind.Local,
          name: streetName(city, rng, r),
          cobble: st.cobble,
        });
        subdivide(city, rng, { x0: r.x0, y0: r.y0, x1: r.x1, y1: y }, { ...sides, n: true }, depth + 1);
        subdivide(city, rng, { x0: r.x0, y0: y + rw, x1: r.x1, y1: r.y1 }, { ...sides, s: true }, depth + 1);
        return;
      }
    }
  }
  addBlock(city, r, sides);
}

function addBlock(city: City, r: Rect, sides: Sides): void {
  const cx = Math.floor((r.x0 + r.x1) / 2);
  const cy = Math.floor((r.y0 + r.y1) / 2);
  const d = city.district[cy * MAP_W + cx] as D;
  const b: Block = {
    id: city.blocks.length,
    x0: r.x0,
    y0: r.y0,
    x1: r.x1,
    y1: r.y1,
    district: d,
    zone: zoneOfTileY(cy),
    n: sides.n,
    s: sides.s,
    e: sides.e,
    w: sides.w,
    rx0: (r.x0 + 0.5) * TILE,
    ry0: (r.y0 + 0.5) * TILE,
    rx1: (r.x1 - 0.5) * TILE,
    ry1: (r.y1 - 0.5) * TILE,
    park: d === D.Park,
  };
  city.blocks.push(b);
}

function rasterRoads(city: City): void {
  for (const r of city.roads) {
    const across0 = r.c - r.lanes;
    const across1 = r.c + r.lanes;
    for (let a = r.a0; a < r.a1; a++) {
      for (let c = across0; c < across1; c++) {
        const x = r.horiz ? a : c;
        const y = r.horiz ? c : a;
        if (!city.inBounds(x, y)) continue;
        const i = y * MAP_W + x;
        const overWater = city.solid[i] === SOLID_WATER || (city.flags[i] & F_BRIDGE) !== 0;
        city.flags[i] |= F_ROAD;
        city.roadAt[i] = r.id;
        if (overWater) {
          city.flags[i] |= F_BRIDGE;
          city.ground[i] = G.Bridge;
          city.solid[i] = 0;
        } else {
          city.ground[i] = r.cobble ? G.Cobble : G.Asphalt;
        }
      }
      // bridge walkways
      for (const c of [across0 - 1, across1]) {
        const x = r.horiz ? a : c;
        const y = r.horiz ? c : a;
        if (!city.inBounds(x, y)) continue;
        const i = y * MAP_W + x;
        if (city.solid[i] === SOLID_WATER) {
          city.ground[i] = G.BridgeWalk;
          city.solid[i] = 0;
          city.flags[i] |= F_BRIDGE | F_SIDEWALK;
        }
      }
    }
  }
}

function rasterBlocks(city: City): void {
  for (const b of city.blocks) {
    for (let y = b.y0; y < b.y1; y++) {
      for (let x = b.x0; x < b.x1; x++) {
        const i = y * MAP_W + x;
        city.blockAt[i] = b.id;
        if (city.solid[i] === SOLID_WATER) continue;
        const edge = x === b.x0 || x === b.x1 - 1 || y === b.y0 || y === b.y1 - 1;
        if (edge) {
          // sidewalk next to roads, quay next to water
          const nearRoad =
            city.isRoad(x - 1, y) || city.isRoad(x + 1, y) || city.isRoad(x, y - 1) || city.isRoad(x, y + 1) ||
            city.isRoad(x - 1, y - 1) || city.isRoad(x + 1, y + 1) || city.isRoad(x - 1, y + 1) || city.isRoad(x + 1, y - 1);
          const nearWater =
            city.isWaterTile(x - 1, y) || city.isWaterTile(x + 1, y) || city.isWaterTile(x, y - 1) || city.isWaterTile(x, y + 1);
          if (nearRoad) {
            city.ground[i] = b.district === D.Altstadt ? G.Pavers : G.Sidewalk;
            city.flags[i] |= F_SIDEWALK;
          } else if (nearWater) {
            city.ground[i] = G.Quay;
            city.flags[i] |= F_SIDEWALK;
          } else {
            city.ground[i] = G.Sidewalk;
            city.flags[i] |= F_SIDEWALK;
          }
        }
      }
    }
  }
}

function paintBorders(city: City): void {
  // west border wall, east Autobahn reserve, north border
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      if (city.solid[i] === SOLID_WATER) continue;
      if (city.flags[i] & (F_ROAD | F_SIDEWALK)) continue;
      if (city.blockAt[i] >= 0) continue;
      if (x < 2 || y >= 396 || x >= 380) {
        city.ground[i] = x >= 380 && x < 398 && y < 396 ? G.Forest : G.Wall;
        city.solid[i] = SOLID_WALL;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Junctions & lanes
// ---------------------------------------------------------------------------------------------

const ARM_E = 1;
const ARM_N = 2;
const ARM_W = 4;
const ARM_S = 8;

function buildJunctions(city: City, rng: RNG): void {
  const hs = city.roads.filter((r) => r.horiz);
  const vs = city.roads.filter((r) => !r.horiz);
  for (const h of hs) {
    for (const v of vs) {
      const bx0 = v.c - v.lanes;
      const bx1 = v.c + v.lanes;
      const by0 = h.c - h.lanes;
      const by1 = h.c + h.lanes;
      const hThrough = bx0 >= h.a0 && bx1 <= h.a1;
      const hAdj = bx1 === h.a0 || bx0 === h.a1;
      const vThrough = by0 >= v.a0 && by1 <= v.a1;
      const vAdj = by1 === v.a0 || by0 === v.a1;
      if (!(hThrough || hAdj) || !(vThrough || vAdj)) continue;
      if (hAdj && vAdj) continue;
      let arms = 0;
      if (h.a1 > bx1 && (hThrough || bx1 === h.a0)) arms |= ARM_E;
      if (h.a0 < bx0 && (hThrough || bx0 === h.a1)) arms |= ARM_W;
      if (v.a1 > by1 && (vThrough || by1 === v.a0)) arms |= ARM_N;
      if (v.a0 < by0 && (vThrough || by0 === v.a1)) arms |= ARM_S;
      const armCount = ((arms & 1) + ((arms >> 1) & 1) + ((arms >> 2) & 1) + ((arms >> 3) & 1));
      if (armCount < 2) continue;
      const bigH = h.lanes >= 2;
      const bigV = v.lanes >= 2;
      const lights = (armCount >= 3 && bigH && bigV) || (armCount === 4 && (bigH || bigV));
      const id = city.junctions.length;
      city.junctions.push({ id, x0: bx0, y0: by0, x1: bx1, y1: by1, h: h.id, v: v.id, arms, lights, phase: rng.range(0, 30) });
      for (let y = by0; y < by1; y++) {
        for (let x = bx0; x < bx1; x++) {
          if (!city.inBounds(x, y)) continue;
          const i = y * MAP_W + x;
          city.flags[i] |= F_JUNCTION | F_ROAD;
          city.junctionAt[i] = id;
          if (city.ground[i] === G.Water || city.ground[i] === G.Bridge) {
            city.ground[i] = G.Bridge;
            city.flags[i] |= F_BRIDGE;
            city.solid[i] = 0;
          } else if (city.ground[i] !== G.Cobble) city.ground[i] = G.Asphalt;
        }
      }
    }
  }
}

interface Seg {
  road: Road;
  s0: number;
  s1: number;
  jA: number; // junction at start (-1 none)
  jB: number; // junction at end
}

const right = (d: number): number => (d + 3) % 4;
const left = (d: number): number => (d + 1) % 4;
const DIRV = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

function makeEdge(city: City, pts: number[], props: Partial<LaneEdge>): LaneEdge {
  const n = pts.length / 2;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const cum = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    xs[i] = pts[i * 2];
    ys[i] = pts[i * 2 + 1];
    if (i > 0) acc += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    cum[i] = acc;
  }
  const e: LaneEdge = {
    id: city.lanes.length,
    xs,
    ys,
    cum,
    len: acc,
    next: [],
    prev: [],
    speed: 13,
    road: -1,
    junction: -1,
    dir: 0,
    laneIdx: 0,
    lanesInDir: 1,
    turn: Turn.Lane,
    signal: -1,
    yieldAtEnd: false,
    stopOffset: 0.5,
    ...props,
  };
  city.lanes.push(e);
  return e;
}

function buildLanes(city: City): void {
  const T = TILE;
  city.jIn = city.junctions.map(() => []);
  city.jOut = city.junctions.map(() => []);
  const byRoad: number[][] = city.roads.map(() => []);
  for (const j of city.junctions) {
    byRoad[j.h].push(j.id);
    byRoad[j.v].push(j.id);
  }

  const segs: Seg[] = [];
  for (const road of city.roads) {
    const spans = byRoad[road.id]
      .map((jid) => {
        const j = city.junctions[jid];
        return road.horiz ? { s0: j.x0, s1: j.x1, id: jid } : { s0: j.y0, s1: j.y1, id: jid };
      })
      .sort((a, b) => a.s0 - b.s0);
    let cursor = road.a0;
    let prevJ = -1;
    let closed = false;
    for (const sp of spans) {
      if (sp.s1 <= road.a0) {
        prevJ = sp.id;
        continue;
      }
      if (sp.s0 >= road.a1) {
        if (!closed) {
          if (cursor < road.a1) segs.push({ road, s0: cursor, s1: road.a1, jA: prevJ, jB: sp.id });
          closed = true;
        }
        continue;
      }
      if (sp.s0 > cursor) segs.push({ road, s0: cursor, s1: sp.s0, jA: prevJ, jB: sp.id });
      cursor = sp.s1;
      prevJ = sp.id;
    }
    if (!closed && cursor < road.a1) segs.push({ road, s0: cursor, s1: road.a1, jA: prevJ, jB: -1 });
  }

  // crosswalk decisions per (junction, arm)
  const crosswalk = new Map<string, boolean>();
  const hasCross = (jid: number, arm: number): boolean => {
    const key = jid + ':' + arm;
    let v = crosswalk.get(key);
    if (v === undefined) {
      const j = city.junctions[jid];
      const h = city.roads[j.h];
      const vr = city.roads[j.v];
      v = j.lights || ((h.kind === RoadKind.Arterial || vr.kind === RoadKind.Arterial) && ((jid * 7 + arm) % 3 === 0));
      crosswalk.set(key, v);
    }
    return v;
  };

  const deadEnds: { edgesIn: LaneEdge[]; edgesOut: LaneEdge[] }[] = [];

  for (const sg of segs) {
    const r = sg.road;
    const L = r.lanes;
    const speed = r.speed;
    const posIn: LaneEdge[] = [];
    const negOut: LaneEdge[] = [];
    const posOut: LaneEdge[] = [];
    const negIn: LaneEdge[] = [];
    for (let i = 0; i < L; i++) {
      if (r.horiz) {
        const yE = (r.c - 0.5 - i) * T;
        const yW = (r.c + 0.5 + i) * T;
        const eE = makeEdge(city, [sg.s0 * T, yE, sg.s1 * T, yE], { road: r.id, dir: 0, laneIdx: i, lanesInDir: L, speed, junction: sg.jB });
        const eW = makeEdge(city, [sg.s1 * T, yW, sg.s0 * T, yW], { road: r.id, dir: 2, laneIdx: i, lanesInDir: L, speed, junction: sg.jA });
        if (sg.jB >= 0) {
          city.jIn[sg.jB].push(eE.id);
          city.jOut[sg.jB].push(eW.id);
        }
        if (sg.jA >= 0) {
          city.jIn[sg.jA].push(eW.id);
          city.jOut[sg.jA].push(eE.id);
        }
        posIn.push(eE);
        negOut.push(eW);
        if (sg.jA < 0) {
          posOut.push(eE);
          negIn.push(eW);
        }
      } else {
        const xN = (r.c + 0.5 + i) * T;
        const xS = (r.c - 0.5 - i) * T;
        const eN = makeEdge(city, [xN, sg.s0 * T, xN, sg.s1 * T], { road: r.id, dir: 1, laneIdx: i, lanesInDir: L, speed, junction: sg.jB });
        const eS = makeEdge(city, [xS, sg.s1 * T, xS, sg.s0 * T], { road: r.id, dir: 3, laneIdx: i, lanesInDir: L, speed, junction: sg.jA });
        if (sg.jB >= 0) {
          city.jIn[sg.jB].push(eN.id);
          city.jOut[sg.jB].push(eS.id);
        }
        if (sg.jA >= 0) {
          city.jIn[sg.jA].push(eS.id);
          city.jOut[sg.jA].push(eN.id);
        }
        posIn.push(eN);
        negOut.push(eS);
        if (sg.jA < 0) {
          posOut.push(eN);
          negIn.push(eS);
        }
      }
    }
    if (sg.jB < 0) deadEnds.push({ edgesIn: posIn, edgesOut: negOut });
    if (sg.jA < 0) deadEnds.push({ edgesIn: negIn, edgesOut: posOut });
  }

  // Junction connectors
  for (const j of city.junctions) {
    const hRoad = city.roads[j.h];
    const vRoad = city.roads[j.v];
    const hThrough = j.x0 >= hRoad.a0 && j.x1 <= hRoad.a1;
    const vThrough = j.y0 >= vRoad.a0 && j.y1 <= vRoad.a1;
    for (const inId of city.jIn[j.id]) {
      const ein = city.lanes[inId];
      const d = ein.dir;
      // signal & yield
      if (j.lights) ein.signal = d === 0 || d === 2 ? 0 : 1;
      else {
        const inRoad = city.roads[ein.road];
        const terminating = inRoad.horiz ? !hThrough : !vThrough;
        const otherThrough = inRoad.horiz ? vThrough : hThrough;
        ein.yieldAtEnd = terminating && otherThrough;
      }
      // arm from which this lane arrives: lane travelling East arrives from the West arm, etc.
      const arm = d === 0 ? ARM_W : d === 2 ? ARM_E : d === 1 ? ARM_S : ARM_N;
      const cross = hasCross(j.id, arm);
      ein.stopOffset = cross ? T + 0.8 : 0.6;
      if (cross) markCrosswalk(city, j, arm);

      const cands: { e: LaneEdge; turn: Turn }[] = [];
      for (const outId of city.jOut[j.id]) {
        const eout = city.lanes[outId];
        const d2 = eout.dir;
        const Lin = ein.lanesInDir;
        const Lout = eout.lanesInDir;
        if (d2 === d) {
          if (eout.laneIdx === Math.min(ein.laneIdx, Lout - 1)) cands.push({ e: eout, turn: Turn.Straight });
        } else if (d2 === right(d)) {
          if (ein.laneIdx === Lin - 1 && eout.laneIdx === Lout - 1) cands.push({ e: eout, turn: Turn.Right });
        } else if (d2 === left(d)) {
          if (ein.laneIdx === 0 && eout.laneIdx === 0) cands.push({ e: eout, turn: Turn.Left });
        }
      }
      if (cands.length === 0) {
        // fallback: connect to any non-opposite outgoing lane with closest lane index
        let best: { e: LaneEdge; turn: Turn } | null = null;
        let bestScore = 1e9;
        for (const outId of city.jOut[j.id]) {
          const eout = city.lanes[outId];
          if (eout.dir === (d + 2) % 4) continue;
          const turn = eout.dir === d ? Turn.Straight : eout.dir === right(d) ? Turn.Right : Turn.Left;
          const score = Math.abs(eout.laneIdx - ein.laneIdx) + (turn === Turn.Straight ? 0 : 0.5);
          if (score < bestScore) {
            bestScore = score;
            best = { e: eout, turn };
          }
        }
        if (best) cands.push(best);
      }
      for (const c of cands) connect(city, ein, c.e, c.turn, j.id);
    }
  }

  // Dead ends: U-turn connectors
  for (const de of deadEnds) {
    for (const ein of de.edgesIn) {
      const eout = de.edgesOut.find((e) => e.laneIdx === ein.laneIdx) ?? de.edgesOut[0];
      if (eout) connect(city, ein, eout, Turn.UTurn, -1);
    }
  }
}

function connect(city: City, ein: LaneEdge, eout: LaneEdge, turn: Turn, jid: number): void {
  const n = ein.xs.length;
  const p0x = ein.xs[n - 1];
  const p0y = ein.ys[n - 1];
  const p2x = eout.xs[0];
  const p2y = eout.ys[0];
  const pts: number[] = [];
  if (turn === Turn.Straight) {
    pts.push(p0x, p0y, p2x, p2y);
  } else if (turn === Turn.UTurn) {
    // semicircle-ish
    const [dx, dy] = DIRV[ein.dir];
    const ext = 4;
    pts.push(p0x, p0y, p0x + dx * ext, p0y + dy * ext, p2x + dx * ext, p2y + dy * ext, p2x, p2y);
  } else {
    const horizIn = ein.dir === 0 || ein.dir === 2;
    const cx = horizIn ? p2x : p0x;
    const cy = horizIn ? p0y : p2y;
    const N = 8;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      pts.push(a * p0x + b * cx + c * p2x, a * p0y + b * cy + c * p2y);
    }
  }
  const speed = turn === Turn.Straight ? Math.min(ein.speed, eout.speed) : turn === Turn.Right ? 6.5 : turn === Turn.Left ? 7.5 : 4;
  const conn = makeEdge(city, pts, {
    road: -1,
    junction: jid,
    dir: eout.dir,
    laneIdx: eout.laneIdx,
    lanesInDir: eout.lanesInDir,
    turn,
    speed,
    stopOffset: 0,
  });
  conn.next.push(eout.id);
  eout.prev.push(conn.id);
  ein.next.push(conn.id);
  conn.prev.push(ein.id);
}

function markCrosswalk(city: City, j: { x0: number; y0: number; x1: number; y1: number }, arm: number): void {
  // first tile row/column outside the box on the given arm
  if (arm === ARM_E || arm === ARM_W) {
    const x = arm === ARM_E ? j.x1 : j.x0 - 1;
    for (let y = j.y0; y < j.y1; y++) if (city.isRoad(x, y)) city.flags[y * MAP_W + x] |= F_CROSSWALK;
  } else {
    const y = arm === ARM_N ? j.y1 : j.y0 - 1;
    for (let x = j.x0; x < j.x1; x++) if (city.isRoad(x, y)) city.flags[y * MAP_W + x] |= F_CROSSWALK;
  }
}

// ---------------------------------------------------------------------------------------------

function buildRailings(city: City): void {
  const T = TILE;
  const th = 0.35;
  // Bridges: railing on the outer edge of walkways, and along any road tile edge facing water.
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      const f = city.flags[i];
      if (!(f & (F_ROAD | F_BRIDGE))) continue;
      // check four neighbours for water
      if (city.isWaterTile(x - 1, y)) city.railings.push({ x0: x * T - th, y0: y * T, x1: x * T + th * 0.2, y1: (y + 1) * T });
      if (city.isWaterTile(x + 1, y)) city.railings.push({ x0: (x + 1) * T - th * 0.2, y0: y * T, x1: (x + 1) * T + th, y1: (y + 1) * T });
      if (city.isWaterTile(x, y - 1)) city.railings.push({ x0: x * T, y0: y * T - th, x1: (x + 1) * T, y1: y * T + th * 0.2 });
      if (city.isWaterTile(x, y + 1)) city.railings.push({ x0: x * T, y0: (y + 1) * T - th * 0.2, x1: (x + 1) * T, y1: (y + 1) * T + th });
    }
  }
  mergeRailings(city);
  // map edges
  const W = MAP_W * T;
  const H = MAP_H * T;
  city.railings.push({ x0: -4, y0: -4, x1: 0, y1: H + 4 });
  city.railings.push({ x0: W, y0: -4, x1: W + 4, y1: H + 4 });
  city.railings.push({ x0: -4, y0: -4, x1: W + 4, y1: 0 });
  city.railings.push({ x0: -4, y0: H, x1: W + 4, y1: H + 4 });
}

/** Merge collinear adjacent railing boxes to reduce collider count. */
function mergeRailings(city: City): void {
  const horiz = city.railings.filter((r) => r.x1 - r.x0 > r.y1 - r.y0);
  const vert = city.railings.filter((r) => r.x1 - r.x0 <= r.y1 - r.y0);
  const merged: typeof city.railings = [];
  horiz.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  for (const r of horiz) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.y0 - r.y0) < 1e-3 && Math.abs(last.y1 - r.y1) < 1e-3 && Math.abs(last.x1 - r.x0) < 1e-3) last.x1 = r.x1;
    else merged.push({ ...r });
  }
  const merged2: typeof city.railings = [];
  vert.sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
  for (const r of vert) {
    const last = merged2[merged2.length - 1];
    if (last && Math.abs(last.x0 - r.x0) < 1e-3 && Math.abs(last.x1 - r.x1) < 1e-3 && Math.abs(last.y1 - r.y0) < 1e-3) last.y1 = r.y1;
    else merged2.push({ ...r });
  }
  city.railings = [...merged, ...merged2];
}

/** Barriers on the bridges that lead out of the starting zone (removed as the story progresses). */
function buildZoneBarriers(city: City): void {
  const T = TILE;
  for (const r of city.roads) {
    if (r.horiz) continue;
    // canal crossing -> locks Hafen zone; river crossing -> locks Nord zone
    const x0 = (r.c - r.lanes - 1) * T;
    const x1 = (r.c + r.lanes + 1) * T;
    city.zoneBarriers.push({ zone: Zone.Hafen, x0, y0: (CANAL.y0 + 3) * T, x1, y1: (CANAL.y0 + 3) * T + 1.2 });
    city.zoneBarriers.push({ zone: Zone.Nord, x0, y0: (RIVER.y0 + 7) * T, x1, y1: (RIVER.y0 + 7) * T + 1.2 });
  }
}

/** lanes that run into a raised bridge / closed bridge barrier (blocked while the zone is locked) */
function markBarrierLanes(city: City): void {
  const pad = 3;
  for (const e of city.lanes) {
    for (const zb of city.zoneBarriers) {
      let hit = false;
      for (let i = 0; i < e.xs.length && !hit; i++) {
        const x = e.xs[i];
        const y = e.ys[i];
        if (x > zb.x0 - pad && x < zb.x1 + pad && y > zb.y0 - pad && y < zb.y1 + pad) hit = true;
        if (!hit && i < e.xs.length - 1) {
          // segment crosses the barrier strip?
          const x2 = e.xs[i + 1];
          const y2 = e.ys[i + 1];
          const minY = Math.min(y, y2);
          const maxY = Math.max(y, y2);
          const minX = Math.min(x, x2);
          const maxX = Math.max(x, x2);
          if (maxX > zb.x0 - pad && minX < zb.x1 + pad && maxY > zb.y0 - pad && minY < zb.y1 + pad) hit = true;
        }
      }
      if (hit) {
        e.barrier = zb.zone;
        break;
      }
    }
  }
}

function definePOIs(city: City): void {
  const T = TILE;
  const jva = RESERVED.jva;
  // prison gate faces west
  city.pois.set('start', { id: 'start', x: (jva.x0 - 1.5) * T, y: ((jva.y0 + jva.y1) / 2) * T, rot: Math.PI, label: 'JVA Neuhafen' });
  const g = RESERVED.gril;
  city.pois.set('safehouse', { id: 'safehouse', x: ((g.x0 + g.x1) / 2) * T, y: (g.y0 - 0.6) * T, label: "Gül's Grill" });
  const h = RESERVED.herbie;
  city.pois.set('herbie', { id: 'herbie', x: ((h.x0 + h.x1) / 2) * T, y: (h.y0 - 0.6) * T, label: 'Herbies Leihhaus' });
  const k = RESERVED.knockout;
  city.pois.set('knockout', { id: 'knockout', x: ((k.x0 + k.x1) / 2) * T, y: (k.y0 - 0.6) * T, label: 'Club Knockout' });
  const t = RESERVED.turbine;
  city.pois.set('turbine', { id: 'turbine', x: ((t.x0 + t.x1) / 2) * T, y: (t.y0 - 0.6) * T, label: 'Turbine' });
  const p1 = RESERVED.paint1;
  city.pois.set('paint1', { id: 'paint1', x: ((p1.x0 + p1.x1) / 2) * T, y: ((p1.y0 + p1.y1) / 2) * T, label: 'Lackiererei' });
  const p2 = RESERVED.paint2;
  city.pois.set('paint2', { id: 'paint2', x: ((p2.x0 + p2.x1) / 2) * T, y: ((p2.y0 + p2.y1) / 2) * T, label: 'Lackiererei' });
  const hb = RESERVED.hbf;
  city.pois.set('hbf', { id: 'hbf', x: ((hb.x0 + hb.x1) / 2) * T, y: (hb.y0 - 2) * T, label: 'Hauptbahnhof' });
  const hs = RESERVED.hospital;
  city.pois.set('hospital', { id: 'hospital', x: ((hs.x0 + hs.x1) / 2) * T, y: (hs.y0 - 0.8) * T, label: 'Klinikum' });
  const po = RESERVED.police;
  city.pois.set('police', { id: 'police', x: ((po.x0 + po.x1) / 2) * T, y: (po.y1 + 0.6) * T, label: 'Polizeiwache' });
  const wp = RESERVED.wallpark;
  city.pois.set('wallpark', { id: 'wallpark', x: ((wp.x0 + wp.x1) / 2) * T, y: ((wp.y0 + wp.y1) / 2) * T, label: 'Wallanlagen' });
}

function finalizeVariants(city: City): void {
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      let hsh = (x * 73856093) ^ (y * 19349663);
      hsh = Math.imul(hsh ^ (hsh >>> 13), 0x5bd1e995);
      city.gvar[i] = (hsh >>> 8) & 0xff;
    }
  }
}
