import type { MarkdownIt, StateBlock, StateInline } from "markdown-it";

/**
 * MDX is Markdown plus `import`/`export` lines and JSX tags. A viewer cannot
 * run components, so it shows what it can: the Markdown renders normally,
 * module lines appear as a muted code block, and JSX tags as quiet chips that
 * keep their place in the text (children between the tags still render).
 */

const MAX_TAG_LENGTH = 4000;

/**
 * Where the JSX tag starting at `start` (a `<`) ends, exclusive, or -1.
 * Handles quoted attribute values, `{expressions}` and tags that span lines.
 * `<https://x>` autolinks and comparisons like `a < b` are not tags.
 */
export function scanJsxTag(src: string, start: number): number {
  if (src[start] !== "<") return -1;
  let i = start + 1;
  if (src[i] === "/") i++;
  if (src[i] === ">") return i + 1; // fragment <> or </>
  if (!/[A-Za-z]/.test(src[i] ?? "")) return -1;
  while (i < src.length && /[\w.-]/.test(src[i] ?? "")) i++;
  const next = src[i];
  if (next !== undefined && !/[\s/>]/.test(next)) return -1;

  const limit = Math.min(src.length, start + MAX_TAG_LENGTH);
  let quote = "";
  let depth = 0;
  for (; i < limit; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth = Math.max(0, depth - 1);
    } else if (ch === ">" && depth === 0) {
      return i + 1;
    } else if (ch === "\n" && depth === 0 && src[i + 1] === "\n") {
      return -1; // a blank line ends the paragraph: not a tag after all
    }
  }
  return -1;
}

function esmBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if ((state.sCount[startLine] ?? 0) - state.blkIndent >= 4) return false;
  const start = (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0);
  if ((state.tShift[startLine] ?? 0) !== 0) return false;
  if (!/^(import|export)[\s{*]/.test(state.src.slice(start, start + 8))) return false;
  if (silent) return true;
  let line = startLine + 1;
  while (line < endLine && !state.isEmpty(line)) line++;
  const token = state.push("mdx_esm", "", 0);
  token.content = state.getLines(startLine, line, 0, false);
  token.map = [startLine, line];
  state.line = line;
  return true;
}

/** A line that holds nothing but JSX tags (`<Callout type="info">`, `</Callout>`, `<Chart />`). */
function jsxBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if ((state.sCount[startLine] ?? 0) - state.blkIndent >= 4) return false;
  const start = (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0);
  const { src } = state;
  let pos = start;
  let end = scanJsxTag(src, pos);
  if (end === -1) return false;
  for (;;) {
    pos = end;
    while (src[pos] === " " || src[pos] === "\t") pos++;
    if (pos >= src.length || src[pos] === "\n") break;
    end = scanJsxTag(src, pos);
    if (end === -1) return false; // text follows the tag: let the paragraph handle it
  }
  if (silent) return true;
  let line = startLine;
  while (line < endLine && (state.eMarks[line] ?? 0) < pos) line++;
  const token = state.push("mdx_jsx", "", 0);
  token.content = src.slice(start, Math.min(pos, src.length)).trimEnd();
  token.map = [startLine, line + 1];
  state.line = line + 1;
  return true;
}

/** A tag in the middle of a paragraph. */
function jsxInline(state: StateInline, silent: boolean): boolean {
  const end = scanJsxTag(state.src, state.pos);
  if (end === -1 || end > state.posMax) return false;
  if (!silent) {
    const token = state.push("mdx_jsx_inline", "", 0);
    token.content = state.src.slice(state.pos, end);
  }
  state.pos = end;
  return true;
}

export function mdxPlugin(md: MarkdownIt): void {
  const { escapeHtml } = md.utils;
  md.block.ruler.before("paragraph", "mdx_esm", esmBlock);
  md.block.ruler.before("paragraph", "mdx_jsx", jsxBlock);
  md.inline.ruler.before("text", "mdx_jsx_inline", jsxInline);
  md.renderer.rules.mdx_esm = (tokens, idx) => {
    const code = tokens[idx]?.content ?? "";
    const highlighted = md.options.highlight?.(code, "js", "") ?? "";
    return `<pre class="mdx-esm"><code class="language-js">${highlighted || escapeHtml(code)}</code></pre>\n`;
  };
  md.renderer.rules.mdx_jsx = (tokens, idx) =>
    `<div class="mdx-tag mdx-tag--block">${escapeHtml(tokens[idx]?.content ?? "")}</div>\n`;
  md.renderer.rules.mdx_jsx_inline = (tokens, idx) =>
    `<span class="mdx-tag">${escapeHtml(tokens[idx]?.content ?? "")}</span>`;
}
