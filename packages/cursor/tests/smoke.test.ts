import { describe, expect, it } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import cursorProviderExtension from "../index.js";

describe("cursor provider smoke tests", () => {
	it("registers the cursor provider and command without crashing", () => {
		const harness = createExtensionHarness();
		cursorProviderExtension(harness.pi as never);

		expect(harness.commands.has("cursor")).toBe(true);
		expect(harness.providers.has("cursor")).toBe(true);
	});
});
