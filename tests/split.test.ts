import { describe, expect, test } from "bun:test";
import { SPLIT_DEFAULT, SPLIT_MAX, SPLIT_MIN } from "../src/client/settings.ts";
import { shareAt } from "../src/client/split.ts";

describe("shareAt", () => {
  test("is the pointer's place across the editing area", () => {
    expect(shareAt(400, 0, 1000)).toBeCloseTo(0.4);
    expect(shareAt(300, 100, 900)).toBeCloseTo(0.25);
    expect(shareAt(500, 100, 900)).toBeCloseTo(0.5);
  });

  test("neither pane can be dragged shut", () => {
    expect(shareAt(0, 0, 1000)).toBe(SPLIT_MIN);
    expect(shareAt(-50, 0, 1000)).toBe(SPLIT_MIN);
    expect(shareAt(1000, 0, 1000)).toBe(SPLIT_MAX);
    expect(shareAt(5000, 0, 1000)).toBe(SPLIT_MAX);
  });

  test("an empty or reversed area falls back to the middle", () => {
    expect(shareAt(10, 500, 500)).toBe(SPLIT_DEFAULT);
    expect(shareAt(10, 600, 500)).toBe(SPLIT_DEFAULT);
  });
});
