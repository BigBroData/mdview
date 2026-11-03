import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { resolveRelative } from "../links.ts";
import type { ThemeList } from "../themes.ts";
import { debounce, tauriAssetBase } from "./asset-base.ts";
import type { Document, Platform } from "./types.ts";

/** Desktop stage: the Rust side (src-tauri/src/lib.rs) reads and watches files. */
export function createTauriPlatform(): Platform {
  // Relative links resolve against the document that is open now.
  let currentPath = "";
  const track = <T extends Document | null>(document_: T): T => {
    if (document_) currentPath = document_.path;
    return document_;
  };
  const openPath = (path: string) => invoke<Document>("open_document", { path }).then(track);

  return {
    assetBase: tauriAssetBase(navigator.userAgent),
    initial: () => invoke<Document | null>("initial_document").then(track),
    reload: () => invoke<Document | null>("read_document").then(track),
    openLink: (href) => openPath(resolveRelative(currentPath, href)),
    openExternal: (url) => invoke<void>("open_external", { url }),
    loadThemes: () => invoke<ThemeList>("list_themes"),
    initialPaths: () => invoke<string[]>("extra_documents"),
    saveDocument: (path, text) => invoke<void>("save_document", { path, text }),
    createDocument: (path) => invoke<string>("create_document", { path }),
    saveDocumentAs: (path, text) => invoke<string>("save_document_as", { path, text }),
    copyDocument: (from, to) => invoke<string>("copy_document", { from, to }),
    async chooseSavePath(title, suggested) {
      const chosen = await save({
        title,
        defaultPath: suggested || undefined,
        filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown", "mdx", "txt"] }],
      });
      return typeof chosen === "string" ? chosen : null;
    },
    reportDirty: (any, shown) => invoke<void>("report_dirty", { any, shown }),
    onCloseRequested(handler) {
      void listen("close-requested", () => handler());
    },
    closeWindow: () => void invoke<void>("close_window"),
    onOpenRequest(handler) {
      void listen<string[]>("open-request", (event) => handler(event.payload));
    },
    watch(onChange) {
      // One save can produce several file-system events; deliver one reload.
      void listen("document-changed", debounce(onChange, 60));
    },
    openPath,
    async openFile() {
      const chosen = await open({
        title: "Open Markdown file",
        multiple: false,
        directory: false,
        filters: [
          { name: "Markdown", extensions: ["md", "markdown", "mdown", "mdx", "txt"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (typeof chosen !== "string") return null;
      return openPath(chosen);
    },
    onFileDropped(handler) {
      void listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
        if (event.payload.paths.length > 0) handler(event.payload.paths);
      });
    },
  };
}
