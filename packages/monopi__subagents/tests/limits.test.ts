import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveSubagentLimits } from "../limits.js";

const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function writeSettings(baseDir: string, settings: unknown): void {
	fs.mkdirSync(baseDir, { recursive: true });
	fs.writeFileSync(path.join(baseDir, "settings.json"), JSON.stringify(settings));
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { force: true, recursive: true });
	}
});

describe("resolveSubagentLimits", () => {
	it("uses defaults when no overrides are present", async () => {
		const cwd = createTempDir("subagent-limits-project-");
		const agentDir = createTempDir("subagent-limits-agent-");

		expect(await resolveSubagentLimits({ agentDir, cwd, env: {} })).toEqual({
			maxConcurrency: 4,
			maxParallel: 8,
		});
	});

	it("allows user settings to raise or lower limits", async () => {
		const cwd = createTempDir("subagent-limits-project-");
		const agentDir = createTempDir("subagent-limits-agent-");
		writeSettings(agentDir, { subagent: { maxConcurrency: 8, maxParallel: 16 } });

		expect(await resolveSubagentLimits({ agentDir, cwd, env: {} })).toEqual({
			maxConcurrency: 8,
			maxParallel: 16,
		});

		writeSettings(agentDir, { subagent: { maxConcurrency: 2, maxParallel: 3 } });
		expect(await resolveSubagentLimits({ agentDir, cwd, env: {} })).toEqual({
			maxConcurrency: 2,
			maxParallel: 3,
		});
	});

	it("lets project settings lower defaults but not raise them", async () => {
		const cwd = createTempDir("subagent-limits-project-");
		const agentDir = createTempDir("subagent-limits-agent-");
		writeSettings(path.join(cwd, ".pi"), { subagent: { maxConcurrency: 2, maxParallel: 4 } });

		expect(await resolveSubagentLimits({ agentDir, cwd, env: {} })).toEqual({
			maxConcurrency: 2,
			maxParallel: 4,
		});

		writeSettings(path.join(cwd, ".pi"), { subagent: { maxConcurrency: 9, maxParallel: 99 } });
		expect(await resolveSubagentLimits({ agentDir, cwd, env: {} })).toEqual({
			maxConcurrency: 4,
			maxParallel: 8,
		});
	});

	it("prefers env vars over user and project settings per limit", async () => {
		const cwd = createTempDir("subagent-limits-project-");
		const agentDir = createTempDir("subagent-limits-agent-");
		writeSettings(agentDir, { subagent: { maxConcurrency: 6, maxParallel: 12 } });
		writeSettings(path.join(cwd, ".pi"), { subagent: { maxConcurrency: 2, maxParallel: 4 } });

		expect(
			await resolveSubagentLimits({
				agentDir,
				cwd,
				env: { PI_SUBAGENT_MAX_PARALLEL: "20" },
			}),
		).toEqual({
			maxConcurrency: 6,
			maxParallel: 20,
		});
	});

	it("ignores invalid values and falls through to lower-precedence sources", async () => {
		const cwd = createTempDir("subagent-limits-project-");
		const agentDir = createTempDir("subagent-limits-agent-");
		writeSettings(agentDir, { subagent: { maxConcurrency: 0, maxParallel: -1 } });
		writeSettings(path.join(cwd, ".pi"), { subagent: { maxConcurrency: 2, maxParallel: 4 } });

		expect(
			await resolveSubagentLimits({
				agentDir,
				cwd,
				env: { PI_SUBAGENT_MAX_CONCURRENCY: "nope" },
			}),
		).toEqual({
			maxConcurrency: 2,
			maxParallel: 4,
		});
	});
});
