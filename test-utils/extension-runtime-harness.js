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
		events: {
			on(event, handler) {
				eventBus.on(event, handler);
			},
			emit(event, ...args) {
				eventBus.emit(event, ...args);
			},
		},
		on(event, handler) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event).push(handler);
		},
		registerTool(tool) {
			tools.set(tool.name, tool);
		},
		registerCommand(name, spec) {
			commands.set(name, spec);
		},
		registerFlag(name, spec) {
			flags.set(name, spec);
		},
		registerShortcut(name, spec) {
			shortcuts.set(name, spec);
		},
		registerMessageRenderer(name, renderer) {
			messageRenderers.set(name, renderer);
		},
		registerProvider(name, config) {
			providers.set(name, config);
		},
		sendMessage(message) {
			messages.push(message);
		},
		sendUserMessage(message) {
			userMessages.push(message);
		},
		appendEntry() {},
		async setModel(model) {
			ctx.model = model;
			return true;
		},
		getThinkingLevel() {
			return currentThinking;
		},
		setThinkingLevel(level) {
			currentThinking = level;
		},
		getAllTools() {
			return Array.from(tools.values());
		},
		getActiveTools() {
			return Array.from(tools.keys());
		},
		setActiveTools() {},
		getFlag(name) {
			return flags.get(name)?.default;
		},
		getSessionName() {
			return sessionName;
		},
		setSessionName(name) {
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
			notify(msg, type) {
				notifications.push({ msg, type });
			},
			setStatus(key, value) {
				if (value === undefined) {
					statusMap.delete(key);
				} else {
					statusMap.set(key, value);
				}
			},
			setWidget() {},
			setEditorText(text) {
				editorText = text;
			},
			getEditorText() {
				return editorText;
			},
			setEditorComponent(factory) {
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
			set text(value) {
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
	};
}
