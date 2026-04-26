import { describe, expect, it } from "vitest";
import { type ExtensionOption, pickExtensions } from "./extension-picker.js";

function createMockStreams() {
	const stdoutChunks: string[] = [];
	const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
	const stdin = {
		isTTY: true,
		setRawMode: (_flag: boolean) => {},
		pause: () => {},
		removeListener: (_event: string, _handler: unknown) => {},
		on: (event: string, handler: (...args: unknown[]) => void) => {
			if (!listeners[event]) {
				listeners[event] = [];
			}
			listeners[event].push(handler);
		},
		listenerCount: (_event: string) => 0,
		emit: (event: string, ...args: unknown[]) => {
			for (const h of listeners[event] ?? []) {
				h(...args);
			}
		},
	} as unknown as NodeJS.ReadStream;
	const stdout = {
		write: (chunk: string) => {
			stdoutChunks.push(chunk);
		},
	} as unknown as NodeJS.WriteStream;
	return { stdin, stdout, stdoutChunks };
}

const OPTIONS: ExtensionOption[] = [
	{ value: "git-guard", label: "Git Guard", default: true },
	{ value: "auto-session-name", label: "Auto Session Name", default: true },
	{ value: "plan", label: "Plan Mode", default: false },
];

describe("pickExtensions", () => {
	it("returns defaults immediately in non-TTY", async () => {
		const { stdin, stdout } = createMockStreams();
		(stdin as any).isTTY = false;
		const result = await pickExtensions(OPTIONS, { stdin, stdout });
		expect(result).toEqual(["git-guard", "auto-session-name"]);
	});

	it("selects all on A and confirms", async () => {
		const { stdin, stdout } = createMockStreams();
		const promise = pickExtensions(OPTIONS, { stdin, stdout });

		// Simulate A then Enter after a microtask flush
		setTimeout(() => {
			(stdin as any).emit("keypress", "a", { name: "a", ctrl: false });
			(stdin as any).emit("keypress", "\r", { name: "return", ctrl: false });
		}, 10);

		const result = await promise;
		expect(result).toEqual(["git-guard", "auto-session-name", "plan"]);
	});

	it("deselects all on second A", async () => {
		const { stdin, stdout } = createMockStreams();
		const promise = pickExtensions(OPTIONS, { stdin, stdout });

		setTimeout(() => {
			(stdin as any).emit("keypress", "a", { name: "a", ctrl: false });
			(stdin as any).emit("keypress", "a", { name: "a", ctrl: false });
			(stdin as any).emit("keypress", "\r", { name: "return", ctrl: false });
		}, 10);

		const result = await promise;
		expect(result).toEqual([]);
	});

	it("toggles with space and confirms", async () => {
		const { stdin, stdout } = createMockStreams();
		const promise = pickExtensions(OPTIONS, { stdin, stdout });

		setTimeout(() => {
			// Move down to plan, toggle, confirm
			(stdin as any).emit("keypress", "j", { name: "down", ctrl: false });
			(stdin as any).emit("keypress", "j", { name: "down", ctrl: false });
			(stdin as any).emit("keypress", " ", { name: "space", ctrl: false });
			(stdin as any).emit("keypress", "\r", { name: "return", ctrl: false });
		}, 10);

		const result = await promise;
		expect(result).toContain("plan");
		expect(result).toContain("git-guard");
		expect(result).toContain("auto-session-name");
	});
});
