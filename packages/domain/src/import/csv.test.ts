import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.ts';

describe('E015 reading a CSV', () => {
  it('splits rows and cells, with or without a final line break and with CRLF', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('reads quoted cells with commas, doubled quotes and line breaks', () => {
    expect(parseCsv('a,"b,c","d""e","f\ng"\n')).toEqual([['a', 'b,c', 'd"e', 'f\ng']]);
  });

  it('keeps empty cells and drops the byte order mark', () => {
    expect(parseCsv('﻿a,,c\n,,\n')).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ]);
  });

  it('gives no rows for an empty text', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('refuses a quote that is never closed', () => {
    expect(() => parseCsv('a,"b\n')).toThrow('unclosed quote');
  });
});
