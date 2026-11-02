import { describe, expect, test } from "bun:test";
import { currentHeading, indents } from "../src/client/toc.ts";

// A 3000px page, an 800px window: the reading line sits at 240px below the top.
const tops = [0, 600, 1500, 2900];

describe("currentHeading", () => {
  test("no headings, nothing is current", () => {
    expect(currentHeading([], 0, 800, 3000)).toBe(-1);
  });

  test("above the first heading nothing is current", () => {
    expect(currentHeading([300, 900], 0, 800, 3000)).toBe(-1);
  });

  test("the last heading above the reading line wins", () => {
    expect(currentHeading(tops, 0, 800, 3000)).toBe(0);
    expect(currentHeading(tops, 400, 800, 3000)).toBe(1); // 600 <= 400 + 240
    expect(currentHeading(tops, 300, 800, 3000)).toBe(0); // 600 > 300 + 240
    expect(currentHeading(tops, 1300, 800, 3000)).toBe(2);
  });

  test("at the bottom the last heading is current even if it never reaches the line", () => {
    expect(currentHeading(tops, 2200, 800, 3000)).toBe(3);
  });

  test("a page that fits the window does not count as scrolled to the bottom", () => {
    expect(currentHeading([0, 300], 0, 800, 700)).toBe(0);
  });
});

describe("indents", () => {
  test("relative to the shallowest heading, capped at three steps", () => {
    expect(indents([2, 3, 4, 2])).toEqual([0, 1, 2, 0]);
    expect(indents([1, 2, 3, 4, 5, 6])).toEqual([0, 1, 2, 3, 3, 3]);
    expect(indents([])).toEqual([]);
  });
});
