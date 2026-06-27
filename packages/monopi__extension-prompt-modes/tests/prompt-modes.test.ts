import { describe, expect, it } from "vitest";

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import promptModesExtension from "../index.js";

describe("prompt-modes extension registration", () => {
	it("registers the /mode command and shortcuts", () => {
		const harness = createExtensionHarness();
		promptModesExtension(harness.pi);

		expect(Array.from(harness.commands.keys()).sort()).toEqual(["mode"]);
		expect(Array.from(harness.shortcuts.keys()).sort()).toEqual(["ctrl+shift+m", "ctrl+space"]);
	});

	it("exposes the mode command handler and shortcut handlers", () => {
		const harness = createExtensionHarness();
		promptModesExtension(harness.pi);

		expect(typeof harness.commands.get("mode").handler).toBe("function");
		expect(typeof harness.shortcuts.get("ctrl+shift+m").handler).toBe("function");
		expect(typeof harness.shortcuts.get("ctrl+space").handler).toBe("function");
	});
});
