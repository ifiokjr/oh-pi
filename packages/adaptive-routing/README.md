# @ifi/pi-extension-adaptive-routing

Optional adaptive routing package for pi.

## Install

```bash
pi install npm:@ifi/pi-extension-adaptive-routing
```

This package is intentionally separate from `@ifi/oh-pi` so users can opt into routing behavior explicitly.

## What it does

- adds `/route` controls for shadow and auto routing
- persists local routing telemetry
- exposes delegated routing categories that subagents and ant-colony can read from startup config
- lets you describe provider assignments by category instead of hard-coding Anthropic/OpenAI defaults into agents

## Config

Config lives at:

```text
~/.pi/agent/extensions/adaptive-routing/config.json
```

In addition to prompt routing, the config can declare delegated categories for startup model assignment:

```json
{
  "delegatedRouting": {
    "enabled": true,
    "categories": {
      "quick-discovery": {
        "preferredProviders": ["google", "openai"],
        "fallbackGroup": "cheap-router"
      },
      "implementation-default": {
        "preferredProviders": ["openai", "google"]
      },
      "review-critical": {
        "preferredProviders": ["openai", "google"],
        "fallbackGroup": "peak-reasoning"
      },
      "visual-engineering": {
        "preferredProviders": ["google", "openai"],
        "fallbackGroup": "design-premium"
      }
    }
  }
}
```

Subagents and ant-colony use these categories only when they do not already have an explicit runtime or per-role model override.

## Commands

- `/route:status`
- `/route:shadow`
- `/route:auto`
- `/route:off`
- `/route:explain`
- `/route:assignments`
- `/route:stats`
