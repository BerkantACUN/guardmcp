import { describe, expect, it } from 'vitest';
import { LineSplitter } from '../../../src/proxy/line-splitter.js';

describe('LineSplitter', () => {
  it('returns each complete line and holds the partial one until its newline arrives', () => {
    const splitter = new LineSplitter();
    expect(splitter.push(Buffer.from('{"a":1}\n{"b"'))).toEqual(['{"a":1}']);
    expect(splitter.push(Buffer.from(':2}\n'))).toEqual(['{"b":2}']);
  });

  it('reassembles a multi-byte character split across chunks', () => {
    const bytes = Buffer.from('"ğü"\n', 'utf8');
    const splitter = new LineSplitter();
    expect(splitter.push(bytes.subarray(0, 2))).toEqual([]);
    expect(splitter.push(bytes.subarray(2))).toEqual(['"ğü"']);
  });

  it('strips a CRLF terminator and skips blank lines', () => {
    const splitter = new LineSplitter();
    expect(splitter.push('{"a":1}\r\n\n  \n{"b":2}\n')).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('hands back an unterminated trailing line on flush', () => {
    const splitter = new LineSplitter();
    splitter.push('{"a":1}\n{"tail":true}');
    expect(splitter.flush()).toEqual(['{"tail":true}']);
    expect(splitter.flush()).toEqual([]);
  });

  it('drops a line that exceeds the limit instead of buffering it forever', () => {
    const overflowed: string[] = [];
    const splitter = new LineSplitter(8, (partial) => overflowed.push(partial));
    expect(splitter.push('0123456789')).toEqual([]);
    expect(overflowed).toEqual(['0123456789']);
    expect(splitter.push('{"a":1}\n')).toEqual(['{"a":1}']);
  });
});
