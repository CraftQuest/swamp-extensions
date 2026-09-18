# CraftQuest swamp extensions

Source for the [swamp](https://github.com/swamp-club/swamp) extensions
published on the swamp registry under the `@craftquest` collective, built
and maintained by [CraftQuest](https://craftquest.io).

| Extension | What it does | Install |
| --------- | ------------ | ------- |
| [`@craftquest/mux`](mux/) | Manage a Mux video library: assets, direct uploads, signed playback for members-only video, live streams, and Mux Data analytics — with confirmation-gated destructive operations and a bundled engagement report. | `swamp extension pull @craftquest/mux` |
| [`@craftquest/laravel-cloud`](laravel-cloud/) | Operate Laravel Cloud: apps, environments, deployments (with a bundled deploy→wait→migrate workflow), artisan commands, domains, databases, snapshots, caches, and object storage — env var values and connection credentials never stored, every delete confirmation-gated. | `swamp extension pull @craftquest/laravel-cloud` |
| [`@craftquest/linode`](linode/) | Provision and operate Linode (Akamai) infrastructure: compute instances with boot/shutdown/reboot/wait, Cloud Firewalls with rule and device management, Block Storage volumes with attach/detach/resize, profile SSH keys, and a regions/types/images catalog with pricing — label-addressed state, idempotent create and delete, confirmation-gated instance and volume deletes. | `swamp extension pull @craftquest/linode` |

Also published under `@craftquest` (source to be added here):
`@craftquest/craft-starter` (scaffold local Craft CMS 5 + DDEV projects)
and `@craftquest/craft-server` (provision Craft-ready Hetzner servers).

Each extension directory contains the exact files bundled at publish
time — the model, its tests, the manifest, the shipped instance
definition, and the agent skill — under the MIT license.
