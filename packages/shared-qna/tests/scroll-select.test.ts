import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../pi-tui-loader.js", () => ({
	requirePiTuiModule: () => ({
		Key: {
			enter: "<enter>",
			escape: "<escape>",
			up: "<up>",
			down: "<down>",
			ctrl: (key: string) => `<ctrl-${key}>`,
		},
		matchesKey: (input: string, key: string) => input === key,
		truncateToWidth: (text: string, width: number) => (text.length <= width ? text : text.slice(0, width)),
		visibleWidth: (text: string) => text.length,
		wrapTextWithAnsi: (text: string, _width: number) => [text],
	}),
}));

import { openScrollableSelect, type ScrollSelectConfig } from "../scroll-select.js";

type CustomFactory = (...args: any[]) => {
	render: (width: number) => string[];
	handleInput: (data: string) => void;
	invalidate?: () => void;
	focused?: boolean;
};

type TestTheme = {
	fg: (color: string, text: string) => string;
	bg?: (color: string, text: string) => string;
	bold: (text: string) => string;
};

function createTheme(overrides: Partial<TestTheme> = {}): TestTheme {
	return {
		fg: (_color: string, text: string) => text,
		bold: (text: string) => text,
		...overrides,
	};
}

async function flushAsyncWork(turns = 4) {
	for (let index = 0; index < turns; index++) {
		await Promise.resolve();
	}
}

function createFactoryRunner(theme = createTheme()) {
	const factories: CustomFactory[] = [];
	const resolvers: Array<((value: unknown) => void) | undefined> = [];
	const ui = {
		custom: vi.fn(((nextFactory: CustomFactory) => {
			const index = factories.push(nextFactory) - 1;
			if (index === 0) {
				return Promise.resolve(null);
			}
			return new Promise((resolve) => {
				resolvers[index] = resolve;
			});
		}) as NonNullable<Parameters<typeof openScrollableSelect<string>>[0]["custom"]>),
		input: vi.fn(async () => null),
		notify: vi.fn(),
	};

	function buildComponent(index = 0, done?: (value: unknown) => void) {
		const factory = factories[index];
		if (!factory) {
			throw new Error(`Expected custom factory at index ${index}.`);
		}
		return factory({ requestRender: vi.fn() }, theme, {}, done ?? resolvers[index] ?? vi.fn());
	}

	return { ui, buildComponent };
}

describe("openScrollableSelect", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns null when there are no options", async () => {
		const result = await openScrollableSelect({ custom: vi.fn() }, { title: "Empty", options: [] });

		expect(result).toBeNull();
	});

	it("returns the only option without opening any UI", async () => {
		const custom = vi.fn();
		const result = await openScrollableSelect(
			{ custom },
			{ title: "Single", options: [{ value: "only", label: "Only" }] },
		);

		expect(result).toBe("only");
		expect(custom).not.toHaveBeenCalled();
	});

	it("falls back to ui.select when custom overlays are unavailable", async () => {
		const select = vi.fn(async () => "Beta");
		const result = await openScrollableSelect(
			{ select },
			{
				title: "Fallback",
				options: [
					{ value: "alpha", label: "Alpha" },
					{ value: "beta", label: "Beta" },
				],
			},
		);

		expect(result).toBe("beta");
		expect(select).toHaveBeenCalledWith("Fallback", ["Alpha", "Beta"]);
	});

	it("returns null when neither custom overlays nor ui.select are available", async () => {
		const result = await openScrollableSelect(
			{},
			{
				title: "Unavailable",
				options: [
					{ value: "alpha", label: "Alpha" },
					{ value: "beta", label: "Beta" },
				],
			},
		);

		expect(result).toBeNull();
	});

	it("uses a centered overlay capped at 75% height", async () => {
		const { ui } = createFactoryRunner();
		const config: ScrollSelectConfig<string> = {
			title: "Pick one",
			options: [
				{ value: "a", label: "Alpha" },
				{ value: "b", label: "Beta" },
			],
		};

		await openScrollableSelect(ui, config);

		expect(ui.custom).toHaveBeenCalledWith(expect.any(Function), {
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: 84,
				maxHeight: "75%",
			},
		});
	});

	it("renders a scrollable window and reveals later items as the cursor moves", async () => {
		const { ui, buildComponent } = createFactoryRunner();
		await openScrollableSelect(ui, {
			title: "Providers",
			options: Array.from({ length: 14 }, (_, index) => ({
				value: `value-${index + 1}`,
				label: `Option ${index + 1}`,
			})),
			maxVisibleOptions: 5,
		});

		const component = buildComponent();
		const initial = component.render(60).join("\n");
		expect(initial).toContain("Option 1");
		expect(initial).toContain("Option 5");
		expect(initial).not.toContain("Option 10");
		expect(initial).toContain("↓ 9 more");

		for (let index = 0; index < 9; index++) {
			component.handleInput("<down>");
		}

		const later = component.render(60).join("\n");
		expect(later).toContain("Option 10");
		expect(later).toContain("↑ 7 more");
	});

	it("renders a contrasting surface background when background colors are available", async () => {
		const { ui, buildComponent } = createFactoryRunner(
			createTheme({
				bg: (color: string, text: string) => `<${color}>${text}</${color}>`,
			}),
		);
		await openScrollableSelect(ui, {
			title: "Scheduled tasks",
			options: [
				{ value: "first", label: "First task" },
				{ value: "second", label: "Second task" },
			],
		});

		const lines = buildComponent().render(40);
		expect(lines[0]).toContain("<customMessageBg>");
		expect(lines.some((line) => line.includes("<selectedBg>"))).toBe(true);
		expect(lines.every((line) => line.startsWith("<") && line.endsWith(">"))).toBe(true);
	});

	it("renders the empty message on the popup surface when options disappear", async () => {
		const { ui, buildComponent } = createFactoryRunner(
			createTheme({
				bg: (color: string, text: string) => `<${color}>${text}</${color}>`,
			}),
		);
		await openScrollableSelect(ui, {
			title: "Scheduled tasks",
			options: [
				{ value: "first", label: "First task" },
				{ value: "second", label: "Second task" },
			],
		});

		const component = buildComponent() as any;
		component.options = [];
		const rendered = component.render(40).join("\n");
		expect(rendered).toContain("No options available.");
		expect(rendered).toContain("<customMessageBg>");
	});

	it("supports in-picker search without pager actions", async () => {
		const { ui, buildComponent } = createFactoryRunner();
		ui.input.mockResolvedValueOnce("beta");

		await openScrollableSelect(ui, {
			title: "Provider login",
			options: [
				{ value: "alpha", label: "Alpha" },
				{ value: "beta", label: "Beta" },
				{ value: "gamma", label: "Gamma" },
			],
			search: {
				title: "Provider search",
				placeholder: "Type a provider id or name",
				getOptions(query) {
					const all = [
						{ value: "alpha", label: "Alpha" },
						{ value: "beta", label: "Beta" },
						{ value: "gamma", label: "Gamma" },
					];
					return all.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));
				},
			},
		});

		const component = buildComponent();
		component.handleInput("/");
		await flushAsyncWork();
		const rendered = component.render(60).join("\n");
		expect(rendered).toContain("Filter: beta");
		expect(rendered).toContain("Beta");
		expect(rendered).not.toContain("Next 10");
		expect(rendered).not.toContain("Previous 10");
	});

	it("keeps the current list and notifies when a search has no matches", async () => {
		const { ui, buildComponent } = createFactoryRunner();
		ui.input.mockResolvedValueOnce("zzz");

		await openScrollableSelect(ui, {
			title: "Provider login",
			options: [
				{ value: "alpha", label: "Alpha" },
				{ value: "beta", label: "Beta" },
			],
			search: {
				title: "Provider search",
				getOptions: () => [],
				emptyMessage: (query) => `No provider matched "${query}".`,
			},
		});

		const component = buildComponent();
		component.handleInput("/");
		await flushAsyncWork();

		expect(ui.notify).toHaveBeenCalledWith('No provider matched "zzz".', "warning");
		const rendered = component.render(60).join("\n");
		expect(rendered).toContain("Alpha");
		expect(rendered).toContain("Beta");
	});

	it("does not re-run search work when the query is unchanged", async () => {
		const { ui, buildComponent } = createFactoryRunner();
		const getOptions = vi.fn(() => [{ value: "beta", label: "Beta" }]);
		ui.input.mockResolvedValueOnce("beta").mockResolvedValueOnce("beta");

		await openScrollableSelect(ui, {
			title: "Provider login",
			options: [
				{ value: "alpha", label: "Alpha" },
				{ value: "beta", label: "Beta" },
			],
			search: {
				title: "Provider search",
				getOptions,
			},
		});

		const component = buildComponent();
		component.handleInput("/");
		await flushAsyncWork();
		component.handleInput("/");
		await flushAsyncWork();

		expect(getOptions).toHaveBeenCalledTimes(1);
	});

	it("handles enter and escape shortcuts", async () => {
		const { ui, buildComponent } = createFactoryRunner();
		await openScrollableSelect(ui, {
			title: "Pick one",
			options: [
				{ value: "alpha", label: "Alpha" },
				{ value: "beta", label: "Beta" },
			],
		});

		const done = vi.fn();
		const component = buildComponent(0, done);
		component.handleInput("<enter>");
		expect(done).toHaveBeenCalledWith("alpha");

		const cancel = vi.fn();
		const cancelComponent = buildComponent(0, cancel);
		cancelComponent.handleInput("<escape>");
		expect(cancel).toHaveBeenCalledWith(null);
	});
});
