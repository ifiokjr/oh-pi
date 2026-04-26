import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";

const worktreeShared = vi.hoisted(() => ({
	buildPaiInstanceId: vi.fn(() => "pi-test-instance"),
	createManagedWorktree: vi.fn(),
	createOwnerMetadata: vi.fn((input) => ({
		createdFromCwd: input.cwd,
		hostname: "test-host",
		instanceId: input.instanceId,
		pid: 123,
		sessionFile: input.sessionFile ?? null,
		sessionId: "session-1",
		sessionName: input.sessionName ?? null,
	})),
	formatOwnerLabel: vi.fn((owner) => owner.instanceId),
	formatWorktreeKind: vi.fn((entry) => (entry.isMain ? "main" : entry.isManaged ? "pi-owned" : "external")),
	getRepoWorktreeContext: vi.fn(),
	getRepoWorktreeSnapshot: vi.fn(),
	removeManagedWorktree: vi.fn(),
	touchManagedWorktreeSeen: vi.fn(),
}));

vi.mock<typeof import("./worktree-shared")>(import("./worktree-shared"), () => worktreeShared);

import worktreeExtension from "./worktree.js";

function makeSnapshot(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		commonDir: "/repo/.git",
		current: null,
		currentBranch: "main",
		currentWorktreeRoot: "/repo",
		gitDir: "/repo/.git",
		isLinkedWorktree: false,
		mainWorktreeRoot: "/repo",
		registry: { managedWorktrees: [] },
		repoRoot: "/repo",
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
		expect(harness.commands.has("worktree")).toBeTruthy();
		expect(harness.commands.has("Worktree")).toBeTruthy();
		expect(harness.commands.has("wt")).toBeTruthy();
	});

	it("does not probe or write worktree status on session start", () => {
		const harness = createExtensionHarness();
		harness.ctx.cwd = "/repo";
		worktreeShared.getRepoWorktreeContext.mockReturnValue(makeSnapshot());

		worktreeExtension(harness.pi as never);
		harness.emit("session_start", {}, harness.ctx);

		expect(worktreeShared.getRepoWorktreeContext).not.toHaveBeenCalled();
		expect(harness.statusMap.has("pi-worktree")).toBeFalsy();
	});

	it("creates a pi-owned worktree and reports owner + purpose metadata", async () => {
		const harness = createExtensionHarness();
		harness.ctx.cwd = "/repo";
		harness.ctx.ui.input = vi.fn(async () => "Implement footer context");
		worktreeShared.getRepoWorktreeContext.mockReturnValue(null);
		worktreeShared.getRepoWorktreeSnapshot.mockReturnValue(null);
		worktreeShared.createManagedWorktree.mockReturnValue({
			branch: "feat/footer-context",
			createdBranch: true,
			metadata: {
				owner: { instanceId: "pi-test-instance", sessionId: "session-1", sessionName: null },
				purpose: "Implement footer context",
			},
			repoRoot: "/repo",
			worktreePath: "/tmp/pi/feat-footer",
		});

		worktreeExtension(harness.pi as never);
		await harness.commands.get("worktree").handler("create feat/footer-context", harness.ctx);

		expect(worktreeShared.createManagedWorktree).toHaveBeenCalledWith(
			expect.objectContaining({
				branch: "feat/footer-context",
				cwd: "/repo",
				purpose: "Implement footer context",
			}),
		);
		expect(harness.notifications.at(-1)?.msg).toContain("Created pi-owned worktree feat/footer-context");
		expect(String(harness.messages.at(-1)?.content)).toContain("Owner instance: pi-test-instance");
		expect(String(harness.messages.at(-1)?.content)).toContain("Purpose: Implement footer context");
	});

	it("shows a status badge for linked worktrees during explicit worktree commands", async () => {
		const harness = createExtensionHarness();
		harness.ctx.cwd = "/repo";
		worktreeShared.getRepoWorktreeContext.mockReturnValue(
			makeSnapshot({
				current: {
					bare: false,
					branch: "feat/footer-context",
					detached: false,
					head: "abc",
					isCurrent: true,
					isMain: false,
					isManaged: true,
					lockedReason: null,
					metadata: { owner: { instanceId: "pi-test-instance" }, purpose: "Build worktree UX" },
					path: "/tmp/pi/feat-footer",
					prunableReason: null,
				},
				currentBranch: "feat/footer-context",
				currentWorktreeRoot: "/tmp/pi/feat-footer",
				isLinkedWorktree: true,
			}),
		);
		worktreeShared.getRepoWorktreeSnapshot.mockReturnValue(
			makeSnapshot({
				current: {
					bare: false,
					branch: "feat/footer-context",
					detached: false,
					head: "abc",
					isCurrent: true,
					isMain: false,
					isManaged: true,
					lockedReason: null,
					metadata: { owner: { instanceId: "pi-test-instance" }, purpose: "Build worktree UX" },
					path: "/tmp/pi/feat-footer",
					prunableReason: null,
				},
				currentBranch: "feat/footer-context",
				currentWorktreeRoot: "/tmp/pi/feat-footer",
				isLinkedWorktree: true,
			}),
		);

		worktreeExtension(harness.pi as never);
		await harness.commands.get("worktree").handler("status", harness.ctx);

		expect(harness.statusMap.get("pi-worktree")).toContain("pi wt feat/footer-context");
	});

	it("opens a matching worktree through the system opener helper", async () => {
		const harness = createExtensionHarness();
		harness.ctx.cwd = "/repo";
		worktreeShared.getRepoWorktreeContext.mockReturnValue(
			makeSnapshot({
				current: {
					bare: false,
					branch: "feat/footer-context",
					detached: false,
					head: "abc",
					isCurrent: true,
					isMain: false,
					isManaged: true,
					lockedReason: null,
					metadata: { owner: { instanceId: "pi-test-instance" }, purpose: "Build worktree UX" },
					path: "/tmp/pi/feat-footer",
					prunableReason: null,
				},
				currentBranch: "feat/footer-context",
				currentWorktreeRoot: "/tmp/pi/feat-footer",
				isLinkedWorktree: true,
			}),
		);
		worktreeShared.getRepoWorktreeSnapshot.mockReturnValue(
			makeSnapshot({
				current: {
					bare: false,
					branch: "feat/footer-context",
					detached: false,
					head: "abc",
					isCurrent: true,
					isMain: false,
					isManaged: true,
					lockedReason: null,
					metadata: { owner: { instanceId: "pi-test-instance" }, purpose: "Build worktree UX" },
					path: "/tmp/pi/feat-footer",
					prunableReason: null,
				},
				currentBranch: "feat/footer-context",
				currentWorktreeRoot: "/tmp/pi/feat-footer",
				isLinkedWorktree: true,
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
		harness.pi.exec = vi.fn(async () => ({ exitCode: 0, stderr: "", stdout: "" }));

		worktreeExtension(harness.pi as never);
		await harness.commands.get("worktree").handler("open feat/footer-context", harness.ctx);

		expect(harness.pi.exec).toHaveBeenCalledWith();
		expect(harness.notifications.at(-1)?.msg).toContain("Opened /tmp/pi/feat-footer");
		expect(String(harness.messages.at(-1)?.content)).toContain("/worktree open");
	});

	it("registers the worktree tool alongside commands", () => {
		const harness = createExtensionHarness();
		worktreeExtension(harness.pi as never);
		expect(harness.tools.has("worktree")).toBeTruthy();
		const tool = harness.tools.get("worktree");
		expect(tool?.name).toBe("worktree");
		expect(tool?.parameters).toBeDefined();
	});

	it("refuses to clean external worktrees by default", async () => {
		const harness = createExtensionHarness();
		harness.ctx.cwd = "/repo";
		worktreeShared.getRepoWorktreeContext.mockReturnValue(makeSnapshot());
		worktreeShared.getRepoWorktreeSnapshot.mockReturnValue(
			makeSnapshot({
				worktrees: [
					{
						bare: false,
						branch: "feat/manual",
						detached: false,
						head: "abc",
						isCurrent: false,
						isMain: false,
						isManaged: false,
						lockedReason: null,
						metadata: null,
						path: "/tmp/manual",
						prunableReason: null,
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
