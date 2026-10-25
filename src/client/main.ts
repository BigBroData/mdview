import { isTauri } from "@tauri-apps/api/core";
import { renderMarkdown } from "../render/markdown.ts";
import { createBrowserPlatform } from "./platform/browser.ts";
import { createTauriPlatform } from "./platform/tauri.ts";
import type { Document, Platform } from "./platform/types.ts";

/**
 * The page: render a document, re-render when the host says it changed,
 * open another one on Ctrl+O or drag-and-drop where the host allows it.
 * Everything heavy (parsing, math, highlighting) happens here, so the same
 * code runs in the browser stage and inside the Tauri window.
 */
const doc = mustFind("doc");
const status = mustFind("status");
const platform: Platform = isTauri() ? createTauriPlatform() : createBrowserPlatform();

let lastText: string | null = null;

function render(document_: Document): void {
  if (document_.text === lastText) return; // the save did not change the text
  lastText = document_.text;
  const scrollY = window.scrollY;
  const started = performance.now();
  doc.innerHTML = renderMarkdown(document_.text, { assetBase: platform.assetBase });
  requestAnimationFrame(() => window.scrollTo(0, scrollY));
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

function showStatus(message: string): void {
  status.textContent = message;
  status.hidden = false;
}

function hideStatus(): void {
  status.hidden = true;
}

function mustFind(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`index.html is missing #${id}`);
  return element;
}

// --- wiring ---------------------------------------------------------------

platform.onConnectionLost?.((lost) => {
  if (lost) showStatus("Connection to viewer lost — reconnecting…");
  else hideStatus();
});

platform.watch(() => {
  void show(platform.reload, "File not found. Last rendered version is shown.");
});

if (platform.openFile) {
  const openFile = platform.openFile;
  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "o") {
      event.preventDefault();
      void show(openFile, "");
    }
  });
}

if (platform.onFileDropped && platform.openPath) {
  const openPath = platform.openPath;
  platform.onFileDropped((path) => {
    void show(() => openPath(path), "");
  });
}

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
