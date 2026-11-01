/**
 * What a click on a link inside the document should do. Pure, so it is
 * testable without a DOM.
 */
export type Link =
  | { kind: "anchor"; id: string }
  | { kind: "document"; path: string; fragment: string }
  | { kind: "external"; url: string }
  | { kind: "other" };

/** Files the viewer itself opens when they are linked from another document. */
export const DOCUMENT_EXTENSIONS = [".md", ".markdown", ".mdown", ".mdx"] as const;

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const EXTERNAL_SCHEMES = ["http:", "https:", "mailto:"];

export function isDocumentPath(path: string): boolean {
  const lower = path.toLowerCase();
  return DOCUMENT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function classifyLink(href: string): Link {
  const trimmed = href.trim();
  if (trimmed.startsWith("#")) return { kind: "anchor", id: decodeSafe(trimmed.slice(1)) };
  if (SCHEME_RE.test(trimmed)) {
    const scheme = trimmed.slice(0, trimmed.indexOf(":") + 1).toLowerCase();
    return EXTERNAL_SCHEMES.includes(scheme)
      ? { kind: "external", url: trimmed }
      : { kind: "other" };
  }
  if (trimmed.startsWith("//")) return { kind: "other" };
  const hash = trimmed.indexOf("#");
  const rawPath = hash === -1 ? trimmed : trimmed.slice(0, hash);
  const path = decodeSafe(rawPath.split("?")[0] ?? "");
  if (path === "" || !isDocumentPath(path)) return { kind: "other" };
  return {
    kind: "document",
    path,
    fragment: hash === -1 ? "" : decodeSafe(trimmed.slice(hash + 1)),
  };
}

/**
 * Resolves a relative link against the absolute path of the document that
 * contains it. Understands both `/` and `\` so it works for the Windows
 * build too; the result uses the separator of `base`.
 */
export function resolveRelative(base: string, relative: string): string {
  const separator = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  const baseParts = base.split(/[\\/]/);
  baseParts.pop(); // the document's own file name
  const isAbsolute = relative.startsWith("/");
  const parts = isAbsolute ? [""] : baseParts;
  // keep the root ("" on POSIX, "C:" on Windows) out of reach of ".."
  const rootLength = isAbsolute
    ? 1
    : baseParts[0] === "" || /^[a-zA-Z]:$/.test(baseParts[0] ?? "")
      ? 1
      : 0;
  const out = parts.slice(0, rootLength);
  for (const part of [...parts.slice(rootLength), ...relative.split(/[\\/]/)]) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length > rootLength) out.pop();
    } else {
      out.push(part);
    }
  }
  return out.join(separator);
}
