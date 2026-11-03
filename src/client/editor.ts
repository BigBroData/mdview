import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { EditorState, Transaction } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  runScopeHandlers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { codeLanguage } from "./code-languages.ts";

/**
 * The text editor (CodeMirror 6). One view serves every tab: each tab keeps
 * its own EditorState (text, selection, undo history), and showing a tab is
 * `setState`. Colours are CSS variables, so themes (docs/themes.md) paint the
 * editor like the page.
 */
export interface EditorHooks {
  /** The text changed (typing, undo, paste). */
  change(): void;
  /** The editor scrolled. */
  scroll(): void;
}

export interface Editor {
  /** A fresh state for a document; the text must already use "\n" line ends. */
  create(text: string): EditorState;
  /** Replaces the text of the shown document (an outside change); not an undo step, and `change` is not called. */
  replace(text: string): void;
  /** The same state with its text replaced (undo history is kept out of it). */
  withText(state: EditorState, text: string): EditorState;
  show(state: EditorState, scrollTop?: number): void;
  state(): EditorState;
  scrollTop(): number;
  /** Scrolled all the way down (and there is something to scroll). */
  atBottom(): boolean;
  /** First visible source line, counted from 0, with the part of it scrolled off. */
  topLine(): number;
  /** Scrolls so that this source line (counted from 0, fractional) is at the top; the cursor stays. */
  scrollToLine(line: number): void;
  /** Puts the cursor on a source line (counted from 0) and scrolls it to the top. */
  revealLine(line: number): void;
  focus(): void;
}

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: "700", color: "var(--fg)" },
  { tag: tags.heading2, fontWeight: "700", color: "var(--fg)" },
  {
    tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6],
    fontWeight: "600",
    color: "var(--fg)",
  },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--accent)" },
  { tag: tags.url, color: "var(--tok-meta)" },
  { tag: tags.monospace, color: "var(--tok-string)" },
  { tag: tags.quote, color: "var(--fg-muted)" },
  { tag: [tags.list, tags.contentSeparator], color: "var(--tok-keyword)" },
  { tag: [tags.processingInstruction, tags.meta, tags.labelName], color: "var(--fg-muted)" },
  { tag: tags.comment, color: "var(--tok-comment)" },
  // Code inside fences (code-languages.ts); the same palette as the preview's highlighter.
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.operatorKeyword,
      tags.definitionKeyword,
      tags.moduleKeyword,
      tags.self,
      tags.tagName,
    ],
    color: "var(--tok-keyword)",
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp, tags.attributeValue, tags.inserted],
    color: "var(--tok-string)",
  },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.changed], color: "var(--tok-number)" },
  { tag: [tags.lineComment, tags.blockComment, tags.docComment], color: "var(--tok-comment)" },
  {
    tag: [
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.definition(tags.variableName),
    ],
    color: "var(--tok-title)",
  },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "var(--tok-type)" },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--tok-attr)" },
  { tag: [tags.variableName, tags.deleted], color: "var(--tok-variable)" },
  {
    tag: [tags.operator, tags.punctuation, tags.angleBracket, tags.bracket],
    color: "var(--fg-muted)",
  },
]);

const theme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--fg)",
    backgroundColor: "var(--bg)",
    fontSize: "0.92rem",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.65",
    scrollbarWidth: "thin",
  },
  ".cm-content": { padding: "1.25rem 1rem 8rem", caretColor: "var(--fg)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--fg)", borderLeftWidth: "2px" },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
    { backgroundColor: "var(--selection)" },
  // A faint band under the caret's line: enough to find the place, quiet in every theme.
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--fg) 5%, transparent)" },
  ".cm-panels": {
    backgroundColor: "var(--surface)",
    color: "var(--surface-ink)",
    borderColor: "var(--rule)",
    fontFamily: "var(--font-text)",
  },
  ".cm-panels-top": { borderBottom: "1px solid var(--rule)" },
  // Find and replace as one tidy bar: fields and quiet buttons on a row, the options
  // under them, the close mark at the corner.
  ".cm-panel.cm-search": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.4rem 0.45rem",
    padding: "0.55rem 2.4rem 0.55rem 1rem",
    fontSize: "0.85rem",
  },
  ".cm-panel.cm-search br": { flexBasis: "100%", height: "0", margin: "0" },
  ".cm-panel.cm-search input, .cm-panel.cm-search button": {
    fontFamily: "inherit",
    fontSize: "inherit",
    color: "var(--fg)",
    backgroundColor: "var(--bg)",
    border: "1px solid var(--rule-strong)",
    borderRadius: "0.35rem",
    margin: "0",
  },
  ".cm-panel.cm-search input[type=text], .cm-panel.cm-search input:not([type])": {
    padding: "0.3rem 0.6rem",
    width: "11rem",
  },
  ".cm-panel.cm-search input:focus": { outline: "none", borderColor: "var(--accent)" },
  ".cm-panel.cm-search button": {
    padding: "0.3rem 0.7rem",
    backgroundImage: "none",
    cursor: "pointer",
  },
  ".cm-panel.cm-search button:hover": {
    backgroundColor: "var(--surface)",
    borderColor: "var(--fg-muted)",
  },
  ".cm-panel.cm-search button[name=close]": {
    position: "absolute",
    top: "0.45rem",
    right: "0.6rem",
    padding: "0 0.4rem",
    border: "none",
    backgroundColor: "transparent",
    color: "var(--fg-muted)",
    fontSize: "1.25rem",
    lineHeight: "1.6",
  },
  ".cm-panel.cm-search label": {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    padding: "0 0.4rem 0 0",
    fontSize: "0.8rem",
    color: "var(--fg-muted)",
  },
  ".cm-panel.cm-search label input": { margin: "0", accentColor: "var(--accent)" },
  ".cm-searchMatch": { backgroundColor: "var(--mark)" },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "var(--accent)",
    color: "var(--on-accent)",
  },
});

/**
 * Editor shortcuts follow the physical key, as the page's own do (keys.ts): with a
 * Russian layout Ctrl+Z arrives as "я", which CodeMirror cannot match to its
 * bindings. A Ctrl/Cmd chord whose character is not Latin is replayed under the
 * Latin letter of the same key.
 */
const physicalKeyShortcuts = EditorView.domEventHandlers({
  keydown(event, view) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return false;
    const letter = /^Key([A-Z])$/.exec(event.code)?.[1];
    if (!letter || event.key.length !== 1 || event.key.charCodeAt(0) < 128) return false;
    const latin = new KeyboardEvent("keydown", {
      key: letter.toLowerCase(),
      code: event.code,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    });
    return runScopeHandlers(view, latin, "editor");
  },
});

export function createEditor(parent: HTMLElement, hooks: EditorHooks): Editor {
  let silent = false;
  const extensions = [
    history(),
    drawSelection(),
    highlightActiveLine(),
    markdown({ base: markdownLanguage, codeLanguages: codeLanguage }),
    syntaxHighlighting(markdownHighlight),
    search({ top: true }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      "aria-label": "Markdown source",
      spellcheck: "false",
      autocapitalize: "off",
      autocorrect: "off",
    }),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
    theme,
    physicalKeyShortcuts,
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !silent) hooks.change();
    }),
  ];
  const view = new EditorView({ parent, state: EditorState.create({ doc: "", extensions }) });
  view.scrollDOM.addEventListener("scroll", () => hooks.scroll(), { passive: true });

  return {
    replace(text) {
      silent = true;
      try {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          annotations: Transaction.addToHistory.of(false),
        });
      } finally {
        silent = false;
      }
    },
    create: (text) => EditorState.create({ doc: text, extensions }),
    withText: (state, text) =>
      state.update({
        changes: { from: 0, to: state.doc.length, insert: text },
        annotations: Transaction.addToHistory.of(false),
      }).state,
    show(state, scrollTop = 0) {
      view.setState(state);
      view.scrollDOM.scrollTop = scrollTop;
      // The editor measures its content lazily; set the position again once it has.
      requestAnimationFrame(() => {
        view.scrollDOM.scrollTop = scrollTop;
      });
    },
    state: () => view.state,
    scrollTop: () => view.scrollDOM.scrollTop,
    atBottom() {
      const box = view.scrollDOM;
      return (
        box.scrollHeight > box.clientHeight &&
        box.scrollTop + box.clientHeight >= box.scrollHeight - 2
      );
    },
    topLine() {
      const top = Math.max(0, view.scrollDOM.scrollTop - view.documentPadding.top);
      const block = view.lineBlockAtHeight(top);
      const line = view.state.doc.lineAt(block.from).number - 1;
      const part =
        block.height > 0 ? Math.min(1, Math.max(0, (top - block.top) / block.height)) : 0;
      return line + part;
    },
    scrollToLine(line) {
      const doc = view.state.doc;
      if (line >= doc.lines) {
        view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
        return;
      }
      const whole = Math.max(0, Math.floor(line));
      const block = view.lineBlockAt(doc.line(whole + 1).from);
      view.scrollDOM.scrollTop =
        block.top + Math.max(0, line - whole) * block.height + view.documentPadding.top;
    },
    revealLine(line) {
      const doc = view.state.doc;
      const target = doc.line(Math.min(doc.lines, Math.max(1, Math.round(line) + 1)));
      view.dispatch({
        selection: { anchor: target.from },
        effects: EditorView.scrollIntoView(target.from, { y: "start", yMargin: 16 }),
      });
    },
    focus: () => view.focus(),
  };
}
