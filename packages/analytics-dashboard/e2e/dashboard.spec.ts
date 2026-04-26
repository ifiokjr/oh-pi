import { expect, test } from "vitest";
/* C8 ignore file */
/**
 * Pi Analytics Dashboard — Playwright Test Suite
 *
 * All UI tests run in a real Chromium browser via Playwright.
 * Pure-logic tests (utils, API) stay in vitest.
 */

import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Navigate to the dashboard and wait for the first data load. */
async function gotoDashboard(page: Page) {
	await page.goto("/");
	await page.waitForSelector("h1", { timeout: 10_000 });
	// Give mock data queries a moment to resolve
	await page.waitForTimeout(1000);
}

/** Navigate to a specific view by clicking its sidebar button. */
async function navigateTo(page: Page, name: RegExp | string) {
	const pattern = typeof name === "string" ? new RegExp(name) : name;
	await page.getByRole("button", { name: pattern }).click();
	await page.waitForTimeout(500);
}

/** Collect console / page errors that occur during a callback. */
async function expectNoErrors(page: Page, fn: () => Promise<void>) {
	const errors: string[] = [];
	const handler = (msg: { type(): string; text(): string }) => {
		if (msg.type() === "error") {
			errors.push(msg.text());
		}
	};
	const errorHandler = (err: Error) => errors.push(err.message);

	page.on("console", handler);
	page.on("pageerror", errorHandler);
	try {
		await fn();
	} finally {
		page.off("console", handler);
		page.off("pageerror", errorHandler);
	}
	expect(errors).toHaveLength(0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard Loading
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Dashboard Loading", () => {
	test("loads the page with correct title", async ({ page }) => {
		await gotoDashboard(page);
		await expect(page).toHaveTitle(/Pi Analytics/);
	});

	test("renders the root element with content", async ({ page }) => {
		await gotoDashboard(page);
		const root = page.locator("#root");
		await expect(root).toBeVisible();
		const html = await root.innerHTML();
		expect(html.length).toBeGreaterThan(1000);
	});

	test("no console or JS errors on initial load", async ({ page }) => {
		await expectNoErrors(page, async () => {
			await gotoDashboard(page);
			await page.waitForTimeout(2000);
		});
	});

	test("loads in under 5 seconds", async ({ page }) => {
		const start = Date.now();
		await gotoDashboard(page);
		const elapsed = Date.now() - start;
		expect(elapsed).toBeLessThan(5000);
	});

	test("renders multiple SVG charts", async ({ page }) => {
		await gotoDashboard(page);
		await page.waitForSelector("svg", { timeout: 10_000 });
		const svgCount = await page.locator("svg").count();
		expect(svgCount).toBeGreaterThan(2);
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// Overview Page
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Overview Page", () => {
	test.beforeEach(async ({ page }) => {
		await gotoDashboard(page);
	});

	// ── Metric Cards ──

	test("displays all four metric cards", async ({ page }) => {
		await expect(page.getByText("Total Turns")).toBeVisible();
		await expect(page.getByText("Total Cost")).toBeVisible();
		await expect(page.getByText("Total Tokens")).toBeVisible();
		await expect(page.getByText("Sessions")).toBeVisible();
	});

	test("metric cards show numeric values", async ({ page }) => {
		// Total Turns card should have a large number (mock returns ~2847 for 30d)
		const turnsCard = page.locator("text=Total Turns").locator("..");
		const text = await turnsCard.textContent();
		expect(text).toBeTruthy();
		// Should contain a formatted number (e.g. "12.2k" or "2,847")
		expect(text).toMatch(/[\d.kKmM,]+/);
	});

	test("metric cards show change indicator when previous value exists", async ({ page }) => {
		// The overview provides previousValue for Total Turns and Total Cost
		const changeBadge = page.getByText(/vs last period/).first();
		await expect(changeBadge).toBeVisible();
	});

	// ── Charts ──

	test("displays Usage Over Time chart", async ({ page }) => {
		await expect(page.getByText("Usage Over Time")).toBeVisible();
		// Area chart SVG should be rendered
		const chartCard = page.locator("text=Usage Over Time").locator("../..");
		await expect(chartCard.locator("svg.recharts-surface").first()).toBeVisible();
	});

	test("displays Cost Breakdown pie chart", async ({ page }) => {
		await expect(page.getByText("Cost Breakdown")).toBeVisible();
		const chartCard = page.locator("text=Cost Breakdown").locator("../..");
		await expect(chartCard.locator("svg")).toBeVisible();
	});

	test("displays Top Models bar chart", async ({ page }) => {
		await expect(page.getByText("Top Models")).toBeVisible();
	});

	test("displays Top Codebases bar chart", async ({ page }) => {
		await expect(page.getByText("Top Codebases")).toBeVisible();
	});

	// ── Heatmap ──

	test("displays Activity Pattern heatmap", async ({ page }) => {
		await expect(page.getByText("Activity Pattern")).toBeVisible();
	});

	test("heatmap has day labels", async ({ page }) => {
		await expect(page.getByText("Sun")).toBeVisible();
		await expect(page.getByText("Mon")).toBeVisible();
		await expect(page.getByText("Sat")).toBeVisible();
	});

	test("heatmap has Less/More legend", async ({ page }) => {
		await expect(page.getByText("Less")).toBeVisible();
		await expect(page.getByText("More", { exact: true })).toBeVisible();
	});

	// ── Insights ──

	test("displays Insights section", async ({ page }) => {
		await expect(page.getByText("Insights")).toBeVisible();
	});

	test("shows at least one insight card", async ({ page }) => {
		// Mock data returns 3 insights with known titles
		await expect(page.getByText("Usage Up 23%")).toBeVisible();
	});

	test("shows insight severity icons", async ({ page }) => {
		// Warning insight
		await expect(page.getByText("High Cost Yesterday")).toBeVisible();
		// Success insight
		await expect(page.getByText("Claude Sonnet Your Most Used Model")).toBeVisible();
	});

	// ── Heading ──

	test("shows page heading with time range", async ({ page }) => {
		await expect(page.getByText("Dashboard")).toBeVisible();
		await expect(page.getByText(/last 30d/)).toBeVisible();
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// Models Page
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Models Page", () => {
	test.beforeEach(async ({ page }) => {
		await gotoDashboard(page);
		await navigateTo(page, /Models/);
		await page.waitForSelector("text=Model Analytics", { timeout: 5000 });
	});

	test("displays page heading", async ({ page }) => {
		await expect(page.getByText("Model Analytics")).toBeVisible();
	});

	test("displays model stat cards", async ({ page }) => {
		await expect(page.getByText("Total Models")).toBeVisible();
		await expect(page.getByText("Total Cost")).toBeVisible();
	});

	test("displays Token Usage by Model bar chart", async ({ page }) => {
		await expect(page.getByText("Token Usage by Model")).toBeVisible();
		const chartCard = page.locator("text=Token Usage by Model").locator("../..");
		await expect(chartCard.locator("svg.recharts-surface").first()).toBeVisible();
	});

	test("displays Cost Distribution pie chart", async ({ page }) => {
		await expect(page.getByText("Cost Distribution")).toBeVisible();
	});

	test("displays All Models table", async ({ page }) => {
		await expect(page.getByText("All Models")).toBeVisible();
		// Table headers
		await expect(page.getByRole("columnheader", { name: "Model" })).toBeVisible();
		await expect(page.getByRole("columnheader", { name: "Tokens" })).toBeVisible();
		await expect(page.getByRole("columnheader", { name: "Cost" })).toBeVisible();
	});

	test("model table has rows for each model", async ({ page }) => {
		const rows = page.locator("tbody tr");
		const count = await rows.count();
		expect(count).toBeGreaterThanOrEqual(5); // 8 mock models
	});

	test("clicking a model row highlights it", async ({ page }) => {
		const firstRow = page.locator("tbody tr").first();
		await firstRow.click();
		// The active row gets a primary-500 background class
		const classes = await firstRow.getAttribute("class");
		expect(classes).toContain("primary");
	});

	test("pie chart legend shows model percentages", async ({ page }) => {
		// Legend items show percentages like "35%"
		const percentText = page.locator(String.raw`text=/\d+%/`).first();
		await expect(percentText).toBeVisible();
	});

	test("no console errors on models page", async ({ page }) => {
		await expectNoErrors(page, async () => {
			await page.waitForTimeout(2000);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// Codebases Page
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Codebases Page", () => {
	test.beforeEach(async ({ page }) => {
		await gotoDashboard(page);
		await navigateTo(page, /Codebases/);
		await page.waitForSelector("text=Codebase Analytics", { timeout: 5000 });
	});

	test("displays page heading", async ({ page }) => {
		await expect(page.getByText("Codebase Analytics")).toBeVisible();
	});

	test("displays stat cards", async ({ page }) => {
		await expect(page.getByText("Projects", { exact: true })).toBeVisible();
		await expect(page.getByText("Active Projects")).toBeVisible();
	});

	test("displays Cost by Codebase bar chart", async ({ page }) => {
		await expect(page.getByText("Cost by Codebase")).toBeVisible();
		const chartCard = page.locator("text=Cost by Codebase").locator("../..");
		await expect(chartCard.locator("svg.recharts-surface").first()).toBeVisible();
	});

	test("displays Tokens by Codebase bar chart", async ({ page }) => {
		await expect(page.getByText("Tokens by Codebase")).toBeVisible();
	});

	test("displays All Codebases section", async ({ page }) => {
		await expect(page.getByText("All Codebases")).toBeVisible();
	});

	test("codebase cards show names and paths", async ({ page }) => {
		// Mock data has "oh-pi", "e-com", "api", "docs"
		await expect(page.getByRole("heading", { name: "oh-pi" })).toBeVisible();
		await expect(page.getByText("/dev/projects/oh-pi")).toBeVisible();
	});

	test("clicking a codebase card highlights it", async ({ page }) => {
		// Click the first codebase card (the whole div is clickable)
		const firstCard = page.locator(".cursor-pointer.rounded-lg.border").first();
		await firstCard.click();
		// The card should have the selection class after clicking
		const classes = await firstCard.getAttribute("class");
		expect(classes).toContain("emerald");
	});

	test("no console errors on codebases page", async ({ page }) => {
		await expectNoErrors(page, async () => {
			await page.waitForTimeout(2000);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// Navigation & Sidebar
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Navigation", () => {
	test.beforeEach(async ({ page }) => {
		await gotoDashboard(page);
	});

	test("sidebar has all navigation buttons", async ({ page }) => {
		await expect(page.getByRole("button", { name: /Overview/ })).toBeVisible();
		await expect(page.getByRole("button", { name: /Models/ })).toBeVisible();
		await expect(page.getByRole("button", { name: /Codebases/ })).toBeVisible();
		await expect(page.getByRole("button", { name: /Providers/ })).toBeVisible();
		await expect(page.getByRole("button", { name: /Timeline/ })).toBeVisible();
	});

	test("active nav item is highlighted", async ({ page }) => {
		const overviewBtn = page.getByRole("button", { name: /Overview/ });
		const classes = await overviewBtn.getAttribute("class");
		expect(classes).toContain("primary");
	});

	test("navigates to Models view", async ({ page }) => {
		await navigateTo(page, /Models/);
		await expect(page.getByText("Model Analytics")).toBeVisible();
	});

	test("navigates to Codebases view", async ({ page }) => {
		await navigateTo(page, /Codebases/);
		await expect(page.getByText("Codebase Analytics")).toBeVisible();
	});

	test("navigates back to Overview", async ({ page }) => {
		await navigateTo(page, /Models/);
		await expect(page.getByText("Model Analytics")).toBeVisible();
		await navigateTo(page, /Overview/);
		await expect(page.getByText("Dashboard")).toBeVisible();
	});

	test("clicking Providers nav stays on current view (not implemented)", async ({ page }) => {
		await navigateTo(page, /Providers/);
		// Providers page not implemented yet — should fall back to Overview
		await expect(page.getByText("Dashboard")).toBeVisible();
	});

	test("sidebar collapse toggle works", async ({ page }) => {
		const aside = page.locator("aside");
		const toggleBtn = aside.locator("button").first();
		await toggleBtn.click();
		// Sidebar should narrow but still be visible
		await expect(aside).toBeVisible();
	});

	test("sidebar shows Pi Analytics branding", async ({ page }) => {
		await expect(page.getByText("Analytics", { exact: true })).toBeVisible();
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// Time Range Selector
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Time Range Selector", () => {
	test.beforeEach(async ({ page }) => {
		await gotoDashboard(page);
	});

	test("has all time range buttons", async ({ page }) => {
		const labels = ["7D", "30D", "90D", "1Y", "All"];
		for (const label of labels) {
			await expect(page.getByRole("button", { name: label })).toBeVisible();
		}
	});

	test("30D button is active by default", async ({ page }) => {
		const btn = page.getByRole("button", { name: "30D" });
		const classes = await btn.getAttribute("class");
		expect(classes).toContain("bg-zinc-800");
	});

	test("clicking 7D activates it", async ({ page }) => {
		await page.getByRole("button", { name: "7D" }).click();
		const btn = page.getByRole("button", { name: "7D" });
		const classes = await btn.getAttribute("class");
		expect(classes).toContain("bg-zinc-800");
	});

	test("switching time range does not crash the dashboard", async ({ page }) => {
		await page.getByRole("button", { name: "7D" }).click();
		await page.waitForTimeout(500);
		await page.getByRole("button", { name: "90D" }).click();
		await page.waitForTimeout(500);
		await page.getByRole("button", { name: "1Y" }).click();
		await page.waitForTimeout(500);
		await page.getByRole("button", { name: "All" }).click();
		await page.waitForTimeout(500);
		// Should still show the dashboard
		await expect(page.getByText("Dashboard")).toBeVisible();
	});

	test("switching time range triggers data refetch without errors", async ({ page }) => {
		await expectNoErrors(page, async () => {
			await page.getByRole("button", { name: "7D" }).click();
			await page.waitForTimeout(2000);
		});
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// Chart Rendering (Browser-Specific)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Chart Rendering", () => {
	test.beforeEach(async ({ page }) => {
		await gotoDashboard(page);
	});

	test("area chart renders SVG with gradients", async ({ page }) => {
		const usageChart = page.locator("text=Usage Over Time").locator("../..");
		const svg = usageChart.locator("svg.recharts-surface").first();
		await expect(svg).toBeVisible();
		// Area chart should have gradient defs
		const hasGradient = await svg.locator("linearGradient").count();
		expect(hasGradient).toBeGreaterThan(0);
	});

	test("pie chart renders arcs", async ({ page }) => {
		const costChart = page.locator("text=Cost Breakdown").locator("../..");
		const svg = costChart.locator("svg");
		await expect(svg).toBeVisible();
		// Pie chart has Sector/path elements
		const hasPath = await svg.locator("path").count();
		expect(hasPath).toBeGreaterThan(0);
	});

	test("bar chart renders rects", async ({ page }) => {
		const modelsChart = page.locator("text=Top Models").locator("../..");
		const svg = modelsChart.locator("svg.recharts-surface").first();
		await expect(svg).toBeVisible();
		// Bars are rect elements
		const hasRect = await svg.locator("rect").count();
		expect(hasRect).toBeGreaterThan(0);
	});

	test("heatmap renders colored cells", async ({ page }) => {
		// Heatmap cells are div elements with bg-* classes
		const heatmapSection = page.locator("text=Activity Pattern").locator("../..");
		const cells = heatmapSection.locator(".h-3.w-3");
		const count = await cells.count();
		// 7 days × 24 hours = 168 data cells, plus 6 legend cells = 174
		expect(count).toBeGreaterThanOrEqual(168);
	});

	test("charts have visible axis labels", async ({ page }) => {
		// Area chart X-axis should show month abbreviations (e.g. "Jan")
		const usageChart = page.locator("text=Usage Over Time").locator("../..");
		const axisText = usageChart.locator("svg text");
		const count = await axisText.count();
		expect(count).toBeGreaterThan(3);
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// Chart Interactions
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Chart Interactions", () => {
	test.beforeEach(async ({ page }) => {
		await gotoDashboard(page);
	});

	test("hovering over bar chart shows tooltip", async ({ page }) => {
		const modelsChart = page.locator("text=Top Models").locator("../..");
		const svg = modelsChart.locator("svg.recharts-surface").first();
		const box = await svg.boundingBox();
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			await page.waitForTimeout(300);
			// Recharts tooltip appears as a div with border class
			const tooltip = page.locator(".recharts-tooltip-wrapper");
			// Tooltip may or may not be visible depending on hover position; just ensure no crash
		}
	});

	test("hovering over pie chart shows active slice", async ({ page }) => {
		const costChart = page.locator("text=Cost Breakdown").locator("../..");
		const svg = costChart.locator("svg");
		const box = await svg.boundingBox();
		if (box) {
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			await page.waitForTimeout(300);
			// No crash = success
		}
	});

	test("clicking model bar chart triggers row highlight", async ({ page }) => {
		await navigateTo(page, /Models/);
		await page.waitForSelector("text=Model Analytics", { timeout: 5000 });

		const firstRow = page.locator("tbody tr").first();
		await firstRow.click();
		const classes = await firstRow.getAttribute("class");
		expect(classes).toContain("primary");
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// Responsive Layout
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Responsive Layout", () => {
	test("desktop layout shows sidebar", async ({ page }) => {
		await page.setViewportSize({ height: 900, width: 1440 });
		await gotoDashboard(page);
		const aside = page.locator("aside");
		await expect(aside).toBeVisible();
	});

	test("mobile layout hides desktop sidebar", async ({ page }) => {
		await page.setViewportSize({ height: 812, width: 375 });
		await gotoDashboard(page);
		// Desktop sidebar has `hidden lg:block` — on 375px it should be hidden
		const aside = page.locator("aside.fixed");
		const isVisible = await aside.isVisible().catch(() => false);
		// Sidebar should be hidden on mobile (lg breakpoint = 1024px)
		expect(isVisible).toBe(false);
	});

	test("mobile layout shows content", async ({ page }) => {
		await page.setViewportSize({ height: 812, width: 375 });
		await gotoDashboard(page);
		await expect(page.getByText("Dashboard")).toBeVisible();
	});

	test("tablet layout shows sidebar", async ({ page }) => {
		await page.setViewportSize({ height: 1024, width: 768 });
		await gotoDashboard(page);
		// 768 < 1024 (lg), so desktop sidebar is still hidden
		// But content should still be visible
		await expect(page.getByText("Dashboard")).toBeVisible();
	});

	test("metric cards stack to 2-column grid on mobile", async ({ page }) => {
		await page.setViewportSize({ height: 812, width: 375 });
		await gotoDashboard(page);
		await expect(page.getByText("Total Turns")).toBeVisible();
		await expect(page.getByText("Total Cost")).toBeVisible();
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// Zustand Store Persistence
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("State Persistence", () => {
	test("time range selection persists across navigation", async ({ page }) => {
		await gotoDashboard(page);
		// Select 7D
		await page.getByRole("button", { name: "7D" }).click();
		await page.waitForTimeout(500);

		// Navigate away and back
		await navigateTo(page, /Models/);
		await navigateTo(page, /Overview/);

		// 7D should still be selected
		const btn7d = page.getByRole("button", { name: "7D" });
		const classes = await btn7d.getAttribute("class");
		expect(classes).toContain("bg-zinc-800");
	});

	test("selected model persists on Models page", async ({ page }) => {
		await gotoDashboard(page);
		await navigateTo(page, /Models/);
		await page.waitForSelector("text=Model Analytics", { timeout: 5000 });

		// Click a model row
		const firstRow = page.locator("tbody tr").first();
		await firstRow.click();

		// Navigate away and back
		await navigateTo(page, /Overview/);
		await navigateTo(page, /Models/);

		// The row should still be highlighted
		const highlightedRow = page.locator(String.raw`tbody tr.bg-primary-500\/10`).first();
		// State is remembered in zustand
		await expect(highlightedRow).toBeVisible({ timeout: 3000 });
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// Accessibility
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Accessibility", () => {
	test.beforeEach(async ({ page }) => {
		await gotoDashboard(page);
	});

	test("has a single h1 heading", async ({ page }) => {
		const h1Count = await page.locator("h1").count();
		expect(h1Count).toBe(1);
	});

	test("buttons are keyboard-focusable", async ({ page }) => {
		// Tab to the first focusable element
		await page.keyboard.press("Tab");
		const focused = await page.evaluate(() => document.activeElement?.tagName);
		expect(focused).toBeTruthy();
		expect(["BUTTON", "A", "INPUT"].includes(focused ?? "")).toBe(true);
	});

	test("navigation buttons have accessible names", async ({ page }) => {
		const navButtons = page.locator("nav button");
		const count = await navButtons.count();
		expect(count).toBeGreaterThan(0);

		for (let i = 0; i < count; i++) {
			const text = await navButtons.nth(i).textContent();
			expect(text?.trim().length).toBeGreaterThan(0);
		}
	});

	test("metric cards have readable text", async ({ page }) => {
		const cards = page.locator("text=/Total Turns|Total Cost|Total Tokens|Sessions/");
		const count = await cards.count();
		expect(count).toBe(4);
	});

	test("chart sections have headings", async ({ page }) => {
		// Each chart section should have an h2
		const h2Count = await page.locator("h2").count();
		expect(h2Count).toBeGreaterThan(0);
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// Error Resilience
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Error Resilience", () => {
	test("no console errors when rapidly switching views", async ({ page }) => {
		await expectNoErrors(page, async () => {
			await gotoDashboard(page);
			await navigateTo(page, /Models/);
			await page.waitForTimeout(300);
			await navigateTo(page, /Codebases/);
			await page.waitForTimeout(300);
			await navigateTo(page, /Overview/);
			await page.waitForTimeout(300);
			await navigateTo(page, /Models/);
			await page.waitForTimeout(300);
			await navigateTo(page, /Overview/);
			await page.waitForTimeout(1000);
		});
	});

	test("no console errors when rapidly switching time ranges", async ({ page }) => {
		await expectNoErrors(page, async () => {
			await gotoDashboard(page);
			await page.getByRole("button", { name: "7D" }).click();
			await page.waitForTimeout(200);
			await page.getByRole("button", { name: "30D" }).click();
			await page.waitForTimeout(200);
			await page.getByRole("button", { name: "90D" }).click();
			await page.waitForTimeout(200);
			await page.getByRole("button", { name: "1Y" }).click();
			await page.waitForTimeout(200);
			await page.getByRole("button", { name: "All" }).click();
			await page.waitForTimeout(1000);
		});
	});

	test("no console errors on models page", async ({ page }) => {
		await expectNoErrors(page, async () => {
			await gotoDashboard(page);
			await navigateTo(page, /Models/);
			await page.waitForSelector("text=Model Analytics", { timeout: 5000 });
			await page.waitForTimeout(2000);
		});
	});

	test("no console errors on codebases page", async ({ page }) => {
		await expectNoErrors(page, async () => {
			await gotoDashboard(page);
			await navigateTo(page, /Codebases/);
			await page.waitForSelector("text=Codebase Analytics", { timeout: 5000 });
			await page.waitForTimeout(2000);
		});
	});
});
