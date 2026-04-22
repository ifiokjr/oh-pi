declare module "node-pty" {
	export interface IPty {
		pid: number;
		onData?: (listener: (data: string) => void) => { dispose?: () => void } | (() => void) | void;
		onExit?: (listener: (event: { exitCode: number | null; signal?: number }) => void) => { dispose?: () => void } | (() => void) | void;
		kill: () => void;
		resize?: (columns: number, rows: number) => void;
		write?: (data: string) => void;
	}

	export function spawn(
		file: string,
		args: string[],
		options: {
			cols: number;
			rows: number;
			cwd: string;
			env: Record<string, string>;
			name: string;
		},
	): IPty;
}

declare module "@xterm/headless" {
	export class Terminal {
		constructor(options?: Record<string, unknown>);
		buffer?: {
			active?: {
				baseY?: number;
				cursorY?: number;
				length?: number;
				getLine?: (index: number) => unknown;
			};
		};
		write(data: string, callback?: () => void): void;
		resize(columns: number, rows: number): void;
		dispose(): void;
	}
}
