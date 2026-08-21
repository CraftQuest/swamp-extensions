# Run Laravel Cloud by talking to your AI agent

**The sample project:** deploy a Laravel app to Laravel Cloud, give it a
real database sized from the platform's own config catalog, a managed
queue with queue-safe deploys, snapshot the database before a migration,
manage its env vars, check the bill, stop and restart the site, and tear
it all down — **without typing a single API call**. You
talk; your agent drives `@craftquest/laravel-cloud`, a published,
inspectable [swamp](https://github.com/swamp-club/swamp) extension whose
safety gates hold no matter who's driving. About 15 minutes; costs cents;
every destructive step requires your explicit confirmation.

This isn't "AI, wing it and hope." The extension ships a *skill* — an
operating manual your agent follows — plus typed state records it
consults instead of guessing, and confirmation gates it cannot bypass.
The sentence is the interface; the toolbox is the trust.

## Prerequisites

- A [Laravel Cloud](https://cloud.laravel.com) organization with the git
  integration connected (Cloud UI, one-time), and an **API token**
  (Cloud UI → API tokens)
- A Laravel repo the integration can see (the skeleton is fine; add
  `aws/aws-sdk-php` to composer.json if you'll use a managed queue)
- swamp installed (free, no account)
- An AI agent that reads skills: Claude Code, Cursor, Codex, opencode,
  or Kiro

## Setup (once, ~2 minutes)

```bash
mkdir ~/cloud-toolbox && cd ~/cloud-toolbox && swamp repo init
swamp extension pull @craftquest/laravel-cloud

swamp vault create local_encryption laravel-cloud-secrets
printf '%s' "<your api token>" | swamp vault put laravel-cloud-secrets LARAVEL_CLOUD_TOKEN

mkdir -p "models/@craftquest/laravel-cloud"
cp ".swamp/pulled-extensions/@craftquest/laravel-cloud/files/instances/"*.yaml \
   "models/@craftquest/laravel-cloud/"
```

Three things just happened: your token went into an encrypted local vault
(you run that command yourself — a well-behaved agent will never ask you
to paste a token into chat); the instance files — *your* editable
configuration — moved into your repo; and, quietly, **the extension
taught your agent how to use it**: a `laravel-cloud` skill landed in your
agent's skill directory. That last part is the whole tutorial.

Now open your agent in the toolbox. Everything from here is
conversation.

## 1. "Deploy the acme/my-laravel-app repo on Laravel Cloud"

Your agent creates the application, discovers the `production`
environment Laravel Cloud started for it, and runs the bundled
`@craftquest/deploy-laravel` pipeline: deploy the tracked branch, follow
the build to completion, run the migrations. Then it hands you the URL.

Under the hood that was one workflow run — and if the build fails, the
agent shows you the failing step's log tail, because the pipeline
surfaces it in the error. (Real example: deploy an app with a managed
queue but without `aws/aws-sdk-php`, and the failure message names the
exact composer command to run.)

## 2. "Give it a MySQL database and attach it"

The agent doesn't guess at cluster settings — it can't. It runs
`list_database_types` first, and the stored catalog carries each
engine's **`configSchema`**: which config fields are required, the valid
size enum, and the numeric bounds. For `laravel_mysql_84` that means
five required fields — `size` (from `mysql-flex-512mb` up to
`mysql-pro-32gb`), `storage` (5–1000 GB), `is_public`,
`uses_scheduled_snapshots`, and `retention_days` (0–30) — so the agent
proposes a concrete `clusterConfig` built from that schema, states that
a database cluster bills real money, and asks before creating.

Skip the discovery and the tool catches it: `create_cluster` refuses
**before** any API call when required config fields are missing, and
the refusal names each field with its valid values. No guessing sizes
into 422s — the guard is in the tool, not the prompt.

Then the agent creates a schema in the cluster and runs
`attach_database` on the environment — do this before the first deploy
where migrations matter. A successful attach shows up as
`databaseSchemaId` in the environment state, and Laravel Cloud injects
the connection credentials itself; they never pass through swamp, your
agent, or this conversation.

## 3. "Add a managed queue and redeploy the queue-safe way"

The agent creates a scale-to-zero managed queue (it knows the platform's
rules — sizing groups, worker limits — from the skill and the
`list_instance_sizes` discovery method), then switches your deploys to
`@craftquest/safe-deploy`: **pause the queue** so no worker processes
jobs mid-migration → deploy → migrate → **resume**. If anything fails, a
cleanup job resumes the queue anyway — nobody's queue gets left paused
by a bad deploy.

Before a migration that changes schema, try *"snapshot the database
first."* The agent takes a named snapshot and only then deploys — and
if you ever need it back, `restore_database` builds a **new** cluster
from that snapshot. It never overwrites the one you're running on, so
"restore" can't itself become the outage.

## 4. "Set APP_TIMEZONE to America/Chicago on production"

Done — and here's the part worth noticing: ask your agent *"what env
vars does production have?"* and it answers with **key names only**.
Values never enter swamp's records, logs, or the conversation. The skill
also forbids the agent from fishing values out via artisan tricks. Your
secrets stay on the platform.

## 5. "What's Laravel Cloud costing me?"

The agent pulls the usage summary and shows you the bundled spend
report: current spend, credit balance, alert headroom, per-app cost
tables. For this tutorial the answer is: cents, probably covered
entirely by the platform's starting credits.

## 6. "Stop the environment for the night"

Cheaper than deleting, and it shows the gates working on something
reversible. The agent checks the environment's real status first, and
because stopping it takes the site offline, it has to surface the ID and
get your confirmation.

The detail worth knowing: Laravel Cloud environments can be `running`,
`hibernating`, `deploying`, or `stopped` — and **hibernating is not
off**. It has scaled to zero to save money but still wakes on the next
request, so stopping it is just as much an outage as stopping a busy
one. The tool gates every state except `stopped`, where stopping changes
nothing and needs no ceremony. An unfamiliar status gets gated too,
rather than assumed safe.

Say *"start it back up"* and it returns — no confirmation needed, because
starting can't take anything down.

## 7. "Delete the app" — and watch what the agent *can't* do

Here's the trust story. The agent won't just do it: it reads the app's
real ID from the synced records, shows it to you, and asks you to
confirm **that exact ID** — because the tool itself refuses anything
else. Every destructive method demands the ID re-stated *and* verifies
the target exists in synced state. A guessed, inferred, or mistyped ID
deletes nothing. The guardrails are in the tool, not in the prompt — the
same gates hold for you, for CI, and for any agent.

## 8. "Tear it all down so nothing is billing"

The agent deletes inner resources before outer ones (the platform
enforces the order), then sweeps every catalog — apps, clusters, caches,
buckets — and reports each at zero. Ask for the spend report again to
see the flatline.

## Why this works

- **The skill** — the extension ships its own operating manual: method
  protocols, triage orders (pause a stuck queue *before* diagnosing),
  and hard rules (never infer a confirmation; never run destructive
  artisan unless you typed it; failed commands email real humans, so no
  failure probes).
- **The records** — every run writes typed state (`swamp data get
  lc-apps deployment`), so the agent answers from what actually happened
  instead of re-fetching or guessing.
- **The gates** — destruction requires exact-ID confirmation checked
  against real state, in the tool itself. They're written to fail toward
  refusing: a status the tool doesn't recognize gets confirmation asked
  for, not waved through.
- **The workflows** — one intent maps to one tested pipeline, failure
  handling included, instead of an agent improvising step chains.

## Appendix: the same project as commands

Everything above is equally scriptable — CI pipelines use the identical
interface:

```bash
swamp model method run lc-apps create_app \
  --input '{"app_name": "my-app", "repository": "acme/my-laravel-app"}'
swamp model method run lc-data list_database_types   # configSchema lands in state
swamp model method run lc-data create_cluster \
  --input '{"cluster_name": "my-db", "database_type": "laravel_mysql_84",
            "cluster_config": "{\"size\": \"mysql-flex-512mb\", \"storage\": 5, \"is_public\": false, \"uses_scheduled_snapshots\": true, \"retention_days\": 7}"}'
swamp model method run lc-data create_database \
  --input '{"cluster_id": "<cluster id>", "database_name": "my_app"}'
swamp model method run lc-apps attach_database \
  --input '{"environment_id": "<env id>", "database_schema_id": "<schema id from lc-data list_databases>"}'
swamp workflow run "@craftquest/safe-deploy" \
  --input '{"environment_id": "<env id>", "queue_instance_id": "<queue id>"}'
swamp model method run lc-apps get_usage
swamp report get @craftquest/laravel-cloud-usage --model lc-apps --markdown
swamp model method run lc-apps stop_environment \
  --input '{"environment_id": "<env id>", "confirm_environment_id": "<env id>"}'
swamp model method run lc-apps delete_app \
  --input '{"app_id": "<app id>", "confirm_app_id": "<app id>"}'
```

The full method reference:
`swamp model type describe "@craftquest/laravel-cloud/apps" --json` (and
`/data`, `/queues`). To build your own pipelines, copy the shipped
`workflow-template.yaml` — the README's Workflows section covers the two
authoring rules.
