import { type Capabilities, createCommandList } from "./start-screen.ts";

/**
 * The keyboard shortcuts window: F1 (or `?` while reading) shows every command with its keys,
 * the same list as the start screen, over whatever document is open. Esc, F1 or a click outside
 * the box closes it. Nothing typed in it reaches the page behind.
 */
export interface Help {
  isOpen(): boolean;
  toggle(): void;
  close(): void;
}

export function createHelp(caps: () => Capabilities): Help {
  let overlay: HTMLElement | undefined;
  let previous: HTMLElement | null = null;

  function close(): void {
    if (!overlay) return;
    overlay.remove();
    overlay = undefined;
    previous?.focus({ preventScroll: true });
    previous = null;
  }

  function open(): void {
    previous = document.activeElement as HTMLElement | null;
    const shade = document.createElement("div");
    shade.className = "modal help";
    const box = document.createElement("div");
    box.className = "modal__box help__box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "help-title");
    box.tabIndex = -1;
    const title = document.createElement("p");
    title.id = "help-title";
    title.className = "modal__title";
    title.textContent = "Keyboard shortcuts";
    const note = document.createElement("p");
    note.className = "modal__note";
    note.textContent = "F1 or Esc closes this window.";
    box.append(title, note, createCommandList(caps()));
    shade.append(box);

    shade.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape" || event.key === "F1") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        event.preventDefault(); // nothing in the box takes focus
      }
    });
    shade.addEventListener("mousedown", (event) => {
      if (event.target === shade) close();
    });
    document.body.append(shade);
    overlay = shade;
    box.focus();
  }

  return {
    isOpen: () => overlay !== undefined,
    toggle() {
      if (overlay) close();
      else open();
    },
    close,
  };
}
