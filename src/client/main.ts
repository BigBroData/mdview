import { renderMarkdown } from "../render/markdown.ts";

/**
 * Browser side: fetch the Markdown, render it, and re-render whenever the
 * server reports that the file changed. Everything heavy (parsing, math,
 * highlighting) happens here, so the same code will run inside Tauri later.
 */
const doc = mustFind("doc");
const status = mustFind("status");

let lastSource: string | null = null;

async function load(): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/doc", { cache: "no-store" });
  } catch {
    showStatus("Viewer stopped. Start mdview again and reload.");
    return;
  }
  if (!response.ok) {
    showStatus("File not found. Last rendered version is shown.");
    return;
  }
  const source = await response.text();
  if (source === lastSource) {
    hideStatus();
    return; // the save did not change the text; keep the page still
  }
  lastSource = source;

  const scrollY = window.scrollY;
  const started = performance.now();
  doc.innerHTML = renderMarkdown(source, { assetBase: "/assets" });
  requestAnimationFrame(() => window.scrollTo(0, scrollY));
  console.debug(`mdview: rendered in ${(performance.now() - started).toFixed(1)} ms`);
  hideStatus();
}

function connect(): void {
  const events = new EventSource("/events");
  events.addEventListener("message", (event: MessageEvent<string>) => {
    if (event.data === "changed") void load();
  });
  events.addEventListener("open", () => {
    // After a reconnect we may have missed a change: fetch once to be sure.
    void load();
  });
  events.addEventListener("error", () => {
    // The browser reconnects by itself; we only tell the user what is going on.
    showStatus("Connection to viewer lost — reconnecting…");
  });
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

void load();
connect();
