import type { Command } from "commander";
import * as clack from "@clack/prompts";
import chalk from "chalk";
import { ConfigStore, ConfigStoreError } from "../lib/config.ts";
import type { Group, SshOptions } from "../types.ts";

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

async function resolveOrPrompt(value: string | undefined, message: string, placeholder?: string): Promise<string> {
  if (value !== undefined) return value;
  const result = await clack.text({ message, placeholder });
  if (clack.isCancel(result)) { clack.outro("Cancelled."); process.exit(0); }
  return result as string;
}

function buildOptions(flags: Record<string, string | undefined>): SshOptions {
  const opts: SshOptions = {};
  for (const [key, val] of Object.entries(flags)) {
    if (val !== undefined) opts[key] = val;
  }
  return opts;
}

// ---------------------------------------------------------------------------
// group add
// ---------------------------------------------------------------------------

async function addGroup(name: string | undefined, flags: Record<string, string | undefined>): Promise<void> {
  clack.intro(chalk.cyan("sshm group add"));

  const resolvedName = await resolveOrPrompt(name, "Group name (e.g. production)", "production");
  const description = flags["description"] ?? (name === undefined
    ? (await clack.text({ message: "Description (optional)", placeholder: "(leave blank to skip)" }).then((r) => {
        if (clack.isCancel(r)) { clack.outro("Cancelled."); process.exit(0); }
        return (r as string).trim() || undefined;
      }))
    : undefined);

  const isInteractive = name === undefined;
  async function optPrompt(flag: string | undefined, message: string): Promise<string | undefined> {
    if (flag !== undefined) return flag;
    if (!isInteractive) return undefined;
    const result = await clack.text({ message, placeholder: "(leave blank to skip)" });
    if (clack.isCancel(result)) { clack.outro("Cancelled."); process.exit(0); }
    return (result as string).trim() || undefined;
  }

  const user = await optPrompt(flags["user"], "User (default for all hosts in group)");
  const port = await optPrompt(flags["port"], "Port");
  const identityFile = await optPrompt(flags["identityFile"], "IdentityFile");
  const proxyJump = await optPrompt(flags["proxyJump"], "ProxyJump");
  const forwardAgent = await optPrompt(flags["forwardAgent"], "ForwardAgent (yes/no)");

  const options = buildOptions({ User: user, Port: port, IdentityFile: identityFile, ProxyJump: proxyJump, ForwardAgent: forwardAgent });
  const group: Group = { options, ...(description ? { description } : {}) };

  const store = new ConfigStore();
  try {
    store.addGroup(resolvedName, group);
  } catch (err) {
    handleStoreError(err);
  }

  clack.outro(`${chalk.green("✓")} Group ${chalk.bold(resolvedName)} created`);
}

// ---------------------------------------------------------------------------
// group edit
// ---------------------------------------------------------------------------

async function editGroup(name: string | undefined, flags: Record<string, string | undefined>): Promise<void> {
  clack.intro(chalk.cyan("sshm group edit"));

  const store = new ConfigStore();
  let groups: Record<string, Group>;
  try {
    groups = store.getGroups();
  } catch (err) {
    handleStoreError(err);
  }

  let resolvedName: string;
  if (name) {
    resolvedName = name;
  } else {
    const names = Object.keys(groups!);
    if (names.length === 0) exitWithError("No groups configured yet.");
    const pick = await clack.select({
      message: "Select group to edit",
      options: names.map((n) => ({ value: n, label: `${n}${groups![n]!.description ? chalk.dim(` — ${groups![n]!.description}`) : ""}` })),
    });
    if (clack.isCancel(pick)) { clack.outro("Cancelled."); process.exit(0); }
    resolvedName = pick as string;
  }

  const existing = groups![resolvedName];
  if (!existing) exitWithError(`Group "${resolvedName}" not found.`);

  async function editPrompt(flagVal: string | undefined, existingVal: string | undefined, message: string): Promise<string | undefined> {
    if (flagVal !== undefined) return flagVal;
    const result = await clack.text({ message, initialValue: existingVal ?? "", placeholder: "(leave blank to clear)" });
    if (clack.isCancel(result)) { clack.outro("Cancelled."); process.exit(0); }
    return (result as string).trim() || undefined;
  }

  const description = await editPrompt(flags["description"], existing.description, "Description");
  const user = await editPrompt(flags["user"], existing.options["User"], "User");
  const port = await editPrompt(flags["port"], existing.options["Port"], "Port");
  const identityFile = await editPrompt(flags["identityFile"], existing.options["IdentityFile"], "IdentityFile");
  const proxyJump = await editPrompt(flags["proxyJump"], existing.options["ProxyJump"], "ProxyJump");
  const forwardAgent = await editPrompt(flags["forwardAgent"], existing.options["ForwardAgent"], "ForwardAgent");

  const options: SshOptions = { ...existing.options };
  const updates: Record<string, string | undefined> = { User: user, Port: port, IdentityFile: identityFile, ProxyJump: proxyJump, ForwardAgent: forwardAgent };
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined) delete options[k];
    else options[k] = v;
  }

  try {
    store.updateGroup(resolvedName, { description, options });
  } catch (err) {
    handleStoreError(err);
  }

  clack.outro(`${chalk.green("✓")} Group ${chalk.bold(resolvedName)} updated`);
}

// ---------------------------------------------------------------------------
// group remove
// ---------------------------------------------------------------------------

async function removeGroup(name: string | undefined): Promise<void> {
  clack.intro(chalk.cyan("sshm group remove"));

  const store = new ConfigStore();
  let groups: Record<string, Group>;
  try {
    groups = store.getGroups();
  } catch (err) {
    handleStoreError(err);
  }

  let resolvedName: string;
  if (name) {
    resolvedName = name;
  } else {
    const names = Object.keys(groups!);
    if (names.length === 0) exitWithError("No groups configured yet.");
    const pick = await clack.select({
      message: "Select group to remove",
      options: names.map((n) => ({ value: n, label: n })),
    });
    if (clack.isCancel(pick)) { clack.outro("Cancelled."); process.exit(0); }
    resolvedName = pick as string;
  }

  // Warn if group has members
  const hosts = store.getHosts();
  const members = Object.entries(hosts).filter(([, h]) => h.group === resolvedName);
  if (members.length > 0) {
    clack.log.warn(
      `${members.length} host(s) are in this group and will become ungrouped: ${members.map(([a]) => a).join(", ")}`,
    );
  }

  const confirm = await clack.confirm({ message: `Remove group ${chalk.bold(resolvedName)}?` });
  if (clack.isCancel(confirm) || !confirm) { clack.outro("Cancelled."); return; }

  try {
    store.removeGroup(resolvedName);
  } catch (err) {
    handleStoreError(err);
  }

  clack.outro(`${chalk.green("✓")} Group ${chalk.bold(resolvedName)} removed`);
}

// ---------------------------------------------------------------------------
// group list
// ---------------------------------------------------------------------------

function listGroups(opts: { json?: boolean }): void {
  const store = new ConfigStore();
  let groups: Record<string, Group>;
  let hosts: ReturnType<typeof store.getHosts>;
  try {
    groups = store.getGroups();
    hosts = store.getHosts();
  } catch (err) {
    handleStoreError(err);
  }

  if (opts.json) {
    console.log(JSON.stringify(groups!, null, 2));
    return;
  }

  const names = Object.keys(groups!);
  if (names.length === 0) {
    console.log(chalk.dim("No groups configured. Run `sshm group add` to add one."));
    return;
  }

  console.log("");
  for (const name of names) {
    const group = groups![name]!;
    const memberCount = Object.values(hosts!).filter((h) => h.group === name).length;
    const desc = group.description ? chalk.dim(` — ${group.description}`) : "";
    console.log(`  ${chalk.bold(name.padEnd(20))}${desc}  ${chalk.dim(`${memberCount} host(s)`)}`);

    const optEntries = Object.entries(group.options);
    if (optEntries.length > 0) {
      for (const [k, v] of optEntries) {
        console.log(`    ${chalk.dim(`${k}: ${v}`)}`);
      }
    }
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerGroupCommand(program: Command): void {
  const group = program
    .command("group")
    .description("Manage host groups");

  group
    .command("add [name]")
    .description("Create a group")
    .option("--description <text>", "Group description")
    .option("--user <user>", "Default User")
    .option("--port <port>", "Default Port")
    .option("--identity-file <path>", "Default IdentityFile")
    .option("--proxy-jump <host>", "Default ProxyJump")
    .option("--forward-agent <yes|no>", "Default ForwardAgent")
    .action(async (name, opts) => {
      await addGroup(name, {
        description: opts.description,
        user: opts.user,
        port: opts.port,
        identityFile: opts.identityFile,
        proxyJump: opts.proxyJump,
        forwardAgent: opts.forwardAgent,
      });
    });

  group
    .command("edit [name]")
    .description("Edit a group")
    .option("--description <text>", "Group description")
    .option("--user <user>", "Default User")
    .option("--port <port>", "Default Port")
    .option("--identity-file <path>", "Default IdentityFile")
    .option("--proxy-jump <host>", "Default ProxyJump")
    .option("--forward-agent <yes|no>", "Default ForwardAgent")
    .action(async (name, opts) => {
      await editGroup(name, {
        description: opts.description,
        user: opts.user,
        port: opts.port,
        identityFile: opts.identityFile,
        proxyJump: opts.proxyJump,
        forwardAgent: opts.forwardAgent,
      });
    });

  group
    .command("remove [name]")
    .description("Remove a group")
    .action(async (name) => { await removeGroup(name); });

  group
    .command("list")
    .description("List all groups")
    .option("--json", "Output as JSON")
    .action((opts) => { listGroups({ json: opts.json }); });
}
