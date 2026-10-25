import { dirname, join } from "node:path";

/**
 * Bundles the browser client (TypeScript + vendor libraries) with Bun's bundler.
 * Used in memory by the dev server and written to disk by `bun run build`.
 */
export interface ClientBundle {
  js: string;
  css: string;
}

const CLIENT_DIR = join(import.meta.dir, "..", "client");
export const KATEX_DIST = dirname(Bun.resolveSync("katex/dist/katex.min.css", import.meta.dir));

export async function buildClient(minify = true): Promise<ClientBundle> {
  const result = await Bun.build({
    entrypoints: [join(CLIENT_DIR, "main.ts")],
    target: "browser",
    format: "esm",
    minify,
    sourcemap: "none",
  });
  if (!result.success) {
    const messages = result.logs.map((l) => l.message).join("\n");
    throw new Error(`Client bundle failed:\n${messages}`);
  }
  const jsArtifact = result.outputs.find((o) => o.kind === "entry-point");
  if (!jsArtifact) throw new Error("Client bundle produced no entry point");

  const css = await Bun.file(join(CLIENT_DIR, "styles", "app.css")).text();
  return { js: await jsArtifact.text(), css };
}

export async function readIndexHtml(): Promise<string> {
  return Bun.file(join(CLIENT_DIR, "index.html")).text();
}
