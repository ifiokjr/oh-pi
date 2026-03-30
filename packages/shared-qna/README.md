# @ifi/pi-shared-qna

Shared question-and-answer TUI helpers for pi extensions.

This package vendors the `shared/qna-tui.ts` component from
[`sids/pi-extensions`](https://github.com/sids/pi-extensions) into the oh-pi monorepo so other
first-party packages can reuse it without depending on third-party pi packages at runtime.

## Shared `pi-tui` loader

<!-- {=sharedQnaPiTuiLoaderOverview} -->

`@ifi/pi-shared-qna` centralizes `@mariozechner/pi-tui` loading so first-party packages reuse one
fallback strategy instead of embedding Bun-global lookup logic in multiple runtime modules.

The shared loader tries the normal package resolution path first, then falls back to Bun global
install locations when a project is running outside a conventional dependency layout.

<!-- {/sharedQnaPiTuiLoaderOverview} -->

### `getPiTuiFallbackPaths(options?)`

<!-- {=sharedQnaGetPiTuiFallbackPathsDocs} -->

Return the ordered list of Bun global fallback paths to try for `@mariozechner/pi-tui`.

The list prefers an explicit `BUN_INSTALL` root when provided and always includes the default
`~/.bun/install/global/node_modules/@mariozechner/pi-tui` fallback without duplicates.

<!-- {/sharedQnaGetPiTuiFallbackPathsDocs} -->

### `requirePiTuiModule(options?)`

<!-- {=sharedQnaRequirePiTuiModuleDocs} -->

Load `@mariozechner/pi-tui` with a shared fallback strategy.

The loader first tries the normal package import path, then walks the Bun-global fallback list, and
finally throws a helpful error that names every checked location when none of them resolve.

<!-- {/sharedQnaRequirePiTuiModuleDocs} -->
