import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import providerCatalogExtension from "../index.js";

describe("provider catalog smoke tests", () => {
	it("registers the catalog command without crashing", () => {
		const harness = createExtensionHarness();
		providerCatalogExtension(harness.pi as never);

		expect(harness.commands.has("providers")).toBeTruthy();
		expect(harness.commands.has("providers:login")).toBeTruthy();
	});
});
