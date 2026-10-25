import type { MarkdownIt, StateCore, Token } from "markdown-it";

/**
 * GitHub-style task lists: a list item starting with `[ ]` or `[x]` becomes
 * a list item with a disabled checkbox. Implemented as a core rule so it
 * composes with any other plugin.
 */
const TASK_RE = /^\[([ xX])\]\s+/;

export function taskListsPlugin(md: MarkdownIt): void {
  md.core.ruler.after("inline", "task_lists", (state: StateCore) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token?.type !== "inline") continue;
      // Structure of a list item: list_item_open, paragraph_open, inline, ...
      const paragraph = tokens[i - 1];
      const listItem = tokens[i - 2];
      if (!paragraph || !listItem) continue;
      if (paragraph.type !== "paragraph_open" || listItem.type !== "list_item_open") continue;

      const first = token.children?.[0];
      if (first?.type !== "text") continue;
      const match = TASK_RE.exec(first.content);
      if (!match) continue;

      first.content = first.content.slice(match[0].length);
      const checked = match[1] !== " ";
      const checkbox = new state.Token("html_inline", "", 0);
      checkbox.content = `<input type="checkbox" class="task-checkbox" disabled${checked ? " checked" : ""}> `;
      token.children?.unshift(checkbox);
      listItem.attrJoin("class", checked ? "task-item task-item--done" : "task-item");
    }
    return true;
  });
}

export type { Token };
