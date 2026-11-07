# Backlog

Deliberately cut from the first version. The order is approximate.

## Stage 2 — desktop app (built and verified on Pop!_OS 22.04)
- Checked manually by the owner: package installation, double click, drag and drop, Wayland.
- Tabs are done (2026-11-02). Not done: dragging tabs, "next to the active one" ordering, tabs in the browser stage with several windows, a separate window on demand (Ctrl+N).

## Rendering
- MDX: show the values of `export const meta` and simple `{expressions}`.
- Footnotes (`[^1]`), `==text==` highlighting, emoji shortcodes — on request.
- Set of highlighting languages: currently `lib/common` (~37 languages, ~ half of the bundle); if needed, an explicit list.

## Quality
- Incremental redraw (only changed blocks) — if flicker becomes noticeable on large files.
- Interface localization (currently three service messages in English).
- Printing/export to PDF via the print dialog.

## Editor (versions 2 and 3 are done; next)
- Spell checking on demand.
- More languages in editor highlighting (currently 17) and a shared highlighting set in the preview — on request.
- Editing in the browser stage (Bun server) — if needed.
