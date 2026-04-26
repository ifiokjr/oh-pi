import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cleanupManagedConfig } from "./install.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "oh-pi-install-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { force: true, recursive: true });
	}
});

describe(cleanupManagedConfig, () => {
	it("removes managed files and directories while preserving unmanaged data", () => {
		const dir = makeTempDir();

		writeFileSync(join(dir, "auth.json"), "{}");
		writeFileSync(join(dir, "settings.json"), "{}");
		writeFileSync(join(dir, "models.json"), "{}");
		writeFileSync(join(dir, "keybindings.json"), "{}");
		writeFileSync(join(dir, "AGENTS.md"), "# test");

		mkdirSync(join(dir, "extensions"), { recursive: true });
		writeFileSync(join(dir, "extensions", "x.ts"), "export default {}");
		mkdirSync(join(dir, "prompts"), { recursive: true });
		writeFileSync(join(dir, "prompts", "x.md"), "prompt");
		mkdirSync(join(dir, "skills"), { recursive: true });
		writeFileSync(join(dir, "skills", "x.md"), "skill");
		mkdirSync(join(dir, "themes"), { recursive: true });
		writeFileSync(join(dir, "themes", "x.json"), "{}");

		mkdirSync(join(dir, "sessions"), { recursive: true });
		writeFileSync(join(dir, "sessions", "keep.json"), "{}");
		writeFileSync(join(dir, "pi-crash.log"), "keep");

		cleanupManagedConfig(dir);

		expect(existsSync(join(dir, "auth.json"))).toBeFalsy();
		expect(existsSync(join(dir, "settings.json"))).toBeFalsy();
		expect(existsSync(join(dir, "models.json"))).toBeFalsy();
		expect(existsSync(join(dir, "keybindings.json"))).toBeFalsy();
		expect(existsSync(join(dir, "AGENTS.md"))).toBeFalsy();
		expect(existsSync(join(dir, "extensions"))).toBeFalsy();
		expect(existsSync(join(dir, "prompts"))).toBeFalsy();
		expect(existsSync(join(dir, "skills"))).toBeFalsy();
		expect(existsSync(join(dir, "themes"))).toBeFalsy();

		expect(existsSync(join(dir, "sessions", "keep.json"))).toBeTruthy();
		expect(existsSync(join(dir, "pi-crash.log"))).toBeTruthy();
	});
});
