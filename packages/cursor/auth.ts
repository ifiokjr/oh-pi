import type { OAuthCredentials, OAuthLoginCallbacks, OAuthProviderInterface } from "@mariozechner/pi-ai";
import { CURSOR_PROVIDER, getCursorRuntimeConfig } from "./config.js";
import { enrichCursorCredentials, getCredentialModels } from "./models.js";
import type { CursorCredentials } from "./models.js";

const POLL_MAX_ATTEMPTS = 150;
const POLL_BASE_DELAY_MS = 1000;
const POLL_MAX_DELAY_MS = 10_000;
const POLL_BACKOFF_MULTIPLIER = 1.2;

export interface CursorAuthParams {
	verifier: string;
	challenge: string;
	uuid: string;
	loginUrl: string;
}

export async function generateCursorAuthParams(): Promise<CursorAuthParams> {
	const { verifier, challenge } = await generatePkcePair();
	const uuid = crypto.randomUUID();
	const params = new URLSearchParams({
		challenge,
		mode: "login",
		redirectTarget: "cli",
		uuid,
	});
	return {
		challenge,
		loginUrl: `${getCursorRuntimeConfig().loginUrl}?${params.toString()}`,
		uuid,
		verifier,
	};
}

export async function loginCursor(callbacks: OAuthLoginCallbacks): Promise<CursorCredentials> {
	const { verifier, uuid, loginUrl } = await generateCursorAuthParams();
	callbacks.onAuth({
		instructions: "Complete the Cursor login in your browser. pi will keep polling until the token exchange completes.",
		url: loginUrl,
	});
	callbacks.onProgress?.("Waiting for Cursor browser authentication...");
	const tokens = await pollCursorAuth(uuid, verifier, callbacks.signal, callbacks.onProgress);
	callbacks.onProgress?.("Refreshing Cursor model catalog...");
	return enrichCursorCredentials({
		access: tokens.accessToken,
		expires: getTokenExpiry(tokens.accessToken),
		refresh: tokens.refreshToken,
	});
}

export async function refreshCursorToken(
	credentials: OAuthCredentials,
	options: { preserveModels?: boolean } = {},
): Promise<CursorCredentials> {
	const response = await fetch(getCursorRuntimeConfig().refreshUrl, {
		body: "{}",
		headers: {
			Authorization: `Bearer ${credentials.refresh}`,
			"Content-Type": "application/json",
		},
		method: "POST",
	});

	if (!response.ok) {
		throw new Error(`Cursor token refresh failed: ${await response.text()}`);
	}

	const data = (await response.json()) as {
		accessToken?: string;
		refreshToken?: string;
	};
	if (!data.accessToken) {
		throw new Error("Cursor token refresh response did not include an accessToken.");
	}

	return enrichCursorCredentials(
		{
			access: data.accessToken,
			expires: getTokenExpiry(data.accessToken),
			refresh: data.refreshToken || credentials.refresh,
		},
		{
			previous: options.preserveModels === false ? undefined : (credentials as CursorCredentials),
		},
	);
}

export async function refreshCursorCredentialModels(credentials: CursorCredentials): Promise<CursorCredentials> {
	return enrichCursorCredentials(credentials, { previous: credentials });
}

export function getTokenExpiry(token: string): number {
	try {
		const [, payload] = token.split(".");
		if (!payload) {
			return Date.now() + 3600 * 1000;
		}
		const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
		if (typeof decoded.exp === "number") {
			return decoded.exp * 1000 - 5 * 60 * 1000;
		}
	} catch {
		// Fall through to default expiry
	}
	return Date.now() + 3600 * 1000;
}

export function createCursorOAuthProvider(): Omit<OAuthProviderInterface, "id"> {
	return {
		getApiKey(credentials) {
			return credentials.access;
		},
		async login(callbacks) {
			return loginCursor(callbacks);
		},
		modifyModels(models, credentials) {
			const current = getCredentialModels(credentials as CursorCredentials);
			return [
				...models.filter((model) => model.provider !== CURSOR_PROVIDER),
				...current.map((model) => ({
					...model,
					provider: CURSOR_PROVIDER,
					api: "cursor-agent",
					baseUrl: getCursorRuntimeConfig().apiUrl,
				})),
			];
		},
		name: "Cursor (experimental)",
		async refreshToken(credentials) {
			return refreshCursorToken(credentials);
		},
	};
}

async function pollCursorAuth(
	uuid: string,
	verifier: string,
	signal?: AbortSignal,
	onProgress?: (message: string) => void,
): Promise<{ accessToken: string; refreshToken: string }> {
	let delayMs = POLL_BASE_DELAY_MS;
	let consecutiveErrors = 0;

	for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
		await sleep(delayMs, signal);
		onProgress?.(`Polling Cursor auth (${attempt + 1}/${POLL_MAX_ATTEMPTS})...`);

		try {
			const pollUrl = new URL(getCursorRuntimeConfig().pollUrl);
			pollUrl.searchParams.set("uuid", uuid);
			pollUrl.searchParams.set("verifier", verifier);
			const response = await fetch(pollUrl, { signal });
			if (response.status === 404) {
				consecutiveErrors = 0;
				delayMs = Math.min(Math.ceil(delayMs * POLL_BACKOFF_MULTIPLIER), POLL_MAX_DELAY_MS);
				continue;
			}
			if (response.ok) {
				const data = (await response.json()) as {
					accessToken?: string;
					refreshToken?: string;
				};
				if (!data.accessToken || !data.refreshToken) {
					throw new Error("Cursor auth poll response was missing tokens.");
				}
				return {
					accessToken: data.accessToken,
					refreshToken: data.refreshToken,
				};
			}
			throw new Error(`Cursor auth polling failed with status ${response.status}.`);
		} catch (error) {
			if (signal?.aborted) {
				throw new Error("Cursor login cancelled", { cause: error });
			}
			consecutiveErrors += 1;
			if (consecutiveErrors >= 3) {
				throw error instanceof Error ? error : new Error(String(error));
			}
		}
	}

	throw new Error("Cursor authentication polling timed out.");
}

async function generatePkcePair(): Promise<{ verifier: string; challenge: string }> {
	const random = crypto.getRandomValues(new Uint8Array(32));
	const verifier = Buffer.from(random).toString("base64url");
	const challengeDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	const challenge = Buffer.from(challengeDigest).toString("base64url");
	return { challenge, verifier };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Aborted"));
			return;
		}
		const timeout = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timeout);
				reject(new Error("Aborted"));
			},
			{ once: true },
		);
	});
}
