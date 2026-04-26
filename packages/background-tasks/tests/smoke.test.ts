import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import backgroundTasksExtension from "../index.js";

describe("background tasks runtime smoke tests", () => {
	it("registers tools, commands, shortcuts, and message renderers", () => {
		const harness = createExtensionHarness();
		backgroundTasksExtension(harness.pi as never);

		expect(harness.tools.has("bg_task")).toBeTruthy();
		expect(harness.tools.has("bg_status")).toBeTruthy();
		expect(harness.tools.has("bash")).toBeFalsy();
		expect(harness.commands.has("bg")).toBeTruthy();
		expect(harness.shortcuts.has("ctrl+shift+b")).toBeTruthy();
		expect(harness.messageRenderers.has("pi-background-tasks:event")).toBeTruthy();
	});
});
