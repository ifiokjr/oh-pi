/**
 * Micro-benchmarks for ant-colony hot paths.
 *
 * Run: node --import tsx packages/ant-colony/bench.ts
 *
 * These benchmarks validate that ant-colony scheduling and pheromone
 * operations remain fast as task counts grow.
 */
import { parseSubTasks, extractPheromones } from "./extensions/ant-colony/parser.js";
import { Nest } from "./extensions/ant-colony/nest.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Pheromone, Task } from "./extensions/ant-colony/types.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatNs(ns: number): string {
	if (ns < 1_000) return `${ns.toFixed(0)}ns`;
	if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)}µs`;
	return `${(ns / 1_000_000).toFixed(2)}ms`;
}

function bench(name: string, fn: () => void, iterations = 10_000): void {
	for (let i = 0; i < Math.min(iterations, 100); i++) fn();
	const iterations_actual = iterations;
	const start = performance.now();
	for (let i = 0; i < iterations_actual; i++) fn();
	const elapsed = performance.now() - start;
	const perOpNs = (elapsed / iterations_actual) * 1_000_000;
	console.log(`  ${name}: ${formatNs(perOpNs)}/op (${iterations_actual} iterations, ${elapsed.toFixed(1)}ms total)`);
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const smallTaskOutput = `## Task: Fix login bug
- description: Fix the authentication module
- files: src/auth.ts, src/login.ts
- caste: worker
- priority: 2`;

const mediumTaskOutput = Array.from({ length: 10 }, (_, i) => `## Task: Task ${i + 1}
- description: Implement feature ${i + 1}
- files: src/feature${i + 1}.ts
- caste: worker
- priority: ${3 - Math.min(i, 2)}`).join("\n\n");

const jsonTaskOutput = `\`\`\`json
[${Array.from({ length: 20 }, (_, i) => ({
	title: `Task ${i + 1}`,
	description: `Implement feature ${i + 1}`,
	files: [`src/feature${i + 1}.ts`],
	caste: "worker",
	priority: 3,
})).map((t) => JSON.stringify(t)).join(", ")}]
\`\`\``;

// ── Benchmarks ──────────────────────────────────────────────────────────────

console.log("\n=== Ant Colony Performance Benchmarks ===\n");

console.log("parseSubTasks (structured markdown)");
bench("1 task (small)", () => parseSubTasks(smallTaskOutput), 50_000);
bench("10 tasks (medium)", () => parseSubTasks(mediumTaskOutput), 50_000);
bench("20 tasks (JSON)", () => parseSubTasks(jsonTaskOutput), 50_000);

console.log("\nextractPheromones (pre-compiled regexes)");
const pheromoneOutput = `## Discoveries
Found a shared utility in src/utils.ts that handles both cases.

## Files Changed
- src/auth.ts
- src/login.ts
- src/utils.ts

## Warnings
The auth module has a circular dependency risk.`;
bench("5 files, 3 sections", () => extractPheromones("ant-1", "worker", "task-1", pheromoneOutput, ["src/auth.ts", "src/login.ts"], false), 50_000);

console.log("\n✅ All ant-colony benchmarks complete.\n");