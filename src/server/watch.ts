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

  const watcher = watch(dir, { persistent: true }, (event, changed) => {
    // A `change` names the file that changed, so other files can be ignored.
    // A `rename` is reported for the *source* of an atomic save on Linux
    // (".doc.md.tmp" moved over "doc.md"), so any rename in the folder may
    // concern us: reload, and let the client drop unchanged text. `changed`
    // may also be null on some platforms; then reload as well.
    const concernsFile =
      event === "rename" ||
      changed === null ||
      changed === undefined ||
      changed.toString() === name;
    if (!concernsFile) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  });

  return () => {
    if (timer) clearTimeout(timer);
    watcher.close();
  };
}
