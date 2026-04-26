
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";

vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), async () => {
	const actual = await vi.importActual<typeof import("@mariozechner/pi-coding-agent")>("@mariozechner/pi-coding-agent");
	return {
		...actual,
		createBashTool: vi.fn(() => ({
			description: "Built-in bash",
			execute: vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] })),
			label: "Bash",
			name: "bash",
			renderCall: undefined,
			renderResult: undefined,
		})),
	};
});

import backgroundTasksExtension from "../../background-tasks/index.js";
import bashLiveViewExtension, { BASH_LIVE_VIEW_TOOL } from "../index.js";
import { enhanceBashTool, PRETTY_BASH_TOOL } from "../../pi-pretty/src/bash.js";

describe("bash tool conflict regression", () => {
	it("registers distinct tool names across background, live-view, and pretty extensions", () => {
		const harness = createExtensionHarness();
		const registeredToolNames: string[] = [];
		const registerTool = harness.pi.registerTool.bind(harness.pi);
		harness.pi.registerTool = ((tool: { name: string }) => {
			registeredToolNames.push(tool.name);
			registerTool(tool);
		}) as typeof harness.pi.registerTool;

		backgroundTasksExtension(harness.pi as never);
		bashLiveViewExtension(harness.pi as never);
		enhanceBashTool(harness.pi as never);

		expect(harness.tools.has("bg_task")).toBeTruthy();
		expect(harness.tools.has("bg_status")).toBeTruthy();
		expect(harness.tools.has(BASH_LIVE_VIEW_TOOL)).toBeTruthy();
		expect(harness.tools.has(PRETTY_BASH_TOOL)).toBeTruthy();
		expect(harness.tools.has("bash")).toBeFalsy();

		const duplicateToolNames = registeredToolNames.filter((name, index) => registeredToolNames.indexOf(name) !== index);
		expect(duplicateToolNames).toStrictEqual([]);
	});
});
