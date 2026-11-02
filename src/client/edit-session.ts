import type { EditorState, Text } from "@codemirror/state";
import type { Eol } from "./edit-logic.ts";

/** What a tab keeps while its document is being edited. */
export interface EditSession {
  /** Text, selection and undo history; the live one is the editor's while the tab is shown. */
  state: EditorState;
  /** The text as last written to or read from disk (LF only); compared to know what is unsaved. */
  savedDoc: Text;
  /** Disk text (LF only) the last time the page looked, to tell our own save from an outside change. */
  diskText: string;
  eol: Eol;
  /** Editor scroll position while the tab is in the background. */
  scrollTop: number;
  /** The file changed on disk while there were unsaved changes. */
  conflict: boolean;
  /** The first Ctrl+S after a conflict only warns; the second overwrites. */
  armed: boolean;
}

export const isDirty = (session: EditSession | undefined): boolean =>
  session !== undefined && !session.state.doc.eq(session.savedDoc);
