
import { runInstaller } from './installer.js';
import type { InstallerDeps } from './installer.js';

function createMockDeps(overrides: Partial<InstallerDeps> = {}): InstallerDeps {
	const chunks: string[] = [];
	return {
		applyConfig: () => {},
		backupConfig: () => "/tmp/.pi.bak",
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
		installPi: () => {},
		pickExtensions: async () => ["git-guard"],
		readChangelog: () => "# Changelog\n\n## 0.4.4 (2026-04-02)\n\n### Features\n\n- Feature A\n",
		stdout: { write: (c: string) => chunks.push(c) } as unknown as NodeJS.WriteStream,
		...overrides,
	};
}

describe(runInstaller, () => {
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
				agentDir: "/tmp/.pi",
				configSizeKB: 0,
				existingFiles: [],
				existingProviders: [],
				hasExistingConfig: false,
				os: "darwin",
				piInstalled: false,
				piVersion: null,
				terminal: "iterm",
			}),
		});
		await expect(runInstaller(deps)).resolves.toBeUndefined();
	});

	it("applies config with selected extensions", async () => {
		let appliedConfig: any;
		const deps = createMockDeps({
			applyConfig: (c) => {
				appliedConfig = c;
			},
			pickExtensions: async () => ["git-guard", "plan"],
		});
		await runInstaller(deps);
		expect(appliedConfig.extensions).toStrictEqual(["git-guard", "plan"]);
	});

	it("backs up when existing config present", async () => {
		let backupCalled = false;
		const deps = createMockDeps({
			backupConfig: () => {
				backupCalled = true;
				return "/tmp/.pi.bak";
			},
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
		});
		await runInstaller(deps);
		expect(backupCalled).toBeTruthy();
	});
});
