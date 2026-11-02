import { describe, expect, test } from "bun:test";
import { siblingPath, withMarkdownExtension } from "../src/client/paths.ts";

describe("withMarkdownExtension", () => {
  test("adds .md to a bare name", () => {
    expect(withMarkdownExtension("/home/a/notes")).toBe("/home/a/notes.md");
  });

  test("leaves an extension alone, whichever it is (the shell checks it)", () => {
    expect(withMarkdownExtension("/home/a/notes.md")).toBe("/home/a/notes.md");
    expect(withMarkdownExtension("/home/a/notes.txt")).toBe("/home/a/notes.txt");
    expect(withMarkdownExtension("/home/a/notes.rs")).toBe("/home/a/notes.rs");
  });

  test("a dot in a folder name is not an extension", () => {
    expect(withMarkdownExtension("/home/a.b/notes")).toBe("/home/a.b/notes.md");
  });

  test("a dot file and a trailing dot", () => {
    expect(withMarkdownExtension("/home/a/.notes")).toBe("/home/a/.notes.md");
    expect(withMarkdownExtension("/home/a/notes.")).toBe("/home/a/notes.md");
  });
});

describe("siblingPath", () => {
  test("puts the name in the folder of the other file", () => {
    expect(siblingPath("/home/a/doc.md", "Untitled.md")).toBe("/home/a/Untitled.md");
  });

  test("no folder: the bare name", () => {
    expect(siblingPath("", "Untitled.md")).toBe("Untitled.md");
    expect(siblingPath("doc.md", "Untitled.md")).toBe("Untitled.md");
  });
});
