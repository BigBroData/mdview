import {
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
  type StreamParser,
} from "@codemirror/language";

/**
 * Languages the editor can colour inside fenced code blocks. Each one is loaded the
 * first time a block of that language is on screen (a separate chunk of the bundle), so
 * a document without code costs nothing. The preview has its own highlighter (highlight.js).
 */
const stream = <S>(parser: StreamParser<S>) => new LanguageSupport(StreamLanguage.define(parser));

const descriptions = [
  LanguageDescription.of({
    name: "JavaScript",
    alias: ["js", "jsx", "mjs", "cjs", "javascript"],
    load: () => import("@codemirror/lang-javascript").then((m) => m.javascript({ jsx: true })),
  }),
  LanguageDescription.of({
    name: "TypeScript",
    alias: ["ts", "tsx", "typescript"],
    load: () =>
      import("@codemirror/lang-javascript").then((m) =>
        m.javascript({ jsx: true, typescript: true }),
      ),
  }),
  LanguageDescription.of({
    name: "Python",
    alias: ["py", "python", "python3"],
    load: () => import("@codemirror/lang-python").then((m) => m.python()),
  }),
  LanguageDescription.of({
    name: "JSON",
    alias: ["json", "jsonc", "json5"],
    load: () => import("@codemirror/lang-json").then((m) => m.json()),
  }),
  LanguageDescription.of({
    name: "CSS",
    alias: ["css"],
    load: () => import("@codemirror/lang-css").then((m) => m.css()),
  }),
  LanguageDescription.of({
    name: "HTML",
    alias: ["html", "htm", "xml", "svg", "vue"],
    load: () => import("@codemirror/lang-html").then((m) => m.html()),
  }),
  LanguageDescription.of({
    name: "Rust",
    alias: ["rust", "rs"],
    load: () => import("@codemirror/lang-rust").then((m) => m.rust()),
  }),
  LanguageDescription.of({
    name: "Shell",
    alias: ["sh", "bash", "shell", "zsh", "console"],
    load: () => import("@codemirror/legacy-modes/mode/shell").then((m) => stream(m.shell)),
  }),
  LanguageDescription.of({
    name: "YAML",
    alias: ["yaml", "yml"],
    load: () => import("@codemirror/legacy-modes/mode/yaml").then((m) => stream(m.yaml)),
  }),
  LanguageDescription.of({
    name: "TOML",
    alias: ["toml"],
    load: () => import("@codemirror/legacy-modes/mode/toml").then((m) => stream(m.toml)),
  }),
  LanguageDescription.of({
    name: "Go",
    alias: ["go", "golang"],
    load: () => import("@codemirror/legacy-modes/mode/go").then((m) => stream(m.go)),
  }),
  LanguageDescription.of({
    name: "C",
    alias: ["c", "h"],
    load: () => import("@codemirror/legacy-modes/mode/clike").then((m) => stream(m.c)),
  }),
  LanguageDescription.of({
    name: "C++",
    alias: ["cpp", "c++", "cc", "hpp"],
    load: () => import("@codemirror/legacy-modes/mode/clike").then((m) => stream(m.cpp)),
  }),
  LanguageDescription.of({
    name: "Java",
    alias: ["java"],
    load: () => import("@codemirror/legacy-modes/mode/clike").then((m) => stream(m.java)),
  }),
  LanguageDescription.of({
    name: "C#",
    alias: ["cs", "csharp"],
    load: () => import("@codemirror/legacy-modes/mode/clike").then((m) => stream(m.csharp)),
  }),
  LanguageDescription.of({
    name: "SQL",
    alias: ["sql"],
    load: () => import("@codemirror/legacy-modes/mode/sql").then((m) => stream(m.standardSQL)),
  }),
  LanguageDescription.of({
    name: "Diff",
    alias: ["diff", "patch"],
    load: () => import("@codemirror/legacy-modes/mode/diff").then((m) => stream(m.diff)),
  }),
];

/** The language of a code fence's info string ("ts", "TypeScript title=a.ts"), or null to leave it plain. */
export function codeLanguage(info: string): LanguageDescription | null {
  const word = info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return word === "" ? null : LanguageDescription.matchLanguageName(descriptions, word, true);
}
