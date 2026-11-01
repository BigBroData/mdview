import { isTauri } from "@tauri-apps/api/core";
import { isMdxName, renderMarkdown } from "../render/markdown.ts";
import { createHistory, type Entry } from "./history.ts";
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

/**
 * The page: render a document, re-render when the host says it changed,
 * open another one on Ctrl+O or drag-and-drop where the host allows it.
 * Everything heavy (parsing, math, highlighting) happens here, so the same
 * code runs in the browser stage and inside the Tauri window.
 *
 * Links: #anchors scroll, links to other Markdown files open in this window
 * (Alt+Left / Alt+Right go back and forward), web links open in the browser.
 *
 * Keys: Ctrl+O open · Ctrl+F find · Ctrl+Shift+W column width · Ctrl+= / Ctrl+- / Ctrl+0 text size
 */
const doc = mustFind("doc");
const scroller = mustFind("scroller");
const status = mustFind("status");
const outline = createOutline(mustFind("outline"), doc, scroller);
const search = createSearch(mustFind("search"), doc, scroller, outline);
const platform: Platform = isTauri() ? createTauriPlatform() : createBrowserPlatform();
const store = browserStore();
let settings: Settings = loadSettings(store);

const history = createHistory();
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
    showStatus(missingMessage);
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

/** Moves to another document (a link, the file dialog, a drop) and records it in the history. */
async function navigate(
  loader: () => Promise<Document | null>,
  missingMessage: string,
  fragment = "",
): Promise<void> {
  const loaded = await load(loader, missingMessage);
  if (!loaded) return;
  history.saveScroll(scroller.scrollTop);
  render(loaded, { force: true, scrollTop: 0 });
  if (fragment) scrollToId(fragment);
  history.push({ path: loaded.path, scrollTop: scroller.scrollTop });
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
  history.saveScroll(scroller.scrollTop);
  const entry = history.back();
  if (entry) void visit(entry);
}

function goForward(): void {
  history.saveScroll(scroller.scrollTop);
  const entry = history.forward();
  if (entry) void visit(entry);
}

function scrollToId(id: string): boolean {
  const target = id === "" ? doc : doc.querySelector(`#${CSS.escape(id)}`);
  if (!target) return false;
  if (target === doc) scroller.scrollTop = 0;
  else target.scrollIntoView({ block: "start" });
  return true;
}

function followLink(event: MouseEvent): void {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    return;
  const anchor = (event.target as Element).closest("a[href]");
  if (!anchor) return;
  const link = classifyLink(anchor.getAttribute("href") ?? "");
  event.preventDefault();
  if (link.kind === "anchor") {
    history.saveScroll(scroller.scrollTop);
    if (scrollToId(link.id)) history.push({ path: currentPath, scrollTop: scroller.scrollTop });
  } else if (link.kind === "document") {
    const openLink = platform.openLink;
    if (openLink) {
      void navigate(() => openLink(link.path), `File not found: ${link.path}`, link.fragment);
    }
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
  const key = event.key;
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
  if (!event.shiftKey && key.toLowerCase() === "f") {
    search.open();
    return true;
  }
  if (!event.shiftKey && key.toLowerCase() === "o" && platform.openFile) {
    void navigate(platform.openFile, "");
    return true;
  }
  if (event.shiftKey && key.toLowerCase() === "w") {
    const width = nextWidth(settings.width);
    changeSettings({ width }, WIDTH_LABEL[width]);
    return true;
  }
  if (key === "=" || key === "+") {
    const zoom = clampZoom(settings.zoom + ZOOM_STEP);
    changeSettings({ zoom }, `Text size: ${zoom}px`);
    return true;
  }
  if (key === "-" || key === "_") {
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

platform.onConnectionLost?.((lost) => {
  if (lost) showStatus("Connection to viewer lost — reconnecting…");
  else hideStatus();
});

platform.watch(() => {
  void show(platform.reload, "File not found. Last rendered version is shown.");
});

window.addEventListener("keydown", (event) => {
  if (handleShortcut(event)) event.preventDefault();
});

if (platform.onFileDropped && platform.openPath) {
  const openPath = platform.openPath;
  platform.onFileDropped((path) => {
    void navigate(() => openPath(path), "");
  });
}

doc.addEventListener("click", followLink);
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
  if (initial) {
    render(initial);
    history.push({ path: initial.path, scrollTop: 0 });
  } else {
    showEmptyState();
  }
})();
