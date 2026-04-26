import { describe, expect, it } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import diagnosticsExtension from "../index.js";

describe("diagnostics runtime smoke tests", () => {
	it("registers diagnostics surfaces without crashing", () => {
		const harness = createExtensionHarness();
		diagnosticsExtension(harness.pi as never);

		expect(harness.commands.has("diagnostics")).toBe(true);
		expect(harness.shortcuts.has("ctrl+shift+d")).toBe(true);
		expect(harness.messageRenderers.has("pi-diagnostics:prompt")).toBe(true);
	});
});
