---
default: minor
---

BREAKING CHANGE: `npx oh-pi` now launches an interactive installer by default.

The CLI entry point replaces the legacy config-wizard flow with a brand-new interactive installer that includes:

- **Custom multi-select extension picker** with `Space` to toggle individual items and `A` to select/deselect all. Default extensions are pre-selected.
- **Progress bars and loading indicators** during configuration backup, pi-coding-agent installation, and file writing.
- **Version comparison** showing the currently installed pi version versus the new oh-pi CLI version.
- **Markdown changelog display** rendered inline for all releases between the current and new version.
- `-y` / `--yes` flag for non-interactive/auto-install mode that bypasses the TUI and applies defaults immediately.

To keep the old behaviour pass `--yes`:

```bash
npx oh-pi --yes
```
