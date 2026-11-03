/**
 * Mermaid diagrams. A fenced block marked ```mermaid arrives from the renderer as
 * `<div class="mermaid-block"><pre><code>source</code></pre></div>`; this module turns each one
 * into an SVG picture. The library is large, so it is loaded (as separate chunks of the bundle)
 * only when a document actually has a diagram. Until it is drawn, and whenever the source is
 * wrong, the block stays what it was: readable code, with the reason under it.
 */
export interface Diagrams {
  /** Draws the diagrams of the page that was just rendered. */
  update(): void;
  /** The colours changed (a theme was chosen): draws the diagrams again in them. */
  refresh(): void;
}

export interface DiagramDeps {
  /** The element holding the rendered document. */
  root: HTMLElement;
  /** Diagrams were drawn, so the page changed height. */
  onLayout(): void;
}

const CACHE_LIMIT = 60;

/** The theme's colour as `#rrggbb`: the canvas turns any CSS colour (hsl, oklch, names) into one. */
function toHex(css: string, fallback: string): string {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return fallback;
  context.fillStyle = "#000";
  context.fillStyle = css.trim();
  const value = context.fillStyle;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const rgb = /^rgba?\((\d+), (\d+), (\d+)/.exec(value);
  if (!rgb) return fallback;
  return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

function isDark(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * (r ?? 0) + 0.587 * (g ?? 0) + 0.114 * (b ?? 0) < 128;
}

interface Palette {
  key: string;
  config: Record<string, unknown>;
}

/** The page's colours and font, as settings for Mermaid's neutral "base" theme. */
function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    toHex(style.getPropertyValue(name) || fallback, fallback);
  const bg = read("--bg", "#ffffff");
  const fg = read("--fg", "#222222");
  const muted = read("--fg-muted", "#666666");
  const surface = read("--surface", "#f3f4f5");
  const rule = read("--rule-strong", "#c9cdd1");
  const accent = read("--accent", "#2a66c4");
  const font = style.getPropertyValue("--font-text").trim() || "sans-serif";
  const config = {
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: "base",
    fontFamily: font,
    themeVariables: {
      darkMode: isDark(bg),
      background: bg,
      textColor: fg,
      primaryColor: surface,
      primaryTextColor: fg,
      primaryBorderColor: accent,
      secondaryColor: surface,
      secondaryTextColor: fg,
      secondaryBorderColor: rule,
      tertiaryColor: bg,
      tertiaryTextColor: fg,
      tertiaryBorderColor: rule,
      lineColor: muted,
      noteBkgColor: surface,
      noteTextColor: fg,
      noteBorderColor: rule,
      edgeLabelBackground: bg,
      clusterBkg: surface,
      clusterBorder: rule,
      titleColor: fg,
    },
  };
  return { key: JSON.stringify(config), config };
}

export function createDiagrams(deps: DiagramDeps): Diagrams {
  const { root } = deps;
  const cache = new Map<string, string>();
  let counter = 0;
  let configured = "";
  let working = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let pending = false; // a pass that was asked for while another ran: draw everything again
  let again = false;

  function remember(key: string, svg: string): void {
    cache.delete(key);
    cache.set(key, svg);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  }

  function show(block: HTMLElement, source: string, svg: string): void {
    block.dataset.source = source;
    block.dataset.state = "drawn";
    block.querySelector(".mermaid-error")?.remove();
    block.innerHTML = svg;
  }

  function fail(block: HTMLElement, source: string, error: unknown): void {
    block.dataset.source = source;
    block.dataset.state = "failed";
    const message = String(error instanceof Error ? error.message : error).split("\n")[0] ?? "";
    let note = block.querySelector<HTMLElement>(".mermaid-error");
    if (!note) {
      note = document.createElement("p");
      note.className = "mermaid-error";
      block.append(note);
    }
    note.textContent = `Diagram error: ${message}`;
  }

  function sourceOf(block: HTMLElement): string {
    return block.dataset.source ?? block.querySelector("code")?.textContent ?? "";
  }

  /** Draws every block that is not drawn yet (or all of them, after a palette change). */
  async function drawAll(all: boolean): Promise<void> {
    if (working) {
      // A pass is running; it will pick up the blocks that appeared meanwhile.
      pending = pending || all;
      again = true;
      return;
    }
    working = true;
    try {
      do {
        again = false;
        const everything = pending;
        pending = false;
        const palette = readPalette();
        const blocks = [...root.querySelectorAll<HTMLElement>(".mermaid-block")].filter(
          (block) => everything || all || block.dataset.state !== "drawn",
        );
        let drawn = false;
        let mermaid: typeof import("mermaid").default | undefined;
        for (const block of blocks) {
          const source = sourceOf(block);
          const key = `${palette.key}\0${source}`;
          const cached = cache.get(key);
          if (cached !== undefined) {
            show(block, source, cached);
            drawn = true;
            continue;
          }
          try {
            mermaid ??= (await import("mermaid")).default;
            if (configured !== palette.key) {
              mermaid.initialize(palette.config);
              configured = palette.key;
            }
            const id = `mermaid-${++counter}`;
            const { svg } = await mermaid.render(id, source);
            document.getElementById(`d${id}`)?.remove(); // a failed attempt leaves its scratch element
            remember(key, svg);
            if (block.isConnected) show(block, source, svg);
            drawn = true;
          } catch (error) {
            if (block.isConnected) fail(block, source, error);
          }
        }
        if (drawn) deps.onLayout();
      } while (again);
    } finally {
      working = false;
    }
  }

  return {
    update() {
      if (root.querySelector(".mermaid-block")) void drawAll(false);
    },
    refresh() {
      if (refreshTimer !== undefined) clearTimeout(refreshTimer);
      // Stepping through the theme list changes the colours many times a second: draw once it settles.
      refreshTimer = setTimeout(() => {
        if (root.querySelector(".mermaid-block")) void drawAll(true);
      }, 200);
    },
  };
}
