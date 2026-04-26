import { EventEmitter } from "node:events";

export function createExtensionHarness() {
	const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
	const userMessages: string[] = [];
	const notifications: Array<{ msg: string; type: string }> = [];
	const statusMap = new Map<string, unknown>();
	let editorText = "";
	let editorComponentFactory: unknown;
	const eventBusListeners = new Map<string, Array<(...args: unknown[]) => unknown>>();
	const eventBus = {
		emit(event: string, ...args: unknown[]) {
			for (const listener of eventBusListeners.get(event) ?? []) {
				listener(...args);
			}
		},
		on(event: string, listener: (...args: unknown[]) => unknown) {
			if (!eventBusListeners.has(event)) {
				eventBusListeners.set(event, []);
			}
			eventBusListeners.get(event)!.push(listener);
		},
	};
	let sessionName = "";

	let currentThinking = "low";
	const pi = {
		appendEntry() {},
		events: {
			emit<TArgs extends unknown[]>(event: string, ...args: TArgs) {
				eventBus.emit(event, ...args);
			},
			on<TArgs extends unknown[]>(event: string, handler: (...args: TArgs) => unknown) {
				eventBus.on(event, handler as unknown as (...args: unknown[]) => unknown);
			},
		},
		exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
		getActiveTools() {
			return Array.from(tools.keys());
		},
		getAllTools() {
			return Array.from(tools.values());
		},
		getFlag(name: string) {
			return flags.get(name)?.default;
		},
		getSessionName() {
			return sessionName;
		},
		getThinkingLevel() {
			return currentThinking;
		},
		on<TArgs extends unknown[]>(event: string, handler: (...args: TArgs) => unknown) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event)!.push(handler as unknown as (...args: unknown[]) => unknown);
		},
		// oxlint-disable-next-line @typescript-eslint/no-explicit-any
		registerCommand(name: string, spec: any) {
			commands.set(name, spec);
		},
		// oxlint-disable-next-line @typescript-eslint/no-explicit-any
		registerFlag(name: string, spec: any) {
			flags.set(name, spec);
		},
		registerMessageRenderer(name: string, renderer: unknown) {
			messageRenderers.set(name, renderer);
		},
		registerProvider(name: string, config: unknown) {
			providers.set(name, config);
		},
		registerShortcut(name: string, spec: unknown) {
			shortcuts.set(name, spec);
		},
		// oxlint-disable-next-line @typescript-eslint/no-explicit-any
		registerTool(tool: any) {
			tools.set(tool.name, tool);
		},
		sendMessage(message: unknown) {
			// oxlint-disable-next-line @typescript-eslint/no-explicit-any
			messages.push(message as any);
		},
		sendUserMessage(message: string) {
			userMessages.push(message);
		},
		setActiveTools() {},
		async setModel(model: unknown) {
			ctx.model = model;
			return true;
		},
		setSessionName(name: string) {
			sessionName = name;
		},
		setThinkingLevel(level: string) {
			currentThinking = level;
		},
	};

	const ctx = {
		abort() {},
		compact() {},
		cwd: process.cwd(),
		fork: async () => ({ cancelled: false }),
		getContextUsage: () => undefined,
		getSystemPrompt: () => "",
		hasPendingMessages: () => false,
		hasUI: true,
		isIdle: () => true,
		model: undefined as unknown,
		modelRegistry: {
			getAvailable: () => [],
		},
		navigateTree: async () => ({ cancelled: false }),
		newSession: async () => ({ cancelled: false }),
		reload: async () => {},
		sessionManager: {
			getBranch: () => [],
			getEntries: () => [],
			getLeafId: () => "leaf-1",
			getSessionFile: () => undefined,
			getSessionId: () => undefined,
		},
		shutdown() {},
		switchSession: async () => ({ cancelled: false }),
		ui: {
			confirm: async () => true,
			custom: async () => null,
			editor: async () => null,
			getEditorText() {
				return editorText;
			},
			input: async () => null,
			notify(msg: string, type: string) {
				notifications.push({ msg, type });
			},
			select: async () => null,
			setEditorComponent(factory: unknown) {
				editorComponentFactory = factory;
			},
			setEditorText(text: string) {
				editorText = text;
			},
			setStatus(key: string, value: unknown) {
				if (value === undefined) {
					statusMap.delete(key);
				} else {
					statusMap.set(key, value);
				}
			},
			setWidget() {},
		},
		waitForIdle: async () => {},
	};

	class NonNullMap<K, V> extends Map<K, V> {
		get(key: K): V {
			return super.get(key)!;
		}
	}

	// oxlint-disable-next-line @typescript-eslint/no-explicit-any
	const commands = new NonNullMap<string, any>();
	// oxlint-disable-next-line @typescript-eslint/no-explicit-any
	const tools = new NonNullMap<string, any>();
	// oxlint-disable-next-line @typescript-eslint/no-explicit-any
	const flags = new NonNullMap<string, any>();
	// oxlint-disable-next-line @typescript-eslint/no-explicit-any
	const messages: any[] = [];
	// oxlint-disable-next-line @typescript-eslint/no-explicit-any
	const shortcuts = new NonNullMap<string, any>();
	// oxlint-disable-next-line @typescript-eslint/no-explicit-any
	const messageRenderers = new NonNullMap<string, any>();
	// oxlint-disable-next-line @typescript-eslint/no-explicit-any
	const providers = new NonNullMap<string, any>();

	return {
		commands,
		ctx,
		editorState: {
			get factory() {
				return editorComponentFactory;
			},
			get text() {
				return editorText;
			},
			set text(value: string) {
				editorText = value;
			},
		},
		emit<TArgs extends unknown[]>(event: string, ...args: TArgs) {
			for (const handler of handlers.get(event) ?? []) {
				handler(...args);
			}
		},
		async emitAsync<TArgs extends unknown[]>(event: string, ...args: TArgs) {
			const results = [];
			for (const handler of handlers.get(event) ?? []) {
				results.push(await handler(...args));
			}
			return results;
		},
		flags,
		messageRenderers,
		messages,
		notifications,
		pi,
		providers,
		get sessionName() {
			return sessionName;
		},
		shortcuts,
		statusMap,
		tools,
		userMessages,
	};
}
