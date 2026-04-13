import { describe, expect, it } from "vitest";
import { detectInteractiveGitCommand, INTERACTIVE_GIT_WARNING_PREFIX } from "./git-guard.js";

describe("detectInteractiveGitCommand", () => {
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

	it("detects git merge without --no-edit or explicit message", () => {
		const result = detectInteractiveGitCommand("git merge feature-branch");
		expect(result).not.toBeNull();
		expect(result?.reason).toContain("git merge");
		expect(result?.suggestion).toContain("--no-edit");
	});

	it("returns null for safe non-interactive git commands", () => {
		expect(detectInteractiveGitCommand('git commit -m "fix: test"')).toBeNull();
		expect(detectInteractiveGitCommand("GIT_EDITOR=true git rebase --continue")).toBeNull();
		expect(detectInteractiveGitCommand("git merge --no-edit feature-branch")).toBeNull();
		expect(detectInteractiveGitCommand('git tag -a v1.2.3 -m "release"')).toBeNull();
	});
});

describe("INTERACTIVE_GIT_WARNING_PREFIX", () => {
	it("stays stable for user-facing block messages", () => {
		expect(INTERACTIVE_GIT_WARNING_PREFIX).toBe("Interactive git command blocked");
	});
});
