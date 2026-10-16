// Shared world data types for the city of Neuhafen.

export const TILE = 4; // metres per tile
export const MAP_W = 400; // tiles
export const MAP_H = 400; // tiles
export const WORLD_W = MAP_W * TILE;
export const WORLD_H = MAP_H * TILE;

/** Ground material per tile. */
export enum G {
  Grass = 0,
  Asphalt,
  Sidewalk,
  Cobble,
  Water,
  Concrete,
  Dirt,
  Gravel,
  Plaza,
  Courtyard,
  Parking,
  Sand,
  Pavers,
  Rail,
  Wall,
  Quay,
  Path,
  Runway,
  Bridge,
  Pool,
  Forest,
  BridgeWalk,
}
export const G_COUNT = 22;

export enum D {
  None = 0,
  Kiez,
  Bahnhof,
  Platte,
  Hafen,
  Industrie,
  Altstadt,
  Turm,
  Villen,
  Uni,
  Park,
  Flughafen,
  Nordend,
}

export const DISTRICT_NAMES: Record<number, string> = {
  [D.None]: '',
  [D.Kiez]: 'Sankt Paula',
  [D.Bahnhof]: 'Bahnhofsviertel',
  [D.Platte]: 'Betonhausen',
  [D.Hafen]: 'Freihafen',
  [D.Industrie]: 'Rostwerk',
  [D.Altstadt]: 'Altstadt',
  [D.Turm]: 'Turmviertel',
  [D.Villen]: 'Sonnenhang',
  [D.Uni]: 'Universität',
  [D.Park]: 'Stadtpark',
  [D.Flughafen]: 'Flughafen NHI',
  [D.Nordend]: 'Nordend',
};

export enum Zone {
  Sued = 0,
  Hafen = 1,
  Nord = 2,
}

/** Tile solidity for on-foot navigation and minimap. */
export const SOLID_NONE = 0;
export const SOLID_BUILDING = 1;
export const SOLID_WATER = 2;
export const SOLID_WALL = 3;
export const SOLID_LOW = 4;

/** Tile flag bits. */
export const F_ROAD = 1; // carriageway
export const F_SIDEWALK = 2;
export const F_BRIDGE = 4;
export const F_JUNCTION = 8;
export const F_CROSSWALK = 16;
export const F_RESERVED = 32;
export const F_PARKING = 64;
export const F_NOPED = 128;

export enum Roof {
  Flat = 0,
  GableX = 1, // ridge runs along X
  GableY = 2, // ridge runs along Y
  Saw = 3, // industrial saw-tooth (teeth along X)
  Round = 4, // cylinder (tanks, chimneys) – rendered as octagonal prism
  Container = 5,
}

/** Facade styles (indices into the facade atlas). */
export const FAC = {
  AltCream: 0,
  AltOchre: 1,
  AltBlue: 2,
  AltRose: 3,
  AltWhite: 4,
  AltGray: 5,
  AltGreen: 6,
  PlatteGray: 7,
  PlatteBeige: 8,
  PlattePastel: 9,
  GlassBlue: 10,
  GlassGreen: 11,
  Office: 12,
  Brick: 13,
  BrickDark: 14,
  Fachwerk: 15,
  FachwerkOchre: 16,
  Metal: 17,
  MetalRust: 18,
  Concrete: 19,
  Villa: 20,
  VillaCream: 21,
  Container: 22,
  Station: 23,
  Prison: 24,
  Church: 25,
  Tank: 26,
  Kiosk: 27,
} as const;
export const FAC_COUNT = 28;

/** Roof styles (indices into the roof atlas). */
export const RS = {
  Gravel: 0,
  Tar: 1,
  Green: 2,
  Metal: 3,
  TileRed: 4,
  TileBrown: 5,
  TileAnthracite: 6,
  Slate: 7,
  Copper: 8,
  Glass: 9,
  Solar: 10,
  Container: 11,
  Concrete: 12,
  Helipad: 13,
  SawGlass: 14,
  TankTop: 15,
} as const;
export const RS_COUNT = 16;

export enum BKind {
  House = 0,
  Slab,
  Tower,
  Warehouse,
  Hall,
  Container,
  Tank,
  Chimney,
  Special,
  Shed,
  Wall,
}

export interface Building {
  x: number; // metres, min corner
  y: number;
  w: number;
  h: number;
  height: number; // metres
  facade: number;
  roof: Roof;
  roofStyle: number;
  tint: number; // 0xRRGGBB multiply, 0xffffff = none
  kind: BKind;
  /** ground-floor shops on the side facing these directions (bitmask E=1,N=2,W=4,S=8) */
  shops: number;
  /** roof clutter (AC units, vents...) */
  clutter: boolean;
  name?: string;
}

export enum P {
  Tree = 0,
  TreeSmall,
  Lamp,
  Bench,
  Bin,
  Phone,
  BusStop,
  Bollard,
  Hedge,
  Fence,
  TrafficLight,
  Litfass,
  Fountain,
  Crane,
  Bush,
  Playground,
  Kiosk,
  Barrier,
  Bottle,
  Hydrant,
  Umbrella,
  Railing,
}

export interface Prop {
  t: P;
  x: number;
  y: number;
  rot: number;
  w?: number;
  h?: number;
  v?: number; // variant / colour index
  /** for traffic lights: junction id; for barriers: zone lock id */
  ref?: number;
}

export enum RoadKind {
  Local = 0,
  Arterial = 1,
  Edge = 2,
  Autobahn = 3,
}

export interface Road {
  id: number;
  horiz: boolean;
  c: number; // centre line coordinate (tiles); road spans [c-lanes, c+lanes) across
  a0: number; // extent along axis (tiles) [a0, a1)
  a1: number;
  lanes: number; // per direction
  kind: RoadKind;
  name: string;
  speed: number; // m/s for AI
  cobble: boolean;
}

export interface Junction {
  id: number;
  x0: number; // tiles
  y0: number;
  x1: number;
  y1: number;
  h: number; // road ids
  v: number;
  arms: number; // bitmask E=1 N=2 W=4 S=8
  lights: boolean;
  phase: number; // seconds offset
}

export interface Block {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number; // tiles, exclusive end
  district: D;
  zone: Zone;
  /** which sides border a road */
  n: boolean;
  s: boolean;
  e: boolean;
  w: boolean;
  /** pedestrian ring in metres */
  rx0: number;
  ry0: number;
  rx1: number;
  ry1: number;
  park: boolean;
}

export enum Turn {
  Lane = 0,
  Straight = 1,
  Right = 2,
  Left = 3,
  UTurn = 4,
}

export interface LaneEdge {
  id: number;
  xs: Float32Array;
  ys: Float32Array;
  cum: Float32Array; // cumulative distance per point
  len: number;
  next: number[];
  prev: number[];
  speed: number;
  road: number; // -1 for connectors
  junction: number; // junction at END (for lanes) or the junction being crossed (connectors)
  dir: number; // travel heading 0=E 1=N 2=W 3=S (for lanes; connectors: exit heading)
  laneIdx: number;
  lanesInDir: number;
  turn: Turn;
  /** 0 = EW group, 1 = NS group, -1 = no signal */
  signal: number;
  /** must yield at end (unsignalled minor approach) */
  yieldAtEnd: boolean;
  /** distance before the end where vehicles stop (stop line) */
  stopOffset: number;
}

export interface ParkedSpot {
  x: number;
  y: number;
  rot: number;
  district: D;
}

export interface POI {
  id: string;
  x: number;
  y: number;
  rot?: number;
  label?: string;
}

export interface Railing {
  x0: number;
  y0: number;
  x1: number;
  y1: number; // metres; axis-aligned thin box
}

export function zoneOfTileY(ty: number): Zone {
  if (ty < 96) return Zone.Hafen;
  if (ty >= 232) return Zone.Nord;
  return Zone.Sued;
}
