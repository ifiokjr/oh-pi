import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";

const tempDirs: string[] = [];
let previousHome: string | undefined;
let previousUserProfile: string | undefined;

function withTempHome() {
	previousHome = process.env.HOME;
	previousUserProfile = process.env.USERPROFILE;
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-pi-subagents-smoke-"));
	tempDirs.push(dir);
	process.env.HOME = dir;
	process.env.USERPROFILE = dir;
	return dir;
}

afterEach(() => {
	if (previousHome === undefined) {
		process.env.HOME = undefined;
	} else {
		process.env.HOME = previousHome;
	}
	if (previousUserProfile === undefined) {
		process.env.USERPROFILE = undefined;
	} else {
		process.env.USERPROFILE = previousUserProfile;
	}
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { force: true, recursive: true });
	}
});

describe("subagents runtime smoke tests", () => {
	it("registers commands and tools without crashing", async () => {
		withTempHome();
		const harness = createExtensionHarness();
		const mod = await import("../index.js");
		mod.default(harness.pi as never);

		expect(harness.commands.has("agents")).toBeTruthy();
		expect(harness.commands.has("run")).toBeTruthy();
		expect(harness.tools.has("subagent")).toBeTruthy();
		expect(harness.tools.has("subagent_status")).toBeTruthy();
	});
});
