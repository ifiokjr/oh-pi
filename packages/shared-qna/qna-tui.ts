import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

function requirePiTui() {
	try {
		return require("@mariozechner/pi-tui");
	} catch (error) {
		const code = (error as { code?: string }).code;
		if (code !== "MODULE_NOT_FOUND") {
			throw error;
		}
		return require(path.join(os.homedir(), ".bun", "install", "global", "node_modules", "@mariozechner", "pi-tui"));
	}
}

type Component = {
	handleInput: (data: string) => void;
	render: (width: number) => string[];
	invalidate: () => void;
};

type TUI = {
	requestRender: () => void;
};

type EditorTheme = {
	borderColor: (text: string) => string;
	selectList: {
		matchHighlight?: (text: string) => string;
		itemSecondary?: (text: string) => string;
	};
};

function getPiTui() {
	return requirePiTui() as {
		Editor: new (tui: TUI, theme: EditorTheme) => {
			disableSubmit?: boolean;
			onChange?: () => void;
			setText: (text: string) => void;
			getText: () => string;
			render: (width: number) => string[];
			handleInput: (data: string) => void;
		};
		Key: {
			enter: string;
			tab: string;
			escape: string;
			up: string;
			down: string;
			ctrl: (key: string) => string;
			shift: (key: string) => string;
		};
		matchesKey: (input: string, key: string) => boolean;
		truncateToWidth: (text: string, width: number) => string;
		visibleWidth: (text: string) => number;
		wrapTextWithAnsi: (text: string, width: number) => string[];
	};
}

export interface QnAOption {
	label: string;
	description: string;
}

export interface QnAQuestion {
	header?: string;
	question: string;
	context?: string;
	options?: QnAOption[];
}

export interface QnATemplate {
	label: string;
	template: string;
}

export interface QnAResponse {
	selectedOptionIndex: number;
	customText: string;
	selectionTouched: boolean;
	committed: boolean;
}

export interface QnAResult {
	text: string;
	answers: string[];
	responses: QnAResponse[];
}

export interface QnATemplateData {
	question: string;
	context?: string;
	answer: string;
	index: number;
	total: number;
}

export function getQuestionOptions(question: QnAQuestion): QnAOption[] {
	return question.options ?? [];
}

export function formatResponseAnswer(question: QnAQuestion, response: QnAResponse): string {
	const options = getQuestionOptions(question);
	if (options.length === 0) {
		return response.customText;
	}

	const otherIndex = options.length;
	if (response.selectedOptionIndex === otherIndex) {
		return response.customText;
	}

	if (!response.selectionTouched) {
		return "";
	}

	return options[response.selectedOptionIndex]?.label ?? "";
}

export function normalizeResponseForQuestion(
	question: QnAQuestion,
	response: Partial<QnAResponse> | undefined,
	fallbackAnswer: string | undefined,
	inferCommittedFromContent: boolean,
): QnAResponse {
	const options = getQuestionOptions(question);
	const rawFallback = fallbackAnswer ?? "";
	const rawCustomText = response?.customText ?? rawFallback;
	let selectedOptionIndex =
		typeof response?.selectedOptionIndex === "number" && Number.isFinite(response.selectedOptionIndex)
			? Math.trunc(response.selectedOptionIndex)
			: undefined;
	let selectionTouched = response?.selectionTouched ?? false;

	if (options.length === 0) {
		selectedOptionIndex = 0;
		if (response?.selectionTouched === undefined && rawCustomText.trim().length > 0) {
			selectionTouched = true;
		}
	} else if (selectedOptionIndex === undefined) {
		const fallbackTrimmed = rawFallback.trim();
		if (fallbackTrimmed.length === 0) {
			selectedOptionIndex = 0;
			if (response?.selectionTouched === undefined) {
				selectionTouched = false;
			}
		} else {
			const optionIndex = options.findIndex((option) => option.label === fallbackTrimmed);
			selectedOptionIndex = optionIndex >= 0 ? optionIndex : options.length;
			if (response?.selectionTouched === undefined) {
				selectionTouched = true;
			}
		}
	} else if (response?.selectionTouched === undefined) {
		selectionTouched = response?.committed === true;
		if (!selectionTouched) {
			const fallbackTrimmed = rawFallback.trim();
			if (fallbackTrimmed.length > 0) {
				const optionIndex = options.findIndex((option) => option.label === fallbackTrimmed);
				if (optionIndex >= 0) {
					selectionTouched = optionIndex === selectedOptionIndex && optionIndex !== 0;
				} else {
					selectionTouched = selectedOptionIndex === options.length;
				}
			}
		}
	}

	const maxIndex = options.length;
	const normalizedIndex = Math.max(0, Math.min(maxIndex, selectedOptionIndex ?? 0));
	const useCustomText = options.length === 0 || normalizedIndex === options.length;
	const normalizedCustomText = useCustomText ? rawCustomText : "";

	let committed = response?.committed ?? false;
	if (response?.committed === undefined && inferCommittedFromContent) {
		committed = formatResponseAnswer(question, {
			selectedOptionIndex: normalizedIndex,
			customText: normalizedCustomText,
			selectionTouched,
			committed: false,
		}).trim().length > 0;
	}

	return {
		selectedOptionIndex: normalizedIndex,
		customText: normalizedCustomText,
		selectionTouched,
		committed,
	};
}

export function normalizeResponses(
	questions: QnAQuestion[],
	responses: Array<Partial<QnAResponse>> | undefined,
	fallbackAnswers: string[] | undefined,
	inferCommittedFromContent: boolean,
): QnAResponse[] {
	return questions.map((question, index) =>
		normalizeResponseForQuestion(
			question,
			responses?.[index],
			fallbackAnswers?.[index],
			inferCommittedFromContent,
		),
	);
}

export function cloneResponses(responses: QnAResponse[]): QnAResponse[] {
	return responses.map((response) => ({ ...response }));
}

export function deriveAnswersFromResponses(questions: QnAQuestion[], responses: QnAResponse[]): string[] {
	return questions.map((question, index) => formatResponseAnswer(question, responses[index]));
}

export function hasResponseContent(question: QnAQuestion, response: QnAResponse): boolean {
	return formatResponseAnswer(question, response).trim().length > 0;
}

function defaultResolveNumericShortcut(
	input: string,
	maxOptionIndex: number,
	usingCustomEditor: boolean,
): number | null {
	if (usingCustomEditor) {
		return null;
	}

	if (!/^[1-9]$/.test(input)) {
		return null;
	}

	const selectedIndex = Number(input) - 1;
	if (selectedIndex > maxOptionIndex) {
		return null;
	}

	return selectedIndex;
}

function defaultApplyTemplate(template: string, data: QnATemplateData): string {
	const replacements: Record<string, string> = {
		question: data.question,
		context: data.context ?? "",
		answer: data.answer,
		index: String(data.index + 1),
		total: String(data.total),
	};

	return template.replace(/\{\{(question|context|answer|index|total)\}\}/g, (_match, key: string) => {
		return replacements[key] ?? "";
	});
}

function summarizeAnswer(text: string, maxLength: number = 60): string {
	const singleLine = text.replace(/\s+/g, " ").trim();
	if (singleLine.length <= maxLength) {
		return singleLine;
	}
	return `${singleLine.slice(0, maxLength - 1)}…`;
}

export class QnATuiComponent<TQuestion extends QnAQuestion> implements Component {
	private questions: TQuestion[];
	private responses: QnAResponse[];
	private currentIndex = 0;
	private editor: {
		disableSubmit?: boolean;
		onChange?: () => void;
		setText: (text: string) => void;
		getText: () => string;
		render: (width: number) => string[];
		handleInput: (data: string) => void;
	};
	private tui: TUI;
	private onDone: (result: QnAResult | null) => void;
	private showingConfirmation = false;
	private templates: QnATemplate[];
	private templateIndex = 0;
	private onResponsesChange?: (responses: QnAResponse[]) => void;
	private title: string;
	private resolveNumericShortcut: (
		input: string,
		maxOptionIndex: number,
		usingCustomEditor: boolean,
	) => number | null;
	private applyTemplate: (template: string, data: QnATemplateData) => string;
	private questionSummaryLabel: (question: TQuestion, index: number) => string;

	private cachedWidth?: number;
	private cachedLines?: string[];

	private dim = (s: string) => s;
	private bold = (s: string) => s;
	private italic = (s: string) => `\x1b[3m${s}\x1b[0m`;
	private cyan = (s: string) => s;
	private green = (s: string) => s;
	private yellow = (s: string) => s;
	private gray = (s: string) => s;

	constructor(
		questions: TQuestion[],
		tui: TUI,
		onDone: (result: QnAResult | null) => void,
		options?: {
			title?: string;
			templates?: QnATemplate[];
			initialResponses?: Array<Partial<QnAResponse>>;
			fallbackAnswers?: string[];
			inferCommittedFromContent?: boolean;
			onResponsesChange?: (responses: QnAResponse[]) => void;
			resolveNumericShortcut?: (
				input: string,
				maxOptionIndex: number,
				usingCustomEditor: boolean,
			) => number | null;
			applyTemplate?: (template: string, data: QnATemplateData) => string;
			questionSummaryLabel?: (question: TQuestion, index: number) => string;
			accentColor?: (text: string) => string;
			successColor?: (text: string) => string;
			warningColor?: (text: string) => string;
			mutedColor?: (text: string) => string;
			dimColor?: (text: string) => string;
			boldText?: (text: string) => string;
			italicText?: (text: string) => string;
		},
	) {
		this.questions = questions;
		this.templates = options?.templates ?? [];
		this.responses = normalizeResponses(
			questions,
			options?.initialResponses,
			options?.fallbackAnswers,
			options?.inferCommittedFromContent ?? false,
		);
		this.tui = tui;
		this.onDone = onDone;
		this.onResponsesChange = options?.onResponsesChange;
		this.title = options?.title ?? "Questions";
		this.resolveNumericShortcut = options?.resolveNumericShortcut ?? defaultResolveNumericShortcut;
		this.applyTemplate = options?.applyTemplate ?? defaultApplyTemplate;
		this.questionSummaryLabel =
			options?.questionSummaryLabel ??
			((question) => {
				return question.header?.trim() || question.question;
			});
		this.cyan = options?.accentColor ?? this.cyan;
		this.green = options?.successColor ?? this.green;
		this.yellow = options?.warningColor ?? this.yellow;
		this.gray = options?.mutedColor ?? this.gray;
		this.dim = options?.dimColor ?? this.dim;
		this.bold = options?.boldText ?? this.bold;
		this.italic = options?.italicText ?? this.italic;

		const editorTheme: EditorTheme = {
			borderColor: this.dim,
			selectList: {
				matchHighlight: this.cyan,
				itemSecondary: this.gray,
			},
		};

		const { Editor } = getPiTui();
		this.editor = new Editor(tui, editorTheme);
		this.editor.disableSubmit = true;
		this.editor.onChange = () => {
			this.saveCurrentResponse();
			this.invalidate();
			this.tui.requestRender();
		};

		this.loadEditorForCurrentQuestion();
	}

	private getCurrentQuestion(): TQuestion {
		return this.questions[this.currentIndex];
	}

	private isPrintableInput(data: string): boolean {
		if (data.length !== 1) {
			return false;
		}

		const code = data.charCodeAt(0);
		return code >= 32 && code !== 127;
	}

	private shouldUseEditor(index: number = this.currentIndex): boolean {
		const question = this.questions[index];
		const options = getQuestionOptions(question);
		if (options.length === 0) {
			return true;
		}

		return this.responses[index].selectedOptionIndex === options.length;
	}

	private getCurrentAnswerText(): string {
		const question = this.getCurrentQuestion();
		const response = this.responses[this.currentIndex];
		return formatResponseAnswer(question, response);
	}

	private getAnswerText(index: number): string {
		return formatResponseAnswer(this.questions[index], this.responses[index]);
	}

	private emitResponseChange(): void {
		this.onResponsesChange?.(cloneResponses(this.responses));
	}

	private loadEditorForCurrentQuestion(): void {
		if (!this.shouldUseEditor()) {
			this.editor.setText("");
			return;
		}

		this.editor.setText(this.responses[this.currentIndex].customText ?? "");
	}

	private saveCurrentResponse(emit: boolean = true): void {
		if (this.shouldUseEditor()) {
			const text = this.editor.getText();
			this.responses[this.currentIndex].customText = text;
			const question = this.questions[this.currentIndex];
			if (getQuestionOptions(question).length === 0 || text.trim().length > 0) {
				this.responses[this.currentIndex].selectionTouched = true;
			}
		}

		if (emit) {
			this.emitResponseChange();
		}
	}

	private navigateTo(index: number): void {
		if (index < 0 || index >= this.questions.length) {
			return;
		}

		this.saveCurrentResponse();
		this.currentIndex = index;
		this.showingConfirmation = false;
		this.loadEditorForCurrentQuestion();
		this.invalidate();
	}

	private selectOption(index: number): void {
		const question = this.getCurrentQuestion();
		const options = getQuestionOptions(question);
		if (options.length === 0) {
			return;
		}

		const maxIndex = options.length;
		const normalized = Math.max(0, Math.min(maxIndex, index));
		const currentResponse = this.responses[this.currentIndex];
		if (normalized === currentResponse.selectedOptionIndex && currentResponse.selectionTouched) {
			return;
		}

		this.saveCurrentResponse(false);
		currentResponse.selectedOptionIndex = normalized;
		currentResponse.selectionTouched = true;
		this.loadEditorForCurrentQuestion();
		this.emitResponseChange();
		this.invalidate();
		this.tui.requestRender();
	}

	private applyNextTemplate(): void {
		if (this.templates.length === 0) {
			return;
		}

		const question = this.getCurrentQuestion();
		const options = getQuestionOptions(question);
		if (options.length > 0 && !this.shouldUseEditor()) {
			this.selectOption(options.length);
		}

		const template = this.templates[this.templateIndex];
		const updated = this.applyTemplate(template.template, {
			question: question.question,
			context: question.context,
			answer: this.getCurrentAnswerText(),
			index: this.currentIndex,
			total: this.questions.length,
		});

		this.editor.setText(updated);
		this.saveCurrentResponse();
		this.templateIndex = (this.templateIndex + 1) % this.templates.length;
		this.invalidate();
		this.tui.requestRender();
	}

	private submit(): void {
		this.saveCurrentResponse();

		const answers = deriveAnswersFromResponses(this.questions, this.responses);
		const parts: string[] = [];
		for (let i = 0; i < this.questions.length; i++) {
			const question = this.questions[i];
			const rawAnswer = answers[i] ?? "";
			if (rawAnswer.trim().length === 0) {
				continue;
			}

			parts.push(`Q: ${question.question}`);
			parts.push(`A: ${rawAnswer}`);
			parts.push("");
		}

		this.onDone({
			text: parts.join("\n").trim(),
			answers,
			responses: cloneResponses(this.responses),
		});
	}

	private cancel(): void {
		this.onDone(null);
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	handleInput(data: string): void {
		const { Key, matchesKey } = getPiTui();

		if (this.showingConfirmation) {
			if (matchesKey(data, Key.enter)) {
				this.submit();
				return;
			}
			if (matchesKey(data, Key.ctrl("c"))) {
				this.cancel();
				return;
			}
			if (matchesKey(data, Key.escape)) {
				this.showingConfirmation = false;
				this.invalidate();
				this.tui.requestRender();
				return;
			}
			return;
		}

		if (matchesKey(data, Key.ctrl("c"))) {
			this.cancel();
			return;
		}

		if (matchesKey(data, Key.ctrl("t"))) {
			this.applyNextTemplate();
			return;
		}

		if (matchesKey(data, Key.tab)) {
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
				this.tui.requestRender();
			}
			return;
		}

		if (matchesKey(data, Key.shift("tab"))) {
			if (this.currentIndex > 0) {
				this.navigateTo(this.currentIndex - 1);
				this.tui.requestRender();
			}
			return;
		}

		const question = this.getCurrentQuestion();
		const options = getQuestionOptions(question);
		const usingEditor = this.shouldUseEditor();
		if (options.length > 0) {
			const otherIndex = options.length;
			const isOnOther = this.responses[this.currentIndex].selectedOptionIndex === otherIndex;
			const canSwitchFromCustomInput = usingEditor && isOnOther && this.editor.getText().length === 0;
			const allowOptionNavigation = !usingEditor || canSwitchFromCustomInput;

			if (allowOptionNavigation && matchesKey(data, Key.up)) {
				this.selectOption(this.responses[this.currentIndex].selectedOptionIndex - 1);
				return;
			}

			if (allowOptionNavigation && matchesKey(data, Key.down)) {
				this.selectOption(this.responses[this.currentIndex].selectedOptionIndex + 1);
				return;
			}

			const selectedIndex = this.resolveNumericShortcut(data, otherIndex, usingEditor);
			if (selectedIndex !== null) {
				this.selectOption(selectedIndex);
				return;
			}
		}

		if (matchesKey(data, Key.enter) && !matchesKey(data, Key.shift("enter"))) {
			const currentResponse = this.responses[this.currentIndex];
			if (options.length > 0 && !this.shouldUseEditor() && !currentResponse.selectionTouched) {
				currentResponse.selectionTouched = true;
			}

			this.saveCurrentResponse();
			currentResponse.committed = true;
			this.emitResponseChange();
			if (this.currentIndex < this.questions.length - 1) {
				this.navigateTo(this.currentIndex + 1);
			} else {
				this.showingConfirmation = true;
			}
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		if (this.shouldUseEditor()) {
			this.editor.handleInput(data);
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		if (this.isPrintableInput(data)) {
			this.selectOption(getQuestionOptions(question).length);
			this.editor.handleInput(data);
			this.saveCurrentResponse();
			this.invalidate();
			this.tui.requestRender();
		}
	}

	render(width: number): string[] {
		const { truncateToWidth, visibleWidth, wrapTextWithAnsi } = getPiTui();

		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const boxWidth = Math.max(40, Math.min(width - 4, 120));
		const contentWidth = boxWidth - 4;

		const horizontalLine = (count: number) => "─".repeat(count);

		const boxLine = (content: string, leftPad: number = 2): string => {
			const paddedContent = " ".repeat(leftPad) + content;
			const contentLen = visibleWidth(paddedContent);
			const rightPad = Math.max(0, boxWidth - contentLen - 2);
			return this.dim("│") + paddedContent + " ".repeat(rightPad) + this.dim("│");
		};

		const emptyBoxLine = (): string => {
			return this.dim("│") + " ".repeat(boxWidth - 2) + this.dim("│");
		};

		const padToWidth = (line: string): string => {
			const len = visibleWidth(line);
			return line + " ".repeat(Math.max(0, width - len));
		};

		const question = this.getCurrentQuestion();
		const response = this.responses[this.currentIndex];
		const options = getQuestionOptions(question);
		const usesEditor = this.shouldUseEditor();

		lines.push(padToWidth(this.dim(`╭${horizontalLine(boxWidth - 2)}╮`)));
		const title = `${this.title} ${this.dim(`(${this.currentIndex + 1}/${this.questions.length})`)}`;
		lines.push(padToWidth(boxLine(title)));
		lines.push(padToWidth(this.dim(`├${horizontalLine(boxWidth - 2)}┤`)));

		const progressParts: string[] = [];
		for (let i = 0; i < this.questions.length; i++) {
			const current = i === this.currentIndex;
			const answered = hasResponseContent(this.questions[i], this.responses[i]);
			if (current) {
				progressParts.push(this.cyan("●"));
			} else if (answered) {
				progressParts.push(this.green("●"));
			} else {
				progressParts.push(this.dim("○"));
			}
		}
		lines.push(padToWidth(boxLine(progressParts.join(" "))));

		if (!this.showingConfirmation) {
			if (question.header) {
				lines.push(padToWidth(boxLine(this.cyan(question.header))));
			}
			lines.push(padToWidth(emptyBoxLine()));

			const wrappedQuestion = wrapTextWithAnsi(`${this.bold("Q:")} ${this.bold(question.question)}`, contentWidth);
			for (const line of wrappedQuestion) {
				lines.push(padToWidth(boxLine(line)));
			}

			if (question.context) {
				lines.push(padToWidth(emptyBoxLine()));
				for (const line of wrapTextWithAnsi(this.gray(`> ${question.context}`), contentWidth - 2)) {
					lines.push(padToWidth(boxLine(line)));
				}
			}

			if (options.length > 0) {
				lines.push(padToWidth(emptyBoxLine()));
				for (let i = 0; i <= options.length; i++) {
					const isOther = i === options.length;
					const optionLabel = isOther ? "Other" : options[i].label;
					const description = isOther ? "Type your own answer" : options[i].description;
					const selected = response.selectedOptionIndex === i;
					const marker = selected ? "▶" : " ";
					const optionPrefix = `${marker} ${i + 1}. `;
					const line = `${optionPrefix}${optionLabel}`;
					const styledLine = selected
						? response.selectionTouched
							? this.green(line)
							: this.cyan(line)
						: line;
					lines.push(padToWidth(boxLine(truncateToWidth(styledLine, contentWidth))));

					if (selected && description && description.trim().length > 0) {
						const descriptionIndent = " ".repeat(visibleWidth(optionPrefix));
						const wrappedDescription = wrapTextWithAnsi(
							description,
							Math.max(10, contentWidth - visibleWidth(descriptionIndent)),
						);
						for (const wrapped of wrappedDescription) {
							lines.push(padToWidth(boxLine(`${descriptionIndent}${this.gray(wrapped)}`)));
						}
					}
				}
			}

			lines.push(padToWidth(emptyBoxLine()));
			if (usesEditor) {
				const answerPrefix = this.bold("A: ");
				const editorWidth = Math.max(20, contentWidth - 7);
				const editorLines = this.editor.render(editorWidth);
				for (let i = 1; i < editorLines.length - 1; i++) {
					if (i === 1) {
						lines.push(padToWidth(boxLine(answerPrefix + editorLines[i])));
					} else {
						lines.push(padToWidth(boxLine("   " + editorLines[i])));
					}
				}
			} else {
				const selectedLabel = response.selectionTouched
					? options[response.selectedOptionIndex]?.label ?? ""
					: this.dim("(select an option)");
				lines.push(padToWidth(boxLine(`${this.bold("A:")} ${selectedLabel}`)));
			}
			lines.push(padToWidth(emptyBoxLine()));
		}

		if (this.showingConfirmation) {
			lines.push(padToWidth(this.dim(`├${horizontalLine(boxWidth - 2)}┤`)));
			lines.push(padToWidth(boxLine(this.bold("Review before submit:"))));
			for (let i = 0; i < this.questions.length; i++) {
				const summaryLabel = this.questionSummaryLabel(this.questions[i], i);
				const answerText = this.getAnswerText(i);
				const hasAnswer = answerText.trim().length > 0;
				const answerPreview = hasAnswer
					? this.green(summarizeAnswer(answerText))
					: this.yellow("(no answer)");
				const questionLine = `${this.bold(`${i + 1}.`)} ${this.cyan(summaryLabel)}`;
				const answerLine = `   ${this.dim("Answer:")} ${answerPreview}`;
				lines.push(padToWidth(boxLine(truncateToWidth(questionLine, contentWidth))));
				lines.push(padToWidth(boxLine(truncateToWidth(answerLine, contentWidth))));
			}
			lines.push(padToWidth(emptyBoxLine()));
			const confirmMsg = `${this.yellow("Submit all answers?")} ${this.dim("(Enter submit, Esc keep editing)")}`;
			lines.push(padToWidth(boxLine(truncateToWidth(confirmMsg, contentWidth))));
			const separator = this.cyan(" · ");
			const formatHint = (shortcut: string, action: string) => `${this.bold(shortcut)} ${this.italic(action)}`;
			const confirmControls = `${formatHint("Enter", "submit")}${separator}${formatHint("Esc", "back")}${separator}${formatHint("Ctrl+C", "cancel")}`;
			lines.push(padToWidth(boxLine(truncateToWidth(confirmControls, contentWidth))));
		} else {
			lines.push(padToWidth(this.dim(`├${horizontalLine(boxWidth - 2)}┤`)));

			const separator = this.cyan(" · ");
			const formatHint = (shortcut: string, action: string) => `${this.bold(shortcut)} ${this.italic(action)}`;
			const joinHints = (parts: string[]) => parts.join(separator);
			const canFit = (parts: string[]) => visibleWidth(joinHints(parts)) <= contentWidth;

			const tabHint = formatHint("Tab/⇧Tab", "next/prev");
			const enterHint = formatHint("Enter", "commit + next");
			const cancelHint = formatHint("Ctrl+C", "cancel");

			const optionalHints: string[] = [];
			if (options.length > 0 && !usesEditor) {
				optionalHints.push(formatHint("↑/↓/1-9", "pick option"));
			}
			if (usesEditor) {
				optionalHints.push(formatHint("⇧Enter", "newline"));
			}
			if (this.templates.length > 0) {
				optionalHints.push(formatHint("Ctrl+T", "template"));
			}

			const trailingHints = [enterHint, tabHint, cancelHint];
			const controls: string[] = [];
			for (const hint of optionalHints) {
				if (canFit([...controls, hint, ...trailingHints])) {
					controls.push(hint);
				}
			}
			controls.push(...trailingHints);

			lines.push(padToWidth(boxLine(truncateToWidth(joinHints(controls), contentWidth))));
		}
		lines.push(padToWidth(this.dim(`╰${horizontalLine(boxWidth - 2)}╯`)));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}
