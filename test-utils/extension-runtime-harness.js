import { EventEmitter } from "node:events";

export function createExtensionHarness() {
	const handlers = new Map();
	const tools = new Map();
	const commands = new Map();
	const flags = new Map();
	const messages = [];
	const userMessages = [];
	const notifications = [];
	const statusMap = new Map();
	const shortcuts = new Map();
	let editorText = "";
	let editorComponentFactory;
	const messageRenderers = new Map();
	const providers = new Map();
	const eventBus = new EventEmitter();
	let sessionName = "";

	let currentThinking = "low";
	const pi = {
		appendEntry() {},
		events: {
			emit(event, ...args) {
				eventBus.emit(event, ...args);
			},
			on(event, handler) {
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
		getFlag(name) {
			return flags.get(name)?.default;
		},
		getSessionName() {
			return sessionName;
		},
		getThinkingLevel() {
			return currentThinking;
		},
		on(event, handler) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event).push(handler);
		},
		registerCommand(name, spec) {
			commands.set(name, spec);
		},
		registerFlag(name, spec) {
			flags.set(name, spec);
		},
		registerMessageRenderer(name, renderer) {
			messageRenderers.set(name, renderer);
		},
		registerProvider(name, config) {
			providers.set(name, config);
		},
		registerShortcut(name, spec) {
			shortcuts.set(name, spec);
		},
		registerTool(tool) {
			tools.set(tool.name, tool);
		},
		sendMessage(message) {
			messages.push(message);
		},
		sendUserMessage(message) {
			userMessages.push(message);
		},
		setActiveTools() {},
		async setModel(model) {
			ctx.model = model;
			return true;
		},
		setSessionName(name) {
			sessionName = name;
		},
		setThinkingLevel(level) {
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
			notify(msg, type) {
				notifications.push({ msg, type });
			},
			select: async () => null,
			setEditorComponent(factory) {
				editorComponentFactory = factory;
			},
			setEditorText(text) {
				editorText = text;
			},
			setStatus(key, value) {
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
			set text(value) {
				editorText = value;
			},
		},
		emit(event, ...args) {
			for (const handler of handlers.get(event) ?? []) {
				handler(...args);
			}
		},
		async emitAsync(event, ...args) {
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
