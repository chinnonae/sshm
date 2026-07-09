import type { SshmConfig } from "../types.ts";

export interface GeneratedConfig {
  /** Content for ~/.ssh/sshm/config — Include lines + ungrouped hosts */
  main: string;
  /** Map of group name → file content for ~/.ssh/sshm/groups/<name>.conf */
  groups: Record<string, string>;
}

/** Render a single host block. Group options are already merged in. */
function renderHostBlock(alias: string, hostname: string, options: Record<string, string>): string {
  const lines: string[] = [];
  // Host line: alias + IP/hostname for Ansible compatibility
  lines.push(`Host ${alias} ${hostname}`);
  lines.push(`    HostName ${hostname}`);
  for (const [key, value] of Object.entries(options)) {
    lines.push(`    ${key} ${value}`);
  }
  return lines.join("\n");
}

/**
 * Pure function: converts the sshm data model into a GeneratedConfig.
 * No file I/O — callers are responsible for writing.
 *
 * Merging rules:
 *  - Group options are the base layer.
 *  - Host-level options override group options on key conflict.
 *  - The Host line includes both alias and HostName for Ansible compatibility.
 *
 * Output layout:
 *  - Hosts in a group  → ~/.ssh/sshm/groups/<groupName>.conf
 *  - Ungrouped hosts   → ~/.ssh/sshm/config (after Include lines)
 *  - main config       → Include line per group + ungrouped host blocks
 */
export function generateSshConfig(config: SshmConfig): GeneratedConfig {
  const { hosts, groups } = config;

  const groupBlocks: Record<string, string[]> = {};
  const ungroupedBlocks: string[] = [];

  for (const [alias, host] of Object.entries(hosts)) {
    const groupOptions =
      host.group && groups[host.group] ? groups[host.group]!.options : {};

    const merged: Record<string, string> = {
      ...groupOptions,
      ...host.options,
    };

    const block = renderHostBlock(alias, host.HostName, merged);

    if (host.group) {
      (groupBlocks[host.group] ??= []).push(block);
    } else {
      ungroupedBlocks.push(block);
    }
  }

  // Build per-group file content
  const groupFiles: Record<string, string> = {};
  for (const [groupName, blocks] of Object.entries(groupBlocks)) {
    groupFiles[groupName] = blocks.join("\n\n");
  }

  // Build main config: Include lines for each group file + ungrouped hosts
  const mainParts: string[] = [];

  const groupNames = Object.keys(groupFiles).sort();
  for (const name of groupNames) {
    mainParts.push(`Include ~/.ssh/sshm/groups/${name}.conf`);
  }

  if (ungroupedBlocks.length > 0) {
    if (mainParts.length > 0) mainParts.push(""); // blank line separator
    mainParts.push(ungroupedBlocks.join("\n\n"));
  }

  return {
    main: mainParts.join("\n"),
    groups: groupFiles,
  };
}
