import { gptChatByDefaultModelId, gptChatByModels, NATIVE_TOOL_DEFAULTS, GPT_CHAT_BY_DEFAULT_TEMPERATURE } from "@roo-code/types"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import type { ApiHandlerOptions } from "../../shared/api"

import type { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { getModelParams } from "../transform/model-params"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { normalizeMistralToolCallId } from "../transform/mistral-format"
import { XmlMatcher } from "../../utils/xml-matcher"
import { handleOpenAIError } from "./utils/openai-error-handler"

import { OpenAiHandler } from "./openai"
import type { ApiHandlerCreateMessageMetadata } from "../index"

export class GptChatByHandler extends OpenAiHandler {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			openAiApiKey: options.gptChatByApiKey ?? "not-provided",
			openAiModelId: options.apiModelId ?? gptChatByDefaultModelId,
			openAiBaseUrl: "https://gpt-chat.by/api",
			openAiStreamingEnabled: true,
		})
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const { info: modelInfo, reasoning } = this.getModel()
		const modelId = this.options.apiModelId ?? gptChatByDefaultModelId

		// gpt-chat.by (specifically mimo-free) requires tool_call_id to be set for role: tool messages.
		// It also doesn't support tool_choice.
		// If we are using native tools, we need to ensure IDs are handled correctly.
		// NOTE: Many OpenAI-compatible providers (like those behind gpt-chat.by) have strict
		// ID requirements and expect 9-char alphanumeric IDs (similar to Mistral).
		const openAiMessages = convertToOpenAiMessages(messages, {
			modelInfo,
			mergeToolResultText: true,
			normalizeToolCallId: normalizeMistralToolCallId,
		})

		// Ensure every tool message has a tool_call_id
		const messagesToSend: OpenAI.Chat.ChatCompletionMessageParam[] = []

		messagesToSend.push({
			role: "system",
			content: systemPrompt,
		})

		for (const msg of openAiMessages) {
			if (msg.role === "tool" && !("tool_call_id" in msg)) {
				// Generate a dummy 9-char alphanumeric ID if missing
				const id = normalizeMistralToolCallId(`call_${Date.now()}`) // Will trim/normalize to 9 chars
				;(msg as any).tool_call_id = id
			}
			messagesToSend.push(msg)
		}

		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model: modelId,
			temperature: this.options.modelTemperature ?? GPT_CHAT_BY_DEFAULT_TEMPERATURE,
			messages: messagesToSend,
			stream: true as const,
			stream_options: { include_usage: true },
			...(reasoning && reasoning),
			...(metadata?.tools && { tools: this.convertToolsForOpenAI(metadata.tools) }),
			// tool_choice is explicitly omitted
			parallel_tool_calls: false,
		}

		this.addMaxTokensIfNeeded(requestOptions, modelInfo)

		let stream
		try {
			stream = await this.client.chat.completions.create(requestOptions)
		} catch (error) {
			throw handleOpenAIError(error, "GptChatBy")
		}

		const matcher = new XmlMatcher(
			"think",
			(chunk) =>
				({
					type: chunk.matched ? "reasoning" : "text",
					text: chunk.data,
				}) as const,
		)

		for await (const chunk of stream) {
			const delta = chunk.choices?.[0]?.delta ?? {}

			if (delta.content) {
				for (const chunk of matcher.update(delta.content)) {
					yield chunk as any
				}
			}

			if (delta.tool_calls) {
				for (const toolCall of delta.tool_calls) {
					yield {
						type: "tool_call_partial",
						index: toolCall.index,
						id: toolCall.id,
						name: toolCall.function?.name,
						arguments: toolCall.function?.arguments,
					} as any
				}
			}

			if (chunk.usage) {
				yield this.processUsageMetrics(chunk.usage)
			}
		}

		for (const chunk of matcher.final()) {
			yield chunk as any
		}
	}

	override getModel() {
		const id = this.options.apiModelId ?? gptChatByDefaultModelId
		const info = {
			...NATIVE_TOOL_DEFAULTS,
			...(gptChatByModels[id as keyof typeof gptChatByModels] || gptChatByModels[gptChatByDefaultModelId]),
			supportsNativeTools: true,
			toolCallIdFormat: "alphanumeric-9" as const,
		}
		const params = getModelParams({ format: "openai", modelId: id, model: info, settings: this.options })
		return { id, info, ...params }
	}

	// Override to handle DeepSeek's usage metrics, including caching.
	protected override processUsageMetrics(usage: any): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
		}
	}
}