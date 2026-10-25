import { describe, expect, test } from "bun:test";
import { MIN_HEADINGS, shouldShow, tickLayout, viewportBand } from "../src/client/outline.ts";

describe("tickLayout", () => {
  test("positions are fractions of the page height, clamped to 0..1", () => {
    const ticks = tickLayout(
      [
        { level: 1, text: "Top", top: 0 },
        { level: 2, text: "Middle", top: 500 },
        { level: 3, text: "Past the end", top: 1500 },
        { level: 2, text: "Negative", top: -10 },
      ],
      1000,
    );
    expect(ticks.map((t) => t.at)).toEqual([0, 0.5, 1, 0]);
    expect(ticks[1]).toMatchObject({ level: 2, text: "Middle" });
  });

  test("an empty page yields no ticks", () => {
    expect(tickLayout([{ level: 1, text: "x", top: 0 }], 0)).toEqual([]);
  });
});

describe("viewportBand", () => {
  test("band follows the scroll position", () => {
    expect(viewportBand(0, 200, 1000)).toEqual({ top: 0, height: 0.2 });
    expect(viewportBand(500, 200, 1000)).toEqual({ top: 0.5, height: 0.2 });
  });

  test("band never leaves the strip", () => {
    const nearEnd = viewportBand(900, 200, 1000);
    expect(nearEnd.top).toBeCloseTo(0.9);
    expect(nearEnd.height).toBeCloseTo(0.1);
    expect(viewportBand(5000, 200, 1000)).toEqual({ top: 1, height: 0 });
    expect(viewportBand(0, 200, 0)).toEqual({ top: 0, height: 1 });
  });
});

describe("shouldShow", () => {
  test("needs enough headings and a page taller than the window", () => {
    expect(shouldShow(MIN_HEADINGS, 3000, 800)).toBe(true);
    expect(shouldShow(MIN_HEADINGS - 1, 3000, 800)).toBe(false);
    expect(shouldShow(10, 1000, 800)).toBe(false);
  });
});
