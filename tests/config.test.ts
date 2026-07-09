import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigStore,
  ConfigStoreError,
  ConfigVersionError,
} from "../src/lib/config.ts";

function makeStore(dir: string): ConfigStore {
  return new ConfigStore(
    join(dir, "sshm.json"),
    join(dir, "config"),
    join(dir, "groups"),
  );
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `sshm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// read()
// ---------------------------------------------------------------------------

describe("ConfigStore.read", () => {
  it("throws ConfigNotFoundError when sshm.json does not exist", () => {
    const store = makeStore(tmpDir);
    expect(() => store.read()).toThrow(ConfigNotFoundError);
  });

  it("throws ConfigParseError when sshm.json contains invalid JSON", () => {
    writeFileSync(join(tmpDir, "sshm.json"), "{ invalid json }");
    expect(() => makeStore(tmpDir).read()).toThrow(ConfigParseError);
  });

  it("throws ConfigParseError when sshm.json is not an object", () => {
    writeFileSync(join(tmpDir, "sshm.json"), '"a string"');
    expect(() => makeStore(tmpDir).read()).toThrow(ConfigParseError);
  });

  it("throws ConfigParseError when version field is missing", () => {
    writeFileSync(join(tmpDir, "sshm.json"), JSON.stringify({ groups: {}, hosts: {} }));
    expect(() => makeStore(tmpDir).read()).toThrow(ConfigParseError);
  });

  it("throws ConfigVersionError when version does not match", () => {
    writeFileSync(join(tmpDir, "sshm.json"), JSON.stringify({ version: 99, groups: {}, hosts: {} }));
    expect(() => makeStore(tmpDir).read()).toThrow(ConfigVersionError);
  });

  it("returns a valid SshmConfig for a correct file", () => {
    const store = makeStore(tmpDir);
    store.init();
    const config = store.read();
    expect(config.version).toBe(1);
    expect(config.groups).toEqual({});
    expect(config.hosts).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// init()
// ---------------------------------------------------------------------------

describe("ConfigStore.init", () => {
  it("creates sshm.json with empty config", () => {
    const store = makeStore(tmpDir);
    store.init();
    expect(existsSync(join(tmpDir, "sshm.json"))).toBe(true);
    const config = store.read();
    expect(config.version).toBe(1);
  });

  it("is idempotent — does not overwrite existing config", () => {
    const store = makeStore(tmpDir);
    store.init();
    store.addHost("existing", { HostName: "1.2.3.4", options: {} });
    store.init(); // second init — should not reset
    expect(Object.keys(store.getHosts())).toContain("existing");
  });
});

// ---------------------------------------------------------------------------
// Host CRUD
// ---------------------------------------------------------------------------

describe("ConfigStore host operations", () => {
  it("addHost persists a new host", () => {
    const store = makeStore(tmpDir);
    store.init();
    store.addHost("web1", { HostName: "10.0.0.1", options: { User: "ubuntu" } });
    const hosts = store.getHosts();
    expect(hosts["web1"]?.HostName).toBe("10.0.0.1");
    expect(hosts["web1"]?.options["User"]).toBe("ubuntu");
  });

  it("addHost throws when alias already exists", () => {
    const store = makeStore(tmpDir);
    store.init();
    store.addHost("web1", { HostName: "10.0.0.1", options: {} });
    expect(() =>
      store.addHost("web1", { HostName: "10.0.0.2", options: {} })
    ).toThrow(ConfigStoreError);
  });

  it("updateHost applies partial updates", () => {
    const store = makeStore(tmpDir);
    store.init();
    store.addHost("web1", { HostName: "10.0.0.1", options: { User: "ubuntu" } });
    store.updateHost("web1", { options: { Port: "2222" } });
    const host = store.getHosts()["web1"]!;
    expect(host.options["User"]).toBe("ubuntu");
    expect(host.options["Port"]).toBe("2222");
  });

  it("updateHost replaces HostName when provided", () => {
    const store = makeStore(tmpDir);
    store.init();
    store.addHost("web1", { HostName: "10.0.0.1", options: {} });
    store.updateHost("web1", { HostName: "10.0.0.99" });
    expect(store.getHosts()["web1"]?.HostName).toBe("10.0.0.99");
  });

  it("updateHost throws when host not found", () => {
    const store = makeStore(tmpDir);
    store.init();
    expect(() => store.updateHost("nope", { HostName: "1.1.1.1" })).toThrow(ConfigStoreError);
  });

  it("removeHost deletes the host", () => {
    const store = makeStore(tmpDir);
    store.init();
    store.addHost("web1", { HostName: "10.0.0.1", options: {} });
    store.removeHost("web1");
    expect(store.getHosts()["web1"]).toBeUndefined();
  });

  it("removeHost throws when host not found", () => {
    const store = makeStore(tmpDir);
    store.init();
    expect(() => store.removeHost("nope")).toThrow(ConfigStoreError);
  });

  it("addHost triggers SSH config regeneration (ungrouped → main config)", () => {
    const store = makeStore(tmpDir);
    store.init();
    store.addHost("web1", { HostName: "10.0.0.1", options: {} });
    const sshConfig = require("node:fs").readFileSync(join(tmpDir, "config"), "utf-8");
    expect(sshConfig).toContain("Host web1 10.0.0.1");
  });

  it("addHost with group writes to group file and adds Include to main", () => {
    const store = makeStore(tmpDir);
    store.init();
    store.addGroup("prod", { options: { User: "deploy" } });
    store.addHost("srv1", { HostName: "10.0.0.2", group: "prod", options: {} });
    const mainConfig = require("node:fs").readFileSync(join(tmpDir, "config"), "utf-8");
    const groupConfig = require("node:fs").readFileSync(join(tmpDir, "groups", "prod.conf"), "utf-8");
    expect(mainConfig).toContain("Include ~/.ssh/sshm/groups/prod.conf");
    expect(mainConfig).not.toContain("Host srv1");
    expect(groupConfig).toContain("Host srv1 10.0.0.2");
    expect(groupConfig).toContain("User deploy");
  });

  it("removeGroup deletes the group conf file", () => {
    const store = makeStore(tmpDir);
    store.init();
    store.addGroup("prod", { options: {} });
    store.addHost("srv1", { HostName: "10.0.0.2", group: "prod", options: {} });
    store.removeGroup("prod");
    expect(require("node:fs").existsSync(join(tmpDir, "groups", "prod.conf"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Group CRUD
// ---------------------------------------------------------------------------

describe("ConfigStore group operations", () => {
  it("addGroup persists a new group", () => {
    const store = makeStore(tmpDir);
    store.init();
    store.addGroup("prod", { options: { User: "deploy" } });
    expect(store.getGroups()["prod"]?.options["User"]).toBe("deploy");
  });

  it("addGroup throws when group already exists", () => {
    const store = makeStore(tmpDir);
    store.init();
    store.addGroup("prod", { options: {} });
    expect(() => store.addGroup("prod", { options: {} })).toThrow(ConfigStoreError);
  });

  it("updateGroup merges options", () => {
    const store = makeStore(tmpDir);
    store.init();
    store.addGroup("prod", { options: { User: "deploy" } });
    store.updateGroup("prod", { options: { Port: "22" } });
    const group = store.getGroups()["prod"]!;
    expect(group.options["User"]).toBe("deploy");
    expect(group.options["Port"]).toBe("22");
  });

  it("updateGroup throws when group not found", () => {
    const store = makeStore(tmpDir);
    store.init();
    expect(() => store.updateGroup("nope", { options: {} })).toThrow(ConfigStoreError);
  });

  it("removeGroup deletes the group and unassigns member hosts", () => {
    const store = makeStore(tmpDir);
    store.init();
    store.addGroup("prod", { options: {} });
    store.addHost("web1", { HostName: "10.0.0.1", group: "prod", options: {} });
    store.removeGroup("prod");
    expect(store.getGroups()["prod"]).toBeUndefined();
    expect(store.getHosts()["web1"]?.group).toBeUndefined();
  });

  it("removeGroup throws when group not found", () => {
    const store = makeStore(tmpDir);
    store.init();
    expect(() => store.removeGroup("nope")).toThrow(ConfigStoreError);
  });
});

// ---------------------------------------------------------------------------
// sync()
// ---------------------------------------------------------------------------

describe("ConfigStore.sync", () => {
  it("rewrites the SSH config from the current sshm.json", () => {
    const store = makeStore(tmpDir);
    store.init();
    store.addHost("srv1", { HostName: "10.0.0.5", options: {} });
    // Manually corrupt the config file
    writeFileSync(join(tmpDir, "config"), "# corrupted");
    store.sync();
    const sshConfig = require("node:fs").readFileSync(join(tmpDir, "config"), "utf-8");
    expect(sshConfig).toContain("Host srv1 10.0.0.5"); // ungrouped → main
  });
});
