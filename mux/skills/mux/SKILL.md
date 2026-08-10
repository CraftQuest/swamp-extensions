---
name: mux
description: >
  Operate @craftquest/mux — manage a Mux video library (ingest, playback
  IDs, gated deletes), signed playback for members-only video, live
  streams, and Mux Data analytics. Use whenever the user asks to upload or
  ingest a video to Mux, list or sync their video library, get a playback
  or streaming URL, sign a private/members-only video URL, create or
  manage a live stream, check video analytics/views/errors, or delete a
  Mux asset. Triggers on "upload to mux", "add this video", "video
  library", "playback url", "signed url", "private video", "live stream",
  "stream key", "video analytics", "how many views", "delete the video".
---

# Operating @craftquest/mux

One model instance (`mux`) manages one Mux environment: assets, direct
uploads, playback IDs, signed playback, live streams, and analytics.
State lives in per-purpose resources — read them with
`swamp data get mux <name>` (`library`, `asset`, `upload`, `signing`,
`playbackToken`, `liveStreams`, `live`, `views`, `metrics`,
`playbackErrors`) instead of re-fetching from the API.

## Pre-flight (before any method)

1. Vault `mux-secrets` must contain `MUX_TOKEN_ID` and `MUX_TOKEN_SECRET` —
   verify with `swamp vault list-keys mux-secrets --json`. If missing, walk
   the user through the README's One-time setup (they create the token in
   the Mux dashboard; never ask them to paste secrets into chat — have them
   run the `swamp vault put` commands themselves).
2. The instance must validate: `swamp model validate mux`. If it doesn't
   exist, copy it from
   `.swamp/pulled-extensions/@craftquest/mux/files/instances/mux.yaml` into
   `models/@craftquest/mux/` (README Setup step 2).
3. The model's own `mux-auth` live check runs before every method and
   fails fast on bad credentials — a 401 there means vault wiring, not
   code.

## Library and ingest

- Answer questions about "what videos do we have" from state: run
  `sync_assets` once, then read `swamp data get mux library`. Re-sync when
  freshness matters or before any delete.
- Ingest from a URL Mux can fetch:
  `swamp model method run mux create_asset --input '{"video_url": "..."}'`,
  then `wait_asset_ready` with the new asset ID (re-run it if the 5-minute
  poll cap hits on a long video).
- Local files go via direct upload: `create_direct_upload`, give the user
  the PUT command from the README (`swamp data get mux upload` has the
  URL), then `check_upload` until it reports the created asset ID.
- For experiments always pass `test_mode: true` — free, watermarked,
  10-second cap, auto-deleted by Mux after 24h.

## Signed playback (members-only video)

- One signing key per environment: `create_signing_key` once. The private
  key goes straight to the vault — you will only ever see a vault
  reference in state, and you must never read or print it.
- Private video flow: `create_playback_id` with
  `playback_policy: "signed"` → `sign_playback_token` with that playback
  ID → give the user `signedUrl` from `swamp data get mux playbackToken`.
  The URL grants access until `expiresAt`; pick `token_ttl` to fit the use
  (default 1 hour).
- `audience` scopes the token: `video`, `thumbnail`, `gif`, `storyboard`,
  `drm`.

## Live streaming

- `create_live_stream` → give the user the `rtmpUrl` from
  `swamp data get mux live` and tell them the stream key is in their vault
  (`swamp vault list-keys mux-secrets` shows the entry; they paste its
  value into their encoder themselves — never print it for them).
- Status questions: `get_live_stream` or `sync_live_streams` (the catalog
  never holds stream keys).
- Ending a stream: `complete_live_stream`. While the stream is ACTIVELY
  broadcasting this is gated (see Safety below) — cutting off a live
  audience requires explicit confirmation.
- Leaked stream key: `reset_stream_key` (gated) rotates it instantly.
- Recordings become normal assets — they appear on the next `sync_assets`.

## Analytics

- Analytics need player beacons (Mux Player sends them automatically). If
  every pull returns zeros, say so — it usually means no instrumented
  player, not "no viewers".
- `get_video_views` (recent views), `get_metrics` (`metric_id` +
  optional `group_by` breakdown, e.g. `watch_time` by `video_title`),
  `list_playback_errors`. `timeframe` takes `7:days` / `24:hours` style
  values; `metric_filter` narrows (`video_id:...`, `country:US`).
- After any analytics pull, show the user the digest:
  `swamp report get @craftquest/mux-engagement --model mux --markdown`.

## Safety protocol (non-negotiable)

Four operations demand a confirmation argument that must EXACTLY equal the
target's real ID: `delete_asset` (`confirm_asset_id`),
`delete_live_stream` and `reset_stream_key` (`confirm_live_stream_id`),
`revoke_signing_key` (`confirm_signing_key_id`), plus
`complete_live_stream` while actively broadcasting.

- **Never infer, guess, or auto-fill a confirm value.** Read the real ID
  from state, show it to the user, and ask them to confirm THAT exact ID
  before you pass it. A refusal from the gate is the tool working — report
  it, don't work around it.
- Deletes also require the target to exist in the last-synced catalog —
  run `sync_assets` / `sync_live_streams` first.
- Deleting an asset destroys the video and every URL for it, permanently.
  Revoking the signing key kills every signed URL at once. Resetting a
  stream key kills the encoder's current key instantly.
- Never print: token values, stream keys, private keys, or any
  `vault read-secret` output. Signed playback URLs are fine to show — they
  are the deliverable — but note their expiry.

## Troubleshooting

- 401 on `mux-auth`: wrong or missing vault keys — re-check pre-flight 1.
- Method failed? Read the report before retrying:
  `swamp report get @swamp/method-summary --model mux --json`.
- A stale bundle after editing the model source: remove
  `.swamp/bundles/mux.ts.js` and re-run.
- `sync_assets` warns when a library exceeds the 100k page cap — the
  library resource is then explicitly incomplete.
