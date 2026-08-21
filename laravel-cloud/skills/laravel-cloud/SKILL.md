---
name: laravel-cloud
description: >
  Operate @craftquest/laravel-cloud — manage Laravel Cloud applications,
  environments, deployments, artisan commands, domains, database clusters,
  snapshots and restores, caches, and object storage. Use whenever the user
  asks to deploy a Laravel Cloud app, check what's deployed, run an artisan
  command, manage environment variables, start/stop an environment, manage
  a Laravel Cloud database/snapshot/cache/bucket, or delete Laravel Cloud
  resources. Triggers on "laravel cloud", "deploy the app", "what's
  deployed", "run artisan", "env vars", "stop the environment", "database
  snapshot", "restore the database", "bucket key".
---

# Operating @craftquest/laravel-cloud

Three model instances cover one Laravel Cloud organization: `lc-apps`
(applications, environments, deployments, commands, domains), `lc-data`
(database clusters, databases, snapshots/restores, caches, object
storage), and `lc-queues` (instances, managed queues, failed jobs,
background processes).
State lives in per-purpose resources — read with
`swamp data get lc-apps <name>` (`apps`, `app`, `environment`,
`deployment`, `deploymentLogs`, `commandRun`, `domains`, `domain`,
`deployments`, `commands`, `environmentLogs`, `environmentMetrics`,
`organization`, `regions`, `usage`),
`swamp data get lc-data <name>` (`clusters`, `cluster`, `databases`,
`snapshots`, `snapshot`, `schema`, `caches`, `cache`, `cacheTypes`,
`databaseTypes`, `buckets`, `bucket`, `bucketKeys`, `bucketKeyInfo`,
`clusterMetrics`, `cacheMetrics`), and
`swamp data get lc-queues <name>` (`instances`, `instance`,
`instanceSizes`, `failedJobs`, `processes`, `process`).

## Pre-flight (before any method)

1. Token resolution order: the vault-wired argument first, then the
   LARAVEL_CLOUD_TOKEN environment variable. For real setups, vault
   `laravel-cloud-secrets` must contain `LARAVEL_CLOUD_TOKEN` —
   verify with `swamp vault list-keys laravel-cloud-secrets --json`. If
   missing, the user creates a token in the Cloud UI (API tokens) and runs
   the `vault put` from the README themselves — never ask them to paste a
   token into chat.
2. Instances must validate: `swamp model validate lc-apps` (and `lc-data`
   if used). If absent, copy them from
   `.swamp/pulled-extensions/@craftquest/laravel-cloud/files/instances/`.
3. The `lc-auth` live check runs before every method — a 401 means vault
   wiring, not code.

## App operations

- Full deploy pipeline in one call: `swamp workflow run
  "@craftquest/deploy-laravel" --input '{"environment_id": "..."}'` —
  deploy → wait → migrate. With a managed queue, prefer
  `@craftquest/safe-deploy` (adds pause/resume around the deploy, and
  resumes the queue even on failure): pass environment_id +
  queue_instance_id. Prefer the workflows over hand-chaining methods.
- run_command (and the workflows' migrate step) FAILS on a nonzero exit
  code — the failed command's output is stored in commandRun first.

- "What apps / what's deployed?": `sync_apps`, then `get_app` for detail
  (includes the environment list), then read state — don't re-fetch.
- Deploy flow: `deploy` (deploys the environment's TRACKED branch — branch
  changes are an environment setting, not a deploy argument) →
  `wait_deployment` (15-min poll cap per run; re-run to keep waiting). On
  failure the error carries the failure reason and failed-step log tails;
  `get_deployment_logs` stores the full steps.
- Attach a database: `attach_database` (environmentId +
  databaseSchemaId) — get the schema ID from lc-data's `list_databases`,
  never guess it. Don't hand-build an `update_environment` payload for
  this. A successful attach shows up two ways: `environment.databaseSchemaId`
  in state, and the deploy command auto-uncommenting to
  `php artisan migrate --force`. `detach_database` is the reverse and is
  gated on confirmEnvironmentId — a live app loses its database instantly.
  Attach BEFORE the first deploy where migrations matter.
- Env vars: values are SECRETS. `get_environment` stores key names only.
  To set values, the user's values pass through the sensitive
  `env_variables` argument — never echo them back, never store them, and
  never read them out of the environment via run_command tricks
  (`php artisan tinker --execute='env(...)'`, `printenv`, `cat .env`).
- `stop_environment` requires `confirm_environment_id` unless the
  environment is ALREADY STOPPED — surface the real ID, ask the user to
  confirm it. Statuses are `deploying`, `running`, `hibernating`,
  `stopped`; a hibernating environment has merely scaled to zero and
  still wakes on request, so stopping it is an outage. Only starting, or
  stopping an already-stopped environment, needs nothing.

## run_command — the dangerous convenience

`run_command` executes anything artisan/shell can in the environment.
Protocol:

- **Never run data-destructive commands unless the user typed the exact
  command themselves**: `migrate:fresh`, `migrate:reset`, `migrate:rollback`,
  `db:wipe`, `cache:clear` on production during traffic, `queue:flush`, or
  any `rm`/redirect shell construct. "Run the migrations" means
  `php artisan migrate --force` — nothing stronger.
- Before schema-changing commands on production, offer to
  `create_snapshot` (lc-data) first.
- Never use run_command to print secrets (env vars, config values,
  database credentials). Command output is stored in plain state.
- **Failed commands email the organization's members.** Never run a
  command you expect to fail as a probe, and never retry a failing
  command in a loop — every failure lands in a human's inbox.

## Data operations

- Catalogs first: `sync_clusters` / `sync_caches` / `sync_buckets`, then
  read state. Connection credentials are never in state — only
  hostname/port. Don't try to obtain passwords; apps get them injected by
  the platform.
- Snapshot before risk: `create_snapshot` with a descriptive name
  (e.g. `pre-migration-2026-08-10`). Neon serverless clusters do NOT
  support snapshots — offer point-in-time restore (`restore_time`)
  instead and say why.
- `restore_database` creates a NEW CLUSTER from a snapshot or point in
  time — it never overwrites. It needs an explicit source: never guess a
  snapshot ID; list snapshots (or ask for a timestamp) and let the user
  pick. After a restore, run `sync_clusters` and tell the user to verify
  the new cluster in the Cloud UI (a platform issue can list it under
  its source's ID, making it unmanageable via API).
- Creating a cluster: most engines REQUIRE `cluster_config` (MySQL needs
  size/storage/is_public/uses_scheduled_snapshots/retention_days; Neon
  needs cu_min/cu_max). Run `list_database_types` first and build the
  config from that engine's `configSchema` in the `databaseTypes` state —
  required flags, valid size enums, and min/max bounds are all there.
  Never guess a size; create_cluster refuses up front when required
  fields are missing and names them.
- Cache sizes are engine-specific: run `list_cache_types` before
  `create_cache` and pick a size valid for the engine.
- Deletion ordering the platform enforces: bucket keys before buckets,
  database schemas before clusters. Do the inner deletes first.
- Bucket keys: `create_bucket_key` vaults the S3 pair automatically —
  never read or print it. `list_bucket_keys` is names-only. The initial
  key minted with a new bucket has its secret only in the Cloud UI.

## Safety protocol (non-negotiable)

Every delete demands a confirmation argument that must EXACTLY equal the
target's real ID (or name, for databases), and the target must exist in
synced/stored state: `delete_app`, `delete_environment`, `delete_domain`,
`delete_cluster`, `delete_database`, `delete_snapshot`, `delete_cache`,
`delete_bucket`, `delete_bucket_key` — plus `stop_environment` while
running.

- **Never infer, guess, or auto-fill a confirm value.** Read the real ID
  from state, show it, and get the user's explicit confirmation of THAT
  ID. A gate refusal is the tool working — report it, don't work around it.
- Deleting an app deletes every environment, deployment, and domain in
  it. Deleting a cluster deletes every database in it. Deleting a bucket
  key instantly breaks whatever uses it.
- Laravel Cloud resources BILL REAL MONEY. Confirm with the user before
  creating clusters, caches, or apps, and state the resource class you're
  about to create.

## Retrying a create that "failed"

A create method that reports an error may already have succeeded — the API
accepted it and the response was lost, or the failure came after the write.
Creates are not idempotent, and Laravel Cloud enforces unique names, so a
blind retry produces a 422 on the name rather than a second resource.

- **Re-read state before retrying any create.** `get_app` (environments),
  `sync_apps`, `sync_clusters`, `list_databases`, `sync_caches`,
  `sync_buckets` — then compare against what you meant to create. Only
  retry once you've confirmed it isn't there.
- **Don't filter method output down to a pass/fail signal.** Read the
  method's logs and the written resource; `--json` piped through a narrow
  `jq` filter can hide the ID of a resource that was in fact created. If
  you can't see what a method produced, `swamp data get` it rather than
  guessing.
- `create_environment` is retry-safe: it looks the name up first, and again
  after a 422, and adopts the existing environment. Its log says whether
  anything was created ("nothing was created" when it adopted one). Other
  creates have no such guard — check first.
- A 422 on a create is almost always "that name is taken", i.e. evidence
  the resource exists. Treat it as a signal to go look, not to retry.

## Queues and instances

- "The queue is stuck / runaway job": `pause_queue` FIRST (reversible,
  ungated, instant) — then diagnose with `list_failed_jobs`. Resume when
  fixed. Never reach for purge as a first move.
- `purge_queue` permanently discards every pending job — full delete-class
  gate (confirm + stored list). Never infer the confirmation.
- Failed jobs: `retry_failed_job` freely (jobs should be idempotent);
  `delete_failed_job` is gated — it destroys the evidence.
- **`list_failed_jobs` returning 0 does not mean nothing failed.** Laravel
  records failures in a `failed_jobs` TABLE, so an environment with no
  database attached loses them silently — jobs fail into the void and the
  queue looks healthy. Verified live: with `database.default` on sqlite and
  no cluster, repeated failures produced an empty list; attaching a cluster,
  redeploying and running `migrate` made the same job show up immediately.
  If a user reports "jobs disappear", check `get_environment` for an
  attached database before anything else.
- A managed queue only picks up the platform queue connection on a deploy
  that happens AFTER it exists. Create the queue, then redeploy, or jobs
  keep going to the previous connection (`config("queue.default")` reads
  `cloud` once it is wired).
- Managed-queue platform rules: scaling_type "none", scale-to-zero (no
  min_replicas), max 3 replicas, creation needs background_processes
  (e.g. [{"type": "worker", "processes": 1}]), and workers have exactly
  one process — scale replicas, not processes.
- Before create_instance, run `list_instance_sizes` (managed queues use
  the mq.* groups).
- **Background processes are NOT the same as that creation array, and do
  not work on managed queues** — the API answers "Background processes are
  not available for managed queues". They attach to `app`, `service` or
  `queue` instances (instance types are app|service|queue|managed_queue).
  `create_background_process` requires `config.connection` AND
  `config.queue`; the live-verified payload is
  `{"type":"worker","processes":1,"command":"php artisan queue:work",
  "config":{"connection":"sqs","queue":"default"}}`. Omitting config makes
  the API reject with an HTML redirect, so the error surfaces as
  "redirected (302) instead of returning JSON" — that means a malformed
  payload, not an outage. Send the full definition to
  `update_background_process` too, not just the changed field.

## Settings, history, and observability

- Change settings with the `update_*` methods: pass `update_payload` as a
  JSON object of the fields to change (e.g.
  `{"php_version": "8.4"}` on update_environment). Fields are in the
  Laravel Cloud API docs; the method logs which fields it changed.
- History: `list_deployments` / `list_commands`. Logs:
  `get_environment_logs` (defaults to the last hour; `log_query` /
  `log_type` / `log_from` / `log_to` to narrow). Metrics:
  `get_environment_metrics`, `get_cluster_metrics`, `get_cache_metrics` —
  summarized series (averages + point counts) land in state.
- Discovery before creates: `list_regions`, `list_database_types`,
  `list_cache_types`.

## Spend

- "What is this costing?": `get_usage` (optionally scoped by
  `environment_id`), then show the digest:
  `swamp report get @craftquest/laravel-cloud-usage --model lc-apps --markdown`.
  Surface the alert headroom if one is configured.

## Troubleshooting

- 401 on `lc-auth`: token missing/expired — re-check pre-flight 1. Tokens
  are org-scoped: the token decides which organization you operate on.
- Method failed? `swamp report get @swamp/method-summary --model lc-apps --json`
  (or `--model lc-data`) before retrying.
  A method can fail *after* the remote change landed — confirm the resource
  isn't already there before you retry (see "Retrying a create that 'failed'").
- Stale bundle after editing source: remove `.swamp/bundles/apps.ts.js` /
  `.swamp/bundles/data.ts.js` and re-run.
- `create_app` 4xx about the repository usually means the git integration
  isn't connected in the Cloud UI — that's a one-time manual step.
