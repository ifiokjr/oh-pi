import { EventEmitter } from "node:events";

export type BenchmarkHarnessOptions = {
	cwd?: string;
	entries?: any[];
	branch?: any[];
	hasUI?: boolean;
	contextUsage?: { percent: number } | undefined;
	exec?: (
		command: string,
		args: string[],
		options?: Record<string, unknown>,
	) => Promise<{
		stdout: string;
		stderr: string;
		exitCode: number;
	}>;
};

export function createBenchmarkHarness(options: BenchmarkHarnessOptions = {}) {
	const handlers = new Map<string, Array<(...args: any[]) => any>>();
	const tools = new Map<string, any>();
	const commands = new Map<string, any>();
	const flags = new Map<string, any>();
	const shortcuts = new Map<string, any>();
	const messageRenderers = new Map<string, any>();
	const providers = new Map<string, any>();
	const widgets = new Map<string, any>();
	const statusMap = new Map<string, any>();
	const notifications: Array<{ msg: string; type: string }> = [];
	const eventBus = new EventEmitter();
	const authStorage = new Map<string, unknown>();
	const branch = options.branch ?? options.entries ?? [];
	const entries = options.entries ?? branch;
	let currentThinking = "low";
	let sessionName = "";
	let headerFactory: any;
	let footerFactory: any;
	let editorText = "";
	let editorFactory: any;

	const ctx = {
		cwd: options.cwd ?? process.cwd(),
		hasUI: options.hasUI ?? true,
		model: undefined,
		modelRegistry: {
			authStorage: {
				get(key: string) {
					return authStorage.get(key);
				},
				set(key: string, value: unknown) {
					authStorage.set(key, value);
				},
			},
			getAvailable: () => [],
			refresh: () => {},
		},
		sessionManager: {
			getEntries: () => entries,
			getBranch: () => branch,
			getLeafId: () => "leaf-1",
			getSessionId: () => "session-1",
			getSessionFile: () => "session.jsonl",
		},
		isIdle: () => true,
		hasPendingMessages: () => false,
		abort() {},
		shutdown() {},
		getContextUsage: () => options.contextUsage,
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
					return;
				}
				statusMap.set(key, value);
			},
			setWidget(name: string, factory: any) {
				if (factory === undefined) {
					widgets.delete(name);
					return;
				}
				widgets.set(name, factory);
			},
			setHeader(factory: any) {
				headerFactory = factory;
			},
			setFooter(factory: any) {
				footerFactory = factory;
			},
			setEditorText(text: string) {
				editorText = text;
			},
			getEditorText() {
				return editorText;
			},
			setEditorComponent(factory: any) {
				editorFactory = factory;
			},
			select: async () => null,
			confirm: async () => true,
			input: async () => null,
			editor: async () => null,
			custom: async () => null,
		},
	};

	const pi = {
		events: {
			on(event: string, handler: (...args: any[]) => any) {
				eventBus.on(event, handler);
			},
			off(event: string, handler: (...args: any[]) => any) {
				eventBus.off(event, handler);
			},
			emit(event: string, ...args: any[]) {
				eventBus.emit(event, ...args);
			},
		},
		on(event: string, handler: (...args: any[]) => any) {
			if (!handlers.has(event)) {
				handlers.set(event, []);
			}
			handlers.get(event)?.push(handler);
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
		sendMessage() {},
		sendUserMessage() {},
		appendEntry() {},
		exec:
			options.exec ??
			(async () => ({
				stdout: "",
				stderr: "",
				exitCode: 0,
			})),
		setModel(model: any) {
			ctx.model = model;
			return Promise.resolve(true);
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

	return {
		pi,
		ctx,
		tools,
		commands,
		flags,
		shortcuts,
		providers,
		messageRenderers,
		widgets,
		statusMap,
		notifications,
		get headerFactory() {
			return headerFactory;
		},
		get footerFactory() {
			return footerFactory;
		},
		get editorFactory() {
			return editorFactory;
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
