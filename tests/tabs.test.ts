import { describe, expect, test } from "bun:test";
import { createTabs } from "../src/client/tabs.ts";

function three() {
  const tabs = createTabs();
  const a = tabs.add("/d/a.md", "a.md");
  const b = tabs.add("/d/b.md", "b.md");
  const c = tabs.add("/d/c.md", "c.md");
  return { tabs, a, b, c };
}

describe("tabs", () => {
  test("a new tab becomes the active one", () => {
    const { tabs, c } = three();
    expect(tabs.active()).toBe(c);
    expect(tabs.all().map((tab) => tab.name)).toEqual(["a.md", "b.md", "c.md"]);
  });

  test("find by the document a tab shows", () => {
    const { tabs, b } = three();
    expect(tabs.find("/d/b.md")).toBe(b);
    expect(tabs.find("/d/none.md")).toBeUndefined();
    b.path = "/d/other.md";
    expect(tabs.find("/d/b.md")).toBeUndefined();
    expect(tabs.find("/d/other.md")).toBe(b);
  });

  test("activate ignores unknown ids", () => {
    const { tabs, a } = three();
    tabs.activate(a.id);
    expect(tabs.active()).toBe(a);
    tabs.activate(999);
    expect(tabs.active()).toBe(a);
  });

  test("closing the active tab proposes the right neighbour, else the left", () => {
    const { tabs, a, b, c } = three();
    tabs.activate(b.id);
    expect(tabs.remove(b.id)).toBe(c);
    expect(tabs.active()).toBeUndefined(); // the caller activates the proposal
    tabs.activate(c.id);
    expect(tabs.remove(c.id)).toBe(a);
    tabs.activate(a.id);
    expect(tabs.remove(a.id)).toBeUndefined();
    expect(tabs.all()).toEqual([]);
  });

  test("closing another tab keeps the active one", () => {
    const { tabs, a, b, c } = three();
    tabs.activate(a.id);
    expect(tabs.remove(c.id)).toBe(a);
    expect(tabs.active()).toBe(a);
    expect(tabs.remove(999)).toBe(a);
    expect(tabs.all()).toEqual([a, b]);
  });

  test("step wraps around and needs at least two tabs", () => {
    const { tabs, a, b, c } = three();
    expect(tabs.step(1)).toBe(a);
    tabs.activate(a.id);
    expect(tabs.step(-1)).toBe(c);
    expect(tabs.step(1)).toBe(b);
    const single = createTabs();
    single.add("/d/a.md", "a.md");
    expect(single.step(1)).toBeUndefined();
  });

  test("at counts from zero", () => {
    const { tabs, a, c } = three();
    expect(tabs.at(0)).toBe(a);
    expect(tabs.at(2)).toBe(c);
    expect(tabs.at(3)).toBeUndefined();
  });

  test("every tab keeps its own history", () => {
    const { tabs, a, b } = three();
    a.history.push({ path: "/d/a.md", scrollTop: 10 });
    b.history.push({ path: "/d/b.md", scrollTop: 20 });
    expect(a.history.current()?.scrollTop).toBe(10);
    expect(b.history.current()?.scrollTop).toBe(20);
    expect(tabs.all()).toHaveLength(3);
  });
});
