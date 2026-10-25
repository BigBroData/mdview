import { describe, expect, test } from "bun:test";
import {
  clampZoom,
  DEFAULT_SETTINGS,
  type KeyValueStore,
  loadSettings,
  nextWidth,
  saveSettings,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../src/client/settings.ts";

function fakeStore(
  initial?: Record<string, string>,
): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial ?? {}));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

describe("width cycles column → wide → full → column", () => {
  test("nextWidth", () => {
    expect(nextWidth("column")).toBe("wide");
    expect(nextWidth("wide")).toBe("full");
    expect(nextWidth("full")).toBe("column");
  });
});

describe("zoom is clamped and rounded", () => {
  test("clampZoom", () => {
    expect(clampZoom(ZOOM_MIN - 5)).toBe(ZOOM_MIN);
    expect(clampZoom(ZOOM_MAX + 5)).toBe(ZOOM_MAX);
    expect(clampZoom(16.6)).toBe(17);
    expect(clampZoom(Number.NaN)).toBe(DEFAULT_SETTINGS.zoom);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SETTINGS.zoom);
  });
});

describe("settings persistence", () => {
  test("round trip", () => {
    const store = fakeStore();
    saveSettings(store, { width: "wide", zoom: 20 });
    expect(loadSettings(store)).toEqual({ width: "wide", zoom: 20 });
  });

  test("missing, corrupt or hostile values fall back to defaults", () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(fakeStore())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(fakeStore({ "mdview.settings": "{not json" }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(fakeStore({ "mdview.settings": "null" }))).toEqual(DEFAULT_SETTINGS);
    expect(
      loadSettings(fakeStore({ "mdview.settings": JSON.stringify({ width: "huge", zoom: "9" }) })),
    ).toEqual(DEFAULT_SETTINGS);
    expect(
      loadSettings(fakeStore({ "mdview.settings": JSON.stringify({ width: "full", zoom: 999 }) })),
    ).toEqual({ width: "full", zoom: ZOOM_MAX });
  });

  test("a throwing store does not break the app", () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(broken, DEFAULT_SETTINGS)).not.toThrow();
  });
});
