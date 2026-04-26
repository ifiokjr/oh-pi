import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import planExtension from "../index.js";

describe("plan extension startup refresh", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("defers session_start plan refresh until after the startup window", async () => {
		const harness = createExtensionHarness();
		harness.ctx.ui.setWidget = vi.fn();
		harness.ctx.sessionManager.getEntries = () => [
			{
				customType: "pi-plan:state",
				data: {
					active: true,
					planFilePath: "/tmp/session.plan.md",
					version: 1,
				},
				type: "custom",
			},
		];

		planExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		expect(harness.ctx.ui.setWidget).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(250);
		expect(harness.ctx.ui.setWidget).toHaveBeenCalledWith(
			"pi-plan-banner",
			expect.any(Function),
			expect.objectContaining({ placement: "aboveEditor" }),
		);
	});

	it("cancels deferred session_start refresh on session_shutdown", async () => {
		const harness = createExtensionHarness();
		harness.ctx.ui.setWidget = vi.fn();
		harness.ctx.sessionManager.getEntries = () => [
			{
				customType: "pi-plan:state",
				data: {
					active: true,
					planFilePath: "/tmp/session.plan.md",
					version: 1,
				},
				type: "custom",
			},
		];

		planExtension(harness.pi as never);
		harness.emit("session_start", { type: "session_start" }, harness.ctx);
		harness.emit("session_shutdown", { type: "session_shutdown" }, harness.ctx);
		await vi.advanceTimersByTimeAsync(250);

		expect(harness.ctx.ui.setWidget).not.toHaveBeenCalled();
	});
});
