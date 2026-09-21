/**
 * Minimal GeoTIFF reader, scoped to the rasters this project actually ingests.
 *
 * WorldPop's `npl_ppp_2015.tif` is classic little-endian TIFF, 9772 x 4919,
 * float32, LZW-compressed, one row per strip, with a GeoTIFF tie point and
 * pixel scale. That shape — strip-based, single sample, float or integer — is
 * what this reader supports, and it refuses anything else loudly rather than
 * returning plausible nonsense.
 *
 * Row-per-strip is the reason a 91 MB raster is tractable here: `readWindow`
 * decodes only the strips a bounding box touches, so a district's zonal
 * statistic costs the rows that district spans, not the whole country.
 *
 * Portable: bytes in, numbers out.
 */

const TAG = Object.freeze({
  ImageWidth: 256,
  ImageLength: 257,
  BitsPerSample: 258,
  Compression: 259,
  StripOffsets: 273,
  SamplesPerPixel: 277,
  RowsPerStrip: 278,
  StripByteCounts: 279,
  PlanarConfiguration: 284,
  Predictor: 317,
  SampleFormat: 339,
  ModelPixelScale: 33550,
  ModelTiepoint: 33922,
  GdalNoData: 42113,
});

const TYPE_SIZE = Object.freeze({
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
  /* BigTIFF adds 64-bit integer types. */
  16: 8,
  17: 8,
  18: 8,
});

/**
 * Parse the header and georeferencing without decoding any pixels.
 *
 * @param {ArrayBuffer|Uint8Array} bytes
 */
export function readGeoTiffHeader(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const order = String.fromCharCode(u8[0], u8[1]);
  if (order !== 'II' && order !== 'MM') throw new TypeError('Not a TIFF.');
  const little = order === 'II';
  const magic = view.getUint16(2, little);
  if (magic !== 42 && magic !== 43)
    throw new TypeError(`Not a TIFF: magic ${magic}.`);
  /*
   * WorldPop ships both flavours in the same directory: npl_ppp_2015.tif is
   * classic TIFF and npl_ppp_2015_UNadj.tif — the variant whose total matches
   * the UN national estimate, and therefore the one this project measures
   * against census-derived district figures — is BigTIFF. Supporting only
   * classic would have quietly forced the wrong product into the analysis.
   *
   * BigTIFF widens three things: the IFD entry count (8 bytes, not 2), the
   * per-entry value count and offset (8 bytes each, not 4), so an entry is
   * 20 bytes rather than 12 and a value stays inline up to 8 bytes.
   */
  const big = magic === 43;
  if (big && view.getUint16(4, little) !== 8) {
    throw new TypeError(
      'BigTIFF with a non-8-byte offset size is not supported.',
    );
  }
  const readOffset = (at) =>
    big ? Number(view.getBigUint64(at, little)) : view.getUint32(at, little);

  const ifdOffset = big
    ? Number(view.getBigUint64(8, little))
    : view.getUint32(4, little);
  const count = big
    ? Number(view.getBigUint64(ifdOffset, little))
    : view.getUint16(ifdOffset, little);
  const entrySize = big ? 20 : 12;
  const inlineLimit = big ? 8 : 4;
  const tags = new Map();
  for (let i = 0; i < count; i += 1) {
    const at = ifdOffset + (big ? 8 : 2) + i * entrySize;
    const tag = view.getUint16(at, little);
    const type = view.getUint16(at + 2, little);
    const n = big
      ? Number(view.getBigUint64(at + 4, little))
      : view.getUint32(at + 4, little);
    const size = (TYPE_SIZE[type] ?? 1) * n;
    const valueFieldAt = at + (big ? 12 : 8);
    const valueAt =
      size <= inlineLimit ? valueFieldAt : readOffset(valueFieldAt);
    tags.set(tag, readTagValue(view, u8, valueAt, type, n, little));
  }

  const first = (tag, fallback) => {
    const value = tags.get(tag);
    if (value === undefined) return fallback;
    return Array.isArray(value) ? value[0] : value;
  };

  const width = first(TAG.ImageWidth);
  const height = first(TAG.ImageLength);
  const samplesPerPixel = first(TAG.SamplesPerPixel, 1);
  const bitsPerSample = first(TAG.BitsPerSample, 8);
  const sampleFormat = first(TAG.SampleFormat, 1);
  const compression = first(TAG.Compression, 1);
  const predictor = first(TAG.Predictor, 1);
  const rowsPerStrip = first(TAG.RowsPerStrip, height);
  const scale = tags.get(TAG.ModelPixelScale) ?? null;
  const tie = tags.get(TAG.ModelTiepoint) ?? null;
  const noDataRaw = tags.get(TAG.GdalNoData);

  if (samplesPerPixel !== 1) {
    throw new TypeError(
      `Only single-band rasters are supported (got ${samplesPerPixel}).`,
    );
  }
  if (compression !== 1 && compression !== 5) {
    throw new TypeError(
      `Compression ${compression} is not supported; this reader handles none (1) and LZW (5).`,
    );
  }
  if (predictor !== 1 && predictor !== 2) {
    throw new TypeError(
      `Predictor ${predictor} is not supported; this reader handles none (1) and horizontal differencing (2).`,
    );
  }
  if (!scale || !tie) {
    throw new TypeError(
      'Raster has no ModelPixelScale/ModelTiepoint: it is not georeferenced.',
    );
  }

  return Object.freeze({
    little,
    width,
    height,
    bitsPerSample,
    sampleFormat,
    compression,
    predictor,
    rowsPerStrip,
    stripOffsets: toArray(tags.get(TAG.StripOffsets)),
    stripByteCounts: toArray(tags.get(TAG.StripByteCounts)),
    /** Degrees per pixel, x and y. */
    pixelScale: Object.freeze([scale[0], scale[1]]),
    /** Geographic position of the top-left corner of pixel (0,0). */
    origin: Object.freeze([tie[3], tie[4]]),
    noData:
      noDataRaw === undefined
        ? null
        : Number(String(Array.isArray(noDataRaw) ? noDataRaw[0] : noDataRaw)),
  });
}

function toArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function readTagValue(view, u8, at, type, n, little) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    switch (type) {
      case 1:
      case 7:
        out.push(u8[at + i]);
        break;
      case 2:
        out.push(String.fromCharCode(u8[at + i]));
        break;
      case 3:
        out.push(view.getUint16(at + i * 2, little));
        break;
      case 4:
        out.push(view.getUint32(at + i * 4, little));
        break;
      case 5:
        out.push(
          view.getUint32(at + i * 8, little) /
            view.getUint32(at + i * 8 + 4, little),
        );
        break;
      case 11:
        out.push(view.getFloat32(at + i * 4, little));
        break;
      case 12:
        out.push(view.getFloat64(at + i * 8, little));
        break;
      /* LONG8 / SLONG8 / IFD8: strip offsets in a BigTIFF exceed 2^32. */
      case 16:
      case 18:
        out.push(Number(view.getBigUint64(at + i * 8, little)));
        break;
      case 17:
        out.push(Number(view.getBigInt64(at + i * 8, little)));
        break;
      default:
        out.push(null);
    }
  }
  if (type === 2) return out.join('').replace(/\0+$/, '');
  return n === 1 ? out[0] : out;
}

/** Pixel column/row containing a geographic position. Fractional, not floored. */
export function geoToPixel(header, lon, lat) {
  return [
    (lon - header.origin[0]) / header.pixelScale[0],
    (header.origin[1] - lat) / header.pixelScale[1],
  ];
}

/** Geographic position of a pixel CENTRE. */
export function pixelToGeo(header, col, row) {
  return [
    header.origin[0] + (col + 0.5) * header.pixelScale[0],
    header.origin[1] - (row + 0.5) * header.pixelScale[1],
  ];
}

/** The raster's geographic bounds, `[west, south, east, north]`. */
export function rasterBounds(header) {
  return Object.freeze([
    header.origin[0],
    header.origin[1] - header.height * header.pixelScale[1],
    header.origin[0] + header.width * header.pixelScale[0],
    header.origin[1],
  ]);
}

/**
 * Undo horizontal differencing (Predictor 2), in place, one row at a time.
 *
 * The subtlety that matters: libtiff accumulates 32-bit samples as UNSIGNED
 * INTEGERS even when the sample format is IEEE float, so a float raster
 * written with Predictor 2 must be summed in uint32 and only then reinterpreted
 * as float. Accumulating in floating point instead produces a raster that is
 * the right size and shape, decodes without error, and is quietly wrong —
 * which is the failure mode this project can least afford.
 */
export function undoHorizontalDifferencing(data, header, rowsInStrip) {
  const bytesPerSample = header.bitsPerSample / 8;
  const rowBytes = header.width * bytesPerSample;
  for (let r = 0; r < rowsInStrip; r += 1) {
    const base = r * rowBytes;
    if (base + rowBytes > data.length) break;
    if (bytesPerSample === 1) {
      for (let i = 1; i < header.width; i += 1) {
        data[base + i] = (data[base + i] + data[base + i - 1]) & 0xff;
      }
    } else {
      const view = new DataView(data.buffer, data.byteOffset + base, rowBytes);
      if (bytesPerSample === 2) {
        for (let i = 1; i < header.width; i += 1) {
          const sum =
            (view.getUint16(i * 2, header.little) +
              view.getUint16((i - 1) * 2, header.little)) &
            0xffff;
          view.setUint16(i * 2, sum, header.little);
        }
      } else if (bytesPerSample === 4) {
        for (let i = 1; i < header.width; i += 1) {
          const sum =
            (view.getUint32(i * 4, header.little) +
              view.getUint32((i - 1) * 4, header.little)) >>>
            0;
          view.setUint32(i * 4, sum, header.little);
        }
      } else {
        throw new TypeError(
          `Predictor 2 with ${bytesPerSample}-byte samples is not supported.`,
        );
      }
    }
  }
  return data;
}

/** Decode one whole strip, predictor undone. */
export function readStrip(bytes, header, strip) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const offset = header.stripOffsets[strip];
  const length = header.stripByteCounts[strip];
  const raw = u8.subarray(offset, offset + length);
  let data = header.compression === 5 ? decodeLzw(raw) : raw;
  if (header.predictor === 2) {
    /* Copy a stored (uncompressed) strip before mutating the source buffer. */
    if (header.compression !== 5) data = Uint8Array.from(data);
    const rowsInStrip = Math.min(
      header.rowsPerStrip,
      header.height - strip * header.rowsPerStrip,
    );
    undoHorizontalDifferencing(data, header, rowsInStrip);
  }
  return data;
}

/**
 * Decode one image row.
 *
 * Convenience over `readStrip`. When `RowsPerStrip` is large — the UN-adjusted
 * WorldPop raster uses 512 — calling this per row re-decodes the same 20 MB
 * strip every time, so `createRasterReader` below caches the last strip and is
 * what the pipelines actually use.
 */
export function readRow(bytes, header, row) {
  if (row < 0 || row >= header.height)
    throw new RangeError(`Row ${row} is outside the raster.`);
  const strip = Math.floor(row / header.rowsPerStrip);
  const data = readStrip(bytes, header, strip);
  const bytesPerSample = header.bitsPerSample / 8;
  const rowBytes = header.width * bytesPerSample;
  const from = (row - strip * header.rowsPerStrip) * rowBytes;
  return decodeSamples(data.subarray(from, from + rowBytes), header);
}

/**
 * A reader that remembers the strip it last decoded.
 *
 * Sequential row access — which is what every zonal statistic does — then
 * costs one strip decode per `rowsPerStrip` rows instead of one per row.
 */
export function createRasterReader(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const header = readGeoTiffHeader(u8);
  let cachedIndex = -1;
  let cached = null;
  const bytesPerSample = header.bitsPerSample / 8;
  const rowBytes = header.width * bytesPerSample;
  return {
    header,
    readRow(row) {
      if (row < 0 || row >= header.height) {
        throw new RangeError(`Row ${row} is outside the raster.`);
      }
      const strip = Math.floor(row / header.rowsPerStrip);
      if (strip !== cachedIndex) {
        cached = readStrip(u8, header, strip);
        cachedIndex = strip;
      }
      const from = (row - strip * header.rowsPerStrip) * rowBytes;
      return decodeSamples(cached.subarray(from, from + rowBytes), header);
    },
  };
}

function decodeSamples(slice, header) {
  /*
   * A copy rather than a view: `slice` points into a decoded strip whose
   * byteOffset is arbitrary, and a Float32Array cannot be created on an
   * unaligned offset. Copying is also what makes the return value safe to
   * keep after the strip buffer is released.
   */
  const copy = new Uint8Array(slice.length);
  copy.set(slice);
  const view = new DataView(copy.buffer);
  const n = Math.floor(copy.length / (header.bitsPerSample / 8));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    if (header.sampleFormat === 3) {
      out[i] =
        header.bitsPerSample === 64
          ? view.getFloat64(i * 8, header.little)
          : view.getFloat32(i * 4, header.little);
    } else if (header.sampleFormat === 2) {
      out[i] =
        header.bitsPerSample === 16
          ? view.getInt16(i * 2, header.little)
          : header.bitsPerSample === 32
            ? view.getInt32(i * 4, header.little)
            : view.getInt8(i);
    } else {
      out[i] =
        header.bitsPerSample === 16
          ? view.getUint16(i * 2, header.little)
          : header.bitsPerSample === 32
            ? view.getUint32(i * 4, header.little)
            : copy[i];
    }
  }
  return out;
}

/**
 * TIFF's LZW variant.
 *
 * Two details separate it from the textbook algorithm, and getting either
 * wrong yields garbage that still decodes to the right LENGTH, which is the
 * kind of bug that reaches a presentation: codes are packed MSB-first, and
 * the code width increases one code EARLY (at 511, 1023, 2047 rather than
 * 512, 1024, 2048).
 */
export function decodeLzw(input) {
  const CLEAR = 256;
  const EOI = 257;
  let dictionary = [];
  const reset = () => {
    dictionary = new Array(258);
    for (let i = 0; i < 256; i += 1) dictionary[i] = Uint8Array.of(i);
  };
  reset();

  const chunks = [];
  let total = 0;
  let bitPosition = 0;
  let codeWidth = 9;
  let previous = null;

  const readCode = () => {
    let value = 0;
    for (let i = 0; i < codeWidth; i += 1) {
      const byte = input[bitPosition >> 3];
      if (byte === undefined) return EOI;
      value = (value << 1) | ((byte >> (7 - (bitPosition & 7))) & 1);
      bitPosition += 1;
    }
    return value;
  };

  for (;;) {
    const code = readCode();
    if (code === EOI) break;
    if (code === CLEAR) {
      reset();
      codeWidth = 9;
      previous = null;
      continue;
    }
    let entry;
    if (code < dictionary.length && dictionary[code] !== undefined) {
      entry = dictionary[code];
      if (previous !== null) {
        const added = new Uint8Array(previous.length + 1);
        added.set(previous);
        added[previous.length] = entry[0];
        dictionary.push(added);
      }
    } else {
      if (previous === null)
        throw new Error('LZW stream starts with an undefined code.');
      entry = new Uint8Array(previous.length + 1);
      entry.set(previous);
      entry[previous.length] = previous[0];
      dictionary.push(entry);
    }
    chunks.push(entry);
    total += entry.length;
    previous = entry;
    /* Early change: widen one code before the dictionary actually fills. */
    if (dictionary.length + 1 === 512) codeWidth = 10;
    else if (dictionary.length + 1 === 1024) codeWidth = 11;
    else if (dictionary.length + 1 === 2048) codeWidth = 12;
  }

  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
