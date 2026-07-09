import type { Command } from "commander";
import * as clack from "@clack/prompts";
import chalk from "chalk";
import { ConfigStore, SSHM_DIR, SSHM_JSON } from "../lib/config.ts";
import { ensureInclude, SSH_CONFIG } from "../lib/ssh-config-file.ts";
import { existsSync } from "node:fs";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialise sshm — creates ~/.ssh/sshm/ and wires ~/.ssh/config")
    .action(async () => {
      clack.intro(chalk.cyan("sshm init"));

      // Already initialised?
      if (existsSync(SSHM_JSON)) {
        clack.log.warn(`sshm is already initialised at ${chalk.dim(SSHM_DIR)}`);
        clack.outro("Nothing changed.");
        return;
      }

      const spin = clack.spinner();
      spin.start("Creating ~/.ssh/sshm/");

      const store = new ConfigStore();
      store.init();

      spin.stop(`Created ${chalk.dim(SSHM_DIR)}`);

      spin.start(`Updating ${chalk.dim(SSH_CONFIG)}`);
      ensureInclude();
      spin.stop(`Added ${chalk.bold("Include ~/.ssh/sshm/config")} to ${chalk.dim(SSH_CONFIG)}`);

      clack.outro(
        `${chalk.green("✓")} sshm ready. Add hosts with ${chalk.bold("sshm host add")}`,
      );
    });
}
