import {
	buildModelSelectionOptions,
	isOpenAICompatibleApi,
	isUnsafeUrl,
	normalizeDiscoveryBaseUrl,
	resolveOpenAIApiMode,
} from "./provider-setup.js";

describe(isUnsafeUrl, () => {
	it("https remote is safe", () => {
		expect(isUnsafeUrl("https://api.example.com")).toBeFalsy();
	});

	it("http localhost is safe", () => {
		expect(isUnsafeUrl("http://localhost:11434")).toBeFalsy();
	});

	it("http 127.0.0.1 is safe", () => {
		expect(isUnsafeUrl("http://127.0.0.1:8080")).toBeFalsy();
	});

	it("http [::1] is blocked (contains colon in hostname)", () => {
		expect(isUnsafeUrl("http://[::1]:8080")).toBeTruthy();
	});

	it("10.x private is unsafe", () => {
		expect(isUnsafeUrl("https://10.0.0.1/api")).toBeTruthy();
	});

	it("172.16.x private is unsafe", () => {
		expect(isUnsafeUrl("https://172.16.0.1/api")).toBeTruthy();
	});

	it("192.168.x private is unsafe", () => {
		expect(isUnsafeUrl("https://192.168.1.1/api")).toBeTruthy();
	});

	it("http remote is unsafe", () => {
		expect(isUnsafeUrl("http://api.example.com")).toBeTruthy();
	});

	it("0.0.0.0 is unsafe", () => {
		expect(isUnsafeUrl("https://0.0.0.0")).toBeTruthy();
	});

	it("169.254.x link-local is unsafe", () => {
		expect(isUnsafeUrl("https://169.254.1.1")).toBeTruthy();
	});

	it("invalid url is unsafe", () => {
		expect(isUnsafeUrl("not-a-url")).toBeTruthy();
	});

	it("empty string is unsafe", () => {
		expect(isUnsafeUrl("")).toBeTruthy();
	});
});

describe(resolveOpenAIApiMode, () => {
	it("keeps explicit responses mode", () => {
		expect(resolveOpenAIApiMode("openai-responses", "gpt-4o")).toBe("openai-responses");
	});

	it("keeps explicit completions mode", () => {
		expect(resolveOpenAIApiMode("openai-completions", "o3-mini")).toBe("openai-completions");
	});

	it("auto resolves o-series to responses", () => {
		expect(resolveOpenAIApiMode("auto", "o3-mini")).toBe("openai-responses");
	});

	it("auto resolves gpt-4o to completions", () => {
		expect(resolveOpenAIApiMode("auto", "gpt-4o")).toBe("openai-completions");
	});
});

describe(normalizeDiscoveryBaseUrl, () => {
	it("keeps regular host URL", () => {
		expect(normalizeDiscoveryBaseUrl("https://api.openai.com")).toBe("https://api.openai.com");
	});

	it("strips trailing slash", () => {
		expect(normalizeDiscoveryBaseUrl("https://api.openai.com/")).toBe("https://api.openai.com");
	});

	it("strips trailing /v1 to avoid /v1/v1 probe", () => {
		expect(normalizeDiscoveryBaseUrl("https://proxy.example.com/v1")).toBe("https://proxy.example.com");
	});

	it("strips trailing /v1/ to avoid /v1/v1 probe", () => {
		expect(normalizeDiscoveryBaseUrl("http://localhost:11434/v1/")).toBe("http://localhost:11434");
	});
});

describe(buildModelSelectionOptions, () => {
	it("keeps the full discovered model list instead of truncating at 50 entries", () => {
		const modelIds = Array.from({ length: 75 }, (_, index) => `model-${index + 1}`);

		const options = buildModelSelectionOptions(modelIds);

		expect(options).toHaveLength(75);
		expect(options[0]).toStrictEqual({ label: "model-1", value: "model-1" });
		expect(options[74]).toStrictEqual({ label: "model-75", value: "model-75" });
	});
});

describe(isOpenAICompatibleApi, () => {
	it("treats undefined as openai-compatible", () => {
		expect(isOpenAICompatibleApi()).toBeTruthy();
	});

	it("treats openai-completions as openai-compatible", () => {
		expect(isOpenAICompatibleApi("openai-completions")).toBeTruthy();
	});

	it("treats openai-responses as openai-compatible", () => {
		expect(isOpenAICompatibleApi("openai-responses")).toBeTruthy();
	});

	it("treats anthropic api as non-openai-compatible", () => {
		expect(isOpenAICompatibleApi("anthropic-messages")).toBeFalsy();
	});
});
