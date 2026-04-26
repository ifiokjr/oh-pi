
import { isNewer, runAutoUpdateCheck } from "./auto-update.js";

describe("auto-update helpers", () => {
	it("compares versions correctly", () => {
		expect(isNewer("1.2.0", "1.1.9")).toBeTruthy();
		expect(isNewer("1.1.9", "1.2.0")).toBeFalsy();
		expect(isNewer("1.0.0", "1.0.0")).toBeFalsy();
	});

	it("skips checks when the stamp is still fresh", async () => {
		const getCurrentVersion = vi.fn(async () => "1.0.0");
		const getLatestVersion = vi.fn(async () => "1.1.0");
		const writeStamp = vi.fn();

		const result = await runAutoUpdateCheck({
			getCurrentVersion,
			getLatestVersion,
			now: () => 1_000,
			readStamp: () => 900,
			writeStamp,
		});

		expect(result).toBeNull();
		expect(writeStamp).not.toHaveBeenCalled();
		expect(getCurrentVersion).not.toHaveBeenCalled();
		expect(getLatestVersion).not.toHaveBeenCalled();
	});

	it("notifies when a newer version is available", async () => {
		const notify = vi.fn();
		const writeStamp = vi.fn();

		const result = await runAutoUpdateCheck({
			getCurrentVersion: async () => "0.4.4",
			getLatestVersion: async () => "0.4.5",
			notify,
			now: () => 24 * 60 * 60 * 1000 + 1,
			readStamp: () => 0,
			writeStamp,
		});

		expect(result).toContain("0.4.5 available");
		expect(writeStamp).toHaveBeenCalledOnce();
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("0.4.5 available"));
	});

	it("does not notify when the installed version is current", async () => {
		const notify = vi.fn();

		const result = await runAutoUpdateCheck({
			getCurrentVersion: async () => "0.4.5",
			getLatestVersion: async () => "0.4.5",
			notify,
			now: () => 24 * 60 * 60 * 1000 + 1,
			readStamp: () => 0,
			writeStamp: vi.fn(),
		});

		expect(result).toBeNull();
		expect(notify).not.toHaveBeenCalled();
	});

	it("awaits async version lookups without blocking the call site contract", async () => {
		const sequence: string[] = [];

		const result = await runAutoUpdateCheck({
			getCurrentVersion: async () => {
				sequence.push("current:start");
				await Promise.resolve();
				sequence.push("current:end");
				return "0.4.4";
			},
			getLatestVersion: async () => {
				sequence.push("latest:start");
				await Promise.resolve();
				sequence.push("latest:end");
				return "0.4.5";
			},
			now: () => 24 * 60 * 60 * 1000 + 1,
			readStamp: () => 0,
			writeStamp: () => {
				sequence.push("write-stamp");
			},
		});

		expect(result).toContain("0.4.5 available");
		expect(sequence).toStrictEqual(["write-stamp", "current:start", "latest:start", "current:end", "latest:end"]);
	});
});
