import { execFile } from "node:child_process";

export const TAILSCALE_BIN = "tailscale";
const TAILSCALE_TIMEOUT_MS = 15_000;
const HOSTNAME_TRAILING_DOT_REGEX = /\.$/;
const NON_PATH_SAFE_REGEX = /[^a-z0-9-]/g;

export interface CommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export type CommandRunner = (
	command: string,
	args: string[],
	options?: { timeoutMs?: number },
) => Promise<CommandResult>;

export interface TailscaleServeOptions {
	instanceId: string;
	port: number;
	hostname?: string;
	servePath?: string;
	runner?: CommandRunner;
}

export interface TailscaleServeSession {
	provider: "tailscale";
	hostname: string;
	servePath: string;
	publicUrl: string;
	stop: () => Promise<void>;
}

export function sanitizeInstanceId(instanceId: string): string {
	const normalized = instanceId.trim().toLowerCase().replaceAll(/\s+/g, "-");
	const safe = normalized.replaceAll(NON_PATH_SAFE_REGEX, "-").replaceAll(/-+/g, "-").replaceAll(/^-|-$/g, "");
	return safe || "session";
}

export function buildServePath(instanceId: string): string {
	return `/pi/${sanitizeInstanceId(instanceId)}/`;
}

export function buildPublicUrl(hostname: string, servePath: string): string {
	const normalizedPath = servePath.startsWith("/") ? servePath : `/${servePath}`;
	return `https://${hostname}${normalizedPath}`;
}

export function buildServeArgs(port: number, servePath: string): string[] {
	return ["serve", "--bg", "--https", "443", "--set-path", servePath, `http://127.0.0.1:${port}`];
}

export function buildServeOffArgs(servePath: string): string[] {
	return ["serve", "--https", "443", "--set-path", servePath, "off"];
}

export async function runCommand(
	command: string,
	args: string[],
	options: { timeoutMs?: number } = {},
): Promise<CommandResult> {
	return new Promise((resolve, reject) => {
		execFile(
			command,
			args,
			{
				timeout: options.timeoutMs ?? TAILSCALE_TIMEOUT_MS,
			},
			(error, stdout, stderr) => {
				if (error) {
					reject(error);
					return;
				}

				resolve({
					exitCode: 0,
					stderr: stderr.toString(),
					stdout: stdout.toString(),
				});
			},
		);
	});
}

export async function isTailscaleAvailable(runner: CommandRunner = runCommand): Promise<boolean> {
	try {
		await runner("which", [TAILSCALE_BIN]);
		return true;
	} catch {
		return false;
	}
}

export function parseHostname(statusJson: string): string | undefined {
	const parsed = JSON.parse(statusJson) as {
		Self?: { DNSName?: string; HostName?: string };
	};
	const rawHostname = parsed.Self?.DNSName ?? parsed.Self?.HostName;
	const hostname = rawHostname?.trim().replace(HOSTNAME_TRAILING_DOT_REGEX, "");
	return hostname || undefined;
}

export async function getTailscaleHostname(runner: CommandRunner = runCommand): Promise<string> {
	const result = await runner(TAILSCALE_BIN, ["status", "--json"]);
	const hostname = parseHostname(result.stdout);

	if (!hostname) {
		throw new Error("Unable to determine the Tailscale hostname.");
	}

	return hostname;
}

export async function serveOff(servePath: string, runner: CommandRunner = runCommand): Promise<void> {
	await runner(TAILSCALE_BIN, buildServeOffArgs(servePath));
}

export async function startTailscaleServe(options: TailscaleServeOptions): Promise<TailscaleServeSession> {
	/* V8 ignore next -- tests inject a runner to avoid shelling out to a real tailscale binary. */
	const runner = options.runner ?? runCommand;
	const available = await isTailscaleAvailable(runner);

	if (!available) {
		throw new Error("Tailscale is not installed or not on PATH.");
	}

	const servePath = options.servePath ?? buildServePath(options.instanceId);
	const hostname = options.hostname ?? (await getTailscaleHostname(runner));
	await runner(TAILSCALE_BIN, buildServeArgs(options.port, servePath));

	let stopped = false;

	return {
		hostname,
		provider: "tailscale",
		publicUrl: buildPublicUrl(hostname, servePath),
		servePath,
		stop: async () => {
			if (stopped) {
				return;
			}

			stopped = true;
			await serveOff(servePath, runner);
		},
	};
}
