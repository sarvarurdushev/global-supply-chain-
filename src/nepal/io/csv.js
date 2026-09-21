/**
 * CSV reader with the traps this project's sources actually contain.
 *
 * OCHA's `PGA_AffectedDistricts_POP.csv` writes population as `"275,903"` —
 * quoted, with a thousands separator. `Number("275,903")` is `NaN` and
 * `parseInt` gives `275`, so a careless read turns a district of 275,903
 * people into 275 and the error survives every downstream sum looking
 * plausible. `parseNumber` refuses to guess: it returns `null` and reports
 * why, so the quality log records it instead of the analysis absorbing it.
 */

/**
 * Parse delimited text into rows of objects.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {string} [options.delimiter]
 * @returns {{header: string[], rows: Array<Record<string,string|null>>}}
 */
export function parseCsv(text, { delimiter = ',' } = {}) {
  const records = parseRecords(String(text ?? ''), delimiter);
  if (records.length === 0) return { header: [], rows: [] };
  const header = records[0].map((name) => name.trim());
  const rows = [];
  for (let i = 1; i < records.length; i += 1) {
    const cells = records[i];
    /* A trailing newline yields one empty cell; that is not a record. */
    if (cells.length === 1 && cells[0].trim() === '') continue;
    const row = {};
    for (let c = 0; c < header.length; c += 1) {
      const value = cells[c];
      row[header[c]] = value === undefined || value === '' ? null : value;
    }
    rows.push(row);
  }
  return { header, rows };
}

/** RFC 4180 state machine: quotes, doubled quotes, embedded delimiters. */
function parseRecords(text, delimiter) {
  const records = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    records.push(row);
  }
  return records;
}

/**
 * Read a number from a source cell, or explain why it is not one.
 *
 * @returns {{value: number|null, repaired: boolean, reason: string|null}}
 */
export function parseNumber(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { value: null, repaired: false, reason: 'empty' };
  }
  const text = String(raw).trim();
  const direct = Number(text);
  if (Number.isFinite(direct))
    return { value: direct, repaired: false, reason: null };

  /*
   * Only one repair is allowed, and only when it is unambiguous: digit groups
   * separated by commas in the thousands pattern. "1,5" is not repaired to 15
   * — in much of the world that is one and a half.
   */
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
    const value = Number(text.replace(/,/g, ''));
    if (Number.isFinite(value)) {
      return { value, repaired: true, reason: 'thousands separator removed' };
    }
  }
  return { value: null, repaired: false, reason: `not a number: ${text}` };
}
