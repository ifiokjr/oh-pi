import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@mariozechner/pi-coding-agent", async () => {
	const actual = await vi.importActual<typeof import("@mariozechner/pi-coding-agent")>("@mariozechner/pi-coding-agent");
	return {
		...actual,
		createBashTool: vi.fn().mockReturnValue({
			name: "bash",
			label: "bash",
			description: "test bash",
			execute: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "output" }] }),
		}),
	};
});

const mockRegisterTool = vi.fn();
const mockExtensionAPI = {
	registerTool: mockRegisterTool,
};

describe("enhanceBashTool", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers pretty bash as a separate tool", async () => {
		const { PRETTY_BASH_TOOL, enhanceBashTool } = await import("../src/bash.js");
		enhanceBashTool(mockExtensionAPI as any);
		expect(mockRegisterTool).toHaveBeenCalledWith(expect.objectContaining({ name: PRETTY_BASH_TOOL }));
	});

	it("returns enhanced content for exit code 0", async () => {
		const { enhanceBashTool } = await import("../src/bash.js");
		enhanceBashTool(mockExtensionAPI as any);
		const toolConfig = mockRegisterTool.mock.calls[0][0];

		const result = await toolConfig.execute(
			"tc1",
			{ command: "echo ok", timeout: 5, usePTY: false },
			new AbortController().signal,
			vi.fn(),
			{},
		);

		expect(result.content[0].text).toContain("✓");
		expect(result.content[0].text).toContain("exit 0");
	});
});
