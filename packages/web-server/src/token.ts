import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ADJECTIVES = ["blue", "red", "green", "swift", "bold", "calm", "dark", "warm", "keen", "wild"];
const NOUNS = ["fox", "owl", "bear", "hawk", "wolf", "lynx", "deer", "hare", "crow", "dove"];

export function generateToken(): string {
	return randomBytes(32).toString("hex");
}

export function generateInstanceId(token: string): string {
	const hash = createHash("sha256").update(token).digest();
	const adjIdx = hash[0] % ADJECTIVES.length;
	const nounIdx = hash[1] % NOUNS.length;
	const num = (hash[2] % 90) + 10;
	return `${ADJECTIVES[adjIdx]}-${NOUNS[nounIdx]}-${num}`;
}

export function validateToken(provided: string, expected: string): boolean {
	const a = Buffer.from(provided, "utf8");
	const b = Buffer.from(expected, "utf8");

	if (a.length !== b.length) {
		return false;
	}

	return timingSafeEqual(a, b);
}

export interface TokenInfo {
	token: string;
	instanceId: string;
	isNew: boolean;
}

export function loadOrCreateToken(filePath?: string): TokenInfo {
	if (filePath) {
		try {
			const existing = readFileSync(filePath, "utf8").trim();

			if (existing.length === 64) {
				return { instanceId: generateInstanceId(existing), isNew: false, token: existing };
			}
		} catch {
			// File doesn't exist or is unreadable — create new
		}

		const token = generateToken();
		mkdirSync(dirname(filePath), { recursive: true });
		writeFileSync(filePath, token, { mode: 0o600 });
		return { instanceId: generateInstanceId(token), isNew: true, token };
	}

	const token = generateToken();
	return { instanceId: generateInstanceId(token), isNew: true, token };
}
