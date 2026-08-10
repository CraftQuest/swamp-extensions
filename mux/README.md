# @craftquest/mux

Manage a [Mux](https://mux.com) video library from swamp: sync your asset
catalog into queryable state, ingest videos from URLs or direct uploads, mint
playback IDs, and delete assets — behind a confirmation gate that makes "oops"
hard.

Built and maintained by [CraftQuest](https://craftquest.io). Pure HTTPS against
`api.mux.com` — no shell commands, no SDK dependency. Credentials come from your
swamp vault and are never accepted as plain inputs.

## Prerequisites

- [swamp](https://github.com/swamp-club/swamp) — free, open source, no account
  needed
- A Mux account and an **access token** (Settings → Access Tokens) with Mux
  Video read/write permission, created in the Mux _environment_ you want to
  manage
- A swamp vault holding the token pair

## Install

```bash
swamp extension pull @craftquest/mux
```

## One-time setup

1. Store the Mux token pair in a vault (create one if needed):

   ```bash
   swamp vault create local_encryption mux-secrets   # skip if it exists
   printf '%s' "<your token id>"     | swamp vault put mux-secrets MUX_TOKEN_ID
   printf '%s' "<your token secret>" | swamp vault put mux-secrets MUX_TOKEN_SECRET
   ```

2. Copy the shipped instance definition into your repo:

   ```bash
   mkdir -p "models/@craftquest/mux"
   cp ".swamp/pulled-extensions/@craftquest/mux/files/instances/mux.yaml" \
      "models/@craftquest/mux/"
   swamp model validate mux
   ```

   Using a different vault or key names? Edit the two `vault.get(...)` lines in
   the copied instance.

## Methods

| Method                 | What it does                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync_assets`          | Pull the full asset catalog into the `library` resource (paginates to completion, up to 100k assets — a warning is logged if your library is larger) |
| `get_asset`            | Fetch one asset's detail (`asset_id`) into the `asset` resource                                                                                      |
| `create_asset`         | Ingest a video from a URL (`video_url`); Mux fetches it                                                                                              |
| `create_direct_upload` | Mint an upload URL; you PUT the file to it                                                                                                           |
| `check_upload`         | Refresh the upload's status and resulting asset ID                                                                                                   |
| `wait_asset_ready`     | Poll an asset until `ready` or `errored` (5 min cap per run)                                                                                         |
| `create_playback_id`   | Add a `public`, `signed`, or `drm` playback ID to an asset                                                                                           |
| `delete_playback_id`   | Remove a playback ID (breaks URLs that use it)                                                                                                       |
| `delete_asset`         | Permanently delete an asset — see the gate below                                                                                                     |
| `create_signing_key`   | Create the signing key for signed playback (private key goes straight to your vault)                                                                 |
| `sign_playback_token`  | Mint a short-lived signed token + ready-to-use URL for a `signed` playback ID                                                                        |
| `revoke_signing_key`   | Revoke the signing key — gated, breaks every URL signed with it                                                                                      |
| `create_live_stream`   | Create a live stream (stream key goes to your vault; recordings inherit the playback policy)                                                         |
| `sync_live_streams`    | Sync the live-stream catalog (never stores stream keys)                                                                                              |
| `get_live_stream`      | Fetch one live stream's detail (`live_stream_id`) into the `live` resource                                                                           |
| `complete_live_stream` | Signal end-of-stream — finalizes the recording; gated only while actively broadcasting                                                               |
| `reset_stream_key`     | Rotate a stream key — gated, the old key dies immediately                                                                                            |
| `delete_live_stream`   | Permanently delete a live stream — gated like `delete_asset` (recordings survive)                                                                    |
| `get_video_views`      | Pull the most recent video views (Mux Data) into the `views` resource                                                                                |
| `get_metrics`          | Pull a metric's overall value, plus a breakdown when `group_by` is set                                                                               |
| `list_playback_errors` | Pull distinct playback errors into the `playbackErrors` resource                                                                                     |

Example — ingest and wait:

```bash
swamp model method run mux create_asset \
  --input '{"video_url": "https://example.com/video.mp4"}'
swamp model method run mux wait_asset_ready \
  --input '{"asset_id": "<id from the asset resource>"}'
```

Check what you have:

```bash
swamp data get mux library
swamp data get mux asset
```

## The delete gate

`delete_asset` refuses to run unless **both** hold:

1. `confirm_asset_id` exactly equals `asset_id` — you re-state what you're
   deleting.
2. The asset exists in the last-synced `library` — deletes are only allowed
   against known state, never against a guessed or mistyped ID.

There is no bulk delete. Deleting a Mux asset destroys the video and every
playback URL for it, permanently.

## Direct uploads

`create_direct_upload` returns a URL in the `upload` resource; upload with:

```bash
curl -X PUT --upload-file video.mp4 "<url from swamp data get mux upload>"
swamp model method run mux check_upload
```

The URL expires (default 1 hour) and the model never streams file bytes itself —
big files go straight from your machine to Mux.

## Signed playback (private video)

Public playback IDs work for anyone with the URL. For members-only or paid
content, use `signed` playback — URLs only work with a valid, short-lived token:

```bash
# One-time: create the signing key (the private key is stored in your
# vault automatically; you never see or handle it)
swamp model method run mux create_signing_key

# Give the asset a signed playback ID instead of (or alongside) a public one
swamp model method run mux create_playback_id \
  --input '{"asset_id": "<asset id>", "playback_policy": "signed"}'

# Mint a token + signed URL (default: video access, 1 hour)
swamp model method run mux sign_playback_token \
  --input '{"playback_id": "<signed playback id>", "token_ttl": 3600}'
swamp data get mux playbackToken   # token, expiry, and the ready-to-use URL
```

`audience` controls what the token grants: `video` (default), `thumbnail`,
`gif`, `storyboard`, or `drm`. Tokens are signed locally (RS256 via Web Crypto —
no extra dependencies) and never logged.

Revoking is gated like deletes: `revoke_signing_key` requires
`confirm_signing_key_id` to exactly match the stored key ID, because revocation
instantly kills every URL signed with that key.

## Live streaming

```bash
# Create a stream (defaults: public playback, standard latency, 60s reconnect window)
swamp model method run mux create_live_stream

# The ingest endpoint is in plain state; the stream key is in your vault
swamp data get mux live   # rtmpUrl, playback URL, status — streamKey is a vault reference
```

Point your encoder (OBS etc.) at the `rtmpUrl` with the stream key, and viewers
at the playback URL. When you're done broadcasting:

```bash
swamp model method run mux complete_live_stream --input '{"live_stream_id": "<id>"}'
```

The recording lands as a normal asset (visible on the next `sync_assets`), with
the same playback policy as the stream.

Three operations check `confirm_live_stream_id` against the exact stream ID:
`reset_stream_key` (rotate a leaked key — the old one dies immediately),
`delete_live_stream` (which also requires the stream to be in the synced
catalog; recorded assets are never deleted with it), and `complete_live_stream`
— but only while the stream is **actively broadcasting**, since ending a live
broadcast cuts off viewers. Completing an idle stream needs no ceremony.

Use `test_mode: true` for free experiments (max 5 minutes, auto-deleted).

## Analytics (Mux Data)

Mux Data tracks how your videos actually perform for viewers — but only when
your player reports beacons (Mux Player does automatically; other players via
the Mux Data SDKs). Once it's flowing:

```bash
# Recent views (default window: 7 days)
swamp model method run mux get_video_views

# A metric, broken down by title
swamp model method run mux get_metrics \
  --input '{"metric_id": "watch_time", "group_by": "video_title"}'

# What's failing for viewers
swamp model method run mux list_playback_errors --input '{"timeframe": "24:hours"}'
```

Useful `metric_id` values: `views`, `watch_time`, `viewer_experience_score`,
`playback_failure_percentage`, `video_startup_time`. `timeframe` takes
`<n>:days` or `<n>:hours`; `metric_filter` narrows to e.g. `video_id:abc123` or
`country:US`.

The bundled **`@craftquest/mux-engagement` report** turns any analytics pull
into a readable digest — total views and watch time, most-watched titles, metric
breakdowns, and playback errors:

```bash
swamp report get @craftquest/mux-engagement --model mux
```

## Multiple Mux environments

One model instance manages one Mux environment (the environment your token was
created in). For dev + production, make two copies of the instance with distinct
names and vault keys:

```bash
cp "models/@craftquest/mux/mux.yaml" "models/@craftquest/mux/mux-prod.yaml"
# in mux-prod.yaml: change `name: mux` to `name: mux-prod`, give it a new
# `id` (any UUID), and point the two vault.get(...) lines at prod keys,
# e.g. MUX_PROD_TOKEN_ID / MUX_PROD_TOKEN_SECRET
printf '%s' "<prod token id>"     | swamp vault put mux-secrets MUX_PROD_TOKEN_ID
printf '%s' "<prod token secret>" | swamp vault put mux-secrets MUX_PROD_TOKEN_SECRET
```

Each instance keeps fully independent state (`swamp data get mux-prod library`),
so syncs, uploads, and the delete gate never cross environments.

## A note on state shape

The `asset` and `upload` resources hold the _most recently touched_ item — a
convenience for interactive and agent-driven use. The full catalog lives in
`library` (refresh with `sync_assets`). If you're doing bulk programmatic
management, treat `library` as the source of truth rather than `asset`.

## Costs and test mode

Mux bills for encoding, storage, and streaming. For experiments, pass
`test_mode: true` — test assets are free, watermarked, capped at 10 seconds, and
auto-deleted by Mux after 24 hours.

## License

MIT — see LICENSE.md.
