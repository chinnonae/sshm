# PRD: sshm — CLI SSH Config Manager

## Problem Statement

Managing SSH connections across many servers is tedious and error-prone. The default `~/.ssh/config` file is a flat text file with no concept of grouping, inheritance, or tooling. Users working with multiple environments (production, staging, dev) must manually duplicate shared settings (identity file, user, proxy jump) across dozens of host entries. There is no interactive way to browse, add, or edit connections, and no safe way to version-control the config without risking exposure of private keys.

## Solution

`sshm` is a CLI tool that manages SSH host configurations through a structured data model stored in `~/.ssh/sshm/`. Hosts can be organised into groups that define shared SSH settings, which are inherited by all member hosts. The tool maintains a generated `~/.ssh/sshm/config` file that is included by `~/.ssh/config`, keeping the SSH toolchain fully compatible. The `~/.ssh/sshm/` directory contains no private keys and is safe to version-control with git.

`sshm` supports both a standard CLI interface with flags and dynamic shell autocompletion, and a menu-driven interactive mode for guided management.

## User Stories

1. As a developer, I want to run `sshm init` so that the tool creates its working directory and wires itself into my existing `~/.ssh/config` without touching my private keys.
2. As a developer, I want to create a group with shared SSH options so that I don't have to repeat `IdentityFile`, `User`, and `ProxyJump` on every host in that environment.
3. As a developer, I want to add a host to a group so that it automatically inherits the group's SSH settings.
4. As a developer, I want host-level settings to override group-level settings so that I can handle exceptions without leaving the group.
5. As a developer, I want to run `sshm host add web1 --hostname 10.0.1.10 --group production` so that I can add hosts non-interactively in scripts.
6. As a developer, I want to run `sshm host add` with no arguments so that the tool guides me through adding a host interactively with prompts.
7. As a developer, I want to run `sshm host edit web1` so that I can update a host's settings with current values pre-filled in the prompts.
8. As a developer, I want to run `sshm host remove web1` so that the host is deleted from the config and the SSH config is immediately regenerated.
9. As a developer, I want to run `sshm host list` so that I can see all hosts organised by group with their key settings at a glance.
10. As a developer, I want to run `sshm host list --group production` so that I can see only the hosts in a specific group.
11. As a developer, I want to run `sshm host list --json` so that I can consume the host list in scripts and other tools.
12. As a developer, I want to run `sshm host move web1 staging` so that I can reassign a host to a different group.
13. As a developer, I want to run `sshm group add production` so that I can create a named group with shared SSH settings.
14. As a developer, I want to run `sshm group edit production` so that I can update a group's shared settings and have all member hosts' configs regenerated.
15. As a developer, I want to run `sshm group remove production` so that I can delete a group (with a confirmation prompt if it has members).
16. As a developer, I want to run `sshm group list` so that I can see all groups and their member counts.
17. As a developer, I want to run `sshm c web1` so that I can connect to a saved host by alias without typing the full `ssh` command.
18. As a developer, I want to run `sshm c` with no argument so that a fuzzy-searchable list of all hosts is shown and I can select one to connect.
19. As a developer, I want `sshm c` to replace the current process with `ssh` so that interactive sessions, port forwards, and TTY allocation work exactly as if I had typed `ssh` directly.
20. As a developer, I want to run `sshm c chinnonae@192.168.147.11` with a raw `user@hostname` so that I can connect to an ad-hoc target without pre-adding it.
21. As a developer, I want `sshm c <ip>` to automatically match an existing saved host by its `HostName` field so that I don't have to remember the alias.
22. As a developer, I want `sshm c user@hostname` to prompt me to save the host if no match is found so that repeat connections become faster over time.
23. As a developer, I want the save prompt to pre-fill the `User` field from the `user@hostname` input so that I don't have to re-type it.
24. As a developer, I want the option to skip saving and connect directly when `sshm c` is given an unknown host so that I can make one-off connections without polluting my config.
25. As a developer, I want to run `sshm sync` so that I can force-regenerate `~/.ssh/sshm/config` if the files ever get out of sync.
26. As a developer, I want the SSH config to be regenerated automatically after every mutating operation so that I never have to think about syncing manually.
27. As a developer, I want the generated `Host` line to include both the alias and the IP address (e.g., `Host web1 10.0.1.10`) so that Ansible and other tools that connect by IP also match the SSH config block.
28. As a developer, I want to set `extraOptions` on a host or group so that I can use any SSH directive that the tool does not explicitly model.
29. As a developer, I want to run `sshm completion --shell zsh >> ~/.zshrc` so that I can install shell autocompletion for `sshm` once and have it active in all future sessions.
30. As a developer, I want tab completion on `sshm c <tab>` to dynamically show my actual host aliases so that I can connect without remembering exact names.
31. As a developer, I want tab completion on `sshm host edit <tab>` and `sshm host remove <tab>` to show host aliases dynamically.
32. As a developer, I want tab completion on `sshm group edit <tab>` and `sshm group remove <tab>` to show group names dynamically.
33. As a developer, I want to run `sshm` with no arguments so that an interactive menu-driven session starts where I can manage hosts, groups, and connections.
34. As a developer, I want the interactive menu to let me drill down from a group into its hosts and perform actions on them.
35. As a developer, I want the `~/.ssh/sshm/` directory to contain no private keys so that I can safely add it to a git repository for backup without risk of credential exposure.
36. As a developer, I want each group's hosts to be written to a dedicated file (`~/.ssh/sshm/groups/<groupName>.conf`) so that git diffs are scoped to the affected group and the files are easy to review individually.
37. As a developer, I want ungrouped hosts to remain in `~/.ssh/sshm/config` so that the main config file is uncluttered and group files are self-contained.
38. As a developer, I want `~/.ssh/sshm/config` to contain `Include` lines for each active group file so that a single `Include ~/.ssh/sshm/config` in `~/.ssh/config` is all that is needed.
39. As a developer, I want `sshm init` to be idempotent so that running it twice does not create duplicate `Include` directives or corrupt my config.
40. As a developer, I want `sshm` to compile to a single self-contained binary so that I can install it on any Linux/macOS machine without requiring Bun or Node.
41. As a developer, I want to install `sshm` from source by running `bun install && bun link` so that my local build is the active binary during development.
42. As a developer, I want group-level options to be written as merged directives into each host's block in the generated config (not as a separate `Match` block) so that the output is simple and predictable.
43. As a developer, I want a `description` field on groups so that I can annotate what each group is for when listing groups.

## Implementation Decisions

### Modules

**ConfigStore** (deep module)
- Single source of truth for reading and writing `~/.ssh/sshm/sshm.json`
- Exposes a typed CRUD interface: `getHosts`, `getGroups`, `addHost`, `updateHost`, `removeHost`, `addGroup`, `updateGroup`, `removeGroup`
- Validates the schema on read (version field, required host fields)
- After every write, calls SshConfigGenerator and writes the result to `~/.ssh/sshm/config`
- All other modules interact with the data model exclusively through ConfigStore

**SshConfigGenerator** (deep module)
- Pure function: accepts the full hosts and groups model, returns a `GeneratedConfig` object with two fields: `main` (string for `~/.ssh/sshm/config`) and `groups` (map of group name → string for each `~/.ssh/sshm/groups/<name>.conf`)
- Hosts assigned to a group are written into that group's dedicated file only; they do not appear in `main`
- The `main` file contains `Include ~/.ssh/sshm/groups/<name>.conf` lines for every group that has at least one host, followed by the ungrouped host blocks
- Groups with no hosts produce no file and no Include line
- Applies group-option inheritance: group options are merged under each member host's block, with host-level options taking precedence
- Formats the `Host` line as `Host <alias> <HostName>` for Ansible compatibility
- Has no file I/O or side effects — purely a transformation

**SshConfigFile** (shallow module)
- Manages `~/.ssh/config`: reads it, checks for the `Include ~/.ssh/sshm/config` directive, and prepends it if absent
- Used only by `sshm init`

**Commands** (shallow modules, one per command group)
- `host`: add, remove, edit, list, move
- `group`: add, remove, edit, list
- `connect` / `c`: accepts an alias, bare hostname/IP, or `user@hostname`; matches against saved hosts by alias or HostName; if no match found, prompts to save the host (with user pre-filled from `user@hostname` input) or connect directly without saving; fuzzy picker when called with no argument; exec-replaces the process with `ssh`
- `init`: creates `~/.ssh/sshm/`, initialises `sshm.json`, calls SshConfigFile
- `sync`: calls ConfigStore to force-regenerate config
- `completion`: outputs shell completion scripts; handles `--completions <context>` for dynamic queries

**InteractiveTUI** (shallow module)
- Menu-driven flows built on `@clack/prompts`
- Main menu → host management / group management / connect
- Delegates all data operations to the same Commands layer
- Launched when `sshm` is run with no arguments

**ShellCompletion** (shallow module)
- Generates zsh, bash, and fish completion script strings
- Dynamic completions query the live `sshm.json` at tab-press time via a `--completions <context>` flag

### Data Schema (`sshm.json`)

```
{
  version: number,
  groups: {
    [name: string]: {
      description?: string,
      options: Record<string, string>  // SSH directives
    }
  },
  hosts: {
    [alias: string]: {
      HostName: string,
      group?: string,
      options: Record<string, string>  // SSH directives, override group
    }
  }
}
```

### File Layout

- `~/.ssh/sshm/sshm.json` — authoritative data store
- `~/.ssh/sshm/config` — main generated file: `Include` directives for each group + ungrouped host blocks; never edited manually
- `~/.ssh/sshm/groups/<groupName>.conf` — one generated file per group containing that group's host blocks; never edited manually
- `~/.ssh/config` — user-owned; `sshm init` prepends `Include ~/.ssh/sshm/config`

### CLI Design

- Binary: `sshm`
- Framework: `commander` for command/flag parsing, `@clack/prompts` for interactive prompts, `chalk` for output colour
- Runtime: Bun
- `connect` has a short alias `c` registered as a commander alias
- All mutating commands auto-sync (ConfigStore handles this internally)

### Supported First-Class SSH Directives

`User`, `Port`, `IdentityFile`, `ProxyJump`, `ForwardAgent`, `ServerAliveInterval`, `StrictHostKeyChecking`, `LocalForward`, `RemoteForward` — plus an `extraOptions` bag for arbitrary directives.

## Testing Decisions

Good tests verify observable external behaviour through the module's public interface only. They do not assert on internal state, private methods, or implementation details. A test should break when behaviour changes, not when the implementation is refactored.

### Modules to test

**ConfigStore**
- Reads a valid `sshm.json` and returns correctly typed data
- Throws on a missing or malformed file
- `addHost` persists correctly and triggers config regeneration
- `removeHost` removes the entry and triggers regeneration
- `updateHost` applies partial updates and triggers regeneration
- Group CRUD operations behave symmetrically to host operations
- Schema version mismatch is detected and reported

**SshConfigGenerator**
- A host with no group renders only its own options in `main`
- A host in a group renders into the group's dedicated file, not `main`
- A host in a group inherits the group's options
- A host-level option overrides the same group-level option
- The `Host` line includes both alias and `HostName`
- `extraOptions` entries appear in the output
- `main` contains an `Include` line for each group that has hosts
- A group with no hosts produces no file and no `Include` line
- Multiple ungrouped hosts are separated by a blank line in `main`
- Multiple hosts in the same group are separated by a blank line in the group file
- An empty hosts object produces `main: ""` and `groups: {}`

## Out of Scope

- Importing or migrating an existing `~/.ssh/config` into `sshm`
- Nested or hierarchical groups
- Git integration or built-in backup commands
- SSH key generation or key management
- Testing SSH connectivity (ping, handshake checks)
- Managing `~/.ssh/known_hosts`
- Multi-user or shared config support
- A fullscreen TUI (ncurses-style panels)
- Publishing to npm

## Further Notes

- The `~/.ssh/sshm/` directory is intentionally key-free and safe to commit to a private git repository for config backup
- `bun build --compile` can produce a single self-contained binary for distribution without a runtime dependency
- `sshm init` must be idempotent — safe to run multiple times
- The `Include` directive in `~/.ssh/config` requires OpenSSH 7.3+; this is noted as a prerequisite
- Ansible compatibility is achieved via the `Host alias IP` format in the generated config — no special Ansible config is needed
