
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import schedulerExtension from "./scheduler.js";

describe("scheduler overlay picker", () => {
	it("uses a scrollable overlay capped at 75% height for the task manager", async () => {
		const harness = createExtensionHarness();
		schedulerExtension(harness.pi as never);

		await harness.commands.get("loop").handler("5m check api health", harness.ctx);
		await harness.commands.get("loop").handler("10m check worker backlog", harness.ctx);

		let pickerFactory: any;
		harness.ctx.ui.custom = vi.fn(async (factory: any) => {
			pickerFactory = factory;
			return { kind: "close" };
		}) as never;

		await harness.commands.get("schedule").handler("", harness.ctx);

		expect(harness.ctx.ui.custom).toHaveBeenCalledWith(expect.any(Function), {
			overlay: true,
			overlayOptions: {
				anchor: "center",
				maxHeight: "75%",
				width: "80%",
			},
		});

		const picker = pickerFactory(
			{ requestRender: vi.fn() },
			{ bold: (text: string) => text, fg: (_color: string, text: string) => text },
			{},
			() => {},
		);
		const rendered = picker.render(140).join("\n");
		expect(rendered).toContain("Scheduled tasks for");
		expect(rendered).toContain("Enter manages the selected task");
		expect(rendered).toContain("🗑 Clear all");
		expect(rendered).toContain("+ Close");
	});

	it("opens task actions after selecting a task from the overlay", async () => {
		const harness = createExtensionHarness();
		schedulerExtension(harness.pi as never);

		const prompt = "check the full deployment pipeline and report every failing stage";
		await harness.commands.get("loop").handler(`5m ${prompt}`, harness.ctx);

		harness.ctx.ui.custom = vi
			.fn()
			.mockImplementationOnce(async () => {
				const listResult = await harness.tools.get("schedule_prompt").execute("id", { action: "list" });
				return { kind: "task", taskId: listResult.details.tasks[0].id };
			})
			.mockResolvedValueOnce({ kind: "close" }) as never;
		harness.ctx.ui.select = vi.fn(async () => "↩ Back") as never;

		await harness.commands.get("schedule").handler("", harness.ctx);

		expect(harness.ctx.ui.select).toHaveBeenCalledWith(
			expect.stringContaining(`Prompt: ${prompt}`),
			expect.arrayContaining(["↩ Back"]),
		);
	});

	it("can clear all tasks through the overlay picker result", async () => {
		const harness = createExtensionHarness();
		schedulerExtension(harness.pi as never);

		await harness.commands.get("loop").handler("5m check api health", harness.ctx);
		await harness.commands.get("loop").handler("10m check worker backlog", harness.ctx);

		harness.ctx.ui.custom = vi.fn(async () => ({ kind: "clear-all" })) as never;
		harness.ctx.ui.confirm = vi.fn(async () => true) as never;

		await harness.commands.get("schedule").handler("", harness.ctx);

		expect(harness.notifications.some((item) => item.msg.includes("Cleared 2 scheduled tasks."))).toBeTruthy();
	});

	it("can clear tasks not created here through the overlay picker result", async () => {
		const harness = createExtensionHarness();
		schedulerExtension(harness.pi as never);

		await harness.commands.get("loop").handler("5m check local queue", harness.ctx);
		await harness.commands.get("loop").handler("10m check foreign queue", harness.ctx);

		const listResult = await harness.tools.get("schedule_prompt").execute("id", { action: "list" });
		const foreignTask = listResult.details.tasks.find((task: any) => task.prompt.includes("foreign queue"));
		foreignTask.creatorInstanceId = "foreign-instance";
		foreignTask.creatorSessionId = "/mock-home/.pi/agent/sessions/foreign.jsonl";

		harness.ctx.ui.custom = vi
			.fn()
			.mockResolvedValueOnce({ kind: "clear-other" })
			.mockResolvedValueOnce({ kind: "close" }) as never;
		harness.ctx.ui.confirm = vi.fn(async () => true) as never;

		await harness.commands.get("schedule").handler("", harness.ctx);

		expect(
			harness.notifications.some((item) => item.msg.includes("Cleared 1 scheduled task not created in this instance.")),
		).toBeTruthy();
	});
});
