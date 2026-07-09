import type { Command } from "commander";
import * as clack from "@clack/prompts";
import chalk from "chalk";
import { ConfigStore, ConfigStoreError } from "../lib/config.ts";
import type { Host, SshmConfig } from "../types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ParsedTarget {
  user?: string;
  hostname: string;
}

/** Parse `user@hostname`, `user@ip`, or bare `alias/hostname` */
function parseTarget(input: string): ParsedTarget {
  const atIdx = input.indexOf("@");
  if (atIdx !== -1) {
    return { user: input.slice(0, atIdx), hostname: input.slice(atIdx + 1) };
  }
  return { hostname: input };
}

/**
 * Find a matching host alias in the config.
 * Matches on: exact alias, HostName, or IP in the HostName field.
 */
function findMatchingAlias(
  config: SshmConfig,
  target: ParsedTarget,
): string | undefined {
  const { hostname } = target;

  // 1. Exact alias match
  if (config.hosts[hostname]) return hostname;

  // 2. HostName match
  for (const [alias, host] of Object.entries(config.hosts)) {
    if (host.HostName === hostname) return alias;
  }

  return undefined;
}

/** Exec-replace the current process with ssh, inheriting stdio/TTY. */
function execSsh(args: string[]): never {
  const proc = Bun.spawnSync(["ssh", ...args], {
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exit(proc.exitCode ?? 0);
}

// ---------------------------------------------------------------------------
// Interactive "save this host?" flow
// ---------------------------------------------------------------------------

async function promptSaveAndConnect(
  target: ParsedTarget,
  store: ConfigStore,
  config: SshmConfig,
): Promise<void> {
  clack.log.warn(
    `No saved host matches ${chalk.bold(target.user ? `${target.user}@${target.hostname}` : target.hostname)}`,
  );

  const save = await clack.confirm({
    message: "Save this host before connecting?",
    initialValue: true,
  });
  if (clack.isCancel(save)) { clack.outro("Cancelled."); process.exit(0); }

  if (!save) {
    // Connect directly without saving
    clack.outro(`Connecting to ${chalk.bold(target.hostname)}…`);
    const args = target.user
      ? [`${target.user}@${target.hostname}`]
      : [target.hostname];
    execSsh(args);
  }

  // --- Collect host details ---
  const alias = await clack.text({
    message: "Alias for this host",
    placeholder: target.hostname.replace(/\./g, "-"),
    validate: (v) => {
      if (!v?.trim()) return "Alias cannot be empty";
      if (config.hosts[v.trim()]) return `Alias "${v.trim()}" already exists`;
    },
  });
  if (clack.isCancel(alias)) { clack.outro("Cancelled."); process.exit(0); }

  // Group picker
  const groupNames = Object.keys(config.groups);
  let group: string | undefined;
  if (groupNames.length > 0) {
    const pick = await clack.select({
      message: "Add to group (optional)",
      options: [
        { value: "", label: "(none)" },
        ...groupNames.map((g) => ({ value: g, label: g })),
      ],
    });
    if (clack.isCancel(pick)) { clack.outro("Cancelled."); process.exit(0); }
    group = (pick as string) || undefined;
  }

  const resolvedAlias = (alias as string).trim();
  const user = target.user;

  const host: Host = {
    HostName: target.hostname,
    options: user ? { User: user } : {},
    ...(group ? { group } : {}),
  };

  store.addHost(resolvedAlias, host);
  clack.log.success(`Host ${chalk.bold(resolvedAlias)} saved`);

  clack.outro(`Connecting to ${chalk.bold(resolvedAlias)}…`);
  execSsh([resolvedAlias]);
}

// ---------------------------------------------------------------------------
// Main connect logic
// ---------------------------------------------------------------------------

async function connect(input: string | undefined): Promise<void> {
  const store = new ConfigStore();
  let config: SshmConfig;

  try {
    config = store.read();
  } catch (err) {
    if (err instanceof ConfigStoreError) {
      clack.log.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  // No argument: fuzzy host picker
  if (input === undefined) {
    clack.intro(chalk.cyan("sshm connect"));

    const aliases = Object.keys(config.hosts);
    if (aliases.length === 0) {
      clack.log.warn("No hosts saved yet. Run `sshm host add` first.");
      clack.outro("");
      return;
    }

    const pick = await clack.select({
      message: "Connect to",
      options: aliases.map((alias) => {
        const host = config.hosts[alias]!;
        const groupLabel = host.group ? chalk.dim(` [${host.group}]`) : "";
        return {
          value: alias,
          label: `${alias}${groupLabel}  ${chalk.dim(host.HostName)}`,
        };
      }),
    });

    if (clack.isCancel(pick)) { clack.outro("Cancelled."); return; }

    clack.outro(`Connecting to ${chalk.bold(pick as string)}…`);
    execSsh([pick as string]);
  }

  // Argument provided: alias, hostname, or user@hostname
  const target = parseTarget(input!);
  const matchedAlias = findMatchingAlias(config, target);

  if (matchedAlias) {
    // If user was specified in the raw input and differs from saved config,
    // override by passing user@alias to ssh (ssh resolves via config for the rest)
    const savedUser = config.hosts[matchedAlias]?.options["User"];
    const useRawUser = target.user && target.user !== savedUser;
    const sshTarget = useRawUser ? `${target.user}@${matchedAlias}` : matchedAlias;
    execSsh([sshTarget]);
  }

  // No match found — interactive save prompt
  clack.intro(chalk.cyan("sshm connect"));
  await promptSaveAndConnect(target, store, config);
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerConnectCommand(program: Command): void {
  program
    .command("connect [target]")
    .alias("c")
    .description(
      "Connect to a host. Accepts alias, hostname, IP, or user@hostname. " +
      "Prompts to save if the target is not in your config.",
    )
    .action(async (target) => {
      await connect(target);
    });
}
