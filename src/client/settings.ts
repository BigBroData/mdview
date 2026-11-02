/**
 * Reader settings that survive restarts: text column width, text size, theme and contents panel.
 * Pure functions here; the storage is injected so tests need no browser.
 */
export const WIDTHS = ["column", "wide", "full"] as const;
export type Width = (typeof WIDTHS)[number];

export const ZOOM_MIN = 12;
export const ZOOM_MAX = 28;
export const ZOOM_STEP = 1;
export const ZOOM_DEFAULT = 17;

export interface Settings {
  width: Width;
  /** Base text size in CSS pixels. */
  zoom: number;
  /** Name of the chosen theme; empty means the app's own colours. */
  theme: string;
  /** Whether the contents panel at the left edge is shown. */
  toc: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  width: "column",
  zoom: ZOOM_DEFAULT,
  theme: "",
  toc: false,
};

export function nextWidth(current: Width): Width {
  const index = WIDTHS.indexOf(current);
  return WIDTHS[(index + 1) % WIDTHS.length] ?? "column";
}

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value)));
}

export function isWidth(value: unknown): value is Width {
  return typeof value === "string" && (WIDTHS as readonly string[]).includes(value);
}

/** The subset of Storage we use; `localStorage` fits, so does a Map-backed fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = "mdview.settings";

export function loadSettings(store: KeyValueStore | null): Settings {
  if (!store) return { ...DEFAULT_SETTINGS };
  try {
    const raw = store.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_SETTINGS };
    const candidate = parsed as Partial<Record<keyof Settings, unknown>>;
    return {
      width: isWidth(candidate.width) ? candidate.width : DEFAULT_SETTINGS.width,
      zoom: typeof candidate.zoom === "number" ? clampZoom(candidate.zoom) : DEFAULT_SETTINGS.zoom,
      theme:
        typeof candidate.theme === "string" && candidate.theme.length <= 100
          ? candidate.theme
          : DEFAULT_SETTINGS.theme,
      toc: typeof candidate.toc === "boolean" ? candidate.toc : DEFAULT_SETTINGS.toc,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(store: KeyValueStore | null, settings: Settings): void {
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(settings));
  } catch {
    // private mode or blocked storage: the setting still applies for this run
  }
}

/** `localStorage` can throw on access in some browser modes; treat that as "none". */
export function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
