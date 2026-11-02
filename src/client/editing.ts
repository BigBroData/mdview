import { askUnsaved } from "./dialog.ts";
import { type Block, detectEol, normalizeEol, previewScrollTop, withEol } from "./edit-logic.ts";
import { type EditSession, isDirty } from "./edit-session.ts";
import { createEditor, type Editor } from "./editor.ts";
import type { Document, Platform } from "./platform/types.ts";
import type { Tab, Tabs } from "./tabs.ts";

/**
 * Edit mode: the editor on the left, the live preview on the right.
 *
 * Every tab can be edited on its own; its text, cursor and undo history live in
 * `tab.edit` while it is in the background. Rules that protect the user's work:
 * - nothing is written until Ctrl+S, and the file on disk is replaced whole;
 * - a change on disk while there are unsaved edits never overwrites them: the
 *   first Ctrl+S warns, the second overwrites;
 * - closing a tab, leaving edit mode or closing the window with unsaved edits asks;
 * - links in the preview open in new tabs, so a click cannot replace the text being edited.
 */
export interface EditingDeps {
  platform: Platform;
  tabs: Tabs;
  section: HTMLElement;
  host: HTMLElement;
  stateLabel: HTMLElement;
  saveButton: HTMLButtonElement;
  doneButton: HTMLButtonElement;
  scroller: HTMLElement;
  doc: HTMLElement;
  /** Shows the buffer in the preview pane (a render with source lines marked). */
  renderPreview(tab: Tab, text: string): void;
  /** Shows a document as plain reading text again. */
  renderView(document_: Document): void;
  refreshTabs(): void;
  status(message: string, hideAfterMs?: number): void;
  /** Runs a task after the ones before it; the host holds one document at a time. */
  run(task: () => Promise<void>): void;
}

export interface Editing {
  /** The shown tab is being edited. */
  isEditing(): boolean;
  /** Ctrl+E: start editing the shown document, or leave edit mode. */
  toggle(): Promise<void>;
  /** Ctrl+S. Returns whether the text is on disk afterwards. */
  save(tab?: Tab): Promise<boolean>;
  /** Called before another tab comes to the front: keeps the editor state of this one. */
  park(tab: Tab | undefined): void;
  /** Called after a tab with an edit session came to the front. */
  arrive(tab: Tab, loaded: Document): void;
  /** The file of the shown tab changed on disk. */
  diskChanged(): Promise<void>;
  /** Asks about unsaved edits in these tabs; false means the user cancelled. */
  confirmClose(tabs: readonly Tab[]): Promise<boolean>;
  /** Moves the editor to the heading with this id (a click in the contents panel). */
  revealHeading(id: string): void;
  /** Recomputes the unsaved markers (tabs, title, host); call after any tab change. */
  refresh(): void;
}

export function createEditing(deps: EditingDeps): Editing {
  const { platform, tabs, doc, scroller } = deps;
  const root = document.documentElement;
  let editor: Editor | undefined;
  let previewTimer: ReturnType<typeof setTimeout> | undefined;
  let syncQueued = false;
  let reported = "";

  const ed = (): Editor => {
    editor ??= createEditor(deps.host, { change: onChange, scroll: onScroll });
    return editor;
  };

  function layout(on: boolean): void {
    deps.section.hidden = !on;
    if (on) root.dataset.mode = "edit";
    else delete root.dataset.mode;
  }

  function sessionOf(tab: Tab | undefined): EditSession | undefined {
    return tab?.edit;
  }

  // --- unsaved markers -------------------------------------------------------

  function refresh(): void {
    for (const tab of tabs.all()) tab.dirty = isDirty(tab.edit);
    const active = tabs.active();
    const session = sessionOf(active);
    const dirty = active?.dirty ?? false;
    deps.stateLabel.textContent = !session
      ? ""
      : session.conflict
        ? "Changed on disk — Ctrl+S twice overwrites it"
        : dirty
          ? "Unsaved changes"
          : "Saved";
    deps.stateLabel.dataset.state = session?.conflict ? "conflict" : dirty ? "dirty" : "clean";
    deps.saveButton.disabled = !dirty;
    const any = tabs.all().some((tab) => tab.dirty);
    const key = `${any}|${dirty}|${active?.id}|${active?.name}`;
    deps.refreshTabs();
    if (key !== reported) {
      reported = key;
      void platform.reportDirty?.(any, dirty)?.catch(() => undefined);
    }
  }

  // --- preview ---------------------------------------------------------------

  function refreshPreview(): void {
    const tab = tabs.active();
    const session = sessionOf(tab);
    if (!tab || !session) return;
    deps.renderPreview(tab, session.state.doc.toString());
    syncPreview();
  }

  /** Scrolls the preview to what the editor shows. */
  function syncPreview(): void {
    const e = editor;
    const session = sessionOf(tabs.active());
    if (!e || !session) return;
    const base = scroller.getBoundingClientRect().top - scroller.scrollTop;
    const blocks: Block[] = [];
    for (const el of doc.querySelectorAll<HTMLElement>(":scope > [data-line]")) {
      blocks.push({ line: Number(el.dataset.line), top: el.getBoundingClientRect().top - base });
    }
    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const last = blocks.at(-1);
    const end = { line: session.state.doc.lines, top: Math.max(last?.top ?? 0, maxScroll) };
    scroller.scrollTop = e.atBottom() ? maxScroll : previewScrollTop(blocks, e.topLine(), end);
  }

  function onScroll(): void {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      syncPreview();
    });
  }

  function onChange(): void {
    const session = sessionOf(tabs.active());
    if (!session || !editor) return;
    session.state = editor.state();
    session.armed = false;
    refresh();
    if (previewTimer !== undefined) clearTimeout(previewTimer);
    previewTimer = setTimeout(refreshPreview, 120);
  }

  // --- showing a tab in edit mode -------------------------------------------

  function present(tab: Tab): void {
    const session = sessionOf(tab);
    if (!session) return;
    layout(true);
    ed().show(session.state, session.scrollTop);
    refresh();
    refreshPreview();
    ed().focus();
  }

  function park(tab: Tab | undefined): void {
    const session = sessionOf(tab);
    if (previewTimer !== undefined) clearTimeout(previewTimer);
    if (session && editor) {
      session.state = editor.state();
      session.scrollTop = editor.scrollTop();
    }
    layout(false);
  }

  /** Takes the text the host just read: a clean buffer follows the disk, a dirty one is flagged. */
  function mergeDisk(session: EditSession, text: string, live: boolean): void {
    const disk = normalizeEol(text);
    if (disk === session.diskText) return;
    session.diskText = disk;
    if (isDirty(session)) {
      session.conflict = true;
      session.armed = false;
      return;
    }
    if (live && editor) {
      editor.replace(disk);
      session.state = editor.state();
    } else {
      session.state = ed().withText(session.state, disk);
    }
    session.savedDoc = session.state.doc;
    session.conflict = false;
    deps.status("Reloaded from disk", 1500);
  }

  function arrive(tab: Tab, loaded: Document): void {
    const session = sessionOf(tab);
    if (!session) return;
    mergeDisk(session, loaded.text, false);
    present(tab);
  }

  async function diskChanged(): Promise<void> {
    const tab = tabs.active();
    const session = sessionOf(tab);
    if (!tab || !session) return;
    const loaded = await platform.reload();
    if (!loaded) return;
    mergeDisk(session, loaded.text, true);
    refresh();
    refreshPreview();
  }

  // --- saving ----------------------------------------------------------------

  async function save(which?: Tab): Promise<boolean> {
    const tab = which ?? tabs.active();
    const session = sessionOf(tab);
    if (!tab || !session) return true;
    if (!platform.saveDocument) return false;
    if (session.conflict && !session.armed) {
      session.armed = true;
      deps.status("The file changed on disk. Press Ctrl+S again to overwrite it.", 5000);
      return false;
    }
    const state = tab === tabs.active() && editor ? editor.state() : session.state;
    const text = withEol(state.doc.toString(), session.eol);
    try {
      await platform.saveDocument(tab.path, text);
    } catch (error) {
      deps.status(`Cannot save: ${String(error)}`, 6000);
      return false;
    }
    session.state = state;
    session.savedDoc = state.doc;
    session.diskText = normalizeEol(text);
    session.conflict = false;
    session.armed = false;
    refresh();
    deps.status("Saved", 1200);
    return true;
  }

  // --- entering and leaving ---------------------------------------------------

  async function enter(tab: Tab): Promise<void> {
    if (!platform.saveDocument) {
      deps.status("Editing is available in the desktop app.", 3500);
      return;
    }
    if (!tab.editable) {
      deps.status(
        "This file cannot be edited: it is read-only, not UTF-8 or not a text file.",
        4500,
      );
      return;
    }
    const fresh = await platform.reload();
    if (!fresh) return;
    const state = ed().create(normalizeEol(fresh.text));
    tab.edit = {
      state,
      savedDoc: state.doc,
      diskText: normalizeEol(fresh.text),
      eol: detectEol(fresh.text),
      scrollTop: 0,
      conflict: false,
      armed: false,
    };
    present(tab);
  }

  async function leave(tab: Tab): Promise<void> {
    const session = sessionOf(tab);
    if (!session) return;
    if (isDirty(session)) {
      const choice = await askUnsaved([tab.name]);
      if (choice === "cancel") return;
      if (choice === "save" && !(await save(tab))) return;
    }
    if (previewTimer !== undefined) clearTimeout(previewTimer);
    tab.edit = undefined;
    tab.dirty = false;
    layout(false);
    const fresh = await platform.reload();
    if (fresh) deps.renderView(fresh);
    refresh();
    scroller.focus({ preventScroll: true });
  }

  async function toggle(): Promise<void> {
    const tab = tabs.active();
    if (!tab) return;
    if (tab.edit) await leave(tab);
    else await enter(tab);
  }

  async function confirmClose(list: readonly Tab[]): Promise<boolean> {
    const dirty = list.filter((tab) => isDirty(tab.edit));
    if (dirty.length === 0) return true;
    const choice = await askUnsaved(dirty.map((tab) => tab.name));
    if (choice === "cancel") return false;
    if (choice === "discard") return true;
    for (const tab of dirty) if (!(await save(tab))) return false;
    return true;
  }

  function revealHeading(id: string): void {
    if (!sessionOf(tabs.active()) || !editor) return;
    const line = doc.querySelector<HTMLElement>(`#${CSS.escape(id)}`)?.dataset.line;
    if (line !== undefined) editor.revealLine(Number(line));
  }

  deps.saveButton.addEventListener("click", () =>
    deps.run(async () => {
      await save();
    }),
  );
  deps.doneButton.addEventListener("click", () => deps.run(toggle));

  return {
    isEditing: () => sessionOf(tabs.active()) !== undefined,
    toggle,
    save,
    park,
    arrive,
    diskChanged,
    confirmClose,
    revealHeading,
    refresh,
  };
}
