import { EventEmitter } from "node:events";

export function createExtensionHarness() {
	const handlers = new Map<string, ((...args: unknown[]) => unknown)[]>();
	const tools = new Map<string, unknown>();
	const commands = new Map<string, unknown>();
	const flags = new Map<string, unknown>();
	const messages: unknown[] = [];
	const userMessages: string[] = [];
	const notifications: { msg: string; type: string }[] = [];
	const statusMap = new Map<string, unknown>();
	const shortcuts = new Map<string, unknown>();
	let editorText = "";
	let editorComponentFactory: unknown;
	const messageRenderers = new Map<string, unknown>();
	const providers = new Map<string, unknown>();
	const eventBus = new EventEmitter();
	let sessionName = "";

	let currentThinking = "low";
	const pi = {
		appendEntry() {},
		events: {
			emit(event: string, ...args: unknown[]) {
				eventBus.emit(event, ...args);
			},
			on(event: string, handler: (...args: unknown[]) => unknown) {
				eventBus.on(event, handler);
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
		on(event: string, handler: (...args: unknown[]) => unknown) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event)!.push(handler);
		},
		registerCommand(name: string, spec: unknown) {
			commands.set(name, spec);
		},
		registerFlag(name: string, spec: unknown) {
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
		registerTool(tool: unknown) {
			tools.set(tool.name, tool);
		},
		sendMessage(message: unknown) {
			messages.push(message);
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
		model: undefined,
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
		emit(event: string, ...args: unknown[]) {
			for (const handler of handlers.get(event) ?? []) {
				handler(...args);
			}
		},
		async emitAsync(event: string, ...args: unknown[]) {
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
