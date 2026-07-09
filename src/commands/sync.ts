import type { Command } from "commander";
import * as clack from "@clack/prompts";
import chalk from "chalk";
import { ConfigStore, ConfigStoreError } from "../lib/config.ts";

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("Force regenerate ~/.ssh/sshm/config from sshm.json")
    .action(() => {
      clack.intro(chalk.cyan("sshm sync"));

      try {
        const store = new ConfigStore();
        store.sync();
        clack.outro(`${chalk.green("✓")} ~/.ssh/sshm/config regenerated`);
      } catch (err) {
        if (err instanceof ConfigStoreError) {
          clack.log.error(err.message);
          process.exit(1);
        }
        throw err;
      }
    });
}
