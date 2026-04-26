import { describe, expect, it } from "vitest";
import { createFileCoalescer } from "../file-coalescer.js";

type TimerTask = { id: number; cb: () => void; delay: number };

function createFakeTimers() {
	let nextId = 1;
	const tasks = new Map<number, TimerTask>();

	return {
		timerApi: {
			setTimeout(handler: () => void, delayMs: number): unknown {
				const id = nextId++;
				tasks.set(id, { id, cb: handler, delay: delayMs });
				return id;
			},
			clearTimeout(handle: unknown): void {
				if (typeof handle === "number") {
					tasks.delete(handle);
				}
			},
		},
		runAll(): void {
			const batch = Array.from(tasks.values()).sort((a, b) => a.id - b.id);
			tasks.clear();
			for (const task of batch) {
				task.cb();
			}
		},
		pendingCount(): number {
			return tasks.size;
		},
	};
}

describe("createFileCoalescer", () => {
	it("coalesces duplicate schedule calls per file", () => {
		const events: string[] = [];
		const timers = createFakeTimers();
		const coalescer = createFileCoalescer((file) => events.push(file), 50, timers.timerApi);
		expect(coalescer.schedule("a.json")).toBe(true);
		expect(coalescer.schedule("a.json")).toBe(false);
		expect(timers.pendingCount()).toBe(1);
		timers.runAll();
		expect(events).toEqual(["a.json"]);
		expect(coalescer.schedule("a.json")).toBe(true);
	});

	it("allows different files to schedule independently", () => {
		const events: string[] = [];
		const timers = createFakeTimers();
		const coalescer = createFileCoalescer((file) => events.push(file), 50, timers.timerApi);
		coalescer.schedule("a.json");
		coalescer.schedule("b.json");
		expect(timers.pendingCount()).toBe(2);
		timers.runAll();
		expect(events.sort()).toEqual(["a.json", "b.json"]);
	});

	it("clear cancels all pending handlers", () => {
		const events: string[] = [];
		const timers = createFakeTimers();
		const coalescer = createFileCoalescer((file) => events.push(file), 50, timers.timerApi);
		coalescer.schedule("a.json");
		coalescer.schedule("b.json");
		expect(timers.pendingCount()).toBe(2);
		coalescer.clear();
		expect(timers.pendingCount()).toBe(0);
		timers.runAll();
		expect(events).toEqual([]);
	});
});
