/**
 * Names for files the user creates. The save dialog hands back whatever was typed,
 * so a bare "notes" becomes "notes.md" here; the shell then refuses any other
 * extension than the Markdown and text ones.
 */
export function withMarkdownExtension(path: string): string {
  const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${path}.md`; // none, or a dot file such as ".notes"
  if (dot === name.length - 1) return `${path}md`; // "notes." typed with the dot
  return path;
}

/** A file of that name in the folder of `from`; just the name when `from` has no folder. */
export function siblingPath(from: string, name: string): string {
  const cut = Math.max(from.lastIndexOf("/"), from.lastIndexOf("\\"));
  return cut === -1 ? name : from.slice(0, cut + 1) + name;
}
