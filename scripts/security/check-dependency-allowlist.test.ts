import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempDirs: string[] = [];
const scriptPath = path.resolve(import.meta.dirname, "check-dependency-allowlist.mjs");

function writeJson(filePath: string, value: unknown): void {
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { force: true, recursive: true });
	}
});

describe("check-dependency-allowlist", () => {
	it("allows first-party workspace package dependencies without allowlist entries", () => {
		const repoDir = mkdtempSync(path.join(tmpdir(), "oh-pi-allowlist-"));
		tempDirs.push(repoDir);

		mkdirSync(path.join(repoDir, "security"), { recursive: true });
		mkdirSync(path.join(repoDir, "packages", "internal-a"), { recursive: true });
		mkdirSync(path.join(repoDir, "packages", "internal-b"), { recursive: true });

		writeJson(path.join(repoDir, "security", "dependency-allowlist.json"), {
			packages: ["chalk"],
		});
		writeJson(path.join(repoDir, "package.json"), { private: true });
		writeJson(path.join(repoDir, "packages", "internal-a", "package.json"), {
			name: "@ifi/internal-a",
			version: "0.1.0",
		});
		writeJson(path.join(repoDir, "packages", "internal-b", "package.json"), {
			dependencies: {
				"@ifi/internal-a": "0.1.0",
				chalk: "^5.0.0",
			},
			name: "@ifi/internal-b",
			version: "0.1.0",
		});

		const output = execFileSync("node", [scriptPath], {
			cwd: repoDir,
			encoding: "utf8",
		});

		expect(output).toContain("Dependency allowlist check passed");
	});
});
