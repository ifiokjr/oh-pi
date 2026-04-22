import { describe, expect, it, vi } from "vitest";
import {
	buildPublicUrl,
	buildServeArgs,
	buildServeOffArgs,
	buildServePath,
	getTailscaleHostname,
	isTailscaleAvailable,
	parseHostname,
	sanitizeInstanceId,
	serveOff,
	startTailscaleServe,
} from "../src/tailscale.js";

describe("tailscale helpers", () => {
	it("sanitizes instance ids and builds path-aware URLs", () => {
		expect(sanitizeInstanceId(" Fancy Session/42 ")).toBe("fancy-session-42");
		expect(sanitizeInstanceId("///")).toBe("session");
		expect(buildServePath("Fancy Session/42")).toBe("/pi/fancy-session-42/");
		expect(buildPublicUrl("test.tailnet.ts.net", "/pi/fancy-session-42/")).toBe(
			"https://test.tailnet.ts.net/pi/fancy-session-42/",
		);
		expect(buildPublicUrl("test.tailnet.ts.net", "pi/fancy-session-42/")).toBe(
			"https://test.tailnet.ts.net/pi/fancy-session-42/",
		);
		expect(buildServeArgs(3210, "/pi/fancy-session-42/")).toEqual([
			"serve",
			"--bg",
			"--https",
			"443",
			"--set-path",
			"/pi/fancy-session-42/",
			"http://127.0.0.1:3210",
		]);
		expect(buildServeOffArgs("/pi/fancy-session-42/")).toEqual([
			"serve",
			"--https",
			"443",
			"--set-path",
			"/pi/fancy-session-42/",
			"off",
		]);
	});

	it("parses hostnames from tailscale status output", () => {
		expect(parseHostname('{"Self":{"DNSName":"pi.tailnet.ts.net."}}')).toBe("pi.tailnet.ts.net");
		expect(parseHostname('{"Self":{"HostName":"fallback-host"}}')).toBe("fallback-host");
		expect(parseHostname('{"Self":{}}')).toBeUndefined();
	});

	it("detects tailscale availability and resolves the hostname", async () => {
		const availableRunner = vi.fn(async (command: string, args: string[]) => {
			if (command === "which") {
				return { exitCode: 0, stderr: "", stdout: "/usr/local/bin/tailscale\n" };
			}
			if (command === "tailscale" && args[0] === "status") {
				return { exitCode: 0, stderr: "", stdout: '{"Self":{"DNSName":"pi.tailnet.ts.net."}}' };
			}
			throw new Error("unexpected command");
		});

		expect(await isTailscaleAvailable(availableRunner)).toBe(true);
		expect(await getTailscaleHostname(availableRunner)).toBe("pi.tailnet.ts.net");
		await expect(
			getTailscaleHostname(async () => ({ exitCode: 0, stderr: "", stdout: '{"Self":{}}' })),
		).rejects.toThrow("Unable to determine the Tailscale hostname.");
	});

	it("reports tailscale as unavailable when which fails", async () => {
		const unavailableRunner = vi.fn(async () => {
			throw new Error("not found");
		});

		expect(await isTailscaleAvailable(unavailableRunner)).toBe(false);
	});

	it("starts a tailscale serve session and stops it idempotently", async () => {
		const runner = vi.fn(async (command: string, args: string[]) => {
			if (command === "which") {
				return { exitCode: 0, stderr: "", stdout: "/usr/local/bin/tailscale\n" };
			}
			if (command === "tailscale" && args[0] === "status") {
				return { exitCode: 0, stderr: "", stdout: '{"Self":{"DNSName":"pi.tailnet.ts.net."}}' };
			}
			return { exitCode: 0, stderr: "", stdout: "" };
		});

		const session = await startTailscaleServe({ instanceId: "session-42", port: 3100, runner });
		await session.stop();
		await session.stop();

		expect(session.publicUrl).toBe("https://pi.tailnet.ts.net/pi/session-42/");
		expect(runner.mock.calls).toEqual([
			["which", ["tailscale"]],
			["tailscale", ["status", "--json"]],
			[
				"tailscale",
				["serve", "--bg", "--https", "443", "--set-path", "/pi/session-42/", "http://127.0.0.1:3100"],
			],
			["tailscale", ["serve", "--https", "443", "--set-path", "/pi/session-42/", "off"]],
		]);
	});

	it("supports custom hostnames and custom serve paths", async () => {
		const runner = vi.fn(async (command: string) => {
			if (command === "which") {
				return { exitCode: 0, stderr: "", stdout: "/usr/local/bin/tailscale\n" };
			}
			return { exitCode: 0, stderr: "", stdout: "" };
		});

		const session = await startTailscaleServe({
			hostname: "custom.tailnet.ts.net",
			instanceId: "ignored",
			port: 9000,
			runner,
			servePath: "/pi/custom/",
		});

		expect(session.publicUrl).toBe("https://custom.tailnet.ts.net/pi/custom/");
	});

	it("can disable a serve path directly", async () => {
		const runner = vi.fn(async () => ({ exitCode: 0, stderr: "", stdout: "" }));
		await serveOff("/pi/direct/", runner);
		expect(runner).toHaveBeenCalledWith("tailscale", ["serve", "--https", "443", "--set-path", "/pi/direct/", "off"]);
	});

	it("throws when tailscale is unavailable", async () => {
		await expect(
			startTailscaleServe({
				instanceId: "session-42",
				port: 3100,
				runner: async () => {
					throw new Error("missing");
				},
			}),
		).rejects.toThrow("Tailscale is not installed or not on PATH.");
	});
});
