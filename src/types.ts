export const SSHM_VERSION = 1;

/** SSH directives bag — any valid SSH config keyword as key */
export type SshOptions = Record<string, string>;

export interface Group {
  description?: string;
  options: SshOptions;
}

export interface Host {
  HostName: string;
  group?: string;
  /** Host-level SSH options — override group options on conflict */
  options: SshOptions;
}

export interface SshmConfig {
  version: number;
  groups: Record<string, Group>;
  hosts: Record<string, Host>;
}

/** First-class SSH directive keys with explicit type support */
export const FIRST_CLASS_DIRECTIVES = [
  "User",
  "Port",
  "IdentityFile",
  "ProxyJump",
  "ForwardAgent",
  "ServerAliveInterval",
  "StrictHostKeyChecking",
  "LocalForward",
  "RemoteForward",
] as const;

export type FirstClassDirective = (typeof FIRST_CLASS_DIRECTIVES)[number];

export const EMPTY_CONFIG: SshmConfig = {
  version: SSHM_VERSION,
  groups: {},
  hosts: {},
};
