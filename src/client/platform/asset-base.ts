/**
 * Where the Tauri shell serves files next to the document. Tauri exposes a
 * custom URI scheme as `scheme://localhost/` on Linux and macOS, but as
 * `http://scheme.localhost/` on Windows (documented in tauri::Builder).
 */
export const ASSET_SCHEME = "mdasset";

export function tauriAssetBase(userAgent: string): string {
  return /Windows/i.test(userAgent)
    ? `http://${ASSET_SCHEME}.localhost`
    : `${ASSET_SCHEME}://localhost`;
}

/** Collapses a burst of calls into one, `ms` after the last call. */
export function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}
