import { describe, expect, test } from "bun:test";
import { commandGroups } from "../src/client/start-screen.ts";

const labels = (groups: ReturnType<typeof commandGroups>) =>
  groups.flatMap((group) => group.commands.map((command) => command.label));

describe("start screen commands", () => {
  const all = {
    open: true,
    create: true,
    drop: true,
    tabs: true,
    edit: true,
    saveAs: true,
    quit: true,
  };
  const none = {
    open: false,
    create: false,
    drop: false,
    tabs: false,
    edit: false,
    saveAs: false,
    quit: false,
  };

  test("the desktop window lists files, reading and editing commands", () => {
    const groups = commandGroups(all);
    expect(groups.map((g) => g.title)).toEqual(["Files", "Reading", "Editing"]);
    expect(labels(groups)).toContain("Edit the document");
    expect(labels(groups)).toContain("Switch theme");
  });

  test("creating a file and saving under another name are listed with their keys", () => {
    const commands = commandGroups(all).flatMap((group) => group.commands);
    expect(commands.find((c) => c.label === "New file")?.keys).toEqual([["Ctrl", "N"]]);
    expect(commands.find((c) => c.label === "Save as")?.keys).toEqual([["Ctrl", "Shift", "S"]]);
    expect(commands.find((c) => c.label === "Hide or show the preview")?.keys).toEqual([
      ["Ctrl", "Shift", "E"],
    ]);
  });

  test("the shortcuts window opens with F1 or ? in every host", () => {
    for (const caps of [all, none]) {
      const commands = commandGroups(caps).flatMap((group) => group.commands);
      expect(commands.find((c) => c.label === "Show this list")?.keys).toEqual([["F1"], ["?"]]);
    }
  });

  test("Quit is listed only where the window can be closed, and Close the tab is not Quit", () => {
    const commands = commandGroups(all).flatMap((group) => group.commands);
    expect(commands.find((c) => c.label === "Quit")?.keys).toEqual([["Ctrl", "Q"]]);
    expect(commands.find((c) => c.label === "Close the tab")?.keys).toEqual([["Ctrl", "W"]]);
    expect(labels(commandGroups({ ...all, quit: false }))).not.toContain("Quit");
  });

  test("every key the page handles by itself is described", () => {
    const names = labels(commandGroups(all));
    for (const label of [
      "Next and previous match",
      "Close search or list",
      "Link in a new tab",
      "Undo and redo",
      "Quit",
      "Close the tab",
    ]) {
      expect(names).toContain(label);
    }
  });

  test("the browser stage promises nothing it cannot do", () => {
    const groups = commandGroups(none);
    expect(groups.map((g) => g.title)).toEqual(["Reading"]);
    expect(labels(groups)).not.toContain("Edit the document");
    expect(labels(groups)).not.toContain("Close the tab");
    expect(labels(groups)).not.toContain("New file");
  });

  test("a host that edits but cannot name files does not list New file or Save as", () => {
    const names = labels(commandGroups({ ...none, edit: true }));
    expect(names).toContain("Save");
    expect(names).not.toContain("Save as");
    expect(names).not.toContain("New file");
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
