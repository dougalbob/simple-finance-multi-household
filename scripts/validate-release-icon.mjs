#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EXPECTED_SIZE = 512;

/**
 * Validate the canonical release icon without depending on an image utility
 * that may not be installed on the GitHub runner. This checks the PNG framing,
 * every chunk CRC, the IHDR fields and dimensions, the compressed image data,
 * scanline lengths and row filter bytes.
 *
 * @param {Buffer} png
 * @param {{ width?: number, height?: number }} [expected]
 */
export function validateReleaseIcon(
  png,
  { width: expectedWidth = EXPECTED_SIZE, height: expectedHeight = EXPECTED_SIZE } = {},
) {
  if (!Buffer.isBuffer(png)) throw new TypeError('release icon must be provided as a Buffer');
  if (png.length < 45) throw new Error('release icon is too short to be a PNG');
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('release icon does not have a valid PNG signature');
  }

  let offset = PNG_SIGNATURE.length;
  let ihdr;
  let sawIdat = false;
  let finishedIdat = false;
  let sawIend = false;
  const idat = [];

  while (offset < png.length) {
    if (offset + 12 > png.length) throw new Error('release icon has a truncated PNG chunk');

    const length = png.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > png.length) throw new Error('release icon has a truncated PNG chunk');

    const typeBytes = png.subarray(typeStart, dataStart);
    const type = typeBytes.toString('ascii');
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error('release icon has an invalid PNG chunk type');

    const data = png.subarray(dataStart, dataEnd);
    const storedCrc = png.readUInt32BE(dataEnd);
    const calculatedCrc = crc32(Buffer.concat([typeBytes, data]));
    if (storedCrc !== calculatedCrc) {
      throw new Error(`release icon has an invalid ${type} chunk checksum`);
    }

    if (type === 'IHDR') {
      if (ihdr || offset !== PNG_SIGNATURE.length || length !== 13) {
        throw new Error('release icon must start with one 13-byte IHDR chunk');
      }
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colourType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      if (!ihdr || finishedIdat) throw new Error('release icon has misplaced IDAT chunks');
      sawIdat = true;
      idat.push(data);
    } else if (type === 'IEND') {
      if (!ihdr || !sawIdat || length !== 0)
        throw new Error('release icon has an invalid IEND chunk');
      sawIend = true;
      offset = chunkEnd;
      break;
    } else if (sawIdat) {
      finishedIdat = true;
    }

    offset = chunkEnd;
  }

  if (!ihdr) throw new Error('release icon has no IHDR chunk');
  if (!sawIend) throw new Error('release icon has no IEND chunk');
  if (offset !== png.length) throw new Error('release icon has bytes after its IEND chunk');
  if (ihdr.width !== expectedWidth || ihdr.height !== expectedHeight) {
    throw new Error(
      `release icon must be ${expectedWidth} × ${expectedHeight}, got ${ihdr.width} × ${ihdr.height}`,
    );
  }
  if (ihdr.compression !== 0 || ihdr.filter !== 0 || ihdr.interlace !== 0) {
    throw new Error('release icon uses unsupported PNG compression, filtering or interlacing');
  }

  const channelsByColourType = new Map([
    [0, 1],
    [2, 3],
    [3, 1],
    [4, 2],
    [6, 4],
  ]);
  const validDepthsByColourType = new Map([
    [0, new Set([1, 2, 4, 8, 16])],
    [2, new Set([8, 16])],
    [3, new Set([1, 2, 4, 8])],
    [4, new Set([8, 16])],
    [6, new Set([8, 16])],
  ]);
  const channels = channelsByColourType.get(ihdr.colourType);
  const validDepths = validDepthsByColourType.get(ihdr.colourType);
  if (!channels || !validDepths?.has(ihdr.bitDepth)) {
    throw new Error('release icon has an invalid PNG colour type or bit depth');
  }

  let pixels;
  try {
    pixels = inflateSync(Buffer.concat(idat));
  } catch (error) {
    throw new Error('release icon has invalid compressed image data', { cause: error });
  }

  const rowLength = Math.ceil((ihdr.width * channels * ihdr.bitDepth) / 8);
  const expectedPixelBytes = (rowLength + 1) * ihdr.height;
  if (pixels.length !== expectedPixelBytes) {
    throw new Error(
      `release icon has ${pixels.length} decoded bytes, expected ${expectedPixelBytes}`,
    );
  }
  for (let row = 0; row < ihdr.height; row += 1) {
    const filterByte = pixels[row * (rowLength + 1)];
    if (filterByte === undefined || filterByte > 4) {
      throw new Error(`release icon has an invalid filter byte on row ${row + 1}`);
    }
  }

  return {
    width: ihdr.width,
    height: ihdr.height,
    bitDepth: ihdr.bitDepth,
    colourType: ihdr.colourType,
  };
}

/** @param {Buffer} bytes */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function main() {
  const source = process.argv[2];
  if (!source || process.argv.length !== 3) {
    console.error('Usage: node scripts/validate-release-icon.mjs <png-path>');
    process.exitCode = 2;
    return;
  }

  try {
    const result = validateReleaseIcon(readFileSync(source));
    console.log(
      `release icon valid: ${source} (${result.width} × ${result.height}, ${result.bitDepth}-bit PNG)`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Invalid release icon ${source}: ${message}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) main();
