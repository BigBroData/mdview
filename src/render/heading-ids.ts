import type { MarkdownIt, StateCore, Token } from "markdown-it";

/**
 * Gives every heading an `id` so `[text](#section)` links have a target.
 * Slugs follow GitHub: lower-case, punctuation dropped, spaces become hyphens,
 * letters of any script are kept, repeated titles get `-1`, `-2`, ...
 */
export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** Plain text of an inline token's children (what the reader sees). */
function textOf(token: Token | undefined): string {
  if (!token?.children) return "";
  let out = "";
  for (const child of token.children) {
    if (child.type === "text" || child.type === "code_inline") out += child.content;
    else if (child.type === "softbreak" || child.type === "hardbreak") out += " ";
  }
  return out;
}

export function headingIdsPlugin(md: MarkdownIt): void {
  md.core.ruler.push("heading_ids", (state: StateCore) => {
    const used = new Map<string, number>();
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token?.type !== "heading_open") continue;
      const base = slugify(textOf(tokens[i + 1]));
      if (base === "") continue;
      const seen = used.get(base) ?? 0;
      used.set(base, seen + 1);
      token.attrSet("id", seen === 0 ? base : `${base}-${seen}`);
    }
    return true;
  });
}
