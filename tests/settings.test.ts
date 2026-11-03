import { describe, expect, test } from "bun:test";
import {
  clampSplit,
  clampZoom,
  DEFAULT_SETTINGS,
  type KeyValueStore,
  loadSettings,
  nextWidth,
  SPLIT_MAX,
  SPLIT_MIN,
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
    const saved = {
      width: "wide",
      zoom: 20,
      theme: "sepia",
      toc: true,
      split: 0.4,
      preview: false,
    } as const;
    saveSettings(store, saved);
    expect(loadSettings(store)).toEqual(saved);
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
    ).toEqual({ ...DEFAULT_SETTINGS, width: "full", zoom: ZOOM_MAX });
    expect(loadSettings(fakeStore({ "mdview.settings": JSON.stringify({ theme: 5 }) })).theme).toBe(
      "",
    );
    expect(loadSettings(fakeStore({ "mdview.settings": JSON.stringify({ toc: "yes" }) })).toc).toBe(
      false,
    );
  });

  test("the split is kept inside its bounds and the preview flag must be a boolean", () => {
    const load = (value: unknown) =>
      loadSettings(fakeStore({ "mdview.settings": JSON.stringify(value) }));
    expect(load({ split: 0.05 }).split).toBe(SPLIT_MIN);
    expect(load({ split: 3 }).split).toBe(SPLIT_MAX);
    expect(load({ split: "half" }).split).toBe(DEFAULT_SETTINGS.split);
    expect(load({ split: 0.6 }).split).toBe(0.6);
    expect(load({ preview: "no" }).preview).toBe(true);
    expect(load({ preview: false }).preview).toBe(false);
    expect(clampSplit(Number.NaN)).toBe(DEFAULT_SETTINGS.split);
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
