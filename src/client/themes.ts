import type { KeyValueStore } from "./settings.ts";

/**
 * Themes are plain CSS files that redefine the tokens at the top of app.css.
 * The ones the user adds live in ~/.config/mdview/themes/<name>.css; a few
 * ship inside the app (themes-builtin.ts). Pure helpers here, so tests need no DOM.
 */
export interface ThemeFile {
  /** The file name without `.css`. */
  name: string;
  css: string;
}

export interface Theme extends ThemeFile {
  builtin: boolean;
}

/** What the host reports: where the user's themes live and what is in there. */
export interface ThemeList {
  dir: string;
  themes: ThemeFile[];
}

/** The empty name means "no theme": the app's own colours, light or dark by the system. */
export const SYSTEM_THEME = "";

const byName = (a: Theme, b: Theme) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** The user's file wins over a built-in of the same name (compared ignoring case). */
export function mergeThemes(builtin: readonly ThemeFile[], user: readonly ThemeFile[]): Theme[] {
  const key = (name: string) => name.toLowerCase();
  const taken = new Set(user.map((theme) => key(theme.name)));
  return [
    ...user.map((theme) => ({ ...theme, builtin: false })),
    ...builtin.filter((theme) => !taken.has(key(theme.name))).map((t) => ({ ...t, builtin: true })),
  ].sort(byName);
}

export function findTheme(themes: readonly Theme[], name: string): Theme | undefined {
  const wanted = name.toLowerCase();
  return themes.find((theme) => theme.name.toLowerCase() === wanted);
}

/** Names in picker order: the system look first, then the themes. */
export function themeNames(themes: readonly Theme[]): string[] {
  return [SYSTEM_THEME, ...themes.map((theme) => theme.name)];
}

/** The next (or previous) entry of the picker, wrapping around. */
export function stepTheme(themes: readonly Theme[], current: string, direction: 1 | -1): string {
  const names = themeNames(themes);
  const index = Math.max(
    0,
    names.findIndex((name) => name.toLowerCase() === current.toLowerCase()),
  );
  return names[(index + direction + names.length) % names.length] ?? SYSTEM_THEME;
}

export function displayName(name: string): string {
  if (name === SYSTEM_THEME) return "System";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// The last applied theme is remembered, so the next start paints it at once
// instead of flashing the default colours until the host has answered.
const CACHE_KEY = "mdview.themeCss";

export function loadThemeCache(store: KeyValueStore | null): string {
  try {
    return store?.getItem(CACHE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveThemeCache(store: KeyValueStore | null, css: string): void {
  try {
    store?.setItem(CACHE_KEY, css);
  } catch {
    // blocked storage: only the first paint of the next start is affected
  }
}
