import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import diagnosticsExtension from "../index.js";

describe("diagnostics runtime smoke tests", () => {
	it("registers diagnostics surfaces without crashing", () => {
		const harness = createExtensionHarness();
		diagnosticsExtension(harness.pi as never);

		expect(harness.commands.has("diagnostics")).toBeTruthy();
		expect(harness.shortcuts.has("ctrl+shift+d")).toBeTruthy();
		expect(harness.messageRenderers.has("pi-diagnostics:prompt")).toBeTruthy();
	});
});
