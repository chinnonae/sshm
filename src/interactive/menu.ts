import * as clack from "@clack/prompts";
import chalk from "chalk";

export async function launchInteractive(): Promise<void> {
  clack.intro(chalk.cyan("sshm — SSH Config Manager"));

  const action = await clack.select({
    message: "What do you want to do?",
    options: [
      { value: "connect", label: "Connect to a host" },
      { value: "hosts", label: "Manage hosts" },
      { value: "groups", label: "Manage groups" },
      { value: "sync", label: "Sync config" },
      { value: "exit", label: "Exit" },
    ],
  });

  if (clack.isCancel(action) || action === "exit") {
    clack.outro("Bye.");
    return;
  }

  // TODO: route to sub-menus as commands are implemented
  clack.log.info(`"${action}" interactive flow coming soon. Use CLI commands for now.`);
  clack.outro("");
}
