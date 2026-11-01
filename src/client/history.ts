/**
 * Back / forward through documents and positions, like a browser: following a
 * link or an in-page anchor pushes an entry; Alt+Left / Alt+Right walk it.
 * Each entry remembers where the reader was, so Back returns to the same line.
 */
export interface Entry {
  path: string;
  scrollTop: number;
}

export interface History {
  /** The entry being shown. */
  current(): Entry | undefined;
  /** Records where the reader is in the current entry. */
  saveScroll(scrollTop: number): void;
  /** Adds an entry after the current one, dropping any forward entries. */
  push(entry: Entry): void;
  back(): Entry | undefined;
  forward(): Entry | undefined;
}

export function createHistory(): History {
  const entries: Entry[] = [];
  let index = -1;
  return {
    current: () => entries[index],
    saveScroll(scrollTop) {
      const entry = entries[index];
      if (entry) entry.scrollTop = scrollTop;
    },
    push(entry) {
      entries.length = index + 1;
      entries.push({ ...entry });
      index = entries.length - 1;
    },
    back() {
      if (index <= 0) return undefined;
      index -= 1;
      return entries[index];
    },
    forward() {
      if (index >= entries.length - 1) return undefined;
      index += 1;
      return entries[index];
    },
  };
}
