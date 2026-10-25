/** Command line parsing for `mdview <file> [--port N] [--open]`. Pure, testable. */
export interface CliArgs {
  file: string;
  port: number;
  open: boolean;
}

export const DEFAULT_PORT = 3737;

export class ArgsError extends Error {}

export const USAGE = `Usage: mdview <file.md> [--port N] [--open]

  <file.md>   Markdown file to view (required)
  --port N    TCP port on 127.0.0.1 (default ${DEFAULT_PORT}; 0 = any free port)
  --open      open the page in the default browser`;

export function parseArgs(argv: readonly string[]): CliArgs {
  let file: string | undefined;
  let port = DEFAULT_PORT;
  let open = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--help" || arg === "-h") throw new ArgsError(USAGE);
    if (arg === "--open") {
      open = true;
    } else if (arg === "--port") {
      const value = argv[++i];
      port = parsePort(value);
    } else if (arg.startsWith("--port=")) {
      port = parsePort(arg.slice("--port=".length));
    } else if (arg.startsWith("-")) {
      throw new ArgsError(`Unknown option: ${arg}\n\n${USAGE}`);
    } else if (file === undefined) {
      file = arg;
    } else {
      throw new ArgsError(`Only one file can be opened, got also: ${arg}\n\n${USAGE}`);
    }
  }

  if (file === undefined) throw new ArgsError(`No file given.\n\n${USAGE}`);
  return { file, port, open };
}

function parsePort(value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new ArgsError(`--port expects a number, got: ${value ?? "(nothing)"}`);
  }
  const port = Number(value);
  if (port > 65535) throw new ArgsError(`--port must be 0..65535, got: ${value}`);
  return port;
}
