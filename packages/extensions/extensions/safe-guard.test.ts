import { describe, expect, it } from "vitest";
import { DANGEROUS_PATTERNS, PROTECTED_PATHS } from "./safe-guard";

describe("DANGEROUS_PATTERNS", () => {
	const matches = (cmd: string) => DANGEROUS_PATTERNS.some((p) => p.test(cmd));

	it("matches rm -rf /", () => expect(matches("rm -rf /")).toBe(true));
	it("matches rm -f file.txt", () => expect(matches("rm -f file.txt")).toBe(true));
	it("matches rm --force file", () => expect(matches("rm --force file")).toBe(true));
	it("matches sudo rm file", () => expect(matches("sudo rm file")).toBe(true));
	it("matches DROP TABLE users", () => expect(matches("DROP TABLE users")).toBe(true));
	it("matches TRUNCATE TABLE foo", () => expect(matches("TRUNCATE TABLE foo")).toBe(true));
	it("matches DELETE FROM users", () => expect(matches("DELETE FROM users")).toBe(true));
	it("matches chmod 777 /tmp", () => expect(matches("chmod 777 /tmp")).toBe(true));
	it("matches mkfs /dev/sda", () => expect(matches("mkfs /dev/sda")).toBe(true));
	it("matches dd if=/dev/zero", () => expect(matches("dd if=/dev/zero")).toBe(true));
	it("does not match ls -la", () => expect(matches("ls -la")).toBe(false));
	it("does not match echo hello", () => expect(matches("echo hello")).toBe(false));
});

describe("PROTECTED_PATHS", () => {
	it("contains all expected paths", () => {
		expect(PROTECTED_PATHS).toEqual([".env", ".git/", "node_modules/", ".pi/", "id_rsa", ".ssh/"]);
	});
	it("has length 6", () => expect(PROTECTED_PATHS).toHaveLength(6));
});
