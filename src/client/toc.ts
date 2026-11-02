/**
 * The contents panel: an optional column at the left edge listing the
 * headings of the document, with the section being read marked. It is the
 * readable counterpart of the heading strip (outline.ts), which stays as is.
 * The "which section is current" rule is a pure function so tests need no DOM.
 */
export interface TocEntry {
  id: string;
  level: number;
  text: string;
  /** Offset of the heading from the top of the page, in pixels. */
  top: number;
}

/** A heading counts as reached once it is above this fraction of the window height. */
export const READING_LINE = 0.3;

/**
 * Index of the section being read, or -1 above the first heading. At the very
 * bottom the last heading wins: a short final section could never reach the line.
 */
export function currentHeading(
  tops: readonly number[],
  scrollTop: number,
  viewportHeight: number,
  pageHeight: number,
): number {
  if (tops.length === 0) return -1;
  if (pageHeight > viewportHeight && scrollTop + viewportHeight >= pageHeight - 2) {
    return tops.length - 1;
  }
  const line = scrollTop + viewportHeight * READING_LINE;
  let found = -1;
  for (let i = 0; i < tops.length; i++) {
    if ((tops[i] ?? Number.POSITIVE_INFINITY) <= line) found = i;
    else break;
  }
  return found;
}

/** Indent of every entry relative to the shallowest heading, so a document that starts at ## is not pushed right. */
export function indents(levels: readonly number[]): number[] {
  const shallowest = Math.min(...levels);
  return levels.map((level) => Math.min(3, level - shallowest));
}

// --- DOM part -------------------------------------------------------------

export interface Toc {
  /** Re-reads the headings; call after a render or a resize. */
  update(): void;
  /** Marks the section being read; call on scroll. */
  track(): void;
  setVisible(visible: boolean): void;
}

export function createToc(
  panel: HTMLElement,
  content: HTMLElement,
  scroller: HTMLElement,
  select: (id: string) => void,
): Toc {
  let entries: TocEntry[] = [];
  let items: HTMLElement[] = [];
  let shown = "";
  let active = -2; // nothing marked yet; -1 is "above the first heading"
  let visible = false;

  panel.addEventListener("click", (event) => {
    const item = (event.target as Element).closest<HTMLElement>("a[data-id]");
    if (!item) return;
    event.preventDefault();
    select(item.dataset.id ?? "");
    scroller.focus({ preventScroll: true });
  });

  // A tooltip only where the text is cut off; elsewhere it just repeats the entry.
  panel.addEventListener("mouseover", (event) => {
    const item = (event.target as Element).closest<HTMLElement>("a[data-id]");
    if (!item) return;
    if (item.scrollWidth > item.clientWidth) item.title = item.textContent ?? "";
    else item.removeAttribute("title");
  });

  function collect(): TocEntry[] {
    const base = scroller.getBoundingClientRect().top;
    const result: TocEntry[] = [];
    for (const h of content.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
      if (!h.id) continue;
      result.push({
        id: h.id,
        level: Number(h.tagName.slice(1)),
        text: h.textContent?.trim() ?? "",
        top: h.getBoundingClientRect().top - base + scroller.scrollTop,
      });
    }
    return result;
  }

  function build(): void {
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "toc__empty";
      empty.textContent = "No headings";
      panel.replaceChildren(empty);
      items = [];
      return;
    }
    const depth = indents(entries.map((entry) => entry.level));
    items = entries.map((entry, index) => {
      const link = document.createElement("a");
      link.className = `toc__item toc__item--d${depth[index] ?? 0}`;
      link.href = `#${encodeURIComponent(entry.id)}`;
      link.dataset.id = entry.id;
      link.textContent = entry.text;
      return link;
    });
    panel.replaceChildren(...items);
  }

  function update(): void {
    if (!visible) return;
    entries = collect();
    const signature = JSON.stringify(entries.map((entry) => [entry.id, entry.level, entry.text]));
    if (signature !== shown) {
      shown = signature;
      active = -2;
      build();
    }
    track();
  }

  function track(): void {
    if (!visible) return;
    const index = currentHeading(
      entries.map((entry) => entry.top),
      scroller.scrollTop,
      scroller.clientHeight,
      scroller.scrollHeight,
    );
    if (index === active) return;
    active = index;
    items.forEach((item, i) => {
      item.classList.toggle("toc__item--current", i === index);
      if (i === index) item.setAttribute("aria-current", "location");
      else item.removeAttribute("aria-current");
    });
    const current = items[index];
    if (current) keepInView(current);
  }

  /** Scrolls the panel itself, not the page, so the marked entry stays visible. */
  function keepInView(item: HTMLElement): void {
    const margin = 24;
    if (item.offsetTop < panel.scrollTop + margin) panel.scrollTop = item.offsetTop - margin;
    else if (item.offsetTop + item.offsetHeight > panel.scrollTop + panel.clientHeight - margin) {
      panel.scrollTop = item.offsetTop + item.offsetHeight - panel.clientHeight + margin;
    }
  }

  return {
    update,
    track,
    setVisible(value) {
      visible = value;
      panel.hidden = !value;
      shown = ""; // rebuild on the next update
      if (value) update();
    },
  };
}
