import type { MarkdownIt, StateBlock } from "markdown-it";

/**
 * YAML front matter (`---` ... `---` at the very top) is metadata, not
 * content: it is shown as a quiet block instead of a rule and a heading.
 */
function frontMatter(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  if (startLine !== 0 || state.blkIndent !== 0) return false;
  const first = state.src.slice(state.bMarks[0] ?? 0, state.eMarks[0] ?? 0);
  if (first.trimEnd() !== "---") return false;
  // Must look like YAML, otherwise "---" is just a rule.
  const second =
    startLine + 1 < endLine ? state.src.slice(state.bMarks[1] ?? 0, state.eMarks[1] ?? 0) : "";
  if (!/^[\w-]+\s*:/.test(second)) return false;
  let line = 2;
  for (; line < endLine; line++) {
    const text = state.src.slice(state.bMarks[line] ?? 0, state.eMarks[line] ?? 0).trimEnd();
    if (text === "---" || text === "...") break;
  }
  if (line >= endLine) return false;
  if (silent) return true;
  const token = state.push("front_matter", "", 0);
  token.content = state.getLines(1, line, 0, false);
  token.map = [0, line + 1];
  state.line = line + 1;
  return true;
}

export function frontMatterPlugin(md: MarkdownIt): void {
  md.block.ruler.before("hr", "front_matter", frontMatter);
  md.renderer.rules.front_matter = (tokens, idx) =>
    `<pre class="front-matter"><code>${md.utils.escapeHtml(tokens[idx]?.content ?? "")}</code></pre>\n`;
}
