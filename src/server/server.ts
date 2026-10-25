import { basename, dirname, extname, resolve } from "node:path";
import { buildClient, KATEX_DIST, readIndexHtml } from "./client-bundle.ts";
import { resolveAsset } from "./paths.ts";
import { watchDocument } from "./watch.ts";

/**
 * HTTP server for one Markdown document, bound to 127.0.0.1 only.
 *
 *   GET /               page shell (index.html with the file name filled in)
 *   GET /client.js      browser bundle (renderer + live reload)
 *   GET /client.css     application styles
 *   GET /doc            raw Markdown text (UTF-8) — the browser renders it
 *   GET /events         Server-Sent Events: "changed" when the file is saved
 *   GET /assets/<path>  files next to the document (images), confined to its folder
 *   GET /vendor/katex/* KaTeX css and fonts
 */
export interface ServerOptions {
  file: string;
  port: number;
  /** Minify the client bundle (slower start, smaller payload). Default true. */
  minify?: boolean;
  /** Rebuild the client on every request — for working on mdview itself. */
  dev?: boolean;
}

export interface RunningServer {
  url: string;
  port: number;
  stop: () => void;
  /** Number of browsers currently listening for live reload. */
  readonly clients: number;
}

const HEARTBEAT_MS = 15_000;

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const file = resolve(options.file);
  const dir = dirname(file);
  const title = basename(file);

  let bundle = await buildClient(options.minify ?? true);
  const currentBundle = async () => {
    if (options.dev) bundle = await buildClient(false);
    return bundle;
  };
  const pageShell = async () => (await readIndexHtml()).replaceAll("{{title}}", escapeHtml(title));
  let indexHtml = await pageShell();

  const subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const encoder = new TextEncoder();
  const broadcast = (event: string) => {
    const chunk = encoder.encode(`data: ${event}\n\n`);
    for (const controller of subscribers) {
      try {
        controller.enqueue(chunk);
      } catch {
        subscribers.delete(controller);
      }
    }
  };

  const stopWatching = watchDocument(file, () => broadcast("changed"));
  const heartbeat = setInterval(() => broadcast("ping"), HEARTBEAT_MS);

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port,
    // Bun drops a connection after 10 s without traffic by default, which
    // silently killed the /events stream. Local, single-user server: no timeout.
    idleTimeout: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname;

      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", { status: 405 });
      }
      if (path === "/") {
        if (options.dev) indexHtml = await pageShell();
        return text(indexHtml, "text/html; charset=utf-8");
      }
      if (path === "/client.js") {
        return text((await currentBundle()).js, "text/javascript; charset=utf-8");
      }
      if (path === "/client.css") {
        return text((await currentBundle()).css, "text/css; charset=utf-8");
      }
      if (path === "/doc") return serveDocument(file);
      if (path === "/events") return serveEvents();
      if (path.startsWith("/assets/")) {
        return serveFile(resolveAsset(dir, path.slice("/assets".length)));
      }
      if (path.startsWith("/vendor/katex/")) {
        return serveFile(resolveAsset(KATEX_DIST, path.slice("/vendor/katex".length)));
      }
      return new Response("Not found", { status: 404 });
    },
  });

  function serveEvents(): Response {
    let own: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        own = controller;
        subscribers.add(controller);
        controller.enqueue(encoder.encode("data: hello\n\n"));
      },
      cancel() {
        if (own) subscribers.delete(own);
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
      },
    });
  }

  return {
    url: `http://127.0.0.1:${server.port}/`,
    port: server.port ?? options.port,
    get clients() {
      return subscribers.size;
    },
    stop() {
      clearInterval(heartbeat);
      stopWatching();
      for (const controller of subscribers) {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
      subscribers.clear();
      server.stop(true);
    },
  };
}

async function serveDocument(file: string): Promise<Response> {
  const handle = Bun.file(file);
  if (!(await handle.exists())) {
    return new Response("Document not found", { status: 404 });
  }
  // Non-UTF-8 bytes become U+FFFD instead of failing: the user still sees the text.
  const bytes = await handle.bytes();
  const content = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  return text(content, "text/markdown; charset=utf-8");
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".css": "text/css; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
};

async function serveFile(path: string | null): Promise<Response> {
  if (path === null) return new Response("Forbidden", { status: 403 });
  const handle = Bun.file(path);
  if (!(await handle.exists())) return new Response("Not found", { status: 404 });
  const type = MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
  return new Response(handle, {
    headers: { "content-type": type, "cache-control": "no-cache" },
  });
}

function text(body: string, contentType: string): Response {
  return new Response(body, {
    headers: { "content-type": contentType, "cache-control": "no-store" },
  });
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
