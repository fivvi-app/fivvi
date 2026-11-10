/**
 * Reads one UTF-8 CSV text (RFC 4180) into rows of cells: a comma between cells, a line feed or
 * CRLF between rows, `"` around a cell that holds a comma, a quote (doubled) or a line break.
 * A byte order mark at the start is dropped. Every row has the cells it has; nothing is trimmed.
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let started = false; // whether the current row has any content yet

  for (let at = 0; at < source.length; at++) {
    const char = source[at];
    if (quoted) {
      if (char === '"' && source[at + 1] === '"') {
        cell += '"';
        at++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
      started = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
      started = true;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[at + 1] === '\n') at++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      started = false;
    } else {
      cell += char;
      started = true;
    }
  }
  if (quoted) throw new Error('The CSV has an unclosed quote.');
  if (started) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
