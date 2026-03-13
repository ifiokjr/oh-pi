---
default: patch
---

Drop `bundledDependencies` and the `pi` resource manifest from the meta-package.

Pi loads each package with its own module root, so extensions nested inside a
meta-package's `node_modules/` cannot resolve peer-dep imports
(`@mariozechner/pi-coding-agent`, etc.). This caused commands like `/colony` and
`/loop` to silently fail to register.

Each sub-package (`@ifi/oh-pi-extensions`, `@ifi/oh-pi-ant-colony`, etc.) is
already a fully self-contained pi package with its own `pi` field. Users should
install them directly via `pi install npm:@ifi/oh-pi-<name>` so pi can load
extensions with correct module resolution.

The `@ifi/oh-pi` npm package remains as a convenience dependency that pulls all
sub-packages, but no longer declares pi resources itself.
