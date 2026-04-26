import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildTimestampedPlanFilename, resolveActivePlanFilePath, resolvePlanLocationInput } from "../plan-files";

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) {
			continue;
		}
		await rm(dir, { force: true, recursive: true });
	}
});

function createCtx(cwd: string, sessionId: string) {
	return {
		cwd,
		sessionManager: {
			getSessionDir: () => cwd,
			getSessionFile: () => undefined,
			getSessionId: () => sessionId,
		},
	} as any;
}

describe(buildTimestampedPlanFilename, () => {
	it("sanitizes session id and keeps plan suffix", () => {
		const name = buildTimestampedPlanFilename("session/id:1");
		expect(name.endsWith(".plan.md")).toBeTruthy();
		expect(name).toContain("session-id-1");
	});
});

describe(resolvePlanLocationInput, () => {
	it("keeps explicit file path", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-files-"));
		tempDirs.push(tmpDir);
		const ctx = createCtx(tmpDir, "session-1");

		const resolved = await resolvePlanLocationInput(ctx, "plans/next.plan.md");
		expect(resolved).toBe(path.join(tmpDir, "plans/next.plan.md"));
	});

	it("creates timestamped file for directory input", async () => {
		const tmpDir = await mkdtemp(path.join(os.tmpdir(), "plan-md-files-"));
		tempDirs.push(tmpDir);
		const plansDir = path.join(tmpDir, "plans");
		await mkdir(plansDir, { recursive: true });
		const ctx = createCtx(tmpDir, "session-2");

		const resolved = await resolvePlanLocationInput(ctx, "plans/");
		expect(resolved?.startsWith(plansDir)).toBeTruthy();
		expect(resolved?.endsWith(".plan.md")).toBeTruthy();
	});
});

describe(resolveActivePlanFilePath, () => {
	it("uses explicit state path when available", () => {
		const ctx = createCtx("/tmp/demo", "session-3");
		expect(resolveActivePlanFilePath(ctx, "/tmp/custom.plan.md")).toBe("/tmp/custom.plan.md");
	});
});
