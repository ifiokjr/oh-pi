import { describe, expect, it } from "vitest";

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import filesExtension from "../index.js";

describe("files extension registration", () => {
	it("registers the /files command and shortcuts", () => {
		const harness = createExtensionHarness();
		filesExtension(harness.pi);

		expect(Array.from(harness.commands.keys()).sort()).toEqual(["files"]);
		expect(Array.from(harness.shortcuts.keys()).sort()).toEqual(["ctrl+shift+f", "ctrl+shift+o", "ctrl+shift+r"]);
	});
});

describe("/files command", () => {
	it("requires interactive mode", async () => {
		const harness = createExtensionHarness();
		filesExtension(harness.pi);
		harness.ctx.hasUI = false as never;

		await harness.commands.get("files").handler("", harness.ctx);

		expect(harness.notifications).toContainEqual({ msg: "Files requires interactive mode", type: "error" });
	});

	it("notifies when no files are found", async () => {
		const harness = createExtensionHarness();
		filesExtension(harness.pi);
		// Empty session branch + a cwd with no git repo yields no file entries.
		harness.ctx.sessionManager.getBranch = () => [] as never;

		await harness.commands.get("files").handler("", harness.ctx);

		expect(harness.notifications).toContainEqual({ msg: "No files found", type: "info" });
	});
});

describe("ctrl+shift+f shortcut", () => {
	it("warns when the session has no file reference", async () => {
		const harness = createExtensionHarness();
		filesExtension(harness.pi);
		harness.ctx.sessionManager.getBranch = () => [] as never;

		await harness.shortcuts.get("ctrl+shift+f").handler(harness.ctx);

		expect(harness.notifications).toContainEqual({ msg: "No file reference found in the session", type: "warning" });
	});
});
