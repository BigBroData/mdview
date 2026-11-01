import { describe, expect, test } from "bun:test";
import { chordKey } from "../src/client/keys.ts";

describe("chordKey", () => {
  test("letters are named by the physical key, whatever the layout", () => {
    expect(chordKey({ key: "f", code: "KeyF" })).toBe("f");
    expect(chordKey({ key: "а", code: "KeyF" })).toBe("f"); // Russian layout
    expect(chordKey({ key: "щ", code: "KeyO" })).toBe("o");
    expect(chordKey({ key: "W", code: "KeyW" })).toBe("w"); // Shift held
  });

  test("zoom keys, main row and numpad", () => {
    expect(chordKey({ key: "=", code: "Equal" })).toBe("+");
    expect(chordKey({ key: "+", code: "Equal" })).toBe("+");
    expect(chordKey({ key: "+", code: "NumpadAdd" })).toBe("+");
    expect(chordKey({ key: "-", code: "Minus" })).toBe("-");
    expect(chordKey({ key: "_", code: "Minus" })).toBe("-");
    expect(chordKey({ key: "0", code: "Digit0" })).toBe("0");
    expect(chordKey({ key: "0", code: "Numpad0" })).toBe("0");
  });

  test("digits pick tabs", () => {
    expect(chordKey({ key: "1", code: "Digit1" })).toBe("1");
    expect(chordKey({ key: "!", code: "Digit1" })).toBe("1"); // Shift held
    expect(chordKey({ key: "9", code: "Numpad9" })).toBe("9");
  });

  test("other keys keep their name", () => {
    expect(chordKey({ key: "Escape", code: "Escape" })).toBe("Escape");
    expect(chordKey({ key: "F3", code: "F3" })).toBe("F3");
    expect(chordKey({ key: "ArrowLeft", code: "ArrowLeft" })).toBe("ArrowLeft");
  });
});
