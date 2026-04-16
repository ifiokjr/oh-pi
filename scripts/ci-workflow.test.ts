import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, "..");
const workflowPath = path.join(repoRoot, ".github", "workflows", "ci.yml");

describe("CI workflow branch triggers", () => {
	it("runs for main and stacked prep branches on push and pull_request", () => {
		const workflow = readFileSync(workflowPath, "utf8");

		expect(workflow).toContain("push:");
		expect(workflow).toContain("pull_request:");
		expect(workflow.match(/branches: \[main, 'prep\/\*\*'\]/g)?.length).toBe(2);
	});

	it("links workspace packages before the build job runs", () => {
		const workflow = readFileSync(workflowPath, "utf8");

		expect(workflow).toContain("name: Build");
		expect(workflow).toContain("pnpm install --force --link-workspace-packages");
	});
});
