/**
 * What the page needs from its host. Two hosts exist: the Bun server stage
 * (`browser.ts`) and the Tauri desktop shell (`tauri.ts`). Everything else
 * in the client is host-independent.
 */
export interface Document {
  /** Absolute path on disk (browser stage: the server-side path is not exposed, "" is used). */
  path: string;
  /** File name for the window title. */
  name: string;
  text: string;
}

export interface Platform {
  /** Loads the document the app was started with, if any. */
  initial(): Promise<Document | null>;
  /** Re-reads the current document after a change notification. */
  reload(): Promise<Document | null>;
  /** Calls `onChange` whenever the current document changes on disk. */
  watch(onChange: () => void): void;
  /** URL prefix under which files next to the document are served. */
  assetBase: string;
  /** Shows a file picker and opens the chosen document; absent where impossible. */
  openFile?: () => Promise<Document | null>;
  /** Opens a document dropped onto the window; absent where impossible. */
  onFileDropped?: (handler: (path: string) => void) => void;
  /** Opens a document by path (used after a drop). */
  openPath?: (path: string) => Promise<Document | null>;
  /** Called when the host loses the ability to notify (browser stage: viewer stopped). */
  onConnectionLost?: (handler: (lost: boolean) => void) => void;
}
