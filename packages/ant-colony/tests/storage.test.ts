import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	cleanupEmptyColonyStorageDirs,
	getColonyStateParentDir,
	getColonyWorktreeParentDir,
	migrateLegacyProjectColonies,
} from "../extensions/ant-colony/storage.js";

const tmpDirs: string[] = [];

function mkTempDir(prefix: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	tmpDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tmpDirs.splice(0)) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});

describe("ant-colony shared storage", () => {
	it("stores colony state and worktrees under the shared pi-style root by default", () => {
		const cwd = "/Users/test/work/repo";
		const sharedRoot = "/mock-home/.pi/agent/ant-colony";

		expect(getColonyStateParentDir(cwd, { mode: "shared", sharedRoot })).toBe(
			"/mock-home/.pi/agent/ant-colony/root/Users/test/work/repo/colonies",
		);
		expect(getColonyWorktreeParentDir(cwd, { mode: "shared", sharedRoot })).toBe(
			"/mock-home/.pi/agent/ant-colony/root/Users/test/work/repo/worktrees",
		);
	});

	it("keeps project mode available as an explicit opt-in", () => {
		const cwd = "/Users/test/work/repo";

		expect(getColonyStateParentDir(cwd, { mode: "project" })).toBe("/Users/test/work/repo/.ant-colony");
		expect(getColonyWorktreeParentDir(cwd, { mode: "project" })).toBe("/Users/test/work/repo/.ant-colony/worktrees");
	});

	it("migrates legacy project-local colony state into the shared store", () => {
		const cwd = mkTempDir("colony-migrate-");
		const sharedRoot = mkTempDir("colony-shared-");
		const legacyDir = path.join(cwd, ".ant-colony", "colony-legacy");
		fs.mkdirSync(path.join(legacyDir, "tasks"), { recursive: true });
		fs.writeFileSync(path.join(legacyDir, "state.json"), JSON.stringify({ id: "colony-legacy", status: "working" }));
		fs.writeFileSync(path.join(legacyDir, "tasks", "t-1.json"), JSON.stringify({ id: "t-1" }));
		fs.mkdirSync(path.join(cwd, ".ant-colony", "worktrees"), { recursive: true });

		migrateLegacyProjectColonies(cwd, { mode: "shared", sharedRoot });

		const migratedDir = path.join(getColonyStateParentDir(cwd, { mode: "shared", sharedRoot }), "colony-legacy");
		expect(fs.existsSync(path.join(migratedDir, "state.json"))).toBe(true);
		expect(fs.existsSync(path.join(migratedDir, "tasks", "t-1.json"))).toBe(true);
		expect(fs.existsSync(legacyDir)).toBe(false);
		expect(fs.existsSync(path.join(cwd, ".ant-colony", "worktrees"))).toBe(true);
	});

	it("cleans up empty shared workspace storage directories", () => {
		const cwd = mkTempDir("colony-cleanup-");
		const sharedRoot = mkTempDir("colony-cleanup-root-");
		const stateParent = getColonyStateParentDir(cwd, { mode: "shared", sharedRoot });
		fs.mkdirSync(stateParent, { recursive: true });

		cleanupEmptyColonyStorageDirs(cwd, { mode: "shared", sharedRoot });

		expect(fs.existsSync(stateParent)).toBe(false);
	});
});
