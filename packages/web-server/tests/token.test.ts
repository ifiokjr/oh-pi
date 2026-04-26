import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generateInstanceId, generateToken, loadOrCreateToken, validateToken } from "../src/token.js";

describe(generateToken, () => {
	it("produces a 64-character hex string", () => {
		const token = generateToken();
		expect(token).toHaveLength(64);
		expect(token).toMatch(/^[0-9a-f]{64}$/);
	});

	it("generates unique tokens", () => {
		const a = generateToken();
		const b = generateToken();
		expect(a).not.toBe(b);
	});
});

describe(generateInstanceId, () => {
	it("produces adjective-noun-NN format", () => {
		const id = generateInstanceId("a".repeat(64));
		expect(id).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
	});

	it("is deterministic", () => {
		const token = generateToken();
		const a = generateInstanceId(token);
		const b = generateInstanceId(token);
		expect(a).toBe(b);
	});

	it("differs for different tokens", () => {
		const a = generateInstanceId("a".repeat(64));
		const b = generateInstanceId("b".repeat(64));
		expect(a).not.toBe(b);
	});
});

describe(validateToken, () => {
	it("returns true for matching tokens", () => {
		const token = generateToken();
		expect(validateToken(token, token)).toBeTruthy();
	});

	it("returns false for non-matching tokens", () => {
		expect(validateToken("a".repeat(64), "b".repeat(64))).toBeFalsy();
	});

	it("returns false for different length tokens", () => {
		expect(validateToken("short", "a".repeat(64))).toBeFalsy();
	});
});

describe(loadOrCreateToken, () => {
	let tmpDir: string;

	afterEach(() => {
		if (tmpDir) {
			rmSync(tmpDir, { force: true, recursive: true });
		}
	});

	it("creates a new token file", () => {
		tmpDir = mkdtempSync(join(tmpdir(), "pi-web-test-"));
		const filePath = join(tmpDir, "token");
		const info = loadOrCreateToken(filePath);

		expect(info.isNew).toBeTruthy();
		expect(info.token).toHaveLength(64);
		expect(info.instanceId).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);

		const stored = readFileSync(filePath, "utf8");
		expect(stored).toBe(info.token);

		const stats = statSync(filePath);
		expect(stats.mode & 0o777).toBe(0o600);
	});

	it("reads an existing token file", () => {
		tmpDir = mkdtempSync(join(tmpdir(), "pi-web-test-"));
		const filePath = join(tmpDir, "token");

		const first = loadOrCreateToken(filePath);
		const second = loadOrCreateToken(filePath);

		expect(second.isNew).toBeFalsy();
		expect(second.token).toBe(first.token);
		expect(second.instanceId).toBe(first.instanceId);
	});

	it("generates token without file path", () => {
		const info = loadOrCreateToken();
		expect(info.isNew).toBeTruthy();
		expect(info.token).toHaveLength(64);
	});
});
