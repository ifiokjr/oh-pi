import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildTimestampedPlanFilename, resolveActivePlanFilePath, resolvePlanLocationInput } from "../plan-files";

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) {
			continue;
		}
		await rm(dir, { recursive: true, force: true });
	}
});

function createCtx(cwd: string, sessionId: string) {
	return {
		cwd,
		sessionManager: {
			getSessionId: () => sessionId,
			getSessionFile: () => undefined,
			getSessionDir: () => cwd,
		},
	} as any;
}

describe("buildTimestampedPlanFilename", () => {
	test("sanitizes session id and keeps plan suffix", () => {
		const name = buildTimestampedPlanFilename("session/id:1");
		expect(name.endsWith(".plan.md")).toBe(true);
		expect(name).toContain("session-id-1");
	});
});

describe("resolvePlanLocationInput", () => {
	test("keeps explicit file path", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-files-"));
		tempDirs.push(tmpDir);
		const ctx = createCtx(tmpDir, "session-1");

		const resolved = await resolvePlanLocationInput(ctx, "plans/next.plan.md");
		expect(resolved).toBe(path.join(tmpDir, "plans/next.plan.md"));
	});

	test("creates timestamped file for directory input", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-files-"));
		tempDirs.push(tmpDir);
		const plansDir = path.join(tmpDir, "plans");
		await mkdir(plansDir, { recursive: true });
		const ctx = createCtx(tmpDir, "session-2");

		const resolved = await resolvePlanLocationInput(ctx, "plans/");
		expect(resolved?.startsWith(plansDir)).toBe(true);
		expect(resolved?.endsWith(".plan.md")).toBe(true);
	});
});

describe("resolveActivePlanFilePath", () => {
	test("uses explicit state path when available", () => {
		const ctx = createCtx("/tmp/demo", "session-3");
		expect(resolveActivePlanFilePath(ctx, "/tmp/custom.plan.md")).toBe("/tmp/custom.plan.md");
	});
});
