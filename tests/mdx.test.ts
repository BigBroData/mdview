import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../src/render/markdown.ts";
import { scanJsxTag } from "../src/render/mdx.ts";

const mdx = (source: string) => renderMarkdown(source, { mdx: true });

describe("scanJsxTag", () => {
  test("finds the end of simple, self-closing, closing and fragment tags", () => {
    expect(scanJsxTag("<Foo>", 0)).toBe(5);
    expect(scanJsxTag("<Foo />x", 0)).toBe(7);
    expect(scanJsxTag("</Foo>", 0)).toBe(6);
    expect(scanJsxTag("<>", 0)).toBe(2);
    expect(scanJsxTag("</>", 0)).toBe(3);
    expect(scanJsxTag("<a.b-c>", 0)).toBe(7);
  });

  test("quotes and braces may contain a greater-than sign", () => {
    const tag = '<Foo a="x > y" b={1 > 0 ? "<" : ">"} c=\'>\'>';
    expect(scanJsxTag(tag, 0)).toBe(tag.length);
  });

  test("a tag may span lines", () => {
    const tag = '<Chart\n  data={[1, 2]}\n  title="T"\n/>';
    expect(scanJsxTag(tag, 0)).toBe(tag.length);
  });

  test("autolinks, comparisons and unterminated tags are not tags", () => {
    expect(scanJsxTag("<https://example.com>", 0)).toBe(-1);
    expect(scanJsxTag("<a@b.c>", 0)).toBe(-1);
    expect(scanJsxTag("< b", 0)).toBe(-1);
    expect(scanJsxTag("<Foo bar\n\nnext paragraph>", 0)).toBe(-1);
    expect(scanJsxTag("<Foo", 0)).toBe(-1);
  });
});

describe("MDX rendering", () => {
  test("import and export lines become a module block", () => {
    const html = mdx("import { Chart } from './chart'\nexport const meta = { a: 1 }\n\n# Title\n");
    expect(html).toContain('<pre class="mdx-esm">');
    expect(html).toContain("Chart");
    expect(html).toContain('<h1 id="title">');
    expect(html).not.toContain("<p>import");
  });

  test("a line of JSX tags becomes a chip; children still render as Markdown", () => {
    const html = mdx('<Callout type="info">\n\nSome **bold** text\n\n</Callout>\n');
    expect(html).toContain(
      '<div class="mdx-tag mdx-tag--block">&lt;Callout type=&quot;info&quot;&gt;</div>',
    );
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('<div class="mdx-tag mdx-tag--block">&lt;/Callout&gt;</div>');
  });

  test("a multi-line tag is one chip", () => {
    const html = mdx("<Chart\n  data={[1, 2]}\n/>\n\nafter\n");
    expect(html.match(/mdx-tag--block/g)?.length).toBe(1);
    expect(html).toContain("<p>after</p>");
  });

  test("a tag inside a paragraph is an inline chip and the text stays", () => {
    const html = mdx('Hello <Badge text="new" /> world, and <b>bold</b> too.\n');
    expect(html).toContain('<span class="mdx-tag">&lt;Badge text=&quot;new&quot; /&gt;</span>');
    expect(html).toContain("Hello ");
    expect(html).toContain(" world, and ");
    expect(html).toContain(
      '<span class="mdx-tag">&lt;b&gt;</span>bold<span class="mdx-tag">&lt;/b&gt;</span>',
    );
  });

  test("a tag followed by text on the same line stays in the paragraph", () => {
    const html = mdx("<Note>Remember **this**\n");
    expect(html).toContain("<p>");
    expect(html).toContain("<strong>this</strong>");
  });

  test("autolinks and code are untouched", () => {
    const html = mdx("<https://example.com>\n\n```\nimport x from 'y'\n<Foo />\n```\n");
    expect(html).toContain('<a href="https://example.com">');
    expect(html).toContain("<pre><code>");
    expect(html).not.toContain("mdx-");
  });

  test("plain Markdown mode does not treat them specially", () => {
    const html = renderMarkdown("import x from 'y'\n\n<Foo />\n");
    expect(html).not.toContain("mdx-");
    expect(html).toContain("&lt;Foo /&gt;");
  });
});

describe("front matter", () => {
  test("a YAML header at the top is a quiet block, not a rule and a heading", () => {
    const html = renderMarkdown("---\ntitle: Hello\ntags: [a, b]\n---\n\n# Body\n");
    expect(html).toContain('<pre class="front-matter">');
    expect(html).toContain("title: Hello");
    expect(html).not.toContain("<hr>");
    expect(html).toContain('<h1 id="body">');
  });

  test("a rule at the top that is not YAML stays a rule", () => {
    const html = renderMarkdown("---\n\nSome text\n\n---\n");
    expect(html).toContain("<hr>");
    expect(html).not.toContain("front-matter");
  });

  test("an unterminated header is not front matter", () => {
    expect(renderMarkdown("---\ntitle: x\n\ntext\n")).not.toContain("front-matter");
  });

  test("works in MDX as well", () => {
    expect(mdx("---\ntitle: x\n---\n\nHi\n")).toContain("front-matter");
  });
});
