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
				"fallbackGroup": "cheap-router",
				"taskProfile": "planning",
				"preferFastModels": true
			},
			"implementation-default": {
				"preferredProviders": ["openai", "google"],
				"taskProfile": "coding",
				"minContextWindow": 64000
			},
			"review-critical": {
				"preferredProviders": ["openai", "google"],
				"fallbackGroup": "peak-reasoning",
				"taskProfile": "planning",
				"minContextWindow": 128000,
				"requireReasoning": true
			},
			"visual-engineering": {
				"preferredProviders": ["google", "openai"],
				"fallbackGroup": "design-premium",
				"taskProfile": "design",
				"minContextWindow": 128000
			}
		}
	},
	"delegatedModelSelection": {
		"disabledProviders": ["cursor"],
		"preferLowerUsage": true,
		"allowSmallContextForSmallTasks": true,
		"roleOverrides": {
			"subagent:planner": {
				"preferredModels": ["google/gemini-3.1-pro", "openai/gpt-5.4"]
			},
			"colony:scout": {
				"preferredModels": ["openai/gpt-5-mini"],
				"preferFastModels": true
			}
		}
	}
}
```

Subagents and ant-colony use these categories only when they do not already have an explicit runtime or per-role model override. The delegated selector is runtime-aware: it filters down to currently available models, applies provider/model disable lists, prefers higher-headroom providers when usage data is available, and uses context-fit plus public benchmark metadata to rank candidates.

Use `/route why ...` to inspect a delegated pick for a specific category or role override and see the ranked reasons plus rejected candidates.

## Commands

Primary commands:

- `/route status`
- `/route shadow`
- `/route auto`
- `/route off`
- `/route explain`
- `/route assignments`
- `/route why <category|role-override> [task text]`
- `/route stats`

Alias commands are also registered in `route:<subcommand>` form, for example:

- `/route:status`
- `/route:shadow`
- `/route:auto`
- `/route:off`
- `/route:explain`
- `/route:assignments`
- `/route:why quick-discovery scan the repo`
- `/route:stats`
