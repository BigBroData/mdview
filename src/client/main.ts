import { isTauri } from "@tauri-apps/api/core";
import { isMdxName, renderMarkdown } from "../render/markdown.ts";
import type { Entry } from "./history.ts";
import { chordKey } from "./keys.ts";
import { classifyLink } from "./links.ts";
import { createOutline } from "./outline.ts";
import { createBrowserPlatform } from "./platform/browser.ts";
import { createTauriPlatform } from "./platform/tauri.ts";
import type { Document, Platform } from "./platform/types.ts";
import { createSearch } from "./search.ts";
import {
  browserStore,
  clampZoom,
  loadSettings,
  nextWidth,
  type Settings,
  saveSettings,
  ZOOM_DEFAULT,
  ZOOM_STEP,
} from "./settings.ts";
import { createTabBar } from "./tabbar.ts";
import { createTabs, type Tab } from "./tabs.ts";
import { createThemePicker } from "./themepicker.ts";
import {
  displayName,
  findTheme,
  loadThemeCache,
  mergeThemes,
  SYSTEM_THEME,
  saveThemeCache,
  type Theme,
} from "./themes.ts";
import { BUILTIN_THEMES } from "./themes-builtin.ts";

/**
 * The page: render a document, re-render when the host says it changed,
 * open another one on Ctrl+O or drag-and-drop where the host allows it.
 * Everything heavy (parsing, math, highlighting) happens here, so the same
 * code runs in the browser stage and inside the Tauri window.
 *
 * Links: #anchors scroll, links to other Markdown files open in this window
 * (Alt+Left / Alt+Right go back and forward), web links open in the browser.
 *
 * Tabs: Ctrl+O, a drop, a second start of the app and Ctrl+click on a link open a document
 * in a tab of this window; every tab has its own history. Ctrl+W closes, Ctrl+Tab and
 * Ctrl+1..9 switch. Only the active tab is watched for changes (the host holds one document).
 *
 * Themes: CSS files in ~/.config/mdview/themes redefine the colour tokens; Ctrl+Shift+T
 * opens the switcher (docs/themes.md).
 *
 * Keys: Ctrl+O open · Ctrl+W close tab · Ctrl+F find · Ctrl+Shift+W column width · Ctrl+= / Ctrl+- / Ctrl+0 text size
 */
const doc = mustFind("doc");
const scroller = mustFind("scroller");
const status = mustFind("status");
const outline = createOutline(mustFind("outline"), doc, scroller);
const search = createSearch(mustFind("search"), doc, scroller, outline);
const platform: Platform = isTauri() ? createTauriPlatform() : createBrowserPlatform();
const store = browserStore();
let settings: Settings = loadSettings(store);

const tabs = createTabs();
const tabBar = createTabBar(mustFind("tabs"), {
  select: (id) => serial(() => switchTo(id)),
  close: (id) => serial(() => closeTab(id)),
});

/**
 * The host holds one open document, so everything that changes it (opening,
 * switching, closing, reloading) runs one after another.
 */
let queue: Promise<void> = Promise.resolve();
function serial(task: () => Promise<void>): void {
  queue = queue.then(task).catch((error: unknown) => showStatus(String(error)));
}

const activeHistory = () => tabs.active()?.history;
let lastText: string | null = null;
let currentPath = "";

interface RenderOptions {
  /** Render even if the text is the same as before (a different file). */
  force?: boolean;
  /** Where to scroll; default keeps the current position (a reload). */
  scrollTop?: number;
}

function render(document_: Document, options: RenderOptions = {}): void {
  if (!options.force && document_.text === lastText) return; // the save did not change the text
  lastText = document_.text;
  currentPath = document_.path;
  const scrollTop = options.scrollTop ?? scroller.scrollTop;
  const started = performance.now();
  doc.innerHTML = renderMarkdown(document_.text, {
    assetBase: platform.assetBase,
    mdx: isMdxName(document_.name),
  });
  // Synchronous on purpose: requestAnimationFrame does not fire in a hidden
  // tab, and the strip must be right whenever the page becomes visible.
  scroller.scrollTop = scrollTop;
  outline.update();
  search.refresh(); // the old <mark>s went away with the old HTML
  // Keyboard scrolling (PgDn, Space, arrows) goes to the focused scroller.
  if (document.activeElement === document.body) scroller.focus({ preventScroll: true });
  if (document_.name) document.title = document_.name;
  const tab = tabs.active();
  if (tab) {
    tab.path = document_.path;
    tab.name = document_.name;
  }
  tabBar.update(tabs.all(), tab?.id);
  console.debug(`mdview: rendered in ${(performance.now() - started).toFixed(1)} ms`);
}

/** Runs a loader and reports failures in the status pill; null means nothing to show. */
async function load(
  loader: () => Promise<Document | null>,
  missingMessage: string,
): Promise<Document | null> {
  let loaded: Document | null;
  try {
    loaded = await loader();
  } catch (error) {
    showStatus(String(error));
    return null;
  }
  if (loaded === null) {
    if (missingMessage) showStatus(missingMessage); // empty: the user cancelled a dialog
    return null;
  }
  hideStatus();
  return loaded;
}

/** The open document changed on disk: show the new text where the reader is. */
async function show(loader: () => Promise<Document | null>, missingMessage: string): Promise<void> {
  const loaded = await load(loader, missingMessage);
  if (loaded) render(loaded);
}

/** Follows a link inside the active tab and records it in that tab's history. */
async function navigate(
  loader: () => Promise<Document | null>,
  missingMessage: string,
  fragment = "",
): Promise<void> {
  const tab = tabs.active();
  const loaded = await load(loader, missingMessage);
  if (!loaded || !tab) return;
  tab.history.saveScroll(scroller.scrollTop);
  render(loaded, { force: true, scrollTop: 0 });
  if (fragment) scrollToId(fragment);
  tab.history.push({ path: loaded.path, scrollTop: scroller.scrollTop });
}

/**
 * Shows a document in a tab: the tab that already shows it, else a new one.
 * Returns the tab, or undefined when the document could not be loaded.
 */
async function openInTab(
  loader: () => Promise<Document | null>,
  missingMessage: string,
  fragment = "",
): Promise<Tab | undefined> {
  const loaded = await load(loader, missingMessage);
  if (!loaded) return undefined;
  const from = tabs.active();
  from?.history.saveScroll(scroller.scrollTop);
  const existing = tabs.find(loaded.path);
  if (existing) {
    tabs.activate(existing.id);
    const scrollTop =
      existing === from ? scroller.scrollTop : (existing.history.current()?.scrollTop ?? 0);
    render(loaded, { force: true, scrollTop });
    if (fragment && scrollToId(fragment)) {
      existing.history.push({ path: loaded.path, scrollTop: scroller.scrollTop });
    }
    return existing;
  }
  const tab = tabs.add(loaded.path, loaded.name);
  render(loaded, { force: true, scrollTop: 0 });
  if (fragment) scrollToId(fragment);
  tab.history.push({ path: loaded.path, scrollTop: scroller.scrollTop });
  return tab;
}

/** Opens several documents as tabs; the first of them ends up in front. */
function openPaths(paths: string[]): void {
  const openPath = platform.openPath;
  if (!openPath || paths.length === 0) return;
  serial(async () => {
    let first: Tab | undefined;
    for (const path of paths) {
      const tab = await openInTab(() => openPath(path), `File not found: ${path}`);
      first ??= tab;
    }
    if (first && first !== tabs.active()) await showTab(first);
  });
}

/** Brings an existing tab to the front: the host loads its document, the page restores its place. */
async function showTab(target: Tab): Promise<boolean> {
  const openPath = platform.openPath;
  if (!openPath) return false;
  const from = tabs.active();
  const loaded = await load(() => openPath(target.path), `Cannot open ${target.path}`);
  if (!loaded) return false;
  from?.history.saveScroll(scroller.scrollTop);
  tabs.activate(target.id);
  render(loaded, { force: true, scrollTop: target.history.current()?.scrollTop ?? 0 });
  return true;
}

async function switchTo(id: number): Promise<void> {
  const target = tabs.all().find((tab) => tab.id === id);
  if (target && target !== tabs.active()) await showTab(target);
}

async function closeTab(id: number): Promise<void> {
  if (!tabs.all().some((tab) => tab.id === id)) return;
  if (tabs.all().length === 1) {
    platform.closeWindow?.(); // closing the last tab closes the window
    return;
  }
  const wasActive = tabs.active()?.id === id;
  let next = tabs.remove(id);
  if (wasActive) {
    // A tab whose file vanished cannot be shown; drop it too and try its neighbour.
    while (next && !(await showTab(next))) next = tabs.remove(next.id);
    if (!next) {
      lastText = null;
      showEmptyState();
    }
  }
  tabBar.update(tabs.all(), tabs.active()?.id);
}

/** Back / forward: same document just scrolls, another one is loaded. */
async function visit(entry: Entry): Promise<void> {
  if (entry.path === currentPath || !platform.openPath) {
    scroller.scrollTop = entry.scrollTop;
    return;
  }
  const openPath = platform.openPath;
  const loaded = await load(() => openPath(entry.path), `Cannot open ${entry.path}`);
  if (loaded) render(loaded, { force: true, scrollTop: entry.scrollTop });
}

function goBack(): void {
  const history = activeHistory();
  history?.saveScroll(scroller.scrollTop);
  const entry = history?.back();
  if (entry) serial(() => visit(entry));
}

function goForward(): void {
  const history = activeHistory();
  history?.saveScroll(scroller.scrollTop);
  const entry = history?.forward();
  if (entry) serial(() => visit(entry));
}

function scrollToId(id: string): boolean {
  const target = id === "" ? doc : doc.querySelector(`#${CSS.escape(id)}`);
  if (!target) return false;
  if (target === doc) scroller.scrollTop = 0;
  else target.scrollIntoView({ block: "start" });
  return true;
}

/** A click on a link; with `inNewTab` (Ctrl+click, middle button) a document link opens as a tab. */
function followLink(event: MouseEvent, inNewTab: boolean): void {
  const anchor = (event.target as Element).closest("a[href]");
  if (!anchor) return;
  const link = classifyLink(anchor.getAttribute("href") ?? "");
  event.preventDefault();
  if (link.kind === "anchor") {
    const history = activeHistory();
    history?.saveScroll(scroller.scrollTop);
    if (scrollToId(link.id)) history?.push({ path: currentPath, scrollTop: scroller.scrollTop });
  } else if (link.kind === "document") {
    const openLink = platform.openLink;
    if (!openLink) return;
    const missing = `File not found: ${link.path}`;
    if (inNewTab) {
      serial(async () => {
        await openInTab(() => openLink(link.path), missing, link.fragment);
      });
    } else serial(() => navigate(() => openLink(link.path), missing, link.fragment));
  } else if (link.kind === "external") {
    void platform.openExternal?.(link.url);
  }
}

function showEmptyState(): void {
  doc.innerHTML = `<p class="empty">No file open.${
    platform.openFile ? " Press <kbd>Ctrl</kbd>+<kbd>O</kbd> or drop a Markdown file here." : ""
  }</p>`;
}

let statusTimer: ReturnType<typeof setTimeout> | undefined;

function showStatus(message: string, hideAfterMs?: number): void {
  status.textContent = message;
  status.hidden = false;
  if (statusTimer !== undefined) clearTimeout(statusTimer);
  if (hideAfterMs !== undefined) statusTimer = setTimeout(hideStatus, hideAfterMs);
}

function hideStatus(): void {
  status.hidden = true;
}

function mustFind(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`index.html is missing #${id}`);
  return element;
}

// --- reader settings --------------------------------------------------------

// --- themes -----------------------------------------------------------------

/** One <style> element carries the active theme; it comes last, so it wins over app.css. */
const themeStyle = document.createElement("style");
themeStyle.id = "theme-css";
themeStyle.textContent = loadThemeCache(store); // paint the last theme at once, before the host answers
document.head.append(themeStyle);

let themes: Theme[] = mergeThemes(BUILTIN_THEMES, []);
let themeDir = "";

/** Shows a theme (the empty name is the app's own colours); does not remember it. */
function showTheme(name: string): string {
  const theme = name === SYSTEM_THEME ? undefined : findTheme(themes, name);
  const css = theme?.css ?? "";
  if (themeStyle.textContent !== css) themeStyle.textContent = css;
  if (theme) document.documentElement.dataset.theme = theme.name;
  else delete document.documentElement.dataset.theme;
  return css;
}

/** Reads the theme files again, so a file the user or an agent just wrote shows up. */
async function refreshThemes(): Promise<void> {
  try {
    const list = await platform.loadThemes?.();
    themes = mergeThemes(BUILTIN_THEMES, list?.themes ?? []);
    themeDir = list?.dir ?? "";
  } catch (error) {
    console.error("mdview: cannot read themes", error);
  }
  if (!themePicker.isOpen()) saveThemeCache(store, showTheme(settings.theme));
}

const themePicker = createThemePicker(mustFind("themes"), {
  refresh: refreshThemes,
  themes: () => themes,
  dir: () => themeDir,
  current: () => settings.theme,
  preview: (name) => void showTheme(name),
  choose(name) {
    settings = { ...settings, theme: name };
    saveSettings(store, settings);
    saveThemeCache(store, showTheme(name));
    showStatus(`Theme: ${displayName(name)}`, 1200);
    scroller.focus({ preventScroll: true });
  },
});

// --- reader settings --------------------------------------------------------

const WIDTH_LABEL = { column: "Width: column", wide: "Width: wide", full: "Width: full" } as const;

function applySettings(): void {
  document.documentElement.dataset.width = settings.width;
  document.documentElement.style.setProperty("--text-size", `${settings.zoom}px`);
  saveSettings(store, settings);
  outline.update(); // heading positions change with width and size
}

function changeSettings(change: Partial<Settings>, hint: string): void {
  settings = { ...settings, ...change };
  applySettings();
  showStatus(hint, 1200);
}

function handleShortcut(event: KeyboardEvent): boolean {
  const ctrl = event.ctrlKey || event.metaKey;
  const key = chordKey(event);
  if (key === "F3") {
    if (search.isOpen()) search.step(event.shiftKey ? -1 : 1);
    else search.open();
    return true;
  }
  if (key === "Escape" && search.isOpen()) {
    search.close();
    return true;
  }
  if (event.altKey && (key === "ArrowLeft" || key === "ArrowRight")) {
    if (key === "ArrowLeft") goBack();
    else goForward();
    return true;
  }
  if (!ctrl) return false;
  if (!event.shiftKey && key === "f") {
    search.open();
    return true;
  }
  if (!event.shiftKey && key === "o" && platform.openFile) {
    const openFile = platform.openFile;
    serial(async () => {
      await openInTab(openFile, "");
    });
    return true;
  }
  if (!event.shiftKey && key === "w" && (tabs.all().length > 1 || platform.closeWindow)) {
    const tab = tabs.active();
    if (tab) serial(() => closeTab(tab.id));
    return true;
  }
  if (key === "Tab" || key === "PageDown" || key === "PageUp") {
    const backwards = key === "PageUp" || (key === "Tab" && event.shiftKey);
    const target = tabs.step(backwards ? -1 : 1);
    if (target) serial(() => switchTo(target.id));
    return target !== undefined;
  }
  if (!event.shiftKey && key >= "1" && key <= "9") {
    // Like a browser: Ctrl+1..8 pick that tab, Ctrl+9 the last one.
    const target = key === "9" ? tabs.all().at(-1) : tabs.at(Number(key) - 1);
    if (target) serial(() => switchTo(target.id));
    return target !== undefined;
  }
  if (event.shiftKey && key === "t") {
    if (themePicker.isOpen()) themePicker.close();
    else void themePicker.open();
    return true;
  }
  if (event.shiftKey && key === "w") {
    const width = nextWidth(settings.width);
    changeSettings({ width }, WIDTH_LABEL[width]);
    return true;
  }
  if (key === "+") {
    const zoom = clampZoom(settings.zoom + ZOOM_STEP);
    changeSettings({ zoom }, `Text size: ${zoom}px`);
    return true;
  }
  if (key === "-") {
    const zoom = clampZoom(settings.zoom - ZOOM_STEP);
    changeSettings({ zoom }, `Text size: ${zoom}px`);
    return true;
  }
  if (key === "0") {
    changeSettings({ zoom: ZOOM_DEFAULT }, `Text size: ${ZOOM_DEFAULT}px`);
    return true;
  }
  return false;
}

// --- wiring ---------------------------------------------------------------

applySettings();
void refreshThemes();
// Back from the editor where the theme file was just changed: pick the change up.
window.addEventListener("focus", () => void refreshThemes());

platform.onConnectionLost?.((lost) => {
  if (lost) showStatus("Connection to viewer lost — reconnecting…");
  else hideStatus();
});

platform.watch(() => {
  serial(() => show(platform.reload, "File not found. Last rendered version is shown."));
});

window.addEventListener("keydown", (event) => {
  if (handleShortcut(event)) event.preventDefault();
});

platform.onFileDropped?.(openPaths);
platform.onOpenRequest?.(openPaths);

doc.addEventListener("click", (event) => {
  if (event.button === 0) followLink(event, event.ctrlKey || event.metaKey);
});
doc.addEventListener("auxclick", (event) => {
  if (event.button === 1) followLink(event, true);
});
// Mouse side buttons, like in a browser.
window.addEventListener("mouseup", (event) => {
  if (event.button === 3) goBack();
  else if (event.button === 4) goForward();
  else return;
  event.preventDefault();
});

let scrollTicking = false;
scroller.addEventListener(
  "scroll",
  () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      outline.track();
      scrollTicking = false;
    });
  },
  { passive: true },
);

// Images loading and window resizes move the headings; keep the strip honest.
new ResizeObserver(() => outline.update()).observe(doc);
window.addEventListener("resize", () => outline.update());

void (async () => {
  let initial: Document | null = null;
  try {
    initial = await platform.initial();
  } catch (error) {
    showStatus(String(error));
  }
  if (!initial) {
    showEmptyState();
    return;
  }
  const first = tabs.add(initial.path, initial.name);
  render(initial);
  first.history.push({ path: initial.path, scrollTop: 0 });
  // More files on the command line open as tabs behind the first one.
  const more = await platform.initialPaths?.().catch(() => []);
  const openPath = platform.openPath;
  if (!more || more.length === 0 || !openPath) return;
  serial(async () => {
    for (const path of more) await openInTab(() => openPath(path), `File not found: ${path}`);
    if (tabs.active() !== first) await showTab(first);
  });
})();
