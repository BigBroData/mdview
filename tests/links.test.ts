import { describe, expect, test } from "bun:test";
import { createHistory } from "../src/client/history.ts";
import { classifyLink, resolveRelative } from "../src/client/links.ts";

describe("classifyLink", () => {
  test("anchors, decoded", () => {
    expect(classifyLink("#intro")).toEqual({ kind: "anchor", id: "intro" });
    expect(classifyLink("#%D0%BF%D0%B0%D1%80%D0%B0")).toEqual({ kind: "anchor", id: "пара" });
  });

  test("links to other Markdown files, with and without a fragment", () => {
    expect(classifyLink("other.md")).toEqual({ kind: "document", path: "other.md", fragment: "" });
    expect(classifyLink("./sub/a%20b.mdx#part")).toEqual({
      kind: "document",
      path: "./sub/a b.mdx",
      fragment: "part",
    });
    expect(classifyLink("../README.MD?plain=1#x")).toEqual({
      kind: "document",
      path: "../README.MD",
      fragment: "x",
    });
  });

  test("web links are external, other schemes are ignored", () => {
    expect(classifyLink("https://example.com/a.md")).toEqual({
      kind: "external",
      url: "https://example.com/a.md",
    });
    expect(classifyLink("mailto:a@b.c").kind).toBe("external");
    expect(classifyLink("javascript:alert(1)").kind).toBe("other");
    expect(classifyLink("file:///etc/passwd").kind).toBe("other");
    expect(classifyLink("//host/x.md").kind).toBe("other");
  });

  test("links to non-Markdown files do nothing", () => {
    expect(classifyLink("report.pdf").kind).toBe("other");
    expect(classifyLink("dir/").kind).toBe("other");
    expect(classifyLink("").kind).toBe("other");
  });
});

describe("resolveRelative", () => {
  test("POSIX paths", () => {
    expect(resolveRelative("/home/u/docs/a.md", "b.md")).toBe("/home/u/docs/b.md");
    expect(resolveRelative("/home/u/docs/a.md", "./sub/b.md")).toBe("/home/u/docs/sub/b.md");
    expect(resolveRelative("/home/u/docs/a.md", "../b.md")).toBe("/home/u/b.md");
    expect(resolveRelative("/home/u/docs/a.md", "/etc/b.md")).toBe("/etc/b.md");
  });

  test("never climbs above the root", () => {
    expect(resolveRelative("/a.md", "../../b.md")).toBe("/b.md");
  });

  test("Windows paths keep their separator and drive", () => {
    expect(resolveRelative("C:\\docs\\a.md", "sub/b.md")).toBe("C:\\docs\\sub\\b.md");
    expect(resolveRelative("C:\\docs\\a.md", "..\\..\\b.md")).toBe("C:\\b.md");
  });
});

describe("history", () => {
  test("back and forward restore positions", () => {
    const h = createHistory();
    h.push({ path: "/a.md", scrollTop: 0 });
    h.saveScroll(300);
    h.push({ path: "/b.md", scrollTop: 0 });
    h.saveScroll(50);
    expect(h.back()).toEqual({ path: "/a.md", scrollTop: 300 });
    expect(h.forward()).toEqual({ path: "/b.md", scrollTop: 50 });
    expect(h.forward()).toBeUndefined();
  });

  test("pushing after going back drops the forward entries", () => {
    const h = createHistory();
    h.push({ path: "/a.md", scrollTop: 0 });
    h.push({ path: "/b.md", scrollTop: 0 });
    h.back();
    h.push({ path: "/c.md", scrollTop: 0 });
    expect(h.forward()).toBeUndefined();
    expect(h.back()?.path).toBe("/a.md");
  });

  test("nothing before the first entry", () => {
    const h = createHistory();
    expect(h.back()).toBeUndefined();
    h.push({ path: "/a.md", scrollTop: 0 });
    expect(h.back()).toBeUndefined();
    expect(h.current()?.path).toBe("/a.md");
  });
});
