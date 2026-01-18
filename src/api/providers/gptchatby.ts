import { gptChatByDefaultModelId, gptChatByModels, NATIVE_TOOL_DEFAULTS } from "@roo-code/types"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import type { ApiHandlerOptions } from "../../shared/api"

import type { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { getModelParams } from "../transform/model-params"
import { convertToOpenAiMessages } from "../transform/openai-format"
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
		// gpt-chat.by (specifically mimo-free) requires tool_call_id to be set for role: tool messages.
		// It also doesn't support tool_choice.
		// If we are using native tools, we need to ensure IDs are handled correctly.
		const openAiMessages = convertToOpenAiMessages(messages, {
			// Ensure IDs are alphanumeric and 9 chars long, similar to Mistral,
			// which often helps with providers that have strict ID requirements.
			normalizeToolCallId: (id) => {
				const sanitized = id.replace(/[^a-zA-Z0-9]/g, "")
				if (sanitized.length === 0) {
					return "call" + Math.random().toString(36).substring(2, 7)
				}
				return sanitized.substring(0, 9).padEnd(9, "0")
			},
		})

		const systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam = {
			role: "system",
			content: systemPrompt,
		}

		const modelId = this.options.apiModelId ?? gptChatByDefaultModelId
		const { info: modelInfo, reasoning } = this.getModel()

		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model: modelId,
			temperature: this.options.modelTemperature ?? 0,
			messages: [systemMessage, ...openAiMessages],
			stream: true as const,
			stream_options: { include_usage: true },
			...(reasoning && reasoning),
			...(metadata?.tools && { tools: this.convertToolsForOpenAI(metadata.tools) }),
			// tool_choice is explicitly omitted
			parallel_tool_calls: false, // Disable parallel tool calls for better compatibility
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
