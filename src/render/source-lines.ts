import type { Env, MarkdownIt, StateCore } from "markdown-it";

/**
 * With `env.sourceLines` set, every top-level block carries `data-line="N"`
 * (N = its first line in the source, counted from 0). The editor uses it to
 * keep the preview beside the line being written. Off by default, so the
 * viewer's HTML is unchanged.
 */
export interface SourceLinesEnv extends Env {
  sourceLines?: boolean;
}

export function sourceLinesPlugin(md: MarkdownIt): void {
  md.core.ruler.push("source_lines", (state: StateCore) => {
    if (!(state.env as SourceLinesEnv).sourceLines) return true;
    for (const token of state.tokens) {
      if (token.level === 0 && token.nesting !== -1 && token.map) {
        token.attrSet("data-line", String(token.map[0]));
      }
    }
    return true;
  });
}
