import type DOMPurify from "dompurify";
import { isRelativeAsset, rewriteAssetUrl } from "./asset-urls.ts";

/**
 * Raw HTML in a document (`<img align=...>`, `<details>`, `<kbd>`, `<br>`) is shown, after the
 * whole rendered page has been passed through DOMPurify. The viewer must stay safe for a file
 * it did not write, so on top of DOMPurify's rules:
 * - nothing that restyles or reaches out is allowed: `<style>`, `<link>`, forms, frames, media;
 * - a `style` attribute loses `position`, `z-index` and anything that loads a URL;
 * - only disabled check boxes survive as inputs (the task lists are ours);
 * - relative images are served through the viewer, like Markdown images.
 * The content security policy (docs/decisions.md) is the second wall: no script runs in the page.
 */
type Purify = typeof DOMPurify;

const BLOCKED_PROPERTIES = new Set(["position", "z-index", "behavior", "-moz-binding"]);

/** A style attribute without the declarations that could cover the application or load a URL. */
export function cleanStyle(style: string): string {
  return style
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const colon = declaration.indexOf(":");
      if (colon < 1) return false;
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).toLowerCase();
      if (BLOCKED_PROPERTIES.has(property)) return false;
      if (value.includes("\\") || value.includes("/*")) return false; // escapes could hide the rest
      return !/(url\(|expression\(|javascript:|@import)/.test(value.replace(/\s+/g, ""));
    })
    .join(";");
}

const FORBIDDEN_TAGS = [
  "style",
  "link",
  "meta",
  "base",
  "form",
  "button",
  "select",
  "option",
  "textarea",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "audio",
  "video",
  "source",
  "track",
  "dialog",
  "template",
  "noscript",
];

// DOMPurify's own list of safe address starts, plus the viewer's scheme for files next to the document.
const ALLOWED_URI = /^(?:(?:(?:f|ht)tps?|mailto|tel|mdasset):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i;

/** Makes the function that cleans a rendered page; `assetBase` is where the document's files are served. */
export function createHtmlSanitizer(purify: Purify): (html: string, assetBase?: string) => string {
  let base: string | undefined;

  purify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "style") data.attrValue = cleanStyle(data.attrValue);
  });
  purify.addHook("afterSanitizeAttributes", (node) => {
    const name = node.nodeName.toUpperCase();
    if (name === "A") {
      node.removeAttribute("target");
    } else if (name === "IMG") {
      node.removeAttribute("srcset");
      const src = node.getAttribute("src");
      if (base && src !== null && isRelativeAsset(src)) {
        node.setAttribute("src", rewriteAssetUrl(src, base));
      }
    } else if (name === "INPUT") {
      if (node.getAttribute("type")?.toLowerCase() === "checkbox")
        node.setAttribute("disabled", "");
      else node.remove();
    }
  });

  return (html, assetBase) => {
    base = assetBase?.replace(/\/$/, "");
    return purify.sanitize(html, {
      USE_PROFILES: { html: true, svg: true, mathMl: true },
      FORBID_TAGS: FORBIDDEN_TAGS,
      ADD_ATTR: ["data-line"],
      ALLOWED_URI_REGEXP: ALLOWED_URI,
    });
  };
}
