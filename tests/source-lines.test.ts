import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../src/render/markdown.ts";

const source = [
  "# Title", // 0
  "",
  "A paragraph", // 2
  "with two lines.",
  "",
  "- one", // 5
  "- two",
  "",
  "```js", // 8
  "let x = 1;",
  "```",
  "",
  "| a | b |", // 12
  "| - | - |",
  "| 1 | 2 |",
  "",
  "> quote", // 16
].join("\n");

const lines = (html: string) => [...html.matchAll(/data-line="(\d+)"/g)].map((m) => Number(m[1]));

describe("source lines", () => {
  test("off by default: the viewer's HTML carries no data-line", () => {
    expect(renderMarkdown(source)).not.toContain("data-line");
  });

  test("top-level blocks carry their first source line", () => {
    expect(lines(renderMarkdown(source, { sourceLines: true }))).toEqual([0, 2, 5, 8, 12, 16]);
  });

  test("nested blocks are not marked", () => {
    const html = renderMarkdown("- a\n  - b\n\n> q\n> > deep\n", { sourceLines: true });
    expect(lines(html)).toEqual([0, 3]);
  });

  test("the rest of the markup is unchanged", () => {
    const plain = renderMarkdown(source);
    const marked = renderMarkdown(source, { sourceLines: true }).replace(/ data-line="\d+"/g, "");
    expect(marked).toBe(plain);
  });
});
