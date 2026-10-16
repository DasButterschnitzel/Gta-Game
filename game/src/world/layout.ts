// Hand-authored macro layout constants shared by the generator modules.

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const CANAL = { y0: 96, y1: 104 };
export const RIVER = { y0: 216, y1: 232 };
export const BASINS: Rect[] = [
  { x0: 52, y0: 0, x1: 72, y1: 74 },
  { x0: 124, y0: 0, x1: 144, y1: 74 },
  { x0: 196, y0: 0, x1: 216, y1: 74 },
];

/** Landmark reservations: subdivision never cuts through these; landmark builders fill them. */
export const RESERVED: Record<string, Rect> = {
  jva: { x0: 344, y0: 110, x1: 374, y1: 142 },
  hbf: { x0: 184, y0: 184, x1: 216, y1: 212 },
  police: { x0: 146, y0: 108, x1: 168, y1: 128 },
  turbine: { x0: 252, y0: 192, x1: 274, y1: 212 },
  hospital: { x0: 282, y0: 122, x1: 310, y1: 146 },
  wallpark: { x0: 70, y0: 164, x1: 100, y1: 190 },
  gril: { x0: 268, y0: 166, x1: 276, y1: 174 },
  knockout: { x0: 38, y0: 176, x1: 50, y1: 186 },
  herbie: { x0: 150, y0: 164, x1: 158, y1: 171 },
  paint1: { x0: 18, y0: 128, x1: 28, y1: 138 },
  paint2: { x0: 330, y0: 178, x1: 342, y1: 190 },
};
