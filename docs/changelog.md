# Changelog

## 0.3.0 — version 3 (2026-11-03): editor polish, HTML and diagrams
- Added: new file (Ctrl+N), "Save as" (Ctrl+Shift+S), saving a copy of a file while reading, a draggable divider between the editor and
  the preview, an editor-only mode (Ctrl+Shift+E), highlighting of the line with the cursor, a tidier search bar.
- Added: two-way scrolling sync between the editor and the preview.
- Added: per-language code highlighting inside fences in the editor (17 languages, loaded on demand).
- Added: raw HTML in documents via DOMPurify with strict restrictions; Mermaid diagrams (` ```mermaid `) in theme colors.
- Added: the window remembers its size and whether it is maximized.
- Added: MIT license (© BigBroData): a `LICENSE` file, a "by BigBroData (MIT)" line on the start screen, the license text in the package (`/usr/share/doc/mdview/copyright`), "License" and "Contributing" sections in the README.
- Changed: the start screen became a "sheet" with a gradient from the demo picture (blue → lilac) and a folded top-right corner; the app icon sits to the left of the name.
- Changed: Ctrl+W on the last tab no longer closes the app (the start screen remains); quit with Ctrl+Q (it asks about unsaved changes).
- Added: F1 (or `?`) shows a window with all hotkeys over the document.
- Changed: the client build is split into chunks: heavy parts (diagrams, languages) are loaded only when needed.
- Installer: `mdview_0.3.0_amd64.deb`.
- Docs: all documentation is in English; the README was rewritten with screenshots and installation from source for any Linux; release notes in `docs/release-0.3.0.md`.
- Fixed: in the editor the whole text of a list was coloured like a keyword; now only the rule of a horizontal line is.

## 0.2.0 — version 2 (2026-11-02): editor
- Added: CodeMirror 6 editor with live preview (Ctrl+E), saving (Ctrl+S), protection against losing unsaved changes.
- Added: tabs and a single window per user (`mdview file.md` adds a tab to the open window).
- Added: themes as files (`~/.config/mdview/themes/*.css`, Ctrl+Shift+T) and a contents panel (Ctrl+Shift+O).
- Added: start screen with an open button and a list of all commands.
- Added: new file (Ctrl+N) and "Save as" (Ctrl+Shift+S).
- Added: editor: light highlighting of the line with the cursor, a tidier search and replace bar.
- Added: the divider between the editor and the preview is draggable; Ctrl+Shift+E leaves only the editor.
- Added: Ctrl+Shift+S while reading saves a copy of the file (including read-only files).
- Fixed: the file watcher kept reloading the document in a loop.
- Installer: `mdview_0.2.0_amd64.deb`.

## 0.1.0 — version 1 (2026-10-25 … 2026-11-01): viewer
- Markdown, KaTeX formulas, code highlighting, tables, images, MDX, search, heading strip, links and history,
  live reload, a Tauri 2 desktop window and a `.deb` package.
