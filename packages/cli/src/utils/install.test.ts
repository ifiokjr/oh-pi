import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupManagedConfig } from "./install.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "oh-pi-install-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("cleanupManagedConfig", () => {
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

		expect(existsSync(join(dir, "auth.json"))).toBe(false);
		expect(existsSync(join(dir, "settings.json"))).toBe(false);
		expect(existsSync(join(dir, "models.json"))).toBe(false);
		expect(existsSync(join(dir, "keybindings.json"))).toBe(false);
		expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
		expect(existsSync(join(dir, "extensions"))).toBe(false);
		expect(existsSync(join(dir, "prompts"))).toBe(false);
		expect(existsSync(join(dir, "skills"))).toBe(false);
		expect(existsSync(join(dir, "themes"))).toBe(false);

		expect(existsSync(join(dir, "sessions", "keep.json"))).toBe(true);
		expect(existsSync(join(dir, "pi-crash.log"))).toBe(true);
	});
});
