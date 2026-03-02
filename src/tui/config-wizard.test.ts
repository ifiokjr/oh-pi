import { describe, expect, it } from "vitest";
import type { ProviderSetupResult } from "./provider-setup.js";
import { summarizeProviders } from "./config-wizard.js";

const setup = (overrides: Partial<ProviderSetupResult>): ProviderSetupResult => ({
  providerStrategy: "replace",
  providers: [],
  ...overrides,
});

describe("summarizeProviders", () => {
  it("returns unset copy when setup is missing", () => {
    expect(summarizeProviders(null)).toBe("Providers: not configured");
  });

  it("returns keep strategy copy", () => {
    expect(summarizeProviders(setup({ providerStrategy: "keep" }))).toBe("keep existing");
  });

  it("returns add copy with provider list", () => {
    expect(summarizeProviders(setup({
      providerStrategy: "add",
      providers: [{ name: "openai", apiKey: "OPENAI_API_KEY", defaultModel: "gpt-4o" }],
    }))).toBe("Add fallback providers: openai");
  });

  it("returns add fallback copy without providers", () => {
    expect(summarizeProviders(setup({ providerStrategy: "add", providers: [] }))).toBe("keep existing and add fallback providers");
  });

  it("returns replace summary with provider list", () => {
    expect(summarizeProviders(setup({
      providerStrategy: "replace",
      providers: [{ name: "anthropic", apiKey: "ANTHROPIC_API_KEY", defaultModel: "claude-sonnet-4-20250514" }],
    }))).toBe("Replace providers with: anthropic");
  });
});
