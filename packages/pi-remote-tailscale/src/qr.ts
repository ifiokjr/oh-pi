const DEFAULT_QR_CACHE_SIZE = 8;
const QR_MODULE_NAME = "qrcode-terminal";

export interface QrTerminalModule {
	generate: (
		text: string,
		options?: { small?: boolean },
		callback?: (output: string) => void,
	) => string | void;
}

export interface QrRenderOptions {
	small?: boolean;
	maxCacheEntries?: number;
	loadModule?: () => Promise<QrTerminalModule>;
}

export interface QrRenderer {
	render: (url: string) => Promise<string[]>;
	clear: () => void;
}

declare global {
	// biome-ignore lint/style/noVar: Tests inject loaders through the global object.
	var __PI_REMOTE_TAILSCALE_QR_LOADER__: (() => Promise<QrTerminalModule>) | undefined;
}

export function appendTokenQuery(url: string, token: string): string {
	const parsed = new URL(url);
	parsed.searchParams.set("t", token);
	return parsed.toString();
}

export function splitQrOutput(output: string): string[] {
	return output.trimEnd().split(/\r?\n/);
}

export function createQrRenderer(options: QrRenderOptions = {}): QrRenderer {
	const cache = new Map<string, string[]>();
	let modulePromise: Promise<QrTerminalModule> | undefined;
	const maxCacheEntries = options.maxCacheEntries ?? DEFAULT_QR_CACHE_SIZE;

	const loadModule = () => {
		if (!modulePromise) {
			modulePromise = (options.loadModule ?? loadQrTerminalModule)();
		}

		return modulePromise;
	};

	const store = (key: string, value: string[]) => {
		cache.set(key, value);
		if (cache.size <= maxCacheEntries) {
			return;
		}

		const oldestKey = cache.keys().next().value;
		if (oldestKey) {
			cache.delete(oldestKey);
		}
	};

	return {
		clear: () => {
			cache.clear();
		},
		render: async (url: string) => {
			const cached = cache.get(url);
			if (cached) {
				return cached;
			}

			const qrModule = await loadModule();
			const lines = await new Promise<string[]>((resolve, reject) => {
				try {
					const maybeOutput = qrModule.generate(url, { small: options.small ?? true }, (output) => {
						resolve(splitQrOutput(output));
					});

					if (typeof maybeOutput === "string") {
						resolve(splitQrOutput(maybeOutput));
					}
				} catch (error) {
					reject(error);
				}
			});

			store(url, lines);
			return lines;
		},
	};
}

export async function renderTokenQr(url: string, token: string, options: QrRenderOptions = {}): Promise<string[]> {
	return createQrRenderer(options).render(appendTokenQuery(url, token));
}

async function loadQrTerminalModule(): Promise<QrTerminalModule> {
	if (globalThis.__PI_REMOTE_TAILSCALE_QR_LOADER__) {
		return globalThis.__PI_REMOTE_TAILSCALE_QR_LOADER__();
	}

	const imported = (await import(QR_MODULE_NAME)) as { default?: QrTerminalModule } & QrTerminalModule;
	return imported.default ?? imported;
}
