import { describe, expect, test } from "bun:test";
import { buildClient } from "../src/server/client-bundle.ts";

describe("client bundle", () => {
  test("lazy parts are separate files that the entry points to", async () => {
    const bundle = await buildClient(true);
    expect(bundle.chunks.size).toBeGreaterThan(0);
    for (const [name, code] of bundle.chunks) {
      expect(name).toMatch(/^chunk-[\w-]+\.js$/);
      expect(code.length).toBeGreaterThan(0);
    }
    // Some chunks are only reached from other chunks; the entry names at least one of them.
    expect([...bundle.chunks.keys()].some((name) => bundle.js.includes(`./${name}`))).toBe(true);
  });
});
