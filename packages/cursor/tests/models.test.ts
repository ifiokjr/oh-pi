import { create, toBinary } from "@bufbuild/protobuf";

import {
	decodeGetUsableModelsResponse,
	discoverCursorModels,
	getCredentialModels,
	getFallbackCursorModels,
	normalizeCursorModels,
	toCursorProviderModel,
} from "../models.js";
import { GetUsableModelsResponseSchema, ModelDetailsSchema } from "../proto/agent_pb.js";
import { frameConnectMessage } from "../transport.js";
import { createTestCursorBackend } from "./test-backend.js";

describe("cursor models", () => {
	it("returns a curated fallback catalog", () => {
		const models = getFallbackCursorModels();
		expect(models.some((model) => model.id === "composer-2")).toBeTruthy();
		expect(models.every((model) => model.input.includes("text"))).toBeTruthy();
	});

	it("normalizes discovered model metadata and de-duplicates by id", () => {
		const models = normalizeCursorModels([
			{ displayName: "Composer 2", modelId: "composer-2", thinkingDetails: {} },
			{ displayName: "Composer 2 duplicate", modelId: "composer-2" },
			{ displayNameShort: "GPT-5.2 Codex", modelId: "gpt-5.2-codex" },
		]);

		expect(models.map((model) => model.id)).toStrictEqual(["composer-2", "gpt-5.2-codex"]);
		expect(models[0]?.reasoning).toBeTruthy();
		expect(models[1]?.contextWindow).toBe(400_000);
	});

	it("decodes both raw and Connect-framed discovery responses", () => {
		const payload = toBinary(
			GetUsableModelsResponseSchema,
			create(GetUsableModelsResponseSchema, {
				models: [create(ModelDetailsSchema, { displayName: "Composer 2", modelId: "composer-2" })],
			}),
		);

		expect(decodeGetUsableModelsResponse(payload)?.models?.length).toBe(1);
		expect(decodeGetUsableModelsResponse(frameConnectMessage(payload))?.models?.length).toBe(1);
	});

	it("uses discovered models from the backend", async () => {
		const backend = await createTestCursorBackend();
		backend.setDiscoveredModels([{ id: "composer-2", name: "Composer 2", reasoning: true }]);
		const models = await discoverCursorModels("test-access", backend.apiUrl);
		expect(models?.[0]?.id).toBe("composer-2");
		expect(backend.getDiscoveryAuthHeaders()).toStrictEqual(["Bearer test-access"]);
		await backend.close();
	});

	it("prefers models stored with the OAuth credential", () => {
		const models = getCredentialModels({
			access: "a",
			expires: Date.now() + 1000,
			models: [toCursorProviderModel({ id: "gpt-5.2", name: "GPT-5.2", reasoning: true })],
			refresh: "r",
		});
		expect(models).toHaveLength(1);
		expect(models[0]?.id).toBe("gpt-5.2");
	});
});
