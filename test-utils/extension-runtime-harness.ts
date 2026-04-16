import { EventEmitter } from "node:events";

export function createExtensionHarness() {
	const handlers = new Map<string, Array<(...args: any[]) => any>>();
	const tools = new Map<string, any>();
	const commands = new Map<string, any>();
	const flags = new Map<string, any>();
	const messages: any[] = [];
	const userMessages: string[] = [];
	const notifications: Array<{ msg: string; type: string }> = [];
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
		events: {
			on(event: string, handler: (...args: any[]) => any) {
				eventBus.on(event, handler);
			},
			emit(event: string, ...args: any[]) {
				eventBus.emit(event, ...args);
			},
		},
		on(event: string, handler: (...args: any[]) => any) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event)!.push(handler);
		},
		registerTool(tool: any) {
			tools.set(tool.name, tool);
		},
		registerCommand(name: string, spec: any) {
			commands.set(name, spec);
		},
		registerFlag(name: string, spec: any) {
			flags.set(name, spec);
		},
		registerShortcut(name: string, spec: any) {
			shortcuts.set(name, spec);
		},
		registerMessageRenderer(name: string, renderer: any) {
			messageRenderers.set(name, renderer);
		},
		registerProvider(name: string, config: any) {
			providers.set(name, config);
		},
		sendMessage(message: any) {
			messages.push(message);
		},
		sendUserMessage(message: string) {
			userMessages.push(message);
		},
		appendEntry() {},
		exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
		async setModel(model: any) {
			ctx.model = model;
			return true;
		},
		getThinkingLevel() {
			return currentThinking;
		},
		setThinkingLevel(level: string) {
			currentThinking = level;
		},
		getAllTools() {
			return Array.from(tools.values());
		},
		getActiveTools() {
			return Array.from(tools.keys());
		},
		setActiveTools() {},
		getFlag(name: string) {
			return flags.get(name)?.default;
		},
		getSessionName() {
			return sessionName;
		},
		setSessionName(name: string) {
			sessionName = name;
		},
	};

	const ctx = {
		cwd: process.cwd(),
		hasUI: true,
		model: undefined,
		modelRegistry: {
			getAvailable: () => [],
		},
		sessionManager: {
			getEntries: () => [],
			getBranch: () => [],
			getLeafId: () => "leaf-1",
			getSessionId: () => undefined,
			getSessionFile: () => undefined,
		},
		isIdle: () => true,
		hasPendingMessages: () => false,
		abort() {},
		shutdown() {},
		getContextUsage: () => undefined,
		compact() {},
		getSystemPrompt: () => "",
		waitForIdle: async () => {},
		newSession: async () => ({ cancelled: false }),
		fork: async () => ({ cancelled: false }),
		navigateTree: async () => ({ cancelled: false }),
		switchSession: async () => ({ cancelled: false }),
		reload: async () => {},
		ui: {
			notify(msg: string, type: string) {
				notifications.push({ msg, type });
			},
			setStatus(key: string, value: any) {
				if (value === undefined) {
					statusMap.delete(key);
				} else {
					statusMap.set(key, value);
				}
			},
			setWidget() {},
			setEditorText(text: string) {
				editorText = text;
			},
			getEditorText() {
				return editorText;
			},
			setEditorComponent(factory: any) {
				editorComponentFactory = factory;
			},
			select: async () => null,
			confirm: async () => true,
			input: async () => null,
			editor: async () => null,
			custom: async () => null,
		},
	};

	return {
		pi,
		ctx,
		tools,
		commands,
		flags,
		messages,
		userMessages,
		notifications,
		statusMap,
		shortcuts,
		editorState: {
			get text() {
				return editorText;
			},
			set text(value: string) {
				editorText = value;
			},
			get factory() {
				return editorComponentFactory;
			},
		},
		messageRenderers,
		providers,
		get sessionName() {
			return sessionName;
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
	};
}
