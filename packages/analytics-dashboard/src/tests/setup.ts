/**
 * Vitest Test Setup
 *
 * Runs in jsdom environment for all unit and component tests.
 */

import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/vitest";

// Extend Vitest's expect with Testing Library matchers
expect.extend(matchers);

// Polyfill ResizeObserver for jsdom (required by recharts)
beforeAll(() => {
	if (typeof ResizeObserver === "undefined") {
		class ResizeObserverMock {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
		globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
	}

	// Polyfill URL.createObjectURL for jsdom (used by exportData)
	if (URL.createObjectURL === undefined) {
		let counter = 0;
		URL.createObjectURL = (_blob: Blob) => `blob:mock-${counter++}`;
	}
	if (URL.revokeObjectURL === undefined) {
		URL.revokeObjectURL = () => {};
	}
});

// Cleanup after each test
afterEach(() => {
	cleanup();
});
