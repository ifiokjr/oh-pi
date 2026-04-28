# Agent Rules — oh-pi

oh-pi is a lockstep-versioned pnpm monorepo of pi extensions, themes, prompts, skills, agents, and TUI tooling.

## Essentials

- Use `pnpm` for all workspace commands.

<!-- {=repoMdtUsageRuleDocs} -->

Use MDT through `pnpm mdt ...`, not a globally installed `mdt` binary. This keeps documentation reuse commands pinned to the repo's declared `@ifi/mdt` version and makes local runs, CI, and agent instructions consistent.

<!-- {/repoMdtUsageRuleDocs} -->

- Non-standard repo commands:
  - `pnpm typecheck` — type-checks the repo with `tsgo` (`@typescript/native-preview`)
  - `pnpm build` — runs every workspace package build script
- Every non-release change must include a changeset created with `knope document-change`; changeset frontmatter must use only `default`.

<!-- {=repoMdtCommandsDocs} -->

```bash
pnpm mdt list
pnpm mdt update
pnpm mdt check
```

Convenience wrappers remain available too:

```bash
pnpm docs:list
pnpm docs:update
pnpm docs:check
```

<!-- {/repoMdtCommandsDocs} -->

- Read only the detailed file that matches the current task:
  - [Engineering rules](docs/agent-rules/engineering.md)
  - [Packaging and release rules](docs/agent-rules/packaging-and-release.md)
  - [Git and PR workflow](docs/agent-rules/git-and-pr-workflow.md)

## Performance Rules

These rules prevent performance regressions identified during the 2025-04 audit. Every change must comply.

### 1. Hoist regexes out of hot paths

Never create `new RegExp(...)` inside a function that runs repeatedly (event handlers, parsers, per-message processors). Instead, compile the regex once at module scope or in a lazy-init singleton.

```ts
// ❌ Slow — compiles on every call
function extractPheromones(output: string) {
	for (const section of sections) {
		const regex = new RegExp(`#{1,2} ${section}\\n([\\s\\S]*?)(?=\\n#{1,2} |$)`, "i");
		// ...
	}
}

// ✅ Fast — compile once at module scope
const SECTION_REGEXES = SECTIONS.map((s) => new RegExp(`#{1,2} ${s}\\n([\\s\\S]*?)(?=\\n#{1,2} |$)`, "i"));
```

### 2. Debounce disk writes from hot paths

Extensions that write to disk on every usage sample, event, or tick must debounce writes (≥10s). Do not `writeFileSync` on every `recordUsage` call.

```ts
// ❌ Slow — writes to disk per event
function recordUsage(sample) {
	rollingHistory.push(sample);
	saveRollingHistory(); // writeFileSync on every call!
}

// ✅ Fast — debounce disk writes
const PERSIST_DEBOUNCE_MS = 10_000;
let rollingHistoryDirty = false;
let rollingHistorySaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRollingHistorySave() {
	rollingHistoryDirty = true;
	if (rollingHistorySaveTimer) return;
	rollingHistorySaveTimer = setTimeout(() => {
		rollingHistorySaveTimer = null;
		if (rollingHistoryDirty) {
			rollingHistoryDirty = false;
			saveRollingHistory();
		}
	}, PERSIST_DEBOUNCE_MS);
	rollingHistorySaveTimer.unref?.();
}
```

### 3. Use O(n) array pruning, not O(n²) splice loops

When pruning aged items from an array, use a write-pointer instead of repeated `splice()` calls:

```ts
// ❌ O(n²) — each splice shifts elements
for (let i = arr.length - 1; i >= 0; i--) {
	if (shouldRemove(arr[i])) arr.splice(i, 1);
}

// ✅ O(n) — single pass with write pointer
let write = 0;
for (let read = 0; read < arr.length; read++) {
	if (!shouldRemove(arr[read])) arr[write++] = arr[read];
}
arr.length = write;
```

### 4. Avoid unnecessary array copies

Do not spread or `.slice()` arrays when the original won't be mutated:

```ts
// ❌ Unnecessary copy
const blockedProviders = [...selectionConfig.disabledProviders];

// ✅ Use the original if it won't be mutated
const blockedProviders = selectionConfig.disabledProviders;
```

Only spread/copy when you actually need an independent mutable copy (e.g., before passing to a consumer that may modify it).

### 5. Prefer `for…of` with early exit over `.filter().map()` chains

When you need items matching a predicate and you only use the first few results, use a loop with `break` instead of creating intermediate arrays:

```ts
// ❌ Creates two intermediate arrays
const firstMatch = items.filter(predicate).map(transform)[0];

// ✅ No intermediate allocation
for (const item of items) {
	if (predicate(item)) {
		firstMatch = transform(item);
		break;
	}
}
```

### 6. Cache compiled regex matchers in long-lived objects

When an object creates regex patterns from dynamic strings (e.g., completion signals, search patterns), cache the compiled regex so subsequent calls reuse it:

```ts
// ❌ Compiles regex on every call to isCompletionDetected
private isCompletionDetected(task, text) {
  const signal = task.completionSignal?.trim();
  if (signal) {
    const regexMatch = signal.match(/^\/(.*)\/([gimsuy]*)$/);
    if (regexMatch) return new RegExp(regexMatch[1], regexMatch[2]).test(text);
  }
}

// ✅ Cache compiled regex per signal string
private completionRegexCache = new Map<string, RegExp | null>();

private isCompletionDetected(task, text) {
  const signal = task.completionSignal?.trim();
  if (signal) {
    let cached = this.completionRegexCache.get(signal);
    if (cached === undefined) {
      const m = signal.match(/^\/(.*)\/([gimsuy]*)$/);
      cached = m ? new RegExp(m[1], m[2]) : null;
      this.completionRegexCache.set(signal, cached);
    }
    if (cached) return cached.test(text);
  }
}
```

### 7. Do not block the event loop with synchronous I/O in hot paths

Avoid `readFileSync`, `writeFileSync`, `existsSync`, `statSync`, `readdirSync` in code paths that run during request handling, streaming, or per-turn processing. Use async equivalents or read once at startup and cache the result.

Sync I/O in initial setup (extension load, config read) is acceptable. Sync I/O per message or per event is not.

### 8. Avoid O(n²) object spread in `.reduce()`

Do not use `.reduce()` with object spread (`{ ...acc, [key]: value }`) for large collections — each iteration copies all previous keys:

```ts
// ❌ O(n²) — each spread copies all previous entries
const result = items.reduce((acc, item) => ({ ...acc, [item.id]: item }), {});

// ✅ O(n) — mutate once
const result: Record<string, Item> = {};
for (const item of items) result[item.id] = item;
```

### 9. Bounds-check unbounded caches

In-memory Maps or objects used as caches must have either:

- A bounded size (evict stale entries when full), or
- A known finite domain (e.g., model IDs from a static catalog)

Never allow unbounded maps from user-controlled keys to grow indefinitely.

### 10. Use `Array.from(map.values())` sparingly in hot paths

`Array.from(map.values())` allocates a new array on every call. In hot paths (per-message, per-tick), cache or reuse the array. In setup or infrequent paths it's fine.

### 11. Replace multi-pass filter+sort with single-pass loops

In tick handlers and render methods, avoid chaining `.filter().filter().map()` on the same collection. Instead, do a single `for...of` loop with counters:

```ts
// ❌ Three allocations + three full iterations
const enabled = Array.from(tasks.values()).filter((t) => t.enabled);
const due = enabled.filter((t) => t.resumeRequired);
const scheduled = enabled.filter((t) => !t.resumeRequired);
const nextRunAt = Math.min(...scheduled.map((t) => t.nextRunAt));

// ✅ One iteration, zero allocations
let enabledCount = 0;
let dueCount = 0;
let scheduledCount = 0;
let nextRunAt = Infinity;
for (const task of tasks.values()) {
	if (!task.enabled) continue;
	enabledCount++;
	if (task.resumeRequired) {
		dueCount++;
	} else {
		scheduledCount++;
		nextRunAt = Math.min(nextRunAt, task.nextRunAt);
	}
}
```

### 12. Use single-pass min-finding instead of filter+sort+index[0]

To find the minimum element by a key, do a single-pass scan instead of allocating, filtering, sorting, and indexing:

```ts
// ❌ Allocates array + sorts entire collection
const nextTask = Array.from(tasks.values())
	.filter((t) => t.enabled && t.pending)
	.sort((a, b) => a.nextRunAt - b.nextRunAt)[0];

// ✅ Single-pass with early-exit, zero allocation
let best: ScheduleTask | undefined;
for (const task of tasks.values()) {
	if (!task.enabled || !task.pending) continue;
	if (!best || task.nextRunAt < best.nextRunAt) best = task;
}
```

### 13. Use collect-then-delete pattern for Map iteration with deletion

Never delete from a Map during `for...of map.values()` iteration. Instead of creating a snapshot with `Array.from(map.values())`, collect IDs in a temporary array and delete after the loop:

```ts
// ❌ Allocates full snapshot just to safely delete
for (const task of Array.from(tasks.values())) {
	if (shouldDelete(task)) tasks.delete(task.id);
}

// ✅ No snapshot — collect then delete
const deleteIds: string[] = [];
for (const task of tasks.values()) {
	if (shouldDelete(task)) deleteIds.push(task.id);
}
for (const id of deleteIds) tasks.delete(id);
```
