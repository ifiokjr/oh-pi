import { EventEmitter } from "node:events";

export interface BenchmarkHarnessOptions {
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
}

export function createBenchmarkHarness(options: BenchmarkHarnessOptions = {}) {
	const handlers = new Map<string, ((...args: any[]) => any)[]>();
	const tools = new Map<string, any>();
	const commands = new Map<string, any>();
	const flags = new Map<string, any>();
	const shortcuts = new Map<string, any>();
	const messageRenderers = new Map<string, any>();
	const providers = new Map<string, any>();
	const widgets = new Map<string, any>();
	const statusMap = new Map<string, any>();
	const statusCalls: { key: string; value: unknown }[] = [];
	const notifications: { msg: string; type: string }[] = [];
	const footerBranchListeners = new Set<() => void>();
	const mountedDisposers: (() => void)[] = [];
	const requestRenderCounts = {
		editor: 0,
		footer: 0,
		header: 0,
		widget: 0,
	};
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
	const theme = {
		bg: (_color: string, text: string) => text,
		bold: (text: string) => text,
		fg: (_color: string, text: string) => text,
	};

	const ctx = {
		abort() {},
		compact() {},
		cwd: options.cwd ?? process.cwd(),
		fork: async () => ({ cancelled: false }),
		getContextUsage: () => options.contextUsage,
		getSystemPrompt: () => "",
		hasPendingMessages: () => false,
		hasUI: options.hasUI ?? true,
		isIdle: () => true,
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
		navigateTree: async () => ({ cancelled: false }),
		newSession: async () => ({ cancelled: false }),
		reload: async () => {},
		sessionManager: {
			getBranch: () => branch,
			getEntries: () => entries,
			getLeafId: () => "leaf-1",
			getSessionFile: () => "session.jsonl",
			getSessionId: () => "session-1",
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
				editorFactory = factory;
			},
			setEditorText(text: string) {
				editorText = text;
			},
			setFooter(factory: any) {
				footerFactory = factory;
			},
			setHeader(factory: any) {
				headerFactory = factory;
			},
			setStatus(key: string, value: any) {
				statusCalls.push({ key, value });
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
		},
		waitForIdle: async () => {},
	};

	const pi = {
		appendEntry() {},
		events: {
			emit(event: string, ...args: any[]) {
				eventBus.emit(event, ...args);
			},
			off(event: string, handler: (...args: any[]) => any) {
				eventBus.off(event, handler);
			},
			on(event: string, handler: (...args: any[]) => any) {
				eventBus.on(event, handler);
			},
		},
		exec:
			options.exec ??
			(async () => ({
				stdout: "",
				stderr: "",
				exitCode: 0,
			})),
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
			handlers.get(event)?.push(handler);
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
		sendMessage() {},
		sendUserMessage() {},
		setActiveTools() {},
		setModel(model: any) {
			ctx.model = model;
			return Promise.resolve(true);
		},
		setSessionName(name: string) {
			sessionName = name;
		},
		setThinkingLevel(level: string) {
			currentThinking = level;
		},
	};

	const mountWidgets = (width = 120) => {
		for (const factory of widgets.values()) {
			if (typeof factory !== "function") {
				continue;
			}

			const component = factory(
				{
					requestRender() {
						requestRenderCounts.widget += 1;
					},
				},
				theme,
			);
			component?.render?.(width);
			mountedDisposers.push(() => component?.dispose?.());
		}
	};

	const mountFooter = (width = 120) => {
		if (typeof footerFactory !== "function") {
			return;
		}

		const component = footerFactory(
			{
				requestRender() {
					requestRenderCounts.footer += 1;
				},
			},
			theme,
			{
				getGitBranch: () => "main",
				onBranchChange(listener: () => void) {
					footerBranchListeners.add(listener);
					return () => footerBranchListeners.delete(listener);
				},
			},
		);
		component?.render?.(width);
		mountedDisposers.push(() => component?.dispose?.());
	};

	const disposeMounted = () => {
		for (const dispose of mountedDisposers.splice(0)) {
			dispose();
		}
		footerBranchListeners.clear();
	};

	return {
		commands,
		ctx,
		disposeMounted,
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
		flags,
		get footerFactory() {
			return footerFactory;
		},
		get headerFactory() {
			return headerFactory;
		},
		messageRenderers,
		mountFooter,
		mountWidgets,
		notifications,
		pi,
		providers,
		requestRenderCounts,
		shortcuts,
		statusCalls,
		statusMap,
		theme,
		tools,
		widgets,
	};
}
