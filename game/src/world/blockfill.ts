// Fills generated blocks with district-specific buildings, ground and props.
import { RNG } from '../core/rng';
import type { City } from './city';
import {
  MAP_W,
  TILE,
  G,
  D,
  P,
  Roof,
  FAC,
  RS,
  BKind,
  RoadKind,
  F_ROAD,
  F_SIDEWALK,
  F_RESERVED,
  F_JUNCTION,
  F_CROSSWALK,
  F_PARKING,
  SOLID_BUILDING,
  SOLID_LOW,
  SOLID_WATER,
  type Block,
  type Building,
} from './types';
import { RESERVED, type Rect } from './layout';

const T = TILE;
const FLOOR_H = 3.1;

// ------------------------------------------------------------------------------------------
// Low-level helpers
// ------------------------------------------------------------------------------------------

function tileFree(city: City, x: number, y: number, allowReserved = false): boolean {
  if (!city.inBounds(x, y)) return false;
  const i = y * MAP_W + x;
  if (city.solid[i] !== 0) return false;
  if (city.flags[i] & (F_ROAD | F_SIDEWALK)) return false;
  if (!allowReserved && city.flags[i] & F_RESERVED) return false;
  if (city.buildingAt[i] >= 0) return false;
  return true;
}

function rectFree(city: City, x0: number, y0: number, x1: number, y1: number, allowReserved = false): boolean {
  if (x1 <= x0 || y1 <= y0) return false;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!tileFree(city, x, y, allowReserved)) return false;
  return true;
}

function setGround(city: City, r: Rect, g: G, allowReserved = false): void {
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      if (!city.inBounds(x, y)) continue;
      const i = y * MAP_W + x;
      if (city.solid[i] === SOLID_WATER) continue;
      if (city.flags[i] & (F_ROAD | F_SIDEWALK)) continue;
      if (!allowReserved && city.flags[i] & F_RESERVED) continue;
      city.ground[i] = g;
    }
  }
}

interface BOpts {
  height: number;
  facade: number;
  roof?: Roof;
  roofStyle?: number;
  tint?: number;
  kind?: BKind;
  shops?: number;
  clutter?: boolean;
  name?: string;
  allowReserved?: boolean;
  solid?: number;
}

/** Add a tile-aligned building. Returns index or -1 if blocked. */
function building(city: City, x0: number, y0: number, x1: number, y1: number, o: BOpts): number {
  if (!rectFree(city, x0, y0, x1, y1, o.allowReserved)) return -1;
  return buildingM(city, x0 * T, y0 * T, (x1 - x0) * T, (y1 - y0) * T, o);
}

/** Add a building in metres (may be sub-tile). Marks tiles whose centre is covered as solid. */
function buildingM(city: City, x: number, y: number, w: number, h: number, o: BOpts): number {
  const id = city.buildings.length;
  const b: Building = {
    x,
    y,
    w,
    h,
    height: o.height,
    facade: o.facade,
    roof: o.roof ?? Roof.Flat,
    roofStyle: o.roofStyle ?? RS.Gravel,
    tint: o.tint ?? 0xffffff,
    kind: o.kind ?? BKind.House,
    shops: o.shops ?? 0,
    clutter: o.clutter ?? false,
    name: o.name,
  };
  city.buildings.push(b);
  const tx0 = Math.floor(x / T);
  const ty0 = Math.floor(y / T);
  const tx1 = Math.ceil((x + w) / T);
  const ty1 = Math.ceil((y + h) / T);
  for (let ty = ty0; ty < ty1; ty++) {
    for (let tx = tx0; tx < tx1; tx++) {
      if (!city.inBounds(tx, ty)) continue;
      const cx = (tx + 0.5) * T;
      const cy = (ty + 0.5) * T;
      if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) {
        const i = ty * MAP_W + tx;
        city.solid[i] = o.solid ?? SOLID_BUILDING;
        city.buildingAt[i] = id;
      }
    }
  }
  return id;
}

function prop(city: City, t: P, x: number, y: number, rot = 0, extra: { w?: number; h?: number; v?: number; ref?: number } = {}): void {
  city.props.push({ t, x, y, rot, ...extra });
}

function lotOf(b: Block): Rect {
  return { x0: b.x0 + 1, y0: b.y0 + 1, x1: b.x1 - 1, y1: b.y1 - 1 };
}

function scatterTrees(city: City, rng: RNG, r: Rect, density: number, small = 0.3): void {
  const area = (r.x1 - r.x0) * (r.y1 - r.y0);
  const n = Math.floor(area * density);
  for (let k = 0; k < n; k++) {
    const tx = rng.int(r.x0, r.x1 - 1);
    const ty = rng.int(r.y0, r.y1 - 1);
    if (!tileFree(city, tx, ty)) continue;
    const g = city.ground[ty * MAP_W + tx];
    if (g !== G.Grass && g !== G.Courtyard && g !== G.Plaza && g !== G.Dirt && g !== G.Forest) continue;
    // keep away from buildings a bit
    if (!tileFree(city, tx - 1, ty) && !tileFree(city, tx + 1, ty)) continue;
    const x = (tx + rng.range(0.25, 0.75)) * T;
    const y = (ty + rng.range(0.25, 0.75)) * T;
    prop(city, rng.chance(small) ? P.TreeSmall : P.Tree, x, y, rng.range(0, Math.PI * 2), { v: rng.int(0, 3) });
  }
}

function parkingLot(city: City, rng: RNG, r: Rect, alongX: boolean, district: D, fill = 0.6): void {
  setGround(city, r, G.Parking);
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) city.flags[y * MAP_W + x] |= F_PARKING;
  // stalls 2.6 m wide, cars perpendicular to aisle
  if (alongX) {
    const rows = [r.y0 * T + 2.6, r.y1 * T - 2.6];
    for (const yy of rows) {
      for (let x = r.x0 * T + 1.6; x < r.x1 * T - 1.6; x += 2.7) {
        if (rng.chance(fill)) city.parked.push({ x, y: yy, rot: yy < (r.y0 + r.y1) * T * 0.5 ? Math.PI / 2 : -Math.PI / 2, district });
      }
    }
  } else {
    const cols = [r.x0 * T + 2.6, r.x1 * T - 2.6];
    for (const xx of cols) {
      for (let y = r.y0 * T + 1.6; y < r.y1 * T - 1.6; y += 2.7) {
        if (rng.chance(fill)) city.parked.push({ x: xx, y, rot: xx < (r.x0 + r.x1) * T * 0.5 ? 0 : Math.PI, district });
      }
    }
  }
}

// ------------------------------------------------------------------------------------------
// Landmarks
// ------------------------------------------------------------------------------------------

export function placeLandmarks(city: City, rng: RNG): void {
  const R = RESERVED;

  // --- JVA Neuhafen (prison) ---------------------------------------------------------
  {
    const r = R.jva;
    setGround(city, r, G.Concrete, true);
    const wall = { height: 7, facade: FAC.Prison, roofStyle: RS.Concrete, allowReserved: true, kind: BKind.Wall };
    const gy = Math.floor((r.y0 + r.y1) / 2);
    building(city, r.x0, r.y0, r.x1, r.y0 + 1, wall);
    building(city, r.x0, r.y1 - 1, r.x1, r.y1, wall);
    building(city, r.x1 - 1, r.y0 + 1, r.x1, r.y1 - 1, wall);
    building(city, r.x0, r.y0 + 1, r.x0 + 1, gy - 1, wall);
    building(city, r.x0, gy + 1, r.x0 + 1, r.y1 - 1, wall);
    // watch towers
    for (const [tx, ty] of [
      [r.x0 + 1, r.y0 + 1],
      [r.x1 - 3, r.y0 + 1],
      [r.x0 + 1, r.y1 - 3],
      [r.x1 - 3, r.y1 - 3],
    ]) {
      building(city, tx, ty, tx + 2, ty + 2, { height: 12, facade: FAC.Concrete, roofStyle: RS.Tar, allowReserved: true });
    }
    // cell blocks
    building(city, r.x0 + 6, r.y0 + 4, r.x1 - 5, r.y0 + 9, { height: 4 * FLOOR_H, facade: FAC.Prison, roofStyle: RS.Gravel, allowReserved: true, clutter: true, name: 'Haus A' });
    building(city, r.x0 + 6, r.y1 - 9, r.x1 - 5, r.y1 - 4, { height: 4 * FLOOR_H, facade: FAC.Prison, roofStyle: RS.Gravel, allowReserved: true, clutter: true, name: 'Haus B' });
    // gatehouse / admin
    building(city, r.x0 + 1, gy + 2, r.x0 + 6, gy + 6, { height: 3 * FLOOR_H, facade: FAC.Office, roofStyle: RS.Tar, allowReserved: true });
    // yard
    setGround(city, { x0: r.x0 + 8, y0: r.y0 + 11, x1: r.x1 - 6, y1: r.y1 - 11 }, G.Grass, true);
    city.parked.push({ x: (r.x0 - 4) * T, y: (gy - 2) * T, rot: Math.PI / 2, district: D.Platte });
  }

  // --- Hauptbahnhof ---------------------------------------------------------------------
  {
    const r = R.hbf;
    setGround(city, r, G.Plaza, true);
    building(city, r.x0 + 2, r.y0 + 8, r.x1 - 2, r.y1 - 1, { height: 15, facade: FAC.Station, roof: Roof.GableX, roofStyle: RS.Glass, allowReserved: true, kind: BKind.Special, name: 'Hauptbahnhof' });
    building(city, r.x0 + 5, r.y0 + 3, r.x1 - 5, r.y0 + 8, { height: 16, facade: FAC.Station, roof: Roof.Flat, roofStyle: RS.Copper, allowReserved: true, kind: BKind.Special, shops: 8 });
    const cx = Math.floor((r.x0 + r.x1) / 2);
    // clock tower
    const idx = city.buildings.length;
    buildingM(city, (cx - 1) * T, (r.y0 + 4) * T, 2 * T, 2 * T, { height: 26, facade: FAC.Station, roofStyle: RS.Copper, kind: BKind.Special, allowReserved: true });
    void idx;
    for (let i = 0; i < 6; i++) prop(city, P.Bench, (r.x0 + 4 + i * 4) * T, (r.y0 + 1.5) * T, 0);
    prop(city, P.Fountain, cx * T, (r.y0 + 1.6) * T, 0);
  }

  // --- Polizeiwache with impound lot --------------------------------------------------------
  {
    const r = R.police;
    setGround(city, r, G.Concrete, true);
    building(city, r.x0, r.y0 + 8, r.x0 + 14, r.y1, { height: 4 * FLOOR_H, facade: FAC.Office, roofStyle: RS.Tar, allowReserved: true, clutter: true, name: 'Polizeiwache Mitte', tint: 0xdfe8ff });
    // impound fence
    for (let x = r.x0; x < r.x1; x++) prop(city, P.Fence, (x + 0.5) * T, r.y0 * T + 0.4, 0, { w: T, h: 0.3 });
    parkingLot(city, rng, { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y0 + 7 }, true, D.Bahnhof, 0.85);
    parkingLot(city, rng, { x0: r.x0 + 14, y0: r.y0 + 8, x1: r.x1, y1: r.y1 }, false, D.Bahnhof, 0.7);
  }

  // --- Turbine (techno club in an old power station) -------------------------------------
  {
    const r = R.turbine;
    setGround(city, r, G.Concrete, true);
    building(city, r.x0 + 2, r.y0 + 4, r.x1 - 2, r.y1 - 2, { height: 20, facade: FAC.BrickDark, roof: Roof.GableY, roofStyle: RS.Metal, allowReserved: true, kind: BKind.Special, name: 'Turbine' });
    buildingM(city, (r.x0 + 3) * T, (r.y1 - 2) * T + 0.5, 2 * T, 2 * T - 1, { height: 34, facade: FAC.BrickDark, roof: Roof.Round, roofStyle: RS.TankTop, kind: BKind.Chimney, allowReserved: true });
    buildingM(city, (r.x1 - 5) * T, (r.y1 - 2) * T + 0.5, 2 * T, 2 * T - 1, { height: 34, facade: FAC.BrickDark, roof: Roof.Round, roofStyle: RS.TankTop, kind: BKind.Chimney, allowReserved: true });
    parkingLot(city, rng, { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y0 + 3 }, true, D.Platte, 0.5);
  }

  // --- Klinikum (hospital) -----------------------------------------------------------------
  {
    const r = R.hospital;
    setGround(city, r, G.Plaza, true);
    building(city, r.x0 + 2, r.y0 + 7, r.x1 - 2, r.y1 - 1, { height: 6 * FLOOR_H, facade: FAC.Office, roofStyle: RS.Helipad, allowReserved: true, kind: BKind.Special, name: 'Klinikum Neuhafen', tint: 0xf4f6f8 });
    building(city, r.x0 + 4, r.y0 + 3, r.x0 + 12, r.y0 + 7, { height: 2 * FLOOR_H, facade: FAC.Office, roofStyle: RS.Green, allowReserved: true, tint: 0xf4f6f8 });
    parkingLot(city, rng, { x0: r.x0 + 13, y0: r.y0, x1: r.x1, y1: r.y0 + 6 }, true, D.Platte, 0.6);
  }

  // --- Wallanlagen (small park) ----------------------------------------------------------
  {
    const r = R.wallpark;
    setGround(city, r, G.Grass, true);
    const cx = Math.floor((r.x0 + r.x1) / 2);
    const cy = Math.floor((r.y0 + r.y1) / 2);
    setGround(city, { x0: r.x0, y0: cy, x1: r.x1, y1: cy + 1 }, G.Path, true);
    setGround(city, { x0: cx, y0: r.y0, x1: cx + 1, y1: r.y1 }, G.Path, true);
    // pond
    for (let y = r.y1 - 8; y < r.y1 - 3; y++) {
      for (let x = r.x0 + 3; x < r.x0 + 10; x++) {
        const i = y * MAP_W + x;
        city.ground[i] = G.Water;
        city.solid[i] = SOLID_WATER;
      }
    }
    for (let k = 0; k < 70; k++) {
      const tx = rng.int(r.x0, r.x1 - 1);
      const ty = rng.int(r.y0, r.y1 - 1);
      if (city.ground[ty * MAP_W + tx] !== G.Grass) continue;
      prop(city, rng.chance(0.3) ? P.TreeSmall : P.Tree, (tx + rng.range(0.2, 0.8)) * T, (ty + rng.range(0.2, 0.8)) * T, rng.range(0, 6.28), { v: rng.int(0, 3) });
    }
    for (let i = 0; i < 5; i++) prop(city, P.Bench, (cx + 0.5) * T + 2.2, (r.y0 + 3 + i * 5) * T, Math.PI / 2);
    prop(city, P.Kiosk, (cx + 3) * T, (cy + 2) * T, 0);
  }

  // --- Gül's Grill (first safehouse) -------------------------------------------------------
  {
    const r = R.gril;
    setGround(city, r, G.Plaza, true);
    building(city, r.x0 + 1, r.y0 + 2, r.x1 - 1, r.y1 - 1, { height: 4.2, facade: FAC.Kiosk, roofStyle: RS.Tar, allowReserved: true, kind: BKind.Special, name: "Gül's Grill", shops: 8, clutter: true });
    prop(city, P.Umbrella, (r.x0 + 2) * T, (r.y0 + 1) * T, 0, { v: 1 });
    prop(city, P.Umbrella, (r.x1 - 2) * T, (r.y0 + 1) * T, 0, { v: 2 });
    prop(city, P.Bench, (r.x0 + 4) * T, (r.y0 + 0.8) * T, 0);
  }

  // --- Club Knockout -------------------------------------------------------------------------
  {
    const r = R.knockout;
    setGround(city, r, G.Plaza, true);
    building(city, r.x0, r.y0 + 2, r.x1, r.y1, { height: 3 * FLOOR_H + 1, facade: FAC.AltGray, roofStyle: RS.Tar, allowReserved: true, kind: BKind.Special, name: 'Club Knockout', shops: 8, clutter: true, tint: 0xffe6e6 });
  }

  // --- Herbies Leihhaus ----------------------------------------------------------------------
  {
    const r = R.herbie;
    setGround(city, r, G.Courtyard, true);
    building(city, r.x0, r.y0 + 1, r.x1, r.y1, { height: 5 * FLOOR_H, facade: FAC.AltOchre, roof: Roof.GableX, roofStyle: RS.TileAnthracite, allowReserved: true, kind: BKind.Special, name: 'Herbies Leihhaus', shops: 8 });
  }

  // --- Lackiererei (paint shops) ---------------------------------------------------------
  for (const r of [R.paint1, R.paint2]) {
    setGround(city, r, G.Concrete, true);
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    const o = { height: 6.5, facade: FAC.Metal, roofStyle: RS.Metal, allowReserved: true, kind: BKind.Special, name: 'Lackiererei' };
    building(city, r.x0, r.y1 - 3, r.x1, r.y1, o);
    building(city, r.x0, r.y0 + 2, r.x0 + 1, r.y1 - 3, o);
    building(city, r.x1 - 1, r.y0 + 2, r.x1, r.y1 - 3, o);
    void w;
    void h;
  }
}

// ------------------------------------------------------------------------------------------
// District fills
// ------------------------------------------------------------------------------------------

interface PerimParams {
  depthMin: number;
  depthMax: number;
  wMin: number;
  wMax: number;
  floorsMin: number;
  floorsMax: number;
  facades: number[];
  pitched: number;
  pitchedStyles: number[];
  flatStyles: number[];
  court: G;
  shops: number;
  courtTrees: number;
  gate: number;
}

const KIEZ: PerimParams = {
  depthMin: 3,
  depthMax: 4,
  wMin: 2,
  wMax: 5,
  floorsMin: 3,
  floorsMax: 5,
  facades: [FAC.AltGray, FAC.AltCream, FAC.AltRose, FAC.AltBlue, FAC.AltWhite, FAC.BrickDark, FAC.AltGreen],
  pitched: 0.35,
  pitchedStyles: [RS.TileAnthracite, RS.Slate, RS.TileRed],
  flatStyles: [RS.Tar, RS.Gravel, RS.Tar],
  court: G.Courtyard,
  shops: 0.85,
  courtTrees: 0.03,
  gate: 0.8,
};

const BAHNHOF: PerimParams = {
  ...KIEZ,
  floorsMin: 4,
  floorsMax: 6,
  wMin: 3,
  wMax: 6,
  facades: [FAC.AltCream, FAC.AltOchre, FAC.AltWhite, FAC.AltGray, FAC.Office, FAC.AltBlue],
  pitched: 0.3,
  shops: 0.9,
};

const NORDEND: PerimParams = {
  ...KIEZ,
  floorsMin: 4,
  floorsMax: 5,
  facades: [FAC.AltCream, FAC.AltBlue, FAC.AltGreen, FAC.AltWhite, FAC.AltOchre, FAC.AltRose],
  pitched: 0.6,
  pitchedStyles: [RS.TileRed, RS.TileAnthracite, RS.Slate],
  court: G.Grass,
  shops: 0.35,
  courtTrees: 0.05,
};

const ALTSTADT: PerimParams = {
  depthMin: 2,
  depthMax: 3,
  wMin: 2,
  wMax: 3,
  floorsMin: 2,
  floorsMax: 4,
  facades: [FAC.Fachwerk, FAC.FachwerkOchre, FAC.AltWhite, FAC.AltCream, FAC.Fachwerk],
  pitched: 0.92,
  pitchedStyles: [RS.TileRed, RS.TileBrown, RS.TileRed, RS.Slate],
  flatStyles: [RS.Tar],
  court: G.Cobble,
  shops: 0.6,
  courtTrees: 0.02,
  gate: 0.5,
};

export function fillBlocks(city: City, rng: RNG): void {
  for (const b of city.blocks) {
    const r = rng.fork(b.id + 1);
    // edge strips (south of Kaistraße)
    if (!b.s && b.y1 <= 28) {
      if (b.district === D.Industrie) fillTankFarm(city, r, b);
      else fillQuay(city, r, b);
      continue;
    }
    switch (b.district) {
      case D.Kiez:
        fillPerimeter(city, r, b, KIEZ);
        break;
      case D.Bahnhof:
        fillPerimeter(city, r, b, BAHNHOF);
        break;
      case D.Altstadt:
        fillPerimeter(city, r, b, ALTSTADT);
        break;
      case D.Nordend:
        fillPerimeter(city, r, b, NORDEND);
        break;
      case D.Platte:
        fillPlatte(city, r, b);
        break;
      case D.Hafen:
        fillHafen(city, r, b);
        break;
      case D.Industrie:
        fillIndustrie(city, r, b);
        break;
      case D.Turm:
        fillTurm(city, r, b);
        break;
      case D.Villen:
        fillVillen(city, r, b);
        break;
      case D.Uni:
        fillUni(city, r, b);
        break;
      case D.Park:
        fillPark(city, r, b);
        break;
      case D.Flughafen:
        fillAirport(city, r, b);
        break;
      default:
        fillPerimeter(city, r, b, NORDEND);
    }
  }
}

function houseOpts(rng: RNG, p: PerimParams, alongX: boolean, shopsMask: number, extraFloor = 0): BOpts {
  const floors = rng.int(p.floorsMin, p.floorsMax) + extraFloor;
  const pitched = rng.chance(p.pitched);
  return {
    height: floors * FLOOR_H + rng.range(-0.3, 0.4),
    facade: rng.pick(p.facades),
    roof: pitched ? (alongX ? Roof.GableX : Roof.GableY) : Roof.Flat,
    roofStyle: pitched ? rng.pick(p.pitchedStyles) : rng.pick(p.flatStyles),
    kind: BKind.House,
    shops: rng.chance(p.shops) ? shopsMask : 0,
    clutter: !pitched,
  };
}

function rowHouses(
  city: City,
  rng: RNG,
  p: PerimParams,
  strip: Rect,
  alongX: boolean,
  shopsMask: number,
  gate: [number, number] | null,
): void {
  const start = alongX ? strip.x0 : strip.y0;
  const end = alongX ? strip.x1 : strip.y1;
  let a = start;
  while (a < end) {
    let w = rng.int(p.wMin, p.wMax);
    if (end - (a + w) < p.wMin) w = end - a;
    let segs: [number, number][] = [[a, a + w]];
    if (gate) {
      const [g0, g1] = gate;
      const out: [number, number][] = [];
      for (const [s0, s1] of segs) {
        if (g1 <= s0 || g0 >= s1) out.push([s0, s1]);
        else {
          if (g0 > s0) out.push([s0, g0]);
          if (g1 < s1) out.push([g1, s1]);
        }
      }
      segs = out;
    }
    for (const [s0, s1] of segs) {
      if (s1 <= s0) continue;
      const o = houseOpts(rng, p, alongX, shopsMask);
      if (alongX) building(city, s0, strip.y0, s1, strip.y1, o);
      else building(city, strip.x0, s0, strip.x1, s1, o);
    }
    a += w;
  }
}

const SH_E = 1;
const SH_N = 2;
const SH_W = 4;
const SH_S = 8;

function fillPerimeter(city: City, rng: RNG, b: Block, p: PerimParams): void {
  const L = lotOf(b);
  const w = L.x1 - L.x0;
  const h = L.y1 - L.y0;
  if (w < 2 || h < 2) {
    setGround(city, L, G.Plaza);
    return;
  }
  setGround(city, L, p.court);
  const depth = Math.min(rng.int(p.depthMin, p.depthMax), Math.floor(Math.min(w, h) / 2));

  // occasional special lots
  if (b.district !== D.Altstadt && w >= 8 && h >= 8 && rng.chance(0.08)) {
    // small square / playground with kiosk
    setGround(city, L, rng.chance(0.5) ? G.Plaza : G.Grass);
    scatterTrees(city, rng, L, 0.06);
    prop(city, P.Kiosk, ((L.x0 + L.x1) / 2) * T, ((L.y0 + L.y1) / 2) * T, 0);
    if (rng.chance(0.5)) prop(city, P.Playground, ((L.x0 + L.x1) / 2 + 2) * T, ((L.y0 + L.y1) / 2 - 2) * T, 0);
    return;
  }
  if (b.district !== D.Altstadt && w >= 6 && h >= 6 && rng.chance(0.06)) {
    parkingLot(city, rng, L, w >= h, b.district, 0.65);
    return;
  }

  if (w < 2 * depth + 3 || h < 2 * depth + 3) {
    // compact block: one or two rows of houses
    const alongX = w >= h;
    const short = alongX ? h : w;
    if (short <= depth + 1) {
      rowHouses(city, rng, p, L, alongX, alongX ? SH_N | SH_S : SH_E | SH_W, null);
    } else {
      const midShort = Math.floor(short / 2);
      if (alongX) {
        rowHouses(city, rng, p, { x0: L.x0, y0: L.y0, x1: L.x1, y1: L.y0 + midShort }, true, SH_S, null);
        rowHouses(city, rng, p, { x0: L.x0, y0: L.y0 + midShort, x1: L.x1, y1: L.y1 }, true, SH_N, null);
      } else {
        rowHouses(city, rng, p, { x0: L.x0, y0: L.y0, x1: L.x0 + midShort, y1: L.y1 }, false, SH_W, null);
        rowHouses(city, rng, p, { x0: L.x0 + midShort, y0: L.y0, x1: L.x1, y1: L.y1 }, false, SH_E, null);
      }
    }
    return;
  }

  // corners
  const cornerOpts = (): BOpts => {
    const o = houseOpts(rng, p, true, SH_E | SH_N | SH_W | SH_S, rng.chance(0.4) ? 1 : 0);
    if (o.roof !== Roof.Flat && rng.chance(0.5)) {
      o.roof = Roof.Flat;
      o.roofStyle = rng.pick(p.flatStyles);
      o.clutter = true;
    }
    return o;
  };
  building(city, L.x0, L.y0, L.x0 + depth, L.y0 + depth, cornerOpts());
  building(city, L.x1 - depth, L.y0, L.x1, L.y0 + depth, cornerOpts());
  building(city, L.x0, L.y1 - depth, L.x0 + depth, L.y1, cornerOpts());
  building(city, L.x1 - depth, L.y1 - depth, L.x1, L.y1, cornerOpts());

  // gate position
  const gateSide = rng.chance(p.gate) ? rng.int(0, 3) : -1;
  const gateFor = (side: number, s0: number, s1: number): [number, number] | null => {
    if (side !== gateSide || s1 - s0 < 5) return null;
    const g0 = Math.floor((s0 + s1) / 2) - 1;
    return [g0, g0 + 2];
  };
  // strips: S, N, W, E
  const sx0 = L.x0 + depth;
  const sx1 = L.x1 - depth;
  const sy0 = L.y0 + depth;
  const sy1 = L.y1 - depth;
  const gS = gateFor(0, sx0, sx1);
  const gN = gateFor(1, sx0, sx1);
  const gW = gateFor(2, sy0, sy1);
  const gE = gateFor(3, sy0, sy1);
  rowHouses(city, rng, p, { x0: sx0, y0: L.y0, x1: sx1, y1: L.y0 + depth }, true, SH_S, gS);
  rowHouses(city, rng, p, { x0: sx0, y0: L.y1 - depth, x1: sx1, y1: L.y1 }, true, SH_N, gN);
  rowHouses(city, rng, p, { x0: L.x0, y0: sy0, x1: L.x0 + depth, y1: sy1 }, false, SH_W, gW);
  rowHouses(city, rng, p, { x0: L.x1 - depth, y0: sy0, x1: L.x1, y1: sy1 }, false, SH_E, gE);
  // gate passages get cobbles
  const passage = (r: Rect): void => setGround(city, r, G.Cobble);
  if (gS) passage({ x0: gS[0], y0: L.y0, x1: gS[1], y1: L.y0 + depth });
  if (gN) passage({ x0: gN[0], y0: L.y1 - depth, x1: gN[1], y1: L.y1 });
  if (gW) passage({ x0: L.x0, y0: gW[0], x1: L.x0 + depth, y1: gW[1] });
  if (gE) passage({ x0: L.x1 - depth, y0: gE[0], x1: L.x1, y1: gE[1] });

  // courtyard
  const inner: Rect = { x0: sx0, y0: sy0, x1: sx1, y1: sy1 };
  const iw = inner.x1 - inner.x0;
  const ih = inner.y1 - inner.y0;
  if (iw >= 4 && ih >= 4) {
    if (rng.chance(0.35)) setGround(city, { x0: inner.x0 + 1, y0: inner.y0 + 1, x1: inner.x1 - 1, y1: inner.y1 - 1 }, G.Grass);
    scatterTrees(city, rng, inner, p.courtTrees + 0.02, 0.5);
    // backyard sheds / garages
    if (iw >= 6 && ih >= 6 && rng.chance(0.4)) {
      const gx = inner.x0 + 1;
      const gy = inner.y0 + 1;
      building(city, gx, gy, gx + Math.min(4, iw - 3), gy + 1, { height: 3, facade: FAC.Concrete, roofStyle: RS.Metal, kind: BKind.Shed });
    }
    for (let k = 0; k < 2; k++) {
      const tx = rng.int(inner.x0, inner.x1 - 1);
      const ty = rng.int(inner.y0, inner.y1 - 1);
      if (tileFree(city, tx, ty)) prop(city, P.Bin, (tx + 0.5) * T, (ty + 0.5) * T, 0, { v: rng.int(0, 3) });
    }
    if (iw >= 5 && ih >= 5 && rng.chance(0.3)) {
      city.parked.push({ x: (inner.x0 + inner.x1) * 0.5 * T, y: (inner.y0 + 1.2) * T, rot: 0, district: b.district });
    }
  }
}

function fillPlatte(city: City, rng: RNG, b: Block): void {
  const L = lotOf(b);
  setGround(city, L, G.Grass);
  const w = L.x1 - L.x0;
  const h = L.y1 - L.y0;
  if (w < 4 || h < 4) return;
  const alongX = w >= h ? rng.chance(0.8) : rng.chance(0.2);
  const longA0 = alongX ? L.x0 : L.y0;
  const longA1 = alongX ? L.x1 : L.y1;
  const shortA0 = alongX ? L.y0 : L.x0;
  const shortA1 = alongX ? L.y1 : L.x1;
  const facade = rng.pick([FAC.PlatteGray, FAC.PlatteBeige, FAC.PlattePastel, FAC.PlattePastel]);
  const depth = 3;
  // parking strip along the first short side
  const parkDepth = rng.chance(0.7) ? 4 : 0;
  let pos = shortA0 + (parkDepth > 0 ? parkDepth + 1 : rng.int(1, 2));
  if (parkDepth > 0) {
    const pr: Rect = alongX
      ? { x0: L.x0 + 1, y0: L.y0, x1: L.x1 - 1, y1: L.y0 + parkDepth }
      : { x0: L.x0, y0: L.y0 + 1, x1: L.x0 + parkDepth, y1: L.y1 - 1 };
    parkingLot(city, rng, pr, alongX, D.Platte, 0.55);
  }
  let row = 0;
  while (pos + depth <= shortA1 - 2) {
    const margin = rng.int(2, 3);
    const len = longA1 - longA0 - margin * 2;
    if (len >= 8) {
      const tower = rng.chance(0.18) && len >= 10;
      const floors = tower ? rng.int(14, 16) : rng.pick([5, 6, 6, 8, 10, 11]);
      const height = Math.min(floors * 2.9, 25);
      const segs: [number, number][] = [];
      if (tower) {
        const n = len >= 26 ? 2 : 1;
        const step = Math.floor(len / n);
        for (let k = 0; k < n; k++) {
          const s0 = longA0 + margin + k * step + Math.floor((step - 5) / 2);
          segs.push([s0, s0 + 5]);
        }
      } else if (len > 28 && rng.chance(0.6)) {
        const half = Math.floor((len - 3) / 2);
        segs.push([longA0 + margin, longA0 + margin + half]);
        segs.push([longA0 + margin + half + 3, longA1 - margin]);
      } else segs.push([longA0 + margin, longA1 - margin]);
      for (const [s0, s1] of segs) {
        const d = tower ? 5 : depth;
        if (pos + d > shortA1 - 1) continue;
        const o: BOpts = {
          height,
          facade,
          roofStyle: rng.chance(0.25) ? RS.Solar : rng.pick([RS.Tar, RS.Gravel, RS.Tar]),
          kind: tower ? BKind.Tower : BKind.Slab,
          clutter: true,
          shops: 0,
        };
        if (alongX) building(city, s0, pos, s1, pos + d, o);
        else building(city, pos, s0, pos + d, s1, o);
      }
      pos += (tower ? 5 : depth) + rng.int(6, 9);
    } else pos += 4;
    row++;
  }
  void row;
  // paths and greenery
  scatterTrees(city, rng, L, 0.06, 0.4);
  if (w >= 12 && h >= 12 && rng.chance(0.6)) {
    // playground
    for (let k = 0; k < 10; k++) {
      const tx = rng.int(L.x0 + 2, L.x1 - 3);
      const ty = rng.int(L.y0 + 2, L.y1 - 3);
      if (rectFree(city, tx, ty, tx + 2, ty + 2) && city.ground[ty * MAP_W + tx] === G.Grass) {
        setGround(city, { x0: tx, y0: ty, x1: tx + 2, y1: ty + 2 }, G.Sand);
        prop(city, P.Playground, (tx + 1) * T, (ty + 1) * T, 0);
        prop(city, P.Bench, (tx + 1) * T, (ty - 0.2) * T, 0);
        break;
      }
    }
  }
}

function fillHafen(city: City, rng: RNG, b: Block): void {
  const L = lotOf(b);
  setGround(city, L, G.Concrete);
  const w = L.x1 - L.x0;
  const h = L.y1 - L.y0;
  if (w < 3 || h < 3) return;
  const nearCanal = b.y1 >= 84;
  const quayW = !b.w;
  const quayE = !b.e;
  // Speicherstadt warehouses near the canal
  if (nearCanal || rng.chance(0.3)) {
    const d = Math.min(6, h - 2);
    let x = L.x0;
    while (x < L.x1 - 3) {
      const ww = Math.min(rng.int(8, 14), L.x1 - x);
      if (ww < 4) break;
      building(city, x, L.y1 - d, x + ww, L.y1, {
        height: nearCanal ? rng.int(5, 6) * 3.4 : rng.int(3, 4) * 3.4,
        facade: nearCanal ? FAC.Brick : rng.pick([FAC.Brick, FAC.Metal, FAC.MetalRust]),
        roof: nearCanal ? Roof.GableX : Roof.Flat,
        roofStyle: nearCanal ? RS.Copper : RS.Metal,
        kind: BKind.Warehouse,
        clutter: !nearCanal,
      });
      x += ww + 2;
    }
  }
  // container stacks in the remaining area
  const area: Rect = { x0: L.x0 + (quayW ? 2 : 1), y0: L.y0 + 1, x1: L.x1 - (quayE ? 2 : 1), y1: L.y1 - (nearCanal ? 8 : 2) };
  const colors = [0xb23a2e, 0x2e5fa8, 0x2f8a4c, 0xd8782a, 0x8a8f96, 0xe8e4da, 0x7a4b2a, 0x2a8a8a, 0xd8b52a, 0x5b3d8a];
  const CL = 6.1; // 20ft container length
  const CW = 2.44;
  let y = area.y0 * T + 1;
  while (y + CW * 4 + 1 < area.y1 * T) {
    let x = area.x0 * T + 1;
    while (x + CL * 3 < area.x1 * T) {
      // block of containers 3 long x 4 wide
      for (let cx = 0; cx < 3; cx++) {
        for (let cy = 0; cy < 4; cy++) {
          if (rng.chance(0.12)) continue;
          const stack = rng.int(1, 4);
          const bx = x + cx * (CL + 0.15);
          const by = y + cy * (CW + 0.1);
          const tx = Math.floor((bx + CL / 2) / T);
          const ty = Math.floor((by + CW / 2) / T);
          if (!tileFree(city, tx, ty)) continue;
          buildingM(city, bx, by, CL, CW, {
            height: stack * 2.59,
            facade: FAC.Container,
            roof: Roof.Container,
            roofStyle: RS.Container,
            tint: rng.pick(colors),
            kind: BKind.Container,
          });
        }
      }
      x += CL * 3 + 0.3 + rng.int(2, 3) * T;
    }
    y += CW * 4 + 0.3 + 2 * T;
  }
  // quay cranes and bollards
  const quaySides: [number, boolean][] = [];
  if (quayW) quaySides.push([b.x0, false]);
  if (quayE) quaySides.push([b.x1, true]);
  for (const [qx, east] of quaySides) {
    const xm = east ? qx * T - 1.0 : qx * T + 1.0;
    for (let yy = (b.y0 + 2) * T; yy < (b.y1 - 2) * T; yy += 9) prop(city, P.Bollard, xm, yy, 0);
    const ncr = Math.max(1, Math.floor(h / 14));
    for (let k = 0; k < ncr; k++) {
      const cy = (L.y0 + 4 + k * 14) * T;
      if (cy > (L.y1 - 3) * T) break;
      prop(city, P.Crane, east ? qx * T - 6 : qx * T + 6, cy, east ? 0 : Math.PI, { v: rng.int(0, 1) });
    }
  }
  if (rng.chance(0.4)) city.parked.push({ x: (L.x0 + 2) * T, y: (L.y0 + 2) * T, rot: 0, district: D.Hafen });
}

function fillQuay(city: City, rng: RNG, b: Block): void {
  const r: Rect = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 - 1 };
  setGround(city, r, G.Quay);
  for (let x = b.x0 * T + 3; x < b.x1 * T - 3; x += 10) prop(city, P.Bollard, x, b.y0 * T + 0.8, 0);
  for (let x = b.x0 * T + 18; x < b.x1 * T - 18; x += 64) prop(city, P.Crane, x, (b.y0 + 1.5) * T, Math.PI / 2, { v: rng.int(0, 1) });
}

function fillTankFarm(city: City, rng: RNG, b: Block): void {
  const L: Rect = { x0: b.x0 + 1, y0: b.y0 + 1, x1: b.x1 - 1, y1: b.y1 - 1 };
  setGround(city, L, G.Gravel);
  let x = L.x0 + 1;
  while (x + 4 < L.x1) {
    const s = rng.int(3, 5);
    for (let y = L.y0 + 1; y + s < L.y1; y += s + 2) {
      building(city, x, y, x + s, y + s, { height: rng.range(8, 13), facade: FAC.Tank, roof: Roof.Round, roofStyle: RS.TankTop, kind: BKind.Tank, tint: rng.pick([0xffffff, 0xe8e2d0, 0xd8dde2]) });
    }
    x += s + 2;
  }
}

function fillIndustrie(city: City, rng: RNG, b: Block): void {
  const L = lotOf(b);
  setGround(city, L, rng.chance(0.5) ? G.Gravel : G.Concrete);
  const w = L.x1 - L.x0;
  const h = L.y1 - L.y0;
  if (w < 4 || h < 4) return;
  // main hall(s)
  const nHalls = w * h > 500 ? 2 : 1;
  for (let k = 0; k < nHalls; k++) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const hw = Math.min(w - 2, rng.int(10, 20));
      const hh = Math.min(h - 2, rng.int(7, 14));
      if (hw < 4 || hh < 4) break;
      const x0 = rng.int(L.x0 + 1, Math.max(L.x0 + 1, L.x1 - hw - 1));
      const y0 = rng.int(L.y0 + 1, Math.max(L.y0 + 1, L.y1 - hh - 1));
      const saw = rng.chance(0.55);
      if (
        building(city, x0, y0, x0 + hw, y0 + hh, {
          height: rng.range(8, 13),
          facade: rng.pick([FAC.Metal, FAC.MetalRust, FAC.BrickDark, FAC.Concrete]),
          roof: saw ? Roof.Saw : Roof.Flat,
          roofStyle: saw ? RS.SawGlass : rng.pick([RS.Metal, RS.Tar]),
          kind: BKind.Hall,
          clutter: !saw,
        }) >= 0
      )
        break;
    }
  }
  // chimney
  if (rng.chance(0.45)) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const tx = rng.int(L.x0 + 1, L.x1 - 3);
      const ty = rng.int(L.y0 + 1, L.y1 - 3);
      if (building(city, tx, ty, tx + 2, ty + 2, { height: rng.range(28, 36), facade: FAC.BrickDark, roof: Roof.Round, roofStyle: RS.TankTop, kind: BKind.Chimney }) >= 0) break;
    }
  }
  // tanks
  const nt = rng.int(0, 3);
  for (let k = 0; k < nt; k++) {
    const s = rng.int(3, 4);
    const tx = rng.int(L.x0 + 1, Math.max(L.x0 + 1, L.x1 - s - 1));
    const ty = rng.int(L.y0 + 1, Math.max(L.y0 + 1, L.y1 - s - 1));
    building(city, tx, ty, tx + s, ty + s, { height: rng.range(7, 11), facade: FAC.Tank, roof: Roof.Round, roofStyle: RS.TankTop, kind: BKind.Tank, tint: rng.pick([0xffffff, 0xc9b9a0, 0xb0b8c0]) });
  }
  // sheds
  for (let k = 0; k < 3; k++) {
    const sw = rng.int(2, 4);
    const sh = rng.int(2, 3);
    const tx = rng.int(L.x0 + 1, Math.max(L.x0 + 1, L.x1 - sw - 1));
    const ty = rng.int(L.y0 + 1, Math.max(L.y0 + 1, L.y1 - sh - 1));
    building(city, tx, ty, tx + sw, ty + sh, { height: rng.range(3, 5), facade: rng.pick([FAC.Metal, FAC.MetalRust]), roofStyle: RS.Metal, kind: BKind.Shed });
  }
  // dirt patches
  for (let k = 0; k < 3; k++) {
    const tx = rng.int(L.x0, L.x1 - 3);
    const ty = rng.int(L.y0, L.y1 - 3);
    setGround(city, { x0: tx, y0: ty, x1: tx + rng.int(2, 5), y1: ty + rng.int(2, 4) }, G.Dirt);
  }
  if (rng.chance(0.5)) city.parked.push({ x: (L.x0 + 1.5) * T, y: (L.y0 + 1.5) * T, rot: 0, district: D.Industrie });
}

function fillTurm(city: City, rng: RNG, b: Block): void {
  const L = lotOf(b);
  setGround(city, L, G.Plaza);
  const w = L.x1 - L.x0;
  const h = L.y1 - L.y0;
  if (w < 4 || h < 4) return;
  const n = w * h > 260 && rng.chance(0.6) ? 2 : 1;
  for (let k = 0; k < n; k++) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const tw = Math.min(w - 2, rng.int(6, 10));
      const th = Math.min(h - 2, rng.int(6, 10));
      if (tw < 4 || th < 4) break;
      const x0 = rng.int(L.x0 + 1, Math.max(L.x0 + 1, L.x1 - tw - 1));
      const y0 = rng.int(L.y0 + 1, Math.max(L.y0 + 1, L.y1 - th - 1));
      if (
        building(city, x0, y0, x0 + tw, y0 + th, {
          height: rng.range(26, 34),
          facade: rng.pick([FAC.GlassBlue, FAC.GlassGreen, FAC.Office, FAC.GlassBlue]),
          roofStyle: rng.pick([RS.Gravel, RS.Helipad, RS.Tar, RS.Solar]),
          kind: BKind.Tower,
          clutter: true,
          shops: 15,
        }) >= 0
      )
        break;
    }
  }
  // podium / low office
  if (rng.chance(0.5)) {
    const tx = L.x0 + 1;
    const ty = L.y0 + 1;
    building(city, tx, ty, Math.min(L.x1 - 1, tx + rng.int(4, 7)), Math.min(L.y1 - 1, ty + rng.int(3, 5)), {
      height: rng.range(9, 14),
      facade: FAC.Office,
      roofStyle: RS.Green,
      kind: BKind.House,
      clutter: true,
      shops: 15,
    });
  }
  scatterTrees(city, rng, L, 0.025, 0.6);
  if (rng.chance(0.3)) prop(city, P.Fountain, ((L.x0 + L.x1) / 2) * T, (L.y0 + 1) * T, 0);
}

function fillVillen(city: City, rng: RNG, b: Block): void {
  const L = lotOf(b);
  setGround(city, L, G.Grass);
  const w = L.x1 - L.x0;
  const h = L.y1 - L.y0;
  if (w < 5 || h < 5) return;
  const alongX = w >= h;
  const longA0 = alongX ? L.x0 : L.y0;
  const longA1 = alongX ? L.x1 : L.y1;
  const shortLen = alongX ? h : w;
  const rows = shortLen >= 12 ? 2 : 1;
  for (let row = 0; row < rows; row++) {
    const d = rows === 2 ? Math.floor(shortLen / 2) : shortLen;
    const s0 = (alongX ? L.y0 : L.x0) + row * d;
    let a = longA0;
    while (a < longA1 - 4) {
      const pw = Math.min(rng.int(6, 8), longA1 - a);
      if (pw < 5) break;
      // parcel rect
      const parcel: Rect = alongX ? { x0: a, y0: s0, x1: a + pw, y1: s0 + d } : { x0: s0, y0: a, x1: s0 + d, y1: a + pw };
      // house towards the street side (row 0 faces the near side)
      const hw = rng.int(3, Math.min(4, pw - 2));
      const hd = rng.int(3, Math.min(4, d - 2));
      const offA = a + Math.floor((pw - hw) / 2);
      const offS = row === 0 ? s0 + 1 : s0 + d - 1 - hd;
      const pitched = rng.chance(0.75);
      const o: BOpts = {
        height: rng.int(2, 3) * FLOOR_H,
        facade: rng.pick([FAC.Villa, FAC.VillaCream, FAC.Villa, FAC.AltWhite]),
        roof: pitched ? (rng.chance(0.5) ? Roof.GableX : Roof.GableY) : Roof.Flat,
        roofStyle: pitched ? rng.pick([RS.TileAnthracite, RS.TileRed, RS.Slate]) : rng.pick([RS.Green, RS.Gravel, RS.Solar]),
        kind: BKind.House,
      };
      if (alongX) building(city, offA, offS, offA + hw, offS + hd, o);
      else building(city, offS, offA, offS + hd, offA + hw, o);
      // pool
      if (rng.chance(0.4)) {
        const px = alongX ? offA : row === 0 ? offS + hd + 1 : offS - 3;
        const py = alongX ? (row === 0 ? offS + hd + 1 : offS - 3) : offA;
        const pr: Rect = alongX ? { x0: px, y0: py, x1: px + 2, y1: py + 2 } : { x0: px, y0: py, x1: px + 2, y1: py + 2 };
        if (rectFree(city, pr.x0, pr.y0, pr.x1, pr.y1)) setGround(city, pr, G.Pool);
      }
      // hedges along parcel side boundaries
      if (alongX) {
        for (let y = parcel.y0; y < parcel.y1; y++) prop(city, P.Hedge, parcel.x0 * T + 0.4, (y + 0.5) * T, 0, { w: 0.8, h: T });
      } else {
        for (let x = parcel.x0; x < parcel.x1; x++) prop(city, P.Hedge, (x + 0.5) * T, parcel.y0 * T + 0.4, 0, { w: T, h: 0.8 });
      }
      scatterTrees(city, rng, parcel, 0.05, 0.4);
      if (rng.chance(0.5)) {
        const cx = (alongX ? offA + hw + 0.8 : row === 0 ? offS + hd + 0.8 : offS - 0.8) * T;
        const cy = (alongX ? (row === 0 ? offS + 0.8 : offS + hd - 0.8) : offA + hw + 0.8) * T;
        city.parked.push({ x: cx, y: cy, rot: alongX ? Math.PI / 2 : 0, district: D.Villen });
      }
      a += pw;
    }
  }
}

function fillUni(city: City, rng: RNG, b: Block): void {
  const L = lotOf(b);
  setGround(city, L, G.Grass);
  const w = L.x1 - L.x0;
  const h = L.y1 - L.y0;
  if (w < 6 || h < 6) return;
  const n = rng.int(1, 3);
  for (let k = 0; k < n; k++) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const bw = Math.min(w - 2, rng.int(8, 16));
      const bh = Math.min(h - 2, rng.int(4, 8));
      const x0 = rng.int(L.x0 + 1, Math.max(L.x0 + 1, L.x1 - bw - 1));
      const y0 = rng.int(L.y0 + 1, Math.max(L.y0 + 1, L.y1 - bh - 1));
      if (
        building(city, x0, y0, x0 + bw, y0 + bh, {
          height: rng.int(3, 5) * 3.6,
          facade: rng.pick([FAC.Brick, FAC.Concrete, FAC.Office]),
          roofStyle: rng.pick([RS.Gravel, RS.Green, RS.Copper, RS.Solar]),
          kind: BKind.House,
          clutter: true,
        }) >= 0
      )
        break;
    }
  }
  const cx = Math.floor((L.x0 + L.x1) / 2);
  setGround(city, { x0: cx, y0: L.y0, x1: cx + 1, y1: L.y1 }, G.Path);
  scatterTrees(city, rng, L, 0.04, 0.3);
  if (rng.chance(0.5)) parkingLot(city, rng, { x0: L.x0, y0: L.y0, x1: Math.min(L.x1, L.x0 + 10), y1: L.y0 + 4 }, true, D.Uni, 0.5);
}

function fillPark(city: City, rng: RNG, b: Block): void {
  const L = lotOf(b);
  setGround(city, L, G.Grass);
  const cx = Math.floor((L.x0 + L.x1) / 2);
  const cy = Math.floor((L.y0 + L.y1) / 2);
  setGround(city, { x0: L.x0, y0: cy, x1: L.x1, y1: cy + 1 }, G.Path);
  setGround(city, { x0: cx, y0: L.y0, x1: cx + 1, y1: L.y1 }, G.Path);
  // pond
  const pw = Math.min(10, Math.floor((L.x1 - L.x0) / 3));
  const ph = Math.min(7, Math.floor((L.y1 - L.y0) / 3));
  if (pw >= 4 && ph >= 3) {
    const px = L.x0 + 3;
    const py = L.y1 - ph - 3;
    for (let y = py; y < py + ph; y++)
      for (let x = px; x < px + pw; x++) {
        const i = y * MAP_W + x;
        if (city.ground[i] !== G.Grass) continue;
        city.ground[i] = G.Water;
        city.solid[i] = SOLID_WATER;
      }
  }
  scatterTrees(city, rng, L, 0.09, 0.35);
  for (let k = 0; k < 8; k++) prop(city, P.Bench, (cx + 0.5) * T + 2.3, (L.y0 + 2 + k * 4) * T, Math.PI / 2);
  // beer garden
  if (rng.chance(0.7)) {
    const bx = L.x1 - 8;
    const by = L.y0 + 3;
    setGround(city, { x0: bx, y0: by, x1: bx + 6, y1: by + 5 }, G.Gravel);
    building(city, bx, by + 4, bx + 3, by + 5, { height: 3.5, facade: FAC.Kiosk, roofStyle: RS.TileBrown, kind: BKind.Shed });
    for (let k = 0; k < 6; k++) prop(city, P.Umbrella, (bx + 1 + (k % 3) * 2) * T, (by + 1 + Math.floor(k / 3) * 1.6) * T, 0, { v: k % 3 });
  }
}

function fillAirport(city: City, rng: RNG, b: Block): void {
  const L = lotOf(b);
  setGround(city, L, G.Grass);
  // runway along X
  const ry = Math.floor((L.y0 + L.y1) / 2) + 4;
  setGround(city, { x0: L.x0 + 2, y0: ry, x1: L.x1 - 2, y1: ry + 5 }, G.Runway);
  setGround(city, { x0: L.x0 + 2, y0: L.y0 + 2, x1: L.x1 - 2, y1: ry - 4 }, G.Concrete);
  // terminal (unfinished) & hangars
  building(city, L.x0 + 4, L.y0 + 3, L.x0 + 30, L.y0 + 10, { height: 14, facade: FAC.GlassBlue, roofStyle: RS.Metal, kind: BKind.Special, clutter: true, name: 'Terminal NHI' });
  for (let k = 0; k < 3; k++) {
    building(city, L.x0 + 34 + k * 12, L.y0 + 3, L.x0 + 44 + k * 12, L.y0 + 11, { height: 12, facade: FAC.Metal, roof: Roof.GableX, roofStyle: RS.Metal, kind: BKind.Hall });
  }
  void rng;
}

// ------------------------------------------------------------------------------------------
// Street furniture
// ------------------------------------------------------------------------------------------

export function placeStreetProps(city: City, rng: RNG): void {
  const isJ = (x: number, y: number): boolean => city.inBounds(x, y) && (city.flags[y * MAP_W + x] & F_JUNCTION) !== 0;
  const isCross = (x: number, y: number): boolean => city.inBounds(x, y) && (city.flags[y * MAP_W + x] & F_CROSSWALK) !== 0;
  for (const r of city.roads) {
    const art = r.kind === RoadKind.Arterial;
    for (const side of [-1, 1]) {
      const sideTile = side < 0 ? r.c - r.lanes - 1 : r.c + r.lanes;
      const roadEdgeTile = side < 0 ? r.c - r.lanes : r.c + r.lanes - 1;
      let sinceLamp = rng.int(0, 5);
      let sinceTree = rng.int(0, 3);
      for (let a = r.a0; a < r.a1; a++) {
        const sx = r.horiz ? a : sideTile;
        const sy = r.horiz ? sideTile : a;
        if (!city.isSidewalk(sx, sy)) continue;
        if (city.flags[sy * MAP_W + sx] & 4 /*bridge*/) continue;
        // keep corners clear
        const ex0 = r.horiz ? a - 1 : roadEdgeTile;
        const ey0 = r.horiz ? roadEdgeTile : a - 1;
        const ex1 = r.horiz ? a + 1 : roadEdgeTile;
        const ey1 = r.horiz ? roadEdgeTile : a + 1;
        const ex = r.horiz ? a : roadEdgeTile;
        const ey = r.horiz ? roadEdgeTile : a;
        if (isJ(ex0, ey0) || isJ(ex1, ey1) || isJ(ex, ey) || isCross(ex, ey) || isCross(ex0, ey0) || isCross(ex1, ey1)) continue;
        // position on the curb side of the sidewalk tile
        const along = (a + 0.5) * T;
        const curb = side < 0 ? (r.c - r.lanes) * T - 0.65 : (r.c + r.lanes) * T + 0.65;
        const px = r.horiz ? along : curb;
        const py = r.horiz ? curb : along;
        const rot = r.horiz ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : side < 0 ? 0 : Math.PI;
        sinceLamp++;
        sinceTree++;
        if (sinceLamp >= 7) {
          prop(city, P.Lamp, px, py, rot);
          sinceLamp = 0;
          continue;
        }
        if (art && sinceTree >= 4 && sinceLamp >= 2) {
          prop(city, P.Tree, px + (r.horiz ? 0 : side * 0.2), py + (r.horiz ? side * 0.2 : 0), rng.range(0, 6.28), { v: rng.int(0, 3) });
          sinceTree = 0;
          continue;
        }
        if (art && rng.chance(0.02)) {
          prop(city, P.BusStop, px + (r.horiz ? 0 : side * 1.1), py + (r.horiz ? side * 1.1 : 0), rot);
          continue;
        }
        if (rng.chance(0.012)) prop(city, P.Litfass, px, py, 0);
        else if (rng.chance(0.03)) prop(city, P.Bin, px, py, rot, { v: rng.int(0, 3) });
      }
    }
  }
  // traffic lights and phone booths at junctions
  for (const j of city.junctions) {
    const x0 = j.x0 * T;
    const y0 = j.y0 * T;
    const x1 = j.x1 * T;
    const y1 = j.y1 * T;
    const o = 1.0;
    if (j.lights) {
      // SE corner: northbound (from S arm), NE: westbound (from E), NW: southbound (from N), SW: eastbound (from W)
      if (j.arms & 8) prop(city, P.TrafficLight, x1 + o, y0 - o, Math.PI, { ref: j.id, v: 1, w: (x1 - x0) / 2 });
      if (j.arms & 1) prop(city, P.TrafficLight, x1 + o, y1 + o, -Math.PI / 2, { ref: j.id, v: 0, w: (y1 - y0) / 2 });
      if (j.arms & 2) prop(city, P.TrafficLight, x0 - o, y1 + o, 0, { ref: j.id, v: 1, w: (x1 - x0) / 2 });
      if (j.arms & 4) prop(city, P.TrafficLight, x0 - o, y0 - o, Math.PI / 2, { ref: j.id, v: 0, w: (y1 - y0) / 2 });
    }
    if (rng.chance(0.08)) {
      const corner = rng.int(0, 3);
      const px = corner === 0 || corner === 3 ? x0 - 2.2 : x1 + 2.2;
      const py = corner < 2 ? y0 - 2.2 : y1 + 2.2;
      const tx = Math.floor(px / T);
      const ty = Math.floor(py / T);
      if (city.isSidewalk(tx, ty)) prop(city, P.Phone, px, py, 0);
    }
  }
}

export { SOLID_LOW };
