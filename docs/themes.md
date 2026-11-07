# mdview themes

A theme is a plain CSS file. It overrides the variables (tokens) at the top of
`src/client/styles/app.css`; nothing else needs to change. Such a file is easy to write by hand
or to hand over to an agent.

## Where themes live

- Your own themes: `~/.config/mdview/themes/<name>.css` (or `$XDG_CONFIG_HOME/mdview/themes`). The file name without `.css`
  is the theme name in the list. The folder may not exist yet: create it when you need it.
- Built-in themes: `sepia`, `dusk`, `contrast` (their sources are in `src/client/themes-builtin.ts`). Your own file with the same name
  replaces the built-in theme.
- Limits: a file up to 256 KiB, up to 50 files, names must not start with a dot.

## How to switch

**Ctrl+Shift+T** opens the list. ↑/↓ preview a theme immediately, Enter keeps it, Esc restores the previous one,
and a click on an item selects it. "System" is the app's own colors, light or dark depending on the system setting.
Your choice is remembered between launches.

Files are re-read when the list is opened and when the window regains focus: save a theme in your editor,
switch back to mdview, and the changes are already visible. A theme that was selected earlier and then deleted is simply not applied.

## What you can change

All colors are set by variables on `:root`. A theme should define the **full set**, so that the system light/dark
setting does not leak into it.

| Variable | What it colors |
| --- | --- |
| `--bg` | page background |
| `--fg` | main text |
| `--fg-muted` | secondary text: captions, quotes, hints |
| `--accent` | links, the active tab, the current search match, the selected list item |
| `--accent-soft` | soft highlight under the accent (hover, the heading strip handle) |
| `--on-accent` | text on a `--accent` background |
| `--rule`, `--rule-strong` | thin lines (under headings, tables) and prominent borders (panels) |
| `--surface`, `--surface-ink` | background and text of code blocks, panels, the tab strip |
| `--mark` | highlight of search matches |
| `--selection` | selection with the mouse |
| `--tok-comment`, `--tok-keyword`, `--tok-string`, `--tok-number`, `--tok-title`, `--tok-type`, `--tok-attr`, `--tok-variable`, `--tok-meta` | code highlighting colors |

Besides colors you can set `--font-text`, `--font-mono` (only fonts installed on the system: external URLs
for fonts and `@import` are forbidden by the window's security policy), `--text-leading` (line spacing), `--measure`
(column width, `44rem` by default) and `--gutter`. **Do not set** `--text-size`: it is the reader's choice (Ctrl+plus/minus).

To make scrollbars and input fields match the theme, add `color-scheme: light` or `dark`.

Any other CSS is allowed too (`.document h1 { … }`), but the variables are usually enough. While a theme is active, the root element
has the attribute `data-theme="<name>"`, so you can write a rule for that theme only.

## Example

```css
/* ~/.config/mdview/themes/forest.css */
:root {
  color-scheme: dark;
  --bg: #1b2420;
  --fg: #dfe8e1;
  --fg-muted: #8fa396;
  --accent: #7fd1a0;
  --accent-soft: rgba(127, 209, 160, 0.16);
  --on-accent: #10201a;
  --rule: #2b3830;
  --rule-strong: #3f5247;
  --surface: #232e28;
  --surface-ink: #dfe8e1;
  --mark: #5b5a1f;
  --selection: rgba(127, 209, 160, 0.28);
  --tok-comment: #7a9084;
  --tok-keyword: #c3a0e0;
  --tok-string: #a6d189;
  --tok-number: #e0a46a;
  --tok-title: #7fd1a0;
  --tok-type: #e5c97c;
  --tok-attr: #e0a46a;
  --tok-variable: #e27d7d;
  --tok-meta: #9bb0a3;
}
```

## A theme that follows the system

A regular file always applies. To make a theme switch between light and dark by itself, add to it a block
`@media (prefers-color-scheme: dark) { :root { … } }` with the dark values, and keep the light ones in `:root`.

## Prompt for an agent

> Write a theme for mdview: a CSS file `~/.config/mdview/themes/<name>.css` that sets all the variables from `docs/themes.md`
> (`--bg`, `--fg`, … `--tok-meta`) and `color-scheme`. Check the contrast of `--fg` on `--bg` (at least 4.5:1), `--on-accent`
> on `--accent` and `--fg-muted` on `--bg` (at least 3:1). Save the file and open mdview: the theme will appear in the Ctrl+Shift+T list.

## Not done yet

Switching the theme by time of day, a theme per document, previewing several themes side by side.
