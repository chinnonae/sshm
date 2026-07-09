import type { Command } from "commander";
import * as clack from "@clack/prompts";
import chalk from "chalk";
import { ConfigStore, ConfigStoreError } from "../lib/config.ts";
import type { Host, SshOptions } from "../types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function exitWithError(msg: string): never {
  clack.log.error(msg);
  process.exit(1);
}

function handleStoreError(err: unknown): never {
  if (err instanceof ConfigStoreError) exitWithError(err.message);
  throw err;
}

/** Prompt for a value only if the flag was not supplied. */
async function resolveOrPrompt(
  value: string | undefined,
  message: string,
  placeholder?: string,
): Promise<string> {
  if (value !== undefined) return value;
  const result = await clack.text({ message, placeholder });
  if (clack.isCancel(result)) {
    clack.outro("Cancelled.");
    process.exit(0);
  }
  return result as string;
}

/** Build an SshOptions object from CLI flags (skip undefined values). */
function buildOptions(flags: Record<string, string | undefined>): SshOptions {
  const opts: SshOptions = {};
  for (const [key, val] of Object.entries(flags)) {
    if (val !== undefined) opts[key] = val;
  }
  return opts;
}

// ---------------------------------------------------------------------------
// host add
// ---------------------------------------------------------------------------

async function addHost(alias: string | undefined, flags: Record<string, string | undefined>): Promise<void> {
  clack.intro(chalk.cyan("sshm host add"));

  const store = new ConfigStore();

  const resolvedAlias = await resolveOrPrompt(alias, "Alias (e.g. web1)", "web1");
  const hostname = await resolveOrPrompt(flags["hostname"], "HostName / IP", "10.0.0.1");

  // Group: select from existing groups or leave empty
  let group: string | undefined = flags["group"];
  if (group === undefined) {
    let groups: string[] = [];
    try {
      groups = Object.keys(store.getGroups());
    } catch {
      // Not initialised yet — will fail below
    }
    if (groups.length > 0) {
      const pick = await clack.select({
        message: "Group (optional)",
        options: [
          { value: "", label: "(none)" },
          ...groups.map((g) => ({ value: g, label: g })),
        ],
      });
      if (clack.isCancel(pick)) { clack.outro("Cancelled."); process.exit(0); }
      group = pick as string || undefined;
    }
  }

  // Optional fields — only prompt when running fully interactively (no alias arg)
  const isInteractive = alias === undefined;
  async function optPrompt(flag: string | undefined, message: string): Promise<string | undefined> {
    if (flag !== undefined) return flag;
    if (!isInteractive) return undefined;
    const result = await clack.text({ message, placeholder: "(leave blank to skip)" });
    if (clack.isCancel(result)) { clack.outro("Cancelled."); process.exit(0); }
    return (result as string).trim() || undefined;
  }

  const user = await optPrompt(flags["user"], "User");
  const port = await optPrompt(flags["port"], "Port");
  const identityFile = await optPrompt(flags["identityFile"], "IdentityFile");
  const proxyJump = await optPrompt(flags["proxyJump"], "ProxyJump");
  const forwardAgent = await optPrompt(flags["forwardAgent"], "ForwardAgent (yes/no)");

  const options = buildOptions({ User: user, Port: port, IdentityFile: identityFile, ProxyJump: proxyJump, ForwardAgent: forwardAgent });

  const host: Host = { HostName: hostname, options, ...(group ? { group } : {}) };

  try {
    store.addHost(resolvedAlias, host);
  } catch (err) {
    handleStoreError(err);
  }

  clack.outro(`${chalk.green("✓")} Host ${chalk.bold(resolvedAlias)} added`);
}

// ---------------------------------------------------------------------------
// host edit
// ---------------------------------------------------------------------------

async function editHost(alias: string | undefined, flags: Record<string, string | undefined>): Promise<void> {
  clack.intro(chalk.cyan("sshm host edit"));

  const store = new ConfigStore();
  let hosts: Record<string, Host>;
  try {
    hosts = store.getHosts();
  } catch (err) {
    handleStoreError(err);
  }

  // Resolve alias
  let resolvedAlias: string;
  if (alias) {
    resolvedAlias = alias;
  } else {
    const aliasNames = Object.keys(hosts!);
    if (aliasNames.length === 0) exitWithError("No hosts configured yet.");
    const pick = await clack.select({
      message: "Select host to edit",
      options: aliasNames.map((a) => ({ value: a, label: `${a}  ${chalk.dim(hosts![a]!.HostName)}` })),
    });
    if (clack.isCancel(pick)) { clack.outro("Cancelled."); process.exit(0); }
    resolvedAlias = pick as string;
  }

  const existing = hosts![resolvedAlias];
  if (!existing) exitWithError(`Host "${resolvedAlias}" not found.`);

  async function editPrompt(flagVal: string | undefined, existingVal: string | undefined, message: string): Promise<string | undefined> {
    if (flagVal !== undefined) return flagVal;
    const result = await clack.text({
      message,
      initialValue: existingVal ?? "",
      placeholder: "(leave blank to clear)",
    });
    if (clack.isCancel(result)) { clack.outro("Cancelled."); process.exit(0); }
    return (result as string).trim() || undefined;
  }

  const hostname = await editPrompt(flags["hostname"], existing.HostName, "HostName") ?? existing.HostName;

  // Group selection
  let group: string | undefined = flags["group"] ?? existing.group;
  const groupNames = Object.keys(store.getGroups());
  if (groupNames.length > 0 && flags["group"] === undefined) {
    const pick = await clack.select({
      message: "Group",
      options: [
        { value: "", label: "(none)" },
        ...groupNames.map((g) => ({ value: g, label: g })),
      ],
      initialValue: existing.group ?? "",
    });
    if (clack.isCancel(pick)) { clack.outro("Cancelled."); process.exit(0); }
    group = (pick as string) || undefined;
  }

  const user = await editPrompt(flags["user"], existing.options["User"], "User");
  const port = await editPrompt(flags["port"], existing.options["Port"], "Port");
  const identityFile = await editPrompt(flags["identityFile"], existing.options["IdentityFile"], "IdentityFile");
  const proxyJump = await editPrompt(flags["proxyJump"], existing.options["ProxyJump"], "ProxyJump");
  const forwardAgent = await editPrompt(flags["forwardAgent"], existing.options["ForwardAgent"], "ForwardAgent");

  // Rebuild options: start from existing, apply changes, remove blanks
  const options: SshOptions = { ...existing.options };
  const updates: Record<string, string | undefined> = { User: user, Port: port, IdentityFile: identityFile, ProxyJump: proxyJump, ForwardAgent: forwardAgent };
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) delete options[k];
    else options[k] = v;
  }

  try {
    store.updateHost(resolvedAlias, { HostName: hostname, group, options });
  } catch (err) {
    handleStoreError(err);
  }

  clack.outro(`${chalk.green("✓")} Host ${chalk.bold(resolvedAlias)} updated`);
}

// ---------------------------------------------------------------------------
// host remove
// ---------------------------------------------------------------------------

async function removeHost(alias: string | undefined): Promise<void> {
  clack.intro(chalk.cyan("sshm host remove"));

  const store = new ConfigStore();
  let hosts: Record<string, Host>;
  try {
    hosts = store.getHosts();
  } catch (err) {
    handleStoreError(err);
  }

  let resolvedAlias: string;
  if (alias) {
    resolvedAlias = alias;
  } else {
    const aliasNames = Object.keys(hosts!);
    if (aliasNames.length === 0) exitWithError("No hosts configured yet.");
    const pick = await clack.select({
      message: "Select host to remove",
      options: aliasNames.map((a) => ({ value: a, label: `${a}  ${chalk.dim(hosts![a]!.HostName)}` })),
    });
    if (clack.isCancel(pick)) { clack.outro("Cancelled."); process.exit(0); }
    resolvedAlias = pick as string;
  }

  const confirm = await clack.confirm({ message: `Remove host ${chalk.bold(resolvedAlias)}?` });
  if (clack.isCancel(confirm) || !confirm) { clack.outro("Cancelled."); return; }

  try {
    store.removeHost(resolvedAlias);
  } catch (err) {
    handleStoreError(err);
  }

  clack.outro(`${chalk.green("✓")} Host ${chalk.bold(resolvedAlias)} removed`);
}

// ---------------------------------------------------------------------------
// host list
// ---------------------------------------------------------------------------

function listHosts(opts: { group?: string; json?: boolean }): void {
  const store = new ConfigStore();
  let config: ReturnType<typeof store.read>;
  try {
    config = store.read();
  } catch (err) {
    handleStoreError(err);
  }

  const { hosts, groups } = config!;

  if (opts.json) {
    const filtered = opts.group
      ? Object.fromEntries(Object.entries(hosts).filter(([, h]) => h.group === opts.group))
      : hosts;
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  // Group hosts by their group
  const byGroup: Record<string, [string, Host][]> = {};
  const ungrouped: [string, Host][] = [];

  for (const [alias, host] of Object.entries(hosts)) {
    if (opts.group && host.group !== opts.group) continue;
    if (host.group) {
      (byGroup[host.group] ??= []).push([alias, host]);
    } else {
      ungrouped.push([alias, host]);
    }
  }

  if (Object.keys(byGroup).length === 0 && ungrouped.length === 0) {
    console.log(chalk.dim("No hosts configured. Run `sshm host add` to add one."));
    return;
  }

  function printHost(alias: string, host: Host): void {
    const parts = [
      chalk.bold(alias.padEnd(20)),
      chalk.cyan((host.HostName).padEnd(20)),
      host.options["User"] ? chalk.dim(`user=${host.options["User"]}`) : "",
      host.options["Port"] ? chalk.dim(`port=${host.options["Port"]}`) : "",
    ].filter(Boolean);
    console.log(`  ${parts.join("  ")}`);
  }

  for (const [groupName, members] of Object.entries(byGroup)) {
    const desc = groups[groupName]?.description ? chalk.dim(` — ${groups[groupName]!.description}`) : "";
    console.log(`\n${chalk.yellow("GROUP:")} ${chalk.bold(groupName)}${desc}`);
    for (const [alias, host] of members) printHost(alias, host);
  }

  if (ungrouped.length > 0) {
    console.log(`\n${chalk.yellow("(ungrouped)")}`);
    for (const [alias, host] of ungrouped) printHost(alias, host);
  }

  console.log("");
}

// ---------------------------------------------------------------------------
// host move
// ---------------------------------------------------------------------------

async function moveHost(alias: string | undefined, group: string | undefined): Promise<void> {
  clack.intro(chalk.cyan("sshm host move"));

  const store = new ConfigStore();
  let hosts: Record<string, Host>;
  try {
    hosts = store.getHosts();
  } catch (err) {
    handleStoreError(err);
  }

  let resolvedAlias: string;
  if (alias) {
    resolvedAlias = alias;
  } else {
    const aliasNames = Object.keys(hosts!);
    if (aliasNames.length === 0) exitWithError("No hosts configured yet.");
    const pick = await clack.select({
      message: "Select host to move",
      options: aliasNames.map((a) => ({ value: a, label: `${a}  ${chalk.dim(hosts![a]!.HostName)}` })),
    });
    if (clack.isCancel(pick)) { clack.outro("Cancelled."); process.exit(0); }
    resolvedAlias = pick as string;
  }

  let resolvedGroup: string | undefined = group;
  if (resolvedGroup === undefined) {
    const groupNames = Object.keys(store.getGroups());
    const pick = await clack.select({
      message: "Move to group",
      options: [
        { value: "", label: "(none — remove from group)" },
        ...groupNames.map((g) => ({ value: g, label: g })),
      ],
    });
    if (clack.isCancel(pick)) { clack.outro("Cancelled."); process.exit(0); }
    resolvedGroup = (pick as string) || undefined;
  }

  try {
    store.updateHost(resolvedAlias, { group: resolvedGroup });
  } catch (err) {
    handleStoreError(err);
  }

  const dest = resolvedGroup ? chalk.bold(resolvedGroup) : chalk.dim("(ungrouped)");
  clack.outro(`${chalk.green("✓")} ${chalk.bold(resolvedAlias)} moved to ${dest}`);
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerHostCommand(program: Command): void {
  const host = program
    .command("host")
    .description("Manage SSH hosts");

  host
    .command("add [alias]")
    .description("Add a host")
    .option("--hostname <hostname>", "HostName or IP")
    .option("--group <group>", "Group name")
    .option("--user <user>", "User")
    .option("--port <port>", "Port")
    .option("--identity-file <path>", "IdentityFile")
    .option("--proxy-jump <host>", "ProxyJump")
    .option("--forward-agent <yes|no>", "ForwardAgent")
    .action(async (alias, opts) => {
      await addHost(alias, {
        hostname: opts.hostname,
        group: opts.group,
        user: opts.user,
        port: opts.port,
        identityFile: opts.identityFile,
        proxyJump: opts.proxyJump,
        forwardAgent: opts.forwardAgent,
      });
    });

  host
    .command("edit [alias]")
    .description("Edit a host")
    .option("--hostname <hostname>", "HostName or IP")
    .option("--group <group>", "Group name")
    .option("--user <user>", "User")
    .option("--port <port>", "Port")
    .option("--identity-file <path>", "IdentityFile")
    .option("--proxy-jump <host>", "ProxyJump")
    .option("--forward-agent <yes|no>", "ForwardAgent")
    .action(async (alias, opts) => {
      await editHost(alias, {
        hostname: opts.hostname,
        group: opts.group,
        user: opts.user,
        port: opts.port,
        identityFile: opts.identityFile,
        proxyJump: opts.proxyJump,
        forwardAgent: opts.forwardAgent,
      });
    });

  host
    .command("remove [alias]")
    .description("Remove a host")
    .action(async (alias) => { await removeHost(alias); });

  host
    .command("list")
    .description("List all hosts")
    .option("--group <group>", "Filter by group")
    .option("--json", "Output as JSON")
    .action((opts) => { listHosts({ group: opts.group, json: opts.json }); });

  host
    .command("move [alias] [group]")
    .description("Move a host to a different group")
    .action(async (alias, group) => { await moveHost(alias, group); });
}
