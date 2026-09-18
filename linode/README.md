# @craftquest/linode

Provision and operate [Linode](https://www.linode.com) (Akamai Cloud) from
swamp: compute instances, Cloud Firewalls, Block Storage volumes, profile SSH
keys, and a regions/types/images catalog with pricing. Every resource is
addressed by its Linode **label**, state is stored per resource so workflows can
chain on it with CEL, and the destructive paths are hard to trip by accident.

Built and maintained by [CraftQuest](https://craftquest.io). Pure HTTPS against
`api.linode.com/v4` — no CLI or SDK dependency. The token comes from your swamp
vault (or `LINODE_TOKEN`) and is never stored in state.

## Prerequisites

- [swamp](https://github.com/swamp-club/swamp)
- A Linode account and a **personal access token** (Cloud Manager → Profile →
  API Tokens) with read/write on Linodes, Firewalls, Volumes, and your Profile
  (SSH keys). Images and regions need read-only.

## Install

```bash
swamp extension pull @craftquest/linode
```

## One-time setup

1. Store the token in a vault:

   ```bash
   swamp vault create local_encryption linode-secrets   # skip if it exists
   printf '%s' "<your token>" | swamp vault put linode-secrets LINODE_TOKEN
   ```

2. Copy the shipped instance definitions into your repo (edit inputs to taste):

   ```bash
   mkdir -p models/@craftquest/linode
   cp .swamp/pulled-extensions/@craftquest/linode/files/instances/*.yaml models/@craftquest/linode/
   swamp model validate ln-catalog
   ```

## Model types

| Type | Resources | Methods |
| --- | --- | --- |
| `@craftquest/linode/instances` | `state` (per label), `listing` | create, get, update, delete¹, sync, list, lookup, adopt, boot, shutdown, reboot, wait |
| `@craftquest/linode/firewalls` | `state`, `listing` | create, get, update, delete, sync, list, lookup, adopt, update_rules, list_devices, attach, detach |
| `@craftquest/linode/volumes` | `state`, `listing` | create, get, update, delete¹, sync, list, lookup, adopt, attach, detach, resize, wait |
| `@craftquest/linode/ssh_keys` | `state`, `listing` | create, get, update, delete, sync, list, lookup, adopt |
| `@craftquest/linode/catalog` | `regions`, `types`, `images` | list_regions, list_types, list_images |

¹ Confirmation-gated: `delete` requires `confirm_label` to equal the live label.

Every model runs two pre-flight checks before mutating methods: `linode-token`
(a token is wired) and `linode-auth` (labelled `live`; one `GET /profile`).
Skip the live one offline with `--skip-check-label live`.

## Provision a server

```bash
# What can I pick from?
swamp model method run ln-catalog list_regions
swamp model method run ln-catalog list_types --input filter='{"class":"nanode"}'
swamp model method run ln-catalog list_images --input filter='{"vendor":"Ubuntu"}'

# Firewall first (SSH, HTTP, HTTPS, ping in; everything out)
swamp model method run ln-firewall create --input label=web-fw

# Then the instance, keyed to your public key, attached to the firewall
swamp model method run ln-instance create \
  --input label=web-01 --input region=us-east --input type=g6-nanode-1 \
  --input 'authorized_keys:json=["ssh-ed25519 AAAA... you@example.com"]'
swamp model method run ln-firewall attach --input label=web-fw \
  --input linode_id=$(swamp data get ln-instance web-01 --json | jq .content.id)

# Wait for it to come up, then read the address
swamp model method run ln-instance wait --input label=web-01
swamp data get ln-instance web-01 --json | jq '.content.ipv4[0]'
```

`create` is idempotent: if a resource with that label already exists it is
adopted into state rather than duplicated. Existing infrastructure can be
imported with `lookup` (by label) or `adopt` (by ID, optionally asserting the
label).

## In a workflow

```yaml
steps:
  - name: instance
    task:
      type: model_method
      modelIdOrName: ln-instance
      methodName: create
      inputs: { label: web-01, region: us-east }
  - name: ready
    dependsOn: [{ step: instance, condition: { type: succeeded } }]
    task:
      type: model_method
      modelIdOrName: ln-instance
      methodName: wait
      inputs: { label: web-01 }
  - name: protect
    dependsOn: [{ step: ready, condition: { type: succeeded } }]
    task:
      type: model_method
      modelIdOrName: ln-firewall
      methodName: attach
      inputs:
        label: web-fw
        linode_id: ${{ data.latest("ln-instance", "web-01").attributes.id }}
```

## Tearing down

```bash
# Instances and volumes: the label must be restated
swamp model method run ln-instance delete --input id=123 --input confirm_label=web-01
swamp model method run ln-volume detach --input label=data-01
swamp model method run ln-volume delete --input id=77 --input confirm_label=data-01

# Firewalls and SSH keys: by id
swamp model method run ln-firewall delete --input id=55
```

Deleting something that is already gone succeeds and records `status:
not_found`, so teardown workflows are safe to re-run.

## Block Storage

```bash
swamp model method run ln-volume create --input label=data-01 --input size=40 --input region=us-east
swamp model method run ln-volume attach --input label=data-01 --input linode_id=123
swamp model method run ln-volume wait   --input label=data-01          # status active
swamp data get ln-volume data-01 --json | jq .content.filesystemPath   # /dev/disk/by-id/...
swamp model method run ln-volume resize --input label=data-01 --input size=80
```

## Filtering lists

`list` methods accept Linode's `X-Filter` JSON as a string:

```bash
swamp model method run ln-instance list --input filter='{"tags":"prod"}'
swamp model method run ln-instance list --input filter='{"label":{"+contains":"web"}}'
```

Each list writes one `state` resource per item (named by label) plus a
`listing` summary with `count` and a `truncated` flag (true only if the
200-page safety cap was hit).

## State shape

State is a mapped, camelCase subset of the API object — `id`, `label`,
`status`, `region`, `type`, `ipv4`, `ipv6`, `tags`, `specs`, timestamps — not
the raw payload. Deleted or vanished resources are written as
`status: deleted` / `status: not_found` with `existed` and `deletedAt` or
`syncedAt`, so history stays honest. Nothing sensitive (tokens, root
passwords) is ever written to state.

## Notes

- Linode enforces unique labels for instances and firewalls; this extension
  leans on that for idempotency and name-based lookup.
- `user_data` is accepted as plain text and base64-encoded for the API.
- Rate limits: 429 responses are retried honouring `Retry-After`; 5xx once.
- Outbound SMTP ports are blocked by Linode on new accounts regardless of
  firewall rules.

## License

MIT — see LICENSE.md.
