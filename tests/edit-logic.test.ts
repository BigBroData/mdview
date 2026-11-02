import { describe, expect, test } from "bun:test";
import { detectEol, normalizeEol, previewScrollTop, withEol } from "../src/client/edit-logic.ts";

describe("line endings", () => {
  test("normalize turns CRLF and lone CR into LF", () => {
    expect(normalizeEol("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });

  test("detect looks at the first line break", () => {
    expect(detectEol("a\r\nb\n")).toBe("\r\n");
    expect(detectEol("a\nb\r\n")).toBe("\n");
    expect(detectEol("no breaks")).toBe("\n");
  });

  test("a CRLF file survives a round trip through the editor", () => {
    const original = "# T\r\n\r\ntext\r\n";
    const eol = detectEol(original);
    expect(withEol(normalizeEol(original), eol)).toBe(original);
    expect(withEol("a\nb", "\n")).toBe("a\nb");
  });
});

describe("previewScrollTop", () => {
  // blocks at source lines 0, 10, 30; a 50-line document that is 1000px tall in the preview
  const blocks = [
    { line: 0, top: 0 },
    { line: 10, top: 200 },
    { line: 30, top: 600 },
  ];
  const end = { line: 50, top: 1000 };

  test("no blocks, or above the first one: the top", () => {
    expect(previewScrollTop([], 5, end)).toBe(0);
    expect(previewScrollTop([{ line: 3, top: 80 }], 1, end)).toBe(0);
  });

  test("at a block's own line it is that block's top", () => {
    expect(previewScrollTop(blocks, 10, end)).toBe(200);
    expect(previewScrollTop(blocks, 30, end)).toBe(600);
  });

  test("between blocks it interpolates", () => {
    expect(previewScrollTop(blocks, 5, end)).toBe(100);
    expect(previewScrollTop(blocks, 20, end)).toBe(400);
  });

  test("after the last block it runs on to the end of the document", () => {
    expect(previewScrollTop(blocks, 40, end)).toBe(800);
    expect(previewScrollTop(blocks, 80, end)).toBe(1000);
  });

  test("blocks on the same line do not divide by zero", () => {
    const twins = [
      { line: 4, top: 100 },
      { line: 4, top: 130 },
    ];
    expect(Number.isFinite(previewScrollTop(twins, 4, end))).toBe(true);
  });
});
