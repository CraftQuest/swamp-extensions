---
name: linode
description: >
  Operate @craftquest/linode — provision and manage Linode (Akamai) compute
  instances, Cloud Firewalls, Block Storage volumes, and SSH keys from swamp,
  and look up regions, plan types with pricing, and images. Use whenever the
  user asks to create, boot, reboot, shut down, resize, or delete a Linode,
  attach a firewall or volume, add an SSH key to their Linode profile, or
  check what Linode regions, plans, or images are available. Triggers on
  "linode", "akamai cloud", "provision a linode", "spin up a linode",
  "linode firewall", "block storage", "linode volume", "linode plans",
  "linode regions", "delete the linode".
---

# Operating @craftquest/linode

Five model types, one instance definition each in the shipped
`instances/` directory: `ln-instance`, `ln-firewall`, `ln-volume`,
`ln-ssh-key`, `ln-catalog`. Every resource is addressed by its Linode
label, which is also the swamp data name — read state with
`swamp data get ln-instance <label> --json` instead of re-fetching.

## Pre-flight

1. Vault `linode-secrets` must hold `LINODE_TOKEN` — check with
   `swamp vault list-keys linode-secrets`. If missing, have the user create
   a personal access token in Cloud Manager and run the `swamp vault put`
   line from the README themselves. Never ask for the token in chat.
2. The instance definitions must validate: `swamp model validate ln-catalog`.
   If they do not exist, copy them from
   `.swamp/pulled-extensions/@craftquest/linode/files/instances/`.
3. Each mutating method runs `linode-token` and `linode-auth` (live) checks
   first. A `linode-auth` failure is vault wiring, not code.

## Choosing region, type, image

Run `ln-catalog list_regions`, `list_types` (filter `{"class":"nanode"}` for
the cheapest), `list_images` (filter `{"vendor":"Ubuntu"}`), then read
`swamp data get ln-catalog types --json`. Prices in `types` are USD list
prices; `priceMonthly` is the number to quote.

## Provisioning order

1. `ln-ssh-key create` if the user wants their key on the account (optional;
   `authorized_keys` on the instance takes key text directly).
2. `ln-firewall create` — the shipped definition allows SSH, HTTP, HTTPS,
   ICMP inbound and everything outbound. Edit `inbound` in the YAML for
   anything stricter.
3. `ln-instance create` with `label`, `region`, `type`, `image`, and either
   `authorized_keys` or a vault-wired `root_pass`. Linode refuses an instance
   with no login method.
4. `ln-instance wait` (default target `running`), then read `ipv4[0]` from
   state.
5. `ln-firewall attach --input linode_id=<id>` (or pass `firewall_id` at
   create).
6. `ln-volume create` + `attach` + `wait` if block storage is wanted; the
   device path is `filesystemPath` in volume state.

`create` adopts an existing resource with the same label instead of
duplicating it. Use `lookup` (by label) or `adopt` (by id) to import
infrastructure that swamp did not create.

## Day two

- `boot`, `shutdown`, `reboot`, then `wait` to confirm.
- `update` changes label/tags (and `watchdog_enabled` for instances,
  `status` for firewalls); `update_rules` replaces a firewall's whole rule
  set from the definition.
- `sync` refreshes state and marks `not_found` if the resource vanished.
- `list --input filter='{"tags":"prod"}'` writes per-item state plus a
  `listing` summary; check `truncated` before trusting `count`.

## Deleting

Instances and volumes are gated: `delete` needs both `id` and
`confirm_label` equal to the live label. Confirm the target with
`swamp model get`/`swamp data get` and show the user the id and label
before running it. Detach a volume before deleting it. Firewalls and SSH
keys delete by `id` alone. Deleting something already gone succeeds and
records `not_found`, so re-running teardown is safe.

## Diagnostics

Errors carry Linode's `reason` (and `field`) text, e.g.
`label: Label must be unique among your linodes`. 429s are retried with
`Retry-After`. After a failure inspect
`swamp report get @swamp/method-summary --model <name> --json`.
