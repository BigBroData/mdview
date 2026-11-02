import { describe, expect, test } from "bun:test";
import { commandGroups } from "../src/client/start-screen.ts";

const labels = (groups: ReturnType<typeof commandGroups>) =>
  groups.flatMap((group) => group.commands.map((command) => command.label));

describe("start screen commands", () => {
  const all = { open: true, drop: true, tabs: true, edit: true };

  test("the desktop window lists files, reading and editing commands", () => {
    const groups = commandGroups(all);
    expect(groups.map((g) => g.title)).toEqual(["Files", "Reading", "Editing"]);
    expect(labels(groups)).toContain("Edit the document");
    expect(labels(groups)).toContain("Switch theme");
  });

  test("the browser stage promises nothing it cannot do", () => {
    const groups = commandGroups({ open: false, drop: false, tabs: false, edit: false });
    expect(groups.map((g) => g.title)).toEqual(["Reading"]);
    expect(labels(groups)).not.toContain("Edit the document");
    expect(labels(groups)).not.toContain("Close the tab");
  });

  test("every command has at least one key combination", () => {
    for (const group of commandGroups(all)) {
      for (const command of group.commands) {
        expect(command.keys.length).toBeGreaterThan(0);
        for (const combo of command.keys) expect(combo.length).toBeGreaterThan(0);
      }
    }
  });
});
