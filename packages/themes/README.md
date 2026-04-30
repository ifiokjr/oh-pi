# `@ifi/oh-pi-themes`

> 6 color themes for pi — pick one that fits your taste.

## Why use this?

Pi comes with a default theme, but your terminal environment may look better with a different palette. These themes change colors across the entire pi UI: editor, sidebar, footer, prompts, and tool output.

No configuration needed — just pick a theme and pi applies it instantly.

## Themes

| Theme | Vibe | Dominant colors |
| ----- | ---- | --------------- |
| `oh-p-dark` | First-party dark | Cyan accents, purple highlights |
| `cyberpunk` | Neon terminal | Magenta, electric cyan, dark background |
| `nord` | Arctic calm | Cool blues, muted grays |
| `catppuccin-mocha` | Cozy pastel | Lavender, peach, teal on dark |
| `tokyo-night` | Twilight city | Blue, purple, soft contrast |
| `gruvbox-dark` | Warm retro | Earthy reds, warm yellows, beige |

## Installation

```bash
pi install npm:@ifi/oh-pi-themes
```

> Installed by default with `npx @ifi/oh-pi`.

## Switching themes

Once installed, switch themes directly in pi:

```text
/theme oh-p-dark
/theme cyberpunk
/theme nord
/theme catppuccin-mocha
/theme tokyo-night
/theme gruvbox-dark
```

Or configure in `~/.pi/agent/settings.json`:

```jsonc
{
  "theme": "cyberpunk"
}
```

## Package layout

```
themes/
├── oh-p-dark.json
├── cyberpunk.json
├── nord.json
├── catppuccin-mocha.json
├── tokyo-night.json
└── gruvbox-dark.json
```

Each theme is a JSON file pi discovers and loads automatically.

## Related

- Pi's built-in `/theme` command — switch themes without restarting
- `~/.pi/agent/settings.json` — persistent theme preference
