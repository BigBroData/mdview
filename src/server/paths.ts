import { resolve, sep } from "node:path";

/**
 * Maps a URL path (already stripped of the `/assets` prefix) to a file inside
 * `rootDir`. Returns null when the path escapes the root or is malformed.
 * This is the only place that decides which files the server may serve.
 */
export function resolveAsset(rootDir: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  // Windows drive letters and UNC paths are never valid asset names.
  if (/^\/*[a-zA-Z]:/.test(decoded) || /^\/*\\\\/.test(decoded)) return null;

  const root = resolve(rootDir);
  const target = resolve(root, `.${decoded.startsWith("/") ? decoded : `/${decoded}`}`);
  if (target === root) return null;
  if (!target.startsWith(root + sep)) return null;
  return target;
}
