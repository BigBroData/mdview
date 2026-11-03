/**
 * Pure helpers of the editor: line endings and keeping the preview beside the
 * line being written. No DOM and no CodeMirror here, so tests need neither.
 */
export type Eol = "\n" | "\r\n";

/** The editor works with "\n" only; the file's own line ending is put back on save. */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** CRLF when the file's first line break is one, else LF. */
export function detectEol(text: string): Eol {
  const first = /\r\n|\n|\r/.exec(text)?.[0];
  return first === "\r\n" ? "\r\n" : "\n";
}

export function withEol(text: string, eol: Eol): string {
  return eol === "\n" ? text : text.replace(/\n/g, "\r\n");
}

/** A rendered top-level block: its first source line and its offset in the preview. */
export interface Block {
  line: number;
  top: number;
}

/**
 * Preview scroll position that shows the same place as the editor does.
 * `topLine` is the editor's first visible line (fractional: part of the way
 * through that line). `end` is a sentinel for the end of the document (the
 * number of source lines and the height of the preview). Between two blocks
 * the position is interpolated, so the preview glides instead of jumping.
 */
export function previewScrollTop(blocks: readonly Block[], topLine: number, end: Block): number {
  const first = blocks[0];
  if (!first || topLine <= first.line) return 0;
  let index = 0;
  for (let i = 0; i < blocks.length; i++) {
    if ((blocks[i]?.line ?? Number.POSITIVE_INFINITY) <= topLine) index = i;
    else break;
  }
  const from = blocks[index] ?? first;
  const to = blocks[index + 1] ?? end;
  const span = to.line - from.line;
  if (span <= 0) return from.top;
  const fraction = Math.min(1, Math.max(0, (topLine - from.line) / span));
  return from.top + (to.top - from.top) * fraction;
}

/**
 * The inverse of `previewScrollTop`: the source line (fractional) that stands at the top of
 * the preview when it is scrolled to `scrollTop`; the editor scrolls there when the reader
 * moves the preview by hand. Above the first block it is the first line, past the end of the
 * last block it runs on to `end`.
 */
export function editorLineAt(blocks: readonly Block[], scrollTop: number, end: Block): number {
  const first = blocks[0];
  if (!first || scrollTop <= first.top) return 0;
  if (scrollTop >= end.top) return end.line;
  let index = 0;
  for (let i = 0; i < blocks.length; i++) {
    if ((blocks[i]?.top ?? Number.POSITIVE_INFINITY) <= scrollTop) index = i;
    else break;
  }
  const from = blocks[index] ?? first;
  const to = blocks[index + 1] ?? end;
  const span = to.top - from.top;
  if (span <= 0) return from.line;
  const fraction = Math.min(1, Math.max(0, (scrollTop - from.top) / span));
  return from.line + (to.line - from.line) * fraction;
}
