/**
 * The screen shown while no document is open: the name, the one thing to do
 * first (open a file) and every command with its keys. Which commands appear
 * depends on what the host can do (the browser stage cannot open or edit
 * files), so the list never promises a key that does nothing.
 */
export interface Capabilities {
  /** A file picker exists (Ctrl+O). */
  open: boolean;
  /** A new file can be created (Ctrl+N). */
  create: boolean;
  /** Files can be dropped onto the window. */
  drop: boolean;
  /** Documents can be opened by path, so tabs and links between files work. */
  tabs: boolean;
  /** Documents can be written back: the editor is available. */
  edit: boolean;
  /** A document can be saved under another name (Ctrl+Shift+S): the editor's text, or a copy while reading. */
  saveAs: boolean;
  /** The window can be closed from the keyboard (Ctrl+Q). */
  quit: boolean;
}

/** One command: its name and the key combinations that run it (alternatives). */
export interface Command {
  label: string;
  keys: string[][];
}

export interface CommandGroup {
  title: string;
  commands: Command[];
}

export function commandGroups(caps: Capabilities): CommandGroup[] {
  // "Open a file" is the main button of the screen, not a row of the list.
  const files: Command[] = [];
  if (caps.create) files.push({ label: "New file", keys: [["Ctrl", "N"]] });
  // Reading mode saves a copy, the editor saves the text under the new name.
  if (caps.saveAs) files.push({ label: "Save as", keys: [["Ctrl", "Shift", "S"]] });
  if (caps.tabs) {
    files.push({ label: "Next tab", keys: [["Ctrl", "Tab"]] });
    files.push({ label: "Previous tab", keys: [["Ctrl", "Shift", "Tab"]] });
    files.push({ label: "Close the tab", keys: [["Ctrl", "W"]] });
    files.push({ label: "Tab by number", keys: [["Ctrl", "1…9"]] });
  }
  if (caps.quit) files.push({ label: "Quit", keys: [["Ctrl", "Q"]] });
  const reading: Command[] = [
    {
      label: "Show this list",
      keys: [["F1"], ["?"]],
    },
    { label: "Find in the document", keys: [["Ctrl", "F"]] },
    { label: "Next and previous match", keys: [["F3"], ["Shift", "F3"]] },
    { label: "Close search or list", keys: [["Esc"]] },
    { label: "Contents panel", keys: [["Ctrl", "Shift", "O"]] },
    { label: "Switch theme", keys: [["Ctrl", "Shift", "T"]] },
    { label: "Column width", keys: [["Ctrl", "Shift", "W"]] },
    {
      label: "Text size",
      keys: [
        ["Ctrl", "+"],
        ["Ctrl", "−"],
        ["Ctrl", "0"],
      ],
    },
  ];
  if (caps.tabs)
    reading.push({
      label: "Link in a new tab",
      keys: [["Ctrl", "Click"], ["Middle click"]],
    });
  if (caps.tabs)
    reading.push({
      label: "Back and forward",
      keys: [
        ["Alt", "←"],
        ["Alt", "→"],
      ],
    });
  const groups: CommandGroup[] = [];
  if (files.length > 0) groups.push({ title: "Files", commands: files });
  groups.push({ title: "Reading", commands: reading });
  if (caps.edit) {
    groups.push({
      title: "Editing",
      commands: [
        { label: "Edit the document", keys: [["Ctrl", "E"]] },
        { label: "Save", keys: [["Ctrl", "S"]] },
        {
          label: "Undo and redo",
          keys: [
            ["Ctrl", "Z"],
            ["Ctrl", "Shift", "Z"],
          ],
        },
        { label: "Hide or show the preview", keys: [["Ctrl", "Shift", "E"]] },
      ],
    });
  }
  return groups;
}

function keysElement(keys: string[][]): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "start__keys";
  keys.forEach((combo, index) => {
    if (index > 0) {
      const or = document.createElement("span");
      or.className = "start__or";
      or.textContent = "/";
      wrap.append(or);
    }
    const group = document.createElement("span");
    group.className = "start__combo";
    for (const key of combo) {
      const cap = document.createElement("kbd");
      cap.textContent = key;
      group.append(cap);
    }
    wrap.append(group);
  });
  return wrap;
}

/** The command groups in two balanced columns; the start screen and the shortcuts window both show it. */
export function createCommandList(caps: Capabilities): HTMLElement {
  // Two columns, each group goes to the one with fewer rows so they end at about the same height.
  const list = document.createElement("div");
  list.className = "start__groups";
  const columns = [document.createElement("div"), document.createElement("div")];
  const rowCount = [0, 0];
  for (const group of commandGroups(caps)) {
    const section = document.createElement("section");
    section.className = "start__group";
    const title = document.createElement("h2");
    title.className = "start__title";
    title.textContent = group.title;
    const rows = document.createElement("dl");
    rows.className = "start__rows";
    for (const command of group.commands) {
      const term = document.createElement("dt");
      term.textContent = command.label;
      const keys = document.createElement("dd");
      keys.append(keysElement(command.keys));
      rows.append(term, keys);
    }
    section.append(title, rows);
    const side = (rowCount[0] ?? 0) <= (rowCount[1] ?? 0) ? 0 : 1;
    rowCount[side] = (rowCount[side] ?? 0) + group.commands.length + 1;
    columns[side]?.append(section);
  }
  for (const column of columns) if (column.childElementCount > 0) list.append(column);
  return list;
}

/**
 * The application's own icon (src-tauri/icons/mdview.svg, the source of every PNG), shown beside
 * the name. Static markup: no text of any document goes into it.
 */
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3f84e0"/>
      <stop offset="1" stop-color="#2255b4"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2.2"/>
      <feOffset dy="2.5" result="blur"/>
      <feComponentTransfer in="blur" result="dark">
        <feFuncA type="linear" slope="0.38"/>
      </feComponentTransfer>
      <feMerge>
        <feMergeNode in="dark"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect x="8" y="8" width="112" height="112" rx="26" fill="url(#tile)"/>
  <rect x="8" y="8" width="112" height="112" rx="26" fill="url(#gloss)"/>
  <rect x="8.5" y="8.5" width="111" height="111" rx="25.5" fill="none" stroke="#000000" stroke-opacity="0.10"/>

  <g filter="url(#shadow)">
    <path d="M40 24 h36 l18 18 v56 a6 6 0 0 1 -6 6 h-48 a6 6 0 0 1 -6 -6 v-68 a6 6 0 0 1 6 -6 z" fill="#fbfbfa"/>
    <path d="M76 24 v12 a6 6 0 0 0 6 6 h12 z" fill="#d5dae1"/>
  </g>

  <path d="M47 76 V49 L62 65 L77 49 V76" fill="none" stroke="#2a66c4" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>

  <rect x="46" y="85" width="36" height="4" rx="2" fill="#c4c9d0"/>
  <rect x="46" y="93" width="26" height="4" rx="2" fill="#c4c9d0"/>
</svg>`;

/** Builds the start screen; `onOpen` is the action of the main button (absent: no button, the host cannot open files). */
export function createStartScreen(caps: Capabilities, onOpen?: () => void): HTMLElement {
  const root = document.createElement("section");
  root.className = "start";

  const head = document.createElement("header");
  head.className = "start__head";
  const brand = document.createElement("div");
  brand.className = "start__brand";
  const icon = document.createElement("span");
  icon.className = "start__icon";
  icon.innerHTML = ICON;
  const name = document.createElement("h1");
  name.className = "start__name";
  name.textContent = "mdview";
  brand.append(icon, name);
  const tagline = document.createElement("p");
  tagline.className = "start__tagline";
  tagline.textContent = "Markdown viewer and editor";
  const author = document.createElement("p");
  author.className = "start__author";
  author.textContent = "by BigBroData (MIT)";
  head.append(brand, tagline, author);
  root.append(head);

  if (onOpen) {
    const open = document.createElement("button");
    open.type = "button";
    open.className = "start__open";
    const label = document.createElement("span");
    label.textContent = "Open a file";
    open.append(label, keysElement([["Ctrl", "O"]]));
    open.addEventListener("click", onOpen);
    root.append(open);
  }
  if (caps.drop) {
    const drop = document.createElement("p");
    drop.className = "start__drop";
    drop.textContent = "or drop a Markdown file anywhere in this window";
    root.append(drop);
  }

  root.append(createCommandList(caps));
  return root;
}
