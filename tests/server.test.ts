import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type RunningServer, startServer } from "../src/server/server.ts";

/** Integration test: a real server on a random port, a real temp document. */
let dir: string;
let file: string;
let server: RunningServer;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "mdview-test-"));
  file = join(dir, "doc.md");
  await writeFile(file, "# Hello\n\n![p](./pic.png)\n", "utf8");
  await writeFile(join(dir, "pic.png"), "PNG-bytes");
  await writeFile(join(dir, "..", "mdview-test-outside.txt"), "secret");
  server = await startServer({ file, port: 0, minify: false });
});

afterAll(async () => {
  server.stop();
  await rm(dir, { recursive: true, force: true });
  await rm(join(dir, "..", "mdview-test-outside.txt"), { force: true });
});

const get = (path: string) => fetch(new URL(path, server.url));

describe("routes", () => {
  test("page shell carries the file name as title", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("<title>doc.md</title>");
  });

  test("client bundle and styles are served", async () => {
    const js = await get("/client.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("javascript");
    const css = await get("/client.css");
    expect(css.status).toBe(200);
    expect(await css.text()).toContain("--bg:");
  });

  test("/doc returns the raw markdown", async () => {
    const res = await get("/doc");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("# Hello\n\n![p](./pic.png)\n");
  });

  test("assets next to the document are served with a mime type", async () => {
    const res = await get("/assets/pic.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(await res.text()).toBe("PNG-bytes");
  });

  test("files outside the document folder are refused", async () => {
    // Browsers and fetch() normalise "..", so send the raw bytes ourselves.
    // The server may answer 403 (resolver refused) or 404 (URL parser folded
    // the ".." away first); what matters is that the file never leaks.
    for (const path of [
      "/assets/../mdview-test-outside.txt",
      "/assets/%2e%2e/mdview-test-outside.txt",
      "/assets/..%2fmdview-test-outside.txt",
      "/assets/sub/../../mdview-test-outside.txt",
    ]) {
      const raw = await rawGet(server.port, path);
      expect(raw).toMatch(/^HTTP\/1\.1 (403|404)/);
      expect(raw).not.toContain("secret");
    }
    const missing = await get("/assets/nope.png");
    expect(missing.status).toBe(404);
  });

  test("katex stylesheet and fonts are reachable", async () => {
    const css = await get("/vendor/katex/katex.min.css");
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toContain("text/css");
    const font = await get("/vendor/katex/fonts/KaTeX_Main-Regular.woff2");
    expect(font.status).toBe(200);
    expect(font.headers.get("content-type")).toBe("font/woff2");
  });

  test("unknown routes and methods", async () => {
    expect((await get("/nothing")).status).toBe(404);
    const post = await fetch(new URL("/doc", server.url), { method: "POST" });
    expect(post.status).toBe(405);
  });
});

describe("live reload", () => {
  test("saving the file (including atomic rename) produces a 'changed' event", async () => {
    const events = await fetch(new URL("/events", server.url));
    expect(events.headers.get("content-type")).toContain("text/event-stream");
    const reader = events.body?.getReader();
    if (!reader) throw new Error("no body");
    const decoder = new TextDecoder();

    const readUntil = async (needle: string, timeoutMs = 3000): Promise<string> => {
      let buffer = "";
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline && !buffer.includes(needle)) {
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`timeout waiting for ${needle}`)),
              deadline - Date.now(),
            ),
          ),
        ]);
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value);
      }
      return buffer;
    };

    expect(await readUntil("hello")).toContain("data: hello");
    expect(server.clients).toBe(1);

    // gedit-style atomic save: write a temp file, rename over the original.
    const tmp = join(dir, ".doc.md.tmp");
    await writeFile(tmp, "# Changed\n", "utf8");
    await rename(tmp, file);
    expect(await readUntil("changed")).toContain("data: changed");

    const doc = await (await get("/doc")).text();
    expect(doc).toBe("# Changed\n");

    await reader.cancel();
  });

  test("the event stream survives more than 10 s of silence (Bun's default idle timeout)", async () => {
    const events = await fetch(new URL("/events", server.url));
    const reader = events.body?.getReader();
    if (!reader) throw new Error("no body");
    await reader.read(); // "hello"
    await Bun.sleep(21_000);
    // Still connected: a change must arrive on the same stream.
    await writeFile(file, "# After silence\n", "utf8");
    // Heartbeat pings may arrive first; the change must follow on the same stream.
    let received = "";
    for (let i = 0; i < 5 && !received.includes("changed"); i++) {
      const chunk = await reader.read();
      expect(chunk.done).toBe(false);
      received += new TextDecoder().decode(chunk.value);
    }
    expect(received).toContain("data: changed");
    await reader.cancel();
  }, 40_000);

  test("a deleted document answers 404 instead of crashing", async () => {
    await rm(file);
    expect((await get("/doc")).status).toBe(404);
    await writeFile(file, "# Back\n", "utf8");
    expect(await (await get("/doc")).text()).toBe("# Back\n");
  });

  test("invalid UTF-8 bytes are replaced, not fatal", async () => {
    await writeFile(file, Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a])); // "# \xff\xfe\n"
    const text = await (await get("/doc")).text();
    expect(text).toBe("# ��\n");
  });
});

/** Minimal raw HTTP GET so the path reaches the server without URL normalisation. */
async function rawGet(port: number, path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let data = "";
    Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        open(socket) {
          socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`);
        },
        data(_socket, chunk) {
          data += chunk.toString();
        },
        close() {
          resolvePromise(data);
        },
        error(_socket, error) {
          reject(error);
        },
      },
    }).catch(reject);
  });
}

describe("following links between documents", () => {
  let linkDir: string;
  let linkServer: RunningServer;
  const linkGet = (path: string, headers?: Record<string, string>) =>
    fetch(new URL(path, linkServer.url), { headers });

  beforeAll(async () => {
    linkDir = await mkdtemp(join(tmpdir(), "mdview-links-"));
    await writeFile(join(linkDir, "a.md"), "# A\n\n[b](sub/b.md)\n", "utf8");
    await mkdir(join(linkDir, "sub"));
    await writeFile(join(linkDir, "sub", "b.md"), "# B\n\n[back](../a.md)\n", "utf8");
    await writeFile(join(linkDir, "notes.txt"), "not markdown", "utf8");
    linkServer = await startServer({ file: join(linkDir, "a.md"), port: 0, minify: false });
  });

  afterAll(async () => {
    linkServer.stop();
    await rm(linkDir, { recursive: true, force: true });
  });

  test("/doc reports the path and name of the document it serves", async () => {
    const res = await linkGet("/doc");
    expect(decodeURIComponent(res.headers.get("x-doc-path") ?? "")).toBe(join(linkDir, "a.md"));
    expect(decodeURIComponent(res.headers.get("x-doc-name") ?? "")).toBe("a.md");
  });

  test("open= switches to a linked file and resolves further links from there", async () => {
    const opened = await linkGet("/doc?open=sub%2Fb.md");
    expect(opened.status).toBe(200);
    expect(await opened.text()).toContain("# B");
    expect(decodeURIComponent(opened.headers.get("x-doc-name") ?? "")).toBe("b.md");
    // now the current folder is sub/, so ../a.md resolves
    const back = await linkGet("/doc?open=..%2Fa.md");
    expect(await back.text()).toContain("# A");
    // a plain /doc shows the file we are on
    expect(await (await linkGet("/doc")).text()).toContain("# A");
  });

  test("only Markdown files that exist can be opened", async () => {
    expect((await linkGet("/doc?open=notes.txt")).status).toBe(400);
    expect((await linkGet("/doc?open=missing.md")).status).toBe(404);
  });

  test("a request from another site is refused", async () => {
    const res = await linkGet("/doc?open=sub%2Fb.md", { "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(403);
  });
});
