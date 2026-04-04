const DEFAULT_LOGIN_URL = "https://cursor.com/loginDeepControl";
const DEFAULT_POLL_URL = "https://api2.cursor.sh/auth/poll";
const DEFAULT_REFRESH_URL = "https://api2.cursor.sh/auth/exchange_user_api_key";
const DEFAULT_API_URL = "https://api2.cursor.sh";
const DEFAULT_CLIENT_VERSION = "cli-2026.01.09-231024f";

function getEnv(name: string): string | undefined {
	const value = process.env[name];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeOrigin(url: string): string {
	return url.replace(/\/+$/, "");
}

export function getCursorRuntimeConfig(): {
	loginUrl: string;
	pollUrl: string;
	refreshUrl: string;
	apiUrl: string;
	clientVersion: string;
} {
	return {
		loginUrl: getEnv("PI_CURSOR_LOGIN_URL") ?? getEnv("CURSOR_LOGIN_URL") ?? DEFAULT_LOGIN_URL,
		pollUrl: getEnv("PI_CURSOR_POLL_URL") ?? getEnv("CURSOR_POLL_URL") ?? DEFAULT_POLL_URL,
		refreshUrl: getEnv("PI_CURSOR_REFRESH_URL") ?? getEnv("CURSOR_REFRESH_URL") ?? DEFAULT_REFRESH_URL,
		apiUrl: normalizeOrigin(getEnv("PI_CURSOR_API_URL") ?? getEnv("CURSOR_API_URL") ?? DEFAULT_API_URL),
		clientVersion:
			getEnv("PI_CURSOR_CLIENT_VERSION") ?? getEnv("CURSOR_CLIENT_VERSION") ?? DEFAULT_CLIENT_VERSION,
	};
}

export const CURSOR_PROVIDER = "cursor";
export const CURSOR_API = "cursor-agent" as const;
export const CURSOR_RUN_PATH = "/agent.v1.AgentService/Run";
export const CURSOR_GET_MODELS_PATH = "/agent.v1.AgentService/GetUsableModels";
export const CURSOR_HEARTBEAT_MS = 5_000;
export const CURSOR_ACTIVE_RUN_TTL_MS = 5 * 60 * 1000;
export const CURSOR_CHECKPOINT_TTL_MS = 6 * 60 * 60 * 1000;
export const CURSOR_MAX_CHECKPOINTS = 64;
