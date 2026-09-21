/**
 * Minimal ZIP reader, portable across Node and the browser.
 *
 * Reads the central directory rather than scanning local headers, because a
 * local header may declare sizes of zero and defer them to a data descriptor —
 * the central directory is the authoritative index. Supports stored (method 0)
 * and deflate (method 8), which is every entry in the archives this project
 * ingests.
 *
 * Decompression uses `DecompressionStream`, a web standard present in both
 * runtimes, so no Node-only import and no dependency.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

/**
 * List the entries in a zip archive.
 *
 * @param {ArrayBuffer|Uint8Array} bytes
 * @returns {Array<{name:string, method:number, compressedSize:number, size:number, offset:number}>}
 */
export function listZipEntries(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  /* The EOCD sits at the end, after a comment of unknown length. Scan back. */
  let eocd = -1;
  const lowest = Math.max(0, u8.length - 66_000);
  for (let i = u8.length - 22; i >= lowest; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0)
    throw new TypeError('Not a zip: no end-of-central-directory record.');

  const entryCount = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const entries = [];
  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) {
      throw new TypeError(`Corrupt central directory at entry ${i}.`);
    }
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(
      u8.subarray(at + 46, at + 46 + nameLength),
    );
    entries.push(Object.freeze({ name, method, compressedSize, size, offset }));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * Read one entry's bytes.
 *
 * @param {ArrayBuffer|Uint8Array} bytes the whole archive
 * @param {object} entry from `listZipEntries`
 * @returns {Promise<Uint8Array>}
 */
export async function readZipEntry(bytes, entry) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  /* The local header repeats the name and extra fields at its own lengths. */
  const nameLength = view.getUint16(entry.offset + 26, true);
  const extraLength = view.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLength + extraLength;
  const raw = u8.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return raw;
  if (entry.method !== 8) {
    throw new TypeError(
      `Zip entry "${entry.name}" uses compression method ${entry.method}; only stored and deflate are supported.`,
    );
  }
  const stream = new Blob([raw])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Read every entry whose name matches, as a name -> bytes map. */
export async function readZipEntries(bytes, predicate) {
  const out = new Map();
  for (const entry of listZipEntries(bytes)) {
    if (entry.name.endsWith('/')) continue;
    if (predicate && !predicate(entry.name)) continue;
    out.set(entry.name, await readZipEntry(bytes, entry));
  }
  return out;
}
