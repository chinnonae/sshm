import { describe, expect, it } from "bun:test";
import { generateSshConfig } from "../src/lib/generator.ts";
import type { SshmConfig } from "../src/types.ts";

const base: SshmConfig = { version: 1, groups: {}, hosts: {} };

describe("generateSshConfig", () => {
  it("returns empty strings for no hosts", () => {
    const result = generateSshConfig(base);
    expect(result.main).toBe("");
    expect(result.groups).toEqual({});
  });

  it("renders an ungrouped host in main config", () => {
    const config: SshmConfig = {
      ...base,
      hosts: {
        web1: {
          HostName: "10.0.1.10",
          options: { User: "ubuntu", Port: "22" },
        },
      },
    };
    const { main, groups } = generateSshConfig(config);
    expect(main).toContain("Host web1 10.0.1.10");
    expect(main).toContain("HostName 10.0.1.10");
    expect(main).toContain("User ubuntu");
    expect(main).toContain("Port 22");
    expect(Object.keys(groups)).toHaveLength(0);
  });

  it("includes both alias and HostName on the Host line", () => {
    const config: SshmConfig = {
      ...base,
      hosts: { myalias: { HostName: "192.168.1.1", options: {} } },
    };
    expect(generateSshConfig(config).main).toMatch(/^Host myalias 192\.168\.1\.1/m);
  });

  it("puts a grouped host into the group file, not main", () => {
    const config: SshmConfig = {
      ...base,
      groups: { prod: { options: { User: "deploy" } } },
      hosts: { server1: { HostName: "10.0.0.1", group: "prod", options: {} } },
    };
    const { main, groups } = generateSshConfig(config);
    expect(groups["prod"]).toContain("Host server1 10.0.0.1");
    expect(groups["prod"]).toContain("User deploy");
    expect(main).not.toContain("Host server1");
  });

  it("adds an Include line in main for each group that has hosts", () => {
    const config: SshmConfig = {
      ...base,
      groups: { prod: { options: {} } },
      hosts: { server1: { HostName: "10.0.0.1", group: "prod", options: {} } },
    };
    expect(generateSshConfig(config).main).toContain(
      "Include ~/.ssh/sshm/groups/prod.conf",
    );
  });

  it("does not add an Include line for a group with no hosts", () => {
    const config: SshmConfig = {
      ...base,
      groups: { empty: { options: {} } },
      hosts: {},
    };
    const { main, groups } = generateSshConfig(config);
    expect(main).not.toContain("Include");
    expect(groups["empty"]).toBeUndefined();
  });

  it("inherits group options into the group file", () => {
    const config: SshmConfig = {
      ...base,
      groups: { prod: { options: { User: "deploy", IdentityFile: "~/.ssh/prod" } } },
      hosts: { server1: { HostName: "10.0.0.1", group: "prod", options: {} } },
    };
    const groupContent = generateSshConfig(config).groups["prod"]!;
    expect(groupContent).toContain("User deploy");
    expect(groupContent).toContain("IdentityFile ~/.ssh/prod");
  });

  it("host-level option overrides group-level option in group file", () => {
    const config: SshmConfig = {
      ...base,
      groups: { prod: { options: { User: "deploy", Port: "22" } } },
      hosts: { special: { HostName: "10.0.0.2", group: "prod", options: { Port: "2222" } } },
    };
    const groupContent = generateSshConfig(config).groups["prod"]!;
    expect(groupContent).toContain("Port 2222");
    expect(groupContent).not.toMatch(/Port 22\b(?!22)/);
  });

  it("does not apply group options to a host in a different group", () => {
    const config: SshmConfig = {
      ...base,
      groups: { prod: { options: { User: "deploy" } } },
      hosts: { dev1: { HostName: "10.0.0.3", group: "staging", options: {} } },
    };
    // dev1 goes to "staging" group file (no matching group options)
    const { groups } = generateSshConfig(config);
    expect(groups["staging"]).toBeDefined();
    expect(groups["staging"]).not.toContain("User deploy");
    expect(groups["prod"]).toBeUndefined();
  });

  it("ungrouped and grouped hosts can coexist", () => {
    const config: SshmConfig = {
      ...base,
      groups: { prod: { options: {} } },
      hosts: {
        srv1: { HostName: "10.0.0.1", group: "prod", options: {} },
        standalone: { HostName: "10.0.0.2", options: {} },
      },
    };
    const { main, groups } = generateSshConfig(config);
    expect(main).toContain("Include ~/.ssh/sshm/groups/prod.conf");
    expect(main).toContain("Host standalone 10.0.0.2");
    expect(groups["prod"]).toContain("Host srv1 10.0.0.1");
  });

  it("renders extraOptions correctly", () => {
    const config: SshmConfig = {
      ...base,
      hosts: { edge: { HostName: "10.0.0.5", options: { Compression: "yes", TCPKeepAlive: "yes" } } },
    };
    const { main } = generateSshConfig(config);
    expect(main).toContain("Compression yes");
    expect(main).toContain("TCPKeepAlive yes");
  });

  it("separates multiple ungrouped hosts with a blank line", () => {
    const config: SshmConfig = {
      ...base,
      hosts: {
        host1: { HostName: "1.1.1.1", options: {} },
        host2: { HostName: "2.2.2.2", options: {} },
      },
    };
    expect(generateSshConfig(config).main).toMatch(/host1[\s\S]*\n\n[\s\S]*host2/);
  });

  it("separates multiple hosts in a group file with a blank line", () => {
    const config: SshmConfig = {
      ...base,
      groups: { prod: { options: {} } },
      hosts: {
        srv1: { HostName: "1.1.1.1", group: "prod", options: {} },
        srv2: { HostName: "2.2.2.2", group: "prod", options: {} },
      },
    };
    expect(generateSshConfig(config).groups["prod"]).toMatch(/srv1[\s\S]*\n\n[\s\S]*srv2/);
  });
});
