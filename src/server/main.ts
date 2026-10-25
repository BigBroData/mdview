import { resolve } from "node:path";
import { ArgsError, parseArgs } from "./args.ts";
import { startServer } from "./server.ts";

/** CLI entry point: `bun run src/server/main.ts <file.md> [--port N] [--open]`. */
async function main(argv: string[]): Promise<number> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (error instanceof ArgsError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }

  const file = resolve(args.file);
  if (!(await Bun.file(file).exists())) {
    console.error(`mdview: file not found: ${file}`);
    return 1;
  }

  let server: Awaited<ReturnType<typeof startServer>>;
  try {
    server = await startServer({ file, port: args.port });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/EADDRINUSE|address already in use|Failed to start server/i.test(message)) {
      console.error(`mdview: port ${args.port} is busy. Use --port <other> or --port 0.`);
      return 1;
    }
    throw error;
  }

  console.log(`mdview: ${file}`);
  console.log(`mdview: ${server.url}  (Ctrl+C to stop)`);

  if (args.open) openInBrowser(server.url);

  const shutdown = () => {
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return -1; // keep running
}

function openInBrowser(url: string): void {
  let command: string[];
  if (process.platform === "win32") command = ["cmd", "/c", "start", "", url];
  else if (process.platform === "darwin") command = ["open", url];
  else command = ["xdg-open", url];
  try {
    Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
  } catch {
    console.error("mdview: could not open the browser; open the URL above manually.");
  }
}

const code = await main(process.argv.slice(2));
if (code >= 0) process.exit(code);
