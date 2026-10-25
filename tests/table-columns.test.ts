import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "../src/render/markdown.ts";
import { columnClass, LONG_MIN, PROSE_MIN, SHORT_MAX } from "../src/render/table-columns.ts";

describe("columnClass thresholds", () => {
  test("boundaries", () => {
    expect(columnClass(0)).toBe("col-short");
    expect(columnClass(SHORT_MAX)).toBe("col-short");
    expect(columnClass(SHORT_MAX + 1)).toBeNull();
    expect(columnClass(PROSE_MIN - 1)).toBeNull();
    expect(columnClass(PROSE_MIN)).toBe("col-prose");
    expect(columnClass(LONG_MIN - 1)).toBe("col-prose");
    expect(columnClass(LONG_MIN)).toBe("col-long");
  });
});

describe("table columns get classes by their longest cell", () => {
  const prose = "word ".repeat(30).trim(); // ~150 chars
  const long = "word ".repeat(80).trim(); // ~400 chars
  const md = [
    "| Year | Title | Summary | Notes |",
    "|---|---|---|---|",
    `| 1990 | A medium length title here | ${prose} | ${long} |`,
    `| 2021 | Short | short | short |`,
  ].join("\n");
  const html = renderMarkdown(md);

  test("header and body cells of one column share the class", () => {
    expect(html).toContain('<th class="col-short">Year</th>');
    expect(html).toContain('<td class="col-short">1990</td>');
    expect(html).toContain('<td class="col-short">2021</td>');
  });

  test("medium columns get no class", () => {
    expect(html).toContain("<th>Title</th>");
    expect(html).toContain("<td>A medium length title here</td>");
  });

  test("prose and long columns are tagged, including their short cells", () => {
    expect(html).toContain('<th class="col-prose">Summary</th>');
    expect(html).toContain('<td class="col-prose">short</td>');
    expect(html).toContain('<th class="col-long">Notes</th>');
    expect(html).toContain('<td class="col-long">short</td>');
  });

  test("two tables are measured independently", () => {
    const two = `${md}\n\n| X |\n|---|\n| ${prose} |\n`;
    const out = renderMarkdown(two);
    expect(out).toContain('<th class="col-prose">X</th>');
    expect(out).toContain('<th class="col-short">Year</th>');
  });

  test("a spill row (one filled cell) does not widen its column", () => {
    const spill = `${md}\n${long}\n`; // GFM: a bare line after a table becomes a one-cell row
    const out = renderMarkdown(spill);
    expect(out).toContain(`<td>${long}</td>`); // the spill cell itself, in the Year column
    expect(out).toContain('<th class="col-short">Year</th>');
  });

  test("a table without a body row still renders", () => {
    expect(renderMarkdown("| A | B |\n|---|---|\n")).toContain('<th class="col-short">A</th>');
  });
});
