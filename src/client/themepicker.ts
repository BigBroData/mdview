import { displayName, SYSTEM_THEME, type Theme } from "./themes.ts";

/**
 * The theme switcher (Ctrl+Shift+T): a small list near the top right corner.
 * Arrow keys move through it and show each theme at once; Enter keeps the one
 * shown, Esc puts the old one back, a click picks.
 */
export interface ThemePicker {
  open(): Promise<void>;
  close(): void;
  isOpen(): boolean;
}

interface Host {
  /** Re-reads the theme files from disk, so a file written a minute ago is in the list. */
  refresh(): Promise<void>;
  themes(): readonly Theme[];
  /** Where the user's own themes go, for the hint. */
  dir(): string;
  /** The theme in force before the picker was opened. */
  current(): string;
  /** Shows a theme without keeping it. */
  preview(name: string): void;
  /** Keeps a theme. */
  choose(name: string): void;
}

export function createThemePicker(panel: HTMLElement, host: Host): ThemePicker {
  let names: string[] = [];
  let selected = SYSTEM_THEME;
  let original = SYSTEM_THEME;

  function render(themes: readonly Theme[]): void {
    const rows = [{ name: SYSTEM_THEME, tag: "follows the system" }].concat(
      themes.map((theme) => ({ name: theme.name, tag: theme.builtin ? "built-in" : "yours" })),
    );
    names = rows.map((row) => row.name);
    const title = document.createElement("div");
    title.className = "themes__title";
    title.textContent = "Theme";
    const list = document.createElement("div");
    list.className = "themes__list";
    list.setAttribute("role", "listbox");
    for (const row of rows) {
      const item = document.createElement("div");
      item.className = "themes__item";
      item.setAttribute("role", "option");
      item.dataset.name = row.name;
      const label = document.createElement("span");
      label.textContent = displayName(row.name);
      const tag = document.createElement("span");
      tag.className = "themes__tag";
      tag.textContent = row.tag;
      item.append(label, tag);
      list.append(item);
    }
    const hint = document.createElement("div");
    hint.className = "themes__hint";
    hint.textContent = host.dir()
      ? `Your own themes: .css files in ${host.dir()}`
      : "Your own themes: .css files in the mdview themes folder";
    panel.replaceChildren(title, list, hint);
    mark();
  }

  function mark(): void {
    for (const item of panel.querySelectorAll<HTMLElement>(".themes__item")) {
      const on = item.dataset.name === selected;
      item.classList.toggle("themes__item--selected", on);
      item.setAttribute("aria-selected", String(on));
      if (on) item.scrollIntoView({ block: "nearest" });
    }
  }

  function select(name: string): void {
    selected = name;
    mark();
    host.preview(name);
  }

  function move(delta: number): void {
    const index = Math.max(0, names.indexOf(selected));
    const next = names[Math.min(names.length - 1, Math.max(0, index + delta))];
    if (next !== undefined) select(next);
  }

  function finish(keep: boolean): void {
    if (panel.hidden) return;
    panel.hidden = true;
    if (keep) host.choose(selected);
    else host.preview(original);
  }

  panel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") move(1);
    else if (event.key === "ArrowUp") move(-1);
    else if (event.key === "Home") move(-names.length);
    else if (event.key === "End") move(names.length);
    else if (event.key === "Enter") finish(true);
    else if (event.key === "Escape") finish(false);
    else return;
    event.preventDefault();
    event.stopPropagation();
  });
  panel.addEventListener("click", (event) => {
    const item = (event.target as Element).closest<HTMLElement>(".themes__item");
    if (!item) return;
    selected = item.dataset.name ?? SYSTEM_THEME;
    finish(true);
  });
  // Clicking elsewhere keeps what is shown, like leaving any menu.
  panel.addEventListener("focusout", (event) => {
    if (!panel.contains(event.relatedTarget as Node | null)) finish(true);
  });

  return {
    async open() {
      await host.refresh();
      original = host.current();
      selected = original;
      render(host.themes());
      panel.hidden = false;
      panel.focus();
    },
    close: () => finish(false),
    isOpen: () => !panel.hidden,
  };
}
