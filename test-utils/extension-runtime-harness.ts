import { EventEmitter } from "node:events";

export function createExtensionHarness() {
	const handlers = new Map<string, ((...args: any[]) => any)[]>();
	const tools = new Map<string, any>();
	const commands = new Map<string, any>();
	const flags = new Map<string, any>();
	const messages: any[] = [];
	const userMessages: string[] = [];
	const notifications: { msg: string; type: string }[] = [];
	const statusMap = new Map<string, any>();
	const shortcuts = new Map<string, any>();
	let editorText = "";
	let editorComponentFactory: any;
	const messageRenderers = new Map<string, any>();
	const providers = new Map<string, any>();
	const eventBus = new EventEmitter();
	let sessionName = "";

	let currentThinking = "low";
	const pi = {
		appendEntry() {},
		events: {
			emit(event: string, ...args: any[]) {
				eventBus.emit(event, ...args);
			},
			on(event: string, handler: (...args: any[]) => any) {
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
		on(event: string, handler: (...args: any[]) => any) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event)!.push(handler);
		},
		registerCommand(name: string, spec: any) {
			commands.set(name, spec);
		},
		registerFlag(name: string, spec: any) {
			flags.set(name, spec);
		},
		registerMessageRenderer(name: string, renderer: any) {
			messageRenderers.set(name, renderer);
		},
		registerProvider(name: string, config: any) {
			providers.set(name, config);
		},
		registerShortcut(name: string, spec: any) {
			shortcuts.set(name, spec);
		},
		registerTool(tool: any) {
			tools.set(tool.name, tool);
		},
		sendMessage(message: any) {
			messages.push(message);
		},
		sendUserMessage(message: string) {
			userMessages.push(message);
		},
		setActiveTools() {},
		async setModel(model: any) {
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
			setEditorComponent(factory: any) {
				editorComponentFactory = factory;
			},
			setEditorText(text: string) {
				editorText = text;
			},
			setStatus(key: string, value: any) {
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
		emit(event: string, ...args: any[]) {
			for (const handler of handlers.get(event) ?? []) {
				handler(...args);
			}
		},
		async emitAsync(event: string, ...args: any[]) {
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
