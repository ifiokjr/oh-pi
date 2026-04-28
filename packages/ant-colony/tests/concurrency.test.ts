import { describe, expect, it } from "vitest";
import { adapt, defaultConcurrency } from "../extensions/ant-colony/concurrency.js";
import type { ConcurrencyConfig, ConcurrencySample } from "../extensions/ant-colony/types.js";

const mkSample = (o: Partial<ConcurrencySample> = {}): ConcurrencySample => ({
	timestamp: Date.now(),
	concurrency: 2,
	cpuLoad: 0.3,
	memFree: 4e9,
	throughput: 1,
	...o,
});

describe("defaultConcurrency", () => {
	it("returns valid config", () => {
		const c = defaultConcurrency();
		expect(c.current).toBe(2);
		expect(c.min).toBe(1);
		expect(c.max).toBeGreaterThanOrEqual(1);
		expect(c.max).toBeLessThanOrEqual(8);
		expect(c.history).toEqual([]);
	});
});

describe("adapt", () => {
	it("drops to min when no pending tasks", () => {
		const cfg: ConcurrencyConfig = {
			current: 4,
			min: 1,
			max: 8,
			optimal: 3,
			history: [mkSample(), mkSample()],
		};
		expect(adapt(cfg, 0).current).toBe(1);
	});

	it("cold start gives half max", () => {
		const cfg: ConcurrencyConfig = {
			current: 2,
			min: 1,
			max: 8,
			optimal: 3,
			history: [mkSample()],
		};
		expect(adapt(cfg, 10).current).toBe(4);
	});

	it("reduces when CPU > 85%", () => {
		const s = mkSample({ cpuLoad: 0.9 });
		const cfg: ConcurrencyConfig = {
			current: 4,
			min: 1,
			max: 8,
			optimal: 3,
			history: [s, s, s],
		};
		expect(adapt(cfg, 10).current).toBeLessThan(4);
	});

	it("reduces when memory low", () => {
		const s = mkSample({ memFree: 100 * 1024 * 1024 });
		const cfg: ConcurrencyConfig = {
			current: 4,
			min: 1,
			max: 8,
			optimal: 3,
			history: [s, s],
		};
		expect(adapt(cfg, 10).current).toBeLessThan(4);
	});

	it("increases during exploration when throughput rising", () => {
		const s1 = mkSample({ throughput: 1 });
		const s2 = mkSample({ throughput: 2 });
		const cfg: ConcurrencyConfig = {
			current: 3,
			min: 1,
			max: 8,
			optimal: 3,
			history: [s1, s2],
		};
		expect(adapt(cfg, 10).current).toBeGreaterThanOrEqual(3);
	});

	it("does not exceed max", () => {
		const s1 = mkSample({ throughput: 1 });
		const s2 = mkSample({ throughput: 5 });
		const cfg: ConcurrencyConfig = {
			current: 8,
			min: 1,
			max: 8,
			optimal: 3,
			history: [s1, s2],
		};
		expect(adapt(cfg, 100).current).toBeLessThanOrEqual(8);
	});

	it("does not exceed pending task count", () => {
		const s1 = mkSample({ throughput: 1 });
		const s2 = mkSample({ throughput: 5 });
		const cfg: ConcurrencyConfig = {
			current: 3,
			min: 1,
			max: 8,
			optimal: 3,
			history: [s1, s2],
		};
		expect(adapt(cfg, 2).current).toBeLessThanOrEqual(2);
	});

	it("respects rate limit cooldown", () => {
		const s1 = mkSample({ throughput: 1 });
		const s2 = mkSample({ throughput: 2 });
		const cfg: ConcurrencyConfig = {
			current: 3,
			min: 1,
			max: 8,
			optimal: 3,
			history: [s1, s2],
			lastRateLimitAt: Date.now(),
		};
		expect(adapt(cfg, 10).current).toBeLessThanOrEqual(3);
	});
});
