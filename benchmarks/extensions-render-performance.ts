#!/usr/bin/env node
import { performance } from "node:perf_hooks";

function makeAssistantMessage(input, output, cost) {
	return {
		type: "message",
		message: {
			role: "assistant",
			usage: {
				input,
				output,
				cost: { total: cost },
			},
		},
	};
}

function buildBranch(size) {
	const branch = [];
	for (let i = 0; i < size; i++) {
		branch.push(makeAssistantMessage(1200 + (i % 10), 800 + (i % 7), 0.01));
	}
	return branch;
}

function scanBranch(branch) {
	let input = 0;
	let output = 0;
	let cost = 0;
	for (const entry of branch) {
		if (entry.type === "message" && entry.message.role === "assistant") {
			input += entry.message.usage.input;
			output += entry.message.usage.output;
			cost += entry.message.usage.cost.total;
		}
	}
	return { input, output, cost };
}

function renderFromCached(cached) {
	return `${cached.input}/${cached.output} $${cached.cost.toFixed(2)}`;
}

function time(label, fn, iterations) {
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		fn();
	}
	const durationMs = performance.now() - start;
	return {
		label,
		iterations,
		totalMs: durationMs,
		avgMs: durationMs / iterations,
	};
}

const sizes = [100, 1_000, 10_000, 50_000];
const renders = 250;

console.log(`Comparing full-branch footer scans vs cached footer reads (${renders} renders each)\n`);
console.log("messages\tfull-scan total\tfull-scan avg\tcached total\tcached avg\tspeedup");

for (const size of sizes) {
	const branch = buildBranch(size);
	const cached = scanBranch(branch);

	const fullScan = time(
		"full-scan",
		() => {
			scanBranch(branch);
		},
		renders,
	);
	const cachedRead = time(
		"cached",
		() => {
			renderFromCached(cached);
		},
		renders,
	);
	const speedup = cachedRead.totalMs > 0 ? fullScan.totalMs / cachedRead.totalMs : Number.POSITIVE_INFINITY;

	console.log(
		[
			size,
			`${fullScan.totalMs.toFixed(2)}ms`,
			`${fullScan.avgMs.toFixed(4)}ms`,
			`${cachedRead.totalMs.toFixed(2)}ms`,
			`${cachedRead.avgMs.toFixed(4)}ms`,
			`${speedup.toFixed(1)}x`,
		].join("\t"),
	);
}

console.log(
	"\nTip: this benchmark isolates the session-length scaling problem that can make footer redraws interfere with typing responsiveness.",
);
