import { describe, expect, test } from "bun:test";
import type { KeyValueStore } from "../src/client/settings.ts";
import {
  displayName,
  findTheme,
  loadThemeCache,
  mergeThemes,
  saveThemeCache,
  stepTheme,
  themeNames,
} from "../src/client/themes.ts";

const builtin = [
  { name: "sepia", css: ":root{--bg:#f4ecd8}" },
  { name: "dusk", css: ":root{--bg:#2e3440}" },
];

describe("mergeThemes", () => {
  test("user files and built-ins are listed together, sorted by name", () => {
    const merged = mergeThemes(builtin, [{ name: "Forest", css: "x" }]);
    expect(merged.map((t) => [t.name, t.builtin])).toEqual([
      ["dusk", true],
      ["Forest", false],
      ["sepia", true],
    ]);
  });

  test("a user file replaces the built-in of the same name, ignoring case", () => {
    const merged = mergeThemes(builtin, [{ name: "Sepia", css: "mine" }]);
    expect(merged.map((t) => t.name)).toEqual(["dusk", "Sepia"]);
    expect(findTheme(merged, "sepia")?.css).toBe("mine");
    expect(findTheme(merged, "sepia")?.builtin).toBe(false);
  });
});

describe("picking", () => {
  const themes = mergeThemes(builtin, []);

  test("the system look comes first", () => {
    expect(themeNames(themes)).toEqual(["", "dusk", "sepia"]);
  });

  test("stepping wraps around both ways", () => {
    expect(stepTheme(themes, "", 1)).toBe("dusk");
    expect(stepTheme(themes, "sepia", 1)).toBe("");
    expect(stepTheme(themes, "", -1)).toBe("sepia");
    expect(stepTheme(themes, "DUSK", 1)).toBe("sepia");
  });

  test("an unknown current theme counts as the system look", () => {
    expect(stepTheme(themes, "gone", 1)).toBe("dusk");
  });

  test("names for the picker", () => {
    expect(displayName("")).toBe("System");
    expect(displayName("sepia")).toBe("Sepia");
  });
});

describe("theme cache", () => {
  const memory = (): KeyValueStore => {
    const data = new Map<string, string>();
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };

  test("round trip, and nothing when there is no store", () => {
    const store = memory();
    expect(loadThemeCache(store)).toBe("");
    saveThemeCache(store, ":root{--bg:red}");
    expect(loadThemeCache(store)).toBe(":root{--bg:red}");
    expect(loadThemeCache(null)).toBe("");
  });

  test("a throwing store is survivable", () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadThemeCache(broken)).toBe("");
    expect(() => saveThemeCache(broken, "x")).not.toThrow();
  });
});
