import { createHistory, type History } from "./history.ts";

/**
 * Open documents as tabs. Every tab has its own back/forward history, so
 * following a link inside one tab never disturbs the others. This module is
 * only the bookkeeping; showing a tab is main.ts's job.
 */
export interface Tab {
  readonly id: number;
  /** The document the tab shows now (changes when a link is followed inside it). */
  path: string;
  name: string;
  readonly history: History;
}

export interface Tabs {
  all(): readonly Tab[];
  active(): Tab | undefined;
  /** Appends a tab and makes it the active one. */
  add(path: string, name: string): Tab;
  /** The first tab that shows this document. */
  find(path: string): Tab | undefined;
  activate(id: number): void;
  /**
   * Removes a tab. When it was the active one, nothing is active afterwards
   * and the result is the tab to show next (right neighbour, else left);
   * otherwise the result is the tab that stays active.
   */
  remove(id: number): Tab | undefined;
  /** The neighbour of the active tab, wrapping around; for Ctrl+Tab. */
  step(direction: 1 | -1): Tab | undefined;
  /** The n-th tab, counting from 0. */
  at(position: number): Tab | undefined;
}

export function createTabs(): Tabs {
  const tabs: Tab[] = [];
  let activeId: number | undefined;
  let nextId = 1;
  const indexOf = (id: number | undefined) => tabs.findIndex((tab) => tab.id === id);
  return {
    all: () => tabs,
    active: () => tabs.find((tab) => tab.id === activeId),
    add(path, name) {
      const tab: Tab = { id: nextId++, path, name, history: createHistory() };
      tabs.push(tab);
      activeId = tab.id;
      return tab;
    },
    find: (path) => tabs.find((tab) => tab.path === path),
    activate(id) {
      if (indexOf(id) !== -1) activeId = id;
    },
    remove(id) {
      const index = indexOf(id);
      if (index === -1) return tabs.find((tab) => tab.id === activeId);
      tabs.splice(index, 1);
      if (id !== activeId) return tabs.find((tab) => tab.id === activeId);
      activeId = undefined;
      return tabs[index] ?? tabs[index - 1];
    },
    step(direction) {
      const index = indexOf(activeId);
      if (index === -1 || tabs.length < 2) return undefined;
      return tabs[(index + direction + tabs.length) % tabs.length];
    },
    at: (position) => tabs[position],
  };
}
