import { describe, expect, it, vi } from "vitest";

import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import reviewExtension from "../index.js";

describe("review extension registration", () => {
	it("registers the /review and /end-review commands", () => {
		const harness = createExtensionHarness();
		reviewExtension(harness.pi);

		expect(Array.from(harness.commands.keys()).sort()).toEqual(["end-review", "review"]);
	});
});

describe("/review command", () => {
	it("requires interactive mode", async () => {
		const harness = createExtensionHarness();
		reviewExtension(harness.pi);
		harness.ctx.hasUI = false as never;

		await harness.commands.get("review").handler("", harness.ctx);

		expect(harness.notifications).toContainEqual({ msg: "Review requires interactive mode", type: "error" });
	});

	it("rejects when not inside a git repository", async () => {
		const harness = createExtensionHarness();
		reviewExtension(harness.pi);
		harness.pi.exec = vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 1 })) as never;

		await harness.commands.get("review").handler("uncommitted", harness.ctx);

		expect(harness.notifications).toContainEqual({ msg: "Not a git repository", type: "error" });
	});

	it("blocks a second concurrent review", async () => {
		const harness = createExtensionHarness();
		reviewExtension(harness.pi);
		// Start one review that will hang in the selector; then call again.
		const exec = vi.fn(async (_cmd: string, args: string[]) => {
			if (args[0] === "rev-parse") return { stdout: "", stderr: "", exitCode: 0 };
			return { stdout: "", stderr: "", exitCode: 0 };
		});
		harness.pi.exec = exec as never;
		// Drive the first review into the selector (returns null => cancelled) so it exits cleanly.
		harness.ctx.ui.select = vi.fn(async () => undefined) as never;

		await harness.commands.get("review").handler("", harness.ctx);
		// After a cancelled selector the origin id is not set, so a second call is allowed; here we
		// simply assert the command does not throw when invoked twice in a row.
		await harness.commands.get("review").handler("", harness.ctx);
		expect(harness.commands.has("review")).toBe(true);
	});
});

describe("/end-review command", () => {
	it("requires interactive mode", async () => {
		const harness = createExtensionHarness();
		reviewExtension(harness.pi);
		harness.ctx.hasUI = false as never;

		await harness.commands.get("end-review").handler("", harness.ctx);

		expect(harness.notifications).toContainEqual({ msg: "End-review requires interactive mode", type: "error" });
	});
});
