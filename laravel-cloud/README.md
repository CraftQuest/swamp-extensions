# @craftquest/laravel-cloud

Operate [Laravel Cloud](https://cloud.laravel.com) from swamp: sync your
application catalog, manage environments and their variables, deploy and follow
deployments to completion, run artisan commands, and manage custom domains —
with every destructive operation behind a confirmation gate.

Built and maintained by [CraftQuest](https://craftquest.io). Pure HTTPS against
`cloud.laravel.com/api` — no shell commands, no SDK. The API token comes from
your swamp vault and is never accepted as a plain input.

## Prerequisites

- [swamp](https://github.com/swamp-club/swamp) — free, open source
- A Laravel Cloud organization and an **API token** (Cloud UI → API tokens).
  Tokens are org-scoped.
- For `create_app`: the git integration (GitHub/GitLab/Bitbucket) already
  connected in the Cloud UI — the API cannot do OAuth for you.

## Install

New to swamp? It's a local automation runtime — think "Composer, but for
automation": you pull tools from a registry and run them locally, and every run
leaves typed records you can query. All swamp state lives in a repository
directory, so first make yourself a toolbox (once, ever), then pull the
extension into it:

```bash
mkdir ~/cloud-toolbox && cd ~/cloud-toolbox && swamp repo init
swamp extension pull @craftquest/laravel-cloud
```

Your Laravel apps don't live here — only the machinery does.

**New here? Start with the [agent-first tutorial](TUTORIAL.md)** — deploy, operate, and tear down a real app by conversation.

## Use it by talking to your AI agent

This is the primary interface. The pull just installed a `laravel-cloud` skill
into your agent's skill directory (Claude Code, Cursor, Codex, opencode, and
Kiro are all supported) — it teaches the agent every method, every protocol, and
every rule it must not break. Open your agent in this toolbox and use plain
language:

> "Deploy the CraftQuest/laravel-habits repo on Laravel Cloud"
>
> "What's Laravel Cloud costing me?"
>
> "The queue looks stuck — what's going on?"
>
> "Set APP_TIMEZONE to America/Chicago on production"
>
> "Tear it down so nothing is billing"

The agent runs the same models and workflows documented below — the sentence and
the command are the same tool. The skill also enforces the safety protocol:
before anything destructive, the agent must surface the real resource ID and get
your confirmation, because the confirmation gates in the tool refuse anything
else. Env var values and connection credentials never pass through the agent's
output — the same stripping that protects the CLI protects the conversation.

## Quick start (zero setup, no agent)

Want to explore before configuring anything? Export your token and run any
method with the `@type` prefix — swamp creates a definition on the fly:

```bash
export LARAVEL_CLOUD_TOKEN="<your api token>"
swamp model method run "@craftquest/laravel-cloud/apps" sync_apps my-org
swamp data get my-org apps
```

Inputs on these on-the-fly definitions use the model's camelCase argument names
(`appId`, `environmentId`, ...). Graduate to the setup below when you want the
vault holding your token instead of your shell, snake_case inputs, more than one
organization — or the bundled workflows, which drive the named instances that
setup creates.

## Recommended setup

1. Store the token:

   ```bash
   swamp vault create local_encryption laravel-cloud-secrets   # skip if it exists
   printf '%s' "<your api token>" | swamp vault put laravel-cloud-secrets LARAVEL_CLOUD_TOKEN
   ```

2. Copy the shipped instances into your repo (skip `lc-data`/`lc-queues` if you
   don't need them):

   ```bash
   mkdir -p "models/@craftquest/laravel-cloud"
   cp ".swamp/pulled-extensions/@craftquest/laravel-cloud/files/instances/"*.yaml \
      "models/@craftquest/laravel-cloud/"
   swamp model validate lc-apps
   swamp model validate lc-data
   ```

Why the copy? swamp separates published _types_ (the machinery) from _instances_
(your configuration — vault wiring, input names). The instance files are yours
to edit, so the pull doesn't write them into your repo for you. Managing more
than one organization? Copy the instance again with a new `name`, a new `id`
(any UUID), and a different vault key.

## Methods (apps model)

| Method                                                               | What it does                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `sync_apps`                                                          | Sync the org's application catalog (paginates to completion)                          |
| `get_app`                                                            | Fetch one app + its environment list (`app_id`)                                       |
| `create_app`                                                         | Create an app from a connected repository                                             |
| `delete_app`                                                         | Delete an app and everything in it — double-gated                                     |
| `get_environment`                                                    | Fetch environment detail — env var **key names only**, never values                   |
| `create_environment`                                                 | Create an environment tracking a branch                                               |
| `delete_environment`                                                 | Double-gated (confirm + present in stored app detail)                                 |
| `start_environment`                                                  | Start a stopped environment                                                           |
| `stop_environment`                                                   | Gated **only while running** — stopping a live site needs confirmation                |
| `set_env_variables`                                                  | Add/update env vars (values via a sensitive argument, never stored or logged)         |
| `delete_env_variables`                                               | Delete env vars by key name                                                           |
| `purge_edge_cache`                                                   | Purge the environment's edge cache                                                    |
| `deploy`                                                             | Initiate a deployment of the tracked branch                                           |
| `wait_deployment`                                                    | Follow a deployment to success, or fail with the reason + failed-step log tail        |
| `get_deployment_logs`                                                | Store build/deploy step logs                                                          |
| `run_command`                                                        | Run a shell/artisan command and wait for output (exit code + truncated output stored) |
| `get_domains` / `create_domain` / `verify_domain` / `delete_domain`  | Custom domain management (delete gated)                                               |
| `update_app` / `update_environment` / `update_domain` / `get_domain` | Update settings via an `update_payload` JSON object (e.g. php_version, build_command) |
| `list_deployments` / `list_commands`                                 | Deployment and command history for an environment                                     |
| `get_environment_logs`                                               | Recent logs (query/type filters; defaults to the last hour)                           |
| `get_environment_metrics`                                            | CPU/memory/requests/replica metrics snapshot                                          |
| `upload_avatar` / `delete_avatar`                                    | Application avatar management                                                         |
| `get_organization` / `list_regions`                                  | Org identity and available regions                                                    |

Example — deploy and follow:

```bash
swamp model method run lc-apps deploy --input '{"environment_id": "<env id>"}'
swamp model method run lc-apps wait_deployment
swamp data get lc-apps deployment
```

Run a migration (safe commands only — see the safety note):

```bash
swamp model method run lc-apps run_command \
  --input '{"environment_id": "<env id>", "command": "php artisan migrate --force"}'
swamp data get lc-apps commandRun
```

## Methods (data model)

| Method                                                            | What it does                                                                                                   |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `sync_clusters` / `get_cluster`                                   | Cluster catalog + detail — hostname/port only, **never credentials**                                           |
| `create_cluster` / `delete_cluster`                               | Create (engine + optional JSON config) / double-gated delete                                                   |
| `list_databases` / `create_database` / `delete_database`          | Databases within a cluster (delete double-gated by name)                                                       |
| `list_snapshots` / `create_snapshot` / `delete_snapshot`          | Snapshots (delete gated). Neon serverless clusters don't support snapshots — use point-in-time restore instead |
| `restore_database`                                                | Restore into a **new cluster** from a snapshot or point in time — never overwrites                             |
| `list_cache_types`                                                | Valid cache engines + sizes + regions — sizes are engine-specific, check first                                 |
| `sync_caches` / `get_cache` / `create_cache` / `delete_cache`     | Caches (credentials stripped; delete double-gated)                                                             |
| `sync_buckets` / `get_bucket` / `create_bucket` / `delete_bucket` | Object storage buckets (delete double-gated)                                                                   |
| `list_bucket_keys` / `create_bucket_key` / `delete_bucket_key`    | S3-style access keys — created pairs go straight to your vault; listings are names-only                        |

Example — snapshot before a migration:

```bash
swamp model method run lc-data create_snapshot \
  --input '{"cluster_id": "<cluster id>", "snapshot_name": "pre-migration-2026-08-10"}'
```

The bundled **`@craftquest/laravel-cloud-usage` report** turns any `get_usage`
pull into a spend digest — headline spend, credit and alert headroom, and
per-application/resource/add-on cost tables:

```bash
swamp model method run lc-apps get_usage
swamp report get @craftquest/laravel-cloud-usage --model lc-apps --markdown
```

## Methods (queues model)

| Method                                                                                                                | What it does                                                                |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `list_instances` / `get_instance` / `list_instance_sizes`                                                             | Compute/queue instances of an environment; valid sizes by group             |
| `create_instance` / `update_instance` / `delete_instance`                                                             | Create (JSON `create_payload`) / update / double-gated delete               |
| `pause_queue` / `resume_queue`                                                                                        | Reversible, ungated — pausing is the safe emergency action                  |
| `purge_queue`                                                                                                         | Permanently discards ALL pending jobs — gated like a delete                 |
| `set_default_queue`                                                                                                   | Make a managed queue the default (idempotent)                               |
| `list_failed_jobs` / `retry_failed_job` / `delete_failed_job`                                                         | Failed-job triage: list (exceptions truncated), ungated retry, gated delete |
| `list_background_processes` / `create_background_process` / `update_background_process` / `delete_background_process` | Worker/daemon processes on an instance (delete gated)                       |

Managed-queue rules the platform enforces (live-verified): `scaling_type` must
be `none` (they scale to zero when idle — no `min_replicas`), at most 3 worker
replicas, creation requires a `background_processes` array (e.g.
`[{"type": "worker", "processes": 1}]`), and managed-queue workers always have
exactly one process — scale with replicas, not processes.

## State: every run leaves records

Each method writes typed resources you can read back — that's how you (and your
AI agent, and your workflows) answer questions without re-fetching:

```bash
swamp data get lc-apps apps          # the synced app catalog
swamp data get lc-apps deployment    # the last deployment you touched
swamp data get lc-data clusters      # the synced cluster catalog
swamp data get lc-queues failedJobs  # the failed jobs you just listed
```

Workflows and other models reference these records with CEL expressions — e.g.
`data.latest("lc-apps", "deployment").attributes.status` — which is how tools
compose without re-entering configuration.

## Understanding the extension

The full API of each model — every method, argument, and stored resource, with
descriptions — is one command away:

```bash
swamp model type describe "@craftquest/laravel-cloud/apps" --json
swamp model type describe "@craftquest/laravel-cloud/data" --json
swamp model type describe "@craftquest/laravel-cloud/queues" --json
```

## Workflows

The extension ships two ready-made pipelines. `@craftquest/deploy-laravel`:
deploy the environment's tracked branch → follow the deployment to completion
(failing loudly with the reason and log tail) → run the migrations. One command:

```bash
swamp workflow run "@craftquest/deploy-laravel" \
  --input '{"environment_id": "<env id>"}'
```

(`migrate_command` defaults to `php artisan migrate --force`.)

Building your own workflow on these models is plain YAML — each step calls one
model method:

```yaml
steps:
  - name: deploy
    task:
      type: model_method
      modelIdOrName: lc-apps
      methodName: deploy
      inputs:
        environment_id: ${{ inputs.environment_id }}
```

One swamp rule to know: because the shipped instances wire every input via
`${{ inputs.* }}`, a workflow that drives them must declare all of the
instance's inputs (with defaults) in its own `inputs:` block — copy the block
from the shipped `deploy-laravel.yaml` and adjust. Use the `swamp` skill or
`swamp workflow create` for guided authoring.

## Safety model

- **Deletes are double-gated**: the confirm argument must exactly equal the
  target ID, _and_ the target must exist in synced/stored state — a guessed or
  mistyped ID cannot delete anything.
- **`stop_environment` is gated only while the environment is running**, because
  stopping a live site takes it offline; stopping an idle one needs no ceremony.
- **Environment variable values never enter swamp state or logs.** GETs strip
  values (key names only are stored); sets pass values through a
  sensitive-marked argument.
- **`run_command` can do anything artisan can** — including destroy data
  (`migrate:fresh`, `db:wipe`). The bundled agent skill forbids AI agents from
  running destructive artisan commands unless you typed the command yourself.
- **Database and cache connection credentials never enter swamp state** — only
  hostnames and ports are stored. Apps get credentials injected by the platform;
  nothing here needs them.
- **Bucket access keys are vaulted automatically** on creation and never appear
  in listings, logs, or plain state.
- **Restores never overwrite**: `restore_database` creates a whole new cluster
  from the snapshot or point in time you name. (Known platform issue: the
  restored cluster can appear under its source's ID in API listings — verify it
  in the Cloud UI.)

## Platform behaviors worth knowing (found in live testing)

- Buckets refuse deletion while any access key is attached — delete keys first.
  The bucket-creation flow mints an initial key whose secret is only visible in
  the Cloud UI; use `create_bucket_key` when you need an API-managed pair (it
  lands in your vault automatically).
- Cache sizes are engine-specific (`laravel_valkey` wants `valkey-flex-*` or
  `valkey-pro.*`; `upstash_redis` wants `250mb`-style) — run `list_cache_types`
  before creating.
- Clusters refuse deletion while databases (schemas) exist — delete the schemas
  first. Schema deletion is routed by schema ID; the model resolves names to IDs
  from the synced list automatically.
- Neon serverless config requires `retention_days` (0-30) in `cluster_config`
  alongside `cu_min`/`cu_max`/`suspend_seconds`.

## Coverage

Everything in the Laravel Cloud API except these deferred domains: WebSockets,
usage, and dedicated clusters (plus the legacy Databases endpoints, superseded
by clusters).

## License

MIT — see LICENSE.md.
