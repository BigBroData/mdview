import { isTauri } from "@tauri-apps/api/core";
import { renderMarkdown } from "../render/markdown.ts";
import { createOutline } from "./outline.ts";
import { createBrowserPlatform } from "./platform/browser.ts";
import { createTauriPlatform } from "./platform/tauri.ts";
import type { Document, Platform } from "./platform/types.ts";
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
 * Keys: Ctrl+O open · Ctrl+Shift+W column width · Ctrl+= / Ctrl+- / Ctrl+0 text size
 */
const doc = mustFind("doc");
const status = mustFind("status");
const outline = createOutline(mustFind("outline"), doc);
const platform: Platform = isTauri() ? createTauriPlatform() : createBrowserPlatform();
const store = browserStore();
let settings: Settings = loadSettings(store);

let lastText: string | null = null;

function render(document_: Document): void {
  if (document_.text === lastText) return; // the save did not change the text
  lastText = document_.text;
  const scrollY = window.scrollY;
  const started = performance.now();
  doc.innerHTML = renderMarkdown(document_.text, { assetBase: platform.assetBase });
  // Synchronous on purpose: requestAnimationFrame does not fire in a hidden
  // tab, and the strip must be right whenever the page becomes visible.
  window.scrollTo(0, scrollY);
  outline.update();
  if (document_.name) document.title = document_.name;
  console.debug(`mdview: rendered in ${(performance.now() - started).toFixed(1)} ms`);
}

async function show(load: () => Promise<Document | null>, missingMessage: string): Promise<void> {
  let loaded: Document | null;
  try {
    loaded = await load();
  } catch (error) {
    showStatus(String(error));
    return;
  }
  if (loaded === null) {
    showStatus(missingMessage);
    return;
  }
  hideStatus();
  render(loaded);
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
  if (!ctrl) return false;
  const key = event.key;
  if (!event.shiftKey && key.toLowerCase() === "o" && platform.openFile) {
    void show(platform.openFile, "");
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
    void show(() => openPath(path), "");
  });
}

let scrollTicking = false;
window.addEventListener(
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
  if (initial) render(initial);
  else showEmptyState();
})();
