import {
  findNodeAtLocation,
  getNodeValue,
  type JSONPath,
  type Node,
  parse,
  parseTree,
} from 'jsonc-parser';

export interface SourceRange {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface JsoncDocument {
  /** Deserialized value, same shape `JSON.parse` would give you (comments/trailing commas stripped). */
  getValue(): unknown;
  /** Line/column of the node at `path`, or undefined if the path doesn't resolve. 1-indexed. */
  locate(path: JSONPath): SourceRange | undefined;
}

export function parseJsoncDocument(text: string): JsoncDocument {
  const root = parseTree(text);
  const lineStarts = buildLineStarts(text);

  return {
    getValue(): unknown {
      // `parse` (not `JSON.parse`) so JSONC comments/trailing commas — legal
      // in VS Code's mcp.json — don't blow up parsing.
      return parse(text);
    },
    locate(path: JSONPath): SourceRange | undefined {
      if (!root) return undefined;
      const node = findNodeAtLocation(root, path);
      if (!node) return undefined;
      return nodeToRange(node, lineStarts);
    },
  };
}

function nodeToRange(node: Node, lineStarts: readonly number[]): SourceRange {
  const start = offsetToPosition(lineStarts, node.offset);
  const end = offsetToPosition(lineStarts, node.offset + node.length);
  return { line: start.line, column: start.column, endLine: end.line, endColumn: end.column };
}

/** Offsets of every line start (index 0 = offset of line 1), for O(log n) offset→line/col lookups. */
function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function offsetToPosition(
  lineStarts: readonly number[],
  offset: number,
): { line: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    // biome-ignore lint/style/noNonNullAssertion: mid is always < lineStarts.length by construction
    if (lineStarts[mid]! <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  // biome-ignore lint/style/noNonNullAssertion: lo is a valid index into lineStarts
  return { line: lo + 1, column: offset - lineStarts[lo]! + 1 };
}

/** Re-exported so callers who already have a `getNodeValue`-shaped need don't have to import jsonc-parser directly. */
export { getNodeValue };
