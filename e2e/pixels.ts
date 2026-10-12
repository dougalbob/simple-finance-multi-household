import { inflateSync } from 'node:zlib';

/**
 * The little bit of image reading a chart spec needs (decision 202).
 *
 * The hatched-bar bug was invisible to every assertion this suite had: the bars
 * were in the DOM with the right geometry, the right computed `fill`, and a
 * real `<pattern>` behind them — and Chromium painted nothing at all, because
 * the paint server they pointed at sat inside a `display: none` figure (a
 * `url(#…)` that resolves into a hidden subtree paints nothing; SVG 1.1, and
 * every browser). Only a pixel can tell that story, so a chart spec now
 * screenshots the drawing and reads it back.
 *
 * This is a PNG reader, not an image library: Chromium writes screenshots as
 * 8-bit non-interlaced PNG (colour type 6, or 2 with `omitBackground`), and
 * that is all this decodes. `node:zlib` does the rest.
 */

export interface Raster {
  width: number;
  height: number;
  /** RGBA, one byte per channel, row-major. */
  data: Buffer;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function decodePng(png: Buffer): Raster {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const idat: Buffer[] = [];
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const colourType = body[9];
      const interlace = body[12];
      if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth ?? 0}`);
      if (interlace !== 0) throw new Error('interlaced PNGs are not supported');
      if (colourType === 6) channels = 4;
      else if (colourType === 2) channels = 3;
      else throw new Error(`unsupported PNG colour type ${colourType ?? 0}`);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(body));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (width === 0 || height === 0) throw new Error('PNG has no IHDR');

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? (row[x - channels] ?? 0) : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? (previous[x - channels] ?? 0) : 0;
      const value = line[x] ?? 0;
      let result: number;
      switch (filter) {
        case 1:
          result = value + left;
          break;
        case 2:
          result = value + up;
          break;
        case 3:
          result = value + ((left + up) >> 1);
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          result = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
          break;
        }
        default:
          result = value;
      }
      row[x] = result & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      out[target] = row[source] ?? 0;
      out[target + 1] = row[source + 1] ?? 0;
      out[target + 2] = row[source + 2] ?? 0;
      out[target + 3] = channels === 4 ? (row[source + 3] ?? 255) : 255;
    }
    previous = row;
  }
  return { width, height, data: out };
}

/**
 * How many pixels in the box carry colour, where "colour" means a distance
 * between the strongest and weakest channel. The chart's own furniture is grey
 * — paper, gridlines, the zero rule, axis text — so a coloured pixel inside a
 * bar's own box means the bar was painted. A box inside a bar Chromium left
 * blank cannot reach the threshold by accident.
 */
export function countChromaticPixels(raster: Raster, box: Box, minimum = 16): number {
  const x0 = Math.max(0, Math.round(box.x));
  const y0 = Math.max(0, Math.round(box.y));
  const x1 = Math.min(raster.width, Math.round(box.x + box.width));
  const y1 = Math.min(raster.height, Math.round(box.y + box.height));
  let found = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * raster.width + x) * 4;
      const r = raster.data[offset] ?? 0;
      const g = raster.data[offset + 1] ?? 0;
      const b = raster.data[offset + 2] ?? 0;
      if (Math.max(r, g, b) - Math.min(r, g, b) >= minimum) found += 1;
    }
  }
  return found;
}
