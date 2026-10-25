import { describe, expect, test } from "bun:test";
import { debounce, tauriAssetBase } from "../src/client/platform/asset-base.ts";

describe("tauriAssetBase", () => {
  test("Linux and macOS use the scheme://localhost form", () => {
    expect(tauriAssetBase("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15")).toBe(
      "mdasset://localhost",
    );
    expect(tauriAssetBase("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(
      "mdasset://localhost",
    );
  });

  test("Windows uses the http://scheme.localhost form", () => {
    expect(tauriAssetBase("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
      "http://mdasset.localhost",
    );
  });
});

describe("debounce", () => {
  test("a burst of calls yields one call after the delay", async () => {
    let calls = 0;
    const fn = debounce(() => calls++, 20);
    fn();
    fn();
    fn();
    expect(calls).toBe(0);
    await Bun.sleep(40);
    expect(calls).toBe(1);
  });

  test("separate bursts yield separate calls", async () => {
    let calls = 0;
    const fn = debounce(() => calls++, 10);
    fn();
    await Bun.sleep(25);
    fn();
    await Bun.sleep(25);
    expect(calls).toBe(2);
  });
});
