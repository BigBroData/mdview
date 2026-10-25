import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { resolveAsset } from "../src/server/paths.ts";

const root = resolve("tests/fixtures");

describe("resolveAsset confines requests to the document folder", () => {
  test("plain relative paths resolve inside the root", () => {
    expect(resolveAsset(root, "/img/a.png")).toBe(join(root, "img", "a.png"));
    expect(resolveAsset(root, "img/a.png")).toBe(join(root, "img", "a.png"));
  });

  test("percent-encoded names are decoded", () => {
    expect(resolveAsset(root, "/img/a%20b.png")).toBe(join(root, "img", "a b.png"));
    expect(resolveAsset(root, "/%D0%BA.png")).toBe(join(root, "к.png"));
  });

  test("escaping the root is refused", () => {
    expect(resolveAsset(root, "/../package.json")).toBeNull();
    expect(resolveAsset(root, "/img/../../package.json")).toBeNull();
    expect(resolveAsset(root, "/%2e%2e/package.json")).toBeNull();
    expect(resolveAsset(root, "/..%2fpackage.json")).toBeNull();
    expect(resolveAsset(root, "/img/..\\..\\package.json")).toBeNull();
  });

  test("absolute and malformed paths are refused", () => {
    expect(resolveAsset(root, "/C:/Windows/win.ini")).toBeNull();
    expect(resolveAsset(root, "C:/Windows/win.ini")).toBeNull();
    expect(resolveAsset(root, "/\\\\server\\share\\x")).toBeNull();
    expect(resolveAsset(root, "/a%00.png")).toBeNull();
    expect(resolveAsset(root, "/%E0%A4%A")).toBeNull(); // invalid percent-encoding
  });

  test("the root itself is not served", () => {
    expect(resolveAsset(root, "/")).toBeNull();
    expect(resolveAsset(root, "")).toBeNull();
    expect(resolveAsset(root, "/.")).toBeNull();
  });
});
