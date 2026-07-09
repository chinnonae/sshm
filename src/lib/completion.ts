import { ConfigStore, ConfigStoreError } from "./config.ts";

/**
 * Completion contexts — used by the --completions flag.
 * Each context returns a newline-separated list of completion values.
 */
type CompletionContext = "connect" | "host" | "group";

/**
 * Print dynamic completions for the given context.
 * Called at tab-press time by shell completion scripts.
 * Exits after printing — callers should not continue.
 */
export function printCompletions(ctx: string): void {
  const store = new ConfigStore();

  try {
    if (ctx === "connect" || ctx === "host") {
      const hosts = store.getHosts();
      process.stdout.write(Object.keys(hosts).join("\n"));
      if (Object.keys(hosts).length > 0) process.stdout.write("\n");
    } else if (ctx === "group") {
      const groups = store.getGroups();
      process.stdout.write(Object.keys(groups).join("\n"));
      if (Object.keys(groups).length > 0) process.stdout.write("\n");
    }
    // Unknown context: print nothing
  } catch (e) {
    if (e instanceof ConfigStoreError) {
      // Not initialised — print nothing, don't error (shell handles gracefully)
      process.exit(0);
    }
    throw e;
  }

  process.exit(0);
}
