// Type declarations for optional dependencies

declare module "@ff-labs/fff-node" {
	export interface GrepMatch {
		file: string;
		line: number;
		text: string;
	}

	export interface GrepOptions {
		glob?: string;
		path?: string;
	}

	export class CursorStore {
		constructor(basePath: string);
		init(): Promise<void>;
		grep(pattern: string, options?: GrepOptions): Promise<GrepMatch[]>;
		stats(): { fileCount: number };
	}

	export class Cursor {
		constructor();
	}
}
