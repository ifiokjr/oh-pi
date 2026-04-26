import type {
	AntCaste,
	PromoteFinalizeGateDecision,
	PromoteFinalizeGateInput,
} from "../extensions/ant-colony/types.js";
import { DEFAULT_ANT_CONFIGS } from "../extensions/ant-colony/types.js";

describe("promote/finalize gate types", () => {
	it("supports machine-readable input/output contracts", () => {
		const input: PromoteFinalizeGateInput = {
			cheapPassSummary: "summary",
			confidenceScore: 0.8,
			coverageScore: 0.9,
			policyViolations: [],
			riskFlags: [],
			sloBreached: false,
		};
		const decision: PromoteFinalizeGateDecision = {
			action: "promote",
			cheapPassSummary: input.cheapPassSummary,
			escalationReasons: [],
		};
		expect(decision.action).toBe("promote");
	});
});

describe(DEFAULT_ANT_CONFIGS, () => {
	const castes: AntCaste[] = ["scout", "worker", "soldier", "drone"];

	it("has all castes", () => {
		for (const c of castes) {
			expect(DEFAULT_ANT_CONFIGS).toHaveProperty(c);
		}
	});

	it("each config has caste/model/tools/maxTurns", () => {
		for (const c of castes) {
			const cfg = DEFAULT_ANT_CONFIGS[c];
			expect(cfg.caste).toBe(c);
			expectTypeOf(cfg.model).toBeString();
			expect(Array.isArray(cfg.tools)).toBeTruthy();
			expect(cfg.maxTurns).toBeGreaterThan(0);
		}
	});

	it("scout has no write tools", () => {
		expect(DEFAULT_ANT_CONFIGS.scout.tools).not.toContain("edit");
		expect(DEFAULT_ANT_CONFIGS.scout.tools).not.toContain("write");
	});

	it("worker has edit and write", () => {
		expect(DEFAULT_ANT_CONFIGS.worker.tools).toContain("edit");
		expect(DEFAULT_ANT_CONFIGS.worker.tools).toContain("write");
	});

	it("drone only has bash with 1 turn", () => {
		expect(DEFAULT_ANT_CONFIGS.drone.tools).toStrictEqual(["bash"]);
		expect(DEFAULT_ANT_CONFIGS.drone.maxTurns).toBe(1);
	});
});
