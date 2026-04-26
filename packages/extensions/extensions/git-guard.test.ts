
import { createExtensionHarness } from "../../../test-utils/extension-runtime-harness.js";
import gitGuardExtension, { INTERACTIVE_GIT_WARNING_PREFIX, detectInteractiveGitCommand } from "./git-guard.js";

describe(detectInteractiveGitCommand, () => {
	it("detects git rebase --continue without non-interactive editor overrides", () => {
		const result = detectInteractiveGitCommand("git rebase --continue");
		expect(result).not.toBeNull();
		expect(result?.reason).toContain("rebase --continue");
		expect(result?.suggestion).toContain("GIT_EDITOR=true");
	});

	it("detects git commit without an explicit message", () => {
		const result = detectInteractiveGitCommand("git commit");
		expect(result).not.toBeNull();
		expect(result?.reason).toContain("git commit");
		expect(result?.suggestion).toContain("git commit -m");
	});

	it("ignores non-git shell text that merely mentions git", () => {
		expect(detectInteractiveGitCommand('echo "git commit"')).toBeNull();
		expect(detectInteractiveGitCommand("printf 'git rebase --continue'\n")).toBeNull();
		expect(detectInteractiveGitCommand("git merge-tree base head")).toBeNull();
	});

	it("detects git merge without --no-edit or explicit message", () => {
		const result = detectInteractiveGitCommand("git merge feature-branch");
		expect(result).not.toBeNull();
		expect(result?.reason).toContain("git merge");
		expect(result?.suggestion).toContain("--no-edit");
	});

	it("returns null for safe non-interactive git commands", () => {
		expect(detectInteractiveGitCommand('git commit -m "fix: test"')).toBeNull();
		expect(detectInteractiveGitCommand("git commit -C HEAD")).toBeNull();
		expect(detectInteractiveGitCommand("git commit --reuse-message HEAD")).toBeNull();
		expect(detectInteractiveGitCommand("GIT_EDITOR=true git rebase --continue")).toBeNull();
		expect(detectInteractiveGitCommand("git merge --no-edit feature-branch")).toBeNull();
		expect(detectInteractiveGitCommand('git tag -a v1.2.3 -m "release"')).toBeNull();
	});
});

describe(INTERACTIVE_GIT_WARNING_PREFIX, () => {
	it("stays stable for user-facing block messages", () => {
		expect(INTERACTIVE_GIT_WARNING_PREFIX).toBe("Interactive git command blocked");
	});
});

describe("git-guard extension", () => {
	it("defers dirty-repo startup checks until after the initial startup window", async () => {
		vi.useFakeTimers();
		try {
			const harness = createExtensionHarness();
			harness.pi.exec = vi.fn(async () => ({ exitCode: 0, stdout: " M README.md\n?? notes.txt\n" }));

			gitGuardExtension(harness.pi as never);
			harness.emit("session_start", {}, harness.ctx);

			expect(harness.pi.exec).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(500);
			expect(harness.pi.exec).toHaveBeenCalledWith("git", ["status", "--porcelain"]);
			expect(harness.notifications.at(-1)?.msg).toContain("Dirty repo: 2 uncommitted change(s)");
		} finally {
			vi.useRealTimers();
		}
	});
});
