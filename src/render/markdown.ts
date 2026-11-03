import katexImport from "@vscode/markdown-it-katex";
import hljs from "highlight.js/lib/common";
import type { MarkdownIt as Renderer } from "markdown-it";
import MarkdownIt from "markdown-it";
import { type AssetEnv, assetUrlsPlugin } from "./asset-urls.ts";
import { frontMatterPlugin } from "./front-matter.ts";
import { headingIdsPlugin } from "./heading-ids.ts";
import { mdxPlugin } from "./mdx.ts";
import { type SourceLinesEnv, sourceLinesPlugin } from "./source-lines.ts";
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
  /** Mark top-level blocks with `data-line` (their first source line); the editor's preview uses it. */
  sourceLines?: boolean;
  /**
   * Raw HTML is shown only with this: when the document has any, the whole rendered page goes
   * through it (src/render/sanitize.ts). Without it raw HTML stays visible as text.
   */
  sanitize?: (html: string, assetBase?: string) => string;
}

/** Set by the renderer when the document contains raw HTML. */
interface RawHtmlEnv {
  rawHtml?: boolean;
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

export function createRenderer(options: { mdx?: boolean; html?: boolean } = {}): Renderer {
  const md = new MarkdownIt({
    html: options.html === true, // only with a sanitizer behind it (renderMarkdown)
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
  md.use(sourceLinesPlugin);
  // Wide tables scroll inside their own box instead of breaking the page.
  md.renderer.rules.table_open = (tokens, idx) => {
    const line = tokens[idx]?.attrGet("data-line");
    return `<div class="table-wrap"${line === null || line === undefined ? "" : ` data-line="${line}"`}><table>`;
  };
  md.renderer.rules.table_close = () => "</table></div>";
  // ```mermaid blocks wait for the page to draw them (client/diagrams.ts); until then they are plain code.
  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token && token.info.trim().split(/\s+/)[0] === "mermaid") {
      const line = token.attrGet("data-line");
      const mark = line === null || line === undefined ? "" : ` data-line="${line}"`;
      return `<div class="mermaid-block"${mark}><pre><code>${md.utils.escapeHtml(token.content)}</code></pre></div>\n`;
    }
    return fence ? fence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
  };
  // Remember that raw HTML was used, so only such pages pay for sanitizing.
  for (const name of ["html_block", "html_inline"] as const) {
    md.renderer.rules[name] = (tokens, idx, _options, env) => {
      (env as RawHtmlEnv).rawHtml = true;
      return tokens[idx]?.content ?? "";
    };
  }
  return md;
}

const shared = createRenderer();
const sharedMdx = createRenderer({ mdx: true });
const sharedHtml = createRenderer({ html: true });

export function renderMarkdown(source: string, options: RenderOptions = {}): string {
  const env: AssetEnv & SourceLinesEnv & RawHtmlEnv = {
    assetBase: options.assetBase,
    sourceLines: options.sourceLines,
  };
  // MDX has its own way with tags (mdx.ts), so raw HTML is only for plain Markdown.
  const sanitize = options.mdx ? undefined : options.sanitize;
  const renderer = options.mdx ? sharedMdx : sanitize ? sharedHtml : shared;
  const html = renderer.render(stripBom(source), env);
  return sanitize && env.rawHtml ? sanitize(html, options.assetBase) : html;
}

export function isMdxName(name: string): boolean {
  return name.toLowerCase().endsWith(".mdx");
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
