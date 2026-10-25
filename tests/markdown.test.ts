import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { isRelativeAsset, rewriteAssetUrl } from "../src/render/asset-urls.ts";
import { renderMarkdown, stripBom } from "../src/render/markdown.ts";

const fixture = await Bun.file(join(import.meta.dir, "fixtures", "basic.md")).text();
const html = renderMarkdown(fixture, { assetBase: "/assets" });

describe("renderMarkdown on the fixture", () => {
  test("headings and GFM tables", () => {
    expect(html).toContain("<h1>Fixture</h1>");
    expect(html).toContain('<div class="table-wrap"><table>');
    expect(html).toContain("</table></div>");
    expect(html).toContain('<th class="col-short">a</th>');
  });

  test("inline and display math via KaTeX", () => {
    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
    expect(html).toContain('encoding="application/x-tex">E = mc^2</annotation>');
    expect(html).not.toContain("katex-error");
  });

  test("task lists become disabled checkboxes", () => {
    expect(html).toContain(
      '<li class="task-item task-item--done"><input type="checkbox" class="task-checkbox" disabled checked> done</li>',
    );
    expect(html).toContain(
      '<li class="task-item"><input type="checkbox" class="task-checkbox" disabled> todo</li>',
    );
    expect(html).toContain("<li>plain</li>");
    expect(html).toContain('<ol>\n<li class="task-item">');
  });

  test("code is highlighted when the language is known and escaped otherwise", () => {
    expect(html).toContain('<code class="language-python"><span class="hljs-keyword">def</span>');
    expect(html).toContain('<code class="language-unknownlang">&lt;b&gt;not html&lt;/b&gt;');
  });

  test("raw HTML is shown as text, not executed", () => {
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("strikethrough and bare URLs", () => {
    expect(html).toContain("<s>strike</s>");
    expect(html).toContain('<a href="https://example.com">https://example.com</a>');
  });

  test("relative images are routed through /assets, others untouched", () => {
    expect(html).toContain('<img src="/assets/img/a.png" alt="local">');
    expect(html).toContain('<img src="/assets/img/a%20b.png" alt="spaced">');
    expect(html).toContain('<img src="/root.png" alt="abs">');
    expect(html).toContain('<img src="https://x/y.png" alt="ext">');
    // Escaping the folder is the server's job to refuse; the renderer just forwards it.
    expect(html).toContain('<img src="/assets/../secret.png" alt="up">');
  });

  test("without assetBase image sources are left as written", () => {
    const plain = renderMarkdown("![a](./img/a.png)");
    expect(plain).toContain('<img src="./img/a.png" alt="a">');
  });
});

describe("edge cases", () => {
  test("empty document renders to empty string", () => {
    expect(renderMarkdown("")).toBe("");
  });

  test("BOM is stripped so the first heading still parses", () => {
    expect(stripBom("﻿# Hi")).toBe("# Hi");
    expect(renderMarkdown("﻿# Hi")).toBe("<h1>Hi</h1>\n");
  });

  test("broken math shows an inline error instead of throwing", () => {
    const out = renderMarkdown("$$\n\\frac{1}\n$$");
    expect(out).toContain("katex-error");
  });

  test("CRLF line endings behave like LF", () => {
    expect(renderMarkdown("# A\r\n\r\ntext\r\n")).toBe("<h1>A</h1>\n<p>text</p>\n");
  });

  test("a large document renders quickly", () => {
    const big = Array.from(
      { length: 2000 },
      (_, i) => `## Section ${i}\n\nSome *text* with $x_${i}$ and \`code\`.\n`,
    ).join("\n");
    const started = performance.now();
    const out = renderMarkdown(big);
    const ms = performance.now() - started;
    expect(out).toContain("Section 1999");
    expect(ms).toBeLessThan(2000);
  });
});

describe("asset url helpers", () => {
  test("isRelativeAsset", () => {
    expect(isRelativeAsset("img/a.png")).toBe(true);
    expect(isRelativeAsset("./img/a.png")).toBe(true);
    expect(isRelativeAsset("../a.png")).toBe(true);
    expect(isRelativeAsset("/a.png")).toBe(false);
    expect(isRelativeAsset("//cdn/a.png")).toBe(false);
    expect(isRelativeAsset("https://x/a.png")).toBe(false);
    expect(isRelativeAsset("data:image/png;base64,AAAA")).toBe(false);
    expect(isRelativeAsset("#anchor")).toBe(false);
    expect(isRelativeAsset("")).toBe(false);
  });

  test("rewriteAssetUrl encodes each segment once", () => {
    expect(rewriteAssetUrl("./img/a b.png", "/assets")).toBe("/assets/img/a%20b.png");
    expect(rewriteAssetUrl("img/a%20b.png", "/assets")).toBe("/assets/img/a%20b.png");
    expect(rewriteAssetUrl("картинка.png", "/assets")).toBe(
      "/assets/%D0%BA%D0%B0%D1%80%D1%82%D0%B8%D0%BD%D0%BA%D0%B0.png",
    );
  });
});
