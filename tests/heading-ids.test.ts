import { describe, expect, test } from "bun:test";
import { slugify } from "../src/render/heading-ids.ts";
import { renderMarkdown } from "../src/render/markdown.ts";

describe("slugify", () => {
  test("GitHub style: lower case, punctuation dropped, spaces to hyphens", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("  Install & Run  ")).toBe("install--run");
    expect(slugify("snake_case and-kebab")).toBe("snake_case-and-kebab");
  });

  test("keeps letters of any script", () => {
    expect(slugify("Паттерны Тьюринга")).toBe("паттерны-тьюринга");
    expect(slugify("日本語 3 章")).toBe("日本語-3-章");
  });

  test("nothing left means no slug", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("heading ids in rendered output", () => {
  test("every heading gets an id", () => {
    const html = renderMarkdown("# Title\n\n## Second part\n");
    expect(html).toContain('<h1 id="title">');
    expect(html).toContain('<h2 id="second-part">');
  });

  test("repeated titles are numbered like on GitHub", () => {
    const html = renderMarkdown("## Notes\n\n## Notes\n\n## Notes\n");
    expect(html).toContain('id="notes"');
    expect(html).toContain('id="notes-1"');
    expect(html).toContain('id="notes-2"');
  });

  test("formatting and code inside a heading do not leak into the id", () => {
    const html = renderMarkdown("## The **bold** `code` title\n");
    expect(html).toContain('id="the-bold-code-title"');
  });

  test("a heading without letters gets no id", () => {
    expect(renderMarkdown("## ???\n")).toContain("<h2>");
  });
});
