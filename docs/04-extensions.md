# Pi Extension System

## 1. Overview

Extensions are TypeScript modules loaded via jiti (no compilation needed). They can:

- Register custom tools (callable by the LLM)
- Intercept/modify tool calls and results
- Register commands, shortcuts, and CLI flags
- User interaction (dialogs, notifications, custom UI components)
- Custom rendering (tool calls/results, messages)
- Persist session state
- Replace built-in tools
- Register custom model providers

## 2. Locations

| Location                            | Scope                          |
| ----------------------------------- | ------------------------------ |
| `~/.pi/agent/extensions/*.ts`       | Global                         |
| `~/.pi/agent/extensions/*/index.ts` | Global (subdirectory)          |
| `.pi/extensions/*.ts`               | Project-level                  |
| `.pi/extensions/*/index.ts`         | Project-level (subdirectory)   |
| `settings.json` `extensions` array  | Additional paths               |
| `pi -e ./path.ts`                   | Temporary load (quick testing) |

## 3. Basic Structure

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  // Subscribe to events
  pi.on("event_name", async (event, ctx) => { ... });

  // Register a tool
  pi.registerTool({ name: "my_tool", ... });

  // Register a command
  pi.registerCommand("name", { handler: async (args, ctx) => { ... } });

  // Register a shortcut
  pi.registerShortcut("ctrl+shift+p", { handler: async (ctx) => { ... } });
}
```

### Available Imports

| Package                         | Use                                                    |
| ------------------------------- | ------------------------------------------------------ |
| `@mariozechner/pi-coding-agent` | Extension types                                        |
| `@sinclair/typebox`             | Tool parameter schemas                                 |
| `@mariozechner/pi-ai`           | AI utilities (StringEnum, etc.)                        |
| `@mariozechner/pi-tui`          | TUI components                                         |
| Node.js built-ins               | `node:fs`, `node:path`, etc.                           |
| npm dependencies                | Requires package.json + install in extension directory |

## 4. Event Lifecycle

```
pi starts → session_start
User sends prompt:
  → input (can intercept/transform)
  → before_agent_start (can inject messages/modify system prompt)
  → agent_start
  → message_start / message_update / message_end
  → [turn loop]:
      turn_start → context → tool_call → tool_execution_* → tool_result → turn_end
  → agent_end
Model switch → model_select
Session ops → session_before_switch/switch, session_before_fork/fork
Compaction → session_before_compact/compact
Tree nav → session_before_tree/tree
Exit → session_shutdown
```

### Key Events

| Event                    | Can Return                                     | Use                                  |
| ------------------------ | ---------------------------------------------- | ------------------------------------ |
| `tool_call`              | `{ block: true, reason }`                      | Intercept dangerous operations       |
| `tool_result`            | `{ content, details, isError }`                | Modify tool results                  |
| `input`                  | `{ action: "transform"/"handled"/"continue" }` | Intercept/transform user input       |
| `before_agent_start`     | `{ message, systemPrompt }`                    | Inject messages/modify system prompt |
| `context`                | `{ messages }`                                 | Modify messages sent to LLM          |
| `session_before_compact` | `{ cancel }` or `{ compaction }`               | Custom compaction                    |
| `session_before_tree`    | `{ cancel }` or `{ summary }`                  | Custom branch summary                |

## 5. ExtensionAPI Methods

### Core

| Method                                       | Description                      |
| -------------------------------------------- | -------------------------------- |
| `pi.on(event, handler)`                      | Subscribe to event               |
| `pi.registerTool(def)`                       | Register custom tool             |
| `pi.registerCommand(name, opts)`             | Register `/command`              |
| `pi.registerShortcut(key, opts)`             | Register keybinding              |
| `pi.registerFlag(name, opts)`                | Register CLI flag                |
| `pi.registerProvider(name, config)`          | Register/override model provider |
| `pi.registerMessageRenderer(type, renderer)` | Custom message rendering         |

### Message Injection

| Method                              | Description                                     |
| ----------------------------------- | ----------------------------------------------- |
| `pi.sendMessage(msg, opts)`         | Inject custom message (steer/followUp/nextTurn) |
| `pi.sendUserMessage(content, opts)` | Send user message                               |
| `pi.appendEntry(type, data)`        | Persist extension state (not in LLM context)    |

### Tool Management

| Method                     | Description                |
| -------------------------- | -------------------------- |
| `pi.getActiveTools()`      | Get currently active tools |
| `pi.getAllTools()`         | Get all registered tools   |
| `pi.setActiveTools(names)` | Set active tool list       |

### Model Control

| Method                       | Description        |
| ---------------------------- | ------------------ |
| `pi.setModel(model)`         | Set model          |
| `pi.getThinkingLevel()`      | Get thinking level |
| `pi.setThinkingLevel(level)` | Set thinking level |

### Other

| Method                        | Description               |
| ----------------------------- | ------------------------- |
| `pi.exec(cmd, args, opts)`    | Execute shell command     |
| `pi.events`                   | Inter-extension event bus |
| `pi.setSessionName(name)`     | Set session name          |
| `pi.setLabel(entryId, label)` | Set/clear entry label     |
| `pi.getCommands()`            | Get available commands    |

## 6. ExtensionContext (ctx)

Each event handler receives `ctx`:

| Property/Method                   | Description                                        |
| --------------------------------- | -------------------------------------------------- |
| `ctx.ui`                          | UI interaction methods                             |
| `ctx.hasUI`                       | Whether UI is available (false in print/json mode) |
| `ctx.cwd`                         | Current working directory                          |
| `ctx.sessionManager`              | Read-only session state                            |
| `ctx.modelRegistry` / `ctx.model` | Model access                                       |
| `ctx.isIdle()` / `ctx.abort()`    | Flow control                                       |
| `ctx.shutdown()`                  | Request graceful shutdown                          |
| `ctx.getContextUsage()`           | Context usage info                                 |
| `ctx.compact(opts)`               | Trigger compaction                                 |
| `ctx.getSystemPrompt()`           | Get current system prompt                          |

### ExtensionCommandContext (additional for command handlers)

| Method                             | Description         |
| ---------------------------------- | ------------------- |
| `ctx.waitForIdle()`                | Wait for agent idle |
| `ctx.newSession(opts)`             | Create new session  |
| `ctx.fork(entryId)`                | Fork session        |
| `ctx.navigateTree(targetId, opts)` | Tree navigation     |
| `ctx.reload()`                     | Reload resources    |

## 7. Custom Tools

```typescript
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "Tool description (visible to LLM)",
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const), // Google-compatible
    text: Type.Optional(Type.String()),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    onUpdate?.({ content: [{ type: "text", text: "Working..." }] });
    return {
      content: [{ type: "text", text: "Done" }],
      details: { result: "..." },
    };
  },
  renderCall(args, theme) { ... },    // Optional: custom rendering
  renderResult(result, opts, theme) { ... },
});
```

**Important**: Use `StringEnum` for enums (not `Type.Union`) — otherwise Google API is incompatible.

### Output Truncation

Built-in limit: 50KB / 2000 lines. Custom tools must truncate output themselves. Use exported utility functions:

- `truncateHead(output, opts)` — Keep the beginning
- `truncateTail(output, opts)` — Keep the end

### Overriding Built-in Tools

Register a tool with the same name to override `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`.

### Remote Execution

Built-in tools support a pluggable Operations interface for delegation to SSH/container/remote systems.

## 8. UI Interaction

### Dialogs

```typescript
const choice = await ctx.ui.select("Title", ["A", "B", "C"]);
const ok = await ctx.ui.confirm("Delete?", "This cannot be undone");
const name = await ctx.ui.input("Name:", "placeholder");
const text = await ctx.ui.editor("Edit:", "pre-filled content");
ctx.ui.notify("Done!", "info"); // "info" | "warning" | "error"
```

Supports `timeout` option for auto-dismiss countdown.

### Persistent UI

```typescript
ctx.ui.setStatus("key", "text");           // Footer status
ctx.ui.setWidget("key", ["line1", "line2"]); // Widget above editor
ctx.ui.setWidget("key", lines, { placement: "belowEditor" }); // Below
ctx.ui.setFooter((tui, theme, data) => ({ ... })); // Custom footer
ctx.ui.setEditorComponent((tui, theme, kb) => new VimEditor(...)); // Custom editor
```

### Custom Components

```typescript
const result = await ctx.ui.custom<T>((tui, theme, keybindings, done) => {
  return { render(w) { ... }, invalidate() { ... }, handleInput(data) { ... } };
}, { overlay: true }); // overlay mode optional
```

## 9. State Management

Extension state should be stored in tool result `details` to support branching:

```typescript
// Rebuild state from session
pi.on("session_start", async (_event, ctx) => {
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message" && entry.message.role === "toolResult" && entry.message.toolName === "my_tool") {
			state = entry.message.details?.state;
		}
	}
});
```

## 10. Example Extensions Index

| Extension                | Functionality                  |
| ------------------------ | ------------------------------ |
| `hello.ts`               | Minimal example                |
| `confirm-destructive.ts` | Dangerous command confirmation |
| `protected-paths.ts`     | Path protection                |
| `git-checkpoint.ts`      | Git checkpoints                |
| `auto-commit-on-exit.ts` | Auto-commit on exit            |
| `permission-gate.ts`     | Permission gating              |
| `tool-override.ts`       | Override built-in tools        |
| `custom-compaction.ts`   | Custom compaction              |
| `plan-mode/`             | Plan mode                      |
| `subagent/`              | Sub-agent system               |
| `ssh.ts`                 | SSH remote execution           |
| `sandbox/`               | Sandbox execution              |
| `snake.ts`               | Snake game                     |
| `doom-overlay/`          | Doom game                      |
| `modal-editor.ts`        | Vim-mode editor                |
| `todo.ts`                | Todo list tool                 |
| `preset.ts`              | Preset switching               |
| `pirate.ts`              | Pirate voice                   |
| `claude-rules.ts`        | Claude rules compatibility     |
| `custom-provider-*`      | Custom provider examples       |
