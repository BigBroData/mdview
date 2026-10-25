import type { Env, MarkdownIt, StateCore, Token } from "markdown-it";

/**
 * Rewrites relative image sources so the browser requests them through the
 * viewer (`env.assetBase + "/" + relativePath`). Absolute URLs, anchors,
 * data URIs and root-relative paths are left untouched.
 */
export interface AssetEnv extends Env {
  assetBase?: string;
}

const ABSOLUTE_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/; // http:, https:, data:, file:, mailto: ...

export function isRelativeAsset(src: string): boolean {
  if (src === "" || src.startsWith("#") || src.startsWith("/") || src.startsWith("//"))
    return false;
  return !ABSOLUTE_RE.test(src);
}

export function rewriteAssetUrl(src: string, assetBase: string): string {
  // Normalise "./img/a.png" -> "img/a.png"; keep the rest as is.
  const trimmed = src.replace(/^\.\//, "");
  const segments = trimmed.split("/").map((s) => encodeURIComponent(decodeSafe(s)));
  return `${assetBase}/${segments.join("/")}`;
}

function decodeSafe(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function walk(tokens: Token[], assetBase: string): void {
  for (const token of tokens) {
    if (token.type === "image") {
      const src = token.attrGet("src");
      if (typeof src === "string" && isRelativeAsset(src)) {
        token.attrSet("src", rewriteAssetUrl(src, assetBase));
      }
    }
    if (token.children) walk(token.children, assetBase);
  }
}

export function assetUrlsPlugin(md: MarkdownIt): void {
  md.core.ruler.push("asset_urls", (state: StateCore) => {
    const env = state.env as AssetEnv | undefined;
    const assetBase = env?.assetBase;
    if (!assetBase) return true;
    walk(state.tokens, assetBase.replace(/\/$/, ""));
    return true;
  });
}
