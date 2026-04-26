

vi.mock<typeof import('@mariozechner/pi-coding-agent')>(import('@mariozechner/pi-coding-agent'), () => ({
	AuthStorage: class {},
	ModelRegistry: class {},
	SessionManager: { inMemory: vi.fn() },
	SettingsManager: { inMemory: vi.fn() },
	createAgentSession: vi.fn(),
	createBashTool: vi.fn(),
	createEditTool: vi.fn(),
	createExtensionRuntime: vi.fn(),
	createFindTool: vi.fn(),
	createGrepTool: vi.fn(),
	createLsTool: vi.fn(),
	createReadTool: vi.fn(),
	createWriteTool: vi.fn(),
}));
vi.mock<typeof import('@mariozechner/pi-ai')>(import('@mariozechner/pi-ai'), () => ({ getModel: vi.fn() }));
vi.mock<typeof import('./spawner.js')>(import('./spawner.js'), async () => {
	const actual = await vi.importActual<any>("./spawner.js");
	return { ...actual, makePheromoneId: () => "p-test" };
});

import { extractPheromones, parseSubTasks } from "../extensions/ant-colony/parser.js";

describe(parseSubTasks, () => {
	it("parses markdown TASK blocks", () => {
		const output = `## Recommended Tasks
### TASK: Fix login
- description: Fix the login bug
- files: src/auth.ts
- caste: worker
- priority: 2`;
		const tasks = parseSubTasks(output);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].title).toBe("Fix login");
		expect(tasks[0].description).toBe("Fix the login bug");
		expect(tasks[0].files).toStrictEqual(["src/auth.ts"]);
		expect(tasks[0].caste).toBe("worker");
		expect(tasks[0].priority).toBe(2);
	});

	it("parses JSON block", () => {
		const output =
			'```json\n[{"title":"Task A","description":"Do A","files":["a.ts"],"caste":"scout","priority":1}]\n```';
		const tasks = parseSubTasks(output);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].title).toBe("Task A");
		expect(tasks[0].caste).toBe("scout");
	});

	it("parses JSON task arrays nested under a tasks key", () => {
		const output =
			'```json\n{"discoveries":["parser.ts"],"tasks":[{"title":"Task A","description":"Do A","files":["a.ts"],"caste":"worker","priority":1}]}\n```';
		const tasks = parseSubTasks(output);
		expect(tasks).toHaveLength(1);
		expect(tasks[0]).toMatchObject({
			caste: "worker",
			description: "Do A",
			files: ["a.ts"],
			priority: 1,
			title: "Task A",
		});
	});

	it("defaults missing JSON description to the task title", () => {
		const tasks = parseSubTasks('```json\n[{"title":"Task A","files":["a.ts"]}]\n```');
		expect(tasks).toHaveLength(1);
		expect(tasks[0].title).toBe("Task A");
		expect(tasks[0].description).toBe("Task A");
	});

	it("defaults missing JSON title to the description", () => {
		const tasks = parseSubTasks('```json\n[{"description":"Do A","files":["a.ts"]}]\n```');
		expect(tasks).toHaveLength(1);
		expect(tasks[0].title).toBe("Do A");
		expect(tasks[0].description).toBe("Do A");
	});

	it("ignores JSON task entries missing both title and description", () => {
		const tasks = parseSubTasks('```json\n[{"files":["a.ts"],"caste":"worker","priority":1}]\n```');
		expect(tasks).toStrictEqual([]);
	});

	it("ignores fenced JSON objects that are not task plans", () => {
		const tasks = parseSubTasks('```json\n{"discoveries":["parser.ts"],"warnings":["be careful"]}\n```');
		expect(tasks).toStrictEqual([]);
	});

	it("defaults caste to worker for invalid", () => {
		const tasks = parseSubTasks('```json\n[{"title":"X","caste":"invalid"}]\n```');
		expect(tasks[0].caste).toBe("worker");
	});

	it("defaults priority to 3", () => {
		const tasks = parseSubTasks('```json\n[{"title":"X"}]\n```');
		expect(tasks[0].priority).toBe(3);
	});

	it("returns empty for no tasks", () => {
		expect(parseSubTasks("no tasks here")).toStrictEqual([]);
	});

	it("parses multiple markdown tasks", () => {
		const output = `### TASK: A
- description: Do A
- files: a.ts
- caste: worker
- priority: 1

### TASK: B
- description: Do B
- files: b.ts
- caste: soldier
- priority: 2`;
		const tasks = parseSubTasks(output);
		expect(tasks).toHaveLength(2);
	});

	it("parses context field", () => {
		const output = `### TASK: Fix it
- description: Fix bug
- files: x.ts
- caste: worker
- priority: 3
- context: some relevant code`;
		const tasks = parseSubTasks(output);
		expect(tasks[0].context).toBe(true);
	});

	it("parses bold markdown field keys", () => {
		const output = `### TASK: Harden parser
- **description**: support bold fields
- **files**: pi-package/extensions/ant-colony/parser.ts
- **caste**: worker
- **priority**: 2`;
		const tasks = parseSubTasks(output);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].files).toStrictEqual(["pi-package/extensions/ant-colony/parser.ts"]);
	});
});

describe(extractPheromones, () => {
	it("extracts discovery section", () => {
		const p = extractPheromones("ant-1", "scout", "t-1", "## Discoveries\n- Found auth\n\n## Other\nstuff", ["a.ts"]);
		expect(p.some((x) => x.type === "discovery")).toBeTruthy();
	});

	it("extracts warning section", () => {
		const p = extractPheromones("ant-1", "scout", "t-1", "## Warnings\n- Conflict\n", []);
		expect(p.some((x) => x.type === "warning")).toBeTruthy();
	});

	it("adds repellent on failure", () => {
		const p = extractPheromones("ant-1", "worker", "t-1", "output", ["a.ts"], true);
		expect(p.some((x) => x.type === "repellent")).toBeTruthy();
	});

	it("returns empty for no matching sections", () => {
		expect(extractPheromones("ant-1", "worker", "t-1", "nothing", [])).toStrictEqual([]);
	});

	it("extracts Files Changed as completion", () => {
		const p = extractPheromones("ant-1", "worker", "t-1", "## Files Changed\n- src/foo.ts\n", ["src/foo.ts"]);
		expect(p.some((x) => x.type === "completion")).toBeTruthy();
	});
});
