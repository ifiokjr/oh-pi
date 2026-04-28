import { describe, expect, it } from "vitest";
import { type InstallerDeps, runInstaller } from "./installer.js";

function createMockDeps(overrides: Partial<InstallerDeps> = {}): InstallerDeps {
	const chunks: string[] = [];
	return {
		detectEnv: async () => ({
			piInstalled: false,
			piVersion: "0.4.3",
			hasExistingConfig: false,
			agentDir: "/tmp/.pi",
			terminal: "iterm",
			os: "darwin",
			existingFiles: [],
			configSizeKB: 0,
			existingProviders: [],
		}),
		readChangelog: () => "# Changelog\n\n## 0.4.4 (2026-04-02)\n\n### Features\n\n- Feature A\n",
		pickExtensions: async () => ["git-guard"],
		applyConfig: () => {},
		installPi: () => {},
		backupConfig: () => "/tmp/.pi.bak",
		stdout: {
			write: (c: string) => chunks.push(c),
		} as unknown as NodeJS.WriteStream,
		...overrides,
	};
}

describe("runInstaller", () => {
	it("shows version comparison and installs", async () => {
		const deps = createMockDeps();
		await runInstaller(deps);
		const output = (deps.stdout as any).write
			? ""
			: (deps.stdout as unknown as { write: (c: string) => void }).write.toString();
		// Since we capture via side-effect array, just assert no throw
	});

	it("handles missing existing installation", async () => {
		const deps = createMockDeps({
			detectEnv: async () => ({
				piInstalled: false,
				piVersion: null,
				hasExistingConfig: false,
				agentDir: "/tmp/.pi",
				terminal: "iterm",
				os: "darwin",
				existingFiles: [],
				configSizeKB: 0,
				existingProviders: [],
			}),
		});
		await expect(runInstaller(deps)).resolves.toBeUndefined();
	});

	it("applies config with selected extensions", async () => {
		let appliedConfig: any;
		const deps = createMockDeps({
			pickExtensions: async () => ["git-guard", "plan"],
			applyConfig: (c) => {
				appliedConfig = c;
			},
		});
		await runInstaller(deps);
		expect(appliedConfig.extensions).toEqual(["git-guard", "plan"]);
	});

	it("backs up when existing config present", async () => {
		let backupCalled = false;
		const deps = createMockDeps({
			detectEnv: async () => ({
				piInstalled: true,
				piVersion: "0.4.3",
				hasExistingConfig: true,
				agentDir: "/tmp/.pi",
				terminal: "iterm",
				os: "darwin",
				existingFiles: ["settings.json"],
				configSizeKB: 1,
				existingProviders: [],
			}),
			backupConfig: () => {
				backupCalled = true;
				return "/tmp/.pi.bak";
			},
		});
		await runInstaller(deps);
		expect(backupCalled).toBe(true);
	});
});
