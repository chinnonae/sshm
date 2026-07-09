#!/usr/bin/env bun
import { program } from "commander";
import { registerInitCommand } from "./commands/init.ts";
import { registerSyncCommand } from "./commands/sync.ts";
import { registerHostCommand } from "./commands/host.ts";
import { registerGroupCommand } from "./commands/group.ts";
import { registerConnectCommand } from "./commands/connect.ts";
import { registerCompletionCommand } from "./commands/completion.ts";
import { printCompletions } from "./lib/completion.ts";

// Handle --completions <ctx> before commander parses — this is called
// at tab-press time by shell completion scripts and must be fast + silent.
const completionsIdx = process.argv.indexOf("--completions");
if (completionsIdx !== -1) {
  const ctx = process.argv[completionsIdx + 1] ?? "";
  printCompletions(ctx); // exits internally
}

program
  .name("sshm")
  .description("SSH config manager with groups and interactive mode")
  .version("0.1.0");

registerInitCommand(program);
registerSyncCommand(program);
registerHostCommand(program);
registerGroupCommand(program);
registerConnectCommand(program);
registerCompletionCommand(program);

// Launch interactive mode when invoked with no arguments
if (process.argv.length === 2) {
  const { launchInteractive } = await import("./interactive/menu.ts");
  await launchInteractive();
} else {
  program.parse();
}
