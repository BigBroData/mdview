import type { Outline } from "./outline.ts";

/**
 * In-page search (Ctrl+F). Pure helpers first, DOM part below.
 *
 * Matches are found in the concatenated text of the document's text nodes,
 * so a phrase that spans formatting ("**bold** text") is still found. Each
 * match is then wrapped in <mark> elements, one per text node it touches.
 */

export interface Range {
  start: number;
  end: number;
}

/** Hard cap so a one-letter query on a huge file stays instant. */
export const MAX_MATCHES = 1000;

export function findMatches(text: string, query: string, max = MAX_MATCHES): Range[] {
  const needle = query.toLowerCase();
  if (needle.length === 0) return [];
  const haystack = text.toLowerCase();
  const matches: Range[] = [];
  let from = 0;
  while (matches.length < max) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    matches.push({ start: at, end: at + needle.length });
    from = at + needle.length; // non-overlapping
  }
  return matches;
}

export function nextIndex(current: number, total: number, step: 1 | -1): number {
  if (total === 0) return -1;
  if (current < 0) return step === 1 ? 0 : total - 1;
  return (current + step + total) % total;
}

export interface Segment {
  node: number;
  start: number;
  end: number;
  match: number;
}

/**
 * Splits global match ranges into per-node segments, given the length of
 * each text node in document order. Segments are returned in node order.
 */
export function segmentsFor(nodeLengths: readonly number[], matches: readonly Range[]): Segment[] {
  const segments: Segment[] = [];
  let offset = 0;
  let m = 0;
  for (let n = 0; n < nodeLengths.length; n++) {
    const length = nodeLengths[n] ?? 0;
    const nodeStart = offset;
    const nodeEnd = offset + length;
    // skip matches that end before this node
    while (m < matches.length && (matches[m]?.end ?? 0) <= nodeStart) m++;
    for (let k = m; k < matches.length; k++) {
      const match = matches[k];
      if (!match || match.start >= nodeEnd) break;
      const start = Math.max(match.start, nodeStart) - nodeStart;
      const end = Math.min(match.end, nodeEnd) - nodeStart;
      if (end > start) segments.push({ node: n, start, end, match: k });
    }
    offset = nodeEnd;
  }
  return segments;
}

// --- DOM part -------------------------------------------------------------

function must<T>(element: T | null): T {
  if (element === null) throw new Error("search panel markup is incomplete");
  return element;
}

export interface Search {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Re-runs the current query, e.g. after the document was re-rendered. */
  refresh(): void;
  step(direction: 1 | -1): void;
}

export function createSearch(
  panel: HTMLElement,
  content: HTMLElement,
  scroller: HTMLElement,
  outline: Outline,
): Search {
  panel.innerHTML = `
    <input class="search__input" type="search" placeholder="Find in document" autocomplete="off" spellcheck="false" aria-label="Find in document">
    <span class="search__count" aria-live="polite"></span>
    <button class="search__button" type="button" data-step="-1" title="Previous (Shift+Enter)" aria-label="Previous match">↑</button>
    <button class="search__button" type="button" data-step="1" title="Next (Enter)" aria-label="Next match">↓</button>
    <button class="search__button" type="button" data-close title="Close (Esc)" aria-label="Close search">×</button>
  `;
  const input = must(panel.querySelector<HTMLInputElement>(".search__input"));
  const count = must(panel.querySelector<HTMLElement>(".search__count"));

  let marks: HTMLElement[][] = []; // per match, the <mark> elements that make it up
  let current = -1;
  let total = 0;
  let truncated = false;

  function textNodes(): Text[] {
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        // KaTeX duplicates every formula (MathML for screen readers + HTML);
        // marking inside it breaks the layout. Formulas are not searched.
        if (parent.closest(".katex, script, style")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes: Text[] = [];
    let node = walker.nextNode();
    while (node) {
      nodes.push(node as Text);
      node = walker.nextNode();
    }
    return nodes;
  }

  function clearMarks(): void {
    // Reset first: if unwrapping fails halfway, the next search must start clean.
    const old = marks;
    marks = [];
    current = -1;
    total = 0;
    truncated = false;
    for (const group of old) {
      for (const mark of group) {
        const parent = mark.parentNode;
        if (!parent) continue;
        parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
        parent.normalize();
      }
    }
  }

  /** A failure must show up in the panel, not silently leave a dead search box. */
  function run(query: string): void {
    try {
      search(query);
    } catch (error) {
      console.error("mdview: search failed", error);
      total = 0;
      current = -1;
      count.textContent = `Search error: ${error instanceof Error ? error.message : String(error)}`;
      count.classList.add("search__count--none");
    }
  }

  function search(query: string): void {
    clearMarks();
    if (query.length === 0) {
      count.textContent = "";
      outline.setMarks([]);
      return;
    }
    const nodes = textNodes();
    const lengths = nodes.map((n) => n.data.length);
    const fullText = nodes.map((n) => n.data).join("");
    const found = findMatches(fullText, query, MAX_MATCHES + 1);
    truncated = found.length > MAX_MATCHES;
    const matches = truncated ? found.slice(0, MAX_MATCHES) : found;
    total = matches.length;
    marks = matches.map(() => []);

    // Wrap from the last node backwards so earlier offsets stay valid.
    const segments = segmentsFor(lengths, matches);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (!seg) continue;
      const node = nodes[seg.node];
      if (!node) continue;
      const tail = node.splitText(seg.start);
      tail.splitText(seg.end - seg.start);
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      tail.parentNode?.replaceChild(mark, tail);
      mark.append(tail);
      marks[seg.match]?.unshift(mark);
    }

    outline.setMarks(
      marks.map((group) => {
        const first = group[0];
        if (!first) return 0;
        return (
          (first.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top +
            scroller.scrollTop) /
          Math.max(1, scroller.scrollHeight)
        );
      }),
    );
    goTo(total > 0 ? firstVisibleMatch() : -1);
  }

  /** The first match at or below the current scroll position, else the first one. */
  function firstVisibleMatch(): number {
    const top = scroller.getBoundingClientRect().top;
    const index = marks.findIndex((group) => (group[0]?.getBoundingClientRect().top ?? -1) >= top);
    return index === -1 ? 0 : index;
  }

  function goTo(index: number): void {
    if (current >= 0) {
      for (const mark of marks[current] ?? []) mark.classList.remove("search-hit--current");
    }
    current = index;
    if (current >= 0) {
      const group = marks[current] ?? [];
      for (const mark of group) mark.classList.add("search-hit--current");
      group[0]?.scrollIntoView({ block: "center" });
    }
    count.textContent = total === 0 ? "0 / 0" : `${current + 1} / ${total}${truncated ? "+" : ""}`;
    count.classList.toggle("search__count--none", total === 0);
  }

  function step(direction: 1 | -1): void {
    if (total === 0) return;
    goTo(nextIndex(current, total, direction));
  }

  function open(): void {
    const selection = window.getSelection()?.toString().trim() ?? "";
    panel.hidden = false;
    if (selection && selection.length < 200 && !selection.includes("\n")) input.value = selection;
    input.focus();
    input.select();
    run(input.value);
  }

  function close(): void {
    clearMarks();
    outline.setMarks([]);
    count.textContent = "";
    panel.hidden = true;
    scroller.focus({ preventScroll: true });
  }

  input.addEventListener("input", () => run(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
  panel.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("button");
    if (!button) return;
    if (button.dataset.step) step(button.dataset.step === "-1" ? -1 : 1);
    if ("close" in button.dataset) close();
    input.focus();
  });

  return {
    open,
    close,
    step,
    isOpen: () => !panel.hidden,
    refresh: () => {
      if (!panel.hidden) run(input.value);
    },
  };
}
