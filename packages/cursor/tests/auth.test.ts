import { afterEach, describe, expect, it } from "vitest";
import { createCursorOAuthProvider, generateCursorAuthParams, getTokenExpiry, refreshCursorToken } from "../auth.js";
import { createTestCursorBackend } from "./test-backend.js";

const envSnapshot = { ...process.env };

afterEach(() => {
	for (const key of Object.keys(process.env)) {
		if (!(key in envSnapshot)) {
			delete process.env[key];
		}
	}
	Object.assign(process.env, envSnapshot);
});

describe("cursor auth", () => {
	it("generates a PKCE-backed browser login URL", async () => {
		const params = await generateCursorAuthParams();

		expect(params.uuid).toMatch(/[0-9a-f-]{36}/i);
		expect(params.loginUrl).toContain("loginDeepControl");
		expect(params.loginUrl).toContain(`uuid=${params.uuid}`);

		const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(params.verifier));
		expect(params.challenge).toBe(Buffer.from(digest).toString("base64url"));
	});

	it("extracts JWT expiry with a five-minute safety margin", () => {
		const exp = Math.floor(Date.now() / 1000) + 7200;
		const token = `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`;
		const expiry = getTokenExpiry(token);
		expect(expiry).toBeGreaterThanOrEqual(exp * 1000 - 5 * 60 * 1000 - 1000);
		expect(expiry).toBeLessThanOrEqual(exp * 1000 - 5 * 60 * 1000 + 1000);
	});

	it("refreshes tokens and preserves discovered models when discovery fails", async () => {
		const backend = await createTestCursorBackend();
		process.env.PI_CURSOR_REFRESH_URL = backend.refreshUrl;
		process.env.PI_CURSOR_API_URL = backend.apiUrl;
		backend.setDiscoveredModels([]);

		const refreshed = await refreshCursorToken({
			refresh: "valid-refresh",
			access: "expired-access",
			expires: Date.now() - 1000,
			models: [{ id: "composer-2", name: "Composer 2", reasoning: true, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 64000 }],
		} as never);

		expect(refreshed.access).not.toBe("expired-access");
		expect(refreshed.models?.[0]?.id).toBe("composer-2");
		await backend.close();
	});

	it("modifies provider models from credential-discovered models", () => {
		const provider = createCursorOAuthProvider();
		const modified = provider.modifyModels?.(
			[
				{ id: "placeholder", name: "Placeholder", api: "cursor-agent", provider: "cursor", baseUrl: "https://example.com", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1, maxTokens: 1 },
			],
			{
				refresh: "r",
				access: "a",
				expires: Date.now() + 1000,
				models: [{ id: "composer-2", name: "Composer 2", reasoning: true, input: ["text"], cost: { input: 0.5, output: 2.5, cacheRead: 0.2, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 64000 }],
			} as never,
		);

		expect(modified?.map((model) => model.id)).toEqual(["composer-2"]);
	});
});
