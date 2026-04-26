/**
 * Adaptive concurrency control — modeled after ant colony dynamic recruitment.
 *
 * Real ant colonies: more food → more recruitment pheromones → more foragers leave the nest.
 * Mapping: more tasks + idle system → increase concurrency; overloaded/few tasks → decrease.
 *
 * Explores boundaries: gradually increases concurrency at startup, monitoring throughput inflection points.
 */

import * as os from "node:os";
import type { ConcurrencyConfig, ConcurrencySample } from "./types.js";

const CPU_CORES = os.cpus().length;

export function defaultConcurrency(): ConcurrencyConfig {
	return {
		current: 2,
		history: [],
		max: Math.min(CPU_CORES, 8),
		min: 1,
		optimal: 3,
	};
}

/** Sample current system load (CPU, memory, throughput). */
export function sampleSystem(activeTasks: number, completedRecently: number, windowMinutes: number): ConcurrencySample {
	const cpus = os.cpus();
	const cpuLoad =
		cpus.reduce((sum, c) => {
			const total = Object.values(c.times).reduce((a, b) => a + b, 0);
			return sum + 1 - c.times.idle / total;
		}, 0) / cpus.length;

	const mem = os.freemem();
	const throughput = windowMinutes > 0 ? completedRecently / windowMinutes : 0;

	return {
		concurrency: activeTasks,
		cpuLoad,
		memFree: mem,
		throughput,
		timestamp: Date.now(),
	};
}

/**
 * Adaptive adjustment algorithm.
 *
 * Phase 1 — Exploration (samples < 10): increment by 1 each wave, finding throughput inflection.
 * Phase 2 — Steady state: fine-tune around the optimal value.
 *
 * Constraints:
 * - CPU load > 85% → reduce
 * - Free memory < 500MB → reduce
 * - Throughput declining → revert to previous optimal
 * - No pending tasks → drop to min
 */
export function adapt(config: ConcurrencyConfig, pendingTasks: number): ConcurrencyConfig {
	const next = { ...config };
	const samples = config.history;

	// No pending tasks — drop to minimum
	if (pendingTasks === 0) {
		next.current = config.min;
		return next;
	}

	// Cap at pending task count
	const taskCap = Math.min(pendingTasks, config.max);

	if (samples.length < 2) {
		// Cold start: use half of max for fast ramp-up
		next.current = Math.min(Math.ceil(config.max / 2), taskCap);
		return next;
	}

	const latest = samples.at(-1);
	const prev = samples.at(-2);

	// CPU sliding window: average of last 3 samples
	const recentCpuSamples = samples.slice(-3);
	const avgCpu = recentCpuSamples.reduce((s, x) => s + x.cpuLoad, 0) / recentCpuSamples.length;

	// 429 cooldown: no concurrency increases within 30s of rate limit
	const inRateLimitCooldown = config.lastRateLimitAt != null && Date.now() - config.lastRateLimitAt < 30_000;

	// Hard constraint: reduce immediately on overload (hysteresis: >85% reduce, 60-85% hold)
	if (avgCpu > 0.85 || latest.memFree < 500 * 1024 * 1024) {
		next.current = Math.max(config.min, config.current - 1);
		return next;
	}

	// Hysteresis band: CPU between 60-85% holds steady
	const canIncrease = avgCpu < 0.6 && !inRateLimitCooldown;

	// Exploration phase: insufficient samples, ramp up gradually
	if (samples.length < 10) {
		if (latest.throughput >= prev.throughput && canIncrease) {
			next.current = Math.min(config.current + 1, taskCap);
		} else if (latest.throughput < prev.throughput) {
			// Throughput declining — inflection point found
			next.optimal = prev.concurrency;
			next.current = prev.concurrency;
		}
		return next;
	}

	// Steady state: fine-tune around optimal
	const recentThroughput = samples.slice(-5).reduce((s, x) => s + x.throughput, 0) / 5;
	const olderThroughput = samples.slice(-10, -5).reduce((s, x) => s + x.throughput, 0) / 5;

	if (recentThroughput > olderThroughput * 1.1 && canIncrease) {
		next.current = Math.min(config.current + 1, taskCap);
		if (recentThroughput > olderThroughput * 1.2) {
			next.optimal = next.current;
		}
	} else if (recentThroughput < olderThroughput * 0.8) {
		next.current = Math.max(config.min, config.optimal);
	}

	// 429 recovery: restore to optimal when CPU is underutilized (e.g. after backoff)
	if (avgCpu < 0.5 && next.current < config.optimal && !inRateLimitCooldown) {
		next.current = config.optimal;
	}

	return next;
}
