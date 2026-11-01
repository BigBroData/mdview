import katexImport from "@vscode/markdown-it-katex";
import hljs from "highlight.js/lib/common";
import type { MarkdownIt as Renderer } from "markdown-it";
import MarkdownIt from "markdown-it";
import { type AssetEnv, assetUrlsPlugin } from "./asset-urls.ts";
import { frontMatterPlugin } from "./front-matter.ts";
import { headingIdsPlugin } from "./heading-ids.ts";
import { mdxPlugin } from "./mdx.ts";
import { tableColumnsPlugin } from "./table-columns.ts";
import { taskListsPlugin } from "./task-lists.ts";

/**
 * The single Markdown renderer used by both the browser client and the tests.
 * It is pure: no file system, no network — text in, HTML out.
 */
export interface RenderOptions {
  /** URL prefix under which relative images of the document are served. */
  assetBase?: string;
  /** The document is MDX: show module lines and JSX tags instead of escaping them as text. */
  mdx?: boolean;
}

// The KaTeX plugin is a CommonJS module with `exports.default`. Bun's runtime
// unwraps that to the function, while the browser bundle hands us the module
// object. Accept both so the same file works in tests and in the browser.
type KatexPlugin = typeof katexImport;
const katexPlugin: KatexPlugin =
  typeof katexImport === "function"
    ? katexImport
    : (katexImport as unknown as { default: KatexPlugin }).default;

function highlight(code: string, lang: string): string {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {
      // fall through to plain escaping
    }
  }
  return ""; // markdown-it escapes the code itself
}

export function createRenderer(options: { mdx?: boolean } = {}): Renderer {
  const md = new MarkdownIt({
    html: false, // raw HTML is shown as text; see docs/backlog.md
    linkify: true,
    typographer: false,
    highlight,
  });
  md.use(frontMatterPlugin);
  if (options.mdx) md.use(mdxPlugin);
  md.use(katexPlugin, { throwOnError: false, enableFencedBlocks: true });
  md.use(taskListsPlugin);
  md.use(assetUrlsPlugin);
  md.use(headingIdsPlugin);
  md.use(tableColumnsPlugin);
  // Wide tables scroll inside their own box instead of breaking the page.
  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>';
  md.renderer.rules.table_close = () => "</table></div>";
  return md;
}

const shared = createRenderer();
const sharedMdx = createRenderer({ mdx: true });

export function renderMarkdown(source: string, options: RenderOptions = {}): string {
  const env: AssetEnv = { assetBase: options.assetBase };
  return (options.mdx ? sharedMdx : shared).render(stripBom(source), env);
}

export function isMdxName(name: string): boolean {
  return name.toLowerCase().endsWith(".mdx");
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
