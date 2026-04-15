import { describe, expect, it } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import providerCatalogExtension from "../index.js";

describe("provider catalog smoke tests", () => {
	it("registers the multi-provider catalog extension without crashing", () => {
		const harness = createExtensionHarness();
		providerCatalogExtension(harness.pi as never);

		expect(harness.commands.has("providers")).toBe(true);
		expect(harness.providers.has("opencode")).toBe(true);
		expect(harness.providers.has("opencode-go")).toBe(true);
		expect(harness.providers.has("moonshotai")).toBe(true);
		expect(harness.providers.has("xai")).toBe(true);
	});
});
