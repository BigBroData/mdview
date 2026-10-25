import type { MarkdownIt, StateCore, Token } from "markdown-it";

/**
 * Gives table columns a hint about their content so CSS can lay them out
 * sensibly: a column of short values (years, ids) must not wrap, and a column
 * of prose must not be squeezed to one word per line when the table is wide.
 *
 * Column classes, by the longest cell text in that column:
 *   col-short  ≤ SHORT_MAX characters   → white-space: nowrap
 *   col-prose  ≥ PROSE_MIN characters   → a minimum width
 *   col-long   ≥ LONG_MIN characters    → a larger minimum width
 */
export const SHORT_MAX = 16;
export const PROSE_MIN = 80;
export const LONG_MIN = 300;

export function columnClass(maxLength: number): string | null {
  if (maxLength <= SHORT_MAX) return "col-short";
  if (maxLength >= LONG_MIN) return "col-long";
  if (maxLength >= PROSE_MIN) return "col-prose";
  return null;
}

function cellText(inline: Token | undefined): string {
  return inline?.type === "inline" ? inline.content.trim() : "";
}

export function tableColumnsPlugin(md: MarkdownIt): void {
  md.core.ruler.after("inline", "table_columns", (state: StateCore) => {
    const tokens = state.tokens;
    let i = 0;
    while (i < tokens.length) {
      if (tokens[i]?.type !== "table_open") {
        i++;
        continue;
      }
      const start = i;
      let end = i + 1;
      while (end < tokens.length && tokens[end]?.type !== "table_close") end++;

      // First pass: longest text per column. A row with text in only one
      // cell is a "spill" row (GFM turns a wrapped line under a table into
      // a row with one cell); it says nothing about the column and is skipped.
      const longest: number[] = [];
      const rows: number[][] = [];
      let row: number[] | null = null;
      for (let j = start; j < end; j++) {
        const token = tokens[j];
        if (!token) continue;
        if (token.type === "tr_open") {
          row = [];
          rows.push(row);
        }
        if (row && (token.type === "th_open" || token.type === "td_open")) {
          row.push(cellText(tokens[j + 1]).length);
        }
      }
      const isSpill = (lengths: number[]) =>
        lengths.length > 1 && lengths.filter((n) => n > 0).length === 1;
      for (const lengths of rows) {
        if (isSpill(lengths)) continue;
        lengths.forEach((n, c) => {
          longest[c] = Math.max(longest[c] ?? 0, n);
        });
      }

      // Second pass: tag cells. Spill rows are left untagged so their one
      // long cell is free to wrap.
      let column = -1;
      let rowIndex = -1;
      for (let j = start; j < end; j++) {
        const token = tokens[j];
        if (!token) continue;
        if (token.type === "tr_open") {
          column = -1;
          rowIndex++;
        }
        if (token.type === "th_open" || token.type === "td_open") {
          column++;
          const lengths = rows[rowIndex];
          if (lengths && isSpill(lengths)) continue;
          const cls = columnClass(longest[column] ?? 0);
          if (cls) token.attrJoin("class", cls);
        }
      }
      i = end + 1;
    }
    return true;
  });
}
