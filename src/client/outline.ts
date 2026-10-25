/**
 * Heading strip at the right edge: one tick per heading, placed in proportion
 * to its position in the document, plus a band showing the visible part.
 * Hover shows the heading text, click jumps to it. The geometry is a pure
 * function so it can be tested without a DOM.
 */
export interface HeadingInfo {
  level: number;
  text: string;
  /** Offset of the heading from the top of the page, in pixels. */
  top: number;
}

export interface Tick {
  level: number;
  text: string;
  /** Vertical position as a fraction of the strip height, 0..1. */
  at: number;
}

export interface Band {
  /** Top and height as fractions of the strip height. */
  top: number;
  height: number;
}

/** Fewer headings than this and the strip adds nothing; it stays hidden. */
export const MIN_HEADINGS = 3;

export function tickLayout(headings: readonly HeadingInfo[], pageHeight: number): Tick[] {
  if (pageHeight <= 0) return [];
  return headings.map((h) => ({
    level: h.level,
    text: h.text,
    at: Math.min(1, Math.max(0, h.top / pageHeight)),
  }));
}

export function viewportBand(scrollTop: number, viewportHeight: number, pageHeight: number): Band {
  if (pageHeight <= 0) return { top: 0, height: 1 };
  const top = Math.min(1, Math.max(0, scrollTop / pageHeight));
  const height = Math.min(1 - top, Math.max(0, viewportHeight / pageHeight));
  return { top, height };
}

export function shouldShow(
  headingCount: number,
  pageHeight: number,
  viewportHeight: number,
): boolean {
  return headingCount >= MIN_HEADINGS && pageHeight > viewportHeight * 1.5;
}

// --- DOM part -------------------------------------------------------------

export interface Outline {
  /** Re-reads headings and positions; call after a render or a resize. */
  update(): void;
  /** Moves the viewport band; call on scroll. */
  track(): void;
}

export function createOutline(strip: HTMLElement, content: HTMLElement): Outline {
  const band = document.createElement("div");
  band.className = "outline__band";
  const ticks = document.createElement("div");
  ticks.className = "outline__ticks";
  strip.append(band, ticks);

  let headings: HTMLElement[] = [];

  function pageHeight(): number {
    return document.documentElement.scrollHeight;
  }

  function update(): void {
    headings = Array.from(content.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
    const total = pageHeight();
    const infos: HeadingInfo[] = headings.map((h) => ({
      level: Number(h.tagName.slice(1)),
      text: h.textContent?.trim() ?? "",
      top: h.getBoundingClientRect().top + window.scrollY,
    }));
    const visible = shouldShow(infos.length, total, window.innerHeight);
    strip.hidden = !visible;
    if (!visible) return;

    ticks.replaceChildren();
    tickLayout(infos, total).forEach((tick, index) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `outline__tick outline__tick--h${Math.min(tick.level, 4)}`;
      el.style.top = `${(tick.at * 100).toFixed(3)}%`;
      el.title = tick.text;
      el.setAttribute("aria-label", tick.text);
      const label = document.createElement("span");
      label.className = "outline__label";
      label.textContent = tick.text;
      el.append(label);
      el.addEventListener("click", () => {
        headings[index]?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
      ticks.append(el);
    });
    track();
  }

  function track(): void {
    if (strip.hidden) return;
    const b = viewportBand(window.scrollY, window.innerHeight, pageHeight());
    band.style.top = `${(b.top * 100).toFixed(3)}%`;
    band.style.height = `${(b.height * 100).toFixed(3)}%`;
  }

  return { update, track };
}
