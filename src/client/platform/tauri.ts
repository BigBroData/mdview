import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { resolveRelative } from "../links.ts";
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
        const first = event.payload.paths[0];
        if (first) handler(first);
      });
    },
  };
}
