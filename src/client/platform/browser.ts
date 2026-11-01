import type { Document, Platform } from "./types.ts";

/** Browser stage: the Bun server serves the document and pushes change events. */
export function createBrowserPlatform(): Platform {
  let lostHandler: ((lost: boolean) => void) | undefined;

  async function fetchDocument(open?: string): Promise<Document | null> {
    let response: Response;
    try {
      const query = open === undefined ? "" : `?open=${encodeURIComponent(open)}`;
      response = await fetch(`/doc${query}`, { cache: "no-store" });
    } catch {
      lostHandler?.(true);
      return null;
    }
    if (!response.ok) return null;
    return {
      path: decodeURIComponent(response.headers.get("x-doc-path") ?? ""),
      name: decodeURIComponent(response.headers.get("x-doc-name") ?? document.title),
      text: await response.text(),
    };
  }

  return {
    assetBase: "/assets",
    initial: () => fetchDocument(),
    reload: () => fetchDocument(),
    openPath: (path) => fetchDocument(path),
    openLink: (href) => fetchDocument(href),
    openExternal(url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return Promise.resolve();
    },
    watch(onChange) {
      const events = new EventSource("/events");
      events.addEventListener("message", (event: MessageEvent<string>) => {
        if (event.data === "changed") onChange();
      });
      // After a reconnect we may have missed a change: fetch once to be sure.
      events.addEventListener("open", () => {
        lostHandler?.(false);
        onChange();
      });
      // The browser reconnects by itself; we only tell the user what is going on.
      events.addEventListener("error", () => lostHandler?.(true));
    },
    onConnectionLost(handler) {
      lostHandler = handler;
    },
  };
}
