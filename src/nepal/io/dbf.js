/**
 * dBASE III/IV table reader — the attribute half of a shapefile.
 *
 * Written rather than depended on: the project already refuses to add a
 * dependency it can read in an afternoon, and a 3.7 MB archive of somebody
 * else's field names is exactly the case where knowing the parser matters.
 *
 * Portable: takes bytes, returns rows. No filesystem.
 */

/** Field type codes we decode. Anything else is returned as trimmed text. */
const TYPE = Object.freeze({
  CHARACTER: 'C',
  NUMERIC: 'N',
  FLOAT: 'F',
  DATE: 'D',
  LOGICAL: 'L',
});

/**
 * Read a .dbf table.
 *
 * @param {ArrayBuffer|Uint8Array} bytes
 * @param {object} [options]
 * @param {(raw:string, field:object)=>any} [options.decodeText] override for
 *   non-Latin-1 encodings; the .cpg file names the real one when present
 * @returns {{fields: Array<object>, rows: Array<object>, recordCount: number}}
 */
export function readDbf(bytes, { decodeText } = {}) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < 32)
    throw new TypeError('Not a DBF: shorter than its header.');
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  const recordCount = view.getUint32(4, true);
  const headerLength = view.getUint16(8, true);
  const recordLength = view.getUint16(10, true);
  const fieldCount = Math.floor((headerLength - 33) / 32);
  if (fieldCount <= 0) throw new TypeError('DBF declares no fields.');

  const fields = [];
  for (let i = 0; i < fieldCount; i += 1) {
    const at = 32 + i * 32;
    let name = '';
    for (let c = 0; c < 11; c += 1) {
      const code = u8[at + c];
      if (code === 0) break;
      name += String.fromCharCode(code);
    }
    fields.push(
      Object.freeze({
        name,
        type: String.fromCharCode(u8[at + 11]),
        length: u8[at + 16],
        decimals: u8[at + 17],
      }),
    );
  }

  const latin1 = (start, length) => {
    let out = '';
    for (let i = 0; i < length; i += 1)
      out += String.fromCharCode(u8[start + i]);
    return out;
  };

  const rows = [];
  for (let r = 0; r < recordCount; r += 1) {
    const base = headerLength + r * recordLength;
    if (base + recordLength > u8.length) break;
    /* 0x2a marks a record deleted in place. It is still in the file. */
    const deleted = u8[base] === 0x2a;
    let offset = base + 1;
    const row = {};
    for (const field of fields) {
      const raw = latin1(offset, field.length).trim();
      offset += field.length;
      row[field.name] = decodeValue(raw, field, decodeText);
    }
    if (!deleted) rows.push(row);
  }

  return { fields: Object.freeze(fields), rows, recordCount };
}

function decodeValue(raw, field, decodeText) {
  if (raw === '') return null;
  switch (field.type) {
    case TYPE.NUMERIC:
    case TYPE.FLOAT: {
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    }
    case TYPE.LOGICAL:
      return /^[YyTt]$/.test(raw) ? true : /^[NnFf]$/.test(raw) ? false : null;
    case TYPE.DATE: {
      /* YYYYMMDD, which is a date and not a timestamp — keep it as one. */
      const m = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
      return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
    }
    default:
      return decodeText ? decodeText(raw, field) : raw;
  }
}
