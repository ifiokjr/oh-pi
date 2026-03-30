import { describe, expect, it } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import specExtension from "../extension/index.js";

describe("spec runtime smoke tests", () => {
	it("registers the spec command and report renderer without crashing", () => {
		const harness = createExtensionHarness();
		specExtension(harness.pi as never);

		expect(harness.commands.has("spec")).toBe(true);
		expect(harness.messageRenderers.has("pi-spec-report")).toBe(true);
	});
});
