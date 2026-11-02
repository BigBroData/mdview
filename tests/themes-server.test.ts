import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type RunningServer, startServer } from "../src/server/server.ts";
import { MAX_THEME_BYTES, readThemes, shortPath, themesDir } from "../src/server/themes.ts";

describe("themesDir", () => {
  test("follows XDG_CONFIG_HOME when it is absolute, else ~/.config", () => {
    expect(themesDir({ XDG_CONFIG_HOME: "/x/cfg" }, "/home/u")).toBe(
      join("/x/cfg", "mdview", "themes"),
    );
    expect(themesDir({}, "/home/u")).toBe(join("/home/u", ".config", "mdview", "themes"));
    expect(themesDir({ XDG_CONFIG_HOME: "relative" }, "/home/u")).toBe(
      join("/home/u", ".config", "mdview", "themes"),
    );
  });

  test("shortPath abbreviates the home folder only", () => {
    expect(shortPath("/home/u/.config/mdview/themes", "/home/u")).toBe("~/.config/mdview/themes");
    expect(shortPath("/home/ux/themes", "/home/u")).toBe("/home/ux/themes");
  });
});

describe("readThemes", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "mdview-themes-"));
    await writeFile(join(dir, "forest.css"), ":root{--bg:green}");
    await writeFile(join(dir, "Night Owl.CSS"), ":root{--bg:black}");
    await writeFile(join(dir, "notes.txt"), "not a theme");
    await writeFile(join(dir, ".hidden.css"), "x");
    await writeFile(join(dir, "huge.css"), "a".repeat(MAX_THEME_BYTES + 1));
    await mkdir(join(dir, "folder.css"));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  test("takes css files, skips the rest, names are the file stems", async () => {
    const themes = await readThemes(dir);
    expect(themes.map((t) => t.name)).toEqual(["Night Owl", "forest"]);
    expect(themes.find((t) => t.name === "forest")?.css).toBe(":root{--bg:green}");
  });

  test("a missing folder means no themes", async () => {
    expect(await readThemes(join(dir, "nope"))).toEqual([]);
  });
});

describe("GET /themes", () => {
  let themeDir: string;
  let docDir: string;
  let server: RunningServer;

  beforeAll(async () => {
    themeDir = await mkdtemp(join(tmpdir(), "mdview-themes-route-"));
    docDir = await mkdtemp(join(tmpdir(), "mdview-themes-doc-"));
    await writeFile(join(themeDir, "forest.css"), ":root{--bg:green}");
    await writeFile(join(docDir, "a.md"), "# A\n");
    server = await startServer({
      file: join(docDir, "a.md"),
      port: 0,
      minify: false,
      themesDir: themeDir,
    });
  });
  afterAll(async () => {
    server.stop();
    await rm(themeDir, { recursive: true, force: true });
    await rm(docDir, { recursive: true, force: true });
  });

  test("lists the user's themes as JSON", async () => {
    const res = await fetch(new URL("/themes", server.url));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      dir: themeDir,
      themes: [{ name: "forest", css: ":root{--bg:green}" }],
    });
  });

  test("a page of another origin is refused", async () => {
    const res = await fetch(new URL("/themes", server.url), {
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(res.status).toBe(403);
  });
});
