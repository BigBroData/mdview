import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildClient, KATEX_DIST, readIndexHtml } from "./client-bundle.ts";

/** Writes a static copy of the client to dist/ — the input for the Tauri stage. */
const out = join(import.meta.dir, "..", "..", "dist");
await mkdir(join(out, "vendor", "katex"), { recursive: true });
const bundle = await buildClient(true);
await Bun.write(join(out, "client.js"), bundle.js);
await Bun.write(join(out, "client.css"), bundle.css);
await Bun.write(join(out, "index.html"), (await readIndexHtml()).replaceAll("{{title}}", "mdview"));
await cp(join(KATEX_DIST, "katex.min.css"), join(out, "vendor", "katex", "katex.min.css"));
await cp(join(KATEX_DIST, "fonts"), join(out, "vendor", "katex", "fonts"), { recursive: true });
const size = (s: string) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`dist/client.js ${size(bundle.js)}, dist/client.css ${size(bundle.css)} -> ${out}`);
