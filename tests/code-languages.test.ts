import { describe, expect, test } from "bun:test";
import { codeLanguage } from "../src/client/code-languages.ts";

describe("codeLanguage", () => {
  test("finds a language by name or alias, in any case", () => {
    expect(codeLanguage("ts")?.name).toBe("TypeScript");
    expect(codeLanguage("TypeScript")?.name).toBe("TypeScript");
    expect(codeLanguage("JS")?.name).toBe("JavaScript");
    expect(codeLanguage("bash")?.name).toBe("Shell");
    expect(codeLanguage("yml")?.name).toBe("YAML");
    expect(codeLanguage("rs")?.name).toBe("Rust");
  });

  test("only the first word of the info string counts", () => {
    expect(codeLanguage("python title=app.py")?.name).toBe("Python");
    expect(codeLanguage("  json  ")?.name).toBe("JSON");
  });

  test("an empty or unknown info string stays plain", () => {
    expect(codeLanguage("")).toBeNull();
    expect(codeLanguage("   ")).toBeNull();
    expect(codeLanguage("brainfuck")).toBeNull();
    expect(codeLanguage("math")).toBeNull();
  });

  test("a language that is not loaded yet is loadable", async () => {
    const description = codeLanguage("json");
    expect(description).not.toBeNull();
    const support = await description?.load();
    expect(support?.language).toBeDefined();
  });
});
