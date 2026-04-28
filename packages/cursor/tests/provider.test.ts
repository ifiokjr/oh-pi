import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { ValueSchema } from "@bufbuild/protobuf/wkt";
import type { Context, ToolCall, ToolResultMessage } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { buildCursorRequestPayload, decodeMcpArgsMap, parseCursorConversation } from "../messages.js";
import { AgentClientMessageSchema } from "../proto/agent_pb.js";
import { deriveBridgeKey, deriveConversationKey } from "../runtime.js";

describe("cursor provider request shaping", () => {
	it("parses turns and trailing tool results from pi context", () => {
		const toolCall: ToolCall = {
			type: "toolCall",
			id: "tool-1",
			name: "echo",
			arguments: { text: "ping" },
		};
		const toolResult: ToolResultMessage = {
			role: "toolResult",
			toolCallId: "tool-1",
			toolName: "echo",
			content: [{ type: "text", text: "pong" }],
			isError: false,
			timestamp: Date.now(),
		};
		const context: Context = {
			systemPrompt: "You are helpful.",
			messages: [
				{
					role: "user",
					content: "First question",
					timestamp: Date.now() - 100,
				},
				{
					role: "assistant",
					content: [{ type: "text", text: "First answer" }],
					api: "cursor-agent",
					provider: "cursor",
					model: "composer-2",
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							total: 0,
						},
					},
					stopReason: "stop",
					timestamp: Date.now() - 90,
				},
				{ role: "user", content: "Use a tool", timestamp: Date.now() - 80 },
				{
					role: "assistant",
					content: [toolCall],
					api: "cursor-agent",
					provider: "cursor",
					model: "composer-2",
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							total: 0,
						},
					},
					stopReason: "toolUse",
					timestamp: Date.now() - 70,
				},
				toolResult,
			],
		};

		const parsed = parseCursorConversation(context);
		expect(parsed.systemPrompt).toBe("You are helpful.");
		expect(parsed.turns).toHaveLength(2);
		expect(parsed.turns[0]).toEqual({
			userText: "First question",
			assistantText: "First answer",
		});
		expect(parsed.turns[1]?.assistantText).toContain("[tool call:echo]");
		expect(parsed.trailingToolResults).toEqual([
			{
				toolCallId: "tool-1",
				toolName: "echo",
				content: "pong",
				isError: false,
			},
		]);
	});

	it("builds a run request payload with MCP tool definitions", () => {
		const parsed = parseCursorConversation({
			systemPrompt: "You are helpful.",
			messages: [
				{
					role: "user",
					content: "Plan this task",
					timestamp: Date.now(),
				},
			],
			tools: [
				{
					name: "echo",
					description: "Echo text",
					parameters: {
						type: "object",
						properties: { text: { type: "string" } },
					} as never,
				},
			],
		});
		const payload = buildCursorRequestPayload({
			modelId: "composer-2",
			conversationId: "conv-123",
			parsed,
			tools: [
				{
					name: "echo",
					description: "Echo text",
					parameters: {
						type: "object",
						properties: { text: { type: "string" } },
					} as never,
				},
			],
		});
		const clientMessage = fromBinary(AgentClientMessageSchema, payload.requestBytes);

		expect(clientMessage.message.case).toBe("runRequest");
		if (clientMessage.message.case !== "runRequest") {
			throw new Error("Expected a runRequest client message");
		}
		expect(clientMessage.message.value.conversationId).toBe("conv-123");
		expect(clientMessage.message.value.modelDetails?.modelId).toBe("composer-2");
		expect(payload.mcpTools).toHaveLength(1);
		expect(payload.blobStore.size).toBeGreaterThan(0);
	});

	it("decodes protobuf-wrapped MCP arguments", () => {
		const args = decodeMcpArgsMap({
			text: toBinary(ValueSchema, create(ValueSchema, { kind: { case: "stringValue", value: "ping" } })),
			count: toBinary(ValueSchema, create(ValueSchema, { kind: { case: "numberValue", value: 2 } })),
		});
		expect(args).toEqual({ text: "ping", count: 2 });
	});

	it("derives stable session and bridge keys", () => {
		const conversationKey = deriveConversationKey("session-1", "seed text");
		expect(conversationKey).toBe("session:session-1");
		expect(deriveBridgeKey(conversationKey, "composer-2")).toBe("session:session-1:composer-2");
		expect(deriveConversationKey(undefined, "seed text")).toMatch(/^seed:/);
	});
});
