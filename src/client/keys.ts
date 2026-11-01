/**
 * Shortcuts must not depend on the keyboard layout: with a Russian layout
 * Ctrl+F reports `key === "а"`, but the physical key is still KeyF. So we
 * name a key by its position (`code`) when it is a letter, digit or one of the
 * zoom keys, and fall back to `key` for everything else (Escape, F3, arrows).
 */
export interface KeyLike {
  key: string;
  code: string;
}

export function chordKey(event: KeyLike): string {
  const letter = /^Key([A-Z])$/.exec(event.code);
  if (letter?.[1]) return letter[1].toLowerCase();
  switch (event.code) {
    case "Digit0":
    case "Numpad0":
      return "0";
    case "Equal":
    case "NumpadAdd":
      return "+";
    case "Minus":
    case "NumpadSubtract":
      return "-";
    default:
      return event.key;
  }
}
