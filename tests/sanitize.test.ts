import { describe, expect, test } from "bun:test";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { renderMarkdown } from "../src/render/markdown.ts";
import { cleanClass, cleanStyle, createHtmlSanitizer } from "../src/render/sanitize.ts";

const NL = String.fromCharCode(10);
const purify = createDOMPurify(new JSDOM("").window as unknown as Window & typeof globalThis);
const sanitize = createHtmlSanitizer(purify);
const render = (source: string, assetBase = "mdasset://localhost") =>
  renderMarkdown(source, { assetBase, sanitize });

describe("cleanStyle", () => {
  test("keeps ordinary declarations", () => {
    expect(cleanStyle("color: red; height: 0.6em")).toBe("color: red;height: 0.6em");
  });

  test("drops what could cover the application or load a URL", () => {
    expect(cleanStyle("position: fixed; color: red")).toBe("color: red");
    expect(cleanStyle("z-index: 99999")).toBe("");
    expect(cleanStyle("background: url(https://tracker.example/x.png)")).toBe("");
    expect(cleanStyle("background: u\\72l(x)")).toBe("");
    expect(cleanStyle("width: expression(alert(1))")).toBe("");
    expect(cleanStyle("garbage; : nothing")).toBe("");
  });
});

describe("cleanClass", () => {
  test("drops the application's own class names, keeps the rest", () => {
    expect(cleanClass("modal")).toBe("");
    expect(cleanClass("a tabs b")).toBe("a b");
    expect(cleanClass("tab__dirty status-bar editor__host")).toBe("");
    expect(cleanClass("hljs-keyword katex mord table-wrap mermaid-block")).toBe(
      "hljs-keyword katex mord table-wrap mermaid-block",
    );
    expect(cleanClass("table tabular")).toBe("table tabular");
  });

  test("applies in a rendered page", () => {
    const html = render(`<div class="modal big">x</div>${NL}${NL}<p class="tabs">y</p>`);
    expect(html).not.toContain("modal");
    expect(html).not.toContain("tabs");
    expect(html).toContain('class="big"');
  });
});

describe("raw HTML in a document", () => {
  test("without a sanitizer it stays visible as text", () => {
    const html = renderMarkdown("a <b>bold</b> word");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });

  test("everyday tags work", () => {
    const html = render(
      '<p align="center"><img src="logo.png" width="80"></p>\n\nPress <kbd>Ctrl</kbd>+<kbd>S</kbd><br>H<sub>2</sub>O\n\n<details><summary>More</summary>\n\nInside\n\n</details>\n',
    );
    expect(html).toContain('<p align="center">');
    expect(html).toContain('src="mdasset://localhost/logo.png"');
    expect(html).toContain("<kbd>Ctrl</kbd>");
    expect(html).toContain("<sub>2</sub>");
    expect(html).toContain("<summary>More</summary>");
  });

  test("scripts, event handlers and script addresses are removed", () => {
    const html = render(
      [
        "<script>alert(1)</script>",
        '<img src="x.png" onerror="alert(1)">',
        '<a href="javascript:alert(1)">click</a>',
        '<svg onload="alert(1)"><circle r="4"/></svg>',
        '<div onclick="alert(1)">div</div>',
      ].join("\n\n"),
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("onload");
    expect(html).not.toContain("onclick");
    expect(html).toContain("click");
    expect(html).toContain("div");
  });

  test("nothing that restyles the application or reaches out remains", () => {
    const html = render(
      [
        "<style>body{display:none}</style>",
        '<link rel="stylesheet" href="https://x.example/a.css">',
        '<iframe src="https://x.example"></iframe>',
        '<form action="https://x.example"><input type="text" name="q"><button>Go</button></form>',
        '<video src="a.mp4"></video>',
        '<div style="position:fixed;top:0;left:0;width:100%;height:100%;color:red">cover</div>',
      ].join("\n\n"),
    );
    for (const tag of ["<style", "<link", "<iframe", "<form", "<input", "<button", "<video"]) {
      expect(html).not.toContain(tag);
    }
    expect(html).not.toContain("position");
    expect(html).toContain("color:red");
    expect(html).toContain("cover");
  });

  test("comments disappear", () => {
    expect(render("<!-- note to self -->\n\ntext")).not.toContain("note to self");
  });

  test("task list check boxes and Markdown images of the document survive", () => {
    const html = render("- [x] done\n- [ ] todo\n\n![pic](img/a.png)\n\n<br>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("disabled");
    expect(html).toContain('src="mdasset://localhost/img/a.png"');
  });

  test("other inputs are removed, check boxes are made inert", () => {
    const html = render('<input type="checkbox" checked> <input type="radio"> <input>');
    expect(html.match(/<input/g)?.length).toBe(1);
    expect(html).toContain("disabled");
  });

  test("formulas pass through intact", () => {
    const plain = renderMarkdown("Inline $E = mc^2$ and\n\n$$\\int_0^1 x\\,dx$$\n");
    const mixed = render("Inline $E = mc^2$ and\n\n$$\\int_0^1 x\\,dx$$\n\n<br>");
    expect(mixed).toContain('class="katex"');
    expect(mixed).toContain('class="katex-display"');
    expect(mixed).not.toContain("katex-error");
    expect(mixed.match(/<span/g)?.length).toBe(plain.match(/<span/g)?.length);
    expect(mixed).toContain("height:");
  });

  test("code blocks and tables keep their markup", () => {
    const html = render("```ts\nconst a = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<br>");
    expect(html).toContain('class="hljs-keyword"');
    expect(html).toContain('<div class="table-wrap"><table>');
  });

  test("MDX is never given raw HTML", () => {
    const html = renderMarkdown("<script>alert(1)</script>\n", { mdx: true, sanitize });
    expect(html).not.toContain("<script");
  });

  test("a page without raw HTML is not touched", () => {
    const calls: string[] = [];
    renderMarkdown("# Title\n\ntext", {
      sanitize: (html) => {
        calls.push(html);
        return html;
      },
    });
    expect(calls).toEqual([]);
  });
});
