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
	const eventBus = new EventEmitter();

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
		registerShortcut() {},
		registerMessageRenderer() {},
		sendMessage(message: any) {
			messages.push(message);
		},
		sendUserMessage(message: string) {
			userMessages.push(message);
		},
		appendEntry() {},
		getThinkingLevel() {
			return "low";
		},
		getFlag(name: string) {
			return flags.get(name)?.default;
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
		emit(event: string, ...args: any[]) {
			for (const handler of handlers.get(event) ?? []) {
				handler(...args);
			}
		},
	};
}
