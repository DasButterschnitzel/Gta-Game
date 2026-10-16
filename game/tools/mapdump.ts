// Debug tool: generate the city and write an overview PNG (1 tile = SCALE px).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { generateCity } from '../src/world/citygen';
import { MAP_W, MAP_H, G, TILE, F_CROSSWALK, F_JUNCTION } from '../src/world/types';

const SCALE = Number(process.argv[3] ?? 3);
const out = process.argv[2] ?? 'map.png';
const t0 = Date.now();
const city = generateCity();
const t1 = Date.now();

const GC: Record<number, [number, number, number]> = {
  [G.Grass]: [86, 128, 70], [G.Asphalt]: [60, 62, 66], [G.Sidewalk]: [150, 148, 142], [G.Cobble]: [110, 100, 92],
  [G.Water]: [40, 80, 120], [G.Concrete]: [130, 130, 128], [G.Dirt]: [120, 98, 70], [G.Gravel]: [140, 132, 118],
  [G.Plaza]: [170, 165, 155], [G.Courtyard]: [120, 116, 108], [G.Parking]: [72, 74, 78], [G.Sand]: [200, 180, 120],
  [G.Pavers]: [150, 100, 90], [G.Rail]: [90, 80, 70], [G.Wall]: [30, 30, 30], [G.Quay]: [120, 118, 112],
  [G.Path]: [170, 150, 110], [G.Runway]: [50, 50, 52], [G.Bridge]: [80, 80, 86], [G.Pool]: [80, 180, 220],
  [G.Forest]: [40, 80, 40], [G.BridgeWalk]: [130, 130, 130],
};
const W = MAP_W * SCALE, H = MAP_H * SCALE;
const px = new Uint8Array(W * H * 3);
const put = (x: number, y: number, c: [number, number, number]) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = ((H - 1 - y) * W + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
};
for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
  const i = ty * MAP_W + tx;
  let c = GC[city.ground[i]] ?? [255, 0, 255];
  if (city.flags[i] & F_CROSSWALK) c = [200, 200, 200];
  if (city.flags[i] & F_JUNCTION) c = [70, 70, 76];
  for (let sy = 0; sy < SCALE; sy++) for (let sx = 0; sx < SCALE; sx++) put(tx * SCALE + sx, ty * SCALE + sy, c);
}
// buildings: colour by height
for (const b of city.buildings) {
  const k = Math.min(1, b.height / 34);
  const c: [number, number, number] = [Math.round(200 - 120 * k), Math.round(170 - 110 * k), Math.round(150 - 80 * k)];
  const x0 = Math.floor((b.x / TILE) * SCALE), y0 = Math.floor((b.y / TILE) * SCALE);
  const x1 = Math.ceil(((b.x + b.w) / TILE) * SCALE), y1 = Math.ceil(((b.y + b.h) / TILE) * SCALE);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const edge = x === x0 || y === y0 || x === x1 - 1 || y === y1 - 1;
    put(x, y, edge ? [40, 36, 34] : c);
  }
}
for (const p of city.props) {
  const x = Math.round((p.x / TILE) * SCALE), y = Math.round((p.y / TILE) * SCALE);
  if (p.t === 0 || p.t === 1) put(x, y, [30, 100, 30]);
  else if (p.t === 10) put(x, y, [255, 60, 60]);
  else if (p.t === 5) { put(x, y, [255, 220, 0]); put(x + 1, y, [255, 220, 0]); }
}
for (const p of city.parked) put(Math.round((p.x / TILE) * SCALE), Math.round((p.y / TILE) * SCALE), [220, 40, 200]);
for (const poi of city.pois.values()) {
  const x = Math.round((poi.x / TILE) * SCALE), y = Math.round((poi.y / TILE) * SCALE);
  for (let d = -3; d <= 3; d++) { put(x + d, y, [255, 255, 0]); put(x, y + d, [255, 255, 0]); }
}
// PNG encode
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Buffer) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`generated in ${t1 - t0} ms: roads=${city.roads.length} junctions=${city.junctions.length} blocks=${city.blocks.length} buildings=${city.buildings.length} props=${city.props.length} lanes=${city.lanes.length} parked=${city.parked.length} railings=${city.railings.length}`);
const lights = city.junctions.filter(j => j.lights).length;
const noNext = city.lanes.filter(e => e.next.length === 0).length;
console.log(`lights=${lights} lanesWithoutNext=${noNext}`);
