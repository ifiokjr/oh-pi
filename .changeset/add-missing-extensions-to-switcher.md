---
default: patch
---

Add missing extension packages to the `pi:local` source switcher.

`@ifi/pi-bash-live-view`, `@ifi/pi-pretty`, `@ifi/pi-remote-tailscale`, and
`@ifi/pi-analytics-extension` are now included in `SWITCHER_PACKAGES` so that
`pnpm pi:local` points them at the local workspace sources along with every
other oh-pi extension.
