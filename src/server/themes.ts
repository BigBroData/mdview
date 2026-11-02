import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join } from "node:path";
import type { ThemeFile, ThemeList } from "../client/themes.ts";

/** A theme is a few dozen lines; anything bigger is not one. */
export const MAX_THEME_BYTES = 256 * 1024;
export const MAX_THEMES = 50;

/** Where the user's theme files live: `$XDG_CONFIG_HOME/mdview/themes`, else `~/.config/mdview/themes`. */
export function themesDir(
  env: Record<string, string | undefined> = process.env,
  home: string = homedir(),
): string {
  const xdg = env.XDG_CONFIG_HOME;
  const base = xdg && isAbsolute(xdg) ? xdg : join(home, ".config");
  return join(base, "mdview", "themes");
}

/** `/home/u/.config/…` as `~/.config/…`, for showing in the interface. */
export function shortPath(path: string, home: string = homedir()): string {
  return path === home || path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/** Every readable `*.css` in the folder, by name; a missing folder is simply no themes. */
export async function readThemes(dir: string): Promise<ThemeFile[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const themes: ThemeFile[] = [];
  for (const entry of entries.sort()) {
    if (themes.length >= MAX_THEMES) break;
    if (entry.startsWith(".") || extname(entry).toLowerCase() !== ".css") continue;
    const file = Bun.file(join(dir, entry));
    try {
      if (file.size > MAX_THEME_BYTES) continue;
      themes.push({ name: basename(entry, extname(entry)), css: await file.text() });
    } catch {
      // a directory named x.css, or a file that vanished: skip it
    }
  }
  return themes;
}

export async function listThemes(dir: string): Promise<ThemeList> {
  return { dir: shortPath(dir), themes: await readThemes(dir) };
}
