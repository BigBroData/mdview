/**
 * The "unsaved changes" question: Save, Discard or Cancel. A page of our own
 * instead of a native dialog, so it looks the same in every host and can be
 * driven from the keyboard: Enter saves, Esc cancels.
 */
export type Choice = "save" | "discard" | "cancel";

export function describe(names: readonly string[]): string {
  if (names.length === 1) return `“${names[0]}” has unsaved changes.`;
  const shown = names.slice(0, 4).join(", ");
  const more = names.length > 4 ? ` and ${names.length - 4} more` : "";
  return `${names.length} documents have unsaved changes: ${shown}${more}.`;
}

export function askUnsaved(names: readonly string[]): Promise<Choice> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;
    const overlay = document.createElement("div");
    overlay.className = "modal";
    const box = document.createElement("div");
    box.className = "modal__box";
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "modal-title");
    const title = document.createElement("p");
    title.id = "modal-title";
    title.className = "modal__title";
    title.textContent = describe(names);
    const note = document.createElement("p");
    note.className = "modal__note";
    note.textContent = "Your changes are lost if you do not save them.";
    const buttons = document.createElement("div");
    buttons.className = "modal__buttons";
    const many = names.length > 1;
    const make = (label: string, choice: Choice, primary = false) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = primary ? "modal__button modal__button--primary" : "modal__button";
      button.textContent = label;
      button.addEventListener("click", () => done(choice));
      return button;
    };
    const save = make(many ? "Save all" : "Save", "save", true);
    const all = [make("Cancel", "cancel"), make(many ? "Discard all" : "Discard", "discard"), save];
    buttons.append(...all);
    box.append(title, note, buttons);
    overlay.append(box);

    function done(choice: Choice): void {
      overlay.remove();
      previous?.focus({ preventScroll: true });
      resolve(choice);
    }

    // Nothing typed here may reach the page behind (Ctrl+W, Ctrl+S, ...).
    overlay.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        done("cancel");
      } else if (event.key === "Tab") {
        event.preventDefault();
        const index = all.indexOf(document.activeElement as HTMLButtonElement);
        const step = event.shiftKey ? -1 : 1;
        all[(index + step + all.length) % all.length]?.focus();
      }
    });
    document.body.append(overlay);
    save.focus();
  });
}
