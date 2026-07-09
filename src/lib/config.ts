import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { generateSshConfig } from "./generator.ts";
import {
  EMPTY_CONFIG,
  SSHM_VERSION,
  type Group,
  type Host,
  type SshmConfig,
} from "../types.ts";

export const SSHM_DIR = join(homedir(), ".ssh", "sshm");
export const SSHM_JSON = join(SSHM_DIR, "sshm.json");
export const SSHM_CONFIG = join(SSHM_DIR, "config");
export const SSHM_GROUPS_DIR = join(SSHM_DIR, "groups");

export class ConfigStoreError extends Error {}
export class ConfigNotFoundError extends ConfigStoreError {}
export class ConfigParseError extends ConfigStoreError {}
export class ConfigVersionError extends ConfigStoreError {}

/**
 * Reads, writes, and manages sshm.json. After every mutating operation the
 * SSH config file (~/.ssh/sshm/config) is automatically regenerated.
 */
export class ConfigStore {
  private readonly jsonPath: string;
  private readonly sshConfigPath: string;

  private readonly groupsDir: string;

  constructor(
    jsonPath: string = SSHM_JSON,
    sshConfigPath: string = SSHM_CONFIG,
    groupsDir: string = SSHM_GROUPS_DIR,
  ) {
    this.jsonPath = jsonPath;
    this.sshConfigPath = sshConfigPath;
    this.groupsDir = groupsDir;
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  read(): SshmConfig {
    if (!existsSync(this.jsonPath)) {
      throw new ConfigNotFoundError(
        `sshm config not found at ${this.jsonPath}. Run \`sshm init\` first.`,
      );
    }

    let raw: string;
    try {
      raw = readFileSync(this.jsonPath, "utf-8");
    } catch (err) {
      throw new ConfigStoreError(`Could not read ${this.jsonPath}: ${err}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ConfigParseError(
        `${this.jsonPath} contains invalid JSON. Fix or delete it and run \`sshm init\`.`,
      );
    }

    return this.validate(parsed);
  }

  // ---------------------------------------------------------------------------
  // Init (create empty config if none exists)
  // ---------------------------------------------------------------------------

  init(): void {
    if (existsSync(this.jsonPath)) return;
    mkdirSync(dirname(this.jsonPath), { recursive: true });
    this.writeJson(EMPTY_CONFIG);
    this.writeConfig(EMPTY_CONFIG);
  }

  // ---------------------------------------------------------------------------
  // Hosts
  // ---------------------------------------------------------------------------

  addHost(alias: string, host: Host): void {
    const config = this.read();
    if (config.hosts[alias]) {
      throw new ConfigStoreError(`Host "${alias}" already exists.`);
    }
    config.hosts[alias] = host;
    this.persist(config);
  }

  updateHost(alias: string, updates: Partial<Host>): void {
    const config = this.read();
    const existing = config.hosts[alias];
    if (!existing) {
      throw new ConfigStoreError(`Host "${alias}" not found.`);
    }
    config.hosts[alias] = {
      ...existing,
      ...updates,
      options: { ...existing.options, ...(updates.options ?? {}) },
    };
    this.persist(config);
  }

  removeHost(alias: string): void {
    const config = this.read();
    if (!config.hosts[alias]) {
      throw new ConfigStoreError(`Host "${alias}" not found.`);
    }
    delete config.hosts[alias];
    this.persist(config);
  }

  getHosts(): Record<string, Host> {
    return this.read().hosts;
  }

  // ---------------------------------------------------------------------------
  // Groups
  // ---------------------------------------------------------------------------

  addGroup(name: string, group: Group): void {
    const config = this.read();
    if (config.groups[name]) {
      throw new ConfigStoreError(`Group "${name}" already exists.`);
    }
    config.groups[name] = group;
    this.persist(config);
  }

  updateGroup(name: string, updates: Partial<Group>): void {
    const config = this.read();
    const existing = config.groups[name];
    if (!existing) {
      throw new ConfigStoreError(`Group "${name}" not found.`);
    }
    config.groups[name] = {
      ...existing,
      ...updates,
      options: { ...existing.options, ...(updates.options ?? {}) },
    };
    this.persist(config);
  }

  removeGroup(name: string): void {
    const config = this.read();
    if (!config.groups[name]) {
      throw new ConfigStoreError(`Group "${name}" not found.`);
    }
    delete config.groups[name];
    // Unassign hosts that belonged to this group
    for (const host of Object.values(config.hosts)) {
      if (host.group === name) {
        delete host.group;
      }
    }
    this.persist(config);
  }

  getGroups(): Record<string, Group> {
    return this.read().groups;
  }

  // ---------------------------------------------------------------------------
  // Sync (force regenerate SSH config from current sshm.json)
  // ---------------------------------------------------------------------------

  sync(): void {
    const config = this.read();
    this.writeConfig(config);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private persist(config: SshmConfig): void {
    this.writeJson(config);
    this.writeConfig(config);
  }

  private writeJson(config: SshmConfig): void {
    mkdirSync(dirname(this.jsonPath), { recursive: true });
    writeFileSync(this.jsonPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  }

  private writeConfig(config: SshmConfig): void {
    mkdirSync(dirname(this.sshConfigPath), { recursive: true });
    mkdirSync(this.groupsDir, { recursive: true });

    const generated = generateSshConfig(config);

    // Write main config (Include lines + ungrouped hosts)
    writeFileSync(this.sshConfigPath, generated.main, "utf-8");

    // Write per-group files
    for (const [groupName, content] of Object.entries(generated.groups)) {
      writeFileSync(join(this.groupsDir, `${groupName}.conf`), content, "utf-8");
    }

    // Remove stale group files for groups that no longer exist
    if (existsSync(this.groupsDir)) {
      const activeFiles = new Set(
        Object.keys(generated.groups).map((n) => `${n}.conf`),
      );
      for (const file of readdirSync(this.groupsDir)) {
        if (file.endsWith(".conf") && !activeFiles.has(file)) {
          rmSync(join(this.groupsDir, file));
        }
      }
    }
  }

  private validate(data: unknown): SshmConfig {
    if (typeof data !== "object" || data === null) {
      throw new ConfigParseError("sshm.json must be a JSON object.");
    }

    const obj = data as Record<string, unknown>;

    if (typeof obj["version"] !== "number") {
      throw new ConfigParseError("sshm.json missing required field: version.");
    }

    if (obj["version"] !== SSHM_VERSION) {
      throw new ConfigVersionError(
        `sshm.json version ${obj["version"]} is not supported (expected ${SSHM_VERSION}).`,
      );
    }

    if (typeof obj["groups"] !== "object" || obj["groups"] === null) {
      throw new ConfigParseError("sshm.json missing required field: groups.");
    }

    if (typeof obj["hosts"] !== "object" || obj["hosts"] === null) {
      throw new ConfigParseError("sshm.json missing required field: hosts.");
    }

    return data as SshmConfig;
  }
}
