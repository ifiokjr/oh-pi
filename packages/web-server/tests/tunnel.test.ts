import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const childProcess = vi.hoisted(() => ({
	execFileSync: vi.fn(),
	spawn: vi.fn(),
}));

vi.mock("node:child_process", () => childProcess);

import { detectTunnelProvider, startTunnel } from "../src/tunnel.js";

type MockProc = EventEmitter & {
	stdout: EventEmitter;
	stderr: EventEmitter;
	kill: ReturnType<typeof vi.fn>;
};

function createMockProcess(): MockProc {
	const proc = new EventEmitter() as MockProc;
	proc.stdout = new EventEmitter();
	proc.stderr = new EventEmitter();
	proc.kill = vi.fn();
	return proc;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("detectTunnelProvider", () => {
	it("prefers cloudflared when available", () => {
		childProcess.execFileSync.mockImplementation((command: string) => {
			if (command === "which") {
				return "";
			}
			throw new Error("unexpected command");
		});

		expect(detectTunnelProvider()).toBe("cloudflared");
		expect(childProcess.execFileSync).toHaveBeenCalledWith("which", ["cloudflared"], { stdio: "ignore" });
	});

	it("falls back to tailscale when cloudflared is unavailable", () => {
		childProcess.execFileSync
			.mockImplementationOnce(() => {
				throw new Error("missing cloudflared");
			})
			.mockImplementationOnce(() => "");

		expect(detectTunnelProvider()).toBe("tailscale");
	});

	it("returns undefined when no provider is installed", () => {
		childProcess.execFileSync.mockImplementation(() => {
			throw new Error("missing");
		});

		expect(detectTunnelProvider()).toBeUndefined();
	});
});

describe("startTunnel", () => {
	it("rejects when no tunnel provider is available", async () => {
		childProcess.execFileSync.mockImplementation(() => {
			throw new Error("missing");
		});

		await expect(startTunnel(3100)).rejects.toThrow("No tunnel provider found");
	});

	it("starts a cloudflared tunnel and returns a stop handle", async () => {
		const proc = createMockProcess();
		childProcess.spawn.mockReturnValue(proc);

		const tunnelPromise = startTunnel(3100, "cloudflared");
		proc.stderr.emit("data", Buffer.from("Visit https://quiet-river.trycloudflare.com now"));
		const tunnel = await tunnelPromise;

		expect(childProcess.spawn).toHaveBeenCalledWith("cloudflared", ["tunnel", "--url", "http://localhost:3100"], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		expect(tunnel).toEqual({
			publicUrl: "https://quiet-river.trycloudflare.com",
			provider: "cloudflared",
			stop: expect.any(Function),
		});

		tunnel.stop();
		expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
	});

	it("starts a tailscale tunnel from stdout output", async () => {
		const proc = createMockProcess();
		childProcess.spawn.mockReturnValue(proc);

		const tunnelPromise = startTunnel(4200, "tailscale");
		proc.stdout.emit("data", Buffer.from("open https://pi.tailnet.example.ts.net for access"));
		const tunnel = await tunnelPromise;

		expect(childProcess.spawn).toHaveBeenCalledWith("tailscale", ["funnel", "4200"], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		expect(tunnel.publicUrl).toBe("https://pi.tailnet.example.ts.net");
		expect(tunnel.provider).toBe("tailscale");
	});

	it("surfaces tunnel process failures", async () => {
		const proc = createMockProcess();
		childProcess.spawn.mockReturnValue(proc);

		const cloudflaredFailure = startTunnel(3100, "cloudflared");
		proc.emit("exit", 1);
		await expect(cloudflaredFailure).rejects.toThrow("cloudflared exited with code 1");

		const tailscaleProc = createMockProcess();
		childProcess.spawn.mockReturnValue(tailscaleProc);
		const tailscaleFailure = startTunnel(3100, "tailscale");
		tailscaleProc.emit("error", new Error("spawn failed"));
		await expect(tailscaleFailure).rejects.toThrow("spawn failed");
	});

	it("times out stalled tunnel startups", async () => {
		vi.useFakeTimers();
		const proc = createMockProcess();
		childProcess.spawn.mockReturnValue(proc);

		const tunnelPromise = startTunnel(3100, "cloudflared");
		const rejection = expect(tunnelPromise).rejects.toThrow("Cloudflare tunnel timed out after 30s");
		await vi.advanceTimersByTimeAsync(30_000);
		await rejection;
	});
});
