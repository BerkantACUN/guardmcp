import { describe, expect, it } from 'vitest';
import { listAllPages, MAX_LIST_PAGES } from '../../../src/live/introspect.js';

describe('listAllPages', () => {
  it('returns a single page as is', async () => {
    expect(await listAllPages('x/list', async () => ({ items: [1, 2] }))).toEqual([1, 2]);
  });

  it('passes each cursor back and concatenates the pages in order', async () => {
    const cursors: (string | undefined)[] = [];
    const items = await listAllPages('x/list', async (cursor) => {
      cursors.push(cursor);
      const n = cursor === undefined ? 0 : Number(cursor);
      return { items: [n], ...(n < 2 ? { nextCursor: String(n + 1) } : {}) };
    });
    expect(items).toEqual([0, 1, 2]);
    expect(cursors).toEqual([undefined, '1', '2']);
  });

  it('stops at a repeated cursor', async () => {
    let calls = 0;
    await expect(
      listAllPages('x/list', async () => {
        calls++;
        return { items: [calls], nextCursor: calls % 2 ? 'a' : 'b' };
      }),
    ).rejects.toThrow(/already returned/);
    expect(calls).toBe(3);
  });

  it('stops after the page limit even when every cursor is new', async () => {
    let calls = 0;
    await expect(
      listAllPages('x/list', async () => {
        calls++;
        return { items: [], nextCursor: `c${calls}` };
      }),
    ).rejects.toThrow(new RegExp(`after ${MAX_LIST_PAGES}`));
    expect(calls).toBe(MAX_LIST_PAGES);
  });
});
