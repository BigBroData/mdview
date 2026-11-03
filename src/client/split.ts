import { clampSplit, SPLIT_DEFAULT } from "./settings.ts";

/** One arrow-key press moves the divider by this share of the editing area. */
export const SPLIT_KEY_STEP = 0.02;

/**
 * The editor's share of the editing area when the divider is at `x`; `left` is the
 * editor's left edge and `right` the preview's right edge. Kept inside the bounds
 * of the settings, so neither pane can be dragged shut.
 */
export function shareAt(x: number, left: number, right: number): number {
  const width = right - left;
  return width > 0 ? clampSplit((x - left) / width) : SPLIT_DEFAULT;
}

export interface SplitDeps {
  /** The thin bar between the editor and the preview. */
  handle: HTMLElement;
  editor: HTMLElement;
  scroller: HTMLElement;
  get(): number;
  /** Applies a share; `final` is false while the pointer is still moving. */
  set(share: number, final: boolean): void;
}

/**
 * Makes the bar draggable (pointer), adjustable by keys (← →, Home) and resettable
 * (double click).
 */
export function createSplit(deps: SplitDeps): void {
  const { handle, editor, scroller } = deps;
  let dragging: { left: number; right: number } | undefined;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    dragging = {
      left: editor.getBoundingClientRect().left,
      right: scroller.getBoundingClientRect().right,
    };
    handle.dataset.dragging = "";
  });
  handle.addEventListener("pointermove", (event) => {
    if (dragging) deps.set(shareAt(event.clientX, dragging.left, dragging.right), false);
  });
  const finish = (event: PointerEvent): void => {
    if (!dragging) return;
    deps.set(shareAt(event.clientX, dragging.left, dragging.right), true);
    dragging = undefined;
    delete handle.dataset.dragging;
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("dblclick", () => deps.set(SPLIT_DEFAULT, true));
  handle.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") deps.set(clampSplit(deps.get() - SPLIT_KEY_STEP), true);
    else if (event.key === "ArrowRight") deps.set(clampSplit(deps.get() + SPLIT_KEY_STEP), true);
    else if (event.key === "Home") deps.set(SPLIT_DEFAULT, true);
    else return;
    event.preventDefault();
  });
}
