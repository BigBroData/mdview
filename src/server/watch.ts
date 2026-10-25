import { watch } from "node:fs";
import { basename, dirname } from "node:path";

/**
 * Calls `onChange` when the document changes. Watches the *directory* rather
 * than the file: editors such as gedit save atomically (write temp file, then
 * rename over the original), which makes a watcher on the file itself go blind.
 * Events are debounced so one save produces one reload.
 */
export function watchDocument(filePath: string, onChange: () => void, debounceMs = 60): () => void {
  const dir = dirname(filePath);
  const name = basename(filePath);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const watcher = watch(dir, { persistent: true }, (_event, changed) => {
    // `changed` may be null on some platforms; then be conservative and reload.
    if (changed !== null && changed !== undefined && changed.toString() !== name) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  });

  return () => {
    if (timer) clearTimeout(timer);
    watcher.close();
  };
}
