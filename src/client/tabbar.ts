import type { Tab } from "./tabs.ts";

/**
 * The strip of tabs above the document. It stays out of sight while there is
 * only one document, so the common case looks exactly as before.
 */
export interface TabBar {
  update(tabs: readonly Tab[], activeId: number | undefined): void;
}

interface Handlers {
  select(id: number): void;
  close(id: number): void;
}

export function createTabBar(bar: HTMLElement, handlers: Handlers): TabBar {
  let shown = "";

  function idOf(target: EventTarget | null): number | undefined {
    const tab = (target as Element | null)?.closest<HTMLElement>(".tab");
    return tab ? Number(tab.dataset.id) : undefined;
  }

  bar.addEventListener("click", (event) => {
    const id = idOf(event.target);
    if (id === undefined) return;
    if ((event.target as Element).closest(".tab__close")) handlers.close(id);
    else handlers.select(id);
  });
  // Middle click closes, as in a browser; keep the middle button from starting auto-scroll.
  bar.addEventListener("mousedown", (event) => {
    if (event.button === 1) event.preventDefault();
  });
  bar.addEventListener("auxclick", (event) => {
    const id = idOf(event.target);
    if (event.button === 1 && id !== undefined) {
      event.preventDefault();
      handlers.close(id);
    }
  });

  return {
    update(tabs, activeId) {
      const visible = tabs.length > 1;
      bar.hidden = !visible;
      document.documentElement.dataset.tabs = visible ? "on" : "off";
      // Re-rendering a document calls this often; rebuild only when something shows differently.
      const signature = JSON.stringify([
        activeId,
        tabs.map((tab) => [tab.id, tab.name, tab.path, tab.dirty]),
      ]);
      if (signature === shown) return;
      shown = signature;
      bar.replaceChildren(
        ...tabs.map((tab) => {
          const item = document.createElement("div");
          item.className = tab.id === activeId ? "tab tab--active" : "tab";
          item.dataset.id = String(tab.id);
          item.setAttribute("role", "tab");
          item.setAttribute("aria-selected", String(tab.id === activeId));
          item.title = tab.path;
          if (tab.dirty) {
            const dot = document.createElement("span");
            dot.className = "tab__dirty";
            dot.title = "Unsaved changes";
            dot.setAttribute("aria-label", "Unsaved changes");
            dot.textContent = "●";
            item.append(dot);
          }
          const name = document.createElement("span");
          name.className = "tab__name";
          name.textContent = tab.name;
          const close = document.createElement("button");
          close.className = "tab__close";
          close.type = "button";
          close.tabIndex = -1;
          close.title = "Close (Ctrl+W)";
          close.setAttribute("aria-label", `Close ${tab.name}`);
          close.textContent = "×";
          item.append(name, close);
          return item;
        }),
      );
      bar.querySelector(".tab--active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
  };
}
