import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];
const scriptPath = path.resolve(import.meta.dirname, "run-pnpm-audit.mjs");

function createFakePnpm(contents: string): string {
	const repoDir = mkdtempSync(path.join(tmpdir(), "oh-pi-audit-"));
	const fakePath = path.join(repoDir, "fake-pnpm.mjs");
	tempDirs.push(repoDir);
	writeFileSync(fakePath, contents, "utf8");
	chmodSync(fakePath, 0o755);
	return fakePath;
}

function auditEnv(fakePnpmPath: string) {
	return {
		...process.env,
		OH_PI_AUDIT_BIN: fakePnpmPath,
	};
}

function runAudit(fakePnpmPath: string, args: string[] = []): string {
	return execFileSync("node", [scriptPath, ...args], {
		encoding: "utf8",
		env: auditEnv(fakePnpmPath),
		stderr: "pipe",
	});
}

function runAuditResult(fakePnpmPath: string, args: string[] = []) {
	return spawnSync("node", [scriptPath, ...args], {
		encoding: "utf8",
		env: auditEnv(fakePnpmPath),
	});
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("run-pnpm-audit", () => {
	it("passes through successful pnpm audit output", () => {
		const fakePnpmPath = createFakePnpm(`#!/usr/bin/env node
console.log(process.argv.slice(2).join(" "));
process.exit(0);
`);

		const output = runAudit(fakePnpmPath, ["--prod", "--audit-level=high"]);

		expect(output).toContain("audit --prod --audit-level=high");
	});

	it("treats npm retired audit endpoint errors as non-fatal", () => {
		const fakePnpmPath = createFakePnpm(`#!/usr/bin/env node
console.error("ERR_PNPM_AUDIT_BAD_RESPONSE The audit endpoint responded with 410: Use the bulk advisory endpoint instead");
process.exit(1);
`);

		const result = runAuditResult(fakePnpmPath, ["--prod"]);
		const output = `${result.stdout}${result.stderr}`;

		expect(result.status).toBe(0);
		expect(output).toContain("retired audit endpoints");
		expect(output).toContain("non-fatal upstream failure");
	});

	it("preserves non-endpoint audit failures", () => {
		const fakePnpmPath = createFakePnpm(`#!/usr/bin/env node
console.error("audit found 1 high severity vulnerability");
process.exit(7);
`);

		expect(() => runAudit(fakePnpmPath, ["-D"]))
			.toThrowError(/audit found 1 high severity vulnerability/);
	});
});
