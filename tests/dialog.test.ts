import { describe, expect, test } from "bun:test";
import { describe as describeNames } from "../src/client/dialog.ts";

describe("unsaved-changes wording", () => {
  test("one document is named", () => {
    expect(describeNames(["notes.md"])).toBe("“notes.md” has unsaved changes.");
  });

  test("several documents are counted and the list is cut", () => {
    expect(describeNames(["a.md", "b.md"])).toBe("2 documents have unsaved changes: a.md, b.md.");
    expect(describeNames(["1", "2", "3", "4", "5", "6"])).toBe(
      "6 documents have unsaved changes: 1, 2, 3, 4 and 2 more.",
    );
  });
});
