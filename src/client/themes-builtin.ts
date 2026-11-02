import type { ThemeFile } from "./themes.ts";

/**
 * Themes that ship with the app. They are written exactly like a user's theme
 * file (see docs/themes.md) and each sets every colour token, so the system's
 * light/dark setting does not leak into them.
 */
export const BUILTIN_THEMES: readonly ThemeFile[] = [
  {
    name: "sepia",
    css: `/* Warm paper, easy on the eyes in the evening. */
:root {
  color-scheme: light;
  --bg: #f4ecd8;
  --fg: #433422;
  --fg-muted: #85735a;
  --accent: #9c4a1a;
  --accent-soft: rgba(156, 74, 26, 0.13);
  --on-accent: #fff;
  --rule: #e3d7bc;
  --rule-strong: #cfbf9e;
  --surface: #ebe1c8;
  --surface-ink: #433422;
  --mark: #f1d77f;
  --selection: rgba(156, 74, 26, 0.2);
  --tok-comment: #8e7f66;
  --tok-keyword: #8a3a7a;
  --tok-string: #4d7a2a;
  --tok-number: #a8561a;
  --tok-title: #9c4a1a;
  --tok-type: #8a6a10;
  --tok-attr: #a8561a;
  --tok-variable: #b03a2e;
  --tok-meta: #6a5a44;
}
`,
  },
  {
    name: "dusk",
    css: `/* Cool blue-grey night theme. */
:root {
  color-scheme: dark;
  --bg: #2b303b;
  --fg: #e3e7ee;
  --fg-muted: #9aa5b8;
  --accent: #88c0d0;
  --accent-soft: rgba(136, 192, 208, 0.16);
  --on-accent: #1d2229;
  --rule: #394150;
  --rule-strong: #4c566a;
  --surface: #353c4a;
  --surface-ink: #e3e7ee;
  --mark: #66551d;
  --selection: rgba(136, 192, 208, 0.28);
  --tok-comment: #7c8799;
  --tok-keyword: #b48ead;
  --tok-string: #a3be8c;
  --tok-number: #d08770;
  --tok-title: #88c0d0;
  --tok-type: #ebcb8b;
  --tok-attr: #d08770;
  --tok-variable: #bf616a;
  --tok-meta: #a0aab8;
}
`,
  },
  {
    name: "contrast",
    css: `/* Black on white, strong rules: for bright rooms and tired eyes. */
:root {
  color-scheme: light;
  --bg: #ffffff;
  --fg: #000000;
  --fg-muted: #44474b;
  --accent: #0b4fb3;
  --accent-soft: rgba(11, 79, 179, 0.14);
  --on-accent: #fff;
  --rule: #b8bcc0;
  --rule-strong: #6b7075;
  --surface: #eef0f2;
  --surface-ink: #000000;
  --mark: #ffe066;
  --selection: rgba(11, 79, 179, 0.25);
  --tok-comment: #5a5f65;
  --tok-keyword: #7a1f9a;
  --tok-string: #1c6b2a;
  --tok-number: #9a4a00;
  --tok-title: #0b4fb3;
  --tok-type: #7a5f00;
  --tok-attr: #9a4a00;
  --tok-variable: #b3201a;
  --tok-meta: #3a3f45;
}
`,
  },
];
