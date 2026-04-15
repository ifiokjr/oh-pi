import { describe, expect, it, vi } from "vitest";
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";

const worktreeShared = vi.hoisted(() => ({
	buildPaiInstanceId: vi.fn(() => "pi-test-instance"),
	createManagedWorktree: vi.fn(),
	createOwnerMetadata: vi.fn((input) => ({
		instanceId: input.instanceId,
		hostname: "test-host",
		pid: 123,
		createdFromCwd: input.cwd,
		sessionFile: input.sessionFile ?? null,
		sessionId: "session-1",
		sessionName: input.sessionName ?? null,
	})),
	formatOwnerLabel: vi.fn((owner) => owner.instanceId),
	formatWorktreeKind: vi.fn((entry) => (entry.isMain ? "main" : entry.isManaged ? "pi-owned" : "external")),
	getRepoWorktreeSnapshot: vi.fn(),
	removeManagedWorktree: vi.fn(),
	touchManagedWorktreeSeen: vi.fn(),
}));

vi.mock("./worktree-shared", () => worktreeShared);

import worktreeExtension from "./worktree.js";

function makeSnapshot(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		repoRoot: "/repo",
		currentWorktreeRoot: "/repo",
		mainWorktreeRoot: "/repo",
		commonDir: "/repo/.git",
		gitDir: "/repo/.git",
		currentBranch: "main",
		isLinkedWorktree: false,
		current: null,
		registry: { managedWorktrees: [] },
		staleManagedWorktrees: [],
		worktrees: [
			{
				path: "/repo",
				branch: "main",
				head: "abc",
				bare: false,
				detached: false,
				lockedReason: null,
				prunableReason: null,
				isMain: true,
				isCurrent: true,
				isManaged: false,
				metadata: null,
			},
		],
		...overrides,
	};
}

describe("worktree extension", () => {
	it("registers lowercase and convenience aliases", () => {
		const harness = createExtensionHarness();
		worktreeExtension(harness.pi as never);
		expect(harness.commands.has("worktree")).toBe(true);
		expect(harness.commands.has("Worktree")).toBe(true);
		expect(harness.commands.has("wt")).toBe(true);
	});

	it("creates a pi-owned worktree and reports owner + purpose metadata", async () => {
		const harness = createExtensionHarness();
		harness.ctx.cwd = "/repo";
		harness.ctx.ui.input = vi.fn(async () => "Implement footer context");
		worktreeShared.getRepoWorktreeSnapshot.mockReturnValue(null);
		worktreeShared.createManagedWorktree.mockReturnValue({
			repoRoot: "/repo",
			worktreePath: "/tmp/pi/feat-footer",
			branch: "feat/footer-context",
			createdBranch: true,
			metadata: {
				purpose: "Implement footer context",
				owner: { instanceId: "pi-test-instance", sessionId: "session-1", sessionName: null },
			},
		});

		worktreeExtension(harness.pi as never);
		await harness.commands.get("worktree").handler("create feat/footer-context", harness.ctx);

		expect(worktreeShared.createManagedWorktree).toHaveBeenCalledWith(
			expect.objectContaining({
				cwd: "/repo",
				branch: "feat/footer-context",
				purpose: "Implement footer context",
			}),
		);
		expect(harness.notifications.at(-1)?.msg).toContain("Created pi-owned worktree feat/footer-context");
		expect(String(harness.messages.at(-1)?.content)).toContain("Owner instance: pi-test-instance");
		expect(String(harness.messages.at(-1)?.content)).toContain("Purpose: Implement footer context");
	});

	it("opens a matching worktree through the system opener helper", async () => {
		const harness = createExtensionHarness();
		harness.ctx.cwd = "/repo";
		worktreeShared.getRepoWorktreeSnapshot.mockReturnValue(
			makeSnapshot({
				isLinkedWorktree: true,
				currentWorktreeRoot: "/tmp/pi/feat-footer",
				currentBranch: "feat/footer-context",
				current: {
					path: "/tmp/pi/feat-footer",
					branch: "feat/footer-context",
					head: "abc",
					bare: false,
					detached: false,
					lockedReason: null,
					prunableReason: null,
					isMain: false,
					isCurrent: true,
					isManaged: true,
					metadata: { purpose: "Build worktree UX", owner: { instanceId: "pi-test-instance" } },
				},
				worktrees: [
					{
						path: "/repo",
						branch: "main",
						head: "abc",
						bare: false,
						detached: false,
						lockedReason: null,
						prunableReason: null,
						isMain: true,
						isCurrent: false,
						isManaged: false,
						metadata: null,
					},
					{
						path: "/tmp/pi/feat-footer",
						branch: "feat/footer-context",
						head: "abc",
						bare: false,
						detached: false,
						lockedReason: null,
						prunableReason: null,
						isMain: false,
						isCurrent: true,
						isManaged: true,
						metadata: { purpose: "Build worktree UX", owner: { instanceId: "pi-test-instance" } },
					},
				],
			}),
		);
		harness.pi.exec = vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 }));

		worktreeExtension(harness.pi as never);
		await harness.commands.get("worktree").handler("open feat/footer-context", harness.ctx);

		expect(harness.pi.exec).toHaveBeenCalled();
		expect(harness.notifications.at(-1)?.msg).toContain("Opened /tmp/pi/feat-footer");
		expect(String(harness.messages.at(-1)?.content)).toContain("/worktree open");
	});

	it("refuses to clean external worktrees by default", async () => {
		const harness = createExtensionHarness();
		harness.ctx.cwd = "/repo";
		worktreeShared.getRepoWorktreeSnapshot.mockReturnValue(
			makeSnapshot({
				worktrees: [
					{
						path: "/tmp/manual",
						branch: "feat/manual",
						head: "abc",
						bare: false,
						detached: false,
						lockedReason: null,
						prunableReason: null,
						isMain: false,
						isCurrent: false,
						isManaged: false,
						metadata: null,
					},
				],
			}),
		);

		worktreeExtension(harness.pi as never);
		await harness.commands.get("worktree").handler("cleanup feat/manual", harness.ctx);

		expect(worktreeShared.removeManagedWorktree).not.toHaveBeenCalled();
		expect(harness.notifications.at(-1)?.msg).toContain("pi only cleans pi-owned worktrees by default");
	});
});
