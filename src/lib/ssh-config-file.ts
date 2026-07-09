import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const SSH_CONFIG = join(homedir(), ".ssh", "config");
export const INCLUDE_LINE = "Include ~/.ssh/sshm/config";

/**
 * Checks whether the Include directive is already present in ~/.ssh/config.
 */
export function hasInclude(sshConfigPath: string = SSH_CONFIG): boolean {
  if (!existsSync(sshConfigPath)) return false;
  const content = readFileSync(sshConfigPath, "utf-8");
  return content.includes(INCLUDE_LINE);
}

/**
 * Prepends the Include directive to ~/.ssh/config if not already present.
 * Creates the file if it doesn't exist.
 */
export function ensureInclude(sshConfigPath: string = SSH_CONFIG): void {
  if (hasInclude(sshConfigPath)) return;

  if (!existsSync(sshConfigPath)) {
    // Create with just the include line
    appendFileSync(sshConfigPath, `${INCLUDE_LINE}\n`, "utf-8");
    return;
  }

  const existing = readFileSync(sshConfigPath, "utf-8");
  const updated = `${INCLUDE_LINE}\n\n${existing}`;
  require("node:fs").writeFileSync(sshConfigPath, updated, "utf-8");
}
