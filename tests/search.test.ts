import { describe, expect, test } from "bun:test";
import { findMatches, MAX_MATCHES, nextIndex, segmentsFor } from "../src/client/search.ts";

describe("findMatches", () => {
  test("case-insensitive, non-overlapping, in order", () => {
    expect(findMatches("Turing turing TURING", "turing")).toEqual([
      { start: 0, end: 6 },
      { start: 7, end: 13 },
      { start: 14, end: 20 },
    ]);
    expect(findMatches("aaaa", "aa")).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  test("Cyrillic and mixed case", () => {
    expect(findMatches("Паттерны Тьюринга и паттерны", "ПАТТЕРНЫ")).toEqual([
      { start: 0, end: 8 },
      { start: 20, end: 28 },
    ]);
  });

  test("empty query or no hits", () => {
    expect(findMatches("text", "")).toEqual([]);
    expect(findMatches("text", "zzz")).toEqual([]);
    expect(findMatches("", "a")).toEqual([]);
  });

  test("the cap limits the work", () => {
    expect(findMatches("a".repeat(5000), "a").length).toBe(MAX_MATCHES);
    expect(findMatches("a".repeat(5000), "a", 10).length).toBe(10);
  });
});

describe("nextIndex", () => {
  test("wraps around in both directions", () => {
    expect(nextIndex(0, 3, 1)).toBe(1);
    expect(nextIndex(2, 3, 1)).toBe(0);
    expect(nextIndex(0, 3, -1)).toBe(2);
  });

  test("from nothing selected goes to first or last", () => {
    expect(nextIndex(-1, 3, 1)).toBe(0);
    expect(nextIndex(-1, 3, -1)).toBe(2);
    expect(nextIndex(-1, 0, 1)).toBe(-1);
  });
});

describe("segmentsFor", () => {
  test("a match inside one node", () => {
    expect(segmentsFor([10], [{ start: 2, end: 5 }])).toEqual([
      { node: 0, start: 2, end: 5, match: 0 },
    ]);
  });

  test("a match spanning three nodes is split per node", () => {
    // nodes: "bold" (4) | " " (1) | "text here" (9); match "bold text" = 0..9
    expect(segmentsFor([4, 1, 9], [{ start: 0, end: 9 }])).toEqual([
      { node: 0, start: 0, end: 4, match: 0 },
      { node: 1, start: 0, end: 1, match: 0 },
      { node: 2, start: 0, end: 4, match: 0 },
    ]);
  });

  test("several matches, empty nodes, matches beyond the end are ignored", () => {
    expect(
      segmentsFor(
        [3, 0, 3],
        [
          { start: 1, end: 2 },
          { start: 4, end: 6 },
          { start: 10, end: 12 },
        ],
      ),
    ).toEqual([
      { node: 0, start: 1, end: 2, match: 0 },
      { node: 2, start: 1, end: 3, match: 1 },
    ]);
  });
});
