/**
 * Minimal RFC 4180 CSV parser for the enterprise registration import
 * (app/login/register_enterprise). No dependency: handles quoted fields, escaped
 * quotes (""), commas and line breaks inside quotes, CRLF / LF, and a UTF-8 BOM.
 * Browser-safe (no Node imports).
 */

export interface CsvRecord {
  /** 1-based line number in the file where this record starts (header is line 1). */
  line: number;
  values: string[];
}

export function parseCsv(text: string): CsvRecord[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;
  let fieldWasQuoted = false;

  const endField = () => {
    row.push(fieldWasQuoted ? field : field.trim());
    field = '';
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    // Skip blank lines (a single empty unquoted field).
    if (!(row.length === 1 && row[0] === '')) records.push({ line: rowStartLine, values: row });
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === '') {
      inQuotes = true;
      fieldWasQuoted = true;
      field = '';
    } else if (ch === ',') {
      endField();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRow();
      line++;
      rowStartLine = line;
    } else if (fieldWasQuoted && (ch === ' ' || ch === '\t')) {
      // whitespace between a closing quote and the delimiter
    } else {
      field += ch;
    }
  }
  if (inQuotes) {
    throw new Error(`unterminated quoted field starting on line ${rowStartLine}`);
  }
  if (field !== '' || fieldWasQuoted || row.length > 0) endRow();
  return records;
}
