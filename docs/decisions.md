# Architecture Decisions

Format: decision, why, what was rejected. New entries go at the bottom.

## 2026-10-25 · Path: browser skeleton → Tauri

**Decision.** Stage 1 is a Bun server plus a page in the browser. Stage 2 is the same frontend
inside Tauri 2 (the system WebKitGTK on Linux), shipped as a .deb package.

**Why.** The owner needs a small size, low memory use and fast rendering with
elegant typography. Typography is easiest to achieve with HTML/CSS; Tauri provides
a window without Chromium (a binary of about 10 MB). The browser stage makes it possible to debug
rendering and style on a Windows machine without a Linux build.

**Rejected.** Electron (200+ MB), native GTK (no ready-made Markdown renderer,
an editor with preview is too expensive), TUI (wrong aesthetic), egui (appearance).

## 2026-10-25 · Markdown is rendered in the browser, not on the server

**Decision.** The server serves the raw `.md` (`GET /doc`); parsing, formulas and highlighting
happen in the client bundle (`src/render/*`, code shared by the tests and the browser).

**Why.** Tauri will have no server: Rust will hand over the file text, and the same
webview code will do the rendering. Server-side rendering would have had to be rewritten. Speed: parsing
a document with 2000 sections takes tens of milliseconds.

**Rejected.** Server-side rendering that sends HTML (a double implementation at stage 2).

## 2026-10-25 · Libraries

markdown-it 15 (CommonMark + GFM tables/strikethrough, mature plugin ecosystem),
@vscode/markdown-it-katex + KaTeX 0.19 (formulas without a network, used in VS Code),
highlight.js 11 `lib/common` (highlighting without building grammars). Checkboxes and
image redirection are custom plugins of ~40 lines each: the ready-made plugins for
task lists have not been updated since 2022.

**Rejected.** remark/unified (more code and dependencies for the same result),
shiki (more accurate, but heavier and requires WASM), Mermaid (not needed according to the requirements;
if it becomes necessary, load it lazily and only when a ` ```mermaid ` block is present).

## 2026-10-25 · Raw HTML is disabled (`html: false`)

Tags in a document are shown as text. Safe by default; GitHub allows
limited HTML through a sanitizer, which is a separate task in the backlog.

## 2026-10-25 · Watching the folder, not the file

gedit and many editors save atomically (temporary file + rename), and
a watcher on the file itself goes blind after that. The folder is watched instead, events are filtered by
name and coalesced within 60 ms. Covered by an integration test.

## 2026-10-25 · Images via `/assets/<path>`, restricted to the document folder

Relative image `src` values are rewritten to `/assets/...`; `resolveAsset`
refuses everything that leaves the document folder (`..`, absolute paths, Windows
drives, UNC, `%00`). This is the only place that decides which files are served.

## 2026-10-25 · Theme = a set of CSS variables

All colors and fonts are declared on `:root` at the top of `app.css`; the dark theme is
an override of the same variables under `prefers-color-scheme: dark`. Loading
user theme files is in the backlog; the format is already defined.

## 2026-10-25 · Tables: column hints from the renderer, not "clever" CSS

**Decision.** The `table-columns` plugin measures the longest cell of each column and
sets a class: `col-short` (≤16 characters, no line breaks), `col-prose` (≥80,
minimum 16rem), `col-long` (≥300, minimum 24rem). "Tail" rows (GFM turns
a wrapped line under a table into a row with a single cell) are skipped
during measuring and get no classes. The table stays within the width of the text column;
if it does not fit, it scrolls inside its own block (`.table-wrap`).

**Why.** On the owner's real documents (hypothesis registers with cells of
1500 characters each), plain CSS squeezed the prose column to 140 px, leaving one word per line.
CSS does not know the content length; the renderer does.

**Rejected.** Widening tables beyond the text column (`fit-content` +
centering): `margin-left: 50%` halved the available width, and
`max-content` always stretched tables with prose to the maximum. GitHub-like
behavior is simpler and more predictable.

## 2026-10-25 · `idleTimeout: 0` on Bun.serve

By default Bun closes a connection after 10 s without traffic; the `/events` stream
was silently dropped and the browser showed "connection lost". For a local
single-user server the timeout is disabled; the 15 s heartbeat was kept.
The regression test waits through 21 s of silence and checks that the event arrives over the same
connection.

## 2026-10-25 · The `--dev` flag

Rebuilds the client on every request for `/client.js` and `/client.css`, so that
styles can be edited without a restart. Only for working on mdview; off by default.

## 2026-10-25 · Stage 2: Tauri 2 on top of the same client

**Decision.** `src-tauri/` is a thin shell: the commands `initial_document`,
`open_document`, `read_document`; watching via `notify` on the file's folder;
images via a custom `mdasset` scheme with the same "document folder only"
restriction (`assets.rs`, with tests); the open dialog is the `dialog` plugin. The client
gained a `platform/` layer (browser | tauri); everything else is shared.

**Why.** The client has already been debugged in the browser; there is no need to duplicate the logic in Rust.
A custom scheme instead of the built-in `asset:` protocol: the built-in one requires
extending the scope dynamically and exposes everything in the scope; the custom one covers
exactly one folder, checked in a single place.

**File association.** Tauri's default .desktop template produces `Exec={{exec}}`
without `%F`, so a double click would not pass the path. The custom template
`src-tauri/mdview.desktop` adds `%F`; `MimeType` is taken from
`bundle.fileAssociations`. The path is read from `std::env::args()`.

**CSP.** KaTeX emits inline `style=` attributes, hence `style-src 'unsafe-inline'`;
images use `mdasset:` (Linux) and `http://mdasset.localhost` (Windows).

**Not verified on this machine.** There is no Rust toolchain here: the Rust code was checked against the
Tauri 2.12 / notify 8 documentation but was not compiled. The first build on
Linux may need minor fixes; `cargo test` in `src-tauri` is the first step.

**Rejected.** tauri-plugin-fs with its watch (a wide scope for a single feature),
tauri-plugin-cli (`std::env::args` is enough), AppImage and Flatpak (the owner
is fine with a .deb).

## 2026-10-25 · First Linux build: what was found

- The Rust part compiled without changes; `cargo test` 3/3.
- Bun `fs.watch` on Linux reports an atomic save only as a `rename` of the
  temporary file (`.doc.md.tmp`), not of the target. For this reason any `rename`
  in the folder is now treated as a change; the client itself drops the re-render
  if the text is the same. The same rule applies in the Rust watcher (`notify`): the
  filter by name is applied only to `Modify(Data)`.
- A backslash is an ordinary filename character on Linux and a separator on Windows.
  The image resolver rejects it everywhere: the behavior is the same and the test
  passes on both OSes.
- The package identifier must not end in `.app` (a `tauri build` warning).
- Checking the window without screen access: a nested Xephyr X server on `:99` and
  `import -window root` (ImageMagick). The session on the monitor was locked, and
  screenshots from `:1` were black. This is a debugging technique, not part of the product.

## 2026-10-25 · Column width, text size and the heading strip

**Decision.** Three column widths (44rem / 64rem / unlimited) and a text size of
12–28 px, switched with keys and stored in `localStorage` (`settings.ts`,
pure functions + an injectable storage). Navigation is a heading strip at the right
edge (`outline.ts`): the geometry is pure functions with tests, the DOM part is
separate.

**Why.** The owner saw the margins at the edges as an "A4 sheet"; the line-length
limit was kept as the default for readability, but became a choice. Instead of
"pages" as in PDF (Markdown is a flow, and pages would break tables and code) and
instead of the gedit overview map (a shrunken copy of the text is hard to read),
heading ticks were used: on long documents they give the same fast scrolling, but
a meaningful one.

**Lesson.** Updating the strip must not be tied to `requestAnimationFrame`: in a
hidden tab it does not fire, and the strip stayed empty. The update is synchronous,
right after rendering; `ResizeObserver` picks up shifts caused by image loading.

**Rejected.** Pagination; an overview thumbnail map (expensive in memory, hard to
read); a contents panel at the side (it eats the width that the owner asked to
free up — possible later as an option).

## 2026-10-25 · Heading strip: nothing pinned over the scroll

**What happened.** The owner noticed that the strip lay over the GNOME overlay
scrollbar and that scrolling had become sluggish. The first measurement on Linux
showed "without the strip 4 ticks, with the strip 280" — this was a mistake: in the
run without the strip the window did not get focus and did not scroll. The benchmark
was rewritten to compare screenshots before and after and to prove that scrolling
took place. The honest result (80 page-sized scrolls, CPU of the WebKit web process,
software rendering in Xephyr): the build without the strip ~390 ticks, the new
structure ~340. The strip costs no more than an empty page. Whether scrolling is
faster on a real desktop with a GPU cannot be checked from here; the owner is the judge.

**Decision.** The window does not scroll at all: the document lives in `.scroller`
(`overflow-y: auto`), and the strip is a neighboring block in a flex row, not a
layer on top. There are no pinned elements (the hint/status is `absolute` in the
fixed `body`). The scrollbar stayed native and lives inside `.scroller`, the strip
is to the right of it, and there is no overlap. Scroll keys reach `.scroller`
through focus.

**Rejected.** Hiding the native scrollbar and making the strip the scrollbar
(`scrollbar-width: none`) — an intermediate variant from the same day: it deprived
the user of the native scrollbar for something that is solved by placing blocks
side by side.

**Lesson.** A benchmark that can "pass" while doing nothing is not a benchmark.
Any measurement of an interaction must check that the interaction took place.

## 2026-10-25 · Search in the document (Ctrl+F)

**Decision.** A custom panel (`search.ts`): matches are searched in the
concatenated text of the document's text nodes, so a phrase spanning formatting is
found; each match is wrapped in `<mark>` piece by piece over the text nodes. The
pure parts (`findMatches`, `segmentsFor`, `nextIndex`) are covered by tests.
Matches are shown as dots on the heading strip. KaTeX formulas are skipped: the
markup inside them breaks when `<mark>` is inserted, and the text there is
duplicated (MathML + HTML). The cap is 1000 matches, and the counter shows "1000+".

**Rejected.** The CSS Custom Highlight API (no DOM changes): support in WebKitGTK
varies unstably between versions, whereas `<mark>` works everywhere and is removed
before each new search. The built-in WebKit search (`webkit_find_controller`): it
gives no counter and no marks on the strip and would have required a separate
implementation in the browser stage.

## 2026-11-01 · Links, MDX, scaling by window width

**Links.** Clicks are intercepted by a single handler on the document; what to do
is decided by the pure `classifyLink` (`links.ts`): anchor, neighboring document,
external link, other (ignored — `javascript:`, `file:`, `//host`). Heading
identifiers are the same as on GitHub (`heading-ids.ts`: lowercase, punctuation
dropped, spaces to hyphens, letters of any script kept, repeats get `-1`, `-2`).
A relative path is resolved on the page (`resolveRelative`) from the path of the
current document, so the Rust side did not change: it still opens the file by its
absolute path. In the browser stage the server does the same: `/doc?open=` (only
Markdown extensions, existing files, rejected if `Sec-Fetch-Site` is not
"same-origin", so that a foreign page cannot switch the viewer). The back/forward
history (`history.ts`) stores the path and the scroll position; an anchor inside a
document is also a history entry. Web links are opened by the `open_external`
command (xdg-open), only `http`, `https`, `mailto`: a document must not launch
arbitrary things.

**Images over the network.** `img-src https:` was added to the window CSP. The
cost: a document can trigger a request to a foreign server (a tracking pixel).
Accepted: without README badges half of the documents look broken; `http:` remains
closed.

**MDX.** The viewer cannot and must not execute components, so MDX is shown
honestly but quietly: `import`/`export` lines are a code block, JSX tags on
separate lines and inside paragraphs are `.mdx-tag` chips, and everything else is
ordinary Markdown. The block and inline rules were written in-house (`mdx.ts`),
without an MDX compiler: a couple of hundred lines versus megabytes of
dependencies. `<https://…>` autolinks, comparisons and code are not mistaken for
tags. The mode is enabled by the `.mdx` extension. The YAML front matter is
supported for plain Markdown as well.

**Scaling by window width.** Text size = the reader's choice + an addition from the
window width (`clamp(0, (100vw − 1000px) × 0.006, 8px)`). Everything else (column,
strip, search, margins) is set in `rem`, so it follows the text on its own.
Verified at 1920 and 2560 in the preview window: the column takes ~50% and ~45% of
the width instead of ~39% and ~29%. Rejected: changing only the column width (the
line becomes too long) and recalculating in JS on resize (extra code for something
CSS can do).

## 2026-11-01 · Hotkeys by physical key, not by character

**What happened.** The owner reported that after double-clicking a second file (two
windows) Ctrl+F does not open the panel in either window. Reproduced on the
installed version in Xephyr with a real D-Bus bus: two processes, two windows (the
application is not unique, a second launch is not forwarded to the first). Ctrl+F
works with the English layout and does not with the Russian one: `event.key`
arrives as the Cyrillic "а" (the letter on the F key), while the code compared it
with "f". The number of windows had nothing to do with it: the new window simply
opened with a different layout. Ctrl+O and Ctrl+Shift+W would have failed in the
same way.

**Decision.** `keys.ts`: a key is named by `event.code` (`KeyF` → "f",
`Equal`/`NumpadAdd` → "+", `Digit0`/`Numpad0` → "0", etc.), and for the rest by
`event.key`. Verified in Xephyr: the new build opens the panel with the Russian
layout and with a second window open.

**Lesson.** Check hotkeys on the Russian layout; it is the owner's working layout.
## 2026-11-02 · Tabs and one window per user

**What was asked.** Instead of a separate window for every double click, open the file in a tab.

**Decision.** Two parts.
1. *Single instance.* The `tauri-plugin-single-instance` plugin (D-Bus on Linux): a second launch of
   `mdview file.md` does not open a window; it passes its arguments and working directory to the first instance and exits.
   The first window receives an `open-request` event with absolute paths, is unminimized and takes focus.
   Several files in one command open as tabs, and the first one is brought to the front.
2. *Tabs in the client.* `tabs.ts` is pure bookkeeping (a tab = path, name, **its own history**), `tabbar.ts` is
   the strip. A tab = the document it shows right now: following a link inside a tab changes
   its path. The Rust side still holds a single "current" document (its watching and its images folder),
   so switching a tab = `open_document` for its path (the file is re-read, which is what provides fresh text)
   plus restoring the scroll position. Watching covers only the active tab; the others are re-read when shown.
   Everything that changes the current document goes through a queue (`serial` in `main.ts`), otherwise fast clicks
   would overtake each other.

**Rules.** Ctrl+O, drag and drop, a second launch and Ctrl+click/middle click on a link to a document open a
tab (an already open file is not duplicated, its tab is brought to the front); a plain click on a link keeps the same
tab. There is no strip while there is only one document, so the familiar look is unchanged. Closing the last tab
closes the window (the `close_window` command). If, when a tab is closed, the next neighbour fails to open (the file was deleted), it is removed as well.

**Verified** in a real window (Xephyr, built package): a second launch stays a single process;
`C.md A.md` with `A.md` already open gives three tabs with no duplicate; Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PgUp/PgDn,
Ctrl+1/2/9; Ctrl+W (including on the Russian keyboard layout) and closing the last tab closes the window;
middle click on a tab closes it; Ctrl+click on a link opens a tab.

**Deferred.** A separate window on request, dragging tabs, background opening on Ctrl+click
(because of the single "current" document in Rust, a tab always comes to the front).
**Lesson.** Shift+Tab arrived with a different `key` ("ISO_Left_Tab"), so Tab, like the letters, is identified by `code`.

## 2026-11-02 · Themes as files

**What was asked.** Themes as separate files `~/.config/mdview/themes/*.css` and a switcher; themes must
be writable by an agent.

**Decision.** A theme = plain CSS that overrides the `:root` tokens (the format and the list of variables are in `docs/themes.md`).
- *Where they come from.* The host reads `*.css` from `$XDG_CONFIG_HOME/mdview/themes` (otherwise `~/.config/…`): the Rust command
  `list_themes` (`themes.rs`) in the window, the `GET /themes` route (`server/themes.ts`) in the browser stage; the rules
  are identical (up to 256 KiB, up to 50 files, no hidden files, name = file name without `.css`). Three themes (`sepia`, `dusk`,
  `contrast`) are built into the client (`themes-builtin.ts`) rather than shipped as files in the package: nothing has to be installed,
  and an example of the format is always next to the code. A user file with the same name replaces the built-in theme.
- *How they are applied.* A single `<style id="theme-css">` element at the end of `<head>`: at equal specificity it
  wins over `app.css`, including over the dark `@media (prefers-color-scheme: dark)` block. Therefore a theme must
  set the full set of tokens (so the system mode does not leak into it). An empty name = "System", that is, the
  application's own colors, light or dark depending on the system.
- *No flash.* The last applied CSS is stored in `localStorage`, and the next launch paints the page immediately,
  without waiting for the host's answer. The theme choice is stored next to the width and text size.
- *Switcher.* Ctrl+Shift+T: a list; arrows show a theme immediately, Enter keeps it, Esc restores the previous one,
  a click selects, and losing focus keeps the one shown. The files are re-read when the list opens and when focus returns
  to the window, so a theme an agent has just written is visible without a restart.
- *New token* `--on-accent` (text on an accent background: the current search match, the selected list item);
  previously a hard-coded `#fff` was used there, which is unreadable on light accents.

**Security.** A theme is a local user file, but the window CSP still forbids external fonts and `@import`;
through `url()` only `https` images are possible, as in the documents themselves.

**Verified** in a real window (Xephyr, built package, own `XDG_CONFIG_HOME`): the list shows "System", the three built-in themes
and the user theme "yours"; arrows change the background (contrast `#fff`, dusk `#2b303b`, forest `#1b2420`); Esc restores
the system `#1c1e21`; Enter keeps sepia and it survives a restart; a file written while the window is running
appears in the list and is shown immediately. Not verified: Wayland, a very long theme list (the list scrolls).
**Deferred.** Switching by time of day, a theme per document.

## 2026-11-02 · Contents panel

**What was asked.** A contents panel at the side as an option alongside the heading strip.

**Decision.** An optional column to the left of the text (`toc.ts`), toggled with Ctrl+Shift+O (the physical O key,
works on any layout); its state is stored in the settings next to the width, size and theme. The strip on the right stays
as it is: the panel is readable and shows "where am I", the strip gives an overview of proportions and search hits; together they do not interfere.
- *Structure.* A 16rem column is a sibling element in `.reader` (flex), not an overlay, so the text narrows rather than
  being covered. Below 640px it is hidden by CSS: a column next to the text is useless in a window that small.
- *Current section.* The pure function `currentHeading`: the last heading above the "reading line" (30% of the window height);
  at the bottom of the document, the last one, otherwise a short final section would never be marked. The panel scrolls itself
  so the marked item is visible (without `scrollIntoView`, which moves the page too).
- *Indentation* is computed from the topmost level of the document, at most three steps: a document that starts with `##` is not
  shifted to the right.
- *A click* follows the same path as an `#anchor` link: Alt+← returns to where the reader was (`jumpToAnchor`).
- The tooltip with the full title appears only on truncated items.

**Verified** in a window (Xephyr, built package): the panel shows four headings with indentation, a click on "Итоги" (Summary)
scrolls and marks the item, Alt+← returns to the top, the enabled state survives a restart, toggling works
on the Russian layout (Ctrl+Shift+Щ). Not verified: very long lists (hundreds of headings), Wayland.
**Deferred.** Collapsing nested sections, a resizable panel width.

## 2026-11-02 · Version 2 (0.2.0): editor

**What was asked.** An editor on CodeMirror 6; this is version 2, the installer `mdview_0.2.0_amd64.deb`.

**Decision.** An editing mode on top of tabs, with no separate window: Ctrl+E turns a tab into "editor on the left, preview
on the right"; Ctrl+E again returns to reading.
- *One CodeMirror for all tabs.* Each tab has its own `EditorState` (text, cursor, undo history); showing a tab =
  `setState` (`editing.ts`, `edit-session.ts`). The editor is loaded together with the client (bundle about +0.2 MB in the package: .deb 3.0 MB versus 2.85).
- *Editor colors and fonts use the same CSS variables*, so themes (`docs/themes.md`) style the editor too.
- *Preview.* The same renderer as for reading; top-level blocks get `data-line` (the `sourceLines` option, off by
  default, so the HTML for reading is unchanged). The preview scroll position is derived from the top visible line of the editor with
  interpolation between blocks (`previewScrollTop`, a pure function with tests); at the bottom of the editor the preview is at the bottom too.
  Re-rendering is delayed by 120 ms after an edit. A click on a contents item takes the editor to the heading as well.
- *What protects the user's work.* Only an existing Markdown/text file is written, not a read-only one, and only in UTF-8
  (otherwise replacement characters would be written in place of the original bytes): the checks are in Rust (`save.rs`), which also writes through a temporary file and
  `rename`, resolving symbolic links, preserving permissions and the BOM; CRLF is restored on save. A tab's edits do not vanish
  silently: closing a tab, leaving the editor and closing the window (Rust intercepts `CloseRequested` while the page reports
  `report_dirty`) ask "Save / Discard / Cancel" with the page's own dialog (identical in any environment, keyboard
  operable). An external change to the file while there are unsaved edits does not overwrite them: the first Ctrl+S warns, the second
  overwrites; without edits the buffer simply follows the disk (so an agent's edits are visible).
- *Links in the preview* open as new tabs while editing, and Alt+←/→ are disabled: navigating would replace the document being edited.
- *Layout.* Own shortcuts go by physical key (`keys.ts`); CodeMirror, however, matches by character, and with the Russian layout
  Ctrl+Z did not work. A non-Latin Ctrl chord is replayed under the Latin letter of the same key (`physicalKeyShortcuts`).

**A bug found along the way (present since v1).** The file watcher (`notify` 8: the inotify mask includes `OPEN`) treated any event other than
a data write as a reason to re-read the document; re-reading itself opened the file → a new event → a loop of about 16 reloads per second
(CPU and a reset of the status badge, noticeable only with tabs). Now an event must be substantive: creation, deletion,
rename, a write or the end of a write (`is_content_event`; opening, reading and attribute changes do not count), with tests.
**Lesson.** The visible symptom (the badge was not shown) was in one of the checks; the cause was found by tracing in the built window.

**Verified** in a window (Xephyr, built package): editing, Ctrl+S (into the file on disk), the "● " dot in the title and on the tab,
undo, the dialog (Esc cancels, "Discard" restores the previous text), a conflict with an external edit, following the disk without edits,
CRLF+BOM preserved byte for byte, a read-only file and `.rs` are not opened for editing, with an explanation, preview scrolling
following the editor and navigation via the contents, several tabs with unsaved edits (undo history survives
switching), the window close request (cancel, then "Discard all"), the Russian layout (typing, Ctrl+Я, Ctrl+Ы — the Cyrillic keys for Z and S).
Not verified: Wayland, very large files (>1 MB) and long editing sessions.
**Deferred.** See the "Editor" section in `docs/backlog.md`.

## New file and "Save as" (after 0.2.0, before installation)

**Task.** The "Markdown viewer and editor" tagline promised more than the editor could do: it only edited an existing file, and
creating a document was impossible.

**Decision.**
- *Ctrl+N* asks for a location and name through the system save dialog (the folder and the name `Untitled.md` are taken from the open tab), creates
  an empty file, opens it in a tab and switches the editor on immediately. *Ctrl+Shift+S* in the editor writes the text under another name,
  the tab moves to the new file, and the old one stays on disk as it was; Alt+← in that tab goes back to it.
- *Same protection, extended.* The rule "never write to a new path" was replaced by a narrower one: a new path is allowed only
  from the save dialog, with a name ending in `.md/.markdown/.mdown/.mdx/.txt` in an existing folder (`save.rs`: `create_document`,
  `write_document_as`). A new file is created through `create_new`, so an existing file (or a dangling link) is not overwritten;
  "Save as" over an existing file goes through the same checks as a regular save (not read-only, Markdown/text, BOM).
  A name without an extension gets `.md` on the page side (`paths.ts`); Rust rejects other extensions.
- *If the file is already open in another tab*, "Save as" onto it is refused with an explanation, to avoid ending up with two tabs of the same file.
- Dialog permissions: `dialog:allow-save` was added to `dialog:allow-open`. The start screen commands show "New file" and
  "Save as" only where they work.

**Verified** in the window (Xephyr, built package): Ctrl+N with a name without an extension gives `hello.md` and the editor; Save as over
an unsaved edit writes a copy, the original file stays untouched, the title has no dot; then Ctrl+S writes to the copy; Alt+←
returns to the original file; cancelling the dialog changes nothing; `bad.rs` and an existing name are rejected with a message, the file
is not affected. Tests: Rust 22 (3 new), Bun 159.
**Known rough edge.** For Ctrl+N on an existing name, the GTK dialog asks "Replace?", and only then does the application
refuse ("already exists"): the question is misleading, but the file is not harmed. It can only be removed with a custom dialog.
**Not verified:** Wayland, network and unusual folders.
**Editor appearance.** A faint band was added on the line with the cursor (`highlightActiveLine`, 5 % of the text colour) and the
search and replace panel was reworked (fields and quiet buttons in a row, options below them, a cross in the corner): all in theme colours.

## Editor divider, editor-only mode and copy while reading (after 0.2.0, before installation)

**Task.** Two items remained from the editor queue: "Save as" for a file that cannot be edited, and
a draggable divider between the editor and the preview with a "single editor" mode.

**Decision.**
- *Copy while reading.* Ctrl+Shift+S outside the editor copies the open file **byte for byte** (`save.rs: copy_document`) rather than through the
  editor text: this way a read-only file, a non-UTF-8 file, and a file with BOM/CRLF are all copied without distortion. The name rules are the same as for
  "New file" (Markdown/text extension, existing folder); over an existing file the copy goes through a regular save
  (not read-only), and onto the source itself it is refused with "that is the same file". The copy opens in a new tab, the original stays.
- *Divider.* A strip stands between the editor and the preview (`role="separator"`, `split.ts`): the mouse drags it, a double click
  returns it to the middle, ← → move it by 2 %, Home puts it in the middle. The share (`split`, from 25 % to 75 %) is stored in settings and applied as
  the CSS variable `--split` (`flex-grow` of the editor and the preview), so neither half can be closed and the width of the contents panel
  has no effect. During dragging the share is only applied; it is saved and the preview is aligned at the end.
- *Editor only.* Ctrl+Shift+E or the "Preview" button hides the preview (`data-preview="off"`, the `preview` setting), and the editor
  takes the full width. The preview keeps being built meanwhile (the contents and heading navigation do not go stale), but
  it is not matched with scrolling while hidden; when shown, it is aligned again.
- The start screen lists "Save as" (Files) and "Hide or show the preview" (Editing).

**Verified** in the window (Xephyr, built package): a copy of a read-only file (permissions 444) and of a Latin-1 file are identical to
the originals (`cmp`) and open in new tabs; dragging the divider with the mouse, a double click (middle), a window restart
remembers the share, Ctrl+Shift+E hides and restores the preview, ← × 5 gives 60 %, Home gives 50 %. Tests: Rust 24, Bun 163.
**Bug found along the way.** `preventDefault` on `pointerdown` (to avoid selecting text) deprived the divider of keyboard focus:
the arrows did not work. Focus is now set explicitly.
**Not verified:** Wayland, finger touch, a very narrow window (less than the editor's `18rem` and `25 %`).

## 2026-11-03 · Version 3 (0.3.0): editor polish, safe HTML, diagrams

**What was asked.** Finish the rest of the queue and release it as version 3; the installer is `mdview_0.3.0_amd64.deb`. The version was chosen by the same
rule as the second one (0.N.0 = version N), commits with the `v3:` prefix, tag `v0.3.0`.

**Decisions.**
- *Window size.* The official `tauri-plugin-window-state` with the flags `SIZE | MAXIMIZED`: the window comes back with the same size and in
  the same state ("maximized") it was closed in. The position is not saved: the window manager places windows better than
  remembered coordinates (especially on Wayland). The state file is `~/.config/dev.mdview.viewer/.window-state.json`.
- *Scrolling in both directions.* The inverse `editorLineAt` was added to `previewScrollTop` (pure, with tests, checked as
  `editorLineAt(previewScrollTop(x)) ≈ x`); the editor got `scrollToLine`. So that the panes do not chase each other in a circle, each
  remembers the value the other one set it to, and a scroll event that arrives with that value (±2 px) is treated as an echo.
  Redrawing the preview also ends by setting this value, so typing does not jerk the editor.
- *Code highlighting in the editor.* `lang-markdown` got `codeLanguages` (`code-languages.ts`): 17 languages (JS/TS, Python, JSON,
  CSS, HTML, Rust, Shell, YAML, TOML, Go, C, C++, Java, C#, SQL, Diff) are loaded on first encounter as separate chunks
  (`import()`), the colours are the same `--tok-*` as in the preview, so themes colour them too.
- *The client build is split into chunks* (`splitting: true`, `chunk-*.js`): the Bun server serves them by name, `build.ts` writes to `dist/`.
  The startup `client.js` became smaller (688 KB versus 1124 KB), the heavy parts load on demand. The window's security policy was not changed
  (`script-src 'self'` allows its own chunks).
- *Raw HTML.* Enabled only in plain Markdown (in `.mdx` the tags are handled by `mdx.ts`) and only when the document contains raw HTML:
  the renderer flags such a case, and then the **whole** page goes through DOMPurify (chosen instead of sanitizing individual
  pieces: pieces like `<details>…</details>` are torn apart by blank lines, while a whole page keeps the structure). On top of the DOMPurify rules:
  `<style>`, `<link>`, forms, frames and media are forbidden; `position`, `z-index` and anything with addresses are removed from `style`; only
  disabled checkboxes remain (task lists are ours); relative images go through the address of the document's files; classes with the names
  of the window itself (`modal`, `tabs`, `toc`…) are stripped, and `.document` got `contain: layout` so that everything positioned stays
  inside the page. The second wall is the security policy: scripts and event handlers are not executed anyway (verified).
  KaTeX formulas pass through sanitizing without loss (a test compares the number of elements).
- *Mermaid 12.2.0.* The renderer outputs a ` ```mermaid ` block as `div.mermaid-block` with the code inside; `diagrams.ts` loads the library
  only in a document with such a block (≈125 chunks, 5.7 MB in `dist`, the package grew from 3.03 to 4.47 MiB), draws SVG with `securityLevel:
  "strict"` and the `base` theme configured with the page colours (`--bg`, `--fg`, `--surface`…; any CSS colours are converted to `#rrggbb`
  through canvas). Finished pictures are cached by colour and text, so redrawing the document does not flicker; when the theme changes the diagrams
  are redrawn (with a 200 ms delay while the theme list is being browsed). An error in a diagram leaves the code and a "Diagram error: …" line.
- *HTML sanitizing tests run on jsdom.* `happy-dom` parsed HTML incorrectly (it left `<script>` in), and the DOM recommended for DOMPurify is jsdom.

**Verified** in the window (Xephyr, built package): a flowchart and a sequence diagram in dark theme colours and after switching
to the light one, a broken diagram shows the code and the reason, ordinary code next to it is not affected; raw HTML: an image next to the file,
`<kbd>`, `<sub>`, `<details>`, a comment is hidden, the window title is not changed by scripts (`<script>`, `onerror`, `javascript:`),
a fake `position:fixed` overlay stayed as a string inside the page; TS/Python/JSON/Bash highlighting in the editor; the preview
scrolled by hand, and the editor is at the same paragraph, and back, without jitter; a 700×520 window came back the same after a restart.
Tests: Rust 24, Bun 190+.
**Not verified:** Wayland, very large diagrams (hundreds of nodes), a document with dozens of diagrams, `.mdx` with Mermaid (there the block is not drawn
as a diagram only if the MDX plugin intercepts the fence; normally it is drawn as in Markdown).
**Deferred.** Spell checking, more languages in highlighting, editing in the browser stage.

## Keyboard shortcuts help (version 3)

**Task.** While reading a file, the keys cannot be recalled: the list existed only on the start screen.

**Decision.** F1 (the standard help key, independent of the keyboard layout) and `?` outside an input field open the "Keyboard shortcuts" window
(`help.ts`) with the same list as on the start screen: the list is built by a single function `createCommandList`, so they do not diverge, and
the list still depends on the window's capabilities (in the browser stage there is no "New file"). Ctrl+/ was deliberately not taken: CodeMirror binds
it to comments. In the editor and in input fields `?` remains an ordinary character (the `isTyping` check), F1 always works.
The window is closed by Esc, F1 or a click outside; everything typed in it does not reach the page (as with the unsaved-changes question).
**Known rough edge.** In editor mode, the scrollbars of the editor and of code blocks show through the window dim (both of this help and of the unsaved-changes question) as
thin lines. An attempt with `transform: translateZ(0)` on the dim did not help and was rolled back; probably
this is a feature of software rendering in a nested X server (the log has "DRI3 error"), and may not appear on a real graphics card.
**Verified** in the window (Xephyr, built package): F1 over a document, Esc, F1 again, `?` while reading, F1 in the editor, `?` in
the editor is typed as text, both columns in full.

## Ctrl+W on the last tab and Ctrl+Q (version 3)

**Owner's remark.** An accidental Ctrl+W with a single open document closed the whole application. That was my decision from version 2
("like browsers and gedit"), but an unexpected close is worse than an extra screen. (Ctrl+D does nothing in the application: verified, the process
stays; it was Ctrl+W that closed it.)
**Decision.** Closing the last tab leaves the window with the start screen: the Rust command `close_document` stops watching the
file and returns the title "mdview". The keyboard way out is Ctrl+Q (the Linux standard); like the window close button, it first
asks about unsaved changes (one function `quit` for both cases). Ctrl+Q and "Quit" in the key lists are shown only where the window
can be closed. To restore the previous behaviour: remove the `closeDocument` branch in `closeTab` and call `quit()` when `tabs.length === 1`.

**Addition: the key list must be complete.** The owner took undocumented behaviour for bugs. The key handlers in `main.ts`,
`search.ts` and the editor were checked against the list; F3 / Shift+F3, Esc (close search or the theme list), Ctrl+click and the middle
button on a link, undo and redo were added. A test lists the labels that must be in the list. Rule for the future: a new key
is added to `commandGroups` in the same commit as the handler. Aliases (Ctrl+PgUp/PgDn for tabs, the side mouse buttons)
are not shown in the window so that lines do not overflow the column; they are described in the README.

## Start screen as a sheet with a gradient (version 3)

The owner liked the gradient of the demo picture `pic.png` (`#3c6ea5` at the top, `#8287c1` in the middle, `#c8a0dc` at the bottom; the colours were taken from the file). The first
reading ("a logo above the name") did not fit; after clarification: the dark background of the **start screen** was replaced entirely by this gradient, and the screen itself
looks like a sheet of paper with a folded top-right corner, with the application icon (the same `mdview.svg`, embedded as static `ICON` markup) standing to the left
of the word "mdview".
How it works: `.reader:has(.start)` gets the gradient and a `clip-path` with a cut corner (the theme background is visible behind the cut), `::after` draws the folded corner
(the light half of a `--fold` square = 4.5rem with a thin shadow along the fold). The sheet colours do not depend on the theme, so inside `.start` it sets its own `--fg`,
`--rule` and white text with a light shadow, the keys are dark glass (`rgba(15,25,60,.32)`), the "Open a file" button is light glass. The F1 help window
(it is outside `.start`) and ordinary documents are not affected: the sheet is on only while the start page is on screen. Verified in the window: dark theme and Sepia
(the cut shows a dark/cream background). `pic.png` was not changed. White text on the lilac bottom is readable, but the contrast there is modest (about 2.5:1);
if stricter is needed, the bottom third can be slightly darkened.

**Addition: no scrolling.** The owner noticed scrolling on the start screen. The page margins at the top and bottom (3.5rem and 6rem) were compressed to 1rem
for the start screen only (`.document:has(> .start)`), the list rows became lower (padding 0.24rem), the gaps between blocks shorter, the icon 3.6rem,
`.start { min-height: calc(100vh - 2.5rem) }`. Verified on a 900 px screen (a 960×820 window fits entirely): the list ends at about the 750th
pixel, there is no scrolling. The same row paddings apply in the F1 help window. With a very short window (< ~750 px) scrolling still appears.

## License and contributing (version 3)

The owner asked to state the author and the license. Done: `LICENSE` (MIT, © 2026 BigBroData), `license`/`author` in `package.json`, a line "by BigBroData (MIT)" under the
tagline on the start screen (plain text: there is no author address in the project). The Tauri `licenseFile` parameter is not used in the deb, so the license text was
put into the package explicitly: `/usr/share/doc/mdview/copyright` (as is customary in Debian; verified with `dpkg-deb -c`). The README got the sections "License" (including about
third-party libraries) and "Contributing" (how to run, `bun run check`, rules: small commits in English, tests, a new key in the list,
lightness, security, Biome; a contribution is accepted under the MIT terms). The `authors` field in `Cargo.toml` (which is also the package `Maintainer`) was changed from a personal name to BigBroData at the owner's request.

**Addition: contact and identity.** The author's contact for suggestions: BigBroData, sheyhali34@gmail.com (in the README, the "Contributing" and "License" sections).
The git identity of the repositories (Windows and Linux) was replaced with BigBroData <sheyhali34@gmail.com>: the `user.name`/`user.email` setting and the **entire history** were rewritten
(`git filter-branch`: author and committer of all commits and tags, as well as the `authors` line in old versions of `Cargo.toml`); the repositories were never published anywhere, so
the commit hashes changed harmlessly. Verified by going through all objects: the former name and e-mail no longer remain in the repository.

## Documentation for publication (version 3)

The owner decided to publish the project on GitHub himself and wants it to be useful to many people, so the documentation was prepared for strangers.

- **All documentation is in English.** README, `docs/`, code comments and commit messages. The Russian originals were translated section by section (the
  structure and every heading were kept; a mechanical check found no Cyrillic left except four intentional layout examples in this file). Added as a rule 7 to the
  contributing list in the README.
- **README rewritten from scratch** instead of translated line by line: the old one was a log of what had been added (it still said raw HTML was shown as text and was
  last verified on 2026-10-25). The new one goes: what it is, screenshots, features by theme, install, shortcuts, themes, troubleshooting, developers, license, contributing.
- **Screenshots** are real: taken from the rebuilt `.deb` binary in a nested X server (Xephyr) of the Linux machine, from the demo document `docs/demo.md` (the same
  file is shown by `mdview docs/demo.md`), cropped to the window and quantized to 128-192 colours (`docs/images/`: start screen 55 KB, editor 42 KB, diagram 8 KB). Taking
  them found a real bug: the editor painted the whole text of a list in the keyword colour (`tags.list` covers the text, not only the marker); fixed before the shots.
- **Installing without a package.** The `.deb` covers Debian, Ubuntu and derivatives (the largest group). For every other distribution the README describes the
  source build: Bun, Rust, the Tauri system libraries per distribution (Debian/Ubuntu, Fedora, Arch, openSUSE; taken from the Tauri 2 prerequisites page, only the Debian line is tried here) and
  `bun run desktop:build -- --no-bundle`, which builds the binary alone. The manual per-user installation (binary, icon, MIME type for `.mdx`, `.desktop` file) was run in a
  throw-away `HOME`: `desktop-file-validate` passes, `update-mime-database` and `update-desktop-database` run clean, the default application for `text/markdown` becomes mdview.
  Browser mode (`bun run start`) stays as the third, lightest option.
- **Release notes** for the package are in `docs/release-0.3.0.md` (highlights, install, SHA-256 of the file, known limitations); the text can be pasted into the GitHub release.
- Left as a placeholder: the repository address (`<repository-url>` in the README) until the owner has one.
