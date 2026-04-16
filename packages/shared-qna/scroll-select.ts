import { requirePiTuiModule } from "./pi-tui-loader.js";

let cachedPiTui:
	| {
			Key: {
				enter: string;
				escape: string;
				up: string;
				down: string;
				ctrl: (key: string) => string;
			};
			matchesKey: (input: string, key: string) => boolean;
			truncateToWidth: (text: string, width: number) => string;
			visibleWidth: (text: string) => number;
			wrapTextWithAnsi: (text: string, width: number) => string[];
		}
	| undefined;

function getPiTui() {
	if (cachedPiTui) {
		return cachedPiTui;
	}

	cachedPiTui = requirePiTuiModule() as {
		Key: {
			enter: string;
			escape: string;
			up: string;
			down: string;
			ctrl: (key: string) => string;
		};
		matchesKey: (input: string, key: string) => boolean;
		truncateToWidth: (text: string, width: number) => string;
		visibleWidth: (text: string) => number;
		wrapTextWithAnsi: (text: string, width: number) => string[];
	};
	return cachedPiTui;
}

export interface ScrollSelectOption<T> {
	value: T;
	label: string;
}

export interface ScrollSelectSearchConfig<T> {
	title: string;
	placeholder?: string;
	getOptions: (query: string) => Promise<ScrollSelectOption<T>[]> | ScrollSelectOption<T>[];
	emptyMessage?: (query: string) => string;
}

export interface ScrollSelectConfig<T> {
	title: string;
	options: ScrollSelectOption<T>[];
	footerHint?: string;
	emptyMessage?: string;
	initialValue?: T;
	maxVisibleOptions?: number;
	overlayWidth?: number | string;
	overlayMaxHeight?: number | string;
	search?: ScrollSelectSearchConfig<T>;
}

type ScrollSelectUi = {
	custom?: <T>(
		factory: (tui: { requestRender: () => void }, theme: ScrollSelectTheme, keybindings: unknown, done: (value: T) => void) => {
			render: (width: number) => string[];
			handleInput: (data: string) => void;
			dispose?: () => void;
		},
		options?: unknown,
	) => Promise<T>;
	select?: (title: string, options: string[]) => Promise<string | null | undefined>;
	input?: (title: string, placeholder?: string) => Promise<string | null | undefined>;
	notify?: (message: string, type?: "error" | "info" | "warning") => void;
};

type ScrollSelectTheme = {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
};

class ScrollSelectComponent<T> {
	private readonly tui: { requestRender: () => void };
	private readonly theme: ScrollSelectTheme;
	private readonly done: (value: T | null) => void;
	private readonly input: ScrollSelectUi["input"];
	private readonly notify: ScrollSelectUi["notify"];
	private readonly baseOptions: ScrollSelectOption<T>[];
	private readonly title: string;
	private readonly footerHint: string;
	private readonly emptyMessage: string;
	private readonly maxVisibleOptions: number;
	private readonly search?: ScrollSelectSearchConfig<T>;

	private options: ScrollSelectOption<T>[];
	private cursorIndex: number;
	private searchQuery = "";
	private searching = false;

	constructor(
		config: ScrollSelectConfig<T>,
		dependencies: {
			tui: { requestRender: () => void };
			theme: ScrollSelectTheme;
			done: (value: T | null) => void;
			input: ScrollSelectUi["input"];
			notify: ScrollSelectUi["notify"];
		},
	) {
		this.tui = dependencies.tui;
		this.theme = dependencies.theme;
		this.done = dependencies.done;
		this.input = dependencies.input;
		this.notify = dependencies.notify;
		this.baseOptions = [...config.options];
		this.options = [...config.options];
		this.title = config.title;
		this.footerHint = config.footerHint ?? "";
		this.emptyMessage = config.emptyMessage ?? "No options available.";
		this.maxVisibleOptions = Math.max(4, config.maxVisibleOptions ?? 10);
		this.search = config.search;
		this.cursorIndex = this.getInitialCursorIndex(config.initialValue);
	}

	render(width: number): string[] {
		const { truncateToWidth, visibleWidth, wrapTextWithAnsi } = getPiTui();
		const safeWidth = Math.max(20, width);
		const lines: string[] = [];
		const bodyWidth = Math.max(12, safeWidth - 2);

		for (const line of this.title.split("\n")) {
			for (const wrapped of wrapTextWithAnsi(line, bodyWidth)) {
				lines.push(truncateToWidth(wrapped, bodyWidth));
			}
		}

		lines.push("");

		if (this.search) {
			const filterText = this.searchQuery.trim().length > 0 ? `Filter: ${this.searchQuery}` : "Filter: all";
			lines.push(truncateToWidth(this.theme.fg("dim", filterText), bodyWidth));
			lines.push("");
		}

		if (this.options.length === 0) {
			lines.push(truncateToWidth(this.theme.fg("dim", this.emptyMessage), bodyWidth));
		} else {
			const { start, end } = this.getVisibleRange();

			if (start > 0) {
				lines.push(truncateToWidth(this.theme.fg("dim", `↑ ${start} more`), bodyWidth));
			}

			for (let index = start; index < end; index++) {
				const option = this.options[index];
				if (!option) {
					continue;
				}

				const prefix = index === this.cursorIndex ? this.theme.fg("accent", "→ ") : "  ";
				const availableWidth = Math.max(4, bodyWidth - visibleWidth(prefix));
				const label = truncateToWidth(option.label, availableWidth);
				const line = `${prefix}${index === this.cursorIndex ? this.theme.fg("accent", label) : label}`;
				lines.push(truncateToWidth(line, bodyWidth));
			}

			const hiddenBelow = this.options.length - end;
			if (hiddenBelow > 0) {
				lines.push(truncateToWidth(this.theme.fg("dim", `↓ ${hiddenBelow} more`), bodyWidth));
			}
		}

		lines.push("");
		lines.push(truncateToWidth(this.footerText(), bodyWidth));
		return lines;
	}

	handleInput(data: string): void {
		const { Key, matchesKey } = getPiTui();

		if (matchesKey(data, Key.escape) || data === "q") {
			this.done(null);
			return;
		}

		if (matchesKey(data, Key.enter) || data === "\r") {
			this.done(this.options[this.cursorIndex]?.value ?? null);
			return;
		}

		if (matchesKey(data, Key.up) || data === "k" || matchesKey(data, Key.ctrl("p"))) {
			this.moveCursor(-1);
			return;
		}

		if (matchesKey(data, Key.down) || data === "j" || matchesKey(data, Key.ctrl("n"))) {
			this.moveCursor(1);
			return;
		}

		if (this.search && (data === "/" || data === "s")) {
			void this.promptSearch();
		}
	}

	dispose(): void {}

	private footerText(): string {
		const parts = ["[↑↓/j/k] scroll", "[enter] select", "[esc] cancel"];
		if (this.search) {
			parts.push("[/] search");
		}
		if (this.footerHint.trim().length > 0) {
			parts.push(this.footerHint.trim());
		}
		return this.theme.fg("dim", parts.join(" • "));
	}

	private getInitialCursorIndex(initialValue: T | undefined): number {
		if (initialValue === undefined) {
			return 0;
		}

		const index = this.baseOptions.findIndex((option) => Object.is(option.value, initialValue));
		return index >= 0 ? index : 0;
	}

	private getVisibleRange(): { start: number; end: number } {
		const count = this.options.length;
		const visible = Math.min(this.maxVisibleOptions, count);
		if (count <= visible) {
			return { start: 0, end: count };
		}

		let start = Math.max(0, this.cursorIndex - Math.floor(visible / 2));
		start = Math.min(start, count - visible);
		return { start, end: Math.min(count, start + visible) };
	}

	private moveCursor(delta: number): void {
		if (this.options.length === 0) {
			return;
		}

		this.cursorIndex = Math.max(0, Math.min(this.options.length - 1, this.cursorIndex + delta));
		this.tui.requestRender();
	}

	private async promptSearch(): Promise<void> {
		if (!this.search || typeof this.input !== "function" || this.searching) {
			return;
		}

		this.searching = true;
		try {
			const raw = await this.input(this.search.title, this.searchQuery || this.search.placeholder);
			if (raw === null || raw === undefined) {
				return;
			}

			const query = raw.trim();
			if (query === this.searchQuery) {
				return;
			}

			const nextOptions = await this.search.getOptions(query);
			if (nextOptions.length === 0) {
				this.notify?.(
					this.search.emptyMessage?.(query) ?? `No option matched ${query ? `"${query}"` : "the current filter"}.`,
					"warning",
				);
				return;
			}

			this.searchQuery = query;
			this.options = [...nextOptions];
			this.cursorIndex = 0;
			this.tui.requestRender();
		} finally {
			this.searching = false;
		}
	}
}

export async function openScrollableSelect<T>(ui: ScrollSelectUi, config: ScrollSelectConfig<T>): Promise<T | null> {
	if (config.options.length === 0) {
		return null;
	}

	if (config.options.length === 1) {
		return config.options[0]?.value ?? null;
	}

	if (typeof ui.custom !== "function") {
		if (typeof ui.select !== "function") {
			return null;
		}

		const selected = await ui.select(
			config.title,
			config.options.map((option) => option.label),
		);
		return config.options.find((option) => option.label === selected)?.value ?? null;
	}

	return await ui.custom<T | null>(
		(tui, theme, _keybindings, done) =>
			new ScrollSelectComponent(config, {
				tui,
				theme,
				done,
				input: ui.input,
				notify: ui.notify,
			}),
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: config.overlayWidth ?? 84,
				maxHeight: config.overlayMaxHeight ?? "75%",
			},
		},
	);
}
