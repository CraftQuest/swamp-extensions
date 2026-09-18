/**
 * Swamp model for the SSH keys on a Linode profile (`/profile/sshkeys`):
 * create, adopt, relabel, sync, list, delete. Keys registered here can be
 * installed on new instances via `authorized_users`. Registered as
 * `@craftquest/linode/ssh_keys`.
 *
 * @module
 */

import { z } from "npm:zod@4";
import { compact, type Json } from "./_lib/linode.ts";
import {
  LifecycleFields,
  ListingSchema,
  makeChecks,
  makeCrudMethods,
} from "./_lib/crud.ts";

const ENDPOINT = "/profile/sshkeys";

/** Global arguments: the key to register plus the API token. */
const GlobalArgsSchema = z.object({
  token: z.string().default("").meta({ sensitive: true }).describe(
    "Linode personal access token (vault-supplied); falls back to LINODE_TOKEN",
  ),
  label: z.string().default("").describe(
    "Key label (max 64 chars); also the state name",
  ),
  ssh_key: z.string().default("").describe(
    "Public key text (ssh-ed25519 ..., ssh-rsa ..., ecdsa-sha2-nistp...)",
  ),
});

/** Resolved global arguments type. */
type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

/** Stored state of one SSH key. */
const StateSchema = z.object({
  id: z.number(),
  label: z.string(),
  status: z.string(),
  sshKey: z.string().optional(),
  created: z.string().optional(),
  ...LifecycleFields,
});

/** Stored state type. */
type SshKeyState = z.infer<typeof StateSchema>;

/** Map a raw Linode SSH key object onto {@link StateSchema}. */
function toState(raw: Json): SshKeyState {
  return StateSchema.parse(compact({
    id: raw.id,
    label: String(raw.label ?? ""),
    status: "active",
    sshKey: raw.ssh_key,
    created: raw.created,
  }));
}

/** Build the POST /profile/sshkeys body from the global arguments. */
function createBody(g: Json): Json {
  const a = GlobalArgsSchema.parse(g);
  if (!a.ssh_key.trim()) {
    throw new Error("globalArgs.ssh_key (public key text) is required");
  }
  return { label: a.label, ssh_key: a.ssh_key.trim() };
}

/** Build the PUT /profile/sshkeys/{id} body from the global arguments. */
function updateBody(g: Json): Json {
  const a = GlobalArgsSchema.parse(g);
  return compact({ label: a.label || undefined });
}

/**
 * Swamp model for Linode profile SSH keys. Registered as
 * `@craftquest/linode/ssh_keys`.
 */
export const model = {
  type: "@craftquest/linode/ssh_keys",
  version: "2026.09.18.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    state: {
      description: "SSH key state, one resource per key named by label",
      schema: StateSchema,
      lifetime: "infinite" as const,
      garbageCollection: 10,
    },
    listing: {
      description: "Summary of the most recent list call",
      schema: ListingSchema,
      lifetime: "infinite" as const,
      garbageCollection: 5,
    },
  },
  checks: makeChecks(),
  methods: makeCrudMethods({
    endpoint: ENDPOINT,
    noun: "SSH key",
    toState: (raw) => toState(raw),
    createBody,
    updateBody,
    confirmDelete: false,
  }),
};
