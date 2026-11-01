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
  // With Shift held some platforms report Tab as "ISO_Left_Tab"; the position stays "Tab".
  if (event.code === "Tab") return "Tab";
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(event.code);
  if (digit?.[1]) return digit[1];
  switch (event.code) {
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
