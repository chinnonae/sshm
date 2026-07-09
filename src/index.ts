#!/usr/bin/env bun
import { program } from "commander";
import { registerInitCommand } from "./commands/init.ts";
import { registerSyncCommand } from "./commands/sync.ts";
import { registerHostCommand } from "./commands/host.ts";
import { registerGroupCommand } from "./commands/group.ts";
import { registerConnectCommand } from "./commands/connect.ts";

program
  .name("sshm")
  .description("SSH config manager with groups and interactive mode")
  .version("0.1.0");

registerInitCommand(program);
registerSyncCommand(program);
registerHostCommand(program);
registerGroupCommand(program);
registerConnectCommand(program);

// Launch interactive mode when invoked with no arguments
if (process.argv.length === 2) {
  const { launchInteractive } = await import("./interactive/menu.ts");
  await launchInteractive();
} else {
  program.parse();
}
