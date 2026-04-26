import { pickExtensions } from "./extension-picker.js";
import type { ExtensionOption } from "./extension-picker.js";

function createMockStreams() {
	const stdoutChunks: string[] = [];
	const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
	const stdin = {
		emit: (event: string, ...args: unknown[]) => {
			for (const h of listeners[event] ?? []) {
				h(...args);
			}
		},
		isTTY: true,
		listenerCount: (_event: string) => 0,
		on: (event: string, handler: (...args: unknown[]) => void) => {
			if (!listeners[event]) {
				listeners[event] = [];
			}
			listeners[event].push(handler);
		},
		pause: () => {},
		removeListener: (_event: string, _handler: unknown) => {},
		setRawMode: (_flag: boolean) => {},
	} as unknown as NodeJS.ReadStream;
	const stdout = {
		write: (chunk: string) => {
			stdoutChunks.push(chunk);
		},
	} as unknown as NodeJS.WriteStream;
	return { stdin, stdout, stdoutChunks };
}

const OPTIONS: ExtensionOption[] = [
	{ default: true, label: "Git Guard", value: "git-guard" },
	{ default: true, label: "Auto Session Name", value: "auto-session-name" },
	{ default: false, label: "Plan Mode", value: "plan" },
];

describe(pickExtensions, () => {
	it("returns defaults immediately in non-TTY", async () => {
		const { stdin, stdout } = createMockStreams();
		(stdin as any).isTTY = false;
		const result = await pickExtensions(OPTIONS, { stdin, stdout });
		expect(result).toStrictEqual(["git-guard", "auto-session-name"]);
	});

	it("selects all on A and confirms", async () => {
		const { stdin, stdout } = createMockStreams();
		const promise = pickExtensions(OPTIONS, { stdin, stdout });

		// Simulate A then Enter after a microtask flush
		setTimeout(() => {
			(stdin as any).emit("keypress", "a", { ctrl: false, name: "a" });
			(stdin as any).emit("keypress", "\r", { ctrl: false, name: "return" });
		}, 10);

		const result = await promise;
		expect(result).toStrictEqual(["git-guard", "auto-session-name", "plan"]);
	});

	it("deselects all on second A", async () => {
		const { stdin, stdout } = createMockStreams();
		const promise = pickExtensions(OPTIONS, { stdin, stdout });

		setTimeout(() => {
			(stdin as any).emit("keypress", "a", { ctrl: false, name: "a" });
			(stdin as any).emit("keypress", "a", { ctrl: false, name: "a" });
			(stdin as any).emit("keypress", "\r", { ctrl: false, name: "return" });
		}, 10);

		const result = await promise;
		expect(result).toStrictEqual([]);
	});

	it("toggles with space and confirms", async () => {
		const { stdin, stdout } = createMockStreams();
		const promise = pickExtensions(OPTIONS, { stdin, stdout });

		setTimeout(() => {
			// Move down to plan, toggle, confirm
			(stdin as any).emit("keypress", "j", { ctrl: false, name: "down" });
			(stdin as any).emit("keypress", "j", { ctrl: false, name: "down" });
			(stdin as any).emit("keypress", " ", { ctrl: false, name: "space" });
			(stdin as any).emit("keypress", "\r", { ctrl: false, name: "return" });
		}, 10);

		const result = await promise;
		expect(result).toContain("plan");
		expect(result).toContain("git-guard");
		expect(result).toContain("auto-session-name");
	});

	it("toggles off a pre-selected item with space", async () => {
		const { stdin, stdout } = createMockStreams();
		const promise = pickExtensions(OPTIONS, { stdin, stdout });

		setTimeout(() => {
			// Cursor starts at 0 (git-guard, pre-selected). Toggle off.
			(stdin as any).emit("keypress", " ", { ctrl: false, name: "space" });
			(stdin as any).emit("keypress", "\r", { ctrl: false, name: "return" });
		}, 10);

		const result = await promise;
		expect(result).not.toContain("git-guard");
		expect(result).toContain("auto-session-name");
	});
});
