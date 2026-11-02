/**
 * What the page needs from its host. Two hosts exist: the Bun server stage
 * (`browser.ts`) and the Tauri desktop shell (`tauri.ts`). Everything else
 * in the client is host-independent.
 */
import type { ThemeList } from "../themes.ts";

export interface Document {
  /** Absolute path on disk. */
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
  /** Reports documents dropped onto the window; absent where impossible. */
  onFileDropped?: (handler: (paths: string[]) => void) => void;
  /** Further documents from the command line the app started with (after the first). */
  initialPaths?: () => Promise<string[]>;
  /** Another start of the app handed its documents to this window. */
  onOpenRequest?: (handler: (paths: string[]) => void) => void;
  /** Closes the window; absent where the page does not own one. */
  closeWindow?: () => void;
  /** Opens a document by absolute path (a drop, or Back/Forward in the history). */
  openPath?: (path: string) => Promise<Document | null>;
  /** Opens a document linked from the current one; `href` is relative to it. */
  openLink?: (href: string) => Promise<Document | null>;
  /** Shows a web link in the user's own browser. */
  openExternal?: (url: string) => Promise<void>;
  /** The user's theme files and where they live. */
  loadThemes?: () => Promise<ThemeList>;
  /** Called when the host loses the ability to notify (browser stage: viewer stopped). */
  onConnectionLost?: (handler: (lost: boolean) => void) => void;
}
