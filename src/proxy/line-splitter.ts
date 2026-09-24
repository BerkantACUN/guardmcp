import { StringDecoder } from 'node:string_decoder';

/**
 * The MCP stdio transport frames every JSON-RPC message as one line of UTF-8
 * terminated by `\n`. The proxy forwards the raw bytes untouched and hands a
 * copy to this splitter, so what it observes can never change what the other
 * side receives.
 *
 * A chunk boundary can fall anywhere — inside a message, inside a multi-byte
 * character — so bytes are decoded through a StringDecoder and held until
 * their newline arrives.
 */
export class LineSplitter {
  private readonly decoder = new StringDecoder('utf8');
  private pending = '';

  /**
   * @param maxLineLength A peer that never sends a newline must not grow
   * this buffer without bound. Past the limit the partial line is handed to
   * `onOverflow` and dropped — the bytes were already forwarded, only the
   * observation is lost.
   */
  constructor(
    private readonly maxLineLength = 16 * 1024 * 1024,
    private readonly onOverflow: (partial: string) => void = () => {},
  ) {}

  push(chunk: Buffer | string): string[] {
    this.pending += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
    const lines = this.pending.split('\n');
    this.pending = lines.pop() ?? '';
    if (this.pending.length > this.maxLineLength) {
      this.onOverflow(this.pending);
      this.pending = '';
    }
    return lines.map(stripCarriageReturn).filter((line) => line.trim().length > 0);
  }

  /** Whatever arrived after the last newline, once the stream has ended. */
  flush(): string[] {
    const rest = stripCarriageReturn(this.pending + this.decoder.end());
    this.pending = '';
    return rest.trim().length > 0 ? [rest] : [];
  }
}

function stripCarriageReturn(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}
