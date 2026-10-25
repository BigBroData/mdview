import { describe, expect, test } from "bun:test";
import { ArgsError, DEFAULT_PORT, parseArgs } from "../src/server/args.ts";

describe("parseArgs", () => {
  test("file only", () => {
    expect(parseArgs(["notes.md"])).toEqual({
      file: "notes.md",
      port: DEFAULT_PORT,
      open: false,
      dev: false,
    });
  });

  test("port and open in any order", () => {
    expect(parseArgs(["--open", "a.md", "--port", "0"])).toEqual({
      file: "a.md",
      port: 0,
      open: true,
      dev: false,
    });
    expect(parseArgs(["a.md", "--port=8080"])).toEqual({
      file: "a.md",
      port: 8080,
      open: false,
      dev: false,
    });
  });

  test("errors are ArgsError with usage text", () => {
    expect(() => parseArgs([])).toThrow(ArgsError);
    expect(() => parseArgs([])).toThrow(/Usage:/);
    expect(() => parseArgs(["a.md", "b.md"])).toThrow(/Only one file/);
    expect(() => parseArgs(["a.md", "--port"])).toThrow(/--port expects a number/);
    expect(() => parseArgs(["a.md", "--port", "abc"])).toThrow(/--port expects a number/);
    expect(() => parseArgs(["a.md", "--port", "70000"])).toThrow(/0\.\.65535/);
    expect(() => parseArgs(["a.md", "--bogus"])).toThrow(/Unknown option/);
    expect(() => parseArgs(["--help"])).toThrow(ArgsError);
    expect(parseArgs(["a.md", "--dev"]).dev).toBe(true);
  });
});
